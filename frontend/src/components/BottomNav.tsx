'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useRoomBus, requestHub } from './player-room/roomBus';

const tabs = [
  { href: '/player/home', label: 'الرئيسية', icon: 'home' },
  { href: '/player/games', label: 'الألعاب', icon: 'games' },
  { href: '/player/join', label: 'ادخل', icon: 'shield', isCenter: true },
  { href: '/player/rank', label: 'التصنيف', icon: 'rank' },
  { href: '/player/profile', label: 'حسابي', icon: 'profile' },
];

// ── أيقونات SVG ──
function TabIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? '#fbbf24' : '#6b7280';

  switch (icon) {
    case 'home':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'games':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <line x1="6" y1="12" x2="6" y2="12" /><line x1="10" y1="12" x2="10" y2="12" />
          <circle cx="17" cy="10" r="1" /><circle cx="17" cy="14" r="1" />
        </svg>
      );
    case 'shield':
      return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill={active ? '#fbbf24' : 'none'} stroke={active ? '#b45309' : '#fbbf24'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" stroke={active ? '#b45309' : '#fbbf24'} strokeWidth="2" />
        </svg>
      );
    case 'rank':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'profile':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    default:
      return null;
  }
}

// 🎮 داخل الغرفة (الواجهة الجديدة): زرّ المنتصف يصبح «اللعبة» — حلقةُ وقت المرحلة حوله،
//    ولمسةٌ تفتح أدوات اللعبة. شريطٌ سفليّ واحد (قرار المالك 2026-11-06).
function GameHubButton() {
  const bus = useRoomBus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!bus.endsAt) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [bus.endsAt]);
  const C = 175.9;
  const left = bus.endsAt ? Math.max(0, (bus.endsAt - now) / 1000) : 0;
  const frac = bus.endsAt && bus.totalSec ? Math.min(1, left / bus.totalSec) : 0;
  const hot = bus.endsAt && left <= 10;
  return (
    <button type="button" onClick={() => requestHub()} aria-label="أدوات اللعبة" className="flex flex-col items-center relative" style={{ marginTop: '-20px' }}>
      <motion.span whileTap={{ scale: 0.9 }} className="flex items-center justify-center rounded-full relative"
        style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #e2c57c, #8a6a2a)', border: '2px solid rgba(197,160,89,0.6)', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
        {bus.endsAt ? (
          <svg viewBox="0 0 60 60" aria-hidden className="absolute" style={{ inset: -5, width: 66, height: 66, transform: 'rotate(-90deg)' }}>
            <circle cx="30" cy="30" r="28" fill="none" stroke={hot ? '#ef4444' : '#C5A059'} strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={(C * (1 - frac)).toFixed(1)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
        ) : null}
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1206" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z" />
        </svg>
        {bus.cart > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#8A0303] text-white text-[10px] font-bold flex items-center justify-center">{bus.cart}</span>
        )}
      </motion.span>
      <span className="text-[11px] mt-1" style={{ color: '#C5A059' }}>اللعبة</span>
    </button>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const bus = useRoomBus();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{
      background: 'linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(5,5,5,1) 100%)',
      borderTop: '1px solid rgba(251,191,36,0.15)',
      backdropFilter: 'blur(20px)',
      paddingBottom: 'var(--safe-b)',
    }}>
      <div className="flex items-end justify-around max-w-lg mx-auto px-2" style={{ height: 'var(--nav-content-h)' }}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === '/player/home' && pathname === '/player');

          if (tab.isCenter && bus.active) {
            return <GameHubButton key={tab.href} />;
          }

          if (tab.isCenter) {
            return (
              <Link key={tab.href} href={tab.href} className="flex flex-col items-center relative" style={{ marginTop: '-20px' }}>
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: '56px',
                    height: '56px',
                    background: isActive
                      ? 'linear-gradient(135deg, #fbbf24, #b45309)'
                      : 'linear-gradient(135deg, #1a1a2e, #16213e)',
                    border: '2px solid rgba(251,191,36,0.6)',
                    boxShadow: isActive
                      ? '0 0 20px rgba(251,191,36,0.4), 0 4px 15px rgba(0,0,0,0.5)'
                      : '0 0 10px rgba(251,191,36,0.15), 0 4px 10px rgba(0,0,0,0.5)',
                  }}
                >
                  <TabIcon icon={tab.icon} active={isActive} />
                </motion.div>
                <span className="text-[10px] mt-1" style={{ color: isActive ? '#fbbf24' : '#6b7280' }}>
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link key={tab.href} href={tab.href} className="flex flex-col items-center justify-center py-2" style={{ minWidth: '56px' }}>
              <TabIcon icon={tab.icon} active={isActive} />
              <span className="text-[10px] mt-1" style={{ color: isActive ? '#fbbf24' : '#6b7280' }}>
                {tab.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute top-0 h-[2px] rounded-full"
                  style={{ width: '20px', background: '#fbbf24' }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
