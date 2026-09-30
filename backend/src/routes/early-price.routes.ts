// ══════════════════════════════════════════════════════
// 💸 سعر الدون المبكّر — /api/early-price
// ══════════════════════════════════════════════════════
// • الأدمن: إنشاءُ العرض وتعديلُه، ومعاينةُ التفعيل (الأثر الرجعيّ) ثمّ التفعيل، والإيقاف،
//   وتطبيقُ السعر أو إزالتُه يدويّاً على حجزٍ بعينه (يُسجَّل في سجلّ الموظّفين).
// • القائد فما فوق: غياباتُ الفعاليّة وزرّ «حضر» الذي يلغي الغياب.

import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly, leaderOrAbove } from '../middleware/auth.js';
import { getDB } from '../config/db.js';
import { earlyPricePromos } from '../schemas/admin.schema.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  listPromoRows, toPromo, promoPrice, promoStats, validatePromo, promoValues, invalidateEarlyCache, actLite, judgeEarly,
  activationPreview, activate, setBookingEarly, strikesForActivity, waiveStrikes, type PromoInput,
} from '../services/early-price.service.js';

const router = Router();
const actorOf = (req: Request) => String((req as any).user?.displayName || (req as any).user?.username || 'أدمن');
function rowsOf(r: any): any[] { return r?.rows ?? (Array.isArray(r) ? r : []); }

async function refreshBot() {
  invalidateEarlyCache();
  try { const { invalidateLiveFacts } = await import('../services/whatsapp-bot.service.js'); invalidateLiveFacts(); } catch { /* غير حرج */ }
}
async function audit(req: Request, action: string, labelAr: string, details: any, activityId?: number | null) {
  try {
    const { logStaffAction } = await import('../services/staff-action-log.service.js');
    const u: any = (req as any).user || {};
    await logStaffAction({ staffId: u.id ?? null, staffUsername: u.username ?? null, staffRole: u.role ?? null, source: 'dashboard', action, category: 'booking', labelAr, activityId: activityId ?? null, details, outcome: 'success' });
  } catch { /* السجلّ تكميليّ */ }
}

// ══════════ القائمة ══════════
router.get('/', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const rows = await listPromoRows();
    const now = Date.now();
    const up: any = await db.execute(sql`
      SELECT a.id, a.name, a.date, a.base_price AS price, l.name AS location, l.city_id
        FROM activities a LEFT JOIN locations l ON l.id = a.location_id
       WHERE a.date > NOW() - INTERVAL '6 hours' AND a.deleted_at IS NULL AND a.status IN ('planned', 'active')
         AND COALESCE(l.is_test_location, false) = false
       ORDER BY a.date LIMIT 80`);
    const upcoming = rowsOf(up).map((a: any) => ({ id: Number(a.id), name: a.name, date: a.date, price: Number(a.price || 0), location: a.location || '', cityId: a.city_id ?? null }));
    const offers = [];
    for (const r of rows) {
      const p = toPromo(r);
      // الفعاليّات القادمة التي يشملها الآن ومتى يُغلق سعرها
      const covered: any[] = [];
      for (const a0 of upcoming) {
        const a = await actLite(a0.id); if (!a) continue;
        const v = judgeEarly({ ...p, status: 'live' }, a, { now, bookedAt: now, channel: 'bot', strikes: 0 });
        const struct = v.reasons.filter(x => ['window', 'scope', 'excluded', 'noop', 'test', 'closed'].includes(x.code));
        if (!struct.length) covered.push({ id: a.id, name: a.name, date: new Date(a.date), price: promoPrice(p, a.price), base: a.price, deadline: new Date(v.deadline), open: v.deadline > now });
      }
      offers.push({ ...r, covered, stats: await promoStats(r.id) });
    }
    const { listCities } = await import('../services/cities.service.js');
    const cities = (await listCities({ activeOnly: true })).map((c: any) => ({ id: c.id, name: c.name }));
    res.json({ success: true, offers, upcoming, cities });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const input = (req.body || {}) as PromoInput;
    const bad = await validatePromo(input);
    if (bad) return res.status(400).json({ error: bad });
    // يُنشأ مسودة دائماً — التفعيل عبر المعاينة (الأثر الرجعيّ يُرى قبل الضغط)
    const [row] = await db.insert(earlyPricePromos).values({ ...promoValues(input), status: 'draft', createdBy: actorOf(req) } as any).returning();
    await refreshBot();
    await audit(req, 'early_price.create', `أنشأ عرض «${row.name}»`, { id: row.id });
    res.json({ success: true, offer: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const input = (req.body || {}) as PromoInput;
    const bad = await validatePromo(input);
    if (bad) return res.status(400).json({ error: bad });
    // الحجوزات المقفولة تحتفظ بسعرها — التعديل للحجوزات الجديدة فقط
    const [row] = await db.update(earlyPricePromos).set({ ...promoValues(input), updatedAt: new Date() } as any)
      .where(and(eq(earlyPricePromos.id, parseInt(req.params.id)), isNull(earlyPricePromos.deletedAt))).returning();
    if (!row) return res.status(404).json({ error: 'العرض غير موجود' });
    await refreshBot();
    await audit(req, 'early_price.update', `عدّل عرض «${row.name}»`, { id: row.id });
    res.json({ success: true, offer: row });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── التفعيل: معاينةٌ للأثر الرجعيّ ثمّ الضغط ──
router.get('/:id/activation-preview', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const pv = await activationPreview(parseInt(req.params.id));
    if (pv.error) return res.status(404).json({ error: pv.error });
    res.json({ success: true, ...pv });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/:id/activate', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const out = await activate(parseInt(req.params.id), actorOf(req), req.body?.applyRetro !== false);
    if (!out.ok) return res.status(400).json({ error: out.error });
    await refreshBot();
    await audit(req, 'early_price.activate', `فعّل عرض السعر المبكّر #${req.params.id}`, { id: Number(req.params.id), retroApplied: out.applied });
    res.json({ success: true, ...out });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/:id/status', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const status = String(req.body?.status || '');
    if (!['paused', 'draft'].includes(status)) return res.status(400).json({ error: 'للتفعيل استعمل المعاينة' });
    const [row] = await db.update(earlyPricePromos).set({ status, updatedAt: new Date() } as any)
      .where(and(eq(earlyPricePromos.id, parseInt(req.params.id)), isNull(earlyPricePromos.deletedAt))).returning();
    if (!row) return res.status(404).json({ error: 'العرض غير موجود' });
    await refreshBot();
    await audit(req, 'early_price.status', `${status === 'paused' ? 'أوقف' : 'أرجع مسودة'} عرض «${row.name}»`, { id: row.id, status });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.delete('/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const db = getDB(); if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    const st = await promoStats(id);
    if (st.reservations > 0) return res.status(409).json({ error: `عليه ${st.reservations} حجزاً مقفولاً — أوقفه بدل الحذف` });
    await db.update(earlyPricePromos).set({ deletedAt: new Date(), status: 'paused', updatedAt: new Date() } as any).where(eq(earlyPricePromos.id, id));
    await refreshBot();
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── تدخّلُ الأدمن على حجزٍ بعينه (قرار ٨) ──
router.post('/booking/:bookingId', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const on = req.body?.on !== false;
    const out = await setBookingEarly(parseInt(req.params.bookingId), on);
    if (!out.ok) return res.status(400).json({ error: out.error });
    await audit(req, on ? 'early_price.manual_apply' : 'early_price.manual_remove', on ? `طبّق السعر المبكّر يدويّاً على حجز #${req.params.bookingId}` : `أزال السعر المبكّر عن حجز #${req.params.bookingId}`, { bookingId: Number(req.params.bookingId), price: out.price ?? null });
    res.json({ success: true, ...out });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ══════════ الغياب ══════════
router.get('/activity/:activityId/strikes', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  try { res.json({ success: true, strikes: await strikesForActivity(parseInt(req.params.activityId)) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/strikes/:id/waive', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  try {
    const out = await waiveStrikes({ strikeId: parseInt(req.params.id) }, actorOf(req));
    if (!out.waived) return res.status(404).json({ error: 'الغياب غير موجود أو أُلغي سابقاً' });
    await audit(req, 'no_show.waive', `ألغى غياباً (حضر) #${req.params.id}`, { strikeId: Number(req.params.id), restored: out.restored });
    res.json({ success: true, ...out });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
