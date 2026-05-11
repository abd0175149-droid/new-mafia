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

  // فحص شروط فوز المحايدين (يُفحصون عند انتهاء اللعبة فقط)
  const neutralResults: NeutralResult[] = [];

  if (mainWinner) {
    for (const player of state.players) {
      const roleDef = allRoles.find(r => r.id === player.role);
      if (!roleDef || roleDef.team !== 'NEUTRAL') continue;

      const conditionType = roleDef.winConditionType || 'SURVIVE_UNTIL_END';
      let won = false;

      switch (conditionType) {
        case 'SURVIVE_UNTIL_END':
          won = player.isAlive;
          break;

        case 'ELIMINATE_TARGET':
          // يُحدد الهدف عند بداية اللعبة (يُخزن في حقل مخصص مستقبلاً)
          won = false; // سيُحدد لاحقاً عند تنفيذ آلية تعيين الهدف
          break;

        case 'BE_ELIMINATED':
          won = !player.isAlive; // يفوز إذا مات
          break;

        default:
          won = false;
      }

      neutralResults.push({
        physicalId: player.physicalId,
        playerName: player.name,
        roleId: roleDef.id,
        roleNameAr: roleDef.nameAr,
        won,
        conditionType,
      });
    }
  }

  return { mainWinner, neutralResults };
}
