// 🧪 «رأيك بتجربتك» — التحقّق من الإجابات وتنظيف الأسئلة ومحتوى الإشعار (بلا قاعدة بيانات)
//    npx tsx src/scripts/test-experience.ts
import { validateAnswers, sanitizeQuestions, DEFAULT_EXP_QUESTIONS, notificationContent, EXP_TEXT_MAX } from '../services/experience.service.js';

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); } };
const Q = DEFAULT_EXP_QUESTIONS;

console.log('\n━━━ الإجابات ━━━');
check('التقييم العام مطلوب', validateAnswers(Q, { nps: 9 }).ok === false);
check('التقييم العام وحده يكفي', validateAnswers(Q, { overall: 5 }).ok === true);
check('النجوم ١–٥ فقط', !validateAnswers(Q, { overall: 6 }).ok && !validateAnswers(Q, { overall: 0 }).ok && !validateAnswers(Q, { overall: 2.5 }).ok);
check('الترشيح ٠–١٠', validateAnswers(Q, { overall: 4, nps: 0 }).ok && !validateAnswers(Q, { overall: 4, nps: 11 }).ok);
check('الاختيار من الخيارات وحدها', validateAnswers(Q, { overall: 4, contact: 'نعم' }).ok && !validateAnswers(Q, { overall: 4, contact: 'ربّما' }).ok);
const m = validateAnswers(Q, { overall: 4, likes: ['الموجّهين', 'الموجّهين', 'الأماكن'] });
check('المتعدّد بلا تكرار', m.ok && JSON.stringify(m.answers!.likes) === JSON.stringify(['الموجّهين', 'الأماكن']));
check('المتعدّد يرفض الغريب', !validateAnswers(Q, { overall: 4, likes: ['شيء آخر'] }).ok);
const t = validateAnswers(Q, { overall: 3, improve: '  ' + 'أ'.repeat(EXP_TEXT_MAX + 50) + '  ', ideas: '   ' });
check('النصّ يُقصّ عند الحدّ', t.ok && t.answers!.improve.length === EXP_TEXT_MAX);
check('النصّ الفارغ لا يُحفظ', t.ok && !('ideas' in t.answers!));
check('مفتاحٌ ليس سؤالاً لا يُحفظ', !('hack' in (validateAnswers(Q, { overall: 5, hack: 'x' }).answers || {})));
const off = Q.map(q => (q.key === 'atmosphere' ? { ...q, enabled: false } : q));
check('السؤال المطفأ لا يُحفظ', !('atmosphere' in (validateAnswers(off, { overall: 5, atmosphere: 4 }).answers || {})));

console.log('\n━━━ الأسئلة ━━━');
check('الافتراضيّة سليمة', sanitizeQuestions(Q).ok);
check('مفتاحٌ مكرّر مرفوض', !sanitizeQuestions([...Q, Q[0]]).ok);
check('مفتاحٌ غير صالح مرفوض', !sanitizeQuestions([{ ...Q[0], key: 'Bad Key' }]).ok);
check('اختيارٌ بخيارٍ واحد مرفوض', !sanitizeQuestions([{ key: 'x1', type: 'choice', label: 'س', options: ['أ'] }]).ok);
const s = sanitizeQuestions([{ key: 'x1', type: 'multi', label: 'س', options: ['أ', '', 'ب', ' '] }]);
check('الخيارات الفارغة تُحذف', s.ok && s.questions![0].options!.length === 2);
check('كلّها مطفأة مرفوض', !sanitizeQuestions(Q.map(q => ({ ...q, enabled: false }))).ok);
check('نوعٌ غير معروف مرفوض', !sanitizeQuestions([{ key: 'x1', type: 'slider', label: 'س' }]).ok);

console.log('\n━━━ الإشعار ━━━');
const base: any = { id: 7, title: 'عنوان', intro: 'نصّ الرسالة', imageUrl: '/uploads/notifications/a.png', questions: Q, status: 'draft', pushTitle: null, pushBody: null, sentAt: null, sentBy: null, sentCount: 0, createdAt: '', updatedAt: '' };
const n = notificationContent(base);
check('الرابط يفتح الحملة', n.data.url === '/player/experience?c=7&src=push');
check('الصورة والحملة والزرّ في البيانات', n.data.imageUrl === base.imageUrl && n.data.campaignId === 7 && !!n.data.ctaLabel);
check('بلا نصّ إشعار ⇒ نصّ الرسالة', n.body === 'نصّ الرسالة' && n.title === 'عنوان');
check('نصّ الإشعار يغلب حين يُكتب', notificationContent({ ...base, pushTitle: 'ت', pushBody: 'ج' }).body === 'ج');
check('بلا صورة لا حقل صورة', !('imageUrl' in notificationContent({ ...base, imageUrl: null }).data));
check('لا وسمَ دمج (يُبطئ الإرسال لألف لاعب صفّاً صفّاً)', !('tag' in n.data));

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
process.exit(fail ? 1 : 0);
