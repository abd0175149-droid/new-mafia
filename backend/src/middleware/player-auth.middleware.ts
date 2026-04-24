// ══════════════════════════════════════════════════════
// 🔐 نظام مصادقة اللاعبين — Player JWT Auth Middleware
// منفصل عن مصادقة Staff/Admin
// ══════════════════════════════════════════════════════

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { PLAYER_TOKEN_EXPIRY } from '../schemas/player.schema.js';

// ── أنواع البيانات ──────────────────────────────────

export interface PlayerJwtPayload {
  playerId: number;
  phone: string;
  name: string;
}

// إضافة playerAccount لـ Request
declare global {
  namespace Express {
    interface Request {
      playerAccount?: PlayerJwtPayload;
    }
  }
}

// ── JWT Secret مخصص للاعبين (يُشتق من JWT_SECRET الأصلي) ──

const PLAYER_JWT_SECRET = env.JWT_SECRET + '_PLAYER';

// ── توليد Token للاعب ────────────────────────────

export function generatePlayerToken(payload: PlayerJwtPayload): string {
  return jwt.sign(payload, PLAYER_JWT_SECRET, {
    expiresIn: PLAYER_TOKEN_EXPIRY as any,
  });
}

// ── التحقق من Token اللاعب ──────────────────────

export function verifyPlayerToken(token: string): PlayerJwtPayload | null {
  try {
    return jwt.verify(token, PLAYER_JWT_SECRET) as PlayerJwtPayload;
  } catch {
    return null;
  }
}

// ── تشفير كلمة السر ──────────────────────────────

export async function hashPlayerPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ── التحقق من كلمة السر ──────────────────────────

export async function verifyPlayerPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Middleware: التحقق من توكن اللاعب ─────────────

export function authenticatePlayer(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'غير مصادق — يرجى تسجيل الدخول' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyPlayerToken(token);

  if (!decoded) {
    res.status(401).json({ error: 'توكن غير صالح أو منتهي الصلاحية' });
    return;
  }

  req.playerAccount = decoded;
  next();
}

// ── Middleware اختياري: يحاول فك التوكن بدون حظر ──

export function optionalPlayerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyPlayerToken(token);
    if (decoded) {
      req.playerAccount = decoded;
    }
  }

  next();
}
