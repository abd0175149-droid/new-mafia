// ══════════════════════════════════════════════════════
// 📜 «قواعد الحجز والعروض» — سياسة الحجز (خطّة توحيد الحجز م٢-ب، ق١٢)
// ══════════════════════════════════════════════════════
// صفحةٌ واحدة في لوحة الإدارة تجمع ما يحكم الحجز في كلّ القنوات. تبدأ بسياسة الحجز (مهل الإلغاء
// والتعديل والحجز بعد البدء والإلغاء المتأخّر)، وتُضاف إليها العروض في م٤.
import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { bookingPolicyFresh, saveBookingPolicy, DEFAULT_BOOKING_POLICY } from '../services/booking-policy.service.js';

const router = Router();

router.get('/policy', authenticate, async (_req: Request, res: Response) => {
  try { res.json({ policy: await bookingPolicyFresh(), defaults: DEFAULT_BOOKING_POLICY }); }
  catch (e: any) { res.status(500).json({ error: e?.message || 'خطأ' }); }
});

router.put('/policy', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const by = (req as any).user?.displayName || (req as any).user?.username || '';
    res.json({ policy: await saveBookingPolicy(req.body || {}, by) });
  } catch (e: any) { res.status(500).json({ error: e?.message || 'خطأ' }); }
});

// ── 💸 م٤-أ: الفهرس الموحّد، و«عروض هذه الليلة»، و«جرّب السعر» (قراءةٌ فقط) ──
router.get('/offers', authenticate, async (_req: Request, res: Response) => {
  try { const P = await import('../services/pricing.service.js'); res.json({ offers: await P.offerCatalog() }); }
  catch (e: any) { res.status(500).json({ error: e?.message || 'خطأ' }); }
});

router.get('/offers/activity/:id', authenticate, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
  try { const P = await import('../services/pricing.service.js'); res.json({ offers: await P.offersForActivity(id) }); }
  catch (e: any) { res.status(500).json({ error: e?.message || 'خطأ' }); }
});

router.get('/quote', authenticate, async (req: Request, res: Response) => {
  const activityId = parseInt(String(req.query.activityId || ''));
  if (!Number.isFinite(activityId)) return res.status(400).json({ error: 'اختر فعاليّة' });
  const ch = String(req.query.channel || 'bot');
  const channel = (['app', 'bot', 'admin', 'staff'].includes(ch) ? ch : 'bot') as any;
  try {
    const { normalizeLocalPhone } = await import('../utils/phone.util.js');
    const phone = normalizeLocalPhone(String(req.query.phone || '')) || null;
    let playerId: number | null = null;
    if (phone) {
      const { getDB } = await import('../config/db.js');
      const { sql } = await import('drizzle-orm');
      const r: any = await getDB()!.execute(sql`SELECT id FROM players WHERE phone IN (${phone}, ${phone.replace(/^0/, '')}) LIMIT 1`);
      playerId = r?.rows?.[0]?.id ?? null;
    }
    const P = await import('../services/pricing.service.js');
    res.json({ quote: await P.quote({ activityId, people: Number(req.query.people) || 1, phone, playerId, channel }), playerId });
  } catch (e: any) { res.status(500).json({ error: e?.message || 'خطأ' }); }
});

export default router;
