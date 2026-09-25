'use client';

// ══════════════════════════════════════════════════════
// 🎟️ «دخول الدون» — تحيّة شاشة القاعة لصاحب بطاقة ولاء مكتملة
// يبثّها الخادم عند انضمام اللاعب (مرّة لكلّ بطاقة) على القناة الموثوقة.
// لا صوت هنا: الشاشة تابعة، والاسم لا يكشف دوراً ولا فريقاً.
// ══════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { DonSeal, sealTilt } from '@/components/DonSeal';

export interface LoyaltyCelebrant {
  playerId: number; physicalId?: number | null; name: string; avatarUrl?: string | null;
  stamps: number; period: string; seq: number; kind?: string | null; durationMs?: number;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';
const resolveAvatar = (url?: string | null) => !url ? null : url.startsWith('http') ? url : `${SOCKET_URL}${url}`;
import { AR_MONTHS } from '@/lib/constants';
const monthName = (p: string) => AR_MONTHS[Number((p || '').split('-')[1]) - 1] || p;
const KIND_LINE: Record<string, string> = {
  free_visit: 'الليلة على النادي 🎟️', free_drink: 'ومشروبه على النادي ☕', chips: 'وتشبسه في خزنته 🪙',
};

export function LoyaltyCelebration({ data }: { data: LoyaltyCelebrant }) {
  const img = resolveAvatar(data.avatarUrl);
  const n = Math.max(1, Math.min(12, data.stamps || 5));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[297] flex items-center justify-center pointer-events-none overflow-hidden" dir="rtl"
      style={{ background: 'radial-gradient(ellipse at center, rgba(197,160,89,0.16) 0%, rgba(0,0,0,0.9) 66%)' }}>
      <motion.div initial={{ scale: 0.7, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 14, stiffness: 120 }}
        className="flex items-center gap-12 px-10">
        <div className="relative shrink-0">
          <div className="absolute -inset-4 rounded-full" style={{ boxShadow: '0 0 90px rgba(251,191,36,0.35)' }} />
          <div className="relative rounded-full overflow-hidden grid place-items-center" style={{ width: 220, height: 220, border: '5px solid rgba(197,160,89,0.8)', background: '#1a1206', boxShadow: '0 0 60px rgba(251,191,36,0.3)' }}>
            {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <span className="text-8xl">🎭</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl" style={{ fontFamily: 'Amiri, serif', color: '#C5A059' }}>🎟️ بطاقة الولاء مكتملة</p>
          <h1 className="font-black leading-tight my-2" style={{ fontFamily: 'Amiri, serif', fontSize: 72, color: '#fff', textShadow: '0 0 40px rgba(251,191,36,0.4)' }}>{data.name}</h1>
          <div className="flex gap-3 my-4">
            {Array.from({ length: n }).map((_, i) => (
              <motion.div key={i} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35 + i * 0.12, type: 'spring', damping: 10 }}
                className="grid place-items-center"><DonSeal size={62} tilt={sealTilt(i)} /></motion.div>
            ))}
          </div>
          <p className="text-2xl" style={{ color: '#e5dfd0' }}>
            {n} أختام في {monthName(data.period)} — {KIND_LINE[data.kind || ''] || 'شكراً لالتزامك 🎩'}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
