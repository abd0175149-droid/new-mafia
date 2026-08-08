// ══════════════════════════════════════════════════════
// 🎁 خانات الباقة — Bundle Slots
// الباقة كانت قائمةَ مكوّناتٍ ثابتة: [{menuItemId, qty}]. وعروض «جلسة» لا تتّسع
// لها: «سوفت درينك (شاي/قهوة/غازي)» ليس صنفاً بل اختياراً من مجموعة، و«برجر
// كلاسيك ١٥٠غم» صنفٌ بخيارٍ مثبَّتٍ مسبقاً لا يُسأل عنه اللاعب.
//
// فصارت المكوّنات **خانات** بثلاثة أشكال — والشكل الأوّل هو التخزين القديم
// نفسه، فالباقات المبنيّة سابقاً تبقى صالحةً بلا ترحيل:
//   { menuItemId, qty }                          ← ثابتة
//   { menuItemId, qty, lockedOptions:{g:v} }     ← ثابتة بخيارٍ مقفل
//   { choice:{ label, note?, from:[ids] }, qty } ← اختيارٌ واحدٌ من مجموعة
//
// 💰 قاعدة التسعير (قرار المالك 2026-08-08):
//   سعر الباقة ثابت، **إلّا فرقاً معلَناً على خيارٍ اختاره اللاعب** — «تفاحتين
//   نخلة» معسلٌ أغلى بدينار، وابتلاعه داخل باقةٍ ثابتة يعني أنّ المكان يدفعه عن
//   كلّ من يختاره. فالفرق يمرّ ويُعرض قبل الإضافة.
//   أمّا الخيار **المقفل** فلا فرق له: العرض حدّده وسعره محسوبٌ فيه أصلاً.
// ══════════════════════════════════════════════════════

import type { OptionGroup } from './fnb-options.service.js';
import { validateSelections } from './fnb-options.service.js';

export const MAX_SLOTS = 8;
export const MAX_CHOICES_PER_SLOT = 40;

export interface FixedSlot {
  kind: 'fixed';
  menuItemId: number;
  qty: number;
  lockedOptions: Record<string, string>;
}
export interface ChoiceSlot {
  kind: 'choice';
  label: string;
  note: string;
  qty: number;
  from: number[];
}
export type Slot = FixedSlot | ChoiceSlot;

/** يقرأ التخزين الخام (بشكلَيه القديم والجديد) إلى خاناتٍ موحّدة. */
export function readSlots(raw: unknown): Slot[] {
  if (!Array.isArray(raw)) return [];
  const out: Slot[] = [];
  for (const s of raw as any[]) {
    const qty = Math.max(1, Number(s?.qty) || 1);
    if (s?.choice) {
      const from = (Array.isArray(s.choice.from) ? s.choice.from : [])
        .map(Number).filter(Number.isFinite);
      if (from.length === 0) continue;
      out.push({
        kind: 'choice', qty, from,
        label: String(s.choice.label || 'اختر صنفاً').slice(0, 60),
        note: String(s.choice.note || '').slice(0, 120),
      });
    } else {
      const id = Number(s?.menuItemId);
      if (!Number.isFinite(id)) continue;
      const locked: Record<string, string> = {};
      const lo = s?.lockedOptions;
      if (lo && typeof lo === 'object') {
        for (const [k, v] of Object.entries(lo)) {
          if (typeof v === 'string' && v.trim()) locked[String(k)] = v;
        }
      }
      out.push({ kind: 'fixed', menuItemId: id, qty, lockedOptions: locked });
    }
  }
  return out;
}

/** كلّ معرّفات الأصناف التي قد تدخل الباقة — لجلبها دفعةً واحدة. */
export function slotItemIds(slots: Slot[]): number[] {
  const ids: number[] = [];
  for (const s of slots) {
    if (s.kind === 'fixed') ids.push(s.menuItemId);
    else ids.push(...s.from);
  }
  return [...new Set(ids)];
}

/**
 * يتحقّق من وصف الخانات القادم من محرّر المكان.
 * يعيد التخزين الخام الجاهز للكتابة، أو يرمي رسالةً عربيّةً جاهزة للعرض.
 */
export function validateSlotsInput(
  raw: unknown, selfId: number | null, existsAndSimple: (id: number) => boolean,
): any[] {
  const slots = readSlots(raw);
  if (slots.length === 0) throw new Error('الباقة تحتاج خانةً واحدة على الأقلّ');
  if (slots.length > MAX_SLOTS) throw new Error(`عدد خانات الباقة كبير جدّاً (حتى ${MAX_SLOTS})`);

  const out: any[] = [];
  for (const s of slots) {
    if (s.qty > 20) throw new Error('كمّية الخانة يجب أن تكون بين ١ و٢٠');
    if (s.kind === 'fixed') {
      if (selfId !== null && s.menuItemId === selfId) throw new Error('لا يمكن للباقة أن تحتوي نفسها');
      if (!existsAndSimple(s.menuItemId)) throw new Error('مكوّنٌ غير موجود في منيو مكانك أو أنّه باقةٌ أخرى');
      out.push({
        menuItemId: s.menuItemId, qty: s.qty,
        ...(Object.keys(s.lockedOptions).length ? { lockedOptions: s.lockedOptions } : {}),
      });
    } else {
      if (s.from.length > MAX_CHOICES_PER_SLOT) throw new Error(`خياراتُ الخانة كثيرة (حتى ${MAX_CHOICES_PER_SLOT})`);
      if (selfId !== null && s.from.includes(selfId)) throw new Error('لا يمكن للباقة أن تحتوي نفسها');
      for (const id of s.from) {
        if (!existsAndSimple(id)) throw new Error('أحد خيارات الخانة غير موجود في منيو مكانك أو أنّه باقةٌ أخرى');
      }
      out.push({ qty: s.qty, choice: { label: s.label, note: s.note, from: s.from } });
    }
  }
  return out;
}

export interface ResolvedComponent {
  name: string;
  qty: number;
  options?: { group: string; value: string }[];
}

/**
 * يبني مكوّنات الطلب من خانات الباقة + اختيارات اللاعب، ويعيد فرق السعر المارّ.
 * `picks[i]` يقابل `slots[i]`.
 * ⚠️ يرمي رسالةً عربيّةً عند نقصٍ أو اختيارٍ خارج المسموح — لا يُصلح بصمت،
 *    فطلبٌ ناقصٌ يوقف المطبخ أشدَّ من طلبٍ مرفوض.
 */
export function resolveOrderSlots(
  slots: Slot[],
  picks: unknown,
  bundleName: string,
  itemById: Map<number, { id: number; name: string }>,
  groupsByItem: Map<number, OptionGroup[]>,
): { components: ResolvedComponent[]; delta: number } {
  const arr = Array.isArray(picks) ? picks as any[] : [];
  const byIndex = new Map<number, any>();
  for (const p of arr) {
    const i = Number(p?.i);
    if (Number.isFinite(i)) byIndex.set(i, p);
  }

  const components: ResolvedComponent[] = [];
  let delta = 0;

  slots.forEach((s, i) => {
    const pick = byIndex.get(i);
    let itemId: number;

    if (s.kind === 'choice') {
      const chosen = Number(pick?.menuItemId);
      if (!Number.isFinite(chosen)) throw new Error(`اختر «${s.label}» في ${bundleName}`);
      if (!s.from.includes(chosen)) throw new Error(`اختيارٌ غير مسموح في «${s.label}»`);
      itemId = chosen;
    } else {
      itemId = s.menuItemId;
    }

    const item = itemById.get(itemId);
    if (!item) throw new Error(`أحد مكوّنات ${bundleName} لم يعد متاحاً`);

    const groups = groupsByItem.get(itemId) ?? [];
    const locked = s.kind === 'fixed' ? s.lockedOptions : {};
    // المقفل يُستبعَد من السؤال ويُضاف للقطة بلا فرقٍ في السعر
    const askable = groups.filter(g => !(g.name in locked));
    const r = validateSelections(askable, pick?.options, `${item.name} (داخل ${bundleName})`);
    delta += r.delta;

    const opts = [
      ...Object.entries(locked).map(([group, value]) => ({ group, value })),
      ...r.chosen.map(o => ({ group: o.group, value: o.value })),
    ];
    components.push({
      name: item.name, qty: s.qty,
      ...(opts.length ? { options: opts } : {}),
    });
  });

  return { components, delta };
}
