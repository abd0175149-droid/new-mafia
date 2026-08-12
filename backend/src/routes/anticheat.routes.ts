// ══════════════════════════════════════════════════════
// 🕵️ مسارات لوحة مكافحة الغش (Admin) — كشفٌ إحصائيّ + مراجعة بشريّة
// ══════════════════════════════════════════════════════
import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { computeAnticheatOverview } from '../services/anticheat.service.js';

const router = Router();

// ── GET /overview — درجات المخاطر والأزواج المشتبهة + حالات المراجعة ──
router.get('/overview', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const sinceDays = Number.isFinite(parseInt(String(req.query.sinceDays)))
      ? parseInt(String(req.query.sinceDays)) : undefined;
    const overview = await computeAnticheatOverview({ sinceDays });

    // دمج حالات المراجعة المحفوظة (watching | cleared | flagged)
    const db = getDB();
    const reviews = db
      ? ((await db.execute(sql`SELECT player_id, status, note FROM cheat_reviews`)) as any).rows ?? []
      : [];
    const rmap = new Map<number, any>(reviews.map((r: any) => [Number(r.player_id), r]));
    const players = overview.players.map(p => ({
      ...p,
      review: rmap.get(p.playerId)?.status ?? null,
      note: rmap.get(p.playerId)?.note ?? '',
    }));

    res.json({ success: true, overview: { ...overview, players } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /review — تعليم حالة لاعب (مراقبة/بريء/موسوم) ──
router.post('/review', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const playerId = parseInt(String(req.body?.playerId));
  const status = String(req.body?.status || '');
  const note = String(req.body?.note || '').slice(0, 500);
  if (!Number.isFinite(playerId)) return res.status(400).json({ error: 'معرّف لاعب غير صالح' });
  if (!['watching', 'cleared', 'flagged', 'none'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير معروفة' });
  }
  try {
    if (status === 'none') {
      await db.execute(sql`DELETE FROM cheat_reviews WHERE player_id = ${playerId}`);
    } else {
      await db.execute(sql`
        INSERT INTO cheat_reviews (player_id, status, note, reviewed_by, reviewed_at)
        VALUES (${playerId}, ${status}, ${note}, ${req.user!.id}, NOW())
        ON CONFLICT (player_id) DO UPDATE
          SET status = ${status}, note = ${note}, reviewed_by = ${req.user!.id}, reviewed_at = NOW()`);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
