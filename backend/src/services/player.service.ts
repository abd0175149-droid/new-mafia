// ══════════════════════════════════════════════════════
// 👤 خدمة اللاعبين — Player Service
// إنشاء حساب تلقائي، بحث، بروفايل، وحجز تلقائي
// + دعم المصادقة وهجرة الحسابات القديمة
// ══════════════════════════════════════════════════════

import { eq, sql, desc, and, isNull } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players, bookingMembers, PLAYER_DEFAULT_PASSWORD } from '../schemas/player.schema.js';
import { hashPlayerPassword } from '../middleware/player-auth.middleware.js';

// ── البحث عن لاعب بالهاتف ──────────────────────────

export async function findPlayerByPhone(phone: string) {
  const db = getDB();
  if (!db) return null;

  const result = await db.select().from(players).where(eq(players.phone, phone)).limit(1);
  return result[0] || null;
}

// ── البحث عن لاعب بالـ ID ──────────────────────────

export async function findPlayerById(playerId: number) {
  const db = getDB();
  if (!db) return null;

  const result = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return result[0] || null;
}

// ── إنشاء لاعب جديد (مع كلمة سر) ──────────────────

export async function createPlayer(data: {
  phone: string;
  name: string;
  password?: string;
  gender?: string;
  dob?: string;
}) {
  const db = getDB();
  if (!db) return null;

  // تحقق من عدم التكرار
  const existing = await findPlayerByPhone(data.phone);
  if (existing) return existing;

  const passwordHash = data.password
    ? await hashPlayerPassword(data.password)
    : null;

  const result = await db.insert(players).values({
    phone: data.phone,
    passwordHash,
    mustChangePassword: !data.password, // إذا بدون كلمة سر → يجب تغييرها لاحقاً
    name: data.name,
    gender: data.gender || 'MALE',
    dob: data.dob || null,
    lastActiveAt: new Date(),
  }).returning();

  console.log(`👤 New player created: ${data.name} (${data.phone}) → ID: ${result[0]?.id}`);
  return result[0] || null;
}

// ── تحديث آخر نشاط ─────────────────────────────────

export async function touchPlayerActivity(playerId: number) {
  const db = getDB();
  if (!db) return;

  await db.update(players).set({ lastActiveAt: new Date() }).where(eq(players.id, playerId));
}

// ── تحديث إحصائيات بعد نهاية المباراة ──────────────

export async function updatePlayerStats(playerId: number, won: boolean, survived: boolean) {
  const db = getDB();
  if (!db) return;

  await db.update(players).set({
    totalMatches: sql`${players.totalMatches} + 1`,
    totalWins: won ? sql`${players.totalWins} + 1` : players.totalWins,
    totalSurvived: survived ? sql`${players.totalSurvived} + 1` : players.totalSurvived,
    lastActiveAt: new Date(),
  }).where(eq(players.id, playerId));
}

// ── إنشاء حجز تلقائي للاعب بدون حجز ────────────────

export async function autoCreateBookingMember(data: {
  bookingId: number;
  playerId: number;
  name: string;
  phone?: string;
  isGuest?: boolean;
}) {
  const db = getDB();
  if (!db) return null;

  const result = await db.insert(bookingMembers).values({
    bookingId: data.bookingId,
    playerId: data.playerId,
    name: data.name,
    phone: data.phone || null,
    isGuest: data.isGuest || false,
    checkedIn: true,
  }).returning();

  return result[0] || null;
}

// ── هجرة اللاعبين القدامى: تعيين كلمة سر افتراضية ──

export async function migratePlayersWithDefaultPassword(): Promise<number> {
  const db = getDB();
  if (!db) return 0;

  try {
    // البحث عن لاعبين بدون كلمة سر
    const playersWithoutPassword = await db.select({ id: players.id })
      .from(players)
      .where(isNull(players.passwordHash));

    if (playersWithoutPassword.length === 0) return 0;

    const defaultHash = await hashPlayerPassword(PLAYER_DEFAULT_PASSWORD);

    await db.update(players)
      .set({
        passwordHash: defaultHash,
        mustChangePassword: true,
      })
      .where(isNull(players.passwordHash));

    console.log(`🔄 Migrated ${playersWithoutPassword.length} players with default password '${PLAYER_DEFAULT_PASSWORD}' — they must change it on first login`);
    return playersWithoutPassword.length;
  } catch (err: any) {
    console.error('❌ Failed to migrate players:', err.message);
    return 0;
  }
}

// ── جلب بروفايل اللاعب الكامل ───────────────────────

export async function getPlayerProfile(playerId: number) {
  const db = getDB();
  if (!db) return null;

  // 1. بيانات اللاعب الأساسية
  const playerData = await findPlayerById(playerId);
  if (!playerData) return null;

  // 2. سجل المباريات (من match_players — بالـ playerId أولاً ثم fallback بالاسم)
  let matchHistory: any[] = [];
  try {
    const { matchPlayers, matches } = await import('../schemas/game.schema.js');

    // محاولة 1: البحث بـ playerId (الطريقة الدقيقة)
    matchHistory = await db
      .select({
        matchId: matchPlayers.matchId,
        role: matchPlayers.role,
        physicalId: matchPlayers.physicalId,
        survived: matchPlayers.survivedToEnd,
        matchWinner: matches.winner,
        matchDate: matches.createdAt,
        matchDuration: matches.durationSeconds,
        matchPlayerCount: matches.playerCount,
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(eq(matchPlayers.playerId, playerId))
      .orderBy(desc(matches.createdAt))
      .limit(50);

    // محاولة 2: Fallback بالاسم (للبيانات القديمة بدون playerId)
    if (matchHistory.length === 0) {
      matchHistory = await db
        .select({
          matchId: matchPlayers.matchId,
          role: matchPlayers.role,
          physicalId: matchPlayers.physicalId,
          survived: matchPlayers.survivedToEnd,
          matchWinner: matches.winner,
          matchDate: matches.createdAt,
          matchDuration: matches.durationSeconds,
          matchPlayerCount: matches.playerCount,
        })
        .from(matchPlayers)
        .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
        .where(eq(matchPlayers.playerName, playerData.name))
        .orderBy(desc(matches.createdAt))
        .limit(50);
    }
  } catch (err: any) {
    console.error('⚠️ Failed to fetch match history for profile:', err.message);
  }

  // 3. حساب الإحصائيات التفصيلية
  const roleStats: Record<string, number> = {};
  let mafiaWins = 0, citizenWins = 0;
  let mafiaGames = 0, citizenGames = 0;
  let currentStreak = 0, maxStreak = 0;

  for (const m of matchHistory) {
    if (m.role) {
      roleStats[m.role] = (roleStats[m.role] || 0) + 1;
    }

    const isMafiaRole = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(m.role || '');

    if (isMafiaRole) mafiaGames++;
    else citizenGames++;

    const won = (isMafiaRole && m.matchWinner === 'MAFIA') || (!isMafiaRole && m.matchWinner === 'CITIZEN');

    if (won) {
      if (isMafiaRole) mafiaWins++;
      else citizenWins++;
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const favoriteRole = Object.entries(roleStats).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const avgSurvival = matchHistory.length > 0
    ? Math.round((matchHistory.filter(m => m.survived).length / matchHistory.length) * 100)
    : 0;
  const winRate = matchHistory.length > 0
    ? Math.round(((mafiaWins + citizenWins) / matchHistory.length) * 100)
    : 0;
  const mafiaWinRate = mafiaGames > 0 ? Math.round((mafiaWins / mafiaGames) * 100) : 0;
  const citizenWinRate = citizenGames > 0 ? Math.round((citizenWins / citizenGames) * 100) : 0;

  // ── بيانات التقدم ──
  const { xpForNextLevel } = await import('./progression.service.js');
  const currentXP = (playerData as any).xp || 0;
  const currentLevel = (playerData as any).level || 1;
  const nextLevelXP = xpForNextLevel(currentLevel);
  const xpProgress = nextLevelXP > 0 ? Math.round((currentXP / nextLevelXP) * 100) : 0;

  return {
    player: playerData,
    stats: {
      totalMatches: playerData.totalMatches || matchHistory.length,
      totalWins: playerData.totalWins || (mafiaWins + citizenWins),
      winRate,
      survivalRate: avgSurvival,
      favoriteRole,
      mafiaWins,
      citizenWins,
      mafiaGames,
      citizenGames,
      mafiaWinRate,
      citizenWinRate,
      longestWinStreak: maxStreak,
      roleDistribution: roleStats,
    },
    progression: {
      xp: currentXP,
      level: currentLevel,
      nextLevelXP,
      xpProgress,
      rankTier: (playerData as any).rankTier || 'INFORMANT',
      rankRR: (playerData as any).rankRR || 0,
      totalDeals: (playerData as any).totalDeals || 0,
      successfulDeals: (playerData as any).successfulDeals || 0,
      dealSuccessRate: (playerData as any).totalDeals > 0
        ? Math.round(((playerData as any).successfulDeals / (playerData as any).totalDeals) * 100)
        : 0,
    },
    matchHistory,
  };
}
