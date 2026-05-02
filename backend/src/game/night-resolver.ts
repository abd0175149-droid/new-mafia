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
import { Role, isMafiaRole } from './roles.js';
import { checkWinCondition, WinResult } from './win-checker.js';

export interface NightResolution {
  events: MorningEvent[];
  winResult: WinResult;
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

  // ── 1. معالجة القنص ──────────────────────────
  if (nightActions.sniperTarget !== null) {
    const sniperTarget = state.players.find(p => p.physicalId === nightActions.sniperTarget);
    const sniper = state.players.find(p => p.role === Role.SNIPER && p.isAlive);

    if (sniperTarget && sniper) {
      if (sniperTarget.role && isMafiaRole(sniperTarget.role)) {
        // قنص مافيا → تموت المافيا فقط
        sniperTarget.isAlive = false;
        events.push({ type: 'SNIPE_MAFIA', targetPhysicalId: sniperTarget.physicalId, targetName: sniperTarget.name, extra: { sniperName: sniper.name, targetRole: sniperTarget.role }, revealed: false });
        pt.abilityResults.push({ physicalId: sniper.physicalId, role: 'SNIPER', correct: true });
        pt.eliminationLog.push({ physicalId: sniperTarget.physicalId, eliminatedBy: 'SNIPER', round: state.round || 1, team: 'MAFIA' });
      } else {
        // قنص مواطن → يموت المواطن + القناص معاً
        sniperTarget.isAlive = false;
        sniper.isAlive = false;
        events.push({ type: 'SNIPE_CITIZEN', targetPhysicalId: sniperTarget.physicalId, targetName: sniperTarget.name, extra: { sniperPhysicalId: sniper.physicalId, sniperName: sniper.name, targetRole: sniperTarget.role }, revealed: false });
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
        events.push({ type: 'ASSASSINATION_BLOCKED', targetPhysicalId: assassinTarget.physicalId, targetName: assassinTarget.name, revealed: false });
        // الطبيب/الممرضة أصاب
        const doctorPlayer = state.players.find(p => (p.role === Role.DOCTOR || p.role === Role.NURSE) && p.isAlive && p.physicalId !== assassinTarget.physicalId);
        if (doctorPlayer) {
          pt.abilityResults.push({ physicalId: doctorPlayer.physicalId, role: doctorPlayer.role || 'DOCTOR', correct: true });
        }
      } else {
        // الاغتيال نجح
        assassinTarget.isAlive = false;
        events.push({ type: 'ASSASSINATION', targetPhysicalId: assassinTarget.physicalId, targetName: assassinTarget.name, extra: { targetRole: assassinTarget.role }, revealed: false });
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
        }
      }
    }
  }

  // ── 3. معالجة الإسكات ──────────────────────────
  if (nightActions.silencerTarget !== null) {
    const silenced = state.players.find(p => p.physicalId === nightActions.silencerTarget);
    if (silenced && silenced.isAlive) {
      silenced.isSilenced = true;
      events.push({ type: 'SILENCED', targetPhysicalId: silenced.physicalId, targetName: silenced.name, revealed: false });
    }
  }

  // ── 4. معالجة استعلام الشريف ──────────────────
  if (nightActions.sheriffTarget !== null) {
    const investigated = state.players.find(p => p.physicalId === nightActions.sheriffTarget);
    if (investigated) {
      let result: string;
      if (investigated.role === Role.CHAMELEON) {
        result = 'CITIZEN'; // الحرباية تظهر كمواطن
      } else if (investigated.role && isMafiaRole(investigated.role)) {
        result = 'MAFIA';
      } else {
        result = 'CITIZEN';
      }

      state.nightActions.sheriffResult = result;
      events.push({ type: 'SHERIFF_RESULT', targetPhysicalId: investigated.physicalId, targetName: investigated.name, extra: { result }, revealed: false });

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
  // حفظ الهدف المحمي لمنع تكراره في الليلة القادمة
  state.nightActions.lastProtectedTarget = nightActions.doctorTarget ?? nightActions.nurseTarget ?? null;

  // ── 5.5. فحص تفعيل الشرطية (لكل لاعب مات هذه الليلة) ──
  const deadThisNight: number[] = [];
  for (const ev of events) {
    if (['ASSASSINATION', 'SNIPE_MAFIA', 'SNIPE_CITIZEN'].includes(ev.type)) {
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

  // ── 6. حفظ أحداث الصباح ───────────────────────
  state.morningEvents = events;

  // ── 7. فحص شرط الفوز ─────────────────────────
  const winResult = checkWinCondition(state);
  if (winResult !== WinResult.GAME_CONTINUES) {
    state.winner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
  }

  await setGameState(roomId, state);

  return { events, winResult };
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
    lastProtectedTarget: lastProtected, // يبقى قيد الطبيب
  };

  state.morningEvents = [];

  // إزالة الإسكات من الجولة السابقة
  state.players.forEach(p => { p.isSilenced = false; });

  // تصفير حالة تفعيل الممرضة
  state.nurseActivated = false;

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

    default:
      return [];
  }
}
