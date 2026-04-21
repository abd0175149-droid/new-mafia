// ══════════════════════════════════════════════════════
// ⚙️ مسارات الإعدادات — Settings Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { userSettings } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/settings
router.get('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  let settings = await db.select().from(userSettings).where(eq(userSettings.userId, req.user!.id)).limit(1);

  if (settings.length === 0) {
    await db.insert(userSettings).values({ userId: req.user!.id }).onConflictDoNothing();
    settings = await db.select().from(userSettings).where(eq(userSettings.userId, req.user!.id)).limit(1);
  }

  const s = settings[0];
  res.json({
    notifications: {
      newBooking: s?.newBooking ?? true,
      upcomingActivity: s?.upcomingActivity ?? true,
      costAlert: s?.costAlert ?? true,
    },
    dashboardLayout: (s?.dashboardLayout as string[]) || ['revenue', 'costs', 'profit', 'bookings', 'upcoming'],
  });
});

// PUT /api/settings
router.put('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, req.user!.id)).limit(1);
  if (existing.length === 0) {
    await db.insert(userSettings).values({ userId: req.user!.id }).onConflictDoNothing();
  }

  const updates: any = {};
  if (req.body.notifications) {
    updates.newBooking = req.body.notifications.newBooking ?? true;
    updates.upcomingActivity = req.body.notifications.upcomingActivity ?? true;
    updates.costAlert = req.body.notifications.costAlert ?? true;
  }
  if (req.body.dashboardLayout) {
    updates.dashboardLayout = req.body.dashboardLayout;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(userSettings).set(updates).where(eq(userSettings.userId, req.user!.id));
  }

  res.json({ success: true });
});

export default router;
