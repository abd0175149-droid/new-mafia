// 🧪 اختبار وحدة لمنطق الخصوصيّة — بلا قاعدة بيانات
// تشغيل: npx tsx test-privacy.ts
import { ageFromDob, ADULT_AGE, CONSENT_KINDS } from './src/services/consent.service.js';
import { GRACE_DAYS } from './src/services/account-deletion.service.js';
import { RETENTION } from './src/services/retention.service.js';
import { PRIVACY_VERSION, TERMS_VERSION } from './src/services/policy-seed.service.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}
const yearsAgo = (n: number, m = 0, d = 0) => {
  const t = new Date();
  t.setFullYear(t.getFullYear() - n);
  t.setMonth(t.getMonth() - m);
  t.setDate(t.getDate() - d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

console.log('');
console.log('🧪 حساب العمر — أساسُ بوّابة القاصر');
check('بالغٌ ٢٥ سنة', ageFromDob(yearsAgo(25)) === 25);
check('قاصرٌ ١٤ سنة', ageFromDob(yearsAgo(14)) === 14);
check('على حدّ الثامنة عشرة بالضبط', ageFromDob(yearsAgo(18)) === 18);
check('قبل عيد الميلاد بيومٍ ما زال ١٧', ageFromDob(yearsAgo(18, 0, -1)) === 17);
check('سنُّ الأهليّة ١٨', ADULT_AGE === 18);
check('الثامنة عشرة ليست قاصراً', (ageFromDob(yearsAgo(18)) ?? 0) >= ADULT_AGE);
check('السابعة عشرة قاصر', (ageFromDob(yearsAgo(17)) ?? 99) < ADULT_AGE);

console.log('');
console.log('🧪 رفضُ التواريخ الفاسدة — الخادم لا يثق بالواجهة');
check('صيغةٌ خاطئة ⇒ null', ageFromDob('2010/05/01') === null);
check('نصٌّ فارغ ⇒ null', ageFromDob('') === null);
check('غيرُ نصّ ⇒ null', ageFromDob(20100501 as any) === null);
check('null ⇒ null', ageFromDob(null) === null);
check('شهرٌ ١٣ ⇒ null', ageFromDob('2010-13-01') === null);
check('يومٌ ٣٢ ⇒ null', ageFromDob('2010-05-32') === null);
check('يومٌ صفر ⇒ null', ageFromDob('2010-05-00') === null);
check('تاريخٌ في المستقبل ⇒ null', ageFromDob(yearsAgo(-5)) === null);
check('عمرٌ خرافيّ ⇒ null', ageFromDob('1850-01-01') === null);

console.log('');
console.log('🧪 الثوابت المعلنة تطابق نصّ السياسة');
check('مهلةُ التراجع ٣٠ يوماً', GRACE_DAYS === 30);
check('سجلُّ الحضور ١٢ شهراً', RETENTION.presenceChecks === 365);
check('إشاراتُ الغشّ ١٢ شهراً', RETENTION.cheatSignals === 365);
check('واتساب ٢٤ شهراً', RETENTION.waMessages === 730);
check('الإشعاراتُ المقروءة ٦ أشهر', RETENTION.notifications === 180);
check('وثيقتان لا أكثر', CONSENT_KINDS.length === 2 && CONSENT_KINDS.includes('privacy') && CONSENT_KINDS.includes('terms'));
check('نسخةُ السياسة معلَنة', PRIVACY_VERSION === '1.0' && TERMS_VERSION === '1.0');

console.log('');
console.log('🧪 نصّ السياسة — إقراراتٌ يجب أن يفرضها الكود');
const { readFileSync } = await import('fs');
const seed = readFileSync('./src/services/policy-seed.service.ts', 'utf8');
check('يذكر Google بالاسم', seed.includes('Google'));
check('يذكر Meta بالاسم', seed.includes('Meta'));
check('يذكر Cloudflare بالاسم', seed.includes('Cloudflare'));
check('يذكر مهلة ٢٤ ساعة للتبليغ', seed.includes('٢٤ ساعة'));
check('يذكر مهلة ٧٢ ساعة للوحدة', seed.includes('٧٢ ساعة'));
check('يذكر وحدة حماية البيانات', seed.includes('وحدة حماية البيانات'));
check('يذكر الحقوق السبعة', ['الوصول','التصحيح','الحذف','النقل','سحبُ الموافقة','الاعتراض','الشكوى'].every(w => seed.includes(w)));
check('ينصّ على ألّا ضررَ ماليّ من ممارسة الحقّ', seed.includes('ضررٌ ماليٌّ'));
check('ينصّ على أنّ التنميط لا يُوقِع عقوبةً تلقائيّاً', seed.includes('لا تُوقِع عقوبةً تلقائيّاً'));
check('ينصّ على حدّ الثامنة عشرة وموافقة الوليّ', seed.includes('الثامنة عشرة') && seed.includes('وليّ أمره'));
check('ينفي التقاط صور الشاشة', seed.includes('لا نلتقط صورتَك'));
check('ينفي حفظ عنوان IP', seed.includes('لا نجمع عنوانَ بروتوكول الإنترنت'));
check('ينفي تسجيل الصوت', seed.includes('لا نسجّل صوتَك'));
check('ينفي بيع البيانات', seed.includes('لا نبيع بياناتك'));
check('يذكر مهلة ٣٠ يوماً للتراجع', seed.includes('٣٠ يوماً'));
check('الشروط تمنع صرف الرقائق نقداً', seed.includes('لا تُصرَف نقداً'));
check('الشروط تُخضع النزاع للقانون الأردنيّ', seed.includes('للقانون الأردنيّ'));

console.log('');
console.log('🧪 خدمة الحذف — الجداول التي تُمَسّ');
const del = readFileSync('./src/services/account-deletion.service.ts', 'utf8');
const mustTouch = [
  'session_players', 'match_players', 'bookings', 'booking_members', 'reservations',
  'tickets', 'orders', 'service_requests', 'player_last_fix', 'presence_checks',
  'cheat_signals', 'cheat_reviews', 'blocked_pairs', 'player_fcm_tokens',
  'player_notifications', 'wa_messages', 'wa_conversations', 'wa_customer_notes',
  'wa_campaign_recipients', 'room_feedback', 'staff_action_log',
  'seat_assignments', 'pinned_seats',
];
for (const t of mustTouch) check(`يُجهّل ${t}`, del.includes(t));
check('يحذف ملفّ الصورة من القرص', del.includes('uploads') && del.includes('unlinkSync'));
check('لا يحذف صفّ اللاعب — يُجهَّل فقط', !/DELETE\s+FROM\s+players/i.test(del));
check('لا يحذف القيد الماليّ', !/DELETE\s+FROM\s+chips_ledger/i.test(del));
check('الهاتف يُستبدل بمفتاحٍ فريد (العمود UNIQUE)', del.includes("'deleted:'"));

console.log('');
console.log(`${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} نجح · ${fail} فشل`);
process.exit(fail === 0 ? 0 : 1);
