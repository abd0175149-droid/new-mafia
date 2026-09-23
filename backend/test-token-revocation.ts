// ══════════════════════════════════════════════════════
// 🔒 فحص حرّاس إبطال جلسات الموظّفين
// ══════════════════════════════════════════════════════
// هذه آليّةُ أمانٍ لا ميزة: إن سكتت عن رمزٍ مبطَل بقي حسابُ أدمنٍ مفتوحاً
// في البرّيّة أسبوعاً. وكلّ فحصٍ هنا يحرس بابَ دخولٍ واحداً.
//
//   npx tsx test-token-revocation.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isStaffTokenRevoked } from './src/middleware/token-revocation.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const code = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8')
  .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const rev = code('middleware/token-revocation.ts');
const auth = code('middleware/auth.ts');
const boot = code('index.ts');
const routes = code('routes/staff.routes.ts');
const schema = code('schemas/admin.schema.ts');

// ══════════════════════════════════════════════════════
console.log('\n🧮 منطق الحكم على الرمز');
// ══════════════════════════════════════════════════════
// الخريطة فارغةٌ هنا (لا قاعدة بيانات) — فالحالة الطبيعيّة «لا إبطال».
check(!isStaffTokenRevoked({ id: 5, iat: 1 }), 'بلا إبطالٍ مسجَّل: الرمز يمرّ');
check(!isStaffTokenRevoked(null as any), 'حمولةٌ فارغة لا تُسقط الدالّة');
check(!isStaffTokenRevoked({ iat: 1 } as any), 'حمولةٌ بلا معرِّف تمرّ (ليست رمز موظّف)');

// المقارنة نفسها: iat بالثواني والقطع بالميلي — خلطُهما يعني إبطالاً أبديّاً
check(/payload\.iat \* 1000 < cut/.test(rev),
  'iat بالثواني يُضرب في ١٠٠٠ قبل مقارنته بالقطع');
check(/if \(!payload\.iat\) return true/.test(rev),
  'رمزٌ بلا iat يُرفض عند وجود إبطال — الخطأ في جانب الإغلاق');
check(/revoked\.set\(staffId, now\.getTime\(\)\)/.test(rev),
  'الإبطال من لوحتنا يُنعش الخريطة فوراً ولا ينتظر الدورة');
check(/catch[\s\S]{0,400}?revoked = next/.test(rev) === false,
  'فشلُ التحميل لا يُفرِغ الخريطة — إفراغها يُحيي جلساتٍ أُغلقت');
check(/unref/.test(rev), 'المؤقّت unref فلا يمنع الخروج النظيف');

// ══════════════════════════════════════════════════════
console.log('\n🚪 كلّ أبواب الجلسة');
// ══════════════════════════════════════════════════════
const gates = auth.split('jwt.verify(token, env.JWT_SECRET)').length - 1;
const guards = auth.split('isStaffTokenRevoked').length - 1;
check(gates > 0 && guards >= gates,
  `كلّ موضعٍ يتحقّق من رمز موظّف يفحص الإبطال (${guards} فحصاً لـ${gates} تحقّقاً)`);
check(/isStaffTokenRevoked\(dec\)/.test(boot),
  'المقبس يفحص الإبطال أيضاً — بابٌ ثانٍ للجلسة');
check(/startRevocationWatcher\(\)/.test(boot), 'المراقب يبدأ عند الإقلاع');
check(/ADD COLUMN IF NOT EXISTS tokens_valid_from/.test(boot), 'العمود يُنشأ عند الإقلاع');
check(/tokensValidFrom: timestamp\('tokens_valid_from'\)/.test(schema), 'العمود في المخطّط');
check(/SESSION_REVOKED/.test(auth), 'الردّ يحمل رمزاً تعرفه الواجهة');

// ══════════════════════════════════════════════════════
console.log('\n🔑 المنفذ');
// ══════════════════════════════════════════════════════
check(/revoke-sessions', authenticate, adminOnly/.test(routes),
  'إغلاق الجلسات للأدمن وحده');
check(/revokeStaffSessions/.test(routes), 'المنفذ يستعمل الدالّة لا SQL مبعثراً');
check(/console\.log\(`🔒 \[staff\]/.test(routes), 'الإغلاق يُسجَّل باسم فاعله');

// ══════════════════════════════════════════════════════
console.log('\n🌐 الواجهة');
// ══════════════════════════════════════════════════════
const uiPath = path.join(HERE, '..', 'frontend', 'src', 'app', 'admin', 'staff', 'page.tsx');
const ui = fs.existsSync(uiPath) ? fs.readFileSync(uiPath, 'utf8') : '';
check(!!ui, 'صفحة الموظّفين موجودة');
check(/revoke-sessions/.test(ui), 'الزرّ موصولٌ بالمنفذ');
check(/swalConfirm\([\s\S]{0,300}?danger: true/.test(ui), 'الإغلاق يسأل قبل أن يفعل');

console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
