// ══════════════════════════════════════════════════════
// 🚹🚺 قيد فصل الجنسين — Gender Separation
// ذكر لا يجلس بجانب أنثى (أضعف قيد)
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getCircularNeighborSeats } from '../types.js';

export class GenderSeparationConstraint implements SeatingConstraint {
  type = 'GENDER_SEPARATION';
  nameAr = 'فصل الجنسين';
  priority: number;
  enabled: boolean;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? false; // معطّل افتراضياً (أضعف قيد)
    this.priority = config.priority ?? 8;   // أولوية منخفضة
  }

  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    const playerGender = (player.gender || 'MALE').toUpperCase();
    const [leftSeat, rightSeat] = getCircularNeighborSeats(candidateSeat, context.maxPlayers);
    const leftNeighbor = occupiedSeats.get(leftSeat);
    const rightNeighbor = occupiedSeats.get(rightSeat);

    for (const neighbor of [leftNeighbor, rightNeighbor]) {
      if (!neighbor) continue;
      const neighborGender = (neighbor.gender || 'MALE').toUpperCase();
      if (playerGender !== neighborGender) {
        return {
          satisfied: false,
          score: 0.3,
          violation: `جنس مختلف متجاور: ${player.name} (${playerGender}) و ${neighbor.name} (${neighborGender})`,
        };
      }
    }

    return { satisfied: true, score: 1.0 };
  }

  getDescription(): string {
    return 'ذكر لا يجلس بجانب أنثى والعكس';
  }
}
