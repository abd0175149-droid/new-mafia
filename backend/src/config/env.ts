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

  // ── 📲 WhatsApp Cloud API (مركز المحادثات + البوت) ──────
  WA_TOKEN: process.env.WA_TOKEN || '',                                 // توكن System User الدائم
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID || '',             // معرّف رقم الإرسال
  WA_WABA_ID: process.env.WA_WABA_ID || '',                             // معرّف حساب الأعمال
  WA_WEBHOOK_VERIFY_TOKEN: process.env.WA_WEBHOOK_VERIFY_TOKEN || '',   // توكن تحقق الـ webhook (نختاره نحن)
  WA_APP_SECRET: process.env.WA_APP_SECRET || '',                       // App Secret للتحقق من توقيع X-Hub-Signature-256
  WA_SUSPENDED: process.env.WA_SUSPENDED === '1',                       // ⛔ إجراء من ميتا قائم — يوقف كل إرسال تلقائيّ
  N8N_API_KEY: process.env.N8N_API_KEY || '',                           // مفتاح استدعاءات n8n الداخلية (البوت)
  N8N_WA_WEBHOOK_URL: process.env.N8N_WA_WEBHOOK_URL || '',             // رابط webhook البوت في n8n (فارغ = البوت معطّل)
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

// ── تحذيرات واتساب (لا توقف الإقلاع — الميزة تتعطّل بهدوء إن نقصت المفاتيح) ──
if (!env.WA_TOKEN || !env.WA_PHONE_NUMBER_ID) {
  console.warn('⚠️ [ENV] WA_TOKEN / WA_PHONE_NUMBER_ID غير مضبوطة — إرسال واتساب معطّل.');
}
if (!env.WA_APP_SECRET) {
  console.warn('⚠️ [ENV] WA_APP_SECRET غير مضبوط — لن يتم التحقق من توقيع webhook واتساب (يُنصح بضبطه في الإنتاج).');
}
