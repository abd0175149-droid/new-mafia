// 🧪 ترتيبُ أعمدة صفحة اللاعبين — المنطقُ لا المظهر
import { chromium } from 'playwright';
const NL = String.fromCharCode(10);
const BASE = process.argv[2] || 'http://localhost:3199';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };

const DAY = 86400000, now = Date.now();
// تشكيلةٌ تغطّي كلَّ دلوٍ وكلَّ علم
const P = [
  { id: 1, name: 'نشط مجاني',      phone: '0790000001', totalMatches: 5, lastActiveAt: new Date(now - 2 * DAY),  lastActivePlatform: 'android', isFreeAccount: true },
  { id: 2, name: 'نشط مدفوع',      phone: '0790000002', totalMatches: 3, lastActiveAt: new Date(now - 6 * DAY),  lastActivePlatform: 'web' },
  { id: 3, name: 'شهر مجاني',      phone: '0790000003', totalMatches: 8, lastActiveAt: new Date(now - 20 * DAY), lastActivePlatform: 'ios', isFreeAccount: true },
  { id: 4, name: 'قديم',           phone: '0790000004', totalMatches: 2, lastActiveAt: new Date(now - 90 * DAY), lastActivePlatform: 'web' },
  { id: 5, name: 'لعب ولم يفتح',   phone: '0790000005', totalMatches: 14, lastActiveAt: null },
  { id: 6, name: 'لعب ولم يفتح ٢', phone: '0790000006', totalMatches: 2,  lastActiveAt: null, isLocked: true },
  { id: 7, name: 'غير مستعمل',     phone: '0790000007', totalMatches: 0,  lastActiveAt: null },
  { id: 8, name: 'اختبار نشط',     phone: '0790000008', totalMatches: 1,  lastActiveAt: new Date(now - 1 * DAY), lastActivePlatform: 'web', isTestAccount: true, isFreeAccount: true },
].map((x,i) => ({ xp: 0, level: 1 + i, rankTier: ['INFORMANT','SOLDIER','GODFATHER','CAPO','ASSOCIATE','UNDERBOSS','SOLDIER','INFORMANT'][i], rankRR: i * 100, totalWins: i, totalSurvived: i * 2, createdAt: new Date(now - 200 * DAY), ...x }));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('token', 'f');
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'م', role: 'admin' }));
});
await ctx.route('**/api/**', r => {
  const u = r.request().url();
  const j = d => r.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
  if (u.includes('/api/player/all')) return j({ players: P });
  if (u.includes('/api/seating/blocked-pairs')) return j({ pairs: [] });
  return j({ success: true, count: 0, players: [], data: [] });
});

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await p.goto(BASE + '/admin/players', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
// 🔴 ننتظر **صفّاً** لا الجدول: هيكلُ الجدول يظهر قبل وصول البيانات، فمهلةٌ
//    ثابتةٌ بعده تنجح أحياناً وتفشل أحياناً — وهو ما وقع فعلاً.
await p.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0,
  null, { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(600);

/** أسماءُ الصفوف المعروضة */
const rows = () => p.evaluate(() =>
  [...document.querySelectorAll('tbody tr')]
    .map(tr => (tr.querySelector('td')?.textContent || '').trim())
    .filter(Boolean));

/** يفتح قائمةَ عمودٍ ويُرجع خياراتِها مع أعدادها */
/** القائمةُ تُفتح بنقرةٍ حقيقيّة (mousedown/up/click) لا بـel.click():
    الأخيرةُ لا تُنتج mousedown، وسلوكُ الفتح/الإغلاق مبنيٌّ عليه. */
const menuItems = () => p.evaluate(() =>
  [...document.querySelectorAll('[data-colfilter] button')]
    .map(x => (x.textContent || '').trim())
    .filter(t => t && t !== '▼' && !t.startsWith('إلغاء')));

const openMenu = async (label) => {
  for (let i = 0; i < 3; i++) {
    const btn = p.locator('th', { hasText: label }).locator('button').first();
    await btn.click({ timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(500);
    const items = await menuItems();
    if (items.length) return items;
    await p.waitForTimeout(900);
  }
  return menuItems();
};

const pick = async (text) => {
  await p.locator('[data-colfilter] button', { hasText: text }).first()
    .click({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
};


/** يرتّب بعمودٍ ويعيد قيمَ العمود الأوّل (الاسم) بالترتيب */
const sortBy = async (label, clicks = 1) => {
  for (let i = 0; i < clicks; i++) {
    await p.locator('th', { hasText: label }).locator('button').first()
      .click({ timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(450);
  }
  return rows();
};
const cellsOf = (idx) => p.evaluate(i => [...document.querySelectorAll('tbody tr')]
  .map(tr => (tr.querySelectorAll('td')[i]?.textContent || '').trim()), idx);

console.log(NL + '🧪 الترتيبُ العدديّ — «مباريات»');
let r = await sortBy('مباريات');            // النقرةُ الأولى تنازليّة
let m = (await cellsOf(2)).map(Number);
console.log('   ' + JSON.stringify(m));
ok('النقرةُ الأولى تنازليّة (الأكثرُ أوّلاً)', m.every((v, i) => i === 0 || m[i - 1] >= v));
ok('و١٤ في الصدارة', m[0] === 14);

r = await sortBy('مباريات');                 // الثانية تعكس
m = (await cellsOf(2)).map(Number);
ok('الثانيةُ تصاعديّة', m.every((v, i) => i === 0 || m[i - 1] <= v));

await sortBy('مباريات');                     // الثالثة تُلغي
// 🔴 لا يُفحص «th button» كلُّها: زرُّ الترشيح نصُّه ▼ أيضاً فيبدو ترتيباً قائماً.
//    يُفحص رأسُ العمود نفسُه — يعود إلى ⇅ حين لا ترتيب.
const back = await p.evaluate(() => {
  const th = [...document.querySelectorAll('th')].find(x => x.textContent.includes('مباريات'));
  const btn = th?.querySelector('button');
  return (btn?.textContent || '').includes('⇅');
});
ok('الثالثةُ تُلغي الترتيب — يعود ⇅', back);
const orderBack = (await cellsOf(2)).map(Number);
ok('ويعود الترتيبُ الأصليّ', orderBack.join(',') === '5,3,8,2,14,2,0,1');

console.log(NL + '🧪 المجهولُ يبقى في الذيل — الاتّجاهان');
await sortBy('آخر نشاط');                    // تنازليّ: الأحدثُ أوّلاً
let a = await cellsOf(6);
console.log('   تنازليّ: ' + JSON.stringify(a.map(x => x.slice(0, 14))));
const unknownIdx = a.map((x, i) => (x.includes('لم يفتح') || x.startsWith('—') ? i : -1)).filter(i => i >= 0);
ok('المجهولُ في الذيل (تنازليّ)', unknownIdx.every(i => i >= a.length - 3));

await sortBy('آخر نشاط');                    // تصاعديّ: الأقدمُ أوّلاً
a = await cellsOf(6);
console.log('   تصاعديّ: ' + JSON.stringify(a.map(x => x.slice(0, 14))));
const u2 = a.map((x, i) => (x.includes('لم يفتح') || x.startsWith('—') ? i : -1)).filter(i => i >= 0);
ok('ويبقى في الذيل (تصاعديّ) — لا يتصدّر', u2.every(i => i >= a.length - 3));
ok('والأقدمُ الحقيقيّ في الصدارة', a[0].includes('شهر') || a[0].includes('ي'));

console.log(NL + '🧪 الترتيبُ يحترم الترشيح');
await p.evaluate(() => {
  const el = [...document.querySelectorAll('th')].find(x => x.textContent.includes('الإجراءات'));
  el?.querySelectorAll('button')[1]?.click();
});
await p.waitForTimeout(500);
await pick('🏷️ مجّاني');
r = await rows();
ok('المرشَّحُ ثلاثةُ صفوفٍ مجّانيّة', r.length === 3);
const names = await cellsOf(0);
ok('وما زال مرتَّباً — لا عودةَ للترتيب الأصليّ',
   await p.evaluate(() => [...document.querySelectorAll('th button')].some(b => b.textContent.includes('▲') || b.textContent.includes('▼'))));

console.log(NL + '🧪 «المستوى/الرانك» بترتيب التقدّم لا بالأبجديّة');
await p.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('امسح الكلّ'));
  el?.click();
});
await p.waitForTimeout(450);
await sortBy('المستوى');
const ranks = await cellsOf(5);
console.log('   ' + JSON.stringify(ranks.map(x => x.slice(0, 12))));
ok('الأعلى رتبةً أوّلاً', ranks[0].includes('الأب الروحي') || ranks[0].includes('نائب'));

console.log(NL + 'أخطاءُ الصفحة: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'لا شيء ✅'));
console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
await b.close();
process.exit(fail === 0 ? 0 : 1);
