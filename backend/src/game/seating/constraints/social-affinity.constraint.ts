// ══════════════════════════════════════════════════════
// 🤝 قيد التباعد الاجتماعيّ — Social Affinity Separation
// «الأصدقاء لا يجلسون متجاورين فيتهامسون ويشوّشون الطاولة»
//
// قرار المالك المقفل (2026-09-04): كلّ الإشارات بأوزان، و**أعلى وزنٍ للوصول
// المتزامن** — فمن يدخل القاعة في الدقيقة نفسها جاء مع صاحبه غالباً، وهي
// الإشارة الأدقّ تشغيليّاً لمصدر الضجيج (لا «الصداقة» بالمعنى الاجتماعيّ).
//
// القيد **مرن** (أولويّة 3): لا يمنع الجلوس في غرفة ممتلئة، بل يخفض نقاط
// المقعد فيُختار غيرُه ما دام متاحاً. الأوزان تأتي جاهزةً في
// context.affinityPairs ويبنيها lobby.socket من إشارات موجودة في القاعدة.
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, PlayerSeatData, EvaluationContext, ConstraintResult } from '../types.js';
import { getSeatsWithinDistance, circularDistance, personKey, pairKey } from '../types.js';

export class SocialAffinityConstraint implements SeatingConstraint {
  type = 'SOCIAL_AFFINITY_SEPARATION';
  nameAr = 'تباعد الأصدقاء';
  priority: number;
  enabled: boolean;
  /** أدنى مسافة مطلوبة بين طرفَي زوجٍ متقارب (2 = مقعدٌ بينهما على الأقلّ) */
  private minDistance: number;
  /** لا يُحتسب زوجٌ وزنه أقلّ من هذا (يمنع ضجيج الإشارات الضعيفة) */
  private minWeight: number;

  constructor(config: { enabled?: boolean; priority?: number; params?: Record<string, any> } = {}) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? 3; // مرن — لا يُسقط المقعد إسقاطاً صارماً
    this.minDistance = config.params?.minDistance ?? 2;
    this.minWeight = config.params?.minWeight ?? 0.3;
  }

  evaluate(
    occupiedSeats: Map<number, PlayerSeatData>,
    candidateSeat: number,
    player: PlayerSeatData,
    context: EvaluationContext,
  ): ConstraintResult {
    const pairs = context.affinityPairs;
    if (!pairs || pairs.size === 0) return { satisfied: true, score: 1.0 };

    const me = personKey(player);
    const nearby = getSeatsWithinDistance(candidateSeat, context.maxPlayers, this.minDistance);

    let worstWeight = 0;
    let worstDist = this.minDistance + 1;
    let worstName = '';

    for (const seat of nearby) {
      const occupant = occupiedSeats.get(seat);
      if (!occupant) continue;
      const w = pairs.get(pairKey(me, personKey(occupant))) ?? 0;
      if (w < this.minWeight) continue;

      const dist = circularDistance(candidateSeat, seat, context.maxPlayers);
      // الأسوأ = الأثقل وزناً؛ وعند تساوي الوزن الأقربُ مسافةً
      if (w > worstWeight || (w === worstWeight && dist < worstDist)) {
        worstWeight = w;
        worstDist = dist;
        worstName = occupant.name;
      }
    }

    if (worstWeight === 0) return { satisfied: true, score: 1.0 };

    // النتيجة تتدرّج بالوزن والقرب: جارٌ مباشر بوزن 1.0 ⇒ 0، وعلى مسافة 2 ⇒ 0.5
    const proximity = 1 - (worstDist - 1) / this.minDistance;
    const score = Math.max(0, 1 - worstWeight * proximity);

    return {
      satisfied: false,
      score,
      violation: `تقارب اجتماعيّ (${worstWeight.toFixed(2)}) مع ${worstName} على بُعد ${worstDist} مقعد`,
    };
  }

  getDescription(): string {
    return `الأصدقاء (الواصلون معاً أوّلاً) لا يجلسون على بُعد أقلّ من ${this.minDistance + 1} مقاعد — قيد مرن`;
  }
}

// ══════════════════════════════════════════════════════
// ⚖️ الأوزان المقفلة — مصدر الحقيقة الوحيد لبناء affinityPairs
// ══════════════════════════════════════════════════════
export const AFFINITY_WEIGHTS = {
  /** 🥇 الوصول خلال نافذة قصيرة — قرار المالك: الأثقل */
  SIMULTANEOUS_ARRIVAL: 1.0,
  /** حجزٌ واحد بعدّة أشخاص أو مرافقون مسجّلون */
  GROUP_BOOKING: 0.85,
  /** متابعة متبادلة (بشرط أنّهما لعبا معاً) */
  MUTUAL_FOLLOW: 0.7,
  /** تجاورا مرّتين فأكثر في آخر عشر مباريات */
  REPEATED_ADJACENCY: 0.55,
  /** زوجُ تواطؤٍ رصده محرّك مضادّ الغشّ */
  COLLUSION: 0.5,
  /** متابعة أحاديّة الاتّجاه */
  ONE_WAY_FOLLOW: 0.35,
} as const;

/** نافذة «وصلا معاً» بالميلي ثانية (٩٠ ثانية) */
export const SIMULTANEOUS_ARRIVAL_WINDOW_MS = 90_000;
