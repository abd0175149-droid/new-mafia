// ══════════════════════════════════════════════════════
// 🌉 جسرُ الليل القديم — نوايا الطابور تُقرأ بالمحرّك الديناميكيّ
//
// كان في المستودع محرّكان: الوضعُ الآليّ يستدعي `resolveNight` (القديم، مفهرَسٌ
// بالأدوار)، و`night:resolve` يستدعي `resolveNightDynamic` (الديناميكيّ، مفهرَسٌ
// بالقدرات). فالطاولةُ الواحدة تُنتج نتيجتين باختلاف وضع الليل — وقد ظهر الفرقُ
// فعلاً: قائمةُ أهداف الساحرة تُسقط الشرطيّة في أحدهما لا في الآخر.
//
// 🔴 والتوحيدُ بالجسر لا بإعادة الكتابة: **مسارُ الجمع يبقى كما هو** (الطابورُ
//    يكتب في `nightActions` كعادته)، وتُترجَم نواياه هنا إلى حقيبة إجراءاتٍ
//    مفهرَسةٍ بالمفتاح المركّب، ثمّ يحسبها المحرّكُ الديناميكيُّ وحده.
//    نقلُ منطق الحلّ إلى الطابور كان سيُنتج ثالثاً بدل أن يُلغي ثانياً.
//
// 🔴 ومَن الفاعل؟ الحقولُ القديمة تحفظ الهدفَ ولا تحفظ مَن اختاره. فالفاعلُ
//    يُستنتج كما يستنتجه الطابور نفسُه: الاغتيالُ لصاحب السلسلة، وكلُّ قدرةٍ
//    أخرى لصاحب دورها الحيّ. وهذا هو الاستنتاج نفسُه الذي بُنيت عليه الخطوات.
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import { Role } from './roles.js';
import { killHolderSeat } from './night-plan.js';
import { actionKey, type DynamicNightState, type DynamicNightAction } from './dynamic-night-resolver.js';

/** صاحبُ دورٍ حيٌّ — أو null. */
const holder = (state: GameState, role: Role | string): number | null =>
  state.players.find(p => p.role === role && p.isAlive)?.physicalId ?? null;

/**
 * يترجم `state.nightActions` إلى حقيبةِ إجراءاتٍ يفهمها المحرّك الديناميكيّ.
 *
 * ⚠️ لا يمسّ الحالة: يقرأ فقط ويُرجِع حقيبةً جديدة.
 */
export function bridgeLegacyNight(state: GameState): DynamicNightState {
  const na: any = state.nightActions || {};
  const actions: Record<string, DynamicNightAction> = {};

  const add = (abilityId: string, seat: number | null, target: number | null | undefined) => {
    if (seat == null || target == null) return;
    const a: DynamicNightAction = {
      abilityId,
      performerPhysicalId: seat,
      targetPhysicalId: target,
      skipped: false,
    };
    actions[actionKey(a)] = a;
  };

  // 🔪 الاغتيال — لصاحب السلسلة، كما يحدّده الطابور بالضبط
  add('KILL', killHolderSeat(state), na.godfatherTarget);

  add('SILENCE', holder(state, Role.SILENCER), na.silencerTarget);
  add('DISABLE_ABILITY', holder(state, Role.WITCH), na.witchTarget);
  add('INVESTIGATE', holder(state, Role.SHERIFF), na.sheriffTarget);
  add('PROTECT', holder(state, Role.DOCTOR), na.doctorTarget);
  // 🩺 الممرّضةُ تحمل القدرةَ نفسَها — والمفتاحُ المركّب يمنع محوَ إحداهما الأخرى
  add('PROTECT', holder(state, Role.NURSE), na.nurseTarget);
  add('SNIPE', holder(state, Role.SNIPER), na.sniperTarget);
  add('ASSASSINATE', holder(state, 'ASSASSIN'), na.assassinTarget);

  return {
    actions,
    // آخرُ هدفٍ للطبيب يعيش في الحقول القديمة — يُمرَّر كي يبقى قيدُ «لا تكرّر» عاملاً
    lastTargets: na.lastProtectedTarget != null ? { PROTECT: na.lastProtectedTarget } : {},
  };
}
