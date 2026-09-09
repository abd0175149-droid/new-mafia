// ══════════════════════════════════════════════════════
// 🏆 خدمة المواسم — Season Service
// مواسم متزامنة: موسم عادي واحد (ترتيبٌ مستقلّ لكلّ **مدينة** داخله) + مواسم بطولات
// مرتبطة بموقع محدّد + موسم أونلاين. إحصاءاتُ كلّ نطاقٍ في player_season_stats
// بمفتاح (لاعب، موسم، مدينة|NULL)؛ وplayers.* مرآةٌ لصفّ (الموسم العادي النشط، المدينة الأساسيّة).
//
// 🏙️ القاعدة: المدينةُ من مكان الفعاليّة/الغرفة لا من اللاعب، وتُختَم على المباراة وتُجمَّد.
//    بلا مكانٍ لا مدينةَ فلا رتبة (fail-safe — نفس منطق الأونلاين بلا موسمٍ نشط).
// ══════════════════════════════════════════════════════

import { eq, and, sql, desc, isNull, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { seasons, playerSeasonStats } from '../schemas/season.schema.js';
import { players } from '../schemas/player.schema.js';
import { matches } from '../schemas/game.schema.js';
import { activities, locations, cities } from '../schemas/admin.schema.js';
import {
  RANK_TIERS, RANK_ORDER, xpForNextLevel, rrRequiredForTier, advanceXP, advanceRR, tierIndexOf, type RankTier,
} from './progression.service.js';
import { listCities, getCity } from './cities.service.js';

export interface SeasonRow {
  id: number; name: string; seasonNumber: number;
  type: string; locationId: number | null; status: string;
  startedAt: Date; endedAt: Date | null;
}

/** نطاقُ احتساب مباراة/مكافأة: الموسم + (المدينة إن كان عاديًّا). */
export interface RankScope {
  seasonId: number | null;
  /** موسمٌ عاديّ (ترتيبٌ بالمدينة) — لا بطولة ولا أونلاين */
  isRegular: boolean;
  /** نطاقُ التصنيف: مدينةُ المكان للموسم العادي؛ null للبطولة/الأونلاين/غير المحتسب */
  cityId: number | null;
  locationId: number | null;
  /** هل ستُحتسب النقاط أصلاً؟ (seasonId != null) */
  counted: boolean;
  kind: 'REGULAR' | 'TOURNAMENT' | 'ONLINE' | 'NONE';
}

export const NO_SCOPE: RankScope = { seasonId: null, isRegular: false, cityId: null, locationId: null, counted: false, kind: 'NONE' };

// ── كاش الموسم العادي النشط (يُبطَل عند تغيّر المواسم) ──
let activeRegularCache: { id: number; at: number } | null = null;
let activeOnlineCache: { id: number | null; at: number } | null = null;
export function invalidateSeasonCache() { activeRegularCache = null; activeOnlineCache = null; }

// ── جلب الموسم العادي النشط (مع كاش 30 ثانية) ──
export async function getActiveRegularSeasonId(): Promise<number | null> {
  if (activeRegularCache && Date.now() - activeRegularCache.at < 30000) return activeRegularCache.id;
  const db = getDB();
  if (!db) return null;
  const [row] = await db.select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.type, 'REGULAR'), eq(seasons.status, 'ACTIVE')))
    .limit(1);
  if (!row) return null;
  activeRegularCache = { id: row.id, at: Date.now() };
  return row.id;
}

// ── جلب الموسم العادي النشط مع اسمه (للعرض العام في واجهة اللاعب) ──
export async function getActiveRegularSeason(): Promise<{ id: number; name: string; seasonNumber: number } | null> {
  const db = getDB();
  if (!db) return null;
  const [row] = await db.select({ id: seasons.id, name: seasons.name, seasonNumber: seasons.seasonNumber })
    .from(seasons)
    .where(and(eq(seasons.type, 'REGULAR'), eq(seasons.status, 'ACTIVE')))
    .limit(1);
  return row || null;
}

export async function getSeasonName(seasonId: number | null | undefined): Promise<string | null> {
  if (!seasonId) return null;
  const db = getDB();
  if (!db) return null;
  const [row] = await db.select({ name: seasons.name }).from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  return row?.name ?? null;
}

// ── إعادة تسمية موسم ──
export async function renameSeason(id: number, name: string): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  await db.update(seasons).set({ name } as any).where(eq(seasons.id, id));
  return true;
}

// ── جلب بطولة نشطة لموقع محدّد (أو null) ──
export async function getActiveTournamentForLocation(locationId: number | null): Promise<number | null> {
  if (!locationId) return null;
  const db = getDB();
  if (!db) return null;
  const [row] = await db.select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.type, 'TOURNAMENT'), eq(seasons.status, 'ACTIVE'), eq(seasons.locationId, locationId)))
    .limit(1);
  return row?.id ?? null;
}

// ── جلب موسم الأونلاين النشط (النوع ONLINE) — قابل للتوسعة لعدّة مواسم أونلاين متتابعة (واحد نشط) ──
export async function getActiveOnlineSeasonId(): Promise<number | null> {
  if (activeOnlineCache && Date.now() - activeOnlineCache.at < 30000) return activeOnlineCache.id;
  const db = getDB();
  if (!db) return null;
  const [row] = await db.select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.type, 'ONLINE'), eq(seasons.status, 'ACTIVE')))
    .limit(1);
  activeOnlineCache = { id: row?.id ?? null, at: Date.now() };
  return row?.id ?? null;
}

// ══════════════════════════════════════════════════════
// 🎯 حلّ النطاق — نقطةُ الدخول الوحيدة للمكان في خطّ الرانك
// ══════════════════════════════════════════════════════

/** نطاقُ مكانٍ: بطولةُ المكان إن وُجدت، وإلا الموسم العادي **بمدينة المكان**. بلا مكانٍ ⇒ لا احتساب. */
export async function resolveScopeForLocation(locationId: number | null | undefined): Promise<RankScope> {
  if (!locationId) return NO_SCOPE;
  const db = getDB();
  if (!db) return NO_SCOPE;
  const [loc] = await db.select({ id: locations.id, cityId: locations.cityId })
    .from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!loc) return { ...NO_SCOPE, locationId };

  const tournamentId = await getActiveTournamentForLocation(locationId);
  if (tournamentId) return { seasonId: tournamentId, isRegular: false, cityId: null, locationId, counted: true, kind: 'TOURNAMENT' };

  const regularId = await getActiveRegularSeasonId();
  if (!regularId) return { seasonId: null, isRegular: false, cityId: loc.cityId ?? null, locationId, counted: false, kind: 'NONE' };
  if (loc.cityId == null) {
    // لا يحدث بعد فرض NOT NULL — يبقى حارساً: مكانٌ بلا مدينة لا يُسرَّب إلى ترتيبٍ عشوائيّ
    console.warn(`⚠️ [season] location #${locationId} has no city — match will NOT be ranked`);
    return { seasonId: null, isRegular: false, cityId: null, locationId, counted: false, kind: 'NONE' };
  }
  return { seasonId: regularId, isRegular: true, cityId: loc.cityId, locationId, counted: true, kind: 'REGULAR' };
}

// ── تحديد موسم مباراة/مكافأة من معرّف نشاطها ──
export async function resolveSeasonForActivity(activityId: number | null | undefined): Promise<RankScope> {
  const db = getDB();
  if (!db || !activityId) return NO_SCOPE;
  const [act] = await db.select({ locationId: activities.locationId }).from(activities).where(eq(activities.id, activityId)).limit(1);
  return resolveScopeForLocation(act?.locationId ?? null);
}

// ── تحديد نطاق المباراة: أونلاين إن كانت بعيدة؛ وإلا مكانُ الفعاليّة أو المكانُ الصريح للغرفة ──
// الأونلاين (isRemote) → موسم أونلاين نشط، isRegular=false (PSS فقط، بلا مدينة). إن غاب موسم أونلاين
// نشط → seasonId=null فلا يُطبَّق رانك (fail-safe، لا تسريب). الوجاهيّ → بطولة المكان أو الموسم العادي بمدينته.
export async function resolveSeasonForGame(
  activityId: number | null | undefined,
  isRemote: boolean | undefined,
  locationId?: number | null,
): Promise<RankScope> {
  if (isRemote) {
    const onlineId = await getActiveOnlineSeasonId();
    return { seasonId: onlineId, isRegular: false, cityId: null, locationId: null, counted: !!onlineId, kind: onlineId ? 'ONLINE' : 'NONE' };
  }
  let locId: number | null = null;
  if (activityId) {
    const db = getDB();
    if (db) {
      const [act] = await db.select({ locationId: activities.locationId }).from(activities).where(eq(activities.id, activityId)).limit(1);
      locId = act?.locationId ?? null;
    }
  }
  if (!locId && locationId) locId = locationId;
  return resolveScopeForLocation(locId);
}

/** أسماءٌ للعرض (أختام الليدر/التطبيق): المكان والمدينة والموسم. */
export async function describeScope(scope: RankScope): Promise<RankScope & { locationName: string | null; cityName: string | null; seasonName: string | null }> {
  const db = getDB();
  let locationName: string | null = null;
  let cityId = scope.cityId;
  if (db && scope.locationId) {
    const [loc] = await db.select({ name: locations.name, cityId: locations.cityId }).from(locations).where(eq(locations.id, scope.locationId)).limit(1);
    locationName = loc?.name ?? null;
    // للبطولة/غير المحتسب نعرض مدينةَ المكان كمعلومةٍ فقط
    if (cityId == null && loc?.cityId != null) cityId = loc.cityId;
  }
  const city = await getCity(cityId);
  const seasonName = await getSeasonName(scope.seasonId);
  return { ...scope, locationName, cityName: city?.name ?? null, seasonName };
}

// ══════════════════════════════════════════════════════
// 📊 إحصاءات (لاعب، موسم، مدينة)
// ══════════════════════════════════════════════════════

/** شرطُ الصفّ الواحد — المدينةُ الفارغة تُقارَن بـ IS NULL لا بـ = NULL */
export function pssWhere(playerId: number, seasonId: number, cityId: number | null) {
  return and(
    eq(playerSeasonStats.playerId, playerId),
    eq(playerSeasonStats.seasonId, seasonId),
    cityId == null ? isNull(playerSeasonStats.cityId) : eq(playerSeasonStats.cityId, cityId),
  );
}

// ── ضمان وجود صف إحصاءات للاعب في نطاق ──
export async function ensureStatsRow(playerId: number, seasonId: number, cityId: number | null) {
  const db = getDB()!;
  // ON CONFLICT DO NOTHING بلا هدف: يلتقط الفهرس الفريد التعبيريّ (player_id, season_id, COALESCE(city_id,0))
  await db.insert(playerSeasonStats)
    .values({ playerId, seasonId, cityId } as any)
    .onConflictDoNothing();
}

export interface ApplyResult {
  newXP: number; newLevel: number; leveledUp: boolean;
  newRR: number; newTier: RankTier; promoted: boolean; demoted: boolean;
}

// ── تطبيق التقدّم على صفّ نطاقٍ (موسم، مدينة|NULL) — يقرأ/يحسب/يكتب الصف ──
export async function applySeasonStats(
  playerId: number, seasonId: number, cityId: number | null,
  xpEarned: number, rrChange: number,
  flags: { won: boolean; survived: boolean; dealInitiated: boolean; dealSuccess: boolean; dealsCount?: number; successfulDealsCount?: number },
): Promise<ApplyResult | null> {
  const db = getDB();
  if (!db) return null;
  await ensureStatsRow(playerId, seasonId, cityId);
  const [row] = await db.select().from(playerSeasonStats).where(pssWhere(playerId, seasonId, cityId)).limit(1);
  if (!row) return null;

  const x = advanceXP(row.xp || 0, row.level || 1, xpEarned);
  const r = advanceRR(row.rankRR || 0, tierIndexOf(row.rankTier), rrChange);
  const dealsInc = flags.dealsCount ?? (flags.dealInitiated ? 1 : 0);
  const okDealsInc = flags.successfulDealsCount ?? (flags.dealSuccess ? 1 : 0);

  await db.update(playerSeasonStats).set({
    xp: x.xp, level: x.level, rankRR: r.rr, rankTier: RANK_TIERS[r.tierIdx],
    totalMatches: sql`COALESCE(${playerSeasonStats.totalMatches},0) + 1`,
    totalWins: flags.won ? sql`COALESCE(${playerSeasonStats.totalWins},0) + 1` : playerSeasonStats.totalWins,
    totalSurvived: flags.survived ? sql`COALESCE(${playerSeasonStats.totalSurvived},0) + 1` : playerSeasonStats.totalSurvived,
    totalDeals: dealsInc > 0 ? sql`COALESCE(${playerSeasonStats.totalDeals},0) + ${dealsInc}` : playerSeasonStats.totalDeals,
    successfulDeals: okDealsInc > 0 ? sql`COALESCE(${playerSeasonStats.successfulDeals},0) + ${okDealsInc}` : playerSeasonStats.successfulDeals,
    updatedAt: new Date(),
  } as any).where(pssWhere(playerId, seasonId, cityId));

  return {
    newXP: x.xp, newLevel: x.level, leveledUp: x.leveledUp,
    newRR: r.rr, newTier: RANK_TIERS[r.tierIdx], promoted: r.promoted, demoted: r.demoted,
  };
}

// ══════════════════════════════════════════════════════
// 🪞 المرآة: players.* = صفّ (الموسم العادي النشط، المدينة الأساسيّة)
// ══════════════════════════════════════════════════════

/** استنتاجُ المدينة الأساسيّة من تاريخ لعب الموسم: المدينةُ الأكثر مباريات (التعادل للأقدم رقماً). */
export async function inferHomeCity(playerId: number, seasonId: number): Promise<number | null> {
  const db = getDB();
  if (!db) return null;
  const rows = await db.select({ cityId: playerSeasonStats.cityId, tm: playerSeasonStats.totalMatches })
    .from(playerSeasonStats)
    .where(and(eq(playerSeasonStats.playerId, playerId), eq(playerSeasonStats.seasonId, seasonId), sql`${playerSeasonStats.cityId} IS NOT NULL`));
  let best: { cityId: number; tm: number } | null = null;
  for (const r of rows) {
    if (r.cityId == null) continue;
    const tm = Number(r.tm || 0);
    if (tm <= 0) continue;
    if (!best || tm > best.tm || (tm === best.tm && r.cityId < best.cityId)) best = { cityId: r.cityId, tm };
  }
  return best?.cityId ?? null;
}

/** المدينةُ الأساسيّة للاعب — المخزّنة، وإلا تُستنتج وتُخزَّن (inferred). */
export async function getOrInferHomeCity(playerId: number, seasonId?: number | null): Promise<number | null> {
  const db = getDB();
  if (!db) return null;
  const [p] = await db.select({ home: players.homeCityId }).from(players).where(eq(players.id, playerId)).limit(1);
  if (p?.home) return p.home;
  const sid = seasonId ?? await getActiveRegularSeasonId();
  if (!sid) return null;
  const inferred = await inferHomeCity(playerId, sid);
  if (inferred) {
    await db.update(players).set({ homeCityId: inferred, homeCitySource: 'inferred' } as any)
      .where(and(eq(players.id, playerId), isNull(players.homeCityId)));
  }
  return inferred;
}

const ZERO_STATS = {
  xp: 0, level: 1, rankTier: 'INFORMANT', rankRR: 0,
  totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0,
};

/**
 * يعكس صفَّ المدينة الأساسيّة (للموسم العادي النشط) على players.* — التوافق الخلفيّ
 * لكلّ من يقرأ أعمدة اللاعب مباشرةً. لا مدينةَ أساسيّة ولا تاريخ ⇒ أصفار.
 */
export async function syncPlayerMirror(playerId: number, regularSeasonId?: number | null): Promise<void> {
  const db = getDB();
  if (!db) return;
  const sid = regularSeasonId ?? await getActiveRegularSeasonId();
  if (!sid) return;
  const home = await getOrInferHomeCity(playerId, sid);
  let set: any = { ...ZERO_STATS };
  if (home) {
    const [row] = await db.select({
      xp: playerSeasonStats.xp, level: playerSeasonStats.level, rankTier: playerSeasonStats.rankTier, rankRR: playerSeasonStats.rankRR,
      totalMatches: playerSeasonStats.totalMatches, totalWins: playerSeasonStats.totalWins, totalSurvived: playerSeasonStats.totalSurvived,
      totalDeals: playerSeasonStats.totalDeals, successfulDeals: playerSeasonStats.successfulDeals,
    }).from(playerSeasonStats).where(pssWhere(playerId, sid, home)).limit(1);
    if (row) {
      set = {
        xp: row.xp ?? 0, level: row.level ?? 1, rankTier: row.rankTier ?? 'INFORMANT', rankRR: row.rankRR ?? 0,
        totalMatches: row.totalMatches ?? 0, totalWins: row.totalWins ?? 0, totalSurvived: row.totalSurvived ?? 0,
        totalDeals: row.totalDeals ?? 0, successfulDeals: row.successfulDeals ?? 0,
      };
    }
  }
  await db.update(players).set(set).where(eq(players.id, playerId));
}

// ══════════════════════════════════════════════════════
// 📖 قراءاتٌ بالنطاق
// ══════════════════════════════════════════════════════

export interface Standing {
  cityId: number | null; cityName: string | null;
  rankTier: string; rankRR: number; rrRequired: number;
  level: number; xp: number; nextLevelXP: number; xpProgress: number;
  totalMatches: number; totalWins: number; totalSurvived: number;
  totalDeals: number; successfulDeals: number; dealSuccessRate: number;
}

function toStanding(row: any, cityName: string | null): Standing {
  const xp = Number(row?.xp ?? 0);
  const level = Number(row?.level ?? 1);
  const next = xpForNextLevel(level);
  const tier = String(row?.rankTier ?? 'INFORMANT');
  const deals = Number(row?.totalDeals ?? 0);
  const okDeals = Number(row?.successfulDeals ?? 0);
  return {
    cityId: row?.cityId ?? null, cityName,
    rankTier: tier, rankRR: Number(row?.rankRR ?? 0), rrRequired: rrRequiredForTier(tier),
    level, xp, nextLevelXP: next,
    xpProgress: next > 0 ? Math.min(100, Math.max(0, Math.round((xp / next) * 100))) : 0,
    totalMatches: Number(row?.totalMatches ?? 0), totalWins: Number(row?.totalWins ?? 0), totalSurvived: Number(row?.totalSurvived ?? 0),
    totalDeals: deals, successfulDeals: okDeals, dealSuccessRate: deals > 0 ? Math.round((okDeals / deals) * 100) : 0,
  };
}

/** صفُّ لاعبٍ في (موسم، مدينة) — أصفارٌ إن لم يوجد. */
export async function getStanding(playerId: number, seasonId: number, cityId: number | null): Promise<Standing> {
  const db = getDB();
  const city = await getCity(cityId);
  if (!db) return toStanding({ cityId }, city?.name ?? null);
  const [row] = await db.select().from(playerSeasonStats).where(pssWhere(playerId, seasonId, cityId)).limit(1);
  return toStanding(row ? row : { cityId }, city?.name ?? null);
}

/** كلّ صفوف اللاعب بالمدن في موسمٍ (المدينةُ الأساسيّة أوّلاً) — الصفوفُ ذات المباريات فقط. */
export async function getStandings(playerId: number, seasonId: number, homeCityId?: number | null): Promise<Standing[]> {
  const db = getDB();
  if (!db) return [];
  const rows = await db.select({
    pss: playerSeasonStats, cityName: cities.name, citySort: cities.sortOrder,
  }).from(playerSeasonStats)
    .leftJoin(cities, eq(playerSeasonStats.cityId, cities.id))
    .where(and(eq(playerSeasonStats.playerId, playerId), eq(playerSeasonStats.seasonId, seasonId), sql`${playerSeasonStats.cityId} IS NOT NULL`));
  const out = rows
    .filter(r => Number(r.pss.totalMatches || 0) > 0 || r.pss.cityId === homeCityId)
    .map(r => ({ s: toStanding(r.pss, r.cityName ?? null), sort: r.citySort ?? 0 }))
    .sort((a, b) => (a.s.cityId === homeCityId ? -1 : b.s.cityId === homeCityId ? 1 : (a.sort - b.sort) || ((a.s.cityId || 0) - (b.s.cityId || 0))))
    .map(x => x.s);
  return out;
}

/** أعلى رتبةٍ للاعب عبر مدنه (مؤشّرُ مهارة — للجلوس؛ قرار ٩). */
export async function getBestStanding(playerId: number, seasonId: number): Promise<Standing | null> {
  const all = await getStandings(playerId, seasonId);
  if (all.length === 0) return null;
  return all.reduce((best, s) => {
    const bo = RANK_ORDER[best.rankTier as RankTier] ?? 0, so = RANK_ORDER[s.rankTier as RankTier] ?? 0;
    return so > bo || (so === bo && s.rankRR > best.rankRR) ? s : best;
  });
}

// ── لوحة ترتيب (موسم، مدينة|NULL) — لاعبو النطاق فقط (total_matches > 0) ──
export async function getSeasonLeaderboard(seasonId: number, cityId: number | null, limit = 50): Promise<any[]> {
  const db = getDB();
  if (!db) return [];
  return db.select({
    playerId: playerSeasonStats.playerId,
    name: players.name, avatarUrl: players.avatarUrl,
    level: playerSeasonStats.level, xp: playerSeasonStats.xp,
    rankTier: playerSeasonStats.rankTier, rankRR: playerSeasonStats.rankRR,
    totalMatches: playerSeasonStats.totalMatches, totalWins: playerSeasonStats.totalWins,
    cityId: playerSeasonStats.cityId,
  }).from(playerSeasonStats)
    .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
    .where(and(
      eq(playerSeasonStats.seasonId, seasonId),
      cityId == null ? isNull(playerSeasonStats.cityId) : eq(playerSeasonStats.cityId, cityId),
      sql`COALESCE(${playerSeasonStats.totalMatches}, 0) > 0`,
    ))
    .orderBy(
      sql`CASE ${playerSeasonStats.rankTier} WHEN 'GODFATHER' THEN 5 WHEN 'UNDERBOSS' THEN 4 WHEN 'CAPO' THEN 3 WHEN 'SOLDIER' THEN 2 ELSE 1 END DESC`,
      desc(playerSeasonStats.rankRR), desc(playerSeasonStats.level),
    ).limit(limit);
}

/** إحصاءُ كلّ مدينةٍ في موسمٍ عاديّ: لاعبون (بمباراةٍ واحدة على الأقلّ) ومباريات. المدنُ الفعّالة كلّها تظهر ولو بصفر. */
export async function getSeasonCityStats(seasonId: number): Promise<Array<{ id: number; name: string; players: number; matches: number }>> {
  const db = getDB();
  if (!db) return [];
  const active = await listCities({ activeOnly: true });
  const pRows = await db.select({ cityId: playerSeasonStats.cityId, n: sql<number>`COUNT(*)::int` })
    .from(playerSeasonStats)
    .where(and(eq(playerSeasonStats.seasonId, seasonId), sql`COALESCE(${playerSeasonStats.totalMatches},0) > 0`, sql`${playerSeasonStats.cityId} IS NOT NULL`))
    .groupBy(playerSeasonStats.cityId);
  const mRows = await db.select({ cityId: matches.cityId, n: sql<number>`COUNT(*)::int` })
    .from(matches)
    .where(and(eq(matches.seasonId, seasonId), isNull(matches.deletedAt), sql`${matches.cityId} IS NOT NULL`))
    .groupBy(matches.cityId);
  const pMap = new Map(pRows.map(r => [Number(r.cityId), Number(r.n)]));
  const mMap = new Map(mRows.map(r => [Number(r.cityId), Number(r.n)]));
  const ids = new Set<number>([...active.map(c => c.id), ...pMap.keys(), ...mMap.keys()]);
  const all = await listCities();
  const nameOf = (id: number) => all.find(c => c.id === id)?.name ?? `مدينة #${id}`;
  return [...ids]
    .sort((a, b) => ((all.find(c => c.id === a)?.sortOrder ?? 99) - (all.find(c => c.id === b)?.sortOrder ?? 99)) || a - b)
    .map(id => ({ id, name: nameOf(id), players: pMap.get(id) ?? 0, matches: mMap.get(id) ?? 0 }));
}

// ── قائمة المواسم (مع عدد المباريات + إحصاء المدن للمواسم العاديّة) ──
export async function listSeasons(): Promise<any[]> {
  const db = getDB();
  if (!db) return [];
  const rows = await db.select({
    id: seasons.id, name: seasons.name, seasonNumber: seasons.seasonNumber,
    type: seasons.type, locationId: seasons.locationId, status: seasons.status,
    startedAt: seasons.startedAt, endedAt: seasons.endedAt,
    matchCount: sql<number>`(SELECT COUNT(*)::int FROM ${matches} WHERE ${matches.seasonId} = ${seasons.id})`,
  }).from(seasons).orderBy(desc(seasons.startedAt));
  const out: any[] = [];
  for (const r of rows) {
    out.push(r.type === 'REGULAR' ? { ...r, cities: await getSeasonCityStats(r.id) } : { ...r, cities: [] });
  }
  return out;
}

// ── بدء موسم بطولة لموقع (لا يصفّر players.*) ──
export async function startTournamentSeason(name: string, locationId: number, createdBy?: number): Promise<SeasonRow> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const existing = await getActiveTournamentForLocation(locationId);
  if (existing) throw new Error('يوجد بطولة نشطة بالفعل لهذا الموقع');
  const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(${seasons.seasonNumber}),0)::int` }).from(seasons);
  const [row] = await db.insert(seasons).values({
    name, seasonNumber: (maxNum || 0) + 1, type: 'TOURNAMENT', locationId, status: 'ACTIVE', createdBy: createdBy ?? null,
  } as any).returning();
  return row as any;
}

// ── إنهاء موسم (بطولة أو عادي) ──
export async function endSeason(seasonId: number): Promise<void> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  await db.update(seasons).set({ status: 'ENDED', endedAt: new Date() } as any).where(eq(seasons.id, seasonId));
  invalidateSeasonCache();
}

// ── بدء موسم عادي جديد: يثبّت أرشيف الحالي (كلّ مدنه) + ينهيه + يصفّر مرآة players.* + يبدأ موسماً ──
// ⚠️ يجب ألا تكون هناك مباريات جارية (يفحصها المُستدعي).
export async function startRegularSeason(name: string, createdBy?: number): Promise<SeasonRow> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  const currentId = await getActiveRegularSeasonId();

  // 0) 🧊 لقطة التثبيت النهائية: مصالحة كاملة للموسم المنتهي (كلّ المدن معاً) من مصدر الحقيقة
  //    (match_players + rank_bonuses) قبل إنهائه — فشل اللقطة = إجهاض التبديل.
  if (currentId) {
    const { reconcileSeasonProgression } = await import('./reconcile.service.js');
    const snap = await reconcileSeasonProgression(currentId, true);
    if (!snap.applied && snap.reason !== 'mass-zero-guard') {
      throw new Error(`فشل تثبيت أرشيف الموسم #${currentId} قبل الإنهاء (${snap.reason}) — أُجهض بدء الموسم الجديد`);
    }
    console.log(`🧊 [startRegularSeason] Season #${currentId} archive frozen — players=${snap.players}, counted=${snap.counted}, reason=${snap.reason}`);
  }

  // 1) إنهاء الموسم العادي الحالي (إن وُجد)
  if (currentId) {
    await db.update(seasons).set({ status: 'ENDED', endedAt: new Date() } as any).where(eq(seasons.id, currentId));
  }

  // 2) إنشاء الموسم العادي الجديد
  const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(${seasons.seasonNumber}),0)::int` }).from(seasons);
  const [row] = await db.insert(seasons).values({
    name, seasonNumber: (maxNum || 0) + 1, type: 'REGULAR', status: 'ACTIVE', createdBy: createdBy ?? null,
  } as any).returning();

  // 3) تصفير مرآة players.* (التقدّم فقط — لا تُلمس الهوية ولا lifetime_matches ولا home_city_id)
  // 🪙 قائمة بيضاء صريحة عمداً: أي عمود غير مذكور هنا لا يُمَس — وهذا ما يضمن
  //    بقاء chips_balance وخانات التجهيز بين المواسم (رصيد التشبس لا ينتهي أبداً).
  //    ⛔ لا تحوّل هذا إلى تصفير شامل ولا تضف أي عمود chips_* هنا.
  await db.update(players).set({
    xp: 0, level: 1, rankTier: 'INFORMANT', rankRR: 0,
    totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0,
  } as any);

  invalidateSeasonCache();
  return row as any;
}

// ── بدء موسم أونلاين جديد: ينهي الأونلاين الحاليّ + يبدأ موسماً أونلاين (لا يمسّ players.* ولا الرانك الوجاهيّ) ──
export async function startOnlineSeason(name: string, createdBy?: number): Promise<SeasonRow> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const currentId = await getActiveOnlineSeasonId();
  if (currentId) {
    await db.update(seasons).set({ status: 'ENDED', endedAt: new Date() } as any).where(eq(seasons.id, currentId));
  }
  const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(${seasons.seasonNumber}),0)::int` }).from(seasons);
  const [row] = await db.insert(seasons).values({
    name, seasonNumber: (maxNum || 0) + 1, type: 'ONLINE', status: 'ACTIVE', createdBy: createdBy ?? null,
  } as any).returning();
  invalidateSeasonCache();
  return row as any;
}

// ══════════════════════════════════════════════════════
// 🎁 مكافأة الترحيب — في الدفتر لا على العمود وحدَه
// ══════════════════════════════════════════════════════
// 🔴 كانت تُكتب على `players.xp = 200` عند التسجيل فقط. والمصالحة تُعيد اشتقاق
//    التقدّم من match_players + rank_bonuses وتُصفّر ما عداهما — فأوّلُ مصالحةٍ
//    بعد أوّل مباراةٍ للاعب الجديد تمحو مكافأتَه. قِيس على الإنتاج (2026-09-09):
//    لاعبان جديدان فقدا ٢٠٠ نقطةٍ لكلٍّ منهما لحظةَ أوّل إعادة احتساب.
//    الدفترُ هو الناجي الوحيد، فتُسجَّل فيه — والعمودُ يبقى مرآةً كبقيّة الأرقام.
//
// ⚠️ تحتاج مدينةً: مكافأةُ موسمٍ عاديّ بلا مدينةٍ تتخطّاها المصالحة. فمن سجّل بلا
//    مدينةٍ تُسجَّل له لحظةَ تحديد مدينته الأساسيّة (PUT /me/home-city).
export const WELCOME_BONUS_REASON = 'welcome-bonus';
export const WELCOME_BONUS_XP = 200;

/** يسجّل مكافأة الترحيب في الدفتر إن لم تكن مسجّلةً. آمنٌ للتكرار (المفتاح: لاعب + سبب). */
export async function ensureWelcomeBonusLedger(playerId: number, cityId: number | null): Promise<boolean> {
  const db = getDB();
  if (!db || !playerId || !cityId) return false;
  try {
    const seasonId = await getActiveRegularSeasonId();
    if (!seasonId) return false;
    const [p] = await db.select({ applied: players.welcomeBonusApplied }).from(players).where(eq(players.id, playerId)).limit(1);
    if (!p?.applied) return false; // لم يُمنح أصلاً (حسابٌ مهاجَر) — لا نخترع مكافأة
    const res: any = await db.execute(sql`
      INSERT INTO rank_bonuses (player_id, rr, xp, reason, season_id, city_id, meta)
      SELECT ${playerId}, 0, ${WELCOME_BONUS_XP}, ${WELCOME_BONUS_REASON}, ${seasonId}, ${cityId},
             ${JSON.stringify({ kind: 'welcome-bonus' })}::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM rank_bonuses WHERE player_id = ${playerId} AND reason = ${WELCOME_BONUS_REASON})
      RETURNING id`);
    const inserted = ((res?.rows ?? res ?? []) as any[]).length > 0;
    if (inserted) console.log(`🎁 [welcome] ledgered ${WELCOME_BONUS_XP} XP for player #${playerId} (city ${cityId}, season ${seasonId})`);
    return inserted;
  } catch (e: any) {
    console.warn(`⚠️ [welcome] ledger failed for player #${playerId}:`, e?.message || e);
    return false;
  }
}

/** كسرُ التعادل في العرض: هل يملك اللاعب أيَّ صفٍّ بمباريات في المدينة؟ */
export async function hasStandingIn(playerIds: number[], seasonId: number, cityId: number): Promise<Set<number>> {
  const db = getDB();
  const out = new Set<number>();
  if (!db || playerIds.length === 0) return out;
  const rows = await db.select({ pid: playerSeasonStats.playerId }).from(playerSeasonStats)
    .where(and(inArray(playerSeasonStats.playerId, playerIds), eq(playerSeasonStats.seasonId, seasonId), eq(playerSeasonStats.cityId, cityId), sql`COALESCE(${playerSeasonStats.totalMatches},0) > 0`));
  for (const r of rows) out.add(r.pid);
  return out;
}
