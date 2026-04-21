// ══════════════════════════════════════════════════════
// 🌙 أحداث الليل (Night Socket Events)
// المرجع: docs/04_NIGHT_PHASE_ENGINE.md
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { setPhase, Phase } from '../game/state.js';
import { getGameState, setGameState } from '../config/redis.js';
import { resolveNight, resetNightActions, getAvailableTargets } from '../game/night-resolver.js';
import { Role, NIGHT_ACTIVE_ROLES, isMafiaRole } from '../game/roles.js';
import { WinResult } from '../game/win-checker.js';
import { finalizeMatch } from '../services/match.service.js';

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

      if (nurseAvailable) {
        // لا نغيّر المرحلة — الليدر يبقى في الشاشة الحالية ليرى سؤال الممرضة
        state.round += 1;
        await setGameState(data.roomId, state);
        return callback({ success: true, round: state.round, nurseAvailable: true });
      }

      // لا يوجد سؤال ممرضة — ننتقل للّيل مباشرة
      await setPhase(data.roomId, Phase.NIGHT);
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.NIGHT });
      io.to(data.roomId).emit('display:night-started');

      // تحديد أول دور نشط حي
      const firstStep = getNextQueueStep(state, -1);
      if (firstStep) {
        socket.emit('night:queue-step', firstStep);
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
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.NIGHT });
      io.to(data.roomId).emit('display:night-started');

      await setGameState(data.roomId, state);

      // تحديد أول دور نشط حي
      const firstStep = getNextQueueStep(state, -1);
      if (firstStep) {
        socket.emit('night:queue-step', firstStep);
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
      socket.emit('night:queue-step', {
        role: Role.NURSE,
        roleName: 'حماية الممرضة',
        performerPhysicalId: nurse.physicalId,
        performerName: nurse.name,
        availableTargets: targets.map((id: number) => {
          const p = state.players.find((pl: any) => pl.physicalId === id);
          return { physicalId: id, name: p?.name || '' };
        }),
        canSkip: false,
      });

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

      // إبلاغ الجميع بالمرحلة الجديدة
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.MORNING_RECAP });

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

      // إرسال كروت الملخص لليدر + حالة الفوز المعلقة
      socket.emit('night:morning-recap', {
        events: resolution.events,
        pendingWinner: pendingWinner,
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

      // الآن نبث game:over للجميع
      io.to(data.roomId).emit('game:over', {
        winner: winner,
        players: state.players,
      });
      await setPhase(data.roomId, Phase.GAME_OVER);

      // مسح pendingWinner
      state.pendingWinner = null;
      await setGameState(data.roomId, state);

      // حفظ نتيجة المباراة في PostgreSQL
      await finalizeMatch(state);

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إنهاء ملخص الصباح والانتقال للنهار ────────
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
        };
        // تصفير عدادات التبرير لبداية نهار جديد (الإسكات يبقى — يُصفَّر في بداية الليل التالي)
        state.players.forEach(p => { 
          if (p.isAlive) {
            p.justificationCount = 0;
          }
        });
        await setGameState(data.roomId, state);
      }

      await setPhase(data.roomId, Phase.DAY_DISCUSSION);
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_DISCUSSION });

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
      state.players.forEach((p: any) => {
        p.isAlive = true;
        p.isSilenced = false;
        p.role = null;
        p.justificationCount = 0;
      });

      // تنظيف حالة اللعبة بالكامل
      state.rolesPool = [];
      state.morningEvents = [];
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
      };
      state.discussionState = null;
      state.winner = null;
      state.pendingWinner = null;
      state.round = 1;

      await setGameState(data.roomId, state);
      await setPhase(data.roomId, Phase.LOBBY);

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
