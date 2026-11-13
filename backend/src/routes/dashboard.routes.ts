
// ══════════════════════════════════════════════════════
// 📊 لوحة التحكم — Dashboard Stats API
// endpoint واحد يرجع كل الإحصاءات محسوبة بـ SQL
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, sql, desc, gte, and, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings, costs, foundationalCosts, staff, locations, cities, reservations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { matches } from '../schemas/game.schema.js';
import { playerSeasonStats } from '../schemas/season.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/** بدايةُ اليوم بتوقيت عمّان كلحظةٍ مطلقة — الخادم يعمل بـUTC، و«اليوم» عند الطاقم يومُ عمّان. */
function ammanDayStart(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Amman' })).getTime();
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - (local - utc));
}

const TIER_ORDER = (col: any) => sql`CASE ${col}
  WHEN 'GODFATHER' THEN 5
  WHEN 'UNDERBOSS' THEN 4
  WHEN 'CAPO' THEN 3
  WHEN 'SOLDIER' THEN 2
  WHEN 'INFORMANT' THEN 1
  ELSE 0 END DESC`;

// GET /api/dashboard/stats?cityId= — 🏙️ بلا مدينة: الإجماليّ + تقسيمٌ لكلّ مدينة؛ بمدينة: الأرقامُ لها وحدها
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const cityFilter = Number.isFinite(parseInt(String(req.query.cityId))) ? parseInt(String(req.query.cityId)) : null;
    // مجموعة الفعاليّات داخل النطاق (لتقييد الحجوزات والمباريات بالمدينة)
    const scopedActs = cityFilter
      ? sql`(SELECT a.id FROM activities a JOIN locations l ON l.id = a.location_id WHERE l.city_id = ${cityFilter})`
      : null;

    // ── 1. إحصاءات مالية (الحجوزات) ──
    const [financeRow] = await db.select({
      totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
      totalBookings: sql<number>`COUNT(*)::int`,
      paidBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN 1 ELSE 0 END), 0)::int`,
      freeBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isFree} = true THEN 1 ELSE 0 END), 0)::int`,
      unpaidBookings: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN 1 ELSE 0 END), 0)::int`,
      totalAttendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      unpaidAmount: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = false AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
    }).from(bookings).where(scopedActs ? and(isNull(bookings.deletedAt), sql`${bookings.activityId} IN ${scopedActs}`) : isNull(bookings.deletedAt));

    // ── 2. تكاليف الأنشطة ──
    // 🔴 كانت بلا قيد مدينة: صافي مدينةٍ واحدة كان يطرح تكاليف كلّ المدن.
    //    بمدينة: تكاليف فعاليّات تلك المدينة وحدها. والتكاليف غير المربوطة بفعاليّة
    //    (عامّة/لاعب/معدّات) لا مدينة لها في المخطّط — تُعاد منفصلة ولا تُطرح من صافي مدينة.
    const [costRow] = await db.select({
      totalActivityCosts: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
      costCount: sql<number>`COUNT(*)::int`,
    }).from(costs).where(scopedActs ? and(isNull(costs.deletedAt), sql`${costs.activityId} IN ${scopedActs}`) : isNull(costs.deletedAt));
    const [unassignedCostRow] = await db.select({
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
      n: sql<number>`COUNT(*)::int`,
    }).from(costs).where(and(isNull(costs.deletedAt), isNull(costs.activityId)));

    // ── 3. التكاليف التأسيسية ──
    const [foundRow] = await db.select({
      totalFoundational: sql<number>`COALESCE(SUM(${foundationalCosts.amount}::numeric), 0)`,
      foundationalCount: sql<number>`COUNT(*)::int`,
    }).from(foundationalCosts).where(isNull(foundationalCosts.deletedAt));

    // ── 4. الأنشطة حسب الحالة ──
    const activityStats = await db.select({
      status: activities.status,
      count: sql<number>`COUNT(*)::int`,
    }).from(activities).where(isNull(activities.deletedAt)).groupBy(activities.status);

    const actByStatus: Record<string, number> = {};
    let totalActivities = 0;
    for (const row of activityStats) {
      actByStatus[row.status] = row.count;
      totalActivities += row.count;
    }

    // ── 5. اللاعبون ──
    const [playerRow] = await db.select({
      totalPlayers: sql<number>`COUNT(*)::int`,
      activePlayers: sql<number>`COALESCE(SUM(CASE WHEN ${players.lifetimeMatches} > 0 THEN 1 ELSE 0 END), 0)::int`,
    }).from(players);

    // ── 6. المباريات ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [matchRow] = await db.select({
      totalMatches: sql<number>`COUNT(*)::int`,
      todayMatches: sql<number>`COALESCE(SUM(CASE WHEN ${matches.createdAt} >= ${today} AND ${matches.createdAt} < ${tomorrow} THEN 1 ELSE 0 END), 0)::int`,
    }).from(matches).where(cityFilter ? and(isNull(matches.deletedAt), eq(matches.cityId, cityFilter)) : isNull(matches.deletedAt));

    // ── 7. الموظفون ──
    const [staffRow] = await db.select({
      totalStaff: sql<number>`COUNT(*)::int`,
      activeStaff: sql<number>`COALESCE(SUM(CASE WHEN ${staff.isActive} = true THEN 1 ELSE 0 END), 0)::int`,
    }).from(staff).where(isNull(staff.deletedAt));

    // ── 8. أنشطة هذا الأسبوع ──
    // من **بداية يوم عمّان** لا من اللحظة: فعاليّة السابعة مساءً تبقى «الليلة» لمن يفتح اللوحة في التاسعة.
    const dayStart = ammanDayStart();
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const weekEnd = new Date(dayStart.getTime() + 7 * 86_400_000);

    const upcomingRaw = await db.select({
      id: activities.id,
      name: activities.name,
      date: activities.date,
      status: activities.status,
      basePrice: activities.basePrice,
      cityId: locations.cityId,
      cityName: cities.name,
      locationName: locations.name,
    }).from(activities)
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .leftJoin(cities, eq(locations.cityId, cities.id))
      .where(and(
        gte(activities.date, dayStart),
        isNull(activities.deletedAt),
        ...(cityFilter ? [eq(locations.cityId, cityFilter)] : []),
      ))
      .orderBy(activities.date)
      .limit(12);

    // 👥 الحاجزون من المصدر الموحّد، والسعة بالقاعدة نفسها التي تُنشأ بها الغرفة
    const { countBookedPeopleBatch } = await import('../services/booking-count.service.js');
    const { resolveRoomCapacity } = await import('../services/capacity.service.js');
    const bookedMap = await countBookedPeopleBatch(upcomingRaw.map(a => a.id));
    const upcomingAll = await Promise.all(upcomingRaw.map(async a => ({
      ...a,
      booked: bookedMap.get(a.id) ?? 0,
      capacity: await resolveRoomCapacity(a.id),
      isToday: a.date >= dayStart && a.date < dayEnd,
    })));
    const upcomingActivities = upcomingAll.filter(a => a.date <= weekEnd).slice(0, 8);
    // «الليلة»: فعاليّة اليوم، وإلّا أقرب قادمة (ولو بعد الأسبوع) — الملغاة لا تُتَّخذ محوراً
    const focusActivity = upcomingAll.find(a => a.status !== 'cancelled') ?? null;

    // 📋 حجوزات غير مثبَّتة لفعاليّات قادمة (لا تشمل قائمة الانتظار ولا من عُلّم حضوره)
    const pendingRows = await db.select({
      activityId: reservations.activityId,
      name: activities.name,
      date: activities.date,
      count: sql<number>`COUNT(*)::int`,
      people: sql<number>`COALESCE(SUM(GREATEST(COALESCE(${reservations.peopleCount}, 1), 1)), 0)::int`,
    }).from(reservations)
      .innerJoin(activities, eq(reservations.activityId, activities.id))
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(and(
        isNull(reservations.deletedAt),
        isNull(activities.deletedAt),
        isNull(reservations.attended),
        sql`${reservations.status} NOT IN ('confirmed','paid_all','waitlist')`,
        sql`${activities.status} <> 'cancelled'`,
        gte(activities.date, dayStart),
        ...(cityFilter ? [eq(locations.cityId, cityFilter)] : []),
      ))
      .groupBy(reservations.activityId, activities.name, activities.date)
      .orderBy(activities.date);

    // 💰 مال آخر 7 أيّام: الفعاليّات التي أُقيمت في النافذة — إيراد حجوزاتها المدفوعة وتكاليفها المربوطة بها
    const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);
    const weekActs = cityFilter
      ? sql`(SELECT a.id FROM activities a JOIN locations l ON l.id = a.location_id WHERE l.city_id = ${cityFilter} AND a.deleted_at IS NULL AND a.date >= ${weekStart} AND a.date < ${dayEnd})`
      : sql`(SELECT a.id FROM activities a WHERE a.deleted_at IS NULL AND a.date >= ${weekStart} AND a.date < ${dayEnd})`;
    const [weekRev] = await db.select({
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
    }).from(bookings).where(and(isNull(bookings.deletedAt), sql`${bookings.activityId} IN ${weekActs}`));
    const [weekCost] = await db.select({
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs).where(and(isNull(costs.deletedAt), sql`${costs.activityId} IN ${weekActs}`));

    // ── 9. أفضل 5 لاعبين — 🏙️ لكلّ مدينة (لا لوحة مجمّعة — قرار ١) ──
    const { getActiveRegularSeasonId } = await import('../services/season.service.js');
    const { listCities } = await import('../services/cities.service.js');
    const seasonId = await getActiveRegularSeasonId();
    const cityList = await listCities({ activeOnly: true });
    const topFor = async (cityId: number) => seasonId ? db.select({
      id: players.id, name: players.name, avatarUrl: players.avatarUrl,
      level: playerSeasonStats.level, rankTier: playerSeasonStats.rankTier, rankRR: playerSeasonStats.rankRR,
      totalMatches: playerSeasonStats.totalMatches, totalWins: playerSeasonStats.totalWins,
    }).from(playerSeasonStats)
      .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
      .where(and(eq(playerSeasonStats.seasonId, seasonId), eq(playerSeasonStats.cityId, cityId), sql`COALESCE(${playerSeasonStats.totalMatches},0) > 0`))
      .orderBy(TIER_ORDER(playerSeasonStats.rankTier), desc(playerSeasonStats.rankRR), desc(playerSeasonStats.level))
      .limit(5) : [];
    const topPlayersByCity: Record<string, any[]> = {};
    for (const c of cityList) topPlayersByCity[String(c.id)] = await topFor(c.id);
    const primaryCity = cityFilter ?? cityList[0]?.id ?? null;
    const topPlayers = primaryCity ? (topPlayersByCity[String(primaryCity)] ?? []) : [];

    // ── 9.ب تقسيمٌ لكلّ مدينة (يُعرض تحت الأرقام حين يكون النطاق «الكلّ») ──
    const byCity: Record<string, { revenue: number; matches: number; players: number; bookings: number }> = {};
    for (const c of cityList) {
      const [rev] = await db.select({
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.isPaid} = true AND ${bookings.isFree} = false THEN ${bookings.paidAmount}::numeric ELSE 0 END), 0)`,
        n: sql<number>`COUNT(*)::int`,
      }).from(bookings).where(and(isNull(bookings.deletedAt),
        sql`${bookings.activityId} IN (SELECT a.id FROM activities a JOIN locations l ON l.id = a.location_id WHERE l.city_id = ${c.id})`));
      const [m] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(matches).where(and(isNull(matches.deletedAt), eq(matches.cityId, c.id)));
      const [p] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(players).where(and(isNull(players.deletedAt), eq(players.homeCityId, c.id)));
      byCity[String(c.id)] = { revenue: Number(rev?.revenue || 0), matches: Number(m?.n || 0), players: Number(p?.n || 0), bookings: Number(rev?.n || 0) };
    }

    // ── 10. آخر 5 أنشطة ──
    const recentActivities = await db.select({
      id: activities.id,
      name: activities.name,
      date: activities.date,
      status: activities.status,
    }).from(activities)
      .where(isNull(activities.deletedAt))
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
      .where(isNull(bookings.deletedAt))
      .orderBy(desc(bookings.createdAt))
      .limit(5);

    // ── النتيجة النهائية ──
    const totalRevenue = Number(financeRow.totalRevenue) || 0;
    const totalActivityCosts = Number(costRow.totalActivityCosts) || 0;
    const totalFoundational = Number(foundRow.totalFoundational) || 0;
    const unassignedCosts = Number(unassignedCostRow.total) || 0;
    // التأسيسيّة لا تحمل مدينة: تُحسب في المصاريف الكلّيّة لنطاق «الكلّ» وحده
    const totalExpenses = cityFilter ? totalActivityCosts : totalActivityCosts + totalFoundational;
    // 🔒 المال للأدمن والمحاسب فقط — الخادم يحجبه لا الواجهة وحدها
    const canSeeMoney = ['admin', 'accountant'].includes(String(req.user?.role));
    const weekRevenue = Number(weekRev?.revenue) || 0;
    const weekCosts = Number(weekCost?.total) || 0;

    res.json({
      success: true,
      // المالية
      finance: canSeeMoney ? {
        totalRevenue,
        totalActivityCosts,
        totalFoundational,
        totalExpenses,
        netProfit: totalRevenue - totalActivityCosts,
        costCount: costRow.costCount,
        foundationalCount: foundRow.foundationalCount,
        // تكاليف بلا فعاليّة (فلا مدينة لها): ضمن totalActivityCosts في «الكلّ»، وخارجها في نطاق مدينة
        unassignedCosts,
        unassignedCostCount: unassignedCostRow.n,
        costsCityScoped: !!cityFilter,
        week: { from: weekStart, to: dayEnd, revenue: weekRevenue, activityCosts: weekCosts, net: weekRevenue - weekCosts },
      } : null,
      // الحجوزات
      bookings: {
        total: financeRow.totalBookings,
        paid: financeRow.paidBookings,
        free: financeRow.freeBookings,
        unpaid: financeRow.unpaidBookings,
        totalAttendees: financeRow.totalAttendees,
        unpaidAmount: canSeeMoney ? Number(financeRow.unpaidAmount) || 0 : null,
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
      focusActivity,
      attention: { pendingReservations: pendingRows },
      topPlayers,
      recentActivities,
      recentBookings,
      // 🏙️ المدن: القائمة + تقسيمٌ لكلّ مدينة + أفضل اللاعبين لكلّ مدينة
      cityId: cityFilter,
      cities: cityList.map(c => ({ id: c.id, name: c.name })),
      byCity: canSeeMoney ? byCity : Object.fromEntries(Object.entries(byCity).map(([k, v]) => [k, { ...v, revenue: null }])),
      topPlayersByCity,
    });
  } catch (err: any) {
    console.error('❌ Dashboard stats error:', err.message);
    res.status(500).json({ error: 'فشل تحميل الإحصاءات' });
  }
});

export default router;
