// ══════════════════════════════════════════════════════
// 🧪 اختبار وظيفيّ حيّ: المتفرّج المتأخّر + فصل الأصدقاء
// ══════════════════════════════════════════════════════
// يقود سوكِتات ليدر ولاعبين فعليّة ضدّ خادمٍ حيّ، ويثبت ما يستحيل إثباته
// بقراءة الشيفرة:
//   ١. الواصل أثناء لعبةٍ جارية لم يعد يُرفض — يُردّ له مقعدٌ محجوز.
//   ٢. المتفرّج **خارج** state.players فلا يدخل أيّ طابور.
//   ٣. حمولةُ المتفرّج معقّمة: لا دورَ حيّاً فيها إطلاقاً.
//   ٤. الواصلان معاً لا يجلسان متجاورَين (كسر التعادل بالتباعد).
//   ٥. «رتّب تلقائيّاً» يقترح بلا أن يطبّق (dryRun).
//   ٦. المتفرّج يُرقَّى لاعباً عند اللعبة التالية بمقعده.
//
// ⚠️ ينشئ غرفةً حقيقيّة ثمّ يحذفها. مرِّر MAFIA_ACTIVITY_ID لنشاطٍ في موقعٍ
//    اختباريّ إن أردت عزلاً تامّاً؛ وبدونه لا يُحتسب رانك لأنّ اللعبة تُحذف.
//
// التشغيل على الخادم:
//   TOKEN=$(docker exec mafia-prod-backend-1 node -e "const j=require('jsonwebtoken');\
//     console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'30m'}))")
//   MAFIA_STAFF_TOKEN=$TOKEN MAFIA_URL=http://localhost:4000 \
//     node backend/src/scripts/e2e-spectator-seating.mjs
// ══════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '../../../frontend/package.json'));
const { io } = require('socket.io-client');

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
const rpc = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 20000);
  s.emit(ev, payload, (r) => { clearTimeout(t); res(r); });   // لا نرفض: نفحص الردّ بأنفسنا
});
const connect = (auth) => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], auth, reconnection: false, timeout: 20000 });
  s.on('connect', () => res(s));
  s.on('connect_error', rej);
});
const circDist = (a, b, n) => { const d = Math.abs(a - b); return Math.min(d, n - d); };

const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
console.log(`🔌 الليدر متصل بـ${URL}`);

let roomId = null;
const sockets = [];
const spectatorEvents = [];
leader.on('room:spectator-joined', d => spectatorEvents.push(d));

try {
  // ══ ١) غرفة + ٦ لاعبين ══
  console.log('\n━━━ ١) إنشاء غرفة وإجلاس ستّة ━━━');
  const created = await rpc(leader, 'room:create', {
    gameName: `فحص المتفرّج ${new Date().toISOString().slice(11, 19)}`,
    maxPlayers: 12, maxJustifications: 2, ...(ACTIVITY_ID ? { activityId: ACTIVITY_ID } : {}),
  });
  roomId = created.roomId || created.state?.roomId;
  ok('أُنشئت الغرفة', !!roomId, JSON.stringify(created).slice(0, 100));
  leader.emit('room:rejoin-leader', { roomId });

  for (let i = 1; i <= 6; i++) {
    const r = await rpc(leader, 'room:force-add-player', {
      roomId, physicalId: i, name: `لاعب${i}`, phone: `079000000${i}`, dob: '1995-01-01', gender: 'MALE',
    });
    if (!r?.success) throw new Error(`force-add ${i}: ${r?.error}`);
  }
  const st1 = await rpc(leader, 'game:get-state', { roomId });
  ok('ستّة لاعبين جالسون', (st1.state?.players?.length || 0) === 6, `${st1.state?.players?.length}`);

  // ══ ٢) كسر التعادل بالتباعد ══
  console.log('\n━━━ ٢) واصلان في اللحظة نفسها لا يتجاوران ━━━');
  const pA = await connect({}); sockets.push(pA);
  const pB = await connect({}); sockets.push(pB);
  const [jA, jB] = await Promise.all([
    rpc(pA, 'room:auto-join', { roomId, name: 'صاحب-أ', gender: 'MALE', phone: '0791111111' }),
    rpc(pB, 'room:auto-join', { roomId, name: 'صاحب-ب', gender: 'MALE', phone: '0791111112' }),
  ]);
  ok('انضمّ الأوّل', jA?.success === true, jA?.error);
  ok('انضمّ الثاني', jB?.success === true, jB?.error);
  if (jA?.assignedSeat && jB?.assignedSeat) {
    const d = circDist(jA.assignedSeat, jB.assignedSeat, 12);
    ok(`الواصلان معاً غير متجاورَين (${jA.assignedSeat} و${jB.assignedSeat} — المسافة ${d})`, d >= 2, `المسافة ${d}`);
  }

  // ══ ٣) «رتّب تلقائيّاً» يقترح بلا تطبيق ══
  console.log('\n━━━ ٣) اقتراح ترتيبٍ بلا تطبيق (dryRun) ━━━');
  const before = await rpc(leader, 'game:get-state', { roomId });
  const seatsBefore = (before.state?.players || []).map(p => `${p.name}:${p.physicalId}`).sort().join(',');
  const dry = await rpc(leader, 'room:reshuffle-seats', { roomId, dryRun: true });
  ok('الاقتراح نجح', dry?.success === true, dry?.error);
  ok('الردّ موسومٌ كمعاينة', dry?.dryRun === true);
  ok('الردّ يحمل قائمة تغييرات', Array.isArray(dry?.changes), JSON.stringify(dry).slice(0, 120));
  const after = await rpc(leader, 'game:get-state', { roomId });
  const seatsAfter = (after.state?.players || []).map(p => `${p.name}:${p.physicalId}`).sort().join(',');
  ok('لم يتحرّك أحد فعليّاً بالمعاينة', seatsBefore === seatsAfter);

  // ══ ٤) بدء اللعبة ══
  console.log('\n━━━ ٤) بدء اللعبة ━━━');
  const gen = await rpc(leader, 'room:start-generation', { roomId, supportsAbsentPrompt: true });
  ok('بدأ توليد الأدوار', gen?.success === true, gen?.error || gen?.code);
  const roles = gen?.roles || gen?.state?.rolesPool;
  const conf = await rpc(leader, 'setup:roles-confirmed', { roomId, roles: roles || undefined });
  ok('اعتُمدت قائمة الأدوار', conf?.success === true, conf?.error);
  const rnd = await rpc(leader, 'setup:random-assign', { roomId, lockedPhysicalIds: [] });
  ok('وُزّعت الأدوار عشوائيّاً', rnd?.success === true, rnd?.error);
  const cr = await rpc(leader, 'setup:confirm-roles', { roomId });
  ok('أُكّدت الأدوار', cr?.success === true, cr?.error);
  const bc = await rpc(leader, 'setup:binding-complete', { roomId });
  ok('بدأت اللعبة فعلاً (binding-complete)', bc?.success === true, bc?.error);
  const inGame = await rpc(leader, 'game:get-state', { roomId });
  ok('الطور صار نهاراً', inGame.state?.phase === 'DAY_DISCUSSION', inGame.state?.phase);

  // ══ ٥) الواصل المتأخّر → متفرّج ══
  console.log('\n━━━ ٥) وافدٌ أثناء اللعبة → متفرّج بمقعد ━━━');
  const late = await connect({}); sockets.push(late);
  const lateJoin = await rpc(late, 'room:auto-join', {
    roomId, name: 'المتأخّر', gender: 'MALE', phone: '0792222222',
  });
  ok('لم يُرفض الواصل المتأخّر', lateJoin?.success === true, lateJoin?.error);
  ok('وُسم متفرّجاً', lateJoin?.spectator === true, JSON.stringify(lateJoin).slice(0, 140));
  ok('الرمز GAME_IN_PROGRESS', lateJoin?.code === 'GAME_IN_PROGRESS', lateJoin?.code);
  ok('أُعطي رقم مقعد', Number(lateJoin?.assignedSeat) > 0, `${lateJoin?.assignedSeat}`);
  ok('عرف الطور والجولة', !!lateJoin?.phase && typeof lateJoin?.round === 'number', `${lateJoin?.phase}/${lateJoin?.round}`);

  const gs = await rpc(leader, 'game:get-state', { roomId });
  const inPlayers = (gs.state?.players || []).some(p => p.phone === '0792222222');
  ok('المتفرّج خارج players (لا يدخل أيّ طابور)', inPlayers === false);
  const specs = gs.state?.spectators || [];
  ok('المتفرّج مسجَّل في spectators', specs.some(s => s.phone === '0792222222'), JSON.stringify(specs).slice(0, 120));
  ok('مقعد المتفرّج لا يصطدم بلاعب',
    !(gs.state?.players || []).some(p => p.physicalId === lateJoin?.assignedSeat));

  await sleep(400);
  ok('الليدر أُخطر بالوصول', spectatorEvents.length > 0, `${spectatorEvents.length} حدثاً`);
  if (spectatorEvents[0]) {
    ok('التنبيه يحمل الاسم الأوّل والمقعد',
      !!spectatorEvents[0].firstName && Number(spectatorEvents[0].physicalId) > 0,
      JSON.stringify(spectatorEvents[0]).slice(0, 120));
  }

  // ══ ٦) حمولةُ المتفرّج معقّمة ══
  console.log('\n━━━ ٦) ما يراه المتفرّج — بلا أدوارٍ حيّة ━━━');
  const mine = await rpc(late, 'room:get-my-state', { roomId, phone: '0792222222' });
  ok('حالة المتفرّج تُقرأ (لا Player not found)', mine?.success === true, mine?.error);
  ok('موسومة spectator', mine?.spectator === true);
  ok('فيها المقعد المحجوز', Number(mine?.reservedSeat) > 0, `${mine?.reservedSeat}`);
  ok('لا حقل player إطلاقاً', mine?.player === undefined);
  ok('لا حالة تصويت ولا ليل', mine?.votingState === undefined && mine?.nightState === undefined);
  const roster = mine?.rosterInfo || [];
  ok('الروستر موجود', roster.length > 0, `${roster.length}`);
  const leakedRole = roster.find(r => r.isAlive !== false && r.role);
  ok('🔒 لا دورَ حيٍّ مكشوفٍ في روستر المتفرّج', !leakedRole, JSON.stringify(leakedRole || {}).slice(0, 100));

  // ══ ٧) الترقية عند اللعبة التالية ══
  console.log('\n━━━ ٧) الترقية عند اللعبة الجديدة ━━━');
  let promoted = false;
  late.on('spectator:promoted', () => { promoted = true; });
  const ng = await rpc(leader, 'room:new-game', { roomId, excludePlayerIds: [], resetPenalties: false });
  ok('عادت الغرفة للوبي', ng?.success === true, ng?.error);
  await sleep(1200);
  const post = await rpc(leader, 'game:get-state', { roomId });
  const nowPlayer = (post.state?.players || []).find(p => p.phone === '0792222222');
  ok('المتفرّج صار لاعباً', !!nowPlayer, JSON.stringify(post.state?.spectators || []).slice(0, 80));
  if (nowPlayer) {
    ok(`احتفظ بمقعده (${lateJoin?.assignedSeat} → ${nowPlayer.physicalId})`,
      nowPlayer.physicalId === lateJoin?.assignedSeat, `${nowPlayer.physicalId}`);
  }
  ok('قائمة المتفرّجين فرغت', (post.state?.spectators || []).length === 0);
  ok('سوكِت المتفرّج أُخطر بالترقية', promoted === true);

} catch (e) {
  fail++; failures.push(`استثناء: ${e.message}`);
  console.error('\n💥', e.message);
} finally {
  console.log('\n🧹 تنظيف…');
  try { if (roomId) await rpc(leader, 'room:delete-room', { roomId }); } catch {}
  for (const s of sockets) { try { s.close(); } catch {} }
  try { leader.close(); } catch {}
}

console.log('\n══════════════════════════════════');
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) { console.log('\n❌ الفشل:'); failures.forEach(f => console.log(`   - ${f}`)); process.exit(1); }
console.log('\n🎉 المتفرّج المتأخّر وفصل الأصدقاء يعملان على الخادم الحيّ.');
process.exit(0);
