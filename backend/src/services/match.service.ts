// ══════════════════════════════════════════════════════
// 📦 خدمة سجل المباريات (Match Service)
// حفظ واسترجاع بيانات المباريات من PostgreSQL
// ══════════════════════════════════════════════════════

import { eq, desc, and } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { matches, matchPlayers } from '../schemas/game.schema.js';
import { isMafiaRole } from '../game/roles.js';
import { updatePlayerStats } from './player.service.js';
import type { GameState } from '../game/state.js';

// ── إنشاء سجل مباراة عند بداية اللعبة ──────────────
export async function createMatch(state: GameState): Promise<number | null> {
  const db = getDB();
  if (!db) {
    console.warn('⚠️ PostgreSQL unavailable — match not saved');
    return null;
  }

  try {
    const result = await db.insert(matches).values({
      sessionId: state.sessionId || null,
      roomId: state.roomId,
      roomCode: state.roomCode,
      gameName: state.config.gameName,
      displayPin: state.config.displayPin,
      playerCount: state.players.length,
      maxPlayers: state.config.maxPlayers,
      isActive: true,
      totalRounds: state.round || 1,
    }).returning({ id: matches.id });

    const matchId = result[0]?.id;
    console.log(`📦 Match #${matchId} created for room ${state.roomId}`);
    return matchId;
  } catch (err: any) {
    console.error('❌ Failed to create match:', err.message);
    return null;
  }
}

// ── حفظ نتيجة المباراة عند نهاية اللعبة ────────────
export async function finalizeMatch(state: GameState): Promise<void> {
  const db = getDB();
  if (!db || !state.matchId) {
    console.warn('⚠️ Cannot finalize match — no DB or matchId');
    return;
  }

  try {
    const startTime = state.startedAt ? new Date(state.startedAt).getTime() : 0;
    const endTime = Date.now();
    const durationSeconds = startTime > 0 ? Math.floor((endTime - startTime) / 1000) : null;

    await db.update(matches)
      .set({
        isActive: false,
        winner: state.winner as 'MAFIA' | 'CITIZEN' | null,
        totalRounds: state.round || 0,
        durationSeconds,
        endedAt: new Date(),
      })
      .where(eq(matches.id, state.matchId));

    const playerRows = state.players.map(p => ({
      matchId: state.matchId!,
      physicalId: p.physicalId,
      playerName: p.name,
      role: p.role || 'UNKNOWN',
      survivedToEnd: p.isAlive,
    }));

    if (playerRows.length > 0) {
      await db.insert(matchPlayers).values(playerRows);
    }

    // ── تحديث إحصائيات اللاعبين في جدول players ──
    for (const p of state.players) {
      if (p.playerId) {
        try {
          const playerIsMafia = isMafiaRole(p.role as any);
          const won = (state.winner === 'MAFIA' && playerIsMafia) || (state.winner === 'CITIZEN' && !playerIsMafia);
          await updatePlayerStats(p.playerId, won, p.isAlive);
        } catch (statsErr: any) {
          console.error(`⚠️ Failed to update stats for player ${p.playerId}:`, statsErr.message);
        }
      }
    }

    console.log(`📦 Match #${state.matchId} finalized — Winner: ${state.winner}, Duration: ${durationSeconds}s, Stats updated for ${state.players.filter(p => p.playerId).length} players`);
  } catch (err: any) {
    console.error('❌ Failed to finalize match:', err.message);
  }
}

// ── جلب الألعاب المنتهية ─────────────────────────────
export async function getFinishedMatches(limit: number = 50) {
  const db = getDB();
  if (!db) return [];

  try {
    const rows = await db.select()
      .from(matches)
      .where(eq(matches.isActive, false))
      .orderBy(desc(matches.endedAt))
      .limit(limit);

    return rows.map(m => ({
      id: m.id,
      gameName: m.gameName,
      roomCode: m.roomCode,
      playerCount: m.playerCount,
      winner: m.winner,
      totalRounds: m.totalRounds,
      durationSeconds: m.durationSeconds,
      createdAt: m.createdAt,
      endedAt: m.endedAt,
    }));
  } catch (err: any) {
    console.error('❌ Failed to fetch finished matches:', err.message);
    return [];
  }
}

// ── جلب ألعاب session محددة ──────────────────────────
export async function getMatchesBySession(sessionId: number) {
  const db = getDB();
  if (!db) return [];

  try {
    const rows = await db.select()
      .from(matches)
      .where(and(
        eq(matches.sessionId, sessionId),
        eq(matches.isActive, false),
      ))
      .orderBy(desc(matches.endedAt));

    return rows.map(m => ({
      id: m.id,
      gameName: m.gameName,
      roomCode: m.roomCode,
      playerCount: m.playerCount,
      winner: m.winner,
      totalRounds: m.totalRounds,
      durationSeconds: m.durationSeconds,
      createdAt: m.createdAt,
      endedAt: m.endedAt,
    }));
  } catch (err: any) {
    console.error('❌ Failed to fetch session matches:', err.message);
    return [];
  }
}

// ── جلب ملخص مباراة محددة مع اللاعبين ─────────────
export async function getMatchDetails(matchId: number) {
  const db = getDB();
  if (!db) return null;

  try {
    const [match] = await db.select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!match) return null;

    const players = await db.select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, matchId));

    const mafiaRoles = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];
    const teamPlayers = players.map(p => ({
      physicalId: p.physicalId,
      playerName: p.playerName,
      role: p.role,
      team: mafiaRoles.includes(p.role) ? 'MAFIA' : 'CITIZEN',
      survivedToEnd: p.survivedToEnd,
    }));

    let durationFormatted = '—';
    if (match.durationSeconds) {
      const mins = Math.floor(match.durationSeconds / 60);
      const secs = match.durationSeconds % 60;
      durationFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    return {
      id: match.id,
      gameName: match.gameName,
      roomCode: match.roomCode,
      playerCount: match.playerCount,
      winner: match.winner,
      totalRounds: match.totalRounds,
      durationSeconds: match.durationSeconds,
      durationFormatted,
      createdAt: match.createdAt,
      endedAt: match.endedAt,
      players: teamPlayers,
    };
  } catch (err: any) {
    console.error('❌ Failed to fetch match details:', err.message);
    return null;
  }
}
