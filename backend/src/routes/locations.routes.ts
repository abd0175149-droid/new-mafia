// ══════════════════════════════════════════════════════
// 📍 مسارات المواقع — Locations Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDB } from '../config/db.js';
import { locations, staff, notifications, userSettings } from '../schemas/admin.schema.js';
import { authenticate, managerOrAbove, adminOnly } from '../middleware/auth.js';

const router = Router();

// Helper: generate username from location name
function generateUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'location';
}

// Helper: كلمة مرور عشوائيّة قويّة (لا نكرّر نمط username+'123' الضعيف)
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!#%';
  return Array.from(crypto.randomBytes(12)).map(b => chars[b % chars.length]).join('');
}

// GET /api/locations
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const rows = await db.select().from(locations).orderBy(desc(locations.id));
  res.json(rows);
});

// POST /api/locations — إنشاء موقع (+ حساب مالك) — مدير فأعلى فقط (يمنع تصعيد الصلاحية)
router.post('/', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { name, mapUrl, offers, ownerUsername } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

  const result = await db.insert(locations).values({
    name,
    mapUrl: mapUrl || '',
    offers: Array.isArray(offers) ? offers : [],
  } as any).returning();

  const locationId = result[0].id;

  // Auto-create location_owner account
  let finalUsername = ownerUsername?.trim() || generateUsername(name);
  const existing = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, finalUsername)).limit(1);
  if (existing.length > 0) finalUsername = finalUsername + locationId;

  const password = finalUsername + '123';
  const hash = await bcrypt.hash(password, 10);
  const staffResult = await db.insert(staff).values({
    username: finalUsername,
    passwordHash: hash,
    displayName: name,
    role: 'location_owner',
    locationId,
    permissions: [],
  } as any).returning();

  await db.insert(userSettings).values({ userId: staffResult[0].id } as any).onConflictDoNothing();

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      title: 'مكان جديد',
      message: `تم إضافة مكان فعالية جديد: ${name}`,
      type: 'new_location',
      targetId: `location-${locationId}`,
    } as any);
  }

  res.status(201).json({
    ...result[0],
    ownerAccount: { username: finalUsername, password },
  });
});

// PUT /api/locations/:id
router.put('/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, mapUrl, offers } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

  await db.update(locations).set({
    name,
    mapUrl: mapUrl || '',
    offers: Array.isArray(offers) ? offers : [],
  } as any).where(eq(locations.id, id));

  res.json({ success: true });
});

// DELETE /api/locations/:id
router.delete('/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  await db.delete(locations).where(eq(locations.id, id));
  res.json({ success: true });
});

// ── 🍽️ الحسابات المرتبطة بالمكان ──────────────────────

// GET /api/locations/:id/staff — قائمة الحسابات المرتبطة (admin only)
router.get('/:id/staff', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });

  const rows = await db.select({
    id: staff.id, username: staff.username, displayName: staff.displayName,
    permissions: staff.permissions, isActive: staff.isActive, lastLogin: staff.lastLogin,
  }).from(staff)
    .where(and(eq(staff.locationId, id), eq(staff.role, 'location_owner'), isNull(staff.deletedAt)))
    .orderBy(staff.id);
  res.json({ success: true, accounts: rows });
});

// POST /api/locations/:id/staff — إنشاء حساب مرتبط إضافيّ (admin only)
// كلمة مرور عشوائيّة تُعاد مرّة واحدة فقط في الاستجابة.
router.post('/:id/staff', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  const [loc] = await db.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.id, id)).limit(1);
  if (!loc) return res.status(404).json({ error: 'المكان غير موجود' });

  const { username, displayName, permissions } = req.body || {};
  let finalUsername = String(username || '').trim() || `${generateUsername(loc.name)}_${Date.now() % 1000}`;
  const existing = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, finalUsername)).limit(1);
  if (existing.length > 0) return res.status(409).json({ error: 'اسم المستخدم موجود بالفعل' });

  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);
  const [created] = await db.insert(staff).values({
    username: finalUsername,
    passwordHash: hash,
    displayName: String(displayName || '').trim() || loc.name,
    role: 'location_owner',
    locationId: id,
    permissions: Array.isArray(permissions) ? permissions : [],
  } as any).returning({ id: staff.id, username: staff.username, displayName: staff.displayName, permissions: staff.permissions });

  await db.insert(userSettings).values({ userId: created.id } as any).onConflictDoNothing();

  console.log(`🍽️ Linked venue account #${created.id} (${created.username}) → location #${id}`);
  res.status(201).json({ success: true, account: created, password }); // كلمة المرور تُعرض مرّة واحدة
});

export default router;
