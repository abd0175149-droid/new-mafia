// ══════════════════════════════════════════════════════
// 📋 مسارات فيد باك اللاعب — Player Feedback Routes (على مستوى الغرفة/session)
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import {
  FEEDBACK_QUESTIONS, FEEDBACK_KEYS,
  getPendingSessions, getSessionContext, submitSessionFeedback,
} from '../services/feedback.service.js';

const router = Router();

function extractPlayerId(req: Request): number | null {
  return (req as any).playerAccount?.playerId || null;
}

// ── GET /pending — قائمة الاستبيانات المعلّقة (للطابور) ──
router.get('/pending', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });
  const pending = await getPendingSessions(playerId);
  res.json({ success: true, count: pending.length, pending });
});

// ── GET /:sessionId — سياق غرفة + الأسئلة (يتحقق من وجود استبيان مطلوب) ──
router.get('/:sessionId', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });
  const sessionId = parseInt(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ error: 'sessionId غير صالح' });

  const ctx = await getSessionContext(sessionId, playerId);
  if (!ctx) return res.status(403).json({ error: 'لا يوجد استبيان مطلوب لهذه الغرفة' });

  // الأسئلة صارت بياناتٍ تُحرَّر من اللوحة — و`FEEDBACK_QUESTIONS` شبكةُ أمانٍ
  // إن لم يُبذَر الجدول بعد (أوّل إقلاعٍ بعد النشرة).
  const { listQuestions } = await import('../services/survey.service.js');
  const live = await listQuestions({ channel: 'app', onlyEnabled: true }).catch(() => []);
  const questions = live.length
    ? live.map(q => ({ key: q.key, dimension: '', text: q.text, type: q.type, options: q.options }))
    : FEEDBACK_QUESTIONS;

  res.json({
    success: true,
    questions,
    alreadyDone: !!ctx.submittedAt,
    context: {
      sessionId,
      sessionName: ctx.sessionName,
      sessionCode: ctx.sessionCode,
      activityName: ctx.activityName,
      locationName: ctx.locationName,
      playedAt: ctx.playedAt,
    },
  });
});

// ── POST /:sessionId — إرسال الاستجابة ──
router.post('/:sessionId', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });
  const sessionId = parseInt(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ error: 'sessionId غير صالح' });

  const { answers, notes } = req.body || {};
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'الإجابات مطلوبة' });
  }

  // 🔴 المطلوبُ ما هو معروضٌ فعلاً: كان الحارس يشترط الأحد عشر مفتاحاً كلّها،
  //    فإطفاءُ سؤالٍ من اللوحة كان سيردّ كلّ استجابةٍ بخطأ «إجابة ناقصة».
  const { listQuestions } = await import('../services/survey.service.js');
  const live = await listQuestions({ channel: 'app', onlyEnabled: true }).catch(() => []);
  const asked = live.length ? live.filter(q => q.type !== 'text') : FEEDBACK_KEYS.map(k => ({ key: k } as any));

  const clean: Record<string, number> = {};
  for (const q of asked) {
    const v = Number(answers[q.key]);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return res.status(400).json({ error: `إجابة غير صالحة أو ناقصة: ${q.key}` });
    }
    clean[q.key] = v;
  }

  const result = await submitSessionFeedback(sessionId, playerId, clean, typeof notes === 'string' ? notes : undefined);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

export default router;
