// ══════════════════════════════════════════════════════
// 👤 خدمة اللاعبين — Player Service
// إنشاء حساب تلقائي، بحث، بروفايل، وحجز تلقائي
// ══════════════════════════════════════════════════════

import { eq, sql, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players, bookingMembers } from '../schemas/player.schema.js';

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

// ── إنشاء لاعب جديد (حساب تلقائي أول تسجيل) ──────

export async function createPlayer(data: {
  phone: string;
  name: string;
  gender?: string;
  dob?: string;
}) {
  const db = getDB();
  if (!db) return null;

  // تحقق من عدم التكرار
  const existing = await findPlayerByPhone(data.phone);
  if (existing) return existing;

  const result = await db.insert(players).values({
    phone: data.phone,
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

// ── جلب بروفايل اللاعب الكامل ───────────────────────

export async function getPlayerProfile(playerId: number) {
  const db = getDB();
  if (!db) return null;

  // 1. بيانات اللاعب الأساسية
  const playerData = await findPlayerById(playerId);
  if (!playerData) return null;

  // 2. سجل المباريات (من match_players)
  let matchHistory: any[] = [];
  try {
    const { matchPlayers, matches } = await import('../schemas/game.schema.js');
    matchHistory = await db
      .select({
        matchId: matchPlayers.matchId,
        role: matchPlayers.role,
        physicalId: matchPlayers.physicalId,
        survived: matchPlayers.survived,
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
  } catch { /* match tables might not exist */ }

  // 3. حساب الإحصائيات التفصيلية
  const roleStats: Record<string, number> = {};
  let mafiaWins = 0, citizenWins = 0;

  for (const m of matchHistory) {
    if (m.role) {
      roleStats[m.role] = (roleStats[m.role] || 0) + 1;
    }
    if (m.survived && m.matchWinner) {
      const isMafiaRole = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(m.role || '');
      if (isMafiaRole && m.matchWinner === 'MAFIA') mafiaWins++;
      if (!isMafiaRole && m.matchWinner === 'CITIZEN') citizenWins++;
    }
  }

  const favoriteRole = Object.entries(roleStats).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const avgSurvival = matchHistory.length > 0
    ? Math.round((matchHistory.filter(m => m.survived).length / matchHistory.length) * 100)
    : 0;

  return {
    player: playerData,
    stats: {
      totalMatches: playerData.totalMatches || matchHistory.length,
      totalWins: playerData.totalWins || (mafiaWins + citizenWins),
      survivalRate: avgSurvival,
      favoriteRole,
      mafiaWins,
      citizenWins,
    },
    matchHistory,
  };
}
