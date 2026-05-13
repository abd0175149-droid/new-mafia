// ══════════════════════════════════════════════════════
// 🧩 Game Config API — إدارة القدرات والأدوار والبطاقات
// Data-Driven Architecture — CRUD Endpoints
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import {
  abilityDefinitions,
  cardTemplates,
  roleDefinitions,
  interactionRules,
} from '../schemas/game-config.schema.js';
import { authenticate } from '../middleware/auth.js';
import { invalidateCache } from '../game/definition-service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ── Setup multer for card face images ──
const CARD_FACES_DIR = path.resolve(process.cwd(), 'uploads/card-faces');
if (!fs.existsSync(CARD_FACES_DIR)) fs.mkdirSync(CARD_FACES_DIR, { recursive: true });

const cardFaceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CARD_FACES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});
const cardFaceUpload = multer({
  storage: cardFaceStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported format: ${file.mimetype}. Allowed: PNG, JPG, WEBP, GIF, SVG`));
  },
});

const router = Router();

// Helper: strip metadata fields from request body before DB update
function stripMeta(body: any) {
  const { id, createdAt, updatedAt, created_at, updated_at, ...clean } = body;
  return clean;
}

// ══════════════════════════════════════════════
// 🧩 القدرات (Abilities)
// ══════════════════════════════════════════════

// GET /api/game-config/abilities
router.get('/abilities', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const rows = await db.select().from(abilityDefinitions).orderBy(abilityDefinitions.priority);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-config/abilities
router.post('/abilities', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.insert(abilityDefinitions).values(req.body).returning();
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/game-config/abilities/:id
router.put('/abilities/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.update(abilityDefinitions)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(abilityDefinitions.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/game-config/abilities/:id
router.delete('/abilities/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    // فحص: هل القدرة مستخدمة في دور؟
    const roles = await db.select().from(roleDefinitions);
    const inUse = roles.some((r: any) => {
      const abilities = r.abilities as string[];
      return abilities && abilities.includes(req.params.id);
    });
    if (inUse) return res.status(400).json({ error: 'القدرة مستخدمة في دور — احذف الربط أولاً' });

    const [row] = await db.delete(abilityDefinitions)
      .where(eq(abilityDefinitions.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// 🎭 الأدوار (Roles)
// ══════════════════════════════════════════════

// GET /api/game-config/roles
router.get('/roles', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const rows = await db.select().from(roleDefinitions).orderBy(roleDefinitions.genPriority);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-config/roles
router.post('/roles', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.insert(roleDefinitions).values(req.body).returning();
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/game-config/roles/:id
router.put('/roles/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.update(roleDefinitions)
      .set({ ...stripMeta(req.body), updatedAt: new Date() })
      .where(eq(roleDefinitions.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/game-config/roles/:id
router.delete('/roles/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.delete(roleDefinitions)
      .where(eq(roleDefinitions.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// 🎴 قوالب البطاقات (Card Templates)
// ══════════════════════════════════════════════

// GET /api/game-config/card-templates
router.get('/card-templates', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const rows = await db.select().from(cardTemplates);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-config/card-templates
router.post('/card-templates', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.insert(cardTemplates).values(req.body).returning();
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/game-config/card-templates/:id
router.put('/card-templates/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.update(cardTemplates)
      .set({ ...stripMeta(req.body), updatedAt: new Date() })
      .where(eq(cardTemplates.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/game-config/card-templates/:id
router.delete('/card-templates/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.delete(cardTemplates)
      .where(eq(cardTemplates.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-config/card-templates/:id/upload-image — رفع صورة الوجه السري
router.post('/card-templates/:id/upload-image', authenticate, (req: Request, res: Response) => {
  cardFaceUpload.single('image')(req, res, async (uploadErr: any) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });

    try {
      const imageUrl = `/uploads/card-faces/${file.filename}`;
      const [row] = await db.update(cardTemplates)
        .set({
          secretFace: { type: 'custom', customImageUrl: imageUrl },
          updatedAt: new Date(),
        })
        .where(eq(cardTemplates.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ error: 'Template not found' });
      invalidateCache();
      res.json({ success: true, data: row, imageUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
});

// ══════════════════════════════════════════════
// ⚔️ قواعد التفاعل (Interaction Rules)
// ══════════════════════════════════════════════

// GET /api/game-config/interactions
router.get('/interactions', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const rows = await db.select().from(interactionRules).orderBy(interactionRules.priority);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-config/interactions
router.post('/interactions', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.insert(interactionRules).values(req.body).returning();
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/game-config/interactions/:id
router.put('/interactions/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.update(interactionRules)
      .set(req.body)
      .where(eq(interactionRules.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/game-config/interactions/:id
router.delete('/interactions/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.delete(interactionRules)
      .where(eq(interactionRules.id, parseInt(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
