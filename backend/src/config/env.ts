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

// ── التحقق في الإنتاج ────────────────────────────
if (env.NODE_ENV === 'production') {
  const criticalVars = ['JWT_SECRET'] as const;
  for (const key of criticalVars) {
    if (!env[key] || env[key].includes('change-in-production')) {
      console.warn(`⚠️ [ENV] ${key} يجب تغييره في بيئة الإنتاج!`);
    }
  }
}
