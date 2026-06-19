// ══════════════════════════════════════════════════════
// 🚪 قيد القرب من الأبواب — Door Proximity Avoidance
// يتجنّب وضع اللاعبين (خاصة الجدد) في المقاعد المجاورة لأبواب الدخول/الخروج.
// المقاعد المجاورة للأبواب تأتي من قالب المقاعد (layoutConfig.doorSeats) عبر السياق.
// ══════════════════════════════════════════════════════

import type {
  SeatingConstraint,
  PlayerSeatData,
  ConstraintResult,
  EvaluationContext,
} from '../types.js';

export class DoorProximityConstraint implements SeatingConstraint {
  type = 'DOOR_PROXIMITY_AVOIDANCE';
  nameAr = 'تجنّب القرب من الأبواب';
  priority: number;
  enabled: boolean;
  private newPlayerThreshold: number;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> }) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 5;            // مرن (أكبر من 2)
    this.newPlayerThreshold = config.params?.newPlayerThreshold ?? 3;
  }

  evaluate(
    _occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    const doorSeats = context.doorSeats || [];
    if (doorSeats.length === 0) return { satisfied: true, score: 1.0 };

    // المقعد ليس مجاوراً لأي باب → مثالي
    if (!doorSeats.includes(candidateSeat)) return { satisfied: true, score: 1.0 };

    // المقعد مجاور لباب: اللاعب الجديد يتجنّبه بقوة، والبقية بدرجة أقل
    const isNew = (player.activityCount ?? 0) < this.newPlayerThreshold;
    return {
      satisfied: false,
      score: isNew ? 0.1 : 0.5,
      violation: isNew ? 'لاعب جديد بجانب الباب' : 'مقعد بجانب الباب',
    };
  }

  getDescription(): string {
    return 'يتجنّب وضع اللاعبين (خصوصاً الجدد) في المقاعد المجاورة لأبواب الدخول/الخروج';
  }
}
