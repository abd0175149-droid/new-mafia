// ══════════════════════════════════════════════════════
// 🧪 اختبار وظيفيّ حيّ: سجلّ التصويت (2026-10-08)
// ══════════════════════════════════════════════════════
// يلعب يوماً حقيقيّاً في غرفةٍ بموقع الاختبار (لا نقاط): تعادلٌ ⟵ حصر ⟵ سحبُ أصوات
// ⟵ إعادة ⟵ إقصاءُ المافيويّ الوحيد ⟵ فوز المدينة ⟵ احتساب. ويثبت:
//   ١. كلّ جولةٍ تُفرز تصل الهاتفين والمتفرّج (day:vote-history) بالصوت النهائيّ وحده
//      (تغييرُ الصوت لا يظهر)، وبالوكالة 🤝، والانتهاء ⏰، وما سُجّل بلا اسم.
//   ٢. النتائج: TIE ⟵ TIE_NARROW، ثمّ WITHDRAWN بمن سحب، ثمّ ELIMINATED مع الكشف لا قبله.
//   ٣. الجلب عند الطلب يطابق البثّ، ومن ليس في الغرفة يُردّ. ولا دورَ في السجلّ.
//   ٤. يُحفظ في matches.vote_log، ويقرؤه من لعب المباراة وحده عبر الـAPI.
//   ٥. اللعبة الجديدة تبدأ بسجلٍّ فارغ.
//
// ⚠️ ينشئ غرفةً في «Test Location» (#3) ويُنهي مباراةً اختباريّة واحدة ثمّ يحذف الغرفة.
//    الهاتف أ يدخل بحساب TestPlayer1 (#6) — حساب اختبار — ليُفحص الـAPI بمشاركٍ حقيقيّ.
//
// التشغيل على الخادم (من ~/e2e-tools حيث socket.io-client):
//   J='const j=require("jsonwebtoken"),s=process.env.JWT_SECRET;'
//   TOKEN=$(docker exec mafia-prod-backend-1 node -e "$J console.log(j.sign({id:1,role:'admin',username:'admin'},s,{expiresIn:'30m'}))")
//   P_IN=$(docker exec mafia-prod-backend-1 node -e "$J console.log(j.sign({playerId:6,phone:'0790000001',name:'TestPlayer1'},s+'_PLAYER',{expiresIn:'30m'}))")
//   P_OUT=$(docker exec mafia-prod-backend-1 node -e "$J console.log(j.sign({playerId:255,phone:'00000000',name:'test'},s+'_PLAYER',{expiresIn:'30m'}))")
//   MAFIA_STAFF_TOKEN=$TOKEN PLAYER_TOKEN_IN=$P_IN PLAYER_TOKEN_OUT=$P_OUT MAFIA_URL=http://localhost:4000 node e2e-vote-history.mjs
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
const P_IN = process.env.PLAYER_TOKEN_IN, P_OUT = process.env.PLAYER_TOKEN_OUT;
if (!TOKEN || !P_IN || !P_OUT) { console.error('❌ MAFIA_STAFF_TOKEN و PLAYER_TOKEN_IN و PLAYER_TOKEN_OUT مطلوبة'); process.exit(1); }
const TEST_LOCATION = 3, TEST_PLAYER = { id: 6, phone: '0790000001' };

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; failures.push(n + (d ? ` — ${d}` : '')); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const RUN = String(Date.now()).slice(-5);
const PH_B = `07943${RUN}`, PH_S = `07944${RUN}`;
const rpc = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 20000);
  s.emit(ev, payload, (r) => { clearTimeout(t); res(r); });
});
const connect = (auth) => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], auth, reconnection: false, timeout: 20000 });
  s.on('connect', () => res(s));
  s.on('connect_error', rej);
});
const api = async (p, tok) => {
  const r = await fetch(`${URL}${p}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  let body = null; try { body = await r.json(); } catch { /* */ }
  return { status: r.status, body };
};

const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
console.log(`🔌 الليدر متصل بـ${URL}`);
let roomId = null;
const sockets = [];
let generatedRoles = null;
leader.on('setup:roles-generated', d => {
  generatedRoles = [...(d.mafiaRoles || []), ...(d.citizenRoles || []), ...(d.neutralRoles || [])];
});

try {
  // ══ ١) غرفة اختبار: ستّة ضيوف + هاتفان (أ بحساب اختبار) ══
  console.log('\n━━━ ١) الإعداد ━━━');
  const created = await rpc(leader, 'room:create', {
    gameName: `فحص سجلّ التصويت ${new Date().toISOString().slice(11, 19)}`, maxPlayers: 12, maxJustifications: 2,
    locationId: TEST_LOCATION,
  });
  roomId = created.roomId || created.state?.roomId;
  ok('أُنشئت الغرفة', !!roomId, JSON.stringify(created).slice(0, 120));
  leader.emit('room:rejoin-leader', { roomId });
  for (let i = 1; i <= 6; i++) {
    const r = await rpc(leader, 'room:force-add-player', { roomId, physicalId: i, name: `ضيف${i}`, phone: `07945${RUN}`.slice(0, 9) + i, dob: '1995-01-01', gender: 'MALE' });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
  }
  const pA = await connect({ playerToken: P_IN }); sockets.push(pA);
  const pB = await connect({}); sockets.push(pB);
  const jA = await rpc(pA, 'room:auto-join', { roomId, name: 'TestPlayer1', gender: 'MALE', phone: TEST_PLAYER.phone, playerId: TEST_PLAYER.id });
  const jB = await rpc(pB, 'room:auto-join', { roomId, name: 'هاتف-ب', gender: 'MALE', phone: PH_B });
  ok('انضمّ الهاتفان', jA?.success === true && jB?.success === true, `${jA?.error || ''} ${jB?.error || ''}`);
  if (!jA?.success || !jB?.success) throw new Error('تعذّر انضمام الهاتفين — لا معنى للمتابعة');
  const seatA = Number(jA?.assignedSeat ?? jA?.physicalId);
  const seatB = Number(jB?.assignedSeat ?? jB?.physicalId);

  await rpc(leader, 'room:start-generation', { roomId, supportsAbsentPrompt: true });
  await sleep(600);
  // مافيويٌّ واحد بلا محايدين ولا عمدة ولا توأمين: إقصاؤه يُنهي اللعبة بفوز المدينة
  const n = generatedRoles?.length || 8;
  const roles = ['MAFIA_REGULAR', 'DOCTOR', 'SHERIFF', ...Array(Math.max(0, n - 3)).fill('CITIZEN')];
  ok('اعتُمدت الأدوار', (await rpc(leader, 'setup:roles-confirmed', { roomId, roles }))?.success === true, JSON.stringify(roles));
  ok('وُزّعت', (await rpc(leader, 'setup:random-assign', { roomId, lockedPhysicalIds: [] }))?.success === true);
  ok('أُكّدت', (await rpc(leader, 'setup:confirm-roles', { roomId }))?.success === true);
  ok('بدأت', (await rpc(leader, 'setup:binding-complete', { roomId }))?.success === true);
  await sleep(1000);

  // متفرّجٌ وصل بعد البدء
  const pS = await connect({}); sockets.push(pS);
  const jS = await rpc(pS, 'room:auto-join', { roomId, name: 'متفرّج', gender: 'MALE', phone: PH_S });
  ok('وصل متفرّج', jS?.spectator === true, JSON.stringify(jS).slice(0, 120));

  const S0 = (await rpc(leader, 'game:get-state', { roomId })).state;
  const seats = (S0?.players || []).map(p => p.physicalId).sort((a, b) => a - b);
  const M = (S0?.players || []).find(p => p.role === 'MAFIA_REGULAR')?.physicalId;
  const X = seats.find(s => s !== M && s !== seatA && s !== seatB);
  const Z = seats.find(s => ![M, X, seatA, seatB].includes(s));
  ok('عُرفت المقاعد', M != null && X != null && Z != null, `M=${M} X=${X} Z=${Z} A=${seatA} B=${seatB}`);
  console.log(`   المافيويّ #${M} · المنافس #${X} · المتأخّر #${Z} · الهاتفان #${seatA} #${seatB}`);

  const hist = { A: [], B: [], S: [], out: [] };
  pA.on('day:vote-history', d => hist.A.push(d));
  pB.on('day:vote-history', d => hist.B.push(d));
  pS.on('day:vote-history', d => hist.S.push(d));
  const stranger = await connect({}); sockets.push(stranger);
  stranger.on('day:vote-history', d => hist.out.push(d));

  const idxOf = async (seat) => {
    const st = (await rpc(leader, 'game:get-state', { roomId })).state;
    return (st?.votingState?.candidates || []).findIndex(c => c.type === 'PLAYER' && c.targetPhysicalId === seat);
  };
  const phoneOf = { [seatA]: pA, [seatB]: pB };
  const vote = async (voter, target) => {
    const i = await idxOf(target);
    if (phoneOf[voter]) return rpc(phoneOf[voter], 'player:cast-vote', { roomId, physicalId: voter, candidateIndex: i });
    return rpc(leader, 'day:cast-vote', { roomId, candidateIndex: i, delta: 1, voterPhysicalId: voter });
  };
  const last = (arr) => arr[arr.length - 1]?.history || [];
  const round = (h, id) => h.find(r => r.id === id);
  const cand = (r, seat) => r?.candidates?.find(c => c.targetPhysicalId === seat);

  // ══ ٢) الجولة الأولى: تعادل ══
  console.log('\n━━━ ٢) جولة ١ — تعادلٌ بين #M و#X ━━━');
  ok('بدأ التصويت', (await rpc(leader, 'day:start-voting', { roomId }))?.success === true);
  await sleep(300);
  const final1 = {};
  let cM = 0, cX = 0;
  for (const v of seats.filter(s => s !== Z)) {
    const t = v === M ? X : v === X ? M : (cM <= cX ? M : X);
    final1[v] = t; if (t === M) cM++; else cX++;
  }
  // الهاتف أ يغيّر رأيه: صوتٌ أوّل على Z ثمّ صوته النهائيّ — السجلّ يحفظ النهائيّ وحده
  ok('أ صوّت أوّلاً على #Z', (await vote(seatA, Z))?.success === true);
  for (const v of Object.keys(final1).map(Number)) {
    const r = await vote(v, final1[v]);
    if (!r?.success) ok(`صوت #${v}`, false, r?.error);
  }
  // ما سجّله الموجّه بلا اسم يعيد التعادل (أو يُضاف للطرفين)
  const unnamed = cM === cX ? [M, X] : [cM < cX ? M : X];
  for (const t of unnamed) ok(`عدٌّ يدويّ بلا اسم على #${t}`, (await rpc(leader, 'day:cast-vote', { roomId, candidateIndex: await idxOf(t), delta: 1 }))?.success === true);
  ok('انتهى الوقت ⇒ #Z على نفسه', (await rpc(leader, 'day:voting-timeout', { roomId }))?.success === true);
  ok('فُرزت الجولة', (await rpc(leader, 'day:resolve', { roomId }))?.success === true);
  await sleep(600);

  const h1 = last(hist.A);
  const r1 = round(h1, 'r1-1');
  ok('وصلت الجولة الهاتفَ أ', !!r1, JSON.stringify(h1).slice(0, 160));
  ok('…والهاتفَ ب والمتفرّجَ بالمحتوى نفسه', JSON.stringify(last(hist.B)) === JSON.stringify(h1) && JSON.stringify(last(hist.S)) === JSON.stringify(h1));
  ok('🔒 لم تصل من ليس في الغرفة', hist.out.length === 0);
  ok('نوعها تصويت النهار', r1?.kind === 'DAY' && r1?.round === 1 && r1?.seq === 1, `${r1?.kind} ${r1?.round}/${r1?.seq}`);
  const vA = [cand(r1, M), cand(r1, X), cand(r1, Z)].flatMap(c => c?.voters || []).filter(v => v.voterPhysicalId === seatA);
  ok('صوتُ أ النهائيّ وحده (لا أثرَ للأوّل)', vA.length === 1 && cand(r1, final1[seatA])?.voters?.some(v => v.voterPhysicalId === seatA) && !vA[0].via,
    JSON.stringify(vA));
  const proxied = Object.keys(final1).map(Number).filter(v => !phoneOf[v]);
  ok('أصوات الوكالة موسومة 🤝', proxied.every(v => cand(r1, final1[v])?.voters?.find(x => x.voterPhysicalId === v)?.via === 'proxy'));
  ok('#Z على نفسه موسومٌ ⏰', cand(r1, Z)?.voters?.length === 1 && cand(r1, Z).voters[0].voterPhysicalId === Z && cand(r1, Z).voters[0].via === 'auto',
    JSON.stringify(cand(r1, Z)));
  const unnamedTotal = (cand(r1, M)?.unnamed || 0) + (cand(r1, X)?.unnamed || 0);
  ok('ما بلا اسم محسوب', unnamedTotal === unnamed.length, `${unnamedTotal} vs ${unnamed.length}`);
  ok('التعادل ظاهر في الأرقام', cand(r1, M)?.votes === cand(r1, X)?.votes, `${cand(r1, M)?.votes} = ${cand(r1, X)?.votes}`);
  ok('بلا نتيجةٍ بعد', r1?.outcome == null);
  const pulled = await rpc(pA, 'room:get-vote-history', { roomId });
  ok('الجلب عند الطلب = البثّ', pulled?.success === true && JSON.stringify(pulled.history) === JSON.stringify(h1));
  const pulledS = await rpc(pS, 'room:get-vote-history', { roomId });
  ok('والمتفرّجُ يجلب', pulledS?.success === true && pulledS.history?.length === 1, pulledS?.error);
  const denied = await rpc(stranger, 'room:get-vote-history', { roomId });
  ok('🔒 ومن ليس في الغرفة يُردّ', denied?.success === false, JSON.stringify(denied));
  const ROLE_WORDS = ['MAFIA_REGULAR', 'DOCTOR', 'SHERIFF', '"role"', 'team'];
  ok('🔒 لا دورَ في السجلّ', !ROLE_WORDS.some(w => JSON.stringify(h1).includes(w)));

  const ex1 = await rpc(leader, 'day:execute-elimination', { roomId, skipWithdrawal: true });
  ok('التنفيذ ⇒ تعادل', ex1?.success === true, ex1?.error);
  await sleep(500);
  ok('النتيجة: TIE', round(last(hist.A), 'r1-1')?.outcome?.type === 'TIE', JSON.stringify(round(last(hist.A), 'r1-1')?.outcome));
  // حصرٌ بلا متعادلين لا يغيّر شيئاً في المحرّك — فلا يُكتب «حصر» في السجلّ
  await rpc(leader, 'day:tie-action', { roomId, action: 'NARROW' });
  await sleep(400);
  ok('حصرٌ بلا متعادلين لا يُختم', round(last(hist.A), 'r1-1')?.outcome?.type === 'TIE', JSON.stringify(round(last(hist.A), 'r1-1')?.outcome));
  // كما تفعل لوحة الموجّه: المتعادلون من نتيجة التنفيذ
  const tie = await rpc(leader, 'day:tie-action', { roomId, action: 'NARROW', tiedCandidates: ex1?.result?.tiedCandidates });
  ok('الموجّه حصر', tie?.success === true, tie?.error);
  await sleep(500);
  ok('النتيجة: TIE_NARROW', round(last(hist.A), 'r1-1')?.outcome?.type === 'TIE_NARROW', JSON.stringify(round(last(hist.A), 'r1-1')?.outcome));

  // ══ ٣) جولة الحصر: أغلبيّةٌ على M ثمّ يسحبون ══
  console.log('\n━━━ ٣) جولة ٢ — الحصر ثمّ سحب الأصوات ━━━');
  const st2 = (await rpc(leader, 'game:get-state', { roomId })).state;
  const c2 = (st2?.votingState?.candidates || []).map(c => c.targetPhysicalId).sort();
  ok('المرشّحان المتعادلان وحدهما', JSON.stringify(c2) === JSON.stringify([M, X].sort()), JSON.stringify(c2));
  for (const v of seats) {
    const r = await vote(v, v === M ? X : M);
    if (!r?.success) ok(`صوت #${v}`, false, r?.error);
  }
  ok('فُرزت جولة الحصر', (await rpc(leader, 'day:resolve', { roomId }))?.success === true);
  await sleep(500);
  const r2 = round(last(hist.A), 'r1-2');
  ok('جولة ٢ نوعها حصر', r2?.kind === 'TIE_NARROW' && r2?.seq === 2, `${r2?.kind} ${r2?.seq}`);
  ok('جولة ١ ما زالت في السجلّ', round(last(hist.A), 'r1-1')?.outcome?.type === 'TIE_NARROW');
  const withdrawers = [seatA, seatB, ...seats.filter(s => ![M, seatA, seatB].includes(s))].filter(s => s !== M).slice(0, 4);
  for (const w of withdrawers) {
    const s = phoneOf[w] || leader;
    const r = await rpc(s, 'player:withdraw-vote', { physicalId: w });
    if (!r?.success) ok(`سحب #${w}`, false, r?.error);
  }
  const ex2 = await rpc(leader, 'day:execute-elimination', { roomId });
  ok('سُحب ما يكفي ⇒ إعادة', ex2?.success === true && ex2?.revote === true, JSON.stringify(ex2));
  await sleep(600);
  const r2b = round(last(hist.A), 'r1-2');
  ok('النتيجة: WITHDRAWN بالعدد', r2b?.outcome?.type === 'WITHDRAWN' && r2b.outcome.withdrawnVotes >= r2b.outcome.neededVotes, JSON.stringify(r2b?.outcome));
  ok('مَن سحب مسجَّل', JSON.stringify([...(r2b?.withdrawn || [])].sort()) === JSON.stringify([...withdrawers].sort()), `${JSON.stringify(r2b?.withdrawn)} vs ${JSON.stringify(withdrawers)}`);

  // ══ ٤) الإعادة: إقصاء M — النتيجة مع الكشف لا قبله ══
  console.log('\n━━━ ٤) جولة ٣ — الإقصاء والكشف ━━━');
  for (const v of seats) {
    const r = await vote(v, v === M ? X : M);
    if (!r?.success) ok(`صوت #${v}`, false, r?.error);
  }
  ok('فُرزت جولة الإعادة', (await rpc(leader, 'day:resolve', { roomId }))?.success === true);
  await sleep(500);
  const r3 = round(last(hist.A), 'r1-3');
  ok('جولة ٣ نوعها بعد السحب', r3?.kind === 'WITHDRAWAL_REVOTE' && r3?.seq === 3, `${r3?.kind} ${r3?.seq}`);
  ok('نُفّذ الإقصاء', (await rpc(leader, 'day:execute-elimination', { roomId, skipWithdrawal: true }))?.success === true);
  await sleep(600);
  const preReveal = await rpc(pA, 'room:get-vote-history', { roomId });
  ok('🔒 قبل الكشف: لا إقصاءَ في السجلّ', round(preReveal?.history || [], 'r1-3')?.outcome == null, JSON.stringify(round(preReveal?.history || [], 'r1-3')?.outcome));
  ok('كُشفت الأدوار', (await rpc(leader, 'day:trigger-reveal', { roomId, result: {} }))?.success === true);
  await sleep(800);
  const r3b = round(last(hist.S), 'r1-3');
  ok('مع الكشف: أُقصي M باسمه', r3b?.outcome?.type === 'ELIMINATED' && JSON.stringify(r3b.outcome.eliminated) === JSON.stringify([M]) && !!r3b.outcome.names?.[0],
    JSON.stringify(r3b?.outcome));
  ok('🔒 ولا دورَ حتى بعد الكشف', !ROLE_WORDS.some(w => JSON.stringify(last(hist.S)).includes(w)));
  const H = last(hist.A);
  ok('ثلاث جولات بالترتيب', JSON.stringify(H.map(r => r.id)) === JSON.stringify(['r1-1', 'r1-2', 'r1-3']), JSON.stringify(H.map(r => r.id)));

  // ══ ٥) نهاية اللعبة ⇒ الحفظ مع المباراة ══
  console.log('\n━━━ ٥) الاحتساب والحفظ ━━━');
  const stE = (await rpc(leader, 'game:get-state', { roomId })).state;
  ok('فوز المدينة معلّق', stE?.pendingWinner === 'CITIZEN', `${stE?.pendingWinner}`);
  const matchId = stE?.matchId;
  ok('أُنهيت اللعبة', (await rpc(leader, 'game:confirm-end', { roomId }))?.success === true);
  await sleep(1500);
  const mine = await api(`/api/player-app/${TEST_PLAYER.id}/matches/${matchId}/votes`, P_IN);
  ok('API: من لعب يقرأ السجلّ', mine.status === 200 && mine.body?.success === true && mine.body.rounds?.length === 3, `${mine.status} ${JSON.stringify(mine.body).slice(0, 120)}`);
  // JSONB يعيد ترتيب المفاتيح — المقارنة بالمحتوى لا بالترتيب
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  ok('API: المحفوظ = ما رآه الهاتف', JSON.stringify(canon(mine.body?.rounds)) === JSON.stringify(canon(H)),
    `${JSON.stringify(canon(mine.body?.rounds)).slice(0, 200)} ≠ ${JSON.stringify(canon(H)).slice(0, 200)}`);
  ok('API: يعرف مقعدي', Number(mine.body?.myPhysicalId) === seatA, `${mine.body?.myPhysicalId} vs ${seatA}`);
  const other = await api(`/api/player-app/255/matches/${matchId}/votes`, P_OUT);
  ok('🔒 API: من لم يلعب يُردّ 403', other.status === 403, `${other.status}`);
  const anon = await api(`/api/player-app/${TEST_PLAYER.id}/matches/${matchId}/votes`, null);
  ok('🔒 API: بلا توكن 401', anon.status === 401, `${anon.status}`);
  const list = await api(`/api/player-app/${TEST_PLAYER.id}/matches`, P_IN);
  const row = (list.body?.matches || []).find(m => Number(m.matchId) === Number(matchId));
  ok('القائمة تعلّم المباراة hasVoteLog', row?.hasVoteLog === true, JSON.stringify(row ? { matchId: row.matchId, hasVoteLog: row.hasVoteLog } : null));

  // ══ ٦) لعبةٌ جديدة: سجلٌّ فارغ ══
  console.log('\n━━━ ٦) لعبة جديدة ━━━');
  const ng = await rpc(leader, 'room:new-game', { roomId, excludePlayerIds: [], resetPenalties: false });
  ok('بدأت لعبة جديدة', ng?.success === true, ng?.error);
  const fresh = await rpc(pA, 'room:get-vote-history', { roomId });
  ok('السجلّ فارغ', fresh?.success === true && Array.isArray(fresh.history) && fresh.history.length === 0, JSON.stringify(fresh).slice(0, 100));
  console.log(`   المباراة #${matchId}`);
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
