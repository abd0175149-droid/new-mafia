// ══════════════════════════════════════════════════════
// 🧪 الخطّة الموحّدة — لعبةٌ افتراضيّة كاملة على المعالجات الحقيقيّة (سوكِتات وهميّة، بلا Redis ولا DB)
//
// 16 لاعباً افتراضيّاً + 3 منتظرين. يمرّ بكلّ ما بُني:
//   الطاولة ⟵ التحضير (prepare-deal بكرتٍ مكرَّر) ⟵ 📌 تثبيت ⟵ ⇄ تبديل ⟵ ✏️ تغيير كرت ⟵ 📋 الاعتماد
//   ⟵ «اعتمد وأرسل» ⟵ «ابدأ» ⟵ 🔍 سؤال الشريف (الكرت وحده) ⟵ 🃏 أداة الكروت عند النقطة الآمنة
//   ⟵ 🚪 بوّابة الليل الأوّل والتجنيد ⟵ «مافيا قادم» وحكم الفوز ⟵ الطرد يفحص الفوز.
// لا يُكتب شيءٌ خارج هذه العمليّة.
//
// تشغيل: FORCE_FLAGS=live_cards_v1 npx tsx src/scripts/test-unified-flow.ts
// ══════════════════════════════════════════════════════
process.env.FORCE_FLAGS = process.env.FORCE_FLAGS || 'live_cards_v1';
import { registerLobbyEvents } from '../sockets/lobby.socket.js';
import { registerSetupV2Events } from '../sockets/setup-v2.socket.js';
import { registerLiveCardEvents, applySafePoint } from '../sockets/live-cards.socket.js';
import { registerNightEvents } from '../sockets/night.socket.js';
import { createRoom, getRoom } from '../game/state.js';
import { setGameState } from '../config/redis.js';
import { primeTestDefs } from './_game-fixtures.js';

let pass = 0, fail = 0; const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

const all: any[] = [];
const emitted: Array<{ to: string; ev: string; payload: any }> = [];
let seq = 0;
function mkSocket(data: any = {}) {
  const handlers = new Map<string, Function>();
  const s: any = {
    id: `sk${++seq}`, data: { ...data }, rooms: new Set<string>(),
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
    call: (ev: string, d: any): Promise<any> => new Promise((resolve, reject) => {
      const h = handlers.get(ev);
      if (!h) return reject(new Error(`no handler ${ev}`));
      const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), 20000);
      Promise.resolve(h(d, (r: any) => { clearTimeout(t); resolve(r); })).catch((e) => { clearTimeout(t); reject(e); });
    }),
  };
}
const io: any = {
  to: (room: string) => ({ emit: (ev: string, payload: any) => { emitted.push({ to: room, ev, payload }); return true; } }),
  in: (room: string) => ({ fetchSockets: async () => all.filter((s) => s.rooms.has(room)), emit: () => true }),
  emit: () => true, sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
};
io.of = () => io;
const reg = (x: ReturnType<typeof mkSocket>) => { registerLobbyEvents(io, x.s); registerSetupV2Events(io, x.s); registerLiveCardEvents(io, x.s); registerNightEvents(io, x.s); return x; };
const since = (n: number) => emitted.slice(n);

async function main() {
  primeTestDefs();
  const leader = reg(mkSocket({ role: 'leader', authStaff: { id: 1, role: 'admin' } }));
  const st0 = await createRoom('لعبة افتراضيّة — الخطّة الموحّدة', 20);
  const roomId = st0.roomId;
  leader.s.join(roomId); leader.s.data.roomId = roomId;

  console.log('\n━━━ ١) الطاولة: 16 لاعباً افتراضيّاً ━━━');
  const phones: Array<ReturnType<typeof mkSocket>> = [];
  for (let i = 1; i <= 16; i++) {
    const r = await leader.call('room:force-add-player', { roomId, physicalId: i, name: `افتراضيّ ${i}`, phone: `0791200${String(i).padStart(3, '0')}`, dob: '1995-01-01', gender: 'MALE' });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
    const ph = reg(mkSocket({ role: 'player', roomId, physicalId: i }));
    ph.s.join(roomId); phones.push(ph);
  }
  const roster = await leader.call('room:roster', { roomId, excluded: [] });
  check('العدد الفعليّ من الخادم: 16 سيلعبون', roster?.roster?.playing === 16, JSON.stringify(roster?.roster));

  console.log('\n━━━ ٢) اللعبة والكروت ⟵ التحضير بطلبٍ واحد ━━━');
  await leader.call('room:update-settings', { roomId, gameTimerMinutes: 75, nightKind: 'one', nightSeconds: 60 });
  let st: any = await getRoom(roomId);
  check('الوقت 75 دقيقة', st.config.gameTimerMinutes === 75 && st.config.gameTimerEnabled === true);
  const roles = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR', 'SHERIFF', 'DOCTOR', 'SNIPER', 'SNIPER', 'POLICEWOMAN', 'NURSE', 'MAYOR', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'JESTER'];
  const gen = await leader.call('room:start-generation', { roomId, supportsAbsentPrompt: true });
  check('بدء التوليد', gen?.success === true, JSON.stringify(gen));
  const prep = await leader.call('setup:prepare-deal', { roomId, roles, supportsDuplicatePrompt: true, confirmDuplicates: true, jesterSurviveRounds: 3, mayorVoteWeight: 3 });
  st = await getRoom(roomId);
  check('prepare-deal: الحوض والتوزيع معاً', prep?.success === true && st.phase === 'ROLE_BINDING' && st.players.every((p: any) => !!p.role), JSON.stringify(prep).slice(0, 200));
  check('قنّاصان (مكرّر مسموح)', st.players.filter((p: any) => p.role === 'SNIPER').length === 2 && st.config.duplicateRoles === true);
  const tooMany = await leader.call('setup:change-card', { roomId, seat: st.players.find((p: any) => p.role === 'CITIZEN').physicalId, role: 'GODFATHER' });
  check('شيخٌ ثانٍ مرفوض', tooMany?.success === false);

  console.log('\n━━━ ٣) التوزيع: 📌 تثبيت · ⇄ تبديل · ✏️ تغيير ━━━');
  const pin = await leader.call('setup:pin-role', { roomId, seat: 1, role: 'SHERIFF' });
  st = await getRoom(roomId);
  check('📌 الشريف على المقعد 1', pin?.success === true && st.players[0].role === 'SHERIFF');
  const r2 = st.players[1].role, r3 = st.players[2].role;
  const sw = await leader.call('setup:swap-roles', { roomId, a: 2, b: 3, expectedRev: st.bindingRev });
  st = await getRoom(roomId);
  check('⇄ تبديل 2 و3', sw?.success === true && st.players[1].role === r3 && st.players[2].role === r2);
  const stale = await leader.call('setup:swap-roles', { roomId, a: 4, b: 5, expectedRev: 1 });
  check('نسخةٌ قديمة من جهازٍ آخر تُرفض', stale?.success === false && stale.code === 'BINDING_CHANGED');
  const redeal = await leader.call('setup:redeal', { roomId });
  st = await getRoom(roomId);
  check('🎲 أعد الخلط: المثبَّت باقٍ', redeal?.success === true && st.players[0].role === 'SHERIFF');
  const citSeat = st.players.find((p: any) => p.role === 'CITIZEN' && p.physicalId > 3).physicalId;
  const ch = await leader.call('setup:change-card', { roomId, seat: citSeat, role: 'DOCTOR' });
  st = await getRoom(roomId);
  check('✏️ مواطن ⟵ طبيب ثانٍ', ch?.success === true && st.players.filter((p: any) => p.role === 'DOCTOR').length === 2);
  const rv = await leader.call('setup:review', { roomId });
  check('📋 الاعتماد: 4 مافيا · 11 مدينة · 1 مستقلّ', rv?.review?.counts?.mafia === 4 && rv.review.counts.citizen === 11 && rv.review.counts.neutral === 1, JSON.stringify(rv?.review?.counts));
  check('📋 المكرّر بشروطه', (rv.review.duplicates || []).map((d: any) => d.role).sort().join(',') === 'DOCTOR,SNIPER');
  check('📋 الإعدادات: 75 دقيقة', rv.review.settings.minutes === 75);

  console.log('\n━━━ ٤) اعتمد وأرسل ⟵ تغيير ⟵ «راجع بطاقتك» ━━━');
  let mark = emitted.length;
  const sent = await leader.call('setup:confirm-roles', { roomId, expectedRev: rv.review.rev });
  check('أُرسلت الكروت', sent?.success === true);
  check('كلّ الهواتف تلقّت كرتها', since(mark).filter((e) => e.ev === 'player:role-assigned').length === 16);
  mark = emitted.length;
  await leader.call('setup:swap-roles', { roomId, a: 5, b: 6 });
  st = await getRoom(roomId);
  check('تغييرٌ بعد الإرسال يُسقط «أُرسلت»', st.rolesConfirmed === false);
  const rv2 = await leader.call('setup:review', { roomId });
  mark = emitted.length;
  await leader.call('setup:confirm-roles', { roomId, expectedRev: rv2.review.rev });
  const re = since(mark).filter((e) => e.ev === 'player:role-assigned');
  check('الإرسال الثاني: «راجع بطاقتك» على كلّ الهواتف', re.length === 16 && re.every((e) => e.payload.reviewCard === true));
  const start = await leader.call('setup:binding-complete', { roomId });
  st = await getRoom(roomId);
  check('ابدأ اللعبة', start?.success === true && st.phase === 'DAY_DISCUSSION', JSON.stringify(start).slice(0, 160));

  console.log('\n━━━ ٥) 🔍 سؤال الشريف: الكرت وحده ━━━');
  st = await getRoom(roomId);
  const mafiaSeat = st.players.find((p: any) => p.role === 'MAFIA_REGULAR').physicalId;
  st.phase = 'MORNING_RECAP'; st.round = 2;
  st.morningEvents = [{ type: 'SHERIFF_RESULT', targetPhysicalId: mafiaSeat, targetName: `افتراضيّ ${mafiaSeat}`, extra: { result: 'MAFIA', team: 'MAFIA', performerPhysicalId: 1 }, revealed: false }];
  await setGameState(roomId, st);
  mark = emitted.length;
  await leader.call('night:display-event', { roomId, eventIndex: 0 });
  const de = since(mark).find((e) => e.ev === 'display:morning-event');
  check('الشاشة: نوع SHERIFF_CARD ونتيجة «مافيا»', de?.payload?.type === 'SHERIFF_CARD' && de.payload.extra?.result === 'MAFIA', JSON.stringify(de?.payload));
  check('الشاشة: لا رقم ولا اسم ولا دور', de && de.payload.targetPhysicalId === undefined && de.payload.targetName === undefined && !JSON.stringify(de.payload).includes(`افتراضيّ ${mafiaSeat}`) && !JSON.stringify(de.payload).includes('MAFIA_REGULAR'));
  check('لا شيء منه يصل الهواتف', !since(mark).some((e) => e.ev === 'display:morning-event' && phones.some((p) => p.s.id === e.to)));

  console.log('\n━━━ ٦) 🃏 أداة الكروت عند «ابدأ النهار» ━━━');
  st = await getRoom(roomId);
  const cit = st.players.find((p: any) => p.role === 'CITIZEN').physicalId;
  const qd = await leader.call('cards:queue', { roomId, op: { kind: 'change', seat: cit, role: 'SNIPER' } });
  check('تغيير داخل الفريق يدخل الطابور', qd?.success === true && qd.when === 'ابدأ النهار', JSON.stringify(qd).slice(0, 160));
  const cross = await leader.call('cards:queue', { roomId, op: { kind: 'change', seat: st.players.find((p: any) => p.role === 'CITIZEN' && p.physicalId !== cit).physicalId, role: 'MAFIA_REGULAR' } });
  check('ما يعبر الفريقين بلا رقم الأدوات مرفوض', cross?.success === false && cross.code === 'TOOLS_LOCKED');
  st = await getRoom(roomId);
  check('لم يتغيّر الكرت قبل النقطة الآمنة', st.players.find((p: any) => p.physicalId === cit).role === 'CITIZEN');
  mark = emitted.length;
  await applySafePoint(io, roomId, st, 'day');
  st = await getRoom(roomId);
  check('عند النقطة الآمنة: صار قنّاصاً', st.players.find((p: any) => p.physicalId === cit).role === 'SNIPER');
  const rc = since(mark).filter((e) => e.ev === 'player:review-card');
  check('«راجع بطاقتك» على كلّ الهواتف الحيّة بالسطر نفسه', rc.length === st.players.filter((p: any) => p.isAlive !== false).length, String(rc.length));

  console.log('\n━━━ ٧) 🚪 بوّابة الليل الأوّل ━━━');
  st = await getRoom(roomId);
  st.phase = 'DAY_DISCUSSION'; st.round = 1; st.morningEvents = [];
  st.config.lateEntry = { enabled: true, waves: [{ at: 1, count: 3, mafia: 1 }], recompute: true };
  st.spectators = [17, 18, 19].map((n) => ({ physicalId: n, name: `متأخّر ${n}`, phone: `0791300${n}`, playerId: null, joinedAt: Date.now() + n }));
  await setGameState(roomId, st);
  const cnt = await leader.call('late:gate-info', { roomId });
  check('«مافيا قادم» 1 قبل البوّابة', cnt?.incoming?.incomingMafia === 1);
  const ns = await leader.call('night:start', { roomId, oneNight: true, supportsLateGate: true });
  check('night:start يتوقّف عند البوّابة', ns?.success === false && ns.code === 'LATE_GATE' && ns.gate?.waiting?.length === 3, JSON.stringify(ns).slice(0, 200));
  const before = (await getRoom(roomId) as any).players.filter((p: any) => p.role && ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(p.role)).length;
  const og = await leader.call('late:open-gate', { roomId, seats: [17, 18, 19] });
  st = await getRoom(roomId);
  const after = st.players.filter((p: any) => p.role && ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(p.role)).length;
  check('دخل الثلاثة لاعبين بكروت', og?.success === true && [17, 18, 19].every((s) => st.players.some((p: any) => p.physicalId === s && p.role)), JSON.stringify(og).slice(0, 160));
  check('الدفعة حملت مافيا واحداً (داخلاً أو مجنَّداً)', after - before === 1, `${before}→${after}`);
  check('الدفعة مُغلقة و«قادم» صفر', st.config.lateEntry.waves[0].done === true && (await leader.call('late:gate-info', { roomId })).incoming.incomingMafia === 0);
  check('الداخلون محصّنون ليلتهم', [17, 18, 19].every((s) => st.players.find((p: any) => p.physicalId === s).lateImmuneRound === 2));
  const ns2 = await leader.call('night:start', { roomId, oneNight: true, supportsLateGate: true });
  check('بعد البوّابة: الليل يبدأ', ns2?.success === true && (await getRoom(roomId) as any).phase === 'NIGHT', JSON.stringify(ns2).slice(0, 160));

  console.log('\n━━━ ٨) الطرد أثناء اللعب يفحص الفوز ━━━');
  st = await getRoom(roomId);
  st.phase = 'DAY_DISCUSSION'; st.pendingWinner = null; st.winner = null;
  // يبقى مافيا واحد: يُطرد ⇒ المدينة تفوز
  const mafiaAlive = st.players.filter((p: any) => p.isAlive !== false && ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(p.role));
  mafiaAlive.slice(1).forEach((p: any) => { p.isAlive = false; });
  await setGameState(roomId, st);
  const kick = await leader.call('room:kick-player', { roomId, physicalId: mafiaAlive[0].physicalId });
  st = await getRoom(roomId);
  check('الطرد لا يحذف الدور (ميّت موسوم)', kick?.eliminated === true && st.players.some((p: any) => p.physicalId === mafiaAlive[0].physicalId && p.isAlive === false && p.leaderKicked));
  check('…ويحسم الفوز للمدينة', st.pendingWinner === 'CITIZEN', String(st.pendingWinner));
  const add = await leader.call('room:override-player', { roomId, physicalId: 20, name: 'متطفّل', isNew: true });
  check('«إضافة لاعب» أثناء اللعب مرفوضة', add?.success === false);

  console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('💥', e); process.exit(1); });
