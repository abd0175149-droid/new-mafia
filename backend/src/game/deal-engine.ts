// ══════════════════════════════════════════════════════
// 🤝 محرك الاتفاقيات (Deal Engine)
// المرجع: docs/03_DAY_PHASE_ENGINE.md - القسم 1
// ══════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { type GameState, getAlivePlayers, type Deal } from './state.js';
import { getGameState, setGameState } from '../config/redis.js';

/**
 * إنشاء اتفاقية جديدة
 * - لا يمكن استهداف نفس اللاعب في اتفاقيتين مختلفتين في جولة واحدة
 */
export async function createDeal(
  roomId: string,
  initiatorPhysicalId: number,
  targetPhysicalId: number
): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  // التحقق: كلاهما حي
  const alive = getAlivePlayers(state);
  const initiator = alive.find(p => p.physicalId === initiatorPhysicalId);
  const target = alive.find(p => p.physicalId === targetPhysicalId);

  if (!initiator) throw new Error(`Initiator #${initiatorPhysicalId} is not alive`);
  if (!target) throw new Error(`Target #${targetPhysicalId} is not alive`);

  // التحقق: المستهدف ليس مستهدفاً في اتفاقية أخرى
  const isAlreadyTargeted = state.votingState.deals.some(d => d.targetPhysicalId === targetPhysicalId);
  if (isAlreadyTargeted) {
    throw new Error(`Player #${targetPhysicalId} is already targeted in another deal`);
  }

  // إنشاء الاتفاقية المُجهزة
  const deal: Deal = {
    id: uuidv4().substring(0, 8),
    initiatorPhysicalId,
    targetPhysicalId,
  };

  state.votingState.deals.push(deal);

  await setGameState(roomId, state);
  return state;
}

/**
 * إلغاء اتفاقية
 */
export async function removeDeal(
  roomId: string,
  dealId: string
): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  // إزالة الاتفاقية من القائمة
  state.votingState.deals = state.votingState.deals.filter(d => d.id !== dealId);

  await setGameState(roomId, state);
  return state;
}

/**
 * الحصول على جميع الاتفاقيات النشطة
 */
export function getActiveDeals(state: GameState): Deal[] {
  return state.votingState.deals;
}
