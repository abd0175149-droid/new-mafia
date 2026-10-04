// ══════════════════════════════════════════════════════
// 🧪 اختبار وظيفيّ حيّ: قنبلةُ شيخ المافيا — لا شيء قبل «كشف الأدوار» (2026-10-04)
// ══════════════════════════════════════════════════════
// يلعب لعبةً حقيقيّة في غرفة قاعة: المدينة تُعدم الشيخ، والموجّه يفجّر قنبلته في جارَيه
// قبل الكشف، ثمّ يكشف. ويثبت:
//   ١. قبل الكشف لا يصل أيَّ هاتفٍ ولا المتفرّجَ: نتيجةُ القنبلة، ولا موتُ ضحاياها
//      (isAlive/الدور في الروستر)، ولا عدّادٌ متغيّر — والموجّهُ وحده يستلم النتيجة.
//   ٢. مع الكشف: الشيخُ أوّلاً ثمّ القنبلة (بالترتيب)، والنتيجةُ تحمل مقعدَ الشيخ
//      ومقاعدَ البطاقات وعدّاداً ينقص الضحايا، و«قنبلةٌ قادمة» معلنةٌ في كشف الشيخ.
//   ٣. بعد الكشف: روسترُ الهاتف يرى الضحايا موتى بأدوارهم، ولا نسخةَ ثانية للموجّه.
//
// ⚠️ ينشئ غرفةً حقيقيّة ثمّ يحذفها؛ لا مباراةَ تُحتسب (الغرفة تُحذف قبل أيّ نهاية).
//
// التشغيل على الخادم (من ~/e2e-tools حيث socket.io-client):
//   MAFIA_STAFF_TOKEN=$TOKEN MAFIA_URL=http://localhost:4000 node e2e-bomb-reveal.mjs
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
const PH_A = `07941${RUN}`, PH_B = `07942${RUN}`;
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
const MAFIA = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'];
const NEUTRAL = ['JESTER', 'ASSASSIN'];
const teamOf = (r) => MAFIA.includes(r) ? 'mafiaAlive' : NEUTRAL.includes(r) ? 'neutralAlive' : 'citizenAlive';

const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
console.log(`🔌 الليدر متصل بـ${URL}`);
let roomId = null;
const sockets = [];
let generatedRoles = null;
leader.on('setup:roles-generated', d => {
  generatedRoles = [...(d.mafiaRoles || []), ...(d.citizenRoles || []), ...(d.neutralRoles || [])];
});

try {
  // ══ ١) غرفة + ستّة ضيوف + هاتفان + متفرّجٌ ممّن يحملون الهاتف ══
  console.log('\n━━━ ١) لعبة بشيخ مافيا ━━━');
  const created = await rpc(leader, 'room:create', {
    gameName: `فحص القنبلة ${new Date().toISOString().slice(11, 19)}`, maxPlayers: 12, maxJustifications: 2,
  });
  roomId = created.roomId || created.state?.roomId;
  ok('أُنشئت الغرفة', !!roomId);
  leader.emit('room:rejoin-leader', { roomId });
  for (let i = 1; i <= 6; i++) {
    const r = await rpc(leader, 'room:force-add-player', { roomId, physicalId: i, name: `ضيف${i}`, phone: `07940${RUN}`.slice(0, 9) + i, dob: '1995-01-01', gender: 'MALE' });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
  }
  const pA = await connect({}); sockets.push(pA);
  const pB = await connect({}); sockets.push(pB);
  const jA = await rpc(pA, 'room:auto-join', { roomId, name: 'هاتف-أ', gender: 'MALE', phone: PH_A });
  const jB = await rpc(pB, 'room:auto-join', { roomId, name: 'هاتف-ب', gender: 'MALE', phone: PH_B });
  ok('انضمّ الهاتفان', jA?.success === true && jB?.success === true, `${jA?.error || ''} ${jB?.error || ''}`);
  const seatA = Number(jA?.assignedSeat ?? jA?.physicalId);
  const seatB = Number(jB?.assignedSeat ?? jB?.physicalId);

  await rpc(leader, 'room:start-generation', { roomId, supportsAbsentPrompt: true });
  await sleep(600);
  // شيخُ المافيا شرطُ الاختبار: إن لم يولَّد يحلّ محلّ أوّل مافيا
  if (Array.isArray(generatedRoles) && !generatedRoles.includes('GODFATHER')) {
    const i = generatedRoles.findIndex(r => MAFIA.includes(r));
    if (i >= 0) generatedRoles[i] = 'GODFATHER';
  }
  ok('الأدوار تضمّ شيخ المافيا', generatedRoles?.includes('GODFATHER'), JSON.stringify(generatedRoles));
  ok('اعتُمدت', (await rpc(leader, 'setup:roles-confirmed', { roomId, roles: generatedRoles }))?.success === true);
  ok('وُزّعت', (await rpc(leader, 'setup:random-assign', { roomId, lockedPhysicalIds: [] }))?.success === true);
  ok('أُكّدت', (await rpc(leader, 'setup:confirm-roles', { roomId }))?.success === true);
  ok('بدأت', (await rpc(leader, 'setup:binding-complete', { roomId }))?.success === true);
  await sleep(1000);

  const S0 = (await rpc(leader, 'game:get-state', { roomId })).state;
  const roleOf = (seat) => (S0?.players || []).find(p => p.physicalId === seat)?.role;
  const gf = (S0?.players || []).find(p => p.role === 'GODFATHER')?.physicalId;
  ok('عُرف مقعدُ الشيخ', gf != null, `gf=${gf}`);
  console.log(`   الشيخ #${gf} · الهاتفان #${seatA} #${seatB}`);

  // ══ ٢) المدينة تُعدم الشيخ ══
  console.log('\n━━━ ٢) إعدام الشيخ — بانتظار الكشف ━━━');
  const ev = { A: [], B: [], leader: [] };
  for (const [name, s] of [['A', pA], ['B', pB], ['leader', leader]]) {
    for (const e of ['day:elimination-pending', 'day:elimination-revealed', 'day:bomb-result', 'game:state-sync', 'game:phase-changed']) {
      s.on(e, (d) => ev[name].push({ e, d, t: Date.now() }));
    }
  }
  const preC = (await rpc(pA, 'room:get-my-state', { roomId, phone: PH_A }))?.teamCounts;
  ok('عدّادُ ما قبل التصويت معروف', !!preC, key(preC));
  ok('بدأ التصويت', (await rpc(leader, 'day:start-voting', { roomId }))?.success === true);
  await sleep(300);
  const vs = (await rpc(leader, 'game:get-state', { roomId })).state;
  const idx = (vs?.votingState?.candidates || []).findIndex(c => c.type === 'PLAYER' && c.targetPhysicalId === gf);
  for (const v of (vs?.players || []).filter(p => p.isAlive !== false).map(p => p.physicalId)) {
    await rpc(leader, 'day:cast-vote', { roomId, candidateIndex: idx, delta: 1, voterPhysicalId: v });
  }
  ok('فُرزت الأصوات', (await rpc(leader, 'day:resolve', { roomId }))?.success === true);
  ok('نُفّذ الإعدام', (await rpc(leader, 'day:execute-elimination', { roomId, skipWithdrawal: true }))?.success === true);
  await sleep(700);

  const pendL = ev.leader.find(x => x.e === 'day:elimination-pending')?.d;
  const pendA = ev.A.find(x => x.e === 'day:elimination-pending')?.d;
  ok('الموجّه يرى قنبلةً معلّقة بجارَين', !!pendL?.pendingBomb?.above, JSON.stringify(pendL?.pendingBomb || null));
  ok('🔒 الهاتف لا يرى القنبلة المعلّقة', pendA && !pendA.pendingBomb, JSON.stringify(pendA || null).slice(0, 120));
  const victims = [pendL?.pendingBomb?.below?.physicalId, pendL?.pendingBomb?.above?.physicalId].filter(x => x != null);
  console.log(`   الجاران: ${victims.map(v => `#${v} ${roleOf(v)}`).join(' · ')}`);

  // ══ ٣) الموجّه يفجّر قبل الكشف ══
  console.log('\n━━━ ٣) قرار القنبلة قبل الكشف ━━━');
  const markA = ev.A.length, markB = ev.B.length;
  const bd = await rpc(leader, 'day:bomb-decision', { roomId, eliminateAbove: true, eliminateBelow: true });
  ok('نُفّذ قرار القنبلة', bd?.success === true, bd?.error);
  await sleep(800);
  ok('الموجّه استلم النتيجة فوراً', ev.leader.some(x => x.e === 'day:bomb-result'));
  const earlyA = ev.A.slice(markA).map(x => x.e), earlyB = ev.B.slice(markB).map(x => x.e);
  ok('🔒 لا شيء وصل الهاتف أ بعد القرار', earlyA.length === 0, earlyA.join(','));
  ok('🔒 لا شيء وصل الهاتف ب بعد القرار', earlyB.length === 0, earlyB.join(','));

  const gsA = (await rpc(pA, 'game:get-state', { roomId }))?.state;
  const seen = (seat) => (gsA?.players || []).find(p => p.physicalId === seat);
  ok('🔒 روستر الهاتف: الضحيّتان حيّتان بلا دور', victims.every(v => seen(v)?.isAlive !== false && seen(v)?.role == null),
    JSON.stringify(victims.map(v => seen(v))));
  ok('🔒 روستر الهاتف: الشيخ قبل كشفه بلا دور', seen(gf)?.role == null, JSON.stringify(seen(gf)));
  const myPre = await rpc(pA, 'room:get-my-state', { roomId, phone: PH_A });
  ok('🔒 get-my-state: العدّاد لم يتغيّر', key(myPre?.teamCounts) === key(preC), `${key(myPre?.teamCounts)} vs ${key(preC)}`);
  ok('🔒 get-my-state: الضحيّتان حيّتان في rosterInfo', victims.every(v => (myPre?.rosterInfo || []).find(p => p.physicalId === v)?.isAlive !== false));
  for (const [name, seat, s, ph] of [['أ', seatA, pA, PH_A], ['ب', seatB, pB, PH_B]]) {
    if (!victims.includes(seat)) continue;
    const me = await rpc(s, 'room:get-my-state', { roomId, phone: ph });
    ok(`🔒 الهاتف ${name} (ضحيّة) لا يعرف موتَه قبل الكشف`, me?.player?.isAlive === true, JSON.stringify(me?.player));
  }

  // ══ ٤) الكشف ══
  console.log('\n━━━ ٤) كشف الأدوار ━━━');
  const markA2 = ev.A.length, markL2 = ev.leader.length;
  ok('كُشفت الأدوار', (await rpc(leader, 'day:trigger-reveal', { roomId, result: {} }))?.success === true);
  await sleep(1000);
  const after = ev.A.slice(markA2);
  const iRev = after.findIndex(x => x.e === 'day:elimination-revealed');
  const iBomb = after.findIndex(x => x.e === 'day:bomb-result');
  const iSync = after.findIndex(x => x.e === 'game:state-sync');
  ok('الهاتف استلم كشفَ الشيخ', iRev >= 0);
  ok('…ثمّ نتيجةَ القنبلة بعده', iBomb > iRev, after.map(x => x.e).join(' → '));
  const rev = after[iRev]?.d, bomb = after[iBomb]?.d;
  ok('كشفُ الشيخ يعلن «قنبلةٌ قادمة»', Array.isArray(rev?.pendingSecondary) && rev.pendingSecondary.includes('BOMB'), JSON.stringify(rev?.pendingSecondary));
  ok('كشفُ الشيخ: نقصت المافيا بواحد', (preC?.mafiaAlive ?? 0) - (rev?.teamCounts?.mafiaAlive ?? 0) === 1, `${key(preC)} → ${key(rev?.teamCounts)}`);
  ok('النتيجةُ تسمّي الشيخ', bomb?.godfatherPhysicalId === gf, `${bomb?.godfatherPhysicalId}`);
  ok('النتيجةُ تحمل مقاعدَ البطاقات', JSON.stringify([...(bomb?.revealSeats || [])].sort()) === JSON.stringify([...victims].sort()), JSON.stringify(bomb?.revealSeats));
  const exp = { ...rev?.teamCounts };
  for (const v of victims) exp[teamOf(roleOf(v))] = (exp[teamOf(roleOf(v))] ?? 0) - 1;
  ok('عدّادُ النتيجة ينقص الضحايا بفرقهم', key(bomb?.teamCounts) === key(exp), `${key(bomb?.teamCounts)} vs ${key(exp)}`);
  ok('لم يستلم الموجّه نسخةً ثانية', ev.leader.slice(markL2).filter(x => x.e === 'day:bomb-result').length === 0);

  ok('وصل الهاتفَ روسترٌ جديد بعد الكشف', iSync >= 0);
  const syncA = after[iSync]?.d;
  const sv = (seat) => (syncA?.players || []).find(p => p.physicalId === seat);
  ok('الروستر: الضحيّتان ميّتتان بأدوارهما', victims.every(v => sv(v)?.isAlive === false && sv(v)?.role === roleOf(v)),
    JSON.stringify(victims.map(v => sv(v))));
  ok('الروستر: الشيخ ميّتٌ مكشوف', sv(gf)?.isAlive === false && sv(gf)?.role === 'GODFATHER', JSON.stringify(sv(gf)));
  const others = (syncA?.players || []).filter(p => p.isAlive !== false && p.physicalId !== seatA);
  ok('🔒 الروستر: لا دورَ لأيّ حيّ', others.every(p => p.role == null));
  const myPost = await rpc(pA, 'room:get-my-state', { roomId, phone: PH_A });
  ok('get-my-state بعد الكشف = عدّادُ النتيجة', key(myPost?.teamCounts) === key(bomb?.teamCounts), `${key(myPost?.teamCounts)} vs ${key(bomb?.teamCounts)}`);
  for (const [name, seat, s, ph] of [['أ', seatA, pA, PH_A], ['ب', seatB, pB, PH_B]]) {
    if (!victims.includes(seat)) continue;
    const me = await rpc(s, 'room:get-my-state', { roomId, phone: ph });
    ok(`الهاتف ${name} (ضحيّة) يعرف موتَه بعد الكشف`, me?.player?.isAlive === false, JSON.stringify(me?.player));
  }
} catch (e) {
  ok('لا استثناء', false, e?.message || String(e));
} finally {
  if (roomId) { try { await rpc(leader, 'room:delete-room', { roomId }); console.log('\n🧹 حُذفت الغرفة'); } catch { /* تجاهل */ } }
  for (const s of sockets) try { s.close(); } catch { /* تجاهل */ }
  leader.close();
}

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
process.exit(0);
