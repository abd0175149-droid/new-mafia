'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlayerPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/player/home');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505]">
      <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );
}
