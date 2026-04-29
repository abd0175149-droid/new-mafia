'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const CURRENCY = 'د.أ';

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

const RANK_ICONS: Record<string, string> = {
  INFORMANT: '🕵️', SOLDIER: '⚔️', CAPO: '🎖️', UNDERBOSS: '💎', GODFATHER: '👑',
};
const RANK_LABELS: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي',
};

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  planned:   { label: 'مخطط',   dot: 'bg-blue-400' },
  active:    { label: 'نشط',    dot: 'bg-emerald-400' },
  completed: { label: 'مكتمل',  dot: 'bg-gray-500' },
  cancelled: { label: 'ملغي',   dot: 'bg-rose-400' },
};

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/dashboard/stats')
      .then(d => { if (d.success) setData(d); })
      .catch(err => console.error('Dashboard:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-3xl mb-2">⚠️</p>
        <p>فشل تحميل لوحة التحكم</p>
      </div>
    );
  }

  const { finance, bookings: bk, activities: act, players: pl, matches: mt, staff: st } = data;

  // بطاقات KPI الرئيسية
  const mainCards = [
    {
      title: 'إجمالي الإيرادات',
      value: `${Number(finance.totalRevenue).toLocaleString()} ${CURRENCY}`,
      icon: '💰',
      color: 'from-emerald-500/20 to-emerald-600/5',
      border: 'border-emerald-500/20',
      textColor: 'text-emerald-400',
      sub: `${bk.paid} حجز مدفوع`,
    },
    {
      title: 'تكاليف الأنشطة',
      value: `${Number(finance.totalActivityCosts).toLocaleString()} ${CURRENCY}`,
      icon: '📉',
      color: 'from-rose-500/20 to-rose-600/5',
      border: 'border-rose-500/20',
      textColor: 'text-rose-400',
      sub: `${finance.costCount} بند`,
    },
    {
      title: 'صافي الربح',
      value: `${Number(finance.netProfit).toLocaleString()} ${CURRENCY}`,
      icon: finance.netProfit >= 0 ? '📈' : '📉',
      color: finance.netProfit >= 0 ? 'from-amber-500/20 to-amber-600/5' : 'from-red-500/20 to-red-600/5',
      border: finance.netProfit >= 0 ? 'border-amber-500/20' : 'border-red-500/20',
      textColor: finance.netProfit >= 0 ? 'text-amber-400' : 'text-red-400',
      sub: 'إيرادات − تكاليف أنشطة',
    },
    {
      title: 'اللاعبون المسجلون',
      value: pl.total,
      icon: '👥',
      color: 'from-blue-500/20 to-blue-600/5',
      border: 'border-blue-500/20',
      textColor: 'text-blue-400',
      sub: `${pl.active} لاعب نشط`,
    },
    {
      title: 'المباريات الملعوبة',
      value: mt.total,
      icon: '🎮',
      color: 'from-purple-500/20 to-purple-600/5',
      border: 'border-purple-500/20',
      textColor: 'text-purple-400',
      sub: mt.today > 0 ? `${mt.today} مباراة اليوم` : 'لا مباريات اليوم',
    },
  ];

  // بطاقات ثانوية
  const secondaryCards = [
    {
      title: 'الأنشطة',
      icon: '🎯',
      items: [
        { label: 'نشط', value: act.active, color: 'text-emerald-400' },
        { label: 'مخطط', value: act.planned, color: 'text-blue-400' },
        { label: 'مكتمل', value: act.completed, color: 'text-gray-400' },
      ],
      total: act.total,
    },
    {
      title: 'الحجوزات',
      icon: '🎟️',
      items: [
        { label: 'مدفوع', value: bk.paid, color: 'text-emerald-400' },
        { label: 'مجاني', value: bk.free, color: 'text-blue-400' },
        { label: 'غير مدفوع', value: bk.unpaid, color: 'text-amber-400' },
      ],
      total: bk.total,
    },
    {
      title: 'فريق العمل',
      icon: '👔',
      items: [
        { label: 'نشط', value: st.active, color: 'text-emerald-400' },
        { label: 'إجمالي', value: st.total, color: 'text-gray-400' },
      ],
      total: st.total,
    },
  ];

  return (
    <div className="space-y-6 pb-10" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 لوحة التحكم</h1>
          <p className="text-gray-500 text-sm mt-0.5">نادي المافيا — إحصاءات شاملة</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/activities" className="px-3.5 py-2 border border-gray-700/50 text-gray-400 rounded-xl text-xs hover:bg-gray-800 hover:text-white transition">🎯 الأنشطة</a>
          <a href="/admin/bookings" className="px-3.5 py-2 border border-gray-700/50 text-gray-400 rounded-xl text-xs hover:bg-gray-800 hover:text-white transition">🎟️ الحجوزات</a>
          <a href="/admin/players" className="px-3.5 py-2 border border-gray-700/50 text-gray-400 rounded-xl text-xs hover:bg-gray-800 hover:text-white transition">👥 اللاعبون</a>
        </div>
      </div>

      {/* ── تنبيه ذكي ── */}
      {bk.unpaid > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-amber-400 text-sm font-bold">حجوزات غير مدفوعة</p>
            <p className="text-amber-400/70 text-xs">{bk.unpaid} حجز بانتظار الدفع • {bk.totalAttendees} شخص إجمالي الحضور</p>
          </div>
        </motion.div>
      )}

      {finance.totalFoundational > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex items-center gap-3 p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <span className="text-lg">🏗️</span>
          <div className="flex-1">
            <p className="text-purple-400 text-sm font-bold">تكاليف تأسيسية</p>
            <p className="text-purple-400/70 text-xs">{Number(finance.totalFoundational).toLocaleString()} {CURRENCY} من {finance.foundationalCount} بند</p>
          </div>
        </motion.div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {mainCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`bg-gradient-to-br ${card.color} border ${card.border} rounded-2xl p-4 hover:scale-[1.02] transition-transform`}
          >
            <div className="text-2xl mb-2">{card.icon}</div>
            <p className={`text-xl font-black ${card.textColor}`}>{card.value}</p>
            <p className="text-[11px] text-gray-400 mt-1">{card.title}</p>
            {card.sub && <p className="text-[10px] text-gray-600 mt-0.5">{card.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* ── Secondary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {secondaryCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.06 }}
            className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">{card.icon} {card.title}</h3>
              <span className="text-xs text-gray-500 bg-gray-700/40 px-2 py-0.5 rounded-full">{card.total}</span>
            </div>
            <div className="space-y-1.5">
              {card.items.map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Row 3: أنشطة الأسبوع + أفضل اللاعبين ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* أنشطة هذا الأسبوع */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">📅 أنشطة هذا الأسبوع</h3>
          {data.upcomingActivities.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">لا توجد أنشطة قادمة</p>
          ) : (
            <div className="space-y-2">
              {data.upcomingActivities.map((a: any) => {
                const st = STATUS_MAP[a.status] || STATUS_MAP.planned;
                return (
                  <a key={a.id} href={`/admin/activities/${a.id}`}
                    className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-xl hover:bg-gray-900/70 transition group">
                    <div className={`w-2 h-2 rounded-full ${st.dot} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate group-hover:text-amber-400 transition">{a.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(a.date).toLocaleDateString('ar-JO', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-600">{st.label}</span>
                  </a>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* أفضل اللاعبين */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">🏆 أفضل اللاعبين</h3>
          {data.topPlayers.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">لا يوجد لاعبون بعد</p>
          ) : (
            <div className="space-y-2">
              {data.topPlayers.map((p: any, i: number) => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-xl">
                  <span className="text-lg w-7 text-center shrink-0">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm overflow-hidden shrink-0">
                    {p.avatarUrl ? <img src={`${process.env.NEXT_PUBLIC_SOCKET_URL || ''}${p.avatarUrl}`} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-500">Lv.{p.level} • {p.totalMatches || 0} مباراة • {p.totalWins || 0} فوز</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-xs">{RANK_ICONS[p.rankTier] || '🕵️'} <span className="text-gray-400">{RANK_LABELS[p.rankTier] || 'مُخبر'}</span></p>
                    <p className="text-[10px] text-gray-600">{p.rankRR || 0} RR</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Row 4: آخر الأنشطة + آخر الحجوزات ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* آخر الأنشطة */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">🎯 آخر الأنشطة</h3>
          {data.recentActivities.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">لا توجد أنشطة</p>
          ) : (
            <div className="space-y-2">
              {data.recentActivities.map((a: any) => {
                const st = STATUS_MAP[a.status] || STATUS_MAP.planned;
                return (
                  <a key={a.id} href={`/admin/activities/${a.id}`}
                    className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-xl hover:bg-gray-900/70 transition group">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
                      {a.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate group-hover:text-amber-400 transition">{a.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {a.date ? new Date(a.date).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' }) : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      <span className="text-[10px] text-gray-500">{st.label}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* آخر الحجوزات */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
          className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">🎟️ آخر الحجوزات</h3>
          {data.recentBookings.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">لا توجد حجوزات</p>
          ) : (
            <div className="space-y-2">
              {data.recentBookings.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 p-3 bg-gray-900/40 rounded-xl">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-bold shrink-0">
                    {b.count || 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{b.name}</p>
                    <p className="text-[10px] text-gray-500">
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                  <div className="text-left">
                    {b.isFree ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">مجاني</span>
                    ) : b.isPaid ? (
                      <div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">مدفوع</span>
                        <p className="text-[10px] text-emerald-400/70 mt-0.5 text-center">{Number(b.paidAmount || 0)} {CURRENCY}</p>
                      </div>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">غير مدفوع</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
