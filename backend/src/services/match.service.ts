// ══════════════════════════════════════════════════════
// 📦 خدمة سجل المباريات (Match Service)
// حفظ واسترجاع بيانات المباريات من PostgreSQL
// ══════════════════════════════════════════════════════

import { eq, desc, and, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { matches, matchPlayers } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';
import { isMafiaRole } from '../game/roles.js';
import { updatePlayerStats } from './player.service.js';
import { processMatchRewards, computeMatchReward, computeMatchBreakdown, applyProgressionConfig, buildDisplayBreakdown } from './progression.service.js';
import { getProgressionConfig, DEFAULT_CONFIG } from '../routes/progression-settings.routes.js';
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
    } as any).returning({ id: matches.id });

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
  console.log(`📊 [finalizeMatch] Called — matchId: ${state.matchId}, activityId: ${state.activityId}, players: ${state.players.length}, winner: ${state.winner}`);
  if (!db || !state.matchId) {
    console.warn(`⚠️ Cannot finalize match — db: ${!!db}, matchId: ${state.matchId}`);
    return;
  }

  try {
    // 🛡️ حارس ضد التكرار: إن كانت صفوف هذه المباراة محفوظة مسبقاً → لا تُعِد الإدراج/الاحتساب
    // (يمنع العدّ المزدوج إذا استُدعي finalizeMatch مرتين لنفس المباراة)
    const existing = await db.select({ id: matchPlayers.id })
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, state.matchId))
      .limit(1);
    if (existing.length > 0) {
      console.log(`⏭️ [finalizeMatch] Match #${state.matchId} already finalized — skipping (no double count)`);
      return;
    }

    let isTestGame = false;
    if (state.activityId) {
      const activityInfo = await db.select({ isTest: locations.isTestLocation })
        .from(activities)
        .leftJoin(locations, eq(activities.locationId, locations.id))
        .where(eq(activities.id, state.activityId))
        .limit(1);
      if (activityInfo[0]?.isTest) {
        isTestGame = true;
      }
      console.log(`📊 [finalizeMatch] activityId: ${state.activityId}, isTestLocation: ${activityInfo[0]?.isTest}, isTestGame: ${isTestGame}`);
    } else {
      console.log(`📊 [finalizeMatch] No activityId — isTestGame defaults to false`);
    }
    const startTime = state.startedAt ? new Date(state.startedAt).getTime() : 0;
    const endTime = Date.now();
    const durationSeconds = startTime > 0 ? Math.floor((endTime - startTime) / 1000) : null;

    // 🔒 مطالبة ذرّية (atomic claim): نحدّث الصف فقط إن كان is_active=true، ونلتقط النتيجة.
    // إن أعاد 0 صفوف → استدعاء آخر التقطها بالفعل (سباق/نقر مزدوج) → نتوقّف بلا احتساب مزدوج.
    const claimed = await db.update(matches)
      .set({
        isActive: false,
        winner: (state.winner as 'MAFIA' | 'CITIZEN' | 'JESTER' | null) ?? null,
        totalRounds: state.round || 0,
        durationSeconds,
        endedAt: new Date(),
      } as any)
      .where(and(eq(matches.id, state.matchId), eq(matches.isActive, true)))
      .returning({ id: matches.id });
    if (claimed.length === 0) {
      console.log(`⏭️ [finalizeMatch] Match #${state.matchId} already claimed/finalized (race) — skipping`);
      return;
    }


    const tracking = state.performanceTracking || { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
    const totalRounds = state.round || 1;

    // ── تحميل إعدادات التقدّم (نفس مصدر processMatchRewards لضمان تطابق المعروض والمطبَّق) ──
    let cfg: any;
    try { cfg = await getProgressionConfig(); } catch { cfg = DEFAULT_CONFIG; }
    applyProgressionConfig(cfg); // ضمان أن إعدادات الرتب/المستوى/التنزيل فعّالة في هذه المباراة
    const elimBonusPerKill = cfg?.xp?.teamEliminationBonus || 15;

    const playerRows = state.players.map(p => {
      const elimEntry = tracking.eliminationLog.find(e => e.physicalId === p.physicalId);
      const roundsSurvived = elimEntry ? Math.max(0, elimEntry.round - 1) : totalRounds;
      const dealOutcome = tracking.dealOutcomes.find(d => d.initiatorPhysicalId === p.physicalId);
      const abilityResults = tracking.abilityResults.filter(a => a.physicalId === p.physicalId);
      const playerIsMafia = isMafiaRole(p.role as any);

      // مكافأة إقصاء الخصم (للأدوار العادية)
      let teamElimBonus = 0;
      for (const elim of tracking.eliminationLog) {
        if (elim.physicalId === p.physicalId) continue;
        if (elim.team === 'MAFIA' && !playerIsMafia) teamElimBonus += elimBonusPerKill;
        if (elim.team === 'CITIZEN' && playerIsMafia) teamElimBonus += elimBonusPerKill;
      }

      const abilityCorrectCount = abilityResults.filter(a => a.correct).length;
      const abilityIncorrectCount = abilityResults.filter(a => !a.correct).length;
      const playerDeals = tracking.dealOutcomes.filter(d => d.initiatorPhysicalId === p.physicalId);
      const successfulDealsCount = playerDeals.filter(d => d.success).length;
      const failedDealsCount = playerDeals.filter(d => !d.success && !playerIsMafia).length;
      const mafiaDealOnMafiaCount = playerDeals.filter(d => !d.success && playerIsMafia).length;

      // 🎯 المصدر الموحّد لحساب النقاط (كل الأدوار بما فيها المحايدون) — نفس قيمة الإجمالي المطبَّق
      const rewardOpts = {
        role: p.role || 'CITIZEN',
        winner: state.winner ?? null,
        survivedToEnd: !!p.isAlive,
        roundsSurvived,
        successfulDealsCount,
        failedDealsCount,
        mafiaDealOnMafiaCount,
        abilityCorrectCount,
        abilityIncorrectCount,
        teamEliminationBonus: teamElimBonus,
        assassinContractsCompleted: state.assassinState?.completedCount || 0,
      };
      const { xpEarned, rrChange } = computeMatchReward(rewardOpts, cfg);
      // 🧮 تفصيل النقاط المُجمّد (مكوّنات مُسمّاة تطابق المجموع) — للعرض الدقيق لاحقاً
      const breakdown = computeMatchBreakdown(rewardOpts, cfg);

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
        dealInitiated: p.role === 'ASSASSIN' ? false : !!dealOutcome,
        dealSuccess: dealOutcome ? dealOutcome.success : null,
        abilityUsed: p.role === 'ASSASSIN' ? true : abilityResults.length > 0,
        abilityCorrect: abilityResults.length > 0 ? abilityResults.some(a => a.correct) : null,
        // 💾 تُحفظ القيم لكل الأدوار (حتى المحايدين) — لا أصفار بعد الآن. تُتخطّى المباريات التجريبية فقط.
        xpEarned: isTestGame ? 0 : xpEarned,
        rrChange: isTestGame ? 0 : rrChange,
        rewardBreakdown: isTestGame ? null : breakdown,
      };
    });

    if (playerRows.length > 0) {
      await db.insert(matchPlayers).values(playerRows);
    }

    // ── 🏆 إسناد الموسم: بطولة الموقع إن وُجدت، وإلا الموسم العادي ──
    const { resolveSeasonForActivity, applySeasonStats, mirrorPlayerToRegularSeason } = await import('./season.service.js');
    const { seasonId, isRegular } = await resolveSeasonForActivity(state.activityId);
    if (seasonId) {
      await db.update(matches).set({ seasonId } as any).where(eq(matches.id, state.matchId));
    }
    // عدّاد مباريات مدى الحياة (لا يُصفَّر عند بدء موسم) — لكل لاعب مسجّل، حتى للبطولات
    if (!isTestGame) {
      for (const p of state.players) {
        if (p.playerId) {
          await db.update(players).set({ lifetimeMatches: sql`COALESCE(${players.lifetimeMatches},0) + 1` } as any)
            .where(eq(players.id, p.playerId)).catch(() => {});
        }
      }
    }

    // ── تحديث إحصائيات اللاعبين (القديمة) + نظام التقدم الجديد ──
    console.log(`📊 [finalizeMatch] isTestGame: ${isTestGame} — ${isTestGame ? 'SKIPPING' : 'UPDATING'} stats for ${state.players.length} players`);
    if (!isTestGame && isRegular) {
      for (const p of state.players) {
        if (p.playerId) {
          try {
            const playerIsMafia = isMafiaRole(p.role as any);
            const isJester = p.role === 'JESTER';
            // المهرج يفوز فقط إذا هو الفائز، باقي اللاعبين يخسرون عند فوز المهرج
            const isAssassinP = p.role === 'ASSASSIN';
            const won = isAssassinP ? (state.winner === 'ASSASSIN')
              : isJester ? (state.winner === 'JESTER')
              : (state.winner === 'ASSASSIN' || state.winner === 'JESTER') ? false
              : (state.winner === 'MAFIA' && playerIsMafia) || (state.winner === 'CITIZEN' && !playerIsMafia);
            const survived = !!p.isAlive; // استخراج boolean بسيط — يمنع circular JSON
            await updatePlayerStats(p.playerId, won, survived);
            console.log(`📊 [finalizeMatch] ✅ Stats updated for playerId=${p.playerId} (${p.name}) — won: ${won}, alive: ${survived}`);
          } catch (statsErr: any) {
            console.error(`⚠️ Failed to update stats for player ${p.playerId} (${p.name}):`, statsErr.message);
          }
        } else {
          console.warn(`📊 [finalizeMatch] ⚠️ Player #${p.physicalId} (${p.name}) has NO playerId — stats SKIPPED`);
        }
      }
    } else {
      console.log(`📊 [finalizeMatch] ⛔ isTestGame=true — ALL stats skipped for match #${state.matchId}`);
    }

    // ── تطبيق نظام التقدم (XP + Level + RR + Rank) ──
    if (isTestGame) {
      console.log(`[Match] Skipping stats and progression for match #${state.matchId} (Test Location).`);
    } else if (isRegular) {
      // 🔵 الموسم العادي: نطبّق على players.* (كما كان) ثم نزامن صف الموسم
      try {
        await processMatchRewards(state);
        if (seasonId) {
          for (const p of state.players) {
            if (p.playerId) await mirrorPlayerToRegularSeason(p.playerId, seasonId).catch(() => {});
          }
        }
      } catch (progressionErr: any) {
        console.error('⚠️ Failed to process progression rewards:', progressionErr.message);
      }
    } else if (seasonId) {
      // 🏆 بطولة: نطبّق على إحصاءات الموسم فقط (لا تُلمس players.* / الرانك العادي)
      try {
        for (const row of playerRows) {
          if (!row.playerId) continue;
          const pIsMafia = isMafiaRole(row.role as any);
          const won = row.role === 'ASSASSIN' ? state.winner === 'ASSASSIN'
            : row.role === 'JESTER' ? state.winner === 'JESTER'
            : (state.winner === 'ASSASSIN' || state.winner === 'JESTER') ? false
            : (state.winner === 'MAFIA' && pIsMafia) || (state.winner === 'CITIZEN' && !pIsMafia);
          await applySeasonStats(row.playerId, seasonId, row.xpEarned || 0, row.rrChange || 0, {
            won, survived: !!row.survivedToEnd, dealInitiated: !!row.dealInitiated, dealSuccess: !!row.dealSuccess,
          });
        }
        console.log(`🏆 [finalizeMatch] Tournament season #${seasonId} stats applied for match #${state.matchId}`);
      } catch (tErr: any) {
        console.error('⚠️ Failed to apply tournament season stats:', tErr.message);
      }
    }

    // 🔔 Push للاعبين المشاركين (نتيجة المباراة)
    try {
      const { sendPushToPlayers } = await import('../services/fcm.service.js');
      const winnerLabel = state.winner === 'MAFIA' ? '🔴 المافيا'
        : state.winner === 'JESTER' ? '🤡 المهرج'
        : state.winner === 'ASSASSIN' ? '🔪 السفّاح'
        : '🟢 المواطنون';
      const playerIdsInGame = state.players.filter(p => p.playerId).map(p => p.playerId!);
      if (playerIdsInGame.length > 0) {
        sendPushToPlayers(
          playerIdsInGame,
          '🎮 انتهت اللعبة!',
          `فاز ${winnerLabel} — تحقق من نتائجك و XP`,
          'game_ended',
          { matchId: state.matchId, url: '/player/home' },
        );
        // ملاحظة: استبيان الرضى لا يُرسَل هنا (لكل جولة) — بل على مستوى الغرفة
        // عند ضغط الليدر «انتهت الفعالية» (closeSession) في activities.routes.ts.
      }
    } catch {}

    console.log(`📦 Match #${state.matchId} finalized — Winner: ${state.winner}, Duration: ${durationSeconds}s, Stats + Progression updated`);
  } catch (err: any) {
    console.error('❌ Failed to finalize match:', err.message);
  }
}

// ── إلغاء مباراة لم تُحتسب (لا فائز فيها) — تُحذف بلا أي أثر/نقاط ──
// أمان مزدوج: لا نحذف إلا إذا (1) لا توجد صفوف match_players (غير محتسبة) و(2) is_active=true
// (صف أُنشئ عند البدء ولم يُنهَ). هكذا يستحيل أن نمسّ مباراة محتسبة فعلاً.
export async function cancelMatch(matchId: number): Promise<boolean> {
  const db = getDB();
  if (!db || !matchId) return false;
  try {
    const counted = await db.select({ id: matchPlayers.id })
      .from(matchPlayers).where(eq(matchPlayers.matchId, matchId)).limit(1);
    if (counted.length > 0) return false; // محتسبة بالفعل → لا تُلغى
    const deleted = await db.delete(matches)
      .where(and(eq(matches.id, matchId), eq(matches.isActive, true)))
      .returning({ id: matches.id });
    if (deleted.length > 0) {
      console.log(`🗑️ [cancelMatch] Match #${matchId} cancelled (no winner) — discarded, no points recorded`);
      return true;
    }
    return false;
  } catch (err: any) {
    console.error(`⚠️ [cancelMatch] Failed to cancel match #${matchId}:`, err.message);
    return false;
  }
}

// ── تسوية المباراة عند إنهاء/إعادة الغرفة (شبكة أمان) ──
// يُستدعى قبل أي تصفير/حذف للحالة عند: العودة للغرفة، لعبة جديدة، إنهاء الفعالية،
// إغلاق/حذف الغرفة.
//   • إذا تقرّر فائز (winner أو pendingWinner) → تُحتسب النقاط (finalizeMatch).
//     آمن للتكرار: حارس match_players + المطالبة الذرّية يمنعان الاحتساب المزدوج.
//   • إذا لا فائز (لعبة ملغاة/غير مكتملة — الليدر رجع للوبي بسبب مشكلة) → تُلغى المباراة
//     ولا تُسجَّل أي نقاط إطلاقاً.
export async function finalizeIfDecided(state: GameState): Promise<boolean> {
  if (!state || !state.matchId) return false;
  const decided = (state.winner ?? (state as any).pendingWinner) ?? null;
  if (!decided) {
    // 🚫 لا فائز → لعبة ملغاة: لا تُحتسب نقاطها، وتُحذف كي لا تترك أثراً
    await cancelMatch(state.matchId).catch(() => {});
    return false;
  }
  state.winner = decided as any;
  try {
    await finalizeMatch(state);
    console.log(`🧮 [finalizeIfDecided] Ensured match #${state.matchId} is counted (winner: ${decided}) before room teardown/reset`);
    // 🔄 مصالحة فورية لرانك لاعبي هذه المباراة من match_players (مصدر الحقيقة).
    // تُحدّث الرانك بدقة عند نهاية كل لعبة، مناعةً ضد أي إخفاق في الاحتساب الحيّ (updatePlayerStats/
    // processMatchRewards). تعمل حتى لو تخطّى finalizeMatch إعادة الإدراج (الحارس)، لأنها بعد الاستدعاء.
    await reconcileMatchPlayersRank(state);
    return true;
  } catch (err: any) {
    console.error(`⚠️ [finalizeIfDecided] Failed to finalize match #${state.matchId}:`, err.message);
    return false;
  }
}

// 🔄 مصالحة رانك لاعبي مباراة واحدة من match_players (مصدر الحقيقة) — مستهدفة بلا تصفير عام.
// تُستدعى بعد كل احتساب مباراة، فيتحدّث الرانك على نهاية كل لعبة داخل الغرفة بدقة.
export async function reconcileMatchPlayersRank(state: GameState): Promise<void> {
  try {
    const db = getDB();
    if (!db) return;
    const playerIds = state.players.map(p => p.playerId).filter((id): id is number => !!id);
    if (playerIds.length === 0) return;

    // تخطّي مواقع الاختبار — لا رانك لها
    if (state.activityId) {
      const [info] = await db.select({ isTest: locations.isTestLocation })
        .from(activities).leftJoin(locations, eq(activities.locationId, locations.id))
        .where(eq(activities.id, state.activityId)).limit(1);
      if (info?.isTest) return;
    }

    const { resolveSeasonForActivity } = await import('./season.service.js');
    const { reconcileSeasonProgression } = await import('./reconcile.service.js');
    const { seasonId } = await resolveSeasonForActivity(state.activityId);
    if (!seasonId) return;

    const res = await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: playerIds });
    console.log(`🔄 [finalizeIfDecided] Rank reconciled for ${playerIds.length} players of match #${state.matchId} (season ${seasonId}) — applied=${res.applied}`);
  } catch (e: any) {
    console.warn(`⚠️ [finalizeIfDecided] post-finalize rank reconcile failed for match #${state.matchId}:`, e?.message || e);
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
    const neutralRoles = ['JESTER', 'ASSASSIN'];
    const teamPlayers = players.map(p => ({
      physicalId: p.physicalId,
      playerName: p.playerName,
      role: p.role,
      team: mafiaRoles.includes(p.role) ? 'MAFIA'
        : neutralRoles.includes(p.role) ? 'NEUTRAL'
        : 'CITIZEN',
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

// ── 📊 نقاط الرانك لكل لاعب في مباراة محددة (لمودال ملخص نهاية اللعبة في واجهة الليدر) ──
// يعيد لكل لاعب: المكتسب (rrGained) + المخصوم (rrLost) + الصافي (rrTotal) + تفصيل البنود + matchPlayerId للتعديل.
export async function getMatchPlayerPoints(matchId: number) {
  const db = getDB();
  if (!db) return [];
  try {
    let cfg: any;
    try { cfg = await getProgressionConfig(); } catch { cfg = DEFAULT_CONFIG; }
    applyProgressionConfig(cfg);
    const [match] = await db.select({ winner: matches.winner }).from(matches).where(eq(matches.id, matchId)).limit(1);
    const rows = await db.select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId));
    return rows.map((r: any) => {
      const bd = buildDisplayBreakdown({ ...r, matchWinner: match?.winner ?? null }, cfg);
      const rrGained = bd.rr.filter((l: any) => l.value > 0).reduce((s: number, l: any) => s + l.value, 0);
      const rrLost = bd.rr.filter((l: any) => l.value < 0).reduce((s: number, l: any) => s + l.value, 0);
      const xpGained = bd.xp.filter((l: any) => l.value > 0).reduce((s: number, l: any) => s + l.value, 0);
      const xpLost = bd.xp.filter((l: any) => l.value < 0).reduce((s: number, l: any) => s + l.value, 0);
      return {
        matchPlayerId: r.id,
        playerId: r.playerId,
        physicalId: r.physicalId,
        playerName: r.playerName,
        role: r.role,
        team: bd.team,
        won: bd.won,
        rrGained, rrLost, rrTotal: bd.rrTotal,
        xpGained, xpLost, xpTotal: bd.xpTotal,
        rrBreakdown: bd.rr,
        xpBreakdown: bd.xp,
      };
    });
  } catch (err: any) {
    console.error('❌ Failed to fetch match player points:', err.message);
    return [];
  }
}

// ── 🔧 تعديل يدوي لنقاط لاعب في مباراة محددة (نفس منطق التعديل اليدوي في صفحة نظام التقدم) ──
// دلتا تُضاف لـ match_players (المصدر) + players.* (مع حد أدنى 0). تُعيد لقطة اللاعب المحدّثة.
export async function adjustMatchPlayerPoints(
  matchPlayerId: number,
  opts: { xpDelta?: number; rrDelta?: number; reason?: string; by?: string },
): Promise<{ player: any; matchPlayerId: number } | null> {
  const db = getDB();
  if (!db) return null;
  const [mp] = await db.select({ id: matchPlayers.id, playerId: matchPlayers.playerId, xpEarned: matchPlayers.xpEarned, rrChange: matchPlayers.rrChange, playerName: matchPlayers.playerName })
    .from(matchPlayers).where(eq(matchPlayers.id, matchPlayerId)).limit(1);
  if (!mp) return null;

  const xpDelta = Math.trunc(Number(opts.xpDelta || 0));
  const rrDelta = Math.trunc(Number(opts.rrDelta || 0));

  // 1) match_players (المصدر — دلتا)
  const mpUpdates: any = {};
  if (xpDelta) mpUpdates.xpEarned = (mp.xpEarned || 0) + xpDelta;
  if (rrDelta) mpUpdates.rrChange = (mp.rrChange || 0) + rrDelta;
  if (Object.keys(mpUpdates).length) await db.update(matchPlayers).set(mpUpdates).where(eq(matchPlayers.id, matchPlayerId));

  // 2) players.* (دلتا، بحد أدنى 0) — للاعبين المسجّلين فقط
  let player: any = null;
  if (mp.playerId) {
    const pUpdates: any = {};
    if (xpDelta) pUpdates.xp = sql`GREATEST(0, COALESCE(${players.xp}, 0) + ${xpDelta})`;
    if (rrDelta) pUpdates.rankRR = sql`GREATEST(0, COALESCE(${players.rankRR}, 0) + ${rrDelta})`;
    if (Object.keys(pUpdates).length) await db.update(players).set(pUpdates).where(eq(players.id, mp.playerId));
    [player] = await db.select({ xp: players.xp, level: players.level, rankTier: players.rankTier, rankRR: players.rankRR })
      .from(players).where(eq(players.id, mp.playerId)).limit(1);
  }

  console.log(`🔧 [leader] adjusted matchPlayer #${matchPlayerId} (player ${mp.playerId} — ${mp.playerName}): XP${xpDelta >= 0 ? '+' : ''}${xpDelta}, RR${rrDelta >= 0 ? '+' : ''}${rrDelta} — ${opts.reason || 'no reason'} by ${opts.by || 'leader'}`);
  return { player, matchPlayerId };
}
