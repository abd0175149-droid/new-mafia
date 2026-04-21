// ══════════════════════════════════════════════════════
// 🏆 فاحص شروط الفوز (Win Condition Checker)
// المرجع: docs/01_GAME_RULES_AND_ROLES.md - القسم 1
// ══════════════════════════════════════════════════════

import { type GameState, getAlivePlayers } from './state.js';
import { isMafiaRole } from './roles.js';

export enum WinResult {
  MAFIA_WIN = 'MAFIA',
  CITIZEN_WIN = 'CITIZEN',
  GAME_CONTINUES = 'CONTINUE',
}

/**
 * يُفحص بعد كل عملية إقصاء أو وفاة (ليلية أو نهارية)
 * 
 * - فوز المافيا: إذا كان (عدد المافيا الأحياء >= عدد المواطنين الأحياء)
 * - فوز المواطنين: إذا كان (عدد المافيا الأحياء == 0)
 */
export function checkWinCondition(state: GameState): WinResult {
  const alivePlayers = getAlivePlayers(state);

  const aliveMafia = alivePlayers.filter(p => p.role && isMafiaRole(p.role)).length;
  const aliveCitizens = alivePlayers.filter(p => p.role && !isMafiaRole(p.role)).length;

  // فوز المواطنين: كل المافيا ماتوا
  if (aliveMafia === 0) {
    return WinResult.CITIZEN_WIN;
  }

  // فوز المافيا: المافيا الأحياء >= المواطنين الأحياء
  if (aliveMafia >= aliveCitizens) {
    return WinResult.MAFIA_WIN;
  }

  return WinResult.GAME_CONTINUES;
}

/**
 * يُرجع ملخص الأعداد الحالية (للعرض على الشاشة)
 */
export function getTeamCounts(state: GameState): { aliveMafia: number; aliveCitizens: number; totalAlive: number } {
  const alivePlayers = getAlivePlayers(state);

  const aliveMafia = alivePlayers.filter(p => p.role && isMafiaRole(p.role)).length;
  const aliveCitizens = alivePlayers.filter(p => p.role && !isMafiaRole(p.role)).length;

  return {
    aliveMafia,
    aliveCitizens,
    totalAlive: alivePlayers.length,
  };
}
