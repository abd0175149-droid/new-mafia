// ══════════════════════════════════════════════════════
// 🧪 عتبةُ تاريخ المواقع — نقيّةٌ بلا قاعدة بيانات
// ══════════════════════════════════════════════════════
// القرارُ الوحيد في الميزة كلّها: أيُسجَّل هذا الموقع أم هو تكرار؟
// العتبة (قرار المالك): نقطةٌ جديدة إن بَعُدت ١٠٠م **أو** مرّت ٣ دقائق.
//
//   npx tsx src/scripts/test-fix-history.ts
// ══════════════════════════════════════════════════════
import { shouldAppendFix, haversineM } from '../services/geofence.service.js';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); }
};

// نقطةُ مرجع: عمّان
const LAT = 31.9539, LNG = 35.9106;
const T0 = Date.parse('2026-09-05T20:00:00Z');
const MIN = 60_000;

/** يزيح النقطةَ شمالاً بأمتار (درجةُ العرض ≈ 111.32 كم) */
const north = (m: number) => ({ lat: LAT + m / 111_320, lng: LNG });

const base = { lat: LAT, lng: LNG, capturedAt: T0 };
const at = (p: { lat: number; lng: number }, ms: number) => ({ ...p, capturedAt: T0 + ms });

console.log('\n━━━ ١) الإزاحة وحدها تكفي ━━━');
ok('١٥٠م بعد ثانيةٍ واحدة ⇒ يُسجَّل',
  shouldAppendFix(base, at(north(150), 1000)));
ok('١٠١م بعد ثانية ⇒ يُسجَّل (فوق العتبة)',
  shouldAppendFix(base, at(north(101), 1000)));
ok('٩٩م بعد ثانية ⇒ يُرفض (دون العتبة والزمنُ قصير)',
  !shouldAppendFix(base, at(north(99), 1000)));

console.log('\n━━━ ٢) الزمنُ وحده يكفي ━━━');
ok('المكانُ نفسه بعد ٤ دقائق ⇒ يُسجَّل',
  shouldAppendFix(base, at(north(0), 4 * MIN)));
ok('المكانُ نفسه بعد ٣ دقائق بالضبط ⇒ يُسجَّل (العتبةُ شاملة)',
  shouldAppendFix(base, at(north(0), 3 * MIN)));
ok('المكانُ نفسه بعد دقيقة ⇒ يُرفض',
  !shouldAppendFix(base, at(north(0), 1 * MIN)));

console.log('\n━━━ ٣) «أو» لا «و» ━━━');
ok('٥٠م بعد ٥ دقائق ⇒ يُسجَّل (الزمنُ كفى وحده)',
  shouldAppendFix(base, at(north(50), 5 * MIN)));
ok('٢٠٠م بعد ١٠ ثوانٍ ⇒ يُسجَّل (المسافةُ كفت وحدها)',
  shouldAppendFix(base, at(north(200), 10_000)));
ok('٢٠م بعد ٣٠ ثانية ⇒ يُرفض (لا هذا ولا ذاك)',
  !shouldAppendFix(base, at(north(20), 30_000)));

console.log('\n━━━ ٤) السيناريو الذي بُنيت له العتبة ━━━');
// لاعبٌ يطلب خمسةَ أصناف في دقائق، جالسٌ في مكانه — يجب ألّا يترك خمسَ نقاط
{
  let last = base, kept = 0;
  for (const [m, sec] of [[3, 20], [2, 45], [5, 70], [1, 95], [4, 120]] as Array<[number, number]>) {
    const next = at(north(m), sec * 1000);
    if (shouldAppendFix(last, next)) { kept++; last = next; }
  }
  ok(`خمسةُ طلباتٍ في دقيقتين من مقعده ⇒ لا نقطةَ إضافيّة (سُجّل ${kept})`, kept === 0, `${kept}`);
}
// ومن يتحرّك فعلاً بين مكانين يُسجَّل كلّ انتقال
{
  let last = base, kept = 0;
  for (const m of [400, 900, 1500]) {
    const next = at(north(m), 30_000 * (kept + 1));
    if (shouldAppendFix(last, next)) { kept++; last = next; }
  }
  ok('ثلاثةُ انتقالاتٍ حقيقيّة ⇒ ثلاثُ نقاط', kept === 3, `${kept}`);
}

console.log('\n━━━ ٥) ساعةُ جهازٍ منحرفة ━━━');
ok('قراءةٌ أقدمُ ممّا لدينا ⇒ تُرفض ولو كانت بعيدة',
  !shouldAppendFix(base, at(north(5000), -60_000)));
ok('قراءةٌ بالزمن نفسه وبعيدة ⇒ تُسجَّل (المسافةُ كفت، والفارقُ ليس سالباً)',
  shouldAppendFix(base, at(north(500), 0)));

console.log('\n━━━ ٦) الهندسة ━━━');
{
  const d = haversineM(LAT, LNG, north(100).lat, north(100).lng);
  ok(`إزاحةُ ١٠٠م تُقاس ١٠٠م (±١) — قيست ${d}م`, Math.abs(d - 100) <= 1, `${d}`);
}

console.log(`\n══════════════════════════════════\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail === 0) console.log('🎉 عتبةُ التكرار تطبّق قرار المالك: ١٠٠م أو ٣ دقائق.');
process.exit(fail === 0 ? 0 : 1);
