// 🧪 بطاقةُ اللاعب — «بابٌ بمفتاح»
//
// 🔴 يُختبر أنّ القاعدةَ الحاكمة محفوظةٌ في الرسم: لا سببَ منعٍ بلا مفتاح،
//    ولا رتبةَ ولا مستوىً ولا نسبةَ فوزٍ في الصفحة كلِّها.
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3199';
const NL = String.fromCharCode(10);

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  ← ' + extra : '')); }
};

const CARD = (over = {}) => ({
  success: true, verdict: 'OK', viewerRole: 'admin',
  identity: {
    id: 19, name: 'خالد المصري', avatarUrl: null, gender: 'MALE', age: 20,
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

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('token', 'f');
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'م', role: 'admin' }));
});

let payload = CARD();
await ctx.route('**/api/**', r => {
  const j = d => r.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
  if (r.request().url().includes('/card')) return j(payload);
  return j({ success: true });
});

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

const open = async () => {
  await p.goto(BASE + '/admin/players/19', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  await p.waitForFunction(() => document.body.innerText.length > 200, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(500);
  return p.evaluate(() => document.body.innerText);
};

console.log(NL + '🧪 الحالةُ النظيفة: أخضرُ بلا زرّ');
{
  const t = await open();
  ok('شريطُ الحكم يقول «يدخل»', t.includes('يدخل'));
  ok('ولا يعرض زرَّ علاجٍ بلا داعٍ', !t.includes('أعفِه من السياج') || t.indexOf('أعفِه من السياج') > t.indexOf('إجراءات'));
  ok('الهويّةُ مع المعرّف', t.includes('#١٩'), 'الاسمُ وحدَه معرِّفٌ كاذب');
  ok('وشارةُ كلمة السرّ الافتراضيّة', t.includes('١٢٣٤'));
  ok('وبلاطةُ المال تعرض الدَّين', t.includes('٣٫٠٠ د.أ') || t.includes('د.أ'));
}

console.log(NL + '🧪 العناصرُ الجديدة');
{
  const t = await open();
  ok('بلاطةُ الحجز تحلّ محلَّ المقعد', t.includes('محجوز'), 'السؤالُ الأوّل عند الباب');
  ok('وتقول إنّه لم يدفع', t.includes('لم يدفع'));
  ok('والمقعدُ نُقل إلى الإجلاس', t.includes('مقعد ٢٠') && t.indexOf('مقعد ٢٠') > t.indexOf('حدُّ الطيّة'));
  ok('رصيدُ التشبس يُسمّى رقاقةً لا ديناراً', t.includes('٤٥٠') && t.includes('رقاقة'));
  ok('ويُقال صراحةً إنّه ليس مالاً', t.includes('ليست ديناراً'));
  ok('وآخرُ تقييمٍ كتبه يظهر', t.includes('٤') && t.includes('آخرُ تقييم'));
  ok('بنصّه', t.includes('الليدر كان ممتازاً'));
}

console.log(NL + '🧪 من لا حجزَ له');
{
  payload = CARD({ booking: null, feedback: null });
  const t = await open();
  ok('يُقال «لا حجز»', t.includes('لا حجز') || t.includes('لا فعاليّة'));
  ok('ولا قسمَ تقييمٍ فارغ', !t.includes('آخرُ تقييمٍ كتبه'));
  payload = CARD();
}

console.log(NL + '🧪 القرارُ المقفل: لا رتبةَ ولا مستوىً ولا نسبةَ فوز');
{
  const t = await open();
  for (const w of ['المُخبر', 'الأب الروحي', 'الكابو', 'المستوى', 'نسبة الفوز', 'XP', 'نقاط التصنيف'])
    ok(`لا «${w}»`, !t.includes(w));
}

console.log(NL + '🧪 القفل: سببٌ ومفتاح');
{
  payload = CARD({ verdict: 'LOCKED', lock: { isLocked: true, lockedAt: '2026-09-01', reason: 'احتيال', byUsername: 'omar', attempts: 10, attemptsWithCorrectPassword: 10 } });
  const t = await open();
  ok('الشريطُ يقول مقفول', t.includes('مقفول'));
  ok('ومعه مفتاحُه', t.includes('فكّ القفل'));
  ok('والسببُ ظاهرٌ للأدمن', t.includes('احتيال'));
  ok('ومَن أصدره', t.includes('omar'));
  ok('و«صاحبُ الحساب يستنجد»', t.includes('يستنجد'), 'محاولاتٌ بكلمةِ سرٍّ صحيحة');
}

console.log(NL + '🧪 قفلٌ بلا سبب: يُقال الفراغُ صراحةً');
{
  payload = CARD({ verdict: 'LOCKED', lock: { isLocked: true, lockedAt: '2026-09-01', reason: null, byUsername: null, attempts: 0, attemptsWithCorrectPassword: 0 } });
  const t = await open();
  ok('يُكتب «بلا سببٍ مكتوب»', t.includes('بلا سببٍ مكتوب'), 'الفراغُ يوحي بوجود سبب');
}

console.log(NL + '🧪 الموقع: المفتاحُ يتبع نوعَ العطل');
{
  payload = CARD({ verdict: 'GEO', geo: { exempt: false, recentFailures: [{ result: 'LOCATION_REQUIRED' }, { result: 'LOCATION_REQUIRED' }], dominant: 'LOCATION_REQUIRED' } });
  let t = await open();
  ok('«لا يُعطي قراءةَ موقع» ⇒ مفتاحُه الإعفاء', t.includes('لا يُعطي قراءة') && t.includes('أعفِه من السياج'));

  // 🔴 «بعيد» مفتاحُه ليس الإعفاء — الإعفاءُ يعالج عجزَ الجهاز لا البُعد.
  payload = CARD({ verdict: 'GEO', geo: { exempt: false, recentFailures: [{ result: 'TOO_FAR' }], dominant: 'TOO_FAR' } });
  t = await open();
  ok('«بعيد» يُعرض', t.includes('بعيداً'));
  const bar = await p.evaluate(() => document.querySelector('.bg-amber-600')?.textContent || '');
  ok('ولا يُعرض له زرُّ إعفاءٍ في الشريط', !bar.includes('أعفِه'), bar.slice(0, 60));
}

console.log(NL + '🧪 من لم يلعب قطّ: تُقرأ البطاقةُ بلا كذب');
{
  payload = CARD({
    identity: { ...CARD().identity, lifetimeMatches: 0, seasonMatches: 0 },
    rhythm: { lastNight: null, daysSince: null, rhythmDays: null, totalNights: 0 },
    lastMatches: [],
  });
  const t = await open();
  ok('يُقال «لم يحضر ليلةً بعدُ»', t.includes('لم يحضر ليلةً بعد'));
  ok('ولا بطاقاتِ أصفار', !t.includes('آخرُ ثلاث مباريات'));
}

console.log(NL + '🧪 المدير: لا يرى الهاتفَ ولا سببَ القفل');
{
  payload = CARD({ viewerRole: 'manager', identity: { ...CARD().identity, phone: undefined, phoneTail: '4567', dob: undefined } });
  const t = await open();
  ok('لا رقمَ كاملاً', !t.includes('0791234567'));
  ok('بل آخرُ أربعِ خانات', t.includes('4567'));
  ok('ولا أزرارَ إجراءاتٍ إداريّة', !t.includes('اقفل الحساب'));
}

console.log(NL + 'أخطاءُ الصفحة: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'لا شيء ✅'));
console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
await b.close();
process.exit(fail === 0 ? 0 : 1);
