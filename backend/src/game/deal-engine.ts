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

  // ── قواعد جديدة للحد من الاتفاقيات ──
  
  // 4. الديل ممنوع في الجولة الأولى (يبدأ من الجولة الثانية)
  if (!state.round || state.round <= 1) {
    throw new Error('الاتفاقيات (Deals) ممنوعة في الجولة الأولى، وتبدأ من الجولة الثانية');
  }

  // 1. الحد الأقصى 3 اتفاقيات في الجولة
  if (state.votingState.deals.length >= 3) {
    throw new Error('تم الوصول للحد الأقصى للاتفاقيات في هذه الجولة (3 اتفاقيات كحد أقصى)');
  }

  // 2. القفل عبر الجولات (قرار المالك): لا تسجيل ديل في جولتين متتاليتين، ولا إعادة تسجيل بعد
  //    الحذف خلال نفس الجولة ولا التي تليها. المصدر dealRegisteredRound يُضبط عند الإنشاء ولا
  //    يُمسح عند الحذف؛ فالمنع عندما آخر جولة سجّل فيها اللاعب ديلاً ≥ (الجولة الحالية − 1).
  const reg = state.dealRegisteredRound?.[initiatorPhysicalId];
  if (reg != null && reg >= state.round - 1) {
    throw new Error(reg === state.round
      ? 'ما بتقدر تسجّل ديل جديد بعد ديل هالجولة (حتى لو حذفته)'
      : 'ما بتقدر تسجّل ديل في جولتين متتاليتين — استنّى الجولة الجاية');
  }

  // 3. التحقق: المستهدف ليس مستهدفاً في اتفاقية أخرى (القبول للأسرع)
  const isAlreadyTargeted = state.votingState.deals.some(d => d.targetPhysicalId === targetPhysicalId);
  if (isAlreadyTargeted) {
    throw new Error(`اللاعب #${targetPhysicalId} مستهدف بالفعل في اتفاقية أخرى`);
  }

  // إنشاء الاتفاقية المُجهزة
  const deal: Deal = {
    id: uuidv4().substring(0, 8),
    initiatorPhysicalId,
    targetPhysicalId,
  };

  state.votingState.deals.push(deal);
  // 🔒 سجّل جولة التسجيل — يبقى محفوظاً حتى لو حُذف الديل (لتطبيق القفل عبر الجولات)
  state.dealRegisteredRound = { ...(state.dealRegisteredRound || {}), [initiatorPhysicalId]: state.round };

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

/**
 * 🔒 اللاعبون الممنوعون من تسجيل ديل جديد هذه الجولة (physicalIds) — لعرض الواجهة.
 * = من سجّل ديلاً في هذه الجولة (حتى لو حذفه) أو في الجولة السابقة.
 */
export function dealLockedList(state: GameState): number[] {
  const R = state.round || 0;
  const reg = state.dealRegisteredRound || {};
  return Object.keys(reg).map(Number).filter((pid) => reg[pid] != null && reg[pid] >= R - 1);
}
