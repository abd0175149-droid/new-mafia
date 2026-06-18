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

import { eq, asc, sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { matchPlayers, matches, sessions } from '../schemas/game.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import {
  computeMatchReward, xpForNextLevel, RANK_TIERS, RANK_RR_REQUIRED,
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
    rr += Math.floor(RANK_RR_REQUIRED[RANK_TIERS[tierIdx]] * 0.8);
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
  if (cfg?.ranks) {
    for (const tier of RANK_TIERS) {
      if (cfg.ranks[tier]?.rrRequired) RANK_RR_REQUIRED[tier] = cfg.ranks[tier].rrRequired;
    }
  }
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
    isTestLocation: locations.isTestLocation,
  })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .leftJoin(sessions, eq(matches.sessionId, sessions.id))
    .leftJoin(activities, eq(sessions.activityId, activities.id))
    .leftJoin(locations, eq(activities.locationId, locations.id))
    .orderBy(asc(matchPlayers.matchId), asc(matchPlayers.id));

  console.log(`📊 Fetched ${rows.length} match_player rows.`);

  // 3) فلترة: استبعاد مواقع الاختبار فقط (isTestLocation === true)
  const counted = rows.filter(r => r.isTestLocation !== true);
  const skipped = rows.length - counted.length;
  console.log(`✅ Counted: ${counted.length} | ⛔ Skipped (test location): ${skipped}`);

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

  console.log('⚠️  Applying changes...');
  // تصفير اللاعبين الذين لهم سجلات محسوبة فقط (لا نلمس من لا سجل له)
  for (const acc of accs.values()) {
    await db.update(players).set({
      xp: acc.xp, level: acc.level, rankRR: acc.rr, rankTier: RANK_TIERS[acc.tierIdx],
      totalMatches: acc.totalMatches, totalWins: acc.totalWins, totalSurvived: acc.totalSurvived,
      totalDeals: acc.totalDeals, successfulDeals: acc.successfulDeals,
    } as any).where(eq(players.id, acc.playerId));
  }
  console.log(`✅ Applied to ${accs.size} players.`);
  process.exit(0);
}

main().catch(err => { console.error('❌ Recalc failed:', err); process.exit(1); });
