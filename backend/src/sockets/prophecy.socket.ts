// ══════════════════════════════════════════════════════
// 🔮 أحداث كروت النبوءة التي لا تمرّ بخطّة الليل ولا بالتصويت
//
//   oracle:open      {roomId, box: 'A'|'B'|null, seat?}   العرّاف يختار صندوقاً الليلة (أو يلغي)
//   oracle:withdraw  {roomId, seat?}                      حقّ الشكّ: يحرق صفقة النبوءة قبل التصويت
//
// كلاهما من هاتف العرّاف نفسه (مقعدُه من المقبس لا من الطلب)، أو من الموجّه نيابةً عنه
// (الطابور اليدويّ، أو عرّافٌ أشار بيده) فيُرسل `seat`.
// 🔴 الردّ لا يكشف شيئاً لغير العرّاف: الهاتفُ الذي ليس عرّافاً يُجاب «ليس عرّافاً» —
//    وهذا لا يخرج من هاتفٍ إلى هاتف. والطلبُ نفسه لا يُبثّ للغرفة.
// ══════════════════════════════════════════════════════
import type { Server, Socket } from 'socket.io';
import { getRoom, withRoomLock } from '../game/state.js';
import { setGameState } from '../config/redis.js';
import { requestOpen, withdrawProphecy } from '../game/oracle-engine.js';
import { emitTrustedOnly, emitStateSanitized } from './broadcast.util.js';
import { dealLockedList } from '../game/deal-engine.js';

export function registerProphecyEvents(io: Server, socket: Socket) {
  const reply = (cb: any, r: any) => { if (typeof cb === 'function') cb(r); };

  /** المقعد الذي يتكلّم عنه الطلب: الموجّه يسمّيه، واللاعب مقعدُه من المقبس وحده */
  function seatOf(data: any): number | null {
    if (socket.data.role === 'leader') return Number.isFinite(Number(data?.seat)) ? Number(data.seat) : null;
    if (socket.data.role === 'player' && socket.data.physicalId != null) return Number(socket.data.physicalId);
    return null;
  }

  socket.on('oracle:open', async (data: { roomId: string; box: 'A' | 'B' | null; seat?: number }, cb) => {
    const seat = seatOf(data);
    if (seat == null) return reply(cb, { success: false, error: 'غير مصرّح' });
    try {
      const out = await withRoomLock(data.roomId, async () => {
        const st: any = await getRoom(data.roomId);
        if (!st) return { success: false, error: 'Room not found' };
        const r = requestOpen(st, seat, data.box ?? null);
        if (r.ok === false) return { success: false, error: r.error };
        await setGameState(data.roomId, st);
        return { success: true, box: data.box ?? null };
      });
      reply(cb, out);
      // للموجّه: يظهر في مراجعة الليلة أنّ العرّاف طلب الفتح (الطلبُ لا يصل الشاشة)
      if ((out as any).success) {
        for (const s of await io.in(data.roomId).fetchSockets()) {
          if (s.data?.role === 'leader') s.emit('night:oracle-request', { seat, box: data.box ?? null });
        }
      }
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });

  socket.on('oracle:withdraw', async (data: { roomId: string; seat?: number }, cb) => {
    const seat = seatOf(data);
    if (seat == null) return reply(cb, { success: false, error: 'غير مصرّح' });
    try {
      const out: any = await withRoomLock(data.roomId, async () => {
        const st: any = await getRoom(data.roomId);
        if (!st) return { success: false, error: 'Room not found' };
        const r = withdrawProphecy(st, seat);
        if (r.ok === false) return { success: false, error: r.error };
        await setGameState(data.roomId, st);
        return { success: true, state: st };
      });
      const { state, ...res } = out;
      reply(cb, res);
      if (state) {
        // «أُحرقت صفقة النبوءة» — بلا اسمٍ ولا رقمِ صاحبها
        io.to(data.roomId).emit('day:deal-removed', { deals: state.votingState.deals, dealLockedPlayers: dealLockedList(state) });
        await emitTrustedOnly(io, data.roomId, 'display:prophecy-withdrawn', { round: state.round || 1 });
        await emitStateSanitized(io, data.roomId, 'game:state-sync', state);
      }
    } catch (err: any) { reply(cb, { success: false, error: err.message }); }
  });
}
