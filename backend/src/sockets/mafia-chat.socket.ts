// ══════════════════════════════════════════════════════
// 🗣️ غرفة تشاور المافيا السرّية (Mafia Secret Chat)
//
// المبادئ الأمنية:
// - الهوية من socket.data فقط؛ فحص «مافيا + حيّ + مرحلة لعب» من حالة اللعبة الحيّة
//   عند كل عملية (يشمل تلقائياً تحوّل الأخ الأصغر لمافيا، ويقطع الميت فوراً).
// - الرسائل في مفتاح Redis منفصل (aux:mafia-chat:{roomId}) — أبداً ليست في حالة
//   اللعبة (game:state-sync يُبثّ للجميع = تسريب) ولا تحت بادئة game:* (تُمسح كغرف).
// - البثّ لسوكتات المافيا الأحياء + الليدر حصراً (fetchSockets + فلترة) — لا io.to.
// - رفض صامت موحّد: كل الرفض يعيد { success:false } بلا تفسير — السبر لا يتعلم شيئاً.
// - تفعيل/تعطيل بيد الليدر: config.mafiaChatEnabled (leader:mafia-chat-toggle).
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { getGameState, setGameState, getAux, setAux } from '../config/redis.js';
import { isMafiaRole, Role } from '../game/roles.js';
import { Phase } from '../game/state.js';

const MAX_MESSAGES = 200;      // آخر 200 رسالة تُحفظ
const MAX_TEXT_LEN = 300;      // أقصى طول للرسالة
const SEND_THROTTLE_MS = 700;  // أدنى فاصل بين رسالتين لنفس اللاعب

export interface MafiaChatMessage {
  physicalId: number;
  name: string;
  text: string;
  at: number;
}

const chatKey = (roomId: string) => `mafia-chat:${roomId}`;

// المراحل التي تعمل فيها الغرفة (بعد اعتماد الأدوار وقبل نهاية اللعبة)
const BLOCKED_PHASES = new Set<string>([Phase.LOBBY, Phase.ROLE_GENERATION, Phase.ROLE_BINDING, Phase.GAME_OVER]);

// ── تحقق سيادي: مافيا حيّ في لعبة جارية والغرفة مفعّلة — وإلا null (رفض صامت) ──
async function verifyAliveMafia(socket: Socket, roomId?: string): Promise<{ state: any; player: any } | null> {
  try {
    if (socket.data.role !== 'player') return null;
    const sockRoom: string | undefined = socket.data.roomId;
    const physicalId: number | undefined = socket.data.physicalId;
    if (!sockRoom || !physicalId) return null;
    if (roomId && roomId !== sockRoom) return null;

    const state = await getGameState(sockRoom);
    if (!state) return null;
    if (state.config?.mafiaChatEnabled !== true) return null;
    if (!state.rolesConfirmed) return null;
    if (BLOCKED_PHASES.has(state.phase)) return null;

    const player = state.players.find((p: any) => p.physicalId === physicalId);
    if (!player?.role) return null;
    if (player.isAlive === false) return null;
    if (!isMafiaRole(player.role as Role)) return null;

    return { state, player };
  } catch {
    return null;
  }
}

export function registerMafiaChatEvents(io: Server, socket: Socket) {

  // ── إرسال رسالة ──
  socket.on('mafia:chat-send', async (data: { roomId: string; text: string }, callback) => {
    const deny = () => { if (typeof callback === 'function') callback({ success: false }); };
    try {
      // Throttle قبل أي عمل
      const now = Date.now();
      if (socket.data.lastMafiaChatAt && now - socket.data.lastMafiaChatAt < SEND_THROTTLE_MS) return deny();

      const verified = await verifyAliveMafia(socket, data?.roomId);
      if (!verified) return deny();

      const text = String(data?.text || '').trim().slice(0, MAX_TEXT_LEN);
      if (!text) return deny();

      socket.data.lastMafiaChatAt = now;
      const roomId: string = socket.data.roomId;
      const { state, player } = verified;

      const msg: MafiaChatMessage = { physicalId: player.physicalId, name: player.name, text, at: now };

      // append مع سقف MAX_MESSAGES
      const store = (await getAux(chatKey(roomId))) || { messages: [] };
      store.messages.push(msg);
      if (store.messages.length > MAX_MESSAGES) store.messages = store.messages.slice(-MAX_MESSAGES);
      await setAux(chatKey(roomId), store);

      // بثّ انتقائي: الليدر دائماً + المافيا الأحياء فقط
      const allSockets = await io.in(roomId).fetchSockets();
      for (const s of allSockets) {
        const sd: any = (s as any).data;
        if (sd?.role === 'leader') {
          s.emit('mafia:chat-message', msg);
        } else if (sd?.role === 'player' && sd?.physicalId) {
          const sp = state.players.find((p: any) => p.physicalId === sd.physicalId);
          if (sp?.role && sp.isAlive !== false && isMafiaRole(sp.role as Role)) {
            s.emit('mafia:chat-message', msg);
          }
        }
      }

      if (typeof callback === 'function') callback({ success: true });
    } catch {
      deny();
    }
  });

  // ── جلب التاريخ (للمافيا الحيّ فقط) ──
  socket.on('mafia:chat-history', async (data: { roomId: string }, callback) => {
    const deny = () => { if (typeof callback === 'function') callback({ success: false }); };
    try {
      const verified = await verifyAliveMafia(socket, data?.roomId);
      if (!verified) return deny();
      const store = (await getAux(chatKey(socket.data.roomId))) || { messages: [] };
      if (typeof callback === 'function') callback({ success: true, messages: store.messages });
    } catch {
      deny();
    }
  });

  // ── الليدر: قراءة كاملة للتاريخ ──
  socket.on('leader:mafia-chat-history', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      const store = (await getAux(chatKey(data.roomId))) || { messages: [] };
      callback({ success: true, messages: store.messages, enabled: undefined });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── الليدر: تفعيل/تعطيل الغرفة (في أي لحظة — ويُعرض كخيار في تهيئة كل جولة) ──
  socket.on('leader:mafia-chat-toggle', async (data: { roomId: string; enabled: boolean }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      state.config.mafiaChatEnabled = data.enabled === true;
      await setGameState(data.roomId, state);

      // العلم إعداد عادي لا يكشف هوية أحد — يصل للجميع كي يُظهر/يُخفي التبويب فوراً
      io.to(data.roomId).emit('room:config-updated', { mafiaChatEnabled: state.config.mafiaChatEnabled });
      console.log(`🗣️ Mafia chat ${state.config.mafiaChatEnabled ? 'ENABLED' : 'DISABLED'} for room ${data.roomId}`);
      callback({ success: true, enabled: state.config.mafiaChatEnabled });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });
}
