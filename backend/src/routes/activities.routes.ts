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
import { linkSessionToActivity, unlinkSessionFromActivity, createSession, deleteSession, closeSession } from '../services/session.service.js';
import { getActivityAttendanceStats } from '../services/booking.service.js';

const router = Router();

// 📂 المجلد الرئيسي في Google Drive الذي يتم إنشاء مجلدات الأنشطة بداخله
const ACTIVITIES_PARENT_FOLDER_ID = '1MLgq3qx0by7pi_MStkAofEiUYb4n33ml';

// GET /api/activities/available — الأنشطة القابلة للربط بلعبة (بدون auth — يستخدمها القائد)
router.get('/available', async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    // عرض كل الأنشطة المخططة أو النشطة (بغض النظر عن وجود غرفة مربوطة)
    const rows = await db.select()
      .from(activities)
      .where(
        or(eq(activities.status, 'planned'), eq(activities.status, 'active'))
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
    const { sessionId: targetSessionId } = req.body;

    if (targetSessionId) {
      // فك ربط غرفة محددة
      const success = await unlinkSessionFromActivity(targetSessionId);
      if (!success) return res.status(500).json({ error: 'فشل فك الربط' });
    } else {
      // فك ربط الغرفة الأساسية (التوافق مع الكود القديم)
      const activity = await db.select({ sessionId: activities.sessionId })
        .from(activities)
        .where(eq(activities.id, parseInt(req.params.id)))
        .limit(1);

      const sId = activity[0]?.sessionId;
      if (!sId) return res.status(400).json({ error: 'النشاط غير مرتبط بغرفة' });

      const success = await unlinkSessionFromActivity(sId);
      if (!success) return res.status(500).json({ error: 'فشل فك الربط' });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id/rooms — جلب كل الغرف المرتبطة بنشاط
router.get('/:id/rooms', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);

    // جلب الغرف المرتبطة بهذا النشاط (بدون المحذوفة)
    const rooms = await db.select()
      .from(sessions)
      .where(and(
        eq(sessions.activityId, activityId),
        sql`${sessions.status} != 'deleted'`
      ))
      .orderBy(desc(sessions.createdAt));

    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activities/:id/add-room — إنشاء غرفة جديدة مرتبطة بالنشاط
router.post('/:id/add-room', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);

    // تحقق من وجود النشاط
    const [act] = await db.select({ id: activities.id, name: activities.name })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });

    // عدد الغرف الحالية لتسمية الغرفة الجديدة
    const existingRooms = await db.select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.activityId, activityId));

    const roomNumber = existingRooms.length + 1;
    const roomName = req.body.roomName || `${act.name} — غرفة ${roomNumber}`;
    const maxPlayers = req.body.maxPlayers || 10;

    const sessionId = await createSession(
      roomName,
      Math.floor(100000 + Math.random() * 900000).toString(),
      Math.floor(1000 + Math.random() * 9000).toString(),
      maxPlayers,
      activityId,
    );

    if (!sessionId) return res.status(500).json({ error: 'فشل إنشاء الغرفة' });

    // جلب بيانات الغرفة المنشأة
    const [newRoom] = await db.select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    console.log(`🎮 Admin: Created Room #${sessionId} (${roomName}) for Activity #${activityId}`);
    res.status(201).json(newRoom);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/activities/:id/rooms/:sessionId — حذف غرفة نهائياً
router.delete('/:id/rooms/:sessionId', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);
    const sessionId = parseInt(req.params.sessionId);

    // فك الربط أولاً
    await unlinkSessionFromActivity(sessionId);

    // حذف الغرفة (soft delete)
    const deleted = await deleteSession(sessionId);
    if (!deleted) return res.status(500).json({ error: 'فشل حذف الغرفة' });

    console.log(`🗑️ Admin: Deleted Room #${sessionId} from Activity #${activityId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/activities/:id/rooms/:sessionId/close — إغلاق غرفة
router.patch('/:id/rooms/:sessionId/close', authenticate, async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const closed = await closeSession(sessionId);
    if (!closed) return res.status(500).json({ error: 'فشل إغلاق الغرفة' });
    console.log(`🔒 Activity: Closed Room #${sessionId}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/:id — جلب نشاط واحد
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const [act] = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
  if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });
  res.json(act);
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
    date: date,
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
      name,
      Math.floor(100000 + Math.random() * 900000).toString(),
      Math.floor(1000 + Math.random() * 9000).toString(),
      10,
      activity.id,
    );

    if (sessionId) {
      await db.update(activities)
        .set({ sessionId })
        .where(eq(activities.id, activity.id));
      activity.sessionId = sessionId;
      console.log(`🎮 Auto-created Session #${sessionId} for Activity #${activity.id}`);
    }
  } catch (err: any) {
    console.error('⚠️ Failed to auto-create session for activity:', err.message);
  }

  // 📂 إنشاء مجلد Drive تلقائياً للنشاط
  if (!activity.driveLink) {
    try {
      const drive = getDriveService();
      const folderRes = await drive.files.create({
        requestBody: {
          name: `${name} — #${activity.id}`,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [ACTIVITIES_PARENT_FOLDER_ID],
        },
        fields: 'id, webViewLink',
      });

      if (folderRes.data.id) {
        const driveLink = `https://drive.google.com/drive/folders/${folderRes.data.id}`;
        await db.update(activities)
          .set({ driveLink })
          .where(eq(activities.id, activity.id));
        activity.driveLink = driveLink;
        console.log(`📂 Auto-created Drive folder for Activity #${activity.id}: ${folderRes.data.id}`);
      }
    } catch (err: any) {
      console.error('⚠️ Failed to auto-create Drive folder:', err.message);
    }
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

  // 🔔 Push للاعبين (نشاط جديد) + الموظفين
  import('../services/fcm.service.js').then(({ sendPushToAllPlayers, sendPushToStaffByPermission }) => {
    sendPushToAllPlayers('📅 نشاط جديد', `تم إضافة نشاط: ${name}`, 'new_activity', {
      activityId: activity.id,
      url: '/player/games',
    });
    sendPushToStaffByPermission('activities', '📅 نشاط جديد', `تم جدولة نشاط: ${name}`, 'new_activity', {
      targetId: `activity-${activity.id}`,
      url: '/admin/activities',
    }, req.user!.id);
  }).catch(() => {});
});

// POST /api/activities/:id/create-drive-folder — إنشاء مجلد Drive لنشاط قديم بدون مجلد
router.post('/:id/create-drive-folder', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const activityId = parseInt(req.params.id);
    const [act] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1);
    if (!act) return res.status(404).json({ error: 'النشاط غير موجود' });

    if (act.driveLink) {
      return res.json({ success: true, driveLink: act.driveLink, message: 'المجلد موجود مسبقاً' });
    }

    const drive = getDriveService();
    const folderRes = await drive.files.create({
      requestBody: {
        name: `${act.name} — #${act.id}`,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ACTIVITIES_PARENT_FOLDER_ID],
      },
      fields: 'id, webViewLink',
    });

    if (!folderRes.data.id) {
      return res.status(500).json({ error: 'فشل إنشاء المجلد' });
    }

    const driveLink = `https://drive.google.com/drive/folders/${folderRes.data.id}`;
    await db.update(activities).set({ driveLink }).where(eq(activities.id, activityId));

    console.log(`📂 Created Drive folder for old Activity #${activityId}: ${folderRes.data.id}`);
    res.json({ success: true, driveLink });
  } catch (err: any) {
    console.error('❌ Failed to create Drive folder:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/activities/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, date, description, basePrice, status, locationId, driveLink, enabledOfferIds, isLocked, sessionId } = req.body;

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (date !== undefined) updates.date = date;
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
    }
  }

  // 🗑️ حذف جميع الغرف المرتبطة بالنشاط (soft delete)
  try {
    const linkedRooms = await db.select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.activityId, id));

    if (linkedRooms.length > 0) {
      await db.update(sessions)
        .set({ isActive: false, status: 'deleted', activityId: null })
        .where(eq(sessions.activityId, id));
      console.log(`🗑️ Soft-deleted ${linkedRooms.length} room(s) linked to Activity #${id}`);
    }
  } catch (e: any) {
    console.error('Failed to delete linked sessions:', e.message);
  }

  await db.delete(activities).where(eq(activities.id, id));
  res.json({ success: true });
});

export default router;
