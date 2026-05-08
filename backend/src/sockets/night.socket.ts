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
import { finalizeMatch } from '../services/match.service.js';
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
];

// ── أسماء الإجراءات بالعربي ──
const ACTION_NAMES: Record<string, string> = {
  [Role.GODFATHER]: 'اغتيال المافيا',
  [Role.SILENCER]: 'إسكات المافيا',
  [Role.SHERIFF]: 'تحقيق الشريف',
  [Role.DOCTOR]: 'حماية الطبيب',
  [Role.SNIPER]: 'قنص القناص',
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
  await setPhase(roomId, Phase.MORNING_RECAP);

  const stateAfter = await getGameState(roomId);
  io.to(roomId).emit('game:phase-changed', {
    phase: Phase.MORNING_RECAP,
    teamCounts: stateAfter ? getTeamCounts(stateAfter.players) : undefined,
  });

  let pendingWinner: string | null = null;
  if (resolution.winResult !== WinResult.GAME_CONTINUES) {
    pendingWinner = resolution.winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
    const state = await getGameState(roomId);
    if (state) { state.pendingWinner = pendingWinner; await setGameState(roomId, state); }
  }

  // إرسال ملخص الصباح للليدر
  const leaderSock = findLeaderSocket(io, roomId);
  leaderSock?.emit('night:morning-recap', {
    events: resolution.events,
    pendingWinner,
    players: stateAfter?.players || [],
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
  const leaderSock = findLeaderSocket(io, roomId);
  if (leaderSock) {
    leaderSock.emit('game:state-updated', state);
    leaderSock.emit('night:auto-step-ready', {
      roleName: nextStep.roleName,
      role: nextStep.role,
      performerName: nextStep.performerName,
      performerPhysicalId: nextStep.performerPhysicalId,
      canSkip: nextStep.canSkip,
      timeoutSeconds: state.config.autoNightTime || 15,
    });
  }
  console.log(`🌙 Auto step ready: ${nextStep.roleName} — waiting for leader in room ${roomId}`);
}

// ── الليدر يبدأ الخطوة: إرسال للاعبين + بدء المؤقت ──
async function dispatchAutoStepToPlayers(io: Server, roomId: string) {
  const state = await getGameState(roomId);
  if (!state || !state.nightStep) return;

  const nextStep = state.nightStep;
  state.autoNightStepDispatched = true;
  state.playerNightActions = { submitted: {} };
  await setGameState(roomId, state);

  const timeoutSeconds = state.config.autoNightTime || 15;
  const alivePlayers = state.players.filter((p: any) => p.isAlive);
  const stepActionType = getAutoActionType(nextStep.role);

  // قائمة أهداف التمويه: جميع الأحياء
  const decoyTargets = alivePlayers.map((p: any) => ({
    physicalId: p.physicalId,
    name: p.name,
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
    console.log(`⏰ Auto step ${nextStep.role} timeout in room ${roomId}`);
    const effectiveRole = nextStep.role === Role.NURSE ? Role.DOCTOR : nextStep.role;
    const newIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole);
    // تجهيز الخطوة التالية (تنتظر الليدر)
    prepareAutoQueueStep(io, roomId, newIndex);
  }, timeoutSeconds * 1000);

  autoNightTimers.set(roomId, timerId as any);

  // إعلام الليدر أن الخطوة بدأت
  const leaderSock = findLeaderSocket(io, roomId);
  if (leaderSock) {
    leaderSock.emit('game:state-updated', state);
    leaderSock.emit('night:auto-step-started', {
      roleName: nextStep.roleName,
      timeoutSeconds,
    });
  }
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

      const firstStep = getNextQueueStep(state, -1);
      if (firstStep) {
        socket.emit('night:queue-step', firstStep);
        io.to(data.roomId).emit('night:step-info', { roleName: firstStep.roleName });
      } else {
        socket.emit('night:queue-complete');
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

      // تحديد أول دور نشط حي
      const firstStep = getNextQueueStep(state, -1);
      if (firstStep) {
        socket.emit('night:queue-step', firstStep);
        io.to(data.roomId).emit('night:step-info', { roleName: firstStep.roleName });
      } else {
        socket.emit('night:queue-complete');
      }

      callback({ success: true });
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
      }

      await setGameState(data.roomId, state);

      // الانتقال للخطوة التالية
      // الممرضة تأخذ خانة الطبيب في الطابور
      const effectiveRole = data.role === Role.NURSE ? Role.DOCTOR : data.role;
      const currentIndex = NIGHT_QUEUE_ORDER.indexOf(effectiveRole);
      const nextStep = getNextQueueStep(state, currentIndex);

      if (nextStep) {
        socket.emit('night:queue-step', nextStep);
        io.to(data.roomId).emit('night:step-info', { roleName: nextStep.roleName });
      } else {
        // انتهى الطابور → معالجة التقاطعات
        socket.emit('night:queue-complete');
      }

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

      // الانتقال للخطوة التالية
      const currentIndex = NIGHT_QUEUE_ORDER.indexOf(data.role);
      const nextStep = getNextQueueStep(state, currentIndex);

      if (nextStep) {
        socket.emit('night:queue-step', nextStep);
        io.to(data.roomId).emit('night:step-info', { roleName: nextStep.roleName });
      } else {
        socket.emit('night:queue-complete');
      }

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
      io.to(data.roomId).emit('night:step-info', { roleName: nurseStep.roleName });

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

      const resolution = await resolveNight(data.roomId);
      await setPhase(data.roomId, Phase.MORNING_RECAP);

      // إبلاغ الجميع بالمرحلة الجديدة + أعداد الفرق بعد القتل
      const stateAfterResolve = await getGameState(data.roomId);
      io.to(data.roomId).emit('game:phase-changed', {
        phase: Phase.MORNING_RECAP,
        teamCounts: stateAfterResolve ? getTeamCounts(stateAfterResolve.players) : undefined,
      });

      // حفظ حالة الفوز المعلقة (إن وجدت) بدون بث فوري
      let pendingWinner: string | null = null;
      if (resolution.winResult !== WinResult.GAME_CONTINUES) {
        pendingWinner = resolution.winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
        // حفظ في الـ state للاستخدام لاحقاً عند تأكيد الليدر
        const state = await getGameState(data.roomId);
        if (state) {
          state.pendingWinner = pendingWinner;
          await setGameState(data.roomId, state);
        }
      }

      // إرسال كروت الملخص لليدر + حالة الفوز المعلقة + اللاعبين المحدّثين
      socket.emit('night:morning-recap', {
        events: resolution.events,
        pendingWinner: pendingWinner,
        players: stateAfterResolve?.players || [],
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
      io.to(data.roomId).emit('game:over', {
        winner: winner,
        players: state.players,
      });
      await setPhase(data.roomId, Phase.GAME_OVER);
      state.phase = Phase.GAME_OVER;

      // مسح pendingWinner
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
      const winResult = checkWinCondition(state);
      let pendingWinner: string | null = null;
      if (winResult !== WinResult.GAME_CONTINUES) {
        pendingWinner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
        state.pendingWinner = pendingWinner;
        state.winner = pendingWinner as 'MAFIA' | 'CITIZEN';
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
      if (state?.policewomanState) {
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
        }
      }

      await setGameState(data.roomId, state);

      // إعلام الليدر بالتقدم وتحديث الحالة (لكي يرى اختيارات اللاعبين)
      const alivePlayers = state.players.filter((p: any) => p.isAlive);
      const submittedCount = Object.keys(state.playerNightActions.submitted).length;
      const leaderSock = findLeaderSocket(io, data.roomId);
      if (leaderSock) {
        leaderSock.emit('game:state-updated', state);
        leaderSock.emit('night:auto-progress', {
          total: alivePlayers.length,
          submitted: submittedCount,
        });
      }

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
  socket.on('night:auto-advance-step', async (data: { roomId: string }, callback) => {
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
      await dispatchAutoStepToPlayers(io, data.roomId);

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
      const leaderSock = findLeaderSocket(io, data.roomId);
      leaderSock?.emit('night:auto-started', {
        totalAlive: alivePlayers.length,
      });

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
  availableTargets: { physicalId: number; name: string }[];
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
              return { physicalId: id, name: p?.name || '' };
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

    const targets = getAvailableTargets(state, actionRole);

    return {
      role: actionRole,
      roleName: ACTION_NAMES[actionRole] || actionRole,
      performerPhysicalId: performer.physicalId,
      performerName: performer.name,
      availableTargets: targets.map((id: number) => {
        const p = state.players.find((pl: any) => pl.physicalId === id);
        return { physicalId: id, name: p?.name || '' };
      }),
      canSkip: actionRole === Role.SNIPER || actionRole === Role.SILENCER,
    };
  }

  return null;
}
