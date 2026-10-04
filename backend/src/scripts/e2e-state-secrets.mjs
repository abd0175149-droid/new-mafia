// ══════════════════════════════════════════════════════
// 🧪 اختبار وظيفيّ حيّ: لا يصل هاتفَ لاعبٍ دورُ غيره (2026-10-04)
// ══════════════════════════════════════════════════════
// يقود سوكِتات ليدر ولاعبين ومتطفّلٍ فعليّة ضدّ خادمٍ حيّ في غرفةٍ محلّيّة (قاعة)،
// ويثبت ما لا يثبته اختبارُ الوحدة:
//   ١. المتطفّل (بلا توكن) لا يرقّي نفسه ليدر ولا يدخل الغرفة ولا يقرأ حالتها.
//   ٢. لحظةَ بدء اللعبة يصل الموجّهَ كلُّ الأدوار، ويصل كلَّ هاتفٍ دورُه وحده.
//   ٣. لا رمزَ شاشة عرض ولا توأمين ولا نيّات ليل في حمولة اللاعب.
//   ٤. game:get-state وroom:get-my-state وroom:get-my-role تحترم الحدود نفسها.
//
// ⚠️ ينشئ غرفةً حقيقيّة ثمّ يحذفها؛ لا مباراةَ تُحتسب (الغرفة تُحذف قبل أيّ نهاية).
//
// التشغيل على الخادم:
//   TOKEN=$(docker exec mafia-prod-backend-1 node -e "const j=require('jsonwebtoken');\
//     console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'30m'}))")
//   MAFIA_STAFF_TOKEN=$TOKEN MAFIA_URL=http://localhost:4000 node backend/src/scripts/e2e-state-secrets.mjs
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
const ACTIVITY_ID = Number(process.env.MAFIA_ACTIVITY_ID || 0) || undefined;
if (!TOKEN) { console.error('❌ MAFIA_STAFF_TOKEN مطلوب'); process.exit(1); }

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; failures.push(n + (d ? ` — ${d}` : '')); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// أرقامٌ جديدة لكلّ تشغيل — إعادةُ الأرقام نفسها تصطدم ببقايا تشغيلٍ سابق (غرفة قديمة لصاحب الهاتف)
const RUN = String(Date.now()).slice(-5);
const PH_A = `07931${RUN}`, PH_B = `07932${RUN}`;
const rpc = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 20000);
  s.emit(ev, payload, (r) => { clearTimeout(t); res(r); });
});
const connect = (auth) => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], auth, reconnection: false, timeout: 20000 });
  s.on('connect', () => res(s));
  s.on('connect_error', rej);
});
const SECRET_KEYS = ['nightActions', 'twinState', 'assassinState', 'phoenixState', 'pendingAshCurse', 'dynamicNightState',
  'oneNight', 'playerNightActions', 'autoNightChoices', 'performanceTracking', 'pendingBomb', 'rolesPool', 'morningEvents'];

const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
console.log(`🔌 الليدر متصل بـ${URL}`);
let roomId = null;
const sockets = [];
let generatedRoles = null;
leader.on('setup:roles-generated', d => {
  generatedRoles = [...(d.mafiaRoles || []), ...(d.citizenRoles || []), ...(d.neutralRoles || [])];
});

try {
  // ══ ١) غرفة + ستّة ضيوف + لاعبان من هاتفيهما ══
  console.log('\n━━━ ١) إنشاء غرفة قاعة ━━━');
  const created = await rpc(leader, 'room:create', {
    gameName: `فحص الأسرار ${new Date().toISOString().slice(11, 19)}`,
    maxPlayers: 12, maxJustifications: 2, ...(ACTIVITY_ID ? { activityId: ACTIVITY_ID } : {}),
  });
  roomId = created.roomId || created.state?.roomId;
  ok('أُنشئت الغرفة', !!roomId, JSON.stringify(created).slice(0, 100));
  leader.emit('room:rejoin-leader', { roomId });
  for (let i = 1; i <= 6; i++) {
    const r = await rpc(leader, 'room:force-add-player', { roomId, physicalId: i, name: `ضيف${i}`, phone: `07930${RUN}`.slice(0, 9) + i, dob: '1995-01-01', gender: 'MALE' });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
  }
  const pA = await connect({}); sockets.push(pA);
  const pB = await connect({}); sockets.push(pB);
  const jA = await rpc(pA, 'room:auto-join', { roomId, name: 'هاتف-أ', gender: 'MALE', phone: PH_A });
  const jB = await rpc(pB, 'room:auto-join', { roomId, name: 'هاتف-ب', gender: 'MALE', phone: PH_B });
  ok('انضمّ الهاتف أ', jA?.success === true, jA?.error);
  ok('انضمّ الهاتف ب', jB?.success === true, jB?.error);
  const seatA = Number(jA?.assignedSeat ?? jA?.physicalId);
  const seatB = Number(jB?.assignedSeat ?? jB?.physicalId);

  // ══ ٢) المتطفّل ══
  console.log('\n━━━ ٢) متطفّلٌ بلا توكن ━━━');
  const spy = await connect({}); sockets.push(spy);
  const spyGot = [];
  for (const ev of ['game:phase-changed', 'game:state-sync', 'game:state-updated', 'day:justification-started']) spy.on(ev, () => spyGot.push(ev));
  const elim = await rpc(spy, 'admin:eliminate', { roomId, physicalId: 1 });
  ok('admin:eliminate بلا صلاحية يُرفض', elim?.success === false && /مصرّح/.test(elim?.error || ''), JSON.stringify(elim));
  const spyState = await rpc(spy, 'game:get-state', { roomId });
  ok('…ولم يصر ليدر: لا يقرأ حالة غرفةٍ ليس فيها', spyState?.success === false, JSON.stringify(spyState).slice(0, 80));
  const close = await rpc(spy, 'room:close', { roomId });
  ok('room:close بلا صلاحية يُرفض', close?.success === false);
  const role = await rpc(spy, 'room:get-my-role', { roomId, physicalId: 1 });
  ok('room:get-my-role لمقعدٍ ليس له ⇒ لا دور', role?.role == null, JSON.stringify(role));

  // ══ ٣) بدء اللعبة — ما يصل كلَّ طرف ══
  console.log('\n━━━ ٣) بدء اللعبة ━━━');
  const got = { leader: [], A: [], B: [] };
  leader.on('game:phase-changed', d => d?.state && got.leader.push(d.state));
  pA.on('game:phase-changed', d => d?.state && got.A.push(d.state));
  pB.on('game:phase-changed', d => d?.state && got.B.push(d.state));
  pA.on('game:state-sync', s => got.A.push(s));

  const gen = await rpc(leader, 'room:start-generation', { roomId, supportsAbsentPrompt: true });
  ok('بدأ التوليد', gen?.success === true, gen?.error || gen?.code);
  await sleep(600);
  ok('وصلت الأدوار المولَّدة', Array.isArray(generatedRoles) && generatedRoles.length === 8, `${generatedRoles?.length}`);
  ok('اعتُمدت', (await rpc(leader, 'setup:roles-confirmed', { roomId, roles: generatedRoles }))?.success === true);
  ok('وُزّعت', (await rpc(leader, 'setup:random-assign', { roomId, lockedPhysicalIds: [] }))?.success === true);
  ok('أُكّدت', (await rpc(leader, 'setup:confirm-roles', { roomId }))?.success === true);
  ok('بدأت (binding-complete)', (await rpc(leader, 'setup:binding-complete', { roomId }))?.success === true);
  await sleep(1200);

  const L = got.leader.at(-1);
  ok('الموجّه استلم الحالة', !!L);
  ok('الموجّه يرى كلَّ الأدوار', (L?.players || []).every(p => !!p.role), JSON.stringify((L?.players || []).map(p => p.role)));
  ok('الموجّه يرى رمز شاشة العرض', !!L?.config?.displayPin);

  for (const [name, list, seat] of [['أ', got.A, seatA], ['ب', got.B, seatB]]) {
    const S = list.at(-1);
    ok(`الهاتف ${name} استلم الحالة`, !!S);
    const others = (S?.players || []).filter(p => p.isAlive !== false && p.physicalId !== seat);
    ok(`🔒 الهاتف ${name}: لا دورَ لأيّ حيٍّ غيره`, others.length > 0 && others.every(p => p.role == null),
      JSON.stringify(others.filter(p => p.role).map(p => `${p.physicalId}:${p.role}`)));
    const me = (S?.players || []).find(p => p.physicalId === seat);
    ok(`الهاتف ${name}: دورُه هو له`, !!me?.role, JSON.stringify(me));
    ok(`🔒 الهاتف ${name}: لا رمزَ شاشة عرض`, S?.config && S.config.displayPin === undefined);
    ok(`🔒 الهاتف ${name}: لا هواتفَ لغيره`, (S?.players || []).filter(p => p.physicalId !== seat).every(p => p.phone === undefined));
    const leaked = SECRET_KEYS.filter(k => S && S[k] !== undefined);
    ok(`🔒 الهاتف ${name}: لا أسرار (توأمين/ليل/سفّاح…)`, leaked.length === 0, leaked.join(','));
    ok(`الهاتف ${name}: الطور صحيح`, S?.phase === 'DAY_DISCUSSION', S?.phase);
  }

  // ══ ٤) الاستعلامات ══
  console.log('\n━━━ ٤) الاستعلامات المباشرة ━━━');
  const gsA = await rpc(pA, 'game:get-state', { roomId });
  ok('game:get-state للهاتف أ ينجح', gsA?.success === true, gsA?.error);
  const othersA = (gsA?.state?.players || []).filter(p => p.isAlive !== false && p.physicalId !== seatA);
  ok('🔒 …بلا أدوار غيره', othersA.length > 0 && othersA.every(p => p.role == null));
  ok('🔒 …بلا رمز شاشة العرض', gsA?.state?.config?.displayPin === undefined);
  const myA = await rpc(pA, 'room:get-my-state', { roomId, phone: PH_A });
  ok('room:get-my-state للضيف بهاتفه ينجح', myA?.success === true, myA?.error);
  const rB = await rpc(pB, 'room:get-my-role', { roomId, physicalId: seatA });
  const realB = L?.players?.find(p => p.physicalId === seatB)?.role;
  ok('room:get-my-role بمقعد غيره ⇒ دورُه هو لا دورُ ذاك', rB?.role === realB, `${rB?.role} vs ${realB}`);

  // عودةُ ب بهاتفه (ضيف) تنجح
  const rj = await rpc(pB, 'room:rejoin-player', { roomId, physicalId: seatB, phone: PH_B });
  ok('عودة الضيف بهاتفه تنجح', rj?.success === true, rj?.error);

  // إجراءُ موجّهٍ يبثّ game:state-sync للغرفة — أ يستلم إسقاطاً لا الحالة الخام
  const before = got.A.length;
  const at = Date.now() + 15 * 60 * 1000;
  const cm = await rpc(leader, 'room:set-next-game-at', { roomId, at });
  ok('إجراء الموجّه نجح', cm?.success === true, cm?.error);
  await sleep(800);
  const sync = got.A.slice(before).at(-1);
  if (sync) {
    const o = (sync.players || []).filter(p => p.isAlive !== false && p.physicalId !== seatA);
    ok('🔒 بثّ state-sync: بلا أدوار غيره', o.length > 0 && o.every(p => p.role == null));
    ok('🔒 بثّ state-sync: بلا رمز شاشة العرض', sync?.config?.displayPin === undefined);
    ok('بثّ state-sync: موعدُ اللعبة القادمة وصل (حقلٌ علنيّ)', sync?.nextGameAt === at, `${sync?.nextGameAt}`);
  } else {
    ok('وصل بثّ state-sync', false, 'لم يصل');
  }

  ok('🔒 المتطفّل لم يستلم شيئاً من بثّ الغرفة', spyGot.length === 0, spyGot.join(','));

  // ══ ٥) عدّادُ الفرق لا يسبق كشفَ البطاقة (2026-10-04) ══
  console.log('\n━━━ ٥) العدّاد قبل الكشف وبعده ━━━');
  const key = (c) => c ? `${c.citizenAlive}/${c.mafiaAlive}/${c.neutralAlive ?? 0}` : 'null';
  const startCounts = (await rpc(leader, 'game:get-state', { roomId })).state;
  const roleOf = (seat) => (startCounts?.players || []).find(p => p.physicalId === seat)?.role;
  const phaseCounts = { leader: [], A: [] };
  const revealed = { A: null, leader: null };
  leader.on('game:phase-changed', d => d?.teamCounts && phaseCounts.leader.push({ phase: d.phase, c: d.teamCounts }));
  pA.on('game:phase-changed', d => d?.teamCounts && phaseCounts.A.push({ phase: d.phase, c: d.teamCounts }));
  pA.on('day:elimination-revealed', d => { revealed.A = d; });
  leader.on('day:elimination-revealed', d => { revealed.leader = d; });

  // العدّادُ قبل التصويت كما يراه الهاتف — مرجعُ «قبل الكشف»
  const preC = (await rpc(pA, 'room:get-my-state', { roomId, phone: PH_A }))?.teamCounts;
  ok('عدّادُ ما قبل التصويت معروف', !!preC, JSON.stringify(preC));
  const sv = await rpc(leader, 'day:start-voting', { roomId });
  ok('بدأ التصويت', sv?.success === true, sv?.error);
  await sleep(300);
  const vs = (await rpc(leader, 'game:get-state', { roomId })).state;
  const victim = 1;
  const idxV = (vs?.votingState?.candidates || []).findIndex(c => c.type === 'PLAYER' && c.targetPhysicalId === victim);
  const voters = (vs?.players || []).filter(p => p.isAlive !== false).map(p => p.physicalId);
  for (const v of voters) await rpc(leader, 'day:cast-vote', { roomId, candidateIndex: idxV, delta: 1, voterPhysicalId: v });
  const mark = { A: phaseCounts.A.length, L: phaseCounts.leader.length };
  const rs = await rpc(leader, 'day:resolve', { roomId });
  ok('فُرزت الأصوات', rs?.success === true, rs?.error);
  const ex = await rpc(leader, 'day:execute-elimination', { roomId, skipWithdrawal: true });
  ok('نُفّذ الإقصاء (بانتظار الكشف)', ex?.success === true, ex?.error);
  await sleep(800);
  const changedA = phaseCounts.A.slice(mark.A).filter(x => key(x.c) !== key(preC));
  const changedL = phaseCounts.leader.slice(mark.L).filter(x => key(x.c) !== key(preC));
  ok('🔒 قبل الكشف: لا رسالةَ غيّرت عدّادَ الهاتف', changedA.length === 0, JSON.stringify(changedA));
  ok('🔒 قبل الكشف: لا رسالةَ غيّرت عدّادَ الشاشة/الموجّه', changedL.length === 0, JSON.stringify(changedL));
  const myStatePre = await rpc(pA, 'room:get-my-state', { roomId, phone: PH_A });
  ok('🔒 قبل الكشف: get-my-state بالعدّاد القديم', key(myStatePre?.teamCounts) === key(preC), `${key(myStatePre?.teamCounts)} vs ${key(preC)}`);

  const tr = await rpc(leader, 'day:trigger-reveal', { roomId, result: {} });
  ok('كُشفت الأدوار', tr?.success === true, tr?.error);
  await sleep(800);
  const r = revealed.A;
  ok('حدثُ الكشف وصل الهاتف', !!r);
  const postC = r?.teamCounts;
  const vr = roleOf(victim);
  const team = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'].includes(vr) ? 'mafiaAlive'
    : ['JESTER', 'ASSASSIN'].includes(vr) ? 'neutralAlive' : 'citizenAlive';
  ok(`مع الكشف: نقص فريقُ المُقصى (${vr}) بواحد`, !!preC && !!postC && (preC[team] ?? 0) - (postC[team] ?? 0) === 1,
    `${key(preC)} → ${key(postC)}`);
  ok('الكشفُ يحمل مقاعدَ البطاقات', Array.isArray(r?.revealSeats) && r.revealSeats.includes(victim), JSON.stringify(r?.revealSeats));
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
