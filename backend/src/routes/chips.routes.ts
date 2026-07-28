// ══════════════════════════════════════════════════════
// 🪙 مسارات التشبس — Chips Routes
//   /api/chips/admin/*  → إدارة (adminOnly — قرار مقفل: الشحن للأدمن حصراً)
//   /api/chips/me*      → اللاعب (authenticatePlayer)
//
// 🔒 الرصيد لا يظهر أبداً في مسار عام (البروفايل العام غير مصادق).
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { CHIPS_PACKS } from '../schemas/chips.schema.js';
import {
  adminTopup, adminAdjust, getChipsBalance, getPlayerLedger,
  getAdminLedger, getPlayerBalances, getChipsStats, auditChipsBalances,
} from '../services/chips.service.js';
import { logStaffAction } from '../services/staff-action-log.service.js';

const router = Router();

// ══════════════════════════════════════════════════════
// 👤 مسارات اللاعب
// ══════════════════════════════════════════════════════

// ── رصيدي ──
router.get('/me', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const playerId = req.playerAccount!.playerId;
    const balance = await getChipsBalance(playerId);
    res.json({ success: true, balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── حركاتي ──
router.get('/me/ledger', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const playerId = req.playerAccount!.playerId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const rows = await getPlayerLedger(playerId, limit);
    res.json({ success: true, ledger: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── الباقات المعروضة (للاعب: معرفة أسعار الشحن من الإدارة) ──
router.get('/packs', authenticatePlayer, (_req: Request, res: Response) => {
  res.json({ success: true, packs: CHIPS_PACKS });
});

// ══════════════════════════════════════════════════════
// 🛡️ مسارات الإدارة — adminOnly
// ══════════════════════════════════════════════════════

router.use('/admin', authenticate, adminOnly);

// ── الباقات المعتمدة ──
router.get('/admin/packs', (_req: Request, res: Response) => {
  res.json({ success: true, packs: CHIPS_PACKS });
});

// ── شحن بباقة معتمدة ──
router.post('/admin/topup',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'chips-topup' }),
  async (req: Request, res: Response) => {
    try {
      const playerId = parseInt(req.body.playerId);
      const packId = String(req.body.packId || '');
      const note = req.body.note ? String(req.body.note).slice(0, 300) : null;
      const requestId = req.body.requestId ? String(req.body.requestId) : null;

      if (!playerId || isNaN(playerId)) return res.status(400).json({ error: 'معرّف اللاعب مطلوب' });

      const result = await adminTopup({
        playerId, packId, note, requestId,
        staffId: (req as any).user?.id ?? null,
      });

      if (!result.ok) {
        const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'INVALID' ? 400 : 500;
        return res.status(status).json({ error: result.message });
      }

      // 📋 سجل عمليات الموظفين — الشحن حركة مالية تُوثَّق دائماً
      if (!result.duplicate) {
        logStaffAction({
          staffId: (req as any).user?.id,
          staffUsername: (req as any).user?.username,
          staffRole: (req as any).user?.role,
          source: 'http',
          action: 'chips:topup',
          outcome: 'success',
          details: { playerId, packId, chips: result.pack?.chips, jod: result.pack?.jod, note },
        });
      }

      res.json({ success: true, balance: result.balance, duplicate: result.duplicate, pack: result.pack });
    } catch (err: any) {
      console.error('❌ chips topup:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// ── تصحيح يدوي (موجب/سالب، الملاحظة إلزامية) ──
router.post('/admin/adjust',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'chips-adjust' }),
  async (req: Request, res: Response) => {
    try {
      const playerId = parseInt(req.body.playerId);
      const amount = parseInt(req.body.amount);
      const note = String(req.body.note || '');
      const requestId = req.body.requestId ? String(req.body.requestId) : null;

      if (!playerId || isNaN(playerId)) return res.status(400).json({ error: 'معرّف اللاعب مطلوب' });
      if (!amount || isNaN(amount)) return res.status(400).json({ error: 'قيمة التعديل مطلوبة (موجبة أو سالبة)' });

      const result = await adminAdjust({
        playerId, amount, note, requestId,
        staffId: (req as any).user?.id ?? null,
      });

      if (!result.ok) {
        const status = result.code === 'NOT_FOUND' ? 404
          : result.code === 'INVALID' ? 400
          : result.code === 'INSUFFICIENT' ? 409 : 500;
        return res.status(status).json({ error: result.message, balance: result.balance });
      }

      if (!result.duplicate) {
        logStaffAction({
          staffId: (req as any).user?.id,
          staffUsername: (req as any).user?.username,
          staffRole: (req as any).user?.role,
          source: 'http',
          action: 'chips:adjust',
          outcome: 'success',
          details: { playerId, amount, note },
        });
      }

      res.json({ success: true, balance: result.balance, duplicate: result.duplicate });
    } catch (err: any) {
      console.error('❌ chips adjust:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// ── أرصدة اللاعبين (بحث) ──
router.get('/admin/balances', async (req: Request, res: Response) => {
  try {
    const rows = await getPlayerBalances({
      search: req.query.search as string,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json({ success: true, players: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── الدفتر الكامل بفلاتر ──
router.get('/admin/ledger', async (req: Request, res: Response) => {
  try {
    const { rows, total } = await getAdminLedger({
      playerId: req.query.playerId ? parseInt(req.query.playerId as string) : undefined,
      reason: req.query.reason as string,
      from: req.query.from as string,
      to: req.query.to as string,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json({ success: true, ledger: rows, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── إحصاءات الاقتصاد ──
router.get('/admin/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getChipsStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── تدقيق: الكاش مقابل الدفتر (fix=1 لإعادة الاشتقاق) ──
router.get('/admin/audit', async (req: Request, res: Response) => {
  try {
    const fix = req.query.fix === '1' || req.query.fix === 'true';
    const result = await auditChipsBalances(fix);
    if (fix && result.fixed > 0) {
      logStaffAction({
        staffId: (req as any).user?.id,
        staffUsername: (req as any).user?.username,
        staffRole: (req as any).user?.role,
        source: 'http',
        action: 'chips:audit-fix',
        outcome: 'success',
        details: { fixed: result.fixed, drifted: result.drifted.slice(0, 20) },
      });
    }
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
