// ══════════════════════════════════════════════════════
// 👥 مسارات الموظفين — Staff Routes (Admin only)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDB } from '../config/db.js';
import { staff, userSettings } from '../schemas/admin.schema.js';
import { authenticate, adminOnly, authorize } from '../middleware/auth.js';

const router = Router();

// GET /api/staff (admin only)
router.get('/', authenticate, authorize('admin', 'accountant'), async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const rows = await db.select({
    id: staff.id,
    username: staff.username,
    displayName: staff.displayName,
    phone: staff.phone,
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

  const { username, password, displayName, phone, role, permissions, isPartner } = req.body;
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
    phone: phone || '',
    role: role || 'manager',
    permissions: perms,
    isPartner: isPartner || false,
  } as any).returning();

  // Create default settings
  await db.insert(userSettings).values({ userId: result[0].id } as any).onConflictDoNothing();

  res.status(201).json(result[0]);
});

// PUT /api/staff/me (Update own profile)
router.put('/me', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const updates: any = {};
  if (req.body.displayName) updates.displayName = req.body.displayName;
  if (req.body.phone !== undefined) updates.phone = req.body.phone;
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
  const { displayName, phone, role, permissions, isPartner } = req.body;
  if (!displayName) return res.status(400).json({ error: 'الاسم مطلوب' });

  await db.update(staff).set({
    displayName,
    phone: phone || '',
    role: role || 'manager',
    permissions: permissions || ['activities', 'bookings', 'finances', 'locations'],
    isPartner: isPartner || false,
  } as any).where(eq(staff.id, id));

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
  await db.update(staff).set({ passwordHash: hash } as any).where(eq(staff.id, parseInt(req.params.id)));
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

// ══════════════════════════════════════════════
// 🔗 ربط حساب الموظف بلاعب — Link Staff ↔ Player
// ══════════════════════════════════════════════

// PUT /api/staff/:id/link-player — ربط موظف بلاعب
router.put('/:id/link-player', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const staffId = parseInt(req.params.id);
  const { playerId } = req.body;

  if (!playerId) return res.status(400).json({ error: 'playerId مطلوب' });

  try {
    // التأكد أن الموظف موجود
    const staffRow = await db.select({ id: staff.id }).from(staff).where(eq(staff.id, staffId)).limit(1);
    if (!staffRow[0]) return res.status(404).json({ error: 'الموظف غير موجود' });

    // التأكد أن اللاعب موجود
    const { players } = await import('../schemas/player.schema.js');
    const playerRow = await db.select({ id: players.id, name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
    if (!playerRow[0]) return res.status(404).json({ error: 'اللاعب غير موجود' });

    // فك أي ربط سابق لهذا الموظف (لاعب آخر مرتبط به)
    await db.update(players)
      .set({ linkedStaffId: null } as any)
      .where(eq(players.linkedStaffId, staffId));

    // ربط اللاعب بالموظف
    await db.update(players)
      .set({ linkedStaffId: staffId } as any)
      .where(eq(players.id, playerId));

    console.log(`🔗 Staff #${staffId} linked to Player #${playerId} (${playerRow[0].name})`);
    res.json({ success: true, linkedPlayer: playerRow[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/staff/:id/link-player — فك ربط الموظف من اللاعب
router.delete('/:id/link-player', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const staffId = parseInt(req.params.id);

  try {
    const { players } = await import('../schemas/player.schema.js');
    await db.update(players)
      .set({ linkedStaffId: null } as any)
      .where(eq(players.linkedStaffId, staffId));

    console.log(`🔓 Staff #${staffId} unlinked from player`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff/:id/linked-player — جلب اللاعب المرتبط بموظف
router.get('/:id/linked-player', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const staffId = parseInt(req.params.id);

  try {
    const { players } = await import('../schemas/player.schema.js');
    const rows = await db.select({
      id: players.id,
      name: players.name,
      phone: players.phone,
      avatarUrl: players.avatarUrl,
    }).from(players).where(eq(players.linkedStaffId, staffId)).limit(1);

    res.json({ success: true, linkedPlayer: rows[0] || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/staff/players-search?q=xxx — بحث عن لاعبين للربط
router.get('/players-search', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const q = (req.query.q as string || '').trim();
  if (!q || q.length < 2) return res.json({ players: [] });

  try {
    const { players } = await import('../schemas/player.schema.js');
    const { sql } = await import('drizzle-orm');
    const rows = await db.select({
      id: players.id,
      name: players.name,
      phone: players.phone,
      avatarUrl: players.avatarUrl,
      linkedStaffId: players.linkedStaffId,
    }).from(players)
      .where(sql`(${players.name} ILIKE ${'%' + q + '%'} OR ${players.phone} ILIKE ${'%' + q + '%'})`)
      .limit(15);

    res.json({ players: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
