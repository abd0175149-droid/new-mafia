// 🧪 تبويبُ الموقع — الخريطةُ وسجلُّ المكوث
//
// 🔴 البياناتُ حقيقيّةٌ من الإنتاج (١٤٦ نقطةً للاعب ٢٢٦): الفخُّ الذي يقتل هذه
//    الشاشةَ ليس خطأً في الرسم بل بياناً لم يُتوقَّع — أربعون نقطةً فوق بعضها
//    تُقرأ أربعين زيارة. فالاختبارُ يُطعَم ما تُطعَمه الشاشةُ فعلاً.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = process.argv[2] || 'https://club-mafia.grade.sbs';
const FIX = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const NL = String.fromCharCode(10);

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('  ✅ ' + n))
                            : (fail++, console.log('  ❌ ' + n + (x ? '  ← ' + x : ''))); };

const CARD = (over = {}) => ({
  success: true, verdict: 'OK', viewerRole: 'admin',
  identity: {
    id: 226, name: 'ابو عوض', avatarUrl: null, gender: 'MALE', age: 20,
    isMinor: false, createdAt: '2026-04-01', isTestAccount: false, isFreeAccount: true,
    mustChangePassword: true, linkedStaffId: null, phone: '0791234567',
    lifetimeMatches: 87, seasonMatches: 4, chipsBalance: 450,
  },
  lock: { isLocked: false, lockedAt: null },
  geo: { exempt: false, exemptReason: null, recentFailures: [], dominant: null },
  money: { since: '2026-09-01', amount: 3, bookings: 1 },
  reach: { hasPush: true, platform: 'web' },
  seat: { pinned: 20, blocked: [{ id: 207, name: 'سيف', reason: 'شكوى تشويش' }] },
  booking: { activityId: 5, name: 'ليلة الخميس', date: '2026-09-11', isPaid: false, isFree: false, checkedIn: false, seats: 1 },
  feedback: { overall: 4, notes: 'الليدر كان ممتازاً', at: '2026-09-06' },
  rhythm: { lastNight: '2026-09-06', daysSince: 2, rhythmDays: 3, totalNights: 12 },
  lastMatches: [
    { role: 'WITCH', team: 'MAFIA', won: true, survived: false, at: '2026-09-06' },
    { role: 'CITIZEN', team: 'CITIZEN', won: false, survived: true, at: '2026-09-04' },
  ],
  ...over,
});

const VENUES = [
  { id: 2, name: 'مزاج افندينا', lat: 31.973214, lng: 35.884012, radiusM: 240 },
  { id: 3, name: 'Test Location', lat: 32.073106, lng: 36.075305, radiusM: 260 },
];

const b = await chromium.launch();
// 🔴 عاملُ الخدمة يُحجب: يخدم نسخةً مخبّأةً فيُختبر بناءٌ قديمٌ ونحن نظنّه الجديد.
const ctx = await b.newContext({ viewport: { width: 430, height: 940 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  localStorage.setItem('token', 'f');
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'م', role: 'admin' }));
});

await ctx.route('**/api/**', r => {
  const j = d => r.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
  const u = r.request().url();
  if (u.includes('/section/geo')) return j({ success: true, key: 'geo',
    reliability: { nights: 12, badNights: 1, checks: 40 },
    worstStorm: null, lastFail: null, exempt: null,
    lastFix: { accuracyM: FIX[0].accuracyM, isMocked: false, source: 'web',
      capturedAt: new Date(FIX[0].at).toISOString(), lat: FIX[0].lat, lng: FIX[0].lng },
    trailPoints: 146, trailFrom: new Date(FIX[FIX.length - 1].at).toISOString(),
    trailTo: new Date(FIX[0].at).toISOString(),
    fixes: FIX, venues: VENUES, tonight: null });
  if (u.includes('/card')) return j(CARD());
  // 🔴 كلُّ ما عدا ذلك يمرّ إلى الخادم الحقيقيّ: ردٌّ مُختلَقٌ على مسارٍ
  //    لا نعرف شكلَه يُسقط الشجرةَ كلَّها فتبدو الصفحةُ فارغةً بلا خطأ.
  return r.continue();
});

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { const t = m.text();
  if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push('console: ' + t.slice(0, 200)); });
await p.goto(BASE + '/admin/players/226', { waitUntil: 'networkidle', timeout: 45000 });
try {
  await p.waitForSelector('text=ابو عوض', { timeout: 25000 });
} catch (e) {
  console.log('النصّ:', (await p.textContent('body')).replace(/\s+/g, ' ').slice(0, 500));
  console.log('أخطاء:', errs.slice(0, 3));
  await p.screenshot({ path: 'geo-fail.png', fullPage: true });
  throw e;
}

// افتح تبويبَ الموقع
await p.click('text=الموقع');
await p.waitForSelector('text=/مسارُ مواقعه/', { timeout: 20000 });
await p.waitForSelector('canvas', { timeout: 25000 });
await p.waitForTimeout(6000);
const txt = () => p.evaluate(() => document.body.innerText);

console.log(NL + '── الخريطةُ والمسار ──');
let t = await txt();
ok('عنوانُ المسار يذكر السقفَ والمجموع', /مسارُ مواقعه — ١٤٦ من ١٤٦ نقطة/.test(t), t.match(/مسارُ مواقعه[^<]{0,40}/)?.[0]);
await p.waitForSelector('canvas', { timeout: 25000 });
ok('لوحةُ الخريطة رُسمت', await p.locator('canvas').count() > 0);
const box = await p.locator('canvas').first().boundingBox();
ok('للخريطة ارتفاعٌ حقيقيّ (لا صفر)', box && box.height > 200, box && String(box.height));

console.log(NL + '── سجلُّ المكوث ──');
ok('يظهر عنوانُ «أينَ مكث»', /أينَ مكث/.test(t));
ok('اسمُ المكان يُقرأ لا الإحداثيّات', t.includes('مزاج افندينا'), 'لم يُطابَق أيُّ مكان');
ok('يوجد مكوثٌ بمُدّة (ساعة/دقيقة)', /مكث [٠-٩]+ (ساعة|س و[٠-٩]+ د|دقيقة)/.test(t),
   t.match(/مكث [^·]{0,20}/)?.[0]);
ok('عددُ القراءات معروضٌ بالعربيّة', /[٠-٩]+ قراءة/.test(t));
// 🔴 التجميعُ هو كلُّ الفكرة: ١٤٦ نقطةً يجب أن تنهارَ إلى مكوثٍ معدود.
const m = t.match(/أينَ مكث — ([٠-٩]+) مكوثاً/);
const nStays = m ? +m[1].replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))) : -1;
ok('١٤٦ نقطةً انهارت إلى مكوثٍ معدود', nStays > 1 && nStays < 40, 'مكوث: ' + nStays);
ok('لا يُعرض إلّا ثمانيةٌ مع ذكرِ الباقي', /و[٠-٩]+ مكوثاً أقدم/.test(t) || nStays <= 8);

console.log(NL + '── الأرقامُ عربيّةٌ في كلّ سطر ──');
// 🔴 «مكث 4 س و37 د» بين «٦٠ قراءة»: الرقمُ اللاتينيُّ يقفز كأنّه شيءٌ آخر.
const geoTxt = t.slice(t.indexOf('مسارُ مواقعه'));
const latin = (geoTxt.split(NL).filter(l => /(?:مكث|كم|قراءة|قبل)/.test(l) && /[0-9]/.test(l)));
ok('لا رقمَ لاتينيّاً في المسار والمكوث', latin.length === 0, latin.slice(0, 3).join(' | '));

console.log(NL + '── تفصيلُ النقطة ──');
// اضغط أوّلَ نقطةٍ على الخريطة عبر عنصرِها
const marker = p.locator('.maplibregl-marker').first();
const hasMarkers = await p.locator('.maplibregl-marker').count();
ok('نقاطُ المسار موضوعةٌ على الخريطة', hasMarkers > 1, 'علامات: ' + hasMarkers);
if (hasMarkers) {
  await marker.click({ force: true });
  await p.waitForTimeout(400);
  t = await txt();
  ok('الضغطُ يفتح تفصيلَ النقطة', /أقربُ مكان|دقّةُ القراءة/.test(t));
  ok('المصدرُ مُترجَمٌ لا خام', !/المصدر: web/.test(t), 'ظهر «web» خاماً');
}

console.log(NL + '── الخريطةُ تُطوّق لا تُوسّط ──');
// 🔴 المسارُ يمتدّ ١٨ كم بين الرابية والزرقاء: خريطةٌ مركَّزةٌ على أحدثِ نقطةٍ
//    تُخفي معظمَه، فتقول «كان هنا» عن مسارٍ يقول «كان هنا وهناك».
const bounds = await p.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? { w: c.clientWidth, h: c.clientHeight } : null;
});
const markersIn = await p.evaluate(() => {
  const box = document.querySelector('canvas').getBoundingClientRect();
  const ms = [...document.querySelectorAll('.maplibregl-marker')];
  return ms.filter(m => { const r = m.getBoundingClientRect();
    return r.left >= box.left - 4 && r.right <= box.right + 4
        && r.top >= box.top - 4 && r.bottom <= box.bottom + 4; }).length;
});
const markersAll = await p.locator('.maplibregl-marker').count();
{ const cb = await p.locator('canvas').first().boundingBox();
  await p.screenshot({ path: 'geo-map.png', clip: cb }); }
const over = await p.evaluate(() => {
  const box = document.querySelector('canvas').getBoundingClientRect();
  return [...document.querySelectorAll('.maplibregl-marker')].map(m => {
    const r = m.getBoundingClientRect();
    return Math.max(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom);
  }).filter(d => d > 4).sort((a, b) => b - a).slice(0, 5).map(d => Math.round(d));
});
if (over.length) console.log('     تجاوزٌ بالبكسل:', over.join(', '));
ok('كلُّ نقاط المسار داخلَ الإطار', markersIn === markersAll, markersIn + '/' + markersAll);

console.log(NL + '── الضغطُ على مكوثٍ يطير إليه ──');
const before = await p.evaluate(() => document.querySelectorAll('.maplibregl-marker').length);
await p.locator('button:has-text("مزاج افندينا")').first().click();
await p.waitForTimeout(900);
const after = await p.evaluate(() => document.querySelectorAll('.maplibregl-marker').length);
ok('الصفُّ قابلٌ للضغط والخريطةُ تبقى حيّة', after === before, before + ' → ' + after);

console.log(NL + '── ما يجب ألّا يظهر ──');
t = await txt();
ok('لا إحداثيّاتٌ خامٌ في النصّ', !/31\.97\d{4}/.test(t), t.match(/31\.97\d{4}/)?.[0]);
ok('لا NaN ولا undefined', !/NaN|undefined/.test(t), t.match(/NaN|undefined/)?.[0]);
ok('لا أخطاءَ في الصفحة', errs.length === 0, errs[0]);

await p.screenshot({ path: 'geo-trail.png', fullPage: true });
await b.close();
console.log(NL + '═══ ' + pass + ' ✅ · ' + fail + ' ❌ ═══');
process.exit(fail ? 1 : 0);
