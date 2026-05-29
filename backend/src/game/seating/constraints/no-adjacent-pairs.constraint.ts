// ══════════════════════════════════════════════════════
// 🚫 قيد الأزواج الممنوعة — No Adjacent Pairs
// أزواج محددة يدوياً لا يجلسون بجانب بعض
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getCircularNeighborSeats } from '../types.js';

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

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 1; // أعلى أولوية — لا يُخفَّف
    this.pairs = config.params?.pairs || [];
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

    const [leftSeat, rightSeat] = getCircularNeighborSeats(candidateSeat, context.maxPlayers);
    const neighbors = [occupiedSeats.get(leftSeat), occupiedSeats.get(rightSeat)].filter(Boolean) as PlayerSeatData[];

    const normalizedPlayerPhone = normalizePhone(player.phone);

    for (const pair of this.pairs) {
      const p1 = normalizePhone(pair.player1Phone);
      const p2 = normalizePhone(pair.player2Phone);

      if (normalizedPlayerPhone === p1) {
        if (neighbors.some(n => normalizePhone(n.phone) === p2)) {
          return {
            satisfied: false,
            score: 0.0,
            violation: `زوج ممنوع متجاور: ${pair.player1Name} و ${pair.player2Name}`,
          };
        }
      } else if (normalizedPlayerPhone === p2) {
        if (neighbors.some(n => normalizePhone(n.phone) === p1)) {
          return {
            satisfied: false,
            score: 0.0,
            violation: `زوج ممنوع متجاور: ${pair.player1Name} و ${pair.player2Name}`,
          };
        }
      }
    }

    return { satisfied: true, score: 1.0 };
  }

  getDescription(): string {
    return `${this.pairs.length} زوج ممنوع من الجلوس بجانب بعض`;
  }
}
