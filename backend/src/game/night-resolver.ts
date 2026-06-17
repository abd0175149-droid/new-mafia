// ══════════════════════════════════════════════════════
// 🌙 معالج التقاطعات الليلية (Night Resolver)
// المرجع: docs/04_NIGHT_PHASE_ENGINE.md - القسم 2
// ══════════════════════════════════════════════════════

import {
  type GameState,
  type MorningEvent,
  type NightActions,
  getAlivePlayers,
} from './state.js';
import { getGameState, setGameState } from '../config/redis.js';
import { Role, isMafiaRole, isNeutralRole } from './roles.js';
import { checkWinCondition, WinResult } from './win-checker.js';
import { checkNeutralVoteWin, type NeutralResult } from './dynamic-win-checker.js';
import { processTwinBond, applySuicide, applyTransform } from './twin-engine.js';

export interface NightResolution {
  events: MorningEvent[];
  winResult: WinResult;
  neutralWin?: NeutralResult | null; // 🤡 فوز المهرج
}

/**
 * معالجة جميع التقاطعات الليلية
 * يعمل بعد إكمال الليدر لجميع خطوات الطابور
 *
 * ترتيب المعالجة:
 * 1. القنص (يُعالج أولاً - مستقل)
 * 2. الاغتيال vs الحماية (التقاطع الرئيسي)
 * 3. الإسكات (يُسجل للنهار القادم)
 * 4. الاستعلام (نتيجة للشريف فقط)
 */
export async function resolveNight(roomId: string): Promise<NightResolution> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const { nightActions } = state;
  const events: MorningEvent[] = [];

  // ── تهيئة التتبع ──
  if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
  const pt = state.performanceTracking;

  // ═══ 🧙‍♀️ إلغاء أهداف اللاعبين المعطّلين قبل المعالجة ═══
  const isDisabled = (role: Role | string | null) => {
    if (!role) return false;
    const player = state.players.find(p => p.role === role && p.isAlive);
    return player?.disabledUntilRound != null && player.disabledUntilRound >= (state.round || 1);
  };

  // الاغتيال: فحص إذا كان منفذ الاغتيال الحالي (حسب الترتيب) معطلاً
  const activeAssassinator = state.players.find(p => 
    [Role.GODFATHER, Role.CHAMELEON, Role.SILENCER, Role.OLDER_BROTHER, Role.MAFIA_REGULAR].includes(p.role as Role) && p.isAlive
  );
  if (activeAssassinator && activeAssassinator.disabledUntilRound != null && activeAssassinator.disabledUntilRound >= (state.round || 1)) {
    nightActions.godfatherTarget = null;
  }

  if (isDisabled(Role.SILENCER)) { nightActions.silencerTarget = null; }
  if (isDisabled(Role.SHERIFF)) { nightActions.sheriffTarget = null; }
  if (isDisabled(Role.DOCTOR)) { nightActions.doctorTarget = null; }
  if (isDisabled(Role.SNIPER)) { nightActions.sniperTarget = null; }
  if (isDisabled(Role.NURSE)) { nightActions.nurseTarget = null; }
  if (isDisabled('ASSASSIN' as any)) { nightActions.assassinTarget = null; }

  // ── 1. معالجة القنص ──────────────────────────
  if (nightActions.sniperTarget !== null) {
    const sniperTarget = state.players.find(p => p.physicalId === nightActions.sniperTarget);
    const sniper = state.players.find(p => p.role === Role.SNIPER && p.isAlive);
    const sniperProtectedId = nightActions.doctorTarget ?? nightActions.nurseTarget;

    if (sniperTarget && sniper && nightActions.sniperTarget === sniperProtectedId) {
      // 🛡️ القنص يخضع لحماية الطبيب/الممرضة — الحماية تبطل القنص (لا أحد يموت، حتى القنّاص ينجو)
      const protector = state.players.find(p => (p.role === Role.DOCTOR || p.role === Role.NURSE) && p.isAlive);
      events.push({ type: 'ASSASSINATION_BLOCKED', targetPhysicalId: sniperTarget.physicalId, targetName: sniperTarget.name, performerPhysicalId: protector?.physicalId, performerName: protector?.name, wasRandom: !!nightActions.randomSelections?.['SNIPER'], extra: { blockedAbility: 'SNIPER', sniperName: sniper.name }, revealed: false });
      pt.abilityResults.push({ physicalId: sniper.physicalId, role: 'SNIPER', correct: false });
      if (protector) pt.abilityResults.push({ physicalId: protector.physicalId, role: protector.role || 'DOCTOR', correct: true });
    } else if (sniperTarget && sniper) {
      if (sniperTarget.role && (isMafiaRole(sniperTarget.role) || isNeutralRole(sniperTarget.role))) {
        // قنص مافيا أو محايد → تموت الهدف فقط
        sniperTarget.isAlive = false;
        events.push({ type: 'SNIPE_MAFIA', targetPhysicalId: sniperTarget.physicalId, targetName: sniperTarget.name, performerPhysicalId: sniper.physicalId, performerName: sniper.name, wasRandom: !!nightActions.randomSelections?.['SNIPER'], extra: { sniperName: sniper.name, targetRole: sniperTarget.role }, revealed: false });
        pt.abilityResults.push({ physicalId: sniper.physicalId, role: 'SNIPER', correct: true });
        pt.eliminationLog.push({ physicalId: sniperTarget.physicalId, eliminatedBy: 'SNIPER', round: state.round || 1, team: isMafiaRole(sniperTarget.role) ? 'MAFIA' : 'NEUTRAL' });
      } else {
        // قنص مواطن → يموت المواطن + القناص معاً
        sniperTarget.isAlive = false;
        sniper.isAlive = false;
        events.push({ type: 'SNIPE_CITIZEN', targetPhysicalId: sniperTarget.physicalId, targetName: sniperTarget.name, performerPhysicalId: sniper.physicalId, performerName: sniper.name, wasRandom: !!nightActions.randomSelections?.['SNIPER'], extra: { sniperPhysicalId: sniper.physicalId, sniperName: sniper.name, targetRole: sniperTarget.role }, revealed: false });
        pt.abilityResults.push({ physicalId: sniper.physicalId, role: 'SNIPER', correct: false });
        pt.eliminationLog.push({ physicalId: sniperTarget.physicalId, eliminatedBy: 'SNIPER', round: state.round || 1, team: 'CITIZEN' });
        pt.eliminationLog.push({ physicalId: sniper.physicalId, eliminatedBy: 'SNIPER', round: state.round || 1, team: 'CITIZEN' });
      }
    }
  }

  // ── 2. معالجة الاغتيال vs الحماية ──────────────
  if (nightActions.godfatherTarget !== null) {
    const assassinTarget = state.players.find(p => p.physicalId === nightActions.godfatherTarget);
    const protectedId = nightActions.doctorTarget ?? nightActions.nurseTarget;

    if (assassinTarget && assassinTarget.isAlive) {
      if (nightActions.godfatherTarget === protectedId) {
        // الحماية نجحت → الهدف يبقى حياً
        const assassinatorBlocked = state.players.find(p => (p.role === Role.GODFATHER || p.role === Role.CHAMELEON || p.role === Role.SILENCER || p.role === Role.MAFIA_REGULAR) && p.isAlive && p.physicalId !== assassinTarget.physicalId);
        const protectorBlocked = state.players.find(p => (p.role === Role.DOCTOR || p.role === Role.NURSE) && p.isAlive);
        events.push({ type: 'ASSASSINATION_BLOCKED', targetPhysicalId: assassinTarget.physicalId, targetName: assassinTarget.name, performerPhysicalId: protectorBlocked?.physicalId, performerName: protectorBlocked?.name, wasRandom: !!nightActions.randomSelections?.['DOCTOR'] || !!nightActions.randomSelections?.['NURSE'], extra: { assassinId: assassinatorBlocked?.physicalId, assassinName: assassinatorBlocked?.name, wasAssassinRandom: !!nightActions.randomSelections?.['GODFATHER'] }, revealed: false });
        // الطبيب/الممرضة أصاب
        const doctorPlayer = state.players.find(p => (p.role === Role.DOCTOR || p.role === Role.NURSE) && p.isAlive && p.physicalId !== assassinTarget.physicalId);
        if (doctorPlayer) {
          pt.abilityResults.push({ physicalId: doctorPlayer.physicalId, role: doctorPlayer.role || 'DOCTOR', correct: true });
        }
      } else {
        // الاغتيال نجح
        assassinTarget.isAlive = false;
        const assassinator = state.players.find(p => (p.role === Role.GODFATHER || p.role === Role.CHAMELEON || p.role === Role.SILENCER || p.role === Role.MAFIA_REGULAR) && p.isAlive && p.physicalId !== assassinTarget.physicalId);
        events.push({ type: 'ASSASSINATION', targetPhysicalId: assassinTarget.physicalId, targetName: assassinTarget.name, performerPhysicalId: assassinator?.physicalId, performerName: assassinator?.name, wasRandom: !!nightActions.randomSelections?.['GODFATHER'], extra: { targetRole: assassinTarget.role }, revealed: false });
        pt.eliminationLog.push({
          physicalId: assassinTarget.physicalId,
          eliminatedBy: 'NIGHT_KILL',
          round: state.round || 1,
          team: (assassinTarget.role && isMafiaRole(assassinTarget.role)) ? 'MAFIA' : 'CITIZEN',
        });

        if (protectedId !== null) {
          const protectedPlayer = state.players.find(p => p.physicalId === protectedId);
          if (protectedPlayer) {
            events.push({ type: 'PROTECTION_FAILED', targetPhysicalId: protectedPlayer.physicalId, targetName: protectedPlayer.name, revealed: false });
          }
          // الطبيب/الممرضة أخطأ
          const doctorPlayer = state.players.find(p => (p.role === Role.DOCTOR || p.role === Role.NURSE) && p.isAlive && p.physicalId !== assassinTarget.physicalId);
          if (doctorPlayer) {
            pt.abilityResults.push({ physicalId: doctorPlayer.physicalId, role: doctorPlayer.role || 'DOCTOR', correct: false });
          }
        }
      }
    }
  }

  // ── 3. معالجة الإسكات ──────────────────────────
  if (nightActions.silencerTarget !== null) {
    const silenced = state.players.find(p => p.physicalId === nightActions.silencerTarget);
    if (silenced && silenced.isAlive) {
      silenced.isSilenced = true;
      const silencer = state.players.find(p => p.role === Role.SILENCER && p.isAlive);
      events.push({ type: 'SILENCED', targetPhysicalId: silenced.physicalId, targetName: silenced.name, performerPhysicalId: silencer?.physicalId, performerName: silencer?.name, wasRandom: !!nightActions.randomSelections?.['SILENCER'], revealed: false });
    }
  }

  // ── 4. معالجة استعلام الشريف ──────────────────
  if (nightActions.sheriffTarget !== null) {
    const investigated = state.players.find(p => p.physicalId === nightActions.sheriffTarget);
    if (investigated) {
      let result: string;
      if (investigated.role === Role.CHAMELEON) {
        // 🧙‍♀️ الحرباية المعطّلة تُكشف هويتها الحقيقية
        const isChamDisabled = investigated.disabledUntilRound != null && investigated.disabledUntilRound >= (state.round || 1);
        result = isChamDisabled ? 'MAFIA' : 'CITIZEN';
      } else if (investigated.role && isMafiaRole(investigated.role)) {
        result = 'MAFIA';
      } else {
        result = 'CITIZEN';
      }

      state.nightActions.sheriffResult = result;
      const sheriffPlayer = state.players.find(p => p.role === Role.SHERIFF && p.isAlive);
      events.push({ type: 'SHERIFF_RESULT', targetPhysicalId: investigated.physicalId, targetName: investigated.name, performerPhysicalId: sheriffPlayer?.physicalId, performerName: sheriffPlayer?.name, wasRandom: !!nightActions.randomSelections?.['SHERIFF'], extra: { result }, revealed: false });

      // تتبع دقة الشريف (هل أصاب مافيا فعلاً؟)
      const sheriff = state.players.find(p => p.role === Role.SHERIFF && p.isAlive);
      if (sheriff) {
        const actuallyMafia = investigated.role ? isMafiaRole(investigated.role) : false;
        const reportedMafia = result === 'MAFIA';
        // الشريف "أصاب" إذا حقق مع مافيا فعلية (بغض النظر عن خداع الحرباء)
        pt.abilityResults.push({ physicalId: sheriff.physicalId, role: 'SHERIFF', correct: actuallyMafia });
      }
    }
  }

  // ── 5. تحديث قيد الطبيب ──────────────────────
  state.nightActions.lastProtectedTarget = nightActions.doctorTarget ?? nightActions.nurseTarget ?? null;

  // ── 4.5. معالجة اغتيال السفّاح ──────────────────
  if (state.assassinState && nightActions.assassinTarget !== null) {
    const { evaluateAssassinKill } = await import('./assassin-engine.js');
    const targetId = nightActions.assassinTarget;
    const target = state.players.find(p => p.physicalId === targetId);

    if (target && target.isAlive) {
      const protectedId = nightActions.doctorTarget ?? nightActions.nurseTarget;
      if (targetId === protectedId) {
        // الحماية نجحت ضد السفّاح!
        events.push({
          type: 'ASSASSIN_BLOCKED' as any,
          targetPhysicalId: targetId,
          targetName: target.name,
          performerPhysicalId: state.assassinState.assassinPhysicalId,
          performerName: state.players.find(p => p.physicalId === state.assassinState.assassinPhysicalId)?.name || '',
          revealed: false,
        });
        console.log(`🛡️ [resolveNight] Assassin kill blocked by protection on ${target.name}`);
      } else {
        // القتل ينجح!
        target.isAlive = false;
        const wasRandom = !!nightActions.randomSelections?.['ASSASSIN'];
        const evalResult = evaluateAssassinKill(state, targetId);

        events.push({
          type: 'ASSASSIN_KILL' as any,
          targetPhysicalId: targetId,
          targetName: target.name,
          performerPhysicalId: state.assassinState.assassinPhysicalId,
          performerName: state.players.find(p => p.physicalId === state.assassinState.assassinPhysicalId)?.name || '',
          wasRandom,
          extra: {
            contractCompleted: evalResult.contractCompleted,
            contractId: evalResult.contractId,
            assassinWon: evalResult.won,
            targetRole: target.role,
          },
          revealed: false,
        });

        pt.eliminationLog.push({
          physicalId: target.physicalId,
          eliminatedBy: 'ASSASSIN',
          round: state.round || 1,
          team: (target.role && isMafiaRole(target.role)) ? 'MAFIA' : 'CITIZEN',
        });
        console.log(`🔪 [resolveNight] Assassin killed ${target.name} — contract: ${evalResult.contractCompleted ? '✅' : '❌'}, won: ${evalResult.won}`);
      }
    }
  }

  // تحديث حالة السفاح سواء تصرف هذه الليلة أم لا
  if (state.assassinState) {
    if (!state.assassinState.firstNightPassed) {
      state.assassinState.firstNightPassed = true;
    }

    const { regenerateDeadContracts } = await import('./assassin-engine.js');
    const regen = regenerateDeadContracts(state);
    if (regen.changed) {
      console.log(`🔄 [resolveNight] Assassin contracts updated: ${regen.changeLog.join(', ')}`);
    }
  }

  // ── 5.5. فحص تفعيل الشرطية (لكل لاعب مات هذه الليلة) ──
  const deadThisNight: number[] = [];
  for (const ev of events) {
    if (['ASSASSINATION', 'SNIPE_MAFIA', 'SNIPE_CITIZEN', 'ASSASSIN_KILL'].includes(ev.type)) {
      deadThisNight.push(ev.targetPhysicalId);
      // القناص يموت أيضاً عند قنص مواطن
      if (ev.type === 'SNIPE_CITIZEN' && ev.extra?.sniperPhysicalId) {
        deadThisNight.push(ev.extra.sniperPhysicalId as number);
      }
    }
  }

  // فرز: إذا كانت الشرطية من ضمن الموتى، نفحصها أولاً لتفعيل صلاحيتها حتى تُحسب وفيات نفس الليلة
  deadThisNight.sort((a, b) => {
    const roleA = state.players.find(p => p.physicalId === a)?.role;
    const roleB = state.players.find(p => p.physicalId === b)?.role;
    if (roleA === Role.POLICEWOMAN) return -1;
    if (roleB === Role.POLICEWOMAN) return 1;
    return 0;
  });

  for (const pid of deadThisNight) {
    checkPolicewomanTrigger(state, pid);
  }

  // ── 5.6. إضافة حدث تعطيل الساحرة (إن وجد) ──
  if (nightActions.witchTarget != null) {
    const witchTargetPlayer = state.players.find(p => p.physicalId === nightActions.witchTarget);
    const witchPlayer = state.players.find(p => p.role === 'WITCH' && p.isAlive);
    
    if (witchTargetPlayer) {
      events.push({
        type: 'ABILITY_DISABLED',
        targetPhysicalId: witchTargetPlayer.physicalId,
        targetName: witchTargetPlayer.name,
        performerPhysicalId: witchPlayer?.physicalId,
        performerName: witchPlayer?.name,
        wasRandom: !!nightActions.randomSelections?.['WITCH'],
        extra: {
          disabledRole: witchTargetPlayer.role
        },
        revealed: false
      });
      console.log(`🧙‍♀️ [resolveNight] Witch disabled ${witchTargetPlayer.name}`);
    }
  }

  // ── 6. حفظ أحداث الصباح ───────────────────────
  state.morningEvents = events;

  // ── 7. فحص فوز المهرج (إذا القناص قتله) ──────────────
  let neutralWin: NeutralResult | null = null;
  for (const ev of events) {
    if (ev.type === 'SNIPE_CITIZEN' && ev.targetPhysicalId) {
      try {
        const nw = await checkNeutralVoteWin(state, ev.targetPhysicalId, 'SNIPER');
        if (nw?.won) { neutralWin = nw; break; }
      } catch { /* المحرك الديناميكي غير متاح */ }
    }
  }

  // 🤡 فوز المهرج = اللعبة تنتهي فوراً
  if (neutralWin?.won) {
    state.winner = 'JESTER';
    await setGameState(roomId, state);
    return { events, winResult: WinResult.GAME_CONTINUES, neutralWin };
  }

  // ═══ 👥 معالجة ارتباط التوأمين (قبل فحص الفوز) ═══
  if (state.twinState) {
    // جمع كل اللاعبين الذين ماتوا هذه الليلة
    const nightDeaths = events
      .filter(e => ['ASSASSINATION', 'SNIPE_MAFIA', 'SNIPE_CITIZEN', 'ASSASSIN_KILL'].includes(e.type))
      .map(e => e.targetPhysicalId);

    // القناص يموت أيضاً عند قنص مواطن
    const sniperDeathEvent = events.find(e => e.type === 'SNIPE_CITIZEN');
    if (sniperDeathEvent) {
      const sniper = state.players.find(p => p.role === Role.SNIPER);
      if (sniper) nightDeaths.push(sniper.physicalId);
    }

    for (const deadId of nightDeaths) {
      const twinResult = processTwinBond(state, deadId, 'NIGHT');
      if (twinResult.triggered) {
        if (twinResult.type === 'SUICIDE') {
          const suicideEvent = applySuicide(state, twinResult);
          if (suicideEvent) {
            events.push(suicideEvent);
            // فحص الشرطية بعد الانتحار
            checkPolicewomanTrigger(state, twinResult.suicidePhysicalId!);
          }
        } else if (twinResult.type === 'TRANSFORM') {
          const transformEvent = applyTransform(state, twinResult);
          if (transformEvent) events.push(transformEvent);
        }
        break; // ارتباط الدم يحدث مرة واحدة فقط
      }
    }
  }

  let finalWinResult = WinResult.GAME_CONTINUES;
  // ── 8. فحص شرط الفوز ─────────────────
  if (state.assassinState?.won) {
    state.winner = 'ASSASSIN';
  } else {
    finalWinResult = checkWinCondition(state);
    if (finalWinResult !== WinResult.GAME_CONTINUES) {
      state.winner = finalWinResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
    }
  }

  await setGameState(roomId, state);

  return { events, winResult: finalWinResult, neutralWin };
}

// ══════════════════════════════════════════════════════
// 👮‍♀️ فحص تفعيل الشرطية عند خروج أي لاعب
// ══════════════════════════════════════════════════════
export function checkPolicewomanTrigger(state: GameState, eliminatedPhysicalId: number): void {
  const eliminated = state.players.find(p => p.physicalId === eliminatedPhysicalId);
  if (!eliminated || !eliminated.role) return;

  // 1. هل الشرطية هي من خرجت؟
  if (eliminated.role === Role.POLICEWOMAN && !state.policewomanState) {
    // عدد المواطنين الأحياء لحظة خروجها (بدونها هي)
    const citizenAlive = state.players.filter(
      p => p.isAlive && p.role && !isMafiaRole(p.role as Role) && p.physicalId !== eliminatedPhysicalId
    ).length;
    const threshold = Math.ceil(citizenAlive / 4);

    state.policewomanState = {
      isTriggered: true,
      triggerRound: state.round || 1,
      citizenAliveAtTrigger: citizenAlive,
      threshold,
      citizenDeathsSinceTrigger: 0,
      isReady: threshold === 0,
      isUsed: false,
      policewomanPhysicalId: eliminated.physicalId,
      policewomanName: eliminated.name,
    };
    return;
  }

  // 2. هل المُقصى مواطن + الشرطية مُفعّلة ولم تستخدم بعد؟
  if (
    state.policewomanState &&
    state.policewomanState.isTriggered &&
    !state.policewomanState.isReady &&
    !state.policewomanState.isUsed &&
    !isMafiaRole(eliminated.role as Role)
  ) {
    state.policewomanState.citizenDeathsSinceTrigger += 1;
    if (state.policewomanState.citizenDeathsSinceTrigger >= state.policewomanState.threshold) {
      state.policewomanState.isReady = true;
    }
  }
}

/**
 * تجهيز أحداث الليل الفارغة لجولة جديدة
 * يُنادى عند بدء كل ليلة جديدة
 */
export async function resetNightActions(roomId: string): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const lastProtected = state.nightActions.lastProtectedTarget;

  state.nightActions = {
    godfatherTarget: null,
    silencerTarget: null,
    sheriffTarget: null,
    sheriffResult: null,
    doctorTarget: null,
    sniperTarget: null,
    nurseTarget: null,
    assassinTarget: null,
    lastProtectedTarget: lastProtected, // يبقى قيد الطبيب
  };

  state.morningEvents = [];

  // إزالة الإسكات من الجولة السابقة
  state.players.forEach(p => {
    p.isSilenced = false;
    // 🧙‍♀️ تصفير التعطيل المنتهي
    if (p.disabledUntilRound != null && p.disabledUntilRound < (state.round || 1)) {
      p.disabledUntilRound = undefined;
      p.disabledRoleName = undefined;
    }
  });

  // تصفير حالة تفعيل الممرضة
  state.nurseActivated = false;

  state.nightActions.witchTarget = null;

  await setGameState(roomId, state);
  return state;
}

/**
 * الحصول على قائمة الأهداف المتاحة لكل دور ليلي
 * - الطبيب: لا يمكن حماية نفس الهدف ليلتين متتاليتين
 * - الشيخ: الأحياء فقط
 */
export function getAvailableTargets(state: GameState, role: Role): number[] {
  const alive = getAlivePlayers(state);

  switch (role) {
    case Role.GODFATHER:
      // يستهدف المواطنين الأحياء فقط (لا يستهدف فريقه)
      return alive
        .filter(p => p.role && !isMafiaRole(p.role))
        .map(p => p.physicalId);

    case Role.SILENCER:
      // يستهدف أي لاعب حي (بما فيهم فريقه - حسب القواعد)
      return alive.map(p => p.physicalId);

    case Role.SHERIFF:
      // يستعلم عن أي لاعب حي
      return alive
        .filter(p => p.role !== Role.SHERIFF) // لا يستعلم عن نفسه
        .map(p => p.physicalId);

    case Role.DOCTOR:
      // يحمي أي لاعب حي ما عدا الهدف المحمي في الليلة الماضية
      return alive
        .filter(p => p.physicalId !== state.nightActions.lastProtectedTarget)
        .map(p => p.physicalId);

    case Role.SNIPER:
      // يقنص أي لاعب حي
      return alive
        .filter(p => p.role !== Role.SNIPER) // لا يقنص نفسه
        .map(p => p.physicalId);

    case Role.NURSE:
      // نفس منطق الطبيب
      return alive
        .filter(p => p.physicalId !== state.nightActions.lastProtectedTarget)
        .map(p => p.physicalId);

    default: {
      // 🧙‍♀️ الساحرة: المواطنين والمستقلين (ماعدا الشرطية + الأهداف السابقة + نفسها)
      if ((role as string) === 'WITCH') {
        const witch = state.players.find((p: any) => (p.role as string) === 'WITCH' && p.isAlive);
        const previousTargets: number[] = (state as any).witchPreviousTargets || [];
        return alive
          .filter(p => p.role && !isMafiaRole(p.role))            // مواطنين/محايدين فقط
          .filter(p => p.role !== Role.POLICEWOMAN)                // لا تستهدف الشرطية
          .filter(p => p.physicalId !== witch?.physicalId)         // لا تستهدف نفسها
          .filter(p => !previousTargets.includes(p.physicalId))   // لا تكرر هدفاً
          .map(p => p.physicalId);
      }
      // 🔪 السفّاح: كل الأحياء ما عدا نفسه
      if ((role as string) === 'ASSASSIN') {
        const assassin = state.players.find(p => (p.role as string) === 'ASSASSIN' && p.isAlive);
        return alive
          .filter(p => p.physicalId !== assassin?.physicalId)
          .map(p => p.physicalId);
      }
      return [];
    }
  }
}
