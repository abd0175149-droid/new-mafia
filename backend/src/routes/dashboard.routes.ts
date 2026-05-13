
// ══════════════════════════════════════════════════════
// 📊 لوحة التحكم — Dashboard Stats API
// endpoint واحد يرجع كل الإحصاءات محسوبة بـ SQL
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, sql, desc, gte, and, lte } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings, costs, foundationalCosts, staff } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { matches } from '../schemas/game.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/dashboard/stats
router.get('/stats', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    // ── 1. إحصاءات مالية (الحجوزات) ──
    const [financeRow] = await db.select({
      totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      totalBookings: sql<number>`COUNT(*)::int`,
      paidBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN 1 ELSE 0 END), 0)::int`,
      freeBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isFree} = true THEN 1 ELSE 0 END), 0)::int`,
      unpaidBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN 1 ELSE 0 END), 0)::int`,
      totalAttendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      unpaidAmount: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
    }).from(bookings);

    // ── 2. تكاليف الأنشطة ──
    const [costRow] = await db.select({
      totalActivityCosts: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
      costCount: sql<number>`COUNT(*)::int`,
    }).from(costs);

    // ── 3. التكاليف التأسيسية ──
    const [foundRow] = await db.select({
      totalFoundational: sql<number>`COALESCE(SUM(${foundationalCosts.amount}::numeric), 0)`,
      foundationalCount: sql<number>`COUNT(*)::int`,
    }).from(foundationalCosts);

    // ── 4. الأنشطة حسب الحالة ──
    const activityStats = await db.select({
      status: activities.status,
      count: sql<number>`COUNT(*)::int`,
    }).from(activities).groupBy(activities.status);

    const actByStatus: Record<string, number> = {};
    let totalActivities = 0;
    for (const row of activityStats) {
      actByStatus[row.status] = row.count;
      totalActivities += row.count;
    }

    // ── 5. اللاعبون ──
    const [playerRow] = await db.select({
      totalPlayers: sql<number>`COUNT(*)::int`,
      activePlayers: sql<number>`COALESCE(SUM(CASE WHEN ${players.totalMatches} > 0 THEN 1 ELSE 0 END), 0)::int`,
    }).from(players);

    // ── 6. المباريات ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [matchRow] = await db.select({
      totalMatches: sql<number>`COUNT(*)::int`,
      todayMatches: sql<number>`COALESCE(SUM(CASE WHEN ${matches.createdAt} >= ${today} AND ${matches.createdAt} < ${tomorrow} THEN 1 ELSE 0 END), 0)::int`,
    }).from(matches);

    // ── 7. الموظفون ──
    const [staffRow] = await db.select({
      totalStaff: sql<number>`COUNT(*)::int`,
      activeStaff: sql<number>`COALESCE(SUM(CASE WHEN ${staff.isActive} = true THEN 1 ELSE 0 END), 0)::int`,
    }).from(staff);

    // ── 8. أنشطة هذا الأسبوع ──
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);

    const upcomingActivities = await db.select({
      id: activities.id,
      name: activities.name,
      date: activities.date,
      status: activities.status,
      basePrice: activities.basePrice,
    }).from(activities)
      .where(and(
        gte(activities.date, new Date()),
        lte(activities.date, weekEnd),
      ))
      .orderBy(activities.date)
      .limit(5);

    // ── 9. أفضل 5 لاعبين ──
    const topPlayers = await db.select({
      id: players.id,
      name: players.name,
      level: players.level,
      rankTier: players.rankTier,
      rankRR: players.rankRR,
      totalMatches: players.totalMatches,
      totalWins: players.totalWins,
      avatarUrl: players.avatarUrl,
    }).from(players)
      .orderBy(
        sql`CASE ${players.rankTier}
          WHEN 'GODFATHER' THEN 5
          WHEN 'UNDERBOSS' THEN 4
          WHEN 'CAPO' THEN 3
          WHEN 'SOLDIER' THEN 2
          WHEN 'INFORMANT' THEN 1
          ELSE 0 END DESC`,
        desc(players.rankRR),
        desc(players.level),
      )
      .limit(5);

    // ── 10. آخر 5 أنشطة ──
    const recentActivities = await db.select({
      id: activities.id,
      name: activities.name,
      date: activities.date,
      status: activities.status,
    }).from(activities)
      .orderBy(desc(activities.date))
      .limit(5);

    // ── 11. آخر 5 حجوزات ──
    const recentBookings = await db.select({
      id: bookings.id,
      name: bookings.name,
      phone: bookings.phone,
      count: bookings.count,
      isPaid: bookings.isPaid,
      isFree: bookings.isFree,
      paidAmount: bookings.paidAmount,
      activityId: bookings.activityId,
      createdAt: bookings.createdAt,
    }).from(bookings)
      .orderBy(desc(bookings.createdAt))
      .limit(5);

    // ── النتيجة النهائية ──
    const totalRevenue = Number(financeRow.totalRevenue) || 0;
    const totalActivityCosts = Number(costRow.totalActivityCosts) || 0;
    const totalFoundational = Number(foundRow.totalFoundational) || 0;
    const totalExpenses = totalActivityCosts + totalFoundational;

    res.json({
      success: true,
      // المالية
      finance: {
        totalRevenue,
        totalActivityCosts,
        totalFoundational,
        totalExpenses,
        netProfit: totalRevenue - totalActivityCosts,
        costCount: costRow.costCount,
        foundationalCount: foundRow.foundationalCount,
      },
      // الحجوزات
      bookings: {
        total: financeRow.totalBookings,
        paid: financeRow.paidBookings,
        free: financeRow.freeBookings,
        unpaid: financeRow.unpaidBookings,
        totalAttendees: financeRow.totalAttendees,
        unpaidAmount: Number(financeRow.unpaidAmount) || 0,
      },
      // الأنشطة
      activities: {
        total: totalActivities,
        active: actByStatus['active'] || 0,
        planned: actByStatus['planned'] || 0,
        completed: actByStatus['completed'] || 0,
        cancelled: actByStatus['cancelled'] || 0,
      },
      // اللاعبون
      players: {
        total: playerRow.totalPlayers,
        active: playerRow.activePlayers,
      },
      // المباريات
      matches: {
        total: matchRow.totalMatches,
        today: matchRow.todayMatches,
      },
      // الموظفون
      staff: {
        total: staffRow.totalStaff,
        active: staffRow.activeStaff,
      },
      // القوائم
      upcomingActivities,
      topPlayers,
      recentActivities,
      recentBookings,
    });
  } catch (err: any) {
    console.error('❌ Dashboard stats error:', err.message);
    res.status(500).json({ error: 'فشل تحميل الإحصاءات' });
  }
});

export default router;
