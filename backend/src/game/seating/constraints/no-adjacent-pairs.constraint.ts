// ══════════════════════════════════════════════════════
// 🚫 قيد الأزواج الممنوعة — No Adjacent Pairs
// أزواج محددة يدوياً لا يجلسون قريبين من بعض
// الحد الأدنى: minDistance مقاعد بينهم (افتراضي: 2)
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getSeatsWithinDistance, circularDistance } from '../types.js';

interface BlockedPair {
  player1Phone: string;
  player1Name: string;
  player2Phone: string;
  player2Name: string;
}

function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.startsWith('0') ? phone : '0' + phone;
}

export class NoAdjacentPairsConstraint implements SeatingConstraint {
  type = 'NO_ADJACENT_PAIRS';
  nameAr = 'أزواج ممنوعة';
  priority: number;
  enabled: boolean;
  private pairs: BlockedPair[];
  private minDistance: number;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 1; // أعلى أولوية — لا يُخفَّف
    this.pairs = config.params?.pairs || [];
    this.minDistance = config.params?.minDistance ?? 2; // الحد الأدنى: مقعدين بينهم
  }

  /** تحديث قائمة الأزواج الممنوعة */
  setPairs(pairs: BlockedPair[]) {
    this.pairs = pairs;
  }

  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    if (this.pairs.length === 0) {
      return { satisfied: true, score: 1.0 };
    }

    const normalizedPlayerPhone = normalizePhone(player.phone);

    // فحص كل المقاعد ضمن مسافة minDistance
    const nearbySeats = getSeatsWithinDistance(candidateSeat, context.maxPlayers, this.minDistance);

    for (const pair of this.pairs) {
      const p1 = normalizePhone(pair.player1Phone);
      const p2 = normalizePhone(pair.player2Phone);

      // هل اللاعب الحالي طرف في هذا الزوج؟
      let partnerPhone: string | null = null;
      let pairNames = '';
      if (normalizedPlayerPhone === p1) {
        partnerPhone = p2;
        pairNames = `${pair.player1Name} و ${pair.player2Name}`;
      } else if (normalizedPlayerPhone === p2) {
        partnerPhone = p1;
        pairNames = `${pair.player1Name} و ${pair.player2Name}`;
      }

      if (!partnerPhone) continue;

      // فحص كل المقاعد القريبة
      for (const nearbySeat of nearbySeats) {
        const occupant = occupiedSeats.get(nearbySeat);
        if (!occupant) continue;
        if (normalizePhone(occupant.phone) === partnerPhone) {
          const dist = circularDistance(candidateSeat, nearbySeat, context.maxPlayers);
          // كلما كان أقرب كان أسوأ
          const score = Math.max(0, dist / (this.minDistance + 1));
          return {
            satisfied: false,
            score,
            violation: `زوج ممنوع على بُعد ${dist} مقعد فقط (الحد الأدنى: ${this.minDistance + 1}): ${pairNames}`,
          };
        }
      }

      // فحص إضافي: هل الشريك موجود أبعد → نقاط إضافية
      for (const [seatNum, occupant] of occupiedSeats.entries()) {
        if (normalizePhone(occupant.phone) === partnerPhone) {
          const dist = circularDistance(candidateSeat, seatNum, context.maxPlayers);
          if (dist <= this.minDistance) {
            const score = Math.max(0, dist / (this.minDistance + 1));
            return {
              satisfied: false,
              score,
              violation: `زوج ممنوع على بُعد ${dist} مقعد فقط (الحد الأدنى: ${this.minDistance + 1}): ${pairNames}`,
            };
          }
          // المسافة كافية → مثالي
          break;
        }
      }
    }

    return { satisfied: true, score: 1.0 };
  }

  getDescription(): string {
    return `${this.pairs.length} زوج ممنوع من الجلوس قريبين (حد أدنى: ${this.minDistance + 1} مقاعد بينهم)`;
  }
}
