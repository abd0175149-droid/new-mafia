// ══════════════════════════════════════════════════════
// 🏆 مسارات إعدادات التقدم — Progression Settings Routes
// تحكم بقيم XP/RR/Rank لكل أكشن + تعديل يدوي للنقاط
// ══════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express';
import { eq, sql, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { progressionConfig } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { matchPlayers, matches } from '../schemas/game.schema.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// ── القيم الافتراضية ──────────────────────────────
const DEFAULT_CONFIG = {
  xp: {
    participation: 20,
    teamWin: 50,
    survivalPerRound: 5,
    abilityCorrect: 10,
    abilityIncorrect: -5,
    citizenDealOnMafia: 50,
    failedDeal: -10,
    mafiaDealOnMafia: -10,
    confrontationOnMafia: 25,         // ⚔️ مواجهة كشفت مافيا (نصف الديل)
    failedConfrontation: -5,          // ⚔️ مواجهة قادت القاعة إلى مواطن
    mafiaConfrontationOnMafia: 0,     // ⚔️ مافيا واجه زميله (XP صفر؛ العقوبة في RR)
    pulseWin: 10,                     // 🗳️ إقناع القاعة (فوز بنبض المواجهة بنصاب)
    pulseVindicated: 10,              // 🗳️ القاعة مع الحقيقة
    pulseCorrectVote: 3,              // 🗳️ حدسٌ صائب لكلّ مصوّت (سقف ٣ في المباراة)
    teamEliminationBonus: 15,
    jesterWin: 50,
    jesterLoss: 0,
    assassinWin: 80,               // 🔪 فوز السفّاح (أكمل كل العقود)
    assassinLoss: 10,              // 🔪 خسارة (مات/انتهت اللعبة)
    assassinContractComplete: 15,  // 🔪 لكل عقد مُنجز
  },
  rr: {
    teamWin: 20,
    teamLoss: -20,
    citizenDealOnMafia: 20,
    failedDeal: -30,
    mafiaDealOnMafia: -30,
    confrontationOnMafia: 10,         // ⚔️ نصف الديل
    failedConfrontation: -15,         // ⚔️ نصف الديل
    mafiaConfrontationOnMafia: -15,   // ⚔️ غدر بالفريق (مواجهة مافيا على مافيا)
    pulseVindicated: 5,               // 🗳️ الرتبة تُربط بالحقيقة وحدها: ربح النبض وكان محقّاً
    survivedToEnd: 5,
    abilityCorrect: 5,
    abilityIncorrect: -5,
    penaltyDeduction: -10,
    penaltyKickDeduction: -30,
    bombHitCitizen: 10,
    bombHitMafia: -10,
    jesterWin: 30,
    jesterLoss: -10,
    assassinWin: 30,               // 🔪
    assassinLoss: -15,             // 🔪
    assassinContractComplete: 10,  // 🔪
  },
  ranks: {
    INFORMANT: { rrRequired: 100 },
    SOLDIER: { rrRequired: 200 },
    CAPO: { rrRequired: 300 },
    UNDERBOSS: { rrRequired: 400 },
    GODFATHER: { rrRequired: 9999 },
  },
  // 🎭 نقاط قدرة لكل دور (تحكّم دقيق): صحيحة/خاطئة × XP/RR.
  // إن لم يُحدَّد دور هنا → يسقط على القيم العامة abilityCorrect/abilityIncorrect.
  // القيم الافتراضية مطابقة للعام (لا تغيّر سلوكاً حتى يعدّلها الليدر).
  roleAbilities: {
    SNIPER:      { correctXp: 10, correctRr: 5, wrongXp: -5, wrongRr: -5 }, // أصاب مافيا/محايد ✓ — أصاب مواطن ✗
    // 🕵️ قرار 2026-08-11: سؤال الشريف عن مواطنٍ صالح **حياد** — لا خصم ولا كسب.
    //    التحقيق استبعادٌ مشروع لا خطأٌ يُعاقَب؛ المكافأة لإصابة مافيا فعليّة وحدها.
    SHERIFF:     { correctXp: 10, correctRr: 5, wrongXp: 0, wrongRr: 0 },
    DOCTOR:      { correctXp: 10, correctRr: 5, wrongXp: -5, wrongRr: -5 }, // حماية أبطلت اغتيالاً ✓
    NURSE:       { correctXp: 10, correctRr: 5, wrongXp: -5, wrongRr: -5 },
    POLICEWOMAN: { correctXp: 10, correctRr: 5, wrongXp: -5, wrongRr: -5 }, // إعدام مافيا ✓
    GODFATHER:   { correctXp: 10, correctRr: 5, wrongXp: -5, wrongRr: -5 }, // اغتيال نجح ✓ — أُبطل بالحماية ✗
    SILENCER:    { correctXp: 10, correctRr: 5, wrongXp: -5, wrongRr: -5 }, // أسكت غير مافيا (مفيد) ✓
    WITCH:       { correctXp: 10, correctRr: 5, wrongXp: -5, wrongRr: -5 }, // عطّل دوراً صاحب قدرة ✓
  },
  level: {
    baseXP: 500,
    exponent: 1.2,
  },
  demotionReturnPercent: 80,
};

// ── Cache للأداء ──
let configCache: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 دقيقة

// ── دمج إعدادات مخزّنة/واردة مع الافتراضيات (مصدر واحد للدمج — يستعمله getConfig وPUT) ──
// يضمن أن أي مفتاح ناقص يسقط على قيمته الافتراضية بدل أن يختفي من الحساب أو العرض.
function mergeWithDefaults(dbConfig: any) {
  if (!dbConfig) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...dbConfig,
    xp: { ...DEFAULT_CONFIG.xp, ...(dbConfig.xp || {}) },
    rr: { ...DEFAULT_CONFIG.rr, ...(dbConfig.rr || {}) },
    ranks: { ...DEFAULT_CONFIG.ranks, ...(dbConfig.ranks || {}) },
    level: { ...DEFAULT_CONFIG.level, ...(dbConfig.level || {}) },
    roleAbilities: { ...DEFAULT_CONFIG.roleAbilities, ...(dbConfig.roleAbilities || {}) },
  };
}

async function getConfig() {
  if (configCache && Date.now() - cacheTimestamp < CACHE_TTL) return configCache;

  const db = getDB();
  if (!db) return DEFAULT_CONFIG;

  const rows = await db.select().from(progressionConfig);

  if (rows.length === 0) {
    // seed default
    await db.insert(progressionConfig).values({
      key: 'progression',
      value: DEFAULT_CONFIG,
    } as any).onConflictDoNothing();
    configCache = DEFAULT_CONFIG;
    cacheTimestamp = Date.now();
    return DEFAULT_CONFIG;
  }

  const row = rows.find(r => r.key === 'progression');
  configCache = mergeWithDefaults(row?.value as any);
  cacheTimestamp = Date.now();
  return configCache;
}

// ── GET /api/progression-settings (Admin) ──────────
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const config = await getConfig();
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/progression-settings/public (للاعبين) ──
router.get('/public', async (_req: Request, res: Response) => {
  try {
    const config = await getConfig();
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/progression-settings (Admin) ──────────
router.put('/', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    const newConfig = req.body.config;
    if (!newConfig) return res.status(400).json({ error: 'config is required' });

    // 🧩 دمج مع الافتراضيات قبل التخزين والكيّش — إعداد ناقص لا يُسقط مفاتيح من الحساب/العرض
    const merged = mergeWithDefaults(newConfig);

    const existing = await db.select().from(progressionConfig).where(eq(progressionConfig.key, 'progression')).limit(1);

    if (existing.length === 0) {
      await db.insert(progressionConfig).values({
        key: 'progression',
        value: merged,
      } as any);
    } else {
      await db.update(progressionConfig)
        .set({ value: merged, updatedAt: new Date() } as any)
        .where(eq(progressionConfig.key, 'progression'));
    }

    // تحديث الكاش بالنسخة المدموجة
    configCache = merged;
    cacheTimestamp = Date.now();

    // ⚡ تطبيق فوري على معاملات الحساب في الذاكرة (عتبات الرتب + معادلة المستوى + نسبة التنزيل)
    // كي تعكس عتبات البروفايل (rrRequired/nextLevelXP) التعديل فوراً — لا انتظار لنهاية مباراة.
    try {
      const { applyProgressionConfig } = await import('../services/progression.service.js');
      applyProgressionConfig(merged);
    } catch { /* غير حاجب — سيُطبَّق عند أول احتساب */ }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/progression-settings/player/:playerId/matches ──
// جلب مباريات لاعب معين مع تفاصيل النقاط
router.get('/player/:playerId/matches', authenticate, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    const playerId = Number(req.params.playerId);

    const playerData = await db.select({ id: players.id, name: players.name, phone: players.phone, xp: players.xp, level: players.level, rankTier: players.rankTier, rankRR: players.rankRR })
      .from(players).where(eq(players.id, playerId)).limit(1);

    if (playerData.length === 0) return res.status(404).json({ error: 'Player not found' });

    const matchHistory = await db.select({
      mpId: matchPlayers.id,
      matchId: matchPlayers.matchId,
      role: matchPlayers.role,
      survivedToEnd: matchPlayers.survivedToEnd,
      roundsSurvived: matchPlayers.roundsSurvived,
      dealInitiated: matchPlayers.dealInitiated,
      dealSuccess: matchPlayers.dealSuccess,
      abilityUsed: matchPlayers.abilityUsed,
      abilityCorrect: matchPlayers.abilityCorrect,
      xpEarned: matchPlayers.xpEarned,
      rrChange: matchPlayers.rrChange,
      // 🧾 القيم المخزّنة الفعلية — لعرض البنود الحقيقية بدل التقدير من الإعدادات الحالية
      rewardBreakdown: matchPlayers.rewardBreakdown,
      penaltyRRDeduction: matchPlayers.penaltyRRDeduction,
      bombRRChange: matchPlayers.bombRRChange,
      penaltyCount: matchPlayers.penaltyCount,
      matchWinner: matches.winner,
      matchDate: matches.createdAt,
      matchRoomCode: matches.roomCode,
      matchPlayerCount: matches.playerCount,
      matchTotalRounds: matches.totalRounds,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .where(eq(matchPlayers.playerId, playerId))
    .orderBy(desc(matches.createdAt))
    .limit(50);

    // 🧾 البنود الفعلية المخزّنة (نفس ما يعرضه مودال ملخص الليدر) — بدل التقدير من الإعدادات الحالية
    const cfg = await getConfig();
    const { buildDisplayBreakdown } = await import('../services/progression.service.js');
    const withBreakdown = matchHistory.map((m: any) => ({ ...m, breakdown: buildDisplayBreakdown(m, cfg) }));

    res.json({ success: true, player: playerData[0], matches: withBreakdown });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/progression-settings/player/:playerId/adjust ──
// تعديل نقاط لاعب في مباراة معينة يدوياً
router.post('/player/:playerId/adjust', authenticate, adminOnly, async (req: Request, res: Response) => {
  const db = getDB();
  if (!db) return res.status(503).json({ error: 'DB unavailable' });

  try {
    const playerId = Number(req.params.playerId);
    const { matchPlayerId, xpDelta, rrDelta, reason, breakdown, penaltyRRDeduction, bombRRChange } = req.body;

    if (xpDelta === undefined && rrDelta === undefined) {
      return res.status(400).json({ error: 'xpDelta or rrDelta required' });
    }

    // تحديث match_players
    if (matchPlayerId) {
      const currentMP = await db.select({ xpEarned: matchPlayers.xpEarned, rrChange: matchPlayers.rrChange })
        .from(matchPlayers).where(eq(matchPlayers.id, matchPlayerId)).limit(1);

      if (currentMP.length > 0) {
        const updates: any = {};
        if (xpDelta !== undefined) updates.xpEarned = (currentMP[0].xpEarned || 0) + xpDelta;
        if (rrDelta !== undefined) updates.rrChange = (currentMP[0].rrChange || 0) + rrDelta;
        // 🧾 حفظ البنود المُعدّلة كي تُعرض القيم الفعلية عند إعادة الفتح (بدل التقدير)
        if (breakdown !== undefined) updates.rewardBreakdown = breakdown;
        if (penaltyRRDeduction !== undefined) updates.penaltyRRDeduction = penaltyRRDeduction;
        if (bombRRChange !== undefined) updates.bombRRChange = bombRRChange;
        if (Object.keys(updates).length > 0) await db.update(matchPlayers).set(updates).where(eq(matchPlayers.id, matchPlayerId));
      }
    }

    // ── 🏙️ التطبيق عبر مصدر الحقيقة لا عبر players.* مباشرةً ──
    // • مع matchPlayerId: صفّ الدفتر عُدِّل أعلاه → مصالحةٌ مستهدفة في موسم المباراة (ومدينتها المختومة).
    // • بلا matchPlayerId: سطرُ دفترٍ في rank_bonuses بموسمه **ومدينته** (إلزاميّة) ثمّ مصالحة —
    //   الكتابةُ المباشرة على players.* كانت تُمحى في أوّل مصالحةٍ تالية.
    const xpD = Number(xpDelta || 0);
    const rrD = Number(rrDelta || 0);
    if (xpD !== 0 || rrD !== 0) {
      const { reconcileSeasonProgression } = await import('../services/reconcile.service.js');
      let targetSeason: number | null = null;
      if (matchPlayerId) {
        const [m] = await db.select({ seasonId: matches.seasonId }).from(matchPlayers)
          .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
          .where(eq(matchPlayers.id, matchPlayerId)).limit(1);
        targetSeason = m?.seasonId ?? null;
      } else {
        const cityId = Number(req.body?.cityId);
        if (!Number.isFinite(cityId) || cityId <= 0) {
          return res.status(400).json({ error: 'المدينة مطلوبة لتسجيل التعديل في دفتر المكافآت', code: 'CITY_REQUIRED' });
        }
        const { getActiveRegularSeasonId } = await import('../services/season.service.js');
        targetSeason = await getActiveRegularSeasonId();
        if (!targetSeason) return res.status(409).json({ error: 'لا يوجد موسمٌ عاديّ نشط', code: 'NO_ACTIVE_SEASON' });
        const label = `تعديل إداريّ — ${String(reason || '').slice(0, 120) || 'بلا سبب'} — ${Date.now().toString(36)}`;
        await db.execute(sql`
          INSERT INTO rank_bonuses (player_id, rr, xp, reason, season_id, city_id, granted_by, meta)
          VALUES (${playerId}, ${rrD}, ${xpD}, ${label}, ${targetSeason}, ${cityId}, ${(req as any).user?.id ?? null},
                  ${JSON.stringify({ kind: 'manual-adjust', xpDelta: xpD, rrDelta: rrD })}::jsonb)`);
      }
      if (targetSeason) {
        await reconcileSeasonProgression(targetSeason, true, () => {}, { onlyPlayerIds: [playerId] });
      } else {
        console.warn(`⚠️ [adjust] no season for player ${playerId} — ledger updated, standings not reconciled`);
      }
    }

    // جلب البيانات المحدثة (مرآة المدينة الأساسيّة)
    const updated = await db.select({ xp: players.xp, level: players.level, rankTier: players.rankTier, rankRR: players.rankRR })
      .from(players).where(eq(players.id, playerId)).limit(1);

    console.log(`🔧 Admin adjusted player #${playerId}: XP${xpDelta >= 0 ? '+' : ''}${xpDelta || 0}, RR${rrDelta >= 0 ? '+' : ''}${rrDelta || 0} — ${reason || 'no reason'}`);

    // 📋 سجل عمليات الموظفين: تعديل نقاط لاعب يدوياً
    try {
      const { logStaffAction } = await import('../services/staff-action-log.service.js');
      logStaffAction({
        staffId: (req as any).user?.id, staffUsername: (req as any).user?.username, staffRole: (req as any).user?.role,
        source: 'rest', action: 'rest:progression-adjust',
        details: { playerId, matchPlayerId, xpDelta, rrDelta, reason: reason || null },
      });
    } catch { /* غير حاجب */ }

    res.json({ success: true, player: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── دالة مُصدّرة لاستخدامها في progression.service ──
export { getConfig as getProgressionConfig, DEFAULT_CONFIG };

export default router;
