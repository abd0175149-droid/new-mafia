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
export async function buildNightQueue(state: GameState): Promise<{abilityId: string; performerPhysicalId: number; nameAr: string}[]> {
  const alivePlayers = state.players.filter(p => p.isAlive && p.role);
  const allAbilities = await getAbilityDefs();

  const queue: {abilityId: string; performerPhysicalId: number; priority: number; nameAr: string}[] = [];

  for (const player of alivePlayers) {
    const roleId = player.role as string;
    const abilities = await getAbilitiesForRole(roleId);

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

  // فحص قواعد التفاعل
  for (const rule of rules) {
    const actionA = actions.find(a => a.abilityId === rule.abilityA);
    const actionB = actions.find(a => a.abilityId === rule.abilityB);

    if (!actionA || !actionB) continue;

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
      case 'B_CANCELS_A':
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
          // ── منطق السفّاح ──
          // هل المافيا استهدفت نفس اللاعب؟
          const mafiaKillAction = actions.find(a =>
            a.abilityId === 'KILL' && a.targetPhysicalId === action.targetPhysicalId
          );
          const killedByMafiaToo = !!mafiaKillAction && !cancelledActions.has('KILL');

          if (killedByMafiaToo) {
            // نفس الهدف → الهدف يموت مرة واحدة لكن العقد لا يُحسب
            events.push({
              type: 'ASSASSIN_KILL' as any,
              targetPhysicalId: target.physicalId,
              targetName: target.name,
              extra: { contractFailed: true, reason: 'SAME_TARGET_AS_MAFIA' },
              revealed: false,
            });
            break; // الهدف ميت بالفعل من المافيا
          }

          target.isAlive = false;
          events.push({
            type: 'ASSASSIN_KILL' as any,
            targetPhysicalId: target.physicalId,
            targetName: target.name,
            revealed: false,
            extra: { targetRole: target.role },
          });

          // فحص إنجاز العقد
          const { checkContractCompletion, completeContract, checkAssassinWin } = await import('./assassin-engine.js');
          const result = checkContractCompletion(state, target.physicalId, false);
          if (result.completed) {
            completeContract(state, result.contractIndex, state.round || 1);
            if (checkAssassinWin(state)) {
              state.assassinState!.won = true;
            }
          }
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
        // خداع الحرباية
        let revealedTeam = targetRole?.team || 'CITIZEN';
        if (target.role === 'CHAMELEON') {
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
        // القنص — إذا أصاب مافيا يموت الهدف، وإلا يموت القناص معه
        const targetRole = await getRoleById(target.role as string);
        const sniper = state.players.find(p => p.physicalId === action.performerPhysicalId);

        if (targetRole?.team === 'MAFIA') {
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

  return events;
}

// ── إنشاء حالة ليل فارغة ────────────────────────────

export function createDynamicNightState(prevState?: DynamicNightState): DynamicNightState {
  return {
    actions: {},
    lastTargets: prevState?.lastTargets || {},
  };
}
