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
// GET /api/sounds/coverage — لكلّ مفتاحٍ له صفّ: ملفُّه وحالتُه
// 🔴 تُجيب لوحةُ الأدمن بها عن سؤالها الحقيقيّ: «ماذا يُسمع عند كلّ حدث، وما الصامت؟»
//    الكتالوجُ في الواجهة (lib/sound-keys.ts)، والخادمُ يقول فقط أيُّها له ملفٌّ —
//    فالمفتاحُ الذي لا يعود هنا صامتٌ ما لم يكن له نغمةٌ مركّبة.
// ══════════════════════════════════════════════════════
router.get('/coverage', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.json({ success: true, coverage: {} });
  try {
    const rows = await db.select({
      id: soundEffects.id, name: soundEffects.name, filename: soundEffects.filename,
      isActive: soundEffects.isActive, eventKeys: soundEffects.eventKeys,
      sizeBytes: soundEffects.sizeBytes, updatedAt: soundEffects.updatedAt,
      durations: soundEffects.durations,
    }).from(soundEffects);

    // 🏁 لكلّ مفتاح: الفائزُ (أحدثُ فعّالٍ تعييناً) + البدائلُ (كلُّ ملفٍّ آخر يحمل المفتاح).
    //    نفسُ قاعدة /active-map حرفيّاً — قاعدتان تفترقان عند أوّل تعديل.
    type Row = typeof rows[number];
    const byKey: Record<string, Row[]> = {};
    for (const r of rows) for (const k of ((r.eventKeys as string[]) || [])) (byKey[k] ||= []).push(r);
    const ts = (r: Row) => (r.updatedAt ? new Date(r.updatedAt as any).getTime() : 0);
    const brief = (r: Row) => ({ id: r.id, name: r.name, filename: r.filename, isActive: !!r.isActive, sizeBytes: r.sizeBytes || 0 });
    const coverage: Record<string, { winner: ReturnType<typeof brief> | null; alternatives: ReturnType<typeof brief>[]; others: number; durationMs?: number | null; id?: number; name?: string; filename?: string; isActive?: boolean }> = {};
    for (const [k, list] of Object.entries(byKey)) {
      const active = list.filter(r => r.isActive).sort((a, b) => ts(b) - ts(a) || b.id - a.id);
      const winner = active[0] || null;
      const alternatives = list.filter(r => !winner || r.id !== winner.id).sort((a, b) => ts(b) - ts(a));
      // الحقولُ المسطّحة (id/name/…) للتوافق مع واجهةٍ تقرأ الشكل القديم
      // مدّةُ هذا الحدثِ من الملفِّ الفائز — لا من ملفٍّ آخرَ يحمل المفتاح
      const wd = Number(((winner?.durations as Record<string, unknown>) || {})[k]);
      coverage[k] = {
        winner: winner ? brief(winner) : null,
        alternatives: alternatives.map(brief),
        others: alternatives.length,
        durationMs: Number.isFinite(wd) && wd > 0 ? Math.round(wd) : null,
        ...(winner ? brief(winner) : (alternatives[0] ? brief(alternatives[0]) : {})),
      };
    }
    res.json({ success: true, coverage });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
      updatedAt: soundEffects.updatedAt,
      durations: soundEffects.durations,
      id: soundEffects.id,
    })
    .from(soundEffects)
    .where(eq(soundEffects.isActive, true));

    // 🏁 ملفّان فعّالان بمفتاحٍ واحد: الأحدثُ تعييناً يفوز. نرتّب تصاعديّاً فيكتب
    //    الأحدثُ آخراً. (كان الخادم يمنع الحالة بنزع المفتاح من القديم — فلا بدائل.)
    rows.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt as any).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt as any).getTime() : 0;
      return ta - tb || a.id - b.id;
    });
    // بناء الخريطة: { eventKey: "/uploads/sounds/filename.mp3" }
    const map: Record<string, string> = {};
    // ⏱ المدّةُ تتبع الملفَّ الفائزَ نفسَه: مدّةُ ملفٍّ مهزومٍ على المفتاح لا تُطبَّق
    //    على الملفّ الذي يُسمع فعلاً — وإلّا قُطع المقطعُ بمدّةِ مقطعٍ آخر.
    const durations: Record<string, number> = {};
    for (const row of rows) {
      const keys = (row.eventKeys as string[]) || [];
      const d = (row.durations as Record<string, unknown>) || {};
      for (const key of keys) {
        map[key] = `/uploads/sounds/${row.filename}`;
        const ms = Number(d?.[key]);
        if (Number.isFinite(ms) && ms > 0) durations[key] = Math.round(ms);
        else delete durations[key];   // الفائزُ بلا مدّة يمسح مدّةَ المهزوم
      }
    }

    res.json({ success: true, map, durations });
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

      // 🔴 لا نزعَ للمفاتيح من الملفّات الأخرى: الجديدُ يفوز لأنّه الأحدثُ تعييناً،
      //    والقديمُ يبقى بمفاتيحه «بديلاً» يعود بضغطة. (كان يُنزع نهائيّاً بلا سؤال.)

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
      } as any).returning();

      console.log(`🔊 Sound uploaded: "${soundName}" → ${file.filename} (${eventKeys.join(', ')})`);
      const io = req.app.get('io');
      if (io) io.emit('admin:sounds-updated');
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
    const { name, eventKeys, durations } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (eventKeys !== undefined) {
      updates.eventKeys = eventKeys;
      // تعيينٌ جديد ⇒ هذا الملفّ هو الأحدث على مفاتيحه (لا نزعَ من غيره)
      updates.updatedAt = new Date();
    }
    if (durations !== undefined) {
      // ⏱ تنقيةٌ صارمة: أرقامٌ موجبةٌ فقط بمفاتيحَ نصّيّة — الصفرُ والسالبُ وNaN تعني «كاملاً»
      const clean: Record<string, number> = {};
      if (durations && typeof durations === 'object') {
        for (const [k, v] of Object.entries(durations as Record<string, unknown>)) {
          const ms = Number(v);
          if (typeof k === 'string' && k && Number.isFinite(ms) && ms > 0) {
            clean[k] = Math.min(600000, Math.round(ms));   // سقفٌ عشرُ دقائق
          }
        }
      }
      updates.durations = clean;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'لا يوجد تعديلات' });
    }

    await db.update(soundEffects).set(updates).where(eq(soundEffects.id, id));
    const [updated] = await db.select().from(soundEffects).where(eq(soundEffects.id, id)).limit(1);
    const io = req.app.get('io');
    if (io) io.emit('admin:sounds-updated');
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

    // التفعيلُ تعيينٌ جديد: يصير الأحدثَ على مفاتيحه فيفوز — بلا نزعٍ من غيره
    await db.update(soundEffects)
      .set(newActive ? { isActive: true, updatedAt: new Date() } as any : { isActive: false } as any)
      .where(eq(soundEffects.id, id));
    const io = req.app.get('io');
    if (io) io.emit('admin:sounds-updated');
    res.json({ success: true, isActive: newActive });
  } catch (err: any) {
    console.error('❌ Failed to toggle sound:', err.message);
    res.status(500).json({ error: 'فشل تبديل حالة الصوت' });
  }
});

// ══════════════════════════════════════════════════════
// PUT /api/sounds/:id/promote — «اجعله الفعّال» على مفاتيحه
// 🔴 المهمّةُ التي كانت مستحيلة: جرّبْ بديلاً وعُد. الترقيةُ تُفعّل الملفّ وتجعله
//    الأحدثَ تعييناً فيفوز على مفاتيحه، والمهزومُ يبقى بمفاتيحه بديلاً — فالعودةُ ترقيةٌ أخرى.
// ══════════════════════════════════════════════════════
router.put('/:id/promote', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const id = parseInt(req.params.id);
    const [sound] = await db.select().from(soundEffects).where(eq(soundEffects.id, id)).limit(1);
    if (!sound) return res.status(404).json({ error: 'الصوت غير موجود' });
    await db.update(soundEffects).set({ isActive: true, updatedAt: new Date() } as any).where(eq(soundEffects.id, id));
    const io = req.app.get('io');
    if (io) io.emit('admin:sounds-updated');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    const io = req.app.get('io');
    if (io) io.emit('admin:sounds-updated');
    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Failed to delete sound:', err.message);
    res.status(500).json({ error: 'فشل حذف الصوت' });
  }
});

export default router;
