// ══════════════════════════════════════════════════════
// 🪑 خوارزمية التوزيع التلقائي للمقاعد (Seat Allocator)
// المقاعد مرتبة على شكل مربع دائري: N مجاور لـ 1
// ══════════════════════════════════════════════════════

export interface SeatConstraints {
  genderSeparation: boolean;       // فصل الجنسين (ذكر لا يجلس بجانب أنثى)
  noAdjacentPairs: Array<{         // أزواج لا يجلسون بجانب بعض
    player1Phone: string;
    player1Name: string;
    player2Phone: string;
    player2Name: string;
  }>;
}

export interface SeatPlayer {
  physicalId: number;
  phone: string | null;
  gender: string | null;
  seatHeld?: boolean; // المقعد محجوز (اللاعب خرج ولكن مقعده محفوظ)
}

export interface AllocateParams {
  maxPlayers: number;
  players: SeatPlayer[];
  constraints: SeatConstraints | null;
  newPlayer: { phone: string; gender: string };
  preferredSeat?: number;  // المقعد السابق (للعودة)
}

// ── دالة الجوار الدائري (مربع) ──
function getAdjacentSeats(seat: number, maxPlayers: number): number[] {
  if (maxPlayers <= 1) return [];
  const left = seat === 1 ? maxPlayers : seat - 1;
  const right = seat === maxPlayers ? 1 : seat + 1;
  return [left, right];
}

// ── خلط عشوائي (Fisher-Yates) ──
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * تخصيص مقعد للاعب بشكل تلقائي مع مراعاة القيود.
 * 
 * الأولوية:
 * 1. المقعد المفضل (إذا فارغ) — للعودة
 * 2. مقعد يحقق كل القيود
 * 3. fallback عشوائي (إذا القيود مستحيلة)
 */
export function allocateSeat(params: AllocateParams): { seat: number; constraintViolation: boolean } {
  const { maxPlayers, players, constraints, newPlayer, preferredSeat } = params;

  // حساب المقاعد المشغولة (تشمل المقاعد المحجوزة — seatHeld)
  const occupiedSet = new Set(players.map(p => p.physicalId));

  // حساب كل المقاعد الفارغة (المحجوزة تُعتبر مشغولة)
  const allEmpty: number[] = [];
  for (let i = 1; i <= maxPlayers; i++) {
    if (!occupiedSet.has(i)) allEmpty.push(i);
  }

  if (allEmpty.length === 0) {
    throw new Error(`الغرفة ممتلئة (${maxPlayers} لاعب كحد أقصى)`);
  }

  // 1. المقعد المفضل (rejoin)
  if (preferredSeat && allEmpty.includes(preferredSeat)) {
    // نتحقق من القيود حتى لو مفضل
    if (!constraints || isSeatValid(preferredSeat, players, constraints, newPlayer, maxPlayers)) {
      return { seat: preferredSeat, constraintViolation: false };
    }
    // المقعد المفضل ينتهك القيود → نحاول مقعد آخر أولاً
    // لكن إذا لا يوجد غيره سنعود إليه في الـ fallback
  }

  // 2. فلترة حسب القيود
  if (constraints) {
    const validSeats = allEmpty.filter(seat =>
      isSeatValid(seat, players, constraints, newPlayer, maxPlayers)
    );

    if (validSeats.length > 0) {
      const shuffled = shuffle(validSeats);
      return { seat: shuffled[0], constraintViolation: false };
    }

    // 3. fallback — لا مقاعد تحقق القيود
    console.warn(`⚠️ Seat constraints couldn't be fully satisfied — assigning random seat`);
  }

  // عشوائي بدون قيود
  const shuffled = shuffle(allEmpty);
  return { seat: shuffled[0], constraintViolation: !!constraints };
}

/**
 * فحص صلاحية مقعد معين حسب القيود
 */
function isSeatValid(
  seat: number,
  players: SeatPlayer[],
  constraints: SeatConstraints,
  newPlayer: { phone: string; gender: string },
  maxPlayers: number,
): boolean {
  const adjacent = getAdjacentSeats(seat, maxPlayers);

  // الجيران الحاليين
  const neighbors = players.filter(p => adjacent.includes(p.physicalId));

  // ── قيد 1: فصل الجنسين ──
  if (constraints.genderSeparation) {
    const newGender = (newPlayer.gender || 'MALE').toUpperCase();
    for (const neighbor of neighbors) {
      const neighborGender = (neighbor.gender || 'MALE').toUpperCase();
      if (newGender !== neighborGender) {
        return false; // جنس مختلف بجانب بعض
      }
    }
  }

  // ── قيد 2: أزواج ممنوعة ──
  if (constraints.noAdjacentPairs && constraints.noAdjacentPairs.length > 0) {
    const normalizedNewPhone = normalizePhone(newPlayer.phone);

    for (const pair of constraints.noAdjacentPairs) {
      const p1 = normalizePhone(pair.player1Phone);
      const p2 = normalizePhone(pair.player2Phone);

      // هل اللاعب الجديد هو أحد طرفي الزوج؟
      if (normalizedNewPhone === p1) {
        // نتحقق إن كان الطرف الثاني مجاوراً
        if (neighbors.some(n => normalizePhone(n.phone || '') === p2)) {
          return false;
        }
      } else if (normalizedNewPhone === p2) {
        if (neighbors.some(n => normalizePhone(n.phone || '') === p1)) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * توحيد صيغة رقم الهاتف للمقارنة
 */
function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.startsWith('0') ? phone : '0' + phone;
}
