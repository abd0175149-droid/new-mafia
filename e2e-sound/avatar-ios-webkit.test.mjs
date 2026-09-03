// 🧪 تغييرُ صورة الملف الشخصيّ على WebKit (محرّك سفاري) في وضعٍ مثبَّت
import { webkit } from 'playwright';
import { writeFileSync } from 'fs';
const NL = String.fromCharCode(10);
const BASE = process.argv[2] || 'https://club-mafia.grade.sbs';

// صورةٌ بأبعاد كاميرا آيفون — 4032×3024 كما تخرج فعلاً
function makeBigJpeg(path) {
  // نولّدها في المتصفّح لاحقاً؛ هنا ملفٌّ صغيرٌ سليمٌ كأساس
  const b64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
    + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAA'
    + 'AAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  writeFileSync(path, Buffer.from(b64, 'base64'));
}

const PLAYER = { id: 900, name: 'لاعب', phone: '0790000000', xp: 120, level: 3,
  rankTier: 'SOLDIER', rankRr: 40, chips: 0, avatarUrl: null };
const STATS = { totalMatches: 12, wins: 7, losses: 5, winRate: 58, totalDeals: 3,
  successfulDeals: 2, roundsSurvived: 40, abilityUsed: 5, abilityCorrect: 3 };

const b = await webkit.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  permissions: ['notifications'],
});
await ctx.addInitScript(() => {
  try { Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true }); } catch (e) {}
  const mm = window.matchMedia.bind(window);
  window.matchMedia = q => (String(q).includes('display-mode: standalone')
    ? { matches: true, media: q, addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
    : mm(q));
  try { Object.defineProperty(window.Notification, 'permission', { get: () => 'granted', configurable: true }); } catch (e) {}
  // تجاوزُ شاشة «غير مدعوم» — WebKit في Playwright بلا Push API
  localStorage.setItem('notifications_unsupported', 'true');
  localStorage.setItem('push_notifications_enabled', 'true');
  localStorage.setItem('mafia_player_token', 'fixture');
  localStorage.setItem('mafia_playerId', '900');
  localStorage.setItem('mafia_player_auth', JSON.stringify({ playerId: 900, name: 'لاعب', phone: '0790000000', token: 'fixture' }));
});
await ctx.route('**/api/**', r => {
  const u = r.request().url();
  const j = d => r.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
  if (u.includes('/api/player-auth/me')) return j({ success: true, player: PLAYER });
  if (u.includes('/api/privacy/consent/status')) return j({ success: true, deletion: null,
    status: { required: false, isMinor: false, needsGuardian: false, missing: [], current: [] } });
  if (u.includes('/avatar')) return j({ success: true, avatarUrl: '/uploads/avatars/x.jpg?v=1' });
  return j({ success: true, player: PLAYER, stats: STATS, progression: STATS,
    data: [], items: [], rows: [], history: [] });
});

const p = await ctx.newPage();
const errs = [], logs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + (e.stack || String(e)).slice(0, 400)));
p.on('console', m => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
p.on('crash', () => errs.push('PAGE CRASHED'));

await p.goto(BASE + '/player/profile', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
await p.waitForTimeout(5000);
console.log(NL + '1) الصفحة: ' + (await p.evaluate(() => document.body.innerText.slice(0, 70)
  .split(String.fromCharCode(10)).join(' '))));

// ── نولّد ملفّاً بأبعاد صورة آيفون داخل الصفحة، ونحقنه في input ──
const big = 'C:/Users/abdul/AppData/Local/Temp/claude/c--Projects-new-mafia/3057e8a1-c34a-4eed-9a78-7b5a70f0bf6b/scratchpad/iphone.jpg';
await p.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 4032; c.height = 3024;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 4032, 3024);
  g.addColorStop(0, '#c94'); g.addColorStop(1, '#238');
  x.fillStyle = g; x.fillRect(0, 0, 4032, 3024);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
  window.__big = new File([blob], 'IMG_4032.jpg', { type: 'image/jpeg' });
  window.__bigSize = blob.size;
});
console.log('2) صورةُ الاختبار: 4032×3024 · ' + await p.evaluate(() => Math.round(window.__bigSize / 1024) + 'KB'));

const fed = await p.evaluate(() => {
  const inp = document.querySelector('input[type=file]');
  if (!inp) return 'no-input';
  const dt = new DataTransfer();
  dt.items.add(window.__big);
  inp.files = dt.files;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return 'fed';
});
console.log('3) حقنُ الملفّ: ' + fed);

// حالاتٌ خاصّةٌ بالآيفون: HEIC · وصورةٌ لا تُفكّ ترميزها
await p.evaluate(() => { window.__probe = []; });
const probe = async (label, mk) => {
  await p.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('إلغاء')); if(b) b.click(); });
  await p.waitForTimeout(700);
  await p.evaluate(mk);
  await p.evaluate(() => {
    const inp = document.querySelector('input[type=file]');
    const dt = new DataTransfer(); dt.items.add(window.__f);
    inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(4000);
  const st = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    return { cropper: !!c, err: document.body.innerText.includes('Application error'),
      txt: document.body.innerText.slice(0,60).split(String.fromCharCode(10)).join(' ') };
  });
  console.log('   ▸ ' + label + ': ' + JSON.stringify(st));
  const btn = await p.evaluate(() => {
    const el=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('حفظ الصورة'));
    if(el){el.click();return true;} return false; });
  await p.waitForTimeout(3500);
  const st2 = await p.evaluate(() => ({ err: document.body.innerText.includes('Application error'),
    txt: document.body.innerText.slice(0,60).split(String.fromCharCode(10)).join(' ') }));
  console.log('     بعد الضغط على حفظ (' + btn + '): ' + JSON.stringify(st2));
};

await probe('HEIC', async () => {
  const c=document.createElement('canvas'); c.width=64;c.height=64;
  const b=await new Promise(r=>c.toBlob(r,'image/jpeg',0.9));
  window.__f=new File([b],'IMG_0001.HEIC',{type:'image/heic'});
});
await probe('ملفٌّ تالف', async () => {
  window.__f=new File([new Uint8Array([1,2,3,4,5,6,7,8])],'broken.jpg',{type:'image/jpeg'});
});

await p.waitForTimeout(6000);

const state1 = await p.evaluate(() => ({
  txt: document.body.innerText.slice(0, 120).split(String.fromCharCode(10)).join(' '),
  cropper: !!document.querySelector('canvas'),
  saveBtn: [...document.querySelectorAll('button')].some(x => (x.textContent || '').includes('حفظ الصورة')),
}));
console.log('4) بعد الاختيار: ' + JSON.stringify(state1));

if (state1.saveBtn) {
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('حفظ الصورة'));
    if (el) el.click();
  });
  await p.waitForTimeout(6000);
  console.log('5) بعد الحفظ: ' + (await p.evaluate(() => document.body.innerText.slice(0, 140)
    .split(String.fromCharCode(10)).join(' '))));
}

console.log(NL + 'أخطاءُ الصفحة: ' + (errs.length ? NL + errs.join(NL) : 'لا شيء'));
console.log(NL + 'سجلّ الطرفيّة: ' + (logs.length ? NL + logs.slice(0, 6).join(NL) : 'لا شيء'));
await p.screenshot({ path: 'C:/Users/abdul/AppData/Local/Temp/claude/c--Projects-new-mafia/3057e8a1-c34a-4eed-9a78-7b5a70f0bf6b/scratchpad/wk.png' });
await b.close();
