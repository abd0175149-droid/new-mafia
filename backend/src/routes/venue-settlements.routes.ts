// ══════════════════════════════════════════════════════
// 🤝 تسويات الأماكن — /api/admin/venue-settlements (2026-10-30)
// ما حصّلته الأماكن، وما للنادي عندها، وما سُلِّم. الأماكن تصرّح بالتسليم من
// كونسولها (pending) والإدارة تؤكّد أو ترفض هنا، أو تسجّل استلاماً مباشراً.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { venueHandovers } from '../schemas/fnb.schema.js';
import { locations } from '../schemas/admin.schema.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { settlementsOverview, clubAccount, ammanToday, addDays } from '../services/fnb-ledger.service.js';

const router = Router();
const guard = [authenticate, authorize('admin', 'manager')];
const ymd = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;

// ── GET /?from=&to= — كلّ الأماكن (افتراضاً آخر 30 يوماً بتواريخ عمّان) ──
router.get('/', ...guard, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const to = ymd(req.query.to) || ammanToday();
  const from = ymd(req.query.from) || addDays(to, -29);
  try {
    res.json({ success: true, ...(await settlementsOverview(db, from, to)) });
  } catch (err: any) {
    console.error('❌ venue settlements:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /handovers/:id/confirm | reject — قرار الإدارة في تصريح المكان ──
for (const action of ['confirm', 'reject'] as const) {
  router.post(`/handovers/:id/${action}`, ...guard, async (req: Request, res: Response) => {
    const db = getDB();
    if (!db) return res.status(503).json({ error: 'DB unavailable' });
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'معرّف غير صالح' });
    try {
      const [h] = await db.update(venueHandovers).set({
        status: action === 'confirm' ? 'confirmed' : 'rejected',
        resolvedBy: req.user!.id, resolvedAt: new Date(),
      } as any).where(and(eq(venueHandovers.id, id), eq(venueHandovers.status, 'pending'))).returning();
      if (!h) return res.status(409).json({ error: 'التسليم حُسم مسبقاً أو غير موجود' });
      res.json({ success: true, handover: h });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
}

// ── POST /handovers — استلامٌ مباشر تسجّله الإدارة (مؤكَّدٌ فوراً) ──
router.post('/handovers', ...guard, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });
  const locationId = parseInt(String(req.body?.locationId || ''));
  const amount = Math.round(parseFloat(String(req.body?.amount ?? '')) * 100) / 100;
  const note = String(req.body?.note || '').trim().slice(0, 300);
  if (!Number.isFinite(locationId)) return res.status(400).json({ error: 'حدّد المكان' });
  if (!(amount > 0)) return res.status(400).json({ error: 'اكتب مبلغاً أكبر من صفر' });
  try {
    const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)).limit(1);
    if (!loc) return res.status(404).json({ error: 'المكان غير موجود' });
    const acc = await clubAccount(db, locationId);
    if (amount > acc.heldForAdmin + 0.004) {
      return res.status(400).json({ error: `أكبر من الباقي عنده (${acc.heldForAdmin.toFixed(2)})` });
    }
    const [h] = await db.insert(venueHandovers).values({
      locationId, amount: amount.toFixed(2), toLabel: req.user?.displayName || req.user?.username || 'الإدارة',
      note, status: 'confirmed', declaredBy: null, resolvedBy: req.user!.id, resolvedAt: new Date(),
    } as any).returning();
    res.json({ success: true, handover: h });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
