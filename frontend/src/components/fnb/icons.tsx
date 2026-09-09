// ══════════════════════════════════════════════════════
// 🍽️ أيقونات المنيو — خطوطٌ لا رموزٌ تعبيريّة، فتتلوّن بلون سياقها
// (الرفّ، الزرّ العائم، بطاقة الرئيسيّة) ولا تتبدّل بين الأجهزة.
// ══════════════════════════════════════════════════════

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18, rest: P = {}) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...rest,
});

export const IcoPkg = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s4 1 6 1zm0 0c2-4 6-4 6-1s-4 1-6 1z" /></svg>
);
export const IcoShisha = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M12 3v4M9 7h6M10 7c-1 3-3 4-3 8a5 5 0 0 0 10 0c0-4-2-5-3-8M7 21h10" /></svg>
);
export const IcoHot = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M4 10h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 12h2a2 2 0 0 1 0 4h-2M8 3c0 2-1 2-1 4M12 3c0 2-1 2-1 4" /></svg>
);
export const IcoCold = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M6 4h12l-1.5 16h-9zM7 9h10M14 2l-3 7" /></svg>
);
export const IcoJuice = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M7 4h10l-1 16H8zM7.5 11h9M15 3l3-1" /></svg>
);
export const IcoCan = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><rect x="7" y="4" width="10" height="17" rx="3" /><path d="M9 4V3h6v1M9 9h6" /></svg>
);
export const IcoSnack = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M6 9l1.5 12h9L18 9zM6 9c0-3 2-5 3-5s1 2 3 2 2-2 3-2 3 2 3 5" /></svg>
);
export const IcoPlate = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></svg>
);
export const IcoSearch = ({ size, ...r }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...r })}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);
export const IcoReceipt = ({ size, ...r }: P) => (
  <svg {...base(size, { strokeWidth: 2, ...r })}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /></svg>
);
export const IcoX = ({ size, ...r }: P) => (
  <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IcoFire = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 1-9z" /></svg>
);
export const IcoTool = ({ size, ...r }: P) => (
  <svg {...base(size, r)}><path d="M14 4l6 6-9 9H5v-6zM12 6l6 6" /></svg>
);

/** أيقونة قسمٍ من اسمه — المنيو يُكتب بحرّيّة في داشبورد المكان، فالتخمين بالكلمات */
export function sectionIcon(title: string, isPkg?: boolean) {
  if (isPkg) return IcoPkg;
  const t = title || '';
  if (/رجيل|شيش|أراجيل/.test(t)) return IcoShisha;
  if (/بارد|آيس|ايس|مثلّج|مثلج/.test(t)) return IcoCold;
  if (/عصير|عصائر|شيك|مخفوق|سموذي/.test(t)) return IcoJuice;
  if (/معلّب|معلب|طاقة|غازيّ|غازي|مشروبات غاز/.test(t)) return IcoCan;
  if (/سناك|بوظة|حلو|مكسّرات|مكسرات|بزر|فشار/.test(t)) return IcoSnack;
  if (/ساخن|قهوة|شاي|كوفي|مشروب/.test(t)) return IcoHot;
  return IcoPlate;
}
