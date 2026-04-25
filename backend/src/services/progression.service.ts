// ══════════════════════════════════════════════════════
// 🏆 خدمة التقدم — Progression Service
// حساب XP + Level + RR + Rank Tier بعد كل مباراة
// ══════════════════════════════════════════════════════

import { eq, sql, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { isMafiaRole } from '../game/roles.js';
import type { GameState } from '../game/state.js';

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

// ── معادلة Level XP ──────────────────────────────────
export function xpForNextLevel(level: number): number {
  return Math.floor(500 * Math.pow(level, 1.2));
}

// ── حساب XP المكتسب من مباراة واحدة ─────────────────
export function calculateMatchXP(params: {
  participated: boolean;
  teamWon: boolean;
  roundsSurvived: number;
  abilityCorrectCount: number;
  dealSuccess: boolean | null; // null = لم يبادر
  teamEliminationBonus: number; // عدد مرات إقصاء الخصم × 15
}): number {
  let xp = 0;

  if (params.participated) xp += 20;          // مشاركة
  if (params.teamWon) xp += 50;               // فوز الفريق
  xp += params.roundsSurvived * 5;            // نجاة لكل جولة
  xp += params.abilityCorrectCount * 10;      // قدرة صحيحة
  if (params.dealSuccess === true) xp += 50;  // اتفاقية ناجحة
  xp += params.teamEliminationBonus;          // مكافأة إقصاء الخصم

  return xp;
}

// ── حساب RR المتغير من مباراة واحدة ─────────────────
export function calculateMatchRR(params: {
  teamWon: boolean;
  dealSuccess: boolean | null;
}): number {
  let rr = 0;

  rr += params.teamWon ? 20 : -20;           // فوز/خسارة

  if (params.dealSuccess === true) rr += 20;  // اتفاقية ناجحة
  if (params.dealSuccess === false) rr -= 30; // اتفاقية فاشلة (عقوبة)

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
    .set({ xp: currentXP, level: currentLevel })
    .where(eq(players.id, playerId));

  return { newXP: currentXP, newLevel: currentLevel, leveledUp };
}

// ── تطبيق RR مع Promotion/Demotion ──────────────────
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

  // ── ترقية ──
  while (rr >= 100 && tierIdx < RANK_TIERS.length - 1) {
    rr -= 100;
    tierIdx++;
    promoted = true;
  }

  // ── تنزيل ──
  while (rr < 0 && tierIdx > 0) {
    tierIdx--;
    rr += 80; // يرجع بـ 80 RR في الرتبة الأدنى
    demoted = true;
  }

  // لا تنزيل تحت INFORMANT
  if (rr < 0) rr = 0;

  // لا تجاوز 100
  if (rr > 100) rr = 100;

  tier = RANK_TIERS[tierIdx];

  await db.update(players)
    .set({ rankRR: rr, rankTier: tier })
    .where(eq(players.id, playerId));

  return { newRR: rr, newTier: tier, promoted, demoted };
}

// ── معالجة مكافآت المباراة الكاملة ───────────────────
export async function processMatchRewards(state: GameState): Promise<void> {
  const db = getDB();
  if (!db) return;

  const tracking = state.performanceTracking || { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
  const totalRounds = state.round || 1;

  // ── حساب مكافأة إقصاء الخصم لكل لاعب ──
  // كل إقصاء مافيا → +15 XP لكل مواطن حي وقتها
  // كل إقصاء مواطن → +15 XP لكل مافيا حي وقتها
  const teamElimBonusMap: Record<number, number> = {};
  for (const p of state.players) {
    teamElimBonusMap[p.physicalId] = 0;
  }

  for (const elim of tracking.eliminationLog) {
    for (const p of state.players) {
      if (p.physicalId === elim.physicalId) continue; // المُقصى ما يحصل نقاط
      const pIsMafia = isMafiaRole(p.role as any);

      // إقصاء مافيا → مواطنين يحصلون نقاط
      if (elim.team === 'MAFIA' && !pIsMafia) {
        teamElimBonusMap[p.physicalId] = (teamElimBonusMap[p.physicalId] || 0) + 15;
      }
      // إقصاء مواطن → مافيا يحصلون نقاط
      if (elim.team === 'CITIZEN' && pIsMafia) {
        teamElimBonusMap[p.physicalId] = (teamElimBonusMap[p.physicalId] || 0) + 15;
      }
    }
  }

  // ── معالجة كل لاعب ──
  for (const p of state.players) {
    if (!p.playerId) continue;

    const playerIsMafia = isMafiaRole(p.role as any);
    const teamWon = (state.winner === 'MAFIA' && playerIsMafia) || (state.winner === 'CITIZEN' && !playerIsMafia);

    // حساب الجولات اللي عاشها
    const elimEntry = tracking.eliminationLog.find(e => e.physicalId === p.physicalId);
    const roundsSurvived = elimEntry ? Math.max(0, elimEntry.round - 1) : totalRounds;

    // هل بادر باتفاقية؟
    const dealOutcome = tracking.dealOutcomes.find(d => d.initiatorPhysicalId === p.physicalId);
    const dealSuccess = dealOutcome ? dealOutcome.success : null;

    // القدرات الصحيحة
    const abilityResults = tracking.abilityResults.filter(a => a.physicalId === p.physicalId);
    const abilityCorrectCount = abilityResults.filter(a => a.correct).length;
    const abilityUsed = abilityResults.length > 0;
    const abilityCorrect = abilityResults.length > 0 ? abilityResults.some(a => a.correct) : null;

    // حساب XP
    const xpEarned = calculateMatchXP({
      participated: true,
      teamWon,
      roundsSurvived,
      abilityCorrectCount,
      dealSuccess,
      teamEliminationBonus: teamElimBonusMap[p.physicalId] || 0,
    });

    // حساب RR
    const rrChange = calculateMatchRR({ teamWon, dealSuccess });

    // تطبيق التقدم
    try {
      await applyXPAndLevel(p.playerId, xpEarned);
      await applyRR(p.playerId, rrChange);

      // تحديث إحصائيات الاتفاقيات
      if (dealOutcome) {
        const dealUpdates: any = { totalDeals: sql`${players.totalDeals} + 1` };
        if (dealOutcome.success) {
          dealUpdates.successfulDeals = sql`${players.successfulDeals} + 1`;
        }
        await db.update(players).set(dealUpdates).where(eq(players.id, p.playerId));
      }

      console.log(`🏆 Player #${p.physicalId} (${p.name}): +${xpEarned} XP, ${rrChange >= 0 ? '+' : ''}${rrChange} RR`);
    } catch (err: any) {
      console.error(`⚠️ Failed to apply progression for player ${p.playerId}:`, err.message);
    }
  }
}
