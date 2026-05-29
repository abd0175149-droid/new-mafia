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
}

// ── نتيجة تقييم القيد ──────────────────────────────
export interface ConstraintResult {
  satisfied: boolean;          // هل القيد متحقق
  score: number;               // 0.0 (أسوأ) → 1.0 (أفضل)
  violation?: string;          // وصف المخالفة
}

// ── سياق التقييم ──────────────────────────────────
export interface EvaluationContext {
  maxPlayers: number;
  sessionId?: number;
  // تاريخ جيران اللاعبين المعاقبين: "playerA_id-playerB_id" → عدد المرات
  penaltyNeighborHistory: Map<string, number>;
  constraintParams: Record<string, any>;
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

// ── مفتاح الجار (ترتيب أبجدي لمنع التكرار) ──────
export function neighborKey(idA: number, idB: number): string {
  return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
}
