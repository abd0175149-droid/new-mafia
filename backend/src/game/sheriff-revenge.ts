// ══════════════════════════════════════════════════════
// 🕵️ ثأرُ الشريف — مَن سأل عنه يموت معه
//
// القاعدة (يطبّقها الموجّه يدويّاً منذ مدّة): إن حقّق الشريفُ في **مافيويّ**
// ثمّ قُتل في تلك الليلة نفسِها، خرج المافيويُّ الذي سأل عنه معه مباشرةً.
// موتُ الشريف ليلةَ إصابته دليلٌ لا يحتاج بيانَ سبب: المافيا قتلته لأنّه عرف.
//
// 🔴 والفريقُ الحقيقيّ لا الظاهر: الحرباية تُرجِع «مواطن» لتحقيق الشريف، ومع
//    ذلك تخرج معه — لأنّها مافيا فعلاً. والقاعدة تُقاس بما هو كائنٌ لا بما
//    رآه الشريف. (قرارُ المالك صراحةً.)
//
// 🔴 والمواطنُ والمستقلّ لا يخرجان: السفّاح يُرجِع «مواطن» أيضاً وهو محايد،
//    فلا يُقتل. القاعدة على المافيا وحدها.
//
// 🔴 وموضعٌ واحد يخدم المحرّكين (القديم والديناميكيّ): نسختان من قاعدةٍ كهذه
//    تفترقان عند أوّل تعديل، فيرى لاعبُ الليلة الآليّة سلوكاً ويرى لاعبُ
//    الليلة اليدويّة غيرَه — وهما في القاعة نفسها.
// ══════════════════════════════════════════════════════

import type { GameState, MorningEvent } from './state.js';
import { isMafiaRole } from './roles.js';

/** هل هذا الدورُ مافيا فعلاً؟ يُسأل تعريفُ القاعدة أوّلاً ثمّ الجدولُ الثابت. */
async function reallyMafia(roleId: string | null | undefined): Promise<boolean> {
  if (!roleId) return false;
  try {
    const { getRoleById } = await import('./definition-service.js');
    const def = await getRoleById(roleId);
    if (def?.team) return def.team === 'MAFIA';
  } catch { /* القاعدة غير متاحة — نسقط على الثابت */ }
  return isMafiaRole(roleId as any);
}

export interface SheriffRevengeArgs {
  /** الشريفُ المحقِّق — يُبحث عنه بلا شرط الحياة لأنّه قد يكون مات للتوّ. */
  sheriffPhysicalId: number | null | undefined;
  /** مَن سأل عنه في هذه الليلة. */
  investigatedPhysicalId: number | null | undefined;
}

/**
 * يُطبّق القاعدة إن تحقّقت شروطُها، ويُرجِع حدثَ الصباح أو null.
 *
 * ⚠️ يجب أن يُنادى **بعد استقرار وفيات الليل كلِّها** (المافيا والقنص والسفّاح)
 * و**قبل** فحص الشرطية وارتباط التوأمين — فالخارجُ بهذه القاعدة يجب أن يُحسب
 * في الاثنين: قد يكون هو الأخ الأكبر فينقلب أخوه، وقد يكون موتُه هو الوفاة
 * التي تُكمل عتبة الشرطية.
 */
export async function applySheriffRevenge(
  state: GameState,
  args: SheriffRevengeArgs,
): Promise<MorningEvent | null> {
  const { sheriffPhysicalId, investigatedPhysicalId } = args;
  if (sheriffPhysicalId == null || investigatedPhysicalId == null) return null;

  const sheriff = state.players.find(p => p.physicalId === sheriffPhysicalId);
  const target = state.players.find(p => p.physicalId === investigatedPhysicalId);
  if (!sheriff || !target) return null;

  // الشريفُ حيٌّ ⇒ لا ثأر. القاعدة معلَّقةٌ بموته في هذه الليلة.
  if (sheriff.isAlive !== false) return null;
  // الهدفُ ميّتٌ أصلاً (قنصه القنّاص مثلاً) ⇒ لا حدثَ مكرّراً ولا قتلَ مرّتين.
  if (target.isAlive === false) return null;

  if (!(await reallyMafia(target.role))) return null;

  target.isAlive = false;

  console.log(`🕵️ ثأرُ الشريف: ${sheriff.name} قُتل ليلةَ تحقيقه، فخرج ${target.name} (${target.role}) معه`);

  return {
    type: 'SHERIFF_REVENGE',
    targetPhysicalId: target.physicalId,
    targetName: target.name,
    performerPhysicalId: sheriff.physicalId,
    performerName: sheriff.name,
    revealed: false,
    extra: {
      targetRole: target.role,
      sheriffPhysicalId: sheriff.physicalId,
      sheriffName: sheriff.name,
      // 🦎 يُعلَّم كي يفهم الموجّهُ لِمَ خرج مَن ظهر «مواطناً» للشريف
      wasDeceptive: target.role === 'CHAMELEON',
    },
  };
}
