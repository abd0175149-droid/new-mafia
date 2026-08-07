// ══════════════════════════════════════════════════════
// ☕ تحميل منيو «كافية جلسة» من المصدر الورقيّ
// مصدر البيانات: منيو_كافيه_جلسة.xlsx (تفريغٌ يدويّ من صورة المنيو 2026-08-08)
// ٥٨ سطراً في الملفّ ⇐ ٤٠ صنفاً + ٤ مجموعات خيارات، لأنّ الأسطر التي تختلف
// في «النوع/الحجم» وحده (سنجل/دبل · نكهات الموهيتو والسموذي والميلك شيك)
// صنفٌ واحدٌ بخياراتٍ لا أصنافٌ متعدّدة — وإلّا رأى اللاعب ٩ بطاقات موهيتو.
//
// 💰 حصّة النادي = 0 لكلّ صنف: الملفّ يحمل سعر المكان ولا يذكر هامش النادي،
//    وليس لي أن أخترع رقماً ماليّاً. تُضبط من محرّر الصنف في لوحة الإدارة.
// 💰 فرق سعر الخيار يعود للمكان كاملاً (قرار مقفل) — وحصّة النادي مبلغٌ ثابت
//    على الصنف، فلا يتأثّر بالحجم أو النكهة.
//
// التشغيل:  npx tsx src/scripts/seed-jalsa-menu.ts            (تجربة بلا كتابة)
//           npx tsx src/scripts/seed-jalsa-menu.ts --apply    (تنفيذ)
// ══════════════════════════════════════════════════════

import { and, eq, inArray } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { locations } from '../schemas/admin.schema.js';
import {
  menuCategories, menuItems, menuOptionGroups, menuOptionValues,
} from '../schemas/fnb.schema.js';

const LOCATION_ID = Number(process.env.SEED_LOCATION_ID || 8);
const APPLY = process.argv.includes('--apply');

// ── مجموعات الخيارات المشتركة ────────────────────────
// مشتركة لا خاصّة بالصنف: «الحجم» يخدم الإسبريسو والقهوة التركيّة معاً،
// فإضافة حجمٍ ثالثٍ لاحقاً تعديلٌ في مكانٍ واحد.
const OPTION_GROUPS = [
  {
    key: 'size',
    name: 'الحجم',
    selectionType: 'single',
    isRequired: true,
    values: [
      { name: 'سنجل', priceDelta: '0.00' },
      { name: 'دبل', priceDelta: '0.50' },
    ],
  },
  {
    key: 'mojito',
    name: 'نكهة الموهيتو',
    selectionType: 'single',
    isRequired: true,
    values: [
      { name: 'ليمون ونعنع', priceDelta: '0.00' },
      { name: 'فراولة', priceDelta: '0.00' },
      { name: 'باشن فروت', priceDelta: '0.00' },
      { name: 'بلو بيري', priceDelta: '0.00' },
      { name: 'مانجا', priceDelta: '0.00' },
      { name: 'رمان', priceDelta: '0.00' },
      { name: 'بلو كوراكاو', priceDelta: '0.00' },
      { name: 'سموك', priceDelta: '0.00' },
      // مشروب الطاقة سطرٌ مستقلّ في الملفّ بسعر 3.50 — هنا نكهةٌ بفارق 1.00
      // كي يرى اللاعب بطاقة موهيتو واحدة. المحصّلة نفسها: 2.50 + 1.00
      { name: 'إنرجي درينك', priceDelta: '1.00' },
    ],
  },
  {
    key: 'smoothie',
    name: 'نكهة السموذي',
    selectionType: 'single',
    isRequired: true,
    values: [
      { name: 'باشن فروت', priceDelta: '0.00' },
      { name: 'بينا كولادا', priceDelta: '0.00' },
      { name: 'تروبيكال', priceDelta: '0.00' },
      { name: 'مكس بيري', priceDelta: '0.00' },
    ],
  },
  {
    key: 'shake',
    name: 'نكهة الميلك شيك',
    selectionType: 'single',
    isRequired: true,
    values: [
      { name: 'فانيلا', priceDelta: '0.00' },
      { name: 'شوكولاتة', priceDelta: '0.00' },
      { name: 'كراميل', priceDelta: '0.50' },
      { name: 'أوريو', priceDelta: '0.50' },
      { name: 'سنكرز', priceDelta: '0.50' },
      { name: 'فراولة', priceDelta: '0.50' },
    ],
  },
] as const;

// ── الأقسام والأصناف ─────────────────────────────────
// تسعة أقسام رئيسة بلا مستوىً ثانٍ: هي أقسام المنيو المطبوع نفسها،
// وإقحام أبٍ «مشروبات» فوقها يزيد نقرةً بلا معلومة (كلّ المنيو مشروبات).
const CATEGORIES: { name: string; items: Item[] }[] = [
  {
    name: 'المشروبات الساخنة',
    items: [
      { name: 'جلسة (قهوة الاختصاص)', price: '3.00', description: 'مشروب البيت المميّز' },
      { name: 'إسبريسو', price: '1.50', group: 'size' },
      { name: 'قهوة تركية', price: '1.50', group: 'size' },
      { name: 'أمريكانو', price: '2.50' },
      { name: 'كابتشينو', price: '3.00' },
      { name: 'لاتيه', price: '2.50' },
      { name: 'فلات وايت', price: '2.50' },
      { name: 'سبانش لاتيه', price: '3.00' },
      { name: 'موكا', price: '3.00' },
      { name: 'هوت شوكليت', price: '2.50' },
    ],
  },
  {
    name: 'المشروبات الباردة',
    items: [
      { name: 'آيس جلسة', price: '3.00' },
      { name: 'آيس أمريكانو', price: '3.00' },
      { name: 'آيس لاتيه', price: '3.00' },
      { name: 'آيس كابتشينو', price: '3.00' },
      { name: 'آيس سبانش لاتيه', price: '3.00' },
      { name: 'آيس كراميل ماكياتو', price: '3.00' },
      { name: 'آيس موكا', price: '3.00' },
      { name: 'آيس شوكليت', price: '3.00' },
      { name: 'آيس تي', price: '2.50' },
    ],
  },
  { name: 'الموهيتو', items: [{ name: 'موهيتو', price: '2.50', group: 'mojito' }] },
  { name: 'السموذي', items: [{ name: 'سموذي', price: '3.50', group: 'smoothie' }] },
  { name: 'الميلك شيك', items: [{ name: 'ميلك شيك', price: '3.00', group: 'shake' }] },
  {
    name: 'العصائر الطبيعية',
    items: [
      { name: 'عصير ليمون', price: '3.00' },
      { name: 'عصير ليمون ونعنع', price: '3.00' },
      { name: 'عصير برتقال', price: '2.50' },
      { name: 'عصير فراولة', price: '2.50' },
      { name: 'عصير مانجا', price: '3.00' },
    ],
  },
  {
    name: 'الشاي',
    items: [
      { name: 'شاي', price: '1.50' },
      { name: 'شاي أخضر', price: '1.50' },
      { name: 'زهورات', price: '1.50' },
      { name: 'شاي بالحليب', price: '2.00' },
    ],
  },
  {
    name: 'الكوكتيلات',
    items: [
      { name: 'كوكتيل فواكه', price: '2.50' },
      { name: 'موز وحليب', price: '2.00' },
      { name: 'فراولة وحليب', price: '2.00' },
    ],
  },
  {
    name: 'المشروبات الجاهزة',
    items: [
      { name: 'مشروبات غازية', price: '1.00', description: 'علبة' },
      { name: 'ممتو', price: '1.50', description: 'علبة' },
      { name: 'باربيكان', price: '1.75', description: 'علبة' },
      { name: 'ريد بول', price: '2.50', description: 'علبة' },
      { name: 'بوم بوم', price: '2.00', description: 'علبة' },
      { name: 'كود ريد', price: '2.00', description: 'علبة' },
    ],
  },
];

interface Item {
  name: string;
  price: string;
  description?: string;
  group?: (typeof OPTION_GROUPS)[number]['key'];
}

async function main() {
  await connectDB();
  const db = getDB();
  if (!db) throw new Error('قاعدة البيانات غير متوفرة');

  const [loc] = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(eq(locations.id, LOCATION_ID)).limit(1);
  if (!loc) throw new Error(`المكان #${LOCATION_ID} غير موجود`);

  const itemCount = CATEGORIES.reduce((s, c) => s + c.items.length, 0);
  const valueCount = OPTION_GROUPS.reduce((s, g) => s + g.values.length, 0);
  console.log(`\n☕ منيو «${loc.name}» (#${loc.id})`);
  console.log(`   ${CATEGORIES.length} أقسام · ${itemCount} صنفاً · ${OPTION_GROUPS.length} مجموعات خيارات (${valueCount} قيمة)`);

  const oldItems = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.locationId, LOCATION_ID));
  const oldCats = await db.select({ id: menuCategories.id }).from(menuCategories).where(eq(menuCategories.locationId, LOCATION_ID));
  const oldGroups = await db.select({ id: menuOptionGroups.id }).from(menuOptionGroups).where(eq(menuOptionGroups.locationId, LOCATION_ID));
  console.log(`   يُحذف: ${oldItems.length} صنفاً · ${oldCats.length} قسماً · ${oldGroups.length} مجموعة خيارات`);

  if (!APPLY) {
    console.log('\n⚠️  تجربة فقط — أضف --apply للتنفيذ\n');
    process.exit(0);
  }

  // ── المسح ──
  // الأصناف تُحذف حذفاً ناعماً: بنود الطلبات القديمة تشير إليها، ومع أنّ
  // الاسم والسعر والحصّة ملقوطة في order_items يبقى الرابط مفيداً للتقارير.
  if (oldItems.length) {
    await db.update(menuItems).set({ deletedAt: new Date() } as any)
      .where(and(eq(menuItems.locationId, LOCATION_ID)));
  }
  // الأقسام والخيارات تُحذف حذفاً صلباً: لا سجلّ تاريخيّ يشير إليها —
  // اختيارات اللاعب ملقوطة بالاسم في order_items.options_snapshot لا بالمعرّف.
  if (oldGroups.length) {
    await db.delete(menuOptionValues).where(inArray(menuOptionValues.groupId, oldGroups.map(g => g.id)));
    await db.delete(menuOptionGroups).where(eq(menuOptionGroups.locationId, LOCATION_ID));
  }
  if (oldCats.length) {
    await db.delete(menuCategories).where(eq(menuCategories.locationId, LOCATION_ID));
  }
  console.log('🧹 مُسح المنيو السابق');

  // ── مجموعات الخيارات ──
  const groupId: Record<string, number> = {};
  for (const [i, g] of OPTION_GROUPS.entries()) {
    const [row] = await db.insert(menuOptionGroups).values({
      locationId: LOCATION_ID,
      name: g.name,
      selectionType: g.selectionType,
      isRequired: g.isRequired,
      maxSelect: 1,
      sortOrder: i,
    } as any).returning({ id: menuOptionGroups.id });
    groupId[g.key] = row.id;
    await db.insert(menuOptionValues).values(
      g.values.map((v, j) => ({
        groupId: row.id, name: v.name, priceDelta: v.priceDelta, sortOrder: j,
      })) as any,
    );
    console.log(`   ⚙️  ${g.name} — ${g.values.length} قيمة`);
  }

  // ── الأقسام والأصناف ──
  let n = 0;
  for (const [ci, cat] of CATEGORIES.entries()) {
    const [c] = await db.insert(menuCategories).values({
      locationId: LOCATION_ID, parentId: null, name: cat.name, sortOrder: ci,
    } as any).returning({ id: menuCategories.id });

    await db.insert(menuItems).values(
      cat.items.map((it, ii) => ({
        locationId: LOCATION_ID,
        categoryId: c.id,
        category: cat.name,             // لقطة الاسم للقراءات القديمة
        name: it.name,
        description: it.description || '',
        price: it.price,
        clubShare: '0.00',              // 💰 يُضبط من لوحة الإدارة
        isAvailable: true,
        sortOrder: ii,
        optionGroupIds: it.group ? [groupId[it.group]] : [],
        customOptions: [],
      })) as any,
    );
    n += cat.items.length;
    console.log(`   📂 ${cat.name} — ${cat.items.length} صنفاً`);
  }

  console.log(`\n✅ تمّ: ${CATEGORIES.length} أقسام · ${n} صنفاً · ${OPTION_GROUPS.length} مجموعات خيارات`);
  console.log('⚠️  حصّة النادي 0.00 على كلّ صنف — اضبطها من لوحة الإدارة ← الأماكن ← المنيو\n');
  process.exit(0);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
