// ══════════════════════════════════════════════════════
// 🎙️ أحداث الصوت/الفيديو (Voice Socket Events) — RealtimeKit
// ══════════════════════════════════════════════════════
// خاصّ بالغرف البعيدة فقط. يصدر توكن انضمام لكل مقبس حسب حالته.

import { Server, Socket } from 'socket.io';
import { getGameState } from '../config/redis.js';
import {
  isVoiceConfigured,
  getOrCreateMeeting,
  issueParticipantToken,
  presetForPlayer,
} from '../services/voice.service.js';

export function registerVoiceEvents(io: Server, socket: Socket) {
  // ── طلب توكن انضمام لاجتماع الغرفة ──
  socket.on('voice:get-token', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (!isVoiceConfigured()) return callback?.({ success: false, error: 'voice_not_configured' });

      const state = await getGameState(data.roomId);
      if (!state) return callback?.({ success: false, error: 'Room not found' });
      if (!state.config?.isRemote) return callback?.({ success: false, error: 'voice_remote_only' });

      const isHost = socket.data.role === 'leader' || socket.data.isPlayerHost === true;

      let name = 'مشارك';
      let customId = '';
      let isAlive = true;

      if (isHost) {
        name = 'المُوجِّه';
        customId = 'host';
      } else {
        const physicalId = socket.data.physicalId;
        const player = state.players.find((p: any) => String(p.physicalId) === String(physicalId));
        if (!player) return callback?.({ success: false, error: 'not_in_room' });
        name = player.name || `#${player.physicalId}`;
        customId = `p${player.physicalId}`;
        isAlive = !!player.isAlive;
      }

      const meetingId = await getOrCreateMeeting(data.roomId);
      const presetName = presetForPlayer({ isHost, isAlive });
      const authToken = await issueParticipantToken(meetingId, { name, presetName, customParticipantId: customId });

      callback?.({ success: true, authToken, meetingId, participantId: customId, preset: presetName });
    } catch (err: any) {
      console.error(`🎙️ voice:get-token error:`, err?.message);
      callback?.({ success: false, error: err?.message || 'voice_token_failed' });
    }
  });
}
