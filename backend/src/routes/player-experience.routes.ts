// ══════════════════════════════════════════════════════
// 🌟 /api/player-experience — صفحةُ «رأيك بتجربتك» عند اللاعب (ويب وفلاتر)
// ══════════════════════════════════════════════════════
import { Router, Request, Response } from 'express';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import * as X from '../services/experience.service.js';

const router = Router();

/** GET /current?c=ID — الحملة (المطلوبة أو أحدثُ مفتوحة) + إجابتي إن وُجدت */
router.get('/current', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const me = Number((req as any).playerAccount?.playerId);
    const id = Number(req.query.c) || null;
    const c = await X.playerCampaign(id);
    if (!c) return res.json({ success: true, campaign: null });
    const mine = await X.myResponse(c.id, me);
    res.json({
      success: true,
      campaign: {
        id: c.id, title: c.title, intro: c.intro, imageUrl: c.imageUrl, status: c.status,
        questions: c.questions.filter(q => q.enabled !== false),
      },
      response: mine,
      textMax: X.EXP_TEXT_MAX,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /:id — إرسال الرأي أو تعديله ما دامت الحملة مفتوحة */
router.post('/:id', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const me = Number((req as any).playerAccount?.playerId);
    const c = await X.getCampaign(parseInt(req.params.id));
    if (!c || c.status === 'draft') return res.status(404).json({ error: 'الاستبيان غير موجود' });
    if (c.status !== 'open') return res.status(409).json({ error: 'انتهى استقبال الآراء — شكراً لك' });
    const v = X.validateAnswers(c.questions, req.body?.answers);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { created } = await X.saveResponse(c, me, v.answers!, String(req.body?.source || 'link'));
    // ⚠️ رأيٌ منخفض أو «موقفٌ ضايقه» — يصل الأدمن فوراً (مرّةً عند أوّل إرسال، لا مع كلّ تعديل)
    try {
      const a = v.answers!;
      const low = Number.isInteger(a.overall) && a.overall <= 2;
      if (created && (low || a.concerns)) {
        const { sendPushToAdmins } = await import('../services/fcm.service.js');
        const who = String((req as any).playerAccount?.name || `#${me}`);
        void sendPushToAdmins(
          low ? `⚠️ تقييمٌ منخفض (${a.overall}/5) — ${who}` : `📝 ملاحظةٌ حسّاسة — ${who}`,
          String(a.concerns || a.improve || '').slice(0, 160) || 'افتح النتائج',
          'experience_alert', { url: `/admin/experience?c=${c.id}` },
        );
      }
    } catch { /* غير حاجب */ }
    res.json({ success: true, created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
