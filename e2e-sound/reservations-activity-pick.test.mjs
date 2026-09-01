// ══════════════════════════════════════════════════════
// 🧪 اختيارُ الفعاليّة في صفحة متابعة الحجوزات — اختبارُ انحدار
//
// العطبُ الذي يحرسه: حالةُ الفعاليّة تصير `completed` عند موعد بدئها، وقائمةُ
// الاختيار تُظهر المنتهيةَ إن كانت لها حجوزات — وكانت تستنتج ذلك من الصفوف
// المحمَّلة. فلمّا صار الجلبُ مقيَّداً بالفعاليّة المختارة، صارت حلقةً مفرغة:
// فعاليّةُ الليلة لا تظهر لأنّ حجوزاتها لم تُجلب، ولا تُجلب لأنّها لا تظهر.
// وكان الاختيارُ التلقائيّ يشترط planned|active فيقفز إلى الأسبوع القادم.
//
// التشغيل:  node reservations-activity-pick.test.mjs [العنوان]
// ══════════════════════════════════════════════════════
import { chromium } from 'playwright';
const NL = String.fromCharCode(10);
const BASE = process.argv[2] || 'http://localhost:3199';
const today = new Date().toISOString().slice(0, 10);
const plus = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

// حالةُ الإنتاج حرفيّاً: فعاليّةُ الليلة صارت completed، وبعدها ملغاةٌ ومخطَّطة
const ACTS = [
  { id: 225, name: 'مزاج افندينا — الأمس', date: plus(-2) + 'T16:00:00.000Z', status: 'completed', locationId: 1 },
  { id: 226, name: 'مزاج افندينا — الليلة', date: today + 'T16:00:00.000Z', status: 'completed', locationId: 1 },
  { id: 227, name: 'ملغاة', date: plus(2) + 'T04:00:00.000Z', status: 'cancelled', locationId: 1 },
  { id: 228, name: 'مزاج افندينا — بعد يومين', date: plus(2) + 'T16:00:00.000Z', status: 'planned', locationId: 1 },
  { id: 229, name: 'منتهيةٌ بلا حجوزات', date: plus(-5) + 'T16:00:00.000Z', status: 'completed', locationId: 1 },
];
const SUMMARY = [{ activityId: 225, count: 12 }, { activityId: 226, count: 26 }, { activityId: 228, count: 3 }];
const mkRows = actId => Array.from({ length: 3 }, (_, i) => ({
  id: actId * 10 + i, activityId: actId, contactName: 'ضيف ' + actId + '-' + (i + 1),
  contactMethod: '', phone: '079000000' + i, peopleCount: 1, playerId: null, status: 'confirmed',
  appConfirmed: false, appConfirmedAt: null, attended: null, notes: '', remindOptIn: true,
  waSentAt: null, waSentBy: null, createdBy: 's', createdAt: today, deletedAt: null,
}));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  localStorage.setItem('token', 'f');
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'موظّف', role: 'admin' }));
});
// مُوجِّهٌ واحد — أنماطُ الجلوب هشّةٌ هنا، والتفريعُ بالنصّ لا يُخطئ
await ctx.route('**/api/**', r => {
  const u = r.request().url();
  const j = d => r.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
  if (u.includes('/api/reservations/activity-summary')) return j(SUMMARY);
  if (u.includes('/api/reservations')) {
    const m = u.match(/activityId=(\d+)/);
    return j(m ? mkRows(Number(m[1])) : []);
  }
  if (u.includes('/api/activities')) return j(ACTS);
  if (u.includes('/api/locations')) return j([]);
  return j({ count: 0, players: [] });
});

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
await p.goto(BASE + '/admin/reservations', { waitUntil: 'networkidle', timeout: 90000 });

await p.waitForTimeout(3000);

const sel = await p.evaluate(() => {
  const s = document.querySelector('select');
  return s ? { value: s.value, opts: [...s.options].map(o => o.value + '|' + o.textContent) } : null;
});
console.log(NL + '🧪 قائمةُ الاختيار');
console.log('   ' + JSON.stringify(sel, null, 0));
ok('فعاليّةُ الليلة (٢٢٦) في القائمة رغم أنّها منتهية', !!sel && sel.opts.some(o => o.startsWith('226|')));
ok('والمنتهيةُ ذاتُ الحجوزات (٢٢٥) كذلك', !!sel && sel.opts.some(o => o.startsWith('225|')));
ok('والمخطَّطة (٢٢٨)', !!sel && sel.opts.some(o => o.startsWith('228|')));
ok('الملغاةُ (٢٢٧) مستبعدة', !!sel && !sel.opts.some(o => o.startsWith('227|')));
ok('والمنتهيةُ بلا حجوزات (٢٢٩) مستبعدة', !!sel && !sel.opts.some(o => o.startsWith('229|')));

console.log(NL + '🧪 الاختيارُ التلقائيّ');
ok('يقع على فعاليّة الليلة لا على القادمة', sel?.value === '226');
const body = await p.evaluate(() => document.body.innerText);
ok('وحجوزاتُها معروضة', body.includes('ضيف 226-1'));

console.log(NL + 'أخطاءُ الطرفيّة: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'لا شيء ✅'));
console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
await b.close();
process.exit(fail === 0 ? 0 : 1);
