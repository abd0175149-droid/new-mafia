// ══════════════════════════════════════════════════════
// 🔐 نظام المصادقة — JWT Authentication Middleware
// ══════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { verifyPlayerToken } from './player-auth.middleware.js';

// ── أنواع البيانات ──────────────────────────────────

export interface JwtPayload {
  id: number;
  username: string;
  role: 'admin' | 'manager' | 'leader' | 'location_owner' | 'accountant';
  displayName: string;
}

// إضافة المستخدم لـ Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ── توليد Token ────────────────────────────────────

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

// ── تشفير كلمة المرور ──────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ── التحقق من كلمة المرور ────────────────────────────

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Middleware: التحقق من التوكن ─────────────────────

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'غير مصادق — يرجى تسجيل الدخول' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'توكن غير صالح أو منتهي الصلاحية' });
  }
}

// ── Middleware: التحقق من الصلاحيات ──────────────────

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'غير مصادق' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'ليس لديك صلاحية لهذا الإجراء' });
      return;
    }

    next();
  };
}

// ── Middleware: موظف (أي دور) أو اللاعب صاحب المورد نفسه ──
// يحافظ على قدرة الموظف/الأدمن على التصرّف نيابةً عن أي لاعب (واجهة الداش بورد)،
// ويسمح للّاعب بتعديل بياناته فقط، ويمنع المجهول والوصول العابر للاعبين.
// يضبط req.user (موظف) أو req.playerAccount (لاعب) عند النجاح.
export function staffOrSelf(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // (1) توكن موظف صالح؟ → مسموح (يشمل تصرّف الأدمن نيابةً عن أي لاعب)
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        req.user = decoded;
        return next();
      } catch { /* ليس توكن موظف — نجرّب توكن اللاعب */ }
      // (2) توكن لاعب صالح يملك هذا المورد؟
      const player = verifyPlayerToken(token);
      if (player) {
        const targetId = parseInt(req.params[paramName]);
        if (player.playerId === targetId) {
          req.playerAccount = player;
          return next();
        }
        res.status(403).json({ error: 'غير مصرّح — لا يمكنك تعديل بيانات لاعب آخر' });
        return;
      }
    }
    res.status(401).json({ error: 'غير مصادق — يرجى تسجيل الدخول' });
  };
}

// ── Middleware: admin فقط ─────────────────────────────

export const adminOnly = authorize('admin');

// ── Middleware: admin أو manager ─────────────────────

export const managerOrAbove = authorize('admin', 'manager');

// ── Middleware: admin أو manager أو leader ────────────

export const leaderOrAbove = authorize('admin', 'manager', 'leader');

// ── Middleware: admin أو manager أو accountant ────────

export const accountantOrAbove = authorize('admin', 'manager', 'accountant');

// ── 🍽️ Middleware: صلاحيّات حساب المكان — requireVenuePermission ──
// أوّل فرضٍ حقيقيّ لـ staff.permissions. يقرأ الربط والصلاحيّات من قاعدة البيانات
// في كلّ طلب (لا من التوكن — التوكن لا يحمل locationId أصلاً، وتغيير الصلاحيّة يسري فوراً).
// admin/manager يتجاوزان (يخدمان أيّ مكان عبر معاملة locationId في الطلب).
// عند النجاح: req.venueLocationId = مكان الحساب (أو المطلوب صراحةً للأدمن)، و req.venueStaff = صفّ الموظّف.
declare global {
  namespace Express {
    interface Request {
      venueLocationId?: number;
      venueStaff?: { id: number; role: string; permissions: string[] };
    }
  }
}

export const VENUE_PERMISSIONS = ['orders.receive', 'orders.manage', 'invoices.print', 'menu.manage'] as const;

export function requireVenuePermission(perm: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) { res.status(401).json({ error: 'غير مصادق' }); return; }
    try {
      const { getDB } = await import('../config/db.js');
      const { staff } = await import('../schemas/admin.schema.js');
      const { eq, and, isNull } = await import('drizzle-orm');
      const db = getDB();
      if (!db) { res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' }); return; }

      const [row] = await db.select({
        id: staff.id, role: staff.role, permissions: staff.permissions,
        isActive: staff.isActive, locationId: staff.locationId,
      }).from(staff).where(and(eq(staff.id, req.user.id), isNull(staff.deletedAt))).limit(1);

      if (!row || row.isActive === false) { res.status(403).json({ error: 'الحساب غير نشط' }); return; }

      const perms: string[] = Array.isArray(row.permissions) ? (row.permissions as string[]) : [];
      req.venueStaff = { id: row.id, role: row.role, permissions: perms };

      // HQ bypass: الأدمن/المدير يخدم أيّ مكان — يحدّده من معاملة الطلب
      if (row.role === 'admin' || row.role === 'manager') {
        const reqLoc = parseInt((req.params.locationId as string) || (req.query.locationId as string) || (req.body?.locationId as string) || '');
        req.venueLocationId = Number.isFinite(reqLoc) ? reqLoc : undefined;
        return next();
      }

      // حساب مكان: يجب ربطٌ بمكان + الصلاحيّة المطلوبة
      if (row.role !== 'location_owner' || !row.locationId) {
        res.status(403).json({ error: 'هذا الحساب غير مرتبط بمكان' }); return;
      }
      if (!perms.includes(perm)) {
        res.status(403).json({ error: 'ليس لدى حسابك صلاحيّة هذا الإجراء' }); return;
      }
      req.venueLocationId = row.locationId;
      next();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}
