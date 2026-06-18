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

  res.json({
    success: true,
    questions: FEEDBACK_QUESTIONS,
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

  const clean: Record<string, number> = {};
  for (const key of FEEDBACK_KEYS) {
    const v = Number(answers[key]);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return res.status(400).json({ error: `إجابة غير صالحة أو ناقصة: ${key}` });
    }
    clean[key] = v;
  }

  const result = await submitSessionFeedback(sessionId, playerId, clean, typeof notes === 'string' ? notes : undefined);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

export default router;
