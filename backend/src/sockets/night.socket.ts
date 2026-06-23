// ══════════════════════════════════════════════════════
// 🌙 أحداث الليل (Night Socket Events)
// المرجع: docs/04_NIGHT_PHASE_ENGINE.md
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { setPhase, Phase } from '../game/state.js';
import { getGameState, setGameState } from '../config/redis.js';
import { resolveNight, resetNightActions, getAvailableTargets, checkPolicewomanTrigger } from '../game/night-resolver.js';
import { Role, NIGHT_ACTIVE_ROLES, isMafiaRole, getTeamCounts } from '../game/roles.js';
import { WinResult, checkWinCondition } from '../game/win-checker.js';
import { checkWinConditionDynamic } from '../game/dynamic-win-checker.js';
import {
  buildNightQueue,
  getAvailableTargets as getDynamicTargets,
  resolveNightDynamic,
  createDynamicNightState,
  type DynamicNightAction,
} from '../game/dynamic-night-resolver.js';
import { finalizeMatch, finalizeIfDecided } from '../services/match.service.js';
import { initTwinState, getTwinTransformNotification } from '../game/twin-engine.js';
import { notifyTwinTransform } from './twin-notify.js';
import { clearGameTimer } from '../game/game-timer.js';
import { markRoomAsFinished } from './lobby.socket.js';
import { closeSession } from '../services/session.service.js';

// ── ترتيب الطابور الإجباري (حسب الإجراء وليس الدور) ──
// الخانة 0: اغتيال (وراثة: شيخ → حرباية → قص → مافيا عادي)
// الخانة 1: إسكات (القص — قابل للتخطي)
// الخانة 2: تحقيق (الشريف)
// الخانة 3: حماية (الطبيب)
// الخانة 4: قنص (القناص — قابل للتخطي)
const NIGHT_QUEUE_ORDER: Role[] = [
  Role.GODFATHER,  // 1. إجراء الاغتيال (يرث إذا الشيخ ميت)
  Role.SILENCER,   // 2. إجراء الإسكات
  Role.WITCH,      // 3. 🧙‍♀️ تعطيل الساحرة
  Role.SHERIFF,    // 4. إجراء التحقيق
  Role.DOCTOR,     // 5. إجراء الحماية
  Role.SNIPER,     // 6. إجراء القنص
  'ASSASSIN' as Role,  // 7. 🔪 اغتيال السفّاح (آخر مرحلة)
];

// ── أسماء الإجراءات بالعربي ──
const ACTION_NAMES: Record<string, string> = {
  [Role.GODFATHER]: 'اغتيال المافيا',
  [Role.SILENCER]: 'إسكات المافيا',
  [Role.WITCH]: '🧙‍♀️ تعطيل الساحرة',
  [Role.SHERIFF]: 'تحقيق الشريف',
  [Role.DOCTOR]: 'حماية الطبيب',
  [Role.SNIPER]: 'قنص القناص',
  'ASSASSIN': 'اغتيال السفّاح',
};

// ── سلسلة وراثة الاغتيال ──
const ASSASSINATION_INHERITANCE: Role[] = [
  Role.GODFATHER,
  Role.CHAMELEON,
  Role.SILENCER,
  Role.OLDER_BROTHER,   // 👥 التوأم — قبل المافيا العادي
  Role.MAFIA_REGULAR,
];

// ── مصفوفة التايمرز للغرف (Auto Mode) ──
const autoNightTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── تحديد actionType بناءً على الدور (Auto Mode) ──
function getAutoActionType(role: Role | null): string {
  switch (role) {
    case Role.GODFATHER:
    case Role.CHAMELEON:
    case Role.SILENCER:
    case Role.MAFIA_REGULAR: return 'KILL';
    case Role.SHERIFF:       return 'INVESTIGATE';
    case Role.DOCTOR:        return 'PROTECT';
    case Role.NURSE:         return 'PROTECT';
    case Role.SNIPER:        return 'SNIPE';
    case Role.WITCH:         return 'DISABLE'; // 🧙‍♀️ تعطيل الساحرة
    case 'ASSASSIN' as Role:  return 'ASSASSINATE';
    default:                 return 'DECOY'; // مواطن عادي — يُهمل
  }
}

// ── تحديد قائمة الأهداف المتاحة لكل لاعب (Auto Mode) ──
function getAutoTargets(state: any, role: Role | null, selfId: number): number[] {
  const alive = state.players.filter((p: any) => p.isAlive).map((p: any) => p.physicalId);
  switch (role) {
    case Role.GODFATHER:
    case Role.CHAMELEON:
    case Role.MAFIA_REGULAR:
      // الاغتيال: المواطنون الأحياء فقط
      return state.players.filter((p: any) => p.isAlive && !isMafiaRole(p.role)).map((p: any) => p.physicalId);
    case Role.SILENCER:
      return alive;
    case Role.SHERIFF:
      return alive.filter((id: number) => id !== selfId);
    case Role.DOCTOR:
    case Role.NURSE:
      return alive.filter((id: number) => id !== state.nightActions.lastProtectedTarget);
    case Role.SNIPER:
      return alive.filter((id: number) => id !== selfId);
    case Role.WITCH: {
      // 🧙‍♀️ الساحرة: مواطنون/محايدون أحياء فقط، ماعدا الشرطية + نفسها + الأهداف السابقة
      const previousTargets: number[] = state.witchPreviousTargets || [];
      return state.players
        .filter((p: any) =>
          p.isAlive &&
          p.role &&
          !isMafiaRole(p.role) &&
          p.role !== Role.POLICEWOMAN &&
          p.physicalId !== selfId &&
          !previousTargets.includes(p.physicalId)
        )
        .map((p: any) => p.physicalId);
    }
    case 'ASSASSIN' as Role:
      // السفّاح: كل الأحياء ما عدا نفسه
      return alive.filter((id: number) => id !== selfId);
    default:
      // DECOY: نفس الأحياء للتمويه
      return alive.filter((id: number) => id !== selfId);
  }
}

// ── 🧙‍♀️ تطبيق تعطيل الساحرة (دالة موحّدة لكل المسارات: يدوي/مهلة/إرسال/موافقة) ──
// تضبط الهدف + تطبّق التعطيل + تسجّل الهدف لمنع التكرار. تمنع تكرار المنطق في 4 switch.
function applyWitchDisable(state: any, targetPhysicalId: number | null) {
  if (targetPhysicalId == null) return;
  state.nightActions.witchTarget = targetPhysicalId;
  const target = state.players.find((p: any) => p.physicalId === targetPhysicalId);
  if (target) {
    const disableRounds = state.config.witchDisableRounds || 3;
    target.disabledUntilRound = (state.round || 1) + disableRounds - 1;
    target.disabledRoleName = target.role || undefined;
  }
  if (!state.witchPreviousTargets) state.witchPreviousTargets = [];
  if (!state.witchPreviousTargets.includes(targetPhysicalId)) {
    state.witchPreviousTargets.push(targetPhysicalId);
  }
}

// ── إيجاد جميع اتصالات اللاعب بـ physicalId ──
function findPlayerSocket(io: Server, roomId: string, physicalId: number) {
  return {
    emit: (event: string, payload: any) => {
      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room) return;
      for (const socketId of room) {
        const sock = io.sockets.sockets.get(socketId);
        if (sock?.data.physicalId === physicalId && sock?.data.role === 'player') {
          sock.emit(event, payload);
        }
      }
    }
  };
}

// ── إيجاد socket الليدر ──
function findLeaderSocket(io: Server, roomId: string) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return undefined;
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock?.data.role === 'leader' && sock?.data.roomId === roomId) return sock;
  }
  return undefined;
}

// ── تسوية الليل في Auto Mode ──
async function resolveAutoNight(io: Server, roomId: string) {
  // إلغاء التايمر إن وجد
  const timer = autoNightTimers.get(roomId);
  if (timer) { clearTimeout(timer); autoNightTimers.delete(roomId); }

  const resolution = await resolveNight(roomId);

  // 🔪 إشعار اللاعب السفّاح بالتحديثات إذا حصلت
  const stateAfterResolve = await getGameState(roomId);
  if (stateAfterResolve?.assassinState) {
    findPlayerSocket(io, roomId, stateAfterResolve.assassinState.assassinPhysicalId)?.emit('assassin:contracts-update', {
      contracts: stateAfterResolve.assassinState.contracts,
      currentIndex: 0, // legacy
      completedCount: stateAfterResolve.assassinState.completedCount,
      totalRequired: stateAfterResolve.assassinState.totalRequired,
    });
  }

  await setPhase(roomId, Phase.MORNING_RECAP);

  const stateAfter = await getGameState(roomId);
  io.to(roomId).emit('game:phase-changed', {
    phase: Phase.MORNING_RECAP,
    teamCounts: stateAfter ? getTeamCounts(stateAfter.players) : undefined,
  });

  // 🤡 فوز المهرج — اللعبة تنتهي فوراً (لا pendingWinner)
  let pendingWinner: string | null = null;

  // 🔪 فحص فوز السفّاح أولاً
  if (stateAfter?.winner === 'ASSASSIN' || (stateAfter?.assassinState?.won && !stateAfter.winner)) {
    pendingWinner = 'ASSASSIN';
    if (stateAfter) {
      stateAfter.winner = 'ASSASSIN';
      stateAfter.pendingWinner = 'ASSASSIN';
      await setGameState(roomId, stateAfter);
    }
  } else if (resolution.neutralWin?.won) {
    pendingWinner = 'JESTER';
    const state = await getGameState(roomId);
    if (state) { state.pendingWinner = 'JESTER'; await setGameState(roomId, state); }
  } else if (resolution.winResult !== WinResult.GAME_CONTINUES) {
    pendingWinner = resolution.winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
    const state = await getGameState(roomId);
    if (state) { state.pendingWinner = pendingWinner; await setGameState(roomId, state); }
  }

  // إرسال ملخص الصباح للليدر — بث للغرفة بالكامل لضمان الوصول
  io.to(roomId).emit('night:morning-recap', {
    events: resolution.events,
    pendingWinner,
    players: stateAfter?.players || [],
    neutralWin: resolution.neutralWin || null,
    assassinState: stateAfter?.assassinState || null,
  });

  // 👥 إشعار المافيا/الأصغر إن حدث تحوّل (الحدث نفسه يُكشف من morningEvents بزر الليدر)
  // ⚠️ نعيد تحميل أحدث حالة (وليس stateAfter القديمة) كي لا نمسح pendingWinner المحفوظ في فروع الفوز أعلاه
  const finalAutoState = await getGameState(roomId);
  if (finalAutoState) {
    notifyTwinTransform(io, roomId, finalAutoState);
    await setGameState(roomId, finalAutoState);
  }

  console.log(`✅ Auto night resolved for room ${roomId}`);
}

// ── تجهيز الخطوة التالية (بدون إرسال للاعبين — ينتظر الليدر) ──
// ══════════════════════════════════════════════════════
// 🌙 إعادة بثّ حالة الليل الحالية للّيدر بعد إعادة تحميل الصفحة / إعادة الاتصال — بلا تصفير.
// يدعم الوضعين: اليدوي/الديناميكي (currentNightStep) والأوتو (يعيد بثّ الأحداث المناسبة حسب
// المرحلة الفرعية: جاهزة / مُرسَلة / بانتظار الموافقة) مع حساب الوقت المتبقي من deadline مخزّن.
// ══════════════════════════════════════════════════════
function emitNightResumeState(socket: any, state: any) {
  if (!state) return;
  if (state.nightComplete) { socket.emit('night:queue-complete'); return; }

  if (state.config?.nightMode === 'auto') {
    const step = state.nightStep;
    if (!step) return; // لا خطوة جاهزة بعد (أول الليل) — الواجهة تنتظر night:auto-step-ready الطبيعي
    const fullTimeout = state.config.autoNightTime || 15;
    // 1) الخطوة الجاهزة — تبني autoNightStep على واجهة الليدر
    socket.emit('night:auto-step-ready', {
      roleName: step.roleName, role: step.role, performerName: step.performerName,
      performerPhysicalId: step.performerPhysicalId, canSkip: step.canSkip, timeoutSeconds: fullTimeout,
    });
    if (state.autoNightStepApproval) {
      // 2أ) مرحلة الموافقة — الليدر يراجع الاختيارات
      socket.emit('night:auto-step-approval', {
        choices: state.autoNightChoices || [],
        nextIndex: (state as any).autoNightApprovalNextIndex ?? -1,
      });
    } else if (state.autoNightStepDispatched) {
      // 2ب) جارٍ جمع اختيارات اللاعبين — الوقت المتبقي من الـdeadline المخزّن
      const deadline = (state as any).autoNightStepDeadline;
      const remaining = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : fullTimeout;
      socket.emit('night:auto-step-started', { roleName: step.roleName, timeoutSeconds: remaining });
      const alive = state.players.filter((p: any) => p.isAlive);
      const submitted = state.playerNightActions?.submitted || {};
      const submittedCount = alive.filter((p: any) => submitted[p.physicalId] || submitted[String(p.physicalId)]).length;
      socket.emit('night:auto-progress', {
        total: alive.length,
        submitted: submittedCount,
        missingPlayers: alive.filter((p: any) => !(submitted[p.physicalId] || submitted[String(p.physicalId)])).map((p: any) => ({ physicalId: p.physicalId, name: p.name })),
        choices: state.autoNightChoices || [],
      });
    }
    return;
  }

  // اليدوي/الديناميكي
  if (state.currentNightStep) socket.emit('night:queue-step', state.currentNightStep);
}

async function prepareAutoQueueStep(io: Server, roomId: string, currentIndex: number) {
  const state = await getGameState(roomId);
  if (!state) return;

  const nextStep = getNextQueueStep(state, currentIndex);
  if (!nextStep) {
    // انتهى الطابور → معالجة الليل
    await resolveAutoNight(io, roomId);
    return;
  }

  // إعادة ضبط الإرسالات للخطوة الحالية وحفظ الدور الفاعل
  state.playerNightActions = { submitted: {} };
  state.autoNightStepRole = nextStep.role;
  state.autoNightPerformerId = nextStep.performerPhysicalId;
  state.nightStep = nextStep;
  state.autoNightStepDispatched = false; // الليدر لم يبدأ هذه الخطوة بعد
  state.autoNightStepApproval = false;                  // 🌙 تصفير حالة الموافقة للخطوة الجديدة
  (state as any).autoNightStepDeadline = null;          // 🌙 لا مهلة قبل بدء الخطوة
  (state as any).autoNightApprovalNextIndex = null;
  await setGameState(roomId, state);

  // إعلام الليدر بالخطوة الجاهزة (ينتظر زره لبدئها)
  const stepPayload = {
    roleName: nextStep.roleName,
    role: nextStep.role,
    performerName: nextStep.performerName,
    performerPhysicalId: nextStep.performerPhysicalId,
    canSkip: nextStep.canSkip,
    timeoutSeconds: state.config.autoNightTime || 15,
  };

  // بث للغرفة بالكامل — يضمن وصول الحدث للليدر
  io.to(roomId).emit('night:auto-step-ready', stepPayload);

  console.log(`🌙 Auto step ready: ${nextStep.roleName} — waiting for leader in room ${roomId}`);
}

// ── الليدر يبدأ الخطوة: إرسال للاعبين + بدء المؤقت ──
async function dispatchAutoStepToPlayers(io: Server, roomId: string, durationSeconds?: number) {
  const state = await getGameState(roomId);
  if (!state || !state.nightStep) return;

  const nextStep = state.nightStep;
  const timeoutSeconds = durationSeconds || state.config.autoNightTime || 15;
  state.autoNightStepDispatched = true;
  state.autoNightStepApproval = false;
  state.playerNightActions = { submitted: {} };
  state.autoNightChoices = []; // Reset choices for new step
  (state as any).autoNightStepDeadline = Date.now() + timeoutSeconds * 1000; // 🌙 موعد انتهاء المهلة — لحساب الوقت المتبقي عند reload
  await setGameState(roomId, state);
  const alivePlayers = state.players.filter((p: any) => p.isAlive);
  const stepActionType = getAutoActionType(nextStep.role);

  // قائمة أهداف التمويه: جميع الأحياء
  const decoyTargets = alivePlayers.map((p: any) => ({
    physicalId: p.physicalId,
    name: p.name,
    avatarUrl: p.avatarUrl || null,
  }));

  for (const player of alivePlayers) {
    const playerSock = findPlayerSocket(io, roomId, player.physicalId);
    if (playerSock) {
      const isPerformer = player.physicalId === nextStep.performerPhysicalId;
      playerSock.emit('night:action-required', {
        actionType: stepActionType,
        availableTargets: isPerformer ? nextStep.availableTargets : decoyTargets,
        timeoutSeconds,
        canSkip: nextStep.canSkip,
        stepRole: nextStep.role,
        isDecoy: !isPerformer,
      });
    }
  }

  // إلغاء التايمر القديم إن وجد
  const oldTimer = autoNightTimers.get(roomId);
  if (oldTimer) clearTimeout(oldTimer);

  // مؤقت — عند الانتهاء يجهّز الخطوة التالية وينتظر الليدر
  const timerId = setTimeout(async () => {
    try {
    console.log(`⏰ Auto step ${nextStep.role} timeout in room ${roomId}`);
    
    // ── تعيين اختيار عشوائي إذا لم يقم اللاعب باختيار قبل انتهاء الوقت ──
    const latestState = await getGameState(roomId);
    if (latestState && latestState.nightStep && latestState.nightStep.role === nextStep.role) {
      const performerId = latestState.nightStep.performerPhysicalId;
      const submitted = latestState.playerNightActions?.submitted?.[performerId] 
        || latestState.playerNightActions?.submitted?.[String(performerId)];
      
      if (!submitted) {
        // القناص: تخطي بدل الاختيار العشوائي (لأن قنص مواطن = موت القناص + الهدف)
        if (latestState.autoNightStepRole === Role.SNIPER) {
          console.log(`⏭️ Auto SKIP for SNIPER in room ${roomId} (too risky for random)`);
          latestState.nightActions.sniperTarget = null;
          if (!latestState.playerNightActions) latestState.playerNightActions = { submitted: {} };
          latestState.playerNightActions.submitted[performerId] = true;
          
          if (!latestState.autoNightChoices) latestState.autoNightChoices = [];
          latestState.autoNightChoices.push({
            physicalId: performerId,
            targetPhysicalId: null,
            isReal: true,
            isRandom: true
          });
          
          await setGameState(roomId, latestState);
        } else {
          console.log(`🎲 Auto random selection for ${nextStep.role} in room ${roomId}`);
          const targets = latestState.nightStep.availableTargets;
          if (targets && targets.length > 0) {
            const randomTarget = targets[Math.floor(Math.random() * targets.length)];
            const tId = randomTarget.physicalId;

            // تعليم الاختيار كعشوائي
            if (!latestState.nightActions.randomSelections) latestState.nightActions.randomSelections = {};
          
            switch (latestState.autoNightStepRole) {
              case Role.GODFATHER:
              case Role.CHAMELEON:
              case Role.MAFIA_REGULAR:
                latestState.nightActions.godfatherTarget = tId;
                latestState.nightActions.randomSelections['GODFATHER'] = true;
                break;
              case Role.SILENCER:
                latestState.nightActions.silencerTarget = tId;
                latestState.nightActions.randomSelections['SILENCER'] = true;
                break;
              case Role.SHERIFF: {
                latestState.nightActions.sheriffTarget = tId;
                latestState.nightActions.randomSelections['SHERIFF'] = true;
                const investigated = latestState.players.find((p: any) => p.physicalId === tId);
                let sheriffResult = 'CITIZEN';
                if (investigated?.role === Role.CHAMELEON) sheriffResult = 'CITIZEN';
                else if (investigated?.role && [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.MAFIA_REGULAR].includes(investigated.role)) sheriffResult = 'MAFIA';
                latestState.nightActions.sheriffResult = sheriffResult;
                const performerSock = findPlayerSocket(io, roomId, performerId);
                if (performerSock) {
                  performerSock.emit('night:sheriff-result', {
                    result: sheriffResult,
                    targetPhysicalId: tId,
                    targetName: investigated?.name || '',
                  });
                }
                break;
              }
              case Role.DOCTOR:
                latestState.nightActions.doctorTarget = tId;
                latestState.nightActions.randomSelections['DOCTOR'] = true;
                break;
              case Role.NURSE:
                latestState.nightActions.nurseTarget = tId;
                latestState.nightActions.randomSelections['NURSE'] = true;
                break;
              case Role.WITCH:
                // 🧙‍♀️ ضبط الهدف + التعطيل (اختيار عشوائي عند انتهاء المهلة)
                applyWitchDisable(latestState, tId);
                latestState.nightActions.randomSelections['WITCH'] = true;
                break;
              default:
                // 🔪 السفّاح وأي دور جديد
                if (latestState.autoNightStepRole === 'ASSASSIN') {
                  latestState.nightActions.assassinTarget = tId;
                  latestState.nightActions.randomSelections['ASSASSIN'] = true;
                }
                break;
            }
          
            if (!latestState.playerNightActions) latestState.playerNightActions = { submitted: {} };
            latestState.playerNightActions.submitted[performerId] = true;
            
            // تسجيل الاختيار العشوائي
            if (!latestState.autoNightChoices) latestState.autoNightChoices = [];
            latestState.autoNightChoices.push({
              physicalId: performerId,
              targetPhysicalId: tId,
              isReal: true,
              isRandom: true
            });

            await setGameState(roomId, latestState);
          }
        }
      }
    }

    const effectiveRole = nextStep.role === Role.NURSE ? Role.DOCTOR : nextStep.role;
    const newIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole);

    // بدلاً من تجهيز الخطوة التالية، نذهب لشاشة المراجعة لليدر
    latestState.autoNightStepApproval = true;
    (latestState as any).autoNightApprovalNextIndex = newIndex; // 🌙 لاستئناف شاشة الموافقة عند reload
    
    // 💡 إضافة اختيارات عشوائية (وهمية) لجميع اللاعبين الأحياء الذين لم يرسلوا خياراتهم (بمن فيهم أصحاب الأدوار الوهمية)
    if (!latestState.autoNightChoices) latestState.autoNightChoices = [];
    if (!latestState.playerNightActions) latestState.playerNightActions = { submitted: {} };
    
    const alivePlayers = latestState.players.filter((p: any) => p.isAlive);
    for (const player of alivePlayers) {
      const alreadyHasChoice = latestState.autoNightChoices.some(c => c.physicalId === player.physicalId);
      const isSubmitted = latestState.playerNightActions.submitted[player.physicalId] 
        || latestState.playerNightActions.submitted[String(player.physicalId)];
      if (!isSubmitted && !alreadyHasChoice) {
        // اختيار عشوائي وهمي (Decoy)
        let validTargets = alivePlayers.filter((p: any) => p.physicalId !== player.physicalId);
        if (validTargets.length === 0) validTargets = alivePlayers;
        const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
        
        latestState.autoNightChoices.push({
          physicalId: player.physicalId,
          targetPhysicalId: randomTarget.physicalId,
          isReal: player.physicalId === nextStep.performerPhysicalId,
          isRandom: true
        });
        // لا نحتاج لتعيينها في playerNightActions.submitted لأنها اختيارات وهمية، لكن لحفظ الحالة
      }
    }

    await setGameState(roomId, latestState);
    
    io.to(roomId).emit('night:auto-step-approval', {
      choices: latestState.autoNightChoices || [],
      nextIndex: newIndex,
    });
    
    console.log(`⏸️ Auto step ${nextStep.roleName} pending leader approval in room ${roomId}`);
    } catch (err) {
      console.error(`❌ Auto night timer error for room ${roomId}:`, err);
    }
  }, timeoutSeconds * 1000);

  autoNightTimers.set(roomId, timerId as any);

  // إعلام الليدر أن الخطوة بدأت — بث للغرفة (findLeaderSocket قد يجد سوكت قديم)
  io.to(roomId).emit('night:auto-step-started', {
    roleName: nextStep.roleName,
    timeoutSeconds,
  });
  io.to(roomId).emit('night:auto-progress', {
    total: alivePlayers.length,
    submitted: 0,
    missingPlayers: alivePlayers.map((p: any) => ({ physicalId: p.physicalId, name: p.name })),
  });
  console.log(`▶️ Auto step dispatched: ${nextStep.roleName} in room ${roomId}`);
}

export function registerNightEvents(io: Server, socket: Socket) {

  // ── بدء مرحلة الليل ──────────────────────────
  socket.on('night:start', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      // 🛡️ استئناف بدل التصفير: إن كنا في الليل وطابور قيد التقدّم، أعد إرسال الخطوة الحالية ولا
      // نُعِد بناء الطابور (يمنع إعادة الطابور من الصفر عند إعادة تحميل الصفحة / انقطاع ثم استئناف).
      const existing = await getGameState(data.roomId);
      if (existing && existing.phase === Phase.NIGHT) {
        emitNightResumeState(socket, existing);
        console.log(`🌙 [night:start] Mid-night already in progress — resumed instead of restarting (room ${data.roomId})`);
        return callback({ success: true, resumed: true, round: existing.round });
      }

      const state = await resetNightActions(data.roomId);
      // تصفير خطوة الليل السابقة
      state.currentNightStep = null;
      state.nightComplete = false;

      // ── فحص: هل الطبيب ميت والممرضة حية؟ ──
      const doctor = state.players.find((p: any) => p.role === Role.DOCTOR);
      const nurse = state.players.find((p: any) => p.role === Role.NURSE && p.isAlive);
      const nurseAvailable = doctor && !doctor.isAlive && !!nurse;

      // ═══════════════════════════════════════
      // 🔀 AUTO MODE
      // ═══════════════════════════════════════
      if (state.config.nightMode === 'auto') {
        if (nurseAvailable) {
          // إخطار الممرضة مباشرة عبر جهازها
          const nurseSocket = findPlayerSocket(io, data.roomId, nurse!.physicalId);
          nurseSocket?.emit('nurse:activation-request', {
            message: 'الطبيب غير متاح — هل تريدين التفعيل؟',
          });
          state.round += 1;
          await setGameState(data.roomId, state);
          return callback({ success: true, round: state.round, nurseAvailable: true, mode: 'auto' });
        }

        // الانتقال لمرحلة الليل
        await setPhase(data.roomId, Phase.NIGHT);
        state.phase = Phase.NIGHT;
        state.round += 1;
        await setGameState(data.roomId, state);

        io.to(data.roomId).emit('game:phase-changed', { phase: Phase.NIGHT, teamCounts: getTeamCounts(state.players) });
        io.to(data.roomId).emit('display:night-started');

        // إعلام الليدر لبداية الليل
        const alivePlayers = state.players.filter((p: any) => p.isAlive);
        socket.emit('night:auto-started', {
          totalAlive: alivePlayers.length,
        });

        // ── تجهيز أول خطوة (تنتظر الليدر) ──
        // 🔪 تهيئة حالة السفّاح (أول ليلة → تهيئة جديدة دائماً، حتى لو فيه بقايا من لعبة سابقة)
        const isFirstNight = state.round <= 1;
        if (!state.assassinState || isFirstNight) {
          const { initAssassinState } = await import('../game/assassin-engine.js');
          const assassinState = initAssassinState(state);
          if (assassinState) {
            state.assassinState = assassinState;
            await setGameState(data.roomId, state);
            console.log(`🔪 [Auto] Assassin initialized: ${assassinState.totalRequired} contracts`);

            // إرسال العقود للاعب السفّاح
            const assassinSock = findPlayerSocket(io, data.roomId, assassinState.assassinPhysicalId);
            if (assassinSock) {
              assassinSock.emit('assassin:contracts-update', {
                contracts: assassinState.contracts,
                currentIndex: assassinState.currentContractIndex,
                completedCount: assassinState.completedCount,
                totalRequired: assassinState.totalRequired,
              });
            }
          }
        } else {
          // 🔪 إرسال تحديث العقود كل ليلة (Auto Mode)
          const assassinSock = findPlayerSocket(io, data.roomId, state.assassinState.assassinPhysicalId);
          if (assassinSock) {
            assassinSock.emit('assassin:contracts-update', {
              contracts: state.assassinState.contracts,
              currentIndex: state.assassinState.currentContractIndex,
              completedCount: state.assassinState.completedCount,
              totalRequired: state.assassinState.totalRequired,
            });
          }
        }

        // 👥 تهيئة حالة التوأمين (أول ليلة فقط)
        if (isFirstNight && !state.twinState) {
          const twinState = initTwinState(state);
          if (twinState) {
            state.twinState = twinState;
            console.log(`👥 [Auto] Twin Bond initialized: Older #${twinState.olderBrotherPhysicalId} ↔ Younger #${twinState.youngerBrotherPhysicalId}`);
          }
        }

        // 🔪 ضمان حفظ state مع assassinState قبل تحضير الطابور
        await setGameState(data.roomId, state);

        prepareAutoQueueStep(io, data.roomId, -1);

        return callback({ success: true, round: state.round, nurseAvailable: false, mode: 'auto' });
      }

      // ═══════════════════════════════════════
      // 🎮 MANUAL MODE (الأصلي)
      // ═══════════════════════════════════════
      if (nurseAvailable) {
        state.round += 1;
        await setGameState(data.roomId, state);
        return callback({ success: true, round: state.round, nurseAvailable: true });
      }

      await setPhase(data.roomId, Phase.NIGHT);
      state.phase = Phase.NIGHT;
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.NIGHT, teamCounts: getTeamCounts(state.players) });
      io.to(data.roomId).emit('display:night-started');

      // 🧩 Feature Flag: المحرك الديناميكي أو القديم
      if (state.config.useDynamicEngine) {
        try {
          const dynamicNight = createDynamicNightState(state.dynamicNightState || undefined);
          state.dynamicNightState = dynamicNight;

          // 🔪 تهيئة حالة السفّاح (أول ليلة → تهيئة جديدة دائماً)
          const isFirstNightDyn = state.round <= 1;
          if (!state.assassinState || isFirstNightDyn) {
            const { initAssassinState } = await import('../game/assassin-engine.js');
            const assassinState = initAssassinState(state);
            if (assassinState) {
              state.assassinState = assassinState;
              console.log(`🔪 Assassin initialized: ${assassinState.totalRequired} contracts`);

              // 🔪 إرسال العقود للاعب السفّاح
              const allSockets = await io.in(data.roomId).fetchSockets();
              for (const s of allSockets) {
                if (s.data.role === 'player' && s.data.physicalId === assassinState.assassinPhysicalId) {
                  s.emit('assassin:contracts-update', {
                    contracts: assassinState.contracts,
                    currentIndex: assassinState.currentContractIndex,
                    completedCount: assassinState.completedCount,
                    totalRequired: assassinState.totalRequired,
                  });
                  break;
                }
              }
            }
          } else {
            // 🔪 إرسال تحديث العقود كل ليلة (ليس أول ليلة فقط)
            const allSockets = await io.in(data.roomId).fetchSockets();
            for (const s of allSockets) {
              if (s.data.role === 'player' && s.data.physicalId === state.assassinState.assassinPhysicalId) {
                s.emit('assassin:contracts-update', {
                  contracts: state.assassinState.contracts,
                  currentIndex: state.assassinState.currentContractIndex,
                  completedCount: state.assassinState.completedCount,
                  totalRequired: state.assassinState.totalRequired,
                });
                break;
              }
            }
          }

          // 👥 تهيئة حالة التوأمين (أول ليلة فقط)
          if (isFirstNightDyn && !state.twinState) {
            const twinState = initTwinState(state);
            if (twinState) {
              state.twinState = twinState;
              console.log(`👥 Twin Bond initialized: Older #${twinState.olderBrotherPhysicalId} ↔ Younger #${twinState.youngerBrotherPhysicalId}`);
            }
          }

          const queue = await buildNightQueue(state);
          // حفظ الطابور الديناميكي في state
          (state as any).dynamicQueue = queue;
          (state as any).dynamicQueueIndex = 0;

          if (queue.length > 0) {
            const step = queue[0];
            const targets = await getDynamicTargets(state, step.abilityId, step.performerPhysicalId, dynamicNight);
            const performer = state.players.find(p => p.physicalId === step.performerPhysicalId);
            socket.emit('night:queue-step', {
              role: step.abilityId,  // نستخدم abilityId كمعرف
              roleName: step.nameAr,
              performerPhysicalId: step.performerPhysicalId,
              performerName: performer?.name || '',
              availableTargets: targets.map(p => ({ physicalId: p.physicalId, name: p.name, avatarUrl: (p as any).avatarUrl || null })),
              canSkip: true, // كل القدرات الديناميكية قابلة للتخطي
              isDynamic: true,
              isDisabled: step.isDisabled || false,
              disabledRoleName: step.disabledRoleName || undefined,
            });
            io.to(data.roomId).emit('night:step-info', { roleName: step.nameAr, stepType: step.abilityId });
            state.currentNightStep = {
              role: step.abilityId,
              roleName: step.nameAr,
              performerPhysicalId: step.performerPhysicalId,
              performerName: performer?.name || '',
              availableTargets: targets.map(p => ({ physicalId: p.physicalId, name: p.name, avatarUrl: (p as any).avatarUrl || null })),
              canSkip: true,
              isDynamic: true,
            };
          } else {
            socket.emit('night:queue-complete');
            state.nightComplete = true;
          }

          state.round += 1;
          await setGameState(data.roomId, state);
          console.log(`🧩 Dynamic night started with ${queue.length} abilities`);
          return callback({ success: true, round: state.round, nurseAvailable: false, isDynamic: true });
        } catch (dynErr: any) {
          console.warn(`⚠️ Dynamic night engine failed, falling back:`, dynErr.message);
          // Fallback → المحرك القديم
        }
      }

      // المحرك القديم (fallback أو الافتراضي)
      // 👥 تهيئة حالة التوأمين (أول ليلة فقط)
      if (state.round <= 0 && !state.twinState) {
        const twinState = initTwinState(state);
        if (twinState) {
          state.twinState = twinState;
          console.log(`👥 [Legacy] Twin Bond initialized: Older #${twinState.olderBrotherPhysicalId} ↔ Younger #${twinState.youngerBrotherPhysicalId}`);
        }
      }
      const firstStep = getNextQueueStep(state, -1);
      if (firstStep) {
        socket.emit('night:queue-step', firstStep);
        io.to(data.roomId).emit('night:step-info', { roleName: firstStep.roleName, stepType: firstStep.role });
        state.currentNightStep = firstStep;
      } else {
        socket.emit('night:queue-complete');
        state.nightComplete = true;
      }

      state.round += 1;
      await setGameState(data.roomId, state);

      callback({ success: true, round: state.round, nurseAvailable: false });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });



  // ── بدء طابور الليل (بعد قرار الممرضة) ──────────
  socket.on('night:begin-queue', async (data: { roomId: string; activateNurse: boolean }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      if (data.activateNurse) {
        state.nurseActivated = true;
      }

      // الآن ننتقل رسمياً لمرحلة الليل
      await setPhase(data.roomId, Phase.NIGHT);
      state.phase = Phase.NIGHT; // ← تحديث محلي لمنع الكتابة الفوقية
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.NIGHT, teamCounts: getTeamCounts(state.players) });
      io.to(data.roomId).emit('display:night-started');

      await setGameState(data.roomId, state);

      // ═══ فحص النمط: Auto أم Manual ═══
      if (state.config.nightMode === 'auto') {
        // ── Auto Mode: تجهيز أول خطوة تنتظر الليدر ──
        const alivePlayers = state.players.filter((p: any) => p.isAlive);
        io.to(data.roomId).emit('night:auto-started', {
          totalAlive: alivePlayers.length,
        });
        prepareAutoQueueStep(io, data.roomId, -1);
        callback({ success: true, mode: 'auto' });
      } else {
        // ── Manual Mode: بدء طابور الليل اليدوي ──
        const firstStep = getNextQueueStep(state, -1);
        if (firstStep) {
          socket.emit('night:queue-step', firstStep);
          io.to(data.roomId).emit('night:step-info', { roleName: firstStep.roleName, stepType: firstStep.role });
          state.currentNightStep = firstStep;
        } else {
          socket.emit('night:queue-complete');
          state.nightComplete = true;
        }
        await setGameState(data.roomId, state);
        callback({ success: true, mode: 'manual' });
      }
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 🌙 استئناف الطابور بعد إعادة تحميل الصفحة / إعادة الاتصال ──
  // يعيد إرسال الخطوة الحالية المحفوظة (currentNightStep) دون أي تصفير أو إعادة بناء.
  socket.on('night:resume', async (data: { roomId: string }, callback) => {
    try {
      socket.join(data.roomId);
      if (socket.data.authStaff) socket.data.role = 'leader';
      const state = await getGameState(data.roomId);
      if (!state || state.phase !== Phase.NIGHT) return callback?.({ success: false, error: 'ليس في مرحلة الليل' });
      emitNightResumeState(socket, state);
      return callback?.({ success: true });
    } catch (err: any) { callback?.({ success: false, error: err.message }); }
  });

  // ── تسجيل اختيار الليدر لهدف الدور الحالي ──
  socket.on('night:submit-action', async (data: {
    roomId: string;
    role: Role;
    targetPhysicalId: number;
  }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // 🧩 المسار الديناميكي
      if (state.config.useDynamicEngine && state.dynamicNightState && (state as any).dynamicQueue) {
        const abilityId = data.role as string; // في الوضع الديناميكي، role = abilityId
        const dynamicNight = state.dynamicNightState;
        const queue = (state as any).dynamicQueue as {abilityId: string; performerPhysicalId: number; nameAr: string}[];
        let queueIndex = (state as any).dynamicQueueIndex as number;

        // 🛡️ idempotency: تجاهل إرسالاً قديماً/مكرّراً (بعد إعادة اتصال مثلاً). إن لم يطابق الدور
        // المُرسَل خطوة الطابور الحالية، أعد إرسال الخطوة الحالية بلا تقدّم (يمنع تخطّي خطوة أو عدّاً مزدوجاً).
        if (queue[queueIndex]?.abilityId !== abilityId) {
          if (queueIndex < queue.length && state.currentNightStep) socket.emit('night:queue-step', state.currentNightStep);
          else if (queueIndex >= queue.length) socket.emit('night:queue-complete');
          return callback({ success: true, resynced: true });
        }

        // تسجيل الإجراء
        dynamicNight.actions[abilityId] = {
          abilityId,
          performerPhysicalId: queue[queueIndex]?.performerPhysicalId || 0,
          targetPhysicalId: data.targetPhysicalId,
          skipped: false,
        };

        // إرسال أنيميشن عامة
        io.to(data.roomId).emit('night:animation', {
          type: abilityId,
          targetPhysicalId: data.targetPhysicalId,
        });

        // معالجة خاصة: نتيجة التحقيق (REVEAL_TEAM) — إرسال فوري لليدر
        if (abilityId === 'INVESTIGATE') {
          const { getRoleById } = await import('../game/definition-service.js');
          const investigated = state.players.find((p: any) => p.physicalId === data.targetPhysicalId);
          if (investigated) {
            const targetRole = await getRoleById(investigated.role as string);
            let sheriffResult = 'CITIZEN';
            if (investigated.role === 'CHAMELEON') {
              // 🧙‍♀️ الحرباية المعطّلة تُكشف هويتها الحقيقية
              const isChamDisabled = investigated.disabledUntilRound != null && investigated.disabledUntilRound >= (state.round || 1);
              sheriffResult = isChamDisabled ? 'MAFIA' : 'CITIZEN';
            } else if (targetRole?.team === 'MAFIA') {
              sheriffResult = 'MAFIA';
            }
            socket.emit('night:sheriff-result', {
              result: sheriffResult,
              targetPhysicalId: data.targetPhysicalId,
              targetName: investigated.name || '',
            });
          }
        }

        // الانتقال للخطوة التالية
        queueIndex += 1;
        (state as any).dynamicQueueIndex = queueIndex;
        await setGameState(data.roomId, state);

        if (queueIndex < queue.length) {
          const step = queue[queueIndex];
          const targets = await getDynamicTargets(state, step.abilityId, step.performerPhysicalId, dynamicNight);
          const performer = state.players.find(p => p.physicalId === step.performerPhysicalId);
          const stepData = {
            role: step.abilityId,
            roleName: step.nameAr,
            performerPhysicalId: step.performerPhysicalId,
            performerName: performer?.name || '',
            availableTargets: targets.map(p => ({ physicalId: p.physicalId, name: p.name, avatarUrl: (p as any).avatarUrl || null })),
            canSkip: true,
            isDynamic: true,
            isDisabled: (step as any).isDisabled || false,
            disabledRoleName: (step as any).disabledRoleName || undefined,
          };
          socket.emit('night:queue-step', stepData);
          io.to(data.roomId).emit('night:step-info', { roleName: step.nameAr, stepType: step.abilityId });
          state.currentNightStep = stepData;
        } else {
          socket.emit('night:queue-complete');
          state.currentNightStep = null;
          state.nightComplete = true;
        }
        await setGameState(data.roomId, state);

        return callback({ success: true });
      }

      // ═══ المسار القديم ═══
      // تسجيل الاختيار حسب الدور
      switch (data.role) {
        case Role.GODFATHER:
          state.nightActions.godfatherTarget = data.targetPhysicalId;
          // أنيميشن اغتيال لشاشة العرض
          io.to(data.roomId).emit('night:animation', {
            type: 'ASSASSINATION_ATTEMPT',
            targetPhysicalId: data.targetPhysicalId,
          });
          break;
        case Role.SILENCER:
          state.nightActions.silencerTarget = data.targetPhysicalId;
          io.to(data.roomId).emit('night:animation', {
            type: 'SILENCE',
            targetPhysicalId: data.targetPhysicalId,
          });
          break;
        case Role.SHERIFF: {
          state.nightActions.sheriffTarget = data.targetPhysicalId;
          // حساب النتيجة فوراً لليدر (خداع الحرباية مطبّق)
          const investigated = state.players.find((p: any) => p.physicalId === data.targetPhysicalId);
          let sheriffResult = 'CITIZEN';
          if (investigated?.role === Role.CHAMELEON) {
            // 🧙‍♀️ الحرباية المعطّلة تُكشف هويتها الحقيقية
            const isChamDisabled = investigated.disabledUntilRound != null && investigated.disabledUntilRound >= (state.round || 1);
            sheriffResult = isChamDisabled ? 'MAFIA' : 'CITIZEN';
          } else if (investigated?.role && isMafiaRole(investigated.role)) {
            sheriffResult = 'MAFIA';
          }
          state.nightActions.sheriffResult = sheriffResult;
          // إرسال النتيجة لليدر فقط (socket.emit وليس io.to)
          socket.emit('night:sheriff-result', {
            result: sheriffResult,
            targetPhysicalId: data.targetPhysicalId,
            targetName: investigated?.name || '',
          });
          io.to(data.roomId).emit('night:animation', {
            type: 'INVESTIGATION',
            targetPhysicalId: data.targetPhysicalId,
          });
          break;
        }
        case Role.DOCTOR:
          state.nightActions.doctorTarget = data.targetPhysicalId;
          io.to(data.roomId).emit('night:animation', {
            type: 'PROTECTION',
            targetPhysicalId: data.targetPhysicalId,
          });
          break;
        case Role.SNIPER:
          state.nightActions.sniperTarget = data.targetPhysicalId;
          io.to(data.roomId).emit('night:animation', {
            type: 'SNIPE',
            targetPhysicalId: data.targetPhysicalId,
          });
          break;
        case Role.NURSE:
          state.nightActions.nurseTarget = data.targetPhysicalId;
          break;
        case Role.WITCH: {
          // 🧙‍♀️ تسجيل هدف الساحرة + تعطيل القدرة (موحّد عبر الدالة المساعدة)
          applyWitchDisable(state, data.targetPhysicalId);
          io.to(data.roomId).emit('night:animation', {
            type: 'DISABLE_ABILITY',
            targetPhysicalId: data.targetPhysicalId,
          });
          break;
        }
        default:
          // 🔪 السفّاح
          if ((data.role as string) === 'ASSASSIN') {
            state.nightActions.assassinTarget = data.targetPhysicalId;
            io.to(data.roomId).emit('night:animation', {
              type: 'ASSASSINATE',
              targetPhysicalId: data.targetPhysicalId,
            });
          }
          break;
      }

      // الانتقال للخطوة التالية
      // الممرضة تأخذ خانة الطبيب في الطابور
      const effectiveRole = data.role === Role.NURSE ? Role.DOCTOR : data.role;
      const currentIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole);
      const nextStep = getNextQueueStep(state, currentIndex);

      if (nextStep) {
        socket.emit('night:queue-step', nextStep);
        io.to(data.roomId).emit('night:step-info', { roleName: nextStep.roleName, stepType: nextStep.role });
        state.currentNightStep = nextStep;
      } else {
        // انتهى الطابور → معالجة التقاطعات
        socket.emit('night:queue-complete');
        state.currentNightStep = null;
        state.nightComplete = true;
      }

      await setGameState(data.roomId, state);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تخطي (للقناص والقص) ──────────────────────────────
  socket.on('night:skip-action', async (data: {
    roomId: string;
    role: Role;
  }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ── في الأوتو: نستخدم prepareAutoQueueStep بدلاً من الإرسال اليدوي ──
      if (state.config.nightMode === 'auto') {
        // إلغاء التايمر إن وجد
        const timer = autoNightTimers.get(data.roomId);
        if (timer) { clearTimeout(timer); autoNightTimers.delete(data.roomId); }

        const effectiveRole = data.role === Role.NURSE ? Role.DOCTOR : data.role;
        const currentIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole);
        // تجهيز الخطوة التالية (تنتظر الليدر)
        await prepareAutoQueueStep(io, data.roomId, currentIndex);
        callback({ success: true });
        return;
      }

      // 🧩 المسار الديناميكي (Manual Mode)
      if (state.config.useDynamicEngine && state.dynamicNightState && (state as any).dynamicQueue) {
        const abilityId = data.role as string;
        const dynamicNight = state.dynamicNightState;
        const queue = (state as any).dynamicQueue as {abilityId: string; performerPhysicalId: number; nameAr: string}[];
        let queueIndex = (state as any).dynamicQueueIndex as number;

        // 🛡️ idempotency: تجاهل تخطّياً قديماً/مكرّراً لا يطابق الخطوة الحالية (يمنع تخطّي خطوة)
        if (queue[queueIndex]?.abilityId !== abilityId) {
          if (queueIndex < queue.length && state.currentNightStep) socket.emit('night:queue-step', state.currentNightStep);
          else if (queueIndex >= queue.length) socket.emit('night:queue-complete');
          return callback({ success: true, resynced: true });
        }

        // تسجيل التخطي
        dynamicNight.actions[abilityId] = {
          abilityId,
          performerPhysicalId: queue[queueIndex]?.performerPhysicalId || 0,
          targetPhysicalId: null,
          skipped: true,
        };

        queueIndex += 1;
        (state as any).dynamicQueueIndex = queueIndex;
        await setGameState(data.roomId, state);

        if (queueIndex < queue.length) {
          const step = queue[queueIndex];
          const targets = await getDynamicTargets(state, step.abilityId, step.performerPhysicalId, dynamicNight);
          const performer = state.players.find(p => p.physicalId === step.performerPhysicalId);
          const stepData = {
            role: step.abilityId,
            roleName: step.nameAr,
            performerPhysicalId: step.performerPhysicalId,
            performerName: performer?.name || '',
            availableTargets: targets.map(p => ({ physicalId: p.physicalId, name: p.name, avatarUrl: (p as any).avatarUrl || null })),
            canSkip: true,
            isDynamic: true,
            isDisabled: (step as any).isDisabled || false,
            disabledRoleName: (step as any).disabledRoleName || undefined,
          };
          socket.emit('night:queue-step', stepData);
          io.to(data.roomId).emit('night:step-info', { roleName: step.nameAr, stepType: step.abilityId });
          state.currentNightStep = stepData;
        } else {
          socket.emit('night:queue-complete');
          state.currentNightStep = null;
          state.nightComplete = true;
        }
        await setGameState(data.roomId, state);

        return callback({ success: true });
      }

      // ── Manual Mode (القديم) ──
      const currentIndex = NIGHT_QUEUE_ORDER.indexOf(data.role);
      const nextStep = getNextQueueStep(state, currentIndex);

      if (nextStep) {
        socket.emit('night:queue-step', nextStep);
        io.to(data.roomId).emit('night:step-info', { roleName: nextStep.roleName, stepType: nextStep.role });
        state.currentNightStep = nextStep;
      } else {
        socket.emit('night:queue-complete');
        state.currentNightStep = null;
        state.nightComplete = true;
      }
      await setGameState(data.roomId, state);

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تفعيل الممرضة يدوياً ──────────────────────
  socket.on('night:activate-nurse', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // التحقق أن الطبيب ميت
      const doctor = state.players.find((p: any) => p.role === Role.DOCTOR);
      if (doctor && doctor.isAlive) {
        return callback({ success: false, error: 'الطبيب لا يزال حياً' });
      }

      const nurse = state.players.find((p: any) => p.role === Role.NURSE && p.isAlive);
      if (!nurse) {
        return callback({ success: false, error: 'الممرضة غير موجودة أو ميتة' });
      }

      // إرسال خطوة الممرضة
      const targets = getAvailableTargets(state, Role.NURSE);
      const nurseStep = {
        role: Role.NURSE,
        roleName: 'حماية الممرضة',
        performerPhysicalId: nurse.physicalId,
        performerName: nurse.name,
        availableTargets: targets.map((id: number) => {
          const p = state.players.find((pl: any) => pl.physicalId === id);
          return { physicalId: id, name: p?.name || '' };
        }),
        canSkip: false,
      };
      socket.emit('night:queue-step', nurseStep);
      io.to(data.roomId).emit('night:step-info', { roleName: nurseStep.roleName, stepType: 'NURSE' });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── معالجة التقاطعات (بعد إنهاء الطابور) ────
  socket.on('night:resolve', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // 🧩 المسار الديناميكي
      // تصفير خطوة الليل عند حل التقاطعات
      state.currentNightStep = null;
      state.nightComplete = false;
      if (state.config.useDynamicEngine && state.dynamicNightState) {
        const dynamicNight = state.dynamicNightState;
        const events = await resolveNightDynamic(state, dynamicNight);

        // حفظ أحداث الصباح
        state.morningEvents = events;

        // فحص الفوز بالمحرك الديناميكي
        const winResult = await checkWinConditionDynamic(state);
        let pendingWinner: string | null = null;

        // 🔪 فحص فوز السفّاح (أكمل العقود)
        if (state.assassinState?.won && !state.winner) {
          pendingWinner = 'ASSASSIN';
          state.winner = 'ASSASSIN';
          state.pendingWinner = 'ASSASSIN';
        } else if (winResult.mainWinner) {
          pendingWinner = winResult.mainWinner;
          state.winner = winResult.mainWinner;
          state.pendingWinner = pendingWinner;
        }

        // 🔪 تحديث firstNightPassed بعد أول ليلة
        if (state.assassinState) {
          if (!state.assassinState.firstNightPassed) {
            state.assassinState.firstNightPassed = true;
          }
          const { regenerateDeadContracts } = await import('../game/assassin-engine.js');
          const regen = regenerateDeadContracts(state);
          if (regen.changed) {
            console.log(`🔄 [DynamicResolve] Assassin contracts updated: ${regen.changeLog.join(', ')}`);
          }
        }

        // حفظ الحالة
        state.dynamicNightState = dynamicNight; // تحديث lastTargets
        // مسح الطابور المؤقت
        delete (state as any).dynamicQueue;
        delete (state as any).dynamicQueueIndex;
        await setGameState(data.roomId, state);

        await setPhase(data.roomId, Phase.MORNING_RECAP);
        io.to(data.roomId).emit('game:phase-changed', {
          phase: Phase.MORNING_RECAP,
          teamCounts: getTeamCounts(state.players),
        });

        // إرسال كروت الملخص لليدر
        socket.emit('night:morning-recap', {
          events,
          pendingWinner,
          players: state.players,
          neutralResults: winResult.neutralResults, // 🧩 نتائج المحايدين
        });

        // 👥 إشعار المافيا/الأصغر إن حدث تحوّل
        notifyTwinTransform(io, data.roomId, state);
        await setGameState(data.roomId, state);

        // 🔪 إشعار اللاعب السفّاح بالتحديثات
        if (state.assassinState) {
          findPlayerSocket(io, data.roomId, state.assassinState.assassinPhysicalId)?.emit('assassin:contracts-update', {
            contracts: state.assassinState.contracts,
            currentIndex: 0, // legacy
            completedCount: state.assassinState.completedCount,
            totalRequired: state.assassinState.totalRequired,
          });
        }

        console.log(`🧩 Dynamic night resolved: ${events.length} events`);
        return callback({ success: true, events });
      }

      // ═══ المسار القديم ═══
      // تصفير خطوة الليل عند حل التقاطعات
      state.currentNightStep = null;
      state.nightComplete = false;
      await setGameState(data.roomId, state);

      const resolution = await resolveNight(data.roomId);
      await setPhase(data.roomId, Phase.MORNING_RECAP);

      // إبلاغ الجميع بالمرحلة الجديدة + أعداد الفرق بعد القتل
      const stateAfterResolve = await getGameState(data.roomId);
      io.to(data.roomId).emit('game:phase-changed', {
        phase: Phase.MORNING_RECAP,
        teamCounts: stateAfterResolve ? getTeamCounts(stateAfterResolve.players) : undefined,
      });

      // 🔪 فحص فوز السفّاح أو المهرج أو الفوز العادي
      let pendingWinner: string | null = null;
      if (stateAfterResolve?.winner === 'ASSASSIN') {
        pendingWinner = 'ASSASSIN';
        stateAfterResolve.pendingWinner = 'ASSASSIN';
        await setGameState(data.roomId, stateAfterResolve);
      } else if (resolution.neutralWin?.won) {
        pendingWinner = 'JESTER';
        const stFinal = await getGameState(data.roomId);
        if (stFinal) {
          stFinal.pendingWinner = 'JESTER';
          await setGameState(data.roomId, stFinal);
        }
      } else if (resolution.winResult !== WinResult.GAME_CONTINUES) {
        pendingWinner = resolution.winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
        // حفظ في الـ state للاستخدام لاحقاً عند تأكيد الليدر
        const stFinal = await getGameState(data.roomId);
        if (stFinal) {
          stFinal.pendingWinner = pendingWinner;
          await setGameState(data.roomId, stFinal);
        }
      }

      // 🔪 إشعار اللاعب السفّاح بالتحديثات اليدوية
      if (stateAfterResolve?.assassinState) {
        const assassinSock = findPlayerSocket(io, data.roomId, stateAfterResolve.assassinState.assassinPhysicalId);
        if (assassinSock) {
          assassinSock.emit('assassin:contracts-update', {
            contracts: stateAfterResolve.assassinState.contracts,
            currentIndex: 0, // legacy
            completedCount: stateAfterResolve.assassinState.completedCount,
            totalRequired: stateAfterResolve.assassinState.totalRequired,
          });
        }
      }

      // إرسال كروت الملخص لليدر + حالة الفوز المعلقة + اللاعبين المحدّثين
      socket.emit('night:morning-recap', {
        events: resolution.events,
        pendingWinner: pendingWinner,
        players: stateAfterResolve?.players || [],
        neutralWin: resolution.neutralWin || null,
        assassinState: stateAfterResolve?.assassinState || null,
      });

      // 👥 إشعار المافيا/الأصغر إن حدث تحوّل
      // ⚠️ نعيد تحميل أحدث حالة (وليس stateAfterResolve القديمة) كي لا نمسح pendingWinner المحفوظ في فروع الفوز
      const finalResolveState = await getGameState(data.roomId);
      if (finalResolveState) {
        notifyTwinTransform(io, data.roomId, finalResolveState);
        await setGameState(data.roomId, finalResolveState);
      }

      callback({ success: true, events: resolution.events });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── عرض حدث على شاشة العرض ────────────────────
  socket.on('night:display-event', async (data: {
    roomId: string;
    eventIndex: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const event = state.morningEvents[data.eventIndex];
      if (!event) return callback({ success: false, error: 'Event not found' });

      event.revealed = true;
      await setGameState(data.roomId, state);

      // بث الأنيميشن لشاشة العرض
      io.to(data.roomId).emit('display:morning-event', {
        type: event.type,
        targetPhysicalId: event.targetPhysicalId,
        targetName: event.targetName,
        extra: event.extra,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تأكيد إنهاء اللعبة (بعد عرض أحداث الصباح) ────
  socket.on('game:confirm-end', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const winner = state.pendingWinner;
      if (!winner) {
        return callback({ success: false, error: 'No pending winner' });
      }

      // إبلاغ الجميع بنتيجة اللعبة
      const gameOverPayload: any = {
        winner: winner,
        players: state.players,
      };
      // 🧩 إذا المحرك الديناميكي مفعّل → أرفق نتائج المحايدين
      if (state.config.useDynamicEngine) {
        try {
          const winResult = await checkWinConditionDynamic(state);
          gameOverPayload.neutralResults = winResult.neutralResults || [];
        } catch { /* fallback: بدون neutral results */ }
      }
      io.to(data.roomId).emit('game:over', gameOverPayload);
      await setPhase(data.roomId, Phase.GAME_OVER);
      state.phase = Phase.GAME_OVER;
      clearGameTimer(data.roomId);

      // مسح pendingWinner وتعيين winner
      state.winner = winner as 'MAFIA' | 'CITIZEN' | 'JESTER' | 'ASSASSIN';
      state.pendingWinner = null;
      await setGameState(data.roomId, state);

      // ── حفظ نتيجة المباراة + احتساب النقاط ──
      // (الغرفة تبقى مفتوحة لألعاب إضافية حتى يضغط الليدر "انتهت الفعالية")
      await finalizeMatch(state);

      console.log(`✅ Match finalized for room ${data.roomId} — Room stays OPEN for next game`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إنهاء الفعالية بالكامل (يُغلق الغرفة نهائياً) ────
  socket.on('room:close-event', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // 🧮 شبكة أمان: إن انتهت لعبة (تقرّر فائز) ولم تُحتسب بعد، نحتسبها الآن قبل حذف الحالة.
      // (مثلاً ضغط الليدر "إنهاء الفعالية" دون "عرض النتيجة" — وإلا ضاعت النقاط نهائياً مع حذف Redis.)
      await finalizeIfDecided(state);

      if (state.sessionId) {
        // مسار موحّد كامل: إغلاق الجلسة + إكمال النشاط + استبيانات التقييم + طرد كل
        // اللاعبين (event:closed + game:kicked + socketsLeave) + تنظيف Redis/activeRooms.
        const { endActivityRoom } = await import('../services/session.service.js');
        await endActivityRoom(state.sessionId, io);
      } else {
        // غرفة مستقلة بلا جلسة → تفكيك مباشر مع طرد اللاعبين
        io.to(data.roomId).emit('event:closed', { message: 'انتهت الفعالية — شكراً لمشاركتكم!', reason: 'تم إنهاء الفعالية وإغلاق الغرفة.' });
        io.to(data.roomId).emit('game:kicked', { reason: 'تم إنهاء الفعالية وإغلاق الغرفة.' });
        try { io.in(data.roomId).socketsLeave(data.roomId); } catch { /* ignore */ }
        markRoomAsFinished(data.roomId);
        const { deleteGameState } = await import('../config/redis.js');
        deleteGameState(data.roomId).catch(() => {});
      }

      console.log(`🔒 Event closed for room ${data.roomId} by leader`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });


  // ── إنهاء ملخص الليل والانتقال للنهار ────────
  socket.on('night:end-recap', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      // تصفير حالة النقاش والتصويت من الجولة السابقة
      const state = await getGameState(data.roomId);
      if (state) {
        state.discussionState = null;
        state.votingState = {
          totalVotesCast: 0,
          deals: [],
          candidates: [],
          hiddenPlayersFromVoting: [],
          tieBreakerLevel: 0,
          playerVotes: {},
        };
        // تصفير عدادات التبرير لبداية نهار جديد (الإسكات يبقى — يُصفَّر في بداية الليل التالي)
        state.players.forEach(p => { 
          if (p.isAlive) {
            p.justificationCount = 0;
          }
        });
        await setGameState(data.roomId, state);

        // 👮‍♀️ فحص: هل صلاحية الشرطية جاهزة؟ (بعد ملخص الليل)
        if (state.policewomanState?.isReady && !state.policewomanState.isUsed) {
          const targets = state.players
            .filter(p => p.isAlive)
            .map(p => ({ physicalId: p.physicalId, name: p.name }));

          socket.emit('policewoman:choice-available', {
            policewomanName: state.policewomanState.policewomanName,
            policewomanPhysicalId: state.policewomanState.policewomanPhysicalId,
            targets,
            threshold: state.policewomanState.threshold,
            citizenDeaths: state.policewomanState.citizenDeathsSinceTrigger,
          });
          return callback({ success: true, policewomanPending: true });
        }
      }

      // 🛡️ حماية: إذا فيه فائز معلق (مثلاً الشرطية أقصت آخر مافيا) → إنهاء اللعبة مباشرة
      if (state.pendingWinner) {
        const winner = state.pendingWinner;
        const gameOverPayload: any = {
          winner,
          players: state.players,
        };
        if (state.config.useDynamicEngine) {
          try {
            const winResult = await checkWinConditionDynamic(state);
            gameOverPayload.neutralResults = winResult.neutralResults || [];
          } catch { /* fallback */ }
        }
        io.to(data.roomId).emit('game:over', gameOverPayload);
        await setPhase(data.roomId, Phase.GAME_OVER);
        state.phase = Phase.GAME_OVER;
        clearGameTimer(data.roomId);
        state.winner = winner as 'MAFIA' | 'CITIZEN' | 'JESTER';
        state.pendingWinner = null;
        await setGameState(data.roomId, state);
        await finalizeMatch(state);
        console.log(`✅ Game ended via night:end-recap safety check — winner: ${winner}`);
        return callback({ success: true });
      }

      await setPhase(data.roomId, Phase.DAY_DISCUSSION);
      // إرسال الـ state كاملة لضمان تحديث isAlive على شاشة العرض
      const updatedState = await getGameState(data.roomId);
      io.to(data.roomId).emit('game:phase-changed', {
        phase: Phase.DAY_DISCUSSION,
        teamCounts: getTeamCounts(updatedState!.players),
        state: updatedState,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 👮‍♀️ تنفيذ اختيار الشرطية ────────────────────
  socket.on('policewoman:execute', async (data: {
    roomId: string;
    targetPhysicalId: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (!state.policewomanState?.isReady || state.policewomanState.isUsed) {
        return callback({ success: false, error: 'صلاحية الشرطية غير متاحة' });
      }

      const target = state.players.find(p => p.physicalId === data.targetPhysicalId && p.isAlive);
      if (!target) return callback({ success: false, error: 'الهدف غير صالح' });

      // إقصاء الهدف
      target.isAlive = false;
      state.policewomanState.isUsed = true;

      const targetIsMafia = target.role ? isMafiaRole(target.role as Role) : false;

      // تسجيل في performanceTracking
      if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
      state.performanceTracking.eliminationLog.push({
        physicalId: target.physicalId,
        eliminatedBy: 'POLICEWOMAN',
        round: state.round || 1,
        team: targetIsMafia ? 'MAFIA' : 'CITIZEN',
      });

      // نقاط رانك
      if (targetIsMafia) {
        state.performanceTracking.abilityResults.push({
          physicalId: state.policewomanState.policewomanPhysicalId,
          role: 'POLICEWOMAN',
          correct: true,
        });
      } else {
        state.performanceTracking.abilityResults.push({
          physicalId: state.policewomanState.policewomanPhysicalId,
          role: 'POLICEWOMAN',
          correct: false,
        });
      }

      // فحص الفوز بعد الإقصاء
      let pendingWinner: string | null = null;
      if (state.config.useDynamicEngine) {
        const dynResult = await checkWinConditionDynamic(state);
        if (dynResult.mainWinner) {
          pendingWinner = dynResult.mainWinner;
          state.pendingWinner = pendingWinner;
          state.winner = pendingWinner as 'MAFIA' | 'CITIZEN' | 'JESTER' | 'ASSASSIN';
        }
      } else {
        const winResult = checkWinCondition(state);
        if (winResult !== WinResult.GAME_CONTINUES) {
          pendingWinner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
          state.pendingWinner = pendingWinner;
          state.winner = pendingWinner as 'MAFIA' | 'CITIZEN' | 'JESTER' | 'ASSASSIN';
        }
      }

      await setGameState(data.roomId, state);

      // بث الأنيميشن لشاشة العرض
      io.to(data.roomId).emit('display:morning-event', {
        type: 'POLICEWOMAN_EXECUTION',
        targetPhysicalId: target.physicalId,
        targetName: target.name,
        extra: {
          policewomanName: state.policewomanState.policewomanName,
          targetRole: target.role,
          targetIsMafia,
        },
      });

      callback({
        success: true,
        targetName: target.name,
        targetRole: target.role,
        targetIsMafia,
        pendingWinner,
        teamCounts: getTeamCounts(state.players),
      });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 👮‍♀️ تخطي الشرطية والانتقال للنهار ────────────────
  socket.on('policewoman:skip', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // حماية: لا نقفز للنهار إذا كنا في مرحلة الليل
      if (state.phase === Phase.NIGHT) {
        return callback({ success: false, error: 'Cannot skip policewoman during night phase' });
      }

      if (state.policewomanState) {
        state.policewomanState.isUsed = true; // تعليم كمستخدمة لمنع التكرار
        await setGameState(data.roomId, state);
      }

      await setPhase(data.roomId, Phase.DAY_DISCUSSION);
      const updatedState = await getGameState(data.roomId);
      io.to(data.roomId).emit('game:phase-changed', {
        phase: Phase.DAY_DISCUSSION,
        teamCounts: getTeamCounts(updatedState!.players),
        state: updatedState,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إعادة تشغيل اللعبة (العودة للوبي) ────────
  socket.on('game:restart', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // إعادة تعيين جميع اللاعبين
      state.players = state.players.map((p: any) => ({
        ...p,
        isAlive: true,
        isSilenced: false,
        role: null,
        justificationCount: 0,
      }));

      // تنظيف حالة اللعبة بالكامل
      state.phase = Phase.LOBBY;
      state.round = 0;
      state.winner = null;
      state.pendingWinner = null;
      state.rolesPool = [];
      state.morningEvents = [];
      state.discussionState = null;
      state.rolesConfirmed = false;
      state.matchId = undefined;
      state.startedAt = undefined;
      state.nightActions = {
        godfatherTarget: null,
        doctorTarget: null,
        nurseTarget: null,
        sheriffTarget: null,
        sniperTarget: null,
        silencerTarget: null,
        sheriffResult: null,
        lastProtectedTarget: null,
      };
      state.currentNightStep = null;
      state.nightComplete = false;
      state.votingState = {
        totalVotesCast: 0,
        deals: [],
        candidates: [],
        hiddenPlayersFromVoting: [],
        tieBreakerLevel: 0,
        playerVotes: {},
      };
      state.policewomanState = null;
      // 💣 تنظيف حالة القنبلة والإقصاء المعلق والتتبع
      state.pendingBomb = null;
      state.pendingResolution = null;
      state.pendingWinner = null;
      state.performanceTracking = null;
      state.assassinState = null;
      state.twinState = null;              // 👥 تصفير حالة التوأمين
      state.luckyDraw = null;              // 🎁 تصفير سحب الهدايا
      state.withdrawalState = null;
      state.justificationData = null;
      state.gameTimer = null;
      state.nurseActivated = false;
      state.autoNightChoices = null;
      state.autoNightStepRole = null;
      state.autoNightStepApproval = false;
      state.autoNightPerformerId = null;
      state.playerNightActions = null;

      await setGameState(data.roomId, state);

      // بث للجميع: العودة للوبي
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.LOBBY });

      // إرسال الحالة الجديدة لليدر
      socket.emit('game:restarted', {
        players: state.players,
        config: state.config,
      });

      console.log(`🔄 Game restarted in room ${data.roomId}`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════
  // 📱 player:night-action — Auto Mode: كل لاعب يرسل إجراءه
  // ══════════════════════════════════════════════════════
  socket.on('player:night-action', async (data: {
    roomId: string;
    actionType: string;          // KILL | INVESTIGATE | PROTECT | SNIPE | SILENCE | DECOY
    targetPhysicalId: number | null; // null = skip
  }, callback) => {
    try {
      if (socket.data.role !== 'player') {
        return callback?.({ success: false, error: 'Only players' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback?.({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.NIGHT) return callback?.({ success: false, error: 'Not night phase' });
      if (state.config.nightMode !== 'auto') return callback?.({ success: false, error: 'Not auto mode' });

      const physicalId: number = Number(socket.data.physicalId);
      const player = state.players.find((p: any) => p.physicalId === physicalId);
      if (!player || !player.isAlive) return callback?.({ success: false, error: 'Player not alive' });

      // منع الإرسال المزدوج
      if (!state.playerNightActions) state.playerNightActions = { submitted: {} };
      if (state.playerNightActions.submitted[physicalId]) {
        return callback?.({ success: false, error: 'Already submitted' });
      }

      // تحقق: هل اللاعب هو صاحب الدور الفعلي لهذه الخطوة؟
      const stepRole = state.autoNightStepRole;
      if (!stepRole) return callback?.({ success: false, error: 'No active step' });

      const isRoleOwner = Number(physicalId) === Number(state.autoNightPerformerId);

      // تسجيل submitted
      state.playerNightActions.submitted[physicalId] = true;

      if (isRoleOwner && data.targetPhysicalId !== null) {
        // ── صاحب الدور الفعلي — تسجيل في nightActions ──
        switch (stepRole) {
          case Role.GODFATHER:
          case Role.CHAMELEON:
          case Role.MAFIA_REGULAR:
            state.nightActions.godfatherTarget = data.targetPhysicalId;
            break;
          case Role.SILENCER:
            state.nightActions.silencerTarget = data.targetPhysicalId;
            break;
          case Role.SHERIFF: {
            state.nightActions.sheriffTarget = data.targetPhysicalId;
            const investigated = state.players.find((p: any) => p.physicalId === data.targetPhysicalId);
            let sheriffResult = 'CITIZEN';
            if (investigated?.role === Role.CHAMELEON) sheriffResult = 'CITIZEN';
            else if (investigated?.role && isMafiaRole(investigated.role as Role)) sheriffResult = 'MAFIA';
            state.nightActions.sheriffResult = sheriffResult;
            socket.emit('night:sheriff-result', {
              result: sheriffResult,
              targetPhysicalId: data.targetPhysicalId,
              targetName: investigated?.name || '',
            });
            break;
          }
          case Role.DOCTOR:
            state.nightActions.doctorTarget = data.targetPhysicalId;
            break;
          case Role.NURSE:
            state.nightActions.nurseTarget = data.targetPhysicalId;
            break;
          case Role.SNIPER:
            state.nightActions.sniperTarget = data.targetPhysicalId;
            break;
          case Role.WITCH:
            // 🧙‍♀️ ضبط الهدف + التعطيل (إرسال لاعب الساحرة)
            applyWitchDisable(state, data.targetPhysicalId);
            break;
          default:
            // 🔪 السفّاح
            if ((stepRole as string) === 'ASSASSIN') {
              state.nightActions.assassinTarget = data.targetPhysicalId;
            }
            break;
        }
      }

      // إعلام الليدر بالتقدم وتحديث الحالة (لكي يرى اختيارات اللاعبين)
      if (!state.autoNightChoices) state.autoNightChoices = [];
      const existingChoiceIdx = state.autoNightChoices.findIndex(c => c.physicalId === physicalId);
      const newChoice = {
        physicalId,
        targetPhysicalId: data.targetPhysicalId,
        isReal: isRoleOwner,
        isRandom: false
      };
      if (existingChoiceIdx >= 0) {
        state.autoNightChoices[existingChoiceIdx] = newChoice;
      } else {
        state.autoNightChoices.push(newChoice);
      }

      // ⚠️ حفظ الحالة بالكامل (بما فيها autoNightChoices) في Redis
      await setGameState(data.roomId, state);
      
      const alivePlayers = state.players.filter((p: any) => p.isAlive);
      const submittedCount = Object.keys(state.playerNightActions.submitted).length;
      const missingPlayers = alivePlayers
        .filter((p: any) => !state.playerNightActions.submitted[p.physicalId])
        .map((p: any) => ({ physicalId: p.physicalId, name: p.name }));

      // بث للغرفة بدلاً من findLeaderSocket (قد يجد سوكت قديم)
      io.to(data.roomId).emit('night:auto-progress', {
        total: alivePlayers.length,
        submitted: submittedCount,
        missingPlayers,
        choices: state.autoNightChoices, // Send real-time choices to leader
      });

      callback?.({ success: true });

      // إذا أرسل الجميع → ننتقل لوضع المراجعة
      if (submittedCount >= alivePlayers.length) {
        console.log(`✅ All players submitted for step ${stepRole} in room ${data.roomId} — pending leader approval`);
        const oldTimer = autoNightTimers.get(data.roomId);
        if (oldTimer) {
          clearTimeout(oldTimer);
          autoNightTimers.delete(data.roomId);
        }
        
        const effectiveRole = stepRole === Role.NURSE ? Role.DOCTOR : stepRole;
        const newIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole as any);

        state.autoNightStepApproval = true;
        (state as any).autoNightApprovalNextIndex = newIndex; // 🌙 لاستئناف شاشة الموافقة عند reload
        await setGameState(data.roomId, state);
        
        io.to(data.roomId).emit('night:auto-step-approval', {
          choices: state.autoNightChoices || [],
          nextIndex: newIndex,
        });
      }
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════
  // 📱 night:auto-advance-step — الليدر يبدأ الخطوة الحالية
  // ══════════════════════════════════════════════════════
  socket.on('night:auto-advance-step', async (data: { roomId: string, durationSeconds?: number }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader') {
        return callback?.({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback?.({ success: false, error: 'Room not found' });
      if (state.phase !== Phase.NIGHT) return callback?.({ success: false, error: 'Not night phase' });
      if (state.config.nightMode !== 'auto') return callback?.({ success: false, error: 'Not auto mode' });
      if (!state.nightStep) return callback?.({ success: false, error: 'No pending step' });
      if (state.autoNightStepDispatched) return callback?.({ success: false, error: 'Step already dispatched' });

      // الليدر يبدأ الخطوة → إرسال للاعبين + بدء المؤقت
      await dispatchAutoStepToPlayers(io, data.roomId, data.durationSeconds);

      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════
  // 📱 night:auto-approve-step — الليدر يوافق على الاختيارات وينتقل للتالي
  // ══════════════════════════════════════════════════════
  socket.on('night:auto-approve-step', async (data: { roomId: string, modifiedChoices?: any[], nextIndex: number }, callback) => {
    try {
      if (socket.data.authStaff) socket.data.role = 'leader';
      if (socket.data.role !== 'leader') return callback?.({ success: false, error: 'Only leader' });
      
      const state = await getGameState(data.roomId);
      if (!state || !state.autoNightStepApproval) return callback?.({ success: false, error: 'Not in approval state' });

      // If leader modified choices, update them
      if (data.modifiedChoices && data.modifiedChoices.length > 0) {
        state.autoNightChoices = data.modifiedChoices;
      }

      // Find the real choice and update action
      const realChoice = state.autoNightChoices?.find(c => c.isReal);
      if (realChoice && realChoice.targetPhysicalId !== null) {
         const stepRole = state.autoNightStepRole;
         let animType: string | null = null;
         
         switch (stepRole) {
           case Role.GODFATHER:
           case Role.CHAMELEON:
           case Role.MAFIA_REGULAR:
             state.nightActions.godfatherTarget = realChoice.targetPhysicalId; 
             animType = 'ASSASSINATION_ATTEMPT';
             break;
           case Role.SILENCER:
             state.nightActions.silencerTarget = realChoice.targetPhysicalId; 
             animType = 'SILENCE';
             break;
           case Role.SHERIFF: {
             state.nightActions.sheriffTarget = realChoice.targetPhysicalId;
             animType = 'INVESTIGATION';
             const investigated = state.players.find((p: any) => p.physicalId === realChoice.targetPhysicalId);
             let sheriffResult = 'CITIZEN';
             if (investigated?.role === Role.CHAMELEON) sheriffResult = 'CITIZEN';
             else if (investigated?.role && [Role.GODFATHER, Role.SILENCER, Role.CHAMELEON, Role.MAFIA_REGULAR].includes(investigated.role)) sheriffResult = 'MAFIA';
             state.nightActions.sheriffResult = sheriffResult;
             break;
           }
           case Role.DOCTOR: 
             state.nightActions.doctorTarget = realChoice.targetPhysicalId; 
             animType = 'PROTECTION';
             break;
           case Role.NURSE: 
             state.nightActions.nurseTarget = realChoice.targetPhysicalId; 
             break;
           case Role.SNIPER:
             state.nightActions.sniperTarget = realChoice.targetPhysicalId;
             animType = 'SNIPE';
             break;
           case Role.WITCH:
             // 🧙‍♀️ ضبط الهدف + التعطيل + أنيميشن التعطيل (موافقة القائد)
             applyWitchDisable(state, realChoice.targetPhysicalId);
             animType = 'DISABLE_ABILITY';
             break;
           default:
             if ((stepRole as string) === 'ASSASSIN') {
               state.nightActions.assassinTarget = realChoice.targetPhysicalId;
               animType = 'ASSASSINATE';
             }
             break;
         }

         // إرسال الأنيميشن لشاشة العرض
         if (animType) {
           io.to(data.roomId).emit('night:animation', {
             type: animType,
             targetPhysicalId: realChoice.targetPhysicalId,
           });
         }
      }

      state.autoNightStepApproval = false;
      await setGameState(data.roomId, state);
      
      // تجهيز الخطوة التالية (تنتظر الليدر)
      await prepareAutoQueueStep(io, data.roomId, data.nextIndex);
      
      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ── استجابة الممرضة في Auto Mode ────────────────
  socket.on('nurse:activation-response', async (data: {
    roomId: string;
    activate: boolean;
  }, callback) => {
    try {
      if (socket.data.role !== 'player') return callback?.({ success: false, error: 'Only players' });

      const state = await getGameState(data.roomId);
      if (!state) return callback?.({ success: false, error: 'Room not found' });

      if (data.activate) {
        state.nurseActivated = true;
        await setGameState(data.roomId, state);
      }

      // الانتقال لمرحلة الليل الفعلية (Auto)
      await setPhase(data.roomId, Phase.NIGHT);
      state.phase = Phase.NIGHT;
      state.playerNightActions = { submitted: {} };
      await setGameState(data.roomId, state);

      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.NIGHT, teamCounts: getTeamCounts(state.players) });
      io.to(data.roomId).emit('display:night-started');

      const alivePlayers = state.players.filter((p: any) => p.isAlive);
      io.to(data.roomId).emit('night:auto-started', {
        totalAlive: alivePlayers.length,
      });

      prepareAutoQueueStep(io, data.roomId, -1);

      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════
  // 🔄 night:retry-auto — إعادة تشغيل الليل الأوتو عند العلق
  // ══════════════════════════════════════════════════════
  socket.on('night:retry-auto', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback?.({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback?.({ success: false, error: 'Room not found' });

      // التأكد أننا في مرحلة الليل
      if (state.phase !== Phase.NIGHT) {
        return callback?.({ success: false, error: 'Not in night phase' });
      }

      console.log(`🔄 Leader retry-auto for room ${data.roomId}`);

      // إلغاء أي تايمر قديم
      const oldTimer = autoNightTimers.get(data.roomId);
      if (oldTimer) { clearTimeout(oldTimer); autoNightTimers.delete(data.roomId); }

      // إعادة تجهيز الطابور من البداية
      state.playerNightActions = { submitted: {} };
      await setGameState(data.roomId, state);

      prepareAutoQueueStep(io, data.roomId, -1);

      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });
}

// ══════════════════════════════════════════════════════
// مساعد: الحصول على الخطوة التالية في الطابور
// مع وراثة الاغتيال إذا الشيخ ميت
// ══════════════════════════════════════════════════════

interface QueueStep {
  role: Role;
  roleName: string;
  performerPhysicalId: number;
  performerName: string;
  availableTargets: { physicalId: number; name: string; avatarUrl?: string | null }[];
  canSkip: boolean;
  isDisabled?: boolean;          // 🧙‍♀️ هل اللاعب معطّل (بفعل الساحرة)
  disabledRoleName?: string;     // اسم الدور المعطّل (للعرض)
}

function getNextQueueStep(state: any, currentIndex: number): QueueStep | null {
  for (let i = currentIndex + 1; i < NIGHT_QUEUE_ORDER.length; i++) {
    const actionRole = NIGHT_QUEUE_ORDER[i];
    let performer: any = null;

    if (actionRole === Role.GODFATHER) {
      // ── وراثة الاغتيال: شيخ → حرباية → قص → مافيا عادي ──
      for (const inheritRole of ASSASSINATION_INHERITANCE) {
        performer = state.players.find((p: any) => p.role === inheritRole && p.isAlive);
        if (performer) break;
      }
    } else if (actionRole === Role.DOCTOR) {
      // ── الطبيب أو الممرضة (بديلة) ──
      performer = state.players.find((p: any) => p.role === Role.DOCTOR && p.isAlive);
      if (!performer && state.nurseActivated) {
        // الطبيب ميت والممرضة مفعّلة → استبدال بالممرضة
        performer = state.players.find((p: any) => p.role === Role.NURSE && p.isAlive);
        if (performer) {
          const isPlayerDisabled = performer.disabledUntilRound != null && performer.disabledUntilRound >= (state.round || 1);
          const targets = getAvailableTargets(state, Role.NURSE);
          return {
            role: Role.NURSE,
            roleName: 'حماية الممرضة',
            performerPhysicalId: performer.physicalId,
            performerName: performer.name,
            availableTargets: targets.map((id: number) => {
              const p = state.players.find((pl: any) => pl.physicalId === id);
              return { physicalId: id, name: p?.name || '', avatarUrl: p?.avatarUrl || null };
            }),
            canSkip: false,
            isDisabled: isPlayerDisabled,
            disabledRoleName: isPlayerDisabled ? (performer.disabledRoleName || Role.NURSE) : undefined,
          };
        }
      }
    } else {
      // باقي الأدوار: صاحب الدور نفسه
      performer = state.players.find((p: any) => p.role === actionRole && p.isAlive);
    }

    if (!performer) continue;

    // 🔪 السفّاح: تخطي أول ليلة + تخطي إذا فاز
    if (actionRole === ('ASSASSIN' as Role)) {
      console.log(`🔪 getNextQueueStep: ASSASSIN check — firstNightPassed=${state.assassinState?.firstNightPassed}, won=${state.assassinState?.won}`);
      if (!state.assassinState?.firstNightPassed) continue;
      if (state.assassinState?.won) continue;
    }

    const isPlayerDisabled = performer.disabledUntilRound != null && performer.disabledUntilRound >= (state.round || 1);
    const targets = getAvailableTargets(state, actionRole);

    return {
      role: actionRole,
      roleName: ACTION_NAMES[actionRole] || actionRole,
      performerPhysicalId: performer.physicalId,
      performerName: performer.name,
      availableTargets: targets.map((id: number) => {
        const p = state.players.find((pl: any) => pl.physicalId === id);
        return { physicalId: id, name: p?.name || '', avatarUrl: p?.avatarUrl || null };
      }),
      canSkip: actionRole === Role.SNIPER || actionRole === Role.SILENCER || actionRole === Role.WITCH || actionRole === ('ASSASSIN' as Role),
      isDisabled: isPlayerDisabled,
      disabledRoleName: isPlayerDisabled ? (performer.disabledRoleName || actionRole) : undefined,
    };
  }

  return null;
}
