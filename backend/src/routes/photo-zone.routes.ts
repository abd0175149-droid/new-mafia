// ══════════════════════════════════════════════════════
// 📸 مفتاح «زاوية بلا تصوير» — /api/admin/photo-zone (2026-11-01)
// بطاقة في رئيسيّة الداشبورد: تشغيل/إطفاء السؤال عند الدخول وجمع الرافضين في كتلة.
// القراءة للإدارة والمدير، والتبديل للأدمن.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { photoZoneStatus, setPhotoZoneEnabled } from '../services/photo-zone.service.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'manager'), async (_req: Request, res: Response) => {
  try { res.json({ success: true, ...(await photoZoneStatus()) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled مطلوب (true/false)' });
  try {
    await setPhotoZoneEnabled(req.body.enabled, req.user?.displayName || req.user?.username || '');
    res.json({ success: true, ...(await photoZoneStatus()) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
