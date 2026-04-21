// ══════════════════════════════════════════════════════
// 📋 مسارات الأنشطة — Activities Routes
// CRUD + إشعارات + ربط بالغرف
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, sql, or, and, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, notifications, staff } from '../schemas/admin.schema.js';
import { sessions } from '../schemas/game.schema.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { getDriveService } from './drive.routes.js';
import { linkSessionToActivity, unlinkSessionFromActivity, createSession } from '../services/session.service.js';
import { getActivityAttendanceStats } from '../services/booking.service.js';

const router = Router();

// GET /api/activities/available — الأنشطة القابلة للربط بلعبة (بدون auth — يستخدمها القائد)
router.get('/available', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const rows = await db.select()
      .from(activities)
      .where(
        and(
          or(eq(activities.status, 'planned'), eq(activities.status, 'active')),
          isNull(activities.sessionId),
        )
      )
      .orderBy(desc(activities.date));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id/attendance — إحصائيات الحضور لنشاط
router.get('/:id/attendance', authenticate, async (req: Request, res: Response) => {
  try {
    const stats = await getActivityAttendanceStats(parseInt(req.params.id));
    res.json(stats || { totalBookings: 0, totalPeopleBooked: 0, checkedInBookings: 0, checkedInPeople: 0, noShowBookings: 0, noShowPeople: 0, attendanceRate: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activities/:id/link-session — ربط نشاط بغرفة موجودة
router.post('/:id/link-session', authenticate, async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId مطلوب' });

  try {
    const success = await linkSessionToActivity(sessionId, parseInt(req.params.id));
    if (!success) return res.status(500).json({ error: 'فشل الربط' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activities/:id/unlink-session — فك ربط نشاط من غرفة
router.post('/:id/unlink-session', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    // جلب sessionId المرتبط
    const activity = await db.select({ sessionId: activities.sessionId })
      .from(activities)
      .where(eq(activities.id, parseInt(req.params.id)))
      .limit(1);

    const sessionId = activity[0]?.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'النشاط غير مرتبط بغرفة' });

    const success = await unlinkSessionFromActivity(sessionId);
    if (!success) return res.status(500).json({ error: 'فشل فك الربط' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  // location_owner: filtered by locationId
  if (req.user?.role === 'location_owner' && (req.user as any).locationId) {
    const rows = await db.select().from(activities)
      .where(eq(activities.locationId, (req.user as any).locationId))
      .orderBy(desc(activities.date));
    return res.json(rows);
  }

  const rows = await db.select().from(activities).orderBy(desc(activities.date));
  res.json(rows);
});

// POST /api/activities
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { name, date, description, basePrice, status, locationId, driveLink, enabledOfferIds, isLocked } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'الاسم والتاريخ مطلوبان' });

  const result = await db.insert(activities).values({
    name,
    date: new Date(date),
    description: description || '',
    basePrice: String(basePrice || 0),
    status: status || 'planned',
    locationId: locationId || null,
    driveLink: driveLink || '',
    enabledOfferIds: Array.isArray(enabledOfferIds) ? enabledOfferIds : [],
    isLocked: isLocked || false,
  }).returning();

  const activity = result[0];

  // 🎮 إنشاء غرفة ألعاب تلقائياً مرتبطة بالنشاط
  try {
    const sessionId = await createSession(
      name,                                    // اسم الغرفة = اسم النشاط
      Math.floor(100000 + Math.random() * 900000).toString(), // كود عشوائي
      Math.floor(1000 + Math.random() * 9000).toString(),     // PIN عشوائي
      10,                                      // maxPlayers افتراضي — يُحدّث لاحقاً حسب عدد الأشخاص الحاجزين
      activity.id,                             // ربط بالنشاط
    );

    if (sessionId) {
      // تحديث النشاط بـ sessionId
      await db.update(activities)
        .set({ sessionId })
        .where(eq(activities.id, activity.id));
      activity.sessionId = sessionId;
      console.log(`🎮 Auto-created Session #${sessionId} for Activity #${activity.id}`);
    }
  } catch (err: any) {
    console.error('⚠️ Failed to auto-create session for activity:', err.message);
    // لا نفشل إنشاء النشاط بسبب فشل إنشاء الغرفة
  }

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    if (admin.id !== req.user!.id) {
      await db.insert(notifications).values({
        userId: admin.id,
        title: 'نشاط جديد',
        message: `تم جدولة نشاط جديد: ${name}`,
        type: 'new_activity',
        targetId: `activity-${activity.id}`,
      });
    }
  }

  res.status(201).json(activity);
});

// PUT /api/activities/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, date, description, basePrice, status, locationId, driveLink, enabledOfferIds, isLocked, sessionId } = req.body;

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (date !== undefined) updates.date = new Date(date);
  if (description !== undefined) updates.description = description;
  if (basePrice !== undefined) updates.basePrice = String(basePrice);
  if (status !== undefined) updates.status = status;
  if (locationId !== undefined) updates.locationId = locationId;
  if (driveLink !== undefined) updates.driveLink = driveLink;
  if (enabledOfferIds !== undefined) updates.enabledOfferIds = enabledOfferIds;
  if (isLocked !== undefined) updates.isLocked = isLocked;
  if (sessionId !== undefined) updates.sessionId = sessionId;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
  }

  const result = await db.update(activities).set(updates).where(eq(activities.id, id)).returning();
  if (result.length === 0) return res.status(404).json({ error: 'النشاط غير موجود' });

  res.json(result[0]);
});

// DELETE /api/activities/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const deleteDriveFolder = req.query.deleteDriveFolder === 'true';

  const existing = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
  if (existing.length === 0) return res.status(404).json({ error: 'النشاط غير موجود' });

  // Delete Drive Folder if requested and link exists
  if (deleteDriveFolder && existing[0].driveLink) {
    try {
      const match = existing[0].driveLink.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        const folderId = match[1];
        const drive = getDriveService();
        await drive.files.delete({ fileId: folderId });
        console.log(`Deleted Drive Folder: ${folderId}`);
      }
    } catch (e: any) {
      console.error('Failed to delete associated Drive folder:', e.message);
      // Proceed with local deletion even if drive deletion fails conditionally
    }
  }

  await db.delete(activities).where(eq(activities.id, id));
  res.json({ success: true });
});

export default router;
