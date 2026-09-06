// 🧪 ترشيحُ أعمدة صفحة اللاعبين — المنطقُ لا المظهر
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
].map(x => ({ xp: 0, level: 1, rankTier: 'INFORMANT', rankRR: 0, wins: 0, createdAt: new Date(now - 200 * DAY), ...x }));

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
await p.waitForSelector('table', { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(1800);

/** أسماءُ الصفوف المعروضة */
const rows = () => p.evaluate(() =>
  [...document.querySelectorAll('tbody tr')]
    .map(tr => (tr.querySelector('td')?.textContent || '').trim())
    .filter(Boolean));

/** يفتح قائمةَ عمودٍ ويُرجع خياراتِها مع أعدادها */
const openMenu = async (label) => {
  await p.evaluate(l => {
    const th = [...document.querySelectorAll('th')].find(x => x.textContent.includes(l));
    th?.querySelector('button')?.click();
  }, label);
  await p.waitForTimeout(350);
  return p.evaluate(() =>
    [...document.querySelectorAll('[data-colfilter] button')]
      .map(x => (x.textContent || '').trim())
      .filter(t => t && t !== '▼' && !t.startsWith('إلغاء')));
};

const pick = async (text) => {
  await p.evaluate(t => {
    const el = [...document.querySelectorAll('[data-colfilter] button')]
      .find(x => (x.textContent || '').includes(t));
    el?.click();
  }, text);
  await p.waitForTimeout(450);
};

console.log(NL + '🧪 الحالةُ الابتدائيّة');
let r = await rows();
ok('كلُّ الصفوف الثمانية', r.length === 8);

console.log(NL + '🧪 عمودُ «آخر نشاط» — الدلاءُ الخمسة');
let opts = await openMenu('آخر نشاط');
console.log('   ' + JSON.stringify(opts));
ok('خمسةُ خيارات', opts.length === 5);
ok('«نشط» عددُه ٣', /نشط.*٧.*3$/.test(opts[0]) || opts[0].endsWith('3'));
ok('«لعب ولم يفتح» عددُه ٢', opts[3].endsWith('2'));
ok('«غير مستعمَل» عددُه ١', opts[4].endsWith('1'));

await pick('نشط — آخر');
r = await rows();
console.log('   بعد الترشيح: ' + JSON.stringify(r));
ok('ثلاثةُ صفوفٍ نشطة', r.length === 3);
ok('ولا يظهر «قديم»', !r.some(x => x.includes('قديم')));

console.log(NL + '🧪 الجمعُ «و» لا «أو»');
opts = await openMenu('الإجراءات');
await pick('🏷️ مجّاني');
r = await rows();
console.log('   نشط + مجّاني: ' + JSON.stringify(r));
ok('التقاطعُ صفّان فقط', r.length === 2);
ok('«نشط مجاني» موجود', r.some(x => x.includes('نشط مجاني')));
ok('«اختبار نشط» موجود (مجّانيٌّ أيضاً)', r.some(x => x.includes('اختبار نشط')));
ok('«نشط مدفوع» غائب', !r.some(x => x.includes('مدفوع')));

console.log(NL + '🧪 العدّاداتُ تستثني عمودَها');
// مع «نشط» و«مجّاني» مفعّلَين: قائمةُ النشاط يجب أن تعدّ على «مجّاني» فقط
opts = await openMenu('آخر نشاط');
console.log('   ' + JSON.stringify(opts));
ok('«نشط» ما زال ٢ (لا ٠)', opts[0].endsWith('2'));
ok('و«خلال ٣٠ يوماً» ١ — خيارٌ ما زال متاحاً', opts[1].endsWith('1'));
await p.keyboard.press('Escape');

console.log(NL + '🧪 «لا» ليست مجرّدَ نفيٍ بصريّ');
await p.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('امسح الكلّ'));
  el?.click();
});
await p.waitForTimeout(400);
await openMenu('الإجراءات');
await pick('🏷️ غير مجّاني');
r = await rows();
console.log('   غير مجّاني: ' + JSON.stringify(r));
ok('خمسةُ صفوفٍ غير مجّانيّة', r.length === 5);
ok('ولا مجّانيَّ بينها', !r.some(x => x.includes('مجاني')));

console.log(NL + '🧪 شريطُ المرشِّحات وإلغاؤه');
const bar = await p.evaluate(() => document.body.innerText.includes('مرشَّح:'));
ok('الشريطُ يظهر', bar);
await p.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('امسح الكلّ'));
  el?.click();
});
await p.waitForTimeout(400);
r = await rows();
ok('المسحُ يعيد الثمانية', r.length === 8);

console.log(NL + 'أخطاءُ الصفحة: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'لا شيء ✅'));
console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
await b.close();
process.exit(fail === 0 ? 0 : 1);
