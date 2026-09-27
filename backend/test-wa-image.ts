// ══════════════════════════════════════════════════════
// 🖼️ فحص إرسال الصور عبر واتساب
// ══════════════════════════════════════════════════════
// الصورة تُرسل مع تعليقٍ كرسالةٍ واحدة، إمّا برابطٍ عامّ من خادمنا (للمحادثة الواحدة)
// أو بمعرّفٍ يُرفع لميتا مرّةً ويُعاد استعمالُه (للبثّ). ما يُفحص هنا هو ما لا يظهر
// في التجربة اليدويّة: أنّ البوّابات لم تُفتح، وأنّ البثّ لا يرفع مرّةً لكلّ مستلم.
//
// يعمل بلا قاعدة بيانات وبلا شبكة — قراءة مصادر + فحص وحدات نقيّة:
//   npx tsx test-wa-image.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

let pass = 0;
let fail = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const inbox = read('services/whatsapp-inbox.service.ts');
const routes = read('routes/whatsapp-inbox.routes.ts');
const bcast = read('services/whatsapp-broadcast.service.ts');

console.log('\n🖼️  إرسال الصور عبر واتساب\n');

// ── ١. البوّابة الوحيدة للصادر لم تُفتح ───────────────────
console.log('١. بوّابة النافذة');
{
  // مسار الصورة يجب أن يمرّ من sendMessage نفسها، بعد فحص النافذة
  const gateAt = inbox.indexOf('if (!isFreeWindowOpen(conv))');
  const imageBranchAt = inbox.indexOf("type: 'image'");
  check(gateAt > 0 && imageBranchAt > gateAt,
    'بناءُ رسالة الصورة يقع بعد فحص النافذة لا قبله',
    gateAt < 0 ? 'لم يُعثر على الفحص' : `gate=${gateAt} image=${imageBranchAt}`);

  // لا مسارَ ثانٍ إلى نقطة الرسائل في Cloud API
  const msgCalls = (inbox.match(/\/messages`/g) || []).length;
  check(msgCalls === 1, 'نداءٌ واحد فقط لنقطة messages في Cloud API', `عدد النداءات: ${msgCalls}`);

  // نقطةُ الرفع لا ترسل شيئاً — تُنتج رابطاً فقط
  const uploadRoute = routes.slice(routes.indexOf("router.post('/media/upload'"), routes.indexOf("router.get('/messages/:id/media'"));
  check(uploadRoute.length > 100 && !/sendMessage\s*\(/.test(uploadRoute),
    'نقطةُ الرفع لا تستدعي sendMessage (لا بابَ خلفيّاً حول النافذة)');
}

// ── ٢. روابطُنا فقط ───────────────────────────────────
console.log('\n٢. قيدُ الرابط');
{
  const re = /\^\\\/uploads\\\/wa-out\\\/\[\\w\.-\]\+\$/;
  check(re.test(routes), 'مسارُ /send يقيّد الصورة بمجلَّد wa-out عندنا');
  check(re.test(bcast), 'البثُّ يقيّد الصورة بمجلَّد wa-out عندنا');

  // التحقّق نفسه مطبَّقاً على مدخلاتٍ حقيقيّة
  const guard = /^\/uploads\/wa-out\/[\w.-]+$/;
  const cases: Array<[string, boolean]> = [
    ['/uploads/wa-out/w123-abc.jpg', true],
    ['/uploads/wa-out/w1.png', true],
    ['https://evil.example/x.jpg', false],          // رابطٌ خارجيّ
    ['/uploads/menu/m1.webp', false],               // مجلَّدٌ آخر
    ['/uploads/wa-out/../../etc/passwd', false],    // خروجٌ من المجلَّد
    ['/uploads/wa-out/a b.jpg', false],             // مسافة
    ['//evil.example/x.jpg', false],                // بلا مخطَّط
  ];
  let ok = true;
  for (const [input, expected] of cases) {
    if (guard.test(input) !== expected) { ok = false; console.log(`     ↳ ${input} ⟵ توقّعنا ${expected}`); }
  }
  check(ok, 'الصيغةُ تقبل ملفّاتنا وترفض الخارجيّ والخروجَ من المجلَّد');

  check(/PUBLIC_URL/.test(routes) && /NO_PUBLIC_URL/.test(routes),
    'بلا PUBLIC_URL يفشل الإرسال صراحةً (ميتا لا تفهم رابطاً نسبيّاً)');
}

// ── ٣. الصيغ المقبولة والامتداد ────────────────────────
console.log('\n٣. الصيغة والامتداد');
{
  check(/'image\/jpeg': 'jpg'/.test(routes) && /'image\/png': 'png'/.test(routes),
    'JPG وPNG مقبولتان');
  check(!/'image\/webp'/.test(routes.slice(routes.indexOf('WA_MIME_EXT'), routes.indexOf('waImageUpload') + 600)),
    'WEBP مرفوضة (واتساب لا يقبلها في رسالة صورة)');

  // 🔒 الامتدادُ من النوع لا من اسم الملفّ — الثغرةُ التي في مسارات الرفع الأخرى
  const fnameFn = routes.slice(routes.indexOf('filename: (_req, file, cb)'), routes.indexOf('limits: { fileSize: WA_IMG_MAX_BYTES'));
  check(/WA_MIME_EXT\[file\.mimetype\]/.test(fnameFn) && !/originalname/.test(fnameFn),
    'الامتدادُ يُشتقّ من النوع المُتحقَّق منه لا من اسم الملفّ',
    fnameFn.includes('originalname') ? 'ما زال يقرأ originalname' : '');
  check(/crypto\.randomBytes/.test(fnameFn), 'الاسمُ عشوائيّ غير قابلٍ للتخمين (الرابط عامّ)');
}

// ── ٤. حدُّ التعليق ────────────────────────────────────
console.log('\n٤. حدُّ التعليق');
{
  check(/export const WA_CAPTION_MAX = 1024;/.test(inbox), 'الحدُّ معرَّفٌ ومُصدَّر (1024)');
  check(/\.slice\(0, WA_CAPTION_MAX\)/.test(inbox), 'التعليقُ يُقصّ عندنا قبل أن ترفضه ميتا');
  check(/WA_CAPTION_MAX/.test(bcast) && /أطول من/.test(bcast),
    'البثُّ يرفض النصَّ الطويل قبل أن يكتب صفّاً أو يرسل رسالة');

  const idx = bcast.indexOf('WA_CAPTION_MAX');
  const insertIdx = bcast.indexOf('db.insert(waBroadcasts)');
  check(idx > 0 && insertIdx > idx, 'فحصُ الطول يسبق إنشاء صفّ البثّ');
}

// ── ٥. البثُّ يرفع مرّةً واحدة ──────────────────────────
console.log('\n٥. رفعةٌ واحدة للبثّ');
{
  const loopStart = bcast.indexOf('for (const t of targets)');
  const uploadAt = bcast.indexOf('await uploadWaMedia(');
  check(uploadAt > 0 && loopStart > 0 && uploadAt < loopStart,
    'الرفعُ لميتا يقع **قبل** الحلقة — لا مرّةً لكلّ مستلم',
    uploadAt < 0 ? 'لم يُعثر على uploadWaMedia' : `upload=${uploadAt} loop=${loopStart}`);

  const loopBody = bcast.slice(loopStart, bcast.indexOf('await new Promise(r => setTimeout(r, PACE_MS', loopStart));
  check(!/uploadWaMedia/.test(loopBody), 'لا رفعَ داخل الحلقة');
  check(/image: \{ mediaId, caption: msgText \}/.test(loopBody), 'كلُّ مستلمٍ يأخذ المعرّفَ نفسه مع تعليقه');
}

// ── ٦. قيودُ البثّ لم تُمسّ ─────────────────────────────
console.log('\n٦. قيودُ البثّ كما هي');
{
  check(/BROADCAST_MAX_TARGETS = 300/.test(bcast), 'السقف ٣٠٠ مستلم');
  check(/PACE_MS = 1300/.test(bcast), 'الوتيرة ١.٣ ثانية');
  check(/OPTOUT_FOOTER/.test(bcast.slice(bcast.indexOf('const msgText'), bcast.indexOf('const msgText') + 400)),
    'ذيلُ الإيقاف يبقى في رسالة الصورة أيضاً');
  check(/streak >= 5/.test(bcast), 'التوقّفُ بعد خمسة إخفاقاتٍ متتالية');
}

// ── ٧. الصفُّ المحفوظ يرسمه الخيط صورةً ──────────────────
console.log('\n٧. الصفُّ المحفوظ');
{
  check(/hasImage \? 'image'/.test(inbox), "msgType = 'image' للصورة الصادرة");
  check(/hasImage \? \(caption \|\| '📷 صورة'\)/.test(inbox), 'المعاينةُ التعليقُ أو «📷 صورة»');
  // payload = apiBody، وفيه image.link أو image.id
  check(/payload: input\.meta \? \{ \.\.\.apiBody, \.\.\.input\.meta \} : apiBody/.test(inbox),
    'payload هو جسمُ الطلب نفسه (فيه image.link للمحادثة أو image.id للبثّ)');
}

// ── ٨. الرفعُ لميتا بـmultipart لا JSON ──────────────────
console.log('\n٨. رفعُ الوسائط');
{
  const fn = inbox.slice(inbox.indexOf('export async function uploadWaMedia'), inbox.indexOf('// ── استدعاء Cloud API'));
  check(/new FormData\(\)/.test(fn) && /messaging_product/.test(fn), 'multipart بحقول ميتا المطلوبة');
  check(!/'Content-Type'/.test(fn), 'بلا Content-Type يدويّ (fetch يضبط الحدَّ الفاصل)');
  check(/\/media`/.test(fn), 'ينادي نقطةَ /media لا /messages');
}

console.log(`\n${'─'.repeat(46)}`);
console.log(`نجح ${pass} · فشل ${fail}`);
if (fail) {
  console.log('\n⚠️  فحصٌ ساقط = بوّابةٌ فُتحت أو قيدٌ سقط. لا تنشر قبل إصلاحه.\n');
  process.exit(1);
}
console.log('\n✅ الصورة تمرّ من البوّابة نفسها، والبثُّ يرفع مرّةً واحدة.\n');
