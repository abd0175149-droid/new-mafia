// ══════════════════════════════════════════════════════
// 📝 فحص حرّاس استبيان الأمسية
// ══════════════════════════════════════════════════════
// الاستبيان يكتب في مكانين (أعمدةٌ قديمة و JSONB جديد) ويُرسل عبر قناتين
// بقيودٍ مختلفة. كلّ فحصٍ هنا يحرس موضعاً يسقط فيه شيءٌ بصمت إن اختلّ.
//
//   npx tsx test-survey.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeSurvey, SURVEY_DEFAULTS, FIVE_SCALE } from './src/services/survey.service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const WEB = path.join(HERE, '..', 'frontend', 'src');
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const strip = (t: string) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const src = (p: string) => strip(fs.readFileSync(path.join(SRC, p), 'utf8'));
const web = (p: string) => {
  const f = path.join(WEB, p);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
};

const svc = src('services/survey.service.ts');
const ext = src('services/wa-bot-ext.service.ts');
const fb = src('services/feedback.service.ts');
const pfr = src('routes/player-feedback.routes.ts');
const far = src('routes/feedback-analytics.routes.ts');
const bot = src('services/whatsapp-bot.service.ts');
const boot = src('index.ts');
const schema = src('schemas/feedback.schema.ts');

// ══════════════════════════════════════════════════════
console.log('\n⚙️ حدود الإعدادات');
// ══════════════════════════════════════════════════════
const m = mergeSurvey({ delayMin: 99999, validHours: 99, onceHours: 999, maxWaQuestions: 99, lowThreshold: 9, notePrompt: '' });
check(m.validHours <= 23, 'validHours تحت نافذة الأربع والعشرين ساعة', String(m.validHours));
check(m.onceHours === 24, 'onceHours يُحدّ بـ٢٤ — مفتاحُ «أُرسل له» يعيش يوماً واحداً', String(m.onceHours));
check(m.maxWaQuestions === 4, 'سقفُ أسئلة الواتساب أربعة — التسرّب حقيقيّ', String(m.maxWaQuestions));
check(m.lowThreshold <= 4, 'عتبةُ التنبيه لا تبلغ ٥ وإلّا نبّه على كلّ تقييم', String(m.lowThreshold));
check(m.notePrompt === SURVEY_DEFAULTS.notePrompt, 'نصٌّ فارغ يعود للافتراضيّ');
check(mergeSurvey({}).enabled === true, 'الاستبيان مفعَّلٌ افتراضاً — ميزةٌ قائمة لا جديدة');
check(FIVE_SCALE.length === 5 && FIVE_SCALE.some(o => o.score === 3),
  'المقياس الخماسيّ فيه «٣» — القديم كان ٥/٤/٢ بلا متوسّط');

// ══════════════════════════════════════════════════════
console.log('\n✍️ أين تُكتب الإجابة');
// ══════════════════════════════════════════════════════
check(/COL_OK\s*=\s*\/\^\[a-z_\]/.test(svc),
  'اسمُ العمود يمرّ على حارسٍ قبل أيّ تركيبٍ نصّيّ في SQL');
check(/if \(q\.column && COL_OK\.test\(q\.column\)\)/.test(svc),
  'من له عمودٌ يُكتب في عموده — فلا يضيع تاريخٌ ولا تُعاد كتابة التحليلات');
check(/answers = COALESCE\(answers, '\{\}'::jsonb\) \|\|/.test(svc),
  'ومن لا عمود له يُكتب في JSONB بالدمج لا بالاستبدال');
check(/Math\.min\(Math\.max\(Math\.round\(score\), 1\), 5\)/.test(svc), 'الدرجة تُحدّ بين ١ و٥');
check(/answers: jsonb\('answers'\)/.test(schema), 'العمود في المخطّط');
check(/ADD COLUMN IF NOT EXISTS answers JSONB/.test(boot) && /CREATE TABLE IF NOT EXISTS survey_questions/.test(boot),
  'الترحيل عند الإقلاع');
check(/seedSurveyQuestions\(\)/.test(boot), 'البذر عند الإقلاع');
check(/if \(have\.has\(q\.key\)\) continue/.test(svc),
  'البذر لا يلمس سؤالاً عُدّل من اللوحة');

// ══════════════════════════════════════════════════════
console.log('\n🗄️ التقاعد لا الحذف');
// ══════════════════════════════════════════════════════
check(/retiredAt: new Date\(\)/.test(svc) && !/DELETE FROM survey_questions/.test(svc),
  'السؤال يُتقاعد ولا يُحذف — إجاباتُه تبقى ذات معنى');
check(/isNull\(surveyQuestions\.retiredAt\)/.test(svc), 'المتقاعد لا يُعرض');
check(/لا يُغيَّر `column`/.test(fs.readFileSync(path.join(SRC, 'services/survey.service.ts'), 'utf8')),
  'العمود والمفتاح لا يتغيّران بعد الإنشاء');

// ══════════════════════════════════════════════════════
console.log('\n📱 قيود واتساب');
// ══════════════════════════════════════════════════════
check(/opts\.length <= 3/.test(ext),
  'ثلاثةُ خياراتٍ فأقلّ ⇒ أزرار');
check(/type: 'list'/.test(ext) && /sections/.test(ext),
  'وأكثر ⇒ قائمةٌ تفاعليّة — وهي ما يجعل المقياس الخماسيّ ممكناً');
check(/title: o\.label\.slice\(0, 20\)/.test(ext), 'عنوانُ الزرّ يُقصّ على ٢٠ حرفاً قبل الإرسال');
check(/slice\(0, 10\)/.test(ext), 'صفوفُ القائمة تُحدّ بعشرة');
check(/if \(!questions\.length\) return/.test(ext),
  'لا سؤال على القناة ⇒ لا رسالة أصلاً');

// ══════════════════════════════════════════════════════
console.log('\n🔁 تسلسل الأسئلة');
// ══════════════════════════════════════════════════════
check(/wa-survey-at:/.test(ext), 'موضعُ اللاعب من الأسئلة محفوظ');
check(/srv:\(\\d\+\):\(\\d\+\):\(\[1-5\]\)/.test(ext.replace(/\\\\/g, '\\')) || /srv:\(\\d\+\):\(\\d\+\)/.test(ext),
  'معرّف الزرّ يحمل الصفّ والسؤال والدرجة');
check(/\|\| \/\^srv:\(\\d\+\):\(\):\(\[1-5\]\)\$\//.test(ext.replace(/\\\\/g, '\\')) || /srv:\(\\d\+\):\(\)\(/.test(ext),
  'الشكل القديم يبقى مقبولاً — أزرارٌ أُرسلت قبل النشرة لا تسقط');
check(/nextIdx < questions\.length/.test(ext), 'السؤال التالي يُرسل فوراً');
check(/closeSurvey/.test(ext), 'وآخرُ سؤالٍ يختم الاستبيان');
check(ext.indexOf('recordAnswer') < ext.indexOf('nextIdx < questions.length'),
  'الإجابة تُحفظ قبل إرسال التالي — من يصمت بعدها يبقى جوابُه');

// ══════════════════════════════════════════════════════
console.log('\n🔌 التركيب');
// ══════════════════════════════════════════════════════
check(/'survey'\]/.test(bot) || /, 'survey'/.test(bot), 'survey في قائمة الحفظ المسموحة');
check(/mergeSurvey/.test(bot), 'الإعدادات تُنقّح في الخادم');
check(/listQuestions\(\{ channel: 'app'/.test(pfr), 'التطبيق يقرأ الأسئلة الحيّة');
check(/live\.length\s*\?/.test(pfr),
  'و`FEEDBACK_QUESTIONS` شبكةُ أمانٍ إن لم يُبذَر الجدول بعد');
check(/for \(const q of asked\)/.test(pfr),
  'الحارسُ يشترط المعروضَ فعلاً — لا الأحد عشر دائماً، وإلّا رُدّت كلّ استجابةٍ بعد إطفاء سؤال');
check(/for \(const k of FEEDBACK_KEYS\) if \(answers\[k\] !== undefined\)/.test(fb),
  'لا يُكتب عمودٌ لم يُسأل عنه — وإلّا مُحيت قيمةٌ وصلت من الواتساب');
check(/router\.get\('\/questions'/.test(far) && /router\.put\('\/questions\/:id'/.test(far),
  'مسارات التحرير موجودة');
check(/managerOrAbove/.test(far), 'التحرير لمن هو مديرٌ فما فوق');

// ══════════════════════════════════════════════════════
console.log('\n🖥️ الواجهة');
// ══════════════════════════════════════════════════════
const ui = web('app/admin/feedback/SurveyQuestions.tsx');
const page = web('app/admin/feedback/page.tsx');
const app = web('app/player/feedback/page.tsx');
check(!!ui, 'محرّر الأسئلة موجود');
check(/options\.length > 3/.test(ui), 'المحرّر ينبّه إلى تحوّل الأزرار إلى قائمة');
check(/o\.label\.length > 20/.test(ui), 'وينبّه إلى العنوان الطويل قبل أن يقصّه واتساب');
check(/يخلط سؤالين في متوسّطٍ واحد/.test(ui), 'ويحذّر من تعديل نصّ سؤالٍ له عمود');
check(/overLimit/.test(ui), 'ويقول كم سؤالاً يتجاوز السقف فلا يُرسل');
check(/SurveyQuestions/.test(page) && /'questions'/.test(page), 'التبويب موصول');
check(/tab === 'questions'/.test(page) && page.indexOf("tab === 'questions'") < page.indexOf('if (loading)'),
  'المحرّر لا ينتظر تحميل ملخّص التقييمات');
check(/\(q as any\)\.options/.test(app), 'التطبيق يعرض الخيارات المخصّصة حين توجد');

console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
