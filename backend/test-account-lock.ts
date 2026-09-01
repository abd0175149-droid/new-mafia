// 🧪 قفلُ حساب اللاعب — فحصٌ ساكنٌ للعقد، بلا قاعدة بيانات
// تشغيل: npx tsx test-account-lock.ts
import { readFileSync } from 'fs';
import { LOCKED_MESSAGE, LOCKED_CODE } from './src/lib/account-lock.js';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
};
const read = (p: string) => readFileSync(p, 'utf8');
/** الكودُ وحده — التعليقاتُ ليست سلوكاً */
const code = (t: string) => t.split('\n')
  .filter(l => { const x = l.trimStart(); return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*'); })
  .join('\n');

const auth = read('./src/routes/player-auth.routes.ts');
const mw = read('./src/middleware/player-auth.middleware.ts');
const routes = read('./src/routes/player.routes.ts');
const schema = read('./src/schemas/player.schema.ts');
const deploy = read('../deploy.sh');

console.log('');
console.log('🧪 الرسالةُ كما طلبها المالك — حرفاً بحرف');
check('النصُّ مطابق', LOCKED_MESSAGE === 'حدث خطأ، يرجى التواصل مع الإدارة.');
check('لا تذكر «مقفول»', !LOCKED_MESSAGE.includes('مقفول') && !LOCKED_MESSAGE.includes('قفل'));
check('لا تذكر سبباً', !LOCKED_MESSAGE.includes('سبب'));
check('رمزٌ للواجهات لا للمستعمل', LOCKED_CODE === 'ACCOUNT_LOCKED');

console.log('');
console.log('🧪 العمودُ وقيمتُه الافتراضيّة');
check('is_locked في المخطّط', schema.includes("isLocked: boolean('is_locked')"));
check('افتراضيّاً false', schema.includes(".default(false).notNull()"));
check('والترحيلُ يُنشئه بنفس الافتراض',
  deploy.includes('ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false'));
check('جدولُ المحاولات في الترحيل', deploy.includes('CREATE TABLE IF NOT EXISTS locked_login_attempts'));

console.log('');
console.log('🧪 الفحصُ في الخادم عند الدخول');
check('مسارُ الدخول يفحص isLocked', code(auth).includes('isLocked'));
check('ويعيد 403 بالرسالة الموحّدة',
  code(auth).includes('status(403)') && code(auth).includes('LOCKED_MESSAGE'));
check('ولا يكتب النصَّ حرفيّاً في المسار', !code(auth).includes('يرجى التواصل مع الإدارة'));

// 🔴 ترتيبُ الفحوص: القفلُ **بعد** كلمة السرّ — وإلّا صار فرقُ الرسالة كاشفاً
//    لأيّ مجهولٍ أنّ هذا الرقم لحسابٍ موجودٍ ومقفول.
const iPass = code(auth).indexOf('verifyPlayerPassword');
const iLock = code(auth).indexOf('status(403)');
check('يقع بعد التحقّق من كلمة السرّ', iPass > 0 && iLock > iPass);

console.log('');
console.log('🧪 القفلُ يسري على الجلسة القائمة');
check('الوسيطُ يقرأ isLocked', code(mw).includes('isLocked: players.isLocked'));
check('ويحجب الطلب', code(mw).includes('row.isLocked') && code(mw).includes('status(403)'));
check('بنفس الرسالة الموحّدة', code(mw).includes('LOCKED_MESSAGE'));

console.log('');
console.log('🧪 صلاحيّةُ الأدمن وحده');
check('مسارُ القفل موجود', routes.includes("'/:id/toggle-lock'"));
check('محروسٌ بـadminOnly',
  /toggle-lock',\s*authenticate,\s*adminOnly/.test(routes));
check('ومسارُ المحاولات كذلك',
  /lock-attempts',\s*authenticate,\s*adminOnly/.test(routes));
check('الفكُّ يمسح السببَ والفاعل',
  code(routes).includes('lockedReason: newValue ? reason') && code(routes).includes('lockedBy: newValue'));

console.log('');
console.log('🧪 تسجيلُ موقع المحاولة');
check('يُسجَّل عند حسابٍ مقفول', code(auth).includes('lockedLoginAttempts'));
check('العنوانُ عبر clientIp لا من الترويسة الخام', code(auth).includes('clientIp(req)'));
check('ولا يستعمل x-forwarded-for مباشرةً', !code(auth).includes("x-forwarded-for"));
check('يحفظ نتيجةَ كلمة السرّ', code(auth).includes('passwordOk: valid'));

// 🔴 التسجيلُ **قبل** ردّ «كلمة سرّ خاطئة»: مَن يجرّب كلمةً خاطئةً على حسابٍ
//    مقفول إشارةٌ لا تقلّ عمّن يعرفها — ولو سُجّل بعده لضاعت كلُّ محاولةٍ فاشلة.
const iLog = code(auth).indexOf('lockedLoginAttempts');
const iWrong = code(auth).indexOf('if (!valid)');
check('يقع قبل ردّ كلمة السرّ الخاطئة', iLog > 0 && iWrong > iLog);
check('وفشلُ التسجيل لا يفتح الباب', code(auth).includes("console.error('⚠️ locked-attempt log failed"));

console.log('');
console.log(`${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} نجح · ${fail} فشل`);
process.exit(fail === 0 ? 0 : 1);
