'use client';

// ══════════════════════════════════════════════════════
// 📱 الجزءُ الظاهر من الشاشة — لما يُثبَّت أعلاها وأسفلها
//
// 🔴 آيفون (خصوصاً التطبيق المثبَّت على الشاشة الرئيسيّة): بعد أن تُغلق لوحةُ المفاتيح
//    قد يبقى «المنظورُ المرئيّ» مُزاحاً عن منظور التخطيط، فيقف ما هو `fixed; bottom:0`
//    في منتصف الشاشة والقائمةُ تُرسم تحته، ويختفي أعلى الصفحة. حادثةُ «متابعة
//    الحجوزات» (2026-10-08): «＋ حجز سريع» على ارتفاع ~١٧٠ نقطة فوق الحافّة.
//    visualViewport يقول أين الجزءُ الظاهر فعلاً — فنُزيح المثبَّتات إليه.
//
//    shiftTop:    كم نزل أعلى الظاهر عن أعلى منظور التخطيط (يُضاف لما يُثبَّت أعلى)
//    shiftBottom: كم نزل أسفل الظاهر عن أسفل منظور التخطيط (موجبٌ ⟵ أنزِل المثبَّت أسفل)
//    keyboard:    لوحةُ المفاتيح مفتوحة — الأشرطةُ السفليّة تُخفى بدل أن تطفو فوقها
//
// ويُضاف «تنبيهٌ» عند إغلاق اللوحة: تمريرٌ بنقطةٍ ذهاباً وإياباً يجبر iOS على إعادة
// حساب المنظور (الحلّ المعروف للانزياح العالق) — بلا أثرٍ مرئيّ في غيره.
//
// 🔴 iOS 26 (2026-11-22، الشريط عاد يطفو ~٣٧٥ نقطة — ارتفاعُ اللوحة): في التطبيق المثبَّت
//    يبقى منظورُ التخطيط كلُّه منكمشاً بعد أن تُغلق اللوحة — innerHeight وvisualViewport
//    معاً — فلا فرقَ بينهما يُقاس، والتنبيهُ لا يُصلحه. على الهاتف المثبَّت لا شيءَ غير
//    اللوحة يُقصِّر الشاشة، فنحفظ أطولَ ارتفاعٍ رأيناه لهذا العرض («الشاشةُ كاملة») ونُنزل
//    المثبَّتَ أسفل إليه. (WebKit 297779 · منتدى آبل 800125)
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

export interface VisibleViewport { shiftTop: number; shiftBottom: number; keyboard: boolean }

const ZERO: VisibleViewport = { shiftTop: 0, shiftBottom: 0, keyboard: false };
const isEditable = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);

/** هاتفٌ والتطبيقُ مثبَّتٌ على الشاشة الرئيسيّة — لا شريطَ متصفّحٍ يُغيّر الارتفاع، ولا نوافذَ تُصغَّر */
const standalonePhone = () => {
  try {
    const sa = (navigator as Navigator & { standalone?: boolean }).standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
    return sa && Math.min(screen.width, screen.height) < 600;
  } catch { return false; }
};

// 📏 «الشاشةُ كاملة»: أطولُ innerHeight رأيناه لهذا العرض بلا كتابة — يبقى بين الصفحات
//    (مستوى الوحدة)، ويُصفَّر بالدوران. لا يتجاوز الشاشةَ نفسها (لحظاتُ الدوران تكذب).
let fullW = 0, fullH = 0;
function noteFull(): number {
  const w = window.innerWidth, h = window.innerHeight;
  if (Math.abs(w - fullW) > 1) { fullW = w; fullH = 0; }
  const cap = Math.abs(w - screen.width) < 2 ? screen.height : Math.abs(w - screen.height) < 2 ? screen.width : h;
  if (!isEditable(document.activeElement)) fullH = Math.max(fullH, Math.min(h, cap));
  return fullH;
}

export function useVisibleViewport(): VisibleViewport {
  const [v, setV] = useState<VisibleViewport>(ZERO);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const pinned = standalonePhone();
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // مكبَّرٌ بالقرص؟ لا نلاحق — التكبير قرارُ المستخدم والإزاحةُ فيه طبيعيّة
        if (vv.scale > 1.01) { setV(p => (p === ZERO ? p : ZERO)); return; }
        const top = Math.round(vv.offsetTop);
        const ih = window.innerHeight;
        const gap = Math.round(ih - (vv.offsetTop + vv.height));   // >0: شيءٌ يغطّي الأسفل (اللوحة)
        const full = pinned ? noteFull() : 0;
        const lost = full ? Math.round(full - ih) : 0;              // >0: منظورٌ منكمشٌ عن الشاشة (لوحةٌ مفتوحة أو عالقة)
        const keyboard = isEditable(document.activeElement) && (gap > 120 || lost > 120);
        // أسفلُ ما يُرى فعلاً: أسفلُ المنظور المرئيّ — وفي الهاتف المثبَّت أسفلُ الشاشة كاملة
        const seen = Math.max(vv.height, full);
        const down = Math.round(vv.offsetTop + seen - ih);
        const next: VisibleViewport = {
          shiftTop: top > 2 ? top : 0,
          shiftBottom: !keyboard && down > 2 ? down : 0,
          keyboard,
        };
        setV(p => (p.shiftTop === next.shiftTop && p.shiftBottom === next.shiftBottom && p.keyboard === next.keyboard ? p : next));
      });
    };
    // 🔔 أُغلقت اللوحة: نقطةٌ ذهاباً وإياباً تُعيد iOS لحساب المنظور
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (isEditable(document.activeElement)) return;
        const y = window.scrollY;
        window.scrollTo(window.scrollX, y + 1);
        window.scrollTo(window.scrollX, y);
        measure();
      }, 80);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('focusin', measure);
    window.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', measure);   // عودةٌ من واتساب أو تطبيقٍ آخر
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('focusin', measure);
      window.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', measure);
    };
  }, []);

  return v;
}
