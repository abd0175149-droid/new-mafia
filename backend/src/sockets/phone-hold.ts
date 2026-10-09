// ══════════════════════════════════════════════════════
// 📱 حبسُ الهواتف حتّى تقلب شاشةُ القاعة البطاقة (قرار المالك 2026-10-09)
// ══════════════════════════════════════════════════════
// «كشف الأدوار» يبدأ مشهداً على شاشة القاعة (بطاقةٌ تُقلب بعد ٣–١٢ ثانية، وضحايا القنبلة
// بعد ذلك) — وكانت الهواتفُ تستلم المُقصى ودورَه وموتَ صاحبها **لحظةَ الضغطة**، قبل أن
// تراه القاعة. فلا مفاجأة: الطاولةُ تقرأ النتيجة من هواتفها قبل المشهد.
//
// الآن: الموثوقون (الموجّه والشاشة) يستلمون الكشفَ فوراً، والهواتفُ والمتفرّجون يُحبسون:
//   • مقاعدُ المجموعة محجوبةٌ في كلّ ما يصلهم (`unrevealedDeadSeats(…, { forPhones })`).
//   • أحداثُهم (elimination-revealed، bomb-result …) تُحفظ في المجموعة وتُرسل عند الإطلاق.
// الإطلاقُ حين تُبلغ الشاشةُ أنّ بطاقاتِ المجموعة كلَّها قُلبت (`display:card-flipped` من
// lib/countGate) — أو تنقضي المهلة (شاشةٌ قديمةُ البناء لا تُبلغ، أو انقطعت). وبلا شاشةٍ
// متّصلة لا حبسَ أصلاً: لا مشهدَ يُنتظر. وبالترتيب: مجموعةٌ لا تسبق ما قبلها (الإقصاءُ ثمّ القنبلة).
// ══════════════════════════════════════════════════════

import type { Server, Socket } from 'socket.io';
import { getGameState, setGameState } from '../config/redis.js';
import { publicTeamCounts } from '../game/public-counts.js';
import { stampRevealOutcome, voteHistoryOf } from '../game/vote-history.js';
import { emitStateToPhones, spectatorRoom } from './broadcast.util.js';
import { notifyTwinTransform } from './twin-notify.js';

export interface PhoneHoldEmit { event: string; payload: any; spectators?: boolean; /** لهاتف مقعدٍ واحد (عقودُ السفّاح) */ toSeat?: number }
export interface PhoneHoldGroup {
  id: string;
  seats: number[];
  /** ما لم تُبلغ الشاشةُ بقلبه بعد */
  pending: number[];
  deadline: number;
  emits: PhoneHoldEmit[];
  /** يُختم المُقصى في سجلّ التصويت عند الإطلاق (لا عند الضغطة) */
  voteReveal?: boolean;
}

/** مهلُ الأمان — أطولُ قليلاً من مشاهد الشاشة (فحصُ المشاهد في تقرير 2026-10-09) */
export const HOLD_MS = {
  /** إقصاءُ النهار: البطاقةُ الأولى ٨–١٢ث في المشهد الثلاثيّ، وكلُّ تالية +١٠ث */
  day: (n: number) => Math.min(60_000, 20_000 + Math.max(0, n - 1) * 11_000),
  /** القنبلة: تُصفّ بعد مشهد الكشف — أوّلُ ضحيّة ~١٢ث، وكلُّ تالية +٤ث */
  bomb: (n: number) => Math.min(60_000, 25_000 + Math.max(0, n - 1) * 4_000),
  ash: 12_000,
  night: 8_000,
  police: 8_000,
  card: 6_000,
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const tkey = (roomId: string, id: string) => `${roomId}|${id}`;
const uniq = (xs: Array<number | string>) => Array.from(new Set(xs.map(Number).filter(Number.isFinite)));
const isTrustedRole = (r: any) => r === 'leader' || r === 'display';

/** يضيف مجموعةَ حبسٍ إلى الحالة (بلا حفظ) — ثمّ `armPhoneHolds` بعد حفظها */
export function addPhoneHold(state: any, g: { id: string; seats: Array<number | string>; emits?: PhoneHoldEmit[]; voteReveal?: boolean; fallbackMs: number }): void {
  const seats = uniq(g.seats);
  const group: PhoneHoldGroup = { id: g.id, seats, pending: [...seats], deadline: Date.now() + g.fallbackMs, emits: g.emits || [], voteReveal: !!g.voteReveal };
  state.phoneHold = [...((state.phoneHold || []) as PhoneHoldGroup[]).filter(x => x.id !== g.id), group];
}

/**
 * يُشغّل مؤقّتات المجموعات المحفوظة — أو يُطلقها كلَّها فوراً إن لم تكن في الغرفة شاشة.
 * يُستدعى **بعد** حفظ الحالة، ولا يُحفظ بعده كائنُ الحالة القديم (الإطلاقُ يكتب نسخةً أحدث).
 */
export async function armPhoneHolds(io: Server, roomId: string): Promise<void> {
  const state = await getGameState(roomId);
  const groups: PhoneHoldGroup[] = (state as any)?.phoneHold || [];
  if (!groups.length) return;
  const socks = await io.in(roomId).fetchSockets();
  if (!socks.some(s => (s.data as any)?.role === 'display')) {
    await releaseThrough(io, roomId, groups[groups.length - 1].id);
    return;
  }
  // مجموعاتٌ في رأس الطابور بلا بطاقةٍ تُقلب (لا إقصاء، تأجيل العمدة) — لا شيء يُنتظر
  const firstWaiting = groups.findIndex(g => g.pending.length > 0);
  const emptyLead = firstWaiting < 0 ? groups.length : firstWaiting;
  if (emptyLead > 0) {
    await releaseThrough(io, roomId, groups[emptyLead - 1].id);
    if (emptyLead === groups.length) return;
  }
  for (const g of groups.slice(emptyLead)) {
    const k = tkey(roomId, g.id);
    if (timers.has(k)) continue;
    const wait = Math.max(0, g.deadline - Date.now());
    timers.set(k, setTimeout(() => {
      timers.delete(k);
      void releaseThrough(io, roomId, g.id).catch(e => console.warn('⚠️ [phone-hold] مهلة:', e?.message));
    }, wait));
  }
}

/** الشاشةُ قلبت هذه البطاقات — تُطلق كلُّ مجموعةٍ اكتملت من رأس الطابور */
export async function ackFlippedSeats(io: Server, roomId: string, seats: number[]): Promise<void> {
  const state: any = await getGameState(roomId);
  const groups: PhoneHoldGroup[] = state?.phoneHold || [];
  if (!groups.length || !seats.length) return;
  for (const g of groups) g.pending = g.pending.filter(s => !seats.includes(s));
  const done: PhoneHoldGroup[] = [];
  while (groups.length && groups[0].pending.length === 0) done.push(groups.shift()!);
  state.phoneHold = groups;
  if (!done.length) { await setGameState(roomId, state); return; }
  await finish(io, roomId, state, done);
}

/** إطلاقُ مجموعةٍ وكلِّ ما قبلها (مهلةٌ انقضت، أو لا شاشة) */
export async function releaseThrough(io: Server, roomId: string, groupId: string): Promise<void> {
  const state: any = await getGameState(roomId);
  const groups: PhoneHoldGroup[] = state?.phoneHold || [];
  const i = groups.findIndex(g => g.id === groupId);
  if (i < 0) return;
  const done = groups.splice(0, i + 1);
  state.phoneHold = groups;
  await finish(io, roomId, state, done);
}

/** إطلاقُ كلّ ما بقي — قبل انتقالٍ يحمل عدّاداً جديداً (الليل، النهار، نهاية اللعبة) */
export async function flushPhoneHolds(io: Server, roomId: string): Promise<void> {
  const state: any = await getGameState(roomId);
  const groups: PhoneHoldGroup[] = state?.phoneHold || [];
  if (!groups.length) return;
  await releaseThrough(io, roomId, groups[groups.length - 1].id);
}

/** لعبةٌ جديدة/غرفةٌ تُحذف: تُنسى المجموعات ومؤقّتاتها بلا إرسال */
export function dropPhoneHolds(state: any, roomId: string): void {
  for (const g of (state?.phoneHold || []) as PhoneHoldGroup[]) {
    const k = tkey(roomId, g.id);
    clearTimeout(timers.get(k)); timers.delete(k);
  }
  if (state) state.phoneHold = null;
}

async function finish(io: Server, roomId: string, state: any, done: PhoneHoldGroup[]): Promise<void> {
  for (const g of done) { const k = tkey(roomId, g.id); clearTimeout(timers.get(k)); timers.delete(k); }

  // 🗳️ المُقصى في سجلّ التصويت — مع ظهوره على الهواتف لا قبله
  let votesChanged = false;
  if (done.some(g => g.voteReveal)) {
    try { votesChanged = stampRevealOutcome(state); } catch (e: any) { console.warn('⚠️ [phone-hold] vote-history:', e?.message); }
  }
  // 👥 تحوّلُ الأصغر كان مؤجَّلاً ما دام موتُ أخيه محجوباً (twin-notify) — الآن يُخطَر
  notifyTwinTransform(io, roomId, state);
  await setGameState(roomId, state);

  const socks = await io.in(roomId).fetchSockets();
  const phones = socks.filter(s => !isTrustedRole((s.data as any)?.role));
  const remaining: PhoneHoldGroup[] = state.phoneHold || [];
  for (let i = 0; i < done.length; i++) {
    const g = done[i];
    // 👁️ عدّادُ كلّ مجموعةٍ كما يصير بعدها هي وحدها: كشفُ الشيخ ثمّ قنبلتُه يُطلقان معاً (بلا شاشة)
    //    ولكلٍّ رقمُه — ما بعدها يُعدّ محجوباً حين يُحسب رقمُها
    const later = [...done.slice(i + 1), ...remaining].map(x => ({ ...x, deadline: Number.MAX_SAFE_INTEGER }));
    const counts = publicTeamCounts({ ...state, phoneHold: later }, { forPhones: true });
    for (const e of g.emits) {
      const payload = e.payload && typeof e.payload === 'object' && 'teamCounts' in e.payload ? { ...e.payload, teamCounts: counts } : e.payload;
      if (e.toSeat != null) {
        for (const s of phones) if ((s.data as any)?.role === 'player' && Number((s.data as any)?.physicalId) === Number(e.toSeat)) s.emit(e.event, payload);
        continue;
      }
      for (const s of phones) s.emit(e.event, payload);
      if (e.spectators) io.to(spectatorRoom(roomId)).emit(e.event, payload);
    }
  }
  if (votesChanged) {
    const vh = { history: voteHistoryOf(state), round: state.round ?? null };
    io.to(roomId).emit('day:vote-history', vh);
    io.to(spectatorRoom(roomId)).emit('day:vote-history', vh);
  }
  // روسترٌ جديد لكلّ هاتف ومتفرّج: الموتى بأدوارهم، والعدّاد
  await emitStateToPhones(io, roomId, 'game:state-sync', state);
  console.log(`📱 [phone-hold] أُطلق للهواتف: ${done.map(g => `${g.id}[${g.seats.join(',')}]`).join(' · ')} — غرفة ${roomId}`);
}

/** 📺 الشاشةُ تُبلغ: «قُلبت هذه البطاقات الآن» (lib/countGate → teamCardRevealed) */
export function registerPhoneHoldEvents(io: Server, socket: Socket) {
  socket.on('display:card-flipped', async (data: { seats?: Array<number | string> }) => {
    try {
      if ((socket.data as any)?.role !== 'display') return;
      const roomId = String((socket.data as any)?.roomId || '');
      const seats = uniq(Array.isArray(data?.seats) ? data.seats : []);
      if (!roomId || !seats.length) return;
      await ackFlippedSeats(io, roomId, seats);
    } catch (e: any) { console.warn('⚠️ [phone-hold] ack:', e?.message); }
  });
}
