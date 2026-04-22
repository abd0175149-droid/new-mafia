// ══════════════════════════════════════════════════════
// 🕹️ مسارات القائد — Leader Routes (Unified Auth)
// تستخدم JWT الموحد بدل نظام التوكنات المنفصل
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getRoom, addPlayer, updatePlayer } from '../game/state.js';
import { activeRooms } from '../sockets/lobby.socket.js';
import { addPlayerToSession } from '../services/session.service.js';

const router = Router();

// ── Helper: فك JWT ──
function verifyJWT(token: string): { valid: boolean; payload?: any } {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

// ── Middleware: requireLeader ──
export function requireLeader(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
  }

  const result = verifyJWT(token);
  if (!result.valid) {
    return res.status(401).json({ error: 'توكن غير صالح' });
  }

  // فقط admin أو leader أو manager يمكنهم الوصول
  const role = result.payload.role;
  if (!['admin', 'leader', 'manager'].includes(role)) {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  (req as any).leader = result.payload;
  next();
}

// ── POST /api/leader/login ──
// يقبل نفس بيانات الإدارة ويرجع JWT
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  try {
    // نستدعي نفس منطق الـ auth العادي
    const { getDB } = await import('../config/db.js');
    const { staff } = await import('../schemas/admin.schema.js');
    const { eq } = await import('drizzle-orm');
    const { verifyPassword, generateToken } = await import('../middleware/auth.js');

    const db = getDB();
    if (!db) return res.status(503).json({ success: false, error: 'قاعدة البيانات غير متوفرة' });

    const users = await db.select().from(staff).where(eq(staff.username, username)).limit(1);
    const user = users[0];
    if (!user) {
      return res.status(401).json({ success: false, error: 'بيانات غير صحيحة' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role as any,
      displayName: user.displayName,
    });

    res.json({
      success: true,
      token,
      displayName: user.displayName,
      username: user.username,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/leader/verify ──
router.get('/verify', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ valid: false, error: 'لا يوجد توكن' });
  }

  const result = verifyJWT(token);
  if (!result.valid) {
    return res.status(401).json({ valid: false, error: 'توكن غير صالح' });
  }

  res.json({
    valid: true,
    username: result.payload.username,
    displayName: result.payload.displayName,
  });
});

// ── GET /api/leader/state/:roomId ──
router.get('/state/:roomId', requireLeader, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const state = await getRoom(roomId);

    if (!state) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    return res.json({ success: true, state });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/leader/force-add-player ──
router.post('/force-add-player', requireLeader, async (req: Request, res: Response) => {
  try {
    const { roomId, physicalId, name, phone, dob, gender } = req.body;

    if (!roomId || physicalId === undefined || !name) {
      return res.status(400).json({ success: false, error: 'بيانات غير مكتملة' });
    }

    const state = await addPlayer(roomId, Number(physicalId), name, phone || '0700000000', null, 'leader');
    await updatePlayer(roomId, Number(physicalId), { dob, gender });

    // حفظ اللاعب في الـ Session (PostgreSQL)
    const fullState = await getRoom(roomId);
    if (fullState?.sessionId) {
      await addPlayerToSession(fullState.sessionId, Number(physicalId), name, phone, gender, dob);
    }

    const room = activeRooms.get(roomId);
    if (room) {
      room.playerCount = state.players.length;
    }

    const io = req.app.get('io');
    if (io) {
      io.to(roomId).emit('room:player-joined', {
        physicalId: Number(physicalId),
        name,
        totalPlayers: state.players.length,
        maxPlayers: state.config.maxPlayers,
        gender: gender || 'MALE',
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/leader/session-matches/:sessionId — ألعاب غرفة محددة ──
router.get('/session-matches/:sessionId', requireLeader, async (req: Request, res: Response) => {
  try {
    const { getMatchesBySession, getMatchDetails } = await import('../services/match.service.js');
    const sessionId = parseInt(req.params.sessionId);
    if (!sessionId) return res.status(400).json({ error: 'sessionId مطلوب' });

    const matches = await getMatchesBySession(sessionId);

    // جلب تفاصيل اللاعبين لكل مباراة
    const detailed = await Promise.all(
      matches.map(async (m: any) => {
        const details = await getMatchDetails(m.id);
        return details || m;
      })
    );

  res.json({ success: true, matches: detailed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/leader/manual-players/:roomId — اللاعبون المضافون يدوياً ──
router.get('/manual-players/:roomId', requireLeader, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const state = await getRoom(roomId);

    if (!state) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    // فلترة اللاعبين اليدويين فقط (addedBy: 'leader')
    const manualPlayers = state.players
      .filter((p: any) => p.addedBy === 'leader')
      .map((p: any) => ({
        physicalId: p.physicalId,
        name: p.name,
        role: p.role || null,
        isAlive: p.isAlive,
        gender: p.gender || 'MALE',
      }));

    return res.json({ success: true, players: manualPlayers, gameName: state.config.gameName });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
