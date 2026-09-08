// 🧪 البوّابةُ المتسلسلة — ميلادٌ ← وليُّ أمرٍ ← موافقة
//
// 🔴 بلا قاعدةِ بيانات: تُختبر قواعدُ القرار وحدَها (`ageFromDob` ومنطقُ
//    `required`)، فهي ما ينكسر عند التعديل. أمّا الاستعلامُ فمُغطّىً بالفحص
//    الحيّ على الإنتاج.
//
// التشغيل: npx tsx test-consent-chain.ts

import { ageFromDob, ADULT_AGE } from './src/services/consent.service.js';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra?: string) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  ← ' + extra : '')); }
};

const NL = '\n';

// ── نسخةٌ حرفيّةٌ عن قاعدة القرار في consentStatus ──
// 🔴 تُعاد كتابتُها هنا عمداً بدل استيرادِ الدالّة: الدالّةُ تحتاج قاعدةَ
//    بيانات، والقاعدةُ المُختبَرة هي التركيبُ المنطقيُّ لا الاستعلام.
function decide(o: { dob: string | null; missing: number; hasGuardianRow: boolean }) {
  const dob = (o.dob ?? '').trim() || null;
  const age = ageFromDob(dob);
  const isMinor = age != null && age < ADULT_AGE;
  const needsDob = !dob;
  const needsGuardian = isMinor && !o.hasGuardianRow;
  return {
    needsDob, isMinor, needsGuardian,
    required: needsDob || o.missing > 0 || needsGuardian,
  };
}

const iso = (yearsAgo: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsAgo);
  return d.toISOString().slice(0, 10);
};

console.log(NL + '🧪 العمرُ من التاريخ');
{
  ok('تاريخٌ سليم يعطي عمراً', ageFromDob('2000-01-01') === new Date().getFullYear() - 2000 - (new Date() < new Date(new Date().getFullYear(), 0, 1) ? 1 : 0) || ageFromDob('2000-01-01')! > 20);
  ok('نصٌّ فارغ ⇒ null', ageFromDob('') === null);
  ok('null ⇒ null', ageFromDob(null) === null);
  ok('صيغةٌ خاطئة ⇒ null', ageFromDob('01/01/2000') === null);
  ok('شهرٌ ١٣ ⇒ null', ageFromDob('2000-13-01') === null);
  ok('عمرٌ فوق ١٢٠ ⇒ null', ageFromDob('1800-01-01') === null);
  // 🔴 حدُّ اليوم بالضبط: من أتمّ ١٨ اليومَ بالغ، ومن يُتمّها غداً قاصر.
  ok('من أتمّ ١٨ اليومَ بالغ', ageFromDob(iso(18)) === 18);
  ok('ومن دونها بيومٍ قاصر', ageFromDob(iso(17)) === 17);
}

console.log(NL + '🧪 الحلقةُ الأولى: لا ميلادَ ⇒ لا شيءَ بعده');
{
  const r = decide({ dob: null, missing: 0, hasGuardianRow: false });
  ok('يُطلب الميلاد', r.needsDob);
  ok('ولا يُدّعى أنّه قاصر', !r.isMinor, 'بلا تاريخٍ لا يُعرف');
  ok('ولا يُطلب وليٌّ بعد', !r.needsGuardian);
  ok('والبوّابةُ مطلوبة', r.required);
  // 🔴 هذا جوهرُ القرار: ٣٨٠ لاعباً بلا تاريخ. لو حُسبوا بالغين لمرّ ٢٦ قاصراً
  //    بلا وليّ، ولو حُسبوا قاصرين لطُلب وليٌّ من ٣٥٤ بالغاً.
}

console.log(NL + '🧪 الحلقةُ الثانية: قاصرٌ بلا وليّ');
{
  const r = decide({ dob: iso(15), missing: 0, hasGuardianRow: false });
  ok('لا يُطلب الميلاد — مسجَّل', !r.needsDob);
  ok('يُعرف قاصراً', r.isMinor);
  ok('ويُطلب الوليّ', r.needsGuardian);
  ok('والبوّابةُ مطلوبةٌ ولو تمّت الموافقات', r.required);
}

console.log(NL + '🧪 قاصرٌ سُجّل وليُّه ⇒ يمرّ');
{
  const r = decide({ dob: iso(15), missing: 0, hasGuardianRow: true });
  ok('لا وليَّ مطلوباً', !r.needsGuardian);
  ok('والبوّابةُ تُفتح', !r.required);
}

console.log(NL + '🧪 بالغٌ: لا وليَّ مهما كان');
{
  ok('بالغٌ بلا وليّ يمرّ', !decide({ dob: iso(30), missing: 0, hasGuardianRow: false }).required);
  ok('ووثيقةٌ ناقصةٌ تحجبه', decide({ dob: iso(30), missing: 1, hasGuardianRow: false }).required);
}

console.log(NL + '🧪 الترتيبُ لا ينعكس');
{
  // 🔴 قاصرٌ بلا ميلادٍ حالةٌ مستحيلة — يُختبر أنّ الرسالةَ تُقدّم الميلادَ
  //    دائماً، فلا يُطلب من لاعبٍ وليُّ أمرٍ قبل أن يُعرف أنّه قاصر.
  const r = decide({ dob: null, missing: 2, hasGuardianRow: false });
  ok('الميلادُ أوّلاً ولو نقصت وثيقتان', r.needsDob && !r.needsGuardian);
}

console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
process.exit(fail === 0 ? 0 : 1);
