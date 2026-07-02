// ══════════════════════════════════════════════════════
// 🖨️ Print Layout API — رفع الأوراق الرسمية + تخطيط الطباعة لكل تقرير
//   POST   /api/print-layouts/letterheads     رفع ورق رسمي (PNG)
//   GET    /api/print-layouts/letterheads     قائمة الأوراق
//   DELETE /api/print-layouts/letterheads/:id حذف ناعم
//   GET    /api/print-layouts                 قائمة التخطيطات
//   GET    /api/print-layouts/:reportKey      تخطيط نوع (أو default)
//   PUT    /api/print-layouts/:reportKey      حفظ (upsert)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, isNull, desc, and } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDB } from '../config/db.js';
import { authenticate, managerOrAbove } from '../middleware/auth.js';
import { printLayouts, letterheads } from '../schemas/print-layout.schema.js';
import { invalidateLayoutCache, mergeLayout, LETTERHEADS_DIR } from '../reports/print-layout.service.js';

const router = Router();

if (!fs.existsSync(LETTERHEADS_DIR)) {
  fs.mkdirSync(LETTERHEADS_DIR, { recursive: true });
  console.log('📂 Created letterheads directory:', LETTERHEADS_DIR);
}

const ALLOWED = ['image/png', 'application/pdf'];
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LETTERHEADS_DIR),
  filename: (_req, file, cb) => {
    const ext = file.mimetype === 'application/pdf' ? '.pdf' : '.png';
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`نوع غير مدعوم: ${file.mimetype} — المسموح PNG أو PDF`));
  },
});

const urlFor = (imageFilename: string) => `/uploads/letterheads/${imageFilename}`;

// ── رفع ورق رسمي ──
router.post('/letterheads', authenticate, managerOrAbove,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]),
  async (req: Request, res: Response) => {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const image = files?.image?.[0];
    if (!image) return res.status(400).json({ error: 'صورة الورق (PNG) مطلوبة' });
    try {
      const [row] = await db.insert(letterheads).values({
        name: (req.body.name || 'ورق رسمي').toString().slice(0, 150),
        imageFilename: image.filename,
        pdfFilename: files?.pdf?.[0]?.filename || null,
        widthPx: parseInt(req.body.widthPx) || 0,
        heightPx: parseInt(req.body.heightPx) || 0,
        createdBy: req.user?.id || null,
      } as any).returning();
      res.status(201).json({ success: true, letterhead: { ...row, url: urlFor(row.imageFilename) } });
    } catch (err: any) {
      console.error('❌ letterhead upload:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// ── قائمة الأوراق ──
router.get('/letterheads', authenticate, managerOrAbove, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const rows = await db.select().from(letterheads).where(isNull(letterheads.deletedAt)).orderBy(desc(letterheads.createdAt));
  res.json({ success: true, letterheads: rows.map((r) => ({ ...r, url: urlFor(r.imageFilename) })) });
});

// ── حذف ناعم ──
router.delete('/letterheads/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  await db.update(letterheads).set({ deletedAt: new Date() } as any).where(eq(letterheads.id, parseInt(req.params.id)));
  invalidateLayoutCache();
  res.json({ success: true });
});

// ── قائمة التخطيطات ──
router.get('/', authenticate, managerOrAbove, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const rows = await db.select().from(printLayouts);
  res.json({ success: true, layouts: rows });
});

// ── تخطيط نوع تقرير (أو default) للتحرير ──
router.get('/:reportKey', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const key = req.params.reportKey;
  const [row] = await db.select().from(printLayouts).where(eq(printLayouts.reportKey, key)).limit(1);
  let letterheadUrl: string | null = null;
  const lhId = row?.letterheadId ?? null;
  if (lhId) {
    const [lh] = await db.select().from(letterheads).where(and(eq(letterheads.id, lhId), isNull(letterheads.deletedAt))).limit(1);
    if (lh) letterheadUrl = urlFor(lh.imageFilename);
  }
  res.json({
    success: true,
    reportKey: key,
    exists: !!row,
    letterheadId: lhId,
    letterheadUrl,
    layout: mergeLayout(row?.layout),
  });
});

// ── حفظ (upsert) ──
router.put('/:reportKey', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  const key = req.params.reportKey;
  const layout = mergeLayout(req.body.layout);
  const letterheadId = req.body.letterheadId ? parseInt(req.body.letterheadId) : null;
  try {
    const [existing] = await db.select().from(printLayouts).where(eq(printLayouts.reportKey, key)).limit(1);
    if (existing) {
      await db.update(printLayouts)
        .set({ layout, letterheadId, updatedAt: new Date() } as any)
        .where(eq(printLayouts.reportKey, key));
    } else {
      await db.insert(printLayouts).values({ reportKey: key, layout, letterheadId } as any);
    }
    invalidateLayoutCache();
    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ save print layout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
