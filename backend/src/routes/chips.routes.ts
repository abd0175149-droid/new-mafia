// ══════════════════════════════════════════════════════
// 🪙 مسارات التشبس — Chips Routes
//   /api/chips/admin/*  → إدارة (adminOnly — قرار مقفل: الشحن للأدمن حصراً)
//   /api/chips/me*      → اللاعب (authenticatePlayer)
//
// 🔒 الرصيد لا يظهر أبداً في مسار عام (البروفايل العام غير مصادق).
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { authenticate, adminOnly, leaderOrAbove } from '../middleware/auth.js';
import { authenticatePlayer } from '../middleware/player-auth.middleware.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { CHIPS_PACKS } from '../schemas/chips.schema.js';
import {
  adminTopup, adminAdjust, getChipsBalance, getPlayerLedger,
  getAdminLedger, getPlayerBalances, getChipsStats, auditChipsBalances,
  getPlayerWalletSummary,
} from '../services/chips.service.js';
import { logStaffAction } from '../services/staff-action-log.service.js';
import {
  getRewardsConfig, saveRewardsConfig, previewTop3, grantTop3,
  getTodaysBirthdays, runBirthdayGifts, jordanToday,
  getBirthdaysForRoom, emitBirthdayCelebration, clearBirthdayCelebration, BIRTHDAY_SONG_KEY,
} from '../services/chips-rewards.service.js';
import { isSoundKeyAvailable } from '../services/chips-store.service.js';

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

// ── محفظتي: الرصيد + الملخّص + آخر الحركات في نداء واحد ──
router.get('/me/wallet', authenticatePlayer, async (req: Request, res: Response) => {
  try {
    const playerId = req.playerAccount!.playerId;
    const limit = Math.min(parseInt(req.query.limit as string) || 60, 200);
    const [summary, ledger] = await Promise.all([
      getPlayerWalletSummary(playerId),
      getPlayerLedger(playerId, limit),
    ]);
    res.json({ success: true, ...summary, ledger });
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

// ══════════════════════════════════════════════════════
// 🎁 المكافآت: أفضل ثلاثة + عيديّة الميلاد
// ══════════════════════════════════════════════════════

// ── إعدادات المكافآت ──
router.get('/admin/rewards/config', async (_req: Request, res: Response) => {
  try {
    const config = await getRewardsConfig();
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/rewards/config', async (req: Request, res: Response) => {
  try {
    const config = await saveRewardsConfig(req.body || {});
    logStaffAction({
      staffId: (req as any).user?.id,
      staffUsername: (req as any).user?.username,
      staffRole: (req as any).user?.role,
      source: 'http',
      action: 'chips:rewards-config',
      outcome: 'success',
      details: config,
    });
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── معاينة أفضل ثلاثة (من يستلم قبل الضغط) ──
router.get('/admin/rewards/top3', async (req: Request, res: Response) => {
  try {
    const seasonId = req.query.seasonId ? parseInt(req.query.seasonId as string) : null;
    const data = await previewTop3(seasonId);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── منح أفضل ثلاثة ──
router.post('/admin/rewards/top3',
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'chips-top3' }),
  async (req: Request, res: Response) => {
    try {
      const amounts = Array.isArray(req.body.amounts) ? req.body.amounts.map((n: any) => Number(n)) : undefined;
      // ♻️ المنح المتعمّد مرة أخرى مسموح بقرار المالك، لكن بطلب صريح من الواجهة
      //    بعد تأكيد مكتوب — لا يمكن أن يقع بنقرة زائدة.
      const allowRepeat = req.body.allowRepeat === true;
      const result = await grantTop3({
        seasonId: req.body.seasonId ? parseInt(req.body.seasonId) : null,
        amounts,
        note: req.body.note ? String(req.body.note).slice(0, 300) : null,
        requestId: req.body.requestId ? String(req.body.requestId) : null,
        staffId: (req as any).user?.id ?? null,
        allowRepeat,
      });
      if (!result.ok) {
        return res.status((result as any).code === 'ALREADY_GRANTED' ? 409 : 400)
          .json({ error: result.error, code: (result as any).code ?? null });
      }

      logStaffAction({
        staffId: (req as any).user?.id,
        staffUsername: (req as any).user?.username,
        staffRole: (req as any).user?.role,
        source: 'http',
        action: 'chips:grant-top3',
        outcome: 'success',
        details: { season: result.season?.name, results: result.results, totalGranted: result.totalGranted, allowRepeat },
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('❌ grant top3:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// ── أعياد ميلاد اليوم ──
router.get('/admin/rewards/birthdays', async (_req: Request, res: Response) => {
  try {
    const [list, config] = await Promise.all([getTodaysBirthdays(true), getRewardsConfig()]);
    res.json({ success: true, today: jordanToday().iso, birthdays: list, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── تشغيل عيديّات اليوم يدوياً (أو للاعب محدّد) ──
router.post('/admin/rewards/birthdays/run',
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'chips-bday' }),
  async (req: Request, res: Response) => {
    try {
      const onlyPlayerId = req.body.playerId ? parseInt(req.body.playerId) : undefined;
      const result = await runBirthdayGifts({
        force: true,
        onlyPlayerId,
        staffId: (req as any).user?.id ?? null,
      });
      const fresh = (result.granted || []).filter((g: any) => !g.duplicate);
      if (fresh.length) {
        logStaffAction({
          staffId: (req as any).user?.id,
          staffUsername: (req as any).user?.username,
          staffRole: (req as any).user?.role,
          source: 'http',
          action: 'chips:grant-birthday',
          outcome: 'success',
          details: { granted: fresh },
        });
      }
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

// ══════════════════════════════════════════════════════
// 🎂 واجهة القائد — أعياد ميلاد اليوم + المنح + الاحتفالية
// (خارج حارس /admin — القائد يحتاجها في الصالة)
// ══════════════════════════════════════════════════════

// ── من عيد ميلاده اليوم؟ (الحاضرون في الغرفة أولاً) ──
router.get('/leader/birthdays', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  try {
    const roomId = (req.query.roomId as string) || null;
    const [list, config, songReady] = await Promise.all([
      getBirthdaysForRoom(roomId),
      getRewardsConfig(),
      isSoundKeyAvailable(BIRTHDAY_SONG_KEY),
    ]);
    res.json({
      success: true,
      today: jordanToday().iso,
      birthdays: list,
      amount: config.birthday.amount,
      songReady,          // هل أغنية عيد الميلاد مرفوعة فعلاً؟
      songKey: BIRTHDAY_SONG_KEY,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── منح العيديّة + إطلاق الاحتفالية على الشاشة ──
router.post('/leader/birthdays/celebrate', authenticate, leaderOrAbove,
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'chips-bday-leader' }),
  async (req: Request, res: Response) => {
    try {
      const roomId = String(req.body.roomId || '');
      const grant = req.body.grant !== false;              // المنح افتراضي
      const playerIds: number[] = Array.isArray(req.body.playerIds)
        ? req.body.playerIds.map((n: any) => parseInt(n)).filter(Boolean) : [];

      const all = await getBirthdaysForRoom(roomId || null);
      const chosen = playerIds.length ? all.filter(b => playerIds.includes(b.playerId)) : all;
      if (chosen.length === 0) return res.status(400).json({ error: 'لا أحد لعيد ميلاده اليوم' });

      // 1) المنح (محروس بمفتاح سنوي — لا يمنح مرتين ولو ضغط القائد مراراً)
      //
      // ⚠️ يُقصر المنح على المختارين **دائماً**، لا حين يكون واحداً فقط.
      //    كان القيد يسقط عند اختيار اثنين أو أكثر فيُمنح كل من عيد ميلاده
      //    اليوم في النادي كله — بمن فيهم الغائبون والحسابات الاختبارية.
      //
      // ⚠️ وأُزيل `force: true`: كان يتجاوز مفتاح الإيقاف الذي يملكه الأدمن،
      //    فيبقى الإصدار جارياً بعد قرار النادي إيقافه. الآن يُحترم المفتاح،
      //    ويُبلَّغ القائد بوضوح بدل أن يظنّ أن الهدايا وصلت.
      let granted: any[] = [];
      let giftSkipped: string | null = null;
      if (grant) {
        const r = await runBirthdayGifts({
          staffId: (req as any).user?.id ?? null,
          onlyPlayerIds: chosen.map(b => b.playerId),
        });
        granted = r.granted || [];
        giftSkipped = (r as any).skipped ?? null;
      }

      // 2) الاحتفالية على شاشة الغرفة
      let celebrated = false;
      if (roomId) {
        celebrated = emitBirthdayCelebration(roomId, chosen.map(b => ({
          playerId: b.playerId,
          name: b.name,
          avatarUrl: b.avatarUrl,
          physicalId: (b as any).physicalId ?? null,
        })));
      }

      logStaffAction({
        staffId: (req as any).user?.id,
        staffUsername: (req as any).user?.username,
        staffRole: (req as any).user?.role,
        source: 'http',
        roomId: roomId || null,
        action: 'chips:birthday-celebrate',
        outcome: 'success',
        details: {
          names: chosen.map(c => c.name),
          granted: granted.filter((g: any) => !g.duplicate).length,
          celebrated,
          ...(giftSkipped ? { giftSkipped } : {}),
        },
      });

      res.json({
        success: true, celebrated, granted, celebrants: chosen,
        // يُخبر واجهة القائد لماذا لم تُمنح هديّة (إيقاف من الإدارة أو قيمة صفر)
        giftSkipped,
        giftSkippedReason: giftSkipped === 'disabled' ? 'عيديّة الميلاد موقوفة من لوحة الإدارة'
          : giftSkipped === 'zero-amount' ? 'قيمة العيديّة مضبوطة على صفر'
          : null,
      });
    } catch (err: any) {
      console.error('❌ birthday celebrate:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// ── إنهاء الاحتفالية ──
router.post('/leader/birthdays/clear', authenticate, leaderOrAbove, async (req: Request, res: Response) => {
  try {
    const roomId = String(req.body.roomId || '');
    if (roomId) clearBirthdayCelebration(roomId);
    res.json({ success: true });
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
