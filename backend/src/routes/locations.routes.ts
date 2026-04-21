// ══════════════════════════════════════════════════════
// 📍 مسارات المواقع — Locations Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDB } from '../config/db.js';
import { locations, staff, notifications, userSettings } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Helper: generate username from location name
function generateUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'location';
}

// GET /api/locations
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const rows = await db.select().from(locations).orderBy(desc(locations.id));
  res.json(rows);
});

// POST /api/locations
router.post('/', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const { name, mapUrl, offers, ownerUsername } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

  const result = await db.insert(locations).values({
    name,
    mapUrl: mapUrl || '',
    offers: Array.isArray(offers) ? offers : [],
  }).returning();

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
  }).returning();

  await db.insert(userSettings).values({ userId: staffResult[0].id }).onConflictDoNothing();

  // Notify admins
  const admins = await db.select({ id: staff.id }).from(staff).where(eq(staff.role, 'admin'));
  for (const admin of admins) {
    await db.insert(notifications).values({
      userId: admin.id,
      title: 'مكان جديد',
      message: `تم إضافة مكان فعالية جديد: ${name}`,
      type: 'new_location',
      targetId: `location-${locationId}`,
    });
  }

  res.status(201).json({
    ...result[0],
    ownerAccount: { username: finalUsername, password },
  });
});

// PUT /api/locations/:id
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  const { name, mapUrl, offers } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

  await db.update(locations).set({
    name,
    mapUrl: mapUrl || '',
    offers: Array.isArray(offers) ? offers : [],
  }).where(eq(locations.id, id));

  res.json({ success: true });
});

// DELETE /api/locations/:id
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const id = parseInt(req.params.id);
  await db.delete(locations).where(eq(locations.id, id));
  res.json({ success: true });
});

export default router;
