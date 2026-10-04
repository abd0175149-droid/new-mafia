// ══════════════════════════════════════════════════════
// 🎮 أحداث اللعبة العامة (Game Socket Events)
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { getRoom, Phase, setPhase } from '../game/state.js';
import { getTeamCounts } from '../game/roles.js';
import { emitPhaseChangedSanitized, projectStateFor } from './broadcast.util.js';

export function registerGameEvents(io: Server, socket: Socket) {

  // ── طلب حالة اللعبة الحالية ──────────────────
  socket.on('game:get-state', async (data: { roomId: string }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // 🔒 الموثوق (الموجّه وشاشة العرض ومضيف الغرفة البعيدة) يأخذ الحالة كاملة.
      //    غيرُه يأخذ الإسقاطَ نفسَه الذي يصله في البثّ — كان يأخذ كلَّ شيءٍ عدا الأدوار:
      //    جيرانَ القنبلة بأدوارهم، والتوأمين، وعقودَ السفّاح، ونافذةَ العمدة، ورمزَ شاشة العرض.
      //    ولا يُسأل عن غرفةٍ غير غرفته.
      const trusted = socket.data.role === 'leader' || socket.data.role === 'display';
      if (!trusted && socket.data.roomId !== data.roomId) {
        return callback({ success: false, error: 'Not in this room' });
      }
      const seat = socket.data.role === 'player' && socket.data.physicalId != null ? Number(socket.data.physicalId) : null;
      callback({ success: true, state: trusted ? state : projectStateFor(state, seat) });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── انتقال مرحلة (من واجهة الليدر) ──────────
  socket.on('game:transition-phase', async (data: {
    roomId: string;
    targetPhase: Phase;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      await setPhase(data.roomId, data.targetPhase);

      // جلب الحالة الكاملة لبثها مع الحدث
      const state = await getRoom(data.roomId);

      await emitPhaseChangedSanitized(io, data.roomId, {
        phase: data.targetPhase,
        state: state || undefined,
        teamCounts: state ? getTeamCounts(state.players) : undefined,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── انقطاع الاتصال ──────────────────────────
  socket.on('disconnect', (reason: string) => {
    const { roomId, role: socketRole, physicalId } = socket.data;
    if (roomId) {
      // السبب يميّز الشبكة (transport close/error) عن تجمّد المتصفّح (ping timeout) عن الإغلاق المتعمّد (client namespace disconnect)
      console.log(`📴 Disconnected: ${socketRole === 'leader' ? 'Leader' : socketRole === 'display' ? 'Display' : `Player #${physicalId}`} from ${roomId} — ${reason}`);

      // إشعار الباقين
      io.to(roomId).emit('game:player-disconnected', {
        physicalId,
        isLeader: socketRole === 'leader',
      });
    }
  });
}
