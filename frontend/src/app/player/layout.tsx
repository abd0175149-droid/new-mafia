'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PlayerProvider, usePlayer } from '@/context/PlayerContext';
import BottomNav from '@/components/BottomNav';

// ── الصفحات التي لا تحتاج تسجيل دخول ──
const PUBLIC_PATHS = ['/player/login'];

function PlayerLayoutInner({ children }: { children: React.ReactNode }) {
  const { player, isLoading } = usePlayer();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_PATHS.includes(pathname);
  // صفحة join تحتاج layout مختلف (بدون بار أثناء اللعب)
  const isGamePage = pathname === '/player/join';

  useEffect(() => {
    if (isLoading) return;

    if (!player && !isPublic) {
      router.replace('/player/login');
    }

    if (player && isPublic) {
      router.replace('/player/home');
    }
  }, [player, isLoading, isPublic, router]);

  // شاشة التحميل
  if (isLoading) {
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

  // صفحات اللعبة — مع بار لكن ممكن يختفي
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
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
