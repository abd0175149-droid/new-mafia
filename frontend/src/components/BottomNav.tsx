'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

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

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{
      background: 'linear-gradient(180deg, rgba(10,10,10,0.95) 0%, rgba(5,5,5,1) 100%)',
      borderTop: '1px solid rgba(251,191,36,0.15)',
      backdropFilter: 'blur(20px)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div className="flex items-end justify-around max-w-lg mx-auto px-2" style={{ height: '64px' }}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === '/player/home' && pathname === '/player');

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
