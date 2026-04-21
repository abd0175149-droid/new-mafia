// ══════════════════════════════════════════════════════
// 🎟️ مسارات الحجوزات — Bookings Routes
// CRUD + مطابقة مع اللاعبين + إشعارات
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, like, or, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { bookings, activities, notifications, staff } from '../schemas/admin.schema.js';
import { sessions } from '../schemas/game.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── تحديث maxPlayers في الغرفة حسب عدد الأشخاص الحاجزين ──
async function syncSessionMaxPlayers(activityId: number) {
  const db = getDB();
  if (!db) return;

  try {
    // جلب sessionId من النشاط
    const [act] = await db.select({ sessionId: activities.sessionId })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!act?.sessionId) return;

    // حساب مجموع الأشخاص (ليس عدد الحجوزات)
    const result = await db.select({
      totalPeople: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
    })
      .from(bookings)
      .where(eq(bookings.activityId, activityId));

    const totalPeople = result[0]?.totalPeople || 0;
    const newMax = Math.max(totalPeople, 6); // حد أدنى 6

    await db.update(sessions)
      .set({ maxPlayers: newMax })
      .where(eq(sessions.id, act.sessionId));

    console.log(`🔄 Session #${act.sessionId} maxPlayers updated to ${newMax} (${totalPeople} people booked)`);
  } catch (err: any) {
    console.error('❌ syncSessionMaxPlayers failed:', err.message);
  }
}

// GET /api/bookings?activityId=&status=&search=
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const conditions: any[] = [];

  if (req.query.activityId && req.query.activityId !== 'all') {
    conditions.push(eq(bookings.activityId, parseInt(req.query.activityId as string)));
  }

  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'paid') conditions.push(and(eq(bookings.isPaid, true), eq(bookings.isFree, false)));
    else if (req.query.status === 'free') conditions.push(eq(bookings.isFree, true));
    else if (req.query.status === 'unpaid') conditions.push(and(eq(bookings.isPaid, false), eq(bookings.isFree, false)));
  }

  if (req.query.search) {
    const s = `%${req.query.search}%`;
    conditions.push(or(like(bookings.name, s), like(bookings.phone, s)));
  }

  let query = db.select().from(bookings).orderBy(desc(bookings.createdAt)).$dynamic();
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(and(...conditions));
  }

  const rows = await query;
  res.json(rows);
});

// POST /api/bookings
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { activityId, name, phone, count, isPaid, paidAmount, receivedBy, isFree, notes, offerItems } = req.body;
  if (!activityId || !name) return res.status(400).json({ error: 'النشاط والاسم مطلوبان' });

  const createdByName = req.user?.displayName || req.user?.username || '';

  const result = await db.insert(bookings).values({
    activityId,
    name,
    phone: phone || '',
    count: count || 1,
    isPaid: isPaid || false,
    paidAmount: String(paidAmount || 0),
    receivedBy: receivedBy || '',
    isFree: isFree || false,
    notes: notes || '',
    offerItems: Array.isArray(offerItems) ? offerItems : [],
    createdBy: createdByName,
  }).returning();

  const booking = result[0];

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      title: 'حجز جديد',
      message: `حجز جديد باسم ${name}`,
      type: 'new_booking',
      targetId: `booking-${booking.id}`,
    });
  }

  res.status(201).json(booking);

  // تحديث maxPlayers في الغرفة حسب عدد الأشخاص
  syncSessionMaxPlayers(activityId).catch(() => {});
});

// PUT /api/bookings/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, phone, count, paidAmount, receivedBy, notes, isPaid, isFree, offerItems } = req.body;

  const existing = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (count !== undefined) updates.count = count;
  if (paidAmount !== undefined) updates.paidAmount = String(paidAmount);
  if (receivedBy !== undefined) updates.receivedBy = receivedBy;
  if (notes !== undefined) updates.notes = notes;
  if (isPaid !== undefined) updates.isPaid = isPaid;
  if (isFree !== undefined) updates.isFree = isFree;
  if (offerItems !== undefined) updates.offerItems = offerItems;

  const result = await db.update(bookings).set(updates).where(eq(bookings.id, id)).returning();

  // Notify on payment
  if (isPaid === true && !existing[0].isPaid) {
    const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
    for (const admin of admins) {
      await db.insert(notifications).values({
        userId: admin.id,
        title: 'دفعة جديدة',
        message: `تم إستلام دفعة للحجز التابع لـ ${existing[0].name}`,
        type: 'financial',
        targetId: `booking-${id}`,
      });
    }
  }

  res.json(result[0]);

  // تحديث maxPlayers في الغرفة حسب عدد الأشخاص
  if (existing[0]?.activityId) syncSessionMaxPlayers(existing[0].activityId).catch(() => {});
});

// PUT /api/bookings/:id/pay
router.put('/:id/pay', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { paidAmount } = req.body;

  const result = await db.update(bookings)
    .set({ isPaid: true, paidAmount: String(paidAmount || 0) })
    .where(eq(bookings.id, id))
    .returning();

  res.json(result[0]);
});

// DELETE /api/bookings/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const existing = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  await db.delete(bookings).where(eq(bookings.id, id));
  res.json({ success: true });

  // تحديث maxPlayers في الغرفة حسب عدد الأشخاص
  if (existing[0]?.activityId) syncSessionMaxPlayers(existing[0].activityId).catch(() => {});
});

export default router;
