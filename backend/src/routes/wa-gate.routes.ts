// ══════════════════════════════════════════════════════
// 📱 بوّابة رقم الواتساب — /api/admin/wa-gate (2026-10-30)
// بطاقة الداشبورد: المفتاح وصورة الأرقام ومن يحتاج تغيير رقمه. القراءة للإدارة والمدير، والتبديل للأدمن.
// ══════════════════════════════════════════════════════
import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { gateOverview, setWaGateEnabled } from '../services/wa-number-gate.service.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'manager'), async (_req: Request, res: Response) => {
  try { res.json({ success: true, ...(await gateOverview()) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled مطلوب (true/false)' });
  try {
    await setWaGateEnabled(req.body.enabled, req.user?.displayName || req.user?.username || '');
    res.json({ success: true, ...(await gateOverview()) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
