// ══════════════════════════════════════════════════════
// 🔑 مفاتيح VAPID — مصدر واحد موثوق وثابت
// يضمن أن مفاتيح Web Push (iOS/Safari) لا تتغيّر بين عمليات إعادة التشغيل.
// الأولوية: متغيرات البيئة → ملف محفوظ (داخل volume الـ uploads) → توليد وحفظ.
// ══════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: VapidKeys | null = null;

// مسار ثابت — uploads مُركّب كـ volume في docker-compose فلا يضيع بين عمليات إعادة البناء
const KEYS_DIR = process.env.VAPID_KEYS_DIR || join(process.cwd(), 'uploads');
const KEYS_FILE = join(KEYS_DIR, 'vapid-keys.json');

export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@club-mafia.grade.sbs';

/**
 * يُرجع زوج مفاتيح VAPID ثابتاً. يُولّد ويحفظ مرّة واحدة فقط إن لزم.
 * يُعيد null فقط إذا تعذّر التوليد (مكتبة web-push غير متاحة).
 */
export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (cached) return cached;

  // 1) من متغيرات البيئة (الأولوية) — يجب أن يكون الزوج كاملاً ومتطابقاً
  const envPublic = process.env.VAPID_PUBLIC_KEY || '';
  const envPrivate = process.env.VAPID_PRIVATE_KEY || '';
  if (envPublic && envPrivate) {
    cached = { publicKey: envPublic, privateKey: envPrivate };
    console.log('🔑 VAPID: using keys from environment variables');
    return cached;
  }

  // 2) من ملف محفوظ (ثابت بين عمليات إعادة التشغيل)
  try {
    if (existsSync(KEYS_FILE)) {
      const parsed = JSON.parse(readFileSync(KEYS_FILE, 'utf-8'));
      if (parsed?.publicKey && parsed?.privateKey) {
        cached = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        console.log(`🔑 VAPID: loaded persisted keys from ${KEYS_FILE}`);
        return cached;
      }
    }
  } catch (err: any) {
    console.warn('⚠️ VAPID: failed reading persisted keys:', err.message);
  }

  // 3) توليد زوج جديد وحفظه (مرّة واحدة — يبقى ثابتاً بعدها)
  try {
    const wpImport = await import('web-push');
    const webpush = (wpImport as any).default || wpImport;
    const keys = webpush.generateVAPIDKeys();
    cached = { publicKey: keys.publicKey, privateKey: keys.privateKey };
    try {
      if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });
      writeFileSync(KEYS_FILE, JSON.stringify(cached), 'utf-8');
      console.log(`🔑 VAPID: generated and persisted a new key pair at ${KEYS_FILE}`);
    } catch (writeErr: any) {
      console.warn('⚠️ VAPID: generated keys but FAILED to persist — they will change on restart!', writeErr.message);
    }
    return cached;
  } catch (err: any) {
    console.error('❌ VAPID: failed to generate keys:', err.message);
    return null;
  }
}

/**
 * يُهيّئ مكتبة web-push بمفاتيح VAPID الثابتة.
 * يُرجع وحدة web-push الجاهزة أو null عند الفشل.
 */
export async function initWebPush(): Promise<any | null> {
  try {
    const wpImport = await import('web-push');
    const webpush = (wpImport as any).default || wpImport;
    const keys = await getVapidKeys();
    if (!keys) {
      console.warn('⚠️ web-push: no VAPID keys available — push for iOS/Safari disabled');
      return null;
    }
    webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
    return webpush;
  } catch (err: any) {
    console.warn('⚠️ web-push module not available:', err.message);
    return null;
  }
}
