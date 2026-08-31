// ══════════════════════════════════════════════════════
// ⚖️ سجلّ الموافقات — مسار الأدمن
//
// 🔒 adminOnly (قرار المالك): الصفحة تجمع أسماءً وهواتفَ وأعماراً وسجلَّ
//    موافقاتٍ في مكانٍ واحد — أحسُّ تجميعٍ في القاعدة. أضيقُ حارسٍ متاح.
//
// 🔴 قراءةٌ فقط: لا POST ولا PUT هنا عمداً. تغييرُ حالة موافقةٍ من لوحة
//    الإدارة يُفسد قيمةَ السجلّ كدليل — الموافقةُ فعلُ اللاعب لا فعلُ الأدمن.
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { getDB } from '../config/db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { consentRegister } from '../services/consent-register.service.js';

const router = Router();

router.get('/', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'قاعدة البيانات غير متوفرة' });
  try {
    const result = await consentRegister(db, {
      q: req.query.q as string,
      status: req.query.status as string,
      flag: req.query.flag as string,
      platform: req.query.platform as string,
      from: (req.query.from as string) || null,
      to: (req.query.to as string) || null,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('❌ admin/consents:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
