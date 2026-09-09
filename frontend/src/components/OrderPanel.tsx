'use client';

// ══════════════════════════════════════════════════════
// 🍽️ لوحة المنيو — تصميم «الرفّ» (قرار 2026-09-09)
//
// 🧭 البنية: رفٌّ عموديٌّ ثابت على اليمين يحمل الأقسام كلّها (العروض أوّلاً)،
//    وبلاطاتٌ بعمودين على اليسار للقسم المختار. أوّل صنفٍ على بعد ترويسةٍ
//    واحدة (~٥٦ بكسل) — لا تبويبات ولا شرائح لاصقة ولا بحثٍ دائم.
// ⚙️ الصنف ذو الخيارات يتّسع في مكانه (يمتدّ على العمودين) ويُظهر نكهاته
//    أزراراً بارتفاعٍ ≥ ٤٠ بكسل، ثمّ يُضاف بنقرة. لا ورقة فوق القائمة للأرجيلة.
// 🎁 العرض يُركَّب بمُركِّبٍ متدرّج: خطوةٌ لكلّ قرار (نكهة ← مشروب ← نكهة
//    المشروب ← مراجعة) بدل ورقةٍ واحدةٍ طويلةٍ تحوي ٢٥ مرشّحاً وثماني نكهات.
// 🧾 «طلباتي» ورقةٌ من أيقونة الترويسة (بشارة العدد)، وفيها خدمة الأرجيلة.
// 📖 وضعان: mode='order' (الرئيسيّة/اللعبة — يحتاج سياقاً من الخادم) و
//    mode='browse' (استعراضٌ للقراءة قبل الحجز — النقطة العامّة بلا مصادقة).
//    العارض واحدٌ للسطوح الثلاثة؛ لا يتفرّع عارضٌ ثانٍ في صفحة الألعاب.
// 🕒 بلا سياقٍ لكن بحجزٍ قادم: الخادم يعيد next (المكان وموعد الفتح) فتُعرض
//    الرسالة الصحيحة ويُتاح تصفّح المنيو للقراءة — لا شاشة فارغة.
//
// 🔴 دروسٌ محفوظة من النسخة السابقة (لا تُكسر):
//    - حقول الإدخال بحجم ١٦ بكسل: أصغر من ذلك يُقرّب سفاري الشاشة عند
//      التركيز فينزاح التخطيط الثابت وتختفي الأزرار السفليّة.
//    - ارتفاع الصفحة الكاملة من صنف CSS (fnb-page-h) يحمل سطر 100vh
//      احتياطيّاً قبل 100dvh — المتصفّحات القديمة كانت تُسقط الشريط تحت التنقّل.
//    - الأوراق `fixed` لا `absolute`، وتنسيق الذيل يرتفع مع لوحة المفاتيح
//      (visualViewport) كي لا يختفي زرّ الإرسال خلفها.
//    - مفتاح السلّة = صنف + توليفة الخيارات؛ توليفتان = سطران.
//    - مفتاح تكرار الإرسال يثبت عبر إعادة المحاولة ويتجدّد مع تغيّر السلّة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import { freshFixForGate } from './LocationGate';
import { IcoFire, IcoPlate, IcoReceipt, IcoSearch, IcoTool, IcoX, sectionIcon } from './fnb/icons';

// ── الأنواع (كما يبنيها الخادم) ─────────────────────────
interface OptionValue { key: string; name: string; priceDelta: number }
interface OptionGroup {
  key: string; name: string; selectionType: 'single' | 'multi';
  isRequired: boolean; maxSelect: number; values: OptionValue[];
}
interface Chosen { group: string; value: string }
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
  activityId: number; activityName: string; locationId: number; locationName: string; source: 'live' | 'booking';
}
/** حجزٌ قادم لم تُفتح نافذته بعد — يعيده الخادم مع reason */
interface NextCtx { activityId: number; activityName: string; locationId: number; locationName: string; opensAt: string }
interface SlotPick { i: number; menuItemId?: number; options: { groupKey: string; valueKey: string }[] }
interface CartLine {
  key: string; itemId: number; name: string; quantity: number;
  options: { groupKey: string; valueKey: string }[];
  slots: SlotPick[];
  unitPrice: number;   // للعرض فقط — الخادم يعيد التسعير
  label: string;
  isBundle: boolean;
}
interface Section { key: string; short: string; title: string; isPkg: boolean; items: Item[] }

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: 'بانتظار المكان', color: '#8CC1F2' },
  preparing: { label: 'قيد التحضير', color: '#fbbf24' },
  delivered: { label: 'تمّ التسليم', color: '#4ade80' },
  cancelled: { label: 'ملغى', color: '#6b7280' },
};
const money = (n: number) => n.toFixed(2);
const LONG_DESC = 40;
const AR_DIGITS = (s: string | number) => String(s).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);

// ألوان اللوحة — كهرمانيّ التطبيق للفعل، ذهبيّه للعروض، ودلاليّ للحالات
const AMBER = { bg: 'rgba(251,191,36,0.14)', bd: 'rgba(251,191,36,0.45)', fg: '#fcd34d' };
const GOLD = { bg: 'rgba(197,160,89,0.12)', bd: 'rgba(197,160,89,0.45)', fg: '#e7cf8d' };
const goldBtn = { background: 'linear-gradient(135deg, #d9b563, #a7833a)', color: '#150f04' };

// ══════════════════════════════════════════════════════
// أدوات صغيرة
// ══════════════════════════════════════════════════════
const hasOpts = (it: Item) => (it.optionGroups?.length ?? 0) > 0;
/** «٨ نكهات» أنفع من «نكهة الأرجيلة» عندما تكون المجموعة واحدة */
function optionHint(it: Item) {
  const gs = it.optionGroups ?? [];
  if (gs.length === 0) return '';
  if (gs.length === 1) {
    const n = gs[0].name.replace(/^نوع\s+/, '').replace(/^نكهة\s+/, 'نكهات ');
    return `${AR_DIGITS(gs[0].values.length)} ${n}`;
  }
  return gs.map(g => g.name).join(' · ');
}
const shortOf = (cat: string, sub: string) => (sub || cat || 'المنيو');

/** ذيلٌ يرتفع مع لوحة المفاتيح — iOS لا يُصغّر dvh عند فتحها، فنقيس visualViewport */
function useKeyboardInset() {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const f = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    f();
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f);
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);
  return kb;
}

// ══════════════════════════════════════════════════════
// ورقةٌ سفليّة: ترويسةٌ وذيلٌ ثابتان وجسمٌ متمرّر
// ══════════════════════════════════════════════════════
function Sheet({ title, subtitle, subtitleWarn, onClose, children, footer, progress }: {
  title: string; subtitle?: string; subtitleWarn?: boolean; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; progress?: { at: number; of: number };
}) {
  const kb = useKeyboardInset();
  return (
    // 🔴 `fixed` لا `absolute` — انظر ترويسة الملفّ
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.78)', paddingBottom: kb }}
      onClick={onClose} dir="rtl">
      <motion.div
        initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="w-full max-w-lg max-h-[92%] flex flex-col rounded-t-3xl border-t border-white/12"
        style={{ background: '#0b0b0b' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-white/7">
          <div className="w-11 h-1.5 rounded-full bg-white/20 mx-auto mb-3" />
          <div className="flex items-start gap-2.5">
            <div className="flex-1 min-w-0">
              <h3 className="text-white text-[15px] font-bold truncate">{title}</h3>
              {subtitle && (
                <p className="text-[10.5px] mt-0.5" style={{ color: subtitleWarn ? '#fcd34d' : '#8d8d8d' }}>{subtitle}</p>
              )}
            </div>
            <button onClick={onClose} aria-label="إغلاق"
              className="shrink-0 w-8 h-8 rounded-full text-gray-400 flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}><IcoX size={13} /></button>
          </div>
          {progress && (
            <div className="flex gap-1 mt-2.5">
              {Array.from({ length: progress.of }).map((_, k) => (
                <i key={k} className="flex-1 h-[3px] rounded-full"
                  style={{ background: k < progress.at ? '#d9b563' : k === progress.at ? '#f3dea3' : 'rgba(255,255,255,0.12)' }} />
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-none px-4 py-3.5">{children}</div>
        {footer && (
          <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-white/7"
            style={{ background: '#080808', paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>{footer}</div>
        )}
      </motion.div>
    </div>
  );
}

/** بلاطات اختيارٍ كبيرة — هدف لمسٍ ≥ ٤٤ بكسل */
function Tiles({ values, selected, onPick, cols = 2 }: {
  values: { key: string; name: string; sub?: string; priceDelta?: number }[]; selected: string[]; onPick: (k: string) => void; cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {values.map(v => {
        const on = selected.includes(v.key);
        return (
          <button key={v.key} onClick={() => onPick(v.key)}
            className="rounded-xl px-2.5 py-3 min-h-[50px] text-[13.5px] font-bold text-center leading-tight"
            style={on
              ? { background: GOLD.bg, border: `1px solid ${GOLD.bd}`, color: GOLD.fg }
              : { background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)', color: '#e5e5e5' }}>
            {v.name}
            {(v.sub || (v.priceDelta ?? 0) > 0) && (
              <span className="block text-[10px] font-medium mt-0.5" style={{ color: on ? '#d7bf86' : '#9a9a9a' }}>
                {v.sub}{v.sub && (v.priceDelta ?? 0) > 0 ? ' · ' : ''}{(v.priceDelta ?? 0) > 0 ? `+${money(v.priceDelta!)}` : ''}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🎁 مُركِّب العرض — خطوةٌ لكلّ قرار
// ══════════════════════════════════════════════════════
type Picks = Record<number, { menuItemId?: number; options: Record<string, string> }>;
type Step = { t: 'choice'; s: Extract<Slot, { kind: 'choice' }> } | { t: 'opt'; s: Slot; g: OptionGroup } | { t: 'done' };

function groupsOf(s: Slot, picks: Picks): OptionGroup[] {
  if (s.kind === 'fixed') return s.optionGroups;
  const id = picks[s.i]?.menuItemId;
  return s.from.find(f => f.menuItemId === id)?.optionGroups ?? [];
}
function nameOf(s: Slot, picks: Picks): string {
  if (s.kind === 'fixed') return s.name;
  return s.from.find(f => f.menuItemId === picks[s.i]?.menuItemId)?.name ?? '';
}
function stepsOf(item: Item, picks: Picks): Step[] {
  const out: Step[] = [];
  for (const s of item.slots ?? []) {
    if (s.kind === 'choice') out.push({ t: 'choice', s });
    for (const g of groupsOf(s, picks)) out.push({ t: 'opt', s, g });
  }
  out.push({ t: 'done' });
  return out;
}
// 🔴 المجموعة الاختياريّة (بابلز +١ · نكهة اللاتيه…) لا تحجز الخطوة: كانت
//    تُعامَل إلزاميّةً فيُجبَر اللاعب على «بابلز سموك +١» ليكمل العرض.
//    القيمة '' = «بدون» اختياراً صريحاً؛ undefined = لم يمرّ بعد.
const stepDone = (st: Step, picks: Picks) =>
  st.t === 'choice' ? !!picks[st.s.i]?.menuItemId
  : st.t === 'opt' ? (!st.g.isRequired || !!picks[st.s.i]?.options?.[st.g.key])
  : true;
const NONE = '__none';

function BundleWizard({ item, onCancel, onConfirm }: { item: Item; onCancel: () => void; onConfirm: (line: CartLine) => void }) {
  const slots = item.slots ?? [];
  const [picks, setPicks] = useState<Picks>(() => {
    const init: Picks = {};
    slots.forEach(s => { if (s.kind === 'fixed') init[s.i] = { menuItemId: s.menuItemId, options: {} }; });
    return init;
  });
  const [step, setStep] = useState(0);
  const steps = stepsOf(item, picks);
  const i = Math.min(step, steps.length - 1);
  const st = steps[i];

  // 💰 فرقٌ معلَنٌ يمرّ عبر الباقة × كمّية الخانة — يطابق حساب الخادم
  let extra = 0;
  for (const s of slots) for (const g of groupsOf(s, picks)) {
    const v = g.values.find(x => x.key === picks[s.i]?.options?.[g.key]);
    if (v) extra += v.priceDelta * s.qty;
  }
  const unitPrice = parseFloat(item.price) + extra;

  const setChoice = (s: Slot, id: number) => {
    // 🔴 خيارات المرشّح السابق تُمحى — وإلّا فُسِّرت على مجموعات المرشّح الجديد
    setPicks(p => ({ ...p, [s.i]: { menuItemId: id, options: {} } }));
    setStep(k => k + 1);
  };
  const setOpt = (s: Slot, g: OptionGroup, vk: string) => {
    setPicks(p => ({ ...p, [s.i]: { ...(p[s.i] ?? { options: {} }), options: { ...(p[s.i]?.options ?? {}), [g.key]: vk } } }));
    setStep(k => k + 1);
  };

  const build = (): CartLine => {
    const sp: SlotPick[] = slots.map(s => ({
      i: s.i,
      ...(s.kind === 'choice' ? { menuItemId: picks[s.i]?.menuItemId } : {}),
      options: Object.entries(picks[s.i]?.options ?? {}).filter(([, v]) => !!v).map(([groupKey, valueKey]) => ({ groupKey, valueKey })),
    }));
    const label = slots.map(s => {
      const picked = groupsOf(s, picks)
        .map(g => g.values.find(v => v.key === picks[s.i]?.options?.[g.key])?.name).filter(Boolean) as string[];
      const locked = s.kind === 'fixed' ? Object.values(s.lockedOptions) : [];
      const all = [...locked, ...picked];
      return `${nameOf(s, picks)}${all.length ? ` (${all.join(' · ')})` : ''}`;
    }).join(' + ');
    return { key: `${item.id}#${JSON.stringify(sp)}`, itemId: item.id, name: item.name, quantity: 1,
      options: [], slots: sp, unitPrice, label, isBundle: true };
  };

  let body: React.ReactNode;
  let stepTitle = '';
  if (st.t === 'choice') {
    stepTitle = st.s.label;
    const cur = picks[st.s.i]?.menuItemId;
    body = (
      <>
        {st.s.note && <p className="text-[11px] text-gray-500 mb-2">{st.s.note}</p>}
        <Tiles values={st.s.from.map(f => ({ key: String(f.menuItemId), name: f.name, sub: f.optionGroups.length ? optionHint({ optionGroups: f.optionGroups } as Item) : undefined }))}
          selected={cur ? [String(cur)] : []} onPick={k => setChoice(st.s, Number(k))} />
      </>
    );
  } else if (st.t === 'opt') {
    stepTitle = `${st.g.name} · ${nameOf(st.s, picks)}${st.g.isRequired ? '' : ' · اختياريّ'}`;
    const cur = picks[st.s.i]?.options?.[st.g.key];
    const vals = st.g.isRequired ? st.g.values : [{ key: NONE, name: 'بدون', priceDelta: 0, sub: 'بلا إضافة' }, ...st.g.values];
    body = <Tiles values={vals} selected={cur === undefined ? [] : [cur === '' ? NONE : cur]}
      onPick={vk => setOpt(st.s, st.g, vk === NONE ? '' : vk)} />;
  } else {
    stepTitle = 'راجع العرض';
    body = (
      <div className="rounded-2xl p-3" style={{ background: GOLD.bg, border: `1px solid ${GOLD.bd}` }}>
        {slots.map(s => {
          const vals = groupsOf(s, picks).map(g => g.values.find(v => v.key === picks[s.i]?.options?.[g.key])?.name).filter(Boolean);
          const locked = s.kind === 'fixed' ? Object.values(s.lockedOptions) : [];
          return (
            <div key={s.i} className="flex items-center gap-2 py-2 border-b border-dashed border-white/10 last:border-0">
              <span style={{ color: '#d9b563' }}>✓</span>
              <b className="flex-1 text-[13px] text-white">{nameOf(s, picks)}{s.qty > 1 ? ` ×${s.qty}` : ''}</b>
              <small className="text-[11px]" style={{ color: '#d7bf86' }}>{[...locked, ...vals].join(' · ')}</small>
            </div>
          );
        })}
        {item.description && <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{item.description}</p>}
        {extra > 0 && <p className="text-[11px] mt-2" style={{ color: '#fcd34d' }}>زيادة اختيارك المعلَنة: +{money(extra)} د.أ</p>}
      </div>
    );
  }

  return (
    <Sheet
      title={item.name}
      subtitle={`الخطوة ${AR_DIGITS(i + 1)} من ${AR_DIGITS(steps.length)} — ${stepTitle} · ${money(unitPrice)} د.أ`}
      progress={{ at: i, of: steps.length }}
      onClose={onCancel}
      footer={
        <>
          {st.t === 'done' ? (
            <button onClick={() => onConfirm(build())} className="flex-1 py-3 rounded-xl text-sm font-bold" style={goldBtn}>
              أضف العرض · {money(unitPrice)} د.أ
            </button>
          ) : (
            <button disabled={!stepDone(st, picks)} onClick={() => setStep(k => k + 1)}
              className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-40" style={goldBtn}>
              {stepDone(st, picks) ? 'التالي' : 'اختر أوّلاً'}
            </button>
          )}
          {i > 0 && (
            <button onClick={() => setStep(k => Math.max(0, k - 1))}
              className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">رجوع</button>
          )}
        </>
      }
    >
      {body}
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════
// 📖 ورقة تفصيل صنفٍ بلا خيارات — الوصف الطويل يُقرأ كاملاً
// ══════════════════════════════════════════════════════
function DetailSheet({ item, onCancel, onAdd }: { item: Item; onCancel: () => void; onAdd: () => void }) {
  return (
    <Sheet title={item.name} subtitle={`${money(parseFloat(item.price))} د.أ`} onClose={onCancel}
      footer={
        <>
          <button onClick={onAdd} className="flex-1 py-3 rounded-xl text-sm font-bold" style={goldBtn}>
            أضف للسلّة · {money(parseFloat(item.price))} د.أ
          </button>
          <button onClick={onCancel} className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">إغلاق</button>
        </>
      }>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-40 object-cover rounded-2xl mb-3" />}
      <p className="text-[13px] text-gray-300 leading-relaxed">{item.description}</p>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════
export default function OrderPanel({
  embedded = false, onClose, onEmptyContext, mode = 'order', locationId, locationName,
}: {
  embedded?: boolean;
  onClose?: () => void;
  /** يُستدعى إن تبيّن أن لا سياق طلبٍ ولا حجزَ قادماً — ليُخفي المستضيفُ الزرّ. */
  onEmptyContext?: () => void;
  /** 'browse' = استعراضٌ للقراءة بلا مصادقة (صفحة الألعاب) */
  mode?: 'order' | 'browse';
  locationId?: number;
  locationName?: string;
}) {
  const { player } = usePlayer();
  const browse = mode === 'browse';
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [reason, setReason] = useState('');
  const [next, setNext] = useState<NextCtx | null>(null);
  const [readOnly, setReadOnly] = useState(browse);
  const [venue, setVenue] = useState(locationName || '');
  const [items, setItems] = useState<Item[]>([]);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cat, setCat] = useState<string>('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [wizard, setWizard] = useState<Item | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  const [sheet, setSheet] = useState<'cart' | 'orders' | null>(null);
  const [searchOn, setSearchOn] = useState(false);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState<{ txt: string; err?: boolean } | null>(null);
  const [svc, setSvc] = useState<{ available: boolean; pending: { id: number; kind: string } | null }>({ available: false, pending: null });
  const [svcBusy, setSvcBusy] = useState(false);

  const submitKeyRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 🚫 ما دامت اللوحة مركّبةً — على أيّ سطحٍ من الثلاثة — لا إعادةَ تحميلٍ بالسحب:
  //    `usePullToRefresh` في تخطيط اللاعب يقرأ هذا الصنف ويكفّ (كانت السحبة
  //    تعيد تحميل الصفحة وتمسح السلّة). يُضبط على الجسد لا على الجذر لأنّ
  //    حالة التحميل ترسم بلا الجذر.
  useEffect(() => {
    document.body.classList.add('fnb-open');
    return () => { document.body.classList.remove('fnb-open'); };
  }, []);

  // 🚫 السحب لأسفل لا أثر له داخل اللوحة (قرار المالك 2026-09-09): لا سحبٌ
  //    للتحديث ولا ارتدادٌ مطّاطيّ يُزيح الطبقة الثابتة. مستمعٌ غير سلبيّ
  //    (passive:false) لأنّ React لا يستطيع منع الافتراضيّ في touchmove.
  //    يُمنع فقط حين لا حاويةَ تمريرٍ تستقبل الحركة، أو حين بلغت طرفها.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let startY = 0;
    const onStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0; };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY;
      let el = e.target as HTMLElement | null;
      while (el && el !== root) {
        const st = getComputedStyle(el);
        const scrollable = /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight;
        if (scrollable) {
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((dy > 0 && atTop) || (dy < 0 && atBottom)) { if (e.cancelable) e.preventDefault(); }
          return;
        }
        el = el.parentElement;
      }
      if (e.cancelable) e.preventDefault();
    };
    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    return () => { root.removeEventListener('touchstart', onStart); root.removeEventListener('touchmove', onMove); };
  }, [loading]);

  const headers = useMemo(() => ({ Authorization: `Bearer ${player?.token || ''}` }), [player?.token]);
  const flash = (txt: string, isErr = false) => {
    setToast({ txt, err: isErr });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
  const loadPublicMenu = useCallback((locId: number) => fetch(`/api/player-app/locations/${locId}/menu`)
    .then(r => r.json())
    .then(d => { if (d.success) { setItems(d.items || []); if (d.locationName) setVenue(d.locationName); } })
    .catch(() => {}), []);

  // ── التحميل ──
  useEffect(() => {
    if (browse) {
      if (!locationId) { setLoading(false); return; }
      loadPublicMenu(locationId).finally(() => setLoading(false));
      return;
    }
    if (!player) return;
    fetch('/api/fnb/context', { headers })
      .then(r => r.json())
      .then(async (d) => {
        if (!d.success || !d.context) {
          setReason(d.reason || '');
          if (d.next?.locationId) setNext(d.next); else onEmptyContext?.();
          return;
        }
        setCtx(d.context); setVenue(d.context.locationName);
        const menuRes = await fetch(`/api/fnb/menu?activityId=${d.context.activityId}`, { headers }).then(r => r.json());
        if (menuRes.success) setItems(menuRes.items);
        loadOrders(d.context.activityId);
        loadSvc();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, browse, locationId]);

  // 💨 فور إغلاق الموظّف طلبَ الفحم يعود الزرّ قابلاً للضغط
  useEffect(() => {
    if (!player || browse) return;
    let sock: any = null;
    const onDone = () => { setSvc(v => ({ ...v, pending: null })); loadSvc(); };
    import('@/lib/socket').then(m => { sock = m.getSocket(); sock.on('fnb:service-done', onDone); }).catch(() => {});
    return () => { try { sock?.off('fnb:service-done', onDone); } catch { /* لا شيء */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, browse]);

  useEffect(() => {
    if (!ctx) return;
    const refresh = () => { if (document.visibilityState !== 'visible') return; loadOrders(ctx.activityId); loadSvc(); };
    const iv = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', refresh); };
  }, [ctx, loadOrders, loadSvc]);

  // ── الأقسام: العروض أوّلاً ثمّ ترتيب الخادم ──
  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    const packages = items.filter(i => i.isBundle);
    if (packages.length) out.push({ key: '_pkg', short: 'العروض', title: 'العروض', isPkg: true, items: packages });
    const idx = new Map<string, Section>();
    for (const it of items) {
      if (it.isBundle) continue;
      const c = it.category || '', s = it.subcategory || '';
      const key = `${c}|${s}`;
      let sec = idx.get(key);
      if (!sec) {
        sec = { key, short: shortOf(c, s), title: s ? `${c} ← ${s}` : (c || 'المنيو'), isPkg: false, items: [] };
        idx.set(key, sec); out.push(sec);
      }
      sec.items.push(it);
    }
    return out;
  }, [items]);
  const activeKey = sections.some(s => s.key === cat) ? cat : (sections[0]?.key ?? '');
  const active = sections.find(s => s.key === activeKey);

  const inPackageIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of items) if (p.isBundle) for (const s of p.slots ?? []) {
      if (s.kind === 'fixed') ids.add(s.menuItemId); else s.from.forEach(f => ids.add(f.menuItemId));
    }
    return ids;
  }, [items]);

  const query = search.trim();
  const results = useMemo(() => !query ? [] : items.filter(i =>
    i.name.includes(query) || (i.description || '').includes(query)
    || (i.subcategory || '').includes(query) || (i.category || '').includes(query)
    || (i.optionGroups ?? []).some(g => g.values.some(v => v.name.includes(query)))
  ), [items, query]);

  // ── السلّة ──
  const bumpLine = (line: CartLine) => { submitKeyRef.current = null; setCart(prev => {
    const i = prev.findIndex(l => l.key === line.key);
    if (i === -1) return [...prev, line];
    const nx = [...prev]; nx[i] = { ...nx[i], quantity: Math.min(nx[i].quantity + 1, 20) }; return nx;
  }); };
  const changeQty = (key: string, delta: number) => { submitKeyRef.current = null; setCart(prev => prev.flatMap(l => {
    if (l.key !== key) return [l];
    const q = l.quantity + delta;
    return q <= 0 ? [] : [{ ...l, quantity: Math.min(q, 20) }];
  })); };
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const qtyOfItem = (id: number) => cart.filter(l => l.itemId === id).reduce((s, l) => s + l.quantity, 0);

  const addSimple = (it: Item) => {
    bumpLine({ key: `${it.id}#`, itemId: it.id, name: it.name, quantity: 1, options: [], slots: [], unitPrice: parseFloat(it.price), label: '', isBundle: false });
    flash(`أُضيف ${it.name} · ${money(parseFloat(it.price))} د.أ`);
  };
  const addWithOptions = (it: Item) => {
    const groups = it.optionGroups ?? [];
    const labels: string[] = []; const options: { groupKey: string; valueKey: string }[] = []; let delta = 0;
    for (const g of groups) for (const vk of (sel[g.key] ?? [])) {
      const v = g.values.find(x => x.key === vk); if (!v) continue;
      delta += v.priceDelta; labels.push(v.name); options.push({ groupKey: g.key, valueKey: vk });
    }
    const unitPrice = parseFloat(it.price) + delta;
    bumpLine({ key: `${it.id}#${JSON.stringify(options.map(o => `${o.groupKey}|${o.valueKey}`).sort())}`,
      itemId: it.id, name: it.name, quantity: 1, options, slots: [], unitPrice, label: labels.join(' · '), isBundle: false });
    setExpanded(null); setSel({});
    flash(`أُضيف ${it.name} ${labels.join(' · ')} · ${money(unitPrice)} د.أ`);
  };
  const expand = (it: Item) => {
    // ✅ «عادي» يُحدَّد مبدئيّاً في المجموعة الإلزاميّة الأحاديّة — النكهات لا تُمسّ
    const init: Record<string, string[]> = {};
    for (const g of it.optionGroups ?? []) {
      if (g.isRequired && g.selectionType === 'single') {
        const normal = g.values.find(v => v.name === 'عادي' && v.priceDelta === 0);
        if (normal) init[g.key] = [normal.key];
      }
    }
    setSel(init); setExpanded(it.id);
  };
  const pick = (g: OptionGroup, vk: string) => setSel(prev => {
    const cur = prev[g.key] ?? [];
    let nx: string[];
    if (g.selectionType === 'single') nx = cur[0] === vk && !g.isRequired ? [] : [vk];
    else if (cur.includes(vk)) nx = cur.filter(v => v !== vk);
    else nx = cur.length >= g.maxSelect ? cur : [...cur, vk];
    return { ...prev, [g.key]: nx };
  });

  const submit = async () => {
    if (cartCount === 0 || !ctx) return;
    setSending(true); setErr('');
    if (!submitKeyRef.current) {
      submitKeyRef.current = (globalThis.crypto?.randomUUID?.() ?? `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`);
    }
    try {
      const fix = await freshFixForGate();
      const r = await fetch('/api/fnb/orders', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fix,
          items: cart.map(l => ({
            menuItemId: l.itemId, quantity: l.quantity,
            options: l.options.map(o => ({ group: o.groupKey, value: o.valueKey })),
            slots: l.slots.map(s => ({ i: s.i, ...(s.menuItemId ? { menuItemId: s.menuItemId } : {}),
              options: s.options.map(o => ({ group: o.groupKey, value: o.valueKey })) })),
          })),
          note: note.trim(), clientKey: submitKeyRef.current,
        }),
      });
      const d = await r.json();
      if (d.success) {
        submitKeyRef.current = null;
        setCart([]); setNote(''); setSheet('orders');
        loadOrders(ctx.activityId);
        flash('وصل طلبك للمكان');
      } else setErr(d.error || 'فشل إرسال الطلب');
    } catch { setErr('خطأ في الاتصال — لم يُرسَل الطلب، أعد المحاولة'); }
    setSending(false);
  };
  const cancelOrder = async (id: number) => {
    if (!ctx) return;
    const r = await fetch(`/api/fnb/orders/${id}/cancel`, { method: 'POST', headers }).then(x => x.json()).catch(() => ({ success: false }));
    if (r.success) loadOrders(ctx.activityId); else flash(r.error || 'تعذّر الإلغاء', true);
  };
  const askService = async (kind: 'coal' | 'fix') => {
    if (svcBusy || svc.pending) return;
    setSvcBusy(true);
    try {
      const d = await fetch('/api/fnb/service', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) }).then(r => r.json());
      if (d.success) setSvc(s => ({ ...s, pending: d.request })); else flash(d.error || 'تعذّر إرسال الطلب', true);
    } catch { flash('خطأ في الاتصال', true); }
    setSvcBusy(false);
  };

  // بلا سياق: التصفّح للقراءة من منيو الحجز القادم
  const browseNext = () => { if (!next) return; setReadOnly(true); setLoading(true); loadPublicMenu(next.locationId).finally(() => setLoading(false)); };

  const openBadge = myOrders.filter(o => o.status === 'new' || o.status === 'preparing').length;
  const ro = readOnly || browse;

  // ── حالات التحميل ──
  if (loading) {
    return (
      <div className={`${embedded ? 'h-full' : 'fnb-page-h'} flex items-center justify-center`} style={{ background: '#050505' }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(197,160,89,0.3)', borderTopColor: '#C5A059' }} />
      </div>
    );
  }

  // ── لبنات ──
  const Header = (
    <div className="shrink-0 px-3.5 py-2.5 flex items-center gap-2.5 border-b border-white/7" style={{ background: '#0b0b0b' }}>
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: GOLD.bg, border: `1px solid ${GOLD.bd}`, color: GOLD.fg }}>
        <IcoPlate size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <h1 className="text-white text-[14.5px] font-bold truncate">{venue || 'المنيو'}</h1>
        <p className="text-[10.5px] truncate" style={{ color: '#8d8d8d' }}>
          {browse ? 'للاطّلاع — يفتح الطلب قبل الموعد بساعة ويحتاج حجزاً'
            : ro && next ? `للقراءة — يفتح الطلب الساعة ${next.opensAt}`
            : ctx?.source === 'live' ? 'أنت داخل اللعبة — الطلب يصل طاولتك' : 'حجزك مؤكّد — الطلب متاح'}
        </p>
      </div>
      {items.length > 0 && (
        <button onClick={() => { setSearchOn(v => !v); setSearch(''); setTimeout(() => searchRef.current?.focus(), 50); }} aria-label="بحث"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={searchOn ? { background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg } : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc' }}>
          <IcoSearch size={15} />
        </button>
      )}
      {!ro && ctx && (
        <button onClick={() => setSheet('orders')} aria-label="طلباتي"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center relative"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc' }}>
          <IcoReceipt size={15} />
          {openBadge > 0 && (
            <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-black flex items-center justify-center text-black" style={{ background: '#fbbf24' }}>{openBadge}</span>
          )}
        </button>
      )}
      {embedded && (
        <button onClick={onClose} aria-label="إغلاق"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-gray-400"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}><IcoX size={13} /></button>
      )}
    </div>
  );

  const Tile = (it: Item) => {
    const n = qtyOfItem(it.id);
    const open = expanded === it.id;
    const groups = it.optionGroups ?? [];
    const missing = groups.filter(g => g.isRequired && (sel[g.key]?.length ?? 0) === 0);
    const longDesc = !hasOpts(it) && (it.description || '').length > LONG_DESC;
    const sub = it.description || (hasOpts(it) ? optionHint(it) : '') || (inPackageIds.has(it.id) ? 'ضمن عرض' : '');
    return (
      <div key={it.id} className={`rounded-2xl p-2.5 flex flex-col gap-1.5 relative ${open ? 'col-span-2' : ''}`}
        style={{ minHeight: 96, background: n > 0 ? 'rgba(251,191,36,0.06)' : 'rgba(255,255,255,0.035)', border: `1px solid ${n > 0 ? AMBER.bd : 'rgba(255,255,255,0.07)'}` }}>
        {it.imageUrl && <img src={it.imageUrl} alt="" className="w-full h-20 object-cover rounded-xl" />}
        <p className="text-white text-[13px] font-bold leading-snug">{it.name}</p>
        {sub && <p className="text-[10px] leading-snug truncate" style={{ color: inPackageIds.has(it.id) && !it.description && !hasOpts(it) ? '#d7bf86' : '#8a8a8a' }}>{sub}</p>}
        {open && groups.map(g => {
          const cur = sel[g.key] ?? [];
          return (
            <div key={g.key} className="mt-1">
              <p className="text-[10.5px] font-bold mb-1.5 flex items-center gap-1.5" style={{ color: '#d7bf86' }}>
                {g.name}
                {!g.isRequired && <span className="text-gray-600 font-normal">اختياريّ</span>}
                {g.selectionType === 'multi' && <span className="text-gray-600 font-normal">حتى {AR_DIGITS(g.maxSelect)}</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.values.map(v => {
                  const on = cur.includes(v.key);
                  return (
                    <button key={v.key} onClick={() => pick(g, v.key)}
                      className="px-3 rounded-xl text-[12.5px] font-bold min-h-[40px] flex items-center"
                      style={on ? { background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }
                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ddd' }}>
                      {v.name}{v.priceDelta > 0 && <span className="text-[9.5px] opacity-80 mr-1">+{money(v.priceDelta)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[14px] font-black tabular-nums" style={{ color: '#fcd34d' }}>
            {money(parseFloat(it.price))}<span className="text-[8.5px] font-bold opacity-65"> د.أ</span>
          </span>
          {ro ? null : hasOpts(it) ? (
            open ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => { setExpanded(null); setSel({}); }} className="h-[34px] px-2.5 rounded-xl text-[12px] text-gray-400 bg-white/5 border border-white/10">إلغاء</button>
                <button disabled={missing.length > 0} onClick={() => addWithOptions(it)}
                  className="h-[34px] px-3 rounded-xl text-[12px] font-bold disabled:opacity-45"
                  style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>
                  {missing.length > 0 ? `اختر ${missing[0].name}` : 'أضف'}
                </button>
              </div>
            ) : (
              <button onClick={() => expand(it)} className="h-[34px] px-3 rounded-xl text-[12px] font-bold"
                style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>
                {n > 0 ? `×${n} +` : 'اختر'}
              </button>
            )
          ) : longDesc ? (
            <button onClick={() => setViewing(it)} className="h-[34px] px-3 rounded-xl text-[12px] font-bold"
              style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>{n > 0 ? `×${n} +` : 'التفاصيل'}</button>
          ) : n > 0 ? (
            <div className="flex items-center gap-1.5">
              <button onClick={() => changeQty(`${it.id}#`, -1)} aria-label="أقلّ" className="w-[30px] h-[30px] rounded-lg bg-white/6 border border-white/10 text-white text-base font-bold">−</button>
              <b className="min-w-[16px] text-center text-white text-sm tabular-nums">{n}</b>
              <button onClick={() => changeQty(`${it.id}#`, 1)} aria-label="أكثر" className="w-[30px] h-[30px] rounded-lg text-base font-bold"
                style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>+</button>
            </div>
          ) : (
            <button onClick={() => addSimple(it)} aria-label={`أضف ${it.name}`} className="w-[34px] h-[34px] rounded-xl text-lg font-black flex items-center justify-center"
              style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>+</button>
          )}
        </div>
      </div>
    );
  };

  const PkgCard = (p: Item) => {
    const n = qtyOfItem(p.id);
    return (
      <div key={p.id} className="rounded-2xl p-3 mb-2" style={{ background: 'linear-gradient(135deg, rgba(197,160,89,0.13), rgba(255,255,255,0.02))', border: `1px solid ${GOLD.bd}` }}>
        <div className="flex items-center gap-2">
          <h3 className="text-white text-[13.5px] font-bold flex-1 min-w-0">{p.name}</h3>
          <span className="text-[15px] font-black tabular-nums shrink-0" style={{ color: GOLD.fg }}>{money(parseFloat(p.price))}<span className="text-[9px] opacity-65"> د.أ</span></span>
        </div>
        {p.description && <p className="text-[10.5px] text-gray-400 mt-1 leading-relaxed">{p.description}</p>}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(p.slots ?? []).map(s => (
            <span key={s.i} className="text-[10.5px] px-2 py-0.5 rounded-lg"
              style={s.kind === 'choice'
                ? { background: 'transparent', border: `1px dashed ${GOLD.bd}`, color: GOLD.fg }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}>
              {s.kind === 'choice' ? `${s.label}: ${AR_DIGITS(s.from.length)} خيارات`
                : `${s.name}${s.qty > 1 ? ` ×${s.qty}` : ''}${Object.values(s.lockedOptions)[0] ? ` ${Object.values(s.lockedOptions)[0]}` : s.optionGroups.length ? ' · بنكهتك' : ''}`}
            </span>
          ))}
        </div>
        {!ro && (
          <button onClick={() => setWizard(p)} className="w-full mt-2.5 py-2.5 rounded-xl text-[12.5px] font-bold" style={goldBtn}>
            {n > 0 ? `في السلّة ×${n} — ركّب توليفةً أخرى` : 'ركّب العرض'}
          </button>
        )}
      </div>
    );
  };

  const NoCtx = (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10" dir="rtl">
      <span className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: GOLD.bg, border: `1px solid ${GOLD.bd}`, color: GOLD.fg }}><IcoPlate size={24} /></span>
      <b className="text-white text-[14px]">{next ? `يفتح الطلب الساعة ${next.opensAt}` : 'لا يوجد نشاط متاح للطلب الآن'}</b>
      <p className="text-gray-400 text-[12px] mt-2 leading-relaxed">{reason || 'الطلب متاح للحاجزين داخل نافذة الفعاليّة'}</p>
      {next && (
        <button onClick={browseNext} className="mt-4 px-4 py-2.5 rounded-xl text-[12.5px] font-bold" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#ddd' }}>
          تصفّح منيو {next.locationName} للقراءة
        </button>
      )}
      {embedded && <button onClick={onClose} className="mt-3 text-[12px] underline" style={{ color: GOLD.fg }}>إغلاق</button>}
    </div>
  );

  const noCtx = !browse && !ctx && !readOnly;

  return (
    <div ref={rootRef} className={`${embedded ? 'h-full' : 'fnb-page-h max-w-lg mx-auto'} flex flex-col relative overscroll-none`} dir="rtl" style={{ background: '#050505', overscrollBehavior: 'none' }}>
      {Header}

      {noCtx ? NoCtx : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-gray-500 text-sm">المكان لم يضف أصنافاً بعد</p></div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* ══ الرفّ ══ */}
          {!searchOn && (
            <div className="w-[78px] shrink-0 overflow-y-auto overscroll-none border-l border-white/7 px-1.5 py-2 flex flex-col gap-1" style={{ background: '#080808', scrollbarWidth: 'none' }}>
              {sections.map(s => {
                const on = s.key === activeKey;
                const Ico = sectionIcon(s.title, s.isPkg);
                return (
                  <button key={s.key} onClick={() => { setCat(s.key); setExpanded(null); mainRef.current?.scrollTo({ top: 0 }); }}
                    className="rounded-xl px-1 pt-2 pb-1.5 flex flex-col items-center gap-1 text-[10.5px] font-bold leading-tight text-center"
                    style={on
                      ? { background: s.isPkg ? GOLD.bg : AMBER.bg, border: `1px solid ${s.isPkg ? GOLD.bd : AMBER.bd}`, color: s.isPkg ? GOLD.fg : AMBER.fg }
                      : { border: '1px solid transparent', color: '#9a9a9a' }}>
                    <Ico size={18} />
                    <span>{s.short}</span>
                    <span className="text-[9px] font-medium opacity-70 tabular-nums">{AR_DIGITS(s.items.length)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ══ البلاطات ══ */}
          <div ref={mainRef} className="flex-1 min-w-0 overflow-y-auto overscroll-none px-2.5 py-2.5 pb-6">
            {searchOn && (
              <div className="relative mb-2.5">
                {/* 🔴 ١٦ بكسل — أصغر منها يُقرّب سفاري الشاشة عند التركيز */}
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث: نكهة، صنف، قسم…"
                  enterKeyHint="search" autoComplete="off"
                  className="w-full rounded-xl py-2.5 pr-3 pl-9 text-white placeholder:text-gray-600 focus:outline-none"
                  style={{ fontSize: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                {query && (
                  <button onClick={() => setSearch('')} aria-label="مسح"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 text-gray-400 flex items-center justify-center"><IcoX size={11} /></button>
                )}
              </div>
            )}
            {err && sheet !== 'cart' && <p className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2 mb-2">{err}</p>}

            {searchOn ? (
              !query ? (
                <p className="text-center text-gray-500 text-[12px] py-10">جرّب اسم نكهةٍ: «نخلة» يعيد الأرجيلة الفاخرة وعروضها</p>
              ) : results.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-gray-500 text-sm">لا صنف يطابق «{query}»</p>
                  <button onClick={() => setSearch('')} className="text-xs underline mt-2" style={{ color: GOLD.fg }}>امسح البحث</button>
                </div>
              ) : (
                <>
                  {results.filter(i => i.isBundle).map(PkgCard)}
                  <div className="grid grid-cols-2 gap-2">{results.filter(i => !i.isBundle).map(Tile)}</div>
                </>
              )
            ) : active ? (
              active.isPkg ? (
                <>
                  {active.items.map(PkgCard)}
                  <p className="text-[10px] text-gray-600 text-center mt-1">اختياراتك لا تغيّر السعر — إلّا ما عليه زيادةٌ معلَنة</p>
                </>
              ) : (
                <>
                  <p className="text-[10.5px] font-bold mb-2 flex items-center gap-2" style={{ color: 'rgba(197,160,89,0.8)' }}>
                    <span>{active.title}</span><span className="flex-1 h-px" style={{ background: 'rgba(197,160,89,0.18)' }} /><span className="text-gray-600 tabular-nums">{AR_DIGITS(active.items.length)}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">{active.items.map(Tile)}</div>
                </>
              )
            ) : null}
          </div>
        </div>
      )}

      {/* ══ شريط السلّة — كهرمانيٌّ يقول «لم يُرسَل بعد» ══ */}
      <AnimatePresence>
        {!ro && cartCount > 0 && (
          <motion.button
            initial={{ y: 70 }} exit={{ y: 70 }}
            animate={{ y: 0, boxShadow: ['0 -2px 14px rgba(245,158,11,0.10)', '0 -6px 26px rgba(245,158,11,0.32)', '0 -2px 14px rgba(245,158,11,0.10)'] }}
            transition={{ y: { type: 'spring', damping: 26, stiffness: 320 }, boxShadow: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
            onClick={() => { setErr(''); setSheet('cart'); }}
            className="shrink-0 w-full px-3 py-2.5 flex items-center gap-2.5 border-t"
            style={{ background: 'rgba(28,19,5,0.97)', borderColor: 'rgba(245,158,11,0.5)' }}
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 tabular-nums" style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>{cartCount}</span>
            <div className="flex-1 min-w-0 text-right">
              <b className="block text-[12.5px] font-black" style={{ color: '#fcd34d' }}>لم يُرسَل بعد — <span className="tabular-nums">{money(cartTotal)} د.أ</span></b>
              <span className="block text-[10px]" style={{ color: 'rgba(252,211,77,0.55)' }}>طلبك لم يصل الكافيه · اضغط للمراجعة والإرسال</span>
            </div>
            <span className="px-4 py-2.5 rounded-xl text-[12.5px] font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>راجع وأرسل</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══ إشعارٌ عابر ══ */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-4 right-4 z-[70] rounded-xl px-3.5 py-2.5 text-[12.5px]"
            style={{ bottom: cartCount > 0 ? 80 : 20, background: toast.err ? '#1c1210' : '#151006', border: `1px solid ${toast.err ? 'rgba(224,106,94,0.5)' : GOLD.bd}`, color: toast.err ? '#f7c9c4' : '#f3dea3', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            {toast.txt}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ درج السلّة ══ */}
      {sheet === 'cart' && cart.length > 0 && (
        <Sheet title="سلّتك" subtitle={`لم تُرسَل بعد — ${AR_DIGITS(cartCount)} أصناف · ${money(cartTotal)} د.أ`} subtitleWarn
          onClose={() => setSheet(null)}
          footer={
            <>
              <button onClick={submit} disabled={sending} className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                {sending ? 'جارٍ الإرسال…' : `إرسال الطلب · ${money(cartTotal)} د.أ`}
              </button>
              <button onClick={() => setSheet(null)} className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-400">متابعة</button>
            </>
          }>
          {err && <p className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2 mb-3">{err}</p>}
          {cart.map(l => (
            <div key={l.key} className="rounded-2xl p-2.5 mb-2 flex items-center gap-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[12.5px] font-semibold truncate">{l.isBundle ? 'عرض · ' : ''}{l.name}</p>
                {l.label && <p className="text-[10px] leading-relaxed" style={{ color: '#d7bf86' }}>{l.label}</p>}
                <p className="text-[11px] font-bold tabular-nums mt-0.5" style={{ color: '#fcd34d' }}>{money(l.unitPrice * l.quantity)} د.أ</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => changeQty(l.key, -99)} aria-label="حذف" className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: '#fb7185' }}><IcoX size={11} /></button>
                <button onClick={() => changeQty(l.key, -1)} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white text-sm">−</button>
                <span className="text-white text-sm font-bold w-4 text-center tabular-nums">{l.quantity}</span>
                <button onClick={() => changeQty(l.key, 1)} className="w-7 h-7 rounded-lg text-sm font-bold" style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>+</button>
              </div>
            </div>
          ))}
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} enterKeyHint="done"
            placeholder="ملاحظة للمكان (اختياريّ)"
            className="w-full mt-1 rounded-xl px-3 py-2.5 text-white placeholder:text-gray-600 focus:outline-none"
            style={{ fontSize: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </Sheet>
      )}

      {/* ══ طلباتي + خدمة الأرجيلة ══ */}
      {sheet === 'orders' && (
        <Sheet title="طلباتي" subtitle={openBadge ? `${AR_DIGITS(openBadge)} قيد المتابعة` : 'كلّ ما طلبته في هذه الفعاليّة'} onClose={() => setSheet(null)}>
          {svc.available && (
            <div className="rounded-2xl p-3 mb-3" style={{ background: GOLD.bg, border: `1px solid ${GOLD.bd}` }}>
              <b className="block text-white text-[13px]">أرجيلتك وصلت — تحتاج شيئاً؟</b>
              <p className="text-gray-400 text-[10.5px] mt-0.5 mb-2.5">طلبٌ بلا سعر يصل مسؤول الأراجيل مباشرةً ولا يدخل فاتورتك.</p>
              {svc.pending ? (
                <p className="text-[11.5px] text-center rounded-xl px-3 py-2.5" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#bfe9cf' }}>وصل طلبك — الموظّف في الطريق</p>
              ) : (
                <div className="flex gap-2">
                  {([['coal', 'أحتاج فحماً', IcoFire], ['fix', 'تزبيط الأرجيلة', IcoTool]] as const).map(([k, label, Ico]) => (
                    <button key={k} onClick={() => askService(k)} disabled={svcBusy}
                      className="flex-1 min-h-[44px] rounded-xl text-[12.5px] font-bold disabled:opacity-45 flex items-center justify-center gap-1.5"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#eee' }}>
                      <Ico size={15} />{label}
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
              <div key={o.id} className="rounded-2xl p-3 mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}33` }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                  <span className="flex-1 text-[12px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="text-white text-xs font-bold tabular-nums">{money(parseFloat(o.total))} د.أ</span>
                </div>
                <p className="text-gray-300 text-[11.5px] leading-relaxed">{o.items.map(i => `${i.name} ×${i.quantity}`).join(' • ')}</p>
                {o.items.filter(i => i.options?.length).map((i, ix) => (
                  <p key={`o${ix}`} className="text-[10.5px] leading-relaxed" style={{ color: '#d7bf86' }}>{i.name}: {i.options!.map(x => x.value).join(' · ')}</p>
                ))}
                {o.items.filter(i => i.components?.length).map((i, ix) => (
                  <p key={`c${ix}`} className="text-[10.5px] leading-relaxed" style={{ color: '#d7bf86' }}>
                    {i.name}: {i.components!.map(c => `${c.name}${c.options?.length ? ` (${c.options.map(x => x.value).join(' · ')})` : ''}`).join(' + ')}
                  </p>
                ))}
                {o.note && <p className="text-gray-500 text-[10px] mt-1">ملاحظة: {o.note}</p>}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-gray-600 text-[9.5px]">#{o.id} · {new Date(o.createdAt).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}</span>
                  {o.status === 'new' && <button onClick={() => cancelOrder(o.id)} className="text-[10.5px] text-rose-400/80 underline">إلغاء الطلب</button>}
                </div>
              </div>
            );
          })}
        </Sheet>
      )}

      {/* ══ المُركِّب وورقة التفصيل ══ */}
      {wizard && (
        <BundleWizard item={wizard} onCancel={() => setWizard(null)}
          onConfirm={line => { bumpLine(line); setWizard(null); flash(`أُضيف العرض · ${line.label}`); }} />
      )}
      {viewing && (
        <DetailSheet item={viewing} onCancel={() => setViewing(null)} onAdd={() => { addSimple(viewing); setViewing(null); }} />
      )}
    </div>
  );
}
