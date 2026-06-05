// ══════════════════════════════════════════════════════
// ☀️ أحداث النهار (Day Socket Events)
// المرجع: docs/03_DAY_PHASE_ENGINE.md
// ══════════════════════════════════════════════════════

import { Server, Socket } from 'socket.io';
import { getRoom, setPhase, Phase, SpeakerStatus } from '../game/state.js';
import { createDeal, removeDeal } from '../game/deal-engine.js';
import {
  initVoting,
  castVote,
  isVotingComplete,
  getVoteResult,
  resolveVoting,
  handleTieBreaker,
  TieBreakerAction,
  unNarrowVoting,
} from '../game/vote-engine.js';
import { checkWinCondition, WinResult } from '../game/win-checker.js';
import { checkWinConditionDynamic } from '../game/dynamic-win-checker.js';
import { isMafiaRole, getTeamCounts } from '../game/roles.js';
import { getGameState, setGameState } from '../config/redis.js';
import { checkPolicewomanTrigger } from '../game/night-resolver.js';
import { finalizeMatch } from '../services/match.service.js';
import { clearGameTimer, adjustGameTimer } from '../game/game-timer.js';

export function registerDayEvents(io: Server, socket: Socket) {

  // ── بدء مرحلة التصويت ──────────────────────────
  socket.on('day:start-voting', async (data: { roomId: string; durationSeconds?: number }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await initVoting(data.roomId);
      state.phase = Phase.DAY_VOTING;

      if (data.durationSeconds) {
        state.votingState.durationSeconds = data.durationSeconds;
        state.votingState.votingStartTime = Date.now();
      }
      await setGameState(data.roomId, state);

      // بناء بيانات اللاعبين مع الأسماء والصور للـ PlayerFlow
      const playersInfo = state.players
        .filter((p: any) => p.isAlive)
        .map((p: any) => ({
          physicalId: p.physicalId,
          name: p.name,
          avatarUrl: p.avatarUrl || null,
        }));

      // بث تغيير المرحلة مع الحالة الكاملة (يمنع race condition مع REST fallback)
      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_VOTING, state });

      io.to(data.roomId).emit('day:voting-started', {
        candidates: state.votingState.candidates,
        hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
        teamCounts: getTeamCounts(state.players),
        playersInfo,
        playerVotes: state.votingState.playerVotes,
        durationSeconds: state.votingState.durationSeconds || null,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تسجيل صوت اللاعب من جهازه ──────────────────────
  socket.on('player:cast-vote', async (data: {
    roomId: string;
    physicalId: number;
    candidateIndex: number;
    autoVote?: boolean;
  }, callback) => {
    try {
      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // التحقق من المرحلة
      if (state.phase !== Phase.DAY_VOTING) {
        return callback({ success: false, error: 'ليست مرحلة تصويت' });
      }

      // التحقق من أن اللاعب حي
      const player = state.players.find((p: any) => p.physicalId === data.physicalId);
      if (!player || !player.isAlive) {
        return callback({ success: false, error: 'اللاعب غير موجود أو ميت' });
      }

      // التحقق من صلاحية المرشح
      const candidate = state.votingState.candidates[data.candidateIndex];
      if (!candidate) {
        return callback({ success: false, error: 'مرشح غير صالح' });
      }

      // منع التصويت لنفسه (مسموح فقط كعقوبة تلقائية)
      if (!data.autoVote && candidate.targetPhysicalId === data.physicalId) {
        return callback({ success: false, error: 'لا يمكنك التصويت لنفسك' });
      }

      // ── منع التصويت الجديد بعد اكتمال الأصوات ──
      if (isVotingComplete(state) && state.votingState.playerVotes[data.physicalId] === undefined) {
        return callback({ success: false, error: 'اكتمل التصويت — لا يمكن إضافة صوت جديد' });
      }

      // ── سحب الصوت القديم إذا كان موجوداً (تغيير الصوت) ──
      const previousVote = state.votingState.playerVotes[data.physicalId];
      if (previousVote !== undefined) {
        // نفس المرشح → لا تغيير
        if (previousVote === data.candidateIndex) {
          return callback({ success: true, message: 'نفس الصوت — لا تغيير' });
        }
        // سحب الصوت القديم
        const oldCandidate = state.votingState.candidates[previousVote];
        if (oldCandidate && oldCandidate.votes > 0) {
          oldCandidate.votes -= 1;
          state.votingState.totalVotesCast -= 1;
        }
        console.log(`🔄 Player #${data.physicalId} changing vote: candidate[${previousVote}] → candidate[${data.candidateIndex}]`);
      }

      // تسجيل الصوت الجديد
      candidate.votes += 1;
      state.votingState.totalVotesCast += 1;
      state.votingState.playerVotes[data.physicalId] = data.candidateIndex;

      await setGameState(data.roomId, state);

      // بث تحديث الأصوات لحظياً لكل الشاشات
      io.to(data.roomId).emit('day:vote-update', {
        candidates: state.votingState.candidates,
        totalVotesCast: state.votingState.totalVotesCast,
        tieBreakerLevel: state.votingState.tieBreakerLevel,
        playerVotes: state.votingState.playerVotes,
        leaderProxyVotes: state.votingState.leaderProxyVotes || {},
      });

      // فحص اكتمال التصويت
      if (isVotingComplete(state)) {
        io.to(data.roomId).emit('day:voting-complete', {
          candidates: state.votingState.candidates,
          totalVotesCast: state.votingState.totalVotesCast,
        });
      }

      console.log(`🗳️ Player #${data.physicalId} voted for candidate[${data.candidateIndex}]`);
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── انتهاء مؤقت التصويت — تصويت تلقائي للجميع ──────
  socket.on('day:voting-timeout', async (data: {
    roomId: string;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      if (state.phase !== Phase.DAY_VOTING) {
        return callback({ success: false, error: 'ليست مرحلة تصويت' });
      }

      // جمع كل اللاعبين الأحياء الذين لم يصوتوا
      const alivePlayers = state.players.filter((p: any) => p.isAlive);
      let autoVotedCount = 0;

      for (const player of alivePlayers) {
        // هل صوّت بالفعل؟
        if (state.votingState.playerVotes[player.physicalId] !== undefined) continue;

        // إيجاد المرشح الذي يمثل هذا اللاعب (التصويت على النفس كعقوبة)
        const selfCandidateIndex = state.votingState.candidates.findIndex(
          (c: any) => c.type === 'PLAYER' && c.targetPhysicalId === player.physicalId
        );

        if (selfCandidateIndex !== -1) {
          const candidate = state.votingState.candidates[selfCandidateIndex];
          candidate.votes += 1;
          state.votingState.totalVotesCast += 1;
          state.votingState.playerVotes[player.physicalId] = selfCandidateIndex;
          autoVotedCount++;
          console.log(`⏰ Auto self-vote: #${player.physicalId} (${player.name}) → voted for self`);
        }
      }

      if (autoVotedCount > 0) {
        await setGameState(data.roomId, state);

        // بث تحديث الأصوات
        io.to(data.roomId).emit('day:vote-update', {
          candidates: state.votingState.candidates,
          totalVotesCast: state.votingState.totalVotesCast,
          tieBreakerLevel: state.votingState.tieBreakerLevel,
          playerVotes: state.votingState.playerVotes,
          leaderProxyVotes: state.votingState.leaderProxyVotes || {},
        });

        console.log(`⏰ Voting timeout: ${autoVotedCount} player(s) auto-voted for self in room ${data.roomId}`);
      }

      // فحص اكتمال التصويت
      if (isVotingComplete(state)) {
        io.to(data.roomId).emit('day:voting-complete', {
          candidates: state.votingState.candidates,
          totalVotesCast: state.votingState.totalVotesCast,
        });
      }

      callback({ success: true, autoVotedCount });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إنشاء اتفاقية ──────────────────────────────
  socket.on('day:create-deal', async (data: {
    roomId: string;
    initiatorPhysicalId: number;
    targetPhysicalId: number;
  }, callback) => {
    try {
      const isLeader = socket.data.role === 'leader';
      const isPlayer = socket.data.role === 'player';

      if (!isLeader && !isPlayer) {
        return callback({ success: false, error: 'غير مصرح لك بإجراء هذه العملية' });
      }

      // إذا كان لاعباً، يجب التحقق من شروط مرحلة النقاش وصلاحية الهوية
      if (isPlayer) {
        const state = await getRoom(data.roomId);
        if (!state) {
          return callback({ success: false, error: 'لم يتم العثور على الغرفة' });
        }

        if (state.phase !== Phase.DAY_DISCUSSION) {
          return callback({ success: false, error: 'يمكن إبرام الاتفاقيات أثناء مرحلة النقاش فقط' });
        }

        if (socket.data.physicalId !== data.initiatorPhysicalId) {
          return callback({ success: false, error: 'لا يمكنك إبرام اتفاقية بالنيابة عن لاعب آخر' });
        }
      }

      const state = await createDeal(data.roomId, data.initiatorPhysicalId, data.targetPhysicalId);

      io.to(data.roomId).emit('day:deal-created', {
        deals: state.votingState.deals,
      });

      callback({ success: true, deals: state.votingState.deals });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إلغاء اتفاقية ──────────────────────────────
  socket.on('day:remove-deal', async (data: {
    roomId: string;
    dealId: string;
  }, callback) => {
    try {
      const isLeader = socket.data.role === 'leader';
      const isPlayer = socket.data.role === 'player';

      if (!isLeader && !isPlayer) {
        return callback({ success: false, error: 'غير مصرح لك بإجراء هذه العملية' });
      }

      if (isPlayer) {
        const state = await getRoom(data.roomId);
        if (!state) return callback({ success: false, error: 'لم يتم العثور على الغرفة' });
        
        if (state.phase !== Phase.DAY_DISCUSSION) {
          return callback({ success: false, error: 'يمكن إلغاء الاتفاقيات أثناء مرحلة النقاش فقط' });
        }
        
        const deal = state.votingState?.deals?.find((d: any) => d.id === data.dealId);
        if (!deal) {
          return callback({ success: false, error: 'الاتفاقية غير موجودة' });
        }
        
        if (deal.initiatorPhysicalId !== socket.data.physicalId) {
          return callback({ success: false, error: 'لا يمكنك إلغاء اتفاقية ليست لك' });
        }
      }

      const stateAfter = await removeDeal(data.roomId, data.dealId);

      io.to(data.roomId).emit('day:deal-removed', {
        deals: stateAfter.votingState.deals,
      });

      callback({ success: true, deals: stateAfter.votingState.deals });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تسجيل صوت ──────────────────────────────────
  socket.on('day:cast-vote', async (data: {
    roomId: string;
    candidateIndex: number;
    delta: 1 | -1;
    voterPhysicalId?: number; // تصويت بالوكالة — الليدر يصوّت نيابة عن لاعب
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await castVote(data.roomId, data.candidateIndex, data.delta);

      // تسجيل التصويت بالوكالة
      if (data.voterPhysicalId !== undefined && data.delta === 1) {
        // تحقق أن اللاعب حي ولم يصوّت
        const player = state.players.find((p: any) => p.physicalId === data.voterPhysicalId && p.isAlive);
        if (!player) {
          // إلغاء الصوت الذي أضفناه للتو
          await castVote(data.roomId, data.candidateIndex, -1);
          return callback({ success: false, error: 'Player not found or not alive' });
        }
        if (state.votingState.playerVotes[data.voterPhysicalId] !== undefined) {
          await castVote(data.roomId, data.candidateIndex, -1);
          return callback({ success: false, error: 'Player already voted' });
        }
        // تسجيل في playerVotes
        state.votingState.playerVotes[data.voterPhysicalId] = data.candidateIndex;
        // تسجيل في leaderProxyVotes
        if (!state.votingState.leaderProxyVotes) state.votingState.leaderProxyVotes = {};
        state.votingState.leaderProxyVotes[data.voterPhysicalId] = data.candidateIndex;
        await setGameState(data.roomId, state);
      } else if (data.voterPhysicalId !== undefined && data.delta === -1) {
        // إلغاء تصويت بالوكالة
        delete state.votingState.playerVotes[data.voterPhysicalId];
        if (state.votingState.leaderProxyVotes) {
          delete state.votingState.leaderProxyVotes[data.voterPhysicalId];
        }
        await setGameState(data.roomId, state);
      }

      // بث تحديث الأصوات لحظياً
      io.to(data.roomId).emit('day:vote-update', {
        candidates: state.votingState.candidates,
        totalVotesCast: state.votingState.totalVotesCast,
        tieBreakerLevel: state.votingState.tieBreakerLevel,
        playerVotes: state.votingState.playerVotes,
        leaderProxyVotes: state.votingState.leaderProxyVotes || {},
      });

      // إشعار باكتمال التصويت — الليدر يقرر الانتقال يدوياً بضغط Resolve
      if (isVotingComplete(state)) {
        io.to(data.roomId).emit('day:voting-complete', {
          candidates: state.votingState.candidates,
          totalVotesCast: state.votingState.totalVotesCast,
        });
      }

      callback({ success: true, leaderProxyVotes: state.votingState.leaderProxyVotes || {} });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إلغاء حصر التصويت (العودة لجميع المرشحين) ──
  socket.on('day:un-narrow', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await unNarrowVoting(data.roomId);

      // بث التحديث — كل المرشحين + tieBreakerLevel = 0
      io.to(data.roomId).emit('day:voting-started', {
        candidates: state.votingState.candidates,
        hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
        tieBreakerLevel: state.votingState.tieBreakerLevel,
        playerVotes: {},
        leaderProxyVotes: {},
        durationSeconds: state.votingState.durationSeconds || null,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── حسم النتيجة (ليدر يضغط resolve يدوياً) ──
  socket.on('day:resolve', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }
      const sortResult = await getVoteResult(data.roomId);
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const maxJust = state.config.maxJustifications || 2;

      // ══ احتساب نقطة تبرير لكل متهم عند الانتقال لواجهة التبرير ══
      // هذا يُحتسب فوراً عند الـ resolve — سواء فائز واحد أو تعادل
      for (const c of sortResult.topCandidates) {
        const p = state.players.find(pl => pl.physicalId === c.targetPhysicalId);
        if (p) {
          p.justificationCount = (p.justificationCount || 0) + 1;
        }
      }
      // حفظ العداد المحدّث في Redis
      await setGameState(data.roomId, state);

      // بناء قائمة المتهمين مع حالة التبرير (بعد الزيادة)
      const accusedPlayers = sortResult.topCandidates.map(c => {
        const p = state.players.find(pl => pl.physicalId === c.targetPhysicalId);
        return {
          ...c,
          name: p?.name,
          role: p?.role,
          gender: p?.gender,
          justificationCount: p?.justificationCount || 0,
          canJustify: !p?.isSilenced && (p?.justificationCount || 0) < maxJust,
        };
      });

      // فلترة: من يقدر يبرر (بعد احتساب الزيادة)
      const canJustifyList = accusedPlayers.filter(a => a.canJustify);

      await setPhase(data.roomId, Phase.DAY_JUSTIFICATION);
      state.phase = Phase.DAY_JUSTIFICATION; // ← مهم! تحديث المتغير المحلي
      state.withdrawalState = null; // ← مسح أي بيانات سحب قديمة من جولة سابقة

      // حساب من صوّت على المتهمين (لعرض خيار سحب الصوت في واجهة اللاعب)
      const accusedIds = accusedPlayers.map((a: any) => a.targetPhysicalId);
      const playerVotes = state.votingState?.playerVotes || {};
      const votersForAccused: number[] = [];
      for (const [voterId, targetIdx] of Object.entries(playerVotes)) {
        const candidate = state.votingState?.candidates?.[targetIdx as unknown as number];
        if (candidate && accusedIds.includes(candidate.targetPhysicalId)) {
          votersForAccused.push(parseInt(voterId));
        }
      }

      const justificationData = {
        resultType: sortResult.type,
        accused: accusedPlayers,
        canJustifyList,
        allExhausted: canJustifyList.length === 0,
        topVotes: sortResult.topVotes,
        maxJustifications: maxJust,
        candidates: state.votingState?.candidates || [],
        votersForAccused, // قائمة physicalIds للمصوتين على المتهمين
        playerVotes: state.votingState?.playerVotes || {}, // الأصوات
        leaderProxyVotes: state.votingState?.leaderProxyVotes || {}, // أصوات الليدر بالوكالة
      };

      // حفظ بيانات التبرير في الـ state لاستعادتها عند إعادة الاتصال
      state.justificationData = justificationData;
      await setGameState(data.roomId, state);

      io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_JUSTIFICATION });
      io.to(data.roomId).emit('day:justification-started', justificationData);
      callback({ success: true, result: sortResult });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── بدء تايمر التبرير ──────────────────────────
  // العداد يُحتسب في day:resolve — هنا فقط نبدأ التايمر مع حماية من الضغط المتكرر
  socket.on('day:start-justification-timer', async (data: {
    roomId: string;
    physicalId: number;
    timeLimitSeconds: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      const timerData = {
        physicalId: data.physicalId,
        timeLimitSeconds: data.timeLimitSeconds,
        startTime: Date.now(),
      };

      const state = await getGameState(data.roomId);
      if (state && state.justificationData) {
        state.justificationData.timer = timerData;
        state.justificationData.timerFinished = false;
        await setGameState(data.roomId, state);
      }

      io.to(data.roomId).emit('day:justification-timer-started', timerData);

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إيقاف تايمر التبرير ──────────────────────────
  socket.on('day:stop-justification-timer', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });
      const state = await getGameState(data.roomId);
      if (state && state.justificationData) {
        state.justificationData.timer = null;
        state.justificationData.timerFinished = true;
        await setGameState(data.roomId, state);
      }

      io.to(data.roomId).emit('day:justification-timer-stopped');
      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إعادة تايمر التبرير (بدون زيادة العداد) ──────
  socket.on('day:reset-justification-timer', async (data: {
    roomId: string;
    physicalId: number;
    timeLimitSeconds: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      const timerData = {
        physicalId: data.physicalId,
        timeLimitSeconds: data.timeLimitSeconds,
        startTime: Date.now(),
      };

      const state = await getGameState(data.roomId);
      if (state && state.justificationData) {
        state.justificationData.timer = timerData;
        state.justificationData.timerFinished = false;
        await setGameState(data.roomId, state);
      }

      // إعادة بث التايمر بدون زيادة justificationCount
      io.to(data.roomId).emit('day:justification-timer-started', timerData);

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تعديل مؤقت اللعبة الكلي أثناء اللعب (Game Timer) ──────
  socket.on('game:adjust-game-timer', async (data: {
    roomId: string;
    deltaMinutes: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });
      
      const result = await adjustGameTimer(io, data.roomId, data.deltaMinutes);
      callback(result);
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تعديل المؤقت أثناء اللعب ──────────────────────────
  socket.on('day:adjust-timer', async (data: {
    roomId: string;
    phase: 'DISCUSSION' | 'JUSTIFICATION';
    delta: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      if (data.phase === 'DISCUSSION') {
        const { getRoom, updateRoom, SpeakerStatus } = await import('../game/state.js');
        const rState = await getRoom(data.roomId);
        if (!rState || !rState.discussionState) {
          return callback({ success: false, error: 'No active discussion' });
        }

        const ds = rState.discussionState;
        if (ds.isFinished) return callback({ success: false, error: 'Discussion is finished' });

        if (ds.status === SpeakerStatus.SPEAKING && ds.startTime) {
          const elapsed = Math.floor((Date.now() - ds.startTime) / 1000);
          const currentRemaining = Math.max(0, ds.timeRemaining - elapsed);
          ds.timeRemaining = Math.max(0, currentRemaining + data.delta);
          ds.startTime = Date.now();
        } else {
          ds.timeRemaining = Math.max(0, ds.timeRemaining + data.delta);
        }

        await updateRoom(data.roomId, { discussionState: ds });
        io.to(data.roomId).emit('day:discussion-updated', { discussionState: ds, adjustment: data.delta });
      } else if (data.phase === 'JUSTIFICATION') {
        const timer = state.justificationData?.timer;
        if (!timer) {
          return callback({ success: false, error: 'No active justification timer' });
        }

        // حساب الوقت المتبقي الفعلي
        const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
        const currentRemaining = Math.max(0, timer.timeLimitSeconds - elapsed);
        const newRemaining = Math.max(0, currentRemaining + data.delta);

        // تحديث التايمر بالقيم الجديدة
        timer.timeLimitSeconds = newRemaining;
        timer.startTime = Date.now();

        await setGameState(data.roomId, state);

        // بث تحديث التايمر النشط مع قيمة التعديل
        io.to(data.roomId).emit('day:justification-timer-started', {
          physicalId: timer.physicalId,
          timeLimitSeconds: newRemaining,
          startTime: timer.startTime,
          adjustment: data.delta,
        });
      }

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── بدء فترة سحب الأصوات (بعد التبرير) ──────────────
  socket.on('day:start-withdrawal', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // عدد المصوتين على المتهمين
      const justData = state.justificationData;
      if (!justData?.accused?.length) return callback({ success: false, error: 'No accused' });

      const accusedIds = justData.accused.map((a: any) => a.targetPhysicalId);
      const playerVotes = state.votingState?.playerVotes || {};

      // حساب: من صوّت على أحد المتهمين؟
      let votersForAccused = 0;
      for (const [, targetIdx] of Object.entries(playerVotes)) {
        const candidate = state.votingState?.candidates?.[targetIdx as number];
        if (candidate && accusedIds.includes(candidate.targetPhysicalId)) {
          votersForAccused++;
        }
      }

      const needed = Math.ceil(votersForAccused / 2);
      state.withdrawalState = { count: 0, needed, withdrawn: [], accusedIds, total: votersForAccused };
      await setGameState(data.roomId, state);

      io.to(data.roomId).emit('day:withdrawal-period', { needed, total: votersForAccused });
      callback({ success: true, needed });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── سحب صوت اللاعب (يعمل أثناء مرحلة التبرير مباشرة) ──
  socket.on('player:withdraw-vote', async (data: { physicalId: number }, callback) => {
    try {
      const roomId = socket.data.roomId;
      const state = await getGameState(roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (state.phase !== 'DAY_JUSTIFICATION') return callback({ success: false, error: 'Not in justification phase' });

      const justData = state.justificationData;
      if (!justData?.votersForAccused) return callback({ success: false, error: 'No voters data' });

      // تحقق أن هذا اللاعب صوّت على المتهم
      if (!justData.votersForAccused.includes(data.physicalId)) {
        return callback({ success: false, error: 'Did not vote for accused' });
      }

      // إنشاء withdrawalState تلقائياً إن لم يكن موجوداً
      if (!state.withdrawalState) {
        const total = justData.votersForAccused.length;
        const needed = Math.ceil(total / 2); // نصف أو أكثر
        state.withdrawalState = { count: 0, needed, withdrawn: [], accusedIds: justData.accused.map((a: any) => a.targetPhysicalId), total };
      }

      const ws = state.withdrawalState;
      if (ws.withdrawn.includes(data.physicalId)) return callback({ success: false, error: 'Already withdrawn' });

      ws.withdrawn.push(data.physicalId);
      ws.count = ws.withdrawn.length;
      await setGameState(roomId, state);

      io.to(roomId).emit('day:withdrawal-update', { count: ws.count, needed: ws.needed, total: ws.total, withdrawn: ws.withdrawn });

      callback({ success: true, count: ws.count, needed: ws.needed });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تنفيذ الإقصاء (بعد التبرير) ──────────────────
  // أول نقرة: تبدأ فترة سحب الأصوات
  // ثاني نقرة: تتحقق من النتيجة وتنفذ أو تعيد التصويت
  socket.on('day:execute-elimination', async (data: { roomId: string; skipWithdrawal?: boolean }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // ── الخطوة 1: بدء فترة سحب الأصوات (إن لم تبدأ بعد) ──
      if (!state.withdrawalState && !data.skipWithdrawal) {
        const justData = state.justificationData;
        if (justData?.accused?.length) {
          const accusedIds = justData.accused.map((a: any) => a.targetPhysicalId);
          const playerVotes = state.votingState?.playerVotes || {};

          // حساب: من صوّت على أحد المتهمين
          let votersForAccused = 0;
          const votersList: number[] = [];
          for (const [voterId, targetIdx] of Object.entries(playerVotes)) {
            const candidate = state.votingState?.candidates?.[targetIdx as unknown as number];
            if (candidate && accusedIds.includes(candidate.targetPhysicalId)) {
              votersForAccused++;
              votersList.push(parseInt(voterId));
            }
          }

          if (votersForAccused > 0) {
            const needed = Math.ceil(votersForAccused / 2); // نصف أو أكثر
            state.withdrawalState = { count: 0, needed, withdrawn: [], accusedIds, total: votersForAccused };
            await setGameState(data.roomId, state);

            io.to(data.roomId).emit('day:withdrawal-period', {
              needed,
              total: votersForAccused,
              accusedIds,
            });

            return callback({ success: true, withdrawalStarted: true, needed, total: votersForAccused });
          }
        }
      }

      // ── الخطوة 2: تحقق من نتيجة السحب ──
      if (state.withdrawalState) {
        const ws = state.withdrawalState;
        if (ws.count >= ws.needed) {
          // أكثر من النصف سحبوا → إعادة تصويت
          state.withdrawalState = null;
          state.justificationData = null;
          await setGameState(data.roomId, state);

          io.to(data.roomId).emit('day:withdrawal-result', { revote: true });

          // إعادة التصويت تلقائياً
          const newState = await initVoting(data.roomId);
          await setPhase(data.roomId, Phase.DAY_VOTING);
          newState.phase = Phase.DAY_VOTING;

          io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_VOTING });
          io.to(data.roomId).emit('day:voting-started', {
            candidates: newState.votingState.candidates,
            hiddenPlayers: newState.votingState.hiddenPlayersFromVoting,
            teamCounts: getTeamCounts(newState.players),
            playerVotes: {},
            leaderProxyVotes: {},
            durationSeconds: newState.votingState.durationSeconds || null,
          });

          return callback({ success: true, revote: true });
        }

        // لم يسحب النصف → مسح السحب ومتابعة الإقصاء
        state.withdrawalState = null;
        await setGameState(data.roomId, state);
        io.to(data.roomId).emit('day:withdrawal-result', { revote: false });
      }

      // ── الخطوة 3: تنفيذ الإقصاء فعلياً ──
      const result = await resolveVoting(data.roomId);

      if (result.type === 'TIE') {
        await setPhase(data.roomId, Phase.DAY_TIEBREAKER);
        io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_TIEBREAKER });
        io.to(data.roomId).emit('day:tie', { tiedCandidates: result.tiedCandidates });
      } else {
        // حفظ نتيجة الإقصاء + تغيير المرحلة
        const stateAfter = await getGameState(data.roomId);
        if (stateAfter) {
          stateAfter.pendingResolution = {
            eliminated: result.eliminated,
            revealedRoles: result.revealedRoles,
            winResult: result.winResult,
            type: result.type,
            neutralWin: result.neutralWin || null,
          };
          stateAfter.phase = Phase.DAY_ELIMINATION;
          await setGameState(data.roomId, stateAfter);
        }
        await setPhase(data.roomId, Phase.DAY_ELIMINATION);
        // ⚠️ مهم: إرسال state مع phase-changed لمنع REST fallback من مسح pendingBomb
        io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_ELIMINATION, state: stateAfter });
        io.to(data.roomId).emit('day:elimination-pending', {
          eliminated: result.eliminated,
          revealedRoles: result.revealedRoles,
          winResult: result.winResult,
          type: result.type,
          pendingBomb: stateAfter?.pendingBomb || null,
          neutralWin: result.neutralWin || null,
        });
        console.log(`📦 elimination-pending sent — pendingBomb: ${JSON.stringify(stateAfter?.pendingBomb || null)}${result.neutralWin?.won ? ' — 🤡 JESTER WIN!' : ''}`);
        console.log(`📦 eliminated: ${result.eliminated}, revealedRoles: ${JSON.stringify(result.revealedRoles)}`);
        console.log(`📦 bombEnabled config: ${stateAfter?.config?.bombEnabled}`);
      }

      callback({ success: true, result });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── (تم حذف العفو — غير مطلوب حسب قواعد اللعبة) ──

  // ── كشف النتيجة ──────────────────────────────
  socket.on('day:trigger-reveal', async (data: { roomId: string, result: any }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const result = data.result;
      
      // 🤡 فحص فوز المهرج أولاً
      let pendingWinner: string | null = null;
      const state = await getGameState(data.roomId);
      if (state) {
        if (result.neutralWin?.won) {
          // فوز المهرج — اللعبة تنتهي فوراً
          state.pendingWinner = 'JESTER';
          state.winner = 'JESTER';
          pendingWinner = 'JESTER';
          await setGameState(data.roomId, state);
        } else if (result.winResult !== WinResult.GAME_CONTINUES) {
          const winnerValue: 'MAFIA' | 'CITIZEN' = result.winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
          state.pendingWinner = winnerValue;
          state.winner = winnerValue;
          pendingWinner = winnerValue;
          await setGameState(data.roomId, state);
        }
      }

      const currentState = await getGameState(data.roomId);

      // 🔪 تجديد عقود السفّاح إذا خرج لاعب مستهدف
      if (currentState?.assassinState) {
        const { regenerateDeadContracts } = await import('../game/assassin-engine.js');
        const regen = regenerateDeadContracts(currentState);
        if (regen.changed) {
          await setGameState(data.roomId, currentState);
          console.log(`🔄 Assassin contracts updated after elimination: ${regen.changeLog.join(', ')}`);
          // إشعار اللاعب السفّاح
          const assassinRoom = io.sockets.adapter.rooms.get(data.roomId);
          if (assassinRoom) {
            for (const socketId of assassinRoom) {
              const sock = io.sockets.sockets.get(socketId);
              if (sock?.data.physicalId === currentState.assassinState.assassinPhysicalId && sock?.data.role === 'player') {
                sock.emit('assassin:contracts-update', {
                  contracts: currentState.assassinState.contracts,
                  currentIndex: 0,
                  completedCount: currentState.assassinState.completedCount,
                  totalRequired: currentState.assassinState.totalRequired,
                  changeLog: regen.changeLog,
                });
              }
            }
          }
          // إشعار الليدر
          io.to(data.roomId).emit('game:state-sync', currentState);
        }
      }

      io.to(data.roomId).emit('day:elimination-revealed', {
        eliminated: result.eliminated,
        revealedRoles: result.revealedRoles,
        type: result.type,
        pendingWinner,
        teamCounts: currentState ? getTeamCounts(currentState.players) : undefined,
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 💣 قرار الليدر بشأن قدرة القنبلة ──────────────
  socket.on('day:bomb-decision', async (data: {
    roomId: string;
    eliminateAbove: boolean;
    eliminateBelow: boolean;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });
      if (!state.pendingBomb) return callback({ success: false, error: 'No pending bomb' });

      const bomb = state.pendingBomb;
      const bombEliminated: number[] = [];
      const bombRevealedRoles: { physicalId: number; role: string }[] = [];
      let totalBombRR = 0;

      // جلب إعدادات التقدم
      const { getProgressionConfig } = await import('../routes/progression-settings.routes.js');
      const config = await getProgressionConfig();
      const bombHitCitizen = config?.rr?.bombHitCitizen ?? 10;
      const bombHitMafia = config?.rr?.bombHitMafia ?? -10;

      const processTarget = (target: { physicalId: number; name: string; role: string }) => {
        const player = state.players.find(p => p.physicalId === target.physicalId);
        if (!player || !player.isAlive) return;

        player.isAlive = false;
        bombEliminated.push(player.physicalId);
        bombRevealedRoles.push({ physicalId: player.physicalId, role: player.role || 'UNKNOWN' });

        // تسجيل سبب الإقصاء
        if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
        state.performanceTracking.eliminationLog.push({
          physicalId: player.physicalId,
          eliminatedBy: 'GODFATHER_BOMB',
          round: state.round || 1,
          team: (player.role && isMafiaRole(player.role)) ? 'MAFIA' : 'CITIZEN',
        });

        // حساب RR
        const isMafia = player.role && isMafiaRole(player.role);
        totalBombRR += isMafia ? bombHitMafia : bombHitCitizen;
      };

      // ترتيب الكشف: الأقل (below) أولاً ثم الأعلى (above)
      if (data.eliminateBelow && bomb.below) processTarget(bomb.below);
      if (data.eliminateAbove && bomb.above) processTarget(bomb.above);

      // تطبيق RR لشيخ المافيا
      if (totalBombRR !== 0 && bomb.godfatherPlayerId) {
        try {
          const { applyRR } = await import('../services/progression.service.js');
          await applyRR(bomb.godfatherPlayerId, totalBombRR);

          // تسجيل في match_players
          if (state.matchId) {
            const { getDB } = await import('../config/db.js');
            const { matchPlayers } = await import('../schemas/game.schema.js');
            const { eq, sql, and } = await import('drizzle-orm');
            const db = getDB();
            if (db) {
              await db.update(matchPlayers)
                .set({
                  bombRRChange: sql`COALESCE(${matchPlayers.bombRRChange}, 0) + ${totalBombRR}`,
                  rrChange: sql`COALESCE(${matchPlayers.rrChange}, 0) + ${totalBombRR}`,
                })
                .where(
                  and(
                    eq(matchPlayers.matchId, state.matchId),
                    eq(matchPlayers.playerId, bomb.godfatherPlayerId)
                  )
                );
              console.log(`💣 Bomb RR (${totalBombRR}) recorded for Godfather player ${bomb.godfatherPlayerId}`);
            }
          }
        } catch (e: any) {
          console.warn(`⚠️ Failed to apply bomb RR:`, e.message);
        }
      }

      // مسح القنبلة المعلقة
      state.pendingBomb = null;

      // فحص شرط الفوز بعد الإقصاء الإضافي
      let winResult;
      if (state.config.useDynamicEngine) {
        const { checkWinConditionDynamic } = await import('../game/dynamic-win-checker.js');
        const dynResult = await checkWinConditionDynamic(state);
        winResult = dynResult.mainWinner === 'MAFIA' ? 'MAFIA_WIN'
                  : dynResult.mainWinner === 'CITIZEN' ? 'CITIZEN_WIN'
                  : dynResult.mainWinner === 'ASSASSIN' ? 'ASSASSIN_WIN'
                  : 'GAME_CONTINUES';
      } else {
        const winCheck = checkWinCondition(state);
        winResult = winCheck === WinResult.MAFIA_WIN ? 'MAFIA_WIN'
                  : winCheck === WinResult.CITIZEN_WIN ? 'CITIZEN_WIN'
                  : 'GAME_CONTINUES';
      }

      if (winResult !== 'GAME_CONTINUES') {
        const winnerValue = winResult === 'MAFIA_WIN' ? 'MAFIA' : winResult === 'ASSASSIN_WIN' ? 'ASSASSIN' : 'CITIZEN';
        state.winner = winnerValue;
        state.pendingWinner = winnerValue;
      }

      await setGameState(data.roomId, state);

      // بث النتيجة
      io.to(data.roomId).emit('day:bomb-result', {
        bombEliminated,
        bombRevealedRoles,
        bombRR: totalBombRR,
        winResult,
        teamCounts: getTeamCounts(state.players),
      });

      console.log(`💣 Bomb decision executed: eliminated ${bombEliminated.join(', ') || 'none'}, RR: ${totalBombRR}`);
      callback({ success: true, bombEliminated, bombRR: totalBombRR, winResult });
    } catch (err: any) {
      console.error('❌ bomb-decision error:', err.message);
      callback({ success: false, error: err.message });
    }
  });

  // ── إجراء كسر التعادل ──────────────────────────
  socket.on('day:tie-action', async (data: {
    roomId: string;
    action: TieBreakerAction;
    tiedCandidates?: any[];
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await handleTieBreaker(data.roomId, data.action, data.tiedCandidates);

      if (data.action === TieBreakerAction.CANCEL) {
        // إلغاء التصويت → العودة لمرحلة النقاش
        await setPhase(data.roomId, Phase.DAY_DISCUSSION);
        io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_DISCUSSION, teamCounts: getTeamCounts(state.players), state });
        io.to(data.roomId).emit('day:cancelled');
      } else if (data.action === TieBreakerAction.ELIMINATE_ALL) {
        // handleTieBreaker أقصى اللاعبين بالفعل (isAlive = false)
        // نبني قائمة المُقصيين من بيانات المتعادلين
        const eliminated: number[] = [];
        const revealedRoles: { physicalId: number; role: string }[] = [];

        if (data.tiedCandidates) {
          for (const candidate of data.tiedCandidates) {
            const target = state.players.find((p: any) => p.physicalId === candidate.targetPhysicalId);
            if (target) {
              eliminated.push(target.physicalId);
              revealedRoles.push({ physicalId: target.physicalId, role: target.role || 'UNKNOWN' });

              // قاعدة الاتفاقية: إذا المستهدف مواطن → المُبادر يُقصى أيضاً
              if (candidate.type === 'DEAL' && candidate.initiatorPhysicalId) {
                const targetIsMafia = target.role ? isMafiaRole(target.role) : false;
                if (!targetIsMafia) {
                  const initiator = state.players.find((p: any) => p.physicalId === candidate.initiatorPhysicalId);
                  if (initiator) {
                    initiator.isAlive = false;
                    eliminated.push(initiator.physicalId);
                    revealedRoles.push({ physicalId: initiator.physicalId, role: initiator.role || 'UNKNOWN' });
                  }
                }
              }
            }
          }
          await setGameState(data.roomId, state);
        }

        // فحص شرط الفوز — حفظ معلق بدل بث فوري
        let winResult: WinResult;
        if (state.config.useDynamicEngine) {
          const dynResult = await checkWinConditionDynamic(state);
          winResult = dynResult.mainWinner === 'MAFIA' ? WinResult.MAFIA_WIN
                    : dynResult.mainWinner === 'CITIZEN' ? WinResult.CITIZEN_WIN
                    : dynResult.mainWinner === 'ASSASSIN' ? WinResult.ASSASSIN_WIN
                    : WinResult.GAME_CONTINUES;
        } else {
          winResult = checkWinCondition(state);
        }
        if (winResult !== WinResult.GAME_CONTINUES) {
          state.winner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : winResult === WinResult.ASSASSIN_WIN ? 'ASSASSIN' : 'CITIZEN';
          state.pendingWinner = state.winner;
          await setGameState(data.roomId, state);
        }

        // بث الإقصاء مع نتيجة الفوز
        io.to(data.roomId).emit('day:elimination-pending', {
          eliminated,
          revealedRoles,
          type: 'ELIMINATE_ALL',
          winResult,
        });
      } else {
        if (state.votingState.durationSeconds) {
          state.votingState.votingStartTime = Date.now();
          await setGameState(data.roomId, state);
        }
        await setPhase(data.roomId, Phase.DAY_VOTING);
        // بث تغيير المرحلة أيضاً ليتم تحديث جميع العملاء
        io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_VOTING, teamCounts: getTeamCounts(state.players) });
        io.to(data.roomId).emit('day:voting-started', {
          candidates: state.votingState.candidates,
          hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
          tieBreakerLevel: state.votingState.tieBreakerLevel,
          playerVotes: {},
          leaderProxyVotes: {},
          durationSeconds: state.votingState.durationSeconds || null,
        });
      }

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── 🗣️ بدء دورة النقاش ──────────────────────────
  socket.on('day:start-discussion', async (data: {
    roomId: string;
    startPhysicalId: number;
    timeLimitSeconds: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      // @ts-ignore
      const { getRoom, updateRoom, SpeakerStatus } = await import('../game/state.js');
      const state = await getRoom(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      // تحديد اللاعبين المؤهلين للتحدث (أحياء، وغير مسكتين، وغيرهم من الموتى)
      // Wait, speaking queue should have ALL alive players. We will handle 'silenced' on the fly or just keep them in queue to trigger the SILENCED animation!
      // So queue should be all players where isAlive = true.
      const alivePlayers = state.players.filter(p => p.isAlive).sort((a, b) => a.physicalId - b.physicalId);
      if (alivePlayers.length === 0) return callback({ success: false, error: 'No alive players' });

      // Re-arrange the queue starting from startPhysicalId
      const startIndex = alivePlayers.findIndex(p => p.physicalId === data.startPhysicalId);
      if (startIndex === -1) return callback({ success: false, error: 'Invalid start id' });

      const speakingQueue: number[] = [];
      for (let i = startIndex; i < alivePlayers.length; i++) speakingQueue.push(alivePlayers[i].physicalId);
      for (let i = 0; i < startIndex; i++) speakingQueue.push(alivePlayers[i].physicalId);

      const currentSpeakerId = speakingQueue.shift() || null;

      const discussionState = {
        currentSpeakerId,
        timeLimitSeconds: data.timeLimitSeconds,
        timeRemaining: data.timeLimitSeconds,
        startTime: null,
        status: SpeakerStatus.WAITING,
        speakingQueue,
        hasSpoken: [],
        isFinished: false,
      };

      await updateRoom(data.roomId, { discussionState });
      io.to(data.roomId).emit('day:discussion-updated', { discussionState });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── ⏳ أفعال التوقيت (Start, Pause, Resume) ────────
  socket.on('day:timer-action', async (data: {
    roomId: string;
    action: 'START' | 'PAUSE' | 'RESUME' | 'RESET';
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      // @ts-ignore
      const { getRoom, updateRoom, SpeakerStatus } = await import('../game/state.js');
      const state = await getRoom(data.roomId);
      if (!state || !state.discussionState) return callback({ success: false, error: 'No active discussion' });

      const ds = state.discussionState;
      if (ds.isFinished) return callback({ success: false, error: 'Discussion is finished' });

      if (data.action === 'START' || data.action === 'RESUME') {
        // ═══ فحص الإسكات: إذا المتحدث مسكت → أنيميشن + تخطي ═══
        const currentPlayer = state.players.find((p: any) => p.physicalId === ds.currentSpeakerId);
        if (currentPlayer?.isSilenced) {
          // بث أنيميشن الإسكات فقط — الليدر يضغط NEXT يدوياً للانتقال
          io.to(data.roomId).emit('day:show-silenced', {
            physicalId: ds.currentSpeakerId,
            playerName: currentPlayer.name,
          });

          return callback({ success: true, silenced: true });
        }

        ds.status = SpeakerStatus.SPEAKING;
        ds.startTime = Date.now();
      } else if (data.action === 'PAUSE') {
        // Calculate elapsed
        if (ds.startTime) {
          const elapsed = Math.floor((Date.now() - ds.startTime) / 1000);
          ds.timeRemaining = Math.max(0, ds.timeRemaining - elapsed);
        }
        ds.status = SpeakerStatus.PAUSED;
        ds.startTime = null;
      } else if (data.action === 'RESET') {
        // إعادة التايمر من البداية
        ds.timeRemaining = ds.timeLimitSeconds;
        ds.startTime = null;
        ds.status = SpeakerStatus.WAITING;
      }

      await updateRoom(data.roomId, { discussionState: ds });
      io.to(data.roomId).emit('day:discussion-updated', { discussionState: ds });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── ⏭️ المتحدث التالي ───────────────────────────
  socket.on('day:next-speaker', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      // @ts-ignore
      const { getRoom, updateRoom, SpeakerStatus } = await import('../game/state.js');
      const state = await getRoom(data.roomId);
      if (!state || !state.discussionState) return callback({ success: false, error: 'No active discussion' });

      const ds = state.discussionState;
      if (ds.currentSpeakerId) ds.hasSpoken.push(ds.currentSpeakerId);

      // المسكت يدخل الدور عادياً — التخطي يحدث عند محاولة START في day:timer-action
      const nextSpeakerId = ds.speakingQueue.length > 0 ? ds.speakingQueue.shift()! : null;

      if (nextSpeakerId !== null) {
        ds.currentSpeakerId = nextSpeakerId;
        ds.timeRemaining = ds.timeLimitSeconds;
        // التايمر يبدأ تلقائياً عند الانتقال للتالي
        const nextPlayer = state.players.find((p: any) => p.physicalId === nextSpeakerId);
        const isSilenced = nextPlayer?.isSilenced === true;
        if (isSilenced) {
          // المسكت → نتخطاه تلقائياً بتعيين WAITING
          ds.startTime = null;
          ds.status = SpeakerStatus.WAITING;
        } else {
          ds.startTime = Date.now();
          ds.status = SpeakerStatus.SPEAKING;
        }
      } else {
        ds.currentSpeakerId = null;
        ds.isFinished = true;
        ds.startTime = null;
        ds.status = SpeakerStatus.WAITING;
      }

      await updateRoom(data.roomId, { discussionState: ds });
      io.to(data.roomId).emit('day:discussion-updated', { discussionState: ds });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── ⏮️ المتحدث السابق ───────────────────────────
  socket.on('day:prev-speaker', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      // @ts-ignore
      const { getRoom, updateRoom, SpeakerStatus } = await import('../game/state.js');
      const state = await getRoom(data.roomId);
      if (!state || !state.discussionState) return callback({ success: false, error: 'No active discussion' });

      const ds = state.discussionState;

      // لا يوجد متحدث سابق
      if (ds.hasSpoken.length === 0) {
        return callback({ success: false, error: 'لا يوجد متحدث سابق' });
      }

      // إرجاع المتحدث الحالي لبداية الطابور
      if (ds.currentSpeakerId !== null) {
        ds.speakingQueue.unshift(ds.currentSpeakerId);
      } else if (ds.isFinished) {
        // إذا انتهى النقاش → نرجع
        ds.isFinished = false;
      }

      // استعادة المتحدث السابق
      const prevSpeakerId = ds.hasSpoken.pop()!;
      ds.currentSpeakerId = prevSpeakerId;
      ds.timeRemaining = ds.timeLimitSeconds;
      ds.startTime = null;
      ds.status = SpeakerStatus.WAITING;

      await updateRoom(data.roomId, { discussionState: ds });
      io.to(data.roomId).emit('day:discussion-updated', { discussionState: ds });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إقصاء إداري (متاح في أي وقت) ──────────────
  socket.on('admin:eliminate', async (data: {
    roomId: string;
    physicalId: number;
  }, callback) => {
    try {
      // Auto-join as leader
      socket.join(data.roomId);
      socket.data.role = 'leader';
      socket.data.roomId = data.roomId;

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const player = state.players.find((p: any) => p.physicalId === data.physicalId);
      if (!player) return callback({ success: false, error: 'Player not found' });
      if (!player.isAlive) return callback({ success: false, error: 'Player already dead' });

      // ═══ إقصاء اللاعب ═══
      player.isAlive = false;
      checkPolicewomanTrigger(state, data.physicalId);

      // ═══ تحديث النقاش (Discussion) ═══
      if (state.discussionState && !state.discussionState.isFinished) {
        const ds = state.discussionState;

        // إزالة من طابور الانتظار
        ds.speakingQueue = ds.speakingQueue.filter((id: number) => id !== data.physicalId);

        // إذا كان المتحدث الحالي → ننتقل للتالي
        if (ds.currentSpeakerId === data.physicalId) {
          ds.hasSpoken.push(data.physicalId);

          // البحث عن المتحدث التالي (مع تخطي المسكتين)
          let nextSpeakerId: number | null = null;
          while (ds.speakingQueue.length > 0) {
            const nextId = ds.speakingQueue.shift()!;
            const nextPlayer = state.players.find((p: any) => p.physicalId === nextId);
            if (nextPlayer?.isSilenced) {
              io.to(data.roomId).emit('day:show-silenced', { physicalId: nextId });
              ds.hasSpoken.push(nextId);
              continue;
            }
            if (!nextPlayer?.isAlive) {
              ds.hasSpoken.push(nextId);
              continue;
            }
            nextSpeakerId = nextId;
            break;
          }

          if (nextSpeakerId !== null) {
            ds.currentSpeakerId = nextSpeakerId;
            ds.timeRemaining = ds.timeLimitSeconds;
            ds.startTime = null;
            ds.status = SpeakerStatus.WAITING;
          } else {
            ds.currentSpeakerId = null;
            ds.isFinished = true;
            ds.startTime = null;
            ds.status = SpeakerStatus.WAITING;
          }
        }

        io.to(data.roomId).emit('day:discussion-updated', { discussionState: ds });
      }

      // ═══ تحديث التصويت (Voting) ═══
      if (state.votingState && state.votingState.candidates.length > 0) {
        // إزالة اللاعب من المرشحين
        state.votingState.candidates = state.votingState.candidates.filter((c: any) => {
          if (c.type === 'PLAYER') return c.targetPhysicalId !== data.physicalId;
          if (c.type === 'DEAL') return c.initiatorPhysicalId !== data.physicalId && c.targetPhysicalId !== data.physicalId;
          return true;
        });

        // إعادة حساب المجموع
        state.votingState.totalVotesCast = state.votingState.candidates.reduce(
          (sum: number, c: any) => sum + (c.votes || 0), 0
        );

        // إضافة للقائمة المخفية
        if (!state.votingState.hiddenPlayersFromVoting.includes(data.physicalId)) {
          state.votingState.hiddenPlayersFromVoting.push(data.physicalId);
        }

        io.to(data.roomId).emit('day:vote-update', {
          candidates: state.votingState.candidates,
          totalVotesCast: state.votingState.totalVotesCast,
          playerVotes: state.votingState.playerVotes || {},
          leaderProxyVotes: state.votingState.leaderProxyVotes || {},
        });
      }

      // ═══ تحديث التبرير (Justification) — فقط إذا كنا فعلاً في مرحلة التبرير ═══
      if (state.justificationData && state.phase === Phase.DAY_JUSTIFICATION) {
        state.justificationData.accused = state.justificationData.accused.filter(
          (a: any) => a.targetPhysicalId !== data.physicalId
        );
        state.justificationData.canJustifyList = state.justificationData.canJustifyList.filter(
          (a: any) => a.targetPhysicalId !== data.physicalId
        );

        io.to(data.roomId).emit('day:justification-started', state.justificationData);
      }

      // ═══ حفظ الحالة ═══
      await setGameState(data.roomId, state);

      // بث الإقصاء للجميع — مع المرحلة الحالية + عداد الفريقين
      const teamCounts = getTeamCounts(state.players);

      io.to(data.roomId).emit('admin:player-eliminated', {
        physicalId: data.physicalId,
        playerName: player.name,
        role: player.role,
        currentPhase: state.phase,   // ← الفرونت يبقى في نفس المرحلة
        teamCounts,                  // ← تحديث عداد الفريقين
      });

      // ═══ فحص شرط الفوز (فقط بعد اعتماد الأدوار) ═══
      const phase = state.phase;
      const rolesAssigned = phase !== Phase.LOBBY && phase !== Phase.ROLE_GENERATION && phase !== Phase.ROLE_BINDING;
      let winResult: WinResult;
      if (rolesAssigned && state.config.useDynamicEngine) {
        const dynResult = await checkWinConditionDynamic(state);
        winResult = dynResult.mainWinner === 'MAFIA' ? WinResult.MAFIA_WIN
                  : dynResult.mainWinner === 'CITIZEN' ? WinResult.CITIZEN_WIN
                  : dynResult.mainWinner === 'ASSASSIN' ? WinResult.ASSASSIN_WIN
                  : WinResult.GAME_CONTINUES;
      } else {
        winResult = rolesAssigned ? checkWinCondition(state) : WinResult.GAME_CONTINUES;
      }
      if (winResult !== WinResult.GAME_CONTINUES) {
        const winner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : winResult === WinResult.ASSASSIN_WIN ? 'ASSASSIN' : 'CITIZEN';
        state.winner = winner;
        await setGameState(data.roomId, state);
        await setPhase(data.roomId, Phase.GAME_OVER);
        clearGameTimer(data.roomId);
        const gameOverData: any = { winner, players: state.players };
        // 🧩 نتائج المحايدين (إذا المحرك الديناميكي مفعّل)
        if (state.config.useDynamicEngine) {
          try {
            const dynGameOver = await checkWinConditionDynamic(state);
            gameOverData.neutralResults = dynGameOver.neutralResults || [];
          } catch { /* fallback */ }
        }
        io.to(data.roomId).emit('game:over', gameOverData);
        // حفظ نتيجة المباراة في PostgreSQL
        await finalizeMatch(state);
        // الغرفة تبقى مفتوحة — الليدر يقرر متى يغلقها أو يبدأ لعبة جديدة
        console.log(`✅ Match finalized via admin-eliminate for room ${data.roomId} — Room stays OPEN`);
      }

      console.log(`⚠️ Admin eliminated player #${data.physicalId} (${player.name})`);
      callback({ success: true, role: player.role });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── كشف دور اللاعب المُقصى على الـ Display ──
  socket.on('admin:reveal-eliminated', (data: {
    roomId: string;
    physicalId: number;
    playerName: string;
    role: string;
  }) => {
    if (socket.data.role !== 'leader') return;
    io.to(data.roomId).emit('admin:show-reveal', {
      physicalId: data.physicalId,
      playerName: data.playerName,
      role: data.role,
    });
  });

  // ── إخفاء كشف الدور عن الـ Display ──
  socket.on('admin:dismiss-reveal', (data: { roomId: string }) => {
    if (socket.data.role !== 'leader') return;
    io.to(data.roomId).emit('admin:hide-reveal');
  });
}
