// ══════════════════════════════════════════════════════
// 🔮 أحداث كروت النبوءة التي لا تمرّ بخطّة الليل ولا بالتصويت
//
//   oracle:open      {roomId, box: 'A'|'B'|null, seat?}   العرّاف يختار صندوقاً الليلة (أو يلغي)
//   oracle:withdraw  {roomId, seat?}                      حقّ الشكّ: يحرق صفقة النبوءة قبل التصويت
//   cup:public       {roomId, on, seat?}                  القارئة تكشف قراءة الليلة (مرّةً في اللعبة)
//   cup:seal         {roomId, target, seat?}              قدرُ الغد: تختم اسماً في الليلة التالية لرحيلها
//   divided:choose   {roomId, side: 'MAFIA'|'CITY', seat?} المنقسم يختار فريقه في الليلة الثانية (نهائيّ)
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
import { requestPublicCup, requestSeal } from '../game/cup-engine.js';
import { chooseSide, type DividedSide } from '../game/divided-engine.js';
import { phoneMafiaTeam } from '../game/public-counts.js';
import { emitTrustedOnly, emitStateSanitized } from './broadcast.util.js';
import { dealLockedList } from '../game/deal-engine.js';

/**
 * ⚖️ عبر المنقسم: هاتفُه يرى دوره الجديد وزملاءه، وهواتفُ المافيا تراه بينهم — الآن (ب٤:
 * يشاركهم اغتيال الليلة نفسها). لا شيء للشاشة ولا لغير المافيا: الإعلانُ صباحاً من الملخّص.
 */
export async function notifyDividedCross(io: Server, roomId: string, state: any): Promise<void> {
  const d = state?.dividedState;
  if (!d || d.choice !== 'MAFIA') return;
  const reveal = state.config?.allowMafiaReveal !== false;
  const team = phoneMafiaTeam(state, null);
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (s.data?.role !== 'player') continue;
    const seat = Number(s.data.physicalId);
    if (seat === Number(d.dividedPhysicalId)) {
      s.emit('player:role-assigned', {
        physicalId: seat, role: d.newRole,
        mafiaTeam: reveal ? team.filter(m => m.physicalId !== seat) : undefined,
        divided: { choice: 'MAFIA' },
      });
    } else if (reveal && team.some(m => m.physicalId === seat)) {
      s.emit('mafia:team-updated', { mafiaTeam: team.filter(m => m.physicalId !== seat) });
    }
  }
}

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

  /** طلبٌ يعدّل حالة الغرفة تحت القفل ويُجيب صاحبه وحده (لا بثّ للغرفة) */
  async function quiet(roomId: string, cb: any, fn: (st: any) => { ok: true } | { ok: false; error: string }, extra: any = {}) {
    try {
      const out = await withRoomLock(roomId, async () => {
        const st: any = await getRoom(roomId);
        if (!st) return { success: false, error: 'Room not found' };
        const r = fn(st);
        if (r.ok === false) return { success: false, error: r.error };
        await setGameState(roomId, st);
        return { success: true, ...extra };
      });
      reply(cb, out);
      return (out as any).success === true;
    } catch (err: any) { reply(cb, { success: false, error: err.message }); return false; }
  }

  socket.on('cup:public', async (data: { roomId: string; on: boolean; seat?: number }, cb) => {
    const seat = seatOf(data);
    if (seat == null) return reply(cb, { success: false, error: 'غير مصرّح' });
    await quiet(data.roomId, cb, (st) => requestPublicCup(st, seat, data.on !== false), { on: data.on !== false });
  });

  socket.on('cup:seal', async (data: { roomId: string; target: number; seat?: number }, cb) => {
    const seat = seatOf(data);
    if (seat == null) return reply(cb, { success: false, error: 'غير مصرّح' });
    const ok = await quiet(data.roomId, cb, (st) => requestSeal(st, seat, Number(data.target)), { target: Number(data.target) });
    if (ok) for (const s of await io.in(data.roomId).fetchSockets()) {
      if (s.data?.role === 'leader') s.emit('night:cup-seal-request', { seat, target: Number(data.target) });
    }
  });

  socket.on('divided:choose', async (data: { roomId: string; side: DividedSide; seat?: number }, cb) => {
    const seat = seatOf(data);
    if (seat == null) return reply(cb, { success: false, error: 'غير مصرّح' });
    try {
      const out: any = await withRoomLock(data.roomId, async () => {
        const st: any = await getRoom(data.roomId);
        if (!st) return { success: false, error: 'Room not found' };
        const r = chooseSide(st, seat, data.side);
        if (r.ok === false) return { success: false, error: r.error };
        await setGameState(data.roomId, st);
        return { success: true, crossed: r.crossed, state: st };
      });
      const { state, ...res } = out;
      reply(cb, { ...res, side: res.success ? data.side : undefined });
      if (state) {
        for (const s of await io.in(data.roomId).fetchSockets()) {
          if (s.data?.role === 'leader') s.emit('night:divided-choice', { seat, side: data.side });
        }
        if (res.crossed) await notifyDividedCross(io, data.roomId, state);
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
