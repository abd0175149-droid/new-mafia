'use client';

// ══════════════════════════════════════════════════════
// 🔒 useModalScrollLock — منع السكرول + pull-to-refresh + swipe-to-close
// يعمل على iOS Safari / Chrome Android / Desktop
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useCallback } from 'react';

interface UseModalScrollLockOptions {
  isOpen: boolean;
  onClose: () => void;
  swipeThreshold?: number; // مسافة السحب لإغلاق الموديل (بالبكسل)
}

export function useModalScrollLock({ isOpen, onClose, swipeThreshold = 80 }: UseModalScrollLockOptions) {
  const scrollYRef = useRef(0);
  const touchStartRef = useRef(0);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── قفل السكرول ──
  useEffect(() => {
    if (!isOpen) return;

    // حفظ موضع السكرول الحالي
    scrollYRef.current = window.scrollY;

    const html = document.documentElement;
    const body = document.body;

    // تثبيت body لمنع السكرول
    body.style.position = 'fixed';
    body.style.top = `-${scrollYRef.current}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    // منع pull-to-refresh + overscroll
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    html.style.overflow = 'hidden';

    // ⚠️ منع touchmove على كل الصفحة (إلا داخل الموديل)
    // يجب أن يكون passive: false حتى يعمل preventDefault على iOS
    const preventTouch = (e: TouchEvent) => {
      const modal = modalContentRef.current;
      if (modal && modal.contains(e.target as Node)) {
        // السماح بالسكرول داخل الموديل
        // لكن إذا وصل لأعلى الموديل ويسحب للأسفل → منع (overscroll/pull-to-refresh)
        if (modal.scrollTop <= 0) {
          const touch = e.touches[0];
          if (touch && touchStartRef.current > 0) {
            const deltaY = touch.clientY - touchStartRef.current;
            if (deltaY > 0) {
              e.preventDefault(); // منع pull-to-refresh داخل الموديل
            }
          }
        }
        return;
      }
      // منع أي لمس خارج الموديل
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventTouch);

      // استعادة الوضع الطبيعي
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.overflow = '';
      html.style.overscrollBehavior = '';
      body.style.overscrollBehavior = '';
      html.style.overflow = '';

      // استعادة موضع السكرول
      window.scrollTo(0, scrollYRef.current);
    };
  }, [isOpen]);

  // ── Swipe-to-close handlers ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartRef.current;
    const modal = modalContentRef.current;

    // إذا الموديل في أعلاه (scrollTop ≈ 0) والمستخدم سحب للأسفل بما يكفي → أغلق
    if (diff > swipeThreshold) {
      const scrollTop = modal?.scrollTop || 0;
      if (scrollTop <= 5) {
        onCloseRef.current();
      }
    }
    touchStartRef.current = 0;
  }, [swipeThreshold]);

  return {
    modalContentRef,
    handleTouchStart,
    handleTouchEnd,
    // خصائص إضافية للـ overlay backdrop
    backdropProps: {
      style: {
        touchAction: 'none' as const,
        overscrollBehavior: 'none' as const,
      },
    },
    // خصائص للموديل الداخلي
    modalProps: {
      ref: modalContentRef,
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
      style: {
        overscrollBehavior: 'contain' as const,
        WebkitOverflowScrolling: 'touch' as const,
        touchAction: 'pan-y' as const,
      },
    },
  };
}
