// ══════════════════════════════════════════════════════
// 🔄 قيد تجنب تكرار الجيران (للمعاقبين) — Penalty Neighbor Avoidance
// اللاعب المعاقب لا يجلس بجانب نفس الجيران مرة أخرى
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getCircularNeighborSeats, neighborKey } from '../types.js';

export class PenaltyNeighborConstraint implements SeatingConstraint {
  type = 'PENALTY_NEIGHBOR_AVOIDANCE';
  nameAr = 'تجنب جيران اللاعب المعاقب';
  priority: number;
  enabled: boolean;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 2;
  }

  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    if (!player.playerId) {
      return { satisfied: true, score: 1.0 };
    }

    const [leftSeat, rightSeat] = getCircularNeighborSeats(candidateSeat, context.maxPlayers);
    const leftNeighbor = occupiedSeats.get(leftSeat);
    const rightNeighbor = occupiedSeats.get(rightSeat);

    let violations: string[] = [];
    let repeatCount = 0;

    // فحص: هل اللاعب الحالي كان معاقباً وجلس بجانب هؤلاء؟
    for (const neighbor of [leftNeighbor, rightNeighbor]) {
      if (!neighbor?.playerId) continue;
      const key = neighborKey(player.playerId, neighbor.playerId);
      const count = context.penaltyNeighborHistory.get(key) || 0;
      if (count > 0) {
        repeatCount++;
        violations.push(`${player.name} جلس بجانب ${neighbor.name} ${count} مرة أثناء عقوبة`);
      }
    }

    // فحص عكسي: هل الجار كان معاقباً وجلس بجانب هذا اللاعب؟
    // (نفس الـ key فالفحص أعلاه يغطي الحالتين)

    if (violations.length > 0) {
      return {
        satisfied: false,
        score: Math.max(0, 1.0 - (repeatCount * 0.5)),
        violation: violations.join(' | '),
      };
    }

    return { satisfied: true, score: 1.0 };
  }

  getDescription(): string {
    return 'اللاعب المعاقب لا يجلس بجانب نفس الجيران الذين كانوا بجانبه أثناء العقوبة';
  }
}
