'use client';

// ══════════════════════════════════════════════════════
// 🔒 useModalScrollLock — منع السكرول + pull-to-refresh + swipe-to-close
// يستخدم CSS class (modal-open) بدل inline styles لضمان عمل
// overscroll-behavior على مستوى compositor thread
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useCallback } from 'react';

interface UseModalScrollLockOptions {
  isOpen: boolean;
  onClose: () => void;
  swipeThreshold?: number;
}

export function useModalScrollLock({ isOpen, onClose, swipeThreshold = 80 }: UseModalScrollLockOptions) {
  const scrollYRef = useRef(0);
  const touchStartRef = useRef(0);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── قفل السكرول عبر CSS class ──
  useEffect(() => {
    if (!isOpen) return;

    // حفظ موضع السكرول
    scrollYRef.current = window.scrollY;

    // إضافة class + تعيين top لحفظ موضع الصفحة
    document.body.classList.add('modal-open');
    document.body.style.top = `-${scrollYRef.current}px`;

    return () => {
      // إزالة class واستعادة السكرول
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      window.scrollTo(0, scrollYRef.current);
    };
  }, [isOpen]);

  // ── منع touchmove خارج الموديل (طبقة إضافية) ──
  useEffect(() => {
    if (!isOpen) return;

    const preventTouch = (e: TouchEvent) => {
      const modal = modalContentRef.current;
      // السماح بالسكرول داخل الموديل فقط
      if (modal && modal.contains(e.target as Node)) {
        // منع overscroll عند أعلى الموديل (pull-to-refresh)
        if (modal.scrollTop <= 0) {
          const touch = e.touches[0];
          if (touch) {
            const deltaY = touch.clientY - touchStartRef.current;
            if (deltaY > 0 && touchStartRef.current > 0) {
              e.preventDefault();
            }
          }
        }
        // منع overscroll عند أسفل الموديل
        if (modal.scrollTop + modal.clientHeight >= modal.scrollHeight) {
          const touch = e.touches[0];
          if (touch) {
            const deltaY = touch.clientY - touchStartRef.current;
            if (deltaY < 0 && touchStartRef.current > 0) {
              e.preventDefault();
            }
          }
        }
        return;
      }
      // منع أي لمس خارج الموديل
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventTouch, { passive: false });
    return () => document.removeEventListener('touchmove', preventTouch);
  }, [isOpen]);

  // ── Swipe-to-close ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartRef.current;
    const modal = modalContentRef.current;
    const scrollTop = modal?.scrollTop || 0;

    // سحب للأسفل + الموديل في أعلاه → أغلق
    if (diff > swipeThreshold && scrollTop <= 5) {
      onCloseRef.current();
    }
    touchStartRef.current = 0;
  }, [swipeThreshold]);

  return {
    modalContentRef,
    handleTouchStart,
    handleTouchEnd,
    backdropProps: {
      style: {
        touchAction: 'none' as const,
      },
    },
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
