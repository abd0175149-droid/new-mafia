// 🧪 اختبار وحدة لتعريف حالة الحجز — بلا قاعدة بيانات
// تشغيل: npx tsx test-reservation-status.ts
import {
  resStatus, isConfirmedStatus, isWaitlistStatus, statusLabelAr,
  WRITABLE_STATUSES, SQL_CONFIRMED,
} from './src/lib/reservation-status.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

console.log('');
console.log('🧪 التعريف الموحّد لحالة الحجز');
check('confirmed ⇒ مثبّت', resStatus('confirmed') === 'confirmed');
check('paid_all (إرث) ⇒ مثبّت', resStatus('paid_all') === 'confirmed');
check('pending ⇒ غير مثبّت', resStatus('pending') === 'pending');
check('waitlist ⇒ قائمة انتظار', resStatus('waitlist') === 'waitlist');
check('حالةٌ مجهولة ⇒ غير مثبّت', resStatus('weird') === 'pending');
check('null ⇒ غير مثبّت', resStatus(null) === 'pending');
check('undefined ⇒ غير مثبّت', resStatus(undefined) === 'pending');

console.log('');
console.log('🧪 قائمةُ الانتظار ليست مثبّتة — العطبُ الأصليّ');
check('waitlist ليست مثبّتة', isConfirmedStatus('waitlist') === false);
check('waitlist يُعرَف كما هو', isWaitlistStatus('waitlist') === true);
check('confirmed ليست انتظاراً', isWaitlistStatus('confirmed') === false);
// 🔴 العطبُ الذي كان: كشفُ PDF واستعلامُ الحضور استعملا `status !== 'pending'`
check('الشرطُ القديم كان يعدّها مثبّتة', ('waitlist' !== 'pending') === true);
check('والجديدُ لا يعدّها', isConfirmedStatus('waitlist') === false);
check('فالتعريفان يختلفان فعلاً', ('waitlist' !== 'pending') !== isConfirmedStatus('waitlist'));

console.log('');
console.log('🧪 أسماءُ الحالات');
check('مثبّت', statusLabelAr('confirmed') === 'مثبّت');
check('paid_all تُسمّى مثبّت', statusLabelAr('paid_all') === 'مثبّت');
check('قائمة انتظار', statusLabelAr('waitlist') === 'قائمة انتظار');
check('غير مثبّت', statusLabelAr('pending') === 'غير مثبّت');

console.log('');
console.log('🧪 ما يُقبل كتابةً');
check('ثلاثُ حالاتٍ لا أكثر', WRITABLE_STATUSES.length === 3);
check('pending مقبولة', WRITABLE_STATUSES.includes('pending'));
check('confirmed مقبولة', WRITABLE_STATUSES.includes('confirmed'));
check('waitlist مقبولة', WRITABLE_STATUSES.includes('waitlist'));
check('paid_all تُقرأ ولا تُكتب', !(WRITABLE_STATUSES as string[]).includes('paid_all'));

console.log('');
console.log('🧪 شرطُ SQL يطابق الدالّة');
check('يشمل confirmed', SQL_CONFIRMED.includes("'confirmed'"));
check('يشمل paid_all', SQL_CONFIRMED.includes("'paid_all'"));
check('لا يشمل waitlist', !SQL_CONFIRMED.includes('waitlist'));
check('لا يشمل pending', !SQL_CONFIRMED.includes("'pending'"));

console.log('');
console.log('🧪 الكودُ لا يُقارن الحالةَ نصّاً خارج المكتبة');
const { readFileSync } = await import('fs');
const routes = readFileSync('./src/routes/reservations.routes.ts', 'utf8');
const roster = readFileSync('./src/reports/definitions/reservation-roster.report.ts', 'utf8');
check('المسارات تستورد التعريف الموحّد', routes.includes("from '../lib/reservation-status.js'"));
check('الكشف يستورد التعريف الموحّد', roster.includes("reservation-status.js"));
check('استعلامُ الحضور لا يستعمل الشرط القديم', !routes.includes("r.status <> 'pending'"));
check('استعلامُ الحضور يستعمل الشرط الصريح', routes.includes("r.status IN ('confirmed','paid_all')"));
// المقارنةُ النصّيّة مسموحةٌ في التعليق وحده — الفحصُ يتجاهل أسطر التعليق
const codeLines = (t: string) => t.split(String.fromCharCode(10))
  .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
  .join(String.fromCharCode(10));
check('الكشف لا يُقارن نصّاً في الكود', !codeLines(roster).includes("status !== 'pending'"));
check('ولا المسارات', !codeLines(routes).includes("=== 'paid_all'"));
check('حالةٌ غير معروفة تُرفض عند الكتابة', routes.includes('WRITABLE_STATUSES.includes'));

console.log('');
console.log(`${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} نجح · ${fail} فشل`);
process.exit(fail === 0 ? 0 : 1);
