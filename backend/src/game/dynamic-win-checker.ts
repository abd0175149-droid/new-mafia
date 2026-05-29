// ══════════════════════════════════════════════════════
// 🏆 فاحص الفوز الديناميكي — Dynamic Win Checker
// يدعم المحايدين + شروط الفوز المخصصة
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import { getAlivePlayers } from './state.js';
import { getRoleDefs, type RoleDef } from './definition-service.js';

export interface NeutralResult {
  physicalId: number;
  playerName: string;
  roleId: string;
  roleNameAr: string;
  won: boolean;
  conditionType: string;
  conditionDescription: string;
}

export interface DynamicWinResult {
  mainWinner: 'MAFIA' | 'CITIZEN' | null;  // null = اللعبة مستمرة
  neutralResults: NeutralResult[];
}

/**
 * يفحص شروط الفوز لكل الفرق (مافيا/مواطن/محايد)
 */
export async function checkWinConditionDynamic(state: GameState): Promise<DynamicWinResult> {
  const allRoles = await getRoleDefs();
  const alivePlayers = getAlivePlayers(state);

  // تصنيف الأحياء حسب الفريق
  let aliveMafia = 0;
  let aliveCitizens = 0;

  for (const player of alivePlayers) {
    const roleDef = allRoles.find(r => r.id === player.role);
    if (!roleDef) continue;

    if (roleDef.team === 'MAFIA') aliveMafia++;
    else if (roleDef.team === 'CITIZEN') aliveCitizens++;
    // المحايد لا يُحسب لأي فريق
  }

  // فحص فوز المافيا/المواطنين
  let mainWinner: 'MAFIA' | 'CITIZEN' | null = null;

  if (aliveMafia === 0) {
    mainWinner = 'CITIZEN';
  } else if (aliveMafia >= aliveCitizens) {
    mainWinner = 'MAFIA';
  }

  // فحص شروط فوز المحايدين (يُفحصون عند انتهاء اللعبة)
  const neutralResults: NeutralResult[] = [];

  if (mainWinner) {
    const results = evaluateNeutralWins(state, allRoles);
    neutralResults.push(...results);
  }

  return { mainWinner, neutralResults };
}

/**
 * يفحص فوز المحايدين — يُستدعى عند انتهاء اللعبة أو عند إقصاء لاعب محايد
 */
export function evaluateNeutralWins(state: GameState, allRoles: RoleDef[]): NeutralResult[] {
  const results: NeutralResult[] = [];

  for (const player of state.players) {
    const roleDef = allRoles.find(r => r.id === player.role);
    if (!roleDef || roleDef.team !== 'NEUTRAL') continue;

    const conditionType = roleDef.winConditionType || 'SURVIVE_UNTIL_END';
    let won = false;

    switch (conditionType) {
      // ── البقاء حتى النهاية ──
      case 'SURVIVE_UNTIL_END':
        won = player.isAlive;
        break;

      // ── الإقصاء بواسطة المدينة (المهرج) ──
      // يفوز إذا: تصويت نهاري / اتفاقية (ديل) / قنص
      case 'VOTED_OUT': {
        if (!player.isAlive) {
          const log = state.performanceTracking?.eliminationLog || [];
          const entry = log.find(e => e.physicalId === player.physicalId);
          // فوز: أي إقصاء من طرف المدينة (ليس من المافيا)
          const cityKillMethods = ['DAY_VOTE', 'DEAL', 'SNIPER'];
          won = entry ? cityKillMethods.includes(entry.eliminatedBy) : false;
        }
        break;
      }

      // ── يفوز إذا مات بأي طريقة ──
      case 'BE_ELIMINATED':
        won = !player.isAlive;
        break;

      // ── إقصاء هدف محدد ──
      case 'ELIMINATE_TARGET':
        // يُحدد الهدف عند بداية اللعبة (يُخزن في حقل مخصص مستقبلاً)
        won = false;
        break;

      // ── آخر لاعب حي ──
      case 'LAST_STANDING': {
        const totalAlive = state.players.filter(p => p.isAlive).length;
        won = player.isAlive && totalAlive === 1;
        break;
      }

      default:
        won = false;
    }

    results.push({
      physicalId: player.physicalId,
      playerName: player.name,
      roleId: roleDef.id,
      roleNameAr: roleDef.nameAr,
      won,
      conditionType,
      conditionDescription: roleDef.winConditionDescription || '',
    });
  }

  return results;
}

/**
 * فحص فوز محايد عند إقصائه — يُستدعى فوراً من vote-engine أو night-resolver
 * يرجع نتيجة فوز المحايد إن وُجد، أو null
 */
export async function checkNeutralVoteWin(
  state: GameState,
  eliminatedPhysicalId: number,
  eliminatedBy: string = 'DAY_VOTE',
): Promise<NeutralResult | null> {
  const allRoles = await getRoleDefs();
  const player = state.players.find(p => p.physicalId === eliminatedPhysicalId);
  if (!player) return null;

  const roleDef = allRoles.find(r => r.id === player.role);
  if (!roleDef || roleDef.team !== 'NEUTRAL') return null;

  const conditionType = roleDef.winConditionType || '';

  // شرط VOTED_OUT: المهرج يفوز فورياً عند إقصائه بواسطة المدينة
  if (conditionType === 'VOTED_OUT') {
    const cityKillMethods = ['DAY_VOTE', 'DEAL', 'SNIPER'];
    if (cityKillMethods.includes(eliminatedBy)) {
      return {
        physicalId: player.physicalId,
        playerName: player.name,
        roleId: roleDef.id,
        roleNameAr: roleDef.nameAr,
        won: true,
        conditionType,
        conditionDescription: roleDef.winConditionDescription || 'يفوز عند إقصائه بواسطة المدينة',
      };
    }
  }

  return null;
}
