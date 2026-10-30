// ══════════════════════════════════════════════════════
// 📋 مفتاح رسالة تثبيت الحجز — /api/admin/res-confirm (2026-10-30)
// بطاقة في رئيسيّة الداشبورد: تشغيل/إطفاء الإرسال التلقائيّ لكلّ الأماكن، مع عدّاد آخر ٢٤ ساعة.
// القراءة للإدارة والمدير، والتبديل للأدمن. (القالب نفسه في /api/reservations/confirm-template)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { resConfirmStatus, setResConfirmEnabled } from '../services/reservation-confirm.service.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'manager'), async (_req: Request, res: Response) => {
  try { res.json({ success: true, ...(await resConfirmStatus()) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled مطلوب (true/false)' });
  try {
    await setResConfirmEnabled(req.body.enabled, req.user?.displayName || req.user?.username || '');
    res.json({ success: true, ...(await resConfirmStatus()) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
