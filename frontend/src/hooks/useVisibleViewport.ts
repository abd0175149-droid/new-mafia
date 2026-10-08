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
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

export interface VisibleViewport { shiftTop: number; shiftBottom: number; keyboard: boolean }

const ZERO: VisibleViewport = { shiftTop: 0, shiftBottom: 0, keyboard: false };
const isEditable = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);

export function useVisibleViewport(): VisibleViewport {
  const [v, setV] = useState<VisibleViewport>(ZERO);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // مكبَّرٌ بالقرص؟ لا نلاحق — التكبير قرارُ المستخدم والإزاحةُ فيه طبيعيّة
        if (vv.scale > 1.01) { setV(p => (p === ZERO ? p : ZERO)); return; }
        const top = Math.round(vv.offsetTop);
        const gap = Math.round(window.innerHeight - (vv.offsetTop + vv.height));   // >0: شيءٌ يغطّي الأسفل (اللوحة)
        const keyboard = gap > 120 && isEditable(document.activeElement);
        const next: VisibleViewport = {
          shiftTop: top > 2 ? top : 0,
          shiftBottom: !keyboard && gap < -2 ? -gap : 0,
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
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('focusin', measure);
    window.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', measure);   // عودةٌ من واتساب أو تطبيقٍ آخر
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('focusin', measure);
      window.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', measure);
    };
  }, []);

  return v;
}
