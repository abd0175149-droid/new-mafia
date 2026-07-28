'use client';

// ══════════════════════════════════════════════════════
// 🎂 احتفالية عيد الميلاد — طبقة شاشة العرض
// يطلقها القائد من واجهته؛ الأغنية تُعزف من جهازه وتصل هنا
// عبر مرآة الصوت القائمة (الشاشة تابعة لا مصدر).
// ══════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import './RankEffects.css';

export interface Celebrant {
  playerId: number;
  name: string;
  avatarUrl?: string | null;
  physicalId?: number | null;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

function resolveAvatar(url?: string | null) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${SOCKET_URL}${url}`;
}

// ألوان بالونات/قصاصات
const CONFETTI = ['#f59e0b', '#ec4899', '#22d3ee', '#a3e635', '#f87171', '#c084fc', '#fcd34d'];

export function BirthdayCelebration({ celebrants }: { celebrants: Celebrant[] }) {
  const many = celebrants.length > 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[298] flex flex-col items-center justify-center pointer-events-none overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, rgba(245,158,11,0.18) 0%, rgba(0,0,0,0.93) 68%)' }}
    >
      {/* قصاصات متساقطة */}
      {Array.from({ length: 60 }).map((_, i) => (
        <span
          key={i}
          className="bday-confetti"
          style={{
            left: `${(i * 97) % 100}%`,
            background: CONFETTI[i % CONFETTI.length],
            animationDelay: `${(i % 20) * 0.22}s`,
            animationDuration: `${3.4 + (i % 5) * 0.55}s`,
            width: i % 3 === 0 ? 9 : 6,
            height: i % 3 === 0 ? 14 : 10,
            borderRadius: i % 4 === 0 ? '50%' : 2,
          }}
        />
      ))}

      {/* العنوان */}
      <motion.div
        initial={{ y: -60, opacity: 0, scale: 0.8 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 130 }}
        className="text-center mb-2 relative z-10"
      >
        <div className="text-7xl mb-2 bday-cake">🎂</div>
        <h1
          className="text-6xl md:text-7xl font-black"
          style={{
            fontFamily: 'Amiri, serif',
            color: '#fcd34d',
            textShadow: '0 0 30px rgba(245,158,11,0.7), 0 0 80px rgba(245,158,11,0.35)',
          }}
        >
          كل عام وأنت بخير
        </h1>
        <p className="text-[#c9a227] font-mono text-sm tracking-[0.45em] uppercase mt-2">HAPPY BIRTHDAY</p>
      </motion.div>

      {/* أصحاب العيد */}
      <div className="flex flex-wrap items-center justify-center gap-8 mt-6 relative z-10 px-8">
        {celebrants.map((c, i) => {
          const img = resolveAvatar(c.avatarUrl);
          return (
            <motion.div
              key={c.playerId}
              initial={{ opacity: 0, scale: 0.4, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', damping: 13, stiffness: 120, delay: 0.35 + i * 0.22 }}
              className="flex flex-col items-center"
            >
              <div className="relative">
                {/* هالة نابضة */}
                <div className="absolute inset-0 rounded-full bday-halo" />
                <div
                  className="relative rounded-full overflow-hidden border-4"
                  style={{
                    width: many ? 150 : 200,
                    height: many ? 150 : 200,
                    borderColor: '#f59e0b',
                    boxShadow: '0 0 45px rgba(245,158,11,0.65)',
                  }}
                >
                  {img ? (
                    <img src={img} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-6xl">🎉</div>
                  )}
                </div>
                {/* قبّعة الحفلة */}
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-5xl bday-hat">🥳</div>
              </div>

              <p
                className="mt-4 font-black text-white text-center"
                style={{ fontFamily: 'Amiri, serif', fontSize: many ? 26 : 34, textShadow: '0 2px 14px rgba(0,0,0,0.8)' }}
              >
                {c.name}
              </p>
              {c.physicalId != null && (
                <p className="text-[#c9a227] font-mono text-xs mt-0.5">مقعد #{c.physicalId}</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* شريط الهديّة */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
        className="mt-10 px-7 py-3 rounded-full relative z-10"
        style={{ background: 'rgba(69,26,3,0.85)', border: '1px solid rgba(245,158,11,0.55)' }}
      >
        <span className="text-[#fcd34d] font-bold text-lg" style={{ fontFamily: 'Amiri, serif' }}>
          🪙 عيديّة النادي وصلت لمحفظتك
        </span>
      </motion.div>
    </motion.div>
  );
}
