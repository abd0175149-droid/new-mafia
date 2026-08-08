'use client';

// ══════════════════════════════════════════════════════
// 🍽️ لوحة الطلب — مصدرٌ واحد لتجربة الطلب كلّها
// تُستعمل في موضعين بلا تكرار سطر:
//   • صفحةً كاملة  /player/order  (embedded=false)
//   • ورقةً منسدلة داخل شاشة اللعبة (embedded=true) — القرار: الطلب يتمّ
//     **من داخل صفحة اللعبة** بلا مغادرتها، فلا ينقطع اللاعب عن الجولة.
// تسعير العرض إرشاديّ — الخادم يعيد التسعير من قاعدة البيانات عند الإرسال.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';

interface Ctx {
  activityId: number;
  activityName: string;
  locationName: string;
  source: 'live' | 'booking';
}
interface OptionValue { key: string; name: string; priceDelta: number }
interface OptionGroup {
  key: string; name: string; selectionType: 'single' | 'multi';
  isRequired: boolean; maxSelect: number; values: OptionValue[];
}
interface Chosen { group: string; value: string }
interface Component { menuItemId?: number; name: string; qty: number; optionGroups?: OptionGroup[]; options?: Chosen[] }
interface Item {
  id: number; category: string; subcategory?: string; name: string; description: string; price: string; imageUrl: string | null;
  isBundle?: boolean; components?: Component[]; optionGroups?: OptionGroup[];
}
interface MyOrder {
  id: number; status: string; total: string; note: string; createdAt: string;
  items: { name: string; unitPrice: string; quantity: number; components?: Component[]; options?: Chosen[] }[];
}

/** سطر سلّة = صنف + توليفة خيارات. توليفتان مختلفتان = سطران. */
interface CartLine {
  key: string;
  itemId: number;
  quantity: number;
  options: { groupKey: string; valueKey: string }[];
  componentOptions: { menuItemId: number; options: { groupKey: string; valueKey: string }[] }[];
  /** للعرض فقط — الخادم يعيد التسعير */
  unitPrice: number;
  label: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  new: { label: 'جديد — بانتظار المكان', color: '#3b82f6', icon: '🕐' },
  preparing: { label: 'قيد التحضير', color: '#f59e0b', icon: '👨‍🍳' },
  delivered: { label: 'تمّ التسليم', color: '#22c55e', icon: '✅' },
  cancelled: { label: 'ملغى', color: '#6b7280', icon: '✖️' },
};

// ══════════════════════════════════════════════════════
// ⚙️ ورقة اختيار الخيارات — تُسأل قبل دخول الصنف السلّة
// تشمل خيارات الصنف نفسه **وخيارات مكوّنات الباقة** (قرار: يُسأل اللاعب
// عند طلب باقةٍ أحد مكوّناتها يحتاج نكهةً أو حجماً).
// التحقّق هنا للراحة فقط — الخادم يعيد التحقّق والتسعير سيادياً.
// ══════════════════════════════════════════════════════
function OptionSheet({
  item, onCancel, onConfirm,
}: {
  item: Item;
  onCancel: () => void;
  onConfirm: (line: CartLine) => void;
}) {
  // اختياراتٌ لكلّ «مالك»: '' = الصنف نفسه، أو معرّف المكوّن
  const [sel, setSel] = useState<Record<string, Record<string, string[]>>>({});

  const ownerGroups: { owner: string; title: string; groups: OptionGroup[] }[] = [
    { owner: '', title: '', groups: item.optionGroups ?? [] },
    ...(item.components ?? [])
      .filter(c => (c.optionGroups?.length ?? 0) > 0 && c.menuItemId)
      .map(c => ({ owner: String(c.menuItemId), title: c.name, groups: c.optionGroups! })),
  ].filter(o => o.groups.length > 0);

  const pick = (owner: string, g: OptionGroup, valueKey: string) => {
    setSel(prev => {
      const cur = prev[owner]?.[g.key] ?? [];
      let next: string[];
      if (g.selectionType === 'single') {
        next = cur[0] === valueKey && !g.isRequired ? [] : [valueKey];
      } else if (cur.includes(valueKey)) {
        next = cur.filter(v => v !== valueKey);
      } else {
        next = cur.length >= g.maxSelect ? cur : [...cur, valueKey];
      }
      return { ...prev, [owner]: { ...(prev[owner] ?? {}), [g.key]: next } };
    });
  };

  // كلّ مجموعةٍ إلزاميّة يجب أن تحمل اختياراً — وإلّا رُفض الطلب من الخادم
  const missing = ownerGroups.flatMap(o =>
    o.groups.filter(g => g.isRequired && (sel[o.owner]?.[g.key]?.length ?? 0) === 0)
      .map(g => (o.title ? `${g.name} (${o.title})` : g.name)));

  let delta = 0;
  const labels: string[] = [];
  const options: { groupKey: string; valueKey: string }[] = [];
  const compOptsMap = new Map<number, { groupKey: string; valueKey: string }[]>();
  for (const o of ownerGroups) {
    for (const g of o.groups) {
      for (const vk of (sel[o.owner]?.[g.key] ?? [])) {
        const v = g.values.find(x => x.key === vk);
        if (!v) continue;
        delta += v.priceDelta;
        labels.push(o.title ? `${o.title}: ${v.name}` : `${g.name}: ${v.name}`);
        if (o.owner === '') options.push({ groupKey: g.key, valueKey: vk });
        else {
          const id = Number(o.owner);
          compOptsMap.set(id, [...(compOptsMap.get(id) ?? []), { groupKey: g.key, valueKey: vk }]);
        }
      }
    }
  }
  const unitPrice = parseFloat(item.price) + delta;

  const confirm = () => {
    if (missing.length > 0) return;
    const componentOptions = Array.from(compOptsMap.entries()).map(([menuItemId, opts]) => ({ menuItemId, options: opts }));
    // المفتاح يجعل التوليفات المختلفة سطوراً مستقلّة في السلّة
    const key = `${item.id}#${JSON.stringify([
      options.map(o => `${o.groupKey}|${o.valueKey}`).sort(),
      componentOptions.map(c => `${c.menuItemId}:${c.options.map(o => `${o.groupKey}|${o.valueKey}`).sort().join(',')}`).sort(),
    ])}`;
    onConfirm({ key, itemId: item.id, quantity: 1, options, componentOptions, unitPrice, label: labels.join(' · ') });
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onCancel} dir="rtl">
      <div
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl p-5 border-t sm:border border-amber-500/25"
        style={{ background: 'linear-gradient(to bottom, #131008, #050505)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-4" />
        <h3 className="text-white text-base font-bold mb-1">{item.name}</h3>
        <p className="text-gray-500 text-[11px] mb-4">اختر ما يناسبك ثمّ أضفه للسلّة</p>

        {ownerGroups.map(o => (
          <div key={o.owner || '_self'} className="mb-4">
            {o.title && (
              <p className="text-[10px] font-bold mb-2" style={{ color: 'rgba(196,181,253,0.8)' }}>🎁 خيارات {o.title}</p>
            )}
            {o.groups.map(g => {
              const cur = sel[o.owner]?.[g.key] ?? [];
              return (
                <div key={g.key} className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-amber-300">{g.name}</span>
                    {g.isRequired
                      ? <span className="text-[9px] text-rose-400">إلزاميّ</span>
                      : <span className="text-[9px] text-gray-600">اختياريّ</span>}
                    {g.selectionType === 'multi' && <span className="text-[9px] text-gray-600">حتى {g.maxSelect}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.values.map(v => {
                      const on = cur.includes(v.key);
                      return (
                        <button key={v.key} onClick={() => pick(o.owner, g, v.key)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{
                            background: on ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${on ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            color: on ? '#fcd34d' : '#d1d5db',
                          }}>
                          {v.name}
                          {v.priceDelta > 0 && <span className="text-[9px] opacity-80"> +{v.priceDelta.toFixed(2)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {missing.length > 0 && (
          <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2 mb-3">
            يلزم اختيار: {missing.join(' · ')}
          </p>
        )}

        <div className="flex gap-2 sticky bottom-0 pt-2" style={{ background: 'linear-gradient(to top, #050505 60%, transparent)' }}>
          <button onClick={confirm} disabled={missing.length > 0}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}>
            أضف للسلّة • {unitPrice.toFixed(2)} د.أ
          </button>
          <button onClick={onCancel} className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

export default function OrderPanel({
  embedded = false,
  onClose,
  onEmptyContext,
}: {
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
  // ⚙️ الصنف قيد اختيار خياراته (نكهة/حجم/إضافات) قبل دخوله السلّة
  const [picking, setPicking] = useState<Item | null>(null);
  // 🧭 حالة التصفّح — نوع المنيو والقسم والبحث
  const [rootTab, setRootTab] = useState('');
  const [subTab, setSubTab] = useState('');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${player?.token || ''}` }), [player?.token]);

  const loadOrders = useCallback((activityId: number) => {
    fetch(`/api/fnb/my-orders?activityId=${activityId}`, { headers })
      .then(r => r.json())
      .then(d => { if (d.success) setMyOrders(d.orders); })
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
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // تحديث حالة الطلبات عند العودة للتبويب + كل 30 ثانية (بلا سوكيت — قرار مقفل)
  useEffect(() => {
    if (!ctx) return;
    const refresh = () => { if (document.visibilityState === 'visible') loadOrders(ctx.activityId); };
    const iv = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', refresh); };
  }, [ctx, loadOrders]);

  /// هل يحتاج الصنف سؤالاً قبل الإضافة؟ (خياراته أو خيارات مكوّنات باقته)
  const needsPicking = (it: Item) =>
    (it.optionGroups?.length ?? 0) > 0 ||
    (it.components ?? []).some(c => (c.optionGroups?.length ?? 0) > 0);

  /// ملخّصٌ لما سيُسأل عنه — «⚙️ خيارات» وحدها لا تُنبئ إن كان السؤال حجماً أم نكهة
  const optionHint = (it: Item) => {
    const names = [
      ...(it.optionGroups ?? []).map(g => g.name),
      ...(it.components ?? []).flatMap(c => (c.optionGroups ?? []).map(g => g.name)),
    ];
    if (names.length === 0) return 'خيارات';
    if (names.length <= 2) return names.join(' · ');
    return `${names[0]} +${names.length - 1}`;
  };

  /// إضافة مباشرة لصنفٍ بلا خيارات، أو فتح ورقة الاختيار
  const addItem = (it: Item) => {
    if (needsPicking(it)) { setPicking(it); return; }
    bumpLine(`${it.id}#`, () => ({
      key: `${it.id}#`, itemId: it.id, quantity: 1, options: [], componentOptions: [],
      unitPrice: parseFloat(it.price), label: '',
    }));
  };

  /// يزيد كمّية سطرٍ قائم أو ينشئه
  const bumpLine = (key: string, make: () => CartLine) => {
    setCart(prev => {
      const i = prev.findIndex(l => l.key === key);
      if (i === -1) return [...prev, make()];
      const next = [...prev];
      next[i] = { ...next[i], quantity: Math.min(next[i].quantity + 1, 20) };
      return next;
    });
  };

  const changeQty = (key: string, delta: number) => {
    setCart(prev => prev.flatMap(l => {
      if (l.key !== key) return [l];
      const q = l.quantity + delta;
      if (q <= 0) return [];
      return [{ ...l, quantity: Math.min(q, 20) }];
    }));
  };

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  /// كمّية الصنف في السلّة بكل توليفاته — لعرض العدّاد على صفّ المنيو
  const qtyOfItem = (id: number) => cart.filter(l => l.itemId === id).reduce((s, l) => s + l.quantity, 0);

  const submit = async () => {
    if (cartCount === 0 || !ctx) return;
    setSending(true); setErr('');
    try {
      const r = await fetch('/api/fnb/orders', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(l => ({
            menuItemId: l.itemId,
            quantity: l.quantity,
            options: l.options.map(o => ({ group: o.groupKey, value: o.valueKey })),
            componentOptions: l.componentOptions.map(c => ({
              menuItemId: c.menuItemId,
              options: c.options.map(o => ({ group: o.groupKey, value: o.valueKey })),
            })),
          })),
          note: note.trim(),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setCart([]); setNote(''); setSent(true);
        loadOrders(ctx.activityId);
        setTimeout(() => setSent(false), 2500);
      } else setErr(d.error || 'فشل إرسال الطلب');
    } catch { setErr('خطأ في الاتصال'); }
    setSending(false);
  };

  const cancelOrder = async (id: number) => {
    if (!ctx) return;
    const r = await fetch(`/api/fnb/orders/${id}/cancel`, { method: 'POST', headers }).then(x => x.json()).catch(() => ({ success: false }));
    if (r.success) loadOrders(ctx.activityId);
    else setErr(r.error || 'تعذّر الإلغاء');
  };

  // ── الحالات غير الجاهزة ──
  if (loading) {
    return (
      <div className={`flex items-center justify-center ${embedded ? 'py-16' : 'min-h-[60vh]'}`}>
        <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className={`text-center ${embedded ? 'py-12 px-4' : 'max-w-lg mx-auto px-4 pt-16'}`} dir="rtl">
        <div className="text-5xl mb-4">🍽️</div>
        <h1 className="text-white text-lg font-bold mb-2">لا يوجد نشاط متاح للطلب الآن</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          {reason || 'الطلب من المكان يفتح للحاجزين قبل ساعةٍ من موعد الفعاليّة وأثناءها.'}
        </p>
        {embedded
          ? <button onClick={onClose} className="text-emerald-400 text-sm underline">إغلاق</button>
          : <a href="/player/home" className="text-emerald-400 text-sm underline">← الرئيسيّة</a>}
      </div>
    );
  }

  const categories = Array.from(new Set(items.map(i => i.category || '')));
  const activeOrders = myOrders.filter(o => o.status !== 'cancelled');

  // 🧭 التصفّح: منيو من ٦٢ صنفاً في خمسة عشر قسماً لا يُتصفَّح بالتمرير وحده.
  // الشريط اللاصق يقسّم الرحلة: نوع المنيو (مشروبات/مأكولات) ثمّ القسم، والبحث
  // يتجاوزهما معاً حين يعرف اللاعب ما يريد. القسم المختار يُعرض وحده — إظهار
  // الأربعين صنفاً دفعةً واحدة هو نفسه المشكلة التي جاء الشريط ليحلّها.
  const roots = categories.filter(Boolean);
  const activeRoot = roots.includes(rootTab) ? rootTab : (roots[0] || '');
  const inRoot = items.filter(i => (i.category || '') === activeRoot);
  const subs = Array.from(new Set(inRoot.map(i => i.subcategory || ''))).filter(Boolean);

  const query = search.trim();
  const searching = query.length > 0;
  const shown = searching
    // البحث يمسح المنيو كلّه لا القسم المعروض — من يكتب «برغر» وهو في المشروبات يريد البرغر
    ? items.filter(i => i.name.includes(query) || (i.description || '').includes(query))
    : subTab && subs.includes(subTab)
      ? inRoot.filter(i => (i.subcategory || '') === subTab)
      : inRoot;

  // تجميع المعروض تحت عناوين أقسامه الفرعيّة
  const shownSubs = Array.from(new Set(shown.map(i => i.subcategory || '')));

  return (
    <div
      className={embedded ? 'space-y-5 px-4 pt-2 pb-40' : 'max-w-lg mx-auto px-4 pt-6 space-y-5 pb-32'}
      dir="rtl"
    >
      {/* ── الترويسة ── */}
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,5,5,0.9))', border: '1px solid rgba(16,185,129,0.25)' }}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">🍽️</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-base font-bold">اطلب من {ctx.locationName}</h1>
            <p className="text-gray-500 text-[11px] mt-0.5">
              {ctx.activityName} • {ctx.source === 'live' ? '🎮 أنت داخل اللعبة' : '🎟️ حجزك مؤكّد للطلب'}
            </p>
          </div>
          {embedded && (
            <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-400 text-sm" title="إغلاق">✕</button>
          )}
        </div>
      </div>

      {/* ── طلباتي ── */}
      {myOrders.length > 0 && (
        <div>
          <h2 className="text-white text-sm font-semibold mb-2">📋 طلباتي ({activeOrders.length})</h2>
          <div className="space-y-2">
            {myOrders.map(o => {
              const meta = STATUS_META[o.status] || STATUS_META.new;
              return (
                <div key={o.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}25` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-medium" style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
                    <span className="text-white text-xs font-bold">{parseFloat(o.total).toFixed(2)} د.أ</span>
                  </div>
                  <p className="text-gray-400 text-[11px] leading-relaxed">
                    {o.items.map(i => `${i.name} ×${i.quantity}`).join(' • ')}
                  </p>
                  {/* ⚙️ ما اختاره فعلاً — ليتأكّد أنّ طلبه وصل كما أراد */}
                  {o.items.filter(i => i.options && i.options.length > 0).map((i, ix) => (
                    <p key={`o${ix}`} className="text-[10px] leading-relaxed text-amber-300/80">
                      ⚙️ {i.name}: {i.options!.map(x => `${x.group}: ${x.value}`).join(' · ')}
                    </p>
                  ))}
                  {o.items.filter(i => i.components && i.components.length > 0).map((i, ix) => (
                    <p key={ix} className="text-[10px] leading-relaxed" style={{ color: 'rgba(196,181,253,0.7)' }}>
                      🎁 {i.name}: {i.components!.map(c => `${c.name} ×${c.qty * i.quantity}`).join(' + ')}
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
        </div>
      )}

      {err && <p className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{err}</p>}

      {/* ── 🧭 شريط التصفّح اللاصق ── */}
      {items.length > 0 && (
        <div className="sticky top-0 z-30 -mx-4 px-4 pt-1 pb-2 space-y-2"
          style={{ background: 'linear-gradient(to bottom, #050505 78%, rgba(5,5,5,0))' }}>
          <div className="relative">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث في المنيو…"
              className="w-full rounded-xl py-2.5 pr-9 pl-8 text-sm text-white placeholder:text-gray-600 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">🔎</span>
            {searching && (
              <button onClick={() => setSearch('')} aria-label="مسح البحث"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 text-gray-400 text-[11px] leading-none">✕</button>
            )}
          </div>

          {!searching && roots.length > 1 && (
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {roots.map(r => (
                <button key={r} onClick={() => { setRootTab(r); setSubTab(''); }}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
                  style={r === activeRoot
                    ? { background: 'rgba(16,185,129,0.18)', color: '#34d399', border: '1px solid rgba(16,185,129,0.35)' }
                    : { color: '#6b7280', border: '1px solid transparent' }}>
                  {r}
                </button>
              ))}
            </div>
          )}

          {!searching && subs.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => setSubTab('')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors"
                style={!subTab
                  ? { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#6b7280', border: '1px solid transparent' }}>
                الكل ({inRoot.length})
              </button>
              {subs.map(s => {
                const n = inRoot.filter(i => (i.subcategory || '') === s).length;
                return (
                  <button key={s} onClick={() => setSubTab(subTab === s ? '' : s)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors"
                    style={subTab === s
                      ? { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid transparent' }}>
                    {s} <span className="opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── المنيو ── */}
      {items.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-gray-800">
          <p className="text-gray-500 text-sm">المكان لم يضف أصنافاً بعد</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed border-gray-800">
          <p className="text-gray-500 text-sm">لا صنف يطابق «{query}»</p>
          <button onClick={() => setSearch('')} className="text-emerald-400 text-xs underline mt-2">امسح البحث</button>
        </div>
      ) : (
        [''].map(() => {
          const cat = searching ? '' : activeRoot;
          const inCat = shown;
          const subsHere = shownSubs;
          return (
            <div key={cat || '_none'}>
              {!searching && !subTab && (
                <h3 className="text-xs font-bold text-emerald-400/80 mb-2 flex items-center gap-2">
                  <span>{cat || 'المنيو'}</span>
                  <span className="flex-1 h-px bg-emerald-500/10" />
                </h3>
              )}
              {subsHere.map(sub => (
                <div key={sub || '_direct'} className="mb-3">
                  {sub && !subTab && (
                    <p className="text-[10px] font-bold text-gray-500 mb-1.5 pr-1">↳ {sub}</p>
                  )}
                  <div className="space-y-2">
                    {inCat.filter(i => (i.subcategory || '') === sub).map(it => {
                      const qty = qtyOfItem(it.id);
                      const hasOpts = needsPicking(it);
                      return (
                        // البطاقة كلّها هدف لمس: إصبعٌ في غرفةٍ معتمة لا تُصيب زرّاً بعرض
                        // ٧٠ بكسل. الزرّ يبقى مرئيّاً كإشارةٍ لا كهدفٍ وحيد.
                        <button
                          key={it.id} onClick={() => addItem(it)}
                          className="w-full text-right rounded-2xl p-3 flex items-center gap-3 transition-colors active:scale-[0.99]"
                          style={{
                            background: qty > 0 ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
                            border: qty > 0 ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-800/80 flex items-center justify-center shrink-0 relative">
                            {it.imageUrl
                              ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                              : <span className="text-xl opacity-70">{it.isBundle ? '🎁' : '🍴'}</span>}
                            {qty > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full text-[10px] font-black flex items-center justify-center text-black"
                                style={{ background: '#34d399' }}>{qty}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate leading-snug">
                              {it.isBundle && <span className="text-[9px] px-1.5 py-0.5 rounded-md ml-1.5 align-middle" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}>🎁 عرض</span>}
                              {it.name}
                            </p>
                            {it.isBundle && it.components && it.components.length > 0 ? (
                              <p className="text-[10.5px] truncate mt-0.5" style={{ color: 'rgba(196,181,253,0.75)' }}>
                                {it.components.map(c => `${c.name}${c.qty > 1 ? ` ×${c.qty}` : ''}`).join(' + ')}
                              </p>
                            ) : it.description ? (
                              <p className="text-gray-500 text-[10.5px] truncate mt-0.5">{it.description}</p>
                            ) : null}
                            {hasOpts && (
                              <span className="inline-block text-[9.5px] mt-1 px-1.5 py-0.5 rounded-md"
                                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#fcd34d' }}>
                                ⚙️ {optionHint(it)}
                              </span>
                            )}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            {/* السعر أبرز عنصرٍ في البطاقة: هو ما يُقارَن بين الأصناف */}
                            <p className="text-emerald-400 text-[15px] font-black leading-none tabular-nums">
                              {parseFloat(it.price).toFixed(2)}
                              <span className="text-[9px] font-bold text-emerald-400/60"> د.أ</span>
                            </p>
                            <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold"
                              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}>
                              {hasOpts ? 'اختر' : '+ أضف'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}

      {/* ── 🛒 سطور السلّة — كلّ توليفةٍ سطرٌ مستقلّ بكمّيته ── */}
      {cart.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-emerald-400/80 mb-2">🛒 سلّتك</h3>
          <div className="space-y-2">
            {cart.map(l => {
              const it = items.find(i => i.id === l.itemId);
              return (
                <div key={l.key} className="rounded-xl p-2.5 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs truncate">{it?.name || 'صنف'}</p>
                    {l.label && <p className="text-[10px] text-amber-300/90 truncate">{l.label}</p>}
                    <p className="text-emerald-400 text-[10px] font-bold">{(l.unitPrice * l.quantity).toFixed(2)} د.أ</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => changeQty(l.key, -1)} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white text-sm">−</button>
                    <span className="text-white text-sm font-bold w-5 text-center">{l.quantity}</span>
                    <button onClick={() => changeQty(l.key, 1)} className="w-7 h-7 rounded-lg text-sm font-bold" style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ⚙️ ورقة اختيار الخيارات ── */}
      {picking && (
        <OptionSheet
          item={picking}
          onCancel={() => setPicking(null)}
          onConfirm={(line) => { bumpLine(line.key, () => line); setPicking(null); }}
        />
      )}

      {/* ── شريط السلّة ── */}
      {/* داخل الورقة يلتصق بأسفلها لا بأسفل النافذة، وإلّا غطّى محتوى اللعبة خلفها */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 120 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={embedded ? 'sticky bottom-2 z-40' : 'fixed bottom-20 inset-x-0 z-40 px-4'}
          >
            <div className="max-w-lg mx-auto rounded-2xl p-3.5 backdrop-blur-xl" style={{ background: 'rgba(6,20,14,0.95)', border: '1px solid rgba(16,185,129,0.4)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} dir="rtl">
              <input
                value={note} onChange={e => setNote(e.target.value)} maxLength={300}
                placeholder="ملاحظة للمكان (اختياريّ)…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 mb-2.5 focus:outline-none focus:border-emerald-500/40"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={submit} disabled={sending}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #10b981, #0d9488)' }}
                >
                  {sending ? '⏳ يُرسل…' : `إرسال الطلب • ${cartTotal.toFixed(2)} د.أ`}
                </button>
                <div className="text-center shrink-0">
                  <div className="text-white text-sm font-bold">{cartCount}</div>
                  <div className="text-gray-500 text-[9px]">أصناف</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── تأكيد الإرسال ── */}
      <AnimatePresence>
        {sent && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl px-6 py-5 text-center" style={{ background: 'rgba(6,20,14,0.97)', border: '1px solid rgba(16,185,129,0.5)' }}>
              <div className="text-4xl mb-2">✅</div>
              <p className="text-white text-sm font-bold">وصل طلبك للمكان!</p>
              <p className="text-gray-500 text-[11px] mt-1">تابع حالته في «طلباتي» أعلى اللوحة</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
