// ══════════════════════════════════════════════════════
// 🤖 لاعبون افتراضيّون لغرفة تجربة (الخطّة الموحّدة 2026-11-20)
//
// يملأ غرفةً يفتحها الموجّه بنفسه (بلا توكن موجّه — لا تزوير): N لاعباً ضيفاً يجلسون من رمز الغرفة،
// ثمّ L متأخّرين يصلون بعد بدء اللعبة فيصيرون منتظرين (لتجربة بوّابة الدخول المتأخّر وأداة «سلّم لمنتظر»).
// كلّ هاتفٍ افتراضيّ: يبقى متّصلاً، ويلمس بطاقته بعد «راجع بطاقتك» (player:card-ack).
//
// التشغيل على الخادم (من ~/e2e-tools حيث socket.io-client):
//   node virtual-room.mjs --watch            ← ينتظر أيّ غرفة جديدة اسمها فيه «تجربة» ويملؤها
//   node virtual-room.mjs --code 123456      ← غرفةٌ برمزها
//   خيارات: --n 16 (الجالسون) · --late 4 (المتأخّرون) · --hours 4
// ══════════════════════════════════════════════════════
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const URL = process.env.MAFIA_URL || 'http://localhost:4000';
const N = Number(arg('n', 16)), LATE = Number(arg('late', 4)), HOURS = Number(arg('hours', 4));
const WATCH = process.argv.includes('--watch');
let CODE = arg('code', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = String(Date.now()).slice(-4);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const rpc = (s, ev, payload) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 20000);
  s.emit(ev, payload, (r) => { clearTimeout(t); res(r); });
});
const connect = () => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], reconnection: true, reconnectionDelay: 2000, timeout: 20000 });
  s.once('connect', () => res(s));
  s.once('connect_error', rej);
});

const NAMES = ['أحمد', 'باسل', 'يزن', 'ديما', 'عمر', 'هبة', 'فادي', 'رنا', 'خالد', 'سلمى', 'مالك', 'تالا', 'زيد', 'جود', 'ليث', 'مها', 'نور', 'سيف', 'لين', 'كرم', 'ريم', 'حمزة', 'دانة', 'قيس'];
const bots = [];
let roomId = null, lateJoined = false, closed = false;

function wire(b) {
  const s = b.s;
  s.on('player:role-assigned', async (d) => {
    b.role = d?.role; b.seat = d?.physicalId ?? b.seat;
    if (d?.reviewCard) { await sleep(800 + Math.random() * 2500); s.emit('player:card-ack', {}); b.acks++; }
  });
  s.on('spectator:promoted', (d) => { b.spectator = false; b.seat = d?.physicalId ?? b.seat; log(`🚪 ${b.name} دخل اللعبة على ${b.seat}${d?.late ? ' (متأخّر)' : ''}`); });
  s.on('player:card-handed-over', () => { b.spectator = true; log(`🤝 ${b.name} سلّم كرته — صار منتظراً`); });
  s.on('player:penalty-ejected', () => log(`⛔ ${b.name} أُخرج من اللعبة`));
  s.on('player:kicked-self', () => { log(`🚫 ${b.name} طُرد`); b.gone = true; });
  for (const ev of ['event:closed', 'game:kicked']) s.on(ev, () => { closed = true; });
  s.on('game:phase-changed', (d) => { if (b === bots[0]) onPhase(d?.phase); });
  s.on('connect', async () => {   // إعادة الاتّصال: العودة إلى المقعد
    if (b.joinedOnce && roomId && !b.gone) { try { await rpc(s, 'room:auto-join', b.body); } catch { /* */ } }
  });
}

async function join(i, late = false) {
  const name = `${NAMES[i % NAMES.length]} ${late ? 'المتأخّر' : 'الافتراضيّ'} ${i + 1}`;
  const s = await connect();
  const b = { s, name, i, acks: 0, spectator: late, body: { roomId, name, gender: i % 3 === 0 ? 'FEMALE' : 'MALE', phone: `0796${RUN}${String(i).padStart(3, '0')}`, dob: '1996-05-05' } };
  wire(b);
  const r = await rpc(s, 'room:auto-join', b.body).catch((e) => ({ success: false, error: e.message }));
  b.joinedOnce = true;
  b.seat = r?.assignedSeat ?? r?.physicalId;
  if (r?.success === false && !r?.spectator) log(`⚠️ ${name}: ${r?.error || r?.code}`);
  else log(`${late || r?.spectator ? '👁️ ينتظر' : '🪑 جلس'} ${name} ${b.seat ? `على ${b.seat}` : ''}`);
  bots.push(b);
  return b;
}

async function onPhase(phase) {
  log(`🎬 الطور: ${phase}`);
  if (phase === 'DAY_DISCUSSION' && !lateJoined && LATE > 0) {
    lateJoined = true;
    log(`🚶 يصل ${LATE} متأخّرين الآن — سيظهرون في «الوصول» وبوّابة الليل الأوّل`);
    for (let k = 0; k < LATE; k++) { await join(N + k, true); await sleep(900); }
  }
}

async function findRoom() {
  const probe = await connect();
  try {
    for (;;) {
      if (CODE) {
        const r = await rpc(probe, 'room:find-by-code', { roomCode: String(CODE) });
        if (r?.success) return r.roomId;
        log(`… لا غرفة بالرمز ${CODE} بعد`);
      } else {
        const r = await rpc(probe, 'room:list-active', {});
        const hit = (r?.rooms || []).find((x) => /تجربة|افتراضي/.test(x.gameName || '') && (x.playerCount || 0) === 0);
        if (hit) { CODE = hit.roomCode; log(`🎯 وُجدت «${hit.gameName}» (${hit.roomCode})`); return hit.roomId; }
        log('… أنتظر غرفةً اسمها فيه «تجربة» (افتحها من القمرة في موقع الاختبار)');
      }
      await sleep(5000);
    }
  } finally { probe.close(); }
}

(async () => {
  if (!WATCH && !CODE) { console.error('استعمل --watch أو --code <رمز>'); process.exit(1); }
  roomId = await findRoom();
  log(`🔌 الغرفة ${roomId} — يجلس ${N} لاعباً`);
  for (let i = 0; i < N; i++) { await join(i); await sleep(500); }
  log(`✅ جلس ${bots.filter((b) => !b.spectator).length}. ابدأ من القمرة: «اللعبة والكروت» ⟵ «التوزيع والاعتماد».`);
  const until = Date.now() + HOURS * 3600_000;
  while (!closed && Date.now() < until) {
    await sleep(60_000);
    const seated = bots.filter((b) => !b.spectator && !b.gone).length;
    log(`💓 ${seated} لاعباً · ${bots.filter((b) => b.spectator).length} ينتظر · تأكيدات «راجع بطاقتك» ${bots.reduce((s, b) => s + b.acks, 0)}`);
  }
  log(closed ? '🏁 أُغلقت الغرفة — ينصرف الافتراضيّون' : '⏰ انتهى الوقت');
  bots.forEach((b) => b.s.close());
  process.exit(0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
