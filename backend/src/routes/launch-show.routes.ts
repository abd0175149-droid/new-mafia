// ══════════════════════════════════════════════════════
// 🎬 عرض ليلة الإطلاق — /api/launch-show
// • العامّ: /state (مقتطعٌ حسب المرحلة) · /poll · /predict · /asset/card/:key (بعد كشفه)
// • الأدمن فقط (حساب لوحة التحكّم): /control/state · /control · /audio/:key
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { publicState, staffState, control, vote, predict, cardAsset, audioFile, normPhone, touch, touchSound } from '../services/launch-show.service.js';

const router = Router();
const noStore = (res: Response) => res.set('Cache-Control', 'no-store, max-age=0');
const fail = (res: Response, e: any) => res.status(e?.status || 500).json({ error: e?.message || 'خطأ' });
const DEVICE = /^[\w-]{8,64}$/;

router.get('/state', async (req: Request, res: Response) => {
  noStore(res);
  touch(String(req.query.r || ''), String(req.query.c || ''));
  try { res.json(await publicState(String(req.query.k || ''))); } catch (e) { fail(res, e); }
});

// قاعةٌ كاملة على شبكة واحدة: حدّ العنوان واسع، والضيق على الجهاز أو الرقم
const voteLimit = rateLimit({ windowMs: 60_000, max: 600, keyPrefix: 'launch-poll', identity: req => String(req.body?.deviceId || ''), identityMax: 12 });
router.post('/poll', voteLimit, async (req: Request, res: Response) => {
  noStore(res);
  const deviceId = String(req.body?.deviceId || '');
  if (!DEVICE.test(deviceId)) return res.status(400).json({ error: 'جهاز غير معروف' });
  try { await vote(deviceId, String(req.body?.choice || '')); res.json({ success: true }); } catch (e) { fail(res, e); }
});

const predictLimit = rateLimit({ windowMs: 60_000, max: 600, keyPrefix: 'launch-predict', identity: req => normPhone(req.body?.phone), identityMax: 8 });
router.post('/predict', predictLimit, async (req: Request, res: Response) => {
  noStore(res);
  try { res.json({ success: true, ...(await predict(req.body || {})) }); } catch (e) { fail(res, e); }
});

router.get('/asset/card/:key', async (req: Request, res: Response) => {
  noStore(res);
  try {
    const p = await cardAsset(String(req.params.key || ''), String(req.query.k || ''));
    if (!p) return res.status(404).end();
    res.sendFile(p);
  } catch { res.status(404).end(); }
});

// ── الطاقم ──
router.get('/control/state', authenticate, adminOnly, async (req: Request, res: Response) => {
  noStore(res);
  if (req.query.r === 'sound') touchSound(String(req.query.p || ''));
  try { res.json(await staffState()); } catch (e) { fail(res, e); }
});
router.post('/control', authenticate, adminOnly, async (req: Request, res: Response) => {
  noStore(res);
  try { res.json(await control(String(req.body?.action || ''), req.body || {})); } catch (e: any) { res.status(400).json({ error: e?.message || 'خطأ' }); }
});
router.get('/audio/:key', authenticate, adminOnly, (req: Request, res: Response) => {
  const p = audioFile(String(req.params.key || ''));
  if (!p) return res.status(404).json({ error: 'المقطع غير موجود' });
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(p);
});

export default router;
