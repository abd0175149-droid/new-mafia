// ══════════════════════════════════════════════════════
// 🪑 مسارات الجلوس الذكي — Seating Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, leaderOrAbove } from '../middleware/auth.js';
import { CONSTRAINT_TYPES } from '../game/seating/constraint-registry.js';
import { reshuffleSeating } from '../game/seating/engine.js';
import type { PlayerSeatData, EvaluationContext, SeatingConfig, ConstraintConfig } from '../game/seating/types.js';
import { neighborKey } from '../game/seating/types.js';

/**
 * جلب الأزواج الممنوعة العالمية من DB ودمجها في إعدادات القيود
 */
async function mergeGlobalBlockedPairs(seatingConfig: SeatingConfig | null): Promise<SeatingConfig> {
  const config: SeatingConfig = seatingConfig ? { ...seatingConfig } : { engineEnabled: true, constraints: [] };

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return config;

    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(sql`SELECT * FROM blocked_pairs`);
    const globalPairs: any[] = (rows as any).rows || rows || [];

    if (globalPairs.length === 0) return config;

    // تحويل إلى صيغة الأزواج المطلوبة
    const pairs = globalPairs.map((p: any) => ({
      player1Phone: p.player1_phone,
      player1Name: p.player1_name,
      player2Phone: p.player2_phone,
      player2Name: p.player2_name,
    }));

    // دمج مع القيود الموجودة
    if (!config.constraints) config.constraints = [];

    const existingIdx = config.constraints.findIndex(c => c.type === 'NO_ADJACENT_PAIRS');
    if (existingIdx >= 0) {
      // دمج الأزواج العالمية مع أزواج النشاط
      const existing = config.constraints[existingIdx];
      const existingPairs = existing.params?.pairs || [];
      config.constraints[existingIdx] = {
        ...existing,
        enabled: true,
        params: { ...existing.params, pairs: [...existingPairs, ...pairs] },
      };
    } else {
      // إضافة قيد جديد
      config.constraints.push({
        type: 'NO_ADJACENT_PAIRS',
        enabled: true,
        priority: 1,
        params: { pairs },
      });
    }
  } catch (err) {
    console.warn('⚠️ Failed to fetch global blocked pairs:', err);
  }

  return config;
}

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

    const config = act.seatConstraints as SeatingConfig | null;
    res.json({
      engineEnabled: config?.engineEnabled ?? false,
      strictness: config?.strictness ?? 'relaxed',
      constraints: config?.constraints ?? [],
    });
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
      .set({ seatConstraints: newConfig } as any)
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
        genderConstraint: 'NONE',
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
              totalMatches: playersTable.lifetimeMatches,  // 🏆 مدى الحياة (لا يُصفَّر بالموسم)
              rankRR: playersTable.rankRR,
              rankTier: playersTable.rankTier,
              genderConstraint: playersTable.genderConstraint,
            }).from(playersTable).where(orOp(...conditions)).limit(1);

            if (dbPlayer) {
              playerData.totalMatches = dbPlayer.totalMatches || 0;
              playerData.rankRR = dbPlayer.rankRR || 0;
              playerData.rankTier = dbPlayer.rankTier || 'INFORMANT';
              playerData.genderConstraint = dbPlayer.genderConstraint || 'NONE';
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

    // دمج الأزواج الممنوعة العالمية مع إعدادات النشاط
    const mergedConfig = await mergeGlobalBlockedPairs(seatingConfig);

    const result = reshuffleSeating({
      maxPlayers: state.config.maxPlayers,
      players,
      seatingConfig: mergedConfig,
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
// ══════════════════════════════════════════════════════
// 🚪 POST /api/seating/door-assign — الباب يعيّن المقعد (C1)
// ══════════════════════════════════════════════════════
// كان المقعد يُقرَّر في لحظة `room:auto-join` وحدها، فموظّف الباب يقول «تفضّل»
// بلا رقم، واللاعب يكتشف مقعده على هاتفه بعد الدخول، والليدر يعيد التوزيع
// يدويّاً حين يتضح أنّ الأصدقاء تجاوروا. هنا يُحسب المقعد لحظة الوصول
// بنفس المحرّك والقيود، ويُثبَّت للشخص فلا يأخذه غيره.
router.post('/door-assign', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const { activityId, phone, name, playerId } = req.body || {};
  if (!activityId || (!phone && !playerId && !name)) {
    return res.status(400).json({ error: 'activityId وهويّةُ الشخص مطلوبة' });
  }

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const { eq, and, isNull, sql } = await import('drizzle-orm');
    const { activities } = await import('../schemas/admin.schema.js');
    const { sessions } = await import('../schemas/game.schema.js');
    const { getRoomByCode } = await import('../game/state.js');
    const { setGameState } = await import('../config/redis.js');
    const { allocateSeat } = await import('../game/seat-allocator.js');
    const { buildAffinityPairs, loadPairRules, mergeRulesIntoAffinity } = await import('../services/seat-affinity.service.js');

    // الغرفة الحيّة لهذه الفعاليّة (أوّل غرفةٍ نشطة)
    const roomRows = await db.select({ code: sessions.sessionCode })
      .from(sessions)
      .where(and(eq(sessions.activityId, Number(activityId)), eq(sessions.isActive, true), isNull(sessions.deletedAt)))
      .orderBy(sessions.createdAt);
    if (!roomRows.length) return res.status(409).json({ error: 'لا غرفة مفتوحة لهذه الفعاليّة بعد' });

    let state: any = null;
    for (const r of roomRows) {
      const st = await getRoomByCode(r.code).catch(() => null);
      if (st) { state = st; break; }
    }
    if (!state) return res.status(409).json({ error: 'الغرفة غير متاحة' });

    // إن كان له مقعدٌ أصلاً (جالسٌ أو مثبَّت أو منتظر) فأعِده كما هو
    const norm = (v: any) => String(v || '').replace(/\D/g, '').slice(-9);
    const target = norm(phone);
    const seated = state.players?.find((p: any) =>
      (playerId && p.playerId === Number(playerId)) || (target && norm(p.phone) === target));
    if (seated) return res.json({ success: true, seat: seated.physicalId, already: 'seated' });

    const waiting = (state.spectators || []).find((p: any) =>
      (playerId && p.playerId === Number(playerId)) || (target && norm(p.phone) === target));
    if (waiting) return res.json({ success: true, seat: waiting.physicalId, already: 'waiting' });

    const pins = (state.pinnedSeats || []);
    const pinned = pins.find((p: any) =>
      (playerId && p.playerId && Number(p.playerId) === Number(playerId)) ||
      (target && norm(p.phone) === target));
    if (pinned) return res.json({ success: true, seat: Number(pinned.seatNumber), already: 'pinned' });

    // شواغل الطاولة: اللاعبون + المتفرّجون + المقاعد المثبَّتة لغير هذا الشخص
    const occupants = (state.players || []).map((p: any) => ({
      physicalId: p.physicalId, phone: p.phone, gender: p.gender || null,
      seatHeld: !!p.seatHeld, playerId: p.playerId ?? null, name: p.name,
    }));
    for (const sp of (state.spectators || [])) {
      if (sp.physicalId > 0 && !occupants.some((o: any) => o.physicalId === sp.physicalId)) {
        occupants.push({ physicalId: sp.physicalId, phone: sp.phone, gender: sp.gender || null,
          seatHeld: false, playerId: sp.playerId ?? null, name: sp.name });
      }
    }

    // قيود الفعاليّة + أوزان التقارب (الوصول المتزامن أثقلها)
    let constraints: any = null;
    try {
      const rows: any = await db.execute(sql`SELECT seat_constraints FROM activities WHERE id = ${Number(activityId)}`);
      constraints = ((rows as any).rows || rows || [])[0]?.seat_constraints || null;
    } catch {}
    constraints = await mergeGlobalBlockedPairs(constraints);
    (constraints as any).engineEnabled = true;

    let affinityPairs: Map<string, number> | undefined;
    try {
      affinityPairs = await buildAffinityPairs({
        sessionId: state.sessionId, activityId: Number(activityId),
        people: [...occupants.map((o: any) => ({ playerId: o.playerId, phone: o.phone, name: o.name })),
                 { playerId: playerId ?? null, phone: phone ?? null, name: name || '' }],
      });
      const rules = await loadPairRules({ activityId: Number(activityId), roomId: state.roomId });
      affinityPairs = mergeRulesIntoAffinity(affinityPairs, rules);
    } catch {}

    const { seat } = allocateSeat({
      maxPlayers: state.config.maxPlayers,
      players: occupants as any,
      constraints: constraints as any,
      newPlayer: { phone: phone || '', gender: 'MALE', playerId: playerId ?? null, name: name || '' },
      pinnedSeats: pins,
      reservedTailSeats: state.reservedTailSeats || 0,
      doorSeats: state.doorSeats || [],
      affinityPairs,
      // يبتعد عن آخر ثلاثة جالسين — من وصلوا معاً لا يجلسون معاً
      spreadFromSeats: (state.players || []).slice(-3).map((p: any) => p.physicalId),
    });

    // يُثبَّت للشخص في الفعاليّة كي لا يأخذه غيره قبل وصوله إلى الطاولة
    const [act] = await db.select({ seatAssignments: activities.seatAssignments })
      .from(activities).where(eq(activities.id, Number(activityId))).limit(1);
    const list: any[] = Array.isArray(act?.seatAssignments) ? [...(act!.seatAssignments as any[])] : [];
    const idx = list.findIndex((a: any) =>
      (playerId && a.playerId && Number(a.playerId) === Number(playerId)) || (target && norm(a.phone) === target));
    const entry = { seatNumber: seat, playerId: playerId ?? null, phone: phone || null, playerName: name || '' };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    await db.update(activities).set({ seatAssignments: list } as any).where(eq(activities.id, Number(activityId)));

    // ينعكس على الغرفة الحيّة فوراً: المقعد يصير محجوزاً في المحرّك
    if (!Array.isArray(state.pinnedSeats)) state.pinnedSeats = [];
    const pIdx = state.pinnedSeats.findIndex((p: any) => Number(p.seatNumber) === seat);
    if (pIdx >= 0) state.pinnedSeats[pIdx] = entry; else state.pinnedSeats.push(entry);
    await setGameState(state.roomId, state);

    const io = req.app.get('io');
    if (io) io.to(state.roomId).emit('room:door-assigned', { seat, name: name || '', roomId: state.roomId });

    return res.json({ success: true, seat, roomCode: state.roomCode });
  } catch (err: any) {
    console.error('❌ door-assign failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

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

// ══════════════════════════════════════════════════════
// 🚫 الأزواج الممنوعة العالمية — Global Blocked Pairs
// مستقلة عن الأنشطة — تُطبّق على كل الألعاب
// ══════════════════════════════════════════════════════

// GET /api/seating/blocked-pairs — جلب كل الأزواج الممنوعة
router.get('/blocked-pairs', authenticate, leaderOrAbove, async (_req: Request, res: Response) => {
  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(sql`
      SELECT * FROM blocked_pairs ORDER BY created_at DESC
    `);

    res.json({ pairs: (rows as any).rows || rows || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seating/blocked-pairs — إضافة زوج ممنوع
router.post('/blocked-pairs', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const { player1Id, player2Id, reason } = req.body;
  if (!player1Id || !player2Id) return res.status(400).json({ error: 'يجب تحديد لاعبين' });
  if (player1Id === player2Id) return res.status(400).json({ error: 'لا يمكن منع لاعب من الجلوس بجانب نفسه' });

  try {
    const { getDB } = await import('../config/db.js');
    const { players } = await import('../schemas/player.schema.js');
    const { eq, inArray } = await import('drizzle-orm');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    // جلب بيانات اللاعبين
    const playerRows = await db.select({
      id: players.id,
      name: players.name,
      phone: players.phone,
    }).from(players).where(inArray(players.id, [player1Id, player2Id]));

    const p1 = playerRows.find(p => p.id === player1Id);
    const p2 = playerRows.find(p => p.id === player2Id);
    if (!p1 || !p2) return res.status(404).json({ error: 'أحد اللاعبين غير موجود' });

    // إدراج مع منع التكرار
    const { sql } = await import('drizzle-orm');
    const staffId = (req as any).user?.id || null;

    // فحص التكرار (الزوج نفسه بأي ترتيب)
    const minId = Math.min(p1.id, p2.id);
    const maxId = Math.max(p1.id, p2.id);
    const existing = await db.execute(sql`
      SELECT id FROM blocked_pairs
      WHERE LEAST(player1_id, player2_id) = ${minId}
        AND GREATEST(player1_id, player2_id) = ${maxId}
      LIMIT 1
    `);
    const existingRows = (existing as any).rows || existing || [];
    if (existingRows.length > 0) {
      return res.status(409).json({ error: 'هذا الزوج مسجل مسبقاً' });
    }

    await db.execute(sql`
      INSERT INTO blocked_pairs (player1_id, player1_phone, player1_name, player2_id, player2_phone, player2_name, reason, created_by)
      VALUES (${p1.id}, ${p1.phone}, ${p1.name}, ${p2.id}, ${p2.phone}, ${p2.name}, ${reason || null}, ${staffId})
    `);

    res.json({ success: true, pair: { player1: p1, player2: p2, reason } });
  } catch (err: any) {
    // الفهرس الفريد يمنع التكرار
    if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
      return res.status(409).json({ error: 'هذا الزوج مسجل مسبقاً' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/seating/blocked-pairs/:id — حذف زوج ممنوع
router.delete('/blocked-pairs/:id', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const pairId = parseInt(req.params.id);
  if (!pairId) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const { sql } = await import('drizzle-orm');
    await db.execute(sql`DELETE FROM blocked_pairs WHERE id = ${pairId}`);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
