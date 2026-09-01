// 🧪 هل يحجب الشريطُ السفليّ عناصرَ في الوضع المثبَّت على آيفون؟
//
// Chromium يُرجع env(safe-area-inset-bottom)=0، وiOS المثبَّت يُرجع 34px.
// فنحاكيه بحقنِ نفسِ المقدار في حاشية الشريط — وهو ما يفعله env() حرفيّاً.
import { chromium } from 'playwright';
const NL = String.fromCharCode(10);
const BASE = process.argv[2] || 'https://club-mafia.grade.sbs';
const INSET = Number(process.argv[3] ?? 34);   // 0 = متصفّح · 34 = مثبَّت على آيفون

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  permissions: ['notifications'],
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});

await ctx.addInitScript(([inset]) => {
  // الوضعُ المثبَّت على آيفون — وهو محلُّ البلاغ
  try { Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true }); } catch (e) {}
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => (String(q).includes('display-mode: standalone')
    ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
    : mm(q));
  try { Object.defineProperty(window.Notification, 'permission', { get: () => 'granted', configurable: true }); } catch (e) {}
  localStorage.setItem('mafia_player_token', 'fixture');
  localStorage.setItem('mafia_playerId', '900');
  localStorage.setItem('mafia_player_auth', JSON.stringify({ playerId: 900, name: 'لاعب', phone: '0790000000', token: 'fixture' }));
  // محاكاةُ الحاشية الآمنة: env() لا يُعاد تعريفه، فنضيف المقدار نفسَه على الشريط
  const st = document.createElement('style');
  // المحاكاةُ الصحيحة: env(safe-area-inset-bottom) تصل إلى كلّ شيءٍ عبر --safe-b،
  // فتعريفُها هنا يُحاكي الجهازَ حرفيّاً — للشريط وللمحتوى معاً.
  // ولأجل الشيفرة القديمة (التي تنادي env مباشرةً) نُبقي حقنَ حاشية الشريط أيضاً.
  st.textContent = `:root{--safe-b:${inset}px !important}` +
    `nav[class*="fixed"][class*="bottom-0"]{padding-bottom:${inset}px !important}`;
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
}, [INSET]);

const PLAYER = { id: 900, name: 'لاعب', phone: '0790000000', xp: 120, level: 3, rankTier: 'SOLDIER', rankRr: 40, chips: 0, avatarUrl: null };
const STATS = { totalMatches: 12, wins: 7, losses: 5, winRate: 58, totalDeals: 3, successfulDeals: 2, roundsSurvived: 40, abilityUsed: 5, abilityCorrect: 3 };
await ctx.route('**/api/**', r => {
  const u = r.request().url();
  const j = d => r.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
  if (u.includes('/api/player-auth/me')) return j({ success: true, player: PLAYER });
  if (u.includes('/api/privacy/consent/status')) return j({ success: true, deletion: null,
    status: { required: false, isMinor: false, needsGuardian: false, missing: [], current: [] } });
  if (u.includes('/api/privacy')) return j({ success: true, consents: [], policies: [] });
  if (u.includes('/api/players/') || u.includes('/api/player/')) return j({ success: true, player: PLAYER, stats: STATS, progression: STATS, ...PLAYER });
  return j({ success: true, player: PLAYER, stats: STATS, progression: STATS, data: [], items: [], rows: [], history: [] });
});

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 120)));

const audit = async (path) => {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  // ننتظر الشريطَ نفسَه بدل مهلةٍ مخمَّنة — أوّلُ تصريفٍ لمسارٍ في وضع التطوير بطيء
  await p.waitForSelector('nav[class*="fixed"][class*="bottom-0"]', { timeout: 45000 }).catch(() => {});
  await p.waitForTimeout(1200);
  return p.evaluate(() => {
    const nav = document.querySelector('nav[class*="fixed"][class*="bottom-0"]');
    if (!nav) return { nav: null, url: location.pathname, txt: document.body.innerText.slice(0, 120),
      navs: [...document.querySelectorAll('nav')].map(n => n.className.slice(0, 60)) };
    const nb = nav.getBoundingClientRect();
    const hidden = [];
    for (const el of document.querySelectorAll('a,button,input,select,[role=button]')) {
      if (nav.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom <= nb.top || r.top >= window.innerHeight) continue;   // فوق الشريط أو خارج الشاشة
      const covered = Math.min(r.bottom, nb.bottom) - Math.max(r.top, nb.top);
      // الحجبُ الحقيقيّ = ما يعلوه الشريطُ فعلاً في الرصف. عنصرٌ بطبقةٍ أعلى
      // (ورقةٌ منبثقة z-300) يتقاطع هندسيّاً لكنّه مرئيٌّ وقابلٌ للّمس.
      const mid = { x: r.left + r.width / 2, y: Math.max(r.top, nb.top) + Math.min(covered, r.height) / 2 };
      const hit = document.elementFromPoint(mid.x, mid.y);
      const obscured = !!hit && (nav === hit || nav.contains(hit));
      if (covered > 1 && obscured) hidden.push({
        t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30),
        covered: Math.round(covered), h: Math.round(r.height),
      });
    }
    const root = document.querySelector('div.min-h-screen');
    if (!nav) return { nav: null };
    return {
      navTop: Math.round(nb.top), navH: Math.round(nb.height), vh: window.innerHeight,
      pagePadBottom: root ? getComputedStyle(root).paddingBottom : '?',
      docH: Math.round(document.documentElement.scrollHeight),
      hidden,
    };
  });
};

console.log(NL + `📱 iPhone 390×844 · حاشيةٌ آمنة = ${INSET}px  (${INSET ? 'تطبيقٌ مثبَّت' : 'متصفّح'})`);
for (const path of ['/player/home', '/player/games', '/player/privacy', '/player/profile']) {
  const r = await audit(path);
  if (!r.navH) { console.log(NL + '── ' + path + ' ── لا شريط · url=' + r.url + ' · navs=' + JSON.stringify(r.navs) + ' · ' + String(r.txt || '').split(String.fromCharCode(10)).join(' ')); continue; }
  console.log(NL + `── ${path} ──`);
  console.log(`   الشريط: ارتفاع ${r.navH}px · حافّته العليا عند ${r.navTop} من ${r.vh}`);
  console.log(`   هامشُ المحتوى السفليّ: ${r.pagePadBottom}`);
  if (!r.hidden || !r.hidden.length) console.log('   لا عنصرَ محجوب ✅');
  else for (const h of r.hidden) console.log(`   ❌ محجوبٌ ${h.covered}px من ${h.h}: «${h.t}»`);
}
console.log(NL + 'أخطاء: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'لا شيء'));
await b.close();
