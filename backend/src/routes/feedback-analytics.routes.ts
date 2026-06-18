// ══════════════════════════════════════════════════════
// 📊 تحليلات الفيد باك (لوحة الأدمن) — Feedback Analytics
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, and, gte, lte, sql, desc, isNotNull, ne, type SQL } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { roomFeedback } from '../schemas/feedback.schema.js';
import { activities, locations, staff } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { FEEDBACK_QUESTIONS } from '../services/feedback.service.js';

const router = Router();

const DIMS = ['overall','venue','gameplay','clarity','pacing','seating','leader','fairness','atmosphere','value','recommend'] as const;

function buildFilters(req: Request): SQL[] {
  const conds: SQL[] = [];
  const { from, to, locationId, leaderId, activityId } = req.query as Record<string, string>;
  if (from) conds.push(gte(roomFeedback.playedAt, new Date(from)));
  if (to) conds.push(lte(roomFeedback.playedAt, new Date(to)));
  if (locationId) conds.push(eq(roomFeedback.locationId, parseInt(locationId)));
  if (leaderId) conds.push(eq(roomFeedback.leaderStaffId, parseInt(leaderId)));
  if (activityId) conds.push(eq(roomFeedback.activityId, parseInt(activityId)));
  return conds;
}

// متوسط كل بُعد (تعبير SQL)
const avgExpr = {
  overall: sql<number>`ROUND(AVG(${roomFeedback.overall}),2)`,
  venue: sql<number>`ROUND(AVG(${roomFeedback.venue}),2)`,
  gameplay: sql<number>`ROUND(AVG(${roomFeedback.gameplay}),2)`,
  clarity: sql<number>`ROUND(AVG(${roomFeedback.clarity}),2)`,
  pacing: sql<number>`ROUND(AVG(${roomFeedback.pacing}),2)`,
  seating: sql<number>`ROUND(AVG(${roomFeedback.seating}),2)`,
  leader: sql<number>`ROUND(AVG(${roomFeedback.leader}),2)`,
  fairness: sql<number>`ROUND(AVG(${roomFeedback.fairness}),2)`,
  atmosphere: sql<number>`ROUND(AVG(${roomFeedback.atmosphere}),2)`,
  value: sql<number>`ROUND(AVG(${roomFeedback.value}),2)`,
  recommend: sql<number>`ROUND(AVG(${roomFeedback.recommend}),2)`,
};

// ── GET /summary — كل ما تحتاجه اللوحة في طلب واحد ──
router.get('/summary', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const conds = buildFilters(req);
  const where = conds.length ? and(...conds) : undefined;

  try {
    // إجماليات + متوسطات الأبعاد + توزيع overall
    const [totals] = await db.select({
      count: sql<number>`COUNT(*)::int`,
      distinctPlayers: sql<number>`COUNT(DISTINCT ${roomFeedback.playerId})::int`,
      distinctRooms: sql<number>`COUNT(DISTINCT ${roomFeedback.matchId})::int`,
      ...avgExpr,
      d1: sql<number>`COUNT(*) FILTER (WHERE ${roomFeedback.overall}=1)::int`,
      d2: sql<number>`COUNT(*) FILTER (WHERE ${roomFeedback.overall}=2)::int`,
      d3: sql<number>`COUNT(*) FILTER (WHERE ${roomFeedback.overall}=3)::int`,
      d4: sql<number>`COUNT(*) FILTER (WHERE ${roomFeedback.overall}=4)::int`,
      d5: sql<number>`COUNT(*) FILTER (WHERE ${roomFeedback.overall}=5)::int`,
    }).from(roomFeedback).where(where);

    const avgByDimension = DIMS.map(k => ({ key: k, avg: (totals as any)[k] != null ? Number((totals as any)[k]) : null }));
    const distribution = [
      { score: 1, count: totals?.d1 || 0 },
      { score: 2, count: totals?.d2 || 0 },
      { score: 3, count: totals?.d3 || 0 },
      { score: 4, count: totals?.d4 || 0 },
      { score: 5, count: totals?.d5 || 0 },
    ];

    // حسب المكان
    const byVenue = await db.select({
      locationId: roomFeedback.locationId,
      name: locations.name,
      count: sql<number>`COUNT(*)::int`,
      avgOverall: avgExpr.overall,
      avgVenue: avgExpr.venue,
    }).from(roomFeedback)
      .leftJoin(locations, eq(locations.id, roomFeedback.locationId))
      .where(where)
      .groupBy(roomFeedback.locationId, locations.name)
      .orderBy(desc(sql`AVG(${roomFeedback.overall})`));

    // حسب الليدر
    const byLeader = await db.select({
      leaderStaffId: roomFeedback.leaderStaffId,
      name: staff.displayName,
      count: sql<number>`COUNT(*)::int`,
      avgLeader: avgExpr.leader,
      avgFairness: avgExpr.fairness,
      avgOverall: avgExpr.overall,
    }).from(roomFeedback)
      .leftJoin(staff, eq(staff.id, roomFeedback.leaderStaffId))
      .where(where)
      .groupBy(roomFeedback.leaderStaffId, staff.displayName)
      .orderBy(desc(sql`AVG(${roomFeedback.leader})`));

    // حسب النشاط
    const byActivity = await db.select({
      activityId: roomFeedback.activityId,
      name: activities.name,
      count: sql<number>`COUNT(*)::int`,
      avgOverall: avgExpr.overall,
    }).from(roomFeedback)
      .leftJoin(activities, eq(activities.id, roomFeedback.activityId))
      .where(where)
      .groupBy(roomFeedback.activityId, activities.name)
      .orderBy(desc(sql`AVG(${roomFeedback.overall})`))
      .limit(50);

    // اتجاه أسبوعي
    const trend = await db.select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${roomFeedback.playedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`COUNT(*)::int`,
      avgOverall: avgExpr.overall,
      avgRecommend: avgExpr.recommend,
    }).from(roomFeedback)
      .where(where)
      .groupBy(sql`DATE_TRUNC('week', ${roomFeedback.playedAt})`)
      .orderBy(sql`DATE_TRUNC('week', ${roomFeedback.playedAt})`);

    // الملاحظات (بالاسم — حسب طلب المنتج)
    const commentConds = [...conds, isNotNull(roomFeedback.notes), ne(roomFeedback.notes, '')];
    const comments = await db.select({
      notes: roomFeedback.notes,
      overall: roomFeedback.overall,
      playedAt: roomFeedback.playedAt,
      createdAt: roomFeedback.createdAt,
      playerName: players.name,
      locationName: locations.name,
      leaderName: staff.displayName,
      activityName: activities.name,
    }).from(roomFeedback)
      .leftJoin(players, eq(players.id, roomFeedback.playerId))
      .leftJoin(locations, eq(locations.id, roomFeedback.locationId))
      .leftJoin(staff, eq(staff.id, roomFeedback.leaderStaffId))
      .leftJoin(activities, eq(activities.id, roomFeedback.activityId))
      .where(and(...commentConds))
      .orderBy(desc(roomFeedback.createdAt))
      .limit(100);

    res.json({
      success: true,
      questions: FEEDBACK_QUESTIONS,
      totals: {
        count: totals?.count || 0,
        distinctPlayers: totals?.distinctPlayers || 0,
        distinctRooms: totals?.distinctRooms || 0,
        avgOverall: totals?.overall != null ? Number(totals.overall) : null,
        avgRecommend: totals?.recommend != null ? Number(totals.recommend) : null,
      },
      avgByDimension,
      distribution,
      byVenue,
      byLeader,
      byActivity,
      trend,
      comments,
    });
  } catch (err: any) {
    console.error('❌ feedback summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
