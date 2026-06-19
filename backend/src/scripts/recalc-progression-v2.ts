// ══════════════════════════════════════════════════════
// 🔄 إعادة احتساب التقدّم (RR/XP/المباريات) من مصدر الحقيقة: match_players
// ══════════════════════════════════════════════════════
// القاعدة: تُحتسب كل المباريات إلا ما كان موقع فعاليتها Test Location.
//   - الأنشطة/الجلسات المحذوفة (soft-delete) تُحتسب.
//   - المباريات بلا نشاط/موقع تُحتسب (ليست test location).
// يعيد الحساب لكل لاعب من الصفر عبر computeMatchReward (نفس منطق اللعبة الحيّة).
//
// التشغيل:
//   tsx src/scripts/recalc-progression-v2.ts            → تقرير فقط (dry-run، لا يكتب)
//   tsx src/scripts/recalc-progression-v2.ts --apply    → يطبّق التغييرات فعلياً
// ══════════════════════════════════════════════════════

import { eq, and, asc, sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { matchPlayers, matches, sessions } from '../schemas/game.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { playerSeasonStats } from '../schemas/season.schema.js';
import {
  computeMatchReward, xpForNextLevel, RANK_TIERS, RANK_RR_REQUIRED,
  applyProgressionConfig, DEMOTION_RETURN_PERCENT,
} from '../services/progression.service.js';
import { getProgressionConfig } from '../routes/progression-settings.routes.js';

const APPLY = process.argv.includes('--apply');

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

async function main() {
  console.log(`🔄 Recalc progression [HYBRID: stored for regulars + recompute neutrals] — mode: ${APPLY ? '⚠️  APPLY (writes)' : '🔍 DRY-RUN (report only)'}`);
  await connectDB();
  const db = getDB();
  if (!db) { console.error('❌ DB unavailable'); process.exit(1); }

  // 1) تحميل إعدادات التقدّم + ضبط عتبات الرتب (مثل processMatchRewards)
  let cfg: any;
  try { cfg = await getProgressionConfig(); } catch { cfg = undefined; }
  applyProgressionConfig(cfg);
  console.log(`⚙️  RANK thresholds: ${JSON.stringify(RANK_RR_REQUIRED)}`);

  // 2) سحب كل صفوف match_players مع الفائز + علم موقع الاختبار (عبر session→activity→location)
  const rows = await db.select({
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
    .leftJoin(locations, eq(activities.locationId, locations.id))
    .orderBy(asc(matchPlayers.matchId), asc(matchPlayers.id));

  console.log(`📊 Fetched ${rows.length} match_player rows.`);

  // 🏆 نطاق الموسم: افتراضياً الموسم العادي النشط (يُمرَّر --season <id> لموسم آخر).
  // ضروري كي لا تُخلط مباريات البطولات/المواسم الأخرى في رانك اللاعب العادي (players.*).
  const seasonArgIdx = process.argv.indexOf('--season');
  let targetSeasonId: number | null = seasonArgIdx >= 0 ? parseInt(process.argv[seasonArgIdx + 1]) : null;
  if (targetSeasonId == null) {
    const { getActiveRegularSeasonId } = await import('../services/season.service.js');
    targetSeasonId = await getActiveRegularSeasonId();
  }
  console.log(`🏆 Target season: ${targetSeasonId ?? '(none — counting all)'} `);

  // 3) فلترة: استبعاد مواقع الاختبار + قصر على الموسم المستهدف (إن وُجد)
  const counted = rows.filter(r =>
    r.isTestLocation !== true &&
    (targetSeasonId == null || r.seasonId === targetSeasonId)
  );
  const skipped = rows.length - counted.length;
  console.log(`✅ Counted: ${counted.length} | ⛔ Skipped (test/other-season): ${skipped}`);

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
    // الأدوار العادية: القيم المخزّنة xpEarned/rrChange دقيقة 100% (تشمل مكافأة إقصاء الفريق
    //   + الصفقات + القدرات + العقوبات + القنبلة — كلها مُدمجة وقت اللعب).
    // المحايدون (مهرّج/سفّاح): الأساس لم يُخزَّن (كان صفراً) → نعيد حسابه، ونضيف ما خُزِّن
    //   (عقوبات إن وُجدت، فهي مدمجة في rrChange المخزّن للمحايد).
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
      // السفّاح الفائز أكمل العقود المطلوبة (الافتراضي 4)؛ الخاسر: غير معروف → 0
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
  console.log(`👤 Players to update: ${accs.size} | rows without playerId: ${noPlayerId} | duplicate rows skipped: ${dupSkipped}`);

  // 5) تقرير المقارنة (المخزّن مقابل المحسوب)
  let mismatches = 0;
  for (const acc of accs.values()) {
    const [cur] = await db.select({
      totalMatches: players.totalMatches, rankRR: players.rankRR, rankTier: players.rankTier,
    }).from(players).where(eq(players.id, acc.playerId)).limit(1);
    const newTier = RANK_TIERS[acc.tierIdx];
    const storedMatches = cur?.totalMatches ?? 0;
    if (storedMatches !== acc.totalMatches || (cur?.rankTier ?? 'INFORMANT') !== newTier) {
      mismatches++;
      if (mismatches <= 30) {
        console.log(`  #${acc.playerId} ${acc.name}: matches ${storedMatches}→${acc.totalMatches} | tier ${cur?.rankTier ?? '-'}→${newTier} | RR ${cur?.rankRR ?? 0}→${acc.rr} | L${acc.level}`);
      }
    }
  }
  console.log(`🔎 Players with differences: ${mismatches}`);

  // 6) التطبيق (فقط مع --apply)
  if (!APPLY) {
    console.log('🔍 DRY-RUN complete. No changes written. Re-run with --apply to write.');
    process.exit(0);
  }

  // هل الموسم المستهدف هو الموسم العادي النشط؟ (players.* تعكس الموسم العادي النشط فقط)
  const { getActiveRegularSeasonId } = await import('../services/season.service.js');
  const activeRegularId = await getActiveRegularSeasonId();
  const isActiveRegular = targetSeasonId != null && targetSeasonId === activeRegularId;

  console.log(`⚠️  Applying changes... (target season: ${targetSeasonId ?? 'ALL'}, active regular: ${activeRegularId ?? '-'}, isActiveRegular: ${isActiveRegular})`);

  // ── (أ) players.* — تعكس الموسم العادي النشط فقط ──
  // إن كان الهدف هو الموسم العادي النشط: نصفّر تقدّم الجميع ثم نعيد البناء من مباريات
  // الموسم المستهدف فقط (lifetime_matches لا يُلمس). هكذا تعكس players.* الموسم الحالي بدقة.
  if (isActiveRegular) {
    await db.update(players).set({
      xp: 0, level: 1, rankTier: 'INFORMANT', rankRR: 0,
      totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0,
    } as any);
    for (const acc of accs.values()) {
      await db.update(players).set({
        xp: acc.xp, level: acc.level, rankRR: acc.rr, rankTier: RANK_TIERS[acc.tierIdx],
        totalMatches: acc.totalMatches, totalWins: acc.totalWins, totalSurvived: acc.totalSurvived,
        totalDeals: acc.totalDeals, successfulDeals: acc.successfulDeals,
      } as any).where(eq(players.id, acc.playerId));
    }
    console.log(`✅ players.* rebuilt for active regular season — ${accs.size} players (others reset to 0).`);
  } else if (targetSeasonId == null) {
    // وضع "كل المواسم" (نادر): السلوك القديم — players.* فقط، بلا لمس player_season_stats
    for (const acc of accs.values()) {
      await db.update(players).set({
        xp: acc.xp, level: acc.level, rankRR: acc.rr, rankTier: RANK_TIERS[acc.tierIdx],
        totalMatches: acc.totalMatches, totalWins: acc.totalWins, totalSurvived: acc.totalSurvived,
        totalDeals: acc.totalDeals, successfulDeals: acc.successfulDeals,
      } as any).where(eq(players.id, acc.playerId));
    }
    console.log(`✅ players.* updated (all-seasons mode) — ${accs.size} players. (player_season_stats not touched)`);
  } else {
    console.log(`ℹ️  Target season #${targetSeasonId} is NOT the active regular season → players.* left untouched.`);
  }

  // ── (ب) player_season_stats — كاش لكل (لاعب، موسم) ──
  // يُصلح لوحات المواسم السابقة + يضمن أن الموسم الحالي يبقى صحيحاً عند انتهائه.
  // upsert عبر القيد الفريد (player_id, season_id).
  if (targetSeasonId != null) {
    for (const acc of accs.values()) {
      await db.insert(playerSeasonStats)
        .values({ playerId: acc.playerId, seasonId: targetSeasonId } as any)
        .onConflictDoNothing();
      await db.update(playerSeasonStats).set({
        xp: acc.xp, level: acc.level, rankTier: RANK_TIERS[acc.tierIdx], rankRR: acc.rr,
        totalMatches: acc.totalMatches, totalWins: acc.totalWins, totalSurvived: acc.totalSurvived,
        totalDeals: acc.totalDeals, successfulDeals: acc.successfulDeals, updatedAt: new Date(),
      } as any).where(and(
        eq(playerSeasonStats.playerId, acc.playerId),
        eq(playerSeasonStats.seasonId, targetSeasonId),
      ));
    }
    console.log(`✅ player_season_stats rebuilt for season #${targetSeasonId} — ${accs.size} players.`);
  }

  process.exit(0);
}

main().catch(err => { console.error('❌ Recalc failed:', err); process.exit(1); });
