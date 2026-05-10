'use client';
// ══════════════════════════════════════════════════════
// 📊 Report Renderers — دالة عرض لكل تقرير
// كل تقرير يستقبل data من الـ API ويعيد JSX
// ══════════════════════════════════════════════════════

import React from 'react';
import { StatCard, SectionTitle, DataTable } from './shared';
import { RANK_AR, RANK_ICONS, ROLE_AR } from '../registry';

// ═══ KPI ═══
export function renderKPI(data: any) {
  const k = data.kpis;
  if (!k) return <p className="text-gray-500 text-center py-8">لا توجد بيانات</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard icon="💰" label="إيرادات هذا الشهر" value={`${k.revenueThisMonth?.toLocaleString()} د.ع`}
        sub={`${k.revenueGrowth >= 0 ? '+' : ''}${k.revenueGrowth}% عن الشهر الماضي`} color="amber" />
      <StatCard icon="📅" label="حجوزات هذا الشهر" value={k.bookingsThisMonth} sub={`${k.attendeesThisMonth} حاضر`} color="green" />
      <StatCard icon="⚠️" label="مبالغ معلقة" value={`${Number(k.unpaidAmount)?.toLocaleString()} د.ع`} color="red" />
      <StatCard icon="🎮" label="إجمالي المباريات" value={k.totalMatches} sub={`${k.matchesThisMonth} هذا الشهر`} color="blue" />
      <StatCard icon="👥" label="إجمالي اللاعبين" value={k.totalPlayers} sub={`${k.newPlayersThisMonth} جديد هذا الشهر`} color="purple" />
      <StatCard icon="🎯" label="نسبة إنجاز الأنشطة" value={`${k.completionRate}%`} sub={`${k.completedActivities} من ${k.totalActivities}`} color="green" />
      <StatCard icon="⚖️" label="توازن اللعبة (مافيا)" value={`${k.mafiaWinRate}%`}
        sub={k.mafiaWinRate >= 45 && k.mafiaWinRate <= 55 ? '✅ متوازنة' : '⚠️ تحتاج مراجعة'} color="amber" />
      <StatCard icon="⭐" label="تقييم الليدر" value={`${k.avgLeaderRating}/5`} color="blue" />
    </div>
  );
}

// ═══ FINANCIAL: Revenue Overview ═══
export function renderRevenueOverview(data: any) {
  const s = data.summary;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard icon="💰" label="إجمالي الإيرادات" value={`${Number(s.totalRevenue)?.toLocaleString()} د.ع`} color="green" />
      <StatCard icon="📉" label="إجمالي التكاليف" value={`${Number(s.totalCosts)?.toLocaleString()} د.ع`} sub={`تشغيلية: ${Number(s.operationalCosts)?.toLocaleString()} | تأسيسية: ${Number(s.foundationalCosts)?.toLocaleString()}`} color="red" />
      <StatCard icon="📈" label="صافي الربح" value={`${Number(s.netProfit)?.toLocaleString()} د.ع`} sub={`هامش ${s.profitMargin}%`} color="amber" />
      <StatCard icon="⚠️" label="مبالغ معلقة" value={`${Number(s.unpaidAmount)?.toLocaleString()} د.ع`} sub={`${s.unpaidBookings} حجز`} color="red" />
    </div>
  );
}

// ═══ FINANCIAL: Activity Performance ═══
export function renderActivityPerformance(data: any) {
  return (
    <DataTable
      headers={['النشاط', 'التاريخ', 'الإيرادات', 'التكاليف', 'الربح', 'الحضور', 'الإشغال', 'الحالة']}
      rows={data.activityFinancials?.map((a: any) => [
        a.name,
        new Date(a.date).toLocaleDateString('ar-IQ'),
        `${Number(a.revenue).toLocaleString()} د.ع`,
        `${Number(a.activityCost).toLocaleString()} د.ع`,
        <span key="p" className={a.profit >= 0 ? 'text-emerald-400 print:text-green-700' : 'text-rose-400 print:text-red-700'}>{Number(a.profit).toLocaleString()} د.ع</span>,
        a.totalAttendees,
        `${a.occupancyRate}%`,
        <span key="s" className={`px-2 py-0.5 rounded text-xs ${a.status === 'completed' ? 'bg-green-500/10 text-green-400' : a.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
          {a.status === 'completed' ? 'مكتمل' : a.status === 'cancelled' ? 'ملغي' : a.status === 'active' ? 'نشط' : 'مخطط'}
        </span>,
      ]) || []}
    />
  );
}

// ═══ FINANCIAL: Bookings Status ═══
export function renderBookingsStatus(data: any) {
  const s = data.summary;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard icon="📅" label="إجمالي الحجوزات" value={s.totalBookings} color="blue" />
      <StatCard icon="✅" label="مدفوعة" value={s.paidBookings} color="green" />
      <StatCard icon="⚠️" label="غير مدفوعة" value={s.unpaidBookings} sub={`${Number(s.unpaidAmount)?.toLocaleString()} د.ع`} color="red" />
      <StatCard icon="🎁" label="مجانية" value={s.freeBookings} color="purple" />
      <StatCard icon="👥" label="إجمالي الحضور" value={s.totalAttendees} color="amber" />
    </div>
  );
}

// ═══ FINANCIAL: Monthly Revenue ═══
export function renderMonthlyRevenue(data: any) {
  return (
    <DataTable
      headers={['الشهر', 'الإيرادات', 'عدد الحجوزات']}
      rows={data.monthlyRevenue?.map((m: any) => [m.month, `${Number(m.revenue).toLocaleString()} د.ع`, m.bookings]) || []}
    />
  );
}

// ═══ PLAYERS: Active Players ═══
export function renderActivePlayers(data: any) {
  const s = data.summary;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard icon="👥" label="إجمالي اللاعبين" value={s.total} color="blue" />
      <StatCard icon="🟢" label="نشطون (لعبوا مباراة+)" value={s.active} sub={`${s.total > 0 ? Math.round(s.active / s.total * 100) : 0}% من الكل`} color="green" />
      <StatCard icon="🆕" label="جدد هذا الشهر" value={s.newThisMonth} color="amber" />
      <StatCard icon="🔥" label="نشاط مرتفع" value={s.highlyActive} sub="10+ مباريات آخر 30 يوم" color="purple" />
    </div>
  );
}

// ═══ PLAYERS: Rank Distribution ═══
export function renderRankDistribution(data: any) {
  return (
    <div className="grid grid-cols-5 gap-3">
      {data.rankDistribution?.map((r: any) => (
        <div key={r.rank} className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 text-center print:border-gray-300 print:bg-gray-50">
          <div className="text-3xl mb-2">{RANK_ICONS[r.rank] || '🎖️'}</div>
          <p className="text-xs text-gray-400 print:text-gray-600 mb-1">{RANK_AR[r.rank] || r.rank}</p>
          <p className="text-2xl font-black text-white print:text-black">{r.count}</p>
          <p className="text-[10px] text-gray-600">متوسط {r.avgRR} RR</p>
        </div>
      ))}
    </div>
  );
}

// ═══ PLAYERS: Top Players ═══
export function renderTopPlayers(data: any) {
  return (
    <DataTable
      headers={['#', 'اللاعب', 'الرتبة', 'المستوى', 'RR', 'المباريات', 'الانتصارات', 'آخر نشاط']}
      rows={data.topPlayers?.map((p: any, i: number) => [
        i + 1, p.name, `${RANK_ICONS[p.rankTier] || ''} ${RANK_AR[p.rankTier] || p.rankTier}`,
        p.level, p.rankRR, p.totalMatches || 0, p.totalWins || 0,
        p.lastActiveAt ? new Date(p.lastActiveAt).toLocaleDateString('ar-IQ') : '—',
      ]) || []}
    />
  );
}

// ═══ PLAYERS: Growth ═══
export function renderPlayerGrowth(data: any) {
  return (
    <DataTable
      headers={['الشهر', 'لاعبون جدد']}
      rows={data.monthlyGrowth?.map((m: any) => [m.month, m.newPlayers]) || []}
    />
  );
}

// ═══ GAMES: Match Results ═══
export function renderMatchResults(data: any) {
  const s = data.summary;
  const mafPct = s.total > 0 ? Math.round(s.mafiaWins / s.total * 100) : 0;
  const citPct = s.total > 0 ? Math.round(s.citizenWins / s.total * 100) : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard icon="🎮" label="إجمالي المباريات" value={s.total} color="blue" />
      <StatCard icon="🔴" label="فوز المافيا" value={`${s.mafiaWins} (${mafPct}%)`} color="red" />
      <StatCard icon="🔵" label="فوز المواطنين" value={`${s.citizenWins} (${citPct}%)`} color="blue" />
      <StatCard icon="⏱️" label="متوسط المدة" value={`${Math.round((s.avgDuration || 0) / 60)} دقيقة`} color="amber" />
      <StatCard icon="👥" label="متوسط اللاعبين" value={s.avgPlayers || 0} color="purple" />
      <StatCard icon="🔄" label="متوسط الجولات" value={s.avgRounds || 0} color="green" />
      <StatCard icon="⚖️" label="توازن اللعبة" value={`${mafPct}% مافيا`}
        sub={Math.abs(50 - mafPct) < 10 ? '✅ متوازنة' : '⚠️ غير متوازنة'} color="amber" />
    </div>
  );
}

// ═══ GAMES: Role Distribution ═══
export function renderRoleDistribution(data: any) {
  return (
    <DataTable
      headers={['الدور', 'مرات اللعب', 'نجاة', 'استخدام قدرة', 'قدرة صحيحة', 'صفقات', 'صفقات ناجحة']}
      rows={data.roleDistribution?.map((r: any) => [
        ROLE_AR[r.role] || r.role, r.count,
        `${r.survived} (${r.count > 0 ? Math.round(r.survived / r.count * 100) : 0}%)`,
        r.abilityUsed, r.abilityCorrect, r.dealInitiated, r.dealSuccess,
      ]) || []}
    />
  );
}

// ═══ GAMES: Play Trends ═══
export function renderPlayTrends(data: any) {
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const maxCount = Math.max(...(data.byDayOfWeek?.map((d: any) => d.count) || [1]));
  return (
    <>
      <div className="grid grid-cols-7 gap-2 mb-6">
        {days.map((day, i) => {
          const found = data.byDayOfWeek?.find((d: any) => d.dayNum === i);
          const count = found?.count || 0;
          const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
          return (
            <div key={day} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-center print:border-gray-300 print:bg-gray-50">
              <p className="text-[10px] text-gray-500 mb-1">{day}</p>
              <p className="text-xl font-black text-amber-400 print:text-amber-600">{count}</p>
              <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden print:bg-gray-200">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {data.monthly?.length > 0 && (
        <>
          <SectionTitle title="المباريات الشهرية" icon="📆" />
          <DataTable
            headers={['الشهر', 'المباريات', 'فوز مافيا', 'فوز مواطنين']}
            rows={data.monthly.map((m: any) => [m.month, m.count, m.mafiaWins, m.citizenWins])}
          />
        </>
      )}
    </>
  );
}

// ═══ GAMES: Leader Ratings ═══
export function renderLeaderRatings(data: any) {
  const r = data.leaderRatings;
  if (!r) return <p className="text-gray-500 text-center py-8">لا توجد تقييمات</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard icon="⭐" label="متوسط التقييم" value={`${r.avgRating || 0}/5`} color="amber" />
      <StatCard icon="📊" label="إجمالي التقييمات" value={r.totalRatings} color="blue" />
      <StatCard icon="😊" label="إيجابية (4+)" value={r.good} color="green" />
      <StatCard icon="😐" label="متوسطة (3)" value={r.avg} color="amber" />
      <StatCard icon="😞" label="سلبية (1-2)" value={r.poor} color="red" />
    </div>
  );
}

// ═══ OPERATIONS: Sessions ═══
export function renderSessions(data: any) {
  const s = data.summary;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon="🏠" label="إجمالي الغرف" value={s.total} color="blue" />
        <StatCard icon="🟢" label="نشطة" value={s.active} color="green" />
        <StatCard icon="🔒" label="مغلقة" value={s.closed} color="amber" />
        <StatCard icon="🎮" label="متوسط مباريات/جلسة" value={s.avgMatchesPerSession} color="purple" />
      </div>
      {data.topLeaders?.length > 0 && (
        <>
          <SectionTitle title="أكثر الليدرات إدارة للغرف" icon="👑" />
          <DataTable
            headers={['الليدر', 'عدد الغرف']}
            rows={data.topLeaders.map((l: any) => [l.displayName || `موظف #${l.staffId}`, l.sessionCount])}
          />
        </>
      )}
      {data.monthly?.length > 0 && (
        <>
          <SectionTitle title="الجلسات حسب الشهر" icon="📆" />
          <DataTable headers={['الشهر', 'عدد الجلسات']} rows={data.monthly.map((m: any) => [m.month, m.count])} />
        </>
      )}
    </>
  );
}

// ═══ OPERATIONS: Location Performance ═══
export function renderLocations(data: any) {
  return (
    <DataTable
      headers={['الموقع', 'الأنشطة', 'مكتملة', 'الإيرادات', 'الحضور', 'نسبة الإشغال', 'اختباري']}
      rows={data.locations?.map((l: any) => [
        l.name, l.totalActivities, l.completedActivities,
        `${Number(l.totalRevenue).toLocaleString()} د.ع`, l.totalAttendees,
        <div key="o" className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden print:bg-gray-200">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${l.occupancyRate}%` }} />
          </div>
          <span className="text-xs">{l.occupancyRate}%</span>
        </div>,
        l.isTest ? <span key="t" className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded">اختباري</span> : '—',
      ]) || []}
    />
  );
}

// ═══ OPERATIONS: Partners ═══
export function renderPartners(data: any) {
  const p = data.partners || data;
  if (!p?.length) return <p className="text-gray-500 text-center py-8">لا يوجد شركاء مسجلين</p>;
  return (
    <DataTable
      headers={['الشريك', 'الدور', 'الإيرادات', 'التكاليف', 'صافي الربح', 'الحجوزات', 'الحالة']}
      rows={p.map((pr: any) => [
        pr.name, pr.role, `${Number(pr.revenue).toLocaleString()} د.ع`, `${Number(pr.costs).toLocaleString()} د.ع`,
        <span key="p" className={pr.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{Number(pr.profit).toLocaleString()} د.ع</span>,
        pr.bookings,
        pr.isActive
          ? <span key="a" className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded">نشط</span>
          : <span key="i" className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded">غير نشط</span>,
      ])}
    />
  );
}

// ═══ OPERATIONS: Audit Trail ═══
export function renderAudit(data: any) {
  return (
    <>
      {data.byAction?.length > 0 && (
        <>
          <SectionTitle title="العمليات حسب النوع" icon="📊" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {data.byAction.map((a: any) => (
              <div key={a.action} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-center print:border-gray-300 print:bg-gray-50">
                <p className="text-[10px] text-gray-500 mb-1">{a.action}</p>
                <p className="text-xl font-black text-amber-400 print:text-amber-600">{a.count}</p>
              </div>
            ))}
          </div>
        </>
      )}
      <SectionTitle title="آخر 100 عملية" icon="🗓️" />
      <DataTable
        headers={['الوقت', 'الإجراء', 'الكيان', 'ID', 'المستخدم']}
        rows={data.recentLogs?.map((l: any) => [
          new Date(l.timestamp).toLocaleString('ar-IQ'), l.action, l.entity, l.entityId || '—', l.userId || '—',
        ]) || []}
      />
    </>
  );
}

// ═══ Map report ID → render function ═══
export const REPORT_RENDERERS: Record<string, (data: any) => React.ReactNode> = {
  'dashboard-kpis': renderKPI,
  'revenue-overview': renderRevenueOverview,
  'activity-performance': renderActivityPerformance,
  'bookings-status': renderBookingsStatus,
  'monthly-revenue': renderMonthlyRevenue,
  'active-players': renderActivePlayers,
  'rank-distribution': renderRankDistribution,
  'top-players': renderTopPlayers,
  'player-growth': renderPlayerGrowth,
  'match-results': renderMatchResults,
  'role-distribution': renderRoleDistribution,
  'play-trends': renderPlayTrends,
  'leader-ratings': renderLeaderRatings,
  'sessions-rooms': renderSessions,
  'location-performance': renderLocations,
  'partners-report': renderPartners,
  'audit-trail': renderAudit,
};
