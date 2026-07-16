// ══════════════════════════════════════════════════════
// ⏱️ مؤقت اللعبة (Game Timer)
// يعمل بشكل مستمر من بدء اللعبة حتى GAME_OVER
// ══════════════════════════════════════════════════════

import type { Server } from 'socket.io';
import { getGameState, setGameState } from '../config/redis.js';
import { Phase } from './state.js';
import { decideTimeoutWinner } from './win-checker.js';

// ── Map لحفظ handles الـ setTimeout على مستوى السيرفر ──
const gameTimerHandles = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * يبدأ مؤقت اللعبة — setTimeout واحد بالمدة الكاملة
 * يُستدعى عند بدء اللعبة (اعتماد الأدوار)
 */
export function startGameTimer(io: Server, roomId: string, totalSeconds: number): void {
  // إلغاء أي تايمر سابق
  clearGameTimer(roomId);

  const handle = setTimeout(async () => {
    await expireGameByTimeout(io, roomId);
  }, totalSeconds * 1000);

  gameTimerHandles.set(roomId, handle);
  console.log(`⏱️ Game timer started for room ${roomId}: ${totalSeconds}s (${Math.round(totalSeconds / 60)} min)`);
}

/**
 * يُلغي مؤقت اللعبة — يُستدعى عند فوز طبيعي أو إعادة ضبط الغرفة
 */
export function clearGameTimer(roomId: string): void {
  const handle = gameTimerHandles.get(roomId);
  if (handle) {
    clearTimeout(handle);
    gameTimerHandles.delete(roomId);
    console.log(`⏱️ Game timer cleared for room ${roomId}`);
  }
}

/**
 * يحسب الثواني المتبقية
 */
export function getRemainingSeconds(gameTimer: { totalSeconds: number; startedAt: number; expired: boolean } | null): number {
  if (!gameTimer || gameTimer.expired) return 0;
  const elapsed = (Date.now() - gameTimer.startedAt) / 1000;
  return Math.max(0, gameTimer.totalSeconds - elapsed);
}

/**
 * يفحص هل انتهى الوقت (للاستخدام عند server restart)
 */
export function isGameTimerExpired(gameTimer: { totalSeconds: number; startedAt: number; expired: boolean } | null): boolean {
  if (!gameTimer) return false;
  if (gameTimer.expired) return true;
  const elapsed = (Date.now() - gameTimer.startedAt) / 1000;
  return elapsed >= gameTimer.totalSeconds;
}

/**
 * يُنهي اللعبة بسبب انتهاء الوقت — فوز المافيا
 */
async function expireGameByTimeout(io: Server, roomId: string): Promise<void> {
  try {
    const state = await getGameState(roomId);
    if (!state || state.phase === Phase.GAME_OVER || state.phase === Phase.LOBBY) {
      gameTimerHandles.delete(roomId);
      return;
    }

    // 🏁 قرار الفائز عند انتهاء الوقت — لا يُعلَن فوز المافيا إن لم يبقَ أي مافيا حيّ
    const winner = decideTimeoutWinner(state);

    console.log(`⏰ Game timer EXPIRED for room ${roomId} — winner: ${winner}`);

    // تحديث الحالة
    if (state.gameTimer) {
      state.gameTimer.expired = true;
    }
    state.winner = winner;
    state.phase = Phase.GAME_OVER;
    await setGameState(roomId, state);

    // إبلاغ الجميع
    io.to(roomId).emit('game:timer-expired', { winner });
    io.to(roomId).emit('game:over', {
      winner,
      matchId: state.matchId,
      players: state.players,
      reason: 'TIMEOUT',
    });

    // حفظ نتيجة المباراة
    try {
      const { finalizeMatch } = await import('../services/match.service.js');
      await finalizeMatch(state);
    } catch (err) {
      console.error('⏱️ Failed to finalize match after timeout:', err);
    }

    gameTimerHandles.delete(roomId);
  } catch (err) {
    console.error(`⏱️ Error expiring game timer for room ${roomId}:`, err);
    gameTimerHandles.delete(roomId);
  }
}

/**
 * يُستدعى عند إعادة تشغيل السيرفر — يعيد تشغيل المؤقتات للألعاب النشطة
 */
export function restoreGameTimer(io: Server, roomId: string, gameTimer: { totalSeconds: number; startedAt: number; expired: boolean }): void {
  // getRemainingSeconds يُرجع 0 إذا expired=true أو مضى الوقت — فيغطّي الحالتين:
  // (أ) مؤقّت انتهى وقته أثناء توقّف السيرفر، (ب) مؤقّت expired=true لكن لم تُنهَ اللعبة
  // (إنهاء مُقاطَع أثناء إعادة التشغيل — الحالة التي كانت تُترك عالقة سابقاً).
  // expireGameByTimeout يحرس GAME_OVER/LOBBY فلا يُنهي لعبةً منتهية فعلاً مرّتين.
  const remaining = getRemainingSeconds(gameTimer);
  if (remaining <= 0) {
    console.log(`⏱️ Game timer for room ${roomId} already elapsed on boot → finalizing now`);
    void expireGameByTimeout(io, roomId);
    return;
  }

  // إعادة تشغيل setTimeout بالمدة المتبقية
  clearGameTimer(roomId);
  const handle = setTimeout(async () => {
    await expireGameByTimeout(io, roomId);
  }, remaining * 1000);
  gameTimerHandles.set(roomId, handle);
  console.log(`⏱️ Game timer restored for room ${roomId}: ${Math.round(remaining)}s remaining`);
}

/**
 * يعدّل مدة اللعبة أثناء اللعب — يضيف أو يخصم دقائق
 * يعيد ضبط setTimeout بالمدة الجديدة
 * إذا المتبقي ≤ 0 → انتهاء فوري (فوز مافيا)
 */
export async function adjustGameTimer(
  io: Server,
  roomId: string,
  deltaMinutes: number
): Promise<{ success: boolean; newRemaining: number; error?: string }> {
  const state = await getGameState(roomId);
  if (!state) return { success: false, newRemaining: 0, error: 'Room not found' };
  if (!state.gameTimer || state.gameTimer.expired) {
    return { success: false, newRemaining: 0, error: 'No active game timer' };
  }

  // حساب المتبقي الفعلي
  const currentRemaining = getRemainingSeconds(state.gameTimer);
  const deltaSeconds = deltaMinutes * 60;
  const newRemaining = Math.max(0, currentRemaining + deltaSeconds);

  // تحديث بيانات المؤقت — إعادة ضبط نقطة الأصل
  state.gameTimer.totalSeconds = newRemaining;
  state.gameTimer.startedAt = Date.now();
  await setGameState(roomId, state);

  // إلغاء setTimeout القديم
  clearGameTimer(roomId);

  if (newRemaining <= 0) {
    // الوقت انتهى فوراً
    await expireGameByTimeout(io, roomId);
    return { success: true, newRemaining: 0 };
  }

  // إنشاء setTimeout جديد بالمدة المتبقية الجديدة
  const handle = setTimeout(async () => {
    await expireGameByTimeout(io, roomId);
  }, newRemaining * 1000);
  gameTimerHandles.set(roomId, handle);

  // بث التحديث لجميع العملاء
  io.to(roomId).emit('game:timer-adjusted', {
    gameTimer: state.gameTimer,
    deltaMinutes,
    newRemainingSeconds: newRemaining,
  });

  console.log(`⏱️ Game timer adjusted for room ${roomId}: ${deltaMinutes > 0 ? '+' : ''}${deltaMinutes} min → ${Math.round(newRemaining)}s remaining`);
  return { success: true, newRemaining };
}
