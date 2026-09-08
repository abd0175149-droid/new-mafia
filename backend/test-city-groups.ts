// 🧪 اختيارُ مجموعة الواتساب — منطقةٌ وجنسٌ وأولويّة
//
// 🔴 يُختبر `pickGroup` وحدَها: هي المنطقُ الخالص، والباقي قراءةُ جدولٍ يديره
//    المالك. القواعدُ هنا مصطنعةٌ عمداً لتغطّي التداخلَ الذي لا يظهر في بذرة
//    الإنتاج الثلاثيّة.
//
// التشغيل: npx tsx test-city-groups.ts

import { pickGroup, validCoords, distKm, type WaGroupRule } from './src/lib/city-groups.js';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra?: string) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  ← ' + extra : '')); }
};
const NL = '\n';

const R = (o: Partial<WaGroupRule> & { id: number; name: string }): WaGroupRule => ({
  latitude: null, longitude: null, radiusKm: null,
  gender: 'ANY', url: 'https://chat.whatsapp.com/' + o.id,
  isDefault: false, isActive: true, ...o,
});

// عمّان · الزرقاء — الإحداثيّاتُ الحقيقيّة المستعملة في البذرة
const AMMAN = { lat: 31.9539, lng: 35.9106 };
const ZARQA = { lat: 32.0728, lng: 36.0880 };

const RULES: WaGroupRule[] = [
  R({ id: 1, name: 'العامّة', isDefault: true }),
  R({ id: 2, name: 'الزرقاء ذكور', latitude: ZARQA.lat, longitude: ZARQA.lng, radiusKm: 20, gender: 'MALE' }),
  R({ id: 3, name: 'الزرقاء إناث', latitude: ZARQA.lat, longitude: ZARQA.lng, radiusKm: 20, gender: 'FEMALE' }),
];

console.log(NL + '🧪 الحالاتُ الثلاث المطلوبة');
{
  ok('عمّان ⇒ العامّة', pickGroup(RULES, AMMAN, 'MALE')?.id === 1);
  ok('الزرقاء + ذكر ⇒ مجموعةُ الذكور', pickGroup(RULES, ZARQA, 'MALE')?.id === 2);
  ok('الزرقاء + أنثى ⇒ مجموعةُ الإناث', pickGroup(RULES, ZARQA, 'FEMALE')?.id === 3);
  // 🔴 العمودُ حمل `female` بحالةٍ صغيرة في ٧ صفوفٍ على الإنتاج — لو قُورن
  //    حرفيّاً لذهبت سبعُ لاعباتٍ إلى مجموعة الذكور.
  ok('و«female» الصغيرة تُقرأ أنثى', pickGroup(RULES, ZARQA, 'female')?.id === 3);
}

console.log(NL + '🧪 من لا تطابقه دائرةٌ يقع على الافتراضيّة');
{
  ok('إربد ⇒ العامّة', pickGroup(RULES, { lat: 32.5556, lng: 35.85 }, 'MALE')?.id === 1);
  ok('بلا إحداثيّاتٍ ⇒ العامّة', pickGroup(RULES, null, 'FEMALE')?.id === 1);
  ok('ولا افتراضيّةَ ⇒ null (يقع على الاحتياطيّ الصلب)',
    pickGroup(RULES.filter(r => !r.isDefault), { lat: 32.5, lng: 35.8 }, 'MALE') === null);
}

console.log(NL + '🧪 الأخصُّ يفوز عند التداخل');
{
  // حيٌّ داخل الزرقاء — دائرتان متداخلتان، والأصغرُ هو المقصود
  const withHood = [...RULES, R({
    id: 4, name: 'حيّ الزرقاء الجديدة', latitude: ZARQA.lat, longitude: ZARQA.lng,
    radiusKm: 3, gender: 'MALE',
  })];
  ok('الدائرةُ الأصغرُ تسبق الأكبر', pickGroup(withHood, ZARQA, 'MALE')?.id === 4);
  // وخارجَ الصغيرة داخلَ الكبيرة ⇒ الكبيرة
  const edge = { lat: ZARQA.lat + 0.09, lng: ZARQA.lng };  // ~10 كم شمالاً
  ok('وخارجَها داخلَ الكبيرة ⇒ الكبيرة', pickGroup(withHood, edge, 'MALE')?.id === 2,
    String(pickGroup(withHood, edge, 'MALE')?.id));

  // 🔴 قاعدةُ الجنس تسبق ANY ولو كانت أوسع: مجموعةُ الإناث ليست تفصيلاً
  //    تجميليّاً، فدائرةٌ عامّةٌ ضيّقةٌ لا تسحب لاعبةً منها.
  const withAny = [...RULES, R({
    id: 5, name: 'الزرقاء للجميع', latitude: ZARQA.lat, longitude: ZARQA.lng,
    radiusKm: 2, gender: 'ANY',
  })];
  ok('قاعدةُ الجنس تسبق «الجميع» ولو كانت أوسع',
    pickGroup(withAny, ZARQA, 'FEMALE')?.id === 3, String(pickGroup(withAny, ZARQA, 'FEMALE')?.id));
}

console.log(NL + '🧪 المعطَّلةُ لا تُختار');
{
  const off = RULES.map(r => r.id === 2 ? { ...r, isActive: false } : r);
  ok('معطَّلةٌ تُتخطّى إلى العامّة', pickGroup(off, ZARQA, 'MALE')?.id === 1);
  const allOff = RULES.map(r => ({ ...r, isActive: false }));
  ok('وتعطيلُ الكلّ ⇒ null', pickGroup(allOff, ZARQA, 'MALE') === null);
}

console.log(NL + '🧪 الإحداثيّاتُ الفاسدة');
{
  // 🔴 (0,0) عددٌ صالحٌ وهي في المحيط الأطلسيّ — تُنتجها أجهزةٌ تفشل قراءتُها،
  //    وبلا حارسٍ تُقاس المسافةُ إليها فتُطابق أوسعَ دائرةٍ في الجدول.
  ok('صفرٌ وصفر ⇒ مرفوضة', validCoords(0, 0) === null);
  ok('null ⇒ مرفوضة', validCoords(null, null) === null);
  ok('نصٌّ ⇒ مرفوض', validCoords('abc', 'def') === null);
  ok('خارجَ المدى ⇒ مرفوض', validCoords(200, 400) === null);
  ok('وعمّانُ مقبولة', validCoords(AMMAN.lat, AMMAN.lng) !== null);
  ok('والسالبُ الصالح مقبول', validCoords(-33.86, 151.2) !== null);
}

console.log(NL + '🧪 المسافة');
{
  const d = distKm(AMMAN.lat, AMMAN.lng, ZARQA.lat, ZARQA.lng);
  ok('عمّان↔الزرقاء نحو ٢٢ كم', d > 18 && d < 26, d.toFixed(1) + ' كم');
  ok('والنقطةُ نفسُها صفر', distKm(AMMAN.lat, AMMAN.lng, AMMAN.lat, AMMAN.lng) < 0.001);
}

console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
process.exit(fail === 0 ? 0 : 1);
