// 🧪 قالبُ الأسبوع — حسابُ التواريخ والقرارات المعتمدة. بلا قاعدة بيانات.
// تشغيل: npx tsx test-weekly-template.ts
import { readFileSync } from 'fs';
import {
  WEEKLY_DAYS, WEEKLY_SCHEDULE, WEEKLY_SEAT_CONSTRAINTS, WEEKLY_DEFAULTS,
  weeklyActivityName, weekStartAmman, ammanWallToUtc,
} from './src/lib/weekly-template.js';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
};
const ammanDay = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);
const ammanTime = (d: Date) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(d);

console.log('');
console.log('🧪 القرارات المعتمدة');
check('أربعُ ليالٍ', WEEKLY_DAYS.length === 4);
check('الأحد · الثلاثاء · الخميس · الجمعة',
  WEEKLY_DAYS.map(d => d.dow).join(',') === '0,2,4,5');
check('سعة الأحد ٣٠', WEEKLY_DAYS[0].maxCapacity === 30);
check('سعة الثلاثاء ٣٠', WEEKLY_DAYS[1].maxCapacity === 30);
check('سعة الخميس ٤٥', WEEKLY_DAYS[2].maxCapacity === 45);
check('سعة الجمعة ٤٥', WEEKLY_DAYS[3].maxCapacity === 45);
check('الأبوابُ ١٩:٠٠ في الأربع', WEEKLY_DAYS.every(d => d.doorsAmman === '19:00'));

console.log('');
console.log('🧪 برنامجُ الليلة');
const games = WEEKLY_SCHEDULE.filter(s => s.kind === 'game');
const breaks = WEEKLY_SCHEDULE.filter(s => s.kind === 'break');
check('أربعُ ألعاب', games.length === 4);
check('ثلاثُ استراحات', breaks.length === 3);
check('أوّلُ لعبةٍ ١٩:٣٠', games[0].start === '19:30');
const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t)!; return +m[1] * 60 + +m[2]; };
check('كلُّ لعبةٍ ٦٠ دقيقة',
  games.every(g => ((mins(g.end) - mins(g.start)) + 1440) % 1440 === 60));
check('كلُّ استراحةٍ ١٥ دقيقة',
  breaks.every(b => ((mins(b.end) - mins(b.start)) + 1440) % 1440 === 15));
// 🔴 لا فجوةَ ولا تداخل: نهايةُ كلِّ فقرةٍ هي بدايةُ التالية
check('الفقراتُ متّصلةٌ بلا فجوة',
  WEEKLY_SCHEDULE.every((s, i) => i === 0 || WEEKLY_SCHEDULE[i - 1].end === s.start));
check('تنتهي ٠٠:١٥', WEEKLY_SCHEDULE[WEEKLY_SCHEDULE.length - 1].end === '00:15');

console.log('');
console.log('🧪 فصلُ الجنسين معطّلٌ افتراضيّاً (قرار المالك)');
const gs = WEEKLY_SEAT_CONSTRAINTS.constraints.find(c => c.type === 'GENDER_SEPARATION');
check('موجودٌ ومعطّل', !!gs && gs.enabled === false);
check('منعُ الأزواج مفعّل',
  WEEKLY_SEAT_CONSTRAINTS.constraints.find(c => c.type === 'NO_ADJACENT_PAIRS')?.enabled === true);
check('جيرانُ المعاقب مفعّل',
  WEEKLY_SEAT_CONSTRAINTS.constraints.find(c => c.type === 'PENALTY_NEIGHBOR_AVOIDANCE')?.enabled === true);
check('فصلُ الجدد مفعّل',
  WEEKLY_SEAT_CONSTRAINTS.constraints.find(c => c.type === 'NEW_PLAYER_SEPARATION')?.enabled === true);
check('فصلُ الرتب معطّل',
  WEEKLY_SEAT_CONSTRAINTS.constraints.find(c => c.type === 'HIGH_RANK_SEPARATION')?.enabled === false);
check('الحالةُ الابتدائيّة planned', WEEKLY_DEFAULTS.status === 'planned');
check('السعرُ ٣', WEEKLY_DEFAULTS.basePrice === '3.00');

console.log('');
console.log('🧪 الأسبوعُ يبدأ الأحد — بالتقويم المدنيّ لعمّان');
// الجمعة ٤ أيلول ٢٠٢٦، ٢٢:٠٠ عمّان
const fri = new Date('2026-09-04T19:00:00Z');
check('الجمعةُ مساءً ⇒ أحدُ ٣٠ آب', ammanDay(new Date(weekStartAmman(fri).getTime() - 3 * 3600000)) === '2026-08-30');
// 🔴 ليلةُ الجمعة تمتدّ لِما بعد منتصف الليل: ٠٠:٣٠ سبت عمّان = ٢١:٣٠ جمعة UTC.
//    لو حُسب اليومُ من UTC لبقي «جمعة» فما تغيّر الأسبوع — والصحيحُ أنّه سبتٌ
//    أيْ آخرُ الأسبوع نفسِه، ثمّ يبدأ أسبوعٌ جديدٌ بالأحد التالي.
const satEarly = new Date('2026-09-05T21:30:00Z'); // ٠٠:٣٠ الأحد ٦ أيلول عمّان
check('٠٠:٣٠ الأحد عمّان ⇒ أسبوعٌ جديد',
  ammanDay(new Date(weekStartAmman(satEarly).getTime() - 3 * 3600000)) === '2026-09-06');
const sun = new Date('2026-09-06T10:00:00Z');
check('الأحدُ نفسُه ⇒ بدايتُه هو', ammanDay(new Date(weekStartAmman(sun).getTime() - 3 * 3600000)) === '2026-09-06');

// 🔴 السبتُ خارج الأسبوع: مَن يجهّز يومَ السبت يريد أسبوعاً لم يبدأ.
//    كان يرجع إلى أحدِ الأسبوع المنقضي فلا يجد شيئاً لإنشائه.
const sat = new Date('2026-09-05T10:00:00Z');        // السبت ٥ أيلول، ١:٠٠ ظهراً عمّان
check('السبتُ ⇒ أحدُ الغد (٦ أيلول)',
  ammanDay(new Date(weekStartAmman(sat).getTime() - 3 * 3600000)) === '2026-09-06');
const satNight = new Date('2026-09-05T20:00:00Z');   // ٢٣:٠٠ السبت عمّان
check('وليلُ السبت كذلك',
  ammanDay(new Date(weekStartAmman(satNight).getTime() - 3 * 3600000)) === '2026-09-06');
const friNight = new Date('2026-09-04T20:00:00Z');   // ٢٣:٠٠ الجمعة عمّان — آخرُ الأسبوع
check('وليلُ الجمعة يبقى في أسبوعه',
  ammanDay(new Date(weekStartAmman(friNight).getTime() - 3 * 3600000)) === '2026-08-30');

console.log('');
console.log('🧪 لحظةُ فتح الأبواب');
const start = weekStartAmman(sun);
for (const d of WEEKLY_DAYS) {
  const civil = new Date(start.getTime() + d.dow * 86400000);
  const doors = ammanWallToUtc(civil, d.doorsAmman);
  check(`${d.labelAr} ⇒ ١٩:٠٠ بتوقيت عمّان`, ammanTime(doors) === '19:00');
}
// 🔴 التخزينُ بـUTC: ١٩:٠٠ عمّان = ١٦:٠٠ UTC — نفسُ ما في كلّ فعاليّات الأسابيع الستّة
const doorsSun = ammanWallToUtc(start, '19:00');
check('وتُخزَّن ١٦:٠٠ UTC', doorsSun.toISOString().slice(11, 16) === '16:00');

console.log('');
console.log('🧪 توليدُ الاسم');
check('«مزاج افندينا ٦ أيلول»',
  weeklyActivityName('مزاج افندينا', new Date(Date.UTC(2026, 8, 6))) === 'مزاج افندينا 6 أيلول');
check('وشهرُ آب صحيح',
  weeklyActivityName('مزاج افندينا', new Date(Date.UTC(2026, 7, 30))) === 'مزاج افندينا 30 آب');

console.log('');
console.log('🧪 المسارات والإشعارُ الواحد');
const routes = readFileSync('./src/routes/activities.routes.ts', 'utf8');
const code = routes.split('\n')
  .filter(l => { const x = l.trimStart(); return !x.startsWith('//') && !x.startsWith('*'); }).join('\n');
check('منفذُ المعاينة موجود', code.includes("'/week/preview'"));
check('ومنفذُ الإنشاء', code.includes("router.post('/week'"));
check('كلاهما محروسٌ بـleaderOrAbove',
  /week\/preview',\s*authenticate,\s*leaderOrAbove/.test(code)
  && /'\/week',\s*authenticate,\s*leaderOrAbove/.test(code));
// 🔴 أهمُّ تأكيد: نداءٌ واحدٌ لإشعار اللاعبين في مسار الأسبوع — لا واحدٌ لكلّ يوم
const weekBlock = code.slice(code.indexOf("router.post('/week'"));
check('نداءُ إشعارِ اللاعبين مرّةً واحدة',
  (weekBlock.match(/sendPushToAllPlayers/g) || []).length === 1);
check('وخارجَ حلقةِ الإنشاء',
  weekBlock.indexOf('sendPushToAllPlayers') > weekBlock.indexOf('res.status(201)'));
check('يُعاد فحصُ التعارض عند الكتابة', weekBlock.includes('يوجد نشاطٌ في هذا اليوم'));
check('ومجلّدُ درايف لكلّ فعاليّة', weekBlock.includes('drive.files.create'));
check('وفشلُ المجلّد لا يُسقط الفعاليّة',
  weekBlock.indexOf('Drive folder failed') > 0 && weekBlock.includes('created.push(act)'));

console.log('');
console.log('🧪 ليلةٌ خارج القالب');
check('التخطّي مشروطٌ بـallowSameDay', weekBlock.includes('!d.allowSameDay'));
check('وللإضافيّة مكانُها وقالبُها إن خُصّا',
  weekBlock.includes('d.locationId ?? locationId') && weekBlock.includes('d.seatTemplateId ?? seatTemplateId'));
check('وحارسٌ على مدى التاريخ', weekBlock.includes('خارج المدى المعقول'));

const modal = readFileSync('../frontend/src/app/admin/components/WeekGamesModal.tsx', 'utf8');
check('النافذةُ ترسل allowSameDay', modal.includes('allowSameDay: !!r.extra'));
check('وفيها زرُّ الإضافة', modal.includes('أضِفْ ليلةً خارج القالب'));
check('وتمنع تكرارَ نفس اللحظة', modal.includes('مضافةٌ سلفاً'));
check('ومفاتيحُ الصفوف لا تتصادم', modal.includes('`x-${r.dateUtc}`') && modal.includes('`t-${r.dow}`'));

console.log('');
console.log(`${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} نجح · ${fail} فشل`);
process.exit(fail === 0 ? 0 : 1);
