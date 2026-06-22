// ══════════════════════════════════════════════════════
// 🔄 مصالحة التقدّم (RR/XP/المباريات) من مصدر الحقيقة: match_players
// ══════════════════════════════════════════════════════
// نواة قابلة لإعادة الاستخدام — يستدعيها كلٌّ من:
//   - سكربت الـCLI: scripts/recalc-progression-v2.ts (يدوي/إصلاح)
//   - الإنهاء التلقائي للفعالية: session.service.endActivityRoom (شبكة أمان)
//
// لماذا نحتاجها تلقائياً؟ احتساب المباراة الحيّ (finalizeMatch) ليس ذرّياً: يسجّل
// match_players (مصدر الحقيقة) ثم يطبّق التجميعة (players.* / player_season_stats)
// كعمليات منفصلة. أي مقاطعة (إعادة تشغيل/تذبذب شبكة) بين الخطوتين تترك المباراة
// مسجّلة والتجميعة ناقصة، وحارس التكرار يمنع إصلاحها لاحقاً. هذه الدالة تعيد اشتقاق
// التجميعة من match_players فتتجاوز أي مقاطعة. (انظر unified-mafia-deploy-and-rank-facts)
// ══════════════════════════════════════════════════════

import { eq, and, asc, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { matchPlayers, matches, sessions } from '../schemas/game.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { playerSeasonStats } from '../schemas/season.schema.js';
import {
  computeMatchReward, xpForNextLevel, RANK_TIERS, RANK_RR_REQUIRED,
  applyProgressionConfig, DEMOTION_RETURN_PERCENT,
} from './progression.service.js';
import { getProgressionConfig } from '../routes/progression-settings.routes.js';

interface PlayerAcc {
  playerId: number;
  name: string;
  xp: number; level: number; rr: number; tierIdx: number;
  totalMatches: number; totalWins: number; totalSurvived: number;
  totalDeals: number; successfulDeals: number;
}

// تطبيق RR مع الترقية/التنزيل المتصاعد (نسخة طبق الأصل من applyRR للعب في الذاكرة)
function applyRRInMemory(acc: PlayerAcc, rrChange: number) {
  let rr = acc.rr + rrChange;
  let tierIdx = acc.tierIdx;
  while (tierIdx < RANK_TIERS.length - 1) {
    const required = RANK_RR_REQUIRED[RANK_TIERS[tierIdx]];
    if (rr < required) break;
    rr -= required; tierIdx++;
  }
  while (rr < 0 && tierIdx > 0) {
    tierIdx--;
    rr += Math.floor(RANK_RR_REQUIRED[RANK_TIERS[tierIdx]] * (DEMOTION_RETURN_PERCENT / 100));
  }
  if (rr < 0) rr = 0;
  const maxRR = RANK_RR_REQUIRED[RANK_TIERS[tierIdx]];
  if (rr > maxRR) rr = maxRR;
  acc.rr = rr; acc.tierIdx = tierIdx;
}

function applyXPInMemory(acc: PlayerAcc, xpEarned: number) {
  acc.xp += xpEarned;
  while (acc.xp >= xpForNextLevel(acc.level)) {
    acc.xp -= xpForNextLevel(acc.level);
    acc.level++;
  }
}

export interface ReconcileResult {
  counted: number;
  skipped: number;
  players: number;
  mismatches: number;
  applied: boolean;
  isActiveRegular: boolean;
  targetSeasonId: number | null;
  reason?: 'dry-run' | 'mass-zero-guard' | 'applied' | 'no-db';
}

export interface ReconcileOptions {
  // 🎯 مصالحة مستهدفة (لكل لعبة): تكتب فقط هؤلاء اللاعبين بقيَم مطلقة من مصدر الحقيقة،
  // بلا تصفير الجميع → لا وميض ولا تسابق بين غرف متزامنة. تُستخدم بعد كل مباراة (finalizeIfDecided).
  onlyPlayerIds?: number[];
}

/**
 * يعيد اشتقاق تقدّم الموسم من match_players (مصدر الحقيقة).
 * @param targetSeasonId رقم الموسم؛ null ⇒ الموسم العادي النشط.
 * @param apply false ⇒ تقرير فقط (لا كتابة)؛ true ⇒ يطبّق.
 * @param log دالة تسجيل اختيارية (الـCLI يمرّر console.log؛ السيرفر يمرّر شيئاً صامتاً/مختصراً).
 * @param opts onlyPlayerIds ⇒ مصالحة مستهدفة لهؤلاء فقط (بلا تصفير عام).
 */
export async function reconcileSeasonProgression(
  targetSeasonId: number | null,
  apply: boolean,
  log: (msg: string) => void = () => {},
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const db = getDB();
  if (!db) {
    return { counted: 0, skipped: 0, players: 0, mismatches: 0, applied: false, isActiveRegular: false, targetSeasonId, reason: 'no-db' };
  }
  const onlyPlayerIds = opts.onlyPlayerIds && opts.onlyPlayerIds.length > 0
    ? new Set(opts.onlyPlayerIds) : null;

  // 1) تحميل إعدادات التقدّم + ضبط عتبات الرتب (مثل processMatchRewards)
  let cfg: any;
  try { cfg = await getProgressionConfig(); } catch { cfg = undefined; }
  applyProgressionConfig(cfg);

  // 2) سحب صفوف match_players مع الفائز + علم موقع الاختبار (عبر session→activity→location)
  // المصالحة المستهدفة (لكل لعبة) تقصر السحب على لاعبي المباراة فقط — أخفّ بكثير لكل نهاية لعبة.
  const sel = db.select({
    playerId: matchPlayers.playerId,
    playerName: matchPlayers.playerName,
    role: matchPlayers.role,
    survivedToEnd: matchPlayers.survivedToEnd,
    roundsSurvived: matchPlayers.roundsSurvived,
    dealInitiated: matchPlayers.dealInitiated,
    dealSuccess: matchPlayers.dealSuccess,
    abilityUsed: matchPlayers.abilityUsed,
    abilityCorrect: matchPlayers.abilityCorrect,
    xpEarned: matchPlayers.xpEarned,
    rrChange: matchPlayers.rrChange,
    matchId: matchPlayers.matchId,
    winner: matches.winner,
    seasonId: matches.seasonId,
    isTestLocation: locations.isTestLocation,
  })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .leftJoin(sessions, eq(matches.sessionId, sessions.id))
    .leftJoin(activities, eq(sessions.activityId, activities.id))
    .leftJoin(locations, eq(activities.locationId, locations.id));

  const rows = await (onlyPlayerIds
    ? sel.where(inArray(matchPlayers.playerId, [...onlyPlayerIds]))
    : sel
  ).orderBy(asc(matchPlayers.matchId), asc(matchPlayers.id));

  log(`📊 Fetched ${rows.length} match_player rows.`);

  // نطاق الموسم: null ⇒ الموسم العادي النشط
  if (targetSeasonId == null) {
    const { getActiveRegularSeasonId } = await import('./season.service.js');
    targetSeasonId = await getActiveRegularSeasonId();
  }
  log(`🏆 Target season: ${targetSeasonId ?? '(none — counting all)'}`);

  // 3) فلترة: استبعاد مواقع الاختبار + قصر على الموسم المستهدف (إن وُجد)
  const counted = rows.filter(r =>
    r.isTestLocation !== true &&
    (targetSeasonId == null || r.seasonId === targetSeasonId)
  );
  const skipped = rows.length - counted.length;
  log(`✅ Counted: ${counted.length} | ⛔ Skipped (test/other-season): ${skipped}`);

  // 4) إعادة اللعب في الذاكرة لكل لاعب (بالترتيب الزمني)
  const accs = new Map<number, PlayerAcc>();
  let noPlayerId = 0;
  let dupSkipped = 0;
  const seen = new Set<string>(); // (matchId:playerId) — إزالة الصفوف المكرّرة من finalize مزدوج تاريخي
  for (const r of counted) {
    if (!r.playerId) { noPlayerId++; continue; }
    const key = `${r.matchId}:${r.playerId}`;
    if (seen.has(key)) { dupSkipped++; continue; }
    seen.add(key);
    let acc = accs.get(r.playerId);
    if (!acc) {
      acc = { playerId: r.playerId, name: r.playerName, xp: 0, level: 1, rr: 0, tierIdx: 0,
        totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0 };
      accs.set(r.playerId, acc);
    }
    // ── النهج الهجين (دقّة ~99%) ──
    // الأدوار العادية: القيم المخزّنة xpEarned/rrChange دقيقة 100%.
    // المحايدون (مهرّج/سفّاح): الأساس لم يُخزَّن → نعيد حسابه ونضيف ما خُزِّن.
    const isNeutral = r.role === 'JESTER' || r.role === 'ASSASSIN';
    const storedXp = r.xpEarned || 0;
    const storedRr = r.rrChange || 0;

    const base = computeMatchReward({
      role: r.role,
      winner: r.winner ?? null,
      survivedToEnd: !!r.survivedToEnd,
      roundsSurvived: r.roundsSurvived || 0,
      successfulDealsCount: r.dealSuccess ? 1 : 0,
      failedDealsCount: r.dealInitiated && r.dealSuccess === false ? 1 : 0,
      mafiaDealOnMafiaCount: 0,
      abilityCorrectCount: r.abilityCorrect === true ? 1 : 0,
      abilityIncorrectCount: r.abilityCorrect === false ? 1 : 0,
      teamEliminationBonus: 0,
      assassinContractsCompleted: (r.role === 'ASSASSIN' && r.winner === 'ASSASSIN') ? 4 : 0,
    }, cfg);

    const won = base.won;
    const xpEarned = isNeutral ? (base.xpEarned + storedXp) : storedXp;
    const rrChange = isNeutral ? (base.rrChange + storedRr) : storedRr;

    applyXPInMemory(acc, xpEarned);
    applyRRInMemory(acc, rrChange);
    acc.totalMatches += 1;
    acc.totalWins += won ? 1 : 0;
    acc.totalSurvived += r.survivedToEnd ? 1 : 0;
    acc.totalDeals += r.dealInitiated ? 1 : 0;
    acc.successfulDeals += r.dealSuccess ? 1 : 0;
  }
  log(`👤 Players to update: ${accs.size} | rows without playerId: ${noPlayerId} | duplicate rows skipped: ${dupSkipped}`);

  // هل الموسم المستهدف هو الموسم العادي النشط؟ (players.* تعكس الموسم العادي النشط فقط)
  const { getActiveRegularSeasonId } = await import('./season.service.js');
  const activeRegularId = await getActiveRegularSeasonId();
  const isActiveRegular = targetSeasonId != null && targetSeasonId === activeRegularId;

  // 5) تقرير المقارنة (المخزّن مقابل المحسوب) — يُتخطّى في المصالحة المستهدفة (لكل لعبة) لتوفير الوقت
  let mismatches = 0;
  if (!onlyPlayerIds) {
    for (const acc of accs.values()) {
      const [cur] = await db.select({
        totalMatches: players.totalMatches, rankRR: players.rankRR, rankTier: players.rankTier,
      }).from(players).where(eq(players.id, acc.playerId)).limit(1);
      const newTier = RANK_TIERS[acc.tierIdx];
      const storedMatches = cur?.totalMatches ?? 0;
      if (storedMatches !== acc.totalMatches || (cur?.rankTier ?? 'INFORMANT') !== newTier) {
        mismatches++;
        if (mismatches <= 30) {
          log(`  #${acc.playerId} ${acc.name}: matches ${storedMatches}→${acc.totalMatches} | tier ${cur?.rankTier ?? '-'}→${newTier} | RR ${cur?.rankRR ?? 0}→${acc.rr} | L${acc.level}`);
        }
      }
    }
    log(`🔎 Players with differences: ${mismatches}`);
  }

  // 6) التطبيق (فقط مع apply)
  if (!apply) {
    log('🔍 DRY-RUN complete. No changes written.');
    return { counted: counted.length, skipped, players: accs.size, mismatches, applied: false, isActiveRegular, targetSeasonId, reason: 'dry-run' };
  }

  // 🛡️ حارس أمان: لا نصفّر players.* للموسم العادي النشط إذا لم يُحسب أي لاعب.
  // (لا ينطبق على المصالحة المستهدفة — فهي لا تصفّر الجميع أصلاً.)
  if (isActiveRegular && accs.size === 0 && !onlyPlayerIds) {
    log('❌ Aborting: 0 players computed for the ACTIVE regular season — refusing to zero players.* No changes written.');
    return { counted: counted.length, skipped, players: 0, mismatches, applied: false, isActiveRegular, targetSeasonId, reason: 'mass-zero-guard' };
  }

  // قيَم players.* / PSS المطلقة المشتقّة من acc (أو أصفار لمن لا مباريات له في الموسم)
  const setFor = (acc: PlayerAcc | undefined) => acc ? {
    xp: acc.xp, level: acc.level, rankRR: acc.rr, rankTier: RANK_TIERS[acc.tierIdx],
    totalMatches: acc.totalMatches, totalWins: acc.totalWins, totalSurvived: acc.totalSurvived,
    totalDeals: acc.totalDeals, successfulDeals: acc.successfulDeals,
  } : {
    xp: 0, level: 1, rankRR: 0, rankTier: 'INFORMANT',
    totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0,
  };

  log(`⚠️  Applying... (season: ${targetSeasonId ?? 'ALL'}, activeRegular: ${isActiveRegular}, mode: ${onlyPlayerIds ? `targeted×${onlyPlayerIds.size}` : 'full'})`);

  // المعرّفات المراد كتابتها: المستهدفون فقط (لكل لعبة) أو كل المحسوبين (مصالحة كاملة)
  const idsToWrite: number[] = onlyPlayerIds ? [...onlyPlayerIds] : [...accs.keys()];

  // ── (أ) players.* — تعكس الموسم العادي النشط فقط ──
  if (isActiveRegular || targetSeasonId == null) {
    // المصالحة الكاملة فقط تصفّر الجميع أولاً؛ المستهدفة تكتب اللاعبين المعنيين بقيَم مطلقة بلا تصفير
    if (!onlyPlayerIds && isActiveRegular) {
      await db.update(players).set({
        xp: 0, level: 1, rankTier: 'INFORMANT', rankRR: 0,
        totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0,
      } as any);
    }
    for (const pid of idsToWrite) {
      await db.update(players).set(setFor(accs.get(pid)) as any).where(eq(players.id, pid));
    }
    log(`✅ players.* ${onlyPlayerIds ? 'targeted-reconciled' : (isActiveRegular ? 'rebuilt (others reset to 0)' : 'updated (all-seasons)')} — ${idsToWrite.length} players.`);
  } else {
    log(`ℹ️  Target season #${targetSeasonId} is NOT the active regular season → players.* left untouched.`);
  }

  // ── (ب) player_season_stats — كاش لكل (لاعب، موسم) ──
  if (targetSeasonId != null) {
    for (const pid of idsToWrite) {
      const set = setFor(accs.get(pid));
      await db.insert(playerSeasonStats)
        .values({ playerId: pid, seasonId: targetSeasonId } as any)
        .onConflictDoNothing();
      await db.update(playerSeasonStats).set({
        xp: set.xp, level: set.level, rankTier: set.rankTier, rankRR: set.rankRR,
        totalMatches: set.totalMatches, totalWins: set.totalWins, totalSurvived: set.totalSurvived,
        totalDeals: set.totalDeals, successfulDeals: set.successfulDeals, updatedAt: new Date(),
      } as any).where(and(
        eq(playerSeasonStats.playerId, pid),
        eq(playerSeasonStats.seasonId, targetSeasonId),
      ));
    }
    log(`✅ player_season_stats ${onlyPlayerIds ? 'targeted-reconciled' : 'rebuilt'} for season #${targetSeasonId} — ${idsToWrite.length} players.`);
  }

  return { counted: counted.length, skipped, players: idsToWrite.length, mismatches, applied: true, isActiveRegular, targetSeasonId, reason: 'applied' };
}
