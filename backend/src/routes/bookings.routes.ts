// ══════════════════════════════════════════════════════
// 🎟️ مسارات الحجوزات — Bookings Routes
// CRUD + مطابقة مع اللاعبين + إشعارات
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, like, or, sql, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { bookings, activities, notifications, staff } from '../schemas/admin.schema.js';
import { sessions } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── (مُعطّلة عمداً) عدد المقاعد لم يعد مربوطاً بعدد الحاجزين ──
// السعة تأتي الآن من قالب المقاعد (totalSeats) إن وُجد، وإلا الافتراضي 27 (قابل للتعديل من الليدر).
// الحجز مفتوح بلا سقف: قد يحجز عددٌ أكبر من المقاعد لأن اللاعبين يتناوبون.
// نُبقي الدالة (no-op) لتجنّب تعديل كل مواضع الاستدعاء.
async function syncSessionMaxPlayers(_activityId: number) {
  return;
}

// GET /api/bookings?activityId=&status=&search=
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const conditions: any[] = [isNull(bookings.deletedAt)];

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
  if (req.user?.role === 'accountant') return res.status(403).json({ error: 'ليس لديك صلاحية إنشاء الحجوزات' });
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { activityId, name, phone, count, isPaid, paidAmount, receivedBy, isFree, notes, offerItems } = req.body;
  if (!activityId || !name) return res.status(400).json({ error: 'النشاط والاسم مطلوبان' });

  const createdByName = req.user?.displayName || req.user?.username || '';

  let finalIsFree = isFree || false;
  let finalIsPaid = isPaid || false;
  let finalPaidAmount = String(paidAmount || 0);

  // التحقق من حساب اللاعب إذا كان مجانياً
  if (phone) {
    const pRow = await db.select({ isFreeAccount: players.isFreeAccount }).from(players).where(eq(players.phone, phone)).limit(1);
    if (pRow.length > 0 && pRow[0].isFreeAccount) {
      finalIsFree = true;
      finalIsPaid = true; // نعتبره مدفوعاً لأنه مجاني
      finalPaidAmount = '0';
    }
  }

  const result = await db.insert(bookings).values({
    activityId,
    name,
    phone: phone || '',
    count: count || 1,
    isPaid: finalIsPaid,
    paidAmount: finalPaidAmount,
    receivedBy: receivedBy || '',
    isFree: finalIsFree,
    notes: notes || '',
    offerItems: Array.isArray(offerItems) ? offerItems : [],
    createdBy: createdByName,
  } as any).returning();

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
    } as any);
  }

  res.status(201).json(booking);

  // 🔔 Push للموظفين
  import('../services/fcm.service.js').then(({ sendPushToStaffByPermission }) => {
    sendPushToStaffByPermission('bookings', '🎟️ حجز جديد', `حجز جديد باسم ${name}`, 'new_booking', {
      targetId: `booking-${booking.id}`,
      url: '/admin/bookings',
    });
  }).catch(() => {});

  // تحديث maxPlayers في الغرفة حسب عدد الأشخاص
  syncSessionMaxPlayers(activityId).catch(() => {});
});

// PUT /api/bookings/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role === 'accountant') return res.status(403).json({ error: 'ليس لديك صلاحية تعديل الحجوزات' });
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, phone, count, paidAmount, receivedBy, notes, isPaid, isFree, offerItems } = req.body;

  const existing = await db.select().from(bookings).where(and(eq(bookings.id, id), isNull(bookings.deletedAt))).limit(1);
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
      } as any);
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
  const { paidAmount, receivedBy, notes } = req.body;

  const updates: any = { isPaid: true, paidAmount: String(paidAmount || 0) };
  if (receivedBy !== undefined) updates.receivedBy = receivedBy;
  if (notes !== undefined) updates.notes = notes;

  const existing = await db.select().from(bookings).where(and(eq(bookings.id, id), isNull(bookings.deletedAt))).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  const result = await db.update(bookings)
    .set(updates)
    .where(eq(bookings.id, id))
    .returning();

  // إشعار عند تأكيد الدفع
  if (!existing[0].isPaid) {
    const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
    for (const admin of admins) {
      await db.insert(notifications).values({
        userId: admin.id,
        title: '💰 تأكيد دفع',
        message: `تم تأكيد دفع ${paidAmount} ${receivedBy ? `بواسطة ${receivedBy}` : ''} — ${existing[0].name}`,
        type: 'financial',
        targetId: `booking-${id}`,
      } as any);
    }
  }

  res.json(result[0]);
});

// DELETE /api/bookings/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role === 'accountant') return res.status(403).json({ error: 'ليس لديك صلاحية حذف الحجوزات' });
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const existing = await db.select().from(bookings).where(and(eq(bookings.id, id), isNull(bookings.deletedAt))).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'الحجز غير موجود' });

  await db.update(bookings).set({ deletedAt: new Date() } as any).where(eq(bookings.id, id));
  res.json({ success: true });

  // تحديث maxPlayers في الغرفة حسب عدد الأشخاص
  if (existing[0]?.activityId) syncSessionMaxPlayers(existing[0].activityId).catch(() => {});
});

export default router;
