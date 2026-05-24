// ══════════════════════════════════════════════════════
// 🗳️ محرك التصويت (Vote Engine)
// المرجع: docs/03_DAY_PHASE_ENGINE.md - القسم 2 و 3
// ══════════════════════════════════════════════════════

import { type GameState, type Candidate, CandidateType, getAlivePlayers, type PlayerCandidate } from './state.js';
import { getGameState, setGameState } from '../config/redis.js';
import { checkWinCondition, WinResult } from './win-checker.js';
import { isMafiaRole } from './roles.js';
import { checkPolicewomanTrigger } from './night-resolver.js';

// ── تهيئة ساحة التصويت ──────────────────────────

/**
 * تهيئة ساحة التصويت لجولة جديدة
 * - يضاف كارت عادي لكل لاعب حي غير مُسكت
 */
export async function initVoting(roomId: string): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const alive = getAlivePlayers(state);

  // استخراج أهداف الاتفاقيات لإخفاء كروتهم العادية
  const dealTargets = state.votingState.deals.map(d => d.targetPhysicalId);

  // تحويل الاتفاقيات المُجهزة إلى مرشحين للتصويت
  const dealCandidates: Candidate[] = state.votingState.deals.map(d => ({
    type: CandidateType.DEAL as const,
    id: d.id,
    initiatorPhysicalId: d.initiatorPhysicalId,
    targetPhysicalId: d.targetPhysicalId,
    votes: 0,
  }));

  // إنشاء كارت عادي لكل لاعب حي غير مستهدف باتفاقية
  // المسكت يظهر كمرشح (يمكن التصويت ضده) ويمكنه التصويت — فقط لا يتكلم في النقاش والتبرير
  const playerCandidates: Candidate[] = alive
    .filter(p => !dealTargets.includes(p.physicalId))
    .map(p => ({
      type: CandidateType.PLAYER as const,
      targetPhysicalId: p.physicalId,
      votes: 0,
    }));

  const allCandidates = [...dealCandidates, ...playerCandidates];

  const oldDuration = state.votingState?.durationSeconds;

  state.votingState = {
    totalVotesCast: 0,
    deals: state.votingState.deals, // نحتفظ بها لغايات المرجعية
    candidates: allCandidates,
    hiddenPlayersFromVoting: dealTargets,
    tieBreakerLevel: 0,
    playerVotes: {},
    leaderProxyVotes: {},
  };

  if (oldDuration) {
    state.votingState.durationSeconds = oldDuration;
    state.votingState.votingStartTime = Date.now();
  }

  // تصفير بيانات الجولة السابقة
  state.withdrawalState = null;
  state.justificationData = null;

  await setGameState(roomId, state);
  return state;
}

// ── تسجيل صوت ──────────────────────────────────

/**
 * تسجيل صوت (+1 أو -1)
 * - delta: +1 لإضافة صوت، -1 لإزالة صوت
 */
export async function castVote(
  roomId: string,
  candidateIndex: number,
  delta: 1 | -1
): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const candidate = state.votingState.candidates[candidateIndex];
  if (!candidate) throw new Error(`Candidate at index ${candidateIndex} not found`);

  // منع الأصوات السالبة
  if (candidate.votes + delta < 0) {
    throw new Error('Cannot have negative votes');
  }

  // منع تجاوز الحد الأقصى للأصوات
  // المسكت يمكنه التصويت — الحد = كل الأحياء
  if (delta === 1) {
    const maxVotes = getAlivePlayers(state).length;
    if (state.votingState.totalVotesCast >= maxVotes) {
      throw new Error('Maximum votes reached');
    }
  }

  candidate.votes += delta;
  state.votingState.totalVotesCast += delta;

  await setGameState(roomId, state);
  return state;
}

// ── إلغاء الحصر يدوياً (الليدر يقرر) ──────────────
/**
 * إلغاء حصر التصويت والعودة لجميع المرشحين الأحياء
 * يُستدعى يدوياً من الليدر عبر day:un-narrow
 */
export async function unNarrowVoting(roomId: string): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  if (state.votingState.tieBreakerLevel < 1) {
    throw new Error('Voting is not in tiebreaker mode');
  }

  const alive = getAlivePlayers(state);
  const dealTargets = state.votingState.deals?.map((d: any) => d.targetPhysicalId) || [];

  // إعادة بناء المرشحين من الاتفاقيات
  const dealCandidates: Candidate[] = (state.votingState.deals || []).map((d: any) => ({
    type: CandidateType.DEAL as const,
    id: d.id,
    initiatorPhysicalId: d.initiatorPhysicalId,
    targetPhysicalId: d.targetPhysicalId,
    votes: 0,
  }));

  // إعادة بناء مرشحين عاديين (أحياء، غير مستهدفين باتفاقية)
  const playerCandidates: Candidate[] = alive
    .filter(p => !dealTargets.includes(p.physicalId))
    .map(p => ({
      type: CandidateType.PLAYER as const,
      targetPhysicalId: p.physicalId,
      votes: 0,
    }));

  state.votingState.candidates = [...dealCandidates, ...playerCandidates];
  state.votingState.totalVotesCast = 0;
  state.votingState.tieBreakerLevel = 0;
  state.votingState.playerVotes = {};
  state.votingState.leaderProxyVotes = {};

  if (state.votingState.durationSeconds) {
    state.votingState.votingStartTime = Date.now();
  }

  // مسح بيانات الجولة السابقة
  state.withdrawalState = null;
  state.justificationData = null;

  await setGameState(roomId, state);
  return state;
}

// ── فحص اكتمال التصويت ──────────────────────────

/**
 * الإقفال الآلي: عندما (مجموع الأصوات == عدد الأحياء)
 * المسكت يصوت — لذا الحد = كل الأحياء
 */
export function isVotingComplete(state: GameState): boolean {
  const aliveCount = getAlivePlayers(state).length;
  return state.votingState.totalVotesCast >= aliveCount;
}

// ── فرز نتائج التصويت (بدون إقصاء) ──────────────

/**
 * فرز النتائج فقط — بدون تغيير أي حالة أو إقصاء.
 * تُستخدم لتحديد المتهم/المتعادلين لمرحلة التبرير.
 */
export interface VoteSortResult {
  type: 'SINGLE_WINNER' | 'TIE';
  topCandidates: Candidate[];     // المرشح الفائز أو المتعادلين
  topVotes: number;
}

export async function getVoteResult(roomId: string): Promise<VoteSortResult> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  const sorted = [...state.votingState.candidates].sort((a, b) => b.votes - a.votes);

  if (sorted.length === 0) {
    return { type: 'TIE', topCandidates: [], topVotes: 0 };
  }

  const topVotes = sorted[0].votes;
  const tied = sorted.filter(c => c.votes === topVotes);

  if (tied.length > 1) {
    return { type: 'TIE', topCandidates: tied, topVotes };
  }

  return { type: 'SINGLE_WINNER', topCandidates: [sorted[0]], topVotes };
}

// ── حسم النتيجة (مع إقصاء فعلي) ──────────────────

export interface VoteResolution {
  type: 'ELIMINATION' | 'DEAL_ELIMINATION' | 'TIE';
  eliminated: number[];        // physicalIds المقصيين
  revealedRoles: { physicalId: number; role: string }[];
  winResult: WinResult;
  tiedCandidates?: Candidate[]; // في حال التعادل
}

/**
 * حسم نتيجة التصويت
 */
export async function resolveVoting(roomId: string): Promise<VoteResolution> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  // ترتيب المرشحين حسب الأصوات (تنازلي)
  const sorted = [...state.votingState.candidates].sort((a, b) => b.votes - a.votes);

  if (sorted.length === 0) {
    return { type: 'TIE', eliminated: [], revealedRoles: [], winResult: WinResult.GAME_CONTINUES };
  }

  const topVotes = sorted[0].votes;
  const tied = sorted.filter(c => c.votes === topVotes);

  // ── حالة التعادل ──
  if (tied.length > 1) {
    return {
      type: 'TIE',
      eliminated: [],
      revealedRoles: [],
      winResult: WinResult.GAME_CONTINUES,
      tiedCandidates: tied,
    };
  }

  // ── فوز مرشح واحد ──
  const winner = sorted[0];
  const eliminated: number[] = [];
  const revealedRoles: { physicalId: number; role: string }[] = [];

  if (winner.type === CandidateType.PLAYER) {
    // فوز لاعب عادي: يُقصى وتكشف هويته
    const player = state.players.find(p => p.physicalId === winner.targetPhysicalId);
    if (player) {
      player.isAlive = false;
      eliminated.push(player.physicalId);
      revealedRoles.push({ physicalId: player.physicalId, role: player.role || 'UNKNOWN' });
      checkPolicewomanTrigger(state, player.physicalId);

      // ── تتبع الإقصاء ──
      if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
      state.performanceTracking.eliminationLog.push({
        physicalId: player.physicalId,
        eliminatedBy: 'DAY_VOTE',
        round: state.round || 1,
        team: (player.role && isMafiaRole(player.role)) ? 'MAFIA' : 'CITIZEN',
      });

      // 💣 قدرة القنبلة — إذا المُقصى شيخ المافيا بالتصويت + القنبلة مفعلة
      if (player.role === 'GODFATHER' && state.config.bombEnabled !== false) {
        const gfId = player.physicalId;
        // اللاعبون الأحياء (بعد إقصاء شيخ المافيا) مرتبين بالرقم
        const alive = state.players
          .filter(p => p.isAlive && p.physicalId !== gfId)
          .sort((a, b) => a.physicalId - b.physicalId);

        if (alive.length > 0) {
          // أول لاعب حي رقمه أعلى (مع التفاف دائري)
          let abovePlayer = alive.find(p => p.physicalId > gfId);
          if (!abovePlayer) abovePlayer = alive[0]; // التفاف → أصغر رقم

          // أول لاعب حي رقمه أقل (مع التفاف دائري)
          let belowPlayer = [...alive].reverse().find(p => p.physicalId < gfId);
          if (!belowPlayer) belowPlayer = alive[alive.length - 1]; // التفاف → أكبر رقم

          // تجنب التكرار إذا لاعب واحد فقط
          const above = abovePlayer ? { physicalId: abovePlayer.physicalId, name: abovePlayer.name, role: abovePlayer.role || 'UNKNOWN' } : null;
          const below = belowPlayer && belowPlayer.physicalId !== abovePlayer?.physicalId
            ? { physicalId: belowPlayer.physicalId, name: belowPlayer.name, role: belowPlayer.role || 'UNKNOWN' }
            : null;

          state.pendingBomb = {
            godfatherPhysicalId: gfId,
            godfatherPlayerId: player.playerId || null,
            above,
            below,
          };
          console.log(`💣 Bomb ability triggered for Godfather #${gfId} — above: ${above?.physicalId || 'none'}, below: ${below?.physicalId || 'none'}`);
        }
      }
    }
  } else if (winner.type === CandidateType.DEAL) {
    // فوز اتفاقية
    const target = state.players.find(p => p.physicalId === winner.targetPhysicalId);
    const initiator = state.players.find(p => p.physicalId === winner.initiatorPhysicalId);

    if (target) {
      target.isAlive = false;
      eliminated.push(target.physicalId);
      revealedRoles.push({ physicalId: target.physicalId, role: target.role || 'UNKNOWN' });
      checkPolicewomanTrigger(state, target.physicalId);

      // إذا الدور غير معروف (null) → يُعامل كمواطن (الأسوأ للمُبادر)
      const targetIsMafia = target.role ? isMafiaRole(target.role) : false;
      const initiatorIsMafia = initiator && initiator.role ? isMafiaRole(initiator.role) : false;
      
      // الديل يعتبر ناجحاً ومستحقاً للنقاط فقط إذا كان المبادر (مواطن) وأخرج (مافيا).
      // إذا قام مافيا بعمل ديل على مافيا، فهو يعتبر ديل فاشل (لأنه أضر بفريقه) ولن يحصل على نقاط.
      const isSuccessfulDeal = !initiatorIsMafia && targetIsMafia;

      // ── تتبع نتيجة الاتفاقية ──
      if (!state.performanceTracking) state.performanceTracking = { dealOutcomes: [], abilityResults: [], eliminationLog: [] };
      state.performanceTracking.dealOutcomes.push({
        initiatorPhysicalId: winner.initiatorPhysicalId!,
        targetPhysicalId: winner.targetPhysicalId,
        targetRole: target.role || 'UNKNOWN',
        success: isSuccessfulDeal,
      });
      state.performanceTracking.eliminationLog.push({
        physicalId: target.physicalId,
        eliminatedBy: 'DEAL',
        round: state.round || 1,
        team: targetIsMafia ? 'MAFIA' : 'CITIZEN',
      });

      if (!targetIsMafia && initiator) {
        initiator.isAlive = false;
        eliminated.push(initiator.physicalId);
        checkPolicewomanTrigger(state, initiator.physicalId);
        revealedRoles.push({ physicalId: initiator.physicalId, role: initiator.role || 'UNKNOWN' });
        state.performanceTracking.eliminationLog.push({
          physicalId: initiator.physicalId,
          eliminatedBy: 'DEAL',
          round: state.round || 1,
          team: (initiator.role && isMafiaRole(initiator.role)) ? 'MAFIA' : 'CITIZEN',
        });
      }
    }
  }

  // فحص شرط الفوز بعد الإقصاء
  const winResult = checkWinCondition(state);
  if (winResult !== WinResult.GAME_CONTINUES) {
    state.winner = winResult === WinResult.MAFIA_WIN ? 'MAFIA' : 'CITIZEN';
  }

  await setGameState(roomId, state);

  return { type: winner.type === CandidateType.DEAL ? 'DEAL_ELIMINATION' : 'ELIMINATION', eliminated, revealedRoles, winResult };
}

// ── كسر التعادل ──────────────────────────────────

export enum TieBreakerAction {
  REVOTE = 'REVOTE',               // تصفير وإعادة
  NARROW = 'NARROW',               // حصر التصويت بين المتعادلين
  CANCEL = 'CANCEL',               // إلغاء التصويت
  ELIMINATE_ALL = 'ELIMINATE_ALL',  // إقصاء الجميع
}

export async function handleTieBreaker(
  roomId: string,
  action: TieBreakerAction,
  tiedCandidates?: Candidate[]
): Promise<GameState> {
  const state = await getGameState(roomId);
  if (!state) throw new Error(`Room ${roomId} not found`);

  switch (action) {
    case TieBreakerAction.REVOTE:
      // تصفير العدادات وإعادة الجولة لنفس الكروت
      state.votingState.totalVotesCast = 0;
      state.votingState.candidates.forEach(c => { c.votes = 0; });
      state.votingState.tieBreakerLevel = 1;
      state.votingState.playerVotes = {};
      state.votingState.leaderProxyVotes = {};
      if (state.votingState.durationSeconds) state.votingState.votingStartTime = Date.now();
      // مسح بيانات الجولة السابقة
      state.withdrawalState = null;
      state.justificationData = null;
      break;

    case TieBreakerAction.NARROW:
      // إخفاء الكل وإبقاء المتعادلين فقط
      if (tiedCandidates) {
        state.votingState.candidates = tiedCandidates.map(c => ({ ...c, votes: 0 }));
        state.votingState.totalVotesCast = 0;
        state.votingState.tieBreakerLevel = 2;
        state.votingState.playerVotes = {};
        state.votingState.leaderProxyVotes = {};
        if (state.votingState.durationSeconds) state.votingState.votingStartTime = Date.now();
        // مسح بيانات الجولة السابقة
        state.withdrawalState = null;
        state.justificationData = null;
      }
      break;

    case TieBreakerAction.CANCEL:
      // إلغاء التصويت بدون إقصاء
      state.votingState.totalVotesCast = 0;
      state.votingState.candidates = [];
      state.votingState.tieBreakerLevel = 0;
      state.votingState.playerVotes = {};
      state.votingState.leaderProxyVotes = {};
      // مسح بيانات الجولة السابقة
      state.withdrawalState = null;
      state.justificationData = null;
      break;

    case TieBreakerAction.ELIMINATE_ALL:
      // إقصاء جميع المتعادلين
      if (tiedCandidates) {
        for (const candidate of tiedCandidates) {
          const physicalId = candidate.type === CandidateType.DEAL
            ? candidate.targetPhysicalId
            : candidate.targetPhysicalId;
          const player = state.players.find(p => p.physicalId === physicalId);
          if (player) {
            player.isAlive = false;
            checkPolicewomanTrigger(state, physicalId);
          }
        }
      }
      state.votingState.tieBreakerLevel = 0;
      break;
  }

  await setGameState(roomId, state);
  return state;
}
