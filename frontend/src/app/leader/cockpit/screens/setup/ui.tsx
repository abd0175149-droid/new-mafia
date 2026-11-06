'use client';
// ══════════════════════════════════════════════════════
// 🧩 لبناتٌ صغيرة لشاشات التجهيز (اللوبي · التركيبة · الربط)
// ما ليس في العُدّة: حبّةٌ قابلة للمس بارتفاع 44px، حقلُ إدخال، وصندوقُ خطأٍ داخل اللوح.
// (حبّةُ العُدّة القابلة للمس 36px — تكفي للإعدادات، لا لأزرار الأدوار التي تُلمس كثيراً.)
// ══════════════════════════════════════════════════════
import type { ReactNode } from 'react';

export type ChipTone = 'g' | 'm' | 'c' | 'n' | 'ok' | 'red';

/** حبّةٌ قابلة للمس — هدفٌ ≥44px */
export function TapChip({ children, tone, on, onClick, disabled, ariaLabel }: {
  children: ReactNode; tone?: ChipTone; on?: boolean; onClick: () => void; disabled?: boolean; ariaLabel?: string;
}) {
  const t = on ? 'bg-[#C5A059] text-[#110d08] border-[#C5A059] font-bold'
    : tone === 'g' ? 'bg-[#16130f] border-[#C5A059]/60 text-[#C5A059]'
    : tone === 'm' ? 'bg-[#16130f] border-[#d0474c]/60 text-[#f2a6a9]'
    : tone === 'c' ? 'bg-[#16130f] border-[#63afd9]/50 text-[#a9d4ee]'
    : tone === 'n' ? 'bg-[#16130f] border-[#d9a23a]/60 text-[#f0c879]'
    : tone === 'ok' ? 'bg-[#43b27f]/10 border-[#43b27f]/60 text-[#99dcba]'
    : tone === 'red' ? 'bg-[#d0474c]/10 border-[#d0474c]/70 text-[#ffc2c4]'
    : 'bg-[#16130f] border-[#2a241c] text-[#ddd5c6]';
  return (
    <button type="button" aria-label={ariaLabel} aria-pressed={on} disabled={disabled} onClick={onClick}
      className={`min-h-[44px] max-w-full rounded-full border px-3 py-1.5 text-[13.5px] leading-snug text-right disabled:opacity-40 ${t}`}>
      {children}
    </button>
  );
}

export const inputCls =
  'w-full min-h-[50px] rounded-[13px] border border-[#2a241c] bg-[#16130f] px-3 text-[16px] text-[#efe8da] placeholder-[#5d5447] outline-none focus:border-[#C5A059]';

/** خطأٌ داخل اللوح السفليّ — اللوح يغطّي شريط التنبيه، فالخطأ يُعرض هنا بجانب الفعل */
export function SheetError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="m-0 rounded-[12px] border border-[#d0474c]/60 bg-[#2a0c0e] px-3 py-2 text-[13.5px] text-[#ffc2c4]">{children}</p>;
}

export function SheetNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="status" className="m-0 rounded-[12px] border border-[#dba640]/50 bg-[#dba640]/10 px-3 py-2 text-[13px] leading-relaxed text-[#f0d79a]">{children}</p>;
}

export const errMsg = (e: any, fallback = 'تعذّر تنفيذ الطلب') => e?.response?.error || e?.message || fallback;
