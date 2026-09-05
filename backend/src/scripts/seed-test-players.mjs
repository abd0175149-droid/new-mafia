// ══════════════════════════════════════════════════════
// 🌱 إجلاسُ لاعبين تجريبيّين في غرفةٍ قائمة
// ══════════════════════════════════════════════════════
// أداةُ تحضيرٍ لاختبار واجهة الليدر: تملأ غرفةً حيّة بلاعبين وهميّين عبر
// المسار الحقيقيّ نفسه (`room:auto-join`)، فيمرّ كلٌّ منهم بمحرّك الإجلاس
// ويأخذ مقعده كما يأخذه لاعبٌ حقيقيّ — لا حقنَ حالةٍ من تحت الطاولة.
//
// 🔴 بعضُهم يدخل **في اللحظة نفسها** (أزواج) عمداً: هذا هو المدخل الذي
//    يُفعّل تقاربَ «الوصول المتزامن»، وهو ما نريد رؤيته في لوحة التعارضات.
//
// ⚠️ الهواتف من نطاقٍ وهميّ محجوز (0770000xxx) كي تُميَّز وتُنظَّف بسهولة.
//    لا تُشغّلها على غرفةِ فعاليّةٍ حقيقيّة.
//
// التشغيل على الخادم:
//   TOKEN=$(docker exec mafia-prod-backend-1 node -e "const j=require('jsonwebtoken');\
//     console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'30m'}))")
//   MAFIA_STAFF_TOKEN=$TOKEN MAFIA_URL=http://localhost:4000 MAFIA_ROOM=<roomId> \
//     node backend/src/scripts/seed-test-players.mjs [عدد]
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
const ROOM = process.env.MAFIA_ROOM;
const COUNT = Number(process.argv[2] || process.env.MAFIA_COUNT || 16);
if (!TOKEN) { console.error('❌ MAFIA_STAFF_TOKEN مطلوب'); process.exit(1); }
if (!ROOM) { console.error('❌ MAFIA_ROOM مطلوب (معرّف الغرفة)'); process.exit(1); }

const NAMES = [
  'سامي', 'ليث', 'رامي', 'حازم', 'مجد', 'تيم', 'زيد', 'عُدي',
  'نور', 'لينا', 'ريم', 'سلمى', 'دانا', 'هبة', 'جُمان', 'روان',
  'عامر', 'باسل', 'وسيم', 'كرم', 'شادي', 'أنس', 'خالد', 'فادي',
  'يارا', 'ملك', 'رهف', 'تالا', 'جنى', 'لُجين',
];
const FEMALE = new Set(['نور','لينا','ريم','سلمى','دانا','هبة','جُمان','روان','يارا','ملك','رهف','تالا','جنى','لُجين']);

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

const sockets = [];
const leader = await connect({ token: TOKEN, leaderToken: TOKEN });
sockets.push(leader);
leader.emit('room:rejoin-leader', { roomId: ROOM });

const before = await rpc(leader, 'game:get-state', { roomId: ROOM });
if (!before?.state) { console.error('❌ لا حالةَ لهذه الغرفة'); process.exit(1); }
console.log(`🎯 «${before.state.config?.gameName}» — ${before.state.phase} — ${before.state.players.length} جالساً الآن`);

// ── نُدخلهم أزواجاً متزامنة: كلُّ زوجٍ «وصل معاً» فيجب أن يفترقا ──
const results = [];
for (let i = 0; i < COUNT; i += 2) {
  const batch = [];
  for (let k = 0; k < 2 && i + k < COUNT; k++) {
    const n = i + k;
    const name = NAMES[n % NAMES.length];
    const phone = `07700${String(10000 + n).slice(1)}`;   // 0770000000+
    batch.push((async () => {
      const s = await connect({});
      sockets.push(s);
      const r = await rpc(s, 'room:auto-join', {
        roomId: ROOM, name, phone,
        gender: FEMALE.has(name) ? 'FEMALE' : 'MALE',
      });
      return { name, phone, r };
    })());
  }
  const done = await Promise.all(batch);
  for (const d of done) {
    if (d.r?.success) {
      results.push({ ...d, seat: d.r.assignedSeat ?? d.r.state?.players?.find(p => p.phone === d.phone)?.physicalId });
      console.log(`  ✅ ${d.name} → مقعد ${d.r.assignedSeat ?? '?'}${d.r.isSpectator ? ' (متفرّج)' : ''}`);
    } else {
      console.log(`  ❌ ${d.name} — ${d.r?.error || 'بلا ردّ'}`);
    }
  }
  await sleep(250);   // فاصلٌ بين الأزواج كي لا يُحسب الجميع «وصلوا معاً»
}

const after = await rpc(leader, 'game:get-state', { roomId: ROOM });
const seated = (after.state?.players || []).slice().sort((a, b) => a.physicalId - b.physicalId);
console.log(`\n🪑 المقاعد الآن (${seated.length}):`);
console.log(seated.map(p => `${p.physicalId}:${p.name}`).join('  '));

for (const s of sockets) { try { s.close(); } catch {} }
await sleep(300);
process.exit(0);
