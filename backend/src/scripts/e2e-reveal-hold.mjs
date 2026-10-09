// ══════════════════════════════════════════════════════
// 🧪 اختبار وظيفيّ حيّ: لا شيءَ عن إقصاءٍ أو حدثِ ليلٍ يصل الهاتف قبل شاشة القاعة (2026-10-09)
// ══════════════════════════════════════════════════════
// ١. قبل «كشف الأدوار»: «بانتظار الإعلان» وحده — لا أرقام، ولا حياةٌ ساقطة في الاستطلاع، ولا عدّاد.
// ٢. بعد الضغطة: الشاشة تستلم فوراً، والهواتف محبوسةٌ حتّى تُبلغ الشاشةُ بقلب البطاقة.
// ٣. بلا تبليغ: تُطلق الهواتف بعد مهلة الأمان. وبلا شاشةٍ متّصلة: فوراً.
// ٤. الطردُ بالعقوبات: الخروجُ علنيّ والدورُ والعدّادُ مع الكرت.
// ٥. الليل: قتيلٌ يبقى حيّاً على الهاتف حتّى يُعرض حدثُه ويُقلب كرتُه.
//
// ⚠️ غرفٌ في «Test Location» (#3) تُحذف في النهاية؛ لا مباراةَ تُحتسب.
// التشغيل على الخادم (من ~/e2e-tools):
//   TOKEN=$(docker exec mafia-prod-backend-1 node -e "const j=require('jsonwebtoken');console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'30m'}))")
//   MAFIA_STAFF_TOKEN=$TOKEN MAFIA_URL=http://localhost:4000 node e2e-reveal-hold.mjs
// ══════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let io;
try {
  const req = createRequire(path.join(__dirname, '../../../frontend/package.json'));
  ({ io } = req('socket.io-client'));
} catch {
  const req = createRequire(import.meta.url);
  ({ io } = req('socket.io-client'));
}

const URL = process.env.MAFIA_URL || 'http://localhost:4000';
const TOKEN = process.env.MAFIA_STAFF_TOKEN;
if (!TOKEN) { console.error('❌ MAFIA_STAFF_TOKEN مطلوب'); process.exit(1); }

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; failures.push(n + (d ? ` — ${d}` : '')); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const RUN = String(Date.now()).slice(-5);
const rpc = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 20000);
  s.emit(ev, payload, (r) => { clearTimeout(t); res(r); });
});
const connect = (auth) => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], auth, reconnection: false, timeout: 20000 });
  s.on('connect', () => res(s));
  s.on('connect_error', rej);
});
const key = (c) => c ? `${c.citizenAlive}/${c.mafiaAlive}/${c.neutralAlive ?? 0}` : 'null';

const allSockets = [];
const rooms = [];
const leader = await connect({ token: TOKEN, leaderToken: TOKEN });

async function setupRoom(tag, withDisplay) {
  let generated = null;
  const onGen = d => { generated = [...(d.mafiaRoles || []), ...(d.citizenRoles || []), ...(d.neutralRoles || [])]; };
  leader.on('setup:roles-generated', onGen);
  const created = await rpc(leader, 'room:create', { gameName: `فحص الحبس ${tag} ${RUN}`, maxPlayers: 12, maxJustifications: 2, locationId: 3 });
  const roomId = created.roomId || created.state?.roomId;
  rooms.push(roomId);
  leader.emit('room:rejoin-leader', { roomId });
  for (let i = 1; i <= 6; i++) {
    const r = await rpc(leader, 'room:force-add-player', { roomId, physicalId: i, name: `ضيف${i}`, phone: `0795${tag}${RUN}`.slice(0, 9) + i, dob: '1995-01-01', gender: 'MALE' });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
  }
  const phones = [];
  for (const t of ['أ', 'ب']) {
    const s = await connect({}); allSockets.push(s);
    const ev = []; s.onAny((e, d) => ev.push({ e, d, t: Date.now() }));
    const phone = `079${t === 'أ' ? 7 : 8}${tag}${RUN}`.slice(0, 10);
    const j = await rpc(s, 'room:auto-join', { roomId, name: `هاتف-${t}`, gender: 'MALE', phone });
    if (!j?.success) throw new Error(`join ${t}: ${j?.error}`);
    phones.push({ s, t, phone, seat: Number(j.assignedSeat ?? j.physicalId), ev });
  }
  await rpc(leader, 'room:start-generation', { roomId, supportsAbsentPrompt: true });
  await sleep(600);
  leader.off('setup:roles-generated', onGen);
  const n = generated?.length || 8;
  const roles = ['MAFIA_REGULAR', 'SILENCER', 'DOCTOR', 'SHERIFF', ...Array(Math.max(0, n - 4)).fill('CITIZEN')];
  if (!(await rpc(leader, 'setup:roles-confirmed', { roomId, roles }))?.success) throw new Error('roles-confirmed');
  if (!(await rpc(leader, 'setup:random-assign', { roomId, lockedPhysicalIds: [] }))?.success) throw new Error('random-assign');
  if (!(await rpc(leader, 'setup:confirm-roles', { roomId }))?.success) throw new Error('confirm-roles');
  if (!(await rpc(leader, 'setup:binding-complete', { roomId }))?.success) throw new Error('binding-complete');
  await sleep(800);
  let display = null; const dEv = [];
  if (withDisplay) {
    display = await connect({ token: TOKEN }); allSockets.push(display);
    const dj = await rpc(display, 'display:join-room', { roomId });
    if (!dj?.success) throw new Error('display join');
    display.onAny((e, d) => dEv.push({ e, d, t: Date.now() }));
  }
  const S = (await rpc(leader, 'game:get-state', { roomId })).state;
  const seatOf = (role) => S.players.find(p => p.role === role)?.physicalId;
  return { roomId, phones, display, dEv, S, seatOf, seats: S.players.map(p => p.physicalId).sort((a, b) => a - b) };
}

/** يُقصي `target` بالتصويت حتّى «بانتظار القرار» */
async function voteOut(R, target) {
  await rpc(leader, 'day:start-voting', { roomId: R.roomId });
  await sleep(300);
  const st = (await rpc(leader, 'game:get-state', { roomId: R.roomId })).state;
  const idx = (seat) => st.votingState.candidates.findIndex(c => c.type === 'PLAYER' && c.targetPhysicalId === seat);
  const other = R.seats.find(s => s !== target && st.players.find(p => p.physicalId === s)?.isAlive !== false);
  for (const p of st.players.filter(p => p.isAlive !== false)) {
    await rpc(leader, 'day:cast-vote', { roomId: R.roomId, candidateIndex: idx(p.physicalId === target ? other : target), delta: 1, voterPhysicalId: p.physicalId });
  }
  await rpc(leader, 'day:resolve', { roomId: R.roomId });
  return rpc(leader, 'day:execute-elimination', { roomId: R.roomId, skipWithdrawal: true });
}
const myState = async (P, roomId) => { const r = await rpc(P.s, 'room:get-my-state', { roomId, phone: P.phone }); if (!r?.success) throw new Error(`get-my-state: ${r?.error}`); return r; };
const seen = (ms, seat) => (ms?.rosterInfo || []).find(r => r.physicalId === seat);

try {
  // ═══════════════ ١) شاشةٌ تُبلغ بالقلب ═══════════════
  console.log('\n━━━ ١) إقصاءٌ نهاريّ — الشاشة تقلب البطاقة ━━━');
  const R = await setupRoom('1', true);
  const A = R.phones[0];
  const M = R.seatOf('MAFIA_REGULAR');
  console.log(`   المُعدَم #${M} · الهاتف أ #${A.seat}`);
  const before = await myState(A, R.roomId);
  const ex = await voteOut(R, M);
  ok('بانتظار القرار', ex?.success === true, ex?.error);
  await sleep(700);
  const pend = A.ev.filter(x => x.e === 'day:elimination-pending').pop()?.d;
  ok('🔒 حدثُ الانتظار بلا أرقام ولا نوع', JSON.stringify(pend) === JSON.stringify({ pending: true, eliminated: [] }), JSON.stringify(pend));
  const s1 = await myState(A, R.roomId);
  ok('🔒 الاستطلاع: النتيجةُ «بانتظار الإعلان»', s1?.pendingResolution?.pending === true && (s1.pendingResolution.eliminated || []).length === 0, JSON.stringify(s1?.pendingResolution));
  ok('🔒 الاستطلاع: المُعدَم حيّ في الروستر', seen(s1, M)?.isAlive === true);
  ok('🔒 الاستطلاع: المُعدَم في قائمة الأحياء', (s1?.playersInfo || []).some(p => p.physicalId === M));
  ok('🔒 الاستطلاع: العدّاد لم يتغيّر', key(s1?.teamCounts) === key(before?.teamCounts), `${key(s1?.teamCounts)} vs ${key(before?.teamCounts)}`);
  const vhPend = (await rpc(A.s, 'room:get-vote-history', { roomId: R.roomId }))?.history || [];
  ok('🔒 سجلّ التصويت: لا نتيجة بعد', vhPend.length > 0 && vhPend[vhPend.length - 1].outcome == null, JSON.stringify(vhPend[vhPend.length - 1]?.outcome));

  const markA = A.ev.length, markD = R.dEv.length;
  ok('الموجّه كشف الأدوار', (await rpc(leader, 'day:trigger-reveal', { roomId: R.roomId, result: {} }))?.success === true);
  await sleep(1500);
  ok('📺 الشاشة استلمت الكشف فوراً', R.dEv.slice(markD).some(x => x.e === 'day:elimination-revealed' && (x.d?.eliminated || []).includes(M)));
  const early = A.ev.slice(markA).map(x => x.e);
  ok('🔒 الهاتف لم يستلم الكشف قبل قلب البطاقة', !early.includes('day:elimination-revealed') && !early.includes('game:state-sync'), early.join(','));
  const s2 = await myState(A, R.roomId);
  ok('🔒 بعد الضغطة: المُعدَم ما زال حيّاً على الهاتف', seen(s2, M)?.isAlive === true && s2?.pendingResolution?.pending === true);
  ok('🔒 بعد الضغطة: العدّاد كما كان', key(s2?.teamCounts) === key(before?.teamCounts));
  const vhHeld = (await rpc(A.s, 'room:get-vote-history', { roomId: R.roomId }))?.history || [];
  ok('🔒 بعد الضغطة: سجلّ التصويت بلا المُعدَم', vhHeld[vhHeld.length - 1]?.outcome == null, JSON.stringify(vhHeld[vhHeld.length - 1]?.outcome));

  R.display.emit('display:card-flipped', { seats: [M] });
  await sleep(1200);
  const after = A.ev.slice(markA);
  const rev = after.find(x => x.e === 'day:elimination-revealed')?.d;
  ok('📱 مع قلب البطاقة: وصل الكشف', (rev?.eliminated || []).includes(M), JSON.stringify(rev?.eliminated));
  ok('📱 …ومعه روسترٌ جديد', after.some(x => x.e === 'game:state-sync' && x.d?.players?.find(p => p.physicalId === M)?.isAlive === false));
  ok('📱 …وسجلُّ التصويت', after.some(x => x.e === 'day:vote-history' && x.d?.history?.slice(-1)[0]?.outcome?.type === 'ELIMINATED'));
  const s3 = await myState(A, R.roomId);
  ok('📱 الاستطلاع الآن: ميّت', seen(s3, M)?.isAlive === false);
  ok('📱 الاستطلاع الآن: النتيجة كاملة', (s3?.pendingResolution?.eliminated || []).includes(M) && !s3.pendingResolution.pending);
  ok('📱 العدّاد نقص مافيا واحداً', (before?.teamCounts?.mafiaAlive ?? 0) - (s3?.teamCounts?.mafiaAlive ?? 0) === 1, `${key(before?.teamCounts)} → ${key(s3?.teamCounts)}`);

  // ═══════════════ ٤) الطرد بالعقوبات ═══════════════
  console.log('\n━━━ ٤) طردٌ بالعقوبات — الدور مع الكرت ━━━');
  const Pk = R.seatOf('SHERIFF') !== A.seat ? R.seatOf('SHERIFF') : R.seatOf('DOCTOR');
  const roleK = R.S.players.find(p => p.physicalId === Pk)?.role;
  const cBefore = (await myState(A, R.roomId))?.teamCounts;
  let kicked = false;
  for (let i = 0; i < 6 && !kicked; i++) kicked = (await rpc(leader, 'leader:record-penalty', { roomId: R.roomId, targetPhysicalId: Pk }))?.isKicked === true;
  ok(`طُرد #${Pk}`, kicked);
  await sleep(600);
  const gk = (await rpc(A.s, 'game:get-state', { roomId: R.roomId }))?.state?.players?.find(p => p.physicalId === Pk);
  ok('🃏 الهاتف: المطرود خارج اللعبة', gk?.isAlive === false, JSON.stringify(gk));
  ok('🃏 الهاتف: بلا دور قبل الكرت', gk?.role == null, gk?.role);
  ok('🃏 العدّاد لم يتغيّر بالطرد', key((await myState(A, R.roomId))?.teamCounts) === key(cBefore));
  const markD2 = R.dEv.length;
  ok('الموجّه أظهر الكرت', (await rpc(leader, 'admin:reveal-eliminated', { roomId: R.roomId, physicalId: Pk, playerName: `#${Pk}`, role: roleK }))?.success === true);
  await sleep(800);
  ok('📺 الشاشة استلمت الكرت مع عدّاده', R.dEv.slice(markD2).some(x => x.e === 'admin:show-reveal' && x.d?.teamCounts));
  const gk2 = (await rpc(A.s, 'game:get-state', { roomId: R.roomId }))?.state?.players?.find(p => p.physicalId === Pk);
  ok('🔒 قبل القلب: الدور ما زال مخفيّاً', gk2?.role == null && gk2?.isAlive === false, JSON.stringify(gk2));
  R.display.emit('display:card-flipped', { seats: [Pk] });
  await sleep(1000);
  const gk3 = (await rpc(A.s, 'game:get-state', { roomId: R.roomId }))?.state?.players?.find(p => p.physicalId === Pk);
  ok('🃏 بعد القلب: يظهر دوره', gk3?.role === roleK, gk3?.role);
  ok('🃏 بعد القلب: نقص المواطنون', (cBefore?.citizenAlive ?? 0) - ((await myState(A, R.roomId))?.teamCounts?.citizenAlive ?? 0) === 1);

  // ═══════════════ ٥) الليل ═══════════════
  console.log('\n━━━ ٥) الليل — قتيلٌ لا يظهر حتّى يُعرض ويُقلب ━━━');
  ok('بدأ الليل', (await rpc(leader, 'night:start', { roomId: R.roomId }))?.success === true);
  await sleep(400);
  ok('بدأت الليلة الواحدة', (await rpc(leader, 'night:one-start', { roomId: R.roomId, durationSeconds: 10 }))?.success === true);
  await sleep(500);
  await rpc(leader, 'night:one-close', { roomId: R.roomId });
  await sleep(500);
  const rv = await rpc(leader, 'night:one-review-get', { roomId: R.roomId });
  const st5 = (await rpc(leader, 'game:get-state', { roomId: R.roomId })).state;
  const T = st5.players.find(p => p.isAlive !== false && p.role === 'CITIZEN' && p.physicalId !== A.seat)?.physicalId;
  const overrides = (rv?.acting || []).map(r => ({ seat: r.seat, abilityId: r.abilityId, targetPhysicalId: /KILL|ASSASSIN/i.test(r.abilityId) ? T : null }));
  ok('خطّة الليل فيها قتل', overrides.some(o => o.targetPhysicalId === T), JSON.stringify(rv?.acting?.map(r => r.abilityId)));
  ok('الموجّه اعتمد', (await rpc(leader, 'night:one-apply', { roomId: R.roomId, overrides }))?.success === true);
  const res = await rpc(leader, 'night:resolve', { roomId: R.roomId });
  ok('حُسم الليل', res?.success === true, res?.error);
  await sleep(800);
  const st6 = (await rpc(leader, 'game:get-state', { roomId: R.roomId })).state;
  const evIdx = (st6.morningEvents || []).findIndex(e => e.targetPhysicalId === T && st6.players.find(p => p.physicalId === T)?.isAlive === false);
  ok(`القتيل #${T} في أحداث الصباح`, evIdx >= 0, JSON.stringify((st6.morningEvents || []).map(e => `${e.type}:${e.targetPhysicalId}`)));
  ok('الطورُ في الحالة صباحٌ لا ليل', st6.phase === 'MORNING_RECAP', st6.phase);
  const n1 = await myState(A, R.roomId);
  ok('🔒 قبل العرض: القتيل حيّ على الهاتف', seen(n1, T)?.isAlive === true);
  ok('🔒 قبل العرض: في قائمة الأحياء', (n1?.playersInfo || []).some(p => p.physicalId === T));
  await rpc(leader, 'night:display-event', { roomId: R.roomId, eventIndex: evIdx });
  await sleep(1200);
  ok('🔒 بعد العرض وقبل القلب: ما زال حيّاً على الهاتف', seen(await myState(A, R.roomId), T)?.isAlive === true);
  R.display.emit('display:card-flipped', { seats: [T] });
  await sleep(1000);
  ok('📱 بعد القلب: ميّت', seen(await myState(A, R.roomId), T)?.isAlive === false);

  // ═══════════════ ٢) شاشةٌ لا تُبلغ ═══════════════
  console.log('\n━━━ ٢) شاشةٌ قديمة لا تُبلغ — مهلةُ الأمان ━━━');
  const R2 = await setupRoom('2', true);
  const A2 = R2.phones[0];
  const M2 = R2.seatOf('MAFIA_REGULAR');
  await voteOut(R2, M2);
  await sleep(500);
  const m2 = A2.ev.length;
  const t0 = Date.now();
  await rpc(leader, 'day:trigger-reveal', { roomId: R2.roomId, result: {} });
  await sleep(4000);
  ok('🔒 بعد ٤ث بلا تبليغ: لا كشف على الهاتف', !A2.ev.slice(m2).some(x => x.e === 'day:elimination-revealed'));
  let got = null;
  for (let i = 0; i < 30 && !got; i++) { await sleep(1000); got = A2.ev.slice(m2).find(x => x.e === 'day:elimination-revealed'); }
  const waited = got ? (got.t - t0) / 1000 : null;
  ok('📱 أُطلق بعد مهلة الأمان (~٢٠ث)', got && waited >= 18 && waited <= 26, `${waited}ث`);

  // ═══════════════ ٣) بلا شاشة ═══════════════
  console.log('\n━━━ ٣) لا شاشة متّصلة — لا حبس ━━━');
  const R3 = await setupRoom('3', false);
  const A3 = R3.phones[0];
  const M3 = R3.seatOf('MAFIA_REGULAR');
  await voteOut(R3, M3);
  await sleep(500);
  const m3 = A3.ev.length;
  await rpc(leader, 'day:trigger-reveal', { roomId: R3.roomId, result: {} });
  await sleep(1200);
  ok('📱 بلا شاشة: الكشف يصل الهاتف فوراً', A3.ev.slice(m3).some(x => x.e === 'day:elimination-revealed' && (x.d?.eliminated || []).includes(M3)));
} catch (e) {
  ok('لا استثناء', false, e?.stack || e?.message || String(e));
} finally {
  for (const r of rooms) { try { await rpc(leader, 'room:delete-room', { roomId: r }); } catch { /* تجاهل */ } }
  console.log(`\n🧹 حُذفت ${rooms.length} غرف`);
  for (const s of allSockets) try { s.close(); } catch { /* تجاهل */ }
  leader.close();
}

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
process.exit(0);
