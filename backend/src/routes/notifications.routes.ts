// ══════════════════════════════════════════════════════
// 🔔 مسارات الإشعارات — Notifications Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { notifications } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const rows = await db.select().from(notifications)
    .where(eq(notifications.userId, req.user!.id))
    .orderBy(desc(notifications.createdAt));
  res.json(rows);
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  await db.update(notifications).set({ read: true })
    .where(and(eq(notifications.id, parseInt(req.params.id)), eq(notifications.userId, req.user!.id)));
  res.json({ success: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  await db.update(notifications).set({ read: true })
    .where(eq(notifications.userId, req.user!.id));
  res.json({ success: true });
});

// PUT /api/notifications/:id/unread
router.put('/:id/unread', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  await db.update(notifications).set({ read: false })
    .where(and(eq(notifications.id, parseInt(req.params.id)), eq(notifications.userId, req.user!.id)));
  res.json({ success: true });
});

// DELETE /api/notifications/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  await db.delete(notifications)
    .where(and(eq(notifications.id, parseInt(req.params.id)), eq(notifications.userId, req.user!.id)));
  res.json({ success: true });
});

export default router;
