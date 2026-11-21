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

export default router;
