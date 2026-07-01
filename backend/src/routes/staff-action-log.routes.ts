// ══════════════════════════════════════════════════════
// 📋 مسارات سجل عمليات الموظفين — Staff Action Log Routes
// عرض/تصفية أفعال الليدر اليدوية داخل الألعاب (أدمن فقط)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { staffActionLog, staff, activities } from '../schemas/admin.schema.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { CATEGORY_LABELS } from '../services/staff-action-log.service.js';

const router = Router();

// ── GET /api/staff-action-log/meta — بيانات الفلاتر (فعاليات + موظفون + فئات) ──
router.get('/meta', authenticate, adminOnly, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const acts = await db.select({ id: activities.id, name: activities.name })
      .from(activities).orderBy(desc(activities.id)).limit(300);
    const stf = await db.select({ id: staff.id, displayName: staff.displayName, username: staff.username })
      .from(staff);
    res.json({ activities: acts, staff: stf, categories: CATEGORY_LABELS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/staff-action-log — قائمة مصفّاة ومُصفّحة ──
router.get('/', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const q = req.query;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const offset = (page - 1) * limit;

    const conds: any[] = [];
    if (q.activityId) conds.push(eq(staffActionLog.activityId, Number(q.activityId)));
    if (q.staffId) conds.push(eq(staffActionLog.staffId, Number(q.staffId)));
    if (q.category) conds.push(eq(staffActionLog.category, String(q.category)));
    if (q.outcome) conds.push(eq(staffActionLog.outcome, String(q.outcome)));
    if (q.roomId) conds.push(eq(staffActionLog.roomId, String(q.roomId)));
    if (q.roomCode) conds.push(eq(staffActionLog.roomCode, String(q.roomCode)));
    if (q.from) conds.push(gte(staffActionLog.createdAt, new Date(String(q.from))));
    if (q.to) conds.push(lte(staffActionLog.createdAt, new Date(String(q.to))));
    const where = conds.length ? and(...conds) : undefined;

    const rows = await db.select({
      id: staffActionLog.id,
      staffId: staffActionLog.staffId,
      staffUsername: staffActionLog.staffUsername,
      staffRole: staffActionLog.staffRole,
      staffName: staff.displayName,
      source: staffActionLog.source,
      action: staffActionLog.action,
      category: staffActionLog.category,
      labelAr: staffActionLog.labelAr,
      outcome: staffActionLog.outcome,
      activityId: staffActionLog.activityId,
      activityName: activities.name,
      roomId: staffActionLog.roomId,
      roomCode: staffActionLog.roomCode,
      matchId: staffActionLog.matchId,
      targetPhysicalId: staffActionLog.targetPhysicalId,
      targetName: staffActionLog.targetName,
      details: staffActionLog.details,
      createdAt: staffActionLog.createdAt,
    })
      .from(staffActionLog)
      .leftJoin(staff, eq(staffActionLog.staffId, staff.id))
      .leftJoin(activities, eq(staffActionLog.activityId, activities.id))
      .where(where as any)
      .orderBy(desc(staffActionLog.createdAt))
      .limit(limit).offset(offset);

    const [countRow] = await db.select({ cnt: sql<number>`count(*)::int` })
      .from(staffActionLog).where(where as any);

    res.json({ logs: rows, total: countRow?.cnt || 0, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
