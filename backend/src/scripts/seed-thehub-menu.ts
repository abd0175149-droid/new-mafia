// ══════════════════════════════════════════════════════
// ☕💨 منيو «The Hub Coffee House» — الرابية، عمّان (location #21)
// المصدر: صورة المنيو المعلّق في المكان (63 سطراً) + الأرجيلة والغازي والعرضان
// كما أملاها المالك في المحادثة (2026-10-25). هذا الملفّ **وصفٌ لا منطق**: كلّ
// المنطق في services/menu-import.service.ts.
//
// 📏 الحجم: كلّ صنفٍ بسعرين (صغير/كبير) صنفٌ واحد بمجموعة «الحجم» خاصّةٍ به —
//    فرق الكبير يتراوح 0.35–0.60، فمجموعةٌ مشتركة كانت ستُسعّر بعضها خطأً.
// 🧩 الدمج (اصطلاح مزاج/Best View): العائلات بسعرٍ موحّد لكلّ نكهاتها صنفٌ واحد
//    بمجموعة نكهات — آيس تي · إنرجي ميكس · سموذي · كريمي. الفرابيه بقيت أصنافاً
//    لأنّ «هب فرابيه» أغلى من أخواتها.
// ➕ الإضافات (نكهة · شوت · حليب · حليب بديل) خيارٌ اختياريّ على مشروبات القهوة
//    والحليب، لا أصنافٌ مستقلّة: «إضافة نكهة» وحدها لا تقول للباريستا لأيّ مشروب.
//    فرق الخيار يذهب للمكان كاملاً (قاعدة فروق الخيارات).
// 💧 «مياه» بهذا الاسم حرفيّاً — يلتقطه الماء التلقائيّ لو فُعِّل لاحقاً.
//
// 📝 قرارات المالك (2026-10-25):
//    • الأرجيلة 4.00 بكلّ النكهات المعروفة في الأماكن الأخرى بلا فروق —
//      والمكان يحذف ما لا يتوفّر عنده من الكونسول
//    • المشروب الغازي 2.00 مبدئيّاً، ويختار اللاعب نوعه
//    • «آيس شيك» بسعرٍ واحد 3.25 (مؤكَّد)
//    • لا أوصاف للأطباق الرئيسيّة
//    • ترتيب الأقسام التسعة المقترح معتمد
// 🔎 افتراضاتٌ قائمة (تُراجَع): «قهوة سنجل» في العرض الأوّل = «قهوة تركية» ·
//    «باشن فروت» مشروبٌ مستقلّ 4.50 بحجمٍ واحد · عمود «Small Small» = صغير/كبير
// 💰 حصّة النادي 0.00 لكلّ صنف — تُضبط من كونسول المكان بعد الإدخال.
//
// التشغيل:  npx tsx src/scripts/seed-thehub-menu.ts --validate-only   (محلّياً بلا قاعدة)
//           npx tsx src/scripts/seed-thehub-menu.ts                   (تجربة على الخادم)
//           npx tsx src/scripts/seed-thehub-menu.ts --apply           (تنفيذ)
// ══════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { locations } from '../schemas/admin.schema.js';
import { applyMenuSpec, validateSpec, type MenuSpec, type SpecGroup, type SpecItem } from '../services/menu-import.service.js';

const LOCATION_ID = Number(process.env.SEED_LOCATION_ID || 21);
const APPLY = process.argv.includes('--apply');
const VALIDATE_ONLY = process.argv.includes('--validate-only');

/** «الحجم» بفرق الكبير الخاصّ بهذا الصنف */
const size = (small: number, large: number): SpecGroup => ({
  name: 'الحجم', isRequired: true, values: [
    { name: 'صغير' },
    { name: 'كبير', priceDelta: Math.round((large - small) * 100) / 100 },
  ],
});
/** صنفٌ بحجمين — السعر الأساس هو الصغير */
const sized = (name: string, small: number, large: number, extra: Partial<SpecItem> & { after?: SpecGroup[] } = {}): SpecItem => {
  const { after, ...rest } = extra;
  return { name, price: small, ...rest, options: [...(rest.options ?? []), size(small, large), ...(after ?? [])] };
};
const flavors = (name: string, values: string[]): SpecGroup => ({
  name, isRequired: true, values: values.map(v => ({ name: v })),
});
/** الإضافات — مجموعةٌ على الصنف نفسه **بعد** الحجم: المشتركة تُعرض قبل الخاصّة دائماً،
 *  فكانت «إضافات» الاختياريّة تسبق «الحجم» الإلزاميّ في البلاطة وفي خطوات العرض. */
const EXTRAS: SpecGroup = { name: 'إضافات', isRequired: false, selectionType: 'multi', maxSelect: 4, values: [
  { name: 'نكهة', priceDelta: 0.75 },
  { name: 'شوت إسبريسو', priceDelta: 0.75 },
  { name: 'حليب', priceDelta: 0.75 },
  { name: 'حليب بديل', priceDelta: 1 },
] };
/** مشروبات القهوة والحليب تقبل الإضافات */
const X = { after: [EXTRAS] };
const XS = { options: [EXTRAS] };   // للصنف بحجمٍ واحد

/** مرشّحو عرض الـ6 — تُملأ بعد تعريف SPEC من أقسام المشروبات نفسها */
const OTHER_LIST: string[] = [];

const SPEC: MenuSpec = {
  sharedGroups: [
    // 💨 اتّحاد نكهات مزاج وجلسة وBest View، بلا فروق (سعرٌ واحد 4.00 بقرار المالك)
    { key: 'shisha', name: 'المعسّل', isRequired: true, values: [
      { name: 'تفاحتين مزايا' }, { name: 'تفاحتين فاخر' }, { name: 'تفاحتين نخلة' },
      { name: 'ليمون ونعنع' }, { name: 'علكة وقرفة' }, { name: 'عنب' }, { name: 'عنب ونعنع' },
      { name: 'بطيخ ونعنع' }, { name: 'زغلول' }, { name: 'كاندي' }, { name: 'Love' },
    ] },
    { key: 'soda', name: 'النوع', isRequired: true, values: [
      { name: 'بيبسي' }, { name: 'بيبسي دايت' }, { name: 'سفن أب' }, { name: 'ميرندا' }, { name: 'ماونتن ديو' },
    ] },
  ],
  sections: [
    // ══ 💨 الأراجيل — بعد العروض مباشرةً ══
    { name: 'أراجيل', items: [
      { name: 'أرجيلة', price: 4, groups: ['shisha'] },
    ] },

    // ══ 🥤 المشروبات ══
    { name: 'المشروبات', sections: [
      { name: 'قهوة ساخنة', items: [
        sized('هب لاتيه', 3.25, 3.75, { ...X, description: 'لاتيه البيت' }),
        { name: 'إسبريسو', price: 2.1, ...XS },
        { name: 'بلاك آي', price: 3, ...XS },
        { name: 'كورتادو', price: 2.85, ...XS },
        { name: 'فلات وايت', price: 3, ...XS },
        sized('أمريكان', 2.5, 3, X),
        sized('أمريكانو', 2.5, 3, X),
        sized('بستاشيو لاتيه', 3.5, 4, X),
        sized('كافيه لاتيه', 2.75, 3.15, X),
        sized('كابتشينو', 2.75, 3.15, X),
        sized('كراميل ماكياتو', 3.5, 3.85, X),
        sized('موكا', 3.25, 3.75, X),
        sized('وايت موكا', 3.25, 3.75, X),
        sized('سبانش لاتيه', 3.25, 3.75, X),
        { name: 'قهوة تركية', price: 2.1 },
      ] },
      { name: 'مشروبات ساخنة', items: [
        sized('سينامون كاكاو', 3.5, 4, X),
        sized('هوت تشوكلت', 3, 3.5, X),
        sized('ماتشا', 3, 3.5, X),
        sized('شاي', 2, 2.5),
      ] },
      { name: 'قهوة باردة', items: [
        sized('آيس أمريكانو', 2.5, 3, X),
        sized('آيس كافيه لاتيه', 2.75, 3.25, X),
        sized('آيس موكا', 3.25, 3.75, X),
        sized('آيس وايت موكا', 3.25, 3.75, X),
        { name: 'آيس شيك', price: 3.25, ...XS },
        sized('آيس بستاشيو لاتيه', 3.5, 4, X),
        sized('آيس سبانش لاتيه', 3.25, 3.75, X),
        sized('آيس كراميل ماكياتو', 3.25, 3.75, X),
      ] },
      { name: 'فرابيه', items: [
        sized('هب فرابيه', 4, 4.5, { ...X, description: 'فرابيه البيت' }),
        sized('كراميل فرابيه', 3.5, 4, X),
        sized('تشوكلت فرابيه', 3.5, 4, X),
        sized('تشوكلت تشيب فرابيه', 3.5, 4, X),
        sized('سولتد كراميل فرابيه', 3.5, 4, X),
      ] },
      { name: 'مشروبات باردة', items: [
        // 🔴 النكهة قبل الحجم: ترتيب العرض يتبع ترتيب المجموعات على الصنف
        sized('آيس تي', 3, 3.5, { options: [flavors('النكهة', ['مانجو', 'خوخ', 'ليمون', 'كركديه'])] }),
        sized('إنرجي ميكس', 3.75, 4.25, { options: [flavors('النوع', ['بلو باور', 'ريد باور', 'مكس بيري'])] }),
        sized('سموذي', 4, 4.5, { options: [flavors('النكهة', ['تربل بيري', 'مانجو باشن', 'فراولة', 'ريد شاين'])] }),
        sized('كريمي', 4, 4.5, { options: [flavors('النكهة', ['فراولة', 'بستاشيو', 'مانجو', 'لوتس', 'شوكولاتة'])] }),
        { name: 'باشن فروت', price: 4.5 },
        sized('عصير برتقال', 3, 3.5, { description: 'طازج' }),
        sized('عصير ليمون', 3, 3.5, { description: 'طازج' }),
      ] },
      { name: 'مياه وغازيّات', items: [
        { name: 'مياه', price: 1, description: 'قارورة صغيرة' },
        { name: 'مياه غازية', price: 1.5 },
        { name: 'مشروب غازي', price: 2, groups: ['soda'] },
      ] },
    ] },

    // ══ 🍽️ المأكولات ══
    { name: 'المأكولات', sections: [
      { name: 'أطباق رئيسيّة', items: [
        { name: 'معكرونة', price: 4 },
        { name: 'سلطة', price: 3 },
        { name: 'صدور دجاج مشوي', price: 5 },
        { name: 'وجبة برجر', price: 5 },
        { name: 'ساندويشات باردة', price: 3.5 },
        { name: 'بيتزا', price: 5 },
      ] },
    ] },

    // ══ 🎁 العروض ══
    { name: 'العروض', items: [
      { name: 'أرجيلة + سوفت درينك + مياه', price: 5,
        description: 'أرجيلة بأيّ نكهة مع قهوة سنجل أو مشروب غازي أو شاي، والمياه',
        bundle: [
          { item: 'أرجيلة' },
          { choice: { label: 'اختر السوفت درينك', from: SOFT_DRINKS() } },
          { item: 'مياه' },
        ] },
      { name: 'أرجيلة + درينك من اختيارك + مياه', price: 6,
        description: 'أرجيلة بأيّ نكهة مع أيّ مشروبٍ آخر من المنيو، والمياه',
        bundle: [
          { item: 'أرجيلة' },
          // 🔴 قائمةٌ صريحة لا «كلّ ما عدا»: مشروبٌ يضيفه المكان لاحقاً لا يدخل العرض وحده
          { choice: { label: 'اختر مشروبك', from: OTHER_LIST } },
          { item: 'مياه' },
        ] },
    ] },
  ],
};

OTHER_LIST.push(...OTHER_DRINKS());

function SOFT_DRINKS() { return ['قهوة تركية', 'مشروب غازي', 'شاي']; }
/** كلّ مشروبات المنيو عدا السوفت درينك والمياه */
function OTHER_DRINKS() {
  const out: string[] = [];
  const drinks = SPEC_DRINK_SECTIONS();
  for (const s of drinks) for (const it of s.items ?? []) {
    if (SOFT_DRINKS().includes(it.name) || it.name === 'مياه' || it.name === 'مياه غازية') continue;
    out.push(it.name);
  }
  return out;
}
function SPEC_DRINK_SECTIONS() {
  return SPEC.sections.find(s => s.name === 'المشروبات')?.sections ?? [];
}

function countItems(s: any[]): number {
  return s.reduce((n, x) => n + (x.items?.length ?? 0) + countItems(x.sections ?? []), 0);
}

async function main() {
  const errs = validateSpec(SPEC);
  if (errs.length) { console.error('❌ وصفٌ غير صالح:\n  • ' + errs.join('\n  • ')); process.exit(1); }
  console.log(`   ${countItems(SPEC.sections)} صنفاً · ${SPEC.sharedGroups?.length ?? 0} مجموعات مشتركة · عرض 5: ${SOFT_DRINKS().join('، ')} · عرض 6: ${OTHER_DRINKS().length} مشروباً`);
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
  console.log('ℹ️  نكهات الأرجيلة وأنواع الغازي قوائم افتراضيّة — يحذف المكان ما لا يتوفّر عنده\n');
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message || e); process.exit(1); });
