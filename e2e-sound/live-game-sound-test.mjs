// ══════════════════════════════════════════════════════
// 🎮🔊 لعبةٌ حقيقيّة، لا نقلُ أطوارٍ صناعيّ
// ══════════════════════════════════════════════════════
//
// الحزمةُ الأولى (live-sound-test.mjs) تنقل الأطوار بـ`game:transition-phase` —
// وهو مسارٌ لا تسلكه اللعبة قطّ. فبقيت شكوى «موسيقى التصويت لا تتوقّف» قائمةً
// والفحصُ أخضر. هذه الحزمة تلعب بأحداث اليوم نفسِها التي تضغطها أزرارُ الموجّه:
//   day:start-voting → day:cast-vote → day:resolve → day:start-justification-timer
// وتقرأ ما يُعزف فعلاً على شاشة العرض بين كلّ خطوتين.
//
//   MAFIA_STAFF_TOKEN=<jwt> MAFIA_ACTIVITY_ID=<نشاطُ موقعٍ اختباريّ> node live-game-sound-test.mjs
//
// ⚠️ يمرّ بـ`setup:binding-complete` — أي يُنشئ صفَّ مباراةٍ حقيقيّاً. لذلك
//    **نشاطُ موقعٍ اختباريّ إلزاماً** (التقاريرُ تستثنيه)، والغرفةُ تُحذف بعده.
// ══════════════════════════════════════════════════════

import { chromium } from 'playwright';
import { io } from 'socket.io-client';

const URL = process.env.MAFIA_URL || 'https://club-mafia.grade.sbs';
const TOKEN = process.env.MAFIA_STAFF_TOKEN;
const ACTIVITY_ID = Number(process.env.MAFIA_ACTIVITY_ID || 0) || undefined;
const HEADED = process.env.HEADED === '1';
if (!TOKEN) { console.error('❌ MAFIA_STAFF_TOKEN مطلوب'); process.exit(1); }
if (!ACTIVITY_ID) { console.error('❌ MAFIA_ACTIVITY_ID مطلوب (نشاطُ موقعٍ اختباريّ)'); process.exit(1); }

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`    ✅ ${n}`); }
  else { fail++; failures.push(`${n}${d ? ` — ${d}` : ''}`); console.log(`    ❌ ${n}${d ? ` — ${d}` : ''}`); }
  return !!c;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rpcOnce = (s, ev, p, ms = 20000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms);
  s.emit(ev, p, (r) => { clearTimeout(t); (r && r.success === false) ? rej(new Error(r.error || ev)) : res(r); });
});
const rpc = async (s, ev, p) => {
  try { return await rpcOnce(s, ev, p); }
  catch { if (!s.connected) for (let i = 0; i < 30 && !s.connected; i++) await sleep(500); await sleep(400); return rpcOnce(s, ev, p, 25000); }
};
const connect = (auth) => new Promise((res, rej) => {
  const s = io(URL, { transports: ['polling', 'websocket'], auth, timeout: 20000, reconnection: true, reconnectionDelay: 700 });
  s.on('connect', () => res(s));
  s.on('connect_error', (e) => { if (!s.__up) rej(e); });
  s.once('connect', () => { s.__up = true; });
});

const RECORDER = () => {
  const W = window; W.__snd = { ev: [], ws: [] };
  const at = () => Math.round(performance.now());
  const nameOf = (s) => { try { return decodeURIComponent(String(s)).split('/').pop().slice(-46); } catch { return String(s); } };
  try {
    const MP = HTMLMediaElement.prototype, rp = MP.play, rq = MP.pause;
    MP.play = function (...a) { W.__snd.ev.push({ k: 'play', t: at(), src: nameOf(this.currentSrc || this.src), vol: this.volume, loop: !!this.loop }); return rp.apply(this, a); };
    MP.pause = function (...a) { if (!this.paused) W.__snd.ev.push({ k: 'pause', t: at(), src: nameOf(this.currentSrc || this.src) }); return rq.apply(this, a); };
  } catch {}
  const scan = (txt) => {
    try {
      for (const part of String(txt).split('')) {
        if (!part.startsWith('42')) continue;
        const arr = JSON.parse(part.slice(2));
        if (Array.isArray(arr) && typeof arr[0] === 'string' && /sound|phase-changed|justification|elimination|voting/.test(arr[0])) {
          W.__snd.ws.push({ t: at(), ev: arr[0], data: arr[1] });
        }
      }
    } catch {}
  };
  try {
    const d = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    if (d && d.set) Object.defineProperty(WebSocket.prototype, 'onmessage', {
      configurable: true, get() { return d.get.call(this); },
      set(fn) { return d.set.call(this, function (ev) { try { scan(typeof ev.data === 'string' ? ev.data : ''); } catch {} return fn.apply(this, arguments); }); },
    });
    const ro = XMLHttpRequest.prototype.open, rs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__u = String(u || ''); return ro.call(this, m, u, ...r); };
    XMLHttpRequest.prototype.send = function (...a) {
      if (this.__u && this.__u.includes('socket.io')) this.addEventListener('load', () => { try { scan(this.responseText); } catch {} });
      return rs.apply(this, a);
    };
  } catch {}
};

const snap = (p) => p.evaluate(() => ({
  ev: window.__snd ? window.__snd.ev.slice() : [],
  ws: window.__snd ? window.__snd.ws.slice() : [],
  dbg: window.__mafiaSoundDebug ? window.__mafiaSoundDebug() : null,
}));
const clear = (p) => p.evaluate(() => { if (window.__snd) { window.__snd.ev.length = 0; window.__snd.ws.length = 0; } });
const dbg = async (p) => (await snap(p)).dbg;
async function until(p, pred, ms = 8000) {
  const t0 = Date.now(); let last = null;
  while (Date.now() - t0 < ms) { last = await snap(p); try { if (pred(last)) return last; } catch {} await sleep(250); }
  return last;
}

async function main() {
  console.log(`\n🎮 لعبةٌ حقيقيّة — فحصُ الصوت عبر أحداث اليوم\n${'═'.repeat(58)}`);
  const driver = await connect({ token: TOKEN, leaderToken: TOKEN });
  let joined = null;
  driver.on('connect', () => { if (joined) driver.emit('room:rejoin-leader', { roomId: joined }); });

  const room = await rpc(driver, 'room:create', {
    gameName: '🎮 فحصُ صوتِ اللعبة', maxPlayers: 12, maxJustifications: 2,
    maxPenalties: 3, penaltyScope: 'game', activityId: ACTIVITY_ID,
  });
  const roomId = room.roomId; joined = roomId;
  console.log(`🏠 غرفة ${room.roomCode} · ${roomId} · رمز الشاشة ${room.displayPin}\n`);

  const browser = await chromium.launch({ headless: !HEADED, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-dev-shm-usage'] });

  // ── الموجّه ──
  const lctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await lctx.addInitScript(RECORDER);
  await lctx.addInitScript(([t, r]) => {
    try { localStorage.setItem('leader_token', t); localStorage.setItem('leader_name', 'اختبار'); } catch {}
    try { sessionStorage.setItem('leader_active_room', r); } catch {}
  }, [TOKEN, roomId]);
  const leader = await lctx.newPage();
  await leader.goto(`${URL}/leader`, { waitUntil: 'domcontentloaded' });
  await leader.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
  await leader.mouse.click(700, 500).catch(() => {});

  // ── شاشة العرض ──
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await dctx.addInitScript(RECORDER);
  const display = await dctx.newPage();
  await display.goto(`${URL}/display?roomId=${encodeURIComponent(roomId)}&pin=${room.displayPin}`, { waitUntil: 'domcontentloaded' });
  await display.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
  await display.mouse.click(640, 400).catch(() => {});
  await sleep(2500);

  try {
    // ══ إعداد لعبةٍ حقيقيّة ══
    console.log('🎬 إعدادُ اللعبة (٨ لاعبين، أدوارٌ عشوائيّة، ربطٌ كامل)…');
    for (let i = 1; i <= 8; i++) {
      await rpc(driver, 'room:force-add-player', {
        roomId, physicalId: i, name: `فاحص ${i}`, phone: '0700000000', dob: '1995-01-01', gender: 'male',
      });
    }
    // ROLE_GENERATION يبثّ التشكيلة، ثمّ setup:roles-confirmed ينقل إلى ROLE_BINDING
    const rolesReady = new Promise((res) => driver.once('setup:roles-generated', res));
    await rpc(driver, 'room:start-generation', { roomId });
    const gen = await Promise.race([rolesReady, sleep(8000).then(() => null)]);
    if (!gen) throw new Error('لم تصل تشكيلةُ الأدوار');
    const roles = [...(gen.mafiaRoles || []), ...(gen.citizenRoles || []), ...(gen.neutralRoles || [])];
    console.log(`   🃏 تشكيلة: ${roles.length} دوراً`);
    await rpc(driver, 'setup:roles-confirmed', { roomId, roles });
    await rpc(driver, 'setup:random-assign', { roomId });
    await rpc(driver, 'setup:confirm-roles', { roomId });
    await rpc(driver, 'setup:binding-complete', { roomId });
    await sleep(1500);
    console.log('   ✅ اللعبة بدأت\n');

    // ══ إلى النهار (فعلُ موجِّهٍ مشروع) ثمّ التصويت بالأحداث الحقيقيّة ══
    console.log('G1 · موسيقى التصويت تصمت عند التبرير — بأحداث اللعبة الحقيقيّة');
    console.log('─'.repeat(52));
    await rpc(driver, 'game:transition-phase', { roomId, targetPhase: 'DAY_DISCUSSION' });
    await sleep(1200);
    await rpc(driver, 'day:start-voting', { roomId, durationSeconds: 300 });
    await sleep(2500);

    const voting = await dbg(display);
    ok('فراشُ التصويت يعمل على الشاشة', voting && voting.ambientPlaying && voting.ambientKey === 'ambient_voting',
      `key=${voting && voting.ambientKey} playing=${voting && voting.ambientPlaying}`);

    // أصواتٌ حقيقيّة بالوكالة حتى تتضح أغلبيّة
    for (const voter of [1, 2, 3, 4, 5]) {
      await rpc(driver, 'day:cast-vote', { roomId, candidateIndex: 0, delta: 1, voterPhysicalId: voter });
      await sleep(120);
    }
    await clear(display);
    await rpc(driver, 'day:resolve', { roomId });       // ← الزرُّ الحقيقيّ: «فرز الأصوات»

    const D = await until(display, s => s.dbg && s.dbg.ambientPlaying === false, 8000);
    const phases = D.ws.filter(w => w.ev === 'game:phase-changed').map(w => w.data && w.data.phase);
    console.log(`    ℹ️ أطوارٌ وصلت الشاشة: ${JSON.stringify(phases)}`);
    const stopped = D.dbg && D.dbg.ambientPlaying === false;
    ok('صمتت موسيقى التصويت بعد الفرز', stopped,
      `ما زالت تعمل: ${D.dbg && D.dbg.ambientKey}`);
    const fns = D.ws.filter(w => w.ev === 'display:sound-play').map(w => w.data && w.data.fn);
    ok('وبُثَّ أمرُ الإيقاف للقاعة', fns.includes('stopAmbientSound'), JSON.stringify(fns));

    const L = await dbg(leader);
    ok('وجهازُ الموجّه صامتٌ كذلك', L && L.ambientPlaying === false, `leader ambient=${L && L.ambientKey}`);

    // ══ الإقصاء ══
    console.log('\nG2 · طورُ الإقصاء لا يُعيد موسيقى التصويت');
    console.log('─'.repeat(52));
    await sleep(1500);
    const st = await snap(display);
    const seen = st.ws.filter(w => w.ev === 'game:phase-changed').map(w => w.data && w.data.phase);
    console.log(`    ℹ️ الأطوارُ حتى الآن: ${JSON.stringify(seen)}`);
    const dd = await dbg(display);
    ok('لا فراشَ تصويتٍ يعمل', !(dd && dd.ambientPlaying && dd.ambientKey === 'ambient_voting'),
      `key=${dd && dd.ambientKey} playing=${dd && dd.ambientPlaying}`);

  } catch (e) {
    fail++; failures.push(`انهيار: ${e && e.message}`);
    console.error(`\n💥 ${e && e.message}`);
  } finally {
    console.log(`\n${'─'.repeat(52)}\n🧹 التنظيف…`);
    try { await rpc(driver, 'room:delete-room', { roomId }); console.log('   حُذفت غرفةُ الفحص'); } catch {}
    try { driver.close(); } catch {}
    try { await browser.close(); } catch {}
  }

  console.log(`\n${'═'.repeat(58)}\n📊 ${pass} ✅   ${fail} ❌`);
  if (failures.length) { console.log('\n❌ الإخفاقات:'); failures.forEach(f => console.log(`   • ${f}`)); }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('\n💥', e); process.exit(1); });
