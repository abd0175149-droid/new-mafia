// ══════════════════════════════════════════════════════
// 📦 خدمة سجل المباريات (Match Service)
// حفظ واسترجاع بيانات المباريات من PostgreSQL
// ══════════════════════════════════════════════════════

import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { matches, matchPlayers } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';
import { isMafiaRole, teamOfRole } from '../game/roles.js';
import { computeMatchReward, computeMatchBreakdown, applyProgressionConfig, buildDisplayBreakdown, RANK_NAMES_AR } from './progression.service.js';
import { getProgressionConfig, DEFAULT_CONFIG } from '../routes/progression-settings.routes.js';
import type { GameState } from '../game/state.js';

// 🧪 هل الغرفة في موقع اختبار؟ — من مكان فعاليّتها، أو من مكانها الصريح (غرفة «بدون نشاط» بمكان)
export async function isTestScope(state: GameState): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  try {
    if (state.activityId) {
      const [info] = await db.select({ isTest: locations.isTestLocation })
        .from(activities).leftJoin(locations, eq(activities.locationId, locations.id))
        .where(eq(activities.id, state.activityId)).limit(1);
      return !!info?.isTest;
    }
    if (state.locationId) {
      const [loc] = await db.select({ isTest: locations.isTestLocation }).from(locations)
        .where(eq(locations.id, state.locationId)).limit(1);
      return !!loc?.isTest;
    }
  } catch { /* عند الشك نعاملها كغير اختبارية */ }
  return false;
}

// ── إنشاء سجل مباراة عند بداية اللعبة ──────────────
export async function createMatch(state: GameState): Promise<number | null> {
  const db = getDB();
  if (!db) {
    console.warn('⚠️ PostgreSQL unavailable — match not saved');
    return null;
  }

  try {
    // 🏙️ ختمٌ مبدئيّ للموسم والمدينة عند الإنشاء (يُثبَّت عند الاحتساب — الموسمُ يُحسم لحظةَ الاحتساب)
    let seasonId: number | null = null;
    let cityId: number | null = null;
    try {
      const { resolveSeasonForGame } = await import('./season.service.js');
      const scope = await resolveSeasonForGame(state.activityId, (state.config as any)?.isRemote, state.locationId ?? null);
      seasonId = scope.seasonId; cityId = scope.cityId;
    } catch { /* الختم المبدئيّ زينة — الاحتساب يُعيد الحلّ */ }

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
      seasonId,
      cityId,
      // 👤 مُنشئ الغرفة (staff) — يُنقل من حالة الغرفة
      createdBy: (state as any).createdByStaffId || null,
      leaderStaffId: (state as any).createdByStaffId || null,
    } as any).returning({ id: matches.id });

    const matchId = result[0]?.id;
    console.log(`📦 Match #${matchId} created for room ${state.roomId} (season ${seasonId ?? '-'}, city ${cityId ?? '-'})`);
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

    const isTestGame = await isTestScope(state);
    console.log(`📊 [finalizeMatch] activityId: ${state.activityId ?? '-'}, locationId: ${state.locationId ?? '-'}, isTestGame: ${isTestGame}`);
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

    // ⚡ معزّزات الخبرة المشتراة — تُقرأ هنا ليطابق المحفوظ في match_players
    // ما يُطبَّق فعلياً في processMatchRewards (نفس المصدر ونفس اللحظة تقريباً).
    let xpBoost: Record<number, number> = {};
    if (!isTestGame) {
      try {
        const { getXpMultipliers } = await import('./chips-store.service.js');
        xpBoost = await getXpMultipliers(state.players.map(p => p.playerId).filter(Boolean) as number[]);
      } catch { /* المعزّز ميزة — لا يعطّل الاحتساب */ }
    }

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
      // ⚔️ مواجهات النهار التي نفّذها كطالب — أثرها مختومٌ من تصويت الجولة نفسها فقط
      const myConfrontations = (tracking.confrontations || []).filter(c => c.requesterPhysicalId === p.physicalId);
      const successfulConfrontationsCount = myConfrontations.filter(c => c.outcome === 'MAFIA_EXPOSED').length;
      const failedConfrontationsCount = myConfrontations.filter(c => c.outcome === 'CITIZEN_HIT').length;
      const mafiaConfrontationOnMafiaCount = myConfrontations.filter(c => c.outcome === 'MAFIA_BETRAYAL').length;
      const confrontationOutcome: string | null = myConfrontations.length
        ? (myConfrontations.find(c => c.outcome && c.outcome !== 'NONE')?.outcome || 'NONE') : null;

      // 🎯 المصدر الموحّد لحساب النقاط (كل الأدوار بما فيها المحايدون) — نفس قيمة الإجمالي المطبَّق
      const rewardOpts = {
        role: p.role || 'CITIZEN',
        winner: state.winner ?? null,
        survivedToEnd: !!p.isAlive,
        roundsSurvived,
        successfulDealsCount,
        failedDealsCount,
        mafiaDealOnMafiaCount,
        successfulConfrontationsCount,
        failedConfrontationsCount,
        mafiaConfrontationOnMafiaCount,
        abilityCorrectCount,
        abilityIncorrectCount,
        teamEliminationBonus: teamElimBonus,
        assassinContractsCompleted: state.assassinState?.completedCount || 0,
      };
      const { xpEarned: baseXp, rrChange } = computeMatchReward(rewardOpts, cfg);
      // 🧮 تفصيل النقاط المُجمّد (مكوّنات مُسمّاة تطابق المجموع) — للعرض الدقيق لاحقاً
      const breakdown = computeMatchBreakdown(rewardOpts, cfg);

      // ⚡ معزّز الخبرة: يُضاعف الخبرة فقط ويُسجَّل كمكوّن مُسمّى
      // فيبقى مجموع مكوّنات التفصيل مطابقاً للإجمالي المعروض.
      const mult = (p.playerId && xpBoost[p.playerId]) || 1;
      const xpEarned = mult > 1 ? Math.round(baseXp * mult) : baseXp;
      if (mult > 1 && breakdown?.xp) {
        (breakdown.xp as any).chipsBoost = xpEarned - baseXp;
      }

      // ⚖️💣 دمج عقوبات الليدر وقنبلة شيخ المافيا المخزّنة أثناء المباراة في صفّ الدفتر.
      // تُحفظ في penalty_rr_deduction / bomb_rr_change (تعرضها البنود كسطور منفصلة)
      // وتدخل في صافي rr_change — فتنجو من كل المصالحات (الدفتر = مصدر الحقيقة).
      // كانت تُكتب مباشرة أثناء اللعب على صفوف غير موجودة بعد فتصيب 0 صفوف وتضيع.
      const penaltyEvts = (tracking.penaltyEvents || []).filter(e => e.physicalId === p.physicalId);
      const bombEvts = (tracking.bombEvents || []).filter(e => e.physicalId === p.physicalId);
      const penaltyRR = penaltyEvts.reduce((s, e) => s + (e.rr || 0), 0);
      const bombRR = bombEvts.reduce((s, e) => s + (e.rr || 0), 0);

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
        confrontationInitiated: myConfrontations.length > 0,
        confrontationOutcome,
        abilityUsed: p.role === 'ASSASSIN' ? true : abilityResults.length > 0,
        abilityCorrect: abilityResults.length > 0 ? abilityResults.some(a => a.correct) : null,
        // 💾 تُحفظ القيم لكل الأدوار (حتى المحايدين) — لا أصفار بعد الآن. تُتخطّى المباريات التجريبية فقط.
        xpEarned: isTestGame ? 0 : xpEarned,
        rrChange: isTestGame ? 0 : (rrChange + penaltyRR + bombRR),
        penaltyCount: isTestGame ? 0 : penaltyEvts.length,
        penaltyRRDeduction: isTestGame ? 0 : penaltyRR,
        bombRRChange: isTestGame ? 0 : bombRR,
        rewardBreakdown: isTestGame ? null : breakdown,
      };
    });

    if (playerRows.length > 0) {
      await db.insert(matchPlayers).values(playerRows);
    }

    // ── 🏆 إسناد النطاق: أونلاين إن كانت اللعبة عن بُعد، وإلا بطولة المكان أو الموسم العادي **بمدينة المكان** ──
    // الفصل: الأونلاين والبطولة نطاقُهما الموسم وحده (city_id NULL)؛ العادي يُكتب على صفّ (الموسم، المدينة).
    // بلا مكانٍ (غرفة «بدون نشاط» بلا مكانٍ صريح) ⇒ seasonId=null ⇒ لا رتبة لأحد (fail-safe، لا تسريب).
    const { resolveSeasonForGame, applySeasonStats, syncPlayerMirror } = await import('./season.service.js');
    const scope = await resolveSeasonForGame(state.activityId, (state.config as any)?.isRemote, state.locationId ?? null);
    const { seasonId, isRegular, cityId } = scope;
    // 🔒 ختمٌ مجمَّد: الموسم والمدينة كما كانا لحظة الاحتساب — نقلُ المكان لاحقاً لا يُعيد كتابة التاريخ
    await db.update(matches).set({ seasonId: seasonId ?? null, cityId: cityId ?? null } as any).where(eq(matches.id, state.matchId));
    if (!seasonId && !isTestGame) {
      console.warn(`⚠️ [finalizeMatch] Match #${state.matchId} has NO rank scope (no venue/season) — recorded but UNRANKED`);
    }
    // 🪙 لقطة عدّاد المباريات **قبل** زيادته — هي معيار «أول مباراة» لقطرة الترحيب.
    // تُقرأ هنا حصراً لأن السطور التالية تزيد العدّاد فيضيع المعيار.
    const lifetimeBefore = new Map<number, number>();
    if (!isTestGame && isRegular) {
      try {
        const ids = state.players.map(p => p.playerId).filter(Boolean) as number[];
        if (ids.length > 0) {
          const rows = await db.select({ id: players.id, lm: players.lifetimeMatches })
            .from(players).where(inArray(players.id, ids));
          for (const r of rows) lifetimeBefore.set(r.id, Number(r.lm ?? 0));
        }
      } catch { /* القطرات مكافأة — لا تُفشل إنهاء المباراة */ }
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

    // ── تطبيق نظام التقدم (XP + Level + RR + Rank + العدّادات) — مسارٌ واحد لكلّ النطاقات ──
    // يُكتب على صفّ (الموسم، المدينة|NULL) في player_season_stats بالقيم المخزّنة في match_players
    // (المجموع النهائيّ لكلّ الأدوار، متطابقٌ مع ما تُعيد المصالحةُ اشتقاقه)، ثمّ تُزامَن مرآةُ
    // players.* للموسم العادي، ثمّ تُرسَل إشعارات الترقية/المستوى بمدينتها.
    console.log(`📊 [finalizeMatch] isTestGame: ${isTestGame} — ${isTestGame ? 'SKIPPING' : (seasonId ? 'APPLYING' : 'UNRANKED')} progression for ${state.players.length} players`);
    if (!isTestGame && seasonId) {
      let cityName: string | null = null;
      if (cityId) {
        try { const { cityNameOf } = await import('./cities.service.js'); cityName = await cityNameOf(cityId); } catch { /* الاسم للعرض فقط */ }
      }
      const cityTail = cityName ? ` في ${cityName}` : '';
      let fcm: any = null;
      try { fcm = await import('./fcm.service.js'); } catch { /* الإشعار ليس شرطاً للاحتساب */ }

      for (const row of playerRows) {
        if (!row.playerId) { console.warn(`📊 [finalizeMatch] ⚠️ Player #${row.physicalId} (${row.playerName}) has NO playerId — progression SKIPPED`); continue; }
        try {
          const pIsMafia = isMafiaRole(row.role as any);
          const won = row.role === 'ASSASSIN' ? state.winner === 'ASSASSIN'
            : row.role === 'JESTER' ? state.winner === 'JESTER'
            : (state.winner === 'ASSASSIN' || state.winner === 'JESTER') ? false
            : (state.winner === 'MAFIA' && pIsMafia) || (state.winner === 'CITIZEN' && !pIsMafia);
          const res = await applySeasonStats(row.playerId, seasonId, cityId, row.xpEarned || 0, row.rrChange || 0, {
            won, survived: !!row.survivedToEnd, dealInitiated: !!row.dealInitiated, dealSuccess: !!row.dealSuccess,
          });
          if (isRegular) await syncPlayerMirror(row.playerId, seasonId).catch(() => {});
          console.log(`🏆 Player #${row.physicalId} (${row.playerName}) [season ${seasonId}${cityId ? `, city ${cityId}` : ''}]: +${row.xpEarned || 0} XP, ${(row.rrChange || 0) >= 0 ? '+' : ''}${row.rrChange || 0} RR${res?.promoted ? ' ⬆️' : res?.demoted ? ' ⬇️' : ''}`);

          // ── إشعارات التقدّم (تذكر المدينة للموسم العادي) ──
          if (fcm && res) {
            const data = { cityId: cityId != null ? String(cityId) : '', cityName: cityName || '', url: cityId ? `/player/rank?city=${cityId}` : '/player/rank' };
            if (res.leveledUp) {
              fcm.sendPushToPlayer(row.playerId, '🎉 ارتفع مستواك!', `أصبحت الآن Level ${res.newLevel}${cityTail} — استمر!`, 'level_up', { ...data, level: String(res.newLevel) });
            }
            if (res.promoted) {
              fcm.sendPushToPlayer(row.playerId, '🏆 ترقية! رتبة جديدة!', `مبروك! أصبحت "${RANK_NAMES_AR[res.newTier]}"${cityTail} — تستحقها!`, 'rank_up', { ...data, rankTier: res.newTier });
            }
            if (res.demoted) {
              fcm.sendPushToPlayer(row.playerId, '⬇️ انخفضت رتبتك', `رجعت لرتبة "${RANK_NAMES_AR[res.newTier]}"${cityTail} — حان وقت الانتقام!`, 'rank_down', { ...data, rankTier: res.newTier });
            }
          }
        } catch (progErr: any) {
          console.error(`⚠️ Failed to apply progression for player ${row.playerId} (${row.playerName}):`, progErr.message);
        }
      }
    } else if (isTestGame) {
      console.log(`[Match] Skipping stats and progression for match #${state.matchId} (Test Location).`);
    }

    // ── 💧 قطرات التشبس (فوز +2 · توب-3 +3 · أول مباراة +10) ──
    // بعد ثبات كل شيء، وبالمواسم العادية فقط. مفاتيح منع التكرار داخل الخدمة
    // تجعل أي استدعاء ثانٍ لنفس المباراة بلا أثر — والفشل هنا لا يمسّ المباراة.
    try {
      const { grantMatchDrops } = await import('./chips-drops.service.js');
      await grantMatchDrops({
        matchId: state.matchId!,
        isRegularSeason: !!isRegular,
        isTestMatch: isTestGame,
        players: playerRows.map(row => {
          const pIsMafia = isMafiaRole(row.role as any);
          const won = row.role === 'ASSASSIN' ? state.winner === 'ASSASSIN'
            : row.role === 'JESTER' ? state.winner === 'JESTER'
            : (state.winner === 'ASSASSIN' || state.winner === 'JESTER') ? false
            : (state.winner === 'MAFIA' && pIsMafia) || (state.winner === 'CITIZEN' && !pIsMafia);
          return {
            playerId: row.playerId,
            rrChange: row.rrChange || 0,
            won,
            lifetimeMatchesBefore: row.playerId != null ? lifetimeBefore.get(row.playerId) ?? null : null,
            name: row.playerName,
          };
        }),
      });
    } catch (dropErr: any) {
      console.warn('⚠️ Chips drops skipped:', dropErr?.message);
    }

    // ── 🔊 نغمة النصر المشتراة ──
    // تُبثّ من هنا لأن finalizeMatch هو نقطة النهاية الوحيدة المحروسة ضد التكرار
    // (game:over يُبثّ من أربعة مسارات). جهاز القائد يعزفها والشاشة تتبعه بالمرآة.
    try {
      if (!isTestGame) {
        const { resolveVictorySting } = await import('./chips-store.service.js');
        const winnersList = playerRows
          .filter(row => {
            if (!row.playerId) return false;
            const pIsMafia = isMafiaRole(row.role as any);
            return row.role === 'ASSASSIN' ? state.winner === 'ASSASSIN'
              : row.role === 'JESTER' ? state.winner === 'JESTER'
              : (state.winner === 'ASSASSIN' || state.winner === 'JESTER') ? false
              : (state.winner === 'MAFIA' && pIsMafia) || (state.winner === 'CITIZEN' && !pIsMafia);
          })
          .map(row => ({ playerId: row.playerId as number, name: row.playerName, physicalId: row.physicalId }));

        const sting = await resolveVictorySting(winnersList);
        if (sting) {
          const io = (global as any).io;
          if (io) io.to(state.roomId).emit('chips:victory-sting', sting);
          console.log(`🔊 Victory sting «${sting.itemNameAr}» for ${sting.playerName} (key: ${sting.soundKey})`);
        }
      }
    } catch (stingErr: any) {
      console.warn('⚠️ Victory sting skipped:', stingErr?.message);
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
    // 🚫 لا فائز → لعبة ملغاة: لا تُحتسب نقاطها، وتُحذف كي لا تترك أثراً.
    // ⚖️ لكن العقوبات التأديبية ليست نتيجةَ لعب — تُحفظ قبل الإلغاء وإلّا ضاعت كلياً
    //    (كانت تعيش في حالة اللعبة فقط، فتُمحى مع تصفير الحالة/حذف مفتاح Redis).
    await flushDisciplineToBonuses(state).catch(() => {});
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

// ⚖️💣 حفظ العقوبات (وأثر القنبلة) لمباراة تُلغى بلا فائز — إلى rank_bonuses الدائم.
// السبب: العقوبة إجراء تأديبيّ لا نتيجةُ لعب؛ إلغاء اللعبة يجب ألّا يمحوها. وبما أن صفّ
// match_players لن يُدرَج أصلاً (اللعبة ملغاة)، فالمكان الوحيد الباقي عبر إعادة الاحتساب
// هو rank_bonuses — تقرؤه المصالحة وتُعيد تطبيقه دائماً.
// مفتاح منع التكرار: (player_id, reason) حيث reason يحمل رقم المباراة.
export async function flushDisciplineToBonuses(state: GameState): Promise<void> {
  const db = getDB();
  if (!db || !state?.matchId) return;
  const tracking: any = state.performanceTracking || {};
  const events = [
    ...(tracking.penaltyEvents || []).map((e: any) => ({ ...e, kind: 'عقوبة' })),
    ...(tracking.bombEvents || []).map((e: any) => ({ ...e, kind: 'قنبلة' })),
  ].filter((e: any) => e?.playerId && e.rr);
  if (events.length === 0) return;

  // 🛡️ نفس بوّابات العزل: لا أثر لمواقع الاختبار، ولا كتابة بلا موسم نشط (أو بلا مكان/مدينة)
  if (await isTestScope(state)) return;
  const { resolveSeasonForGame } = await import('./season.service.js');
  const { seasonId, cityId } = await resolveSeasonForGame(state.activityId, (state.config as any)?.isRemote, state.locationId ?? null);
  if (!seasonId) return;

  // تجميع لكل لاعب (عقوبتان في نفس المباراة = صفّ واحد بالمجموع)
  const byPlayer = new Map<number, { rr: number; kinds: Set<string> }>();
  for (const e of events) {
    const cur = byPlayer.get(e.playerId) || { rr: 0, kinds: new Set<string>() };
    cur.rr += Number(e.rr) || 0;
    cur.kinds.add(e.kind);
    byPlayer.set(e.playerId, cur);
  }

  let saved = 0;
  for (const [playerId, agg] of byPlayer) {
    if (!agg.rr) continue;
    const reason = `${[...agg.kinds].join('+')} — مباراة ملغاة #${state.matchId}`;
    try {
      const dup: any = await db.execute(
        sql`SELECT id FROM rank_bonuses WHERE player_id = ${playerId} AND reason = ${reason} LIMIT 1`);
      const rows: any[] = dup?.rows ?? (Array.isArray(dup) ? dup : []);
      if (rows.length > 0) continue;   // آمن للتكرار
      await db.execute(sql`INSERT INTO rank_bonuses (player_id, rr, reason, season_id, city_id)
        VALUES (${playerId}, ${agg.rr}, ${reason}, ${seasonId}, ${cityId ?? null})`);
      saved++;
    } catch (e: any) {
      console.warn(`⚠️ [flushDiscipline] Failed to persist for player ${playerId}:`, e?.message || e);
    }
  }

  if (saved > 0) {
    console.log(`⚖️ [flushDiscipline] Preserved ${saved} discipline record(s) from cancelled match #${state.matchId} into rank_bonuses`);
    // مصالحة مستهدفة كي ينعكس الأثر فوراً بدل انتظار مصالحة لاحقة
    try {
      const { reconcileSeasonProgression } = await import('./reconcile.service.js');
      await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: [...byPlayer.keys()] });
    } catch { /* ستصحّحها المصالحة التالية */ }
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
    if (await isTestScope(state)) return;

    // resolveSeasonForGame (لا ForActivity) — كي تشمل شبكةُ أمان ما بعد المباراة موسمَ الأونلاين أيضاً
    const { resolveSeasonForGame } = await import('./season.service.js');
    const { reconcileSeasonProgression } = await import('./reconcile.service.js');
    const { seasonId } = await resolveSeasonForGame(state.activityId, (state.config as any)?.isRemote, state.locationId ?? null);
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

    // 🔴 نسخةٌ ثانيةٌ من القائمة اليدويّة الرباعيّة — تُسقط الساحرةَ والأخَ
    //    الأكبر كنظيرتها في player.service. المصدرُ الموحَّد يمنع تباعُدَهما.
    const teamPlayers = players.map(p => ({
      physicalId: p.physicalId,
      playerName: p.playerName,
      role: p.role,
      team: teamOfRole(p.role),
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

// ── 📊 ملخص نقاط لاعب من صفّ match_players (دالة نقية بلا DB) ──
// تُستخدم في getMatchPlayerPoints وفي الاختبار. تعتمد buildDisplayBreakdown (نفس منطق العرض في
// السجل): الكسب = مجموع البنود الموجبة، الخسارة = مجموع البنود السالبة، المجموع = صافي rr_change.
// ثابت أساسي: rrGained + rrLost === rrTotal (لأن سطر «التسوية» يضمن أن مجموع البنود = الإجمالي المخزّن).
export function summarizeMatchPlayerPoints(row: any, cfg?: any) {
  const bd = buildDisplayBreakdown(row, cfg);
  const sumPos = (lines: any[]) => lines.filter((l) => l.value > 0).reduce((s, l) => s + l.value, 0);
  const sumNeg = (lines: any[]) => lines.filter((l) => l.value < 0).reduce((s, l) => s + l.value, 0);
  return {
    team: bd.team,
    won: bd.won,
    rrGained: sumPos(bd.rr), rrLost: sumNeg(bd.rr), rrTotal: bd.rrTotal,
    xpGained: sumPos(bd.xp), xpLost: sumNeg(bd.xp), xpTotal: bd.xpTotal,
    rrBreakdown: bd.rr,
    xpBreakdown: bd.xp,
  };
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
    return rows.map((r: any) => ({
      matchPlayerId: r.id,
      playerId: r.playerId,
      physicalId: r.physicalId,
      playerName: r.playerName,
      role: r.role,
      ...summarizeMatchPlayerPoints({ ...r, matchWinner: match?.winner ?? null }, cfg),
    }));
  } catch (err: any) {
    console.error('❌ Failed to fetch match player points:', err.message);
    return [];
  }
}

// ── 🔧 حساب القيم بعد التعديل اليدوي (دالة نقية للاختبار) — يطابق منطق adjustMatchPlayerPoints ──
// match_players: دلتا بسيطة. players.*: دلتا بحدّ أدنى 0 (GREATEST(0, ...)).
export function computeAdjustedValues(
  cur: { mpXp: number; mpRr: number; playerXp: number; playerRr: number },
  xpDelta: number,
  rrDelta: number,
) {
  return {
    mpXp: cur.mpXp + xpDelta,
    mpRr: cur.mpRr + rrDelta,
    playerXp: Math.max(0, cur.playerXp + xpDelta),
    playerRr: Math.max(0, cur.playerRr + rrDelta),
  };
}

// ── 🔧 تعديل يدوي لنقاط لاعب في مباراة محددة (نفس منطق التعديل اليدوي في صفحة نظام التقدم) ──
// دلتا تُضاف لـ match_players (المصدر) + players.* (مع حد أدنى 0). تُعيد لقطة اللاعب المحدّثة.
export async function adjustMatchPlayerPoints(
  matchPlayerId: number,
  opts: { xpDelta?: number; rrDelta?: number; reason?: string; by?: string },
): Promise<{ player: any; matchPlayerId: number } | null> {
  const db = getDB();
  if (!db) return null;
  const [mp] = await db.select({ id: matchPlayers.id, matchId: matchPlayers.matchId, playerId: matchPlayers.playerId, xpEarned: matchPlayers.xpEarned, rrChange: matchPlayers.rrChange, playerName: matchPlayers.playerName })
    .from(matchPlayers).where(eq(matchPlayers.id, matchPlayerId)).limit(1);
  if (!mp) return null;

  const xpDelta = Math.trunc(Number(opts.xpDelta || 0));
  const rrDelta = Math.trunc(Number(opts.rrDelta || 0));

  // 1) match_players (المصدر — دلتا)
  const mpUpdates: any = {};
  if (xpDelta) mpUpdates.xpEarned = (mp.xpEarned || 0) + xpDelta;
  if (rrDelta) mpUpdates.rrChange = (mp.rrChange || 0) + rrDelta;
  if (Object.keys(mpUpdates).length) await db.update(matchPlayers).set(mpUpdates).where(eq(matchPlayers.id, matchPlayerId));

  // 2) التجميعة — مصالحةٌ مستهدفة من مصدر الحقيقة (صفّ match_players المعدَّل) في موسم المباراة ومدينتها.
  //    🏙️ لا دلتا على players.* بعد الآن: الصفُّ الصحيح هو (الموسم، المدينة) في player_season_stats،
  //    والمصالحة تكتبه وتزامن المرآة معاً. للاعبين المسجّلين فقط.
  let player: any = null;
  if (mp.playerId) {
    if (xpDelta || rrDelta) {
      try {
        const [m] = await db.select({ seasonId: matches.seasonId }).from(matches).where(eq(matches.id, mp.matchId)).limit(1);
        if (m?.seasonId) {
          const { reconcileSeasonProgression } = await import('./reconcile.service.js');
          await reconcileSeasonProgression(m.seasonId, true, () => {}, { onlyPlayerIds: [mp.playerId] });
        } else {
          console.warn(`⚠️ [adjust] match #${mp.matchId} has no season — ledger updated, no standings to reconcile`);
        }
      } catch (recErr: any) {
        console.warn(`⚠️ Post-adjust reconcile failed for player ${mp.playerId}:`, recErr.message);
      }
    }
    [player] = await db.select({ xp: players.xp, level: players.level, rankTier: players.rankTier, rankRR: players.rankRR })
      .from(players).where(eq(players.id, mp.playerId)).limit(1);
  }

  console.log(`🔧 [leader] adjusted matchPlayer #${matchPlayerId} (player ${mp.playerId} — ${mp.playerName}): XP${xpDelta >= 0 ? '+' : ''}${xpDelta}, RR${rrDelta >= 0 ? '+' : ''}${rrDelta} — ${opts.reason || 'no reason'} by ${opts.by || 'leader'}`);
  return { player, matchPlayerId };
}
