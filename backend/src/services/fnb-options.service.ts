// ══════════════════════════════════════════════════════
// ⚙️ خيارات المنيو — مصدرٌ واحد للحلّ والتحقّق والتسعير
// 🎯 قرارات المالك (2026-08-06):
//   • مجموعاتٌ مشتركة لكلّ مكان **و** مجموعاتٌ خاصّة بالصنف — الاثنان معاً.
//   • فرق سعر الخيار يعود **للمكان كاملاً**: حصّة النادي تبقى مبلغاً ثابتاً
//     على الصنف مهما اختار اللاعب، فلا حصّة على الفروق.
// المفاتيح مستقرّة كي يرسلها العميل ويحلّها الخادم بلا لبس:
//   مجموعة مشتركة g{groupId} / قيمتها v{valueId}
//   مجموعة خاصّة   c{index}   / قيمتها  c{index}:{valueIndex}
// ══════════════════════════════════════════════════════

import { eq, and, inArray, isNull, asc } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { menuOptionGroups, menuOptionValues } from '../schemas/fnb.schema.js';

export interface OptionValue { key: string; name: string; priceDelta: number }
export interface OptionGroup {
  key: string;
  name: string;
  selectionType: 'single' | 'multi';
  isRequired: boolean;
  maxSelect: number;
  values: OptionValue[];
}
export interface ChosenOption { group: string; value: string; priceDelta: number }

const num = (x: unknown) => { const n = parseFloat(String(x ?? '0')); return Number.isFinite(n) ? n : 0; };

/** يبني مجموعات الخيارات الفعّالة لكلّ صنف: المشتركة المربوطة + الخاصّة به. */
export async function resolveOptionGroups(
  db: Database,
  items: { id: number; optionGroupIds: unknown; customOptions: unknown }[],
): Promise<Map<number, OptionGroup[]>> {
  const out = new Map<number, OptionGroup[]>();
  if (items.length === 0) return out;

  // كلّ المجموعات المشتركة المطلوبة دفعةً واحدة (لا استعلام لكلّ صنف)
  const sharedIds = [...new Set(items.flatMap(i =>
    (Array.isArray(i.optionGroupIds) ? i.optionGroupIds as any[] : []).map(Number).filter(Number.isFinite)))];

  const sharedById = new Map<number, OptionGroup>();
  if (sharedIds.length > 0) {
    const groups = await db.select().from(menuOptionGroups)
      .where(and(inArray(menuOptionGroups.id, sharedIds), isNull(menuOptionGroups.deletedAt)))
      .orderBy(asc(menuOptionGroups.sortOrder), asc(menuOptionGroups.id));
    const values = groups.length > 0
      ? await db.select().from(menuOptionValues)
          .where(and(inArray(menuOptionValues.groupId, groups.map(g => g.id)), isNull(menuOptionValues.deletedAt)))
          .orderBy(asc(menuOptionValues.sortOrder), asc(menuOptionValues.id))
      : [];
    for (const g of groups) {
      sharedById.set(g.id, {
        key: `g${g.id}`,
        name: g.name,
        selectionType: g.selectionType === 'multi' ? 'multi' : 'single',
        isRequired: g.isRequired === true,
        maxSelect: Math.max(1, g.maxSelect ?? 1),
        // القيمة غير المتاحة تُخفى تماماً — لا تُعرض ولا تُقبل
        values: values.filter(v => v.groupId === g.id && v.isAvailable !== false)
          .map(v => ({ key: `v${v.id}`, name: v.name, priceDelta: num(v.priceDelta) })),
      });
    }
  }

  for (const it of items) {
    const groups: OptionGroup[] = [];
    for (const raw of (Array.isArray(it.optionGroupIds) ? it.optionGroupIds as any[] : [])) {
      const g = sharedById.get(Number(raw));
      if (g && g.values.length > 0) groups.push(g);   // مجموعةٌ بلا قيمٍ متاحة تُتجاهَل
    }
    (Array.isArray(it.customOptions) ? it.customOptions as any[] : []).forEach((c, ci) => {
      const values = (Array.isArray(c?.values) ? c.values : [])
        .map((v: any, vi: number) => ({ key: `c${ci}:${vi}`, name: String(v?.name || '').trim(), priceDelta: num(v?.priceDelta) }))
        .filter((v: OptionValue) => v.name);
      if (values.length === 0) return;
      groups.push({
        key: `c${ci}`,
        name: String(c?.name || '').trim() || 'خيارات',
        selectionType: c?.selectionType === 'multi' ? 'multi' : 'single',
        isRequired: c?.isRequired === true,
        maxSelect: Math.max(1, parseInt(c?.maxSelect) || 1),
        values,
      });
    });
    out.set(it.id, groups);
  }
  return out;
}

/**
 * يتحقّق من اختيارات اللاعب لصنفٍ واحد ويحسب فرق السعر.
 * يرمي Error برسالةٍ عربيّة جاهزةٍ للعرض عند أيّ خللٍ — الرفض هنا أأمن من
 * قبول طلبٍ ناقصٍ يكتشفه الباريستا بعد نصف ساعة.
 */
export function validateSelections(
  groups: OptionGroup[],
  raw: unknown,
  itemName: string,
): { chosen: ChosenOption[]; delta: number } {
  const sent = Array.isArray(raw) ? raw : [];
  const byGroup = new Map<string, string[]>();
  for (const s of sent) {
    const g = String((s as any)?.group ?? '');
    const v = String((s as any)?.value ?? '');
    if (!g || !v) continue;
    const arr = byGroup.get(g) ?? [];
    if (!arr.includes(v)) arr.push(v);   // تكرار القيمة نفسها لا يُضاعف السعر
    byGroup.set(g, arr);
  }

  const chosen: ChosenOption[] = [];
  let delta = 0;

  for (const g of groups) {
    const picked = byGroup.get(g.key) ?? [];
    if (picked.length === 0) {
      if (g.isRequired) throw new Error(`اختر «${g.name}» لـ${itemName}`);
      continue;
    }
    const limit = g.selectionType === 'single' ? 1 : g.maxSelect;
    if (picked.length > limit) {
      throw new Error(`«${g.name}» لـ${itemName}: الحدّ الأقصى ${limit}`);
    }
    for (const key of picked) {
      const val = g.values.find(v => v.key === key);
      if (!val) throw new Error(`خيارٌ غير متاح في «${g.name}» لـ${itemName} — حدّث المنيو`);
      chosen.push({ group: g.name, value: val.name, priceDelta: val.priceDelta });
      delta += val.priceDelta;
    }
  }

  // مجموعةٌ أُرسلت وليست ضمن خيارات الصنف = عميلٌ قديم أو عبث — تُرفض صراحةً
  const known = new Set(groups.map(g => g.key));
  for (const key of byGroup.keys()) {
    if (!known.has(key)) throw new Error(`خيارٌ غير معروف لـ${itemName} — حدّث المنيو وأعد المحاولة`);
  }

  return { chosen, delta };
}

/** نصّ مختصر للعرض: «نكهة: تفاحتين · الحجم: كبير». */
export const optionsLine = (opts: { group: string; value: string }[]) =>
  opts.map(o => `${o.group}: ${o.value}`).join(' · ');
