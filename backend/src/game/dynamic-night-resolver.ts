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
import { checkPolicewomanTrigger } from './night-resolver.js';

// ── أنواع ────────────────────────────────────────────

export interface DynamicNightAction {
  abilityId: string;
  performerPhysicalId: number;
  targetPhysicalId: number | null;
  skipped: boolean;
}

export interface DynamicNightState {
  actions: Record<string, DynamicNightAction>;  // key = abilityId
  lastTargets: Record<string, number>;           // abilityId → آخر هدف
}

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

  // 🧙‍♀️ استثناء الأهداف السابقة للساحرة (لاعب مختلف كل مرة)
  if (abilityId === 'DISABLE_ABILITY') {
    const previousTargets = state.witchPreviousTargets || [];
    candidates = candidates.filter(p => !previousTargets.includes(p.physicalId));
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
  for (const action of actions) {
    const performer = state.players.find(p => p.physicalId === action.performerPhysicalId);
    if (performer?.disabledUntilRound != null && performer.disabledUntilRound >= (state.round || 1)) {
      cancelledActions.add(action.abilityId);
    }
  }

  // ═══ فحص قواعد التفاعل (تتجاهل الإجراءات المُلغاة مسبقاً، كحماية مُعطَّلة بالساحرة) ═══
  for (const rule of rules) {
    const actionA = actions.find(a => a.abilityId === rule.abilityA);
    const actionB = actions.find(a => a.abilityId === rule.abilityB);

    if (!actionA || !actionB) continue;
    // إن كان أحد الإجراءين مُلغى أصلاً (مثلاً PROTECT مُعطَّل) فالقاعدة لا تنطبق
    if (cancelledActions.has(actionA.abilityId) || cancelledActions.has(actionB.abilityId)) continue;

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
        cancelledActions.add(actionA.abilityId);
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
        cancelledActions.add(actionB.abilityId);
        break;
      case 'BOTH_CANCEL':
        cancelledActions.add(actionA.abilityId);
        cancelledActions.add(actionB.abilityId);
        break;
    }
  }

  // تطبيق التأثيرات للإجراءات غير الملغاة
  for (const action of actions) {
    if (cancelledActions.has(action.abilityId)) continue;

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
            a.abilityId === 'KILL' && a.targetPhysicalId === action.targetPhysicalId && !cancelledActions.has(a.abilityId)
          );
          const alsoKilledByMafia = !!mafiaKillAction;
          const sniperAction = actions.find(a => {
            if (cancelledActions.has(a.abilityId)) return false;
            if (a.targetPhysicalId !== action.targetPhysicalId) return false;
            const ab = allAbilities.find(x => x.id === a.abilityId);
            return ab?.effectType === 'CONDITIONAL_ELIMINATE'; // القنص
          });
          const alsoSniped = !!sniperAction;

          target.isAlive = false;

          // ✅ فحص إنجاز العقد — أولوية السفّاح: لا يُلغى الإنجاز عند مشاركة الهدف مع القناص/المافيا
          const { checkContractCompletion, completeContract, checkAssassinWin } = await import('./assassin-engine.js');
          const result = checkContractCompletion(state, target.physicalId, false);
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
          extra: { team: revealedTeam, performerPhysicalId: action.performerPhysicalId },
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

  // ═══ 👮‍♀️ فحص تفعيل الشرطية لكل من مات هذه الليلة (مطابق للمحرك القديم) ═══
  // (كان مفقوداً في المحرك الديناميكي — فلم تكن تُفعّل الشرطية عند قتلها ليلاً ولا تُحتسب
  //  وفيات المواطنين نحو عتبتها. هذا إصلاح لتطابق سلوك المحرك القديم.)
  const deadThisNight: number[] = [];
  for (const ev of events) {
    if (['ASSASSINATION', 'SNIPE_MAFIA', 'SNIPE_CITIZEN', 'ASSASSIN_KILL'].includes(ev.type)) {
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
