// ══════════════════════════════════════════════════════
// 📱 إصدار التطبيق الأصليّ + روابط المنصّات
// ══════════════════════════════════════════════════════
// ثلاثة مسارات عامّة (بلا مصادقة — يُستدعَون قبل الدخول):
//
//   GET /api/app/release   بوابة الإصدار: هل هذه النسخة مدعومة؟
//   GET /api/app/assetlinks                    → /.well-known/assetlinks.json
//   GET /api/app/apple-app-site-association    → /.well-known/apple-app-site-association
//
// الأخيران يصلان عبر إعادة كتابة في next.config.js، لأن لا nginx في هذا
// النشر: Cloudflare ← cloudflared ← خادم Next ← هنا.
//
// ⚠️ قرار مقصود: ملفّا الروابط يردّان 404 ما لم تُضبط بيانات المنصّة.
//    ملفّ assetlinks بمحتوى خاطئ أسوأ من غيابه — أندرويد يخزّن نتيجة
//    التحقّق الفاشلة، فتتوقّف روابط التطبيق بلا رسالة خطأ ظاهرة.

import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { eq, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { appRelease } from '../schemas/admin.schema.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// ══════════════════════════════════════════════════════
// مقارنة الإصدارات
// ══════════════════════════════════════════════════════
// «1.2.10» أحدث من «1.2.9» — والمقارنة النصّية تقول العكس، فتُقارَن
// الأجزاء عدديّاً. المقارنة هنا في الخادم لا في التطبيق: سياسة البوابة
// تتغيّر بتحديث خادم، لا بإصدار جديد على المتجر (وهو ما لا يمكن دفعه
// إلى مَن حُجب أصلاً).
function cmpVersion(a: string, b: string): number {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const DEFAULTS = {
  minAndroid: '0.0.0',
  minIos: '0.0.0',
  latestAndroid: '0.0.0',
  latestIos: '0.0.0',
  androidUrl: '',
  iosUrl: '',
  message: 'صدر تحديث مطلوب للتطبيق — حدّثه للمتابعة.',
};

async function readConfig() {
  const db = getDB();
  if (!db) return DEFAULTS;
  try {
    const [row] = await db.select().from(appRelease).where(eq(appRelease.id, 1)).limit(1);
    return row ? { ...DEFAULTS, ...row } : DEFAULTS;
  } catch {
    return DEFAULTS;   // البوابة لا تُسقط التطبيق إن تعثّرت قاعدة البيانات
  }
}

// ── GET /api/app/release ─────────────────────────────
// ?platform=android|ios &version=1.2.3  → يضيف الحكم المحسوب
router.get('/release', async (req: Request, res: Response) => {
  const cfg: any = await readConfig();
  const platform = String(req.query.platform || '').toLowerCase();
  const version = String(req.query.version || '').trim();

  const out: any = {
    success: true,
    minAndroid: cfg.minAndroid,
    minIos: cfg.minIos,
    latestAndroid: cfg.latestAndroid,
    latestIos: cfg.latestIos,
    androidUrl: cfg.androidUrl,
    iosUrl: cfg.iosUrl,
    message: cfg.message,
  };

  if ((platform === 'android' || platform === 'ios') && version) {
    const min = platform === 'ios' ? cfg.minIos : cfg.minAndroid;
    const latest = platform === 'ios' ? cfg.latestIos : cfg.latestAndroid;
    out.blocked = cmpVersion(version, min) < 0;         // أقدم من الحدّ ⇒ يُحجب
    out.updateAvailable = cmpVersion(version, latest) < 0;
    out.storeUrl = platform === 'ios' ? cfg.iosUrl : cfg.androidUrl;
  }

  res.json(out);
});

// ── PUT /api/app/release — أدمن ──────────────────────
router.put('/release', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const b = req.body || {};
  const clean = (v: any, max = 40) => String(v ?? '').trim().slice(0, max);
  try {
    const values = {
      id: 1,
      minAndroid: clean(b.minAndroid) || DEFAULTS.minAndroid,
      minIos: clean(b.minIos) || DEFAULTS.minIos,
      latestAndroid: clean(b.latestAndroid) || DEFAULTS.latestAndroid,
      latestIos: clean(b.latestIos) || DEFAULTS.latestIos,
      androidUrl: clean(b.androidUrl, 300),
      iosUrl: clean(b.iosUrl, 300),
      message: clean(b.message, 500) || DEFAULTS.message,
      updatedAt: new Date(),
    } as any;
    await db.insert(appRelease).values(values).onConflictDoUpdate({ target: appRelease.id, set: values });
    res.json({ success: true, ...(await readConfig()) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════
// 📦 استضافة حزمة أندرويد (APK) على خادمنا — التطبيق ليس على متجر بعد
// ══════════════════════════════════════════════════════
// الملفّ يعيش في حجم `uploads` الدائم (ينجو من إعادة بناء الحاويات):
//   uploads/app/mafia-club.apk        الحزمة
//   uploads/app/mafia-club.json       { version, notes } — اختياريّ
// التحديث = رفع ملفٍّ جديد، بلا نشرة كود.

const APK_DIR = path.join(process.cwd(), 'uploads', 'app');
const APK_FILE = path.join(APK_DIR, 'mafia-club.apk');
const APK_META = path.join(APK_DIR, 'mafia-club.json');

function readApkInfo(): { available: boolean; sizeBytes: number; version: string; updatedAt: string | null; notes: string } {
  try {
    const st = fs.statSync(APK_FILE);
    let version = '', notes = '';
    try {
      const m = JSON.parse(fs.readFileSync(APK_META, 'utf8'));
      version = String(m?.version || ''); notes = String(m?.notes || '');
    } catch { /* الوصف اختياريّ */ }
    return { available: true, sizeBytes: st.size, version, updatedAt: st.mtime.toISOString(), notes };
  } catch {
    return { available: false, sizeBytes: 0, version: '', updatedAt: null, notes: '' };
  }
}

// ── GET /api/app/android/info — يقرؤه زرّ التحميل قبل أن يظهر ──
router.get('/android/info', (_req: Request, res: Response) => {
  const info = readApkInfo();
  res.json({ success: true, ...info, url: info.available ? '/api/app/android/apk' : '' });
});

// ── GET /api/app/android/apk — تنزيلٌ مباشر ──
// نوع MIME الصحيح ضروريّ: بدونه يفتح بعض المتصفّحات الملفّ كنصٍّ بدل تنزيله.
router.get('/android/apk', (_req: Request, res: Response) => {
  const info = readApkInfo();
  if (!info.available) {
    return res.status(404).json({ error: 'حزمة التطبيق غير متاحة بعد — تواصل مع الإدارة' });
  }
  const name = `mafia-club${info.version ? `-${info.version}` : ''}.apk`;
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', String(info.sizeBytes));
  res.setHeader('Cache-Control', 'public, max-age=300');
  fs.createReadStream(APK_FILE).on('error', () => { try { res.end(); } catch { /* أُغلق */ } }).pipe(res);
});

// ══════════════════════════════════════════════════════
// روابط التطبيق — Android App Links / iOS Universal Links
// ══════════════════════════════════════════════════════

router.get('/assetlinks', (_req: Request, res: Response) => {
  const pkg = String(process.env.ANDROID_PACKAGE || '').trim();
  const prints = String(process.env.ANDROID_SHA256_FINGERPRINTS || '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!pkg || !prints.length) return res.status(404).json({ error: 'not configured' });

  res.type('application/json').json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: pkg,
      sha256_cert_fingerprints: prints,
    },
  }]);
});

router.get('/apple-app-site-association', (_req: Request, res: Response) => {
  const team = String(process.env.IOS_TEAM_ID || '').trim();
  const bundle = String(process.env.IOS_BUNDLE_ID || '').trim();
  if (!team || !bundle) return res.status(404).json({ error: 'not configured' });

  // المسارات التي تفتح التطبيق: الانضمام بكود غرفة، وكل مسارات اللاعب.
  res.type('application/json').json({
    applinks: {
      apps: [],
      details: [{
        appID: `${team}.${bundle}`,
        paths: ['/join/*', '/player/*'],
      }],
    },
  });
});

export default router;
