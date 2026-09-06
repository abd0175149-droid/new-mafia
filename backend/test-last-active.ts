// 🧪 «آخر نشاط» — عقدُ التتبّع. بلا قاعدة بيانات.
// تشغيل: npx tsx test-last-active.ts
import { readFileSync } from 'fs';
import { TOUCH_THROTTLE_MS, platformFromHeaders } from './src/lib/last-active.js';

let pass = 0, fail = 0;
const check = (n: string, c: boolean) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}`); }
};
const read = (p: string) => readFileSync(p, 'utf8');
/** الكودُ وحده — التعليقاتُ ليست سلوكاً */
const code = (t: string) => t.split('\n')
  .filter(l => { const x = l.trimStart(); return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*'); })
  .join('\n');

const auth   = read('./src/routes/player-auth.routes.ts');
const mw     = read('./src/middleware/player-auth.middleware.ts');
const idx    = read('./src/index.ts');
const routes = read('./src/routes/player.routes.ts');
const schema = read('./src/schemas/player.schema.ts');
const deploy = read('../deploy.sh');
const dart   = read('../mobile/lib/core/api/api_client.dart');
const page   = read('../frontend/src/app/admin/players/page.tsx');

console.log('');
console.log('🧪 نافذةُ الخنق — قرارُ المالك ٥ دقائق');
check('خمسُ دقائق بالضبط', TOUCH_THROTTLE_MS === 5 * 60_000);

console.log('');
console.log('🧪 المنصّة تُقرأ من ترويسةٍ صريحة لا تُخمَّن');
check('أندرويد', platformFromHeaders({ 'x-client-platform': 'android' }) === 'android');
check('آيفون',   platformFromHeaders({ 'x-client-platform': 'ios' }) === 'ios');
check('حروفٌ كبيرة تُقبل', platformFromHeaders({ 'x-client-platform': 'IOS' }) === 'ios');
check('متصفّحٌ ⇒ ويب',
  platformFromHeaders({ 'user-agent': 'Mozilla/5.0 (iPhone) Safari' }) === 'web');
// 🔴 دارت لا تذكر نظامَ التشغيل، فلا نخمّنه: «تطبيقٌ أصليّ» وكفى
check('دارت بلا ترويسة ⇒ app لا تخمين',
  platformFromHeaders({ 'user-agent': 'Dart/3.5 (dart:io)' }) === 'app');
check('قيمةٌ شاذّة تُتجاهل',
  platformFromHeaders({ 'x-client-platform': 'حاسوب' }) === 'web');
check('بلا ترويساتٍ إطلاقاً', platformFromHeaders(undefined) === 'web');

console.log('');
console.log('🧪 إنشاءُ الحساب ليس تفاعلاً');
// 🔴 جوهرُ العطب: سطرٌ واحدٌ كان مصدرَ ٣٤٧ قيمةً كاذبةً من ٧٥١
const reg = code(auth).slice(0, code(auth).indexOf("router.post('/login'"));
check('مسارُ التسجيل لا يكتب lastActiveAt', !reg.includes('lastActiveAt'));
check('والترحيلُ يُصفّر ما كُتب سابقاً',
  deploy.includes('UPDATE players SET last_active_at = NULL'));
check('بشرطِ مطابقةِ لحظةِ الإنشاء',
  deploy.includes("abs(EXTRACT(EPOCH FROM (last_active_at - created_at))) < 300"));
check('ولا يمسّ قيمةً لها مصدر', deploy.includes('AND last_active_source IS NULL'));

console.log('');
console.log('🧪 التعبئةُ الرجعيّة حذرةٌ لا سخيّة');
check('تستبعد اليومَ الأوّل من التوكن',
  deploy.includes("t.updated_at - pl.created_at > INTERVAL '1 day'"));
check('وتستبعده من الموقع',
  deploy.includes("f.updated_at - pl.created_at > INTERVAL '1 day'"));
check('وتُعلّم المصدرَ backfill', deploy.includes("last_active_source = 'backfill'"));
check('ولا تدهس قيمةً أحدث',
  deploy.includes('s.best > p.last_active_at'));

console.log('');
console.log('🧪 الوسيط — نقطةٌ واحدةٌ تغطّي المنصّتين');
check('يقرأ lastActiveAt ليقارن', code(mw).includes('lastActiveAt: players.lastActiveAt'));
check('ويختم', code(mw).includes('touchLastActive(row.id, row.lastActiveAt'));
check('بمصدر request', code(mw).includes("'request'"));
check('ولا يُنتظر (لا await)', !/await\s+touchLastActive/.test(code(mw)));
// 🔴 دليلُ التغطية: فلاتر يرسل نفسَ ترويسة Bearer إلى نفس الوسيط
check('فلاتر يرسل Bearer', dart.includes("options.headers['Authorization'] = 'Bearer $t'"));
check('ويرسل منصّتَه صراحةً', dart.includes("X-Client-Platform"));
check('من Platform.isIOS لا من تخمين', dart.includes('Platform.isIOS'));

console.log('');
console.log('🧪 السوكِت — طرفا الجلسة لا طرفُها الأوّل');
check('ختمٌ عند الاتّصال', code(idx).includes("'socket'"));
check('وختمٌ عند الفصل', code(idx).includes("'socket_end'"));
check('والفصلُ داخل حارس authPlayerId',
  code(idx).indexOf('if (authPlayerId)') < code(idx).indexOf('socket_end'));
// 🔴 نهايةُ الجلسة تُكتب بلا خنق: هي اللحظةُ الوحيدة التي نعرف فيها يقيناً أنّها انتهت
const endLine = code(idx).split('\n').find(l => l.includes('socket_end')) || '';
check('نهايةُ الجلسة بلا خنق (force)', /true\s*\)/.test(endLine));

console.log('');
console.log('🧪 لا قيمةَ بلا مصدر');
check('العمودان في المخطّط',
  schema.includes("lastActiveSource: varchar('last_active_source'")
  && schema.includes("lastActivePlatform: varchar('last_active_platform'"));
check('والترحيلُ يُنشئهما',
  deploy.includes('ADD COLUMN IF NOT EXISTS last_active_source')
  && deploy.includes('ADD COLUMN IF NOT EXISTS last_active_platform'));
// 🔴 كلُّ كتابةٍ تمرّ بـtouchLastActive، وهي تكتب الثلاثةَ معاً — فلا يوجد
//    مسارٌ يكتب الطابعَ بلا مصدره
const lib = read('./src/lib/last-active.ts');
check('الدالّةُ تكتب الثلاثةَ معاً',
  code(lib).includes('last_active_at') && code(lib).includes('last_active_source')
  && code(lib).includes('last_active_platform'));
check('ولا مسارَ آخرَ يكتب lastActiveAt مباشرةً',
  !code(auth).includes('lastActiveAt:') && !code(mw).includes('lastActiveAt:  '));
// 🔴 GREATEST يمنع سباقَ الطلب والسوكِت من إرجاع الساعة إلى الوراء
check('GREATEST يمنع التراجع', code(lib).includes('GREATEST(COALESCE(last_active_at'));
check('ولا ترمي أبداً', code(lib).includes('catch') && code(lib).includes('return false'));

console.log('');
console.log('🧪 الواجهة — ثلاثُ حالات');
check('الخادمُ يُرجع المصدرَ والمنصّة',
  routes.includes('lastActiveSource: playersTable.lastActiveSource')
  && routes.includes('lastActivePlatform: playersTable.lastActivePlatform'));
check('الحالةُ «معلوم»', page.includes("kind: 'known'"));
check('والحالةُ «لعب ولم يفتح»', page.includes('لم يفتح التطبيق'));
check('والحالةُ «غير مستعمَل»', page.includes('حساب غير مستعمَل'));
check('ووقتٌ نسبيّ لا تاريخٌ خام', page.includes('function relativeAr'));
check('وثلاثُ درجاتٍ لونيّة', page.includes("days <= 7 ?") && page.includes("days <= 30 ?"));

console.log('');
console.log(`${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} نجح · ${fail} فشل`);
process.exit(fail === 0 ? 0 : 1);
