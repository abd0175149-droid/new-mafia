// ══════════════════════════════════════════════════════
// 👥 مسارات الموظفين — Staff Routes (Admin only)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDB } from '../config/db.js';
import { staff, userSettings } from '../schemas/admin.schema.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /api/staff (admin only)
router.get('/', authenticate, adminOnly, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const rows = await db.select({
    id: staff.id,
    username: staff.username,
    displayName: staff.displayName,
    role: staff.role,
    photoUrl: staff.photoUrl,
    permissions: staff.permissions,
    lastLogin: staff.lastLogin,
    isPartner: staff.isPartner,
    isActive: staff.isActive,
    locationId: staff.locationId,
    createdAt: staff.createdAt,
  }).from(staff).orderBy(desc(staff.createdAt));

  res.json(rows);
});

// POST /api/staff (admin only)
router.post('/', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { username, password, displayName, role, permissions, isPartner } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }

  // Check unique
  const existing = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, username)).limit(1);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'اسم المستخدم موجود بالفعل' });
  }

  const hash = await bcrypt.hash(password, 10);
  const perms = permissions || ['activities', 'bookings', 'finances', 'locations'];

  const result = await db.insert(staff).values({
    username,
    passwordHash: hash,
    displayName,
    role: role || 'manager',
    permissions: perms,
    isPartner: isPartner || false,
  }).returning();

  // Create default settings
  await db.insert(userSettings).values({ userId: result[0].id }).onConflictDoNothing();

  res.status(201).json(result[0]);
});

// PUT /api/staff/me (Update own profile)
router.put('/me', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const updates: any = {};
  if (req.body.displayName) updates.displayName = req.body.displayName;
  if (req.body.photoURL !== undefined) updates.photoUrl = req.body.photoURL;

  if (Object.keys(updates).length > 0) {
    await db.update(staff).set(updates).where(eq(staff.id, req.user!.id));
  }
  res.json({ success: true });
});

// PUT /api/staff/:id (admin only)
router.put('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { displayName, role, permissions, isPartner } = req.body;
  if (!displayName) return res.status(400).json({ error: 'الاسم مطلوب' });

  await db.update(staff).set({
    displayName,
    role: role || 'manager',
    permissions: permissions || ['activities', 'bookings', 'finances', 'locations'],
    isPartner: isPartner || false,
  }).where(eq(staff.id, id));

  res.json({ success: true });
});

// PUT /api/staff/:id/password (admin only)
router.put('/:id/password', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
  }

  const hash = await bcrypt.hash(password, 10);
  await db.update(staff).set({ passwordHash: hash }).where(eq(staff.id, parseInt(req.params.id)));
  res.json({ success: true });
});

// DELETE /api/staff/:id (admin only)
router.delete('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
  }

  await db.delete(staff).where(eq(staff.id, id));
  res.json({ success: true });
});

export default router;
