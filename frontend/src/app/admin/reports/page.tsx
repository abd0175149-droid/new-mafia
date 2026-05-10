'use client';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const API = process.env.NEXT_PUBLIC_API_URL || '';

function getHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const PERIODS = [
  { value: 'week', label: 'أسبوع' },
  { value: 'month', label: 'شهر' },
  { value: 'quarter', label: 'ربع سنة' },
  { value: 'year', label: 'سنة' },
  { value: 'all', label: 'الكل' },
];

const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي'
};
const RANK_ICONS: Record<string, string> = {
  INFORMANT: '🕵️', SOLDIER: '⚔️', CAPO: '🎖️', UNDERBOSS: '💎', GODFATHER: '👑'
};
const ROLE_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية',
  MAFIA_REGULAR: 'مافيا عادي', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', CITIZEN: 'مواطن'
};

function StatCard({ icon, label, value, sub, color = 'amber' }: any) {
  const colors: any = {
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    green: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    red: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ title, icon }: any) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-8">
      <span className="text-2xl">{icon}</span>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

function Table({ headers, rows, emptyMsg = 'لا توجد بيانات' }: any) {
  if (!rows?.length) return <p className="text-center text-gray-600 py-6 text-sm">{emptyMsg}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            {headers.map((h: string) => (
              <th key={h} className="text-right px-4 py-3 text-xs text-gray-400 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any[], i: number) => (
            <tr key={i} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition">
              {row.map((cell: any, j: number) => (
                <td key={j} className="px-4 py-3 text-gray-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState('kpi');
  const [financial, setFinancial] = useState<any>(null);
  const [players, setPlayers] = useState<any>(null);
  const [games, setGames] = useState<any>(null);
  const [locations, setLocations] = useState<any>(null);
  const [kpi, setKpi] = useState<any>(null);
  const [sessionsData, setSessionsData] = useState<any>(null);
  const [partners, setPartners] = useState<any>(null);
  const [audit, setAudit] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [f, p, g, l, k, s, pr, au] = await Promise.all([
        fetch(`${API}/api/reports/financial?period=${period}`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API}/api/reports/players?period=${period}`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API}/api/reports/games?period=${period}`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API}/api/reports/locations?period=${period}`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API}/api/reports/kpi`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API}/api/reports/sessions?period=${period}`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API}/api/reports/partners`, { headers: getHeaders() }).then(r => r.json()),
        fetch(`${API}/api/reports/audit?period=${period}`, { headers: getHeaders() }).then(r => r.json()),
      ]);
      if (f.success) setFinancial(f);
      if (p.success) setPlayers(p);
      if (g.success) setGames(g);
      if (l.success) setLocations(l);
      if (k.success) setKpi(k.kpis);
      if (s.success) setSessionsData(s);
      if (pr.success) setPartners(pr.partners);
      if (au.success) setAudit(au);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [period]);

  const handlePrint = () => window.print();

  const TABS = [
    { id: 'kpi', label: 'المؤشرات', icon: '📊' },
    { id: 'financial', label: 'المالية', icon: '💰' },
    { id: 'players', label: 'اللاعبون', icon: '🎮' },
    { id: 'games', label: 'المباريات', icon: '⚔️' },
    { id: 'sessions', label: 'الجلسات', icon: '🏠' },
    { id: 'locations', label: 'المواقع', icon: '📍' },
    { id: 'partners', label: 'الشركاء', icon: '🤝' },
    { id: 'audit', label: 'سجل العمليات', icon: '📜' },
  ];

  return (
    <div className="min-h-screen text-white" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-white">📋 التقارير والتحليلات</h1>
          <p className="text-sm text-gray-500 mt-1">تحليل شامل لأداء النادي</p>
        </div>
        <div className="flex gap-3 items-center">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm">
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl text-sm transition">
            🖨️ طباعة
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto print:hidden pb-2">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div ref={printRef}>
          {/* ══ KPI ══ */}
          {activeTab === 'kpi' && kpi && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="مؤشرات الأداء الرئيسية" icon="📊" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon="💰" label="إيرادات هذا الشهر" value={`${kpi.revenueThisMonth?.toLocaleString()} د.ع`}
                  sub={`${kpi.revenueGrowth >= 0 ? '+' : ''}${kpi.revenueGrowth}% عن الشهر الماضي`} color="amber" />
                <StatCard icon="📅" label="حجوزات هذا الشهر" value={kpi.bookingsThisMonth} sub={`${kpi.attendeesThisMonth} حاضر`} color="green" />
                <StatCard icon="⚠️" label="مبالغ معلقة" value={`${Number(kpi.unpaidAmount)?.toLocaleString()} د.ع`} color="red" />
                <StatCard icon="🎮" label="إجمالي المباريات" value={kpi.totalMatches} sub={`${kpi.matchesThisMonth} هذا الشهر`} color="blue" />
                <StatCard icon="👥" label="إجمالي اللاعبين" value={kpi.totalPlayers} sub={`${kpi.newPlayersThisMonth} جديد هذا الشهر`} color="purple" />
                <StatCard icon="🎯" label="نسبة إنجاز الأنشطة" value={`${kpi.completionRate}%`} sub={`${kpi.completedActivities} من ${kpi.totalActivities}`} color="green" />
                <StatCard icon="⚖️" label="توازن اللعبة (فوز مافيا)" value={`${kpi.mafiaWinRate}%`}
                  sub={kpi.mafiaWinRate >= 45 && kpi.mafiaWinRate <= 55 ? '✅ متوازنة' : '⚠️ تحتاج مراجعة'} color="amber" />
                <StatCard icon="⭐" label="متوسط تقييم الليدر" value={`${kpi.avgLeaderRating}/5`} color="blue" />
              </div>
            </motion.div>
          )}

          {/* ══ FINANCIAL ══ */}
          {activeTab === 'financial' && financial && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="التقرير المالي" icon="💰" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon="💰" label="إجمالي الإيرادات" value={`${Number(financial.summary.totalRevenue)?.toLocaleString()} د.ع`} color="green" />
                <StatCard icon="📉" label="إجمالي التكاليف" value={`${Number(financial.summary.totalCosts)?.toLocaleString()} د.ع`} color="red" />
                <StatCard icon="📈" label="صافي الربح" value={`${Number(financial.summary.netProfit)?.toLocaleString()} د.ع`}
                  sub={`هامش ${financial.summary.profitMargin}%`} color="amber" />
                <StatCard icon="⚠️" label="مبالغ معلقة" value={`${Number(financial.summary.unpaidAmount)?.toLocaleString()} د.ع`}
                  sub={`${financial.summary.unpaidBookings} حجز غير مدفوع`} color="red" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard icon="📅" label="إجمالي الحجوزات" value={financial.summary.totalBookings} color="blue" />
                <StatCard icon="✅" label="مدفوعة" value={financial.summary.paidBookings} color="green" />
                <StatCard icon="🎁" label="مجانية" value={financial.summary.freeBookings} color="purple" />
                <StatCard icon="👥" label="إجمالي الحضور" value={financial.summary.totalAttendees} color="amber" />
              </div>

              <SectionTitle title="أداء كل نشاط مالياً" icon="🎯" />
              <Table
                headers={['النشاط', 'التاريخ', 'الإيرادات', 'التكاليف', 'الربح', 'الحضور', 'الإشغال', 'الحالة']}
                rows={financial.activityFinancials?.map((a: any) => [
                  a.name,
                  new Date(a.date).toLocaleDateString('ar-IQ'),
                  `${Number(a.revenue).toLocaleString()} د.ع`,
                  `${Number(a.activityCost).toLocaleString()} د.ع`,
                  <span key="p" className={a.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {Number(a.profit).toLocaleString()} د.ع
                  </span>,
                  a.totalAttendees,
                  `${a.occupancyRate}%`,
                  <span key="s" className={`px-2 py-0.5 rounded text-xs ${
                    a.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                    a.status === 'active' ? 'bg-amber-500/10 text-amber-400' :
                    a.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'
                  }`}>{a.status === 'completed' ? 'مكتمل' : a.status === 'active' ? 'نشط' : a.status === 'cancelled' ? 'ملغي' : 'مخطط'}</span>
                ])}
              />

              {financial.monthlyRevenue?.length > 0 && (
                <>
                  <SectionTitle title="الإيرادات الشهرية" icon="📆" />
                  <Table
                    headers={['الشهر', 'الإيرادات', 'عدد الحجوزات']}
                    rows={financial.monthlyRevenue.map((m: any) => [
                      m.month,
                      `${Number(m.revenue).toLocaleString()} د.ع`,
                      m.bookings,
                    ])}
                  />
                </>
              )}
            </motion.div>
          )}

          {/* ══ PLAYERS ══ */}
          {activeTab === 'players' && players && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="تقرير اللاعبين" icon="🎮" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon="👥" label="إجمالي اللاعبين" value={players.summary.total} color="blue" />
                <StatCard icon="🟢" label="لاعبون نشطون" value={players.summary.active} color="green" />
                <StatCard icon="🆕" label="جدد هذا الشهر" value={players.summary.newThisMonth} color="amber" />
                <StatCard icon="🔥" label="نشاط مرتفع" value={players.summary.highlyActive} color="purple" />
              </div>

              <SectionTitle title="توزيع الرتب" icon="🏆" />
              <div className="grid grid-cols-5 gap-3 mb-8">
                {players.rankDistribution?.map((r: any) => (
                  <div key={r.rank} className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 text-center">
                    <div className="text-3xl mb-2">{RANK_ICONS[r.rank] || '🎖️'}</div>
                    <p className="text-xs text-gray-400 mb-1">{RANK_AR[r.rank] || r.rank}</p>
                    <p className="text-2xl font-black text-white">{r.count}</p>
                    <p className="text-xs text-gray-600">متوسط {r.avgRR} RR</p>
                  </div>
                ))}
              </div>

              {players.monthlyGrowth?.length > 0 && (
                <>
                  <SectionTitle title="نمو قاعدة اللاعبين شهرياً" icon="📈" />
                  <Table
                    headers={['الشهر', 'لاعبون جدد']}
                    rows={players.monthlyGrowth.map((m: any) => [m.month, m.newPlayers])}
                  />
                </>
              )}

              <SectionTitle title="أفضل 20 لاعب" icon="⭐" />
              <Table
                headers={['#', 'اللاعب', 'الرتبة', 'المستوى', 'RR', 'المباريات', 'الانتصارات', 'آخر نشاط']}
                rows={players.topPlayers?.map((p: any, i: number) => [
                  i + 1,
                  p.name,
                  `${RANK_ICONS[p.rankTier]} ${RANK_AR[p.rankTier]}`,
                  p.level,
                  p.rankRR,
                  p.totalMatches || 0,
                  p.totalWins || 0,
                  p.lastActiveAt ? new Date(p.lastActiveAt).toLocaleDateString('ar-IQ') : '—',
                ])}
              />
            </motion.div>
          )}

          {/* ══ GAMES ══ */}
          {activeTab === 'games' && games && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="تقرير المباريات" icon="⚔️" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon="🎮" label="إجمالي المباريات" value={games.summary.total} color="blue" />
                <StatCard icon="🔴" label="فوز المافيا" value={`${games.summary.mafiaWins} (${games.summary.total > 0 ? Math.round(games.summary.mafiaWins/games.summary.total*100) : 0}%)`} color="red" />
                <StatCard icon="🔵" label="فوز المواطنين" value={`${games.summary.citizenWins} (${games.summary.total > 0 ? Math.round(games.summary.citizenWins/games.summary.total*100) : 0}%)`} color="blue" />
                <StatCard icon="⏱️" label="متوسط المدة" value={`${Math.round((games.summary.avgDuration || 0) / 60)} دقيقة`} color="amber" />
                <StatCard icon="👥" label="متوسط اللاعبين" value={games.summary.avgPlayers} color="purple" />
                <StatCard icon="🔄" label="متوسط الجولات" value={games.summary.avgRounds} color="green" />
                <StatCard icon="⭐" label="متوسط تقييم الليدر" value={`${games.leaderRatings?.avgRating || 0}/5`} sub={`من ${games.leaderRatings?.totalRatings || 0} تقييم`} color="amber" />
                <StatCard icon="📊" label="توازن اللعبة" value={`${games.summary.total > 0 ? Math.round(games.summary.mafiaWins/games.summary.total*100) : 0}% مافيا`}
                  sub={games.summary.total > 0 && Math.abs(50 - Math.round(games.summary.mafiaWins/games.summary.total*100)) < 10 ? '✅ متوازنة' : '⚠️ غير متوازنة'} color="blue" />
              </div>

              <SectionTitle title="توزيع الأدوار والأداء" icon="🃏" />
              <Table
                headers={['الدور', 'مرات اللعب', 'نجاة', 'استخدام قدرة', 'قدرة صحيحة', 'صفقات', 'صفقات ناجحة']}
                rows={games.roleDistribution?.map((r: any) => [
                  ROLE_AR[r.role] || r.role,
                  r.count,
                  `${r.survived} (${r.count > 0 ? Math.round(r.survived/r.count*100) : 0}%)`,
                  r.abilityUsed,
                  r.abilityCorrect,
                  r.dealInitiated,
                  r.dealSuccess,
                ])}
              />

              {games.byDayOfWeek?.length > 0 && (
                <>
                  <SectionTitle title="المباريات حسب يوم الأسبوع" icon="📅" />
                  <div className="grid grid-cols-7 gap-2 mb-6">
                    {['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map((day, i) => {
                      const found = games.byDayOfWeek?.find((d: any) => d.dayNum === i);
                      return (
                        <div key={day} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-500 mb-1">{day}</p>
                          <p className="text-xl font-black text-amber-400">{found?.count || 0}</p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ══ LOCATIONS ══ */}
          {activeTab === 'locations' && locations && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="تقرير المواقع" icon="📍" />
              <Table
                headers={['الموقع', 'الأنشطة', 'مكتملة', 'الإيرادات', 'الحضور', 'نسبة الإشغال', 'اختباري']}
                rows={locations.locations?.map((l: any) => [
                  l.name,
                  l.totalActivities,
                  l.completedActivities,
                  `${Number(l.totalRevenue).toLocaleString()} د.ع`,
                  l.totalAttendees,
                  <div key="occ" className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${l.occupancyRate}%` }} />
                    </div>
                    <span>{l.occupancyRate}%</span>
                  </div>,
                  l.isTest ? <span key="t" className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded">اختباري</span> : '—',
                ])}
              />
            </motion.div>
          )}

          {/* ══ SESSIONS ══ */}
          {activeTab === 'sessions' && sessionsData && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="تقرير الجلسات والغرف" icon="🏠" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon="🏠" label="إجمالي الغرف" value={sessionsData.summary.total} color="blue" />
                <StatCard icon="🟢" label="نشطة" value={sessionsData.summary.active} color="green" />
                <StatCard icon="🔒" label="مغلقة" value={sessionsData.summary.closed} color="amber" />
                <StatCard icon="🎮" label="متوسط المباريات/جلسة" value={sessionsData.summary.avgMatchesPerSession} color="purple" />
              </div>

              {sessionsData.topLeaders?.length > 0 && (
                <>
                  <SectionTitle title="أكثر الليدرات إدارة للغرف" icon="👑" />
                  <Table
                    headers={['الليدر', 'عدد الغرف']}
                    rows={sessionsData.topLeaders.map((l: any) => [
                      l.displayName || `موظف #${l.staffId}`,
                      l.sessionCount,
                    ])}
                  />
                </>
              )}

              {sessionsData.monthly?.length > 0 && (
                <>
                  <SectionTitle title="الجلسات حسب الشهر" icon="📆" />
                  <Table
                    headers={['الشهر', 'عدد الجلسات']}
                    rows={sessionsData.monthly.map((m: any) => [m.month, m.count])}
                  />
                </>
              )}
            </motion.div>
          )}

          {/* ══ PARTNERS ══ */}
          {activeTab === 'partners' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="تقرير الشركاء" icon="🤝" />
              {partners && partners.length > 0 ? (
                <Table
                  headers={['الشريك', 'الدور', 'الإيرادات', 'التكاليف', 'صافي الربح', 'الحجوزات', 'الحالة']}
                  rows={partners.map((p: any) => [
                    p.name,
                    p.role,
                    `${Number(p.revenue).toLocaleString()} د.ع`,
                    `${Number(p.costs).toLocaleString()} د.ع`,
                    <span key="pr" className={p.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {Number(p.profit).toLocaleString()} د.ع
                    </span>,
                    p.bookings,
                    p.isActive
                      ? <span key="a" className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded">نشط</span>
                      : <span key="i" className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded">غير نشط</span>,
                  ])}
                />
              ) : (
                <p className="text-center text-gray-600 py-10 text-sm">لا يوجد شركاء مسجلين حالياً</p>
              )}
            </motion.div>
          )}

          {/* ══ AUDIT ══ */}
          {activeTab === 'audit' && audit && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <SectionTitle title="سجل العمليات" icon="📜" />

              {audit.byAction?.length > 0 && (
                <>
                  <SectionTitle title="العمليات حسب النوع" icon="📊" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {audit.byAction.map((a: any) => (
                      <div key={a.action} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">{a.action}</p>
                        <p className="text-xl font-black text-amber-400">{a.count}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <SectionTitle title="آخر 100 عملية" icon="🗓️" />
              <Table
                headers={['الوقت', 'الإجراء', 'الكيان', 'ID', 'المستخدم']}
                rows={audit.recentLogs?.map((l: any) => [
                  new Date(l.timestamp).toLocaleString('ar-IQ'),
                  l.action,
                  l.entity,
                  l.entityId || '—',
                  l.userId || '—',
                ])}
              />
            </motion.div>
          )}
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
