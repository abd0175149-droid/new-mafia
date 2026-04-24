// ══════════════════════════════════════════════════════
// 🎮 أحداث اللعبة العامة (Game Socket Events)
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { getRoom, Phase, setPhase } from '../game/state.js';

export function registerGameEvents(io: Server, socket: Socket) {

  // ── طلب حالة اللعبة الحالية ──────────────────
  socket.on('game:get-state', async (data: { roomId: string }, callback) => {
    try {
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // إخفاء الأدوار عن غير الليدر
      const isLeader = socket.data.role === 'leader';
      const sanitizedState = isLeader ? state : {
        ...state,
        players: state.players.map(p => ({
          ...p,
          role: null, // لا تكشف الأدوار للاعبين
        })),
        nightActions: undefined,
      };

      callback({ success: true, state: sanitizedState });
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

      io.to(data.roomId).emit('game:phase-changed', {
        phase: data.targetPhase,
        state: state || undefined,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── انقطاع الاتصال ──────────────────────────
  socket.on('disconnect', () => {
    const { roomId, role: socketRole, physicalId } = socket.data;
    if (roomId) {
      console.log(`📴 Disconnected: ${socketRole === 'leader' ? 'Leader' : `Player #${physicalId}`} from ${roomId}`);

      // إشعار الباقين
      io.to(roomId).emit('game:player-disconnected', {
        physicalId,
        isLeader: socketRole === 'leader',
      });
    }
  });
}
