// ══════════════════════════════════════════════════════
// 🏗️ مسارات التكاليف التأسيسية — Foundational Costs Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { foundationalCosts, notifications, staff } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/foundational
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  if (req.user?.role === 'location_owner') return res.json([]);

  const rows = await db.select().from(foundationalCosts).orderBy(desc(foundationalCosts.date));
  res.json(rows);
});

// POST /api/foundational
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { item, amount, paidBy, source, date } = req.body;
  if (!item || amount === undefined || !date) return res.status(400).json({ error: 'البند والمبلغ والتاريخ مطلوبين' });

  const result = await db.insert(foundationalCosts).values({
    item,
    amount: String(amount),
    paidBy: paidBy || '',
    source: source || '',
    date: new Date(date),
  }).returning();

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    if (admin.id !== req.user!.id) {
      await db.insert(notifications).values({
        userId: admin.id,
        title: 'تكلفة تأسيسية',
        message: `تم تسجيل مصروف تأسيسي جديد: ${item}`,
        type: 'foundational_cost',
        targetId: `foundational-${result[0].id}`,
      });
    }
  }

  res.status(201).json(result[0]);
});

// PUT /api/foundational/:id/process
router.put('/:id/process', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { isProcessed } = req.body;

  const existing = await db.select().from(foundationalCosts).where(eq(foundationalCosts.id, id)).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'التكلفة غير موجودة' });

  await db.update(foundationalCosts).set({ isProcessed: !!isProcessed }).where(eq(foundationalCosts.id, id));
  res.json({ success: true, isProcessed });
});

// DELETE /api/foundational/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  await db.delete(foundationalCosts).where(eq(foundationalCosts.id, id));
  res.json({ success: true });
});

export default router;
