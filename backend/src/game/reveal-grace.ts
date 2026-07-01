// ══════════════════════════════════════════════════════
// ⏳ مهلة كشف الأدوار (Reveal Grace)
// إذا حُسم فائز بالتصويت/الديل ودخلت اللعبة مرحلة DAY_ELIMINATION (بانتظار «كشف الأدوار»)
// ولم يُنهِ الليدر اللعبة خلال 3 دقائق → تُنهى تلقائياً بالفائز المحسوم + إشعار للاعبين.
// هذا يمنع بقاء اللعبة عالقة حتى انتهاء مؤقّت الساعة (والذي كان يُعلن المافيا خطأً).
// ══════════════════════════════════════════════════════

import type { Server } from 'socket.io';
import { getGameState, setGameState } from '../config/redis.js';
import { Phase, setPhase } from './state.js';
import { WinResult } from './win-checker.js';
import { clearGameTimer } from './game-timer.js';

const GRACE_MS = 3 * 60 * 1000; // 3 دقائق
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** يلغي مؤقّت مهلة الكشف لغرفة (عند إنهاء اللعبة يدوياً أو مغادرة المرحلة). */
export function clearRevealGrace(roomId: string): void {
  const h = timers.get(roomId);
  if (h) { clearTimeout(h); timers.delete(roomId); }
}

/**
 * يبدأ مؤقّت مهلة الكشف (3 دقائق) — يُستدعى عند إرسال day:elimination-pending بفائز حاسم.
 * إن لم يُنهِ الليدر اللعبة خلالها، تُنهى تلقائياً.
 */
export function scheduleRevealGrace(io: Server, roomId: string): void {
  clearRevealGrace(roomId);
  const handle = setTimeout(() => {
    autoFinalizeIfStuck(io, roomId).catch(e => console.error(`⏳ reveal-grace error (${roomId}):`, e));
  }, GRACE_MS);
  timers.set(roomId, handle);
  console.log(`⏳ Reveal-grace timer started for room ${roomId} (3 min)`);
}

function winnerArabic(winner: string): string {
  switch (winner) {
    case 'MAFIA': return 'المافيا';
    case 'CITIZEN': return 'المواطنون';
    case 'JESTER': return 'المهرّج';
    case 'ASSASSIN': return 'السفّاح';
    default: return winner;
  }
}

async function autoFinalizeIfStuck(io: Server, roomId: string): Promise<void> {
  timers.delete(roomId);
  const state = await getGameState(roomId);
  if (!state) return;

  // إن كان الليدر قد أنهى اللعبة فعلاً (غادرت مرحلة الكشف) → لا شيء
  if (state.phase !== Phase.DAY_ELIMINATION) return;

  const pr: any = (state as any).pendingResolution;
  const decisive = !!pr && (pr.neutralWin?.won || (pr.winResult && pr.winResult !== WinResult.GAME_CONTINUES));
  if (!decisive) return;

  // قنبلة معلّقة لها مسارها الخاص (قرار الليدر) → لا نتدخّل
  if ((state as any).pendingBomb) return;

  // تحديد الفائز (state.winner مضبوط أصلاً من resolveVoting؛ نشتقّه احتياطاً)
  let winner: string | undefined = (state.winner as any) || undefined;
  if (!winner) {
    if (pr.neutralWin?.won) winner = pr.neutralWin.roleId === 'ASSASSIN' ? 'ASSASSIN' : 'JESTER';
    else winner = pr.winResult === WinResult.MAFIA_WIN ? 'MAFIA' : pr.winResult === WinResult.ASSASSIN_WIN ? 'ASSASSIN' : 'CITIZEN';
  }

  console.log(`⏳ Reveal-grace EXPIRED for room ${roomId} — auto-finalizing (winner: ${winner})`);

  // 1) كشف الأدوار للجميع (مكافئ لضغط الليدر «كشف الأدوار»)
  io.to(roomId).emit('day:elimination-revealed', {
    eliminated: pr.eliminated,
    revealedRoles: pr.revealedRoles,
    type: pr.type,
    pendingWinner: winner,
    auto: true,
  });

  // 2) إنهاء اللعبة (مكافئ لضغط «إنهاء»)
  state.winner = winner as any;
  (state as any).pendingWinner = null;
  state.phase = Phase.GAME_OVER;
  await setPhase(roomId, Phase.GAME_OVER);
  clearGameTimer(roomId);

  const gameOverPayload: any = { winner, matchId: state.matchId, players: state.players, reason: 'AUTO_REVEAL_TIMEOUT' };
  if (state.config?.useDynamicEngine) {
    try {
      const { checkWinConditionDynamic } = await import('./dynamic-win-checker.js');
      const dyn = await checkWinConditionDynamic(state);
      gameOverPayload.neutralResults = dyn.neutralResults || [];
    } catch { /* fallback بدون نتائج المحايدين */ }
  }
  io.to(roomId).emit('game:over', gameOverPayload);
  await setGameState(roomId, state);

  // 3) حفظ نتيجة المباراة (نقاط/إحصاءات) — نفس مسار الإنهاء اليدوي
  try {
    const { finalizeMatch } = await import('../services/match.service.js');
    await finalizeMatch(state);
  } catch (e) { console.error('⏳ reveal-grace finalizeMatch error:', e); }

  // 4) إشعار push للاعبين بالغرفة بالنتيجة
  try {
    const { sendPushToPlayers } = await import('../services/fcm.service.js');
    const ids = state.players.filter((p: any) => p.playerId).map((p: any) => p.playerId as number);
    if (ids.length > 0) {
      await sendPushToPlayers(ids, '🏁 انتهت اللعبة', `الفائز: ${winnerArabic(winner!)}`, 'game_over', { roomId });
    }
  } catch (e) { console.error('⏳ reveal-grace push error:', e); }

  console.log(`✅ Auto-finalized stuck game for room ${roomId} — winner: ${winner}`);
}
