// ══════════════════════════════════════════════════════
// 🏙️ مسارات المدن — Cities Routes
// عامّ: القائمة الفعّالة (للتطبيق). إداريّ: الكلّ بعدّاداتها + إضافة/تسمية/تفعيل. لا حذف.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { authenticate, managerOrAbove } from '../middleware/auth.js';
import { listCities, getCity, createCity, updateCity } from '../services/cities.service.js';
import { getActiveRegularSeasonId } from '../services/season.service.js';

const router = Router();

// ── GET /api/cities/public — المدن الفعّالة (بلا مصادقة — للتطبيق والفلاتر) ──
router.get('/public', async (_req: Request, res: Response) => {
  try {
    const cities = await listCities({ activeOnly: true });
    res.json({ success: true, cities });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cities — كلّ المدن بعدّاداتها (موظّفون) ──
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const cities = await listCities();
    const seasonId = await getActiveRegularSeasonId();
    const locRes: any = await db.execute(sql`SELECT city_id, COUNT(*)::int AS n FROM locations WHERE deleted_at IS NULL GROUP BY city_id`);
    const locCount = new Map<number, number>((locRes?.rows ?? locRes ?? []).map((r: any) => [Number(r.city_id), Number(r.n)]));
    let pCount = new Map<number, number>();
    let mCount = new Map<number, number>();
    if (seasonId) {
      const pRes: any = await db.execute(sql`SELECT city_id, COUNT(*)::int AS n FROM player_season_stats WHERE season_id = ${seasonId} AND city_id IS NOT NULL AND COALESCE(total_matches,0) > 0 GROUP BY city_id`);
      pCount = new Map((pRes?.rows ?? pRes ?? []).map((r: any) => [Number(r.city_id), Number(r.n)]));
      const mRes: any = await db.execute(sql`SELECT city_id, COUNT(*)::int AS n FROM matches WHERE season_id = ${seasonId} AND city_id IS NOT NULL AND deleted_at IS NULL GROUP BY city_id`);
      mCount = new Map((mRes?.rows ?? mRes ?? []).map((r: any) => [Number(r.city_id), Number(r.n)]));
    }
    res.json({
      success: true,
      cities: cities.map(c => ({
        ...c,
        locationsCount: locCount.get(c.id) ?? 0,
        seasonPlayers: pCount.get(c.id) ?? 0,
        seasonMatches: mCount.get(c.id) ?? 0,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/cities — إضافة مدينة (مدير فأعلى) ──
router.post('/', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  try {
    const { name, slug } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المدينة مطلوب' });
    const city = await createCity(String(name), slug ? String(slug) : undefined);
    res.status(201).json({ success: true, city });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/cities/:id — تسمية / تفعيل / ترتيب. لا حذف: المفاتيح مُشارٌ إليها من الأماكن والمباريات ──
router.patch('/:id', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    const existing = await getCity(id);
    if (!existing) return res.status(404).json({ error: 'المدينة غير موجودة' });
    const { name, isActive, sortOrder } = req.body || {};
    // 🛡️ لا تُعطَّل آخر مدينةٍ فعّالة — التطبيق يحتاج مدينةً افتراضيّةً واحدةً على الأقلّ
    if (isActive === false) {
      const active = await listCities({ activeOnly: true });
      if (active.length === 1 && active[0].id === id) {
        return res.status(409).json({ error: 'لا يمكن تعطيل المدينة الفعّالة الوحيدة' });
      }
    }
    const city = await updateCity(id, { name, isActive, sortOrder });
    res.json({ success: true, city });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
