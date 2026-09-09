// ══════════════════════════════════════════════════════
// ☕💨 منيو «Best View» — كافيه وأرجيلة (الزرقاء الجديدة، شارع الوينك)
// المصدر: Cafe_Menu.xlsx (126 سطراً في 13 فئة) + عروض الأرجيلة كما أملاها
// المالك في المحادثة (2026-09-09). هذا الملفّ **وصفٌ لا منطق**: كلّ المنطق في
// services/menu-import.service.ts.
//
// 🧩 قاعدة الدمج المطبَّقة (اصطلاح مزاج): الأسطر التي تختلف في النكهة وحدها
//    وبسعرٍ موحّد = صنفٌ واحدٌ بمجموعة نكهات (فرابتشينو · ميلك شيك · شاي
//    مثلّج · سموذي · عصير 2.50 · آيس كريم · المشروبات الساخنة بالنكهات).
//    أمّا سنجل/دبل (قهوة تركيّة · إسبريسو · نسكافيه) فبقيت أصنافاً منفصلة لأنّ
//    **العرض الأوّل يميّز بالسعر**: السنجل وحده مؤهَّلٌ لعرض الـ4.00.
//
// 💨 الأرجيلة صنفٌ واحد بمجموعة «المعسّل» وفروقٍ معلَنة — لا صنفان كما في مزاج:
//      مزايا 0 · نخلة تفاحتين +1.00 · بيت فيو Love +1.00
//    لأنّ قاعدة المالك «نخلة مع أيّ عرضٍ +1 دينار» تُنفَّذ **آليّاً** بفرق الخيار
//    الذي يمرّ عبر الباقة (× كمّية الخانة) — والسعر المفرد يطابق: 3 / 4 / 4.
//    نكهات مزايا قيمٌ داخل المجموعة نفسها — سؤالٌ واحد، ولا نكهة تُسأل لمن اختار نخلة.
//
// 🎁 الباقات الثلاث (المياه ضمنها كلّها):
//      1. أرجيلة + مشروب خفيف (شاي · قهوة سنجل · غازيّة) + مياه = 4.00
//      2. أرجيلة + موهيتو طاقة بنكهة + مياه                  = 5.00
//      3. أرجيلة + أيّ مشروبٍ آخر (≤ 3.00) + مياه           = 5.50
//    ومعسّل النخلة/Love يضيف 1.00 على أيٍّ منها تلقائيّاً.
//
// 📝 قرارات المالك (2026-09-09) المطبَّقة هنا:
//    • نكهات مزايا والموهيتو وأنواع الغازيّة: قوائم افتراضيّة معتمدة — تُعدَّل من الواجهة
//    • «اطلبها كثيير زاكية 3.50» لا يُضاف نهائيّاً
//    • «أمريكان» و«أمريكانو» مشروبان مختلفان لا تكرار
//    • حصّة النادي 0.00 لكلّ صنف — تُضبط من كونسول المكان بعد الإدخال
//    • أهليّة عرض الـ5.50: كلّ مشروبٍ سعره ≤ 3.00 — المميّزات (3.50 و5.00) خارجه
//    • «مياه صحيّة» صارت «مياه» — الاسم الذي يلتقطه الماء التلقائيّ للفاتورة
//
// التشغيل:  npx tsx src/scripts/seed-bestview-menu.ts --validate-only   (محلّياً بلا قاعدة)
//           npx tsx src/scripts/seed-bestview-menu.ts                   (تجربة على الخادم)
//           npx tsx src/scripts/seed-bestview-menu.ts --apply           (تنفيذ)
// ══════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { locations } from '../schemas/admin.schema.js';
import { applyMenuSpec, validateSpec, type MenuSpec } from '../services/menu-import.service.js';

const LOCATION_ID = Number(process.env.SEED_LOCATION_ID || 14);
const APPLY = process.argv.includes('--apply');
const VALIDATE_ONLY = process.argv.includes('--validate-only');

// ── عرض 4.00: المشروبات الخفيفة (كلّ ما سعره 1.00 — شاي · قهوة سنجل · غازيّة) ──
const LIGHT_DRINKS = [
  'شاي', 'شاي بحليب', 'شاي كرك', 'شاي أخضر', 'زهورات وأعشاب',
  'قهوة تركيّة سنجل', 'إسبريسو شوت', 'نسكافيه', 'كابتشينو',
  'مشروبات غازيّة', 'باربيكان',
];

// ── عرض 5.50: أيّ مشروبٍ آخر بسعرٍ ≤ 3.00 (المميّزات 3.50 و5.00 خارجه — افتراض) ──
const OTHER_DRINKS = [
  // ساخنة
  'شاي تركي (إبريق)', 'فرينش بريس', 'كيميكس', 'V60',
  'قهوة تركيّة دبل', 'إسبريسو دبل', 'أمريكان', 'أمريكانو',
  'هوت شوكلت إيطالي', 'هوت شوكلت', 'لاتيه', 'لاتيه إسباني', 'قهوة فرنسيّة',
  'كابتشينو إيطالي', 'ميكياتو بالكراميل', 'مشروب ساخن بالنكهات', 'قهوة بالنكهات', 'نسكافيه دبل',
  // آيس كوفي
  'آيس كوفي بست فيو', 'آيس أمريكانو', 'آيس أمريكان', 'آيس لاتيه', 'آيس موكا',
  'آيس موكا بيضاء', 'آيس كراميل ميكياتو', 'لاتيه إسباني مثلّج',
  // عائلات باردة
  'ميلك شيك', 'شاي مثلّج', 'سموذي', 'سموذي بست فيو',
  'عصير طبيعي', 'ليمون', 'كيوي ليمون', 'أفوكادو', 'رمان (موسمي)',
  'مشروب طاقة',
];

const SPEC: MenuSpec = {
  sharedGroups: [
    // 💨 المعسّل — مجموعةٌ واحدة تحمل نكهات مزايا (0) والفئة الأعلى (+1):
    //    سؤالٌ واحد للاعب، ولا نكهةَ مزايا تُسأل لمن اختار نخلة. الفرق يمرّ
    //    عبر الباقات: نخلة/Love +1.00 على أيّ عرض. نكهات مزايا افتراضيّة.
    { key: 'molasses', name: 'المعسّل', isRequired: true, values: [
      { name: 'مزايا — تفاحتين' }, { name: 'مزايا — عنب ونعنع' }, { name: 'مزايا — ليمون ونعنع' },
      { name: 'مزايا — بطيخ ونعنع' }, { name: 'مزايا — علكة وقرفة' }, { name: 'مزايا — عنب' },
      { name: 'مزايا — زغلول' },
      { name: 'نخلة تفاحتين', priceDelta: 1 },
      { name: 'بيت فيو Love', priceDelta: 1 },
    ] },
    // نكهات الموهيتو — افتراضيّة
    { key: 'mojitoFlavor', name: 'نكهة الموهيتو', isRequired: true, values: [
      { name: 'ليمون ونعنع' }, { name: 'فراولة' }, { name: 'توت أزرق' },
      { name: 'باشن' }, { name: 'خوخ' }, { name: 'بطيخ' },
    ] },
    // المنيو يذكر اللاتيه بنكهاته الثلاث فقط — فالنكهة إلزاميّة لا اختياريّة
    { key: 'latte', name: 'نكهة اللاتيه', isRequired: true, values: [
      { name: 'بندق' }, { name: 'كراميل' }, { name: 'فانيلا' },
    ] },
    { key: 'bubbles', name: 'إضافة', isRequired: false, values: [
      { name: 'بابلز', priceDelta: 1 },
    ] },
  ],

  sections: [
    // ══ 💨 الأراجيل ══
    { name: 'أراجيل', items: [
      { name: 'أرجيلة', price: 3, groups: ['molasses'],
        description: 'مزايا 3.00 · نخلة تفاحتين أو بيت فيو Love 4.00' },
      { name: 'رأس أرجيلة إضافي', price: 1.5 },
    ] },

    // ══ 🥤 المشروبات ══
    { name: 'المشروبات', sections: [
      { name: 'شاي ساخن', items: [
        { name: 'شاي', price: 1 },
        { name: 'شاي بحليب', price: 1 },
        { name: 'شاي كرك', price: 1 },
        { name: 'شاي أخضر', price: 1 },
        { name: 'زهورات وأعشاب', price: 1 },
        { name: 'شاي تركي (إبريق)', price: 3 },
      ] },
      { name: 'قهوة مختصّة', items: [
        { name: 'فرينش بريس', price: 2.5 },
        { name: 'كيميكس', price: 2.5 },
        { name: 'V60', price: 2.5 },
        // «اطلبها كثيير زاكية 3.50» على المنيو المطبوع أُسقط نهائيّاً (قرار المالك)
      ] },
      { name: 'قهوة ساخنة', items: [
        { name: 'قهوة تركيّة سنجل', price: 1 },
        { name: 'قهوة تركيّة دبل', price: 1.5 },
        { name: 'إسبريسو شوت', price: 1 },
        { name: 'إسبريسو دبل', price: 1.5 },
        { name: 'أمريكان', price: 1.5 },
        { name: 'أمريكانو', price: 1.5 },
        { name: 'هوت شوكلت إيطالي', price: 2.25 },
        { name: 'هوت شوكلت', price: 1.5 },
        { name: 'لاتيه', price: 2.5, groups: ['latte'] },
        { name: 'لاتيه إسباني', price: 2.75 },
        { name: 'لاتيه إسباني بالفستق الحلبي', price: 3.5 },
        { name: 'قهوة فرنسيّة', price: 2 },
        { name: 'فلات وايت كورتادو', price: 3.5 },
        { name: 'كابتشينو إيطالي', price: 2.5 },
        { name: 'كابتشينو', price: 1 },
        { name: 'ميكياتو بالكراميل', price: 2.75 },
        { name: 'مشروب ساخن بالنكهات', price: 2,
          description: 'لوتس · أوريو · روشيه · كيندر · سنيكرز · نوتيلا · جلاكسي',
          options: [{ name: 'النكهة', isRequired: true, values: [
            { name: 'لوتس' }, { name: 'أوريو' }, { name: 'روشيه' }, { name: 'كيندر' },
            { name: 'سنيكرز' }, { name: 'نوتيلا' }, { name: 'جلاكسي' },
          ] }] },
        { name: 'قهوة بالنكهات', price: 1.5,
          options: [{ name: 'النكهة', isRequired: true, values: [
            { name: 'مكاداميا' }, { name: 'بندق' }, { name: 'فانيلا' },
          ] }] },
        { name: 'نسكافيه', price: 1 },
        { name: 'نسكافيه دبل', price: 1.5 },
      ] },
      { name: 'آيس كوفي', items: [
        { name: 'آيس كوفي بست فيو', price: 2.75 },
        { name: 'آيس أمريكانو', price: 1.5 },
        { name: 'آيس أمريكان', price: 1.5 },
        { name: 'آيس لاتيه', price: 2.75, groups: ['latte'] },
        { name: 'آيس موكا', price: 2.75 },
        { name: 'آيس موكا بيضاء', price: 2.75 },
        { name: 'آيس كراميل ميكياتو', price: 2.75 },
        { name: 'لاتيه إسباني مثلّج', price: 2.75 },
        { name: 'لاتيه إسباني بالفستق الحلبي مثلّج', price: 3.5 },
      ] },
      { name: 'فرابتشينو', items: [
        { name: 'فرابتشينو', price: 3.5,
          options: [{ name: 'النكهة', isRequired: true, values: [
            { name: 'شوكولاتة' }, { name: 'شوكولاتة بيضاء' }, { name: 'بندق' },
            { name: 'كراميل' }, { name: 'دبل كراميل' }, { name: 'قهوة' },
          ] }] },
      ] },
      { name: 'ميلك شيك', items: [
        { name: 'ميلك شيك', price: 3,
          options: [{ name: 'النكهة', isRequired: true, values: [
            { name: 'عربيّة' }, { name: 'تشيز كيك' }, { name: 'لوتس' }, { name: 'أوريو' },
            { name: 'سنيكرز' }, { name: 'فانيلا' }, { name: 'فراولة' }, { name: 'كروكان' },
            { name: 'روشيه' }, { name: 'كيندر' }, { name: 'نوتيلا' }, { name: 'بيستاشيو' },
          ] }] },
        { name: 'ميلك شيك بست فيو سبيشل', price: 5 },
      ] },
      { name: 'شاي مثلّج', items: [
        // «شاي دراق» تكرارٌ للخوخ في الأصل — أُسقط
        { name: 'شاي مثلّج', price: 2.5,
          options: [{ name: 'النكهة', isRequired: true, values: [
            { name: 'خوخ' }, { name: 'ليمون' }, { name: 'جريب فروت' },
          ] }] },
      ] },
      { name: 'سموذي', items: [
        { name: 'سموذي', price: 2.5, groups: ['bubbles'],
          options: [{ name: 'النكهة', isRequired: true, values: [
            { name: 'توت مشكّل' }, { name: 'فراولة' }, { name: 'توت أزرق' }, { name: 'باشن' },
            { name: 'مانجا' }, { name: 'أناناس' }, { name: 'كيوي' }, { name: 'جوز هند' },
            { name: 'تفاح أخضر' }, { name: 'بينا كولادا' },
          ] }] },
        { name: 'سموذي بست فيو', price: 3, groups: ['bubbles'] },
      ] },
      { name: 'عصير طبيعي', items: [
        { name: 'عصير طبيعي', price: 2.5,
          options: [{ name: 'النوع', isRequired: true, values: [
            { name: 'برتقال' }, { name: 'موز حليب' }, { name: 'فراولة' }, { name: 'فراولة وحليب' },
            { name: 'ليمون ونعنع' }, { name: 'كوكتيل' }, { name: 'منجا' }, { name: 'جوافة' },
            { name: 'كيوي' }, { name: 'عوار قلب' },
          ] }] },
        { name: 'ليمون', price: 2 },
        { name: 'كيوي ليمون', price: 3 },
        { name: 'أفوكادو', price: 3 },
        { name: 'رمان (موسمي)', price: 3 },
        { name: 'كوكتيل بست فيو', price: 3.5 },
        { name: 'أفوكادو بالعسل والمكسّرات', price: 3.5 },
      ] },
      { name: 'باردة ومعلّبة', items: [
        { name: 'مشروب طاقة', price: 1.5 },
        { name: 'باربيكان', price: 1 },
        { name: 'مشروبات غازيّة', price: 1,
          options: [{ name: 'النوع', isRequired: true, values: [
            { name: 'بيبسي' }, { name: 'بيبسي دايت' }, { name: 'سفن أب' },
            { name: 'ميرندا' }, { name: 'ماونتن ديو' },
          ] }] },
        // 💧 الاسم «مياه» حرفيّاً — يلتقطه الماء التلقائيّ على الفاتورة
        { name: 'مياه', price: 0.5 },
      ] },
      { name: 'موهيتو', items: [
        { name: 'موهيتو', price: 2, groups: ['mojitoFlavor'],
          description: 'على غازيّة 2.00 أو مشروب طاقة 2.50',
          options: [
            { name: 'الأساس', isRequired: true, values: [
              { name: 'مشروب غازي' }, { name: 'مشروب طاقة', priceDelta: 0.5 },
            ] },
            { name: 'إضافة', isRequired: false, values: [
              { name: 'بابلز سموك', priceDelta: 1 },
            ] },
          ] },
      ] },
    ] },

    // ══ 🍰 الحلويات ══
    { name: 'حلويات وآيس كريم', sections: [
      { name: 'حلويات', items: [
        { name: 'قشطوطة', price: 2,
          options: [{ name: 'النوع', isRequired: true, values: [
            { name: 'سادة' }, { name: 'لوتس', priceDelta: 0.5 }, { name: 'نوتيلا', priceDelta: 0.5 },
            { name: 'بيستاشيو', priceDelta: 1 }, { name: 'مكس', priceDelta: 1 }, { name: 'منجا', priceDelta: 1 },
          ] }] },
        { name: 'تارت ٦ قطع', price: 1.5 },
        { name: 'سلطة فواكه', price: 3 },
        { name: 'دونات', price: 1 },
        { name: 'تشيز كيك', price: 2 },
        { name: 'ليزي كيك', price: 1.5 },
        { name: 'كريب', price: 3 },
        { name: 'وافل', price: 3 },
        { name: 'بان كيك', price: 3 },
      ] },
      { name: 'آيس كريم', items: [
        { name: 'آيس كريم', price: 2,
          options: [{ name: 'النكهة', isRequired: true, values: [
            { name: 'عربيّة' }, { name: 'تشيز كيك' }, { name: 'لوتس' }, { name: 'أوريو' },
            { name: 'نوتيلا' }, { name: 'فانيلا' }, { name: 'فراولة' }, { name: 'سنيكرز' }, { name: 'كروكان' },
          ] }] },
      ] },
    ] },

    // ══ 🎁 العروض ══
    { name: 'العروض', items: [
      { name: 'أرجيلة + مشروب خفيف + مياه', price: 4,
        description: 'أرجيلة بمعسّلك مع شاي أو قهوة سنجل أو غازيّة والمياه — نخلة أو Love +1.00',
        bundle: [
          { item: 'أرجيلة' },
          { choice: { label: 'اختر مشروبك الخفيف', from: LIGHT_DRINKS } },
          { item: 'مياه' },
        ] },
      { name: 'أرجيلة + موهيتو + مياه', price: 5,
        description: 'أرجيلة بمعسّلك مع موهيتو طاقة بنكهتك والمياه — نخلة أو Love +1.00',
        bundle: [
          { item: 'أرجيلة' },
          // الأساس مقفلٌ على الطاقة: العرض حدّده وسعره محسوبٌ فيه
          { item: 'موهيتو', lock: { 'الأساس': 'مشروب طاقة' } },
          { item: 'مياه' },
        ] },
      { name: 'أرجيلة + مشروب مميّز + مياه', price: 5.5,
        description: 'أرجيلة بمعسّلك مع أيّ مشروبٍ آخر والمياه — نخلة أو Love +1.00',
        bundle: [
          { item: 'أرجيلة' },
          { choice: { label: 'اختر مشروبك', from: OTHER_DRINKS } },
          { item: 'مياه' },
        ] },
    ] },
  ],
};

function countItems(s: any[]): number {
  return s.reduce((n, x) => n + (x.items?.length ?? 0) + countItems(x.sections ?? []), 0);
}

async function main() {
  const errs = validateSpec(SPEC);
  if (errs.length) { console.error('❌ وصفٌ غير صالح:\n  • ' + errs.join('\n  • ')); process.exit(1); }
  console.log(`   ${countItems(SPEC.sections)} صنفاً · ${SPEC.sharedGroups?.length ?? 0} مجموعات مشتركة · ${LIGHT_DRINKS.length} مشروباً خفيفاً · ${OTHER_DRINKS.length} مشروباً في عرض 5.50`);
  if (VALIDATE_ONLY) { console.log('   ✅ الوصف صالح (بلا قاعدة بيانات)'); process.exit(0); }

  await connectDB();
  const db = getDB();
  if (!db) throw new Error('قاعدة البيانات غير متوفرة');

  const [loc] = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(eq(locations.id, LOCATION_ID)).limit(1);
  if (!loc) throw new Error(`المكان #${LOCATION_ID} غير موجود`);

  console.log(`\n☕💨 منيو «${loc.name}» (#${loc.id})`);
  if (!APPLY) {
    console.log('   ✅ الوصف صالح\n⚠️  تجربة فقط — أضف --apply للتنفيذ\n');
    process.exit(0);
  }

  const r = await applyMenuSpec(db, LOCATION_ID, SPEC, { wipe: true });
  r.log.forEach(l => console.log('   ' + l));
  console.log(`\n✅ ${r.categories} قسماً · ${r.items} صنفاً · ${r.groups} مجموعات (${r.values} قيمة) · ${r.bundles} باقة`);
  console.log('⚠️  حصّة النادي 0.00 — تُضبط من كونسول المكان ← المنيو ← 💰 الحصّة');
  console.log('ℹ️  نكهات مزايا والموهيتو وأنواع الغازيّة قوائم افتراضيّة معتمدة — تُعدَّل من الواجهة\n');
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message || e); process.exit(1); });
