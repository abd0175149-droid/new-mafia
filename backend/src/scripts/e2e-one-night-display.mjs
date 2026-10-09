// ══════════════════════════════════════════════════════
// 🧪 اختبار وظيفيّ حيّ: الليلة الواحدة لا تكشف إيقاعَ اللاعبين على شاشة القاعة (2026-10-09)
// ══════════════════════════════════════════════════════
// كانت الشاشة تعرض «الطبيب حمى أحدهم» لحظةَ إرسال الطبيب، فيُعرف من اختار ومن تأخّر.
// الآن تستلم الشاشة حدثاً واحداً عند البدء (لحظةُ البدء + المهلة + القدرات) وتعرض ضرباتٍ
// بجدولٍ ثابت. ويثبت هذا الفحص من مقبس شاشةٍ حقيقيّ:
//   ١. night:one-started للشاشة = {startedAt, windowMs, abilities} فقط — بلا قائمة لاعبين ولا أعداد.
//   ٢. لا يصل الشاشةَ أيُّ حدثٍ عند إرسال أيّ لاعب، ولا المراجعة. والموجّه يستلم التقدّم والمراجعة.
//   ٣. الحالة التي تستلمها شاشةٌ تنضمّ وسط الليلة تحمل startedAt/windowMs (للاستئناف بالجدول نفسه).
//
// ⚠️ غرفةٌ في «Test Location» (#3) تُحذف في النهاية؛ لا مباراةَ تُحتسب.
//
// التشغيل على الخادم (من ~/e2e-tools):
//   TOKEN=$(docker exec mafia-prod-backend-1 node -e "const j=require('jsonwebtoken');console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'30m'}))")
//   MAFIA_STAFF_TOKEN=$TOKEN MAFIA_URL=http://localhost:4000 node e2e-one-night-display.mjs
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

const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
let roomId = null;
const sockets = [];
let generatedRoles = null;
leader.on('setup:roles-generated', d => {
  generatedRoles = [...(d.mafiaRoles || []), ...(d.citizenRoles || []), ...(d.neutralRoles || [])];
});

try {
  console.log('\n━━━ ١) الإعداد ━━━');
  const created = await rpc(leader, 'room:create', {
    gameName: `فحص الليلة والشاشة ${new Date().toISOString().slice(11, 19)}`, maxPlayers: 12, maxJustifications: 2, locationId: 3,
  });
  roomId = created.roomId || created.state?.roomId;
  ok('أُنشئت الغرفة', !!roomId);
  leader.emit('room:rejoin-leader', { roomId });
  for (let i = 1; i <= 6; i++) {
    const r = await rpc(leader, 'room:force-add-player', { roomId, physicalId: i, name: `ضيف${i}`, phone: `07946${RUN}`.slice(0, 9) + i, dob: '1995-01-01', gender: 'MALE' });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
  }
  const phones = [];
  for (const tag of ['أ', 'ب']) {
    const s = await connect({}); sockets.push(s);
    const asks = []; s.on('night:one-ask', d => asks.push(d));
    const j = await rpc(s, 'room:auto-join', { roomId, name: `هاتف-${tag}`, gender: 'MALE', phone: `0794${tag === 'أ' ? 7 : 8}${RUN}` });
    if (!j?.success) throw new Error(`join ${tag}: ${j?.error}`);
    phones.push({ s, tag, seat: Number(j.assignedSeat ?? j.physicalId), asks });
  }
  ok('انضمّ الهاتفان', phones.length === 2);

  await rpc(leader, 'room:start-generation', { roomId, supportsAbsentPrompt: true });
  await sleep(600);
  const n = generatedRoles?.length || 8;
  const roles = ['MAFIA_REGULAR', 'DOCTOR', 'SHERIFF', ...Array(Math.max(0, n - 3)).fill('CITIZEN')];
  ok('اعتُمدت الأدوار', (await rpc(leader, 'setup:roles-confirmed', { roomId, roles }))?.success === true);
  ok('وُزّعت', (await rpc(leader, 'setup:random-assign', { roomId, lockedPhysicalIds: [] }))?.success === true);
  ok('أُكّدت', (await rpc(leader, 'setup:confirm-roles', { roomId }))?.success === true);
  ok('بدأت', (await rpc(leader, 'setup:binding-complete', { roomId }))?.success === true);
  await sleep(800);

  // 📺 شاشةُ القاعة: مقبسٌ بتوكن موظّف ينضمّ بدور «display» — ويسجّل كلَّ ما يصله
  const display = await connect({ token: TOKEN }); sockets.push(display);
  const dj = await rpc(display, 'display:join-room', { roomId });
  ok('انضمّت الشاشة', dj?.success === true, JSON.stringify(dj).slice(0, 100));
  const dEv = []; display.onAny((e, d) => dEv.push({ e, d, t: Date.now() }));
  const lEv = []; leader.onAny((e, d) => lEv.push({ e, d, t: Date.now() }));

  console.log('\n━━━ ٢) بدءُ الليلة الواحدة ━━━');
  const ns = await rpc(leader, 'night:start', { roomId });
  ok('بدأ الليل', ns?.success === true, ns?.error);
  await sleep(500);
  const os = await rpc(leader, 'night:one-start', { roomId, durationSeconds: 20 });
  ok('بدأت الليلة الواحدة', os?.success === true, os?.error);
  await sleep(800);

  const dStart = dEv.find(x => x.e === 'night:one-started')?.d;
  ok('الشاشة استلمت البدء', !!dStart);
  ok('🔒 حمولةُ الشاشة: startedAt و windowMs و abilities فقط', dStart && JSON.stringify(Object.keys(dStart).sort()) === JSON.stringify(['abilities', 'startedAt', 'windowMs']),
    JSON.stringify(dStart && Object.keys(dStart)));
  ok('المهلة كما طُلبت', dStart?.windowMs === 20000, `${dStart?.windowMs}`);
  ok('القدرات تشمل القتل والحماية والتحقيق', ['KILL', 'PROTECT', 'INVESTIG'].every(k => (dStart?.abilities || []).some(a => String(a).toUpperCase().includes(k))),
    JSON.stringify(dStart?.abilities));
  const lStart = lEv.find(x => x.e === 'night:one-started')?.d;
  ok('الموجّه استلم القائمة والمهلة', Array.isArray(lStart?.roster) && lStart.roster.length > 0 && lStart.windowMs === 20000);

  console.log('\n━━━ ٣) الإرسال — لا شيءَ يصل الشاشة ━━━');
  for (const p of phones) {
    const ask = p.asks[p.asks.length - 1];
    const steps = Array.isArray(ask?.steps) ? ask.steps : [];
    const picks = steps.length
      ? steps.map(st => ({ abilityId: st.abilityId ?? null, targetPhysicalId: (st.targets || st.options || [])[0]?.physicalId ?? null }))
      : [{ abilityId: null, targetPhysicalId: phones.find(x => x !== p).seat }];
    const markD = dEv.length, markL = lEv.length;
    const r = await rpc(p.s, 'night:one-submit', { roomId, picks });
    ok(`الهاتف ${p.tag} أرسل`, r?.success === true, r?.error);
    await sleep(1200);
    const toD = dEv.slice(markD).map(x => x.e);
    ok(`🔒 الشاشة لم تستلم شيئاً بعد إرسال ${p.tag}`, toD.length === 0, toD.join(','));
    const prog = lEv.slice(markL).find(x => x.e === 'night:one-progress')?.d;
    ok(`الموجّه استلم التقدّم بعد ${p.tag}`, typeof prog?.done === 'number' && !('acted' in (prog || {})), JSON.stringify(prog).slice(0, 80));
  }

  console.log('\n━━━ ٤) شاشةٌ تنضمّ وسط الليلة ━━━');
  const d2 = await connect({ token: TOKEN }); sockets.push(d2);
  const dj2 = await rpc(d2, 'display:join-room', { roomId });
  const on1 = dj2?.state?.oneNight;
  ok('الحالة تحمل لحظةَ البدء والمهلة', on1?.startedAt === dStart?.startedAt && on1?.windowMs === 20000 && on1?.dispatched === true,
    JSON.stringify({ s: on1?.startedAt, w: on1?.windowMs, d: on1?.dispatched }));

  console.log('\n━━━ ٥) المراجعة ━━━');
  const markD = dEv.length, markL = lEv.length;
  ok('الموجّه أنهى المهلة', (await rpc(leader, 'night:one-close', { roomId }))?.success === true);
  await sleep(1000);
  ok('الموجّه استلم المراجعة', lEv.slice(markL).some(x => x.e === 'night:one-review'));
  const toD = dEv.slice(markD).map(x => x.e);
  ok('🔒 الشاشة لم تستلم المراجعة', !toD.includes('night:one-review'), toD.join(','));
  ok('🔒 لا night:one-progress للشاشة طوال الليلة', !dEv.some(x => x.e === 'night:one-progress'));
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
