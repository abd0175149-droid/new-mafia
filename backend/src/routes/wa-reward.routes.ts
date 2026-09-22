// ══════════════════════════════════════════════════════
// 🎁 مسارات عروض الحديث مع البوت — /api/whatsapp/rewards
// ══════════════════════════════════════════════════════
// كلّها أدمن فقط. المنحُ نفسه لا مسار له عمداً: لا زرّ في أيّ شاشة يمنح نقطةً
// لشخصٍ بعينه — المنح يقع آليّاً من خطّاف الرسائل الواردة وحده.

import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  getRewardConfig, updateRewardConfig,
  listEvents, getEvent, createEvent, previewEvent, setEventStatus,
  getEventReport, revokeAward, getLiveEvent, sweepReconcile,
  type EventStatus,
} from '../services/wa-reward.service.js';

const router = Router();

const actorOf = (req: Request) => String((req as any).user?.displayName || (req as any).user?.username || 'أدمن');

// ── الإعدادات العامّة (الافتراضيّات والسقوف — تُدار من الشاشة) ──
router.get('/rewards/config', authenticate, adminOnly, async (_req: Request, res: Response) => {
  try { res.json({ success: true, config: await getRewardConfig() }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/rewards/config', authenticate, adminOnly, async (req: Request, res: Response) => {
  try { res.json({ success: true, config: await updateRewardConfig(req.body || {}) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── القائمة + الحدث العامل الآن ──
router.get('/rewards/events', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const { listCities } = await import('../services/cities.service.js');
    const [events, live, config, cities] = await Promise.all([
      listEvents(Number(req.query.limit) || 30),
      getLiveEvent(),
      getRewardConfig(),
      listCities({ activeOnly: true }),
    ]);
    res.json({ success: true, events, live, config, cities: cities.map(c => ({ id: c.id, name: c.name })) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── المعاينة: ما يجب أن يراه المالك قبل الضغط (نفس مصدر حراسة الإنشاء) ──
router.post('/rewards/preview', authenticate, adminOnly, async (req: Request, res: Response) => {
  try { res.json({ success: true, preview: await previewEvent(req.body || {}) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/rewards/events', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const out = await createEvent({ ...(req.body || {}), createdBy: actorOf(req) });
    if (!out.ok) return res.status(400).json(out);
    res.json({ success: true, ...out });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── التحكّم: إيقافٌ مؤقّت · استئناف · إنهاء · إلغاء ──
router.post('/rewards/events/:id/status', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const status = String(req.body?.status || '') as EventStatus;
    if (!['running', 'paused', 'ended', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'حالة غير صالحة' });
    }
    const out = await setEventStatus(parseInt(req.params.id), status, actorOf(req));
    if (!out.ok) return res.status(400).json(out);
    res.json({ success: true, ...out });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── التقرير: المشاركون، الحسابات الجديدة، التحويل خلال ٤٨ ساعة، كلفة النماذج ──
router.get('/rewards/events/:id', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const report = await getEventReport(parseInt(req.params.id));
    if (!report) return res.status(404).json({ error: 'العرض غير موجود' });
    res.json({ success: true, ...report });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── سحبُ منحةٍ خاطئة: حذفٌ من الدفتر ثمّ مصالحة ──
router.post('/rewards/events/:id/revoke', authenticate, adminOnly, async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.body?.playerId);
    if (!playerId) return res.status(400).json({ error: 'playerId مطلوب' });
    const out = await revokeAward(parseInt(req.params.id), playerId);
    if (!out.ok) return res.status(400).json(out);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── مصالحةٌ يدويّة (زرّ «أظهِر النقاط الآن» إن شكّ المالك) ──
router.post('/rewards/events/:id/reconcile', authenticate, adminOnly, async (req: Request, res: Response) => {
  try { res.json({ success: true, players: await sweepReconcile(parseInt(req.params.id)) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── حدثٌ واحد خام (للوحة الحيّة) ──
router.get('/rewards/events/:id/raw', authenticate, adminOnly, async (req: Request, res: Response) => {
  try { res.json({ success: true, event: await getEvent(parseInt(req.params.id)) }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
