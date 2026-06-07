// ══════════════════════════════════════════════════════
// 👥 قيد جنس اللاعب الفردي — Player-Specific Gender Constraint
// يمنع اللاعب من الجلوس بجانب نفس الجنس أو جنس مختلف بناءً على قيده الخاص
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getCircularNeighborSeats } from '../types.js';

export class PlayerGenderConstraint implements SeatingConstraint {
  type = 'PLAYER_GENDER_CONSTRAINT';
  nameAr = 'قيود جنس اللاعبين';
  priority: number;
  enabled: boolean;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 2; // أولوية عالية تشبه جيران المعاقب
  }

  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    const playerGender = (player.gender || 'MALE').toUpperCase();
    const playerRule = player.genderConstraint || 'NONE';

    const [leftSeat, rightSeat] = getCircularNeighborSeats(candidateSeat, context.maxPlayers);
    const leftNeighbor = occupiedSeats.get(leftSeat);
    const rightNeighbor = occupiedSeats.get(rightSeat);

    for (const neighbor of [leftNeighbor, rightNeighbor]) {
      if (!neighbor) continue;
      const neighborGender = (neighbor.gender || 'MALE').toUpperCase();
      const neighborRule = neighbor.genderConstraint || 'NONE';

      // 1. تحقق من قيد اللاعب الجديد نفسه تجاه جاره
      if (playerRule === 'FORBID_SAME' && playerGender === neighborGender) {
        return {
          satisfied: false,
          score: 0.1,
          violation: `مخالفة قيد اللاعب (${player.name}): ممنوع مجاورة نفس الجنس (${playerGender})`,
        };
      }
      if (playerRule === 'FORBID_OPPOSITE' && playerGender !== neighborGender) {
        return {
          satisfied: false,
          score: 0.1,
          violation: `مخالفة قيد اللاعب (${player.name}): ممنوع مجاورة الجنس الآخر (جار: ${neighbor.name} - ${neighborGender})`,
        };
      }

      // 2. تحقق من قيد الجار نفسه تجاه اللاعب الجديد
      if (neighborRule === 'FORBID_SAME' && neighborGender === playerGender) {
        return {
          satisfied: false,
          score: 0.1,
          violation: `مخالفة قيد الجار (${neighbor.name}): ممنوع مجاورة نفس الجنس (${neighborGender})`,
        };
      }
      if (neighborRule === 'FORBID_OPPOSITE' && neighborGender !== playerGender) {
        return {
          satisfied: false,
          score: 0.1,
          violation: `مخالفة قيد الجار (${neighbor.name}): ممنوع مجاورة الجنس الآخر (اللاعب: ${player.name} - ${playerGender})`,
        };
      }
    }

    return { satisfied: true, score: 1.0 };
  }

  getDescription(): string {
    return 'تطبيق قيود الجنس الفردية المحددة للاعبين (عدم الجلوس بجانب نفس الجنس أو جنس مختلف)';
  }
}
