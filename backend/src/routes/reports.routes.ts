// ══════════════════════════════════════════════════════
// 📊 Reports API — All reports for the admin dashboard
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { sql, desc, eq, and, gte, lte, count, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings, costs, foundationalCosts, staff, locations, auditLog } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { matches, matchPlayers, sessions, surveys } from '../schemas/game.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── مساعد لحساب التواريخ ──
function getDateRange(period: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  let from = new Date(now);

  switch (period) {
    case 'week':
      from.setDate(from.getDate() - 7);
      break;
    case 'month':
      from.setMonth(from.getMonth() - 1);
      break;
    case 'quarter':
      from.setMonth(from.getMonth() - 3);
      break;
    case 'year':
      from.setFullYear(from.getFullYear() - 1);
      break;
    default: // all
      from = new Date('2020-01-01');
  }
  return { from, to };
}

// ═══════════════════════════════════════════
// GET /api/reports/financial
// التقرير المالي الشامل
// ═══════════════════════════════════════════
router.get('/financial', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { from, to } = getDateRange(req.query.period as string || 'all');

  try {
    // إجمالي الإيرادات
    const [revenue] = await db.select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      paidCount: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN 1 ELSE 0 END), 0)::int`,
      freeCount: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isFree} = true THEN 1 ELSE 0 END), 0)::int`,
      unpaidCount: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN 1 ELSE 0 END), 0)::int`,
      unpaidAmount: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      totalAttendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      totalBookings: sql<number>`COUNT(*)::int`,
    }).from(bookings)
      .where(and(gte(bookings.createdAt, from), lte(bookings.createdAt, to), isNull(bookings.deletedAt)));

    // التكاليف التشغيلية
    const [opCosts] = await db.select({
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(costs)
      .where(and(gte(costs.date, from), lte(costs.date, to), isNull(costs.deletedAt)));

    // التكاليف التأسيسية
    const [foundCosts] = await db.select({
      total: sql<number>`COALESCE(SUM(${foundationalCosts.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(foundationalCosts)
      .where(and(gte(foundationalCosts.date, from), lte(foundationalCosts.date, to), isNull(foundationalCosts.deletedAt)));

    // الإيرادات حسب الشهر (آخر 12 شهر)
    const monthlyRevenue = await db.select({
      month: sql<string>`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      bookings: sql<number>`COUNT(*)::int`,
    }).from(bookings)
      .where(isNull(bookings.deletedAt))
      .groupBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`);

    // أداء كل نشاط مالياً
    const activityFinancials = await db.select({
      id: activities.id,
      name: activities.name,
      date: activities.date,
      status: activities.status,
      basePrice: activities.basePrice,
      maxCapacity: activities.maxCapacity,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      totalAttendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      paidBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true THEN 1 ELSE 0 END), 0)::int`,
      unpaidBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN 1 ELSE 0 END), 0)::int`,
      freeBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isFree} = true THEN 1 ELSE 0 END), 0)::int`,
    }).from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .where(and(gte(activities.date, from), lte(activities.date, to), isNull(activities.deletedAt)))
      .groupBy(activities.id, activities.name, activities.date, activities.status, activities.basePrice, activities.maxCapacity)
      .orderBy(desc(activities.date));

    // أداء كل نشاط مع التكاليف
    const activityCosts = await db.select({
      activityId: costs.activityId,
      totalCost: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs)
      .where(and(sql`${costs.activityId} IS NOT NULL`, gte(costs.date, from), lte(costs.date, to), isNull(costs.deletedAt)))
      .groupBy(costs.activityId);

    const costsMap = new Map(activityCosts.map(c => [c.activityId, Number(c.totalCost)]));

    const enrichedActivities = activityFinancials.map(a => ({
      ...a,
      revenue: Number(a.revenue),
      activityCost: costsMap.get(a.id) || 0,
      profit: Number(a.revenue) - (costsMap.get(a.id) || 0),
      occupancyRate: a.maxCapacity && a.maxCapacity > 0
        ? Math.round((Number(a.totalAttendees) / a.maxCapacity) * 100)
        : 0,
    }));

    const totalRevenue = Number(revenue.total);
    const totalCosts = Number(opCosts.total) + Number(foundCosts.total);

    res.json({
      success: true,
      summary: {
        totalRevenue,
        totalCosts,
        operationalCosts: Number(opCosts.total),
        foundationalCosts: Number(foundCosts.total),
        netProfit: totalRevenue - totalCosts,
        profitMargin: totalRevenue > 0 ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 100) : 0,
        totalBookings: revenue.totalBookings,
        paidBookings: revenue.paidCount,
        freeBookings: revenue.freeCount,
        unpaidBookings: revenue.unpaidCount,
        unpaidAmount: Number(revenue.unpaidAmount),
        totalAttendees: revenue.totalAttendees,
      },
      monthlyRevenue,
      activityFinancials: enrichedActivities,
    });
  } catch (err: any) {
    console.error('❌ Financial report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/reports/players
// تقرير اللاعبين
// ═══════════════════════════════════════════
router.get('/players', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { from } = getDateRange(req.query.period as string || 'all');

  try {
    // ملخص اللاعبين
    const [summary] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COALESCE(SUM(CASE WHEN ${players.totalMatches} > 0 THEN 1 ELSE 0 END), 0)::int`,
      newThisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${players.createdAt} >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)::int`,
      highlyActive: sql<number>`COALESCE(SUM(CASE WHEN ${players.totalMatches} >= 10 AND ${players.lastActiveAt} >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)::int`,
    }).from(players);

    // توزيع الرتب
    const rankDistribution = await db.select({
      rank: players.rankTier,
      count: sql<number>`COUNT(*)::int`,
      avgRR: sql<number>`ROUND(AVG(${players.rankRR}))::int`,
    }).from(players)
      .groupBy(players.rankTier);

    // نمو اللاعبين شهرياً
    const monthlyGrowth = await db.select({
      month: sql<string>`TO_CHAR(${players.createdAt}, 'YYYY-MM')`,
      newPlayers: sql<number>`COUNT(*)::int`,
    }).from(players)
      .where(gte(players.createdAt, from))
      .groupBy(sql`TO_CHAR(${players.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${players.createdAt}, 'YYYY-MM')`);

    // أفضل 20 لاعب
    const topPlayers = await db.select({
      id: players.id,
      name: players.name,
      phone: players.phone,
      level: players.level,
      rankTier: players.rankTier,
      rankRR: players.rankRR,
      xp: players.xp,
      totalMatches: players.totalMatches,
      totalWins: players.totalWins,
      lastActiveAt: players.lastActiveAt,
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
      ).limit(20);

    res.json({
      success: true,
      summary,
      rankDistribution,
      monthlyGrowth,
      topPlayers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/reports/games
// تقرير المباريات
// ═══════════════════════════════════════════
router.get('/games', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { from, to } = getDateRange(req.query.period as string || 'all');

  try {
    // ملخص المباريات
    const [summary] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      mafiaWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'MAFIA' THEN 1 ELSE 0 END), 0)::int`,
      citizenWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'CITIZEN' THEN 1 ELSE 0 END), 0)::int`,
      avgDuration: sql<number>`ROUND(AVG(${matches.durationSeconds}))::int`,
      avgPlayers: sql<number>`ROUND(AVG(${matches.playerCount}))::int`,
      avgRounds: sql<number>`ROUND(AVG(${matches.totalRounds}))::int`,
    }).from(matches)
      .where(and(gte(matches.createdAt, from), lte(matches.createdAt, to)));

    // المباريات حسب اليوم من الأسبوع
    const byDayOfWeek = await db.select({
      day: sql<string>`TO_CHAR(${matches.createdAt}, 'Day')`,
      dayNum: sql<number>`EXTRACT(DOW FROM ${matches.createdAt})::int`,
      count: sql<number>`COUNT(*)::int`,
    }).from(matches)
      .where(and(gte(matches.createdAt, from), lte(matches.createdAt, to)))
      .groupBy(sql`TO_CHAR(${matches.createdAt}, 'Day')`, sql`EXTRACT(DOW FROM ${matches.createdAt})`)
      .orderBy(sql`EXTRACT(DOW FROM ${matches.createdAt})`);

    // المباريات حسب الشهر
    const monthly = await db.select({
      month: sql<string>`TO_CHAR(${matches.createdAt}, 'YYYY-MM')`,
      count: sql<number>`COUNT(*)::int`,
      mafiaWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'MAFIA' THEN 1 ELSE 0 END), 0)::int`,
      citizenWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'CITIZEN' THEN 1 ELSE 0 END), 0)::int`,
    }).from(matches)
      .where(and(gte(matches.createdAt, from), lte(matches.createdAt, to)))
      .groupBy(sql`TO_CHAR(${matches.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${matches.createdAt}, 'YYYY-MM')`);

    // توزيع الأدوار
    const roleDistribution = await db.select({
      role: matchPlayers.role,
      count: sql<number>`COUNT(*)::int`,
      abilityUsed: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.abilityUsed} = true THEN 1 ELSE 0 END), 0)::int`,
      abilityCorrect: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.abilityCorrect} = true THEN 1 ELSE 0 END), 0)::int`,
      dealInitiated: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.dealInitiated} = true THEN 1 ELSE 0 END), 0)::int`,
      dealSuccess: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.dealSuccess} = true THEN 1 ELSE 0 END), 0)::int`,
      survived: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.survivedToEnd} = true THEN 1 ELSE 0 END), 0)::int`,
    }).from(matchPlayers)
      .groupBy(matchPlayers.role)
      .orderBy(desc(sql`COUNT(*)`));

    // تقييمات الليدر
    const [leaderRatings] = await db.select({
      avgRating: sql<number>`ROUND(AVG(${surveys.leaderRating}), 1)`,
      totalRatings: sql<number>`COUNT(*)::int`,
      poor: sql<number>`COALESCE(SUM(CASE WHEN ${surveys.leaderRating} <= 2 THEN 1 ELSE 0 END), 0)::int`,
      avg: sql<number>`COALESCE(SUM(CASE WHEN ${surveys.leaderRating} = 3 THEN 1 ELSE 0 END), 0)::int`,
      good: sql<number>`COALESCE(SUM(CASE WHEN ${surveys.leaderRating} >= 4 THEN 1 ELSE 0 END), 0)::int`,
    }).from(surveys);

    res.json({
      success: true,
      summary,
      byDayOfWeek,
      monthly,
      roleDistribution,
      leaderRatings,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/reports/locations
// تقرير المواقع
// ═══════════════════════════════════════════
router.get('/locations', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { from, to } = getDateRange(req.query.period as string || 'all');

  try {
    const locationStats = await db.select({
      id: locations.id,
      name: locations.name,
      isTest: locations.isTestLocation,
      totalActivities: sql<number>`COUNT(DISTINCT ${activities.id})::int`,
      completedActivities: sql<number>`COALESCE(SUM(CASE WHEN ${activities.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
      totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      totalAttendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      totalCapacity: sql<number>`COALESCE(SUM(${activities.maxCapacity}), 0)::int`,
    }).from(locations)
      .leftJoin(activities, and(eq(activities.locationId, locations.id), gte(activities.date, from), lte(activities.date, to)))
      .leftJoin(bookings, eq(bookings.activityId, activities.id))
      .groupBy(locations.id, locations.name, locations.isTestLocation)
      .orderBy(desc(sql`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`));

    res.json({
      success: true,
      locations: locationStats.map(l => ({
        ...l,
        totalRevenue: Number(l.totalRevenue),
        occupancyRate: l.totalCapacity > 0
          ? Math.round((l.totalAttendees / l.totalCapacity) * 100)
          : 0,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/reports/kpi
// مؤشرات الأداء الرئيسية KPIs
// ═══════════════════════════════════════════
router.get('/kpi', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const lastMonthEnd = new Date(thisMonthStart);

    // هذا الشهر
    const [thisMonth] = await db.select({
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      bookings: sql<number>`COUNT(*)::int`,
      attendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
    }).from(bookings).where(and(gte(bookings.createdAt, thisMonthStart), isNull(bookings.deletedAt)));

    // الشهر الماضي (للمقارنة)
    const [lastMonth] = await db.select({
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      bookings: sql<number>`COUNT(*)::int`,
    }).from(bookings).where(and(gte(bookings.createdAt, lastMonthStart), lte(bookings.createdAt, lastMonthEnd), isNull(bookings.deletedAt)));

    const [gameStats] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      mafiaWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'MAFIA' THEN 1 ELSE 0 END), 0)::int`,
      thisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${matches.createdAt} >= ${thisMonthStart} THEN 1 ELSE 0 END), 0)::int`,
    }).from(matches);

    const [playerStats] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COALESCE(SUM(CASE WHEN ${players.totalMatches} > 0 THEN 1 ELSE 0 END), 0)::int`,
      newThisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${players.createdAt} >= ${thisMonthStart} THEN 1 ELSE 0 END), 0)::int`,
    }).from(players);

    const [ratingStats] = await db.select({
      avg: sql<number>`ROUND(AVG(${surveys.leaderRating}), 1)`,
    }).from(surveys);

    const [activityStats] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      completed: sql<number>`COALESCE(SUM(CASE WHEN ${activities.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
      totalCapacity: sql<number>`COALESCE(SUM(${activities.maxCapacity}), 0)::int`,
    }).from(activities).where(isNull(activities.deletedAt));

    const revenueGrowth = Number(lastMonth.revenue) > 0
      ? Math.round(((Number(thisMonth.revenue) - Number(lastMonth.revenue)) / Number(lastMonth.revenue)) * 100)
      : 0;

    const mafiaWinRate = gameStats.total > 0
      ? Math.round((gameStats.mafiaWins / gameStats.total) * 100)
      : 0;

    const [unpaidSummary] = await db.select({
      unpaidAmount: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
    }).from(bookings).where(isNull(bookings.deletedAt));

    res.json({
      success: true,
      kpis: {
        revenueThisMonth: Number(thisMonth.revenue),
        revenueLastMonth: Number(lastMonth.revenue),
        revenueGrowth,
        bookingsThisMonth: thisMonth.bookings,
        attendeesThisMonth: thisMonth.attendees,
        unpaidAmount: Number(unpaidSummary.unpaidAmount),
        totalPlayers: playerStats.total,
        activePlayers: playerStats.active,
        newPlayersThisMonth: playerStats.newThisMonth,
        totalMatches: gameStats.total,
        matchesThisMonth: gameStats.thisMonth,
        mafiaWinRate,
        avgLeaderRating: Number(ratingStats.avg) || 0,
        totalActivities: activityStats.total,
        completedActivities: activityStats.completed,
        completionRate: activityStats.total > 0
          ? Math.round((activityStats.completed / activityStats.total) * 100) : 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/reports/sessions
// تقرير الجلسات والغرف (#7)
// ═══════════════════════════════════════════
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { from, to } = getDateRange(req.query.period as string || 'all');

  try {
    const [summary] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.status} = 'active' THEN 1 ELSE 0 END), 0)::int`,
      closed: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.status} = 'closed' THEN 1 ELSE 0 END), 0)::int`,
      deleted: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.status} = 'deleted' THEN 1 ELSE 0 END), 0)::int`,
      avgMaxPlayers: sql<number>`ROUND(AVG(${sessions.maxPlayers}))::int`,
    }).from(sessions)
      .where(and(gte(sessions.createdAt, from), lte(sessions.createdAt, to), isNull(sessions.deletedAt)));

    // متوسط المباريات لكل جلسة
    const matchesPerSession = await db.select({
      sessionId: matches.sessionId,
      matchCount: sql<number>`COUNT(*)::int`,
    }).from(matches)
      .where(and(gte(matches.createdAt, from), lte(matches.createdAt, to), sql`${matches.sessionId} IS NOT NULL`))
      .groupBy(matches.sessionId);

    const avgMatchesPerSession = matchesPerSession.length > 0
      ? Math.round(matchesPerSession.reduce((a, b) => a + b.matchCount, 0) / matchesPerSession.length)
      : 0;

    // أكثر الليدرات إدارة للغرف
    const topLeaders = await db.select({
      staffId: sessions.createdBy,
      displayName: staff.displayName,
      sessionCount: sql<number>`COUNT(${sessions.id})::int`,
    }).from(sessions)
      .leftJoin(staff, and(eq(staff.id, sessions.createdBy), isNull(staff.deletedAt)))
      .where(and(gte(sessions.createdAt, from), lte(sessions.createdAt, to), sql`${sessions.createdBy} IS NOT NULL`, isNull(sessions.deletedAt)))
      .groupBy(sessions.createdBy, staff.displayName)
      .orderBy(desc(sql`COUNT(${sessions.id})`))
      .limit(10);

    // الجلسات حسب الشهر
    const monthly = await db.select({
      month: sql<string>`TO_CHAR(${sessions.createdAt}, 'YYYY-MM')`,
      count: sql<number>`COUNT(*)::int`,
    }).from(sessions)
      .where(and(gte(sessions.createdAt, from), lte(sessions.createdAt, to), isNull(sessions.deletedAt)))
      .groupBy(sql`TO_CHAR(${sessions.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${sessions.createdAt}, 'YYYY-MM')`);

    res.json({
      success: true,
      summary: { ...summary, avgMatchesPerSession },
      topLeaders,
      monthly,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/reports/partners
// تقرير الشركاء (#16)
// ═══════════════════════════════════════════
router.get('/partners', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    // الشركاء
    const partners = await db.select({
      id: staff.id,
      name: staff.displayName,
      role: staff.role,
      isActive: staff.isActive,
    }).from(staff)
      .where(and(eq(staff.isPartner, true), isNull(staff.deletedAt)));

    // إيرادات الحجوزات حسب من أنشأها
    const revenueByCreator = await db.select({
      createdBy: bookings.createdBy,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      bookingCount: sql<number>`COUNT(*)::int`,
    }).from(bookings)
      .where(isNull(bookings.deletedAt))
      .groupBy(bookings.createdBy);

    // تكاليف حسب من دفعها
    const costsByPayer = await db.select({
      paidBy: costs.paidBy,
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs)
      .where(isNull(costs.deletedAt))
      .groupBy(costs.paidBy);

    const revenueMap = new Map(revenueByCreator.map(r => [r.createdBy, { revenue: Number(r.revenue), bookings: r.bookingCount }]));
    const costsMap = new Map(costsByPayer.map(c => [c.paidBy, Number(c.total)]));

    const enriched = partners.map(p => {
      const rev = revenueMap.get(p.name) || { revenue: 0, bookings: 0 };
      const cost = costsMap.get(p.name) || 0;
      return {
        ...p,
        revenue: rev.revenue,
        bookings: rev.bookings,
        costs: cost,
        profit: rev.revenue - cost,
      };
    });

    res.json({ success: true, partners: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/reports/audit
// سجل العمليات (#17)
// ═══════════════════════════════════════════
router.get('/audit', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { from, to } = getDateRange(req.query.period as string || 'month');

  try {
    // آخر 100 عملية
    const recentLogs = await db.select({
      id: auditLog.id,
      userId: auditLog.userId,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      details: auditLog.details,
      timestamp: auditLog.timestamp,
    }).from(auditLog)
      .where(and(gte(auditLog.timestamp, from), lte(auditLog.timestamp, to)))
      .orderBy(desc(auditLog.timestamp))
      .limit(100);

    // أكثر المستخدمين نشاطاً
    const topUsers = await db.select({
      userId: auditLog.userId,
      actionCount: sql<number>`COUNT(*)::int`,
    }).from(auditLog)
      .where(and(gte(auditLog.timestamp, from), lte(auditLog.timestamp, to)))
      .groupBy(auditLog.userId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    // العمليات حسب النوع
    const byAction = await db.select({
      action: auditLog.action,
      count: sql<number>`COUNT(*)::int`,
    }).from(auditLog)
      .where(and(gte(auditLog.timestamp, from), lte(auditLog.timestamp, to)))
      .groupBy(auditLog.action)
      .orderBy(desc(sql`COUNT(*)`));

    res.json({ success: true, recentLogs, topUsers, byAction });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
