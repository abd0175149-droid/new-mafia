// ══════════════════════════════════════════════════════
// 🔒 فحص سياسة واتساب — إثبات ما نقوله في التظلّم
// ══════════════════════════════════════════════════════
// كل فحص هنا يقابل جملة حرفية في نصّ التظلّم المقدَّم لميتا.
// إن سقط أحدها فالنصّ صار غير صحيح — وهذا أخطر من عطل برمجيّ:
// ادّعاء كاذب أمام مراجع يُسقط الملفّ كلّه ولا يُصلَح لاحقاً.
//
// يعمل بلا قاعدة بيانات وبلا شبكة — قراءة مصادر فقط:
//   npx tsx test-wa-policy.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');

let pass = 0;
let fail = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const read = (p: string) => fs.readFileSync(p, 'utf8');
/** الأسطر غير المعلَّقة فقط — تعليقٌ يشرح ما أُزيل ليس قدرةً باقية */
function code(p: string): string {
  return read(p)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
}

console.log('\n🔒 فحص سياسة واتساب — مطابقة الكود لنصّ التظلّم\n');

// ── ١) لا محرّك حملات ولا بثّ جماعيّ ──────────────────
console.log('١) «The bulk campaign feature has been removed from our software»:');
for (const gone of ['whatsapp-campaigns.service.ts', 'whatsapp-broadcast.service.ts']) {
  check(!fs.existsSync(path.join(SRC, 'services', gone)), `الملف ${gone} غير موجود`);
}
const importers = files.filter((f) => /whatsapp-(campaigns|broadcast)\.service/.test(code(f)));
check(importers.length === 0, 'لا ملفّ يستورد محرّك الحملات أو البثّ',
  importers.map((f) => path.relative(SRC, f)).join(', '));

// ── ٢) لا رفع ملفّات أرقام ────────────────────────────
console.log('\n٢) «The file-upload path that turned a spreadsheet into a send list has been removed»:');
const waRoutes = path.join(SRC, 'routes', 'whatsapp-inbox.routes.ts');
const routesCode = code(waRoutes);
check(!/multer/.test(routesCode), 'لا multer في مسارات واتساب');
check(!/upload-numbers|parseNumbersFile|preview-uploaded/.test(routesCode), 'لا مسار رفع أرقام');
const parsers = files.filter((f) => /parseNumbersFile/.test(code(f)));
check(parsers.length === 0, 'لا محلّل ملفّات أرقام في أي مكان',
  parsers.map((f) => path.relative(SRC, f)).join(', '));

// ── ٣) لا مسارات حملات أو بثّ ─────────────────────────
console.log('\n٣) لا واجهة برمجية تُطلق إرسالاً جماعياً:');
const bulkRoutes = [...routesCode.matchAll(/router\.\w+\(\s*'([^']+)'/g)]
  .map((m) => m[1])
  .filter((r) => /campaign|broadcast/i.test(r));
check(bulkRoutes.length === 0, 'لا مسار يحمل campaign أو broadcast', bulkRoutes.join(' · '));

// ── ٤) منفذ واحد إلى Cloud API ────────────────────────
console.log('\n٤) منفذ واحد فقط إلى واتساب — وهو المشروط:');
const senders: Array<{ file: string; count: number }> = [];
for (const f of files) {
  const n = (code(f).match(/callWaApi\(/g) || []).length;
  if (n) senders.push({ file: path.relative(SRC, f), count: n });
}
const posts = senders.filter((s) => s.file.endsWith('whatsapp-inbox.service.ts'));
check(senders.length === 1 && posts.length === 1,
  'callWaApi لا يُستدعى إلا من whatsapp-inbox.service',
  senders.map((s) => `${s.file}×${s.count}`).join(', '));

const inboxSrc = read(path.join(SRC, 'services', 'whatsapp-inbox.service.ts'));
const msgCalls = (code(path.join(SRC, 'services', 'whatsapp-inbox.service.ts'))
  .match(/callWaApi\(`\$\{env\.WA_PHONE_NUMBER_ID\}\/messages`/g) || []).length;
check(msgCalls === 1, 'استدعاء واحد فقط لنقطة /messages', `العدد=${msgCalls}`);

// ── ٥) قيد الموافقة يسبق الإرسال في نفس الدالة ────────
console.log('\n٥) «a number can only be messaged if that customer opened the conversation first»:');
const sendFn = inboxSrc.slice(
  inboxSrc.indexOf('export async function sendMessage'),
  inboxSrc.indexOf('callWaApi(`${env.WA_PHONE_NUMBER_ID}/messages`'),
);
check(sendFn.length > 0 && /if \(!isFreeWindowOpen\(conv\)\)/.test(sendFn),
  '🔒 حارس النافذة يقع قبل نداء الإرسال داخل sendMessage');
check(/WINDOW_EXPIRED/.test(sendFn), 'ويرمي WINDOW_EXPIRED بدل المتابعة');
check(/if \(!conv\.lastInboundAt\) return false;/.test(inboxSrc),
  'والنافذة لا تُفتح إلا برسالة واردة من العميل — أي أنه راسلنا أولاً');

// ── ٦) لا إرسال قوالب (المسار الوحيد الذي كان يتجاوز النافذة) ──
console.log('\n٦) لا أداة تخاطب نافذة مغلقة:');
const tmplSenders = files.filter((f) => /sendTemplateMessage/.test(code(f)));
check(tmplSenders.length === 0, 'sendTemplateMessage مُزالة من كل المصادر',
  tmplSenders.map((f) => path.relative(SRC, f)).join(', '));
check(!/type: 'template'/.test(code(path.join(SRC, 'services', 'whatsapp-inbox.service.ts'))),
  'ولا حمولة من نوع template تُبنى في أي مكان');

// ── ٧) لا إنشاء قوالب تسويقية ─────────────────────────
console.log('\n٧) لا إنشاء قوالب MARKETING:');
const tplSvc = code(path.join(SRC, 'services', 'whatsapp-templates.service.ts'));
check(!/export async function createTemplate/.test(tplSvc), 'createTemplate مُزالة');
check(!/MARKETING/.test(tplSvc), 'ولا ذكر لفئة MARKETING في الخدمة');
check(/export async function deleteTemplate/.test(tplSvc),
  'وحذف القوالب باقٍ — به تُمسح القوالب التسويقية القديمة عند عودة الوصول');

// ── ٨) قفل الإرسال ────────────────────────────────────
console.log('\n٨) «Account-health monitoring halts all sending on any signal from Meta»:');
check(/export function suspendSending/.test(inboxSrc), 'دالة قفل الإرسال موجودة');
check(/suspendSending\(label\)/.test(inboxSrc), 'ومعالج أحداث صحّة الحساب يستدعيها');
check(/const blocked = sendingSuspendedReason\(\);/.test(sendFn),
  '🔒 وsendMessage يفحص القفل قبل أي شيء آخر');
check(/env\.WA_SUSPENDED/.test(inboxSrc), 'والقفل التشغيليّ WA_SUSPENDED يُطبَّق في نفس الموضع');

const remSrc = code(path.join(SRC, 'services', 'whatsapp-reminder.service.ts'));
check(/if \(env\.WA_SUSPENDED\)/.test(remSrc), 'ومجدول التذكير لا يبدأ أصلاً وهو مرفوع');

// ── ٩) لا واجهة تُطلق شيئاً من ذلك ────────────────────
console.log('\n٩) لا واجهة إدارة تُطلق حملة أو بثّاً:');
const page = path.join(ROOT, '..', 'frontend', 'src', 'app', 'admin', 'whatsapp', 'page.tsx');
if (fs.existsSync(page)) {
  const ui = read(page);
  check(!/<BroadcastView|<CampaignsView|<CampaignWizard|<CampaignMonitor/.test(ui),
    'لا مكوّن بثّ أو حملات مُركَّب في الصفحة');
  check(!/whatsapp\/(campaigns|broadcast)/.test(ui), 'ولا نداء لمسار حملة أو بثّ');
} else {
  check(true, 'تخطّي فحص الواجهة (المصادر غير متاحة هنا)');
}

// ══════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(54)}`);
console.log(fail === 0
  ? `✅ النتيجة: ${pass} ناجح · 0 فاشل — كل جملة في التظلّم مطابقة للكود`
  : `❌ النتيجة: ${pass} ناجح · ${fail} فاشل — لا تُرسل التظلّم قبل إصلاحها`);
console.log('═'.repeat(54) + '\n');
process.exit(fail === 0 ? 0 : 1);
