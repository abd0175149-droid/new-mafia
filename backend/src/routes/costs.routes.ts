// ══════════════════════════════════════════════════════
// 💰 مسارات التكاليف — Costs Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { costs, notifications, staff } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/costs
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  if (req.user?.role === 'location_owner') return res.json([]);

  const rows = await db.select().from(costs).orderBy(desc(costs.date));
  res.json(rows);
});

// POST /api/costs
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { activityId, item, amount, date, paidBy, type } = req.body;
  if (!item || amount === undefined || !date) return res.status(400).json({ error: 'البند والمبلغ والتاريخ مطلوبين' });

  const result = await db.insert(costs).values({
    activityId: activityId || null,
    item,
    amount: String(amount),
    date: new Date(date),
    paidBy: paidBy || '',
    type: type || 'general',
  }).returning();

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      title: 'مصروف جديد',
      message: `تم إضافة مصروف جديد: ${item}`,
      type: 'cost_alert',
      targetId: `cost-${result[0].id}`,
    });
  }

  res.status(201).json(result[0]);
});

// DELETE /api/costs/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  await db.delete(costs).where(eq(costs.id, id));
  res.json({ success: true });
});

export default router;
