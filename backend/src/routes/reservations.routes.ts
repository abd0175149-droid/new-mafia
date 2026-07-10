// ══════════════════════════════════════════════════════
// 📋 مسارات متابعة الحجوزات — Reservations Tracker Routes
// CRUD مستقل تماماً عن نظام الحجوزات المالي (bookings)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, isNull, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { reservations, activities } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// يطبّع الهاتف ويعيد لاعباً مطابقاً تماماً (بصفرٍ بادئ أو بدونه) — لربط الحجز بحساب مسجّل تلقائياً
async function findPlayerByPhone(db: any, phone: string): Promise<number | null> {
  const p = String(phone || '').replace(/[\s-]/g, '');
  if (p.length < 6) return null;
  const candidates = p.startsWith('0') ? [p, p.slice(1)] : [p, `0${p}`];
  try {
    const [row] = await db.select({ id: players.id }).from(players).where(inArray(players.phone, candidates)).limit(1);
    return row?.id ?? null;
  } catch { return null; }
}

// GET /api/reservations?activityId=
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const conditions: any[] = [isNull(reservations.deletedAt)];

  if (req.query.activityId && req.query.activityId !== 'all') {
    conditions.push(eq(reservations.activityId, parseInt(req.query.activityId as string)));
  }

  let query = db.select().from(reservations).orderBy(desc(reservations.createdAt)).$dynamic();
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(and(...conditions));
  }

  const rows = await query;
  res.json(rows);
});

// POST /api/reservations
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { activityId, contactName, contactMethod, phone, peopleCount, notes, playerId } = req.body;
  if (!contactName) return res.status(400).json({ error: 'اسم الشخص مطلوب' });

  const createdByName = req.user?.displayName || req.user?.username || '';

  // 🔗 الربط الذكي: مُعرّف اللاعب المُرسَل صراحةً، وإلّا مطابقة الهاتف تلقائياً بحساب مسجّل
  let linkedPlayerId: number | null = playerId ? Number(playerId) : null;
  if (!linkedPlayerId && phone) linkedPlayerId = await findPlayerByPhone(db, phone);

  const result = await db.insert(reservations).values({
    activityId: activityId || null,
    contactName,
    contactMethod: contactMethod || '',
    phone: phone || '',
    peopleCount: peopleCount || 1,
    playerId: linkedPlayerId,
    status: 'pending',
    notes: notes || '',
    createdBy: createdByName,
  } as any).returning();

  res.status(201).json(result[0]);
});

// PUT /api/reservations/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const existing = await db.select().from(reservations)
    .where(and(eq(reservations.id, id), isNull(reservations.deletedAt))).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  const { contactName, contactMethod, phone, peopleCount, status, notes, attended, playerId } = req.body;

  const updates: any = { updatedAt: new Date() };
  if (contactName !== undefined) updates.contactName = contactName;
  if (contactMethod !== undefined) updates.contactMethod = contactMethod;
  if (phone !== undefined) updates.phone = phone;
  if (peopleCount !== undefined) updates.peopleCount = peopleCount;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (attended !== undefined) updates.attended = attended;
  if (playerId !== undefined) updates.playerId = playerId === null ? null : Number(playerId);

  const result = await db.update(reservations).set(updates).where(eq(reservations.id, id)).returning();
  res.json(result[0]);
});

// DELETE /api/reservations/:id (soft delete)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const existing = await db.select().from(reservations)
    .where(and(eq(reservations.id, id), isNull(reservations.deletedAt))).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  await db.update(reservations).set({ deletedAt: new Date() } as any).where(eq(reservations.id, id));
  res.json({ success: true });
});

export default router;
