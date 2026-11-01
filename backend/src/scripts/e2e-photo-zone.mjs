// ══════════════════════════════════════════════════════
// 🧪 اختبار حيّ: «زاوية بلا تصوير» (2026-11-01)
// ══════════════════════════════════════════════════════
// سوكِتات ليدر ولاعبين فعليّة ضدّ الخادم الحيّ، في نشاطٍ بموقع اختبار
// (الزاوية تعمل هناك دائماً ولو كان المفتاح مطفأً — لا يُسأل لاعبٌ حقيقيّ):
//   ١. المرساة من الليدر، والرافضون يلتصقون بها، والقابل خارجها
//   ٢. العميل القديم (بلا photoConsent) = بلا تصوير
//   ٣. رافضان متزامنان يبقيان كتلة واحدة
//   ٤. الهاتف يرى علمه وحده — لا علم غيره ولا المرساة
//   ٥. «غيّرت رأيي» من الغرفة: علمٌ + تنبيه للّيدر بلا نقل
//   ٦. «🧩 أصلح»: الخادم يحسب الاقتراح ويطبّقه، فتعود الكتلة متّصلة
//   ٧. إضافة الليدر اليدويّة بـnoPhoto، وتبديل العلم من الليدر
//   ٨. «رتّب» يعرض حالة الكتلة قبل/بعد
//
// التشغيل على الخادم (socket.io-client في /tmp/e2e):
//   TOKEN=$(docker exec mafia-prod-backend-1 node -e "const j=require('jsonwebtoken');\
//     console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'30m'}))")
//   MAFIA_STAFF_TOKEN=$TOKEN MAFIA_ACTIVITY_ID=<نشاط في موقع اختبار> node e2e-photo-zone.mjs
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
const ACTIVITY_ID = Number(process.env.MAFIA_ACTIVITY_ID || 0);
if (!TOKEN || !ACTIVITY_ID) { console.error('❌ MAFIA_STAFF_TOKEN و MAFIA_ACTIVITY_ID (موقع اختبار) مطلوبان'); process.exit(1); }

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; failures.push(n + (d ? ` — ${d}` : '')); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rpc = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 20000);
  s.emit(ev, payload, (r) => { clearTimeout(t); res(r); });
});
const connect = (auth) => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], auth, reconnection: false, timeout: 20000 });
  s.on('connect', () => res(s));
  s.on('connect_error', rej);
});
const N = 12;
const norm = (s) => ((((s - 1) % N) + N) % N) + 1;
/** عدد قطع الرافضين دائريّاً */
const segments = (seats) => {
  const set = new Set(seats);
  if (!set.size) return 0;
  if (set.size === N) return 1;
  let c = 0; for (const s of set) if (!set.has(norm(s - 1))) c++;
  return c;
};
const zoneSeats = (st) => [
  ...(st.players || []).filter(p => p.noPhoto === true).map(p => p.physicalId),
  ...(st.spectators || []).filter(p => p.noPhoto === true).map(p => p.physicalId),
];

const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
const alerts = [];
leader.on('leader:photo-zone-alert', d => alerts.push(d));
const players = [];
let roomId = null;
const state = async () => (await rpc(leader, 'game:get-state', { roomId })).state;
const join = async (name, phone, photoConsent) => {
  const s = await connect({}); players.push(s);
  const last = { st: null };
  s.on('game:state-sync', st => { last.st = st; });
  const r = await rpc(s, 'room:auto-join', { roomId, name, gender: 'MALE', phone, ...(photoConsent === undefined ? {} : { photoConsent }) });
  return { s, r, last };
};

try {
  console.log('\n━━━ ١) غرفة في موقع اختبار + مرساة ٤ ━━━');
  const created = await rpc(leader, 'room:create', {
    gameName: `فحص الزاوية ${new Date().toISOString().slice(11, 19)}`, maxPlayers: N, maxJustifications: 2, activityId: ACTIVITY_ID,
  });
  roomId = created.roomId || created.state?.roomId;
  ok('أُنشئت الغرفة', !!roomId, JSON.stringify(created).slice(0, 120));
  leader.emit('room:rejoin-leader', { roomId });
  await sleep(300);
  // سعةٌ ثابتة للفحص (القالب قد يفرض غيرها)
  await rpc(leader, 'room:update-max-players', { roomId, maxPlayers: N });
  const an = await rpc(leader, 'room:set-photo-anchor', { roomId, anchor: 4 });
  ok('ضُبطت المرساة ٤ (الزاوية تعمل في موقع الاختبار)', an?.success === true && an.anchor === 4, JSON.stringify(an));
  let st = await state();
  ok('الحالة تحمل photoZone (on · ⚓4 · leader)', st.photoZone?.on === true && st.photoZone.anchor === 4 && st.photoZone.anchorSource === 'leader', JSON.stringify(st.photoZone));

  console.log('\n━━━ ٢) الواصلون ━━━');
  const A = await join('رافض-أ', '0795550001', false);
  ok('الرافض الأوّل في المرساة (٤)', A.r?.assignedSeat === 4 && A.r?.noPhoto === true, JSON.stringify(A.r));
  const B = await join('قابل-ب', '0795550002', true);
  st = await state();
  ok('القابل خارج الزاوية المتوقَّعة', B.r?.success && B.r.noPhoto === false && ![4, 5, 3].includes(B.r.assignedSeat), `${B.r?.assignedSeat}`);
  const C = await join('رافض-ج', '0795550003', false);
  ok('الرافض الثاني ملاصق (٥ للأمام)', C.r?.assignedSeat === 5, `${C.r?.assignedSeat}`);
  const D = await join('قديم-د', '0795550004', undefined);
  ok('العميل القديم بلا جواب = بلا تصوير، ملاصق', D.r?.noPhoto === true && [6, 3].includes(D.r.assignedSeat), JSON.stringify(D.r));
  const [E, F] = await Promise.all([join('رافض-هـ', '0795550005', false), join('رافض-و', '0795550006', false)]);
  st = await state();
  ok('رافضان متزامنان انضمّا', E.r?.success && F.r?.success, `${E.r?.error || ''} ${F.r?.error || ''}`);
  ok(`الرافضون كتلة واحدة (${zoneSeats(st).sort((a, b) => a - b).join(',')})`, segments(zoneSeats(st)) === 1);
  ok('لا تنبيه «خارج الزاوية» لمن جلسوا ملاصقين', !alerts.some(a => a.kind === 'outside'), JSON.stringify(alerts));

  console.log('\n━━━ ٣) ما يراه الهاتف ━━━');
  await sleep(500);
  A.s.emit('game:get-state', { roomId });
  await sleep(600);
  const seen = A.last.st || {};
  const meA = (seen.players || []).find(p => p.physicalId === 4);
  const other = (seen.players || []).find(p => p.physicalId === 5);
  ok('الهاتف يرى علمه هو', meA?.noPhoto === true, JSON.stringify(meA || {}).slice(0, 120));
  ok('ولا يرى علم غيره', other && other.noPhoto === undefined, JSON.stringify(other || {}).slice(0, 120));
  ok('ولا المرساة — فقط photoZoneOn', seen.photoZone === undefined && seen.photoZoneOn === true, `${JSON.stringify(seen.photoZone)} ${seen.photoZoneOn}`);

  console.log('\n━━━ ٤) «غيّرت رأيي» من الغرفة ━━━');
  const bSeat = B.r.assignedSeat;
  alerts.length = 0;
  const ch = await rpc(B.s, 'room:set-photo-consent', { roomId, photoConsent: false });
  await sleep(500);
  st = await state();
  const bNow = st.players.find(p => p.name === 'قابل-ب');
  ok('صار بلا تصوير في الغرفة', ch?.success === true && ch.noPhoto === true && bNow?.noPhoto === true, JSON.stringify(ch));
  ok('لم يُنقل تلقائيّاً', bNow?.physicalId === bSeat, `${bNow?.physicalId}`);
  ok('وصل الليدرَ تنبيه «changed» خارج الزاوية', alerts.some(a => a.kind === 'changed' && a.physicalId === bSeat && a.outside === true), JSON.stringify(alerts));
  ok('التقرير يقترح إصلاحاً', !!alerts[0]?.report?.fix, JSON.stringify(alerts[0]?.report || {}).slice(0, 160));

  console.log('\n━━━ ٥) «🧩 أصلح» ━━━');
  const fx = await rpc(leader, 'room:photo-zone-fix', { roomId, physicalId: bSeat });
  await sleep(500);
  st = await state();
  ok('الإصلاح طُبّق', fx?.success === true && fx.applied >= 1, JSON.stringify(fx).slice(0, 200));
  ok(`الكتلة متّصلة بعد الإصلاح (${zoneSeats(st).sort((a, b) => a - b).join(',')})`, segments(zoneSeats(st)) === 1);
  const fx2 = await rpc(leader, 'room:photo-zone-fix', { roomId });
  ok('إصلاحٌ ثانٍ لا يفعل شيئاً', fx2?.success === true && (fx2.applied || 0) === 0, JSON.stringify(fx2).slice(0, 120));

  console.log('\n━━━ ٦) أدوات الليدر ━━━');
  const free = Array.from({ length: N }, (_, i) => i + 1).filter(s => !st.players.some(p => p.physicalId === s));
  const far = free.sort((a, b) => Math.min(Math.abs(b - 6), N - Math.abs(b - 6)) - Math.min(Math.abs(a - 6), N - Math.abs(a - 6)))[0];
  alerts.length = 0;
  const fa = await rpc(leader, 'room:force-add-player', { roomId, physicalId: far, name: 'يدويّ-ز', phone: '0795550007', dob: '1995-01-01', gender: 'MALE', noPhoto: true });
  await sleep(500);
  st = await state();
  ok('الإضافة اليدويّة حملت العلم', fa?.success === true && st.players.find(p => p.physicalId === far)?.noPhoto === true, JSON.stringify(fa));
  ok('وتنبيه «خارج الزاوية» للمقعد البعيد', alerts.some(a => a.kind === 'outside' && a.physicalId === far), JSON.stringify(alerts).slice(0, 200));
  const off = await rpc(leader, 'room:set-no-photo', { roomId, physicalId: far, noPhoto: false });
  st = await state();
  ok('الليدر بدّل العلم', off?.success === true && st.players.find(p => p.physicalId === far)?.noPhoto === false);
  ok('فعادت الكتلة متّصلة', segments(zoneSeats(st)) === 1);

  console.log('\n━━━ ٧) «رتّب تلقائيّاً» ━━━');
  await rpc(leader, 'room:set-no-photo', { roomId, physicalId: far, noPhoto: true });
  const dry = await rpc(leader, 'room:reshuffle-seats', { roomId, dryRun: true });
  ok('المعاينة تحمل حالة الكتلة', !!dry?.zone, JSON.stringify(dry).slice(0, 200));
  ok('قبل: مقطّعة · بعد: متّصلة', dry?.zone?.segmentsBefore >= 2 && dry?.zone?.segmentsAfter === 1, JSON.stringify(dry?.zone));

  console.log('\n━━━ ٨) المرساة تعود للقالب/الافتراضيّ ━━━');
  const back = await rpc(leader, 'room:set-photo-anchor', { roomId, anchor: null });
  st = await state();
  ok('أُزيلت مرساة الليلة', back?.success === true && st.photoZone?.anchorSource !== 'leader', JSON.stringify(st.photoZone));
} catch (e) {
  fail++; failures.push(`استثناء: ${e.message}`); console.log(`  ❌ استثناء: ${e.message}`);
} finally {
  for (const s of players) try { s.disconnect(); } catch { /* */ }
  if (roomId) {
    try { const d = await rpc(leader, 'room:delete-room', { roomId }); console.log(`\n🧹 حُذفت الغرفة: ${d?.success !== false}`); } catch (e) { console.log('⚠️ حذف الغرفة:', e.message); }
  }
  leader.disconnect();
}

console.log(`\n══ ${pass} ✅ · ${fail} ❌ ══`);
if (fail) { for (const f of failures) console.log('  ❌ ' + f); process.exit(1); }
process.exit(0);
