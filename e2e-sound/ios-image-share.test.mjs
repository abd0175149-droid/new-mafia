// ══════════════════════════════════════════════════════
// 🧪 حفظُ التقرير المصوَّر صورتين على iOS — اختبارُ انحدار
//
// العطبُ الذي يحرسه: كانت كلُّ صورةٍ تُحفظ بنداءٍ مستقلٍّ لـnavigator.share.
// وiOS يشترط لها **إيماءةَ مستخدمٍ حيّة**، والضغطةُ الواحدة تستهلكها الورقةُ
// الأولى — فيُرفض نداءُ الثانية بـAbortError، وهو نفسُ خطأ «أغلق المستخدمُ
// الورقة»، فيُقرأ إلغاءً ويُبتلع صامتاً: تُحفظ صورةٌ وتختفي الأخرى بلا رسالة.
//
// المحاكاةُ هنا تُقلّد ذلك بالضبط: إيماءةٌ واحدةٌ تُستهلك بأوّل share.
// ✅ مع الإصلاح: ورقةٌ واحدةٌ تحمل الملفَّين · ٠ رفض
// ❌ قبله (مُتحقَّقٌ منه): ملفٌّ واحدٌ · رفضٌ واحد · لا رسالةَ خطأ
//
// التشغيل:  node ios-image-share.test.mjs [مجلّد-اللقطات] [العنوان]
//   يحتاج واجهةً تعمل — محلّيّاً على 3199 أو مرِّرْ عنوانَ الإنتاج.
// ══════════════════════════════════════════════════════
import { chromium } from 'playwright';
const NL = String.fromCharCode(10);
const OUT = process.argv[2] || '.';
const BASE = process.argv[3] || 'http://localhost:3199';

const mk = (n, guest) => Array.from({ length: n }, (_, i) => guest
  ? { name: 'ضيف ' + (i + 1), peopleCount: 1 }
  : { name: 'لاعب ' + (i + 1), avatarUrl: null, rankTier: 'SOLDIER', level: 3, peopleCount: 1 });

const DATA = {
  success: true,
  activity: { id: 226, name: 'مزاج افندينا 1 سبتمبر', date: '2026-09-01T16:00:00.000Z', gameSchedule: [] },
  stats: { total: 22, attended: 0, members: 16, guests: 6 },
  members: mk(16, false),
  guests: mk(6, true),
};

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
});

await ctx.addInitScript(() => {
  localStorage.setItem('token', 'fixture');
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'موظّف', role: 'admin' }));

  const w = window;
  w.__share = { calls: [], aborts: 0 };
  // إيماءةٌ حيّةٌ واحدة تبدأ مع أوّل نقرةٍ حقيقيّة وتُستهلك بأوّل share
  w.__gesture = false;
  document.addEventListener('pointerdown', () => { w.__gesture = true; }, true);
  document.addEventListener('click', () => { w.__gesture = true; }, true);

  navigator.canShare = (d) => !!(d && d.files && d.files.length > 0);
  navigator.share = async (d) => {
    if (!w.__gesture) {
      w.__share.aborts++;
      const e = new Error('The request is not allowed by the user agent');
      e.name = 'AbortError';                 // ← ما يرميه WebKit فعلاً
      throw e;
    }
    w.__gesture = false;                     // ← الورقةُ تستهلك الإيماءة
    w.__share.calls.push((d.files || []).map(f => f.name));
    await new Promise(r => setTimeout(r, 250));   // الورقةُ مفتوحة
  };
});

// ⚠️ Playwright يطابق المسارات بترتيبٍ عكسيّ — فالعامّةُ تُسجَّل أوّلاً
await ctx.route('**/api/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: '{}',
}));
await ctx.route('**/api/reservations/attendance/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(DATA),
}));

const p = await ctx.newPage();
const errs = [], alerts = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
p.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });

await p.goto(BASE + '/print/attendance/226', { waitUntil: 'networkidle', timeout: 90000 });
await p.waitForTimeout(2600);

const people = DATA.members.length + DATA.guests.length;
console.log(NL + '🧪 المعطيات: ' + people + ' شخصاً (> ١٢ ⇒ صورتان)');

const btn = p.locator('button', { hasText: 'حفظ كصورة' });
ok('زرُّ «حفظ كصورة» موجود', await btn.count() > 0);

await btn.first().click();
// التقاطُ صورتين بكثافةٍ عالية يستغرق وقتاً
for (let i = 0; i < 40; i++) {
  const done = await p.evaluate(() => !document.querySelector('button.btn:disabled'));
  if (done && i > 3) break;
  await p.waitForTimeout(1000);
}
await p.waitForTimeout(1200);

const rep = await p.evaluate(() => ({
  calls: window.__share.calls, aborts: window.__share.aborts,
  overlay: !!document.querySelector('div[dir=rtl][style*="2147483000"]'),
}));

console.log(NL + '🧪 النتيجة');
console.log('   نداءاتُ المشاركة: ' + JSON.stringify(rep.calls, null, 0));
console.log('   رفضٌ بلا إيماءة: ' + rep.aborts);
ok('ورقةُ مشاركةٍ واحدةٌ لا اثنتان', rep.calls.length === 1);
ok('تحمل ملفَّين', (rep.calls[0] || []).length === 2);
ok('الأوّلُ «- ١» والثاني «- ٢»',
  (rep.calls[0] || []).some(n => n.includes('١')) && (rep.calls[0] || []).some(n => n.includes('٢')));
ok('لا نداءَ رُفض لانقضاء الإيماءة', rep.aborts === 0);
ok('لا طبقةَ حفظٍ يدويّ (لم تُحتَج)', !rep.overlay);
ok('لا رسالةَ خطأ', alerts.length === 0);

if (alerts.length) console.log('   التنبيهات: ' + alerts.join(' | '));
console.log(NL + 'أخطاءُ الطرفيّة: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'لا شيء ✅'));
await p.screenshot({ path: OUT + '/ios-report.png' });
console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
await b.close();
process.exit(fail === 0 ? 0 : 1);
