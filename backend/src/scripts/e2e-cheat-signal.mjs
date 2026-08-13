// ══════════════════════════════════════════════════════
// 🧪 اختبار وظيفيّ حقيقيّ: مغادرة اللاعب → إشارة الليدر (leader:cheat-signal)
// ══════════════════════════════════════════════════════
// يقود سوكِتَي ليدر ولاعب فعليَّين ضدّ خادمٍ حيّ، داخل نشاطٍ في موقع اختباريّ
// (is_test_location = true) فلا يمسّ رانكاً ولا إحصاءات ولا قطرات — ولا تُحتسب
// مباراة أصلاً لأنّ التسلسل يقف عند اعتماد الأدوار (قبل binding-complete).
//
// يثبت ثلاثة أشياء يستحيل إثباتها بقراءة الكود:
//   ١. الإشارة تصل فعلاً لسوكِت الليدر (لا تُخزَّن فحسب).
//   ٢. الحمولة تطابق ما تقرؤه صفحة الليدر: roomId/physicalId/kind/at/details.durationMs.
//   ٣. التجميع يُنتج **سطراً واحداً** لكلّ لاعب يتصاعد عدّاده (لا أسطراً متعدّدة).
//
// ⚠️ يحتاج socket.io-client من الواجهة (الباك-إند لا يتضمّنه):
//     cd frontend && npm install
//
// التشغيل:
//   MAFIA_STAFF_TOKEN=<توكن موظف> MAFIA_ACTIVITY_ID=<نشاط موقع اختباريّ> \
//   MAFIA_URL=https://club-mafia.grade.sbs \
//   node backend/src/scripts/e2e-cheat-signal.mjs
//
// إصدار توكن مؤقّت على الخادم:
//   docker exec mafia-prod-backend-1 node -e "const j=require('jsonwebtoken');\
//     console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'30m'}))"
//
// 🧹 بعده: احذف صفوف الفحص إن أزعجت داشبورد مكافحة الغش —
//   DELETE FROM cheat_signals WHERE details->>'platform' = 'test';
// ══════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// socket.io-client يعيش في اعتماديّات الواجهة — نحلّه منها لا من الباك-إند
const require = createRequire(path.join(__dirname, '../../../frontend/package.json'));
const { io } = require('socket.io-client');

const URL = process.env.MAFIA_URL || 'https://club-mafia.grade.sbs';
const TOKEN = process.env.MAFIA_STAFF_TOKEN;
const ACTIVITY_ID = Number(process.env.MAFIA_ACTIVITY_ID || 0) || undefined;
if (!TOKEN) { console.error('❌ MAFIA_STAFF_TOKEN مطلوب'); process.exit(1); }

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(n + (d ? ` — ${d}` : '')); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rpc = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 15000);
  s.emit(ev, payload, (r) => { clearTimeout(t); r?.success === false ? rej(new Error(r.error || ev)) : res(r); });
});
const connect = (auth) => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], auth, reconnection: false, timeout: 15000 });
  s.on('connect', () => res(s));
  s.on('connect_error', (e) => rej(e));
});

// ── مُحاكي منطق التجميع في صفحة الليدر (نفس الصيغة حرفياً) ──
// يثبت الثابت المطلوب: عدّة مغادرات لنفس اللاعب = **سطر واحد** بعدّاد يتصاعد.
function aggregate(prev, d) {
  const at = typeof d.at === 'number' ? d.at : Date.now();
  const durMs = typeof d?.details?.durationMs === 'number' ? d.details.durationMs : null;
  const isDeparture = d.kind === 'app_departure';
  const old = prev[d.physicalId];
  return {
    ...prev,
    [d.physicalId]: {
      physicalId: d.physicalId, name: d.name, teamAr: d.teamAr,
      departures: (old?.departures || 0) + (isDeparture ? 1 : 0),
      screenshots: (old?.screenshots || 0) + (d.kind === 'screenshot' ? 1 : 0),
      recordings: (old?.recordings || 0) + (d.kind === 'screen_recording' ? 1 : 0),
      lastDepartureAt: isDeparture ? at : (old?.lastDepartureAt ?? null),
      lastDepartureMs: isDeparture ? durMs : (old?.lastDepartureMs ?? null),
      totalAwayMs: (old?.totalAwayMs || 0) + (isDeparture && durMs ? durMs : 0),
      lastAt: at, maxWeight: Math.max(old?.maxWeight || 0, Number(d.weight) || 0),
      lastLabelAr: d.labelAr || old?.lastLabelAr || '',
    },
  };
}

const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
console.log(`🔌 الليدر متصل بـ${URL}`);

const signals = [];
leader.on('leader:cheat-signal', (d) => { signals.push(d); console.log(`   📡 وصلت إشارة: ${d.kind} — ${d.labelAr}`); });

let roomId = null, player = null, others = [];
try {
  console.log('\n━━━ ١) إنشاء غرفة في موقع اختباريّ ━━━');
  const created = await rpc(leader, 'room:create', {
    gameName: `فحص تنبيه المغادرة ${new Date().toISOString().slice(11, 19)}`,
    maxPlayers: 6, maxJustifications: 2, ...(ACTIVITY_ID ? { activityId: ACTIVITY_ID } : {}),
  });
  roomId = created.roomId || created.state?.roomId;
  ok('أُنشئت الغرفة', !!roomId, JSON.stringify(created).slice(0, 120));
  leader.emit('room:rejoin-leader', { roomId });

  console.log('\n━━━ ٢) لاعب حقيقيّ بسوكِت + ٥ يضيفهم الليدر (النِّصاب ٦) ━━━');
  // سوكِت حقيقيّ واحد للاعب المُراقَب (هو من سيغادر)، والبقيّة إضافةً يدويّة من
  // الليدر — النفق يخنق فتح ستّ وصلات WS متتابعة، ولا حاجة لها أصلاً.
  player = await connect({});
  const joined = await rpc(player, 'room:auto-join', {
    roomId, name: 'لاعب الفحص', gender: 'MALE', phone: '0790000001',
  });
  const pid = joined.assignedSeat ?? joined.physicalId ?? joined.player?.physicalId;
  console.log(`   👤 اللاعب المُراقَب → مقعد ${pid}`);
  ok('انضمّ اللاعب المُراقَب وأخذ مقعداً', !!pid, JSON.stringify(joined).slice(0, 120));

  const addedSeats = [];
  for (let seat = 1; seat <= 7 && addedSeats.length < 5; seat++) {
    if (seat === pid) continue;
    try {
      await rpc(leader, 'room:force-add-player', {
        roomId, physicalId: seat, name: `مساند ${seat}`,
        phone: `07900001${String(seat).padStart(2, '0')}`, dob: '1995-01-01', gender: 'MALE',
      });
      addedSeats.push(seat);
    } catch (e) { console.log(`   ⚠️ تعذّر إضافة مقعد ${seat}: ${e.message}`); }
  }
  ok('اكتمل النِّصاب (٦ لاعبين)', addedSeats.length === 5, `أُضيف ${addedSeats.length}`);

  console.log('\n━━━ ٣) توزيع الأدوار وربطها بالمقاعد (الإشارة تشترط دوراً مُسنَداً) ━━━');
  const ROLES = ['GODFATHER', 'CITIZEN', 'SHERIFF', 'DOCTOR', 'SNIPER', 'MAFIA_REGULAR'];
  await rpc(leader, 'room:start-generation', { roomId });
  await rpc(leader, 'setup:roles-confirmed', { roomId, roles: ROLES });
  // 🔗 الربط خطوةٌ مستقلّة: بدونها تبقى p.role فارغة، و recordCheatSignal يسقط عند
  //    `if (!player?.role) return;` — أي لا إشارة أصلاً (وهذا ما كشفه الفشل الأول).
  // المقاعد معروفة لنا: مقعد اللاعب المُراقَب + المقاعد التي أضافها الليدر
  const seatList = [pid, ...addedSeats].slice(0, 6);
  for (let i = 0; i < 6; i++) {
    await rpc(leader, 'setup:bind-role', { roomId, physicalId: seatList[i], role: ROLES[i] });
  }
  await rpc(leader, 'setup:confirm-roles', { roomId });
  await sleep(900);
  ok('رُبطت الأدوار واعتُمدت', true);
  console.log(`   🎭 دور اللاعب المُراقَب (مقعد ${pid}) = ${ROLES[seatList.indexOf(pid)] || '؟'}`);

  console.log('\n━━━ ٤) مغادرة اللاعب ثلاث مرّات (١٠ث / ٦ث / ٢٥ث) ━━━');
  const durations = [10000, 6000, 25000];
  for (const durationMs of durations) {
    player.emit('cheat:app-departure', { durationMs, secretOpen: false, platform: 'test' });
    // ⏱️ الخادم يكبح المغادرة بـ٣ ثوانٍ لكلّ لاعب (منعُ إغراق) — نحترمها لا نلتفّ عليها
    await sleep(3400);
  }
  await sleep(1500);

  console.log('\n━━━ ٥) التحقّق ━━━');
  const dep = signals.filter(s => s.kind === 'app_departure');
  ok(`وصلت ٣ إشارات مغادرة للّيدر`, dep.length === 3, `وصل ${dep.length}`);
  ok('كل إشارة تحمل roomId مطابقاً (حارس الواجهة يعتمده)', dep.every(s => s.roomId === roomId));
  ok('كل إشارة تحمل physicalId', dep.every(s => typeof s.physicalId === 'number'));
  ok('كل إشارة تحمل at رقميّاً', dep.every(s => typeof s.at === 'number'));
  ok('كل إشارة تحمل details.durationMs', dep.every(s => typeof s?.details?.durationMs === 'number'),
    JSON.stringify(dep.map(s => s?.details?.durationMs)));
  ok('المدد وصلت كما أُرسلت', JSON.stringify(dep.map(s => s.details.durationMs)) === JSON.stringify(durations),
    JSON.stringify(dep.map(s => s.details.durationMs)));
  ok('الاسم والفريق حاضران للعرض', dep.every(s => s.name && s.teamAr));
  ok('النصّ العربيّ يذكر المدّة', dep.some(s => /\d+ث/.test(s.labelAr || '')), dep[0]?.labelAr);

  // الثابت الجوهريّ للإصلاح: سطر واحد لا ثلاثة
  const agg = dep.reduce((acc, d) => aggregate(acc, d), {});
  const rows = Object.values(agg);
  ok('التجميع يُنتج **سطراً واحداً** للاعب نفسه', rows.length === 1, `أنتج ${rows.length}`);
  ok('العدّاد صار ×3', rows[0]?.departures === 3, `=${rows[0]?.departures}`);
  ok('مجموع الغياب = ٤١ث', rows[0]?.totalAwayMs === 41000, `=${rows[0]?.totalAwayMs}`);
  ok('آخر مغادرة = ٢٥ث (الأخيرة)', rows[0]?.lastDepartureMs === 25000, `=${rows[0]?.lastDepartureMs}`);
  ok('أعلى وزن التُقط', (rows[0]?.maxWeight || 0) >= 2, `=${rows[0]?.maxWeight}`);
} catch (e) {
  fail++; failures.push(`استثناء: ${e.message}`);
  console.error('❌ استثناء:', e.message);
} finally {
  console.log('\n━━━ ٦) تنظيف ━━━');
  try { if (roomId) { await rpc(leader, 'room:delete-room', { roomId }); console.log('  🗑️ حُذفت غرفة الفحص'); } }
  catch (e) { console.log('  ⚠️ تعذّر حذف الغرفة:', e.message); }
  try { player?.close(); } catch {}
  for (const s of others) { try { s.close(); } catch {} }
  try { leader.close(); } catch {}
}

console.log(`\n══════════════════════════════════════`);
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) { console.log('\n❌ الفشل:'); failures.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 الإشارة تصل للّيدر بحمولة صحيحة، والتجميع يُنتج سطراً واحداً متصاعداً.');
process.exit(0);
