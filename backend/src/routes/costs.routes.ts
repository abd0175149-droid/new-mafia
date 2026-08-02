// ══════════════════════════════════════════════════════
// 💰 مسارات التكاليف — Costs Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { costs, notifications, staff } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/costs?activityId=
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  if (req.user?.role === 'location_owner') return res.json([]);

  let query = db.select().from(costs).orderBy(desc(costs.date)).$dynamic();
  
  const conditions: any[] = [isNull(costs.deletedAt)];

  if (req.query.activityId && req.query.activityId !== 'all') {
    conditions.push(eq(costs.activityId, parseInt(req.query.activityId as string)));
  }

  query = query.where(and(...conditions));

  const rows = await query;
  res.json(rows);
});

// POST /api/costs
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { activityId, item, amount, date, paidBy, type, scope, playerId } = req.body;
  if (!item || amount === undefined || !date) return res.status(400).json({ error: 'البند والمبلغ والتاريخ مطلوبين' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'المبلغ غير صالح' });

  // «من دفعه» إلزامي ويجب أن يكون أحد الشركاء — الاسم الحرفي هو مفتاح الربط في تقارير التسوية/الموازنة
  const payerName = String(paidBy ?? '').trim();
  if (!payerName) return res.status(400).json({ error: 'حدّد من دفع المصروف (أحد الشركاء)' });
  const [payer] = await db.select({ id: staff.id }).from(staff)
    .where(and(eq(staff.displayName, payerName), eq(staff.isPartner, true), isNull(staff.deletedAt)))
    .limit(1);
  if (!payer) return res.status(400).json({ error: 'الدافع يجب أن يكون أحد المستخدمين الشركاء' });

  // الارتباط (5 حالات): general | activity | player | equipment | other
  const validScopes = ['general', 'activity', 'player', 'equipment', 'other'];
  const finalScope = validScopes.includes(scope) ? scope : (activityId ? 'activity' : 'general');

  const result = await db.insert(costs).values({
    // مصروف اللاعب يمكن ربطه بنشاط اختيارياً (تكلفة لاعب ضمن فعالية محددة) أو بلا نشاط (عام على اللاعب)
    activityId: (finalScope === 'activity' || finalScope === 'player') ? (activityId || null) : null,
    item,
    amount: String(amt),
    date: new Date(date),
    paidBy: payerName,
    type: finalScope === 'activity' ? 'activity' : 'general',
    scope: finalScope,
    playerId: finalScope === 'player' ? (playerId || null) : null,
  } as any).returning();

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      title: 'مصروف جديد',
      message: `تم إضافة مصروف جديد: ${item}`,
      type: 'cost_alert',
      targetId: `cost-${result[0].id}`,
    } as any);
  }

  res.status(201).json(result[0]);

  // 🔔 Push للموظفين
  import('../services/fcm.service.js').then(({ sendPushToStaffByPermission }) => {
    sendPushToStaffByPermission('finances', '💰 مصروف جديد', `تم إضافة: ${item}`, 'cost_alert', {
      targetId: `cost-${result[0].id}`,
      url: '/admin/finance',
    });
  }).catch(() => {});
});

// DELETE /api/costs/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  await db.update(costs).set({ deletedAt: new Date() } as any).where(eq(costs.id, id));
  res.json({ success: true });
});

export default router;
