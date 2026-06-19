// ══════════════════════════════════════════════════════
// 🏆 خدمة المواسم — Season Service
// مواسم متزامنة: موسم عادي (يرتّب كل اللاعبين عبر players.*) + مواسم بطولات
// مرتبطة بموقع محدّد (إحصاءاتها مستقلة في player_season_stats فقط).
// ══════════════════════════════════════════════════════

import { eq, and, sql, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { seasons, playerSeasonStats } from '../schemas/season.schema.js';
import { players } from '../schemas/player.schema.js';
import { matches, sessions } from '../schemas/game.schema.js';
import { activities } from '../schemas/admin.schema.js';
import { RANK_TIERS, RANK_RR_REQUIRED, xpForNextLevel, DEMOTION_RETURN_PERCENT, type RankTier } from './progression.service.js';

export interface SeasonRow {
  id: number; name: string; seasonNumber: number;
  type: string; locationId: number | null; status: string;
  startedAt: Date; endedAt: Date | null;
}

// ── كاش الموسم العادي النشط (يُبطَل عند تغيّر المواسم) ──
let activeRegularCache: { id: number; at: number } | null = null;
export function invalidateSeasonCache() { activeRegularCache = null; }

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

// ── تحديد موسم مباراة من معرّف نشاطها (بطولة الموقع إن وُجدت، وإلا العادي) ──
export async function resolveSeasonForActivity(activityId: number | null | undefined): Promise<{ seasonId: number | null; isRegular: boolean }> {
  const db = getDB();
  if (!db) return { seasonId: null, isRegular: true };
  let locationId: number | null = null;
  if (activityId) {
    const [act] = await db.select({ locationId: activities.locationId }).from(activities).where(eq(activities.id, activityId)).limit(1);
    locationId = act?.locationId ?? null;
  }
  const tournamentId = await getActiveTournamentForLocation(locationId);
  if (tournamentId) return { seasonId: tournamentId, isRegular: false };
  const regularId = await getActiveRegularSeasonId();
  return { seasonId: regularId, isRegular: true };
}

// ── ضمان وجود صف إحصاءات للاعب في موسم ──
async function ensureStatsRow(playerId: number, seasonId: number) {
  const db = getDB()!;
  await db.insert(playerSeasonStats)
    .values({ playerId, seasonId } as any)
    .onConflictDoNothing();
}

// ── تطبيق التقدّم على صف موسم (للبطولات أساساً) — يقرأ/يحسب/يكتب الصف ──
export async function applySeasonStats(
  playerId: number, seasonId: number,
  xpEarned: number, rrChange: number,
  flags: { won: boolean; survived: boolean; dealInitiated: boolean; dealSuccess: boolean },
): Promise<void> {
  const db = getDB();
  if (!db) return;
  await ensureStatsRow(playerId, seasonId);
  const [row] = await db.select().from(playerSeasonStats)
    .where(and(eq(playerSeasonStats.playerId, playerId), eq(playerSeasonStats.seasonId, seasonId))).limit(1);
  if (!row) return;

  // XP + Level
  let xp = (row.xp || 0) + xpEarned;
  let level = row.level || 1;
  while (xp >= xpForNextLevel(level)) { xp -= xpForNextLevel(level); level++; }

  // RR + Tier (نفس منطق applyRR — تصاعدي)
  let rr = (row.rankRR || 0) + rrChange;
  let tierIdx = RANK_TIERS.indexOf((row.rankTier || 'INFORMANT') as RankTier);
  if (tierIdx < 0) tierIdx = 0;
  while (tierIdx < RANK_TIERS.length - 1 && rr >= RANK_RR_REQUIRED[RANK_TIERS[tierIdx]]) {
    rr -= RANK_RR_REQUIRED[RANK_TIERS[tierIdx]]; tierIdx++;
  }
  while (rr < 0 && tierIdx > 0) { tierIdx--; rr += Math.floor(RANK_RR_REQUIRED[RANK_TIERS[tierIdx]] * (DEMOTION_RETURN_PERCENT / 100)); }
  if (rr < 0) rr = 0;
  const maxRR = RANK_RR_REQUIRED[RANK_TIERS[tierIdx]];
  if (rr > maxRR) rr = maxRR;

  await db.update(playerSeasonStats).set({
    xp, level, rankRR: rr, rankTier: RANK_TIERS[tierIdx],
    totalMatches: sql`COALESCE(${playerSeasonStats.totalMatches},0) + 1`,
    totalWins: flags.won ? sql`COALESCE(${playerSeasonStats.totalWins},0) + 1` : playerSeasonStats.totalWins,
    totalSurvived: flags.survived ? sql`COALESCE(${playerSeasonStats.totalSurvived},0) + 1` : playerSeasonStats.totalSurvived,
    totalDeals: flags.dealInitiated ? sql`COALESCE(${playerSeasonStats.totalDeals},0) + 1` : playerSeasonStats.totalDeals,
    successfulDeals: flags.dealSuccess ? sql`COALESCE(${playerSeasonStats.successfulDeals},0) + 1` : playerSeasonStats.successfulDeals,
    updatedAt: new Date(),
  } as any).where(and(eq(playerSeasonStats.playerId, playerId), eq(playerSeasonStats.seasonId, seasonId)));
}

// ── مزامنة صف الموسم العادي النشط من players.* (نسخة كاش) ──
export async function mirrorPlayerToRegularSeason(playerId: number, regularSeasonId: number): Promise<void> {
  const db = getDB();
  if (!db) return;
  await ensureStatsRow(playerId, regularSeasonId);
  const [p] = await db.select({
    xp: players.xp, level: players.level, rankTier: players.rankTier, rankRR: players.rankRR,
    totalMatches: players.totalMatches, totalWins: players.totalWins, totalSurvived: players.totalSurvived,
    totalDeals: players.totalDeals, successfulDeals: players.successfulDeals,
  }).from(players).where(eq(players.id, playerId)).limit(1);
  if (!p) return;
  await db.update(playerSeasonStats).set({
    xp: p.xp ?? 0, level: p.level ?? 1, rankTier: p.rankTier ?? 'INFORMANT', rankRR: p.rankRR ?? 0,
    totalMatches: p.totalMatches ?? 0, totalWins: p.totalWins ?? 0, totalSurvived: p.totalSurvived ?? 0,
    totalDeals: p.totalDeals ?? 0, successfulDeals: p.successfulDeals ?? 0, updatedAt: new Date(),
  } as any).where(and(eq(playerSeasonStats.playerId, playerId), eq(playerSeasonStats.seasonId, regularSeasonId)));
}

// ── قائمة المواسم (مع عدد المباريات) ──
export async function listSeasons(): Promise<any[]> {
  const db = getDB();
  if (!db) return [];
  const rows = await db.select({
    id: seasons.id, name: seasons.name, seasonNumber: seasons.seasonNumber,
    type: seasons.type, locationId: seasons.locationId, status: seasons.status,
    startedAt: seasons.startedAt, endedAt: seasons.endedAt,
    matchCount: sql<number>`(SELECT COUNT(*)::int FROM ${matches} WHERE ${matches.seasonId} = ${seasons.id})`,
  }).from(seasons).orderBy(desc(seasons.startedAt));
  return rows;
}

// ── لوحة ترتيب موسم محدّد ──
export async function getSeasonLeaderboard(seasonId: number, limit = 50): Promise<any[]> {
  const db = getDB();
  if (!db) return [];
  return db.select({
    playerId: playerSeasonStats.playerId,
    name: players.name, avatarUrl: players.avatarUrl,
    level: playerSeasonStats.level, xp: playerSeasonStats.xp,
    rankTier: playerSeasonStats.rankTier, rankRR: playerSeasonStats.rankRR,
    totalMatches: playerSeasonStats.totalMatches, totalWins: playerSeasonStats.totalWins,
  }).from(playerSeasonStats)
    .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
    .where(eq(playerSeasonStats.seasonId, seasonId))
    .orderBy(
      sql`CASE ${playerSeasonStats.rankTier} WHEN 'GODFATHER' THEN 5 WHEN 'UNDERBOSS' THEN 4 WHEN 'CAPO' THEN 3 WHEN 'SOLDIER' THEN 2 ELSE 1 END DESC`,
      desc(playerSeasonStats.rankRR), desc(playerSeasonStats.level),
    ).limit(limit);
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

// ── بدء موسم عادي جديد: ينهي الحالي + يصفّر players.* + يبدأ موسماً ──
// ⚠️ يجب ألا تكون هناك مباريات جارية (يفحصها المُستدعي).
export async function startRegularSeason(name: string, createdBy?: number): Promise<SeasonRow> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  // 1) إنهاء الموسم العادي الحالي (إن وُجد) — إحصاءاته محفوظة في player_season_stats
  const currentId = await getActiveRegularSeasonId();
  if (currentId) {
    await db.update(seasons).set({ status: 'ENDED', endedAt: new Date() } as any).where(eq(seasons.id, currentId));
  }

  // 2) إنشاء الموسم العادي الجديد
  const [{ maxNum }] = await db.select({ maxNum: sql<number>`COALESCE(MAX(${seasons.seasonNumber}),0)::int` }).from(seasons);
  const [row] = await db.insert(seasons).values({
    name, seasonNumber: (maxNum || 0) + 1, type: 'REGULAR', status: 'ACTIVE', createdBy: createdBy ?? null,
  } as any).returning();

  // 3) تصفير players.* (التقدّم فقط — لا تُلمس الهوية ولا lifetime_matches)
  await db.update(players).set({
    xp: 0, level: 1, rankTier: 'INFORMANT', rankRR: 0,
    totalMatches: 0, totalWins: 0, totalSurvived: 0, totalDeals: 0, successfulDeals: 0,
  } as any);

  invalidateSeasonCache();
  return row as any;
}
