// ══════════════════════════════════════════════════════
// ☕🍔 منيو «كافية جلسة» — مشروبات الكافيه + مأكولات مطعم well
// مصدران: منيو_كافيه_جلسة.xlsx (٥٨ سطراً) و منيو_مطعم_well.xlsx (٤٢ سطراً)
// ⇐ ٦٢ صنفاً في مستويين، لأنّ الأسطر التي تختلف في «الحجم/النوع» وحده
//   صنفٌ واحدٌ بخياراتٍ لا أصنافٌ متعدّدة.
//
// هذا الملفّ **وصفٌ لا منطق**: كلّ المنطق في services/menu-import.service.ts،
// فمكانٌ جديد = ملفُّ وصفٍ مثل هذا ولا شيء غيره.
//
// 💰 حصّة النادي تُدخَل صفراً لكلّ صنف — الملفّان يحملان سعر المكان ولا
//    يذكران هامش النادي. تُضبط بعد الاستيراد من «💰 الحصّة» في كونسول المكان.
//
// التشغيل:  npx tsx src/scripts/seed-jalsa-menu.ts            (تجربة بلا كتابة)
//           npx tsx src/scripts/seed-jalsa-menu.ts --apply    (تنفيذ)
// ══════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { locations } from '../schemas/admin.schema.js';
import { applyMenuSpec, validateSpec, type MenuSpec } from '../services/menu-import.service.js';

const LOCATION_ID = Number(process.env.SEED_LOCATION_ID || 8);
const APPLY = process.argv.includes('--apply');

// أوزان البرغر: مجموعةٌ **خاصّة بكلّ صنف** لأنّ التدرّج يختلف —
// ول سبايسي يقفز ١٫٥٠ للـ٢٠٠غم بينما غيره ١٫٢٥. مجموعةٌ مشتركة كانت ستُسعّره خطأً.
const weights = (d150: number, d200: number | null, d300: number) => ({
  name: 'وزن القطعة', isRequired: true,
  values: [
    { name: '100 غم', priceDelta: 0 },
    { name: '150 غم', priceDelta: d150 },
    ...(d200 === null ? [] : [{ name: '200 غم', priceDelta: d200 }]),
    { name: '300 غم', priceDelta: d300 },
  ],
});

const SPEC: MenuSpec = {
  sharedGroups: [
    // مشتركة: تخدم صنفين بنفس الفرق تماماً
    { key: 'cupSize', name: 'الحجم', isRequired: true, values: [
      { name: 'سنجل' }, { name: 'دبل', priceDelta: 0.5 },
    ] },
    // الموهيتو اختيارٌ على مستويين: الأساس ثمّ النكهة — وهما مجموعتان لا واحدة.
    // 🔴 الأساس أوّلاً في optionGroupIds: ترتيب العرض يتبع ترتيب المصفوفة على
    //    الصنف (resolveOptionGroups)، ومن يختار النكهة قبل الأساس يرى السعر يقفز بعدها.
    { key: 'mojitoBase', name: 'الأساس', isRequired: true, values: [
      { name: 'مشروب غازي' },                    // بلا فرق
      { name: 'مشروب طاقة', priceDelta: 1 },     // 2.50 + 1.00 = 3.50 كما في المنيو
    ] },
    { key: 'mojito', name: 'النكهة', isRequired: true, values: [
      { name: 'ليمون ونعنع' }, { name: 'فراولة' }, { name: 'باشن فروت' }, { name: 'بلو بيري' },
      { name: 'مانجا' }, { name: 'رمان' }, { name: 'بلو كوراكاو' }, { name: 'سموك' },
    ] },
    { key: 'smoothie', name: 'نكهة السموذي', isRequired: true, values: [
      { name: 'باشن فروت' }, { name: 'بينا كولادا' }, { name: 'تروبيكال' }, { name: 'مكس بيري' },
    ] },
    { key: 'shake', name: 'نكهة الميلك شيك', isRequired: true, values: [
      { name: 'فانيلا' }, { name: 'شوكولاتة' },
      { name: 'كراميل', priceDelta: 0.5 }, { name: 'أوريو', priceDelta: 0.5 },
      { name: 'سنكرز', priceDelta: 0.5 }, { name: 'فراولة', priceDelta: 0.5 },
    ] },
    { key: 'heat', name: 'الدرجة', isRequired: true, values: [
      { name: 'عادي' }, { name: 'حار' },
    ] },
    // 🍟 الترقية خيارٌ لا باقة (قرار 2026-08-09): باقةً كانت تُطلَب وحدها بلا
    //    ساندويش — عرضُ ترقيةٍ بلا معنى — وتُعرض في تبويبٍ لا يمرّ به من جاء
    //    يطلب برغراً. خياراً تظهر لحظة القرار ويستحيل طلبها منفردة.
    //    💰 الدينار يذهب للمكان كاملاً (قاعدة فروق الخيارات) — مقايضةٌ معلومة.
    { key: 'meal', name: 'حوّلها إلى وجبة', isRequired: false, values: [
      { name: 'بطاطا مقلية + مشروب غازي', priceDelta: 1 },
    ] },
    { key: 'sauce', name: 'نوع الصوص', isRequired: true, values: [
      { name: 'ول' }, { name: 'باربكيو' }, { name: 'هولنديز' },
      { name: 'مايونيز' }, { name: 'تروبيكال' }, { name: 'سبايسي' },
    ] },
    // 💨 سبع نكهات، ستٌّ بـ٣٫٥٠ و«تفاحتين نخلة» بـ٤٫٥٠ — صنفٌ واحد أساسه ٣٫٥٠
    //    وفرقٌ +١٫٠٠ على نخلة وحدها. الفرق يمرّ حتّى داخل الباقات (قرار المالك):
    //    ابتلاعه يعني أنّ المكان يدفع ديناراً عن كلّ من يختارها.
    { key: 'shishaFlavor', name: 'النكهة', isRequired: true, values: [
      { name: 'تفاحتين مزايا' }, { name: 'ليمون ونعنع' }, { name: 'علكة وقرفة' },
      { name: 'كاندي' }, { name: 'Love' }, { name: 'تفاحتين فاخر' },
      { name: 'تفاحتين نخلة', priceDelta: 1 },
    ] },
  ],

  sections: [
    // ══ 💨 الأراجيل أوّلاً (قرار 2026-08-09): بعد العروض مباشرةً في واجهة اللاعب —
    //    العروض تتصدّر دائماً، والترتيب هنا يحكم ما بعدها ══
    // ══ 💨 الأراجيل — قسمٌ رئيس مستقلّ ══
    // ليست مشروباً، و«المشروبات ← أراجيل» تقرأ خطأً. وهي من جلسة كالمشروبات.
    { name: 'أراجيل', items: [
      { name: 'أرجيلة', price: 3.5, groups: ['shishaFlavor'] },
    ] },

    // ══ 🥤 المشروبات — كافيه جلسة ══
    { name: 'المشروبات', sections: [
      { name: 'ساخنة', items: [
        { name: 'جلسة (قهوة الاختصاص)', price: 3, description: 'مشروب البيت المميّز' },
        { name: 'إسبريسو', price: 1.5, groups: ['cupSize'] },
        { name: 'قهوة تركية', price: 1.5, groups: ['cupSize'] },
        { name: 'أمريكانو', price: 2.5 },
        { name: 'كابتشينو', price: 3 },
        { name: 'لاتيه', price: 2.5 },
        { name: 'فلات وايت', price: 2.5 },
        { name: 'سبانش لاتيه', price: 3 },
        { name: 'موكا', price: 3 },
        { name: 'هوت شوكليت', price: 2.5 },
      ] },
      { name: 'باردة', items: [
        { name: 'آيس جلسة', price: 3 },
        { name: 'آيس أمريكانو', price: 3 },
        { name: 'آيس لاتيه', price: 3 },
        { name: 'آيس كابتشينو', price: 3 },
        { name: 'آيس سبانش لاتيه', price: 3 },
        { name: 'آيس كراميل ماكياتو', price: 3 },
        { name: 'آيس موكا', price: 3 },
        { name: 'آيس شوكليت', price: 3 },
        { name: 'آيس تي', price: 2.5 },
      ] },
      // قسمٌ مدموج (قرار 2026-08-09): ثلاثة أقسامٍ بصنفٍ واحد كانت عناوين
      // تكرّر أسماء بطاقاتها حرفيّاً — البطاقة هنا «عائلة» تخفي نكهاتها خلفها.
      { name: 'مخفوقات وموهيتو', items: [
        { name: 'موهيتو', price: 2.5, groups: ['mojitoBase', 'mojito'] },
        { name: 'سموذي', price: 3.5, groups: ['smoothie'] },
        { name: 'ميلك شيك', price: 3, groups: ['shake'] },
      ] },
      { name: 'عصائر طبيعية', items: [
        { name: 'عصير ليمون', price: 3 },
        { name: 'عصير ليمون ونعنع', price: 3 },
        { name: 'عصير برتقال', price: 2.5 },
        { name: 'عصير فراولة', price: 2.5 },
        { name: 'عصير مانجا', price: 3 },
      ] },
      { name: 'شاي', items: [
        { name: 'شاي', price: 1.5 },
        { name: 'شاي أخضر', price: 1.5 },
        { name: 'زهورات', price: 1.5 },
        { name: 'شاي بالحليب', price: 2 },
      ] },
      { name: 'كوكتيلات', items: [
        { name: 'كوكتيل فواكه', price: 2.5 },
        { name: 'موز وحليب', price: 2 },
        { name: 'فراولة وحليب', price: 2 },
      ] },
      { name: 'مشروبات جاهزة', items: [
        { name: 'ماء', price: 0.5, description: 'قارورة' },
        { name: 'مشروب غازي', price: 1, description: 'علبة' },  // كان «مشروبات غازية» — زال مكرّر المطعم فصحّ المفرد
        { name: 'ممتو', price: 1.5, description: 'علبة' },
        { name: 'باربيكان', price: 1.75, description: 'علبة' },
        { name: 'ريد بول', price: 2.5, description: 'علبة' },
        { name: 'بوم بوم', price: 2, description: 'علبة' },
        { name: 'كود ريد', price: 2, description: 'علبة' },
      ] },
    ] },

    // ══ 🍔 المأكولات — مطعم well ══
    { name: 'المأكولات', sections: [
      { name: 'برغر اللحم', items: [
        { name: 'ذا ول', groups: ['meal'], price: 3.5, options: [weights(0.75, 1.25, 2.25)],
          description: '⭐ لحم بقري، جبنة شيدر، روست بيف، خس أحمر، رقائق بطاطا مقرمشة، وصوص ول' },
        { name: 'تروبيك ول', groups: ['meal'], price: 3.5, options: [weights(0.75, 1.25, 2.25)],
          description: '⭐ لحم بقري مع أناناس مشوي، جبنة شيدر، خس طازج، وصوص تروبيكال' },
        { name: 'مشروم ميلت', groups: ['meal'], price: 3.5, options: [weights(0.75, 1.25, 2.25)],
          description: 'لحم بقري مع فطر مشوي، جبنة موزاريلا وأمنتال، روست بيف، وصوص المشروم' },
        { name: 'ول سبايسي', groups: ['meal'], price: 3, options: [weights(0.75, 1.5, 2.5)],
          description: '🌶️ لحم بقري، جبنة شيدر، روست بيف، خس أحمر، هالبينو، رقائق بطاطا، وصوص ول الحار' },
        // 🔴 وزن ٢٠٠غم محذوف عمداً: سعره محجوبٌ بانعكاس ضوءٍ في الصورة ولم يُقرأ.
        //    إسقاط الخيار يُظهر النقص فيُستدرَك، وإدخال رقمٍ مخمَّن يُحصّل من اللاعب خطأً.
        { name: 'ول كلاسيك', groups: ['meal'], price: 2.75, options: [weights(0.75, null, 2.25)],
          description: 'لحم بقري، جبنة شيدر، خس طازج، بندورة، بصل أحمر، مخللات، وصوص كلاسيك' },
      ] },
      { name: 'برغر دجاج كرسبي', items: [
        { name: 'ذا كرسبي ول', groups: ['meal'], price: 3.5,
          description: '⭐ فيليه دجاج كرسبي مزدوج، جبنة شيدر، تركي مدخن، مخللات، خس أحمر، وصوص ول' },
        { name: 'فولكانو كرسبي', groups: ['meal'], price: 3,
          description: '🌶️ فيليه دجاج كرسبي حار، جبنة شيدر، تركي مدخن، مخللات، خس طازج، وصوص سبايسي' },
        { name: 'كرسبي ون', groups: ['meal'], price: 2.75,
          description: 'فيليه دجاج كرسبي، جبنة شيدر، تركي مدخن، مخللات، خس طازج، وصوص هولنديز' },
      ] },
      { name: 'ساندويشات الشارع', items: [
        { name: 'ول زنجر', price: 2, groups: ['heat', 'meal'],
          description: '⭐ زنجر، جبنة شيدر، تركي مدخن، خس أحمر، وصوص ول المميز' },
        { name: 'كلاسيك زنجر', price: 1.75, groups: ['heat', 'meal'],
          description: 'زنجر، جبنة شيدر، تركي مدخن، خس طازج، وصوص هولنديز' },
        { name: 'سكالوب', price: 1.25, groups: ['heat', 'meal'] },
        { name: 'ول تشيز بطاطا', price: 1.25, groups: ['heat', 'meal'] },
      ] },
      { name: 'وجبات الأطفال', items: [
        { name: 'وجبة أطفال سكالوب', price: 2.5, description: 'سكالوب دجاج مع بطاطا مقلية وعصير فراولة طبيعي' },
        { name: 'وجبة أطفال ناجتس', price: 2.5, description: '٤ قطع ناجتس مع بطاطا مقلية وعصير فراولة طبيعي' },
      ] },
      { name: 'جوانب وإضافات', items: [
        { name: 'بطاطا مقلية', price: 0.75, description: 'طلب' },
        { name: 'بطاطا بالجبنة', price: 1, description: 'طلب' },
        { name: 'ناجتس', price: 1.25, options: [
          { name: 'عدد القطع', isRequired: true, values: [{ name: '4 قطع' }, { name: '6 قطع', priceDelta: 0.25 }] },
        ] },
        { name: 'إضافة مخلّلات / هالبينو', price: 0.4, options: [
          { name: 'النوع', isRequired: true, values: [{ name: 'مخللات' }, { name: 'هالبينو' }] },
        ] },
        // قسم «صوصات» أُدمج هنا (قرار 2026-08-09) — كان قسماً لصنفٍ واحد
        { name: 'صوص إضافي', price: 0.4, groups: ['sauce'], description: 'علبة — سعرٌ موحَّد لكلّ الأنواع' },
      ] },
    ] },


    // ══ 🎁 العروض ══
    // خانات: ثابتة · ثابتة بخيارٍ مقفل · اختيارٌ من مجموعة.
    // السعر ثابت إلّا فرقاً معلَناً على خيارٍ اختاره اللاعب (نخلة +1.00).
    { name: 'العروض', items: [
      { name: 'سوفت درينك + ماء', price: 1.5,
        description: 'مشروب من اختيارك مع قارورة ماء',
        bundle: [
          { choice: { label: 'اختر مشروبك', from: ['شاي', 'قهوة تركية', 'مشروب غازي'] } },
          { item: 'ماء' },
        ] },

      { name: 'أرجيلة + درينك مميّز', price: 6,
        description: 'أرجيلة بنكهتك مع أيّ مشروبٍ مميّز',
        bundle: [
          { item: 'أرجيلة' },
          // 🔴 قائمةٌ صريحة لا نفيٌ عامّ: «كلّ مشروبٍ عدا الشاي والقهوة والغازي»
          //    كان سيضمّ كلّ مشروبٍ يُضاف لاحقاً — ولو كان بأربعة دنانير.
          { choice: { label: 'اختر الدرينك', note: 'المشروبات المميّزة',
            from: ['موهيتو', 'سموذي', 'ميلك شيك', 'آيس جلسة', 'آيس أمريكانو', 'آيس لاتيه',
                   'آيس كابتشينو', 'آيس سبانش لاتيه', 'آيس كراميل ماكياتو', 'آيس موكا',
                   'آيس شوكليت', 'كوكتيل فواكه', 'عصير ليمون ونعنع', 'عصير مانجا'] } },
        ] },

      { name: 'أرجيلة + سوفت درينك', price: 4,
        description: 'أرجيلة بنكهتك مع شاي أو قهوة أو غازي',
        bundle: [
          { item: 'أرجيلة' },
          { choice: { label: 'اختر السوفت درينك', from: ['شاي', 'قهوة تركية', 'مشروب غازي'] } },
        ] },

      { name: 'أرجيلة + غازي + بطاطا + برجر كلاسيك', price: 7,
        description: 'برجر ول كلاسيك ١٥٠غم مع بطاطا ومشروب غازي وأرجيلة',
        bundle: [
          { item: 'أرجيلة' },
          { item: 'مشروب غازي' },
          { item: 'بطاطا مقلية' },
          // الوزن مقفل: العرض حدّده وسعره محسوبٌ فيه، فلا يُسأل عنه اللاعب
          { item: 'ول كلاسيك', lock: { 'وزن القطعة': '150 غم' } },
        ] },

      { name: 'كرسبي برجر + بطاطا + غازي', price: 4,
        description: 'كرسبي ون مع بطاطا ومشروب غازي',
        bundle: [
          { item: 'كرسبي ون' },
          { item: 'بطاطا مقلية' },
          { item: 'مشروب غازي' },
        ] },
    ] },
  ],
};

async function main() {
  const errs = validateSpec(SPEC);
  if (errs.length) { console.error('❌ وصفٌ غير صالح:\n  • ' + errs.join('\n  • ')); process.exit(1); }

  await connectDB();
  const db = getDB();
  if (!db) throw new Error('قاعدة البيانات غير متوفرة');

  const [loc] = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(eq(locations.id, LOCATION_ID)).limit(1);
  if (!loc) throw new Error(`المكان #${LOCATION_ID} غير موجود`);

  console.log(`\n☕🍔 منيو «${loc.name}» (#${loc.id})`);
  if (!APPLY) {
    const count = (s: any[]): number => s.reduce((n, x) => n + (x.items?.length ?? 0) + count(x.sections ?? []), 0);
    console.log(`   ${count(SPEC.sections)} صنفاً · ${SPEC.sharedGroups?.length ?? 0} مجموعات مشتركة`);
    console.log('   ✅ الوصف صالح\n⚠️  تجربة فقط — أضف --apply للتنفيذ\n');
    process.exit(0);
  }

  const r = await applyMenuSpec(db, LOCATION_ID, SPEC, { wipe: true });
  r.log.forEach(l => console.log('   ' + l));
  console.log(`\n✅ ${r.categories} قسماً · ${r.items} صنفاً · ${r.groups} مجموعات (${r.values} قيمة) · ${r.bundles} باقة`);
  console.log('⚠️  حصّة النادي 0.00 — اضبطها من كونسول المكان ← المنيو ← 💰 الحصّة\n');
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message || e); process.exit(1); });
