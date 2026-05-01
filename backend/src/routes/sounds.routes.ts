// ══════════════════════════════════════════════════════
// 🔊 إدارة المؤثرات الصوتية — Sound Effects API
// رفع، جلب، تعديل، حذف الأصوات المخصصة
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { soundEffects } from '../schemas/admin.schema.js';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// ── مسار تخزين الملفات الصوتية ──
// تُحفظ داخل backend/uploads/sounds/ وتُخدم عبر express.static('/uploads')
const SOUNDS_DIR = path.resolve(process.cwd(), 'uploads/sounds');

// التأكد من وجود المجلد
if (!fs.existsSync(SOUNDS_DIR)) {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
  console.log('📂 Created sounds directory:', SOUNDS_DIR);
}

// ── إعداد multer لرفع الملفات ──
const ALLOWED_MIMES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SOUNDS_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`نوع الملف غير مدعوم: ${file.mimetype}. الأنواع المسموحة: mp3, wav, ogg, webm, m4a`));
    }
  },
});

// ══════════════════════════════════════════════════════
// GET /api/sounds — جلب جميع الأصوات
// ══════════════════════════════════════════════════════
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const rows = await db.select().from(soundEffects).orderBy(soundEffects.createdAt);
    res.json({ success: true, sounds: rows });
  } catch (err: any) {
    console.error('❌ Failed to fetch sounds:', err.message);
    res.status(500).json({ error: 'فشل تحميل الأصوات' });
  }
});

// ══════════════════════════════════════════════════════
// GET /api/sounds/active-map — خريطة الأصوات المفعّلة
// يُستخدم من شاشة العرض (Frontend) لتحميل الأصوات المخصصة
// ══════════════════════════════════════════════════════
router.get('/active-map', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.json({ success: true, map: {} });

  try {
    const rows = await db.select({
      filename: soundEffects.filename,
      eventKeys: soundEffects.eventKeys,
    })
    .from(soundEffects)
    .where(eq(soundEffects.isActive, true));

    // بناء الخريطة: { eventKey: "/uploads/sounds/filename.mp3" }
    const map: Record<string, string> = {};
    for (const row of rows) {
      const keys = (row.eventKeys as string[]) || [];
      for (const key of keys) {
        map[key] = `/uploads/sounds/${row.filename}`;
      }
    }

    res.json({ success: true, map });
  } catch (err: any) {
    console.error('❌ Failed to fetch active sound map:', err.message);
    res.json({ success: true, map: {} });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/sounds/upload — رفع ملف صوتي جديد
// ══════════════════════════════════════════════════════
router.post('/upload', authenticate, (req: Request, res: Response) => {
  upload.single('file')(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'حجم الملف يتجاوز 50 ميجابايت' });
      }
      return res.status(400).json({ error: uploadErr.message });
    }

    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });

    try {
      const { name, eventKeys: eventKeysRaw } = req.body;
      const soundName = name || file.originalname;
      let eventKeys: string[] = [];

      // تحليل eventKeys (قد تأتي كـ JSON string أو مصفوفة)
      if (eventKeysRaw) {
        try {
          eventKeys = typeof eventKeysRaw === 'string' ? JSON.parse(eventKeysRaw) : eventKeysRaw;
        } catch {
          eventKeys = [eventKeysRaw];
        }
      }

      // إلغاء تفعيل الأصوات السابقة لنفس الـ eventKeys
      if (eventKeys.length > 0) {
        const allSounds = await db.select().from(soundEffects).where(eq(soundEffects.isActive, true));
        for (const sound of allSounds) {
          const existingKeys = (sound.eventKeys as string[]) || [];
          const overlap = existingKeys.filter(k => eventKeys.includes(k));
          if (overlap.length > 0) {
            // إزالة الـ keys المتداخلة من الصوت القديم
            const remainingKeys = existingKeys.filter(k => !eventKeys.includes(k));
            if (remainingKeys.length === 0) {
              // لا يوجد keys أخرى → إلغاء التفعيل
              await db.update(soundEffects).set({ isActive: false }).where(eq(soundEffects.id, sound.id));
            } else {
              // بقي keys أخرى → تحديث القائمة فقط
              await db.update(soundEffects).set({ eventKeys: remainingKeys }).where(eq(soundEffects.id, sound.id));
            }
          }
        }
      }

      // إنشاء السجل الجديد
      const [newSound] = await db.insert(soundEffects).values({
        name: soundName,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        eventKeys,
        isActive: true,
        uploadedBy: (req as any).user?.displayName || 'admin',
      }).returning();

      console.log(`🔊 Sound uploaded: "${soundName}" → ${file.filename} (${eventKeys.join(', ')})`);
      res.json({ success: true, sound: newSound });
    } catch (err: any) {
      // حذف الملف المرفوع في حال فشل الحفظ في DB
      try { fs.unlinkSync(file.path); } catch {}
      console.error('❌ Failed to save sound:', err.message);
      res.status(500).json({ error: 'فشل حفظ الصوت' });
    }
  });
});

// ══════════════════════════════════════════════════════
// PUT /api/sounds/:id — تعديل اسم أو مراحل صوت
// ══════════════════════════════════════════════════════
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const id = parseInt(req.params.id);
    const { name, eventKeys } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (eventKeys !== undefined) {
      updates.eventKeys = eventKeys;

      // إلغاء تفعيل التداخلات مع أصوات أخرى
      if (Array.isArray(eventKeys) && eventKeys.length > 0) {
        const allSounds = await db.select().from(soundEffects).where(eq(soundEffects.isActive, true));
        for (const sound of allSounds) {
          if (sound.id === id) continue;
          const existingKeys = (sound.eventKeys as string[]) || [];
          const remaining = existingKeys.filter((k: string) => !eventKeys.includes(k));
          if (remaining.length !== existingKeys.length) {
            if (remaining.length === 0) {
              await db.update(soundEffects).set({ isActive: false }).where(eq(soundEffects.id, sound.id));
            } else {
              await db.update(soundEffects).set({ eventKeys: remaining }).where(eq(soundEffects.id, sound.id));
            }
          }
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا يوجد تعديلات' });
    }

    await db.update(soundEffects).set(updates).where(eq(soundEffects.id, id));
    const [updated] = await db.select().from(soundEffects).where(eq(soundEffects.id, id)).limit(1);
    res.json({ success: true, sound: updated });
  } catch (err: any) {
    console.error('❌ Failed to update sound:', err.message);
    res.status(500).json({ error: 'فشل تعديل الصوت' });
  }
});

// ══════════════════════════════════════════════════════
// PUT /api/sounds/:id/toggle — تفعيل/إلغاء تفعيل
// ══════════════════════════════════════════════════════
router.put('/:id/toggle', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const id = parseInt(req.params.id);
    const [sound] = await db.select().from(soundEffects).where(eq(soundEffects.id, id)).limit(1);
    if (!sound) return res.status(404).json({ error: 'الصوت غير موجود' });

    const newActive = !sound.isActive;

    // عند التفعيل → إلغاء تفعيل الأصوات المتداخلة
    if (newActive) {
      const eventKeys = (sound.eventKeys as string[]) || [];
      if (eventKeys.length > 0) {
        const allSounds = await db.select().from(soundEffects).where(eq(soundEffects.isActive, true));
        for (const other of allSounds) {
          if (other.id === id) continue;
          const otherKeys = (other.eventKeys as string[]) || [];
          const remaining = otherKeys.filter((k: string) => !eventKeys.includes(k));
          if (remaining.length !== otherKeys.length) {
            if (remaining.length === 0) {
              await db.update(soundEffects).set({ isActive: false }).where(eq(soundEffects.id, other.id));
            } else {
              await db.update(soundEffects).set({ eventKeys: remaining }).where(eq(soundEffects.id, other.id));
            }
          }
        }
      }
    }

    await db.update(soundEffects).set({ isActive: newActive }).where(eq(soundEffects.id, id));
    res.json({ success: true, isActive: newActive });
  } catch (err: any) {
    console.error('❌ Failed to toggle sound:', err.message);
    res.status(500).json({ error: 'فشل تبديل حالة الصوت' });
  }
});

// ══════════════════════════════════════════════════════
// DELETE /api/sounds/:id — حذف صوت + ملفه
// ══════════════════════════════════════════════════════
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });

  try {
    const id = parseInt(req.params.id);
    const [sound] = await db.select().from(soundEffects).where(eq(soundEffects.id, id)).limit(1);
    if (!sound) return res.status(404).json({ error: 'الصوت غير موجود' });

    // حذف الملف من القرص
    const filePath = path.join(SOUNDS_DIR, sound.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted sound file: ${sound.filename}`);
      }
    } catch (fileErr: any) {
      console.warn(`⚠️ Failed to delete file ${sound.filename}:`, fileErr.message);
    }

    // حذف السجل من DB
    await db.delete(soundEffects).where(eq(soundEffects.id, id));
    console.log(`🗑️ Sound #${id} "${sound.name}" deleted`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Failed to delete sound:', err.message);
    res.status(500).json({ error: 'فشل حذف الصوت' });
  }
});

export default router;
