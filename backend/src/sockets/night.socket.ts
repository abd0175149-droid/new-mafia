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
import { finalizeMatch } from '../services/match.service.js';
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
  Role.SHERIFF,    // 3. إجراء التحقيق
  Role.DOCTOR,     // 4. إجراء الحماية
  Role.SNIPER,     // 5. إجراء القنص
  'ASSASSIN' as Role,  // 6. 🔪 اغتيال السفّاح (آخر مرحلة)
];

// ── أسماء الإجراءات بالعربي ──
const ACTION_NAMES: Record<string, string> = {
  [Role.GODFATHER]: 'اغتيال المافيا',
  [Role.SILENCER]: 'إسكات المافيا',
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
    case 'ASSASSIN' as Role:
      // السفّاح: كل الأحياء ما عدا نفسه
      return alive.filter((id: number) => id !== selfId);
    default:
      // DECOY: نفس الأحياء للتمويه
      return alive.filter((id: number) => id !== selfId);
  }
}

// ── إيجاد socket لاعب بـ physicalId ──
function findPlayerSocket(io: Server, roomId: string, physicalId: number) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return undefined;
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock?.data.physicalId === physicalId && sock?.data.role === 'player') return sock;
  }
  return undefined;
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

  // 🔪 معالجة اغتيال السفّاح (بعد الحل الأساسي)
  const stateBeforeAssassin = await getGameState(roomId);
  if (stateBeforeAssassin?.assassinState && stateBeforeAssassin.nightActions?.assassinTarget) {
    const { evaluateAssassinKill } = await import('../game/assassin-engine.js');
    const targetId = stateBeforeAssassin.nightActions.assassinTarget;
    const target = stateBeforeAssassin.players.find((p: any) => p.physicalId === targetId);
    if (target && target.isAlive) {
      target.isAlive = false;
      const wasRandom = stateBeforeAssassin.nightActions.randomSelections?.['ASSASSIN'] || false;
      // تقييم هل القتل يُكمل عقد
      evaluateAssassinKill(stateBeforeAssassin, targetId);
      resolution.events.push({
        type: 'ASSASSINATION',
        targetPhysicalId: targetId,
        targetName: target.name,
        performerPhysicalId: stateBeforeAssassin.assassinState.assassinPhysicalId,
        performerName: stateBeforeAssassin.players.find((p: any) => p.physicalId === stateBeforeAssassin.assassinState.assassinPhysicalId)?.name || '',
        wasRandom,
      });
    }
  }

  // 🔪 تحديث firstNightPassed
  if (stateBeforeAssassin?.assassinState && !stateBeforeAssassin.assassinState.firstNightPassed) {
    stateBeforeAssassin.assassinState.firstNightPassed = true;
  }
  if (stateBeforeAssassin) {
    await setGameState(roomId, stateBeforeAssassin);
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
  if (stateAfter?.assassinState?.won && !stateAfter.winner) {
    pendingWinner = 'ASSASSIN';
    stateAfter.winner = 'ASSASSIN';
    stateAfter.pendingWinner = 'ASSASSIN';
    await setGameState(roomId, stateAfter);
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
  });

  console.log(`✅ Auto night resolved for room ${roomId}`);
}

// ── تجهيز الخطوة التالية (بدون إرسال للاعبين — ينتظر الليدر) ──
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
  state.autoNightStepDispatched = true;
  state.playerNightActions = { submitted: {} };
  await setGameState(roomId, state);

  const timeoutSeconds = durationSeconds || state.config.autoNightTime || 15;
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
      const submitted = latestState.playerNightActions?.submitted?.[performerId];
      
      if (!submitted) {
        // القناص: تخطي بدل الاختيار العشوائي (لأن قنص مواطن = موت القناص + الهدف)
        if (latestState.autoNightStepRole === Role.SNIPER) {
          console.log(`⏭️ Auto SKIP for SNIPER in room ${roomId} (too risky for random)`);
          latestState.nightActions.sniperTarget = null;
          if (!latestState.playerNightActions) latestState.playerNightActions = { submitted: {} };
          latestState.playerNightActions.submitted[performerId] = true;
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
            await setGameState(roomId, latestState);
          }
        }
      }
    }

    const effectiveRole = nextStep.role === Role.NURSE ? Role.DOCTOR : nextStep.role;
    const newIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole);
    // تجهيز الخطوة التالية (تنتظر الليدر)
    await prepareAutoQueueStep(io, roomId, newIndex);
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
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
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
        // 🔪 تهيئة حالة السفّاح (أول ليلة فقط — Auto Mode)
        if (!state.assassinState) {
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

          // 🔪 تهيئة حالة السفّاح (أول ليلة فقط)
          if (!state.assassinState) {
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

  // ── تسجيل اختيار الليدر لهدف الدور الحالي ──
  socket.on('night:submit-action', async (data: {
    roomId: string;
    role: Role;
    targetPhysicalId: number;
  }, callback) => {
    try {
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
              sheriffResult = 'CITIZEN';
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
            sheriffResult = 'CITIZEN'; // الحرباية تظهر كمواطن
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
        if (state.assassinState && !state.assassinState.firstNightPassed) {
          state.assassinState.firstNightPassed = true;
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

      // 🤡 فوز المهرج — اللعبة تنتهي فوراً
      let pendingWinner: string | null = null;
      if (resolution.neutralWin?.won) {
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

      // إرسال كروت الملخص لليدر + حالة الفوز المعلقة + اللاعبين المحدّثين
      socket.emit('night:morning-recap', {
        events: resolution.events,
        pendingWinner: pendingWinner,
        players: stateAfterResolve?.players || [],
        neutralWin: resolution.neutralWin || null,
      });

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
      state.winner = winner as 'MAFIA' | 'CITIZEN' | 'JESTER';
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

      // إبلاغ الجميع بإغلاق الفعالية
      io.to(data.roomId).emit('event:closed', {
        message: 'انتهت الفعالية — شكراً لمشاركتكم!',
      });

      // تنظيف: حذف من activeRooms + إغلاق DB Session
      markRoomAsFinished(data.roomId);
      if (state.sessionId) {
        closeSession(state.sessionId).catch(() => {});
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
          state.winner = pendingWinner as 'MAFIA' | 'CITIZEN' | 'JESTER';
        }
      } else {
        const winResult = checkWinCondition(state);
        if (winResult !== WinResult.GAME_CONTINUES) {
          pendingWinner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
          state.pendingWinner = pendingWinner;
          state.winner = pendingWinner as 'MAFIA' | 'CITIZEN' | 'JESTER';
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

      const physicalId: number = socket.data.physicalId;
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

      const isRoleOwner = physicalId === state.autoNightPerformerId;

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
          default:
            // 🔪 السفّاح
            if ((stepRole as string) === 'ASSASSIN') {
              state.nightActions.assassinTarget = data.targetPhysicalId;
            }
            break;
        }
      }

      await setGameState(data.roomId, state);

      // إعلام الليدر بالتقدم وتحديث الحالة (لكي يرى اختيارات اللاعبين)
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
      });

      callback?.({ success: true });

      // إذا أرسل الجميع → تجهيز الخطوة التالية (تنتظر الليدر)
      if (submittedCount >= alivePlayers.length) {
        console.log(`✅ All players submitted for step ${stepRole} in room ${data.roomId} — preparing next`);
        const oldTimer = autoNightTimers.get(data.roomId);
        if (oldTimer) clearTimeout(oldTimer);
        const effectiveRole = stepRole === Role.NURSE ? Role.DOCTOR : stepRole;
        const currentIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole);
        prepareAutoQueueStep(io, data.roomId, currentIndex);
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
      if (!state.assassinState?.firstNightPassed) continue;
      if (state.assassinState?.won) continue;
    }

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
      canSkip: actionRole === Role.SNIPER || actionRole === Role.SILENCER || actionRole === ('ASSASSIN' as Role),
    };
  }

  return null;
}
