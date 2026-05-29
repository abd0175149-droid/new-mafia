// ══════════════════════════════════════════════════════
// 🪑 مسارات الجلوس الذكي — Seating Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, leaderOrAbove } from '../middleware/auth.js';
import { CONSTRAINT_TYPES } from '../game/seating/constraint-registry.js';
import { reshuffleSeating } from '../game/seating/engine.js';
import type { PlayerSeatData, EvaluationContext, SeatingConfig } from '../game/seating/types.js';
import { neighborKey } from '../game/seating/types.js';

const router = Router();

// ══════════════════════════════════════════════════════
// GET /api/seating/constraint-types — أنواع القيود المتاحة
// ══════════════════════════════════════════════════════

router.get('/constraint-types', authenticate, leaderOrAbove, async (_req: Request, res: Response) => {
  res.json({ types: CONSTRAINT_TYPES });
});

// ══════════════════════════════════════════════════════
// GET /api/seating/constraints?activityId=123
// جلب إعدادات القيود للنشاط
// ══════════════════════════════════════════════════════

router.get('/constraints', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const activityId = parseInt(req.query.activityId as string);
  if (!activityId) return res.status(400).json({ error: 'activityId مطلوب' });

  try {
    const { getDB } = await import('../config/db.js');
    const { activities } = await import('../schemas/admin.schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const [act] = await db.select({ seatConstraints: activities.seatConstraints })
      .from(activities).where(eq(activities.id, activityId)).limit(1);

    if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });

    res.json({ constraints: act.seatConstraints || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// PUT /api/seating/constraints — تحديث إعدادات القيود
// ══════════════════════════════════════════════════════

router.put('/constraints', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const { activityId, strictness, constraints: constraintConfigs, engineEnabled } = req.body;
  if (!activityId) return res.status(400).json({ error: 'activityId مطلوب' });

  try {
    const { getDB } = await import('../config/db.js');
    const { activities } = await import('../schemas/admin.schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const newConfig: SeatingConfig = {
      engineEnabled: engineEnabled ?? true,
      strictness: strictness || 'relaxed',
      constraints: constraintConfigs || [],
    };

    await db.update(activities)
      .set({ seatConstraints: newConfig })
      .where(eq(activities.id, activityId));

    res.json({ success: true, constraints: newConfig });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/seating/reshuffle — إعادة ترتيب الجلوس
// يُستدعى فقط عند ضغط الليدر
// ══════════════════════════════════════════════════════

router.post('/reshuffle', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const { roomId, dryRun } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId مطلوب' });

  try {
    const { getRoom, updateRoom } = await import('../game/state.js');
    const state = await getRoom(roomId);
    if (!state) return res.status(404).json({ error: 'الغرفة غير موجودة' });

    // جلب بيانات اللاعبين من DB
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const players: PlayerSeatData[] = [];
    for (const p of state.players) {
      if (p.seatHeld) continue; // تجاهل المقاعد المحجوزة

      let playerData: PlayerSeatData = {
        playerId: p.playerId || null,
        phone: p.phone || '',
        name: p.name || `لاعب #${p.physicalId}`,
        gender: p.gender || 'MALE',
        totalMatches: 0,
        activityCount: 0,
        rankRR: 0,
        rankTier: 'INFORMANT',
        physicalId: p.physicalId,
      };

      // إثراء البيانات من DB
      if (p.playerId || p.phone) {
        try {
          const { players: playersTable } = await import('../schemas/player.schema.js');
          const { eq, or: orOp } = await import('drizzle-orm');
          const conditions: any[] = [];
          if (p.playerId) conditions.push(eq(playersTable.id, p.playerId));
          if (p.phone) {
            const normalizedPhone = p.phone.startsWith('0') ? p.phone : '0' + p.phone;
            conditions.push(eq(playersTable.phone, normalizedPhone));
          }
          if (conditions.length > 0) {
            const [dbPlayer] = await db.select({
              totalMatches: playersTable.totalMatches,
              rankRR: playersTable.rankRR,
              rankTier: playersTable.rankTier,
            }).from(playersTable).where(orOp(...conditions)).limit(1);

            if (dbPlayer) {
              playerData.totalMatches = dbPlayer.totalMatches || 0;
              playerData.rankRR = dbPlayer.rankRR || 0;
              playerData.rankTier = dbPlayer.rankTier || 'INFORMANT';
              // تقدير activityCount ≈ totalMatches / 3 (متوسط 3 ألعاب لكل فعالية)
              playerData.activityCount = Math.floor((dbPlayer.totalMatches || 0) / 3);
            }
          }
        } catch {}
      }

      players.push(playerData);
    }

    // جلب تاريخ جيران المعاقبين
    const penaltyHistory = new Map<string, number>();
    try {
      const { sql } = await import('drizzle-orm');
      const rows = await db.execute(sql`
        SELECT player_a_id, player_b_id, COUNT(*) as cnt
        FROM penalty_neighbor_history
        WHERE session_id = ${state.sessionId || 0}
        GROUP BY player_a_id, player_b_id
      `);
      for (const row of (rows as any).rows || rows || []) {
        penaltyHistory.set(neighborKey(row.player_a_id, row.player_b_id), Number(row.cnt));
      }
    } catch {}

    // جلب إعدادات القيود
    let seatingConfig: SeatingConfig | null = null;
    if (state.activityId) {
      try {
        const { activities } = await import('../schemas/admin.schema.js');
        const { eq } = await import('drizzle-orm');
        const [act] = await db.select({ seatConstraints: activities.seatConstraints })
          .from(activities).where(eq(activities.id, state.activityId)).limit(1);
        if (act?.seatConstraints) {
          seatingConfig = act.seatConstraints as SeatingConfig;
        }
      } catch {}
    }

    // تنفيذ إعادة الترتيب
    const context: EvaluationContext = {
      maxPlayers: state.config.maxPlayers,
      sessionId: state.sessionId,
      penaltyNeighborHistory: penaltyHistory,
      constraintParams: {},
    };

    const result = reshuffleSeating({
      maxPlayers: state.config.maxPlayers,
      players,
      seatingConfig,
      context,
    });

    // تطبيق الترتيب الجديد (إذا ليس dryRun)
    if (!dryRun && result.success) {
      for (const item of result.arrangement) {
        const player = state.players.find(p =>
          (item.playerId && p.playerId === item.playerId) ||
          (item.phone && p.phone === item.phone)
        );
        if (player && player.physicalId !== item.seatNumber) {
          player.physicalId = item.seatNumber;
        }
      }
      await updateRoom(roomId, { players: state.players });
    }

    res.json({
      success: result.success,
      dryRun: !!dryRun,
      arrangement: result.arrangement,
      totalScore: result.totalScore,
      violations: result.violations,
      relaxedConstraints: result.relaxedConstraints,
    });
  } catch (err: any) {
    console.error('❌ Reshuffle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/seating/record-penalty-neighbors
// تسجيل جيران اللاعب المعاقب
// ══════════════════════════════════════════════════════

router.post('/record-penalty-neighbors', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const { sessionId, matchId, penaltyPlayerId, penaltySeat, neighbors } = req.body;
  // neighbors: [{ playerId, seat }]

  if (!penaltyPlayerId || !neighbors || !Array.isArray(neighbors)) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const { sql } = await import('drizzle-orm');

    for (const neighbor of neighbors) {
      if (!neighbor.playerId) continue;
      const aId = Math.min(penaltyPlayerId, neighbor.playerId);
      const bId = Math.max(penaltyPlayerId, neighbor.playerId);
      const seatA = aId === penaltyPlayerId ? penaltySeat : neighbor.seat;
      const seatB = bId === penaltyPlayerId ? penaltySeat : neighbor.seat;

      await db.execute(sql`
        INSERT INTO penalty_neighbor_history (player_a_id, player_b_id, session_id, match_id, seat_a, seat_b, penalty_player_id)
        VALUES (${aId}, ${bId}, ${sessionId || null}, ${matchId || null}, ${seatA}, ${seatB}, ${penaltyPlayerId})
      `);
    }

    res.json({ success: true, recorded: neighbors.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/seating/penalty-history?sessionId=123
// جلب تاريخ جيران المعاقبين
// ══════════════════════════════════════════════════════

router.get('/penalty-history', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const sessionId = parseInt(req.query.sessionId as string);

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const { sql } = await import('drizzle-orm');
    const condition = sessionId
      ? sql`WHERE session_id = ${sessionId}`
      : sql`WHERE 1=1`;

    const rows = await db.execute(sql`
      SELECT * FROM penalty_neighbor_history ${condition}
      ORDER BY created_at DESC LIMIT 100
    `);

    res.json({ history: (rows as any).rows || rows || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
