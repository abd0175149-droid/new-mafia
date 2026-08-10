// ══════════════════════════════════════════════════════
// 📥 استيراد منيو مكانٍ من وصفٍ تصريحيّ — Menu Import
// كلّ مكانٍ جديد صار ملفَّ وصفٍ لا سكربتَ إدخالٍ خاصّاً به: تكتب الأقسام
// والأصناف والخيارات كما هي في المنيو المطبوع، وهذه الخدمة تتكفّل بالترتيب
// والربط وحلّ مكوّنات الباقات وحدود العمق.
//
// 🗂️ الاصطلاح الموحَّد للأقسام (مستويان — سقف الجدول):
//     المستوى الأوّل = **نوع المنيو**: مشروبات · مأكولات · أراجيل
//     المستوى الثاني = **أقسام المنيو المطبوع**: ساخنة · باردة · برغر اللحم
//   ومكانٌ بنوعٍ واحد يكتب أقسامه في المستوى الأوّل مباشرةً بلا أبٍ مفتعل.
//
// ⚙️ متى تكون المجموعة مشتركة ومتى تكون خاصّة بالصنف؟
//     مشتركة  — حين يستعملها أكثر من صنفٍ **بنفس فروق الأسعار**
//               (عادي/حار على أربعة ساندويشات · نكهة المعسل على كلّ الأراجيل)
//     خاصّة   — حين يختلف فرق السعر من صنفٍ لآخر
//               (أوزان البرغر: ول سبايسي يقفز ١٫٥٠ للـ٢٠٠غم وغيره ١٫٢٥)
//   الخلط بينهما هو الخطأ الشائع: مجموعةٌ مشتركة تحمل فروقاً واحدة فحسب،
//   فربطها بصنفٍ يختلف تدرّجه يُسعّره خطأً بصمت.
// ══════════════════════════════════════════════════════

import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import {
  menuCategories, menuItems, menuOptionGroups, menuOptionValues,
} from '../schemas/fnb.schema.js';

export interface SpecValue { name: string; priceDelta?: number }

export interface SpecGroup {
  /** مفتاحٌ داخليّ للوصف — يُشار إليه من `groups` في الأصناف. لا يُخزَّن. */
  key?: string;
  name: string;
  selectionType?: 'single' | 'multi';
  isRequired?: boolean;
  maxSelect?: number;
  values: SpecValue[];
}

export interface SpecItem {
  name: string;
  price: number;
  description?: string;
  /** مفاتيح مجموعاتٍ مشتركة معرَّفة في `sharedGroups` */
  groups?: string[];
  /** مجموعاتٌ تخصّ هذا الصنف وحده */
  options?: SpecGroup[];
  /**
   * باقة: خاناتٌ تُكتب **بأسماء الأصناف** وتُحلّ إلى معرّفاتٍ بعد إدخال الجميع.
   *   { item }                     ← ثابتة
   *   { item, lock:{مجموعة:قيمة} } ← ثابتة بخيارٍ مقفل لا يُسأل عنه
   *   { choice:{label, from:[…]} } ← اختيارٌ واحدٌ من مجموعة
   */
  bundle?: SpecSlot[];
  isAvailable?: boolean;
}

export type SpecSlot =
  | { item: string; qty?: number; lock?: Record<string, string> }
  | { choice: { label: string; note?: string; from: string[] }; qty?: number };

export interface SpecSection {
  name: string;
  items?: SpecItem[];
  /** أقسامٌ فرعيّة — مستوىً واحدٌ فقط، والأعمق يُرفض */
  sections?: SpecSection[];
}

export interface MenuSpec {
  sharedGroups?: SpecGroup[];
  sections: SpecSection[];
}

export interface ImportResult {
  categories: number; items: number; groups: number; values: number; bundles: number;
  removed: { items: number; categories: number; groups: number };
  log: string[];
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** يتحقّق من الوصف قبل أيّ كتابة — الفشل هنا أرخص من منيو نصفِ مُدخَل. */
export function validateSpec(spec: MenuSpec): string[] {
  const errs: string[] = [];
  const keys = new Set((spec.sharedGroups ?? []).map(g => g.key).filter(Boolean) as string[]);
  if ((spec.sharedGroups ?? []).some(g => !g.key)) errs.push('كلّ مجموعةٍ مشتركة تحتاج مفتاحاً (key)');
  if (keys.size !== (spec.sharedGroups ?? []).length) errs.push('مفاتيح المجموعات المشتركة مكرّرة');

  // أطوال الأعمدة: تجاوزها كان يفشل في **منتصف** الإدخال بخطأ قاعدةٍ خام —
  // بعد مسح المنيو القديم. الفشل هنا قبل أيّ كتابة.
  const checkLen = (val: string | undefined, max: number, what: string) => {
    if (val && val.length > max) errs.push(`${what} «${val.slice(0, 30)}…» أطول من ${max} حرفاً`);
  };
  for (const g of spec.sharedGroups ?? []) {
    checkLen(g.name, 80, 'اسم مجموعة');
    for (const v of g.values) {
      checkLen(v.name, 80, 'اسم قيمة');
      if ((v.priceDelta ?? 0) < 0) errs.push(`فرقٌ سالب على «${v.name}» — الفروق صفرٌ فأكثر (كما في المحرّر)`);
    }
  }

  const names = new Set<string>();
  const walk = (secs: SpecSection[], depth: number) => {
    for (const s of secs) {
      if (!s.name?.trim()) errs.push('قسمٌ بلا اسم');
      checkLen(s.name, 50, 'اسم قسم');   // الأضيق: لقطة menuItems.category varchar(50)
      if (s.sections?.length) {
        // 🔴 الجدول يحمل مستويين: parent_id واحدٌ لا سلسلة. الأعمق يُرفض هنا
        //    لا في قاعدة البيانات، وإلّا ظهرت أقسامٌ يتيمة لا تصل اللاعب.
        if (depth >= 1) errs.push(`«${s.name}»: عمق الأقسام مستويان فقط`);
        else walk(s.sections, depth + 1);
      }
      for (const it of s.items ?? []) {
        if (!it.name?.trim()) errs.push(`صنفٌ بلا اسم في «${s.name}»`);
        checkLen(it.name, 150, 'اسم صنف');
        if (!Number.isFinite(it.price) || it.price < 0) errs.push(`«${it.name}»: سعرٌ غير صالح`);
        for (const g of it.options ?? []) {
          checkLen(g.name, 80, 'اسم مجموعة');
          for (const v of g.values ?? []) {
            checkLen(v.name, 80, 'اسم قيمة');
            if ((v.priceDelta ?? 0) < 0) errs.push(`«${it.name}» ← «${v.name}»: فرقٌ سالب`);
          }
        }
        if (names.has(it.name)) errs.push(`اسمٌ مكرّر: «${it.name}» — مكوّنات الباقات تُحلّ بالاسم فيلتبس`);
        names.add(it.name);
        for (const k of it.groups ?? []) {
          if (!keys.has(k)) errs.push(`«${it.name}»: مجموعةٌ مشتركة غير معرَّفة «${k}»`);
        }
        for (const g of it.options ?? []) {
          if (!g.values?.length) errs.push(`«${it.name}» ← «${g.name}»: مجموعةٌ بلا قيم`);
        }
        if (it.bundle && !it.bundle.length) errs.push(`«${it.name}»: باقةٌ بلا مكوّنات`);
      }
    }
  };
  walk(spec.sections, 0);

  // مكوّنات الباقات يجب أن تكون أصنافاً في الوصف نفسه — والاسم هو الرابط
  const walkB = (secs: SpecSection[]) => {
    for (const s of secs) {
      for (const it of s.items ?? []) {
        for (const c of it.bundle ?? []) {
          const refs = 'choice' in c ? c.choice.from : [c.item];
          if ('choice' in c && (!c.choice.from?.length)) errs.push(`باقة «${it.name}»: خانة اختيارٍ بلا مرشّحين`);
          for (const n of refs) {
            if (!names.has(n)) errs.push(`باقة «${it.name}»: المكوّن «${n}» غير موجود في الوصف`);
            if (n === it.name) errs.push(`باقة «${it.name}» تحتوي نفسها`);
          }
        }
      }
      if (s.sections) walkB(s.sections);
    }
  };
  walkB(spec.sections);
  return errs;
}

/**
 * يطبّق الوصف على مكان. `wipe` يمسح منيو المكان الحاليّ أوّلاً.
 * الأصناف تُمسح حذفاً ناعماً (بنود الطلبات القديمة تشير إليها)،
 * والأقسام والمجموعات حذفاً صلباً (اختيارات اللاعب ملقوطة بالاسم لا بالمعرّف).
 */
export async function applyMenuSpec(
  outerDb: Database, locationId: number, spec: MenuSpec, opts: { wipe?: boolean } = {},
): Promise<ImportResult> {
  const errs = validateSpec(spec);
  if (errs.length) throw new Error('وصفٌ غير صالح:\n  • ' + errs.join('\n  • '));

  const log: string[] = [];
  const res: ImportResult = {
    categories: 0, items: 0, groups: 0, values: 0, bundles: 0,
    removed: { items: 0, categories: 0, groups: 0 }, log,
  };

  // 🔴 معاملةٌ واحدة للكلّ: مع wipe يُمسح المنيو القديم قبل الإدخال — أيّ فشلِ
  //    قاعدةٍ في المنتصف كان يترك المكان بمنيو ممسوحٍ أو نصفِ مُدخَل بلا تراجع.
  //    التحقّق أعلاه يصطاد المتوقَّع، والمعاملة تحمي من غير المتوقَّع.
  await outerDb.transaction(async (db) => {

  if (opts.wipe) {
    const oldItems = await db.select({ id: menuItems.id }).from(menuItems)
      .where(and(eq(menuItems.locationId, locationId), isNull(menuItems.deletedAt)));
    const oldCats = await db.select({ id: menuCategories.id }).from(menuCategories)
      .where(eq(menuCategories.locationId, locationId));
    const oldGroups = await db.select({ id: menuOptionGroups.id }).from(menuOptionGroups)
      .where(eq(menuOptionGroups.locationId, locationId));

    if (oldItems.length) {
      await db.update(menuItems).set({ deletedAt: new Date() } as any)
        .where(and(eq(menuItems.locationId, locationId), isNull(menuItems.deletedAt)));
    }
    if (oldGroups.length) {
      await db.delete(menuOptionValues).where(inArray(menuOptionValues.groupId, oldGroups.map(g => g.id)));
      await db.delete(menuOptionGroups).where(eq(menuOptionGroups.locationId, locationId));
    }
    if (oldCats.length) await db.delete(menuCategories).where(eq(menuCategories.locationId, locationId));

    res.removed = { items: oldItems.length, categories: oldCats.length, groups: oldGroups.length };
    log.push(`🧹 مُسح: ${oldItems.length} صنفاً · ${oldCats.length} قسماً · ${oldGroups.length} مجموعة`);
  }

  // ── المجموعات المشتركة ──
  const groupId = new Map<string, number>();
  for (const [i, g] of (spec.sharedGroups ?? []).entries()) {
    const [row] = await db.insert(menuOptionGroups).values({
      locationId, name: g.name,
      selectionType: g.selectionType ?? 'single',
      isRequired: g.isRequired === true,
      maxSelect: Math.max(1, g.maxSelect ?? 1),
      sortOrder: i,
    } as any).returning({ id: menuOptionGroups.id });
    groupId.set(g.key!, row.id);
    await db.insert(menuOptionValues).values(g.values.map((v, j) => ({
      groupId: row.id, name: v.name, priceDelta: money(v.priceDelta ?? 0), sortOrder: j,
    })) as any);
    res.groups++; res.values += g.values.length;
    log.push(`⚙️  ${g.name} — ${g.values.length} قيمة`);
  }

  // ── الأقسام والأصناف ──
  const itemId = new Map<string, number>();
  const pendingBundles: { id: number; parts: SpecSlot[] }[] = [];

  const insertItems = async (items: SpecItem[], catId: number, catName: string) => {
    for (const [ii, it] of items.entries()) {
      const [row] = await db.insert(menuItems).values({
        locationId, categoryId: catId, category: catName,
        name: it.name, description: it.description || '',
        price: money(it.price), clubShare: '0.00',
        isAvailable: it.isAvailable !== false, sortOrder: ii,
        optionGroupIds: (it.groups ?? []).map(k => groupId.get(k)!).filter(Boolean),
        customOptions: (it.options ?? []).map(g => ({
          name: g.name,
          selectionType: g.selectionType ?? 'single',
          isRequired: g.isRequired === true,
          maxSelect: Math.max(1, g.maxSelect ?? 1),
          values: g.values.map(v => ({ name: v.name, priceDelta: money(v.priceDelta ?? 0) })),
        })),
      } as any).returning({ id: menuItems.id });
      itemId.set(it.name, row.id);
      res.items++;
      if (it.bundle) pendingBundles.push({ id: row.id, parts: it.bundle });
    }
  };

  let order = 0;
  const walkSections = async (secs: SpecSection[], parentId: number | null) => {
    for (const s of secs) {
      const [cat] = await db.insert(menuCategories).values({
        locationId, parentId, name: s.name, sortOrder: order++,
      } as any).returning({ id: menuCategories.id });
      res.categories++;
      if (s.items?.length) {
        await insertItems(s.items, cat.id, s.name);
        log.push(`📂 ${parentId ? '  ↳ ' : ''}${s.name} — ${s.items.length} صنفاً`);
      } else {
        log.push(`📂 ${s.name}`);
      }
      if (s.sections?.length) await walkSections(s.sections, cat.id);
    }
  };
  await walkSections(spec.sections, null);

  // ── الباقات: تُحلّ بعد إدخال كلّ الأصناف كي يوجد المكوّن مهما كان ترتيبه ──
  for (const b of pendingBundles) {
    await db.update(menuItems).set({
      isBundle: true,
      bundleItems: b.parts.map(p => 'choice' in p
        ? { qty: p.qty ?? 1, choice: {
            label: p.choice.label, note: p.choice.note ?? '',
            from: p.choice.from.map(n => itemId.get(n)!),
          } }
        : {
            menuItemId: itemId.get(p.item)!, qty: p.qty ?? 1,
            ...(p.lock ? { lockedOptions: p.lock } : {}),
          }),
    } as any).where(eq(menuItems.id, b.id));
    res.bundles++;
  }
  if (res.bundles) log.push(`🎁 ${res.bundles} باقة — حُلّت مكوّناتها`);
  });

  return res;
}
