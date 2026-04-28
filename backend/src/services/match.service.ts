// ══════════════════════════════════════════════════════
// 📦 خدمة سجل المباريات (Match Service)
// حفظ واسترجاع بيانات المباريات من PostgreSQL
// ══════════════════════════════════════════════════════

import { eq, desc, and } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { matches, matchPlayers } from '../schemas/game.schema.js';
import { isMafiaRole } from '../game/roles.js';
import { updatePlayerStats } from './player.service.js';
import { processMatchRewards, calculateMatchXP, calculateMatchRR } from './progression.service.js';
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

    const tracking = state.performanceTracking || { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
    const totalRounds = state.round || 1;

    const playerRows = state.players.map(p => {
      const elimEntry = tracking.eliminationLog.find(e => e.physicalId === p.physicalId);
      const roundsSurvived = elimEntry ? Math.max(0, elimEntry.round - 1) : totalRounds;
      const dealOutcome = tracking.dealOutcomes.find(d => d.initiatorPhysicalId === p.physicalId);
      const abilityResults = tracking.abilityResults.filter(a => a.physicalId === p.physicalId);

      const playerIsMafia = isMafiaRole(p.role as any);
      const teamWon = (state.winner === 'MAFIA' && playerIsMafia) || (state.winner === 'CITIZEN' && !playerIsMafia);

      // حساب مكافأة إقصاء الخصم
      let teamElimBonus = 0;
      for (const elim of tracking.eliminationLog) {
        if (elim.physicalId === p.physicalId) continue;
        if (elim.team === 'MAFIA' && !playerIsMafia) teamElimBonus += 15;
        if (elim.team === 'CITIZEN' && playerIsMafia) teamElimBonus += 15;
      }

      const xpEarned = p.playerId ? calculateMatchXP({
        participated: true, teamWon, roundsSurvived,
        abilityCorrectCount: abilityResults.filter(a => a.correct).length,
        dealSuccess: dealOutcome ? dealOutcome.success : null,
        teamEliminationBonus: teamElimBonus,
      }) : 0;

      const rrChange = p.playerId ? calculateMatchRR({
        teamWon,
        dealSuccess: dealOutcome ? dealOutcome.success : null,
      }) : 0;

      return {
        matchId: state.matchId!,
        playerId: p.playerId || null,
        physicalId: p.physicalId,
        playerName: p.name,
        role: p.role || 'UNKNOWN',
        survivedToEnd: p.isAlive,
        eliminatedAtRound: elimEntry ? elimEntry.round : null,
        eliminatedDuring: elimEntry ? (elimEntry.eliminatedBy === 'NIGHT_KILL' || elimEntry.eliminatedBy === 'SNIPER' ? 'NIGHT' : 'DAY') : null,
        roundsSurvived,
        dealInitiated: !!dealOutcome,
        dealSuccess: dealOutcome ? dealOutcome.success : null,
        abilityUsed: abilityResults.length > 0,
        abilityCorrect: abilityResults.length > 0 ? abilityResults.some(a => a.correct) : null,
        xpEarned,
        rrChange,
      };
    });

    if (playerRows.length > 0) {
      await db.insert(matchPlayers).values(playerRows);
    }

    // ── تحديث إحصائيات اللاعبين (القديمة) + نظام التقدم الجديد ──
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

    // ── تطبيق نظام التقدم (XP + Level + RR + Rank) ──
    try {
      await processMatchRewards(state);
    } catch (progressionErr: any) {
      console.error('⚠️ Failed to process progression rewards:', progressionErr.message);
    }

    // 🔔 Push للاعبين المشاركين (نتيجة المباراة)
    try {
      const { sendPushToPlayers } = await import('../services/fcm.service.js');
      const winnerLabel = state.winner === 'MAFIA' ? '🔴 المافيا' : '🟢 المواطنون';
      const playerIdsInGame = state.players.filter(p => p.playerId).map(p => p.playerId!);
      if (playerIdsInGame.length > 0) {
        sendPushToPlayers(
          playerIdsInGame,
          '🎮 انتهت اللعبة!',
          `فاز فريق ${winnerLabel} — تحقق من نتائجك و XP`,
          'game_ended',
          { matchId: state.matchId, url: '/player/home' },
        );
      }
    } catch {}

    console.log(`📦 Match #${state.matchId} finalized — Winner: ${state.winner}, Duration: ${durationSeconds}s, Stats + Progression updated`);
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
