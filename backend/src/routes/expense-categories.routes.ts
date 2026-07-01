// ══════════════════════════════════════════════════════
// 🏷️ مسارات أنواع المصاريف — Expense Categories Routes
// قائمة قابلة للإضافة تُستخدم في مودال إدخال المصروف
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, asc, and, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { expenseCategories } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/expense-categories — الأنواع الفعّالة
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const rows = await db.select().from(expenseCategories)
    .where(isNull(expenseCategories.deletedAt))
    .orderBy(asc(expenseCategories.name));
  res.json(rows);
});

// POST /api/expense-categories — إضافة نوع جديد ({ name })
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  // تفادي التكرار: أعِد النوع الفعّال الموجود بنفس الاسم إن وُجد
  const existing = await db.select().from(expenseCategories)
    .where(and(eq(expenseCategories.name, name), isNull(expenseCategories.deletedAt))).limit(1);
  if (existing.length) return res.json(existing[0]);
  const result = await db.insert(expenseCategories).values({ name } as any).returning();
  res.status(201).json(result[0]);
});

// DELETE /api/expense-categories/:id — حذف ناعم
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  await db.update(expenseCategories).set({ deletedAt: new Date() } as any).where(eq(expenseCategories.id, id));
  res.json({ success: true });
});

export default router;
