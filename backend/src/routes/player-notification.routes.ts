// ══════════════════════════════════════════════════════
// 🔔 مسارات إشعارات اللاعبين — Player Notification Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { playerNotifications, playerFcmTokens } from '../schemas/notification.schema.js';
import { registerPlayerToken } from '../services/fcm.service.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';

const router = Router();

// ── Helper: استخراج playerId من JWT ──
function extractPlayerId(req: Request): number | null {
  return (req as any).playerAccount?.playerId || null;
}

// ── POST /register-token — تسجيل FCM Token ──
router.post('/register-token', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });

  const { token, deviceInfo } = req.body;
  if (!token) return res.status(400).json({ error: 'token مطلوب' });

  await registerPlayerToken(playerId, token, deviceInfo || '');
  res.json({ success: true });
});

// ── GET / — جلب إشعارات اللاعب ──
router.get('/', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });

  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const limit = parseInt(req.query.limit as string) || 50;

  const rows = await db.select().from(playerNotifications)
    .where(eq(playerNotifications.playerId, playerId))
    .orderBy(desc(playerNotifications.createdAt))
    .limit(limit);

  res.json({ success: true, notifications: rows });
});

// ── GET /unread-count — عدد الغير مقروءة ──
router.get('/unread-count', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });

  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  const [result] = await db.select({
    count: sql<number>`COUNT(*)::int`,
  }).from(playerNotifications)
    .where(and(eq(playerNotifications.playerId, playerId), eq(playerNotifications.isRead, false)));

  res.json({ success: true, count: result?.count || 0 });
});

// ── PUT /:id/read — تعليم كمقروء ──
router.put('/:id/read', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });

  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  await db.update(playerNotifications).set({ isRead: true })
    .where(and(eq(playerNotifications.id, parseInt(req.params.id)), eq(playerNotifications.playerId, playerId)));
  res.json({ success: true });
});

// ── PUT /read-all — تعليم الكل كمقروء ──
router.put('/read-all', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });

  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  await db.update(playerNotifications).set({ isRead: true })
    .where(eq(playerNotifications.playerId, playerId));
  res.json({ success: true });
});

// ── DELETE /:id — حذف إشعار ──
router.delete('/:id', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });

  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  await db.delete(playerNotifications)
    .where(and(eq(playerNotifications.id, parseInt(req.params.id)), eq(playerNotifications.playerId, playerId)));
  res.json({ success: true });
});

export default router;
