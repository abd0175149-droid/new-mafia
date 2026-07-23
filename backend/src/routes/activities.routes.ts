// ══════════════════════════════════════════════════════
// 📋 مسارات الأنشطة — Activities Routes
// CRUD + إشعارات + ربط بالغرف
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, sql, or, and, isNull, isNotNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, notifications, staff, activityTickets, bookings } from '../schemas/admin.schema.js';
import { sessions, matches, matchPlayers } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { authenticate, authorize, leaderOrAbove } from '../middleware/auth.js';
import { getDriveService } from './drive.routes.js';
import { linkSessionToActivity, unlinkSessionFromActivity, createSession, deleteSession, closeSession } from '../services/session.service.js';
import { getActivityAttendanceStats } from '../services/booking.service.js';
import { generateRoomCode } from '../game/state.js';
import { resolveRoomCapacity, clampCapacity } from '../services/capacity.service.js';

// ── تحويل التاريخ بتوقيت الأردن (UTC+3) ──
// datetime-local يرسل "2026-04-28T18:30" بدون timezone
// نضيف +03:00 ليتم تحويله لـ UTC صحيح عند الحفظ
function parseJordanDate(dateStr: string): Date {
  const s = String(dateStr).trim();
  // إذا فيه timezone أصلاً (Z أو +/-) → نتركه
  if (s.endsWith('Z') || /[+\-]\d{2}:\d{2}$/.test(s)) {
    return new Date(s);
  }
  // إذا فيه T بدون timezone → نضيف +03:00
  if (s.includes('T')) {
    // "2026-04-28T18:30" → نضيف ":00+03:00"
    // "2026-04-28T18:30:00" → نضيف "+03:00" فقط
    const hasSeconds = /T\d{2}:\d{2}:\d{2}/.test(s);
    return new Date(hasSeconds ? s + '+03:00' : s + ':00+03:00');
  }
  // fallback
  return new Date(s);
}

const router = Router();

// 📂 المجلد الرئيسي في Google Drive الذي يتم إنشاء مجلدات الأنشطة بداخله
const ACTIVITIES_PARENT_FOLDER_ID = '1MLgq3qx0by7pi_MStkAofEiUYb4n33ml';

// GET /api/activities/available — الأنشطة القابلة للربط بلعبة (بدون auth — يستخدمها القائد)
router.get('/available', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    // عرض كل الأنشطة المخططة أو النشطة (بغض النظر عن وجود غرفة مربوطة)
    const rows = await db.select()
      .from(activities)
      .where(
        and(
          or(eq(activities.status, 'planned'), eq(activities.status, 'active')),
          isNull(activities.deletedAt)
        )
      )
      .orderBy(desc(activities.date));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id/attendance — إحصائيات الحضور لنشاط
router.get('/:id/attendance', authenticate, async (req: Request, res: Response) => {
  try {
    const stats = await getActivityAttendanceStats(parseInt(req.params.id));
    res.json(stats || { totalBookings: 0, totalPeopleBooked: 0, checkedInBookings: 0, checkedInPeople: 0, noShowBookings: 0, noShowPeople: 0, attendanceRate: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id/games-per-player — عدد الألعاب التي لعبها كل لاعب في النشاط (عبر كل الغرف)
// المفتاح: حساب اللاعب (players.id) — يطابق booking.playerId مباشرةً؛ ونُرجِع الهاتف كبديل للمطابقة.
router.get('/:id/games-per-player', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  try {
    const rows = await db
      .select({
        playerId: matchPlayers.playerId,
        phone: players.phone,
        games: sql<number>`count(distinct ${matchPlayers.matchId})::int`,
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .innerJoin(sessions, eq(matches.sessionId, sessions.id))
      .leftJoin(players, eq(matchPlayers.playerId, players.id))
      .where(and(eq(sessions.activityId, id), isNotNull(matchPlayers.playerId)))
      .groupBy(matchPlayers.playerId, players.phone);
    res.json({ players: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activities/:id/link-session — ربط نشاط بغرفة موجودة
router.post('/:id/link-session', authenticate, async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId مطلوب' });

  try {
    const success = await linkSessionToActivity(sessionId, parseInt(req.params.id));
    if (!success) return res.status(500).json({ error: 'فشل الربط' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activities/:id/unlink-session — فك ربط نشاط من غرفة
router.post('/:id/unlink-session', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const { sessionId: targetSessionId } = req.body;

    if (targetSessionId) {
      // فك ربط غرفة محددة
      const success = await unlinkSessionFromActivity(targetSessionId);
      if (!success) return res.status(500).json({ error: 'فشل فك الربط' });
    } else {
      // فك ربط الغرفة الأساسية (التوافق مع الكود القديم)
      const activity = await db.select({ sessionId: activities.sessionId })
        .from(activities)
        .where(eq(activities.id, parseInt(req.params.id)))
        .limit(1);

      const sId = activity[0]?.sessionId;
      if (!sId) return res.status(400).json({ error: 'النشاط غير مرتبط بغرفة' });

      const success = await unlinkSessionFromActivity(sId);
      if (!success) return res.status(500).json({ error: 'فشل فك الربط' });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id/rooms — جلب كل الغرف المرتبطة بنشاط
router.get('/:id/rooms', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);

    // جلب الغرف المرتبطة بهذا النشاط (بدون المحذوفة)
    const rooms = await db.select()
      .from(sessions)
      .where(and(
        eq(sessions.activityId, activityId),
        sql`${sessions.status} != 'deleted'`,
        isNull(sessions.deletedAt)
      ))
      .orderBy(desc(sessions.createdAt));

    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id/rooms-summary — ملخص ألعاب النشاط مقسم حسب الغرف
router.get('/:id/rooms-summary', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);
    const { matches, matchPlayers } = await import('../schemas/game.schema.js');
    const { eq: drizzleEq, desc: drizzleDesc, and: drizzleAnd, sql: drizzleSql, isNull: drizzleIsNull } = await import('drizzle-orm');

    // جلب الغرف (بدون المحذوفة)
    const rooms = await db.select().from(sessions)
      .where(drizzleAnd(
        drizzleEq(sessions.activityId, activityId),
        drizzleSql`${sessions.status} != 'deleted'`,
        drizzleIsNull(sessions.deletedAt)
      ))
      .orderBy(drizzleDesc(sessions.createdAt));

    // لكل غرفة: جلب مباراياتها مع إحصاءات
    const roomsWithMatches = await Promise.all(rooms.map(async (room) => {
      const roomMatches = await db.select({
        id: matches.id,
        gameName: matches.gameName,
        roomCode: matches.roomCode,
        playerCount: matches.playerCount,
        winner: matches.winner,
        totalRounds: matches.totalRounds,
        durationSeconds: matches.durationSeconds,
        createdAt: matches.createdAt,
        endedAt: matches.endedAt,
      })
        .from(matches)
        .where(drizzleAnd(
          drizzleEq(matches.sessionId, room.id),
          drizzleEq(matches.isActive, false),
        ))
        .orderBy(drizzleDesc(matches.createdAt));

      // إحصاءات الغرفة
      const totalMatches = roomMatches.length;
      const mafiaWins = roomMatches.filter(m => m.winner === 'MAFIA').length;
      const citizenWins = roomMatches.filter(m => m.winner === 'CITIZEN').length;
      const totalDuration = roomMatches.reduce((s, m) => s + (m.durationSeconds || 0), 0);

      return {
        id: room.id,
        sessionCode: room.sessionCode,
        displayPin: room.displayPin,
        sessionName: room.sessionName,
        maxPlayers: room.maxPlayers,
        isActive: room.isActive,
        status: room.status,
        createdAt: room.createdAt,
        stats: { totalMatches, mafiaWins, citizenWins, totalDuration },
        matches: roomMatches,
      };
    }));

    res.json({ success: true, rooms: roomsWithMatches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id/unbooked-players — جلب اللاعبين الذين دخلوا الغرف بدون حجز
router.get('/:id/unbooked-players', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);
    const { eq, sql } = await import('drizzle-orm');
    const { bookings } = await import('../schemas/admin.schema.js');

    // 1. جلب جميع اللاعبين الذين دخلوا جلسات تابعة لهذا النشاط
    const joinedRows = await db.execute(sql`
      SELECT player_id, player_name, phone 
      FROM session_players sp
      JOIN sessions s ON sp.session_id = s.id
      WHERE s.activity_id = ${activityId}
      
      UNION
      
      SELECT mp.player_id, mp.player_name, NULL as phone
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      JOIN sessions s ON m.session_id = s.id
      WHERE s.activity_id = ${activityId}
    `);
    
    // إزالة التكرار بناءً على player_name أو player_id
    const rawJoinedPlayers = ((joinedRows as any).rows || joinedRows) as any[];
    const uniquePlayersMap = new Map();
    
    for (const p of rawJoinedPlayers) {
      const key = p.player_id ? `id_${p.player_id}` : `name_${p.player_name.trim()}`;
      if (!uniquePlayersMap.has(key)) {
        uniquePlayersMap.set(key, p);
      } else {
        // إذا كان هناك نسخة برقم هاتف، نفضلها على النسخة التي بدون رقم هاتف (من match_players)
        if (p.phone && !uniquePlayersMap.get(key).phone) {
          uniquePlayersMap.set(key, p);
        }
      }
    }
    const joinedPlayers = Array.from(uniquePlayersMap.values());

    // --- تحديث أرقام الهواتف من جدول اللاعبين إذا كانت ناقصة ---
    const { inArray } = await import('drizzle-orm');
    const { players: playersTable } = await import('../schemas/player.schema.js');
    const playerIds = joinedPlayers.map((p: any) => p.player_id).filter(Boolean);
    if (playerIds.length > 0) {
      const registeredPlayers = await db.select({ id: playersTable.id, phone: playersTable.phone })
        .from(playersTable).where(inArray(playersTable.id, playerIds));
      
      for (const p of joinedPlayers as any[]) {
        if (p.player_id) {
          const rp = registeredPlayers.find(r => r.id === p.player_id);
          if (rp && rp.phone) p.phone = rp.phone; // تحديث الرقم
        }
      }
    }

    // 2. جلب الحجوزات التابعة للنشاط
    const activityBookings = await db.select({
      playerId: bookings.playerId,
      name: bookings.name,
      phone: bookings.phone
    }).from(bookings).where(eq(bookings.activityId, activityId));

    // 3. فلترة اللاعبين غير الحاجزين
    const unbooked = joinedPlayers.filter(jp => {
      return !activityBookings.some(b => {
        // المطابقة برقم اللاعب
        if (jp.player_id && b.playerId === jp.player_id) return true;
        // المطابقة برقم الهاتف
        if (jp.phone && b.phone && jp.phone === b.phone) return true;
        // المطابقة بالاسم كخيار أخير إذا لم يتوفر غيره
        if (!jp.player_id && !jp.phone && jp.player_name === b.name) return true;
        return false;
      });
    });

    res.json({ success: true, unbooked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activities/:id/auto-book — إضافة حجز تلقائي للاعبين دخلوا الغرفة بدون حجز
router.post('/:id/auto-book', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);
    const { players } = req.body;
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'لم يتم توفير لاعبين للإضافة' });
    }

    const { bookings } = await import('../schemas/admin.schema.js');
    const { inArray } = await import('drizzle-orm');
    const { players: playersTable } = await import('../schemas/player.schema.js');

    // جلب أرقام الهواتف المؤكدة من جدول اللاعبين
    const playerIds = players.map((p: any) => p.player_id).filter(Boolean);
    let registeredPlayers: any[] = [];
    if (playerIds.length > 0) {
      registeredPlayers = await db.select({ id: playersTable.id, phone: playersTable.phone })
        .from(playersTable).where(inArray(playersTable.id, playerIds));
    }

    const newBookings = players.map((p: any) => {
      let phoneToSave = p.phone || '';
      if (p.player_id) {
        const rp = registeredPlayers.find(r => r.id === p.player_id);
        if (rp && rp.phone) phoneToSave = rp.phone;
      }
      return {
        activityId,
        name: p.player_name,
        phone: phoneToSave,
        count: 1,
        isPaid: false,
        paidAmount: '0',
        notes: 'تم تسجيله تلقائياً لدخوله الغرفة بدون حجز (عبر النظام)',
        createdBy: 'النظام (Auto-Sync)',
        playerId: p.player_id || null,
        checkedIn: true, // لأنه متواجد بالفعل في الغرفة
      };
    });

    await db.insert(bookings).values(newBookings);

    console.log(`✅ Auto-booked ${newBookings.length} players for Activity #${activityId}`);
    res.json({ success: true, message: `تم تسجيل ${newBookings.length} حجز بنجاح` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activities/:id/add-room — إنشاء غرفة جديدة مرتبطة بالنشاط
router.post('/:id/add-room', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);

    // تحقق من وجود النشاط
    const [act] = await db.select({ id: activities.id, name: activities.name, maxCapacity: activities.maxCapacity })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });

    // عدد الغرف الحالية لتسمية الغرفة الجديدة
    const existingRooms = await db.select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.activityId, activityId));

    const roomNumber = existingRooms.length + 1;
    const roomName = req.body.roomName || `${act.name} — غرفة ${roomNumber}`;
    // 🪑 مصدر السعة الموحّد (يطابق مسار السوكت): إدخال صريح ← قالب المقاعد ← سعة الفعالية ← 27
    const maxPlayers = req.body.maxPlayers
      ? clampCapacity(Number(req.body.maxPlayers))
      : await resolveRoomCapacity(activityId);

    const sessionId = await createSession(
      roomName,
      generateRoomCode(),
      Math.floor(1000 + Math.random() * 9000).toString(),
      maxPlayers,
      activityId,
    );

    if (!sessionId) return res.status(500).json({ error: 'فشل إنشاء الغرفة' });

    // جلب بيانات الغرفة المنشأة
    const [newRoom] = await db.select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    console.log(`🎮 Admin: Created Room #${sessionId} (${roomName}) for Activity #${activityId}`);
    res.status(201).json(newRoom);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/activities/:id/rooms/:sessionId — حذف غرفة نهائياً
router.delete('/:id/rooms/:sessionId', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);
    const sessionId = parseInt(req.params.sessionId);

    // جلب الـ sessionCode لمسحه من Redis
    const [sessionData] = await db.select({ sessionCode: sessions.sessionCode })
      .from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const sessionCode = sessionData?.sessionCode;

    // فك الربط أولاً
    await unlinkSessionFromActivity(sessionId);

    // حذف الغرفة (soft delete)
    const deleted = await deleteSession(sessionId);
    if (!deleted) return res.status(500).json({ error: 'فشل حذف الغرفة' });

    // مسح الغرفة من الذاكرة والـ Redis لتختفي من واجهة الليدر
    if (sessionCode) {
      try {
        const { getRoomByCode } = await import('../game/state.js');
        const { deleteGameState } = await import('../config/redis.js');
        const { activeRooms } = await import('../sockets/lobby.socket.js');
        
        const existingState = await getRoomByCode(sessionCode);
        if (existingState) {
           await deleteGameState(existingState.roomId);
           await deleteGameState(`code:${sessionCode}`);
           activeRooms.delete(existingState.roomId);
           console.log(`🧹 Cleared Session #${sessionId} (${sessionCode}) from Redis and activeRooms`);
        }
      } catch (e: any) {
        console.warn('⚠️ Could not clear Redis room:', e.message);
      }
    }

    console.log(`🗑️ Admin: Deleted Room #${sessionId} from Activity #${activityId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/activities/:id/rooms/:sessionId/close — إغلاق غرفة
router.patch('/:id/rooms/:sessionId/close', authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    // 🔒 مسار موحّد: إغلاق الجلسة + إكمال النشاط + استبيانات التقييم + طرد كل اللاعبين
    // + تنظيف Redis/activeRooms (موثوق حتى لو حُذفت حالة Redis مسبقاً).
    const { endActivityRoom } = await import('../services/session.service.js');
    const result = await endActivityRoom(sessionId, req.app.get('io'));
    if (!result.closed) return res.status(500).json({ error: 'فشل إغلاق الغرفة' });

    console.log(`🔒 Activity: Closed Room #${sessionId} (room ${result.roomId || 'n/a'}, feedback ${result.feedbackCount})`);
    res.json({ success: true, roomId: result.roomId, feedbackCount: result.feedbackCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id — جلب نشاط واحد
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const [act] = await db.select().from(activities)
    .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
    .limit(1);
  if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });
  res.json(act);
});

// ── 🪑 PUT /api/activities/:id/seat-assignments ──
// تخصيص مقاعد مؤقّت لهذا النشاط فقط (لا يمسّ القالب المشترك). يُدمج فوق pinnedSeats القالب
// عند تحميل الروم (loadSeatTemplateIntoState). كلّ عنصر: { seatNumber, playerId?, phone?, playerName }.
router.put('/:id/seat-assignments', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });

  const raw = Array.isArray(req.body?.seatAssignments) ? req.body.seatAssignments : null;
  if (!raw) return res.status(400).json({ error: 'seatAssignments مطلوبة (مصفوفة)' });

  const [act] = await db.select({ id: activities.id, seatTemplateId: activities.seatTemplateId, maxCapacity: activities.maxCapacity })
    .from(activities).where(and(eq(activities.id, id), isNull(activities.deletedAt))).limit(1);
  if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });

  // أقصى رقم مقعد: من القالب المرتبط إن وُجد، وإلا سعة النشاط
  let maxSeat = Number(act.maxCapacity) || 50;
  if (act.seatTemplateId) {
    const { seatTemplates } = await import('../schemas/seat-templates.schema.js');
    const [tpl] = await db.select({ totalSeats: seatTemplates.totalSeats })
      .from(seatTemplates).where(eq(seatTemplates.id, act.seatTemplateId)).limit(1);
    if (tpl?.totalSeats) maxSeat = Number(tpl.totalSeats);
  }

  const norm = (p?: string) => { if (!p) return ''; let c = String(p).replace(/[\s\-()+]/g, ''); if (c.startsWith('00962')) c = c.slice(5); else if (c.startsWith('962')) c = c.slice(3); return c.startsWith('0') ? c : '0' + c; };
  const samePerson = (a: any, b: any) =>
    (a.playerId && b.playerId && Number(a.playerId) === Number(b.playerId)) ||
    (!!norm(a.phone) && norm(a.phone) === norm(b.phone)) ||
    (a.playerName && b.playerName && String(a.playerName).trim().toLowerCase() === String(b.playerName).trim().toLowerCase());

  const cleaned: any[] = [];
  const seenSeats = new Set<number>();
  for (const p of raw) {
    const seatNumber = Number(p?.seatNumber);
    const playerName = String(p?.playerName || '').trim();
    if (!Number.isFinite(seatNumber) || seatNumber < 1 || seatNumber > maxSeat)
      return res.status(400).json({ error: `رقم مقعد غير صالح: ${p?.seatNumber} (المدى 1..${maxSeat})` });
    if (!playerName) return res.status(400).json({ error: 'كل تخصيص يحتاج اسم لاعب' });
    if (seenSeats.has(seatNumber)) return res.status(400).json({ error: `المقعد ${seatNumber} مخصَّص أكثر من مرّة` });
    const entry: any = { seatNumber, playerName };
    if (p.playerId != null && Number.isFinite(Number(p.playerId))) entry.playerId = Number(p.playerId);
    if (p.phone) entry.phone = String(p.phone);
    if (cleaned.some(c => samePerson(c, entry))) return res.status(400).json({ error: `«${playerName}» مخصَّص لأكثر من مقعد` });
    seenSeats.add(seatNumber);
    cleaned.push(entry);
  }

  await db.update(activities).set({ seatAssignments: cleaned } as any).where(eq(activities.id, id));
  res.json({ success: true, seatAssignments: cleaned });
});

// GET /api/activities
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  // location_owner: يرى أنشطة مكانه فقط — الربط يُقرأ من قاعدة البيانات
  // (كان الكود يقرأ locationId من التوكن والتوكن لا يحمله إطلاقاً — فلتر ميّت أصلحناه)
  if (req.user?.role === 'location_owner') {
    const { staff } = await import('../schemas/admin.schema.js');
    const [me] = await db.select({ locationId: staff.locationId }).from(staff)
      .where(eq(staff.id, req.user.id)).limit(1);
    if (!me?.locationId) return res.json([]); // حساب مكان غير مربوط → لا يرى شيئاً
    const rows = await db.select().from(activities)
      .where(and(
        eq(activities.locationId, me.locationId),
        isNull(activities.deletedAt)
      ))
      .orderBy(desc(activities.date));
    return res.json(rows);
  }

  const rows = await db.select().from(activities)
    .where(isNull(activities.deletedAt))
    .orderBy(desc(activities.date));
  res.json(rows);
});

// POST /api/activities
router.post('/', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role === 'accountant') return res.status(403).json({ error: 'ليس لديك صلاحية إنشاء الأنشطة' });
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { name, date, description, basePrice, status, locationId, driveLink, enabledOfferIds, isLocked, sendNotification, maxCapacity, requireTicket, seatConstraints, seatTemplateId, menuOrderingEnabled, addGameFeeToBill } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'الاسم والتاريخ مطلوبان' });

  const result = await db.insert(activities).values({
    name,
    date: parseJordanDate(date),
    description: description || '',
    basePrice: String(basePrice || 0),
    status: status || 'planned',
    locationId: locationId || null,
    driveLink: driveLink || '',
    enabledOfferIds: Array.isArray(enabledOfferIds) ? enabledOfferIds : [],
    isLocked: isLocked || false,
    maxCapacity: maxCapacity ? Number(maxCapacity) : 20,
    requireTicket: requireTicket ?? false,
    seatConstraints: seatConstraints || null,
    seatTemplateId: seatTemplateId || null,
    // 🍽️ طلبات المنيو: المفتاح الرئيس + علَم إضافة رسوم اللعبة للفاتورة
    menuOrderingEnabled: menuOrderingEnabled === true,
    addGameFeeToBill: menuOrderingEnabled === true && addGameFeeToBill === true,
    createdBy: req.user?.id || null, // 👤 مُنشئ الفعالية (للتمييز عن بقية الأدمن لاحقاً)
  } as any).returning();

  const activity = result[0];

  // 🎮 الغرفة لا تُنشأ تلقائياً — تُنشأ فقط عبر زر "إضافة غرفة" أو دخول القائد
  // هذا يمنع ازدواجية الغرف ويضمن أن maxPlayers يُحدد بشكل صحيح

  // 📂 إنشاء مجلد Drive تلقائياً للنشاط
  if (!activity.driveLink) {
    try {
      const drive = getDriveService();
      const folderRes = await drive.files.create({
        requestBody: {
          name: `${name} — #${activity.id}`,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [ACTIVITIES_PARENT_FOLDER_ID],
        },
        fields: 'id, webViewLink',
      });

      if (folderRes.data.id) {
        const driveLink = `https://drive.google.com/drive/folders/${folderRes.data.id}`;
        await db.update(activities)
          .set({ driveLink } as any)
          .where(eq(activities.id, activity.id));
        activity.driveLink = driveLink;
        console.log(`📂 Auto-created Drive folder for Activity #${activity.id}: ${folderRes.data.id}`);
      }
    } catch (err: any) {
      console.error('⚠️ Failed to auto-create Drive folder:', err.message);
    }
  }

  res.status(201).json(activity);

  // 🔔 Push للاعبين (نشاط جديد) + الموظفين
  import('../services/fcm.service.js').then(async ({ sendPushToAllPlayers, sendPushToPlayers, sendPushToStaffByPermission }) => {
    // هل طلب المشرف إرسال إشعار؟ (القيمة الافتراضية true)
    if (sendNotification === false) {
      console.log(`🔕 Activity #${activity.id}: player push SKIPPED (admin disabled notification)`);
      return;
    }

    // فحص إذا النشاط مرتبط بموقع اختباري
    let isTestActivity = false;
    if (locationId) {
      try {
        const { locations } = await import('../schemas/admin.schema.js');
        const [loc] = await db.select({ isTestLocation: locations.isTestLocation })
          .from(locations).where(eq(locations.id, locationId)).limit(1);
        isTestActivity = loc?.isTestLocation || false;
      } catch {}
    }

    if (isTestActivity) {
      const { players } = await import('../schemas/player.schema.js');
      const testPlayers = await db.select({ id: players.id }).from(players)
        .where(eq(players.isTestAccount, true));
      const testIds = testPlayers.map(p => p.id);
      if (testIds.length > 0) {
        sendPushToPlayers(testIds, '📅 نشاط جديد (اختباري)', `تم إضافة نشاط: ${name}`, 'new_activity', {
          activityId: activity.id,
          url: `/player/games?activityId=${activity.id}`,
        });
      }
      console.log(`🧪 Test activity push sent to ${testIds.length} test accounts only`);
    } else {
      sendPushToAllPlayers('📅 نشاط جديد', `تم إضافة نشاط: ${name}`, 'new_activity', {
        activityId: activity.id,
        url: `/player/games?activityId=${activity.id}`,
      });
    }

    sendPushToStaffByPermission('activities', '📅 نشاط جديد', `تم جدولة نشاط: ${name}`, 'new_activity', {
      targetId: `activity-${activity.id}`,
      url: '/admin/activities',
    }, req.user!.id);
  }).catch((err: any) => { console.error('❌ Activity push error:', err?.message || err); });
});

// POST /api/activities/:id/create-drive-folder — إنشاء مجلد Drive لنشاط قديم بدون مجلد
router.post('/:id/create-drive-folder', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);
    const [act] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
    if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });

    if (act.driveLink) {
      return res.json({ success: true, driveLink: act.driveLink, message: 'المجلد موجود مسبقاً' });
    }

    const drive = getDriveService();
    const folderRes = await drive.files.create({
      requestBody: {
        name: `${act.name} — #${act.id}`,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ACTIVITIES_PARENT_FOLDER_ID],
      },
      fields: 'id, webViewLink',
    });

    if (!folderRes.data.id) {
      return res.status(500).json({ error: 'فشل إنشاء المجلد' });
    }

    const driveLink = `https://drive.google.com/drive/folders/${folderRes.data.id}`;
    await db.update(activities).set({ driveLink } as any).where(eq(activities.id, activityId));

    console.log(`📂 Created Drive folder for old Activity #${activityId}: ${folderRes.data.id}`);
    res.json({ success: true, driveLink });
  } catch (err: any) {
    console.error('❌ Failed to create Drive folder:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/activities/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role === 'accountant') return res.status(403).json({ error: 'ليس لديك صلاحية تعديل الأنشطة' });
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, date, description, basePrice, status, locationId, driveLink, enabledOfferIds, isLocked, sessionId, maxCapacity, difficulty, requireTicket, seatConstraints, seatTemplateId, menuOrderingEnabled, addGameFeeToBill } = req.body;

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (date !== undefined) updates.date = parseJordanDate(date);
  if (description !== undefined) updates.description = description;
  if (basePrice !== undefined) updates.basePrice = String(basePrice);
  if (status !== undefined) updates.status = status;
  if (locationId !== undefined) updates.locationId = locationId;
  if (driveLink !== undefined) updates.driveLink = driveLink;
  if (enabledOfferIds !== undefined) updates.enabledOfferIds = enabledOfferIds;
  if (isLocked !== undefined) updates.isLocked = isLocked;
  if (sessionId !== undefined) updates.sessionId = sessionId;
  if (maxCapacity !== undefined) updates.maxCapacity = maxCapacity;
  if (difficulty !== undefined) updates.difficulty = difficulty;
  if (requireTicket !== undefined) updates.requireTicket = requireTicket;
  if (seatConstraints !== undefined) updates.seatConstraints = seatConstraints;
  if (seatTemplateId !== undefined) updates.seatTemplateId = seatTemplateId;
  if (menuOrderingEnabled !== undefined) updates.menuOrderingEnabled = menuOrderingEnabled === true;
  if (addGameFeeToBill !== undefined) updates.addGameFeeToBill = addGameFeeToBill === true;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
  }

  const result = await db.update(activities).set(updates).where(eq(activities.id, id)).returning();
  if (result.length === 0) return res.status(404).json({ error: 'النشاط غير موجود' });

  res.json(result[0]);
});

// DELETE /api/activities/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const deleteDriveFolder = req.query.deleteDriveFolder === 'true';

  const existing = await db.select().from(activities)
    .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
    .limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'النشاط غير موجود' });

  // Delete Drive Folder if requested and link exists
  if (deleteDriveFolder && existing[0].driveLink) {
    try {
      const match = existing[0].driveLink.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        const folderId = match[1];
        const drive = getDriveService();
        await drive.files.delete({ fileId: folderId });
        console.log(`Deleted Drive Folder: ${folderId}`);
      }
    } catch (e: any) {
      console.error('Failed to delete associated Drive folder:', e.message);
    }
  }

  const now = new Date();

  // 🗑️ حذف جميع الغرف المرتبطة بالنشاط (soft delete)
  try {
    const linkedRooms = await db.select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.activityId, id));

    if (linkedRooms.length > 0) {
      await db.update(sessions)
        .set({ isActive: false, status: 'deleted', deletedAt: now } as any)
        .where(eq(sessions.activityId, id));
      console.log(`🗑️ Soft-deleted ${linkedRooms.length} room(s) linked to Activity #${id}`);
    }
  } catch (e: any) {
    console.error('Failed to delete linked sessions:', e.message);
  }

  // 🗑️ حذف جميع الحجوزات التابعة للنشاط (soft delete)
  try {
    await db.update(bookings)
      .set({ deletedAt: now } as any)
      .where(eq(bookings.activityId, id));
    console.log(`🗑️ Soft-deleted bookings linked to Activity #${id}`);
  } catch (e: any) {
    console.error('Failed to delete linked bookings:', e.message);
  }

  // 🗑️ حذف جميع التذاكر التابعة للنشاط (soft delete)
  try {
    await db.update(activityTickets)
      .set({ deletedAt: now } as any)
      .where(eq(activityTickets.activityId, id));
    console.log(`🎫 Soft-deleted tickets linked to Activity #${id}`);
  } catch (e: any) {
    console.error('Failed to delete linked tickets:', e.message);
  }

  // 🗑️ حذف النشاط نفسه (soft delete)
  await db.update(activities)
    .set({ deletedAt: now, status: 'cancelled' } as any)
    .where(eq(activities.id, id));

  console.log(`🗑️ Soft-deleted Activity #${id}`);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════
// 🎫 إدارة التذاكر (Activity Tickets)
// ══════════════════════════════════════════════════════

// POST /api/activities/:id/upload-tickets — رفع ملف Excel/CSV بأرقام التذاكر
router.post('/:id/upload-tickets', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const activityId = parseInt(req.params.id);
  const { tickets } = req.body; // مصفوفة من أرقام التذاكر (parsed by frontend)

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return res.status(400).json({ error: 'يرجى إرسال مصفوفة أرقام التذاكر' });
  }

  // التحقق من وجود النشاط
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!activity) return res.status(404).json({ error: 'النشاط غير موجود' });

  // جلب التذاكر الموجودة
  const existing = await db.select({ ticketNumber: activityTickets.ticketNumber })
    .from(activityTickets)
    .where(eq(activityTickets.activityId, activityId));
  const existingSet = new Set(existing.map(t => t.ticketNumber));

  // فلترة المكررات
  const uniqueTickets = [...new Set(tickets.map((t: string) => String(t).trim()).filter(Boolean))];
  const newTickets = uniqueTickets.filter(t => !existingSet.has(t));
  const duplicates = uniqueTickets.length - newTickets.length;

  if (newTickets.length > 0) {
    await db.insert(activityTickets).values(
      newTickets.map(t => ({
        activityId,
        ticketNumber: t,
      } as any))
    );
  }

  console.log(`🎫 Uploaded ${newTickets.length} tickets for Activity #${activityId} (${duplicates} duplicates skipped)`);
  res.json({ success: true, uploaded: newTickets.length, duplicates, total: existingSet.size + newTickets.length });
});

// GET /api/activities/:id/tickets — جلب قائمة التذاكر مع حالة الاستخدام
router.get('/:id/tickets', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const activityId = parseInt(req.params.id);
  const ticketsList = await db.select().from(activityTickets)
    .where(eq(activityTickets.activityId, activityId));

  const used = ticketsList.filter(t => t.isUsed).length;
  res.json({
    success: true,
    tickets: ticketsList,
    summary: { total: ticketsList.length, used, available: ticketsList.length - used },
  });
});

// DELETE /api/activities/:id/tickets — حذف كل التذاكر لنشاط معين
router.delete('/:id/tickets', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const activityId = parseInt(req.params.id);
  await db.update(activityTickets)
    .set({ deletedAt: new Date() } as any)
    .where(eq(activityTickets.activityId, activityId));
  res.json({ success: true });
});

export default router;
