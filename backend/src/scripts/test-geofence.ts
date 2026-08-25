// ══════════════════════════════════════════════════════
// 🧪 اختبار سياج الفعاليّة — المسافة وقواعد القبول (نقيّ بلا قاعدة بيانات)
// يختبر haversineM و isUsableFix بالدوالّ الحقيقيّة، ثمّ يحاكي ترتيب شروط
// verifyPresence على الحدود بالضبط — فالحدّ هو ما ينكسر لا الوسط.
// تشغيل: npx tsx src/scripts/test-geofence.ts
// ══════════════════════════════════════════════════════
import {
  haversineM, isUsableFix, FIX_MAX_AGE_MS, FIX_MAX_ACCURACY_M,
} from '../services/geofence.service.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

// نقاط حقيقيّة من قاعدة الإنتاج
const MAZAJ = { lat: 31.9731922, lng: 35.8836021 };   // مزاج افندينا
const JALSA = { lat: 32.0259019, lng: 35.8717759 };   // كافية جلسة
const MAZAJ_VIEW = { lat: 31.9731922, lng: 35.8810218 }; // مركز عرض الرابط لا الدبّوس

/** نسخةٌ من ترتيب شروط verifyPresence — الجزء الذي لا يمسّ القاعدة. */
function decide(venue: {lat:number;lng:number;radiusM:number}, fix: any) {
  if (!isUsableFix(fix)) return 'LOCATION_REQUIRED';
  if (fix.capturedAt != null && Date.now() - fix.capturedAt > FIX_MAX_AGE_MS) return 'LOCATION_STALE';
  if (fix.accuracyM != null && fix.accuracyM > FIX_MAX_ACCURACY_M) return 'LOCATION_INACCURATE';
  if (fix.isMocked === true) return 'LOCATION_MOCKED';
  const d = haversineM(venue.lat, venue.lng, fix.lat, fix.lng);
  const slack = Math.min(fix.accuracyM ?? 0, FIX_MAX_ACCURACY_M);
  return d <= venue.radiusM + slack ? 'OK' : 'TOO_FAR';
}

function main() {
  console.log('🧪 اختبار سياج الفعاليّة\n');

  section('1) المسافة — haversine');
  {
    check('النقطة نفسها = صفر', haversineM(MAZAJ.lat, MAZAJ.lng, MAZAJ.lat, MAZAJ.lng) === 0);
    const between = haversineM(MAZAJ.lat, MAZAJ.lng, JALSA.lat, JALSA.lng);
    check(`بين مكانَي النادي ≈ ٦ كم (${between} m)`, between > 5500 && between < 6500, String(between));
    check('متماثلة في الاتّجاهين',
      haversineM(MAZAJ.lat, MAZAJ.lng, JALSA.lat, JALSA.lng) === haversineM(JALSA.lat, JALSA.lng, MAZAJ.lat, MAZAJ.lng));

    // 🔴 الفارق الذي جعلنا نرفض إحداثيّات الرابط: مركز العرض ليس الدبّوس
    const drift = haversineM(MAZAJ.lat, MAZAJ.lng, MAZAJ_VIEW.lat, MAZAJ_VIEW.lng);
    check(`مركز عرض الرابط يبعد عن الدبّوس > ٢٠٠م (${drift} m)`, drift > 200, String(drift));

    // درجةٌ من خطّ العرض ≈ ١١١ كم — تحقّقٌ من المقياس
    const oneDeg = haversineM(31.9, 35.88, 32.9, 35.88);
    check(`درجة عرضٍ واحدة ≈ ١١١ كم (${oneDeg} m)`, Math.abs(oneDeg - 111_195) < 500, String(oneDeg));
  }

  section('2) صلاحية القراءة شكلاً');
  {
    check('قراءة سليمة', isUsableFix({ lat: 31.97, lng: 35.88 }) === true);
    check('null مرفوضة', isUsableFix(null) === false);
    check('بلا خطّ طول', isUsableFix({ lat: 31.97 }) === false);
    check('نصّ رقميّ مقبول', isUsableFix({ lat: '31.97', lng: '35.88' }) === true);
    check('عرضٌ خارج المدى مرفوض', isUsableFix({ lat: 120, lng: 35 }) === false);
    check('طولٌ خارج المدى مرفوض', isUsableFix({ lat: 31, lng: 200 }) === false);
    check('NaN مرفوضة', isUsableFix({ lat: 'x', lng: 'y' }) === false);
    // 🔴 صفر/صفر إحداثيّةٌ صالحةٌ شكلاً (وسط الأطلسيّ) — ترفضها المسافة لا الشكل
    check('0,0 صالحة شكلاً (يرفضها السياج بالمسافة)', isUsableFix({ lat: 0, lng: 0 }) === true);
  }

  section('3) القرار على الحدود');
  {
    const V = { ...MAZAJ, radiusM: 200 };
    const now = () => Date.now();

    check('داخل المكان تماماً', decide(V, { ...MAZAJ, accuracyM: 15, capturedAt: now() }) === 'OK');
    check('المكان الآخر (٦ كم) يُرفض', decide(V, { ...JALSA, accuracyM: 15, capturedAt: now() }) === 'TOO_FAR');

    // نقطةٌ تبعد ٣٠٠م — خارج نصف القطر لكن ضمنه بدقّةٍ ضعيفة
    const far300 = { lat: MAZAJ.lat + 0.0027, lng: MAZAJ.lng };
    const d300 = haversineM(MAZAJ.lat, MAZAJ.lng, far300.lat, far300.lng);
    check(`النقطة المرجعيّة ≈ ٣٠٠م (${d300} m)`, d300 > 280 && d300 < 320, String(d300));
    check('٣٠٠م بدقّةٍ ممتازة → يُرفض', decide(V, { ...far300, accuracyM: 10, capturedAt: now() }) === 'TOO_FAR');
    check('٣٠٠م بدقّة ١٥٠م → يُقبل (الدقّة تُضاف لا تُقارَن)',
      decide(V, { ...far300, accuracyM: 150, capturedAt: now() }) === 'OK');

    check('بلا قراءة → LOCATION_REQUIRED', decide(V, null) === 'LOCATION_REQUIRED');
    check('قراءة عمرها ٥ دقائق → LOCATION_STALE',
      decide(V, { ...MAZAJ, accuracyM: 10, capturedAt: now() - 300_000 }) === 'LOCATION_STALE');
    check('قراءة عمرها دقيقة → تمرّ',
      decide(V, { ...MAZAJ, accuracyM: 10, capturedAt: now() - 60_000 }) === 'OK');
    check('دقّة ١٢٠٠م → LOCATION_INACCURATE',
      decide(V, { ...MAZAJ, accuracyM: 1200, capturedAt: now() }) === 'LOCATION_INACCURATE');
    check('موقعٌ مزيَّف → LOCATION_MOCKED',
      decide(V, { ...MAZAJ, accuracyM: 10, capturedAt: now(), isMocked: true }) === 'LOCATION_MOCKED');

    // 🔴 الترتيب مقصود: القِدَم يُفحص قبل الدقّة قبل التزوير قبل المسافة
    check('القديمة تُرفض بالقِدَم لا بالمسافة ولو كانت بعيدة',
      decide(V, { ...JALSA, accuracyM: 10, capturedAt: now() - 300_000 }) === 'LOCATION_STALE');
    check('المزيَّفة داخل المكان تُرفض رغم قربها',
      decide(V, { ...MAZAJ, accuracyM: 5, capturedAt: now(), isMocked: true }) === 'LOCATION_MOCKED');

    // سقف الهامش: دقّةٌ سيّئةٌ جدّاً تُرفض قبل أن تُمنح هامشاً لا نهائيّاً
    check('لا يُمنح هامشٌ بلا سقف — دقّة ٥٠٠م تُرفض قبل حساب المسافة',
      decide(V, { ...far300, accuracyM: 500, capturedAt: now() }) === 'LOCATION_INACCURATE');

    // بلا حقول اختياريّة إطلاقاً
    check('قراءةٌ بلا دقّة ولا زمن داخل المكان → تمرّ', decide(V, { ...MAZAJ }) === 'OK');
    check('قراءةٌ بلا دقّة ولا زمن بعيدة → تُرفض', decide(V, { ...JALSA }) === 'TOO_FAR');
  }

  section('4) نصف القطر يغيّر الحكم');
  {
    const far300 = { lat: MAZAJ.lat + 0.0027, lng: MAZAJ.lng, accuracyM: 10, capturedAt: Date.now() };
    check('نصف قطر ٢٠٠م يرفضها', decide({ ...MAZAJ, radiusM: 200 }, far300) === 'TOO_FAR');
    check('نصف قطر ٥٠٠م يقبلها', decide({ ...MAZAJ, radiusM: 500 }, far300) === 'OK');
  }

  console.log('\n══════════════════════════════════════');
  console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
  if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  · ' + f)); process.exit(1); }
  console.log('\n🎉 سياج الفعاليّة يقرّر بالشكل المتوقع.');
  process.exit(0);
}
main();
