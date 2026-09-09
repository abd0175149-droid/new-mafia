// ══════════════════════════════════════════════════════
// 🔄 مصالحة التقدّم (RR/XP/المباريات) من مصدر الحقيقة: match_players
// ══════════════════════════════════════════════════════
// نواة قابلة لإعادة الاستخدام — يستدعيها كلٌّ من:
//   - سكربت الـCLI: scripts/recalc-progression-v2.ts (يدوي/إصلاح)
//   - الإنهاء التلقائي للفعالية: session.service.endActivityRoom (شبكة أمان)
//   - نهاية كلّ مباراة: match.service.reconcileMatchPlayersRank (مستهدفة)
//
// لماذا نحتاجها تلقائياً؟ احتساب المباراة الحيّ (finalizeMatch) ليس ذرّياً: يسجّل
// match_players (مصدر الحقيقة) ثم يطبّق التجميعة (player_season_stats + مرآة players.*)
// كعمليات منفصلة. أي مقاطعة بين الخطوتين تترك المباراة مسجّلة والتجميعة ناقصة. هذه
// الدالة تعيد اشتقاق التجميعة من match_players فتتجاوز أي مقاطعة.
//
// 🏙️ 2026-09 — بُعدُ المدينة: للموسم العادي يُجمَّع كلُّ لاعبٍ **لكلّ مدينةٍ** على حدة
//    (مفتاح المُجمِّع: لاعب:مدينة). مدينةُ الصفّ = ختمُ المباراة matches.city_id، وإلا
//    مدينةُ مكان فعاليّتها. صفٌّ عاديٌّ بلا مدينة لا يُحتسب في أيّ ترتيب (fail-safe).
//    البطولات والأونلاين نطاقُها الموسم وحده (city_id = NULL).
//    players.* مرآةٌ لصفّ (الموسم العادي النشط، المدينة الأساسيّة) — تُكتب هنا أيضاً.
// ══════════════════════════════════════════════════════

import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { matchPlayers, matches, sessions } from '../schemas/game.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { playerSeasonStats } from '../schemas/season.schema.js';
import {
  computeMatchReward, RANK_TIERS, applyProgressionConfig, advanceXP, advanceRR,
} from './progression.service.js';
import { getProgressionConfig } from '../routes/progression-settings.routes.js';

interface PlayerAcc {
  playerId: number;
  cityId: number | null;
  name: string;
  xp: number; level: number; rr: number; tierIdx: number;
  totalMatches: number; totalWins: number; totalSurvived: number;
  totalDeals: number; successfulDeals: number;
}

function applyRRInMemory(acc: PlayerAcc, rrChange: number) {
  const r = advanceRR(acc.rr, acc.tierIdx, rrChange);
  acc.rr = r.rr; acc.tierIdx = r.tierIdx;
}

function applyXPInMemory(acc: PlayerAcc, xpEarned: number) {
  const x = advanceXP(acc.xp, acc.level, xpEarned);
  acc.xp = x.xp; acc.level = x.level;
}

const accKey = (playerId: number, cityId: number | null) => `${playerId}:${cityId ?? 0}`;

function newAcc(playerId: number, cityId: number | null, name: string): PlayerAcc {
  return { playerId, cityId, name, xp: 0, level: 1, rr: 0, tierIdx: 0,
    totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0 };
}

export interface ReconcileResult {
  counted: number;
  skipped: number;
  /** صفوفٌ في الموسم العادي بلا مدينةٍ قابلةٍ للحلّ — لا تُحتسب في أيّ ترتيب */
  noCity: number;
  players: number;
  /** عدد صفوف (لاعب، مدينة) المكتوبة */
  rows: number;
  mismatches: number;
  applied: boolean;
  isActiveRegular: boolean;
  targetSeasonId: number | null;
  perCity?: Record<string, { players: number; rows: number }>;
  reason?: 'dry-run' | 'mass-zero-guard' | 'applied' | 'no-db' | 'no-season';
}

export interface ReconcileOptions {
  // 🎯 مصالحة مستهدفة (لكل لعبة): تكتب فقط هؤلاء اللاعبين بقيَم مطلقة من مصدر الحقيقة،
  // بلا تصفير الجميع → لا وميض ولا تسابق بين غرف متزامنة. تُستخدم بعد كل مباراة (finalizeIfDecided).
  onlyPlayerIds?: number[];
}

const ZERO = {
  xp: 0, level: 1, rankRR: 0, rankTier: 'INFORMANT',
  totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0,
};

/**
 * يعيد اشتقاق تقدّم الموسم من match_players (مصدر الحقيقة) — لكلّ مدينةٍ على حدة في المواسم العاديّة.
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
  const base = { counted: 0, skipped: 0, noCity: 0, players: 0, rows: 0, mismatches: 0, applied: false, isActiveRegular: false, targetSeasonId };
  if (!db) return { ...base, reason: 'no-db' };
  const onlyPlayerIds = opts.onlyPlayerIds && opts.onlyPlayerIds.length > 0
    ? new Set(opts.onlyPlayerIds) : null;

  // 1) تحميل إعدادات التقدّم + ضبط عتبات الرتب (نفس مصدر الاحتساب الحيّ)
  let cfg: any;
  try { cfg = await getProgressionConfig(); } catch { cfg = undefined; }
  applyProgressionConfig(cfg);

  // نطاق الموسم: null ⇒ الموسم العادي النشط
  const { getActiveRegularSeasonId } = await import('./season.service.js');
  const activeRegularId = await getActiveRegularSeasonId();
  if (targetSeasonId == null) targetSeasonId = activeRegularId;
  if (targetSeasonId == null) {
    log('❌ No target season (no active regular season) — nothing to reconcile.');
    return { ...base, targetSeasonId: null, reason: 'no-season' };
  }
  const isActiveRegular = targetSeasonId === activeRegularId;

  // نوع الموسم المستهدف — يحدّد النطاق: عادي ⇒ بالمدينة؛ أونلاين ⇒ البعيدة فقط؛ بطولة ⇒ الموسم وحده
  const { seasons } = await import('../schemas/season.schema.js');
  const [ts] = await db.select({ type: seasons.type }).from(seasons).where(eq(seasons.id, targetSeasonId)).limit(1);
  const seasonType = String(ts?.type || 'REGULAR');
  const targetIsOnline = seasonType === 'ONLINE';
  const targetIsRegular = seasonType === 'REGULAR';
  log(`🏆 Target season: ${targetSeasonId} (${seasonType})${targetIsRegular ? ' → standings per city' : targetIsOnline ? ' → remote matches only' : ' → season scope only'}`);

  // 2) سحب صفوف match_players مع الفائز + علم موقع الاختبار + مدينة المباراة (ختمٌ أو مكانُ الفعاليّة)
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
    matchCityId: matches.cityId,
    isTestLocation: locations.isTestLocation,
    locCityId: locations.cityId,
    isRemote: sessions.isRemote,
  })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .leftJoin(sessions, eq(matches.sessionId, sessions.id))
    .leftJoin(activities, eq(sessions.activityId, activities.id))
    .leftJoin(locations, eq(activities.locationId, locations.id));

  const rows = await (onlyPlayerIds
    ? sel.where(and(inArray(matchPlayers.playerId, [...onlyPlayerIds]), eq(matches.seasonId, targetSeasonId)))
    : sel.where(eq(matches.seasonId, targetSeasonId))
  ).orderBy(asc(matchPlayers.matchId), asc(matchPlayers.id));

  log(`📊 Fetched ${rows.length} match_player rows for season #${targetSeasonId}.`);

  // 3) فلترة: استبعاد مواقع الاختبار + فصل الأونلاين عن الوجاهيّ + (عادي) المدينة إلزاميّة
  let noCity = 0;
  const counted = rows.filter(r => {
    if (r.isTestLocation === true) return false;
    if (targetIsOnline ? r.isRemote !== true : r.isRemote === true) return false;
    if (targetIsRegular && (r.matchCityId ?? r.locCityId) == null) { noCity++; return false; }
    return true;
  });
  const skipped = rows.length - counted.length;
  log(`✅ Counted: ${counted.length} | ⛔ Skipped (test/remote-mismatch/no-city): ${skipped}${noCity ? ` (no-city: ${noCity})` : ''}`);

  // 4) إعادة اللعب في الذاكرة لكل (لاعب، مدينة) بالترتيب الزمني
  const accs = new Map<string, PlayerAcc>();
  let noPlayerId = 0;
  let dupSkipped = 0;
  const seen = new Set<string>(); // (matchId:playerId) — إزالة الصفوف المكرّرة من finalize مزدوج تاريخي
  for (const r of counted) {
    if (!r.playerId) { noPlayerId++; continue; }
    const key = `${r.matchId}:${r.playerId}`;
    if (seen.has(key)) { dupSkipped++; continue; }
    seen.add(key);
    const cityId = targetIsRegular ? (r.matchCityId ?? r.locCityId ?? null) : null;
    const k = accKey(r.playerId, cityId);
    let acc = accs.get(k);
    if (!acc) { acc = newAcc(r.playerId, cityId, r.playerName); accs.set(k, acc); }

    // القيم المخزّنة xpEarned/rrChange دقيقة 100% لكل الأدوار (تطابق الاحتساب الحيّ).
    const isNeutral = r.role === 'JESTER' || r.role === 'ASSASSIN';
    const storedXp = r.xpEarned || 0;
    const storedRr = r.rrChange || 0;

    const basePts = computeMatchReward({
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

    const won = basePts.won;
    // المخزّن هو المجموع النهائيّ لكل الأدوار (بما فيها المحايدون). الاستثناء: صفّ محايد قديم لم يُخزَّن (0,0).
    const isLegacyUnstoredNeutral = isNeutral && storedXp === 0 && storedRr === 0;
    const xpEarned = isLegacyUnstoredNeutral ? basePts.xpEarned : storedXp;
    const rrChange = isLegacyUnstoredNeutral ? basePts.rrChange : storedRr;

    applyXPInMemory(acc, xpEarned);
    applyRRInMemory(acc, rrChange);
    acc.totalMatches += 1;
    acc.totalWins += won ? 1 : 0;
    acc.totalSurvived += r.survivedToEnd ? 1 : 0;
    acc.totalDeals += r.dealInitiated ? 1 : 0;
    acc.successfulDeals += r.dealSuccess ? 1 : 0;
  }

  // 4.5) 🎁 مكافآت التقدّم اليدويّة (rank_bonuses) — ضمن الموسم المستهدف **وبمدينتها**، فلا تمحوها إعادة الاحتساب.
  try {
    const bres: any = await db.execute(sql`SELECT player_id, rr, COALESCE(xp, 0) AS xp, city_id FROM rank_bonuses WHERE season_id = ${targetSeasonId} ORDER BY id ASC`);
    const blist: any[] = bres?.rows ?? (Array.isArray(bres) ? bres : []);
    let bonusApplied = 0, bonusNoCity = 0;
    for (const b of blist) {
      const pid = Number(b.player_id);
      if (!pid || (onlyPlayerIds && !onlyPlayerIds.has(pid))) continue;
      const cityId = targetIsRegular ? (b.city_id != null ? Number(b.city_id) : null) : null;
      if (targetIsRegular && cityId == null) { bonusNoCity++; continue; } // مكافأةٌ بلا مدينة لا تُنسب لترتيبٍ عشوائيّ
      const k = accKey(pid, cityId);
      let acc = accs.get(k);
      if (!acc) { acc = newAcc(pid, cityId, `#${pid}`); accs.set(k, acc); }
      applyXPInMemory(acc, Number(b.xp) || 0);
      applyRRInMemory(acc, Number(b.rr) || 0);
      bonusApplied++;
    }
    if (bonusApplied) log(`🎁 Applied ${bonusApplied} manual progression bonuses (rank_bonuses: RR+XP)`);
    if (bonusNoCity) log(`⚠️ ${bonusNoCity} rank_bonuses rows have no city_id — NOT applied (regular season needs a city)`);
  } catch { /* الجدول غير موجود بعد — لا مكافآت */ }

  const playerIdsComputed = new Set([...accs.values()].map(a => a.playerId));
  const perCity: Record<string, { players: number; rows: number }> = {};
  for (const a of accs.values()) {
    const k = String(a.cityId ?? 'none');
    perCity[k] = perCity[k] || { players: 0, rows: 0 };
    perCity[k].players++; perCity[k].rows++;
  }
  log(`👤 Players: ${playerIdsComputed.size} | (player,city) rows: ${accs.size} | rows without playerId: ${noPlayerId} | duplicate rows skipped: ${dupSkipped}`);

  // 5) تقرير المقارنة (المخزّن مقابل المحسوب) — يُتخطّى في المصالحة المستهدفة لتوفير الوقت
  let mismatches = 0;
  if (!onlyPlayerIds) {
    for (const acc of accs.values()) {
      const [cur] = await db.select({
        totalMatches: playerSeasonStats.totalMatches, rankRR: playerSeasonStats.rankRR, rankTier: playerSeasonStats.rankTier,
      }).from(playerSeasonStats).where(and(
        eq(playerSeasonStats.playerId, acc.playerId), eq(playerSeasonStats.seasonId, targetSeasonId),
        acc.cityId == null ? sql`${playerSeasonStats.cityId} IS NULL` : eq(playerSeasonStats.cityId, acc.cityId),
      )).limit(1);
      const newTier = RANK_TIERS[acc.tierIdx];
      const storedMatches = cur?.totalMatches ?? 0;
      if (storedMatches !== acc.totalMatches || (cur?.rankTier ?? 'INFORMANT') !== newTier || (cur?.rankRR ?? 0) !== acc.rr) {
        mismatches++;
        if (mismatches <= 30) {
          log(`  #${acc.playerId} ${acc.name} [city ${acc.cityId ?? '-'}]: matches ${storedMatches}→${acc.totalMatches} | tier ${cur?.rankTier ?? '-'}→${newTier} | RR ${cur?.rankRR ?? 0}→${acc.rr} | L${acc.level}`);
        }
      }
    }
    log(`🔎 (player,city) rows with differences: ${mismatches}`);
  }

  // 6) التطبيق (فقط مع apply)
  if (!apply) {
    log('🔍 DRY-RUN complete. No changes written.');
    return { counted: counted.length, skipped, noCity, players: playerIdsComputed.size, rows: accs.size, mismatches, applied: false, isActiveRegular, targetSeasonId, perCity, reason: 'dry-run' };
  }

  // 🛡️ حارس أمان: لا نصفّر شيئاً إذا لم يُحسب أي لاعب (مصالحة كاملة).
  if (accs.size === 0 && !onlyPlayerIds) {
    log('❌ Aborting: 0 players computed for this season — refusing to zero anything. No changes written.');
    return { counted: counted.length, skipped, noCity, players: 0, rows: 0, mismatches, applied: false, isActiveRegular, targetSeasonId, perCity, reason: 'mass-zero-guard' };
  }

  const setFor = (acc: PlayerAcc | undefined) => acc ? {
    xp: acc.xp, level: acc.level, rankRR: acc.rr, rankTier: RANK_TIERS[acc.tierIdx],
    totalMatches: acc.totalMatches, totalWins: acc.totalWins, totalSurvived: acc.totalSurvived,
    totalDeals: acc.totalDeals, successfulDeals: acc.successfulDeals,
  } : { ...ZERO };

  log(`⚠️  Applying... (season: ${targetSeasonId}, activeRegular: ${isActiveRegular}, mode: ${onlyPlayerIds ? `targeted×${onlyPlayerIds.size}` : 'full'})`);

  // المعرّفات المراد كتابتها: المستهدفون فقط (لكل لعبة) أو كل المحسوبين (مصالحة كاملة)
  const idsToWrite: number[] = onlyPlayerIds ? [...onlyPlayerIds] : [...playerIdsComputed];

  // ── (أ) player_season_stats — صفٌّ لكلّ (لاعب، موسم، مدينة) ──
  if (onlyPlayerIds) {
    // مستهدفة: تصفير صفوف هؤلاء اللاعبين في الموسم (مدنٌ لم يبقَ لها مباريات تعود صفراً) ثمّ كتابة المحسوب
    await db.update(playerSeasonStats).set({ ...ZERO, updatedAt: new Date() } as any)
      .where(and(eq(playerSeasonStats.seasonId, targetSeasonId), inArray(playerSeasonStats.playerId, idsToWrite)));
  } else {
    // كاملة: تصفير كلّ صفوف الموسم ثمّ كتابة المحسوب (الحارس أعلاه يضمن أنّ هناك ما يُكتب)
    await db.update(playerSeasonStats).set({ ...ZERO, updatedAt: new Date() } as any)
      .where(eq(playerSeasonStats.seasonId, targetSeasonId));
  }
  let written = 0;
  for (const acc of accs.values()) {
    if (onlyPlayerIds && !onlyPlayerIds.has(acc.playerId)) continue;
    const set = setFor(acc);
    await db.insert(playerSeasonStats)
      .values({ playerId: acc.playerId, seasonId: targetSeasonId, cityId: acc.cityId } as any)
      .onConflictDoNothing();
    await db.update(playerSeasonStats).set({ ...set, updatedAt: new Date() } as any).where(and(
      eq(playerSeasonStats.playerId, acc.playerId),
      eq(playerSeasonStats.seasonId, targetSeasonId),
      acc.cityId == null ? sql`${playerSeasonStats.cityId} IS NULL` : eq(playerSeasonStats.cityId, acc.cityId),
    ));
    written++;
  }
  log(`✅ player_season_stats ${onlyPlayerIds ? 'targeted-reconciled' : 'rebuilt'} for season #${targetSeasonId} — ${written} (player,city) rows.`);

  // ── (ب) players.* — مرآةُ (الموسم العادي النشط، المدينة الأساسيّة) ──
  if (isActiveRegular) {
    if (!onlyPlayerIds) {
      // المصالحة الكاملة تصفّر الجميع أولاً؛ المستهدفة تكتب اللاعبين المعنيين بقيَم مطلقة بلا تصفير
      await db.update(players).set({ ...ZERO } as any);
    }
    const { syncPlayerMirror } = await import('./season.service.js');
    for (const pid of idsToWrite) {
      await syncPlayerMirror(pid, targetSeasonId).catch((e: any) => log(`⚠️ mirror #${pid}: ${e?.message || e}`));
    }
    log(`✅ players.* mirror ${onlyPlayerIds ? 'targeted-synced' : 'rebuilt (others reset to 0)'} — ${idsToWrite.length} players.`);
  } else {
    log(`ℹ️  Target season #${targetSeasonId} is NOT the active regular season → players.* left untouched.`);
  }

  return { counted: counted.length, skipped, noCity, players: idsToWrite.length, rows: written, mismatches, applied: true, isActiveRegular, targetSeasonId, perCity, reason: 'applied' };
}
