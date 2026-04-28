'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

const NAV_ITEMS = [
  { href: '/admin', icon: '📊', label: 'لوحة التحكم' },
  { href: '/admin/activities', icon: '🎯', label: 'الأنشطة' },
  { href: '/admin/bookings', icon: '📅', label: 'الحجوزات' },
  { href: '/admin/finance', icon: '💰', label: 'المالية' },
  { href: '/admin/locations', icon: '📍', label: 'المواقع' },
  { href: '/admin/staff', icon: '👥', label: 'الموظفون' },
  { href: '/admin/players', icon: '🎮', label: 'اللاعبون' },
  { href: '/admin/game-history', icon: '📜', label: 'سجل الألعاب' },
  { href: '/admin/notifications', icon: '🔔', label: 'الإشعارات' },
  { href: '/admin/settings', icon: '⚙️', label: 'الإعدادات' },
  // ── فاصل ──
  { href: '/__separator__', icon: '', label: '' },
  // ── روابط اللعبة ──
  { href: '/leader', icon: '🕹️', label: 'واجهة القائد', external: true },
  { href: '/', icon: '🏠', label: 'الصفحة الرئيسية', external: true },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // صفحة اللوقن لا تحتاج تحقق
    if (pathname === '/admin/login') {
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (!token || !savedUser) {
      router.push('/admin/login');
      return;
    }

    try {
      setUser(JSON.parse(savedUser));
    } catch {
      router.push('/admin/login');
      return;
    }
    setLoading(false);
  }, [pathname, router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/admin/login');
  };

  // صفحة الـ Login لا تحتاج Layout
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex" dir="rtl">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 72 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed top-0 right-0 h-screen bg-gray-900/80 backdrop-blur-xl border-l border-gray-800/50 z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 flex items-center gap-3 border-b border-gray-800/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 text-white text-lg shrink-0"
          >
            🎭
          </button>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <h2 className="font-bold text-white text-sm">نادي المافيا</h2>
                <p className="text-xs text-gray-500">لوحة الإدارة</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            // فاصل
            if (item.href === '/__separator__') {
              return <div key="sep" className="border-t border-gray-800/50 my-2" />;
            }

            const isExternal = (item as any).external;
            const isActive = !isExternal && (pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href)));

            if (isExternal) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-amber-400 hover:bg-amber-500/5 border border-transparent hover:border-amber-500/20 transition-all"
                >
                  <span className="text-lg shrink-0 w-6 text-center">{item.icon}</span>
                  <AnimatePresence>
                    {sidebarOpen && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium whitespace-nowrap">
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {sidebarOpen && <span className="mr-auto text-xs text-gray-600">↗</span>}
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <span className="text-lg shrink-0 w-6 text-center">{item.icon}</span>
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {user?.displayName?.[0] || 'U'}
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
                  <button onClick={handleLogout} className="text-xs text-rose-400 hover:text-rose-300 transition">
                    تسجيل خروج
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main
        className="flex-1 transition-all duration-300"
        style={{ marginRight: sidebarOpen ? 260 : 72 }}
      >
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
