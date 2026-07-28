'use client';

// ══════════════════════════════════════════════════════
// 🪙 حبة رصيد التشبس — ترويسة هوم اللاعب (بجانب الجرس)
// تُحدَّث لحظياً عبر chips:balance-updated على غرفة player:{id}
// ══════════════════════════════════════════════════════

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function ChipsBalancePill({ onClick }: { onClick?: () => void }) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // الرصيد الابتدائي + مسار احتياطي عند العودة للصفحة
  // (السوكيت هو القناة الأساس، وهذا يضمن الصحة حتى لو انقطع)
  useEffect(() => {
    const fetchBalance = () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
      if (!token) return;
      fetch(`${API_URL}/api/chips/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d?.success) setBalance(Number(d.balance || 0)); })
        .catch(() => {});
    };
    fetchBalance();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchBalance(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // التحديث اللحظي
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
    if (!token) return;   // لا نفتح اتصالاً لزائر غير مسجَّل
    const socket = getSocket();
    const onUpdate = (p: { balance: number; delta: number }) => {
      setBalance(Number(p?.balance || 0));
      if (p?.delta) {
        setDelta(Number(p.delta));
        if (deltaTimer.current) clearTimeout(deltaTimer.current);
        deltaTimer.current = setTimeout(() => setDelta(null), 2600);
      }
    };
    socket.on('chips:balance-updated', onUpdate);
    return () => {
      socket.off('chips:balance-updated', onUpdate);
      if (deltaTimer.current) clearTimeout(deltaTimer.current);
    };
  }, []);

  if (balance === null) return null;   // لا نعرض شيئاً قبل معرفة الرصيد

  return (
    <motion.button
      onClick={onClick || (() => router.push('/player/store'))}
      whileTap={{ scale: 0.94 }}
      className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(245,158,11,0.05))',
        border: '1px solid rgba(245,158,11,0.32)',
        color: '#fbbf24',
      }}
      title="رصيد التشبس — افتح خزنة الدون"
    >
      <span className="text-sm leading-none">🪙</span>
      <motion.span key={balance} initial={{ scale: 1.35 }} animate={{ scale: 1 }} className="tabular-nums">
        {balance.toLocaleString('en-US')}
      </motion.span>

      {/* وميض التغيّر */}
      <AnimatePresence>
        {delta !== null && (
          <motion.span
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: 1, y: -22, scale: 1 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.4 }}
            className="absolute left-1/2 -translate-x-1/2 top-0 text-[11px] font-black pointer-events-none whitespace-nowrap"
            style={{ color: delta > 0 ? '#34d399' : '#fb7185' }}
          >
            {delta > 0 ? `+${delta}` : delta} 🪙
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
