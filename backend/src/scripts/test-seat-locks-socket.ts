// ══════════════════════════════════════════════════════
// 🧪 إغلاق المقاعد — مسار السوكِت الحقيقيّ (room:auto-join · room:seat-locks · force-add)
//
// يركّب معالجات lobby.socket الحقيقيّة على سوكِتاتٍ وهميّة، بلا Redis (مخزن الذاكرة) وبلا
// قاعدة بيانات: لا يُكتب شيءٌ خارج هذه العمليّة. يفحص ما لا يراه الفحص المحض: أنّ البوّابة
// تُفتح تحت القفل، أنّ المنتظر يُنبَّه ويجلس، وأنّ قرار الليدر يغلب.
//
// تشغيل: npx tsx src/scripts/test-seat-locks-socket.ts
// ══════════════════════════════════════════════════════

import { registerLobbyEvents } from '../sockets/lobby.socket.js';
import { createRoom, getRoom } from '../game/state.js';
import { deleteGameState } from '../config/redis.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── سوكِتات وخادم وهميّان ──
const all: any[] = [];
const emitted: Array<{ to: string; ev: string; payload: any }> = [];
let seq = 0;
function mkSocket(role?: string) {
  const handlers = new Map<string, Function>();
  const s: any = {
    id: `sk${++seq}`, data: role ? { role } : {}, rooms: new Set<string>(),
    handshake: { address: '127.0.0.1', headers: {}, auth: {}, query: {} },
    on: (ev: string, fn: Function) => { handlers.set(ev, fn); return s; },
    join: (r: string) => { s.rooms.add(r); }, leave: (r: string) => { s.rooms.delete(r); },
    emit: (ev: string, payload: any) => { emitted.push({ to: s.id, ev, payload }); return true; },
    to: () => ({ emit() { return true; } }), broadcast: { to: () => ({ emit() { return true; } }), emit() { return true; } },
    disconnect() {},
  };
  all.push(s);
  return {
    s,
    call: (ev: string, data: any): Promise<any> => new Promise((resolve, reject) => {
      const h = handlers.get(ev);
      if (!h) return reject(new Error(`no handler ${ev}`));
      const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), 15000);
      Promise.resolve(h(data, (r: any) => { clearTimeout(t); resolve(r); })).catch((e) => { clearTimeout(t); reject(e); });
    }),
  };
}
const io: any = {
  to: (room: string) => ({ emit: (ev: string, payload: any) => { emitted.push({ to: room, ev, payload }); return true; } }),
  in: (room: string) => ({ fetchSockets: async () => all.filter((s) => s.rooms.has(room)), emit: () => true }),
  emit: () => true, sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
};
io.of = () => io;

const leader = mkSocket('leader');
registerLobbyEvents(io, leader.s);
const player = (n: number) => { const p = mkSocket(); registerLobbyEvents(io, p.s); return { ...p, body: { name: `لاعب ${n}`, phone: `07911000${String(n).padStart(2, '0')}`, gender: 'MALE' } }; };
const join = (p: ReturnType<typeof player>, roomId: string, extra: any = {}) => p.call('room:auto-join', { roomId, ...p.body, ...extra });
const lastTo = (to: string, ev: string) => [...emitted].reverse().find((e) => e.to === to && e.ev === ev);
const rooms: string[] = [];

async function main() {
  console.log('\n━━━ أ) القاعدة «وحدها»: الدفعة تُفتح عند العتبة ━━━');
  {
    const st = await createRoom('فحص الإغلاق أ', 8);
    const roomId = st.roomId; rooms.push(roomId);
    leader.s.join(roomId); leader.s.data.roomId = roomId;

    const denied = await player(99).call('room:seat-locks', { roomId, op: 'save', map: { 1: 0 } });
    check('غير الليدر لا يغيّر الإغلاق', denied?.success === false);

    const saved = await leader.call('room:seat-locks', { roomId, op: 'save', map: { 1: 1, 5: 1, 3: 2, 7: 2 }, rule: { mode: 'auto', threshold: 1 } });
    check('الليدر يحفظ الإغلاق', saved?.success === true && Object.keys(saved.seatLocks.map).length === 4, JSON.stringify(saved));
    check('…ويصل الليدرَ حدث room:seat-locks', !!lastTo(leader.s.id, 'room:seat-locks'));
    check('…ولا يصل لاعباً خارج الغرفة', !emitted.some((e) => e.ev === 'room:seat-locks' && e.to !== leader.s.id));

    const seats: number[] = [];
    const ps = [1, 2, 3, 4, 5, 6, 7, 8].map(player);
    for (let i = 0; i < 3; i++) {
      const r = await join(ps[i], roomId);
      check(`داخل ${i + 1} يجلس على مفتوح`, r?.success === true && [2, 4, 6, 8].includes(r.assignedSeat), JSON.stringify({ ok: r?.success, seat: r?.assignedSeat, err: r?.error }));
      if (r?.assignedSeat) seats.push(r.assignedSeat);
    }
    const after3: any = await getRoom(roomId);
    check('بعد الثالث (بقي مفتوحٌ واحد): فُتحت الدفعة الأولى وحدها', after3.seatLocks.map['1'] === undefined && after3.seatLocks.map['5'] === undefined && after3.seatLocks.map['3'] === 1, JSON.stringify(after3.seatLocks.map));
    const ev = lastTo(leader.s.id, 'room:seat-locks');
    check('…وبُلّغ الليدر بفتحٍ آليّ فيه الكراسي', ev?.payload?.event?.type === 'opened' && ev.payload.event.by === 'auto' && String(ev.payload.event.chairs) === '1,5', JSON.stringify(ev?.payload?.event));

    for (let i = 3; i < 8; i++) {
      const r = await join(ps[i], roomId);
      check(`داخل ${i + 1} يجلس بلا انتظار`, r?.success === true && r.assignedSeat >= 1, JSON.stringify({ ok: r?.success, seat: r?.assignedSeat, code: r?.code, err: r?.error }));
      if (r?.assignedSeat) seats.push(r.assignedSeat);
    }
    check('الثمانية على ثمانية كراسٍ مختلفة', new Set(seats).size === 8, seats.join(','));
    const end: any = await getRoom(roomId);
    check('…ولا إغلاق باقٍ', Object.keys(end.seatLocks.map).length === 0);
    const ninth = await join(player(9), roomId);
    check('التاسع: القاعة ممتلئة فعلاً ⇒ رفضٌ لا انتظار', ninth?.success === false && ninth.seatWait !== true, JSON.stringify(ninth));
  }

  console.log('\n━━━ ب) القاعدة «بإذني»: ينتظر الداخل حتى يفتح الليدر ━━━');
  {
    const st = await createRoom('فحص الإغلاق ب', 8);
    const roomId = st.roomId; rooms.push(roomId);
    leader.s.join(roomId);
    await leader.call('room:seat-locks', { roomId, op: 'save', map: { 1: 1, 3: 1, 5: 2, 7: 0 }, rule: { mode: 'ask', threshold: 0 } });
    const ps = [11, 12, 13, 14, 15, 16].map(player);
    for (let i = 0; i < 4; i++) await join(ps[i], roomId);
    const full: any = await getRoom(roomId);
    check('أربعة على الزوجيّة', full.players.length === 4 && full.players.every((p: any) => p.physicalId % 2 === 0));
    check('بلغ المفتوح العتبة ⇒ ظهر الشريط', full.seatLocks.pending === true);

    emitted.length = 0;
    const w = await join(ps[4], roomId);
    check('الخامس ينتظر: seatWait ورمز SEAT_WAIT', w?.success === false && w.seatWait === true && w.code === 'SEAT_WAIT', JSON.stringify(w));
    check('…ودخل غرفة الانتظار', ps[4].s.rooms.has(`${roomId}:seat-wait`));
    const waiting: any = await getRoom(roomId);
    check('…وسُجّل عند الليدر', waiting.seatLocks.waiters.length === 1 && waiting.seatLocks.waiters[0].name === 'لاعب 15');
    check('…ولم يدخل قائمة اللاعبين', waiting.players.length === 4);
    const wm = await join(ps[4], roomId, { supportsSeatChoice: true });
    check('عميل الاختيار اليدويّ يتلقّى الانتظار نفسه', wm?.seatWait === true);

    const opened = await leader.call('room:seat-locks', { roomId, op: 'open-next' });
    check('الليدر يفتح الدفعة', opened?.success === true && String(opened.opened) === '1,3', JSON.stringify(opened));
    check('…فيُنبَّه المنتظرون', !!lastTo(`${roomId}:seat-wait`, 'room:seats-opened'));
    const r5 = await join(ps[4], roomId);
    check('يعيد الطلب فيجلس على ما فُتح', r5?.success === true && [1, 3].includes(r5.assignedSeat), JSON.stringify({ ok: r5?.success, seat: r5?.assignedSeat }));
    const seated: any = await getRoom(roomId);
    check('…ويُشطب من المنتظرين ويغادر غرفة الانتظار', (seated.seatLocks.waiters || []).length === 0 && !ps[4].s.rooms.has(`${roomId}:seat-wait`));

    const undo = await leader.call('room:seat-locks', { roomId, op: 'undo' });
    check('تراجع: يُعاد إغلاق الفارغ ممّا فُتح', undo?.success === true && undo.reclosed.length === 1, JSON.stringify(undo?.reclosed));
    const later = await leader.call('room:seat-locks', { roomId, op: 'later' });
    check('لاحقاً: يختفي الشريط', later?.success === true && later.seatLocks.pending === false);

    // قرار الليدر يغلب: يُجلس لاعباً على المغلق الدائم
    const forced = await leader.call('room:force-add-player', { roomId, physicalId: 7, name: 'ضيف الليدر', phone: '0791100077', dob: '2000-01-01', gender: 'MALE' });
    check('الليدر يُجلس على كرسيّ مغلق دائماً', forced?.success === true, JSON.stringify(forced));
    const fs: any = await getRoom(roomId);
    check('…والإغلاق باقٍ على الكرسيّ', fs.seatLocks.map['7'] === 0 && fs.players.some((p: any) => p.physicalId === 7));

    const patched = await leader.call('room:seat-locks', { roomId, op: 'patch', patch: { 5: null } });
    check('لمسة: فتح كرسيّ بعينه', patched?.success === true && patched.seatLocks.map['5'] === undefined);
    const bad = await leader.call('room:seat-locks', { roomId, op: 'nope' });
    check('عمليّة مجهولة تُرفض', bad?.success === false);
  }

  console.log('\n━━━ ج) بلا إغلاق: الانضمام كما كان ━━━');
  {
    const st = await createRoom('فحص الإغلاق ج', 6);
    const roomId = st.roomId; rooms.push(roomId);
    const r = await join(player(31), roomId);
    check('غرفة بلا إغلاق: الانضمام ينجح', r?.success === true && r.assignedSeat >= 1, JSON.stringify({ ok: r?.success, err: r?.error }));
    const s: any = await getRoom(roomId);
    check('…ولا تُنشأ حالة إغلاق من نفسها', s.seatLocks === undefined);
  }
}

main()
  .catch((e) => { fail++; failures.push(`انهيار: ${e?.stack || e}`); console.log('💥', e?.stack || e); })
  .finally(async () => {
    for (const r of rooms) { try { await deleteGameState(r); } catch { /* */ } }
    console.log(`\n══════ ${pass} نجح · ${fail} فشل ══════`);
    if (fail) console.log(failures.map((f) => ' ✗ ' + f).join('\n'));
    process.exit(fail ? 1 : 0);
  });
