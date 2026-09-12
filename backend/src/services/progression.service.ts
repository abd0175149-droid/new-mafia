// ══════════════════════════════════════════════════════
// 🏆 خدمة التقدم — Progression Service
// حساب XP + Level + RR + Rank Tier بعد كل مباراة
// ══════════════════════════════════════════════════════

import { isMafiaRole } from '../game/roles.js';
import { DEFAULT_CONFIG } from '../routes/progression-settings.routes.js';

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

// ── معاملات قابلة للضبط من إعدادات التقدّم (تُحدَّث عبر applyProgressionConfig) ──
export let LEVEL_BASE_XP = 500;
export let LEVEL_EXPONENT = 1.2;
export let DEMOTION_RETURN_PERCENT = 80;

// النسخ الافتراضية الثابتة — تُستعمل لإعادة ضبط المعاملات قبل كل تطبيق إعدادات،
// كي لا تبقى قيمة مفتاحٍ حُذف من الإعدادات عالقةً في ذاكرة العملية حتى إعادة التشغيل.
const DEFAULT_RANK_RR_REQUIRED: Record<RankTier, number> = {
  INFORMANT: 100, SOLDIER: 200, CAPO: 300, UNDERBOSS: 400, GODFATHER: 9999,
};
const DEFAULT_LEVEL_BASE_XP = 500;
const DEFAULT_LEVEL_EXPONENT = 1.2;
const DEFAULT_DEMOTION_RETURN_PERCENT = 80;

// ── معادلة Level XP (تكلفة الصعود للمستوى التالي) ───────
export function xpForNextLevel(level: number): number {
  return Math.floor(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

// ── تطبيق إعدادات التقدّم على المعاملات العامة (عتبات الرتب + المستوى + التنزيل) ──
// يُستدعى عند إقلاع الخادم، وعند حفظ الإعدادات (PUT)، وأينما تُحمّل cfg
// (processMatchRewards / finalizeMatch / recalc) لضمان أن تعديلات الواجهة
// (الرتب/المستوى/نسبة التنزيل) تؤثّر فعلاً في الحساب وفي عتبات البروفايل المعروضة.
export function applyProgressionConfig(cfg: any): void {
  // إعادة الضبط للافتراضي أولاً — المفاتيح الغائبة تعود لقيمها لا لآخر قيمة مطبَّقة
  for (const tier of RANK_TIERS) RANK_RR_REQUIRED[tier] = DEFAULT_RANK_RR_REQUIRED[tier];
  LEVEL_BASE_XP = DEFAULT_LEVEL_BASE_XP;
  LEVEL_EXPONENT = DEFAULT_LEVEL_EXPONENT;
  DEMOTION_RETURN_PERCENT = DEFAULT_DEMOTION_RETURN_PERCENT;

  if (!cfg) return;
  if (cfg.ranks) {
    for (const tier of RANK_TIERS) {
      if (cfg.ranks[tier]?.rrRequired != null) RANK_RR_REQUIRED[tier] = cfg.ranks[tier].rrRequired;
    }
  }
  if (cfg.level?.baseXP != null) LEVEL_BASE_XP = cfg.level.baseXP;
  if (cfg.level?.exponent != null) LEVEL_EXPONENT = cfg.level.exponent;
  if (cfg.demotionReturnPercent != null) DEMOTION_RETURN_PERCENT = cfg.demotionReturnPercent;
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
  successfulConfrontationsCount?: number;   // ⚔️ مواجهة كشفت مافيا
  failedConfrontationsCount?: number;       // ⚔️ مواجهة مواطن على مواطن
  mafiaConfrontationOnMafiaCount?: number;  // ⚔️ مافيا واجه مافيا
  pulseWins?: number;                        // 🗳️ فوز بنبض القاعة
  pulseVindicatedCount?: number;             // 🗳️ القاعة مع الحقيقة
  pulseCorrectVotes?: number;                // 🗳️ حدس صائب (مقيّد بـ٣)
}, cfg?: any, abilityRates?: { correctXp?: number; wrongXp?: number }): number {
  const c = cfg?.xp || DEFAULT_CONFIG.xp;
  let xp = 0;

  // معدّل القدرة: لكل دور إن وُجد، وإلا العام
  const abCorrect = abilityRates?.correctXp ?? c.abilityCorrect;
  const abWrong = abilityRates?.wrongXp ?? c.abilityIncorrect;

  if (params.participated) xp += c.participation;
  if (params.teamWon) xp += c.teamWin;
  xp += params.roundsSurvived * c.survivalPerRound;
  xp += params.abilityCorrectCount * abCorrect;
  xp += params.abilityIncorrectCount * abWrong;
  xp += params.successfulDealsCount * c.citizenDealOnMafia;
  xp += params.failedDealsCount * c.failedDeal;
  xp += params.mafiaDealOnMafiaCount * (c.mafiaDealOnMafia || c.failedDeal);
  xp += (params.successfulConfrontationsCount || 0) * (c.confrontationOnMafia ?? 25);
  xp += (params.failedConfrontationsCount || 0) * (c.failedConfrontation ?? -5);
  xp += (params.mafiaConfrontationOnMafiaCount || 0) * (c.mafiaConfrontationOnMafia ?? 0);
  xp += (params.pulseWins || 0) * (c.pulseWin ?? 10);
  xp += (params.pulseVindicatedCount || 0) * (c.pulseVindicated ?? 10);
  xp += Math.min(3, params.pulseCorrectVotes || 0) * (c.pulseCorrectVote ?? 3);
  xp += params.teamEliminationBonus;

  return Math.max(0, xp);
}

// ── حساب RR المتغير من مباراة واحدة (ديناميكي) ────
export function calculateMatchRR(params: {
  teamWon: boolean;
  successfulDealsCount: number;
  failedDealsCount: number;
  mafiaDealOnMafiaCount: number;
  successfulConfrontationsCount?: number;
  failedConfrontationsCount?: number;
  mafiaConfrontationOnMafiaCount?: number;
  pulseVindicatedCount?: number;
  survivedToEnd: boolean;
  abilityCorrectCount: number;
  abilityIncorrectCount: number;
}, cfg?: any, abilityRates?: { correctRr?: number; wrongRr?: number }): number {
  const c = cfg?.rr || DEFAULT_CONFIG.rr;
  let rr = 0;

  const abCorrect = abilityRates?.correctRr ?? c.abilityCorrect;
  const abWrong = abilityRates?.wrongRr ?? c.abilityIncorrect;

  rr += params.teamWon ? c.teamWin : c.teamLoss;
  rr += params.successfulDealsCount * c.citizenDealOnMafia;
  rr += params.failedDealsCount * c.failedDeal;
  rr += params.mafiaDealOnMafiaCount * (c.mafiaDealOnMafia || c.failedDeal);
  rr += (params.successfulConfrontationsCount || 0) * (c.confrontationOnMafia ?? 10);
  rr += (params.failedConfrontationsCount || 0) * (c.failedConfrontation ?? -15);
  rr += (params.mafiaConfrontationOnMafiaCount || 0) * (c.mafiaConfrontationOnMafia ?? -15);
  rr += (params.pulseVindicatedCount || 0) * (c.pulseVindicated ?? 5);
  if (params.survivedToEnd) rr += c.survivedToEnd;
  rr += params.abilityCorrectCount * abCorrect;
  rr += params.abilityIncorrectCount * abWrong;

  return rr;
}

// ══════════════════════════════════════════════════════
// 🎯 المصدر الموحّد لحساب نقاط مباراة لاعب واحد (كل الأدوار)
// يُستخدم في: حفظ سجل المباراة (match.service) + تطبيق الإجمالي (processMatchRewards)
// + سكربت الباك-فيل. دالة نقية (لا تلمس قاعدة البيانات) لضمان التطابق التام.
// ══════════════════════════════════════════════════════
export function computeMatchReward(opts: {
  role: string;
  winner: string | null;
  survivedToEnd: boolean;
  roundsSurvived: number;
  successfulDealsCount: number;
  failedDealsCount: number;        // ديل مواطن فاشل
  mafiaDealOnMafiaCount: number;   // ديل مافيا أضرّ بفريقه
  successfulConfrontationsCount?: number;   // ⚔️ مواجهة كشفت مافيا (اختياريّة — المستدعون القدامى)
  failedConfrontationsCount?: number;       // ⚔️ مواجهة مواطن على مواطن
  mafiaConfrontationOnMafiaCount?: number;  // ⚔️ مافيا واجه مافيا
  pulseWins?: number;
  pulseVindicatedCount?: number;
  pulseCorrectVotes?: number;
  abilityCorrectCount: number;
  abilityIncorrectCount: number;
  teamEliminationBonus: number;
  assassinContractsCompleted: number;
}, cfg?: any): { xpEarned: number; rrChange: number; won: boolean } {
  const c = cfg || DEFAULT_CONFIG;
  const role = opts.role;

  // 🤡 المهرّج
  if (role === 'JESTER') {
    const won = opts.winner === 'JESTER';
    return {
      won,
      xpEarned: Math.max(0, won ? (c.xp?.jesterWin ?? 50) : (c.xp?.jesterLoss ?? 0)),
      rrChange: won ? (c.rr?.jesterWin ?? 30) : (c.rr?.jesterLoss ?? -10),
    };
  }

  // 🔪 السفّاح
  if (role === 'ASSASSIN') {
    const won = opts.winner === 'ASSASSIN';
    const contracts = opts.assassinContractsCompleted || 0;
    const xp = Math.max(0, (won ? (c.xp?.assassinWin ?? 80) : (c.xp?.assassinLoss ?? 10)) + contracts * (c.xp?.assassinContractComplete ?? 15));
    const rr = (won ? (c.rr?.assassinWin ?? 30) : (c.rr?.assassinLoss ?? -15)) + contracts * (c.rr?.assassinContractComplete ?? 10);
    return { won, xpEarned: xp, rrChange: rr };
  }

  // 🔴🔵 المافيا/المواطنون
  const playerIsMafia = isMafiaRole(role as any);
  const won = (opts.winner === 'JESTER' || opts.winner === 'ASSASSIN') ? false
    : (opts.winner === 'MAFIA' && playerIsMafia) || (opts.winner === 'CITIZEN' && !playerIsMafia);

  // 🎭 معدّلات القدرة الخاصة بهذا الدور (إن وُجدت في الإعدادات، وإلا تسقط على العام)
  const roleAb = c?.roleAbilities?.[role];

  const xpEarned = calculateMatchXP({
    participated: true,
    teamWon: won,
    roundsSurvived: opts.roundsSurvived,
    abilityCorrectCount: opts.abilityCorrectCount,
    abilityIncorrectCount: opts.abilityIncorrectCount,
    successfulDealsCount: opts.successfulDealsCount,
    failedDealsCount: opts.failedDealsCount,
    mafiaDealOnMafiaCount: opts.mafiaDealOnMafiaCount,
    successfulConfrontationsCount: opts.successfulConfrontationsCount || 0,
    failedConfrontationsCount: opts.failedConfrontationsCount || 0,
    mafiaConfrontationOnMafiaCount: opts.mafiaConfrontationOnMafiaCount || 0,
    pulseWins: opts.pulseWins || 0,
    pulseVindicatedCount: opts.pulseVindicatedCount || 0,
    pulseCorrectVotes: opts.pulseCorrectVotes || 0,
    teamEliminationBonus: opts.teamEliminationBonus,
  }, c, roleAb ? { correctXp: roleAb.correctXp, wrongXp: roleAb.wrongXp } : undefined);

  const rrChange = calculateMatchRR({
    teamWon: won,
    successfulDealsCount: opts.successfulDealsCount,
    failedDealsCount: opts.failedDealsCount,
    mafiaDealOnMafiaCount: opts.mafiaDealOnMafiaCount,
    successfulConfrontationsCount: opts.successfulConfrontationsCount || 0,
    failedConfrontationsCount: opts.failedConfrontationsCount || 0,
    mafiaConfrontationOnMafiaCount: opts.mafiaConfrontationOnMafiaCount || 0,
    pulseVindicatedCount: opts.pulseVindicatedCount || 0,
    survivedToEnd: opts.survivedToEnd,
    abilityCorrectCount: opts.abilityCorrectCount,
    abilityIncorrectCount: opts.abilityIncorrectCount,
  }, c, roleAb ? { correctRr: roleAb.correctRr, wrongRr: roleAb.wrongRr } : undefined);

  return { won, xpEarned, rrChange };
}

// ══════════════════════════════════════════════════════
// 🧮 تفصيل النقاط (Breakdown) — مكوّنات مُسمّاة بنفس منطق computeMatchReward
// تُخزَّن وقت المباراة (finalize) وتُعرض في الصفحة الشخصية. تضمن أن مجموع البنود = المجموع.
// ══════════════════════════════════════════════════════
export function computeMatchBreakdown(opts: {
  role: string; winner: string | null; survivedToEnd: boolean; roundsSurvived: number;
  successfulDealsCount: number; failedDealsCount: number; mafiaDealOnMafiaCount: number;
  successfulConfrontationsCount?: number; failedConfrontationsCount?: number; mafiaConfrontationOnMafiaCount?: number;
  pulseWins?: number; pulseVindicatedCount?: number; pulseCorrectVotes?: number;
  abilityCorrectCount: number; abilityIncorrectCount: number; teamEliminationBonus: number;
  assassinContractsCompleted: number;
}, cfg?: any): { won: boolean; team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL'; xp: Record<string, number>; rr: Record<string, number> } {
  const c = cfg || DEFAULT_CONFIG;
  const cx = c.xp || DEFAULT_CONFIG.xp;
  const cr = c.rr || DEFAULT_CONFIG.rr;
  const role = opts.role;

  if (role === 'JESTER') {
    const won = opts.winner === 'JESTER';
    return { won, team: 'NEUTRAL',
      xp: { neutralResult: Math.max(0, won ? (cx.jesterWin ?? 50) : (cx.jesterLoss ?? 0)) },
      rr: { neutralResult: won ? (cr.jesterWin ?? 30) : (cr.jesterLoss ?? -10) } };
  }
  if (role === 'ASSASSIN') {
    const won = opts.winner === 'ASSASSIN';
    const k = opts.assassinContractsCompleted || 0;
    return { won, team: 'NEUTRAL',
      xp: { neutralResult: Math.max(0, won ? (cx.assassinWin ?? 80) : (cx.assassinLoss ?? 10)), contracts: k * (cx.assassinContractComplete ?? 15) },
      rr: { neutralResult: won ? (cr.assassinWin ?? 30) : (cr.assassinLoss ?? -15), contracts: k * (cr.assassinContractComplete ?? 10) } };
  }

  const isMafia = isMafiaRole(role as any);
  const won = (opts.winner === 'JESTER' || opts.winner === 'ASSASSIN') ? false
    : (opts.winner === 'MAFIA' && isMafia) || (opts.winner === 'CITIZEN' && !isMafia);
  const roleAb = c?.roleAbilities?.[role];
  const abCorrXp = roleAb?.correctXp ?? cx.abilityCorrect, abWrongXp = roleAb?.wrongXp ?? cx.abilityIncorrect;
  const abCorrRr = roleAb?.correctRr ?? cr.abilityCorrect, abWrongRr = roleAb?.wrongRr ?? cr.abilityIncorrect;

  return {
    won, team: isMafia ? 'MAFIA' : 'CITIZEN',
    xp: {
      participation: cx.participation,
      teamWin: won ? cx.teamWin : 0,
      survival: opts.roundsSurvived * cx.survivalPerRound,
      abilityCorrect: opts.abilityCorrectCount * abCorrXp,
      abilityIncorrect: opts.abilityIncorrectCount * abWrongXp,
      dealSuccess: opts.successfulDealsCount * cx.citizenDealOnMafia,
      dealFailed: opts.failedDealsCount * cx.failedDeal,
      mafiaDealOnMafia: opts.mafiaDealOnMafiaCount * (cx.mafiaDealOnMafia ?? cx.failedDeal),
      confrontationSuccess: (opts.successfulConfrontationsCount || 0) * (cx.confrontationOnMafia ?? 25),
      confrontationFailed: (opts.failedConfrontationsCount || 0) * (cx.failedConfrontation ?? -5),
      mafiaConfrontationOnMafia: (opts.mafiaConfrontationOnMafiaCount || 0) * (cx.mafiaConfrontationOnMafia ?? 0),
      pulseWin: (opts.pulseWins || 0) * (cx.pulseWin ?? 10),
      pulseVindicated: (opts.pulseVindicatedCount || 0) * (cx.pulseVindicated ?? 10),
      pulseCorrectVote: Math.min(3, opts.pulseCorrectVotes || 0) * (cx.pulseCorrectVote ?? 3),
      teamElimBonus: opts.teamEliminationBonus,
    },
    rr: {
      teamResult: won ? cr.teamWin : cr.teamLoss,
      dealSuccess: opts.successfulDealsCount * cr.citizenDealOnMafia,
      dealFailed: opts.failedDealsCount * cr.failedDeal,
      mafiaDealOnMafia: opts.mafiaDealOnMafiaCount * (cr.mafiaDealOnMafia ?? cr.failedDeal),
      confrontationSuccess: (opts.successfulConfrontationsCount || 0) * (cr.confrontationOnMafia ?? 10),
      confrontationFailed: (opts.failedConfrontationsCount || 0) * (cr.failedConfrontation ?? -15),
      mafiaConfrontationOnMafia: (opts.mafiaConfrontationOnMafiaCount || 0) * (cr.mafiaConfrontationOnMafia ?? -15),
      pulseVindicated: (opts.pulseVindicatedCount || 0) * (cr.pulseVindicated ?? 5),
      survivedToEnd: opts.survivedToEnd ? cr.survivedToEnd : 0,
      abilityCorrect: opts.abilityCorrectCount * abCorrRr,
      abilityIncorrect: opts.abilityIncorrectCount * abWrongRr,
    },
  };
}

// تسميات/أيقونات البنود (للعرض)
const BREAKDOWN_META: Record<string, { label: string; icon: string }> = {
  participation: { label: 'المشاركة في المباراة', icon: '🎮' },
  teamWin: { label: 'فوز الفريق', icon: '🏆' },
  teamResult: { label: 'نتيجة الفريق', icon: '⚔️' },
  survival: { label: 'النجاة (لكل جولة)', icon: '🛡️' },
  survivedToEnd: { label: 'النجاة حتى النهاية', icon: '🎖️' },
  abilityCorrect: { label: 'قدرة صحيحة', icon: '✅' },
  abilityIncorrect: { label: 'قدرة خاطئة', icon: '❌' },
  dealSuccess: { label: 'اتفاقية ناجحة', icon: '🤝' },
  dealFailed: { label: 'اتفاقية فاشلة', icon: '💔' },
  mafiaDealOnMafia: { label: 'غدر بالفريق (ديل مافيا)', icon: '🔴' },
  confrontationSuccess: { label: 'مواجهة كشفت مافيا', icon: '⚔️' },
  confrontationFailed: { label: 'مواجهة على مواطن', icon: '🩹' },
  mafiaConfrontationOnMafia: { label: 'غدر بالفريق (مواجهة مافيا)', icon: '🔴' },
  pulseWin: { label: 'إقناع القاعة', icon: '🗳️' },
  pulseVindicated: { label: 'القاعة مع الحقيقة', icon: '🎯' },
  pulseCorrectVote: { label: 'حدسٌ صائب', icon: '💡' },
  teamElimBonus: { label: 'مكافأة إقصاء خصم', icon: '⚔️' },
  neutralResult: { label: 'نتيجة الدور المحايد', icon: '🎭' },
  contracts: { label: 'عقود منجزة', icon: '🎯' },
  penalty: { label: 'عقوبات', icon: '⚠️' },
  bomb: { label: 'قدرة القنبلة', icon: '💣' },
  chipsBoost: { label: 'معزّز الخبرة ×2', icon: '⚡' },
  reconcile: { label: 'تسوية/أخرى', icon: '🧮' },
};

export interface BreakdownLine { key: string; label: string; icon: string; value: number; }

// ── بناء التفصيل المعروض من صفّ match_players (يضمن المطابقة عبر بند التسوية) ──
export function buildDisplayBreakdown(row: any, cfg?: any): {
  team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL'; won: boolean; xp: BreakdownLine[]; rr: BreakdownLine[]; xpTotal: number; rrTotal: number;
} {
  const xpTotal = row.xpEarned || 0;
  const rrTotal = row.rrChange || 0;
  const penalty = row.penaltyRRDeduction || 0;
  const bomb = row.bombRRChange || 0;

  // 1) المكوّنات: من المخزّن إن وُجد، وإلا إعادة بناء من الحقول المنطقية
  let comp = row.rewardBreakdown as { team: any; won: boolean; xp: Record<string, number>; rr: Record<string, number> } | null;
  if (!comp || !comp.xp || !comp.rr) {
    const isMafia = isMafiaRole(row.role as any);
    const dealFailedCitizen = row.dealInitiated && row.dealSuccess === false && !isMafia ? 1 : 0;
    const mafiaDealOnMafia = row.dealInitiated && row.dealSuccess === false && isMafia ? 1 : 0;
    const b = computeMatchBreakdown({
      role: row.role,
      winner: row.matchWinner ?? row.winner ?? null,
      survivedToEnd: !!(row.survivedToEnd ?? row.survived),
      roundsSurvived: row.roundsSurvived || 0,
      successfulDealsCount: row.dealInitiated && row.dealSuccess === true ? 1 : 0,
      failedDealsCount: dealFailedCitizen,
      mafiaDealOnMafiaCount: mafiaDealOnMafia,
      // ⚔️ من عمود confrontation_outcome (صفوفٌ بلا تفصيلٍ مخزَّن)
      successfulConfrontationsCount: row.confrontationOutcome === 'MAFIA_EXPOSED' ? 1 : 0,
      failedConfrontationsCount: row.confrontationOutcome === 'CITIZEN_HIT' ? 1 : 0,
      mafiaConfrontationOnMafiaCount: row.confrontationOutcome === 'MAFIA_BETRAYAL' ? 1 : 0,
      pulseWins: row.pulseWins || 0,
      pulseVindicatedCount: row.pulseVindicated ? 1 : 0,
      pulseCorrectVotes: row.pulseCorrectVotes || 0,
      abilityCorrectCount: row.abilityUsed && row.abilityCorrect === true ? 1 : 0,
      abilityIncorrectCount: row.abilityUsed && row.abilityCorrect === false ? 1 : 0,
      teamEliminationBonus: 0, // غير معروف من الحقول → يلتقطه بند التسوية
      assassinContractsCompleted: 0,
    }, cfg);
    comp = b;
  }

  const toLines = (map: Record<string, number>): BreakdownLine[] =>
    Object.entries(map).filter(([, v]) => v !== 0).map(([key, value]) => ({
      key, value, label: BREAKDOWN_META[key]?.label || key, icon: BREAKDOWN_META[key]?.icon || '•',
    }));

  const xpLines = toLines(comp.xp);
  const rrLines = toLines(comp.rr);
  // العقوبة والقنبلة (مخزّنتان منفصلتان — تُعرضان كبنود RR)
  if (penalty !== 0) rrLines.push({ key: 'penalty', value: penalty, label: `${BREAKDOWN_META.penalty.label} (${row.penaltyCount || 0})`, icon: BREAKDOWN_META.penalty.icon });
  if (bomb !== 0) rrLines.push({ key: 'bomb', value: bomb, label: BREAKDOWN_META.bomb.label, icon: BREAKDOWN_META.bomb.icon });

  // 2) بند التسوية — يضمن أن مجموع البنود = المجموع المخزّن الفعلي تماماً
  const xpSum = xpLines.reduce((s, l) => s + l.value, 0);
  const rrSum = rrLines.reduce((s, l) => s + l.value, 0);
  const xpReconcile = xpTotal - xpSum;
  const rrReconcile = rrTotal - rrSum;
  if (xpReconcile !== 0) xpLines.push({ key: 'reconcile', value: xpReconcile, label: BREAKDOWN_META.reconcile.label, icon: BREAKDOWN_META.reconcile.icon });
  if (rrReconcile !== 0) rrLines.push({ key: 'reconcile', value: rrReconcile, label: BREAKDOWN_META.reconcile.label, icon: BREAKDOWN_META.reconcile.icon });

  return { team: (comp.team || 'CITIZEN') as any, won: !!comp.won, xp: xpLines, rr: rrLines, xpTotal, rrTotal };
}


// ══════════════════════════════════════════════════════
// 🧮 حلقتا المستوى والرتبة — دوالّ نقيّة (المصدر الواحد)
//
// 🏙️ 2026-09: لم تبقَ في هذه الخدمة أيُّ كتابةٍ على قاعدة البيانات.
//    كانت هنا applyXPAndLevel / applyRR / processMatchRewards تكتب على players.*
//    مباشرةً؛ صارت players.* مرآةً لصفّ (الموسم النشط، المدينة الأساسيّة) في
//    player_season_stats، ومصدرُ الحقيقة match_players + rank_bonuses. كلُّ تطبيقٍ
//    يمرّ الآن من season.service.applySeasonStats (بمدينته) ومن reconcile.service.
//    الحلقتان هنا هي التي يستعملها الاثنان كي لا تتباعد النسخ.
// ══════════════════════════════════════════════════════

/** يضيف خبرةً ويصعد المستويات المتتالية (نفس منطق الاحتساب الحيّ التاريخيّ). */
export function advanceXP(xp: number, level: number, earned: number): { xp: number; level: number; leveledUp: boolean } {
  let curXp = (xp || 0) + (earned || 0);
  let curLevel = level || 1;
  let leveledUp = false;
  while (curXp >= xpForNextLevel(curLevel)) {
    curXp -= xpForNextLevel(curLevel);
    curLevel++;
    leveledUp = true;
  }
  return { xp: curXp, level: curLevel, leveledUp };
}

/** يضيف RR مع الترقية/التنزيل المتصاعد؛ tierIdx فهرسٌ في RANK_TIERS. */
export function advanceRR(rr: number, tierIdx: number, change: number): { rr: number; tierIdx: number; promoted: boolean; demoted: boolean } {
  let cur = (rr || 0) + (change || 0);
  let idx = Math.max(0, Math.min(RANK_TIERS.length - 1, tierIdx || 0));
  let promoted = false;
  let demoted = false;

  // ── ترقية (عتبات متصاعدة) ──
  while (idx < RANK_TIERS.length - 1) {
    const required = RANK_RR_REQUIRED[RANK_TIERS[idx]];
    if (cur < required) break;
    cur -= required;
    idx++;
    promoted = true;
  }

  // ── تنزيل ──
  while (cur < 0 && idx > 0) {
    idx--;
    // يرجع بنسبة DEMOTION_RETURN_PERCENT من RR الرتبة الأدنى (قابلة للضبط من الإعدادات)
    cur += Math.floor(RANK_RR_REQUIRED[RANK_TIERS[idx]] * (DEMOTION_RETURN_PERCENT / 100));
    demoted = true;
  }

  // لا تنزيل تحت INFORMANT
  if (cur < 0) cur = 0;

  // لا تجاوز سقف الرتبة الحالية
  const maxRR = RANK_RR_REQUIRED[RANK_TIERS[idx]];
  if (cur > maxRR) cur = maxRR;

  return { rr: cur, tierIdx: idx, promoted, demoted };
}

export function tierIndexOf(tier: string | null | undefined): number {
  const idx = RANK_TIERS.indexOf((tier || 'INFORMANT') as RankTier);
  return idx < 0 ? 0 : idx;
}
