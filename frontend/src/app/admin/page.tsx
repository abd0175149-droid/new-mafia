'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

async function apiFetch(path: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

interface StatCard {
  title: string;
  value: string | number;
  icon: string;
  gradient: string;
  subtitle?: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatCard[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [activitiesData, bookingsData, costsData] = await Promise.all([
        apiFetch('/api/activities'),
        apiFetch('/api/bookings'),
        apiFetch('/api/costs'),
      ]);

      setActivities(activitiesData.slice(0, 5));
      setBookings(bookingsData.slice(0, 5));

      // حساب الإحصائيات
      const totalRevenue = bookingsData
        .filter((b: any) => b.status === 'confirmed' || b.status === 'completed')
        .reduce((sum: number, b: any) => sum + (parseFloat(b.price) || 0), 0);

      const totalCosts = costsData.reduce((sum: number, c: any) => sum + (parseFloat(c.amount) || 0), 0);

      const activeActivities = activitiesData.filter((a: any) => a.status === 'active').length;
      const pendingBookings = bookingsData.filter((b: any) => b.status === 'pending').length;

      setStats([
        {
          title: 'إجمالي الإيرادات',
          value: `${totalRevenue.toLocaleString()} د.أ`,
          icon: '💰',
          gradient: 'from-emerald-500 to-teal-600',
          subtitle: `${bookingsData.length} حجز`,
        },
        {
          title: 'إجمالي المصروفات',
          value: `${totalCosts.toLocaleString()} د.أ`,
          icon: '📉',
          gradient: 'from-rose-500 to-pink-600',
          subtitle: `${costsData.length} مصروف`,
        },
        {
          title: 'صافي الربح',
          value: `${(totalRevenue - totalCosts).toLocaleString()} د.أ`,
          icon: '📊',
          gradient: totalRevenue - totalCosts >= 0 ? 'from-amber-500 to-orange-600' : 'from-red-500 to-rose-600',
        },
        {
          title: 'الأنشطة النشطة',
          value: activeActivities,
          icon: '🎯',
          gradient: 'from-blue-500 to-indigo-600',
          subtitle: `${activitiesData.length} إجمالي`,
        },
        {
          title: 'حجوزات معلقة',
          value: pendingBookings,
          icon: '⏳',
          gradient: 'from-amber-500 to-yellow-600',
          subtitle: 'بانتظار التأكيد',
        },
      ]);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">لوحة التحكم</h1>
        <p className="text-gray-400 mt-1">مرحباً بك في منصة نادي المافيا الموحدة</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-gray-800/50 backdrop-blur border border-gray-700/40 rounded-2xl p-5 hover:border-gray-600/60 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} text-lg shadow-lg`}>
                {stat.icon}
              </span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-400 mt-1">{stat.title}</p>
            {stat.subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{stat.subtitle}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Two Columns: Recent Activities + Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700/40 rounded-2xl p-6"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>🎯</span> آخر الأنشطة
          </h3>
          {activities.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">لا توجد أنشطة بعد</p>
          ) : (
            <div className="space-y-3">
              {activities.map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-xl hover:bg-gray-900/60 transition">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-sm font-bold">
                    {a.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{a.name}</p>
                    <p className="text-xs text-gray-500">{a.date || 'بدون تاريخ'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    a.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                    a.status === 'completed' ? 'bg-gray-500/10 text-gray-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>
                    {a.status === 'active' ? 'نشط' : a.status === 'completed' ? 'مكتمل' : a.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Bookings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-800/50 backdrop-blur border border-gray-700/40 rounded-2xl p-6"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>📅</span> آخر الحجوزات
          </h3>
          {bookings.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">لا توجد حجوزات بعد</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-xl hover:bg-gray-900/60 transition">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-sm font-bold">
                    {b.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{b.customerName || 'عميل'}</p>
                    <p className="text-xs text-gray-500">{b.date} — {b.price} د.أ</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    b.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' :
                    b.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                    b.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    {b.status === 'confirmed' ? 'مؤكد' : b.status === 'pending' ? 'معلق' : b.status === 'cancelled' ? 'ملغي' : b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
