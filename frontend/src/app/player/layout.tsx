'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PlayerProvider, usePlayer } from '@/context/PlayerContext';
import BottomNav from '@/components/BottomNav';

// ── الصفحات التي لا تحتاج تسجيل دخول ──
const PUBLIC_PATHS = ['/player/login'];

// ── iOS Pull-to-Refresh Hook ──
function usePullToRefresh() {
  const [pulling, setPulling] = useState(false);
  const startY = useRef(0);
  const pullDistance = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (window.scrollY > 0) return;
    const currentY = e.touches[0].clientY;
    pullDistance.current = currentY - startY.current;
    if (pullDistance.current > 60) {
      setPulling(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pulling && pullDistance.current > 80) {
      window.location.reload();
    }
    setPulling(false);
    pullDistance.current = 0;
  }, [pulling]);

  useEffect(() => {
    // فقط على iOS PWA
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (!isIOS && !isStandalone) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return pulling;
}

function PlayerLayoutInner({ children }: { children: React.ReactNode }) {
  const { player, isLoading } = usePlayer();
  const router = useRouter();
  const pathname = usePathname();
  const pulling = usePullToRefresh();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  // صفحة join تحتاج layout مختلف (بدون بار أثناء اللعب)
  const isGamePage = pathname === '/player/join';

  useEffect(() => {
    if (isLoading) return;
    // صفحة اللعبة تدير الجلسة بنفسها — لا نوجّهها أبداً
    if (isGamePage) return;

    if (!player && !isPublic) {
      router.replace('/player/login');
    }

    if (player && isPublic) {
      router.replace('/player/home');
    }
  }, [player, isLoading, isPublic, isGamePage, router]);

  // شاشة التحميل (بس مش لصفحة اللعبة — هي تدير حالها)
  if (isLoading && !isGamePage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-amber-500/60 text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // صفحات عامة (login) — بدون بار
  if (isPublic) {
    return <>{children}</>;
  }

  // صفحة اللعبة — مع بار ثابت
  if (isGamePage) {
    return (
      <div className="min-h-screen bg-[#050505] pb-20" style={{ overscrollBehavior: 'none' }}>
        {children}
        <BottomNav />
      </div>
    );
  }

  // صفحات عادية — مع بار
  return (
    <div className="min-h-screen bg-[#050505] pb-20" style={{ overscrollBehavior: 'none' }}>
      {/* مؤشر السحب للتحديث */}
      {pulling && (
        <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center pt-4">
          <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
        </div>
      )}
      {children}
      <BottomNav />
    </div>
  );
}

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <PlayerLayoutInner>{children}</PlayerLayoutInner>
    </PlayerProvider>
  );
}
