// ══════════════════════════════════════════════════════
// 🔐 نظام المصادقة — JWT Authentication Middleware
// ══════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// ── أنواع البيانات ──────────────────────────────────

export interface JwtPayload {
  id: number;
  username: string;
  role: 'admin' | 'manager' | 'leader' | 'location_owner';
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

// ── Middleware: admin فقط ─────────────────────────────

export const adminOnly = authorize('admin');

// ── Middleware: admin أو manager ─────────────────────

export const managerOrAbove = authorize('admin', 'manager');

// ── Middleware: admin أو manager أو leader ────────────

export const leaderOrAbove = authorize('admin', 'manager', 'leader');
