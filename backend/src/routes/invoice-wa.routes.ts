// ══════════════════════════════════════════════════════
// 🧾 مفتاح فواتير واتساب — /api/admin/invoice-wa (2026-10-30)
// بطاقة في رئيسيّة الداشبورد: تشغيل/إطفاء إرسال الفواتير والأختام وتحويل الحوالات
// دفعةً واحدة لكلّ الأماكن، مع حالة القناتين وعدّاد الليلة. القراءة للإدارة والمدير، والتبديل للأدمن.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { invoiceWaStatus, setInvoiceWaEnabled } from '../services/invoice-wa.service.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'manager'), async (_req: Request, res: Response) => {
  try { res.json({ success: true, ...(await invoiceWaStatus()) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled مطلوب (true/false)' });
  try {
    await setInvoiceWaEnabled(req.body.enabled, req.user?.displayName || req.user?.username || '');
    res.json({ success: true, ...(await invoiceWaStatus()) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
