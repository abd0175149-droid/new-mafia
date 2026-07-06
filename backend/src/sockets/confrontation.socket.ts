// ══════════════════════════════════════════════════════
// ⚔️ المواجهة الثنائية (عن بُعد) — Confrontation
// ══════════════════════════════════════════════════════
// أثناء نقاش النهار: لاعب يطلب مواجهة صوتية 30ث مع لاعبٍ آخر.
// التسلسل: طلب → موافقة الطرف الآخر → موافقة الليدر → تُفتح مايكات الطرفين
// (يكتم الباقي عبر منطق الصوت) لمدّة 30ث ثم تُستعاد. حدّ 3 لكل جولة (تُصفَّر كل نهار).
// إضافيّة/عن بُعد فقط — لا تمسّ المحرك ولا اللعب المحلّي.

import { Server, Socket } from 'socket.io';
import { getGameState, setGameState } from '../config/redis.js';
import { Phase } from '../game/state.js';

const MAX_PER_ROUND = 3;
const DURATION_SECONDS = 30;
const timers = new Map<string, any>();

export function registerConfrontationEvents(io: Server, socket: Socket) {
  // ── لاعب يطلب مواجهة ──
  socket.on('player:request-confrontation', async (data: { roomId: string; targetPhysicalId: number }, callback) => {
    try {
      const state = await getGameState(data.roomId);
      if (!state || !state.config?.isRemote) return callback?.({ success: false, error: 'remote_only' });
      if (state.phase !== Phase.DAY_DISCUSSION) return callback?.({ success: false, error: 'discussion_only' });
      if (state.confrontation) return callback?.({ success: false, error: 'confrontation_in_progress' });

      // تصفير العدّاد كل جولة جديدة (كسول)
      if (state.confrontationRound !== state.round) {
        state.confrontationCount = 0;
        state.confrontationRound = state.round;
      }
      if ((state.confrontationCount || 0) >= MAX_PER_ROUND) return callback?.({ success: false, error: 'max_reached' });

      const requester = state.players.find((p: any) => String(p.physicalId) === String(socket.data.physicalId));
      const target = state.players.find((p: any) => p.physicalId === data.targetPhysicalId);
      if (!requester || !target) return callback?.({ success: false, error: 'player_not_found' });
      if (!requester.isAlive || !target.isAlive) return callback?.({ success: false, error: 'must_be_alive' });
      if (requester.physicalId === target.physicalId) return callback?.({ success: false, error: 'self' });

      state.confrontation = { status: 'PENDING_TARGET', requesterId: requester.physicalId, targetId: target.physicalId };
      await setGameState(data.roomId, state);
      io.to(data.roomId).emit('confrontation:pending', {
        status: 'PENDING_TARGET',
        requesterId: requester.physicalId, requesterName: requester.name,
        targetId: target.physicalId, targetName: target.name,
      });
      callback?.({ success: true });
    } catch (e: any) { callback?.({ success: false, error: e?.message }); }
  });

  // ── الطرف المستهدَف يوافق/يرفض ──
  socket.on('player:respond-confrontation', async (data: { roomId: string; accept: boolean }, callback) => {
    try {
      const state = await getGameState(data.roomId);
      if (!state?.confrontation || state.confrontation.status !== 'PENDING_TARGET') return callback?.({ success: false, error: 'no_pending' });
      if (String(socket.data.physicalId) !== String(state.confrontation.targetId)) return callback?.({ success: false, error: 'not_target' });

      if (!data.accept) {
        state.confrontation = null;
        await setGameState(data.roomId, state);
        io.to(data.roomId).emit('confrontation:ended', { reason: 'target_declined' });
        return callback?.({ success: true });
      }
      state.confrontation.status = 'PENDING_LEADER';
      await setGameState(data.roomId, state);
      io.to(data.roomId).emit('confrontation:pending', {
        status: 'PENDING_LEADER',
        requesterId: state.confrontation.requesterId,
        targetId: state.confrontation.targetId,
      });
      callback?.({ success: true });
    } catch (e: any) { callback?.({ success: false, error: e?.message }); }
  });

  // ── الليدر يوافق/يرفض ──
  socket.on('leader:approve-confrontation', async (data: { roomId: string; approve: boolean }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      const isLeader = socket.data.role === 'leader' || socket.data.isPlayerHost === true;
      if (!isLeader) return callback?.({ success: false, error: 'only_leader' });

      const state = await getGameState(data.roomId);
      if (!state?.confrontation || state.confrontation.status !== 'PENDING_LEADER') return callback?.({ success: false, error: 'no_pending' });

      if (!data.approve) {
        state.confrontation = null;
        await setGameState(data.roomId, state);
        io.to(data.roomId).emit('confrontation:ended', { reason: 'leader_rejected' });
        return callback?.({ success: true });
      }

      state.confrontation.status = 'ACTIVE';
      state.confrontation.startedAt = Date.now();
      state.confrontationCount = (state.confrontationCount || 0) + 1;
      await setGameState(data.roomId, state);

      const { requesterId, targetId, startedAt } = state.confrontation;
      io.to(data.roomId).emit('confrontation:started', { requesterId, targetId, durationSeconds: DURATION_SECONDS, startedAt });

      const old = timers.get(data.roomId);
      if (old) clearTimeout(old);
      const t = setTimeout(async () => {
        timers.delete(data.roomId);
        const s2 = await getGameState(data.roomId);
        if (s2?.confrontation?.status === 'ACTIVE') {
          s2.confrontation = null;
          await setGameState(data.roomId, s2);
          io.to(data.roomId).emit('confrontation:ended', { reason: 'time_up' });
        }
      }, DURATION_SECONDS * 1000);
      timers.set(data.roomId, t);
      callback?.({ success: true });
    } catch (e: any) { callback?.({ success: false, error: e?.message }); }
  });
}
