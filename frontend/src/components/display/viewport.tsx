'use client';
// ══════════════════════════════════════════════════════
// 📐 منطقة العرض الصالحة + الشبكة المحسوبة للكروت — شاشة القاعة
// ══════════════════════════════════════════════════════
// قرار المالك 2026-09-12: لا تحسب مرحلةٌ على حجم النافذة بعد اليوم. المنطقة
// الصالحة = النافذة − هوامش الجذر − الناف بار − ما تحجزه الأشرطة الثابتة
// (شريط ترتيب النقاش يميناً، شريط النبض أسفلاً). كلّ مرحلة تقرأها من هنا،
// وتوزّع كروتها بشبكةٍ محسوبة تملأها كاملةً بلا فراغٍ جانبيّ ولا كرتٍ وحيد.
//
// الكرت المرجعيّ هو `lg` (256×352) ويُصغَّر/يُكبَّر بـCSS `zoom` (لا transform —
// انظر FitToScreen) فتتناسب خطوطه وشعاراته ومظاهره مع الحجم المحسوب.
// ══════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export const CARD_W = 256;
export const CARD_H = 352;
const ROOT_PAD_X = 64;   // px-8 على الجذر
const ROOT_PAD_Y = 48;   // py-6 على الجذر
const NAV_H = 56;        // الناف بار + الفاصل (h-14)

type Side = 'top' | 'right' | 'bottom' | 'left';
interface Viewport { w: number; h: number; availW: number; availH: number; top: number; right: number; bottom: number; left: number }
interface Ctx extends Viewport { setReserve: (key: string, side: Side, px: number | null) => void }

const DisplayViewportCtx = createContext<Ctx>({ w: 1920, h: 1080, availW: 1856, availH: 1032, top: 0, right: 0, bottom: 0, left: 0, setReserve: () => {} });

export function DisplayViewportProvider({ navVisible, children }: { navVisible: boolean; children: ReactNode }) {
  const [size, setSize] = useState({ w: typeof window === 'undefined' ? 1920 : window.innerWidth, h: typeof window === 'undefined' ? 1080 : window.innerHeight });
  const [reserves, setReserves] = useState<Record<string, { side: Side; px: number }>>({});

  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const value = useMemo<Ctx>(() => {
    const r = { top: navVisible ? NAV_H : 0, right: 0, bottom: 0, left: 0 };
    for (const v of Object.values(reserves)) r[v.side] += v.px;
    return {
      w: size.w, h: size.h, ...r,
      availW: Math.max(320, size.w - ROOT_PAD_X - r.left - r.right),
      availH: Math.max(240, size.h - ROOT_PAD_Y - r.top - r.bottom),
      setReserve: (key, side, px) => setReserves(prev => {
        if (px == null) { if (!(key in prev)) return prev; const { [key]: _, ...rest } = prev; return rest; }
        if (prev[key]?.side === side && prev[key]?.px === px) return prev;
        return { ...prev, [key]: { side, px } };
      }),
    };
  }, [size, reserves, navVisible]);

  return <DisplayViewportCtx.Provider value={value}>{children}</DisplayViewportCtx.Provider>;
}

export function useDisplayViewport(): Viewport { return useContext(DisplayViewportCtx); }

/** شريطٌ ثابت يحجز جانباً من المنطقة الصالحة ما دام مركّباً. */
export function useReserve(key: string, side: Side, px: number | null) {
  const { setReserve } = useContext(DisplayViewportCtx);
  useEffect(() => { setReserve(key, side, px); return () => setReserve(key, side, null); }, [key, side, px, setReserve]);
}

export interface CardGrid { cols: number; rows: number; k: number; cardW: number; cardH: number; rowCounts: number[]; gap: number }

/** توزيع n على rows صفوف بالتساوي — الصفوف الأولى تأخذ الزيادة (لا كرت وحيد في الأخير). */
export function balancedRows(n: number, rows: number): number[] {
  if (n <= 0 || rows <= 0) return [];
  const base = Math.floor(n / rows), extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0)).filter(c => c > 0);
}

/**
 * أكبر حجمٍ للكرت يجعل n كرتاً يملأ (availW × availH) بفجوةٍ ثابتة.
 * extraH: ارتفاعٌ إضافيّ تحت كلّ كرت (اسم، شريط أصوات…) يُحسب بوحدات الكرت المرجعيّ.
 */
export function computeCardGrid(n: number, availW: number, availH: number, opts: { gap?: number; extraH?: number; maxK?: number; minK?: number } = {}): CardGrid {
  const gap = opts.gap ?? 20, extraH = opts.extraH ?? 0, maxK = opts.maxK ?? 2, minK = opts.minK ?? 0.3;
  if (n <= 0) return { cols: 0, rows: 0, k: 1, cardW: CARD_W, cardH: CARD_H, rowCounts: [], gap };
  const itemH = CARD_H + extraH;
  let best: CardGrid | null = null;
  for (let cols = 1; cols <= Math.min(n, 14); cols++) {
    const rows = Math.ceil(n / cols);
    const kW = (availW - gap * (cols - 1)) / (cols * CARD_W);
    const kH = (availH - gap * (rows - 1)) / (rows * itemH);
    const k = Math.min(kW, kH, maxK);
    // عند تساوي الحجم (سقف maxK مثلاً) نفضّل الصفوف الأقلّ: صفٌّ عريض لا عمودٌ طويل
    if (!best || k > best.k + 1e-6 || (Math.abs(k - best.k) <= 1e-6 && rows < best.rows)) best = { cols, rows, k, cardW: CARD_W * k, cardH: CARD_H * k, rowCounts: balancedRows(n, rows), gap };
  }
  const g = best!;
  g.k = Math.max(minK, g.k);
  g.cardW = CARD_W * g.k; g.cardH = CARD_H * g.k;
  return g;
}

/** حاويةٌ تُصغّر/تُكبّر كرتاً مرجعيّاً (lg) بـzoom. تُعلن نسبتها لمن يقيس بالبكسل الحقيقيّ. */
export function CardZoom({ k, children, className = '', style }: { k: number; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div data-fit-zoom={k} className={className} style={{ zoom: k, ...(style || {}) } as any}>{children}</div>;
}

/** حاصل ضرب كلّ نسب zoom فوق العنصر — لتحويل بكسل الشاشة إلى بكسل التخطيط. */
export function totalZoomOf(el: Element | null): number {
  let z = 1, cur: Element | null = el;
  while (cur) {
    const v = (cur as HTMLElement).dataset?.fitZoom;
    if (v) z *= Number(v) || 1;
    cur = cur.parentElement;
  }
  return z || 1;
}

/** صفوفٌ متوازنة من العناصر بحجمٍ محسوب — الأداة العامّة لكلّ شبكات الكروت. */
export function GridRows<T>({ items, grid, render, rowClass = '' }: { items: T[]; grid: CardGrid; render: (item: T, i: number) => ReactNode; rowClass?: string }) {
  let idx = 0;
  return (
    <div className="flex flex-col items-center" style={{ gap: grid.gap }}>
      {grid.rowCounts.map((count, r) => {
        const slice = items.slice(idx, idx + count); const start = idx; idx += count;
        return (
          <div key={r} className={`flex justify-center items-start ${rowClass}`} style={{ gap: grid.gap }}>
            {slice.map((it, j) => render(it, start + j))}
          </div>
        );
      })}
    </div>
  );
}
