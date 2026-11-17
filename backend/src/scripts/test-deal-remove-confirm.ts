// ══════════════════════════════════════════════════════
// 🧪 حذف الديل يحتاج تأكيد الليدر (2026-11-17) — مسار السوكِت الحقيقيّ
//
// لاعبٌ ألغى ديله بالخطأ في لعبةٍ حيّة، وقفلُ الجولات منعه من تسجيله ثانية.
// الآن: طلبُ اللاعب يصل الليدر ولا يحذف؛ الليدر وحده ينفّذ الحذف.
// بلا Redis (مخزن الذاكرة) وبلا قاعدة بيانات.
//
// تشغيل: npx tsx src/scripts/test-deal-remove-confirm.ts
// ══════════════════════════════════════════════════════

import { registerDayEvents } from '../sockets/day.socket.js';
import { createRoom, Phase } from '../game/state.js';
import { getGameState, setGameState, deleteGameState } from '../config/redis.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const all: any[] = [];
const emitted: Array<{ to: string; ev: string; payload: any }> = [];
let seq = 0;
function mkSocket(role: string, physicalId?: number) {
  const handlers = new Map<string, Function>();
  const s: any = {
    id: `sk${++seq}`, data: { role, physicalId }, rooms: new Set<string>(),
    handshake: { address: '127.0.0.1', headers: {}, auth: {}, query: {} },
    on: (ev: string, fn: Function) => { handlers.set(ev, fn); return s; },
    join: (r: string) => { s.rooms.add(r); }, leave: (r: string) => { s.rooms.delete(r); },
    emit: (ev: string, payload: any) => { emitted.push({ to: s.id, ev, payload }); return true; },
    to: () => ({ emit() { return true; } }), broadcast: { to: () => ({ emit() { return true; } }), emit() { return true; } },
    disconnect() {},
  };
  all.push(s);
  registerDayEvents(io, s);
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

const P = (seat: number): any => ({ physicalId: seat, name: `لاعب ${seat}`, phone: null, playerId: 9000 + seat, role: 'CITIZEN', isAlive: true, isSilenced: false, justificationCount: 0, gender: 'MALE' });
const dealsOf = async (roomId: string) => ((await getGameState(roomId)) as any).votingState.deals as any[];

async function main() {
  const st: any = await createRoom('فحص تأكيد حذف الديل', 10);
  const roomId: string = st.roomId;
  st.players = [1, 2, 3, 4, 5, 6].map(P);
  st.phase = Phase.DAY_DISCUSSION;
  st.round = 2;
  st.rolesConfirmed = true;
  await setGameState(roomId, st);

  const leader = mkSocket('leader');
  const display = mkSocket('display');
  const owner = mkSocket('player', 2);     // صاحب الديل
  const other = mkSocket('player', 5);     // لاعبٌ آخر
  for (const x of [leader, display, owner, other]) { x.s.join(roomId); x.s.data.roomId = roomId; }

  console.log('\n━━━ أ) اللاعب يطلب إلغاء ديله: لا حذف، والطلب يصل الليدر ━━━');
  const made = await owner.call('day:create-deal', { roomId, initiatorPhysicalId: 2, targetPhysicalId: 4 });
  check('اللاعب يسجّل ديله', made?.success === true && made.deals.length === 1, JSON.stringify(made));
  const dealId: string = made.deals[0].id;

  const stranger = await other.call('day:remove-deal', { roomId, dealId });
  check('لاعبٌ آخر لا يلغي ديل غيره', stranger?.success === false && (await dealsOf(roomId)).length === 1);
  check('…ولا يصل الليدرَ طلبٌ منه', !emitted.some((e) => e.ev === 'day:deal-remove-request'));

  const before = emitted.length;
  const asked = await owner.call('day:remove-deal', { roomId, dealId });
  check('طلب صاحبه لا يحذف', asked?.success === false && asked.pending === true && asked.code === 'LEADER_CONFIRM', JSON.stringify(asked));
  check('…والديل باقٍ', (await dealsOf(roomId)).length === 1);
  check('…ونصّ الردّ يشرح للّاعب', /تأكيده/.test(asked?.error || ''), asked?.error);
  const fresh = emitted.slice(before);
  const req = fresh.find((e) => e.to === leader.s.id && e.ev === 'day:deal-remove-request');
  check('الليدر وصله الطلب بتفاصيله', !!req && req.payload.dealId === dealId && req.payload.initiatorPhysicalId === 2 && req.payload.targetPhysicalId === 4 && req.payload.initiatorName === 'لاعب 2', JSON.stringify(req?.payload));
  check('…والشاشة والهواتف لم يصلها الطلب', !fresh.some((e) => e.ev === 'day:deal-remove-request' && e.to !== leader.s.id));
  check('…ولا بثّ «حُذف الديل»', !fresh.some((e) => e.ev === 'day:deal-removed'));

  console.log('\n━━━ ب) الليدر يؤكّد: يُحذف ━━━');
  const done = await leader.call('day:remove-deal', { roomId, dealId });
  check('حذف الليدر ينفَّذ', done?.success === true && done.deals.length === 0, JSON.stringify(done));
  check('…ويُبثّ للغرفة', emitted.some((e) => e.to === roomId && e.ev === 'day:deal-removed'));
  const again = await owner.call('day:create-deal', { roomId, initiatorPhysicalId: 2, targetPhysicalId: 4 });
  check('القفل قائم: صاحبه لا يسجّل ديلاً ثانياً هذه الجولة', again?.success === false, JSON.stringify(again));

  console.log('\n━━━ ج) الحدود ━━━');
  const made2 = await leader.call('day:create-deal', { roomId, initiatorPhysicalId: 5, targetPhysicalId: 6 });
  const deal2: string = made2.deals[0].id;
  leader.s.rooms.delete(roomId);            // لا ليدر في الغرفة
  const noLeader = await other.call('day:remove-deal', { roomId, dealId: deal2 });
  check('بلا ليدر متّصل: لا حذف، ورسالة واضحة', noLeader?.success === false && noLeader.pending === false && (await dealsOf(roomId)).length === 1, JSON.stringify(noLeader));
  leader.s.rooms.add(roomId);

  const s: any = await getGameState(roomId);
  s.phase = Phase.DAY_VOTING;
  await setGameState(roomId, s);
  const late = await other.call('day:remove-deal', { roomId, dealId: deal2 });
  check('خارج النقاش يُرفض طلب اللاعب كما كان', late?.success === false && late.code !== 'LEADER_CONFIRM', JSON.stringify(late));

  s.phase = Phase.DAY_DISCUSSION; s.config.isRemote = true;
  await setGameState(roomId, s);
  const remote = await other.call('day:remove-deal', { roomId, dealId: deal2 });
  check('الغرف البعيدة على سلوكها السابق: يُحذف فوراً', remote?.success === true && (await dealsOf(roomId)).length === 0, JSON.stringify(remote));

  await deleteGameState(roomId);
  await deleteGameState(`code:${st.roomCode}`);
  console.log(`\n═══ النتيجة ═══\n\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('💥', e); process.exit(2); });
