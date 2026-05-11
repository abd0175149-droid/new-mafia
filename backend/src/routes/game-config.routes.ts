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

const router = Router();

// ══════════════════════════════════════════════
// 🧩 القدرات (Abilities)
// ══════════════════════════════════════════════

// GET /api/game-config/abilities
router.get('/abilities', authenticate, async (_req: Request, res: Response) => {
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
router.get('/roles', authenticate, async (_req: Request, res: Response) => {
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
      .set({ ...req.body, updatedAt: new Date() })
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
router.get('/card-templates', authenticate, async (_req: Request, res: Response) => {
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
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(cardTemplates.id, req.params.id))
      .returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    invalidateCache();
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
