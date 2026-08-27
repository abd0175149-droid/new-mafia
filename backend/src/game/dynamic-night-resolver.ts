// ══════════════════════════════════════════════════════
// 🌙 المحرك الديناميكي لتسوية الليل — Dynamic Night Resolver
// يقرأ قواعد التفاعل من DB ويطبقها بدلاً من if/else
// ══════════════════════════════════════════════════════

import type { GameState, MorningEvent, Player } from './state.js';
import {
  getAbilityDefs,
  getInteractionRuleDefs,
  getAbilitiesForRole,
  getRoleById,
  type AbilityDef,
  type InteractionRuleDef,
} from './definition-service.js';
import { isNeutralRole, Role } from './roles.js';
import { processTwinBond, applySuicide, applyTransform, detectTwinDeaths } from './twin-engine.js';
import { applySheriffRevenge } from './sheriff-revenge.js';
import { applyPhoenix, isPhoenixDisabled, BURNING_ABILITIES, PHOENIX_SUPERSEDED, type PhoenixAttempt } from './phoenix-engine.js';
import { checkPolicewomanTrigger } from './night-resolver.js';

// ── أنواع ────────────────────────────────────────────

export interface DynamicNightAction {
  abilityId: string;
  performerPhysicalId: number;
  targetPhysicalId: number | null;
  skipped: boolean;
}

export interface DynamicNightState {
  /**
   * مفتاحُ الإجراء: `مقعد الفاعل:معرّف القدرة`.
   *
   * 🔴 كان معرّفَ القدرة وحده — فلاعبان يحملان القدرةَ نفسَها يمحو ثانيهما أوّلَهما
   *    بصمت (الشيخُ والأخُ الأكبر كلاهما يحمل KILL في تعريف دوره). والقراءةُ هنا
   *    `Object.values` فلا يتأثّر المحرّك بشكل المفتاح — يتأثّر مَن يكتب فقط.
   */
  actions: Record<string, DynamicNightAction>;   // key = `${seat}:${abilityId}`
  lastTargets: Record<string, number>;            // abilityId → آخر هدف
}

/** مفتاحُ الإجراء المركّب — يُستعمل في الكتابة وفي الإلغاء معاً. */
export const actionKey = (a: { performerPhysicalId: number; abilityId: string }) =>
  `${a.performerPhysicalId}:${a.abilityId}`;

// ── بناء طابور الليل ─────────────────────────────────

/**
 * يبني قائمة القدرات النشطة لهذا الليل
 * يقرأ من الأدوار الحية في اللعبة الحالية
 */
export async function buildNightQueue(state: GameState): Promise<{abilityId: string; performerPhysicalId: number; nameAr: string; isDisabled?: boolean; disabledRoleName?: string}[]> {
  const alivePlayers = state.players.filter(p => p.isAlive && p.role);
  const allAbilities = await getAbilityDefs();

  const queue: {abilityId: string; performerPhysicalId: number; priority: number; nameAr: string; isDisabled?: boolean; disabledRoleName?: string}[] = [];

  for (const player of alivePlayers) {
    const roleId = player.role as string;
    const abilities = await getAbilitiesForRole(roleId);

    // 🧙‍♀️ فحص التعطيل
    const isPlayerDisabled = player.disabledUntilRound != null && player.disabledUntilRound >= (state.round || 1);

    for (const ability of abilities) {
      if (ability.phase === 'NIGHT' || ability.phase === 'BOTH') {
        // معالجة خاصة: الممرضة تُفعّل فقط بعد موت الطبيب
        if (roleId === 'NURSE' && ability.id === 'PROTECT') {
          if (!state.nurseActivated) continue;
        }

        // 🔪 السفّاح: ممنوع القتل أول ليلة
        if (roleId === 'ASSASSIN' && ability.id === 'ASSASSINATE') {
          if (!state.assassinState?.firstNightPassed) continue;
          if (state.assassinState?.won) continue; // أكمل العقود
        }

        queue.push({
          abilityId: ability.id,
          performerPhysicalId: player.physicalId,
          priority: ability.priority,
          nameAr: ability.nameAr,
          isDisabled: isPlayerDisabled || undefined,
          disabledRoleName: isPlayerDisabled ? (player.disabledRoleName || roleId) : undefined,
        });
      }
    }
  }

  // ترتيب حسب الأولوية
  queue.sort((a, b) => a.priority - b.priority);

  return queue.map(q => ({
    abilityId: q.abilityId,
    performerPhysicalId: q.performerPhysicalId,
    nameAr: q.nameAr,
    isDisabled: q.isDisabled,
    disabledRoleName: q.disabledRoleName,
  }));
}

// ── حساب الأهداف المتاحة ────────────────────────────

export async function getAvailableTargets(
  state: GameState,
  abilityId: string,
  performerPhysicalId: number,
  dynamicNight: DynamicNightState,
): Promise<Player[]> {
  const allAbilities = await getAbilityDefs();
  const ability = allAbilities.find(a => a.id === abilityId);
  if (!ability) return [];

  const performer = state.players.find(p => p.physicalId === performerPhysicalId);
  if (!performer) return [];

  const performerRole = await getRoleById(performer.role as string);
  const isMafia = performerRole?.team === 'MAFIA';

  // بناء قائمة أدوار كل فريق ديناميكياً من DB
  const { getRoleDefs } = await import('./definition-service.js');
  const allRoles = await getRoleDefs();
  const mafiaRoleIds = new Set(allRoles.filter(r => r.team === 'MAFIA').map(r => r.id));

  let candidates = state.players.filter(p => p.isAlive);

  // استثناء النفس
  if (ability.excludeSelf) {
    candidates = candidates.filter(p => p.physicalId !== performerPhysicalId);
  }

  // تصفية حسب نوع الهدف
  switch (ability.targetType) {
    case 'ENEMY':
      candidates = candidates.filter(p => {
        const role = p.role as string;
        if (isMafia) return !mafiaRoleIds.has(role);
        return mafiaRoleIds.has(role);
      });
      break;
    case 'ALLY':
      candidates = candidates.filter(p => {
        const role = p.role as string;
        if (isMafia) return mafiaRoleIds.has(role);
        return !mafiaRoleIds.has(role);
      });
      break;
    case 'ANY':
      // كل الأحياء (بعد استثناء النفس)
      break;
    case 'SELF':
      candidates = [performer];
      break;
    case 'NONE':
      return [];
  }

  // استثناء آخر هدف (قيد الطبيب)
  if (ability.excludeLastTarget) {
    const lastTarget = dynamicNight.lastTargets[abilityId];
    if (lastTarget !== undefined) {
      candidates = candidates.filter(p => p.physicalId !== lastTarget);
    }
  }

  // 🧙‍♀️ قيودُ الساحرة — لاعبٌ مختلفٌ كلَّ مرّة، والشرطيّةُ محرّمة
  if (abilityId === 'DISABLE_ABILITY') {
    const previousTargets = state.witchPreviousTargets || [];
    candidates = candidates.filter(p => !previousTargets.includes(p.physicalId));
    // 🔴 الشرطيّةُ كانت مُسقَطةً في المحرّك القديم وحده، فالطاولةُ الواحدة تسمح
    //    بتعطيلها في وضعِ ليلٍ وتمنعه في آخر. القيدُ واحدٌ الآن في المحرّكين.
    candidates = candidates.filter(p => p.role !== Role.POLICEWOMAN);
  }

  return candidates;
}

// ── تسوية الليل ──────────────────────────────────────

export async function resolveNightDynamic(
  state: GameState,
  dynamicNight: DynamicNightState,
): Promise<MorningEvent[]> {
  const events: MorningEvent[] = [];
  const actions = Object.values(dynamicNight.actions).filter(a => !a.skipped && a.targetPhysicalId !== null);
  const allAbilities = await getAbilityDefs();
  const rules = await getInteractionRuleDefs();

  // ترتيب حسب أولوية القدرة
  actions.sort((a, b) => {
    const aPrio = allAbilities.find(ab => ab.id === a.abilityId)?.priority ?? 99;
    const bPrio = allAbilities.find(ab => ab.id === b.abilityId)?.priority ?? 99;
    return aPrio - bPrio;
  });

  // تتبع الإجراءات الملغاة
  const cancelledActions = new Set<string>();

  // ═══ 🧙‍♀️ معالجة التعطيل أولاً (قبل قواعد التفاعل) ═══
  // يجب تعطيل اللاعب وإلغاء إجراؤه قبل تقييم قواعد التفاعل — وإلا قد تُلغي حمايةٌ
  // مُعطَّلة اغتيالاً صحيحاً (مثال: الساحرة تُعطّل الطبيب، لكن قاعدة KILL+PROTECT كانت
  // تُلغي الاغتيال قبل أن يُلغى PROTECT المُعطَّل → كان التعطيل بلا أثر).
  for (const action of actions) {
    const ability = allAbilities.find(a => a.id === action.abilityId);
    if ((ability?.effectType as string) !== 'DISABLE') continue;

    const target = state.players.find(p => p.physicalId === action.targetPhysicalId);
    if (!target) continue;

    const disableRounds = state.config.witchDisableRounds || 3;
    target.disabledUntilRound = (state.round || 1) + disableRounds - 1;
    target.disabledRoleName = target.role || 'UNKNOWN';

    // تسجيل الهدف لمنع التكرار
    if (!state.witchPreviousTargets) state.witchPreviousTargets = [];
    if (!state.witchPreviousTargets.includes(target.physicalId)) {
      state.witchPreviousTargets.push(target.physicalId);
    }

    events.push({
      type: 'ABILITY_DISABLED' as any,
      targetPhysicalId: target.physicalId,
      targetName: target.name,
      extra: {
        disabledRole: target.role,
        disabledUntilRound: target.disabledUntilRound,
      },
      revealed: false,
    });
    console.log(`🧙‍♀️ Witch disabled ${target.name} (${target.role}) until round ${target.disabledUntilRound}`);
  }

  // ═══ إلغاء إجراءات اللاعبين المعطّلين (قبل قواعد التفاعل) ═══
  // 🔴 يُلغى فعلُ المعطَّل هو، لا كلُّ فعلٍ من نوع قدرته: مقعدٌ آخر يحمل القدرةَ
  //    نفسَها ولم يُعطَّل يبقى فعلُه قائماً.
  for (const action of actions) {
    const performer = state.players.find(p => p.physicalId === action.performerPhysicalId);
    if (performer?.disabledUntilRound != null && performer.disabledUntilRound >= (state.round || 1)) {
      cancelledActions.add(actionKey(action));
    }
  }

  // ═══ فحص قواعد التفاعل (تتجاهل الإجراءات المُلغاة مسبقاً، كحماية مُعطَّلة بالساحرة) ═══
  // 🔴 كلُّ زوجٍ مطابقٍ لا أوّلُ زوجٍ: كانت `find` تأخذ أوّل إجراءٍ بكلّ قدرة، فلو
  //    حمى طبيبان هدفين مختلفين لَفُحص أحدُهما وأُهمل الآخر.
  for (const rule of rules) {
    const listA = actions.filter(a => a.abilityId === rule.abilityA);
    const listB = actions.filter(a => a.abilityId === rule.abilityB);

    for (const actionA of listA) {
      for (const actionB of listB) {
        if (actionA === actionB) continue;
        // إن كان أحد الإجراءين مُلغى أصلاً (مثلاً PROTECT مُعطَّل) فالقاعدة لا تنطبق
        if (cancelledActions.has(actionKey(actionA)) || cancelledActions.has(actionKey(actionB))) continue;

        let applies = false;
        switch (rule.condition) {
          case 'SAME_TARGET':
            applies = actionA.targetPhysicalId === actionB.targetPhysicalId;
            break;
          case 'ALWAYS':
            applies = true;
            break;
        }

        if (!applies) continue;

        switch (rule.resolution) {
          case 'B_CANCELS_A': {
            cancelledActions.add(actionKey(actionA));
            const targetA = state.players.find(p => p.physicalId === actionA.targetPhysicalId);
            if (targetA) {
              events.push({
                type: rule.resultEvent as any,
                targetPhysicalId: targetA.physicalId,
                targetName: targetA.name,
                revealed: false,
              });
            }
            break;
          }
          case 'A_CANCELS_B':
            cancelledActions.add(actionKey(actionB));
            break;
          case 'BOTH_CANCEL':
            cancelledActions.add(actionKey(actionA));
            cancelledActions.add(actionKey(actionB));
            break;
        }
      }
    }
  }

  // 🔥 مقعدُ العنقاء ومحاولاتُ إخراجه — تُجمع أثناء الحلقة ويُحكم فيها بعدها
  const phoenixSeatNow = state.phoenixState?.seat ?? null;
  const phoenixLive = phoenixSeatNow != null
    && state.players.find(p => p.physicalId === phoenixSeatNow)?.isAlive !== false
    && !isPhoenixDisabled(state);
  const phoenixAttempts: PhoenixAttempt[] = [];

  // تطبيق التأثيرات للإجراءات غير الملغاة
  for (const action of actions) {
    if (cancelledActions.has(actionKey(action))) continue;
    // 🔥 تسجيلُ المحاولة قبل تنفيذها — الحكمُ يجري بعد استقرار الوفيات كلِّها
    if (phoenixLive && action.targetPhysicalId === phoenixSeatNow && BURNING_ABILITIES.has(action.abilityId)) {
      phoenixAttempts.push({ performerSeat: action.performerPhysicalId, abilityId: action.abilityId });
    }

    const ability = allAbilities.find(a => a.id === action.abilityId);
    if (!ability) continue;

    const target = state.players.find(p => p.physicalId === action.targetPhysicalId);
    if (!target) continue;

    switch (ability.effectType) {
      case 'ELIMINATE': {
        // 🔪 فحص: هل المنفذ هو السفّاح؟
        const performer = state.players.find(p => p.physicalId === action.performerPhysicalId);
        const isAssassinAction = performer?.role === 'ASSASSIN';

        if (isAssassinAction && state.assassinState) {
          // ── منطق السفّاح (أولوية: يُحتسب العقد حتى لو استهدف القناص و/أو المافيا نفس اللاعب) ──
          const mafiaKillAction = actions.find(a =>
            a.abilityId === 'KILL' && a.targetPhysicalId === action.targetPhysicalId && !cancelledActions.has(actionKey(a))
          );
          const alsoKilledByMafia = !!mafiaKillAction;
          const sniperAction = actions.find(a => {
            if (cancelledActions.has(actionKey(a))) return false;
            if (a.targetPhysicalId !== action.targetPhysicalId) return false;
            const ab = allAbilities.find(x => x.id === a.abilityId);
            return ab?.effectType === 'CONDITIONAL_ELIMINATE'; // القنص
          });
          const alsoSniped = !!sniperAction;

          target.isAlive = false;

          // 🔥 هدفٌ سيُبعَث ⇒ لا عقدَ يُحتسب: العقدُ مشروطٌ بخروج الهدف، والعنقاءُ لا يخرج.
          //    والسفّاحُ يحترق في المرحلة ٤٫٥ فيخسر فوراً.
          const willRebirth = phoenixLive && target.physicalId === phoenixSeatNow
            && (state.phoenixState?.rebirthsLeft ?? 0) > 0;

          // ✅ فحص إنجاز العقد — أولوية السفّاح: لا يُلغى الإنجاز عند مشاركة الهدف مع القناص/المافيا
          const { checkContractCompletion, completeContract, checkAssassinWin } = await import('./assassin-engine.js');
          const result = willRebirth
            ? { completed: false, contractId: -1, contractIndex: -1 }
            : checkContractCompletion(state, target.physicalId, false);
          let assassinWon = false;
          if (result.completed) {
            completeContract(state, result.contractIndex, state.round || 1);
            if (checkAssassinWin(state)) { state.assassinState!.won = true; assassinWon = true; }
          }

          events.push({
            type: 'ASSASSIN_KILL' as any,
            targetPhysicalId: target.physicalId,
            targetName: target.name,
            performerPhysicalId: action.performerPhysicalId,
            performerName: performer?.name,
            revealed: false,
            extra: {
              targetRole: target.role,
              contractCompleted: result.completed,
              contractId: result.completed ? result.contractId : undefined,
              assassinWon,
              alsoKilledByMafia,
              alsoSniped,
              sharedTarget: alsoKilledByMafia || alsoSniped,
            },
          });
          break;
        }

        // ── المنطق العادي (مافيا) ──
        target.isAlive = false;
        events.push({
          type: (ability.effectOnSuccess || 'ASSASSINATION') as any,
          targetPhysicalId: target.physicalId,
          targetName: target.name,
          revealed: false,
          extra: { targetRole: target.role },
        });
        break;
      }

      case 'SILENCE':
        target.isSilenced = true;
        events.push({
          type: 'SILENCED',
          targetPhysicalId: target.physicalId,
          targetName: target.name,
          revealed: false,
        });
        break;

      case 'REVEAL_TEAM': {
        const targetRole = await getRoleById(target.role as string);
        // خداع الحرباية (إلا إذا معطّلة بالساحرة)
        let revealedTeam = targetRole?.team || 'CITIZEN';
        const isChameleonDisabled = target.disabledUntilRound != null && target.disabledUntilRound >= (state.round || 1);
        if (target.role === 'CHAMELEON' && !isChameleonDisabled) {
          revealedTeam = 'CITIZEN'; // يظهر كمواطن
        }
        // 🔪 خداع السفّاح — يظهر كمواطن
        if (target.role === 'ASSASSIN') {
          revealedTeam = 'CITIZEN';
        }

        events.push({
          type: 'SHERIFF_RESULT',
          targetPhysicalId: target.physicalId,
          targetName: target.name,
          // 🔴 المفتاحان معاً — و`result` هو الذي تقرؤه الواجهات كلُّها (الموجّه
          //    والمضيف وفلاتر). كان هذا المحرّك يكتب `team` وحده والمحرّك القديم
          //    يكتب `result` وحده، فكلُّ تحقيقٍ يمرّ من هنا كان يُعرَض **«مواطن»**
          //    مهما كان الهدف: القارئ يجد `undefined` ويقع على فرع المواطن.
          //    عطلٌ صامتٌ تماماً — لا خطأ ولا سجلّ، ونتيجةٌ معكوسةٌ في يد الشريف.
          extra: { result: revealedTeam, team: revealedTeam, performerPhysicalId: action.performerPhysicalId },
          revealed: false,
        });
        break;
      }

      case 'CONDITIONAL_ELIMINATE': {
        // القنص — إذا أصاب مافيا أو محايد يموت الهدف، وإلا يموت القناص معه
        const targetRole = await getRoleById(target.role as string);
        const sniper = state.players.find(p => p.physicalId === action.performerPhysicalId);

        if (targetRole?.team === 'MAFIA' || targetRole?.team === 'NEUTRAL' || (target.role && isNeutralRole(target.role as string))) {
          target.isAlive = false;
          events.push({
            type: 'SNIPE_MAFIA',
            targetPhysicalId: target.physicalId,
            targetName: target.name,
            revealed: false,
          });
        } else if (phoenixLive && target.physicalId === phoenixSeatNow) {
          // 🔥 العنقاء: يُخرَج مبدئيّاً ويُردّ في المرحلة ٤٫٥ إن كان له رصيد.
          //    ولا يُطبَّق ارتدادُ «إصابة مواطنٍ صالح» فوقه — القنّاصُ يحترق بالبعث
          //    والإخراجُ واحدٌ لا اثنان. ولا حدثَ قنصٍ يُنشَر: الحدثُ حدثُ احتراق.
          target.isAlive = false;
        } else {
          target.isAlive = false;
          if (sniper) sniper.isAlive = false;
          events.push({
            type: 'SNIPE_CITIZEN',
            targetPhysicalId: target.physicalId,
            targetName: target.name,
            extra: { sniperPhysicalId: action.performerPhysicalId, sniperName: sniper?.name },
            revealed: false,
          });
        }
        break;
      }

      case 'BLOCK_ELIMINATE':
        // الحماية — لا تأثير مباشر، التأثير يأتي من قواعد التفاعل
        break;
    }

    // تحديث آخر هدف
    dynamicNight.lastTargets[action.abilityId] = action.targetPhysicalId!;
  }

  // ═══ 🔥 العنقاء — المرحلة ٤٫٥ ═══
  // 🔴 بعد استقرار وفيات الليل كلِّها وقبل الشرطيّة والتوأمين: الحكمُ داخل حلقة
  //    الآثار كان سيُحرق أوّلَ مُنفّذٍ وحده وينجو الباقيان لأنّ الهدفَ صار ميّتاً.
  //    والمحترقُ يجب أن يُحسب في عتبة الشرطيّة ورابط الأخوين.
  if (phoenixAttempts.length > 0) {
    const out = applyPhoenix(state, phoenixAttempts);
    // 🔴 مَن نجا لا يُعلَن مقتولاً: أحداثُ الإخراج التي وقعت عليه تُحذف ويحلّ
    //    محلَّها حدثُ النهوض. تركُها كان يجعل ملخّصَ الصباح يعلن «اغتيالاً
    //    ناجحاً» على مقعدٍ يقف حيّاً أمام الطاولة — والموجّه يكشفه بيده.
    if (out.survived) {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.targetPhysicalId === phoenixSeatNow && PHOENIX_SUPERSEDED.has(e.type)) {
          events.splice(i, 1);
        }
      }
    }
    events.push(...out.events);
  }

  // ═══ 🕵️ ثأرُ الشريف — مَن سأل عنه يموت معه ═══
  // 🔴 هنا لا في حلقة التأثيرات: القاعدة معلَّقةٌ بموت الشريف، وموتُه قد يقع
  //    بأيّ قدرةٍ لاحقة في الترتيب (اغتيالٌ أو قنصٌ أو سفّاح). الحكمُ قبل
  //    استقرار الوفيات كلِّها حكمٌ على حالةٍ عابرة.
  // 🔴 وقبل الشرطية والتوأمين عمداً: الخارجُ بهذه القاعدة قد يكون الأخَ الأكبر
  //    فينقلب أخوه، وقد تكون وفاتُه هي التي تُكمل عتبة الشرطية.
  for (const ev of [...events]) {
    if (ev.type !== 'SHERIFF_RESULT') continue;
    const revenge = await applySheriffRevenge(state, {
      sheriffPhysicalId: (ev.extra?.performerPhysicalId as number) ?? ev.performerPhysicalId,
      investigatedPhysicalId: ev.targetPhysicalId,
    });
    if (revenge) events.push(revenge);
  }

  // ═══ 👮‍♀️ فحص تفعيل الشرطية لكل من مات هذه الليلة (مطابق للمحرك القديم) ═══
  // (كان مفقوداً في المحرك الديناميكي — فلم تكن تُفعّل الشرطية عند قتلها ليلاً ولا تُحتسب
  //  وفيات المواطنين نحو عتبتها. هذا إصلاح لتطابق سلوك المحرك القديم.)
  const deadThisNight: number[] = [];
  for (const ev of events) {
    if (['ASSASSINATION', 'SNIPE_MAFIA', 'SNIPE_CITIZEN', 'ASSASSIN_KILL', 'SHERIFF_REVENGE', 'PHOENIX_BURN'].includes(ev.type)) {
      // إزالة التكرار: قد يظهر نفس اللاعب في حدثين (اغتيال المافيا + اغتيال السفّاح على نفس الهدف)
      if (!deadThisNight.includes(ev.targetPhysicalId)) deadThisNight.push(ev.targetPhysicalId);
      if (ev.type === 'SNIPE_CITIZEN' && ev.extra?.sniperPhysicalId) {
        const sid = ev.extra.sniperPhysicalId as number;
        if (!deadThisNight.includes(sid)) deadThisNight.push(sid);
      }
    }
  }
  // الشرطية أولاً كي تُفعّل صلاحيتها وتُحسب وفيات نفس الليلة
  deadThisNight.sort((a, b) => {
    const ra = state.players.find(p => p.physicalId === a)?.role;
    const rb = state.players.find(p => p.physicalId === b)?.role;
    if (ra === Role.POLICEWOMAN) return -1;
    if (rb === Role.POLICEWOMAN) return 1;
    return 0;
  });
  for (const pid of deadThisNight) checkPolicewomanTrigger(state, pid);

  // ═══ 👥 معالجة ارتباط التوأمين (قبل الإرجاع) ═══
  if (state.twinState) {
    // كشف موت الأخوين بالحالة الفعلية (isAlive) لا بنوع الحدث — مستقل عن effect_on_success
    const nightDeaths = detectTwinDeaths(state);

    for (const deadId of nightDeaths) {
      const twinResult = processTwinBond(state, deadId, 'NIGHT_DYNAMIC');
      if (twinResult.triggered) {
        if (twinResult.type === 'SUICIDE') {
          const suicideEvent = applySuicide(state, twinResult);
          if (suicideEvent) {
            events.push(suicideEvent);
            checkPolicewomanTrigger(state, twinResult.suicidePhysicalId!);
          }
        } else if (twinResult.type === 'TRANSFORM') {
          const transformEvent = applyTransform(state, twinResult);
          if (transformEvent) events.push(transformEvent);
        }
        break;
      }
    }
  }

  return events;
}

// ── إنشاء حالة ليل فارغة ────────────────────────────

export function createDynamicNightState(prevState?: DynamicNightState): DynamicNightState {
  return {
    actions: {},
    lastTargets: prevState?.lastTargets || {},
  };
}
