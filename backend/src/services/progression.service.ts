// ══════════════════════════════════════════════════════
// 🏆 خدمة التقدم — Progression Service
// حساب XP + Level + RR + Rank Tier بعد كل مباراة
// ══════════════════════════════════════════════════════

import { eq, sql, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';
import { isMafiaRole } from '../game/roles.js';
import type { GameState } from '../game/state.js';
import { getProgressionConfig, DEFAULT_CONFIG } from '../routes/progression-settings.routes.js';

// ── أسماء الرتب (مستوحاة من عالم المافيا) ──────────
export const RANK_TIERS = ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'GODFATHER'] as const;
export type RankTier = typeof RANK_TIERS[number];

export const RANK_NAMES_AR: Record<RankTier, string> = {
  INFORMANT: 'مُخبر',
  SOLDIER: 'جندي',
  CAPO: 'كابو',
  UNDERBOSS: 'أندربوس',
  GODFATHER: 'الأب الروحي',
};

export const RANK_ORDER: Record<RankTier, number> = {
  INFORMANT: 0, SOLDIER: 1, CAPO: 2, UNDERBOSS: 3, GODFATHER: 4,
};

// ── RR المطلوب للترقية — يُجلب ديناميكياً ──
export let RANK_RR_REQUIRED: Record<RankTier, number> = {
  INFORMANT: 100,
  SOLDIER: 200,
  CAPO: 300,
  UNDERBOSS: 400,
  GODFATHER: 9999,
};

// ── دالة مساعدة: RR المطلوب لرتبة معينة ──
export function rrRequiredForTier(tier: string): number {
  return RANK_RR_REQUIRED[tier as RankTier] || 100;
}

// ── معادلة Level XP ──────────────────────────────────
export function xpForNextLevel(level: number): number {
  return Math.floor(500 * Math.pow(level, 1.2));
}

// ── حساب XP المكتسب من مباراة واحدة (ديناميكي) ────
export function calculateMatchXP(params: {
  participated: boolean;
  teamWon: boolean;
  roundsSurvived: number;
  abilityCorrectCount: number;
  abilityIncorrectCount: number;
  successfulDealsCount: number;
  failedDealsCount: number;
  mafiaDealOnMafiaCount: number;
  teamEliminationBonus: number;
}, cfg?: any): number {
  const c = cfg?.xp || DEFAULT_CONFIG.xp;
  let xp = 0;

  if (params.participated) xp += c.participation;
  if (params.teamWon) xp += c.teamWin;
  xp += params.roundsSurvived * c.survivalPerRound;
  xp += params.abilityCorrectCount * c.abilityCorrect;
  xp += params.abilityIncorrectCount * c.abilityIncorrect;
  xp += params.successfulDealsCount * c.citizenDealOnMafia;
  xp += params.failedDealsCount * c.failedDeal;
  xp += params.mafiaDealOnMafiaCount * (c.mafiaDealOnMafia || c.failedDeal);
  xp += params.teamEliminationBonus;

  return Math.max(0, xp);
}

// ── حساب RR المتغير من مباراة واحدة (ديناميكي) ────
export function calculateMatchRR(params: {
  teamWon: boolean;
  successfulDealsCount: number;
  failedDealsCount: number;
  mafiaDealOnMafiaCount: number;
  survivedToEnd: boolean;
  abilityCorrectCount: number;
  abilityIncorrectCount: number;
}, cfg?: any): number {
  const c = cfg?.rr || DEFAULT_CONFIG.rr;
  let rr = 0;

  rr += params.teamWon ? c.teamWin : c.teamLoss;
  rr += params.successfulDealsCount * c.citizenDealOnMafia;
  rr += params.failedDealsCount * c.failedDeal;
  rr += params.mafiaDealOnMafiaCount * (c.mafiaDealOnMafia || c.failedDeal);
  if (params.survivedToEnd) rr += c.survivedToEnd;
  rr += params.abilityCorrectCount * c.abilityCorrect;
  rr += params.abilityIncorrectCount * c.abilityIncorrect;

  return rr;
}

// ── تطبيق XP مع فحص Level Up ────────────────────────
export async function applyXPAndLevel(playerId: number, xpEarned: number): Promise<{ newXP: number; newLevel: number; leveledUp: boolean }> {
  const db = getDB();
  if (!db) return { newXP: 0, newLevel: 1, leveledUp: false };

  const [player] = await db.select({ xp: players.xp, level: players.level })
    .from(players).where(eq(players.id, playerId)).limit(1);

  if (!player) return { newXP: 0, newLevel: 1, leveledUp: false };

  let currentXP = (player.xp || 0) + xpEarned;
  let currentLevel = player.level || 1;
  let leveledUp = false;

  // فحص Level Up (متكرر في حال فوز ضخم)
  while (currentXP >= xpForNextLevel(currentLevel)) {
    currentXP -= xpForNextLevel(currentLevel);
    currentLevel++;
    leveledUp = true;
  }

  await db.update(players)
    .set({ xp: currentXP, level: currentLevel } as any)
    .where(eq(players.id, playerId));

  return { newXP: currentXP, newLevel: currentLevel, leveledUp };
}

// ── تطبيق RR مع Promotion/Demotion (عتبات متصاعدة) ──
export async function applyRR(playerId: number, rrChange: number): Promise<{ newRR: number; newTier: RankTier; promoted: boolean; demoted: boolean }> {
  const db = getDB();
  if (!db) return { newRR: 0, newTier: 'INFORMANT', promoted: false, demoted: false };

  const [player] = await db.select({ rankRR: players.rankRR, rankTier: players.rankTier })
    .from(players).where(eq(players.id, playerId)).limit(1);

  if (!player) return { newRR: 0, newTier: 'INFORMANT', promoted: false, demoted: false };

  let rr = (player.rankRR || 0) + rrChange;
  let tier = (player.rankTier || 'INFORMANT') as RankTier;
  let tierIdx = RANK_ORDER[tier] ?? 0;
  let promoted = false;
  let demoted = false;

  // ── ترقية (عتبات متصاعدة) ──
  while (tierIdx < RANK_TIERS.length - 1) {
    const required = RANK_RR_REQUIRED[RANK_TIERS[tierIdx]];
    if (rr < required) break;
    rr -= required;
    tierIdx++;
    promoted = true;
  }

  // ── تنزيل ──
  while (rr < 0 && tierIdx > 0) {
    tierIdx--;
    // يرجع بـ 80% من RR الرتبة الأدنى
    rr += Math.floor(RANK_RR_REQUIRED[RANK_TIERS[tierIdx]] * 0.8);
    demoted = true;
  }

  // لا تنزيل تحت INFORMANT
  if (rr < 0) rr = 0;

  // لا تجاوز سقف الرتبة الحالية
  const maxRR = RANK_RR_REQUIRED[RANK_TIERS[tierIdx]];
  if (rr > maxRR) rr = maxRR;

  tier = RANK_TIERS[tierIdx];

  await db.update(players)
    .set({ rankRR: rr, rankTier: tier } as any)
    .where(eq(players.id, playerId));

  return { newRR: rr, newTier: tier, promoted, demoted };
}

// ── معالجة مكافآت المباراة الكاملة ───────────────────
export async function processMatchRewards(state: GameState): Promise<void> {
  const db = getDB();
  if (!db) return;

  // ── 0. تحميل الإعدادات الديناميكية ──
  let cfg: any;
  try { cfg = await getProgressionConfig(); } catch { cfg = DEFAULT_CONFIG; }

  // تحديث RANK_RR_REQUIRED من الإعدادات
  if (cfg.ranks) {
    for (const tier of RANK_TIERS) {
      if (cfg.ranks[tier]?.rrRequired) {
        RANK_RR_REQUIRED[tier] = cfg.ranks[tier].rrRequired;
      }
    }
  }

  // ── 1. فحص هل النشاط في Test Location؟ ──
  if (state.activityId) {
    const activityInfo = await db.select({ isTest: locations.isTestLocation })
      .from(activities)
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(eq(activities.id, state.activityId))
      .limit(1);

    if (activityInfo[0]?.isTest) {
      console.log(`[Progression] Skipping match rewards (XP/RR) because activity #${state.activityId} is at a Test Location.`);
      return;
    }
  }

  const tracking = state.performanceTracking || { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
  const totalRounds = state.round || 1;
  const elimBonus = cfg?.xp?.teamEliminationBonus || 15;

  // ── حساب مكافأة إقصاء الخصم لكل لاعب ──
  const teamElimBonusMap: Record<number, number> = {};
  for (const p of state.players) {
    teamElimBonusMap[p.physicalId] = 0;
  }

  for (const elim of tracking.eliminationLog) {
    for (const p of state.players) {
      if (p.physicalId === elim.physicalId) continue;
      const pIsMafia = isMafiaRole(p.role as any);

      if (elim.team === 'MAFIA' && !pIsMafia) {
        teamElimBonusMap[p.physicalId] = (teamElimBonusMap[p.physicalId] || 0) + elimBonus;
      }
      if (elim.team === 'CITIZEN' && pIsMafia) {
        teamElimBonusMap[p.physicalId] = (teamElimBonusMap[p.physicalId] || 0) + elimBonus;
      }
    }
  }

  // ── معالجة كل لاعب ──
  for (const p of state.players) {
    if (!p.playerId) continue;

    const playerIsMafia = isMafiaRole(p.role as any);
    const isJester = p.role === 'JESTER';

    // 🤡 المهرج: منطق مختلف تماماً عن الفريقين
    if (isJester) {
      const jesterWon = state.winner === 'JESTER';
      const jesterXP = jesterWon ? (cfg?.xp?.jesterWin ?? 50) : (cfg?.xp?.jesterLoss ?? 0);
      const jesterRR = jesterWon ? (cfg?.rr?.jesterWin ?? 30) : (cfg?.rr?.jesterLoss ?? -10);

      try {
        const xpResult = await applyXPAndLevel(p.playerId, Math.max(0, jesterXP));
        const rrResult = await applyRR(p.playerId, jesterRR);

        console.log(`🤡 Jester #${p.physicalId} (${p.name}): ${jesterWon ? 'WON' : 'LOST'} → +${jesterXP} XP, ${jesterRR >= 0 ? '+' : ''}${jesterRR} RR`);

        // تنبيهات
        try {
          const { sendPushToPlayer } = await import('./fcm.service.js');
          if (xpResult.leveledUp) {
            sendPushToPlayer(p.playerId, '🎉 ارتفع مستواك!', `أصبحت الآن Level ${xpResult.newLevel}`, 'level_up', { level: String(xpResult.newLevel) });
          }
          if (rrResult.promoted) {
            sendPushToPlayer(p.playerId, '🏆 ترقية!', `مبروك! أصبحت "${RANK_NAMES_AR[rrResult.newTier]}"`, 'rank_up', { rankTier: rrResult.newTier });
          }
          if (rrResult.demoted) {
            sendPushToPlayer(p.playerId, '⬇️ انخفضت رتبتك', `رجعت لرتبة "${RANK_NAMES_AR[rrResult.newTier]}"`, 'rank_down', { rankTier: rrResult.newTier });
          }
        } catch (pushErr: any) {
          console.warn(`⚠️ Push notification failed for jester ${p.playerId}:`, pushErr.message);
        }
      } catch (err: any) {
        console.error(`⚠️ Failed to apply jester progression for player ${p.playerId}:`, err.message);
      }
      continue; // تخطي المنطق العادي
    }

    const teamWon = (state.winner === 'MAFIA' && playerIsMafia) || (state.winner === 'CITIZEN' && !playerIsMafia);

    const elimEntry = tracking.eliminationLog.find(e => e.physicalId === p.physicalId);
    const roundsSurvived = elimEntry ? Math.max(0, elimEntry.round - 1) : totalRounds;

    // تصنيف الديلات: ديل مواطن ناجح / ديل فاشل / ديل مافيا على مافيا
    const playerDeals = tracking.dealOutcomes.filter(d => d.initiatorPhysicalId === p.physicalId);
    const successfulDealsCount = playerDeals.filter(d => d.success).length;
    // ديل فاشل (مواطن أخرج مواطن)
    const regularFailedDeals = playerDeals.filter(d => !d.success && !playerIsMafia).length;
    // ديل مافيا على مافيا (أضر بفريقه)
    const mafiaDealOnMafiaCount = playerDeals.filter(d => !d.success && playerIsMafia).length;
    const failedDealsCount = regularFailedDeals;

    const abilityResults = tracking.abilityResults.filter(a => a.physicalId === p.physicalId);
    const abilityCorrectCount = abilityResults.filter(a => a.correct).length;
    const abilityIncorrectCount = abilityResults.filter(a => !a.correct).length;

    const xpEarned = calculateMatchXP({
      participated: true,
      teamWon,
      roundsSurvived,
      abilityCorrectCount,
      abilityIncorrectCount,
      successfulDealsCount,
      failedDealsCount,
      mafiaDealOnMafiaCount,
      teamEliminationBonus: teamElimBonusMap[p.physicalId] || 0,
    }, cfg);

    const rrChange = calculateMatchRR({
      teamWon,
      successfulDealsCount,
      failedDealsCount,
      mafiaDealOnMafiaCount,
      survivedToEnd: p.isAlive,
      abilityCorrectCount,
      abilityIncorrectCount,
    }, cfg);

    // تطبيق التقدم
    try {
      const xpResult = await applyXPAndLevel(p.playerId, xpEarned);
      const rrResult = await applyRR(p.playerId, rrChange);

      // تحديث إحصائيات الاتفاقيات
      if (playerDeals.length > 0) {
        const dealUpdates: any = { 
          totalDeals: sql`${players.totalDeals} + ${playerDeals.length}` 
        };
        if (successfulDealsCount > 0) {
          dealUpdates.successfulDeals = sql`${players.successfulDeals} + ${successfulDealsCount}`;
        }
        await db.update(players).set(dealUpdates).where(eq(players.id, p.playerId));
      }

      console.log(`🏆 Player #${p.physicalId} (${p.name}): +${xpEarned} XP, ${rrChange >= 0 ? '+' : ''}${rrChange} RR`);

      // ── إرسال تنبيهات التقدم ──
      try {
        const { sendPushToPlayer } = await import('./fcm.service.js');

        if (xpResult.leveledUp) {
          sendPushToPlayer(
            p.playerId,
            '🎉 ارتفع مستواك!',
            `أصبحت الآن Level ${xpResult.newLevel} — استمر!`,
            'level_up',
            { level: String(xpResult.newLevel) }
          );
          console.log(`🎉 Player ${p.name} leveled up → Level ${xpResult.newLevel}`);
        }

        if (rrResult.promoted) {
          const tierName = RANK_NAMES_AR[rrResult.newTier];
          sendPushToPlayer(
            p.playerId,
            '🏆 ترقية! رتبة جديدة!',
            `مبروك! أصبحت "${tierName}" — تستحقها!`,
            'rank_up',
            { rankTier: rrResult.newTier }
          );
          console.log(`🏆 Player ${p.name} promoted → ${rrResult.newTier}`);
        }

        if (rrResult.demoted) {
          const tierName = RANK_NAMES_AR[rrResult.newTier];
          sendPushToPlayer(
            p.playerId,
            '⬇️ انخفضت رتبتك',
            `رجعت لرتبة "${tierName}" — حان وقت الانتقام!`,
            'rank_down',
            { rankTier: rrResult.newTier }
          );
          console.log(`⬇️ Player ${p.name} demoted → ${rrResult.newTier}`);
        }
      } catch (pushErr: any) {
        // لا نوقف العملية إذا فشل الـ push
        console.warn(`⚠️ Push notification failed for player ${p.playerId}:`, pushErr.message);
      }
    } catch (err: any) {
      console.error(`⚠️ Failed to apply progression for player ${p.playerId}:`, err.message);
    }
  }
}
