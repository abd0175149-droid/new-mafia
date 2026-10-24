'use client';

// ══════════════════════════════════════════════════════
// 🍽️ لوحة المنيو — «الرفّ» بالبلاطات المكبّرة (قرار المالك 2026-10-24، المقترح ب)
//
// 🧭 البنية: رفٌّ عموديٌّ ثابت على اليمين بأسماء الأقسام وحدها (العروض أوّلاً)،
//    وبلاطاتٌ بعمودين للقسم المختار. البلاطة: اسم ١٥ · وصف ١٢٫٥ · سعر ١٥٫٥ ثمّ
//    زرٌّ بعرضها (٤٤ بكسل). لا نصّ تحت ١٢٫٥ بكسل ولا زرّ تحت ٤٤.
// ⚙️ الصنف ذو الخيارات يتّسع في مكانه على العمودين، والشبكة `grid-flow-row-dense`
//    فلا تبقى خانةٌ فارغة خلفه، ثمّ يُمرَّر إلى العين داخل اللوحة لا الصفحة.
// 🎁 العرض يُركَّب بمُركِّبٍ متدرّج: خطوةٌ لكلّ قرار؛ والمرشّحون الكثر يُجمَعون بأقسامهم.
// 🧾 «طلباتي» ورقةٌ من أيقونة الترويسة، وفيها خدمة الأرجيلة ولافتة «وصل طلبك».
// 📖 وضعان: mode='order' (الرئيسيّة/اللعبة — يحتاج سياقاً من الخادم) و
//    mode='browse' (استعراضٌ للقراءة قبل الحجز — النقطة العامّة بلا مصادقة).
//    العارض واحدٌ للسطوح الثلاثة؛ لا يتفرّع عارضٌ ثانٍ في صفحة الألعاب.
// 🕒 بلا سياقٍ لكن بحجزٍ قادم: الخادم يعيد next (المكان وموعد الفتح) فتُعرض
//    الرسالة الصحيحة ويُتاح تصفّح المنيو للقراءة — لا شاشة فارغة.
//
// 🔴 دروسٌ محفوظة (لا تُكسر):
//    - حقول الإدخال بحجم ١٦ بكسل: أصغر من ذلك يُقرّب سفاري الشاشة عند
//      التركيز فينزاح التخطيط الثابت وتختفي الأزرار السفليّة.
//    - ارتفاع الصفحة الكاملة من صنف CSS (fnb-page-h) يحمل سطر 100vh
//      احتياطيّاً قبل 100dvh — المتصفّحات القديمة كانت تُسقط الشريط تحت التنقّل.
//    - الأوراق `fixed` لا `absolute`، وتنسيق الذيل يرتفع مع لوحة المفاتيح
//      (visualViewport) كي لا يختفي زرّ الإرسال خلفها.
//    - مفتاح السلّة = صنف + توليفة الخيارات؛ توليفتان = سطران.
//    - مفتاح تكرار الإرسال يثبت عبر إعادة المحاولة ويتجدّد مع تغيّر السلّة.
//    - البحث يطبّع التشكيل والهمزة: «تركية» تجد «تركيّة» و«اسبريسو» تجد «إسبريسو».
//    - الإغلاق والسلّة غير فارغة يسأل أوّلاً (requestClose) — لمسةٌ خارج الورقة
//      داخل اللعبة كانت تمسح السلّة بلا كلمة.
//    - الأرقام لاتينيّة في المنيو كلّه — لا «3» في الشريط و«٣ أصناف» في الدرج.
// ══════════════════════════════════════════════════════

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import { freshFixForGate } from './LocationGate';
import { IcoFire, IcoPlate, IcoReceipt, IcoSearch, IcoTool, IcoX } from './fnb/icons';

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
interface Section { key: string; short: string; parent: string; isPkg: boolean; items: Item[] }
/** يستدعيه المستضيف بدل إغلاق اللوحة مباشرةً — فيسأل إن كانت السلّة غير فارغة */
export interface OrderPanelHandle { requestClose: () => void }

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: 'وصل للمكان · بانتظار القبول', color: '#8CC1F2' },
  preparing: { label: 'قيد التحضير', color: '#fbbf24' },
  delivered: { label: 'تمّ التسليم', color: '#4ade80' },
  cancelled: { label: 'ملغى', color: '#9ca3af' },
};
const money = (n: number) => n.toFixed(2);
const LONG_DESC = 40;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ar-JO-u-nu-latn', { hour: 'numeric', minute: '2-digit' });

// ألوان اللوحة — كهرمانيّ التطبيق للفعل، ذهبيّه للعروض، ودلاليّ للحالات؛
// والنصّ بثلاث درجاتٍ دافئة (أخفتها ≥ ٤٫٥:١ على #050505).
const AMBER = { bg: 'rgba(251,191,36,0.13)', bd: 'rgba(251,191,36,0.46)', fg: '#fcd34d' };
const GOLD = { bg: 'rgba(197,160,89,0.12)', bd: 'rgba(197,160,89,0.46)', fg: '#e7cf8d' };
const INK = { hi: '#f3eee6', mid: '#c4bdb1', low: '#958e83' };
const goldBtn = { background: 'linear-gradient(135deg, #d9b563, #a7833a)', color: '#150f04' };
const amberBtn = { background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#1a1003' };
const ghost = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: INK.mid };

// ══════════════════════════════════════════════════════
// أدوات صغيرة
// ══════════════════════════════════════════════════════
const hasOpts = (it: Item) => (it.optionGroups?.length ?? 0) > 0;
/** سطر البلاطة: الوصف المكتوب، وإلّا نكهات الصنف نفسها — «لوتس · أوريو · كيندر» تُعرف بالعين، «٣ نكهات» لا */
function subOf(it: Pick<Item, 'description' | 'optionGroups'>) {
  if (it.description) return it.description;
  const vals = (it.optionGroups ?? []).flatMap(g => g.values.map(v => v.name));
  if (!vals.length) return '';
  return vals.slice(0, 4).join(' · ') + (vals.length > 4 ? ` و${vals.length - 4} غيرها` : '');
}
/** تطبيعٌ للبحث: بلا تشكيلٍ ولا تطويل، والهمزات ألفاً، والتاء المربوطة هاءً، والمقصورة ياءً */
const norm = (s: string) => (s || '').normalize('NFKC')
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .toLowerCase();

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

/** زرّ أيقونةٍ في الترويسة — ٤٤ بكسل */
function IconBtn({ label, onClick, active, children, badge }: {
  label: string; onClick: () => void; active?: boolean; children: React.ReactNode; badge?: number;
}) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active}
      className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center relative"
      style={active ? { background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg } : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: INK.mid }}>
      {children}
      {!!badge && (
        <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-black flex items-center justify-center text-black tabular-nums" style={{ background: '#fbbf24' }}>{badge}</span>
      )}
    </button>
  );
}

/** عدّاد ± — زرّان ٤٤ بكسل يسمّيان الصنف لقارئ الشاشة */
function Stepper({ qty, name, onInc, onDec, spread }: { qty: number; name: string; onInc: () => void; onDec: () => void; spread?: boolean }) {
  return (
    <div className={`flex items-center gap-1 ${spread ? 'justify-between w-full' : ''}`}>
      <button onClick={onInc} aria-label={`واحد آخر من ${name}`} className="w-11 h-11 rounded-xl text-xl font-bold flex items-center justify-center"
        style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>+</button>
      <b className="min-w-[28px] text-center text-white text-[17px] tabular-nums">{qty}</b>
      <button onClick={onDec} aria-label={`واحد أقلّ من ${name}`} className="w-11 h-11 rounded-xl text-xl font-bold flex items-center justify-center text-white"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>−</button>
    </div>
  );
}

const Price = ({ v, big }: { v: number; big?: boolean }) => (
  <span className={`${big ? 'text-[17px]' : 'text-[15.5px]'} font-bold tabular-nums`} style={{ color: INK.hi }}>
    {money(v)} <span className="text-[12.5px] font-medium" style={{ color: INK.low }}>د.أ</span>
  </span>
);

// ══════════════════════════════════════════════════════
// ورقةٌ سفليّة: ترويسةٌ وذيلٌ ثابتان وجسمٌ متمرّر
// ══════════════════════════════════════════════════════
function Sheet({ title, subtitle, subtitleWarn, onClose, children, footer, progress }: {
  title: string; subtitle?: string; subtitleWarn?: boolean; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; progress?: { at: number; of: number };
}) {
  const kb = useKeyboardInset();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    // 🔴 `fixed` لا `absolute` — انظر ترويسة الملفّ
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.78)', paddingBottom: kb }}
      onClick={onClose} dir="rtl">
      <motion.div
        role="dialog" aria-modal="true" aria-label={title}
        initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="w-full max-w-lg max-h-[92%] flex flex-col rounded-t-3xl border-t border-white/12"
        style={{ background: '#0b0b0b' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 pt-3 pb-3 border-b border-white/7">
          <div className="w-11 h-1.5 rounded-full bg-white/20 mx-auto mb-3" />
          <div className="flex items-start gap-2.5">
            <div className="flex-1 min-w-0">
              <h3 className="text-white text-[18px] font-extrabold leading-snug">{title}</h3>
              {subtitle && (
                <p className="text-[13.5px] mt-0.5 tabular-nums" style={{ color: subtitleWarn ? AMBER.fg : INK.low }}>{subtitle}</p>
              )}
            </div>
            <IconBtn label="إغلاق" onClick={onClose}><IcoX size={15} /></IconBtn>
          </div>
          {progress && (
            <div className="flex gap-1 mt-3">
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

/** بلاطات اختيارٍ كبيرة — هدف لمسٍ ≥ ٥٢ بكسل، والاسم يلتفّ ولا يُقصّ */
function Tiles({ values, selected, onPick, cols = 2 }: {
  values: { key: string; name: string; sub?: string; priceDelta?: number }[]; selected: string[]; onPick: (k: string) => void; cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {values.map(v => {
        const on = selected.includes(v.key);
        return (
          <button key={v.key} onClick={() => onPick(v.key)} aria-pressed={on}
            className="rounded-xl px-2.5 py-2.5 min-h-[52px] text-[14.5px] font-bold text-center leading-snug"
            style={on
              ? { background: GOLD.bg, border: `1px solid ${GOLD.bd}`, color: '#f3dea3' }
              : { background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.1)', color: INK.hi }}>
            {v.name}
            {(v.sub || (v.priceDelta ?? 0) > 0) && (
              <span className="block text-[12.5px] font-medium mt-0.5 tabular-nums" style={{ color: on ? '#d7bf86' : INK.low }}>
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
/** مرشّحون كثر (٣٦ مشروباً في عرض Best View) يُجمَعون بأقسامهم من المنيو نفسه */
const GROUP_CANDIDATES_FROM = 9;

function BundleWizard({ item, sectionOfId, onCancel, onConfirm }: {
  item: Item; sectionOfId: (id: number) => string; onCancel: () => void; onConfirm: (line: CartLine) => void;
}) {
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
    const tile = (f: typeof st.s.from[number]) => ({ key: String(f.menuItemId), name: f.name, sub: f.optionGroups.length ? subOf({ description: '', optionGroups: f.optionGroups }) : undefined });
    const groups = new Map<string, typeof st.s.from>();
    for (const f of st.s.from) {
      const g = sectionOfId(f.menuItemId);
      groups.set(g, [...(groups.get(g) ?? []), f]);
    }
    const pick = (k: string) => setChoice(st.s, Number(k));
    body = (
      <>
        {st.s.note && <p className="text-[13.5px] mb-2.5" style={{ color: INK.low }}>{st.s.note}</p>}
        {st.s.from.length >= GROUP_CANDIDATES_FROM && groups.size > 1 ? (
          <div className="flex flex-col gap-4">
            {Array.from(groups.entries()).map(([g, fs]) => (
              <div key={g}>
                <p className="text-[14px] font-bold mb-2" style={{ color: GOLD.fg }}>{g}</p>
                <Tiles values={fs.map(tile)} selected={cur ? [String(cur)] : []} onPick={pick} />
              </div>
            ))}
          </div>
        ) : (
          <Tiles values={st.s.from.map(tile)} selected={cur ? [String(cur)] : []} onPick={pick} />
        )}
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
      <div className="rounded-2xl p-3.5" style={{ background: GOLD.bg, border: `1px solid ${GOLD.bd}` }}>
        {slots.map(s => {
          const vals = groupsOf(s, picks).map(g => g.values.find(v => v.key === picks[s.i]?.options?.[g.key])?.name).filter(Boolean);
          const locked = s.kind === 'fixed' ? Object.values(s.lockedOptions) : [];
          return (
            <div key={s.i} className="flex items-center gap-2 py-2.5 border-b border-dashed border-white/10 last:border-0">
              <span style={{ color: '#d9b563' }}>✓</span>
              <b className="flex-1 text-[15px] text-white">{nameOf(s, picks)}{s.qty > 1 ? ` ×${s.qty}` : ''}</b>
              <small className="text-[13px]" style={{ color: '#d7bf86' }}>{[...locked, ...vals].join(' · ')}</small>
            </div>
          );
        })}
        {item.description && <p className="text-[13.5px] mt-2 leading-relaxed" style={{ color: INK.mid }}>{item.description}</p>}
        {extra > 0 && <p className="text-[13.5px] mt-2 tabular-nums" style={{ color: AMBER.fg }}>زيادة اختيارك المعلَنة: +{money(extra)} د.أ</p>}
      </div>
    );
  }

  return (
    <Sheet
      title={stepTitle}
      subtitle={`${item.name} · الخطوة ${i + 1} من ${steps.length} · ${money(unitPrice)} د.أ`}
      progress={{ at: i, of: steps.length }}
      onClose={onCancel}
      footer={
        <>
          {st.t === 'done' ? (
            <button onClick={() => onConfirm(build())} className="flex-1 min-h-[48px] rounded-xl text-[15.5px] font-extrabold tabular-nums" style={goldBtn}>
              أضف العرض · {money(unitPrice)} د.أ
            </button>
          ) : (
            <button disabled={!stepDone(st, picks)} onClick={() => setStep(k => k + 1)}
              className="flex-1 min-h-[48px] rounded-xl text-[15.5px] font-extrabold disabled:opacity-40" style={goldBtn}>
              {stepDone(st, picks) ? 'التالي' : 'اختر أوّلاً'}
            </button>
          )}
          {i > 0 && (
            <button onClick={() => setStep(k => Math.max(0, k - 1))}
              className="px-5 min-h-[48px] rounded-xl text-[15px] font-bold" style={ghost}>رجوع</button>
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
          <button onClick={onAdd} className="flex-1 min-h-[48px] rounded-xl text-[15.5px] font-extrabold tabular-nums" style={amberBtn}>
            أضف للسلّة · {money(parseFloat(item.price))} د.أ
          </button>
          <button onClick={onCancel} className="px-5 min-h-[48px] rounded-xl text-[15px] font-bold" style={ghost}>إغلاق</button>
        </>
      }>
      {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-40 object-cover rounded-2xl mb-3" />}
      <p className="text-[15px] leading-relaxed" style={{ color: INK.mid }}>{item.description}</p>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════
type Props = {
  embedded?: boolean;
  onClose?: () => void;
  /** يُستدعى إن تبيّن أن لا سياق طلبٍ ولا حجزَ قادماً — ليُخفي المستضيفُ الزرّ. */
  onEmptyContext?: () => void;
  /** 'browse' = استعراضٌ للقراءة بلا مصادقة (صفحة الألعاب) */
  mode?: 'order' | 'browse';
  locationId?: number;
  locationName?: string;
};

const OrderPanel = forwardRef<OrderPanelHandle, Props>(function OrderPanel({
  embedded = false, onClose, onEmptyContext, mode = 'order', locationId, locationName,
}, ref) {
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
  const [sheet, setSheetState] = useState<'cart' | 'orders' | 'leave' | null>(null);
  const [searchOn, setSearchOn] = useState(false);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [sentId, setSentId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ txt: string; err?: boolean } | null>(null);
  const [svc, setSvc] = useState<{ available: boolean; pending: { id: number; kind: string } | null }>({ available: false, pending: null });
  const [svcBusy, setSvcBusy] = useState(false);

  const submitKeyRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 🔴 إشعارٌ عابر فوق ورقةٍ مفتوحة كان يغطّي سطراً من السلّة — فتح أيّ ورقةٍ يُسكته
  const setSheet = (s: 'cart' | 'orders' | 'leave' | null) => {
    if (s) { setToast(null); if (toastTimer.current) clearTimeout(toastTimer.current); }
    if (s !== 'orders') setSentId(null);
    setSheetState(s);
  };

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
    if (packages.length) out.push({ key: '_pkg', short: 'العروض', parent: '', isPkg: true, items: packages });
    const idx = new Map<string, Section>();
    for (const it of items) {
      if (it.isBundle) continue;
      const c = it.category || '', s = it.subcategory || '';
      const key = `${c}|${s}`;
      let sec = idx.get(key);
      if (!sec) {
        sec = { key, short: s || c || 'المنيو', parent: s ? c : '', isPkg: false, items: [] };
        idx.set(key, sec); out.push(sec);
      }
      sec.items.push(it);
    }
    return out;
  }, [items]);
  const activeKey = sections.some(s => s.key === cat) ? cat : (sections[0]?.key ?? '');
  const active = sections.find(s => s.key === activeKey);
  const sectionOfId = useCallback((id: number) => {
    const it = items.find(x => x.id === id);
    return it ? (it.subcategory || it.category || 'المنيو') : 'المنيو';
  }, [items]);

  const query = norm(search.trim());
  const results = useMemo(() => !query ? [] : items.filter(i => {
    const has = (s?: string) => norm(s || '').includes(query);
    return has(i.name) || has(i.description) || has(i.subcategory) || has(i.category)
      || (i.optionGroups ?? []).some(g => g.values.some(v => has(v.name)));
  }), [items, query]);

  // القسم المختار يبقى مرئيّاً في الرفّ — حسابٌ يدويّ لا scrollIntoView كي لا تتحرّك الصفحة
  useEffect(() => {
    const rail = railRef.current;
    const on = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !on) return;
    const t = on.offsetTop, b = t + on.offsetHeight;
    if (t < rail.scrollTop + 8) rail.scrollTop = t - 8;
    else if (b > rail.scrollTop + rail.clientHeight - 8) rail.scrollTop = b - rail.clientHeight + 8;
  }, [activeKey]);

  // البلاطة التي اتّسعت تُمرَّر إلى العين داخل اللوحة — كان زرّ «أضف» يسقط تحت الحافّة
  useEffect(() => {
    if (expanded == null) return;
    const main = mainRef.current;
    const el = main?.querySelector<HTMLElement>(`[data-tile="${expanded}"]`);
    if (!main || !el) return;
    const m = main.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.bottom > m.bottom - 8) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      main.scrollBy({ top: Math.min(r.bottom - m.bottom + 12, r.top - m.top - 8), behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [expanded]);

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

  // 🛑 الإغلاق والسلّة غير فارغة يسأل أوّلاً — المستضيف يستدعي requestClose بدل الإغلاق
  const cartCountRef = useRef(0);
  cartCountRef.current = cartCount;
  const requestClose = useCallback(() => {
    if (cartCountRef.current > 0) setSheet('leave'); else onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);
  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

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
        // ✅ تأكيد الوصول لافتةٌ داخل «طلباتي» لا إشعارٌ عابر يُخفيه ما فوقه
        setSentId(d.order?.id ?? d.orderId ?? 0);
        loadOrders(ctx.activityId);
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
    <div className="shrink-0 px-3.5 py-2.5 flex items-center gap-2 border-b border-white/7" style={{ background: '#0b0b0b' }}>
      <div className="flex-1 min-w-0">
        <h1 className="text-white text-[17px] font-extrabold leading-snug truncate">{venue || 'المنيو'}</h1>
        <p className="text-[13px] truncate" style={{ color: INK.low }}>
          {browse ? 'للاطّلاع — يفتح الطلب قبل الموعد بساعة ويحتاج حجزاً'
            : ro && next ? `للقراءة — يفتح الطلب الساعة ${next.opensAt}`
            : ctx?.source === 'live' ? 'أنت داخل اللعبة — الطلب يصل طاولتك' : 'حجزك مؤكّد — الطلب متاح'}
        </p>
      </div>
      {items.length > 0 && (
        <IconBtn label="بحث" active={searchOn}
          onClick={() => { setSearchOn(v => !v); setSearch(''); setExpanded(null); setTimeout(() => searchRef.current?.focus(), 50); }}>
          <IcoSearch size={18} />
        </IconBtn>
      )}
      {!ro && ctx && (
        <IconBtn label="طلباتي" onClick={() => setSheet('orders')} badge={openBadge}><IcoReceipt size={18} /></IconBtn>
      )}
      {embedded && <IconBtn label="إغلاق" onClick={requestClose}><IcoX size={15} /></IconBtn>}
    </div>
  );

  const OptionsPanel = (it: Item) => {
    const groups = it.optionGroups ?? [];
    const missing = groups.filter(g => g.isRequired && (sel[g.key]?.length ?? 0) === 0);
    let delta = 0;
    for (const g of groups) for (const vk of (sel[g.key] ?? [])) delta += g.values.find(x => x.key === vk)?.priceDelta ?? 0;
    return (
      <div className="mt-2 flex flex-col gap-3">
        {groups.map(g => {
          const cur = sel[g.key] ?? [];
          return (
            <div key={g.key}>
              <p className="text-[14.5px] font-bold mb-2 flex items-baseline gap-2" style={{ color: GOLD.fg }}>
                {g.name}
                {!g.isRequired && <span className="text-[13px] font-medium" style={{ color: INK.low }}>اختياريّ</span>}
                {g.selectionType === 'multi' && <span className="text-[13px] font-medium" style={{ color: INK.low }}>حتى {g.maxSelect}</span>}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {g.values.map(v => {
                  const on = cur.includes(v.key);
                  return (
                    <button key={v.key} onClick={() => pick(g, v.key)} aria-pressed={on}
                      className="px-2 py-1.5 rounded-xl text-[14.5px] font-bold min-h-[46px] flex flex-col items-center justify-center leading-snug"
                      style={on ? { background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.11)', color: INK.hi }}>
                      {v.name}
                      {v.priceDelta > 0 && <span className="text-[12.5px] font-medium tabular-nums" style={{ color: on ? AMBER.fg : INK.low }}>+{money(v.priceDelta)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
          <button onClick={() => { setExpanded(null); setSel({}); }} className="px-4 min-h-[46px] rounded-xl text-[15px] font-bold" style={ghost}>إلغاء</button>
          <button disabled={missing.length > 0} onClick={() => addWithOptions(it)}
            className="flex-1 min-h-[46px] rounded-xl text-[15.5px] font-extrabold tabular-nums disabled:opacity-45" style={amberBtn}>
            {missing.length > 0 ? `اختر ${missing[0].name}` : `أضف · ${money(parseFloat(it.price) + delta)} د.أ`}
          </button>
        </div>
      </div>
    );
  };

  const Tile = (it: Item) => {
    const n = qtyOfItem(it.id);
    const open = expanded === it.id;
    const longDesc = !hasOpts(it) && (it.description || '').length > LONG_DESC;
    const sub = subOf(it);
    const cnt = n > 0 && <i className="not-italic min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-black text-black flex items-center justify-center tabular-nums" style={{ background: '#fbbf24' }}>{n}</i>;
    const outline = { background: 'transparent', border: `1px solid ${AMBER.bd}`, color: AMBER.fg };
    let action: React.ReactNode = null;
    if (!ro) {
      if (hasOpts(it)) action = (
        <button onClick={() => expand(it)} aria-expanded={false} className="w-full min-h-[44px] rounded-xl text-[15px] font-bold flex items-center justify-center gap-1.5" style={outline}>اختر{cnt}</button>
      );
      else if (longDesc) action = (
        <button onClick={() => setViewing(it)} className="w-full min-h-[44px] rounded-xl text-[15px] font-bold flex items-center justify-center gap-1.5" style={outline}>التفاصيل{cnt}</button>
      );
      else if (n > 0) action = <Stepper spread qty={n} name={it.name} onInc={() => changeQty(`${it.id}#`, 1)} onDec={() => changeQty(`${it.id}#`, -1)} />;
      else action = (
        <button onClick={() => addSimple(it)} aria-label={`أضف ${it.name}`} className="w-full min-h-[44px] rounded-xl text-[15px] font-bold flex items-center justify-center gap-1.5"
          style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}><span className="text-[19px] leading-none">+</span>أضف</button>
      );
    }
    return (
      <div key={it.id} data-tile={it.id} className={`rounded-2xl p-3 flex flex-col gap-1 min-w-0 ${open ? 'col-span-2' : ''}`}
        style={{ background: n > 0 ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0.03)', border: `1px solid ${n > 0 || open ? AMBER.bd : 'rgba(255,255,255,0.085)'}` }}>
        {it.imageUrl && <img src={it.imageUrl} alt="" className="w-full h-24 object-cover rounded-xl mb-1" />}
        <p className={`text-[15px] font-bold leading-snug ${open ? '' : 'line-clamp-2'}`} style={{ color: n > 0 ? AMBER.fg : INK.hi }}>{it.name}</p>
        {sub && <p className={`text-[12.5px] leading-normal ${open ? '' : 'line-clamp-2'}`} style={{ color: INK.low }}>{sub}</p>}
        <p className="mt-auto pt-1"><Price v={parseFloat(it.price)} /></p>
        {open ? OptionsPanel(it) : action && <div className="mt-1.5">{action}</div>}
      </div>
    );
  };

  const PkgCard = (p: Item) => {
    const n = qtyOfItem(p.id);
    return (
      <div key={p.id} className="rounded-2xl p-3.5 mb-2.5 flex flex-col gap-2.5" style={{ background: 'linear-gradient(160deg, rgba(197,160,89,0.14), rgba(197,160,89,0.02) 70%)', border: `1px solid ${GOLD.bd}` }}>
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-white text-[16px] font-extrabold leading-snug flex-1 min-w-0">{p.name}</h3>
          <span className="text-[17px] font-extrabold tabular-nums shrink-0" style={{ color: GOLD.fg }}>{money(parseFloat(p.price))} <span className="text-[12.5px] font-medium">د.أ</span></span>
        </div>
        {p.description && <p className="text-[13.5px] leading-relaxed" style={{ color: INK.mid }}>{p.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {(p.slots ?? []).map(s => (
            <span key={s.i} className="text-[13px] px-2.5 py-1 rounded-lg"
              style={s.kind === 'choice'
                ? { background: 'transparent', border: `1px dashed ${GOLD.bd}`, color: GOLD.fg }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: INK.mid }}>
              {s.kind === 'choice' ? `${s.label}: ${s.from.length} خيارات`
                : `${s.name}${s.qty > 1 ? ` ×${s.qty}` : ''}${Object.values(s.lockedOptions)[0] ? ` ${Object.values(s.lockedOptions)[0]}` : s.optionGroups.length ? ' · بنكهتك' : ''}`}
            </span>
          ))}
        </div>
        {!ro && (
          <button onClick={() => setWizard(p)} className="w-full min-h-[46px] rounded-xl text-[15.5px] font-extrabold" style={goldBtn}>
            {n > 0 ? `في السلّة ×${n} — ركّب توليفةً أخرى` : 'ركّب العرض'}
          </button>
        )}
      </div>
    );
  };

  const SectionHead = (s: Section) => (
    <h2 className="flex items-baseline gap-2 pt-1 pb-2.5">
      <b className="text-[16px] font-extrabold" style={{ color: GOLD.fg }}>{s.short}</b>
      {s.parent && <span className="text-[13px]" style={{ color: INK.low }}>{s.parent}</span>}
    </h2>
  );

  const NoCtx = (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10" dir="rtl">
      <span className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: GOLD.bg, border: `1px solid ${GOLD.bd}`, color: GOLD.fg }}><IcoPlate size={24} /></span>
      <b className="text-white text-[17px]">{next ? `يفتح الطلب الساعة ${next.opensAt}` : 'لا يوجد نشاط متاح للطلب الآن'}</b>
      <p className="text-[14.5px] mt-2 leading-relaxed" style={{ color: INK.mid }}>{reason || 'الطلب متاح للحاجزين داخل نافذة الفعاليّة'}</p>
      {next && (
        <button onClick={browseNext} className="mt-4 px-5 min-h-[46px] rounded-xl text-[15px] font-bold" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: INK.hi }}>
          تصفّح منيو {next.locationName} للقراءة
        </button>
      )}
      {embedded && <button onClick={onClose} className="mt-2 min-h-[44px] px-4 text-[15px] underline" style={{ color: GOLD.fg }}>إغلاق</button>}
    </div>
  );

  const noCtx = !browse && !ctx && !readOnly;

  return (
    <MotionConfig reducedMotion="user">
    <div ref={rootRef} className={`fnb-root ${embedded ? 'h-full' : 'fnb-page-h max-w-lg mx-auto'} flex flex-col relative overscroll-none`} dir="rtl" style={{ background: '#050505', overscrollBehavior: 'none' }}>
      {Header}

      {noCtx ? NoCtx : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-[15px]" style={{ color: INK.low }}>المكان لم يضف أصنافاً بعد</p></div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* ══ الرفّ — أسماء الأقسام وحدها، ٤٤ بكسل لكلّ قسم ══ */}
          {!searchOn && (
            <nav ref={railRef} aria-label="أقسام المنيو"
              className="w-[86px] shrink-0 overflow-y-auto overscroll-none border-l border-white/7 px-1.5 py-2 flex flex-col gap-0.5 relative"
              style={{ background: '#080808', scrollbarWidth: 'none' }}>
              {sections.map(s => {
                const on = s.key === activeKey;
                return (
                  <button key={s.key} aria-current={on ? 'true' : undefined}
                    onClick={() => { setCat(s.key); setExpanded(null); mainRef.current?.scrollTo({ top: 0 }); }}
                    className="min-h-[44px] rounded-xl px-1 py-1.5 text-[13.5px] font-bold leading-tight text-center"
                    style={on
                      ? { background: s.isPkg ? GOLD.bg : AMBER.bg, border: `1px solid ${s.isPkg ? GOLD.bd : AMBER.bd}`, color: s.isPkg ? GOLD.fg : AMBER.fg }
                      : { border: '1px solid transparent', color: s.isPkg ? GOLD.fg : INK.low }}>
                    {s.short}
                  </button>
                );
              })}
            </nav>
          )}

          {/* ══ البلاطات ══ */}
          <div ref={mainRef} className="flex-1 min-w-0 overflow-y-auto overscroll-none px-2.5 py-2.5 pb-6 relative">
            {searchOn && (
              <div className="relative mb-3">
                {/* 🔴 ١٦ بكسل — أصغر منها يُقرّب سفاري الشاشة عند التركيز */}
                <input ref={searchRef} value={search} onChange={e => { setSearch(e.target.value); setExpanded(null); }} placeholder="ابحث: كراميل، اسبريسو، نخلة…"
                  enterKeyHint="search" autoComplete="off" type="search" aria-label="ابحث في المنيو"
                  className="w-full h-[46px] rounded-xl pr-3.5 pl-11 text-white focus:outline-none focus:border-amber-400/60"
                  style={{ fontSize: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }} />
                {search && (
                  <button onClick={() => setSearch('')} aria-label="امسح البحث"
                    className="absolute left-0.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center" style={{ color: INK.mid }}><IcoX size={13} /></button>
                )}
              </div>
            )}
            {err && sheet !== 'cart' && <p className="text-rose-300 text-[13.5px] bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2 mb-2">{err}</p>}

            {searchOn ? (
              !query ? (
                <p className="text-center text-[14px] py-10" style={{ color: INK.low }}>جرّب اسم نكهةٍ: «نخلة» يعيد الأرجيلة الفاخرة وعروضها</p>
              ) : results.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[15px]" style={{ color: INK.low }}>لا صنف يطابق «{search.trim()}»</p>
                  <button onClick={() => setSearch('')} className="text-[14.5px] underline mt-2 min-h-[44px] px-3" style={{ color: GOLD.fg }}>امسح البحث</button>
                </div>
              ) : (
                <>
                  {results.filter(i => i.isBundle).map(PkgCard)}
                  <div className="grid grid-cols-2 gap-2 grid-flow-row-dense">{results.filter(i => !i.isBundle).map(Tile)}</div>
                </>
              )
            ) : active ? (
              active.isPkg ? (
                <>
                  {SectionHead(active)}
                  {active.items.map(PkgCard)}
                  <p className="text-[13px] text-center mt-1" style={{ color: INK.low }}>اختياراتك لا تغيّر السعر — إلّا ما عليه زيادةٌ معلَنة</p>
                </>
              ) : (
                <>
                  {SectionHead(active)}
                  {/* dense: البلاطة التي تتّسع على العمودين لا تترك خانةً فارغة خلفها */}
                  <div className="grid grid-cols-2 gap-2 grid-flow-row-dense">{active.items.map(Tile)}</div>
                </>
              )
            ) : null}
          </div>
        </div>
      )}

      {/* ══ شريط السلّة — كهرمانيٌّ يقول «لم تُرسَل بعد»، ثابتٌ بلا نبض ══ */}
      <AnimatePresence>
        {!ro && cartCount > 0 && (
          <motion.button
            initial={{ y: 70 }} exit={{ y: 70 }} animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={() => { setErr(''); setSheet('cart'); }}
            className="shrink-0 w-full px-3 py-2.5 flex items-center gap-2.5 border-t text-right"
            style={{ background: '#1a1305', borderColor: AMBER.bd }}
          >
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[17px] font-black shrink-0 tabular-nums" style={{ background: AMBER.bg, border: `1px solid ${AMBER.bd}`, color: AMBER.fg }}>{cartCount}</span>
            <span className="flex-1 min-w-0 flex flex-col">
              <b className="text-[15.5px] font-extrabold tabular-nums" style={{ color: AMBER.fg }}>سلّتك · {money(cartTotal)} د.أ</b>
              <span className="text-[12.5px]" style={{ color: 'rgba(252,211,77,0.72)' }}>لم تُرسَل بعد</span>
            </span>
            <span className="min-h-[44px] px-4 rounded-xl text-[15px] font-extrabold shrink-0 flex items-center" style={amberBtn}>راجع وأرسل</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══ إشعارٌ عابر ══ */}
      <div className="absolute left-4 right-4 z-[50] pointer-events-none" style={{ bottom: cartCount > 0 ? 80 : 20 }} role="status" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-xl px-3.5 py-3 text-[14px] tabular-nums"
              style={{ background: toast.err ? '#1c1210' : '#151006', border: `1px solid ${toast.err ? 'rgba(224,106,94,0.5)' : GOLD.bd}`, color: toast.err ? '#f7c9c4' : '#f3dea3', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              {toast.txt}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══ درج السلّة ══ */}
      {sheet === 'cart' && cart.length > 0 && (
        <Sheet title="سلّتك" subtitle={`لم تُرسَل بعد — ${cartCount} أصناف · ${money(cartTotal)} د.أ`} subtitleWarn
          onClose={() => setSheet(null)}
          footer={
            <>
              <button onClick={submit} disabled={sending} className="flex-1 min-h-[48px] rounded-xl text-[15.5px] font-extrabold tabular-nums disabled:opacity-50" style={amberBtn}>
                {sending ? 'جارٍ الإرسال…' : `إرسال الطلب · ${money(cartTotal)} د.أ`}
              </button>
              <button onClick={() => setSheet(null)} className="px-5 min-h-[48px] rounded-xl text-[15px] font-bold" style={ghost}>متابعة</button>
            </>
          }>
          {err && <p className="text-rose-300 text-[13.5px] bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2 mb-3">{err}</p>}
          {cart.map(l => (
            <div key={l.key} className="py-2.5 flex items-center gap-2.5 border-b border-white/7">
              <div className="flex-1 min-w-0">
                <p className="text-white text-[15px] font-semibold leading-snug">{l.isBundle ? 'عرض · ' : ''}{l.name}</p>
                {l.label && <p className="text-[13px] leading-relaxed" style={{ color: '#d7bf86' }}>{l.label}</p>}
                <p className="mt-0.5"><Price v={l.unitPrice * l.quantity} /></p>
              </div>
              <Stepper qty={l.quantity} name={l.name} onInc={() => changeQty(l.key, 1)} onDec={() => changeQty(l.key, -1)} />
              {/* الحذف بعيدٌ عن «−» بفاصلٍ واضح — كانا متلاصقين بحجم ٢٨ بكسل */}
              <button onClick={() => changeQty(l.key, -99)} aria-label={`احذف ${l.name}`} className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mr-1.5"
                style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.32)', color: '#fb7185' }}><IcoX size={13} /></button>
            </div>
          ))}
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} enterKeyHint="done" aria-label="ملاحظة للمكان"
            placeholder="ملاحظة للمكان (اختياريّ)"
            className="w-full mt-3 h-12 rounded-xl px-3.5 text-white focus:outline-none focus:border-amber-400/60"
            style={{ fontSize: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }} />
        </Sheet>
      )}

      {/* ══ قبل الإغلاق والسلّة ممتلئة ══ */}
      {sheet === 'leave' && (
        <Sheet title="سلّتك لم تُرسَل" subtitle={`${cartCount} أصناف · ${money(cartTotal)} د.أ`} subtitleWarn onClose={() => setSheet(null)}
          footer={
            <>
              <button onClick={() => setSheet('cart')} className="flex-1 min-h-[48px] rounded-xl text-[15.5px] font-extrabold" style={amberBtn}>راجع وأرسل</button>
              <button onClick={() => { setSheet(null); setCart([]); onClose?.(); }} className="px-4 min-h-[48px] rounded-xl text-[15px] font-bold"
                style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.32)', color: '#fb7185' }}>أغلق وامسحها</button>
            </>
          }>
          <p className="text-[15px] leading-relaxed" style={{ color: INK.mid }}>
            الأصناف في سلّتك لم تصل المكان بعد. إن أغلقت الآن تُمسح السلّة.
          </p>
        </Sheet>
      )}

      {/* ══ طلباتي + خدمة الأرجيلة ══ */}
      {sheet === 'orders' && (
        <Sheet title="طلباتي" subtitle={openBadge ? `${openBadge} قيد المتابعة` : 'كلّ ما طلبته في هذه الفعاليّة'} onClose={() => setSheet(null)}>
          {sentId !== null && (
            <div className="rounded-2xl px-3.5 py-3 mb-3" style={{ background: 'rgba(74,222,128,0.09)', border: '1px solid rgba(74,222,128,0.32)' }}>
              <b className="block text-[15.5px] tabular-nums" style={{ color: '#bfe9cf' }}>وصل طلبك للمكان{sentId ? ` · #${sentId}` : ''}</b>
              <p className="text-[13.5px] mt-0.5" style={{ color: INK.mid }}>يصلك إشعارٌ حين يبدأ تحضيره.</p>
            </div>
          )}
          {svc.available && (
            <div className="rounded-2xl p-3.5 mb-3" style={{ background: GOLD.bg, border: `1px solid ${GOLD.bd}` }}>
              <b className="block text-white text-[15.5px]">أرجيلتك وصلت — تحتاج شيئاً؟</b>
              <p className="text-[13.5px] mt-0.5 mb-2.5" style={{ color: INK.mid }}>طلبٌ بلا سعر يصل مسؤول الأراجيل مباشرةً ولا يدخل فاتورتك.</p>
              {svc.pending ? (
                <p className="text-[14px] text-center rounded-xl px-3 py-3" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#bfe9cf' }}>وصل طلبك — الموظّف في الطريق</p>
              ) : (
                <div className="flex gap-2">
                  {([['coal', 'أحتاج فحماً', IcoFire], ['fix', 'تزبيط الأرجيلة', IcoTool]] as const).map(([k, label, Ico]) => (
                    <button key={k} onClick={() => askService(k)} disabled={svcBusy}
                      className="flex-1 min-h-[48px] rounded-xl text-[14.5px] font-bold disabled:opacity-45 flex items-center justify-center gap-1.5"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: INK.hi }}>
                      <Ico size={16} />{label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {myOrders.length === 0 ? (
            <p className="text-center text-[15px] py-12" style={{ color: INK.low }}>لا طلبات بعد</p>
          ) : myOrders.map(o => {
            const meta = STATUS_META[o.status] || STATUS_META.new;
            return (
              <div key={o.id} className="rounded-2xl p-3.5 mb-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}33` }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                  <span className="flex-1 text-[14.5px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                  <Price v={parseFloat(o.total)} />
                </div>
                <p className="text-[14px] leading-relaxed" style={{ color: INK.mid }}>{o.items.map(i => `${i.name} ×${i.quantity}`).join(' • ')}</p>
                {o.items.filter(i => i.options?.length).map((i, ix) => (
                  <p key={`o${ix}`} className="text-[13px] leading-relaxed" style={{ color: '#d7bf86' }}>{i.name}: {i.options!.map(x => x.value).join(' · ')}</p>
                ))}
                {o.items.filter(i => i.components?.length).map((i, ix) => (
                  <p key={`c${ix}`} className="text-[13px] leading-relaxed" style={{ color: '#d7bf86' }}>
                    {i.name}: {i.components!.map(c => `${c.name}${c.options?.length ? ` (${c.options.map(x => x.value).join(' · ')})` : ''}`).join(' + ')}
                  </p>
                ))}
                {o.note && <p className="text-[13px] mt-1" style={{ color: INK.low }}>ملاحظة: {o.note}</p>}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[12.5px] tabular-nums" style={{ color: INK.low }}>#{o.id} · {timeOf(o.createdAt)}</span>
                  {o.status === 'new' && <button onClick={() => cancelOrder(o.id)} className="min-h-[44px] px-2 text-[14px] underline" style={{ color: '#fb7185' }}>إلغاء الطلب</button>}
                </div>
              </div>
            );
          })}
        </Sheet>
      )}

      {/* ══ المُركِّب وورقة التفصيل ══ */}
      {wizard && (
        <BundleWizard item={wizard} sectionOfId={sectionOfId} onCancel={() => setWizard(null)}
          onConfirm={line => { bumpLine(line); setWizard(null); flash(`أُضيف العرض · ${line.label}`); }} />
      )}
      {viewing && (
        <DetailSheet item={viewing} onCancel={() => setViewing(null)} onAdd={() => { addSimple(viewing); setViewing(null); }} />
      )}
    </div>
    </MotionConfig>
  );
});

export default OrderPanel;
