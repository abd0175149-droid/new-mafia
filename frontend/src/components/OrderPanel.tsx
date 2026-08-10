'use client';

// ══════════════════════════════════════════════════════
// 🍽️ لوحة طلب اللاعب — المنيو والعروض والسلّة
// بنيةٌ ثلاثيّة: **ثابتٌ · متمرّرٌ · ثابت** — الإغلاق والتنقّل والسلّة لا تغيب.
//
// 🧭 التنقّل (قرار 2026-08-09 بعد موازنة ثلاثة سيناريوهات):
//   كان تبويباتٍ + تبويبَي جذرٍ + شرائحَ تصفية — ثلاث طبقاتٍ قبل أوّل صنف،
//   والتصفية تُخفي بقيّة المنيو. صار **قائمةً واحدةً متّصلة** بكلّ الأقسام
//   وشريطَ شرائحَ لاصقاً يعمل قفزاً لا تصفية: يضيء على القسم الظاهر أثناء
//   التمرير (scroll-spy) وينقل إليه بنقرة. النمط الذي اعتاده الجميع من
//   تطبيقات التوصيل: تصفّحٌ بصفر نقرات، وقفزٌ لأيّ قسمٍ بنقرة.
//   والعروض صارت أوّل قسمٍ في القائمة نفسها — فالتبويبات اثنان لا ثلاثة.
//
// 🎁 الباقة خانات: ثابتة · ثابتة بخيارٍ مقفل · اختيارٌ من مجموعة. السعر ثابتٌ
//    إلّا فرقاً معلَناً على خيارٍ اختاره اللاعب (تفاحتين نخلة +١) — يمرّ ويُعرض.
// 📖 الوصف الطويل (مكوّنات البرغر) لم يعد يُبتر: صنفٌ بلا خياراتٍ ووصفُه طويل
//    يفتح ورقة تفصيلٍ كاملة، وذو الخيارات يعرض وصفه كاملاً داخل ورقته.
// 💨 خدمة الأرجيلة تسكن «طلباتي» لأنّها متعلّقةٌ بطلبٍ وصل لا صنفٌ يُشترى.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';

interface OptionValue { key: string; name: string; priceDelta: number }
interface OptionGroup {
  key: string; name: string; selectionType: 'single' | 'multi';
  isRequired: boolean; maxSelect: number; values: OptionValue[];
}
interface Chosen { group: string; value: string }

/** خانة باقة كما يبنيها الخادم */
type Slot =
  | { i: number; kind: 'fixed'; menuItemId: number; name: string; qty: number;
      lockedOptions: Record<string, string>; optionGroups: OptionGroup[] }
  | { i: number; kind: 'choice'; label: string; note: string; qty: number;
      from: { menuItemId: number; name: string; optionGroups: OptionGroup[] }[] };

interface Item {
  id: number; category: string; subcategory?: string; name: string; description: string;
  price: string; imageUrl: string | null;
  isBundle?: boolean; slots?: Slot[]; optionGroups?: OptionGroup[];
}
interface MyOrder {
  id: number; status: string; total: string; note: string; createdAt: string;
  items: { name: string; unitPrice: string; quantity: number;
           components?: { name: string; qty: number; options?: Chosen[] }[]; options?: Chosen[] }[];
}
interface Ctx {
  activityId: number; activityName: string; locationName: string; source: 'live' | 'booking';
}

/** اختيار خانةٍ واحدة كما يُرسَل للخادم */
interface SlotPick { i: number; menuItemId?: number; options: { groupKey: string; valueKey: string }[] }

/** سطر سلّة = صنف + توليفة. توليفتان مختلفتان = سطران. */
interface CartLine {
  key: string; itemId: number; name: string; quantity: number;
  options: { groupKey: string; valueKey: string }[];
  slots: SlotPick[];
  unitPrice: number;   // للعرض فقط — الخادم يعيد التسعير
  label: string;
  isBundle: boolean;
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  new: { label: 'جديد — بانتظار المكان', color: '#3b82f6', icon: '🕐' },
  preparing: { label: 'قيد التحضير', color: '#f59e0b', icon: '👨‍🍳' },
  delivered: { label: 'تمّ التسليم', color: '#22c55e', icon: '✅' },
  cancelled: { label: 'ملغى', color: '#6b7280', icon: '✖️' },
};

const money = (n: number) => n.toFixed(2);
/** وصفٌ أطول من هذا لا يُقرأ في سطر البطاقة المبتور — يستحقّ ورقة تفصيل */
const LONG_DESC = 40;

// ══════════════════════════════════════════════════════
// ⚙️ ورقة خيارات صنفٍ مفرد
// ══════════════════════════════════════════════════════
function OptionSheet({ item, onCancel, onConfirm }: {
  item: Item; onCancel: () => void; onConfirm: (line: CartLine) => void;
}) {
  // الإلزاميّ أوّلاً: «وزن القطعة» قبل ترقية الوجبة — ما يمنع الإرسال يتصدّر
  const groups = useMemo(() => [...(item.optionGroups ?? [])]
    .sort((a, b) => Number(b.isRequired) - Number(a.isRequired)), [item]);
  // ✅ «عادي» يُحدَّد مبدئيّاً: مجموعةٌ إلزاميّةٌ قيمتها الغالبة صفريّة الفرق
  //    (الدرجة على الساندويشات) كانت نقرةً مفروضةً على كلّ طلب. من يريد الحارّ
  //    يبدّل بنقرة، ومن لا يريد شيئاً يمرّ بلا توقّف. النكهات لا تُمسّ —
  //    القاعدة تلتقط القيمة المسمّاة «عادي» حصراً فلا تُرسَل نكهةٌ لم تُقصَد.
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of item.optionGroups ?? []) {
      if (g.isRequired && g.selectionType === 'single') {
        const normal = g.values.find(v => v.name === 'عادي' && v.priceDelta === 0);
        if (normal) init[g.key] = [normal.key];
      }
    }
    return init;
  });

  const pick = (g: OptionGroup, vk: string) => setSel(prev => {
    const cur = prev[g.key] ?? [];
    let next: string[];
    if (g.selectionType === 'single') next = cur[0] === vk && !g.isRequired ? [] : [vk];
    else if (cur.includes(vk)) next = cur.filter(v => v !== vk);
    else next = cur.length >= g.maxSelect ? cur : [...cur, vk];
    return { ...prev, [g.key]: next };
  });

  const missing = groups.filter(g => g.isRequired && (sel[g.key]?.length ?? 0) === 0).map(g => g.name);
  let delta = 0;
  const labels: string[] = [];
  const options: { groupKey: string; valueKey: string }[] = [];
  for (const g of groups) {
    for (const vk of (sel[g.key] ?? [])) {
      const v = g.values.find(x => x.key === vk);
      if (!v) continue;
      delta += v.priceDelta;
      labels.push(`${g.name}: ${v.name}`);
      options.push({ groupKey: g.key, valueKey: vk });
    }
  }
  const unitPrice = parseFloat(item.price) + delta;

  return (
    <Sheet
      title={item.name}
      subtitle={groups.length > 1 ? `${groups.length} اختيارات مطلوبة` : 'اختر ثمّ أضف للسلّة'}
      onClose={onCancel}
      footer={
        <>
          <button
            disabled={missing.length > 0}
            onClick={() => onConfirm({
              key: `${item.id}#${JSON.stringify(options.map(o => `${o.groupKey}|${o.valueKey}`).sort())}`,
              itemId: item.id, name: item.name, quantity: 1, options, slots: [],
              unitPrice, label: labels.join(' · '), isBundle: false,
            })}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}
          >
            {missing.length > 0 ? `اختر: ${missing.join(' · ')}` : `أضف للسلّة • ${money(unitPrice)} د.أ`}
          </button>
          <button onClick={onCancel} className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">إلغاء</button>
        </>
      }
    >
      {/* 📖 الوصف كاملاً — البطاقة تبتره والقرار يحتاجه (مكوّنات البرغر) */}
      {item.description && (
        <p className="text-[11.5px] text-gray-400 leading-relaxed mb-3 pb-3 border-b border-dashed border-white/10">
          {item.description}
        </p>
      )}
      {groups.map((g, gi) => {
        const cur = sel[g.key] ?? [];
        const done = cur.length > 0;
        return (
          <div key={g.key} className="rounded-2xl p-3 mb-2.5" style={{
            background: done ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${done ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.28)'}`,
          }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0"
                style={done ? { background: '#34d399', color: '#000' } : { background: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                {done ? '✓' : gi + 1}
              </span>
              <b className="text-xs flex-1 text-white">{g.name}</b>
              {g.isRequired
                ? <span className="text-[9.5px] text-rose-400">إلزاميّ</span>
                : <span className="text-[9.5px] text-gray-600">اختياريّ</span>}
              {g.selectionType === 'multi' && <span className="text-[9px] text-gray-600">حتى {g.maxSelect}</span>}
            </div>
            <Chips values={g.values} selected={cur} onPick={vk => pick(g, vk)} />
          </div>
        );
      })}
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════
// 🎁 مُهيّئ الباقة — خانةٌ خانة
// ══════════════════════════════════════════════════════
function PackageSheet({ item, onCancel, onConfirm }: {
  item: Item; onCancel: () => void; onConfirm: (line: CartLine) => void;
}) {
  const slots = item.slots ?? [];
  const [chosen, setChosen] = useState<Record<number, number | undefined>>(() => {
    const init: Record<number, number | undefined> = {};
    slots.forEach(s => { if (s.kind === 'fixed') init[s.i] = s.menuItemId; });
    return init;
  });
  const [opts, setOpts] = useState<Record<number, Record<string, string>>>({});

  const groupsOf = (s: Slot): OptionGroup[] => {
    if (s.kind === 'fixed') return s.optionGroups;
    const id = chosen[s.i];
    return s.from.find(f => f.menuItemId === id)?.optionGroups ?? [];
  };
  const nameOf = (s: Slot): string => {
    if (s.kind === 'fixed') return s.name;
    const id = chosen[s.i];
    return s.from.find(f => f.menuItemId === id)?.name ?? '';
  };
  const slotDone = (s: Slot) => {
    if (chosen[s.i] === undefined) return false;
    return groupsOf(s).filter(g => g.isRequired).every(g => opts[s.i]?.[g.key]);
  };

  const doneCount = slots.filter(slotDone).length;
  const ready = doneCount === slots.length;

  // 💰 فرقٌ يمرّ عبر الباقة — يُعرض قبل الإضافة لا يُبتلع صامتاً (قرار المالك:
  //    الحجم والنكهة الفاخرة زيادةٌ معلَنة فوق سعر العرض)
  let extra = 0;
  for (const s of slots) {
    for (const g of groupsOf(s)) {
      const vk = opts[s.i]?.[g.key];
      const v = g.values.find(x => x.key === vk);
      // 💰 × كمّية الخانة — يطابق حساب الخادم (خانة «أرجيلتان» تدفع الفرق مرّتين)
      if (v) extra += v.priceDelta * s.qty;
    }
  }
  const unitPrice = parseFloat(item.price) + extra;

  const build = (): CartLine => {
    const picks: SlotPick[] = slots.map(s => ({
      i: s.i,
      ...(s.kind === 'choice' ? { menuItemId: chosen[s.i] } : {}),
      options: Object.entries(opts[s.i] ?? {}).map(([groupKey, valueKey]) => ({ groupKey, valueKey })),
    }));
    const label = slots.map(s => {
      const picked = Object.entries(opts[s.i] ?? {})
        .map(([gk, vk]) => groupsOf(s).find(g => g.key === gk)?.values.find(v => v.key === vk)?.name)
        .filter(Boolean);
      const locked = s.kind === 'fixed' ? Object.values(s.lockedOptions) : [];
      const all = [...locked, ...picked];
      return `${nameOf(s)}${all.length ? ` (${all.join(' · ')})` : ''}`;
    }).join(' + ');
    return {
      key: `${item.id}#${JSON.stringify(picks)}`,
      itemId: item.id, name: item.name, quantity: 1,
      options: [], slots: picks, unitPrice, label, isBundle: true,
    };
  };

  return (
    <Sheet
      title={`🎁 ${item.name}`}
      subtitle={extra > 0
        ? `${money(parseFloat(item.price))} + ${money(extra)} زيادة اختيارك = ${money(unitPrice)} د.أ • اكتمل ${doneCount} من ${slots.length}`
        : `سعرٌ ثابت ${money(parseFloat(item.price))} د.أ • اكتمل ${doneCount} من ${slots.length}`}
      subtitleWarn={extra > 0}
      onClose={onCancel}
      footer={
        <>
          <button
            disabled={!ready}
            onClick={() => onConfirm(build())}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}
          >
            {ready ? `أضف الباقة • ${money(unitPrice)} د.أ` : `أكمل ${slots.length - doneCount} خانة`}
          </button>
          <button onClick={onCancel} className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">إلغاء</button>
        </>
      }
    >
      {item.description && (
        <p className="text-[11.5px] text-gray-400 leading-relaxed mb-3">{item.description}</p>
      )}
      {slots.map((s, si) => {
        const ok = slotDone(s);
        const groups = groupsOf(s);
        return (
          <div key={s.i} className="rounded-2xl p-3 mb-2.5" style={{
            background: ok ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
          }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0"
                style={ok ? { background: '#34d399', color: '#000' } : { background: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                {ok ? '✓' : si + 1}
              </span>
              <b className="text-xs flex-1 text-white truncate">
                {s.kind === 'choice' ? s.label : `${s.name}${s.qty > 1 ? ` ×${s.qty}` : ''}`}
              </b>
              <span className="text-[9.5px] px-1.5 py-0.5 rounded-md shrink-0"
                style={s.kind === 'choice'
                  ? { background: 'rgba(16,185,129,0.14)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }
                  : { background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                {s.kind === 'choice' ? 'اختيارك' : 'ثابت'}
              </span>
            </div>

            {s.kind === 'choice' && (
              <>
                {s.note && <p className="text-[10px] text-gray-500 mb-1.5">{s.note}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {s.from.map(f => {
                    const on = chosen[s.i] === f.menuItemId;
                    return (
                      <button key={f.menuItemId}
                        onClick={() => {
                          // 🔴 مفاتيح خيارات المرشّح السابق (c0:1…) كانت تبقى فتُفسَّر
                          //    على مجموعات المرشّح الجديد — اختيارٌ لم يُقصَد أو رفضٌ غامض
                          setOpts(p => ({ ...p, [s.i]: {} }));
                          setChosen(p => ({ ...p, [s.i]: on ? undefined : f.menuItemId }));
                        }}
                        className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium"
                        style={on
                          ? { background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.45)', color: '#6ee7b7' }
                          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}>
                        {f.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* الخيار المقفل يُعرض للعلم ولا يُسأل — العرض حدّده وسعره محسوبٌ فيه */}
            {s.kind === 'fixed' && Object.entries(s.lockedOptions).map(([g, v]) => (
              <div key={g} className="mt-2 pt-2 border-t border-dashed border-white/10">
                <p className="text-[10px] font-bold text-amber-300 mb-1">{g}</p>
                <p className="text-[10px] text-gray-400 rounded-lg px-2.5 py-1.5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)' }}>
                  🔒 {v} — محدَّدٌ في العرض
                </p>
              </div>
            ))}

            {groups.map(g => (
              <div key={g.key} className="mt-2 pt-2 border-t border-dashed border-white/10">
                <p className="text-[10px] font-bold text-amber-300 mb-1.5">{g.name}</p>
                <Chips
                  values={g.values}
                  selected={opts[s.i]?.[g.key] ? [opts[s.i][g.key]] : []}
                  onPick={vk => setOpts(p => {
                    const cur = { ...(p[s.i] ?? {}) };
                    if (cur[g.key] === vk) delete cur[g.key]; else cur[g.key] = vk;
                    return { ...p, [s.i]: cur };
                  })}
                />
              </div>
            ))}
          </div>
        );
      })}
      <p className="text-[10px] text-gray-600 text-center mt-2">
        اختياراتك لا تغيّر السعر — إلّا ما عليه زيادةٌ معلَنة
      </p>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════
// 📖 ورقة تفصيل صنفٍ بلا خيارات — الوصف الطويل يُقرأ هنا كاملاً
// ══════════════════════════════════════════════════════
function DetailSheet({ item, onCancel, onAdd }: {
  item: Item; onCancel: () => void; onAdd: () => void;
}) {
  return (
    <Sheet
      title={item.name}
      subtitle={`${money(parseFloat(item.price))} د.أ`}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onAdd}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}>
            أضف للسلّة • {money(parseFloat(item.price))} د.أ
          </button>
          <button onClick={onCancel} className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">إغلاق</button>
        </>
      }
    >
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" className="w-full h-40 object-cover rounded-2xl mb-3" />
      )}
      <p className="text-[13px] text-gray-300 leading-relaxed">{item.description}</p>
    </Sheet>
  );
}

// ── لبنات مشتركة ───────────────────────────────────────
function Chips({ values, selected, onPick }: {
  values: OptionValue[]; selected: string[]; onPick: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map(v => {
        const on = selected.includes(v.key);
        return (
          <button key={v.key} onClick={() => onPick(v.key)}
            className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium"
            style={on
              ? { background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.5)', color: '#fcd34d' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}>
            {v.name}
            {v.priceDelta > 0 && <span className="text-[9px] opacity-80"> +{money(v.priceDelta)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** ورقةٌ سفليّة بترويسةٍ وذيلٍ ثابتَين وجسمٍ متمرّر — لا يغيب الإغلاق ولا الزرّ */
function Sheet({ title, subtitle, subtitleWarn, onClose, children, footer }: {
  title: string; subtitle?: string; subtitleWarn?: boolean; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={onClose} dir="rtl">
      <motion.div
        initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="w-full max-h-[92%] flex flex-col rounded-t-3xl border-t border-white/12"
        style={{ background: '#0b0e0d' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-white/7">
          <div className="w-11 h-1.5 rounded-full bg-white/20 mx-auto mb-3" />
          <div className="flex items-start gap-2.5">
            <div className="flex-1 min-w-0">
              <h3 className="text-white text-[15px] font-bold truncate">{title}</h3>
              {subtitle && (
                <p className="text-[10.5px] mt-0.5" style={{ color: subtitleWarn ? '#fcd34d' : '#6b7280' }}>{subtitle}</p>
              )}
            </div>
            <button onClick={onClose} aria-label="إغلاق"
              className="shrink-0 w-8 h-8 rounded-full text-gray-400 text-xs"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-white/7" style={{ background: '#080b0a' }}>{footer}</div>
      </motion.div>
    </div>
  );
}

/** قسمٌ في القائمة المتّصلة — العروض أوّلاً ثمّ الأقسام بترتيب الخادم */
interface Section { key: string; chip: string; title: string; isPkg: boolean; items: Item[] }

// ══════════════════════════════════════════════════════
export default function OrderPanel({ embedded = false, onClose, onEmptyContext }: {
  embedded?: boolean;
  onClose?: () => void;
  /** يُستدعى إن تبيّن أن لا سياق طلبٍ للاعب — ليُخفي المستضيفُ الزرّ. */
  onEmptyContext?: () => void;
}) {
  const { player } = usePlayer();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<Item | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  const [tab, setTab] = useState<'menu' | 'ord'>('menu');
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeSec, setActiveSec] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  // 💨 خدمة الأرجيلة
  const [svc, setSvc] = useState<{ available: boolean; pending: { id: number; kind: string } | null }>({ available: false, pending: null });
  const [svcBusy, setSvcBusy] = useState(false);

  // 🔁 مفتاح تكرار الإرسال: يثبت عبر إعادة المحاولة (ردٌّ ضائع ⇒ الخادم يعيد
  //    الطلب الأوّل لا ينشئ ثانياً) ويتجدّد مع أيّ تغييرٍ في السلّة
  const submitKeyRef = useRef<string | null>(null);
  // 🧭 مراجع القفز والرصد — القائمة المتّصلة
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const secRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tickRef = useRef(false);
  // 🔴 أثناء القفز البرمجيّ يُكتم الرصدُ وملاحقةُ الشريحة معاً: scrollIntoView
  //    على الشريحة — ولو بلا حركةٍ فعليّة — **يُلغي** التمرير الناعم الجاري في
  //    الحاوية نفسها، فكانت نقرة القسم تتحرّك مليمتراتٍ ثمّ تتجمّد.
  const jumpingRef = useRef(false);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${player?.token || ''}` }), [player?.token]);

  const loadOrders = useCallback((activityId: number) => {
    fetch(`/api/fnb/my-orders?activityId=${activityId}`, { headers })
      .then(r => r.json()).then(d => { if (d.success) setMyOrders(d.orders); }).catch(() => {});
  }, [headers]);

  const loadSvc = useCallback(() => {
    fetch('/api/fnb/service/state', { headers })
      .then(r => r.json())
      .then(d => { if (d.success) setSvc({ available: d.available, pending: d.pending }); })
      .catch(() => {});
  }, [headers]);

  useEffect(() => {
    if (!player) return;
    fetch('/api/fnb/context', { headers })
      .then(r => r.json())
      .then(async (d) => {
        if (!d.success || !d.context) { setReason(d.reason || ''); onEmptyContext?.(); return; }
        setCtx(d.context);
        const menuRes = await fetch(`/api/fnb/menu?activityId=${d.context.activityId}`, { headers }).then(r => r.json());
        if (menuRes.success) setItems(menuRes.items);
        loadOrders(d.context.activityId);
        loadSvc();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    if (!ctx) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      loadOrders(ctx.activityId); loadSvc();
    };
    const iv = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', refresh); };
  }, [ctx, loadOrders, loadSvc]);

  // ── الأقسام: العروض أوّلاً (أعلى قيمة وأسهل قرار) ثمّ ترتيب الخادم ──
  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    const packages = items.filter(i => i.isBundle);
    if (packages.length) out.push({ key: '_pkg', chip: '🎁 العروض', title: '🎁 العروض', isPkg: true, items: packages });
    const idx = new Map<string, Section>();
    for (const it of items) {
      if (it.isBundle) continue;
      const cat = it.category || '', sub = it.subcategory || '';
      const key = `${cat}|${sub}`;
      let s = idx.get(key);
      if (!s) {
        s = { key, chip: sub || cat || 'المنيو', title: sub ? `${cat} ← ${sub}` : (cat || 'المنيو'), isPkg: false, items: [] };
        idx.set(key, s); out.push(s);
      }
      s.items.push(it);
    }
    return out;
  }, [items]);

  // 🎁 الأصناف التي تحويها باقة — لشارة «ضمن عرض»: من يتصفّح البرغر يعرف أنّ
  //    عرضاً يضمّه بسعرٍ أفضل بدل أن يكتشفه بالصدفة
  const inPackageIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of items) {
      if (!p.isBundle) continue;
      for (const s of p.slots ?? []) {
        if (s.kind === 'fixed') ids.add(s.menuItemId);
        else s.from.forEach(f => ids.add(f.menuItemId));
      }
    }
    return ids;
  }, [items]);

  const query = search.trim();
  // البحث يمسح المنيو كلّه — الاسم والوصف والقسم وقيم الخيارات (نكهة «نخلة» تُرجع الأرجيلة)
  const results = useMemo(() => !query ? [] : items.filter(i =>
    i.name.includes(query)
    || (i.description || '').includes(query)
    || (i.subcategory || '').includes(query)
    || (i.category || '').includes(query)
    || (i.optionGroups ?? []).some(g => g.values.some(v => v.name.includes(query)))
  ), [items, query]);

  // ── 🧭 الرصد: أيّ قسمٍ تحت العين الآن؟ (rAF — لا حسابَ في كلّ حدث تمرير) ──
  const onBodyScroll = () => {
    if (tickRef.current || jumpingRef.current || query || tab !== 'menu') return;
    tickRef.current = true;
    requestAnimationFrame(() => {
      tickRef.current = false;
      const c = scrollRef.current;
      if (!c) return;
      const top = c.scrollTop + (stickyRef.current?.offsetHeight ?? 90) + 24;
      let cur = sections[0]?.key ?? '';
      for (const s of sections) {
        const el = secRefs.current[s.key];
        if (el && el.offsetTop <= top) cur = s.key;
      }
      setActiveSec(p => (p === cur ? p : cur));
    });
  };
  const jump = (key: string) => {
    const c = scrollRef.current, el = secRefs.current[key];
    if (!c || !el) return;
    jumpingRef.current = true;
    if (jumpTimer.current) clearTimeout(jumpTimer.current);
    // الشريحة المنقورة أمام العين أصلاً — لا حاجة لملاحقتها، والكتم يحمي التمرير
    jumpTimer.current = setTimeout(() => { jumpingRef.current = false; }, 800);
    setActiveSec(key);
    c.scrollTo({ top: el.offsetTop - (stickyRef.current?.offsetHeight ?? 90) - 4, behavior: 'smooth' });
  };
  // الشريحة المضيئة تلاحق التمرير **اليدويّ** وحده — تبقى مرئيّةً في شريطها الأفقيّ
  useEffect(() => {
    if (jumpingRef.current) return;
    chipRefs.current[activeSec]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeSec]);
  useEffect(() => () => { if (jumpTimer.current) clearTimeout(jumpTimer.current); }, []);

  // ── السلّة ──
  const bumpLine = (line: CartLine) => { submitKeyRef.current = null; setCart(prev => {
    const i = prev.findIndex(l => l.key === line.key);
    if (i === -1) return [...prev, line];
    const next = [...prev];
    next[i] = { ...next[i], quantity: Math.min(next[i].quantity + 1, 20) };
    return next;
  }); };
  const changeQty = (key: string, delta: number) => { submitKeyRef.current = null; setCart(prev => prev.flatMap(l => {
    if (l.key !== key) return [l];
    const q = l.quantity + delta;
    return q <= 0 ? [] : [{ ...l, quantity: Math.min(q, 20) }];
  })); };
  const removeLine = (key: string) => { submitKeyRef.current = null; setCart(prev => prev.filter(l => l.key !== key)); };

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const qtyOfItem = (id: number) => cart.filter(l => l.itemId === id).reduce((s, l) => s + l.quantity, 0);

  const needsPicking = (it: Item) =>
    it.isBundle === true || (it.optionGroups?.length ?? 0) > 0;

  const optionHint = (it: Item) => {
    const gs = it.optionGroups ?? [];
    if (gs.length === 0) return 'خيارات';
    // مجموعةٌ واحدة ⇒ العدد أنفع من الاسم: «٧ نكهات» تُخبر أكثر من «النكهة»
    if (gs.length === 1) return `${gs[0].values.length} ${gs[0].name}`;
    if (gs.length === 2) return gs.map(g => g.name).join(' · ');
    return `${gs[0].name} +${gs.length - 1}`;
  };

  const addItem = (it: Item) => {
    if (needsPicking(it)) { setPicking(it); return; }
    // 📖 وصفٌ طويل بلا خيارات (كرسبي · وجبات الأطفال): يُقرأ قبل أن يُشترى
    if ((it.description || '').length > LONG_DESC) { setViewing(it); return; }
    addSimple(it);
  };
  const addSimple = (it: Item) => bumpLine({
    key: `${it.id}#`, itemId: it.id, name: it.name, quantity: 1,
    options: [], slots: [], unitPrice: parseFloat(it.price), label: '', isBundle: false,
  });

  const submit = async () => {
    if (cartCount === 0 || !ctx) return;
    setSending(true); setErr('');
    if (!submitKeyRef.current) {
      submitKeyRef.current = (globalThis.crypto?.randomUUID?.() ?? `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);
    }
    try {
      const r = await fetch('/api/fnb/orders', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(l => ({
            menuItemId: l.itemId,
            quantity: l.quantity,
            options: l.options.map(o => ({ group: o.groupKey, value: o.valueKey })),
            slots: l.slots.map(s => ({
              i: s.i,
              ...(s.menuItemId ? { menuItemId: s.menuItemId } : {}),
              options: s.options.map(o => ({ group: o.groupKey, value: o.valueKey })),
            })),
          })),
          note: note.trim(),
          clientKey: submitKeyRef.current,
        }),
      });
      const d = await r.json();
      if (d.success) {
        submitKeyRef.current = null;
        setCart([]); setNote(''); setSent(true); setCartOpen(false);
        loadOrders(ctx.activityId);
        setTab('ord');
        setTimeout(() => setSent(false), 2500);
      } else setErr(d.error || 'فشل إرسال الطلب');
    } catch { setErr('خطأ في الاتصال'); }
    setSending(false);
  };

  const cancelOrder = async (id: number) => {
    if (!ctx) return;
    const r = await fetch(`/api/fnb/orders/${id}/cancel`, { method: 'POST', headers }).then(x => x.json()).catch(() => ({ success: false }));
    if (r.success) loadOrders(ctx.activityId); else setErr(r.error || 'تعذّر الإلغاء');
  };

  const askService = async (kind: 'coal' | 'fix') => {
    if (svcBusy || svc.pending) return;
    setSvcBusy(true);
    try {
      const d = await fetch('/api/fnb/service', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      }).then(r => r.json());
      if (d.success) setSvc(s => ({ ...s, pending: d.request }));
      else setErr(d.error || 'تعذّر إرسال الطلب');
    } catch { setErr('خطأ في الاتصال'); }
    setSvcBusy(false);
  };

  // ── حالاتٌ غير جاهزة ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!ctx) {
    return (
      <div className="text-center py-16 px-6" dir="rtl">
        <div className="text-4xl mb-3 opacity-40">🍽️</div>
        <p className="text-gray-400 text-sm">{reason || 'لا يوجد نشاط متاح للطلب الآن'}</p>
        {embedded && <button onClick={onClose} className="mt-4 text-emerald-400 text-xs underline">إغلاق</button>}
      </div>
    );
  }

  // ── بطاقتا الصنف والعرض — تُستعملان في الأقسام وفي نتائج البحث ──
  const ItemCard = (it: Item) => {
    const qty = qtyOfItem(it.id);
    const hasOpts = (it.optionGroups?.length ?? 0) > 0;
    const longDesc = !hasOpts && (it.description || '').length > LONG_DESC;
    return (
      <button key={it.id} onClick={() => addItem(it)}
        className="w-full text-right rounded-2xl p-2.5 flex items-center gap-2.5 active:scale-[0.99] transition-transform"
        style={{
          background: qty > 0 ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
          border: qty > 0 ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.06)',
        }}>
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-800/75 flex items-center justify-center shrink-0 relative">
          {it.imageUrl
            ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
            : <span className="text-lg opacity-70">🍴</span>}
          {qty > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[9.5px] font-black flex items-center justify-center text-black"
              style={{ background: '#34d399' }}>{qty}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold truncate leading-snug">{it.name}</p>
          {it.description && <p className="text-gray-500 text-[10px] truncate mt-0.5">{it.description}</p>}
          <span className="flex items-center gap-1 mt-1">
            {hasOpts && (
              <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#fcd34d' }}>
                ⚙️ {optionHint(it)}
              </span>
            )}
            {inPackageIds.has(it.id) && (
              <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.28)', color: '#c4b5fd' }}>
                🎁 ضمن عرض
              </span>
            )}
          </span>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <p className="text-emerald-400 text-[14px] font-black leading-none tabular-nums">
            {money(parseFloat(it.price))}<span className="text-[8.5px] font-bold opacity-60"> د.أ</span>
          </p>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}>
            {hasOpts ? 'اختر' : longDesc ? 'التفاصيل' : '+ أضف'}
          </span>
        </div>
      </button>
    );
  };

  const PkgCard = (p: Item) => {
    const n = qtyOfItem(p.id);
    return (
      <button key={p.id} onClick={() => setPicking(p)}
        className="w-full text-right rounded-2xl p-3.5 active:scale-[0.99] transition-transform"
        style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.13), rgba(255,255,255,0.02))', border: '1px solid rgba(139,92,246,0.3)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
            style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.35)', color: '#c4b5fd' }}>🎁 عرض</span>
          <h3 className="text-white text-[13.5px] font-bold flex-1 min-w-0 truncate">{p.name}</h3>
          <span className="text-[16px] font-black tabular-nums shrink-0" style={{ color: '#c4b5fd' }}>
            {money(parseFloat(p.price))}<span className="text-[9px] opacity-65"> د.أ</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(p.slots ?? []).map(s => (
            <span key={s.i} className="text-[10px] px-2 py-0.5 rounded-lg"
              style={s.kind === 'choice'
                ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(52,211,153,0.35)', color: '#6ee7b7' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#d1d5db' }}>
              {s.kind === 'choice'
                ? `◇ ${s.from.map(f => f.name).slice(0, 3).join(' / ')}${s.from.length > 3 ? ' …' : ''}`
                : `${s.name}${Object.values(s.lockedOptions)[0] ? ` ${Object.values(s.lockedOptions)[0]}` : ''}`}
            </span>
          ))}
        </div>
        <p className="text-[10px] mt-2" style={{ color: n > 0 ? '#6ee7b7' : '#6b7280' }}>
          {n > 0 ? `✓ في السلّة ×${n} — اضغط لإضافة توليفةٍ أخرى` : 'اضغط لاختيار مكوّناتك'}
        </p>
      </button>
    );
  };

  const ordersBadge = myOrders.filter(o => o.status === 'new' || o.status === 'preparing').length;

  return (
    <div className={embedded ? 'flex flex-col h-full' : 'flex flex-col h-[100dvh] max-w-lg mx-auto'} dir="rtl"
      style={{ background: '#050505' }}>

      {/* ══ ترويسة ثابتة ══ */}
      <div className="shrink-0 px-4 py-3 flex items-center gap-3 border-b border-white/7" style={{ background: '#0a0f0d' }}>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.06))', border: '1px solid rgba(16,185,129,0.3)' }}>🍽️</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-white text-sm font-bold truncate">{ctx.locationName}</h1>
          <p className="text-gray-500 text-[10px] truncate">
            {ctx.source === 'live' ? '🎮 أنت داخل اللعبة' : '🎟️ حجزك مؤكّد للطلب'}
          </p>
        </div>
        {embedded && (
          <button onClick={onClose} aria-label="إغلاق"
            className="shrink-0 w-8 h-8 rounded-full text-gray-400 text-xs"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>✕</button>
        )}
      </div>

      {/* ══ تبويبان — المهمّتان الحقيقيّتان: أطلبُ · أتابعُ ══ */}
      <div className="shrink-0 flex border-b border-white/7" style={{ background: '#0a0f0d' }}>
        {([['menu', '🍽️ المنيو والعروض'], ['ord', '🧾 طلباتي']] as const).map(([k, label]) => {
          const on = tab === k;
          const badge = k === 'ord' ? ordersBadge : 0;
          return (
            <button key={k} onClick={() => setTab(k)}
              className="flex-1 py-2.5 text-[11.5px] font-bold transition-colors"
              style={{ color: on ? '#34d399' : '#6b7280', borderBottom: `2px solid ${on ? '#34d399' : 'transparent'}` }}>
              {label}
              {badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 mr-1 rounded-full text-[9px] font-black"
                  style={{ background: '#34d399', color: '#000' }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ جسمٌ واحدٌ يتمرّر ══ */}
      {/* overscroll-contain: التمرير لا يتسرّب لصفحة اللعبة خلف الورقة */}
      <div ref={scrollRef} onScroll={onBodyScroll} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 relative">
        {tab === 'menu' && (
          <>
            {/* 🧭 الشريط اللاصق: بحث + شرائح قفزٍ تضيء مع التمرير */}
            <div ref={stickyRef} className="sticky top-0 z-30 -mx-4 px-4 pt-3 pb-2"
              style={{ background: 'linear-gradient(to bottom, #050505 84%, rgba(5,5,5,0))' }}>
              <div className="relative">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في المنيو…"
                  className="w-full rounded-xl py-2.5 pr-9 pl-8 text-sm text-white placeholder:text-gray-600 focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">🔎</span>
                {query && (
                  <button onClick={() => setSearch('')} aria-label="مسح"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 text-gray-400 text-[11px] leading-none">✕</button>
                )}
              </div>
              {!query && sections.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pt-2 pb-0.5" style={{ scrollbarWidth: 'none' }}>
                  {sections.map(s => {
                    const on = (activeSec || sections[0]?.key) === s.key;
                    return (
                      <button key={s.key} ref={el => { chipRefs.current[s.key] = el; }}
                        onClick={() => jump(s.key)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors"
                        style={on
                          ? { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }
                          : { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid transparent' }}>
                        {s.chip} <span className="opacity-55">{s.items.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {err && <p className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2 mb-3">{err}</p>}

            {items.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-gray-800">
                <p className="text-gray-500 text-sm">المكان لم يضف أصنافاً بعد</p>
              </div>
            ) : query ? (
              results.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border border-dashed border-gray-800">
                  <p className="text-gray-500 text-sm">لا صنف يطابق «{query}»</p>
                  <button onClick={() => setSearch('')} className="text-emerald-400 text-xs underline mt-2">امسح البحث</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map(it => it.isBundle ? PkgCard(it) : ItemCard(it))}
                </div>
              )
            ) : (
              // القائمة المتّصلة: كلّ الأقسام تحت بعضها — التصفّح تمريرٌ والقفز نقرة
              sections.map(sec => (
                <div key={sec.key} ref={el => { secRefs.current[sec.key] = el; }} className="mb-4">
                  <h3 className="text-[11px] font-bold text-emerald-400/75 mb-2 flex items-center gap-2">
                    <span>{sec.title}</span>
                    <span className="flex-1 h-px bg-emerald-500/12" />
                    <span className="text-gray-600 tabular-nums">{sec.items.length}</span>
                  </h3>
                  <div className="space-y-2">
                    {sec.items.map(it => sec.isPkg ? PkgCard(it) : ItemCard(it))}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── 🧾 طلباتي + 💨 خدمة الأرجيلة ── */}
        {tab === 'ord' && (
          <div className="pt-3.5">
            {err && <p className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2 mb-3">{err}</p>}
            {sent && <p className="text-emerald-300 text-xs bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 mb-3">✅ وصل طلبك للمكان</p>}

            {svc.available && (
              <div className="rounded-2xl p-3.5 mb-3"
                style={{ background: 'linear-gradient(135deg, rgba(224,73,43,0.14), rgba(255,255,255,0.02))', border: '1px solid rgba(224,73,43,0.32)' }}>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-xl">💨</span>
                  <b className="text-white text-[13px] flex-1">أرجيلتك وصلت — تحتاج شيئاً؟</b>
                </div>
                <p className="text-gray-400 text-[10.5px] mb-2.5">طلبٌ بلا سعر، يصل مسؤول الأراجيل مباشرةً ولا يدخل فاتورتك.</p>
                {svc.pending ? (
                  <p className="text-[11px] text-center rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)', color: '#6ee7b7' }}>
                    ✅ وصل طلبك — الموظّف في الطريق
                  </p>
                ) : (
                  <div className="flex gap-2">
                    {([['coal', '🔥 أحتاج فحماً'], ['fix', '🔧 تزبيط الأرجيلة']] as const).map(([k, label]) => (
                      <button key={k} onClick={() => askService(k)} disabled={svcBusy}
                        className="flex-1 py-2.5 rounded-xl text-[12px] font-bold disabled:opacity-45"
                        style={{ background: 'rgba(224,73,43,0.16)', border: '1px solid rgba(224,73,43,0.4)', color: '#f8a08c' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {myOrders.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-12">لا طلبات بعد</p>
            ) : myOrders.map(o => {
              const meta = STATUS_META[o.status] || STATUS_META.new;
              return (
                <div key={o.id} className="rounded-2xl p-3 mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}25` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium" style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
                    <span className="text-white text-xs font-bold tabular-nums">{money(parseFloat(o.total))} د.أ</span>
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    {o.items.map(i => `${i.name} ×${i.quantity}`).join(' • ')}
                  </p>
                  {o.items.filter(i => i.options?.length).map((i, ix) => (
                    <p key={`o${ix}`} className="text-[10px] leading-relaxed text-amber-300/80">
                      ⚙️ {i.name}: {i.options!.map(x => `${x.group}: ${x.value}`).join(' · ')}
                    </p>
                  ))}
                  {o.items.filter(i => i.components?.length).map((i, ix) => (
                    <p key={`c${ix}`} className="text-[10px] leading-relaxed" style={{ color: 'rgba(196,181,253,0.72)' }}>
                      🎁 {i.name}: {i.components!.map(c => `${c.name}${c.options?.length ? ` (${c.options.map(x => x.value).join(' · ')})` : ''}`).join(' + ')}
                    </p>
                  ))}
                  {o.note && <p className="text-gray-600 text-[10px] mt-1">📝 {o.note}</p>}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-gray-600 text-[9px]">
                      {new Date(o.createdAt).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {o.status === 'new' && (
                      <button onClick={() => cancelOrder(o.id)} className="text-[10px] text-rose-400/80 underline">إلغاء الطلب</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ شريط السلّة الثابت — يفتح الدرج من أيّ موضع ══
          🔴 كهرمانيٌّ نابضٌ لا أخضر هادئ: الأخضر يقول «تمّ» والسلّة لم تُرسَل —
          لاعبٌ أضاف وانشغل باللعبة يظنّ طلبه وصل الكافيه وهو لم يغادر جيبه. */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.button
            initial={{ y: 70 }}
            animate={{
              y: 0,
              boxShadow: [
                '0 -2px 14px rgba(245,158,11,0.10)',
                '0 -6px 26px rgba(245,158,11,0.32)',
                '0 -2px 14px rgba(245,158,11,0.10)',
              ],
            }}
            exit={{ y: 70 }}
            transition={{
              y: { type: 'spring', damping: 26, stiffness: 320 },
              boxShadow: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
            }}
            onClick={() => setCartOpen(true)}
            className="shrink-0 w-full px-3 py-2.5 flex items-center gap-2.5 border-t"
            style={{ background: 'rgba(28,19,5,0.97)', borderColor: 'rgba(245,158,11,0.5)' }}
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
              style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.45)', color: '#fcd34d' }}>
              {cartCount}
            </span>
            <div className="flex-1 min-w-0 text-right">
              <b className="flex items-center gap-1.5 text-[12.5px] font-black" style={{ color: '#fcd34d' }}>
                <motion.span
                  animate={{ opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-2 h-2 rounded-full shrink-0" style={{ background: '#f59e0b' }} />
                لم يُرسَل بعد — <span className="tabular-nums">{money(cartTotal)} د.أ</span>
              </b>
              <span className="text-[10px]" style={{ color: 'rgba(252,211,77,0.55)' }}>
                طلبك لم يصل الكافيه · اضغط للمراجعة والإرسال
              </span>
            </div>
            <span className="px-4 py-2.5 rounded-xl text-[12.5px] font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>راجع وأرسل ←</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══ درج السلّة ══ */}
      {cartOpen && cart.length > 0 && (
        <Sheet
          title="🛒 سلّتك"
          subtitle="لم تُرسَل بعد — راجعها ثمّ اضغط زرّ الإرسال بالأسفل"
          subtitleWarn
          onClose={() => setCartOpen(false)}
          footer={
            <>
              <button onClick={submit} disabled={sending}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}>
                {sending ? 'جارٍ الإرسال…' : `إرسال الطلب • ${money(cartTotal)} د.أ`}
              </button>
              <button onClick={() => setCartOpen(false)} className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">متابعة</button>
            </>
          }
        >
          {cart.map(l => (
            <div key={l.key} className="rounded-2xl p-2.5 mb-2 flex items-center gap-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[12.5px] font-semibold truncate">{l.isBundle && '🎁 '}{l.name}</p>
                {l.label && <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(252,211,77,0.85)' }}>{l.label}</p>}
                <p className="text-emerald-400 text-[11px] font-bold tabular-nums mt-0.5">{money(l.unitPrice * l.quantity)} د.أ</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => removeLine(l.key)} aria-label="حذف"
                  className="w-7 h-7 rounded-lg text-[11px]"
                  style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: '#fb7185' }}>🗑️</button>
                <button onClick={() => changeQty(l.key, -1)} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white text-sm">−</button>
                <span className="text-white text-sm font-bold w-4 text-center tabular-nums">{l.quantity}</span>
                <button onClick={() => changeQty(l.key, 1)} className="w-7 h-7 rounded-lg text-sm font-bold"
                  style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }}>+</button>
              </div>
            </div>
          ))}
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300}
            placeholder="ملاحظة للمكان (اختياريّ)"
            className="w-full mt-1 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder:text-gray-600 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }} />
        </Sheet>
      )}

      {/* ══ الأوراق: خيارات / باقة / تفصيل ══ */}
      {picking && (picking.isBundle
        ? <PackageSheet item={picking} onCancel={() => setPicking(null)}
            onConfirm={line => { bumpLine(line); setPicking(null); }} />
        : <OptionSheet item={picking} onCancel={() => setPicking(null)}
            onConfirm={line => { bumpLine(line); setPicking(null); }} />
      )}
      {viewing && (
        <DetailSheet item={viewing} onCancel={() => setViewing(null)}
          onAdd={() => { addSimple(viewing); setViewing(null); }} />
      )}
    </div>
  );
}
