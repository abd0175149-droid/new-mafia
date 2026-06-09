// ══════════════════════════════════════════════════════
// 🪑 محرك الجلوس الذكي — Seating Engine
// الوضع التفاعلي: يعيّن مقعد أمثل للاعب عند دخوله
// الوضع الدُفعي: إعادة ترتيب كامل (فقط عند ضغط الليدر)
// ══════════════════════════════════════════════════════

import type {
  PlayerSeatData,
  SeatingConstraint,
  EvaluationContext,
  ConstraintResult,
  SeatAllocationResult,
  ReshuffleResult,
  SeatingConfig,
  ConstraintConfig,
  PinnedSeat,
} from './types.js';
import { getCircularNeighborSeats } from './types.js';

// ── تطبيع رقم الهاتف ──
function normalizePhone(phone: string): string {
  if (!phone) return '';
  // إزالة المسافات والرموز الزائدة
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  // التعامل مع مفتاح الأردن الدولي
  if (cleaned.startsWith('00962')) {
    cleaned = cleaned.substring(5);
  } else if (cleaned.startsWith('962')) {
    cleaned = cleaned.substring(3);
  }
  // التأكد من البدء بـ 0
  return cleaned.startsWith('0') ? cleaned : '0' + cleaned;
}
import { buildConstraints, buildDefaultConstraints, migrateOldConstraints } from './constraint-registry.js';

// ── خلط عشوائي (Fisher-Yates) ──
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── فحص هل المقعد مثبت للاعب آخر ──
function isPinnedToSomeoneElse(
  seatNumber: number,
  newPlayer: PlayerSeatData,
  pinnedSeats: PinnedSeat[]
): boolean {
  const pin = pinnedSeats.find(p => p.seatNumber === seatNumber);
  if (!pin) return false;

  const normalizedNewPhone = normalizePhone(newPlayer.phone);
  const matchesPlayer =
    (pin.playerId && newPlayer.playerId && String(pin.playerId) === String(newPlayer.playerId)) ||
    (pin.phone && normalizedNewPhone && normalizePhone(pin.phone) === normalizedNewPhone) ||
    (!pin.playerId && !pin.phone && pin.playerName && pin.playerName === newPlayer.name);

  return !matchesPlayer;
}

// ══════════════════════════════════════════════════════
// 📍 الوضع التفاعلي (Incremental) — مقعد واحد لكل لاعب
// ══════════════════════════════════════════════════════

/**
 * تخصيص أفضل مقعد للاعب جديد مع مراعاة القيود.
 * 
 * الأولوية:
 * 1. المقعد المفضل (إن حقق القيود)
 * 2. أفضل مقعد يحقق كل القيود
 * 3. أقل المقاعد مخالفةً (الوضع المرن)
 * 4. مقعد عشوائي (fallback نهائي)
 */
export function allocateSeatWithConstraints(params: {
  maxPlayers: number;
  occupiedSeats: Map<number, PlayerSeatData>;
  newPlayer: PlayerSeatData;
  seatingConfig: SeatingConfig | null;
  context: EvaluationContext;
  preferredSeat?: number;
}): SeatAllocationResult {
  const { maxPlayers, occupiedSeats, newPlayer, seatingConfig, context, preferredSeat } = params;

  // ═══ 0. فحص المقاعد المثبتة (Pinned Seats) — شرط ابتدائي ═══
  if (context.pinnedSeats && context.pinnedSeats.length > 0) {
    const normalizedNewPhone = normalizePhone(newPlayer.phone);
    const pinned = context.pinnedSeats.find(p =>
      (p.playerId && newPlayer.playerId && String(p.playerId) === String(newPlayer.playerId)) ||
      (p.phone && normalizedNewPhone && normalizePhone(p.phone) === normalizedNewPhone) ||
      (!p.playerId && !p.phone && p.playerName && p.playerName === newPlayer.name)
    );
    if (pinned && !occupiedSeats.has(pinned.seatNumber)) {
      console.log(`📌 Pinned seat #${pinned.seatNumber} assigned to ${newPlayer.name}`);
      return { seat: pinned.seatNumber, constraintViolation: false, violations: [], score: 1.0 };
    }
  }

  // حساب المقاعد الفارغة
  let allEmpty: number[] = [];
  for (let i = 1; i <= maxPlayers; i++) {
    if (!occupiedSeats.has(i)) allEmpty.push(i);
  }

  // تصفية المقاعد الفارغة: استبعاد المقاعد المثبتة للاعبين آخرين لم ينضموا بعد
  if (context.pinnedSeats && context.pinnedSeats.length > 0) {
    const unreservedEmpty = allEmpty.filter(seat => !isPinnedToSomeoneElse(seat, newPlayer, context.pinnedSeats));
    if (unreservedEmpty.length > 0) {
      allEmpty = unreservedEmpty;
    }
  }

  if (allEmpty.length === 0) {
    throw new Error(`الغرفة ممتلئة (${maxPlayers} لاعب كحد أقصى)`);
  }

  // ── بناء القيود ──
  const constraints = resolveConstraints(seatingConfig);
  const activeConstraints = constraints.filter(c => c.enabled);

  // إذا لا قيود مفعّلة → عشوائي
  if (activeConstraints.length === 0) {
    if (preferredSeat && allEmpty.includes(preferredSeat)) {
      return { seat: preferredSeat, constraintViolation: false, violations: [], score: 1.0 };
    }
    return { seat: shuffle(allEmpty)[0], constraintViolation: false, violations: [], score: 1.0 };
  }

  // ── حساب نطاق المقاعد المؤخرة ──
  const tailCount = context.reservedTailSeats ?? 0;
  const tailStart = tailCount > 0 ? maxPlayers - tailCount + 1 : maxPlayers + 1;
  // هل المقاعد الأمامية ممتلئة؟ (كل المقاعد < tailStart مشغولة)
  const frontSeats = allEmpty.filter(s => s < tailStart);
  const frontFull = frontSeats.length === 0;

  // ── تقييم كل مقعد فارغ ──
  type ScoredSeat = { seat: number; totalScore: number; hardFail: boolean; violations: string[] };
  const scored: ScoredSeat[] = [];

  for (const seat of allEmpty) {
    let { totalScore, hardFail, violations } = evaluateSeat(
      occupiedSeats, seat, newPlayer, activeConstraints, context
    );

    // عقوبة المقاعد المؤخرة (إلا إذا المقاعد الأمامية ممتلئة)
    if (tailCount > 0 && seat >= tailStart && !frontFull) {
      totalScore -= 2.0;
    }

    scored.push({ seat, totalScore, hardFail, violations });
  }

  // ترتيب: الأفضل أولاً (غير الفاشلين → الأعلى نقاطاً → الأقل رقماً)
  scored.sort((a, b) => {
    if (a.hardFail !== b.hardFail) return a.hardFail ? 1 : -1;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.seat - b.seat; // تفضيل الأرقام الأقل
  });

  // 1. المقعد المفضل (إذا حقق القيود)
  if (preferredSeat && allEmpty.includes(preferredSeat)) {
    const prefResult = scored.find(s => s.seat === preferredSeat);
    if (prefResult && !prefResult.hardFail) {
      return {
        seat: preferredSeat,
        constraintViolation: false,
        violations: prefResult.violations,
        score: prefResult.totalScore,
      };
    }
  }

  // 2. أفضل مقعد بدون مخالفات صارمة
  const bestValid = scored.find(s => !s.hardFail);
  if (bestValid) {
    return {
      seat: bestValid.seat,
      constraintViolation: false,
      violations: bestValid.violations,
      score: bestValid.totalScore,
    };
  }

  // 3. الوضع المرن: اختر أقل مقعد مخالفةً
  const strictness = seatingConfig?.strictness || 'relaxed';
  if (strictness === 'relaxed') {
    const least = scored[0]; // مرتبة بالأفضل أولاً حتى لو فيها مخالفات
    console.warn(`⚠️ Seating: No perfect seat for ${newPlayer.name}, using least-violating seat #${least.seat}`);
    return {
      seat: least.seat,
      constraintViolation: true,
      violations: least.violations,
      score: least.totalScore,
    };
  }

  // 4. الوضع الصارم: fallback عشوائي
  console.warn(`⚠️ Seating (strict): All seats violate constraints for ${newPlayer.name}`);
  return {
    seat: shuffle(allEmpty)[0],
    constraintViolation: true,
    violations: ['CONSTRAINTS_UNSATISFIABLE'],
    score: 0,
  };
}

// ══════════════════════════════════════════════════════
// 🔄 الوضع الدُفعي (Batch Reshuffle) — إعادة ترتيب الكل
// يُستدعى فقط عند ضغط الليدر "إعادة ترتيب"
// ══════════════════════════════════════════════════════

export function reshuffleSeating(params: {
  maxPlayers: number;
  players: PlayerSeatData[];
  seatingConfig: SeatingConfig | null;
  context: EvaluationContext;
}): ReshuffleResult {
  const { maxPlayers, players, seatingConfig, context } = params;
  const constraints = resolveConstraints(seatingConfig).filter(c => c.enabled);

  if (players.length === 0) {
    return { success: true, arrangement: [], totalScore: 1.0, violations: [], relaxedConstraints: [] };
  }

  // ── Greedy constructive: ضع اللاعبين واحداً تلو الآخر ──
  // رتّب اللاعبين: الأكثر تقييداً أولاً (MRV)
  const sortedPlayers = [...players].sort((a, b) => {
    // الأزواج الممنوعة → أولاً
    // الرتب العالية → ثانياً
    // الجدد → ثالثاً
    let scoreA = 0, scoreB = 0;
    if (a.rankRR >= 500) scoreA += 3;
    if (b.rankRR >= 500) scoreB += 3;
    if (a.activityCount < 3) scoreA += 2;
    if (b.activityCount < 3) scoreB += 2;
    if (a.hasPenalty) scoreA += 4;
    if (b.hasPenalty) scoreB += 4;
    return scoreB - scoreA;
  });

  let bestArrangement: Map<number, PlayerSeatData> | null = null;
  let bestScore = -Infinity;
  let bestViolations: string[] = [];

  // ── عدة محاولات بترتيب مختلف ──
  const MAX_ATTEMPTS = 50;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidatePlayers = attempt === 0 ? sortedPlayers : shuffle(sortedPlayers);
    const arrangement = new Map<number, PlayerSeatData>();
    let totalScore = 0;
    let violations: string[] = [];
    let success = true;

    for (const player of candidatePlayers) {
      // أفضل مقعد فارغ لهذا اللاعب
      const allEmpty: number[] = [];
      for (let i = 1; i <= maxPlayers; i++) {
        if (!arrangement.has(i)) allEmpty.push(i);
      }

      if (allEmpty.length === 0) { success = false; break; }

      let bestSeat = allEmpty[0];
      let bestSeatScore = -Infinity;
      let bestSeatViolations: string[] = [];

      for (const seat of allEmpty) {
        const result = evaluateSeat(arrangement, seat, player, constraints, context);
        if (result.totalScore > bestSeatScore) {
          bestSeatScore = result.totalScore;
          bestSeat = seat;
          bestSeatViolations = result.violations;
        }
      }

      arrangement.set(bestSeat, { ...player, physicalId: bestSeat });
      totalScore += bestSeatScore;
      violations.push(...bestSeatViolations);
    }

    if (success && totalScore > bestScore) {
      bestScore = totalScore;
      bestArrangement = arrangement;
      bestViolations = violations;
    }
  }

  if (!bestArrangement) {
    // fallback: ترتيب عشوائي
    const shuffled = shuffle(players);
    return {
      success: false,
      arrangement: shuffled.map((p, i) => ({
        playerId: p.playerId,
        phone: p.phone,
        seatNumber: i + 1,
      })),
      totalScore: 0,
      violations: ['RESHUFFLE_FAILED'],
      relaxedConstraints: [],
    };
  }

  const result: ReshuffleResult = {
    success: true,
    arrangement: [],
    totalScore: bestScore / Math.max(players.length, 1),
    violations: bestViolations,
    relaxedConstraints: [],
  };

  for (const [seatNum, player] of bestArrangement.entries()) {
    result.arrangement.push({
      playerId: player.playerId,
      phone: player.phone,
      seatNumber: seatNum,
    });
  }

  // ترتيب حسب رقم المقعد
  result.arrangement.sort((a, b) => a.seatNumber - b.seatNumber);

  return result;
}

// ══════════════════════════════════════════════════════
// 🔧 دوال مساعدة
// ══════════════════════════════════════════════════════

/**
 * تقييم مقعد معين حسب كل القيود المفعّلة
 */
function evaluateSeat(
  occupiedSeats: Map<number, PlayerSeatData>,
  seat: number,
  player: PlayerSeatData,
  constraints: SeatingConstraint[],
  context: EvaluationContext,
): { totalScore: number; hardFail: boolean; violations: string[] } {
  let totalScore = 0;
  let hardFail = false;
  const violations: string[] = [];

  for (const constraint of constraints) {
    const result = constraint.evaluate(occupiedSeats, seat, player, context);

    // القيود ذات الأولوية ≤ 2 → صارمة (Hard)
    if (!result.satisfied && constraint.priority <= 2) {
      hardFail = true;
    }

    if (!result.satisfied && result.violation) {
      violations.push(result.violation);
    }

    // الوزن: أولوية أعلى = وزن أكبر
    const weight = 10 - constraint.priority;
    totalScore += result.score * weight;
  }

  return { totalScore, hardFail, violations };
}

/**
 * بناء القيود من الإعدادات (مع دعم الوضع القديم)
 */
function resolveConstraints(config: SeatingConfig | null): SeatingConstraint[] {
  if (!config) return buildDefaultConstraints();

  // الوضع الجديد
  if (config.engineEnabled && config.constraints && config.constraints.length > 0) {
    return buildConstraints(config.constraints);
  }

  // الوضع القديم → تحويل
  if (config.genderSeparation !== undefined || (config.noAdjacentPairs && config.noAdjacentPairs.length > 0)) {
    const migrated = migrateOldConstraints({
      genderSeparation: config.genderSeparation,
      noAdjacentPairs: config.noAdjacentPairs,
    });
    return buildConstraints(migrated);
  }

  return buildDefaultConstraints();
}
