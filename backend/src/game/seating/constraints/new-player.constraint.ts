// ══════════════════════════════════════════════════════
// 👶 قيد فصل اللاعبين الجدد — New Player Separation
// لاعب جديد (< 3 فعاليات) لا يجلس بين لاعبَين جديدَين
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getCircularNeighborSeats } from '../types.js';

export class NewPlayerConstraint implements SeatingConstraint {
  type = 'NEW_PLAYER_SEPARATION';
  nameAr = 'فصل اللاعبين الجدد';
  priority: number;
  enabled: boolean;
  private threshold: number;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 3;
    this.threshold = config.params?.threshold ?? 3; // أقل من 3 فعاليات = جديد
  }

  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    // إذا اللاعب ليس جديداً → لا قيود
    if (player.activityCount >= this.threshold) {
      return { satisfied: true, score: 1.0 };
    }

    // اللاعب جديد → تحقق من الجيران
    const [leftSeat, rightSeat] = getCircularNeighborSeats(candidateSeat, context.maxPlayers);
    const leftNeighbor = occupiedSeats.get(leftSeat);
    const rightNeighbor = occupiedSeats.get(rightSeat);

    const leftIsNew = leftNeighbor && leftNeighbor.activityCount < this.threshold;
    const rightIsNew = rightNeighbor && rightNeighbor.activityCount < this.threshold;

    // كلا الجارين جديدان → ❌
    if (leftIsNew && rightIsNew) {
      return {
        satisfied: false,
        score: 0.0,
        violation: `لاعب جديد (${player.name}) محاط بلاعبَين جديدَين`,
      };
    }

    // جار واحد جديد → مقبول لكن ليس مثالياً
    if (leftIsNew || rightIsNew) {
      return { satisfied: true, score: 0.6 };
    }

    // جاران خبيران → مثالي
    return { satisfied: true, score: 1.0 };
  }

  getDescription(): string {
    return `لاعب جديد (أقل من ${this.threshold} فعاليات) لا يجلس بين لاعبَين جديدَين`;
  }
}
