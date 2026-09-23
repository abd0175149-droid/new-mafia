// ══════════════════════════════════════════════════════
// ✨ فحص حرّاس صياغة ردود الموظّفين
// ══════════════════════════════════════════════════════
// الصياغة تتدخّل في نصٍّ **كتبه إنسانٌ ليصل عميلاً** — فأخطاؤها أخطاءُ وعدٍ
// لا أخطاءُ أسلوب. كلّ فحصٍ هنا يحرس قيداً يمنعها من أن تَعِد بما لم يُقل.
//
//   npx tsx test-wa-restyle.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { guardRewrite, mergeRestyle, applySignature, RESTYLE_DEFAULTS } from './src/services/wa-restyle.service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const code = (p: string) => read(p).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const svc = code('services/wa-restyle.service.ts');
const route = code('routes/whatsapp-inbox.routes.ts');
const bot = code('services/whatsapp-bot.service.ts');
const inbox = code('services/whatsapp-inbox.service.ts');
const boot = code('index.ts');
const uiPath = path.join(HERE, '..', 'frontend', 'src', 'app', 'admin', 'whatsapp', 'page.tsx');
const ui = fs.existsSync(uiPath) ? fs.readFileSync(uiPath, 'utf8') : '';

// ══════════════════════════════════════════════════════
console.log('\n🔢 الحارس — الأرقام والروابط');
// ══════════════════════════════════════════════════════
const G: Array<[string, string, boolean, string]> = [
  ['الدخول ١٢ دينار', 'الدخول ١٢ دينار يا غالي 🎩', true, 'رقمٌ عربيّ محفوظ يمرّ'],
  ['الدخول ١٢ دينار', 'الدخول باثني عشر ديناراً 🎩', false, 'رقمٌ صار كلمةً يقف'],
  ['الدخول ١٢ دينار', 'الدخول بسعرٍ رمزيّ 🎩', false, 'رقمٌ سقط يقف'],
  ['الدخول 12 دينار', 'الدخول ١٢ دينار', true, 'تحويل خطّ الرقم ليس تغييراً له'],
  ['الخميس ٨:٣٠', 'الخميس الساعة ٨:٣٠ مساءً 🎩', true, 'موعدٌ محفوظ يمرّ'],
  ['الخميس ٨:٣٠', 'الخميس ٩:٣٠ 🎩', false, 'موعدٌ تغيّر يقف'],
  ['عنّا ٤ مقاعد', 'عنّا ٤ مقاعد وبنحجزلك ٥ كمان', false, 'رقمٌ جديد لم يكتبه الموظّف يقف'],
  ['احجز من هون https://a.b/x', 'تفضّل احجز من هون https://a.b/x 🎩', true, 'رابطٌ محفوظ يمرّ'],
  ['احجز من هون https://a.b/x', 'تفضّل احجز من الرابط 🎩', false, 'رابطٌ سقط يقف'],
  ['بنشوفك الخميس', 'بنشوفك الخميس يا غالي 🎩', true, 'نصٌّ بلا أرقام يمرّ'],
  ['ما في مقاعد الخميس', 'ما في مقاعد الخميس للأسف 🎩', true, 'رفضٌ بقي رفضاً يمرّ'],
  ['تمام', 'تمام تمام تمام تمام تمام تمام تمام تمام تمام تمام تمام', false, 'طولٌ خارج المعقول يقف'],
  ['أهلاً وسهلاً فيك بنادي المافيا', 'أهلاً', false, 'قِصَرٌ يُفقد المعنى يقف'],
];
for (const [a, b, want, why] of G) {
  const g = guardRewrite(a, b);
  check(g.ok === want, why, g.ok ? 'مرّ' : g.reason);
}
check(!guardRewrite('أهلاً بك', '   ').ok, 'صياغةٌ فارغة تقف');

// ══════════════════════════════════════════════════════
console.log('\n⚙️ الإعدادات — الحدّ في مكانٍ واحد');
// ══════════════════════════════════════════════════════
const m = mergeRestyle({ enabled: true, minWords: 999, timeoutMs: 10, resignAfterMin: -5, onGuardFail: 'hack' });
check(m.minWords === 20, 'minWords يُحدّ بأعلاه', String(m.minWords));
check(m.timeoutMs === 1500, 'timeoutMs يُحدّ بأدناه', String(m.timeoutMs));
check(m.resignAfterMin === 0, 'resignAfterMin لا ينزل تحت الصفر', String(m.resignAfterMin));
check(m.onGuardFail === 'review', 'قيمةٌ غريبة لسلوك الحارس تعود للافتراضيّ', m.onGuardFail);
check(mergeRestyle({}).enabled === false, 'الميزة تُشحن مطفأةً', 'enabled');
const sigless = mergeRestyle({ signatureText: 'من الإدارة' });
check(sigless.signatureText === RESTYLE_DEFAULTS.signatureText,
  'توقيعٌ بلا {name} يُردّ للافتراضيّ — وإلّا صار كلّ الموظّفين شخصاً واحداً');
check(applySignature('أهلاً', 'عبد الله', m).includes('عبد الله'), 'التوقيع يحمل الاسم');
check(applySignature('أهلاً', '', m) === 'أهلاً', 'بلا اسمٍ لا توقيع');
const twice = applySignature(applySignature('أهلاً', 'عبد الله', m), 'عبد الله', m);
check(twice.split('عبد الله').length === 2, 'التوقيع لا يتكرّر على النصّ نفسه');

// ══════════════════════════════════════════════════════
console.log('\n🔒 قيود النداء — ما يجعله آمناً');
// ══════════════════════════════════════════════════════
check(!/knowledgeBase/.test(svc),
  'نداء الصياغة بلا قاعدة معرفة — بلا معلومةٍ يضيفها');
check(!/function_declarations|tools\s*:/.test(svc),
  'نداء الصياغة بلا أدوات — لا يستطيع أن يحجز شيئاً');
check(/contents:\s*\[\{\s*role:\s*'user'/.test(svc) && !/contextMessages|history/.test(svc),
  'نداء الصياغة بلا سجلّ محادثة — النصّ وحده');
check(/AbortController/.test(svc) && /timeoutMs/.test(svc),
  'للصياغة مهلة');
check(/AbortError/.test(svc) && /return skip\(/.test(svc),
  'انقطاعُ الصياغة يُرسل نصّ الموظّف — لا تُحتجَز رسالةٌ خلف نموذج');
check(/if \(!\/\\p\{L\}\/u\.test\(text\)\) return skip/.test(svc) || /no-letters/.test(svc),
  'نصٌّ بلا حروف (رابط أو رمز) لا يُصاغ');
check(/too-short/.test(svc), 'الردود القصيرة لا تُصاغ');
check(/temperature: 0\.(3|2|1)/.test(svc), 'حرارةٌ منخفضة — المطلوب ثباتُ الأسلوب لا تنويعُه');

// ══════════════════════════════════════════════════════
console.log('\n🔌 التركيب — أين تُستدعى');
// ══════════════════════════════════════════════════════
check(/caller === 'staff'/.test(route) && /restyleStaffText/.test(route),
  'الصياغة على مسار الموظّف وحده');
check(/!interactive/.test(route), 'الرسائل التفاعليّة لا تُصاغ — لا نصّ حرّ فيها');
check(/RESTYLE_REVIEW/.test(route) && /status\(409\)/.test(route),
  'اعتراضُ الحارس يردّ 409 بالنصّين ولا يُرسل');
check(/cfg\.enabled && !manualBypass/.test(route),
  'التوقيع مشروطٌ بتفعيل الصياغة ويسقط عند تعطيلها يدويّاً لهذه الرسالة');
check(/'restyle'\]/.test(bot) || /, 'restyle'/.test(bot),
  'restyle في قائمة الحفظ المسموحة');
check(/mergeRestyle/.test(bot), 'الإعدادات تُنقّح في الخادم لا في الواجهة');
check(/ADD COLUMN IF NOT EXISTS restyle/.test(boot), 'العمود يُنشأ عند الإقلاع');
check(/meta\?:\s*Record<string, any>/.test(inbox) && /input\.meta \? \{ \.\.\.apiBody, \.\.\.input\.meta \}/.test(inbox),
  'اسم الموظّف ونصّه الأصليّ يُحفظان مع الرسالة — كان الاسم يُمرَّر ولا يُخزَّن');

// ══════════════════════════════════════════════════════
console.log('\n🖥️ الواجهة');
// ══════════════════════════════════════════════════════
check(!!ui, 'صفحة الواجهة موجودة');
// 🔴 درسُ المتابعة: غيابُ المفتاح من جسم الحفظ يعني أنّ كلّ ضبطٍ يعود كما كان
check(/restyle: s\.restyle/.test(ui), 'restyle داخل جسم حفظ الإعدادات');
check(/followup: s\.followup/.test(ui), 'followup ما زالت داخل جسم الحفظ');
check(/RESTYLE_REVIEW/.test(ui), 'الواجهة تلتقط اعتراض الحارس');
check(/e\.body = err/.test(ui), 'الخطأ يحمل بيانات المراجعة لا رسالةً فقط');
check(/raw: !styleOn/.test(ui), 'زرّ ✳ يمرّر raw فيُرسل النصّ حرفيّاً');
check(/payload\?\.styled/.test(ui), 'الفقاعة تسِم ما صاغه الدون');
check(/payload\?\.by/.test(ui), 'الفقاعة تحمل اسم من كتبها');

console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
