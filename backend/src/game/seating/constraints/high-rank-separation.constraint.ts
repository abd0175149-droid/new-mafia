// ══════════════════════════════════════════════════════
// ⚔️ قيد فصل الرتب العالية — High Rank Separation
// لاعبان بـ rankRR عالي لا يجلسان بجانب بعض
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getCircularNeighborSeats } from '../types.js';

export class HighRankSeparationConstraint implements SeatingConstraint {
  type = 'HIGH_RANK_SEPARATION';
  nameAr = 'فصل الرتب العالية';
  priority: number;
  enabled: boolean;
  private rankThreshold: number;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? false; // معطّل افتراضياً
    this.priority = config.priority ?? 4;
    this.rankThreshold = config.params?.rankThreshold ?? 500;
  }

  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    // إذا اللاعب ليس ذا رتبة عالية → لا قيد
    if (player.rankRR < this.rankThreshold) {
      return { satisfied: true, score: 1.0 };
    }

    const [leftSeat, rightSeat] = getCircularNeighborSeats(candidateSeat, context.maxPlayers);
    const leftNeighbor = occupiedSeats.get(leftSeat);
    const rightNeighbor = occupiedSeats.get(rightSeat);

    for (const neighbor of [leftNeighbor, rightNeighbor]) {
      if (!neighbor) continue;
      if (neighbor.rankRR >= this.rankThreshold) {
        return {
          satisfied: false,
          score: 0.2,
          violation: `لاعبان بتصنيف عالي متجاوران: ${player.name} (${player.rankRR}) و ${neighbor.name} (${neighbor.rankRR})`,
        };
      }
    }

    return { satisfied: true, score: 1.0 };
  }

  getDescription(): string {
    return `لاعبان بتصنيف RR ≥ ${this.rankThreshold} لا يجلسان بجانب بعض`;
  }
}
