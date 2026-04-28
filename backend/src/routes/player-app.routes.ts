// ══════════════════════════════════════════════════════
// 📱 مسارات تطبيق اللاعب — Player App Routes
// ⚠️ ترتيب مهم: static routes أولاً ثم parameterized
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, sql, inArray, or } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players, playerFollows } from '../schemas/player.schema.js';
import { matchPlayers, matches } from '../schemas/game.schema.js';
import { bookings, activities, locations } from '../schemas/admin.schema.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';

const router = Router();

// ════════════════════════════════════════════
// 🔒 STATIC ROUTES FIRST (قبل /:id)
// ════════════════════════════════════════════

// ── 🏆 GET /leaderboard ──
router.get('/leaderboard', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    const rows = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
      xp: players.xp,
      rankTier: players.rankTier,
      rankRR: players.rankRR,
      totalMatches: players.totalMatches,
      totalWins: players.totalWins,
    })
      .from(players)
      .orderBy(desc(players.level), desc(players.rankRR), desc(players.xp))
      .limit(50);

    res.json({ success: true, leaderboard: rows });
  } catch (err: any) {
    console.error('❌ leaderboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 🎟️ POST /book — حجز نشاط (لنفسه فقط) ──
router.post('/book', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const { activityId } = req.body;
  const player = (req as any).playerAccount;

  if (!activityId) return res.status(400).json({ error: 'activityId مطلوب' });
  if (!player) return res.status(401).json({ error: 'غير مصادق' });

  try {
    // التحقق من النشاط
    const actRows = await db.select().from(activities)
      .where(eq(activities.id, activityId)).limit(1);

    if (actRows.length === 0) return res.status(404).json({ error: 'النشاط غير موجود' });
    const activity = actRows[0];

    // التحقق من السعة القصوى
    const [countResult] = await db.select({
      total: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
    }).from(bookings).where(eq(bookings.activityId, activityId));
    const currentBooked = countResult?.total || 0;
    const maxCap = activity.maxCapacity || 20;
    if (currentBooked >= maxCap) {
      return res.status(409).json({ error: 'النشاط مكتمل العدد' });
    }

    // التحقق من عدم الحجز المسبق (بالهاتف أو playerId)
    const existingBooking = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(
        eq(bookings.activityId, activityId),
        or(
          eq(bookings.phone, player.phone),
          player.playerId ? eq(bookings.playerId, player.playerId) : sql`false`
        )
      ))
      .limit(1);

    if (existingBooking.length > 0) {
      return res.status(409).json({ error: 'محجوز مسبقاً لهذا النشاط' });
    }

    // إنشاء الحجز (count=1 دائماً — لنفسه فقط)
    const { offerId } = req.body;
    const result = await db.insert(bookings).values({
      activityId,
      name: player.name,
      phone: player.phone,
      count: 1,
      isPaid: false,
      paidAmount: '0',
      isFree: false,
      playerId: player.playerId,
      createdBy: 'player-app',
      offerItems: offerId ? [offerId] : [],
    }).returning();

    res.status(201).json({ success: true, booking: result[0] });

    // 🔔 Push للموظفين (حجز جديد من تطبيق اللاعب) + تأكيد للاعب
    import('../services/fcm.service.js').then(({ sendPushToStaffByPermission, sendPushToPlayer }) => {
      sendPushToStaffByPermission('bookings', '🎟️ حجز جديد (تطبيق)', `${player.name} حجز في ${activity.name}`, 'new_booking', {
        targetId: `booking-${result[0].id}`,
        url: '/admin/bookings',
      });
      if (player.playerId) {
        sendPushToPlayer(player.playerId, '✅ تم الحجز', `تم تأكيد حجزك في ${activity.name}`, 'booking_confirmed', {
          activityId,
          url: '/player/games',
        });
      }
    }).catch(() => {});
  } catch (err: any) {
    console.error('❌ book error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 📅 GET /activities/upcoming — الأنشطة القادمة ──
router.get('/activities/upcoming', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerIdParam = parseInt(req.query.playerId as string);

  try {
    // جلب الأنشطة مع بيانات المكان
    const rows = await db.select({
      id: activities.id,
      name: activities.name,
      date: activities.date,
      description: activities.description,
      basePrice: activities.basePrice,
      status: activities.status,
      locationId: activities.locationId,
      maxCapacity: activities.maxCapacity,
      difficulty: activities.difficulty,
      enabledOfferIds: activities.enabledOfferIds,
      locationName: locations.name,
      locationMapUrl: locations.mapUrl,
      locationOffers: locations.offers,
      isTestLocation: locations.isTestLocation,
    })
      .from(activities)
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(or(eq(activities.status, 'planned'), eq(activities.status, 'active')))
      .orderBy(desc(activities.date));

    // فلترة أنشطة الاختبار: لا تظهر إلا لحسابات الاختبار
    let isTestUser = false;
    if (playerIdParam) {
      const [playerRow] = await db.select({ isTestAccount: players.isTestAccount })
        .from(players).where(eq(players.id, playerIdParam)).limit(1);
      isTestUser = playerRow?.isTestAccount || false;
    }

    const filtered = isTestUser
      ? rows  // حساب اختبار → يرى كل شيء
      : rows.filter(r => !r.isTestLocation);  // حساب عادي → يخفي أنشطة الاختبار

    // لكل نشاط: عدد الحاجزين
    const enriched = await Promise.all(filtered.map(async (act) => {
      const [countResult] = await db.select({
        total: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      }).from(bookings).where(eq(bookings.activityId, act.id));

      // فلترة العروض: فقط العروض المفعّلة لهذا النشاط
      const allOffers: any[] = Array.isArray(act.locationOffers) ? act.locationOffers : [];
      const enabledIds: number[] = Array.isArray(act.enabledOfferIds) ? act.enabledOfferIds : [];
      const activeOffers = enabledIds.length > 0
        ? allOffers.filter((_: any, idx: number) => enabledIds.includes(idx))
        : allOffers; // إذا لم يُحدد enabledOfferIds → عرض الكل

      return {
        ...act,
        locationOffers: activeOffers,
        bookedCount: countResult?.total || 0,
        maxPlayers: act.maxCapacity || 20,
      };
    }));

    res.json({ success: true, activities: enriched });
  } catch (err: any) {
    console.error('❌ activities/upcoming error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 👥 GET /activities/:actId/bookers — جميع الحاجزين لنشاط مع تمييز المتابَعين ──
router.get('/activities/:actId/following-bookers', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const activityId = parseInt(req.params.actId);
  const playerId = parseInt(req.query.playerId as string);

  if (!activityId || !playerId) {
    return res.status(400).json({ error: 'activityId و playerId مطلوبان' });
  }

  try {
    // 1. جلب قائمة المتابَعين
    const followRows = await db.select({ followingId: playerFollows.followingId })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, playerId));
    const followingSet = new Set(followRows.map(f => f.followingId));

    // 2. جلب كل الحاجزين لهذا النشاط (عدا نفسي)
    const allBookerRows = await db.select({
      bookingId: bookings.id,
      playerId: bookings.playerId,
      name: bookings.name,
    })
      .from(bookings)
      .where(eq(bookings.activityId, activityId));

    const bookerPlayerIds = allBookerRows
      .map(b => b.playerId)
      .filter(pid => pid && pid !== playerId) as number[];

    if (bookerPlayerIds.length === 0) {
      return res.json({ success: true, count: 0, bookers: [] });
    }

    // 3. إضافة بيانات اللاعبين
    const playerDetails = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
    })
      .from(players)
      .where(inArray(players.id, bookerPlayerIds));

    // 4. إضافة علامة المتابعة — المتابَعون أولاً
    const enrichedBookers = playerDetails.map(p => ({
      ...p,
      isFollowing: followingSet.has(p.id),
    })).sort((a, b) => (b.isFollowing ? 1 : 0) - (a.isFollowing ? 1 : 0));

    res.json({ success: true, count: enrichedBookers.length, bookers: enrichedBookers });
  } catch (err: any) {
    console.error('❌ bookers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════
// 🔓 PARAMETERIZED ROUTES (بعد static)
// ════════════════════════════════════════════

// ── 👥 GET /:id/co-players — لاعبون لعبت معهم ──
router.get('/:id/co-players', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);
  if (!playerId || isNaN(playerId)) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    const myMatches = await db.select({ matchId: matchPlayers.matchId })
      .from(matchPlayers)
      .where(eq(matchPlayers.playerId, playerId));

    const matchIds = myMatches.map(m => m.matchId).filter(Boolean) as number[];
    if (matchIds.length === 0) return res.json({ success: true, coPlayers: [] });

    const coPlayerRows = await db.select({
      playerId: matchPlayers.playerId,
      playerName: matchPlayers.playerName,
      matchId: matchPlayers.matchId,
    })
      .from(matchPlayers)
      .where(and(
        inArray(matchPlayers.matchId, matchIds),
        sql`${matchPlayers.playerId} IS NOT NULL AND ${matchPlayers.playerId} != ${playerId}`
      ));

    const coMap = new Map<number, { playerId: number; playerName: string; matchCount: number }>();
    for (const row of coPlayerRows) {
      if (!row.playerId) continue;
      const existing = coMap.get(row.playerId);
      if (existing) existing.matchCount++;
      else coMap.set(row.playerId, { playerId: row.playerId, playerName: row.playerName, matchCount: 1 });
    }

    const coPlayerIds = Array.from(coMap.keys());
    let enriched: any[] = [];

    if (coPlayerIds.length > 0) {
      const playerDetails = await db.select({
        id: players.id,
        name: players.name,
        avatarUrl: players.avatarUrl,
        level: players.level,
        rankTier: players.rankTier,
      })
        .from(players)
        .where(inArray(players.id, coPlayerIds));

      // هل متابعهم؟
      const myFollowing = await db.select({ followingId: playerFollows.followingId })
        .from(playerFollows)
        .where(eq(playerFollows.followerId, playerId));
      const followingSet = new Set(myFollowing.map(f => f.followingId));

      enriched = playerDetails.map(p => ({
        ...p,
        matchCount: coMap.get(p.id)?.matchCount || 0,
        isFollowing: followingSet.has(p.id),
      })).sort((a, b) => b.matchCount - a.matchCount);
    }

    res.json({ success: true, coPlayers: enriched });
  } catch (err: any) {
    console.error('❌ co-players error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ⭐ POST /:id/follow/:targetId — متابعة لاعب ──
router.post('/:id/follow/:targetId', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const followerId = parseInt(req.params.id);
  const followingId = parseInt(req.params.targetId);

  if (!followerId || !followingId || followerId === followingId) {
    return res.status(400).json({ error: 'معرّفات غير صالحة' });
  }

  try {
    // التحقق: هل لعبوا سوا؟
    const myMatches = await db.select({ matchId: matchPlayers.matchId })
      .from(matchPlayers)
      .where(eq(matchPlayers.playerId, followerId));
    const myMatchIds = myMatches.map(m => m.matchId).filter(Boolean) as number[];

    if (myMatchIds.length === 0) {
      return res.status(403).json({ error: 'لا يمكن متابعة لاعب لم تلعب معه' });
    }

    const sharedMatch = await db.select({ id: matchPlayers.id })
      .from(matchPlayers)
      .where(and(
        inArray(matchPlayers.matchId, myMatchIds),
        eq(matchPlayers.playerId, followingId)
      ))
      .limit(1);

    if (sharedMatch.length === 0) {
      return res.status(403).json({ error: 'لا يمكن متابعة لاعب لم تلعب معه' });
    }

    // التحقق من عدم التكرار
    const existing = await db.select({ id: playerFollows.id })
      .from(playerFollows)
      .where(and(
        eq(playerFollows.followerId, followerId),
        eq(playerFollows.followingId, followingId)
      ))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ success: true, message: 'متابع مسبقاً' });
    }

    await db.insert(playerFollows).values({ followerId, followingId });
    res.json({ success: true, message: 'تمت المتابعة' });
  } catch (err: any) {
    console.error('❌ follow error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ❌ DELETE /:id/follow/:targetId — إلغاء متابعة ──
router.delete('/:id/follow/:targetId', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const followerId = parseInt(req.params.id);
  const followingId = parseInt(req.params.targetId);

  try {
    await db.delete(playerFollows).where(and(
      eq(playerFollows.followerId, followerId),
      eq(playerFollows.followingId, followingId)
    ));
    res.json({ success: true, message: 'تم إلغاء المتابعة' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 📋 GET /:id/following — قائمة المتابَعين ──
router.get('/:id/following', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);

  try {
    const followRows = await db.select({ followingId: playerFollows.followingId })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, playerId));

    const ids = followRows.map(f => f.followingId);
    if (ids.length === 0) return res.json({ success: true, following: [] });

    const followingPlayers = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
      rankTier: players.rankTier,
      rankRR: players.rankRR,
      totalMatches: players.totalMatches,
      totalWins: players.totalWins,
    })
      .from(players)
      .where(inArray(players.id, ids));

    res.json({ success: true, following: followingPlayers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── 📰 GET /:id/following-feed — فيد أخبار المتابَعين ──
router.get('/:id/following-feed', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);

  try {
    // 1. جلب قائمة المتابَعين
    const followRows = await db.select({ followingId: playerFollows.followingId })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, playerId));

    const followingIds = followRows.map(f => f.followingId);
    if (followingIds.length === 0) return res.json({ success: true, feed: [] });

    // 2. آخر 20 مباراة لعبها المتابَعون
    const recentMatches = await db.select({
      playerId: matchPlayers.playerId,
      playerName: matchPlayers.playerName,
      role: matchPlayers.role,
      survived: matchPlayers.survivedToEnd,
      xpEarned: matchPlayers.xpEarned,
      rrChange: matchPlayers.rrChange,
      matchWinner: matches.winner,
      matchDate: matches.createdAt,
    })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(inArray(matchPlayers.playerId, followingIds))
      .orderBy(desc(matches.createdAt))
      .limit(20);

    // 3. إضافة أسماء وصور
    const playerInfoMap = new Map<number, any>();
    const pInfo = await db.select({
      id: players.id,
      name: players.name,
      avatarUrl: players.avatarUrl,
      level: players.level,
      rankTier: players.rankTier,
    })
      .from(players)
      .where(inArray(players.id, followingIds));

    for (const p of pInfo) playerInfoMap.set(p.id, p);

    const feed = recentMatches.map(m => ({
      ...m,
      playerInfo: m.playerId ? playerInfoMap.get(m.playerId) : null,
    }));

    res.json({ success: true, feed });
  } catch (err: any) {
    console.error('❌ following-feed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 📋 GET /:id/bookings — حجوزات اللاعب ──
router.get('/:id/bookings', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);

  try {
    const playerBookings = await db.select({
      bookingId: bookings.id,
      activityId: bookings.activityId,
      isPaid: bookings.isPaid,
      isFree: bookings.isFree,
      createdAt: bookings.createdAt,
      activityName: activities.name,
      activityDate: activities.date,
      activityStatus: activities.status,
    })
      .from(bookings)
      .innerJoin(activities, eq(bookings.activityId, activities.id))
      .where(eq(bookings.playerId, playerId))
      .orderBy(desc(activities.date));

    res.json({ success: true, bookings: playerBookings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
