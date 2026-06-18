// ══════════════════════════════════════════════════════
// 🔧 متغيرات البيئة — Environment Configuration
// ══════════════════════════════════════════════════════

import { config } from 'dotenv';
config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5432/mafia_db',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET || 'mafia-dev-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
} as const;

// ── التحقق من قوة JWT_SECRET ────────────────────────────
// يحذّر دائماً عند مفتاح ضعيف/افتراضي، ويوقف الإقلاع في الإنتاج (فشل-سريع آمن).
const WEAK_SECRETS = [
  'mafia_secret_key_123',
  'mafia-dev-secret-change-in-production',
  'change-in-production',
];
const jwtIsWeak = !env.JWT_SECRET
  || env.JWT_SECRET.length < 16
  || WEAK_SECRETS.some((w) => env.JWT_SECRET.includes(w));
if (jwtIsWeak) {
  console.error('🚨 [ENV] JWT_SECRET ضعيف أو افتراضي — اضبط مفتاحاً عشوائياً قوياً (≥32 حرف)!');
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET ضعيف أو مفقود في الإنتاج — أُوقف الإقلاع لأسباب أمنية.');
  }
}
