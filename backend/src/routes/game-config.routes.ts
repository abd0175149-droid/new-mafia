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
  rankEffects,
} from '../schemas/game-config.schema.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
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

// 🔒 أمان: كل عمليات الكتابة على كتالوج اللعبة (الأدوار/القدرات/البطاقات...) للأدمن فقط.
// القراءة (GET) تبقى عامة كما هي حتى لا ينكسر عرض الإعدادات في الواجهات.
router.use((req: Request, res: Response, next) => {
  if (req.method === 'GET') return next();
  authenticate(req, res, () => adminOnly(req, res, next));
});

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
        } as any)
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

// ══════════════════════════════════════════════
// 🎖️ RANK EFFECTS — تأثيرات الرتب البصرية
// ══════════════════════════════════════════════

// GET /api/game-config/rank-effects
router.get('/rank-effects', async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const rows = await db.select().from(rankEffects);
    // ترتيب حسب sortOrder
    rows.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/game-config/rank-effects/:id
router.put('/rank-effects/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.update(rankEffects)
      .set({ ...stripMeta(req.body), updatedAt: new Date() })
      .where(eq(rankEffects.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-config/rank-effects — إنشاء رتبة جديدة
router.post('/rank-effects', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const [row] = await db.insert(rankEffects).values(req.body).returning();
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/game-config/rank-effects/:id
router.delete('/rank-effects/:id', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    // منع حذف INFORMANT (الرتبة الافتراضية)
    if (req.params.id === 'INFORMANT') return res.status(400).json({ error: 'Cannot delete the default rank' });
    const [row] = await db.delete(rankEffects)
      .where(eq(rankEffects.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game-config/rank-effects/seed — بذر البيانات الافتراضية
router.post('/rank-effects/seed', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  try {
    const existing = await db.select().from(rankEffects);
    if (existing.length > 0) return res.json({ success: true, message: 'Already seeded', data: existing });

    const noEffects = {
      border: { enabled: false, color: '#6b7280', width: 1, inset: -1, style: 'solid' as const, gradientColors: [], travelSpeed: 3 },
      glow: { enabled: false, color: '#6b7280', size: 0, opacity: 0, pulseEnabled: false, pulseDuration: 3 },
      shimmer: { enabled: false, color: '#ffffff', opacity: 0.06, duration: 5 },
      particles: { enabled: false, count: 0, color: '#ffffff', size: 3, orbitRadius: '52%', baseDuration: 3 },
      corners: { enabled: false, color: '#6b7280', size: 12, width: 2, pulseEnabled: false },
      gradientOverlay: { enabled: false, color: '#6b7280', opacity: 0.06, direction: 'to top' },
      floating: { enabled: false, content: '👑', position: 'top' as const, size: 18, animation: 'float' as const, glowColor: '#f59e0b' },
      badge: { enabled: false, emoji: '', label: '', bgColor: 'rgba(107,114,128,0.15)', textColor: '#9ca3af', borderColor: 'rgba(107,114,128,0.3)', position: 'top-left' },
      nameEffect: { enabled: false, color: '#ffffff', glowColor: '#ffffff', glowSize: 0 },
    };

    const defaults = [
      { id: 'INFORMANT', nameAr: 'مُخبر', sortOrder: 0, effects: { ...noEffects } },
      { id: 'SOLDIER', nameAr: 'جندي', sortOrder: 1, effects: {
        ...noEffects,
        border: { enabled: true, color: '#10b981', width: 1, inset: -1, style: 'solid' as const, gradientColors: [], travelSpeed: 3 },
        glow: { enabled: true, color: '#10b981', size: 8, opacity: 0.3, pulseEnabled: false, pulseDuration: 3 },
        badge: { enabled: true, emoji: '⚔️', label: 'جندي', bgColor: 'rgba(16,185,129,0.15)', textColor: '#6ee7b7', borderColor: 'rgba(16,185,129,0.3)', position: 'top-left' },
      }},
      { id: 'CAPO', nameAr: 'كابو', sortOrder: 2, effects: {
        ...noEffects,
        border: { enabled: true, color: '#3b82f6', width: 1.5, inset: -2, style: 'solid' as const, gradientColors: [], travelSpeed: 3 },
        glow: { enabled: true, color: '#3b82f6', size: 12, opacity: 0.4, pulseEnabled: true, pulseDuration: 3 },
        corners: { enabled: true, color: '#3b82f6', size: 12, width: 2, pulseEnabled: true },
        gradientOverlay: { enabled: true, color: '#3b82f6', opacity: 0.06, direction: 'to top' },
        badge: { enabled: true, emoji: '🎖️', label: 'كابو', bgColor: 'rgba(59,130,246,0.15)', textColor: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)', position: 'top-left' },
      }},
      { id: 'UNDERBOSS', nameAr: 'نائب العراب', sortOrder: 3, effects: {
        ...noEffects,
        border: { enabled: true, color: '#8b5cf6', width: 2, inset: -2, style: 'gradient' as const, gradientColors: ['#8b5cf6', '#f59e0b', '#8b5cf6'], travelSpeed: 3 },
        glow: { enabled: true, color: '#8b5cf6', size: 18, opacity: 0.45, pulseEnabled: true, pulseDuration: 2.5 },
        shimmer: { enabled: true, color: '#8b5cf6', opacity: 0.08, duration: 5 },
        particles: { enabled: true, count: 4, color: '#8b5cf6', size: 3, orbitRadius: '52%', baseDuration: 3 },
        gradientOverlay: { enabled: true, color: '#8b5cf6', opacity: 0.08, direction: 'to top' },
        badge: { enabled: true, emoji: '👑', label: 'نائب', bgColor: 'rgba(139,92,246,0.2)', textColor: '#c4b5fd', borderColor: 'rgba(139,92,246,0.35)', position: 'top-left' },
      }},
      { id: 'GODFATHER', nameAr: 'العراب', sortOrder: 4, effects: {
        ...noEffects,
        border: { enabled: true, color: '#f59e0b', width: 2, inset: -3, style: 'traveling' as const, gradientColors: ['#f59e0b', '#eab308', '#f59e0b', '#fcd34d'], travelSpeed: 3 },
        glow: { enabled: true, color: '#f59e0b', size: 25, opacity: 0.5, pulseEnabled: true, pulseDuration: 2 },
        shimmer: { enabled: true, color: '#f59e0b', opacity: 0.1, duration: 4 },
        particles: { enabled: true, count: 4, color: '#f59e0b', size: 3, orbitRadius: '54%', baseDuration: 3 },
        gradientOverlay: { enabled: true, color: '#f59e0b', opacity: 0.1, direction: 'to top' },
        floating: { enabled: true, content: '👑', position: 'top' as const, size: 18, animation: 'float' as const, glowColor: '#f59e0b' },
        badge: { enabled: true, emoji: '👑', label: 'العراب', bgColor: 'rgba(245,158,11,0.2)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.4)', position: 'top-left' },
        nameEffect: { enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 8 },
      }},
    ];

    const rows = await db.insert(rankEffects).values(defaults).returning();
    invalidateCache();
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
