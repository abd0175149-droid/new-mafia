// ══════════════════════════════════════════════════════
// 📱 مسارات تطبيق اللاعب — Player App Routes
// Leaderboard, Follow, Co-players, Bookings, Following-bookers
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players, playerFollows } from '../schemas/player.schema.js';
import { matchPlayers, matches } from '../schemas/game.schema.js';
import { bookings, activities } from '../schemas/admin.schema.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';

const router = Router();

// ══════════════════════════════════════════════════════
// 🏆 GET /api/player-app/leaderboard — أعلى 50 لاعب
// ══════════════════════════════════════════════════════

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
      .orderBy(desc(players.level), desc(players.xp))
      .limit(50);

    res.json({ success: true, leaderboard: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 👥 GET /api/player-app/:id/co-players — لاعبون لعبت معهم
// ══════════════════════════════════════════════════════

router.get('/:id/co-players', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);
  if (!playerId) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    // 1. جلب كل matchIds اللي لعبها هذا اللاعب
    const myMatches = await db.select({ matchId: matchPlayers.matchId })
      .from(matchPlayers)
      .where(eq(matchPlayers.playerId, playerId));

    const matchIds = myMatches.map(m => m.matchId).filter(Boolean) as number[];
    if (matchIds.length === 0) return res.json({ success: true, coPlayers: [] });

    // 2. جلب كل اللاعبين في هذه المباريات (غيري)
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

    // 3. تجميع: لكل لاعب كم مباراة مشتركة
    const coMap = new Map<number, { playerId: number; playerName: string; matchCount: number }>();
    for (const row of coPlayerRows) {
      if (!row.playerId) continue;
      const existing = coMap.get(row.playerId);
      if (existing) {
        existing.matchCount++;
      } else {
        coMap.set(row.playerId, {
          playerId: row.playerId,
          playerName: row.playerName,
          matchCount: 1,
        });
      }
    }

    // 4. إضافة بيانات إضافية (avatar, level, rank)
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

      // 5. هل متابعهم؟
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
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// ⭐ POST /api/player-app/:id/follow/:targetId — متابعة لاعب
// شرط: يجب أن يكونوا لعبوا في نفس المباراة
// ══════════════════════════════════════════════════════

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
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// ❌ DELETE /api/player-app/:id/follow/:targetId — إلغاء متابعة
// ══════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════
// 📋 GET /api/player-app/:id/following — قائمة المتابَعين
// ══════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════
// 📰 GET /api/player-app/:id/following-feed — فيد أخبار المتابَعين
// ══════════════════════════════════════════════════════

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
    if (followingIds.length > 0) {
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
    }

    const feed = recentMatches.map(m => ({
      ...m,
      playerInfo: m.playerId ? playerInfoMap.get(m.playerId) : null,
    }));

    res.json({ success: true, feed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 🎟️ POST /api/player-app/book — حجز نشاط (لنفسه فقط)
// ══════════════════════════════════════════════════════

router.post('/book', authenticatePlayer, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const { activityId } = req.body;
  const player = (req as any).player;

  if (!activityId) return res.status(400).json({ error: 'activityId مطلوب' });

  try {
    // التحقق من النشاط
    const [activity] = await db.select().from(activities)
      .where(eq(activities.id, activityId)).limit(1);

    if (!activity) return res.status(404).json({ error: 'النشاط غير موجود' });

    // التحقق من عدم الحجز المسبق
    const existingBooking = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(
        eq(bookings.activityId, activityId),
        eq(bookings.playerId, player.playerId)
      ))
      .limit(1);

    if (existingBooking.length > 0) {
      return res.status(409).json({ error: 'محجوز مسبقاً لهذا النشاط' });
    }

    // إنشاء الحجز (count=1 دائماً — لنفسه فقط)
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
    }).returning();

    res.status(201).json({ success: true, booking: result[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 📋 GET /api/player-app/:id/bookings — حجوزات اللاعب
// ══════════════════════════════════════════════════════

router.get('/:id/bookings', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const playerId = parseInt(req.params.id);

  try {
    // جلب حجوزات اللاعب مع بيانات النشاط
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

// ══════════════════════════════════════════════════════
// 👥 GET /api/player-app/activities/:actId/following-bookers?playerId=
// المتابَعون الذين حجزوا نشاط معين
// ══════════════════════════════════════════════════════

router.get('/activities/:actId/following-bookers', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const activityId = parseInt(req.params.actId);
  const playerId = parseInt(req.query.playerId as string);

  if (!activityId || !playerId) {
    return res.status(400).json({ error: 'activityId و playerId مطلوبان' });
  }

  try {
    // 1. قائمة المتابَعين
    const followRows = await db.select({ followingId: playerFollows.followingId })
      .from(playerFollows)
      .where(eq(playerFollows.followerId, playerId));

    const followingIds = followRows.map(f => f.followingId);
    if (followingIds.length === 0) {
      return res.json({ success: true, count: 0, bookers: [] });
    }

    // 2. من بين المتابَعين، من حجز هذا النشاط؟
    const bookerRows = await db.select({
      bookingId: bookings.id,
      playerId: bookings.playerId,
      name: bookings.name,
    })
      .from(bookings)
      .where(and(
        eq(bookings.activityId, activityId),
        inArray(bookings.playerId, followingIds)
      ));

    // 3. إضافة بيانات اللاعبين
    const bookerPlayerIds = bookerRows.map(b => b.playerId).filter(Boolean) as number[];
    let enrichedBookers: any[] = [];

    if (bookerPlayerIds.length > 0) {
      const pInfo = await db.select({
        id: players.id,
        name: players.name,
        avatarUrl: players.avatarUrl,
        level: players.level,
      })
        .from(players)
        .where(inArray(players.id, bookerPlayerIds));

      enrichedBookers = pInfo;
    }

    res.json({
      success: true,
      count: enrichedBookers.length,
      bookers: enrichedBookers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 📅 GET /api/player-app/activities/upcoming — الأنشطة القادمة (للاعبين)
// ══════════════════════════════════════════════════════

router.get('/activities/upcoming', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    const { or } = await import('drizzle-orm');

    const rows = await db.select()
      .from(activities)
      .where(or(eq(activities.status, 'planned'), eq(activities.status, 'active')))
      .orderBy(desc(activities.date));

    // لكل نشاط: عدد الحاجزين
    const enriched = await Promise.all(rows.map(async (act) => {
      const [countResult] = await db.select({
        total: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      }).from(bookings).where(eq(bookings.activityId, act.id));

      return {
        ...act,
        bookedCount: countResult?.total || 0,
      };
    }));

    res.json({ success: true, activities: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
