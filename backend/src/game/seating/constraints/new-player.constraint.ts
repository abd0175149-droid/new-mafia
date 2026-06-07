// ══════════════════════════════════════════════════════
// 👶 قيد فصل اللاعبين الجدد — New Player Separation
// لاعب جديد (< 3 فعاليات) يجب أن يكون بينه وبين
// أي لاعب جديد آخر على الأقل minGap لاعبين خبيرين
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getSeatsWithinDistance, circularDistance } from '../types.js';

export class NewPlayerConstraint implements SeatingConstraint {
  type = 'NEW_PLAYER_SEPARATION';
  nameAr = 'فصل اللاعبين الجدد';
  priority: number;
  enabled: boolean;
  private threshold: number;
  private minGap: number;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 3;
    this.threshold = config.params?.threshold ?? 3; // أقل من 3 فعاليات = جديد
    this.minGap = config.params?.minGap ?? 2;       // لاعبَين خبيرَين فاصلَين كحد أدنى
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

    // اللاعب جديد → فحص: هل يوجد لاعب جديد آخر ضمن مسافة minGap؟
    const nearbySeats = getSeatsWithinDistance(candidateSeat, context.maxPlayers, this.minGap);

    let closestNewPlayerDist = Infinity;
    let closestNewPlayerName = '';

    for (const nearbySeat of nearbySeats) {
      const occupant = occupiedSeats.get(nearbySeat);
      if (!occupant) continue;
      if (occupant.activityCount < this.threshold) {
        const dist = circularDistance(candidateSeat, nearbySeat, context.maxPlayers);
        if (dist < closestNewPlayerDist) {
          closestNewPlayerDist = dist;
          closestNewPlayerName = occupant.name;
        }
      }
    }

    // لا يوجد لاعب جديد قريب → مثالي
    if (closestNewPlayerDist === Infinity) {
      return { satisfied: true, score: 1.0 };
    }

    // لاعب جديد مجاور مباشرة (بُعد 1) → أسوأ حالة
    if (closestNewPlayerDist <= 1) {
      return {
        satisfied: false,
        score: 0.0,
        violation: `لاعب جديد (${player.name}) على بُعد مقعد واحد من لاعب جديد آخر (${closestNewPlayerName})`,
      };
    }

    // لاعب جديد على بُعد 2 لكن الحد الأدنى المطلوب أكبر → مخالفة متوسطة
    const score = Math.min(1.0, closestNewPlayerDist / (this.minGap + 1));
    return {
      satisfied: false,
      score,
      violation: `لاعب جديد (${player.name}) قريب من ${closestNewPlayerName} — بُعد ${closestNewPlayerDist} (الحد الأدنى: ${this.minGap + 1})`,
    };
  }

  getDescription(): string {
    return `لاعب جديد (أقل من ${this.threshold} فعاليات) يُفصل عن جديد آخر بـ ${this.minGap} لاعبين خبيرين كحد أدنى`;
  }
}
