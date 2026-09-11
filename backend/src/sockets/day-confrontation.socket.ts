// ══════════════════════════════════════════════════════
// ⚔️ أحداث مواجهة النهار الوجاهيّة — الحفظ والبثّ والمؤقّتات
//
//   day:request-confrontation   {roomId, targetPhysicalId}   ← اللاعب (الطالب) — أو الليدر مع requesterPhysicalId
//   day:respond-confrontation   {roomId, id, accept}         ← المستهدَف
//   day:confrontation           {roomId, id, action}         ← الليدر: approve|decline|cancel|start|adjust|end
//   day:get-confrontations      {roomId}                     ← الجميع (استعادة الحالة)
//   leader:confrontation-settings {roomId, enabled?, perPlayer?} ← الليدر في أيّ مرحلة (كمفتاح غرفة التشاور)
//   بثّ: day:confrontation-updated {event, id, ...publicConfrontations}
//
// المؤقّتات في ذاكرة العمليّة (كالنسخة البعيدة): تعيد قراءة الحالة وتتحقّق من المعرّف والحالة
// والموعد قبل أيّ تعديل — فإعادة التشغيل تُسقطها بلا ضرر (تبقى أزرار الليدر).
// ══════════════════════════════════════════════════════
import { Server, Socket } from 'socket.io';
import { getGameState, setGameState } from '../config/redis.js';
import { Phase } from '../game/state.js';
import {
  requestConfrontation, acceptConfrontation, declineConfrontation, cancelConfrontation,
  startConfrontation, endConfrontation, markTimedOut, adjustConfrontationStage, stageSecondsFor,
  findConfrontation, publicConfrontations, stageDeadline, CONFRONTATION_RESPOND_SECONDS,
} from '../game/confrontation-engine.js';

const timers = new Map<string, NodeJS.Timeout>();

function clearTimer(key: string) {
  const t = timers.get(key);
  if (t) { clearTimeout(t); timers.delete(key); }
}

function broadcast(io: Server, roomId: string, state: any, event: string, id: string | null) {
  io.to(roomId).emit('day:confrontation-updated', { event, id, ...publicConfrontations(state) });
}

/** مهلة ردّ المستهدَف: عند انقضائها يبقى الطلب معلّقاً ويُعلَم الليدر. */
function armRespondTimer(io: Server, roomId: string, id: string, ms: number) {
  const key = `${roomId}:${id}:respond`;
  clearTimer(key);
  timers.set(key, setTimeout(async () => {
    timers.delete(key);
    try {
      const state = await getGameState(roomId);
      if (!state) return;
      const c = markTimedOut(state, id);
      if (!c) return;
      await setGameState(roomId, state);
      broadcast(io, roomId, state, 'timeout', id);
    } catch (e) { console.error('⚔️ respond-timer', e); }
  }, Math.max(0, ms)));
}

/** مؤقّت المواجهة: LIVE → DONE تلقائيّاً عند انقضاء المدّة (والليدر يسبقه بزرّ الإنهاء أو يمدّدها). */
function armStageTimer(io: Server, roomId: string, id: string, deadline: number) {
  const key = `${roomId}:${id}:stage`;
  clearTimer(key);
  timers.set(key, setTimeout(async () => {
    timers.delete(key);
    try {
      const state = await getGameState(roomId);
      if (!state) return;
      const c = findConfrontation(state, id);
      const dl = stageDeadline(c);
      if (!c || dl == null) return;
      if (dl !== deadline) return;                       // بدأت مرحلةٌ أحدث — لها مؤقّتها
      if (c.status === 'LIVE') {
        endConfrontation(state, id);
        await setGameState(roomId, state);
        broadcast(io, roomId, state, 'ended', id);
      }
    } catch (e) { console.error('⚔️ stage-timer', e); }
  }, Math.max(0, deadline - Date.now())));
}

export function clearConfrontationTimers(roomId: string) {
  for (const k of [...timers.keys()]) if (k.startsWith(`${roomId}:`)) clearTimer(k);
}

export function registerDayConfrontationEvents(io: Server, socket: Socket) {
  const reply = (cb: any, r: any) => { if (typeof cb === 'function') cb(r); };

  // ── اللاعب يطلب مواجهة ──
  socket.on('day:request-confrontation', async (data: { roomId: string; targetPhysicalId: number; requesterPhysicalId?: number }, callback) => {
    try {
      const isLeader = socket.data.role === 'leader';
      const isPlayer = socket.data.role === 'player';
      if (!isLeader && !isPlayer) return reply(callback, { success: false, error: 'غير مصرح' });
      const requesterId = isPlayer ? Number(socket.data.physicalId) : Number(data.requesterPhysicalId);
      if (!Number.isFinite(requesterId)) return reply(callback, { success: false, error: 'هويّة الطالب غير معروفة' });
      const state = await getGameState(data.roomId);
      if (!state) return reply(callback, { success: false, error: 'الغرفة غير موجودة' });
      const c = requestConfrontation(state, requesterId, Number(data.targetPhysicalId));
      await setGameState(data.roomId, state);
      broadcast(io, data.roomId, state, 'requested', c.id);
      armRespondTimer(io, data.roomId, c.id, CONFRONTATION_RESPOND_SECONDS * 1000);
      console.log(`⚔️ Confrontation requested #${requesterId} → #${c.targetPhysicalId} (${data.roomId})`);
      reply(callback, { success: true, id: c.id, ...publicConfrontations(state) });
    } catch (err: any) { reply(callback, { success: false, error: err.message }); }
  });

  // ── المستهدَف يقبل/يرفض ──
  socket.on('day:respond-confrontation', async (data: { roomId: string; id: string; accept: boolean }, callback) => {
    try {
      if (socket.data.role !== 'player') return reply(callback, { success: false, error: 'غير مصرح' });
      const state = await getGameState(data.roomId);
      if (!state) return reply(callback, { success: false, error: 'الغرفة غير موجودة' });
      const c = findConfrontation(state, data.id);
      if (!c) return reply(callback, { success: false, error: 'المواجهة غير موجودة' });
      if (Number(socket.data.physicalId) !== c.targetPhysicalId) return reply(callback, { success: false, error: 'هذا الطلب ليس موجّهاً إليك' });
      const accepted = data.accept === true;
      if (accepted) acceptConfrontation(state, c.id, 'TARGET'); else declineConfrontation(state, c.id, 'TARGET');
      await setGameState(data.roomId, state);
      clearTimer(`${data.roomId}:${c.id}:respond`);
      broadcast(io, data.roomId, state, accepted ? 'accepted' : 'declined', c.id);
      reply(callback, { success: true, ...publicConfrontations(state) });
    } catch (err: any) { reply(callback, { success: false, error: err.message }); }
  });

  // ── الليدر: اعتماد/رفض/إلغاء/بدء/تعديل المدّة/إنهاء ──
  socket.on('day:confrontation', async (data: { roomId: string; id: string; action: 'approve' | 'decline' | 'cancel' | 'start' | 'end' | 'adjust'; seconds?: number; delta?: number }, callback) => {
    try {
      if (socket.data.role !== 'leader') return reply(callback, { success: false, error: 'Only leader' });
      const state = await getGameState(data.roomId);
      if (!state) return reply(callback, { success: false, error: 'الغرفة غير موجودة' });
      let event: string;
      let deadline: number | null = null;
      switch (data.action) {
        case 'approve': acceptConfrontation(state, data.id, 'LEADER'); event = 'accepted'; clearTimer(`${data.roomId}:${data.id}:respond`); break;
        case 'decline': declineConfrontation(state, data.id, 'LEADER'); event = 'declined'; clearTimer(`${data.roomId}:${data.id}:respond`); break;
        case 'cancel': {
          const c = cancelConfrontation(state, data.id);
          event = c.status === 'DECLINED' ? 'declined' : 'cancelled';
          clearTimer(`${data.roomId}:${data.id}:respond`); clearTimer(`${data.roomId}:${data.id}:stage`);
          break;
        }
        case 'start': deadline = stageDeadline(startConfrontation(state, data.id, Date.now(), data.seconds)); event = 'started'; break;
        // ⏱️ تمديد/تقصير المرحلة الجارية — يُعاد تسليح مؤقّت الخادم على الموعد الجديد
        case 'adjust': deadline = stageDeadline(adjustConfrontationStage(state, data.id, Number(data.delta) || 0)); event = 'adjusted'; break;
        case 'end': endConfrontation(state, data.id); event = 'ended'; clearTimer(`${data.roomId}:${data.id}:stage`); break;
        default: return reply(callback, { success: false, error: 'إجراءٌ غير معروف' });
      }
      await setGameState(data.roomId, state);
      if (deadline != null) armStageTimer(io, data.roomId, data.id, deadline);
      broadcast(io, data.roomId, state, event, data.id);
      console.log(`⚔️ Confrontation ${data.action} (${data.id}) in ${data.roomId}`);
      reply(callback, { success: true, ...publicConfrontations(state) });
    } catch (err: any) { reply(callback, { success: false, error: err.message }); }
  });

  // ── استعادة الحالة (لمن فاته البثّ) ──
  socket.on('day:get-confrontations', async (data: { roomId: string }, callback) => {
    try {
      const state = await getGameState(data.roomId);
      if (!state) return reply(callback, { success: false, error: 'الغرفة غير موجودة' });
      reply(callback, { success: true, phase: state.phase, ...publicConfrontations(state) });
    } catch (err: any) { reply(callback, { success: false, error: err.message }); }
  });

  // ── الليدر: إعدادات الميزة في أيّ مرحلة (كمفتاح غرفة التشاور) ──
  socket.on('leader:confrontation-settings', async (data: { roomId: string; enabled?: boolean; perPlayer?: number; stageSeconds?: number }, callback) => {
    try {
      if (socket.data.role !== 'leader') return reply(callback, { success: false, error: 'Only leader' });
      const state = await getGameState(data.roomId);
      if (!state) return reply(callback, { success: false, error: 'الغرفة غير موجودة' });
      if (typeof data.enabled === 'boolean') state.config.confrontationEnabled = data.enabled;
      if (typeof data.perPlayer === 'number' && Number.isFinite(data.perPlayer))
        state.config.confrontationsPerPlayer = Math.min(Math.max(Math.floor(data.perPlayer), 1), 5);
      if (typeof data.stageSeconds === 'number' && Number.isFinite(data.stageSeconds))
        state.config.confrontationStageSeconds = stageSecondsFor(state, data.stageSeconds);
      await setGameState(data.roomId, state);
      io.to(data.roomId).emit('room:config-updated', {
        confrontationEnabled: state.config.confrontationEnabled === true,
        confrontationsPerPlayer: state.config.confrontationsPerPlayer ?? 1,
      });
      if (state.phase === Phase.DAY_DISCUSSION) broadcast(io, data.roomId, state, 'settings', null);
      console.log(`⚔️ Confrontation settings for ${data.roomId}: enabled=${state.config.confrontationEnabled === true} perPlayer=${state.config.confrontationsPerPlayer ?? 1}`);
      reply(callback, { success: true, enabled: state.config.confrontationEnabled === true, perPlayer: state.config.confrontationsPerPlayer ?? 1 });
    } catch (err: any) { reply(callback, { success: false, error: err.message }); }
  });
}
