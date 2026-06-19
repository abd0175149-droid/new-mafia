// ══════════════════════════════════════════════════════
// 📐 مسارات قوالب المقاعد — Seat Templates Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, leaderOrAbove } from '../middleware/auth.js';
import { seatTemplates } from '../schemas/seat-templates.schema.js';
import { eq, isNull, desc } from 'drizzle-orm';

const router = Router();

// ══════════════════════════════════════════════════════
// GET /api/seat-templates — قائمة القوالب
// ══════════════════════════════════════════════════════

router.get('/', authenticate, leaderOrAbove, async (_req: Request, res: Response) => {
  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const templates = await db.select()
      .from(seatTemplates)
      .where(isNull(seatTemplates.deletedAt))
      .orderBy(desc(seatTemplates.createdAt));

    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/seat-templates/:id — تفاصيل قالب
// ══════════════════════════════════════════════════════

router.get('/:id', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const [template] = await db.select()
      .from(seatTemplates)
      .where(eq(seatTemplates.id, id))
      .limit(1);

    if (!template || template.deletedAt) {
      return res.status(404).json({ error: 'القالب غير موجود' });
    }

    res.json({ template });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/seat-templates — إنشاء قالب جديد
// ══════════════════════════════════════════════════════

router.post('/', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const {
    name,
    layoutType,
    totalSeats,
    reservedTailCount,
    pinnedSeats,
    constraintsConfig,
    seatPositions,
    layoutConfig,
    isDefault,
  } = req.body;

  if (!name || !totalSeats) {
    return res.status(400).json({ error: 'الاسم وعدد المقاعد مطلوبان' });
  }

  if (totalSeats < 6 || totalSeats > 50) {
    return res.status(400).json({ error: 'عدد المقاعد يجب أن يكون بين 6 و 50' });
  }

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const staffId = (req as any).user?.id || null;

    // إذا isDefault = true → إلغاء الافتراضي من القوالب السابقة
    if (isDefault) {
      const { sql } = await import('drizzle-orm');
      await db.execute(sql`UPDATE seat_templates SET is_default = false WHERE is_default = true`);
    }

    const [created] = await db.insert(seatTemplates).values({
      name,
      layoutType: layoutType || 'circle',
      totalSeats,
      reservedTailCount: reservedTailCount ?? 5,
      pinnedSeats: pinnedSeats || [],
      constraintsConfig: constraintsConfig || [],
      seatPositions: seatPositions || null,
      layoutConfig: layoutConfig || null,
      isDefault: isDefault || false,
      createdBy: staffId,
    }).returning();

    res.json({ success: true, template: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// PUT /api/seat-templates/:id — تعديل قالب
// ══════════════════════════════════════════════════════

router.put('/:id', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });

  const {
    name,
    layoutType,
    totalSeats,
    reservedTailCount,
    pinnedSeats,
    constraintsConfig,
    seatPositions,
    layoutConfig,
    isDefault,
  } = req.body;

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    // إذا isDefault = true → إلغاء الافتراضي من القوالب السابقة
    if (isDefault) {
      const { sql } = await import('drizzle-orm');
      await db.execute(sql`UPDATE seat_templates SET is_default = false WHERE is_default = true AND id != ${id}`);
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (layoutType !== undefined) updateData.layoutType = layoutType;
    if (totalSeats !== undefined) updateData.totalSeats = totalSeats;
    if (reservedTailCount !== undefined) updateData.reservedTailCount = reservedTailCount;
    if (pinnedSeats !== undefined) updateData.pinnedSeats = pinnedSeats;
    if (constraintsConfig !== undefined) updateData.constraintsConfig = constraintsConfig;
    if (seatPositions !== undefined) updateData.seatPositions = seatPositions;
    if (layoutConfig !== undefined) updateData.layoutConfig = layoutConfig;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const [updated] = await db.update(seatTemplates)
      .set(updateData)
      .where(eq(seatTemplates.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'القالب غير موجود' });

    res.json({ success: true, template: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// DELETE /api/seat-templates/:id — حذف قالب (soft delete)
// ══════════════════════════════════════════════════════

router.delete('/:id', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'معرّف غير صالح' });

  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    await db.update(seatTemplates)
      .set({ deletedAt: new Date() })
      .where(eq(seatTemplates.id, id));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
