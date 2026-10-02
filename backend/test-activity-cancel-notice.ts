// ══════════════════════════════════════════════════════
// 📣 فحص إشعار إلغاء الفعاليّة + «الملغاة ليست دَيناً»
// ══════════════════════════════════════════════════════
//   npx tsx test-activity-cancel-notice.ts          (ثابت — محلّيّاً)
//   الفحص الحيّ: src/scripts/e2e-cancel-notice.ts على الخادم
// ══════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderCancelText, whenAr, CANCEL_NOTICE_DEFAULT } from './src/services/activity-cancel-notice.service.js';
const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, x: any = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '✅' : '❌'} ${label}`, ok ? '' : x); };
const code = (p: string) => fs.readFileSync(path.join(HERE, p), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

console.log('\n✉️ نصّ الرسالة');
const t = renderCancelText(CANCEL_NOTICE_DEFAULT, { name: 'علي نايف محمد', activity: 'الزرقاء الجديدة 1 تشرين الأوّل', when: 'الخميس 1/10 الساعة 7:30 مساءً' });
check(t.startsWith('مرحباً علي 🎭'), 'الاسم الأوّل وحده', t);
check(t.includes('«الزرقاء الجديدة 1 تشرين الأوّل»') && t.includes('الخميس 1/10 الساعة 7:30 مساءً'), 'الفعاليّة وموعدها', t);
check(!/\{/.test(t), 'لا عنصرَ نائباً متروك');
check(renderCancelText(CANCEL_NOTICE_DEFAULT, { name: '', activity: 'x', when: 'y' }).startsWith('مرحباً ضيفنا'), 'بلا اسم ⟵ «ضيفنا»');
check(whenAr(new Date('2026-10-01T16:30:00Z')) === 'الخميس 1/10 الساعة 7:30 مساءً', 'الموعد بتوقيت عمّان', whenAr(new Date('2026-10-01T16:30:00Z')));
check(whenAr(new Date('2026-10-02T07:00:00Z')) === 'الجمعة 2/10 الساعة 10 صباحاً', 'صباحاً وبلا دقائق', whenAr(new Date('2026-10-02T07:00:00Z')));

console.log('\n🔌 الإطلاق');
const routes = code('src/routes/activities.routes.ts');
check(/updates\.status === 'cancelled' && prevStatus && prevStatus !== 'cancelled'/.test(routes), 'يُطلق عند التحوّل إلى «ملغاة» فقط (لا عند حفظها ملغاةً ثانيةً)');
check(/runCancelNotice\(id, \{ by, text \}\)/.test(routes) && /cancelNotice = \{ started: true/.test(routes), 'يعمل في الخلفية ويُخبر الواجهة');
check(/'\/:id\/cancel-notice\/preview'/.test(routes) && /'\/:id\/cancel-notice'/.test(routes) && /'\/:id\/cancel-notice\/resend'/.test(routes), 'معاينة · تقرير · إعادة إرسال');
const svc = code('src/services/activity-cancel-notice.service.ts');
check(/const beforeStart = Date\.now\(\) < act\.date\.getTime\(\)/.test(svc) && /'after_start'/.test(svc), 'قبل الموعد فقط');
check(/act\.isTest \? 'test_location'/.test(svc) && /if \(skipped\) return \{ ok: true, skipped/.test(svc), 'موقع الاختبار لا يصل واتساب');
check(/ON CONFLICT \(activity_id, phone\) DO NOTHING RETURNING id/.test(svc), 'مرّةً لكلّ رقم — إعادة الإلغاء تراسل الجدد وحدهم');
check(/r\.status <> 'cancelled'/.test(svc) && /'waitlist'/.test(svc), 'الحاجزون: الحجوزات + المتابعة (بلا الملغاة) + الانتظار');
check(/e\?\.code === 'WINDOW_EXPIRED' \? 'window_closed'/.test(svc), 'رفضُ النافذة لحظة الإرسال يُسجَّل «نافذة مغلقة» لا «فشل»');
check(/CREATE TABLE IF NOT EXISTS activity_cancel_recipients/.test(code('src/index.ts')), 'الجداول تُنشأ عند الإقلاع');

console.log('\n🚫 الملغاة ليست دَيناً ولا غياباً ولا تذكيراً');
const card = code('src/routes/staff-player-card.routes.ts');
check((card.match(/AND a\.status <> 'cancelled'/g) || []).length === 2, 'بطاقة اللاعب: الباب + تبويب المال');
check(/ne\(activities\.status, 'cancelled'\)/.test(code('src/reports/definitions/receivables.report.ts')), 'تقرير الذمم');
check(/ne\(activities\.status, 'cancelled'\)/.test(code('src/reports/definitions/no-show.report.ts')), 'تقرير الغياب');
const ext = code('src/services/wa-bot-ext.service.ts');
check(/ax\.status <> 'cancelled' AND b\.activity_id IN \(SELECT id FROM acts\)\) AS unpaid_bookings/.test(ext), 'تقرير البوت السريع');
check(/unpaid: a\.status === 'cancelled' \? 0 : x\.unpaid/.test(ext), 'تقرير الليلة في البوت');
check(/const expected = cancelledAct \? 0 :/.test(code('src/services/whatsapp-bot.service.ts')), 'ماليّة فعاليّةٍ بعينها في البوت');
check(/\$\{activities\.status\} <> 'cancelled'/.test(code('src/services/whatsapp-reminder.service.ts')), 'لا تذكير «لعبتك بعد ساعة» لملغاة');

console.log('\n🖥️ الواجهة');
const fe = (p: string) => fs.readFileSync(path.join(HERE, '..', 'frontend', 'src', p), 'utf8');
check(/confirmActivityCancel/.test(fe('app/admin/activities/page.tsx')) && /confirmActivityCancel/.test(fe('app/admin/activities/[id]/page.tsx')), 'تأكيدٌ بمعاينة في القائمة وصفحة الفعاليّة');
check(/<CancelNoticeSection/.test(fe('app/admin/activities/[id]/page.tsx')), 'التقرير في صفحة الفعاليّة');
check(/api\.whatsapp\.com\/send/.test(fe('app/admin/components/CancelNoticeSection.tsx')) && !/wa\.me\//.test(fe('app/admin/components/CancelNoticeSection.tsx')), '«من هاتفي» عبر api.whatsapp.com (wa.me تكسر الإيموجي)');

console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
