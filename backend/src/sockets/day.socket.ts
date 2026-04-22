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
import { isMafiaRole, getTeamCounts } from '../game/roles.js';
import { getGameState, setGameState } from '../config/redis.js';
import { finalizeMatch } from '../services/match.service.js';

export function registerDayEvents(io: Server, socket: Socket) {

  // ── بدء مرحلة التصويت ──────────────────────────
  socket.on('day:start-voting', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await initVoting(data.roomId);
      await setPhase(data.roomId, Phase.DAY_VOTING);

      io.to(data.roomId).emit('day:voting-started', {
        candidates: state.votingState.candidates,
        hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
        teamCounts: getTeamCounts(state.players),
      });

      callback({ success: true });
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
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
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
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await removeDeal(data.roomId, data.dealId);

      io.to(data.roomId).emit('day:deal-removed', {
        deals: state.votingState.deals,
      });

      callback({ success: true, deals: state.votingState.deals });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تسجيل صوت ──────────────────────────────────
  socket.on('day:cast-vote', async (data: {
    roomId: string;
    candidateIndex: number;
    delta: 1 | -1;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await castVote(data.roomId, data.candidateIndex, data.delta);

      // بث تحديث الأصوات لحظياً
      io.to(data.roomId).emit('day:vote-update', {
        candidates: state.votingState.candidates,
        totalVotesCast: state.votingState.totalVotesCast,
        tieBreakerLevel: state.votingState.tieBreakerLevel,
      });

      // إشعار باكتمال التصويت — الليدر يقرر الانتقال يدوياً بضغط Resolve
      if (isVotingComplete(state)) {
        io.to(data.roomId).emit('day:voting-complete', {
          candidates: state.votingState.candidates,
          totalVotesCast: state.votingState.totalVotesCast,
        });
      }

      callback({ success: true });
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

      const justificationData = {
        resultType: sortResult.type,
        accused: accusedPlayers,
        canJustifyList,
        allExhausted: canJustifyList.length === 0,
        topVotes: sortResult.topVotes,
        maxJustifications: maxJust,
        candidates: state.votingState?.candidates || [],
      };

      // حفظ بيانات التبرير في الـ state لاستعادتها عند إعادة الاتصال
      state.justificationData = justificationData;
      await setGameState(data.roomId, state);

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

      io.to(data.roomId).emit('day:justification-timer-started', {
        physicalId: data.physicalId,
        timeLimitSeconds: data.timeLimitSeconds,
        startTime: Date.now(),
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── إيقاف تايمر التبرير ──────────────────────────
  socket.on('day:stop-justification-timer', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });
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

      // إعادة بث التايمر بدون زيادة justificationCount
      io.to(data.roomId).emit('day:justification-timer-started', {
        physicalId: data.physicalId,
        timeLimitSeconds: data.timeLimitSeconds,
        startTime: Date.now(),
      });

      callback({ success: true });
    } catch (err: any) {
      callback({ success: false, error: err.message });
    }
  });

  // ── تنفيذ الإقصاء (بعد التبرير) ──────────────────
  socket.on('day:execute-elimination', async (data: { roomId: string }, callback) => {
    try {
      if (socket.data.role !== 'leader') return callback({ success: false, error: 'Only leader' });

      const result = await resolveVoting(data.roomId);

      if (result.type === 'TIE') {
        await setPhase(data.roomId, Phase.DAY_TIEBREAKER);
        io.to(data.roomId).emit('day:tie', { tiedCandidates: result.tiedCandidates });
      } else {
        io.to(data.roomId).emit('day:elimination-pending', {
          eliminated: result.eliminated,
          revealedRoles: result.revealedRoles,
          winResult: result.winResult,
          type: result.type,
        });
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
      
      // حفظ حالة الفوز المعلقة — الليدر يضغط زر "عرض النتيجة" لبثها
      let pendingWinner: string | null = null;
      if (result.winResult !== WinResult.GAME_CONTINUES) {
        const state = await getGameState(data.roomId);
        if (state) {
          const winnerValue: 'MAFIA' | 'CITIZEN' = result.winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
          state.pendingWinner = winnerValue;
          state.winner = winnerValue;
          pendingWinner = winnerValue;
          await setGameState(data.roomId, state);
        }
      }

      io.to(data.roomId).emit('day:elimination-revealed', {
        eliminated: result.eliminated,
        revealedRoles: result.revealedRoles,
        type: result.type,
        pendingWinner,
      });

      callback({ success: true });
    } catch (err: any) {
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
        io.to(data.roomId).emit('game:phase-changed', { phase: Phase.DAY_DISCUSSION });
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
        const winResult = checkWinCondition(state);
        if (winResult !== WinResult.GAME_CONTINUES) {
          state.winner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
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
        await setPhase(data.roomId, Phase.DAY_VOTING);
        io.to(data.roomId).emit('day:voting-started', {
          candidates: state.votingState.candidates,
          hiddenPlayers: state.votingState.hiddenPlayersFromVoting,
          tieBreakerLevel: state.votingState.tieBreakerLevel,
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
        ds.startTime = null;
        ds.status = SpeakerStatus.WAITING;
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

  // ── إقصاء إداري (متاح في أي وقت) ──────────────
  socket.on('admin:eliminate', async (data: {
    roomId: string;
    physicalId: number;
  }, callback) => {
    try {
      if (socket.data.role !== 'leader') {
        return callback({ success: false, error: 'Only leader' });
      }

      const state = await getGameState(data.roomId);
      if (!state) return callback({ success: false, error: 'Room not found' });

      const player = state.players.find((p: any) => p.physicalId === data.physicalId);
      if (!player) return callback({ success: false, error: 'Player not found' });
      if (!player.isAlive) return callback({ success: false, error: 'Player already dead' });

      // ═══ إقصاء اللاعب ═══
      player.isAlive = false;

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
          if (c.type === 'player') return c.targetPhysicalId !== data.physicalId;
          if (c.type === 'deal') return c.initiatorPhysicalId !== data.physicalId && c.targetPhysicalId !== data.physicalId;
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
        });
      }

      // ═══ تحديث التبرير (Justification) ═══
      if (state.justificationData) {
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
      const winResult = rolesAssigned ? checkWinCondition(state) : WinResult.GAME_CONTINUES;
      if (winResult !== WinResult.GAME_CONTINUES) {
        const winner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
        state.winner = winner;
        await setGameState(data.roomId, state);
        await setPhase(data.roomId, Phase.GAME_OVER);
        io.to(data.roomId).emit('game:over', {
          winner,
          players: state.players,
        });
        // حفظ نتيجة المباراة في PostgreSQL
        await finalizeMatch(state);
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
