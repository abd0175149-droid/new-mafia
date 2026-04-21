// ══════════════════════════════════════════════════════
// 🔐 مسارات المصادقة — Auth Routes
// POST /api/auth/login  — تسجيل الدخول
// GET  /api/auth/me     — جلب الملف الشخصي
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { staff } from '../schemas/admin.schema.js';
import {
  generateToken, verifyPassword, authenticate,
  type JwtPayload,
} from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const users = await db.select().from(staff).where(eq(staff.username, username)).limit(1);
  const user = users[0];
  console.log(`🔐 Login attempt: username="${username}", found=${!!user}, hashLength=${user?.passwordHash?.length || 0}`);
  if (!user) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  console.log(`🔐 Password check: valid=${valid}`);
  if (!valid) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  // Update last login
  await db.update(staff).set({ lastLogin: new Date() }).where(eq(staff.id, user.id));

  const permissions = (user.permissions as string[]) || [];

  const tokenPayload: JwtPayload = {
    id: user.id,
    username: user.username,
    role: user.role as JwtPayload['role'],
    displayName: user.displayName,
  };

  const token = generateToken(tokenPayload);
  res.json({
    token,
    profile: {
      ...tokenPayload,
      permissions,
      photoURL: user.photoUrl || null,
      locationId: user.locationId || null,
      isPartner: user.isPartner || false,
    },
  });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  const users = await db.select({
    id: staff.id,
    username: staff.username,
    displayName: staff.displayName,
    role: staff.role,
    photoUrl: staff.photoUrl,
    permissions: staff.permissions,
    locationId: staff.locationId,
    isPartner: staff.isPartner,
  }).from(staff).where(eq(staff.id, req.user!.id)).limit(1);

  const user = users[0];
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  res.json({
    profile: {
      ...user,
      photoURL: user.photoUrl || null,
      permissions: (user.permissions as string[]) || [],
    },
  });
});

export default router;
