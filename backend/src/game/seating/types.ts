// ══════════════════════════════════════════════════════
// 🪑 أنواع نظام الجلوس الذكي — Seating Engine Types
// ══════════════════════════════════════════════════════

// ── بيانات اللاعب للجلوس ──────────────────────────
export interface PlayerSeatData {
  playerId: number | null;
  phone: string;
  name: string;
  gender: string;
  totalMatches: number;       // عدد المباريات الإجمالي
  activityCount: number;      // عدد الفعاليات المختلفة (لتحديد "جديد")
  rankRR: number;
  rankTier: string;
  hasPenalty?: boolean;        // هل عليه عقوبة في هذه اللعبة
  physicalId?: number;         // المقعد الحالي (إن وُجد)
  originSeat?: number;         // المقعد قبل إعادة الترتيب (يملؤه المحرّك الدُفعيّ)
  seatHeld?: boolean;
  genderConstraint?: string;
}

// ── نتيجة تقييم القيد ──────────────────────────────
export interface ConstraintResult {
  satisfied: boolean;          // هل القيد متحقق
  score: number;               // 0.0 (أسوأ) → 1.0 (أفضل)
  violation?: string;          // وصف المخالفة
}

// ── مقعد مثبت ──────────────────────────────────────
export interface PinnedSeat {
  seatNumber: number;
  playerId?: number;
  phone?: string;
  playerName: string;
}

// ── سياق التقييم ──────────────────────────────────
export interface EvaluationContext {
  maxPlayers: number;
  sessionId?: number;
  // تاريخ جيران اللاعبين المعاقبين: "playerA_id-playerB_id" → عدد المرات
  penaltyNeighborHistory: Map<string, number>;
  constraintParams: Record<string, any>;
  // ── المقاعد المثبتة (من القالب) ──
  pinnedSeats?: PinnedSeat[];
  // ── عدد المقاعد المؤخرة (لا تُملأ إلا عند الحاجة) ──
  reservedTailSeats?: number;
  // ── أرقام المقاعد المجاورة للأبواب (من القالب) — لتجنّبها في التوزيع ──
  doorSeats?: number[];

  // ══ قرارات المالك المقفلة 2026-09-04 ══

  /**
   * 🤝 أوزان التقارب الاجتماعيّ: seatKey(a)|seatKey(b) → وزن (0..1].
   * يبنيها lobby.socket من إشارات موجودة (الوصول المتزامن أثقلها = 1.0).
   * يقرؤها SOCIAL_AFFINITY_SEPARATION وحده.
   */
  affinityPairs?: Map<string, number>;

  /**
   * 🎲 كسر التعادل بالتباعد (S1 — القرار المقفل ٣ يجعله متمّماً لقيد الصداقة):
   * عند تساوي نقاط مقعدين يُفضَّل الأبعد دائريّاً عن هذه المقاعد.
   * للانضمام العاديّ = مقاعد آخر الواصلين؛ وللمتفرّج = مقاعد الأحياء.
   * كان الترتيب سابقاً «الأصغر رقماً» فيجلس الواصلون معاً في 1,2,3 حتماً.
   */
  spreadFromSeats?: number[];

  /**
   * 👁️ المتفرّج المتأخّر يجلس **داخل الحلقة** (القرار المقفل ١) لكن في الذيل
   * والأبعد عن الأحياء كي لا يلتصق بمن يتهامسون بالأدوار: يقلب خصمَ مقاعد
   * الذيل (−2.0) إلى مكافأة (+2.0).
   */
  preferTailSeats?: boolean;
}

// ── واجهة القيد (Strategy Pattern) ─────────────────
export interface SeatingConstraint {
  /** معرّف فريد للقيد */
  type: string;
  /** اسم عربي للعرض */
  nameAr: string;
  /** الأولوية: 1 = أعلى (لا يُخفَّف)، 10 = أدنى */
  priority: number;
  /** مفعّل أم لا */
  enabled: boolean;

  /**
   * تقييم ما إذا كان وضع لاعب في مقعد معين يحقق هذا القيد
   * @param occupiedSeats - المقاعد المشغولة حالياً {seatNumber → PlayerSeatData}
   * @param candidateSeat - رقم المقعد المرشح
   * @param player - بيانات اللاعب الجديد
   * @param context - بيانات إضافية
   */
  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult;

  /** وصف القيد للعرض */
  getDescription(): string;
}

// ── إعدادات القيد (للتخزين في DB) ─────────────────
export interface ConstraintConfig {
  type: string;
  enabled: boolean;
  priority: number;
  params: Record<string, any>;
}

// ── إعدادات الجلوس الكاملة ────────────────────────
export interface SeatingConfig {
  // ── الوضع القديم (backward-compatible) ──
  genderSeparation?: boolean;
  noAdjacentPairs?: Array<{
    player1Phone: string;
    player1Name: string;
    player2Phone: string;
    player2Name: string;
  }>;

  // ── المحرك الجديد ──
  engineEnabled?: boolean;
  strictness?: 'strict' | 'relaxed';
  constraints?: ConstraintConfig[];
}

// ── نتيجة تخصيص المقعد ───────────────────────────
export interface SeatAllocationResult {
  seat: number;
  constraintViolation: boolean;
  violations: string[];
  score: number;
}

// ── نتيجة إعادة الترتيب (Batch) ──────────────────
export interface ReshuffleResult {
  success: boolean;
  arrangement: Array<{
    playerId: number | null;
    phone: string;
    seatNumber: number;
    fromSeat?: number;   // المقعد الأصليّ — مفتاح المطابقة الوحيد الآمن
    name?: string;
  }>;
  totalScore: number;
  violations: string[];
  relaxedConstraints: string[];
}

// ── دالة الجوار الدائري ──────────────────────────
export function getCircularNeighborSeats(seat: number, maxPlayers: number): [number, number] {
  if (maxPlayers <= 1) return [seat, seat];
  const left = seat === 1 ? maxPlayers : seat - 1;
  const right = seat === maxPlayers ? 1 : seat + 1;
  return [left, right];
}

/**
 * جلب كل المقاعد ضمن مسافة معينة (دائرياً)
 * مثال: seat=5, maxPlayers=20, distance=2 → [3, 4, 6, 7]
 */
export function getSeatsWithinDistance(seat: number, maxPlayers: number, distance: number): number[] {
  const seats: number[] = [];
  for (let d = 1; d <= distance; d++) {
    const left = ((seat - 1 - d + maxPlayers) % maxPlayers) + 1;
    const right = ((seat - 1 + d) % maxPlayers) + 1;
    if (!seats.includes(left)) seats.push(left);
    if (!seats.includes(right)) seats.push(right);
  }
  return seats;
}

/**
 * حساب المسافة الدائرية بين مقعدين
 */
export function circularDistance(seatA: number, seatB: number, maxPlayers: number): number {
  const diff = Math.abs(seatA - seatB);
  return Math.min(diff, maxPlayers - diff);
}

// ── مفتاح الجار (ترتيب أبجدي لمنع التكرار) ──────
export function neighborKey(idA: number, idB: number): string {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}

/**
 * أصغر مسافة دائريّة بين مقعد ومجموعة مقاعد (Infinity إن كانت المجموعة فارغة).
 * يُستعمل في كسر التعادل بالتباعد.
 */
export function minCircularDistance(seat: number, others: number[] | undefined, maxPlayers: number): number {
  if (!others || others.length === 0) return Infinity;
  let best = Infinity;
  for (const o of others) {
    if (o === seat) return 0;
    const d = circularDistance(seat, o, maxPlayers);
    if (d < best) best = d;
  }
  return best;
}

// ── تطبيع الهاتف الموحَّد (نسخة واحدة لكلّ طبقات الجلوس) ──
// كانت ثلاث نسخ متباينة: engine يزيل 962، والقيد يضيف 0 فقط، وseat-merge نسخة ثالثة.
export function normalizeSeatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let c = String(phone).replace(/[\s\-()+]/g, '');
  if (c.startsWith('00962')) c = c.substring(5);
  else if (c.startsWith('962')) c = c.substring(3);
  if (!c) return '';
  return c.startsWith('0') ? c : '0' + c;
}

/**
 * هويّة قابلة للمطابقة عبر الطبقات: الحساب أوّلاً ثمّ الهاتف المطبَّع ثمّ الاسم.
 * تُستعمل مفتاحاً لأزواج التقارب كي تعمل مع اللاعبين بلا حساب.
 */
export function personKey(p: { playerId?: number | null; phone?: string | null; name?: string }): string {
  if (p.playerId) return `p${p.playerId}`;
  const ph = normalizeSeatPhone(p.phone);
  if (ph) return `h${ph}`;
  return `n${(p.name || '').trim().toLowerCase()}`;
}

/** مفتاح زوجٍ لا يتأثّر بترتيب الطرفين */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
