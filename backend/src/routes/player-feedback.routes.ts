// ══════════════════════════════════════════════════════
// 📋 مسارات فيد باك اللاعب — Player Feedback Routes
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import {
  FEEDBACK_QUESTIONS, FEEDBACK_KEYS,
  getPendingMatches, getMatchContext, hasParticipated, submitFeedback,
} from '../services/feedback.service.js';

const router = Router();

function extractPlayerId(req: Request): number | null {
  return (req as any).playerAccount?.playerId || null;
}

// ── GET /pending — قائمة الاستبيانات المعلّقة (للطابور) ──
router.get('/pending', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });
  const pending = await getPendingMatches(playerId);
  res.json({ success: true, count: pending.length, pending });
});

// ── GET /:matchId — سياق غرفة + الأسئلة (يتحقق من المشاركة وحالة التعبئة) ──
router.get('/:matchId', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });
  const matchId = parseInt(req.params.matchId);
  if (!matchId) return res.status(400).json({ error: 'matchId غير صالح' });

  if (!(await hasParticipated(matchId, playerId))) {
    return res.status(403).json({ error: 'لم تشارك في هذه الغرفة' });
  }
  const ctx = await getMatchContext(matchId);
  if (!ctx) return res.status(404).json({ error: 'الغرفة غير موجودة' });

  const pending = await getPendingMatches(playerId);
  const stillPending = pending.some(p => p.matchId === matchId);

  res.json({
    success: true,
    questions: FEEDBACK_QUESTIONS,
    alreadyDone: !stillPending,
    context: {
      matchId,
      gameName: ctx.gameName,
      roomCode: ctx.roomCode,
      activityName: ctx.activityName,
      locationName: ctx.locationName,
      playedAt: ctx.endedAt,
      activityDate: ctx.activityDate,
    },
  });
});

// ── POST /:matchId — إرسال الاستجابة ──
router.post('/:matchId', authenticatePlayer, async (req: Request, res: Response) => {
  const playerId = extractPlayerId(req);
  if (!playerId) return res.status(401).json({ error: 'غير مصادق' });
  const matchId = parseInt(req.params.matchId);
  if (!matchId) return res.status(400).json({ error: 'matchId غير صالح' });

  const { answers, notes } = req.body || {};
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'الإجابات مطلوبة' });
  }

  // تحقّق: كل سؤال إلزامي بقيمة صحيحة 1..5
  const clean: Record<string, number> = {};
  for (const key of FEEDBACK_KEYS) {
    const v = Number(answers[key]);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return res.status(400).json({ error: `إجابة غير صالحة أو ناقصة: ${key}` });
    }
    clean[key] = v;
  }

  const result = await submitFeedback(matchId, playerId, clean, typeof notes === 'string' ? notes : undefined);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

export default router;
