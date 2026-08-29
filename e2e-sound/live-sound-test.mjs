// ══════════════════════════════════════════════════════
// 🔊🧪 اختبارٌ حيٌّ لنظام الصوت: الموجّه → القاعة (شاشة العرض)
// ══════════════════════════════════════════════════════
//
// يقود **متصفّحين حقيقيَّين** (Playwright) ضدّ خادمٍ حيّ:
//   • صفحةُ الموجّه /leader  — المصدرُ الحصريّ للصوت
//   • صفحةُ العرض  /display  — التابعُ الذي يعزف ما يصله
// وسوكِتَ قيادةٍ بصلاحيّة موظّف ينقل الأطوار كما يفعل زرٌّ حقيقيّ.
//
// ولا يفترض شيئاً عن «هل عُزف»: يعترض `HTMLMediaElement.play/pause/volume`
// و`AudioContext.createOscillator` وإطاراتِ WebSocket الواردة — فيرى الصوتَ
// الفعليَّ على الشاشة، لا نيّةَ الشيفرة.
//
// التشغيل:
//   cd e2e-sound && npm i
//   MAFIA_URL=https://club-mafia.grade.sbs \
//   MAFIA_STAFF_TOKEN=<توكن موظّف> MAFIA_ACTIVITY_ID=<نشاطُ موقعٍ اختباريّ> \
//   node live-sound-test.mjs
//
//   HEADED=1        يفتح المتصفّحات مرئيّةً
//   ONLY=S06,S07    يشغّل سيناريوهاتٍ بعينها
//
// إصدارُ توكنٍ مؤقّت على الخادم:
//   docker compose exec -T backend node -e "const j=require('jsonwebtoken');\
//     console.log(j.sign({id:1,role:'admin',username:'admin'},process.env.JWT_SECRET,{expiresIn:'3h'}))"
//
// 🧹 ينظّف بعده: يحذف الغرفةَ التي أنشأها، ويُعيد كلَّ مدّةٍ عدّلها إلى ما كانت.
// ══════════════════════════════════════════════════════

import { chromium } from 'playwright';
import { io } from 'socket.io-client';

const URL = process.env.MAFIA_URL || 'https://club-mafia.grade.sbs';
const TOKEN = process.env.MAFIA_STAFF_TOKEN;
const ACTIVITY_ID = Number(process.env.MAFIA_ACTIVITY_ID || 0) || undefined;
const HEADED = process.env.HEADED === '1';
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

if (!TOKEN) { console.error('❌ MAFIA_STAFF_TOKEN مطلوب'); process.exit(1); }

// ── عدّادات ─────────────────────────────────────────────
let pass = 0, fail = 0, crashed = false;
const failures = [];
const notes = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`    ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`    ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
  return !!cond;
};
const note = (t) => { notes.push(t); console.log(`    📝 ${t}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── سوكِتُ القيادة ───────────────────────────────────────
const rpcOnce = (s, ev, payload, ms = 20000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms);
  s.emit(ev, payload, (r) => { clearTimeout(t); (r && r.success === false) ? rej(new Error(r.error || ev)) : res(r); });
});
/**
 * 🔁 محاولةٌ ثانية بعد انتظار الاتصال: الجولةُ تدوم دقائق، وأيُّ انقطاعٍ عابر
 *    (وسيطٌ يُغلق اتّصالَ polling خاملاً) كان يُسقط الفحصَ كلَّه بـ«timeout».
 */
const rpc = async (s, ev, payload) => {
  try { return await rpcOnce(s, ev, payload); }
  catch (e) {
    if (!s.connected) { for (let i = 0; i < 30 && !s.connected; i++) await sleep(500); }
    await sleep(400);
    return rpcOnce(s, ev, payload, 25000);
  }
};
const connect = (auth, opts = {}) => new Promise((res, rej) => {
  // polling أوّلاً ثمّ الترقية: websocket وحدَه لا يعبر من كلّ شبكة
  const s = io(URL, {
    transports: ['polling', 'websocket'], auth, timeout: 20000,
    reconnection: opts.reconnect !== false, reconnectionAttempts: Infinity, reconnectionDelay: 700,
  });
  s.on('connect', () => res(s));
  s.on('connect_error', (e) => { if (!s.__up) rej(e); });
  s.once('connect', () => { s.__up = true; });
});

// ══════════════════════════════════════════════════════
// 🎧 حاقنُ المراقبة — يُثبَّت قبل أيّ شيفرةِ صفحة
// ══════════════════════════════════════════════════════
const RECORDER = () => {
  const W = window;
  W.__snd = { ev: [], ws: [] };
  const at = () => Math.round(performance.now());
  const nameOf = (src) => { try { return decodeURIComponent(String(src)).split('/').pop().slice(-46); } catch { return String(src); } };

  // ① عناصرُ الصوت: تشغيل/إيقاف/مستوى
  try {
    const MP = HTMLMediaElement.prototype;
    const rawPlay = MP.play, rawPause = MP.pause;
    MP.play = function (...a) {
      W.__snd.ev.push({ k: 'play', t: at(), src: nameOf(this.currentSrc || this.src), vol: this.volume, loop: !!this.loop });
      const p = rawPlay.apply(this, a);
      if (p && p.catch) p.catch(e => W.__snd.ev.push({ k: 'play-rejected', t: at(), src: nameOf(this.src), err: String(e && e.name) }));
      return p;
    };
    MP.pause = function (...a) {
      if (!this.paused) W.__snd.ev.push({ k: 'pause', t: at(), src: nameOf(this.currentSrc || this.src), vol: this.volume });
      return rawPause.apply(this, a);
    };
    const vd = Object.getOwnPropertyDescriptor(MP, 'volume');
    if (vd && vd.set) {
      Object.defineProperty(MP, 'volume', {
        configurable: true, enumerable: vd.enumerable,
        get() { return vd.get.call(this); },
        set(v) { W.__snd.ev.push({ k: 'vol', t: at(), src: nameOf(this.currentSrc || this.src), vol: v }); return vd.set.call(this, v); },
      });
    }
  } catch (e) { W.__snd.ev.push({ k: 'hook-error', where: 'media', err: String(e) }); }

  // ② النغماتُ المركّبة (Web Audio)
  try {
    const AC = W.AudioContext || W.webkitAudioContext;
    if (AC) {
      const rawOsc = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function (...a) {
        const o = rawOsc.apply(this, a);
        const rawStart = o.start;
        o.start = function (...b) { W.__snd.ev.push({ k: 'synth', t: at(), freq: (o.frequency && o.frequency.value) || null }); return rawStart.apply(this, b); };
        return o;
      };
      const rawGain = AC.prototype.createGain;
      AC.prototype.createGain = function (...a) {
        const g = rawGain.apply(this, a);
        try { W.__snd.ev.push({ k: 'gain', t: at(), v: g.gain.value }); } catch {}
        return g;
      };
    }
  } catch (e) { W.__snd.ev.push({ k: 'hook-error', where: 'webaudio', err: String(e) }); }

  // ③ إطاراتُ socket.io الواردة — نميّز «لم يصل» عن «وصل ولم يُعزف»
  try {
    const d = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    if (d && d.set) {
      Object.defineProperty(WebSocket.prototype, 'onmessage', {
        configurable: true,
        get() { return d.get.call(this); },
        set(fn) {
          return d.set.call(this, function (ev) {
            try {
              const s = typeof ev.data === 'string' ? ev.data : '';
              if (s.startsWith('42')) {
                const arr = JSON.parse(s.slice(2));
                if (Array.isArray(arr) && typeof arr[0] === 'string') {
                  if (/sound|phase-changed|state-sync/.test(arr[0])) W.__snd.ws.push({ t: at(), ev: arr[0], data: arr[1] });
                }
              }
            } catch {}
            return fn.apply(this, arguments);
          });
        },
      });
    }
  } catch (e) { W.__snd.ev.push({ k: 'hook-error', where: 'ws', err: String(e) }); }

  // ④ نقلُ polling — socket.io يبدأ به ويترقّى، وقد يبقى عليه خلف وسيطٍ.
  //    بلا هذا يبدو أنّ «لا شيء وصل» بينما الرسائل تمرّ عبر XHR.
  const scan = (txt) => {
    try {
      for (const part of String(txt).split('')) {
        if (!part.startsWith('42')) continue;
        const arr = JSON.parse(part.slice(2));
        if (Array.isArray(arr) && typeof arr[0] === 'string' && /sound|phase-changed|state-sync/.test(arr[0])) {
          W.__snd.ws.push({ t: at(), ev: arr[0], data: arr[1], via: 'poll' });
        }
      }
    } catch {}
  };
  try {
    const rawOpen = XMLHttpRequest.prototype.open, rawSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__u = String(u || ''); return rawOpen.call(this, m, u, ...r); };
    XMLHttpRequest.prototype.send = function (...a) {
      if (this.__u && this.__u.includes('socket.io')) {
        this.addEventListener('load', () => { try { scan(this.responseText); } catch {} });
      }
      return rawSend.apply(this, a);
    };
  } catch (e) { W.__snd.ev.push({ k: 'hook-error', where: 'xhr', err: String(e) }); }
};

// ══════════════════════════════════════════════════════
const snap = (page) => page.evaluate(() => ({
  ev: window.__snd ? window.__snd.ev.slice() : [],
  ws: window.__snd ? window.__snd.ws.slice() : [],
  dbg: window.__mafiaSoundDebug ? window.__mafiaSoundDebug() : null,
}));
const clear = (page) => page.evaluate(() => { if (window.__snd) { window.__snd.ev.length = 0; window.__snd.ws.length = 0; } });
const dbg = async (page) => (await snap(page)).dbg;

/** ينتظر حتى يصدق الشرطُ على لقطةٍ حيّة، أو تنتهي المهلة. */
async function until(page, pred, ms = 6000, step = 200) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < ms) {
    last = await snap(page);
    try { if (pred(last)) return last; } catch {}
    await sleep(step);
  }
  return last;
}

// ══════════════════════════════════════════════════════
async function main() {
  console.log(`\n🔊 اختبارُ نظام الصوت الحيّ — ${URL}\n${'═'.repeat(58)}`);

  // ── الغرفة ──
  const driver = await connect({ token: TOKEN, leaderToken: TOKEN });
  // إعادةُ الاتصال تُفقد socket.data.roomId على الخادم — نُعيد الانضمام تلقائيّاً
  let joinedRoom = null;
  driver.on('connect', () => { if (joinedRoom) driver.emit('room:rejoin-leader', { roomId: joinedRoom }); });
  const room = await rpc(driver, 'room:create', {
    gameName: '🧪 فحصُ الصوت',
    maxPlayers: 12, maxJustifications: 1, maxPenalties: 3, penaltyScope: 'game',
    activityId: ACTIVITY_ID,
  });
  const roomId = room.roomId, pin = String(room.displayPin);
  joinedRoom = roomId;
  console.log(`🏠 غرفة ${room.roomCode} · ${roomId} · رمز الشاشة ${pin}\n`);

  const phase = async (p) => { await rpc(driver, 'game:transition-phase', { roomId, targetPhase: p }); await sleep(900); };

  // ── واجهةُ الأصوات (لفحص المدّة) ──
  const api = async (path, init = {}) => {
    const r = await fetch(`${URL}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) } });
    return r.json();
  };
  const soundsList = async () => (await api('/api/sounds')).sounds || [];
  const restoreDur = [];   // [{id, durations}] لإعادتها كما كانت
  const setDuration = async (eventKey, ms) => {
    const list = await soundsList();
    const cov = (await api('/api/sounds/coverage')).coverage || {};
    const winnerId = cov[eventKey] && cov[eventKey].winner && cov[eventKey].winner.id;
    if (!winnerId) return null;
    const f = list.find(x => x.id === winnerId);
    if (!restoreDur.some(r => r.id === winnerId)) restoreDur.push({ id: winnerId, durations: f.durations || {} });
    const merged = { ...(f.durations || {}) };
    if (ms) merged[eventKey] = ms; else delete merged[eventKey];
    await api(`/api/sounds/${winnerId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durations: merged }),
    });
    return winnerId;
  };

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-dev-shm-usage'],
  });

  const newDisplay = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(RECORDER);
    const page = await ctx.newPage();
    if (opts.blockMap) {
      let n = 0;
      await page.route('**/api/sounds/active-map', (route) => {
        n++;
        if (n <= opts.blockMap) return route.abort('failed');
        return route.continue();
      });
    }
    await page.goto(`${URL}/display?roomId=${encodeURIComponent(roomId)}&pin=${pin}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
    await page.mouse.click(640, 400).catch(() => {});   // فكُّ قفلِ التشغيل الحقيقيّ
    return { ctx, page };
  };

  // ── الموجّه ──
  const leaderCtx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await leaderCtx.addInitScript(RECORDER);
  await leaderCtx.addInitScript(([tok, rid]) => {
    try { localStorage.setItem('leader_token', tok); localStorage.setItem('leader_name', 'اختبار'); } catch {}
    try { sessionStorage.setItem('leader_active_room', rid); } catch {}
  }, [TOKEN, roomId]);
  const leader = await leaderCtx.newPage();
  await leader.goto(`${URL}/leader`, { waitUntil: 'domcontentloaded' });
  await leader.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
  await leader.mouse.click(700, 500).catch(() => {});
  await sleep(2500);

  const d1 = await newDisplay();
  const display = d1.page;
  await sleep(1500);

  // 🎚️ فتحُ المازج إن لم يكن مفتوحاً — نقرُ أيّ زرٍّ خارجَه يُغلقه (سلوكٌ مقصود)
  // ⚠️ زرُّ المازج نفسُه يحمل data-mixer (كي لا تُحسب نقرتُه «خارج اللوحة»)،
  //    فاللوحةُ تُميَّز بـ div[data-mixer] لا بالسمة وحدَها.
  const PANEL = 'div[data-mixer]';
  const openMixer = async () => {
    if (await leader.locator(PANEL).count()) return true;
    const btn = leader.locator('button[data-mixer]').first();
    if (!(await btn.count())) return false;
    await btn.click().catch(() => {});
    await sleep(700);
    return (await leader.locator(PANEL).count()) > 0;
  };
  // ⚠️ المعاينةُ في المازج معلّقةٌ على pointerup/keyup لا على input — فتحريكُ
  //    القيمة وحدَه لا يُطلقها. `preview:true` يحاكي رفعَ الإصبع كما يفعل الموجّه.
  const setSlider = async (labelAr, pct, preview = false) => {
    const sl = leader.locator(`input[type=range][aria-label="${labelAr}"]`).first();
    if (!(await sl.count())) return false;
    await sl.evaluate((el, [v, prev]) => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (prev) el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    }, [pct, preview]);
    return true;
  };

  const run = (id) => ONLY.length === 0 || ONLY.includes(id);
  const head = (id, title) => console.log(`\n${id} · ${title}\n${'─'.repeat(52)}`);

  try {

  // ════════════════════════════════════════════════
  // S01 — الأدوار والخريطة
  // ════════════════════════════════════════════════
  if (run('S01')) {
    head('S01', 'الأدوارُ الأساسيّة: الموجّهُ مصدرٌ والشاشةُ تابع');
    const L = await dbg(leader), D = await dbg(display);
    ok('صفحةُ الموجّه حمّلت مديرَ الصوت', !!L, 'window.__mafiaSoundDebug غائب — النشرةُ قديمة؟');
    ok('الموجّهُ مصدر (ليس تابعاً)', L && L.follower === false, JSON.stringify(L && L.follower));
    ok('الشاشةُ تابع', D && D.follower === true, JSON.stringify(D && D.follower));
    ok('خريطةُ أصوات الموجّه محمَّلة', L && L.loaded && L.mapKeys > 0, `mapKeys=${L && L.mapKeys}`);
    ok('خريطةُ أصوات الشاشة محمَّلة', D && D.loaded && D.mapKeys > 0, `mapKeys=${D && D.mapKeys}`);
    ok('الخريطتان متطابقتان', L && D && L.mapKeys === D.mapKeys, `${L && L.mapKeys} ≠ ${D && D.mapKeys}`);
  }

  // ════════════════════════════════════════════════
  // S02 — فراشُ الليل يصل ويُعزف
  // ════════════════════════════════════════════════
  if (run('S02')) {
    head('S02', 'انتقالٌ إلى الليل: الفراشُ يُبَثّ ويُعزف على الشاشة');
    await clear(display); await clear(leader);
    await phase('NIGHT');
    const D = await until(display, s => s.ev.some(e => e.k === 'play' && /\.(wav|mp3|ogg)/i.test(e.src)));
    const relay = D.ws.filter(w => w.ev === 'display:sound-play');
    ok('وصلت رسالةُ صوتٍ إلى الشاشة', relay.length > 0, `ws=${JSON.stringify(D.ws.map(w => w.ev))}`);
    ok('فيها playAmbientSound', relay.some(r => r.data && r.data.fn === 'playAmbientSound'),
      JSON.stringify(relay.map(r => r.data && r.data.fn)));
    const played = D.ev.filter(e => e.k === 'play' && /\.(wav|mp3|ogg)/i.test(e.src));
    ok('عُزف ملفٌّ فعلاً على الشاشة', played.length > 0, JSON.stringify(D.ev.slice(0, 6)));
    ok('الفراشُ حلقةٌ مستمرّة', played.some(p => p.loop === true), JSON.stringify(played.map(p => [p.src, p.loop])));
    const dd = D.dbg;
    ok('الشاشةُ تعزف ambient_night', dd && dd.ambientKey === 'ambient_night' && dd.ambientPlaying,
      JSON.stringify(dd && { k: dd.ambientKey, p: dd.ambientPlaying }));
    const L = await snap(leader);
    ok('الموجّهُ يعزف الفراشَ عنده أيضاً', L.dbg && L.dbg.ambientPlaying, JSON.stringify(L.dbg && L.dbg.ambientKey));
    const st = D.ws.find(w => w.ev === 'display:sound-play' && w.data && w.data.fn === 'playGameSound');
    ok('نغمةُ افتتاح الطور بُثّت كذلك', !!st, 'phase_night_start لم يصل');
  }

  // ════════════════════════════════════════════════
  // S03 — تبديلُ الفراش
  // ════════════════════════════════════════════════
  if (run('S03')) {
    head('S03', 'تبديلُ الطور يبدّل فراشَ القاعة');
    await clear(display);
    await phase('DAY_VOTING');
    const D = await until(display, s => s.dbg && s.dbg.ambientKey === 'ambient_voting', 8000);
    ok('الشاشةُ انتقلت إلى ambient_voting', D.dbg && D.dbg.ambientKey === 'ambient_voting', JSON.stringify(D.dbg && D.dbg.ambientKey));
    ok('الفراشُ السابقُ أُوقف', D.ev.some(e => e.k === 'pause'), 'لا إيقاف مسجَّل');
    ok('الفراشُ الجديدُ يعمل', D.dbg && D.dbg.ambientPlaying, JSON.stringify(D.dbg));
  }

  // ════════════════════════════════════════════════
  // S04 — طورٌ بلا ملفّ: صمتٌ لا وراثة (إلّا الإقصاء)
  // ════════════════════════════════════════════════
  if (run('S04')) {
    head('S04', 'طورٌ بلا ملفِّ خلفيّة: يصمت — والإقصاءُ وحدَه يرث');
    await phase('NIGHT'); await sleep(1500);
    const night = await dbg(display);
    ok('فراشُ الليل يعمل قبل الانتقال', night && night.ambientPlaying, JSON.stringify(night && night.ambientKey));

    // ambient_day بلا ملفٍّ على الإنتاج ⇒ يجب أن يصمت لا أن يرث فراشَ الليل
    await clear(display);
    await phase('DAY_DISCUSSION');
    const D = await until(display, x => x.dbg && x.dbg.ambientPlaying === false, 6000);
    ok('لا يُكمل فراشُ الليل فوق النهار', D.dbg && D.dbg.ambientPlaying === false,
      `ambientPlaying=${D.dbg && D.dbg.ambientPlaying} key=${D.dbg && D.dbg.ambientKey}`);
    const relay = D.ws.filter(w => w.ev === 'display:sound-play').map(w => w.data && w.data.fn);
    ok('وبُثَّ أمرُ الإيقاف صراحةً', relay.includes('stopAmbientSound'), JSON.stringify(relay));

    // والإقصاءُ يرث: لا يُترك أشدُّ لحظات النهار في صمتٍ تامّ
    await phase('DAY_VOTING'); await sleep(1800);
    const voting = await dbg(display);
    ok('فراشُ التصويت يعمل', voting && voting.ambientPlaying && voting.ambientKey === 'ambient_voting',
      JSON.stringify(voting && voting.ambientKey));
    await phase('DAY_ELIMINATION'); await sleep(2500);
    const elim = await dbg(display);
    ok('الإقصاءُ يرث فراشَ التصويت (استثناءٌ مقصود)', elim && elim.ambientPlaying === true,
      `ambientPlaying=${elim && elim.ambientPlaying}`);
    ok('وبالمفتاح نفسِه', elim && elim.ambientKey === 'ambient_voting', JSON.stringify(elim && elim.ambientKey));
  }

  // ════════════════════════════════════════════════
  // S04b — موسيقى التصويت تتوقّف عند التبرير
  // ════════════════════════════════════════════════
  if (run('S04b')) {
    head('S04b', 'موسيقى التصويت تصمت عند بدء التبرير');
    await phase('DAY_VOTING'); await sleep(1800);
    const before = await dbg(display);
    ok('التصويتُ يعزف', before && before.ambientPlaying && before.ambientKey === 'ambient_voting',
      JSON.stringify(before && before.ambientKey));
    await clear(display);
    await phase('DAY_JUSTIFICATION');
    const D = await until(display, x => x.dbg && x.dbg.ambientPlaying === false, 6000);
    ok('صمتت عند التبرير', D.dbg && D.dbg.ambientPlaying === false,
      `ما زالت تعمل: ${D.dbg && D.dbg.ambientKey}`);
  }

  // ════════════════════════════════════════════════
  // S04c — فراشُ الليل يتوقّف عند ملخّص الصباح
  // ════════════════════════════════════════════════
  if (run('S04c')) {
    head('S04c', 'فراشُ الليل يصمت عند الانتقال لملخّص الليلة');
    await phase('NIGHT'); await sleep(1800);
    const before = await dbg(display);
    ok('فراشُ الليل يعزف', before && before.ambientPlaying && before.ambientKey === 'ambient_night',
      JSON.stringify(before && before.ambientKey));
    await clear(display);
    await phase('MORNING_RECAP');
    const D = await until(display, x => x.dbg && x.dbg.ambientPlaying === false, 6000);
    ok('صمت عند ملخّص الليلة', D.dbg && D.dbg.ambientPlaying === false,
      `ما زال يعمل: ${D.dbg && D.dbg.ambientKey}`);
  }

  // ════════════════════════════════════════════════
  // S05 — مقبضُ المستوى من واجهة الموجّه
  // ════════════════════════════════════════════════
  if (run('S05')) {
    head('S05', 'مقبضُ المستوى في المازج يغيّر مستوى القاعة');
    await phase('NIGHT'); await sleep(800);
    await clear(display);
    // فتحُ المازج بزرّه الحقيقيّ
    const opened = await openMixer();
    ok('لوحةُ المازج فُتحت من زرّها', opened);
    const moved = await setSlider('خلفيّة الليل والصباح', 80);
    ok('مقبضُ خلفيّة الليل موجود ويتحرّك', moved);
    if (moved) {
      await sleep(1200);
      const D = await until(display, s => s.ws.some(w => w.ev === 'display:sound-play' && w.data && w.data.fn === 'setAmbientVolume'), 5000);
      const relay = D.ws.filter(w => w.ev === 'display:sound-play' && w.data.fn === 'setAmbientVolume');
      ok('بُثَّ تغييرُ المستوى للقاعة', relay.length > 0, JSON.stringify(D.ws.map(w => w.data && w.data.fn)));
      const sentVol = relay.length ? relay[relay.length - 1].data.vol : null;
      ok('المستوى المُرسَل = ٨٠٪', sentVol !== null && Math.abs(sentVol - 0.8) < 0.02, `vol=${sentVol}`);
      const dd = await dbg(display);
      ok('مستوى الشاشة الفعليّ تبِع المقبض', dd && Math.abs(dd.ambientVolume - 0.8) < 0.03, `ambientVolume=${dd && dd.ambientVolume}`);
      const L = await dbg(leader);
      ok('ومستوى جهاز الموجّه كذلك', L && Math.abs(L.ambientVolume - 0.8) < 0.03, `leader=${L && L.ambientVolume}`);
    }
  }

  // ════════════════════════════════════════════════
  // S06 — المستوى يسري على الأصواتِ اللحظيّة أيضاً
  // ════════════════════════════════════════════════
  if (run('S06')) {
    head('S06', 'المستوى المضبوط يركب كلَّ صوتٍ لحظيّ');
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['vote_cast'], vol: 0.25 });
    const D = await until(display, s => s.ev.some(e => e.k === 'play' && /vote|\.wav|\.mp3/i.test(e.src)), 5000);
    const p = D.ev.filter(e => e.k === 'play');
    ok('عُزف الصوتُ اللحظيّ على الشاشة', p.length > 0, JSON.stringify(D.ev.slice(0, 5)));
    ok('بمستوى ٢٥٪ كما أُرسل', p.some(x => Math.abs(x.vol - 0.25) < 0.03), JSON.stringify(p.map(x => x.vol)));
  }

  // ════════════════════════════════════════════════
  // S07 — كتمُ جهاز الموجّه لا يُسكت القاعة
  // ════════════════════════════════════════════════
  if (run('S07')) {
    head('S07', 'كتمُ جهاز الموجّه: القاعةُ تبقى تسمع');
    const muteBtn = leader.locator('button[aria-label="كتم الصوت"]').first();
    const found = await muteBtn.count();
    ok('زرُّ الكتم موجود', found > 0);
    if (found) {
      await muteBtn.click(); await sleep(700);
      const L = await dbg(leader);
      ok('جهازُ الموجّه صار مكتوماً', L && L.muted === true, JSON.stringify(L && L.muted));
      ok('وفراشُ جهازه توقّف', L && !L.ambientPlaying);

      await clear(display);
      driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['vote_cast'], vol: 0.6 });
      await phase('DAY_VOTING');
      const D = await until(display, s => s.ev.some(e => e.k === 'play'), 6000);
      ok('القاعةُ ما زالت تسمع رغم كتم الموجّه', D.ev.some(e => e.k === 'play'), JSON.stringify(D.ev.slice(0, 5)));

      // ⭐ الانحدارُ المُصلَح: مقبضُ المستوى وجهازُ الموجّه مكتوم
      // (نقرُ زرّ الكتم أغلق المازجَ — نُعيد فتحَه كما يفعل الموجّه)
      await clear(display);
      const reopened = await openMixer();
      ok('المازجُ يُفتح والجهازُ مكتوم', reopened);
      const moved7 = await setSlider('خلفيّة النهار', 15);
      ok('مقبضُ خلفيّة النهار متاح', moved7);
      if (moved7) {
        const D2 = await until(display, s => s.ws.some(w => w.data && w.data.fn === 'setAmbientVolume'), 5000);
        const rel = D2.ws.filter(w => w.data && w.data.fn === 'setAmbientVolume');
        ok('المقبضُ يعمل والموجّهُ مكتوم', rel.length > 0, 'لم يُبثَّ تغييرُ مستوى — المقبضُ صامتٌ عن القاعة');
        if (rel.length) {
          const v = rel[rel.length - 1].data.vol;
          ok('والمستوى المُرسَل = ١٥٪', Math.abs(v - 0.15) < 0.02, `vol=${v}`);
          const dd = await dbg(display);
          ok('وطُبِّق على فراش الشاشة', dd && Math.abs(dd.ambientVolume - 0.15) < 0.03, `ambientVolume=${dd && dd.ambientVolume}`);
        }
      }
      // رفعُ الكتم: الزرُّ نفسُه غيّر اسمَه (aria-label يتبع الحالة)
      const unmute = leader.locator('button[aria-label="تشغيل الصوت"]').first();
      ok('زرُّ رفعِ الكتم ظهر مكانَه', await unmute.count() > 0);
      await unmute.click().catch(() => {}); await sleep(600);
      const L2 = await dbg(leader);
      ok('رُفع الكتمُ بنجاح', L2 && L2.muted === false);
    }
  }

  // ════════════════════════════════════════════════
  // S08 — الخفضُ والرفعُ التلقائيّان يحترمان مستوى الموجّه
  // ════════════════════════════════════════════════
  if (run('S08')) {
    head('S08', 'خفضُ الخلفيّة لحظةَ الحدث ثمّ رفعُها إلى مستوى الموجّه');
    await phase('NIGHT'); await sleep(1200);
    const before = await dbg(display);
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'playEventSound', args: ['night_assassination', 1500], vol: 0.7 });
    await sleep(500);
    const mid = await dbg(display);
    ok('انخفض فراشُ القاعة أثناء الحدث', mid && before && mid.ambientVolume < before.ambientVolume - 0.01,
      `${before && before.ambientVolume} → ${mid && mid.ambientVolume}`);
    await sleep(2200);
    const after = await dbg(display);
    ok('ثمّ عاد إلى مستوى الموجّه لا إلى افتراضيّ الشاشة', after && before && Math.abs(after.ambientVolume - before.ambientVolume) < 0.03,
      `عاد إلى ${after && after.ambientVolume} بدل ${before && before.ambientVolume}`);
  }

  // ════════════════════════════════════════════════
  // S09 — القائمةُ البيضاء وصلاحيّةُ المُرسِل
  // ════════════════════════════════════════════════
  if (run('S09')) {
    head('S09', 'الحمايةُ: دالّةٌ خارج القائمة، ومُرسِلٌ بلا صلاحيّة');
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'evilFunction', args: ['x'], vol: 1 });
    driver.emit('leader:sound-play', { roomId, fn: 'eval', args: ['alert(1)'] });
    await sleep(1200);
    let D = await snap(display);
    ok('دالّةٌ خارج القائمة لا تصل', !D.ws.some(w => w.ev === 'display:sound-play'), JSON.stringify(D.ws));

    const anon = await connect({}, { reconnect: false });          // بلا توكن — لا دورَ leader
    anon.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['win_mafia'], vol: 1 });
    await sleep(1200);
    D = await snap(display);
    ok('مُرسِلٌ بلا صلاحيّةِ موجّهٍ لا يُسمع في القاعة', !D.ws.some(w => w.ev === 'display:sound-play'), JSON.stringify(D.ws));
    anon.close();
  }

  // ════════════════════════════════════════════════
  // S10 — مدّةُ التشغيل: مقطعٌ لحظيّ
  // ════════════════════════════════════════════════
  if (run('S10')) {
    head('S10', 'حقلُ المدّة: قطعُ مقطعٍ لحظيّ عند ثانيتين');
    // 🔑 مفتاحٌ ملفُّه **طويل** (أغنيةُ فوز): نقرةُ تصويتٍ مدّتُها أقلُّ من السقف
    //    فتنتهي وحدَها — فيمرّ الفحصُ بلا أن يُثبت أنّ السقفَ يعمل.
    const KEY = 'win_mafia';
    const id = await setDuration(KEY, 2000);
    ok('حُفظت المدّةُ على الملفّ الفائز', !!id, `لا ملفَّ فائزاً لـ ${KEY}`)
    if (id) {
      const map = await (await fetch(`${URL}/api/sounds/active-map`)).json();
      ok('الخريطةُ تُصدِّر المدّة', map.durations && map.durations[KEY] === 2000, JSON.stringify(map.durations && map.durations[KEY]));
      await display.evaluate(() => window.location.reload());
      await display.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
      await display.mouse.click(640, 400).catch(() => {});
      await sleep(2500);
      const dd = await dbg(display);
      ok('الشاشةُ تعرف المدّة', dd && dd.durations && dd.durations[KEY] === 2000, JSON.stringify(dd && dd.durations));
      await clear(display);
      driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: [KEY], vol: 0.8 });
      const D = await until(display, s => s.ev.some(e => e.k === 'pause'), 5000);
      const started = D.ev.find(e => e.k === 'play');
      const stopped = D.ev.find(e => e.k === 'pause');
      ok('عُزف ثمّ أُوقف', !!started && !!stopped, JSON.stringify(D.ev.slice(0, 8)));
      if (started && stopped) {
        const dt = stopped.t - started.t;
        ok('التوقّفُ عند ٢ث تقريباً', dt > 1500 && dt < 2900, `${dt}ms`);
      }
      const fades = D.ev.filter(e => e.k === 'vol');
      ok('القطعُ بخفضٍ لطيف لا ببتر', fades.length >= 3, `${fades.length} خطوات خفض`);
    }
  }

  // ════════════════════════════════════════════════
  // S11 — مدّةُ التشغيل: فراشُ خلفيّة (مرّةً بلا حلقة)
  // ════════════════════════════════════════════════
  if (run('S11')) {
    head('S11', 'حقلُ المدّة على فراشٍ: يُعزف مرّةً ثمّ يصمت');
    const id = await setDuration('ambient_night', 3000);
    if (ok('حُفظت مدّةُ ambient_night', !!id)) {
      await display.evaluate(() => window.location.reload());
      await display.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
      await display.mouse.click(640, 400).catch(() => {});
      await leader.evaluate(() => window.location.reload());
      await leader.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
      await leader.mouse.click(700, 500).catch(() => {});
      await sleep(3500);
      await phase('DAY_VOTING'); await sleep(600);
      await clear(display);
      await phase('NIGHT');
      const D = await until(display, s => s.ev.some(e => e.k === 'play' && e.loop === false), 6000);
      const p = D.ev.filter(e => e.k === 'play');
      ok('الفراشُ عُزف بلا حلقة', p.some(x => x.loop === false), JSON.stringify(p.map(x => [x.src, x.loop])));
      await sleep(3500);
      const dd = await dbg(display);
      ok('وصمت بعد المدّة', dd && dd.ambientPlaying === false, `ambientPlaying=${dd && dd.ambientPlaying}`);
      ok('ولا يُستأنف تلقائيّاً', dd && dd.ambientDone === true, `ambientDone=${dd && dd.ambientDone}`);
    }
    await setDuration('ambient_night', null);
    await setDuration('win_mafia', null);
  }

  // ════════════════════════════════════════════════
  // S12 — شاشةٌ تنضمّ متأخّرةً وسطَ الطور
  // ════════════════════════════════════════════════
  if (run('S12')) {
    head('S12', 'شاشةٌ تُفتح وسطَ الطور: هل تلحق بالفراش؟');
    await display.evaluate(() => window.location.reload());
    await display.waitForFunction(() => !!window.__mafiaSoundDebug, null, { timeout: 30000 }).catch(() => {});
    await display.mouse.click(640, 400).catch(() => {});
    await sleep(2000);
    await phase('NIGHT'); await sleep(1500);
    const d2 = await newDisplay();
    await sleep(3500);
    const D = await dbg(d2.page);
    const caught = !!(D && D.ambientPlaying);
    ok('الشاشةُ المتأخّرة تسمع فراشَ الطور', caught,
      'لا فراشَ عندها — البثُّ يقع عند الانتقال فقط، فمن فتح شاشةً وسطَ الطور يبقى صامتاً حتى الانتقال التالي');
    ok('وبالمفتاح الصحيح', D && D.ambientKey === 'ambient_night', `ambientKey=${D && D.ambientKey}`);
    const S = await snap(d2.page);
    ok('وصلها بثُّ فراشٍ موجَّهٌ إليها وحدَها', S.ws.some(w => w.ev === 'display:sound-play' && w.data && w.data.fn === 'playAmbientSound'),
      JSON.stringify(S.ws.map(w => w.data && w.data.fn)));
    // والشاشةُ القديمة لا يُقطع فراشُها من أجل الجديدة
    const Dold = await dbg(display);
    ok('ولم يُقطع فراشُ الشاشة القائمة', Dold && Dold.ambientPlaying === true, `ambientPlaying=${Dold && Dold.ambientPlaying}`);
    await d2.ctx.close();
  }

  // ════════════════════════════════════════════════
  // S13 — انقطاعُ الشبكة وعودتُها
  // ════════════════════════════════════════════════
  if (run('S13')) {
    head('S13', 'انقطاعُ الشاشة وعودتُها: هل يستأنف الصوت؟');
    await d1.ctx.setOffline(true);
    await sleep(2500);
    await d1.ctx.setOffline(false);
    await sleep(6000);
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['vote_cast'], vol: 0.5 });
    const D = await until(display, s => s.ws.some(w => w.ev === 'display:sound-play'), 8000);
    ok('الصوتُ يصل بعد عودة الاتصال', D.ws.some(w => w.ev === 'display:sound-play'),
      'الشاشةُ لم تعد تتلقّى شيئاً بعد إعادة الاتصال');
    ok('ويُعزف فعلاً', D.ev.some(e => e.k === 'play'), JSON.stringify(D.ev.slice(0, 5)));
  }

  // ════════════════════════════════════════════════
  // S14 — فشلُ تحميل الخريطة ثمّ التعافي
  // ════════════════════════════════════════════════
  if (run('S14')) {
    head('S14', 'فشلُ جلبِ خريطة الأصوات: هل تتعافى الشاشة؟');
    const d3 = await newDisplay({ blockMap: 2 });   // أوّلُ محاولتين تفشلان
    await sleep(2500);
    const first = await dbg(d3.page);
    ok('الشاشةُ لا تدّعي التحميلَ بعد الفشل', first && first.loaded === false, JSON.stringify(first && first.loaded));
    const rec = await until(d3.page, s => s.dbg && s.dbg.loaded && s.dbg.mapKeys > 0, 25000, 800);
    ok('ثمّ تعافت وحمّلت الخريطة', rec.dbg && rec.dbg.loaded && rec.dbg.mapKeys > 0,
      `loaded=${rec.dbg && rec.dbg.loaded} keys=${rec.dbg && rec.dbg.mapKeys}`);
    await clear(d3.page);
    driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['vote_cast'], vol: 0.5 });
    const D = await until(d3.page, s => s.ev.some(e => e.k === 'play'), 6000);
    ok('وتعزف بعد التعافي', D.ev.some(e => e.k === 'play'), JSON.stringify(D.ev.slice(0, 5)));
    await d3.ctx.close();
  }

  // ════════════════════════════════════════════════
  // S15 — إيقافُ كلّ شيء عند العودة للوبي
  // ════════════════════════════════════════════════
  if (run('S15')) {
    head('S15', 'العودةُ إلى اللوبي تُسكت ما كان يعمل');
    await phase('NIGHT'); await sleep(1200);
    await clear(display);
    await phase('LOBBY'); await sleep(2000);
    const D = await snap(display);
    const fns = D.ws.filter(w => w.ev === 'display:sound-play').map(w => w.data && w.data.fn);
    ok('بُثَّ أمرُ إيقافٍ للقاعة', fns.includes('stopOneShotSounds') || fns.includes('playAmbientSound') || fns.includes('stopAmbientSound'),
      JSON.stringify(fns));
    const dd = await dbg(display);
    ok('لا فراشَ ليلٍ عالقٌ بعد اللوبي', !dd || dd.ambientKey !== 'ambient_night', JSON.stringify(dd && dd.ambientKey));
  }

  // ════════════════════════════════════════════════
  // S16 — استقرارٌ تحت وابلٍ من الأصوات
  // ════════════════════════════════════════════════
  if (run('S16')) {
    head('S16', 'وابلٌ من الأصوات المتلاحقة: لا فقدان ولا تعليق');
    await clear(display);
    const N = 12;
    for (let i = 0; i < N; i++) {
      driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['vote_cast'], vol: 0.4 });
      await sleep(120);
    }
    await sleep(2500);
    const D = await snap(display);
    const got = D.ws.filter(w => w.ev === 'display:sound-play').length;
    ok(`وصلت الرسائلُ كلُّها (${got}/${N})`, got === N, `وصل ${got}`);
    const plays = D.ev.filter(e => e.k === 'play').length;
    ok(`وعُزفت كلُّها (${plays}/${N})`, plays >= N - 1, `عُزف ${plays}`);
    const dd = await dbg(display);
    ok('ولا مقاطعَ عالقة', dd && dd.oneShots <= N, `oneShots=${dd && dd.oneShots}`);
  }


  // ════════════════════════════════════════════════
  // S17 — الحصريّة: صوتٌ جديد يُسكت الجاري
  // ════════════════════════════════════════════════
  if (run('S17')) {
    head('S17', 'صوتٌ جديد يُسكت ما قبله — والتكّاتُ لا تقطع شيئاً');
    await phase('DAY_DISCUSSION'); await sleep(900);
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['win_mafia'], vol: 0.5 });
    await until(display, x => x.ev.some(e => e.k === 'play'), 5000);
    await sleep(900);

    // ① نقرةُ تصويتٍ **لا** تقطع الأغنية (صوتٌ إضافيّ)
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['vote_cast'], vol: 0.5 });
    await sleep(1400);
    let D = await snap(display);
    const pausedByTick = D.ev.some(e => e.k === 'pause' && /Mafia|Ramadan|win/i.test(e.src));
    ok('نقرةُ التصويت لا تقطع أغنيةَ الفوز', !pausedByTick, JSON.stringify(D.ev.filter(e => e.k === 'pause')));

    // ② نغمةُ إقصاءٍ **تقطعها** (صوتٌ رئيسيّ)
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['elimination_citizen'], vol: 0.6 });
    D = await until(display, x => x.ev.some(e => e.k === 'pause'), 5000);
    ok('نغمةُ الإقصاء تقطع الأغنية', D.ev.some(e => e.k === 'pause'), JSON.stringify(D.ev.slice(0, 6)));
    ok('ثمّ تُعزف هي', D.ev.some(e => e.k === 'play'), JSON.stringify(D.ev.filter(e => e.k === 'play')));
    const dd = await dbg(display);
    ok('لا تراكمَ مقاطع', dd && dd.oneShots <= 2, `oneShots=${dd && dd.oneShots}`);
  }

  // ════════════════════════════════════════════════
  // S18 — الانتقالُ يُسكت ما بقي معلّقاً من الطور السابق
  // ════════════════════════════════════════════════
  if (run('S18')) {
    head('S18', 'صوتٌ طويلٌ من طورٍ لا يُكمل فوق الطور التالي');
    await phase('DAY_ELIMINATION'); await sleep(900);
    await clear(display);
    driver.emit('leader:sound-play', { roomId, fn: 'playGameSound', args: ['elimination_phoenix'], vol: 0.6 });
    await until(display, x => x.ev.some(e => e.k === 'play'), 5000);
    await sleep(600);
    await clear(display);
    await phase('NIGHT');
    const D = await until(display, x => x.ev.some(e => e.k === 'pause'), 6000);
    ok('أُوقف صوتُ الطور السابق عند الانتقال', D.ev.some(e => e.k === 'pause'), JSON.stringify(D.ev.slice(0, 6)));
    const fns = D.ws.filter(w => w.ev === 'display:sound-play').map(w => w.data && w.data.fn);
    ok('وبُثَّ أمرُ الإيقاف للقاعة', fns.includes('stopOneShotSounds'), JSON.stringify(fns));
    await sleep(1800);
    const dd = await dbg(display);
    ok('وفراشُ الليل يعمل وحدَه', dd && dd.ambientPlaying && dd.ambientKey === 'ambient_night',
      JSON.stringify(dd && { k: dd.ambientKey, p: dd.ambientPlaying }));
  }

  // ════════════════════════════════════════════════
  // S19 — معاينةُ المازج مقطوعةٌ لا أغنيةٌ كاملة
  // ════════════════════════════════════════════════
  if (run('S19')) {
    head('S19', 'تحريكُ مقبض الاحتفالات لا يُطلق أغنيةَ الفوز كاملةً');
    const opened = await openMixer();
    ok('المازجُ مفتوح', opened);
    await clear(leader); await clear(display);
    const moved = await setSlider('الاحتفالات', 60, true);
    ok('مقبضُ الاحتفالات تحرّك', moved);
    if (moved) {
      const L = await until(leader, x => x.ev.some(e => e.k === 'play'), 5000);
      const started = L.ev.find(e => e.k === 'play');
      ok('عُزفت معاينةٌ على جهاز الموجّه', !!started, JSON.stringify(L.ev.slice(0, 4)));
      await sleep(3600);
      const L2 = await snap(leader);
      const stopped = L2.ev.find(e => e.k === 'pause');
      ok('وتوقّفت خلال ثوانٍ (لا أغنيةَ كاملة)', !!stopped, 'ما زالت تعمل — المعاينةُ غيرُ مقطوعة');
      if (started && stopped) ok('المدّةُ ≤ ٣٫٥ث', stopped.t - started.t < 3500, `${stopped.t - started.t}ms`);
      const D = await snap(display);
      ok('ولم تُبَثَّ للقاعة (معاينةٌ محلّيّة)', !D.ws.some(w => w.ev === 'display:sound-play'),
        JSON.stringify(D.ws.map(w => w.data && w.data.fn)));
    }
  }

  } catch (e) {
    crashed = true;
    console.error(`
💥 انهيارٌ داخل السيناريوهات: ${e && e.message}`);
    failures.push(`انهيار: ${e && e.message}`);
    fail++;
  } finally {
  // ── التنظيف — في finally عمداً: سيناريو ينهار كان يترك غرفةً حيّةً ومدداً
  //    معدَّلةً على الإنتاج، فيُفسد الجولةَ التالية ويربك الموجّه.
  console.log(`\n${'─'.repeat(52)}\n🧹 التنظيف…`);
  for (const r of restoreDur) {
    await api(`/api/sounds/${r.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durations: r.durations }),
    });
  }
  console.log(`   أُعيدت مددُ ${restoreDur.length} ملفّ إلى ما كانت`);
  try { await rpc(driver, 'room:delete-room', { roomId }); console.log('   حُذفت غرفةُ الفحص'); }
  catch { try { driver.emit('room:close', { roomId }); } catch {} }
  try { driver.close(); } catch {}
  try { await browser.close(); } catch {}
  }

  // ── الخلاصة ──
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`📊 ${pass} ✅   ${fail} ❌${crashed ? '   💥 انهيارٌ أثناء التنفيذ' : ''}`);
  if (failures.length) { console.log('\n❌ الإخفاقات:'); failures.forEach(f => console.log(`   • ${f}`)); }
  if (notes.length) { console.log('\n📝 ملاحظات:'); notes.forEach(n => console.log(`   • ${n}`)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('\n💥', e); process.exit(1); });
