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
  arrangement: Array<{ playerId: number | null; phone: string; seatNumber: number }>;
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
