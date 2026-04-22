'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import MafiaCard from '@/components/MafiaCard';
import Image from 'next/image';

interface LeaderDayViewProps {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (err: string) => void;
}

// ═══════════════════════════════════════════════════════════
// 🗳️ VotingCard — Sub-component with smart gesture handling
// Tap = +1 vote | Double Tap = -1 vote | Swipe = Reveal 2s
// ═══════════════════════════════════════════════════════════

interface VotingCardProps {
  candidate: any;
  index: number;
  isDeal: boolean;
  targetDetails: any;
  initiatorDetails: any;
  isComplete: boolean;
  handleVote: (candidateIndex: number, delta: 1 | -1) => void;
  revealedRoles: Set<number>;
  setRevealedRoles: React.Dispatch<React.SetStateAction<Set<number>>>;
}

function VotingCard({ candidate, index, isDeal, targetDetails, initiatorDetails, isComplete, handleVote, revealedRoles, setRevealedRoles }: VotingCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tapCountRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isSwiping = useRef(false);
  const flipTimerRef = useRef<NodeJS.Timeout | null>(null);

  const physicalId = candidate.targetPhysicalId;

  // ── Tap / Double-Tap Logic ──
  const handleTapAction = useCallback(() => {
    tapCountRef.current += 1;

    if (tapCountRef.current === 1) {
      // First tap — wait 300ms to see if double-tap follows
      tapTimerRef.current = setTimeout(() => {
        if (tapCountRef.current === 1 && !isSwiping.current) {
          // Single tap confirmed → +1 vote
          if (!isComplete) {
            handleVote(index, 1);
          }
        }
        tapCountRef.current = 0;
      }, 300);
    } else if (tapCountRef.current === 2) {
      // Double tap confirmed → -1 vote
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapCountRef.current = 0;
      if (candidate.votes > 0) {
        handleVote(index, -1);
      }
    }
  }, [index, isComplete, candidate.votes, handleVote]);

  // ── Swipe → Reveal for 2 seconds ──
  const triggerReveal = useCallback(() => {
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    setIsFlipped(true);
    flipTimerRef.current = setTimeout(() => {
      setIsFlipped(false);
    }, 2000);
  }, []);

  // ── Pointer Events (works for both touch + mouse) ──
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    isSwiping.current = false;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;

    const deltaX = e.clientX - pointerStartRef.current.x;
    const deltaY = e.clientY - pointerStartRef.current.y;
    const elapsed = Date.now() - pointerStartRef.current.time;

    pointerStartRef.current = null;

    // Swipe detection: horizontal movement > 50px and more horizontal than vertical
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) && elapsed < 500) {
      isSwiping.current = true;
      triggerReveal();
      return;
    }

    // If not a swipe, treat as tap
    if (!isSwiping.current && Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15) {
      handleTapAction();
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    };
  }, []);

  return (
    <motion.div
      layout
      className="relative flex flex-col items-center"
      style={{ touchAction: 'pan-y' }}
    >
      {/* DEAL Badge */}
      {isDeal && (
        <div className="absolute -top-2 -right-2 z-20 bg-[#8A0303] text-white text-[8px] font-mono px-2 py-0.5 uppercase tracking-widest font-bold rounded-sm shadow-[0_0_10px_rgba(138,3,3,0.5)]">
          DEAL
        </div>
      )}

      {/* Vote Count Badge */}
      <div className={`absolute -top-2 -left-2 z-20 w-8 h-8 rounded-full flex items-center justify-center font-mono font-black text-sm shadow-lg ${
        candidate.votes > 0
          ? 'bg-[#C5A059] text-black border-2 border-[#C5A059]/80'
          : 'bg-[#1a1a1a] text-[#555] border border-[#333]'
      }`}>
        {candidate.votes}
      </div>

      {/* Linked Player (for Deals) */}
      {isDeal && initiatorDetails && (
        <div className="absolute -bottom-3 z-20 bg-[#110505] border border-[#8A0303]/50 text-[#8A0303] text-[8px] font-mono px-2 py-0.5 tracking-widest">
          ← #{initiatorDetails.physicalId}
        </div>
      )}

      {/* The MafiaCard itself — with gesture handlers */}
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="cursor-pointer select-none"
      >
        <MafiaCard
          playerNumber={physicalId}
          playerName={targetDetails?.name || 'Unknown'}
          role={targetDetails?.role || null}
          gender={targetDetails?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
          isFlipped={isFlipped}
          flippable={false}
          size="sm"
          isAlive={true}
          className={candidate.votes > 0 ? 'ring-2 ring-[#C5A059]/40' : ''}
        />
      </div>
    </motion.div>
  );
}

export default function LeaderDayView({ gameState, emit, setError }: LeaderDayViewProps) {
  const [loading, setLoading] = useState(false);
  const [dealInitiator, setDealInitiator] = useState<number | ''>('');
  const [dealTarget, setDealTarget] = useState<number | ''>('');
  
  const [startSpeakerId, setStartSpeakerId] = useState<number | ''>('');
  const [discussionTimeLimit, setDiscussionTimeLimit] = useState<number>(30);
  const [localTimeRemaining, setLocalTimeRemaining] = useState<number>(0);
  const [showDealsUI, setShowDealsUI] = useState(false);
  const [showNursePrompt, setShowNursePrompt] = useState(false);

  const localVoteTotalRef = useRef(0);
  const [revealedRoles, setRevealedRoles] = useState<Set<number>>(new Set());

  // Timer Tick Effect for Leader
  useEffect(() => {
    if (!gameState.discussionState || gameState.discussionState.status !== 'SPEAKING' || gameState.discussionState.startTime === null) {
      if (gameState.discussionState && gameState.discussionState.status !== 'SPEAKING') {
        setLocalTimeRemaining(gameState.discussionState.timeRemaining);
      }
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - gameState.discussionState.startTime) / 1000);
      const remaining = Math.max(0, gameState.discussionState.timeRemaining - elapsed);
      setLocalTimeRemaining(remaining);
    }, 100);
    return () => clearInterval(interval);
  }, [gameState.discussionState]);

  const alivePlayers = gameState.players.filter((p: any) => p.isAlive);
  const deals = gameState.votingState?.deals || [];
  const candidates = gameState.votingState?.candidates || [];
  const tiedCandidates = gameState.tiedCandidates || []; // Assuming stored here if TIE

  // ── 1. Deals Proposition ──
  const handleAddDeal = async () => {
    if (dealInitiator === '' || dealTarget === '') return;
    if (dealInitiator === dealTarget) {
      setError('لا يمكن للاعب إنشاء اتفاقية مع نفسه');
      return;
    }
    setLoading(true);
    try {
      await emit('day:create-deal', {
        roomId: gameState.roomId,
        initiatorPhysicalId: Number(dealInitiator),
        targetPhysicalId: Number(dealTarget),
      });
      setDealInitiator('');
      setDealTarget('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDeal = async (dealId: string) => {
    try {
      await emit('day:remove-deal', { roomId: gameState.roomId, dealId });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStartVoting = async () => {
    if (!confirm('هل أنت متأكد من بدء التصويت؟ لن تتمكن من تعديل الاتفاقيات.')) return;
    localVoteTotalRef.current = 0; // تصفير العداد المحلي عند بدء تصويت جديد
    try {
      await emit('day:start-voting', { roomId: gameState.roomId });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── 2. Live Voting ──
  const handleVote = async (candidateIndex: number, delta: 1 | -1) => {
    const candidate = candidates[candidateIndex];
    if (candidate.votes + delta < 0) return;

    const maxVotes = alivePlayers.length; // المسكت يصوت

    // فحص العداد المحلي المتزامن — يتحدث فوراً بدون انتظار السيرفر
    if (delta === 1 && localVoteTotalRef.current >= maxVotes) return;

    // تحديث العداد فوراً قبل الإرسال (synchronous)
    localVoteTotalRef.current += delta;

    try {
      await emit('day:cast-vote', { roomId: gameState.roomId, candidateIndex, delta });
    } catch (err: any) {
      // إرجاع العداد عند الفشل
      localVoteTotalRef.current -= delta;
      setError(err.message);
    }
  };

  const handleResolveVoting = async () => {
    try {
      await emit('day:resolve', { roomId: gameState.roomId });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── 3. Reveal ──
  const handleTriggerReveal = async () => {
    if (!gameState.pendingResolution) return;
    try {
      await emit('day:trigger-reveal', { roomId: gameState.roomId, result: gameState.pendingResolution });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── 4. Tie-Breaker ──
  const handleTieBreaker = async (action: string) => {
    try {
      // استخراج المتعادلين من بيانات التبرير (accused يحتوي على الكائنات الكاملة)
      const tiedCands = gameState.justificationData?.accused || gameState.justificationData?.candidates || [];
      
      // تصفير حالة التبرير عند إعادة التصويت
      setJustCurrentIdx(0);
      setJustTimerStarted(false);
      setJustAllDone(false);
      localVoteTotalRef.current = 0;

      await emit('day:tie-action', { roomId: gameState.roomId, action, tiedCandidates: tiedCands });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── 5. Justification ──
  const [justTimerDuration, setJustTimerDuration] = useState(30);
  const [justCurrentIdx, setJustCurrentIdx] = useState(0);
  const [justTimerStarted, setJustTimerStarted] = useState(false);
  const [justAllDone, setJustAllDone] = useState(false);

  const accused = gameState.justificationData?.accused || [];
  const canJustifyList = gameState.justificationData?.canJustifyList || accused;
  const allExhausted = gameState.justificationData?.allExhausted || false;
  const justResultType = gameState.justificationData?.resultType;
  const maxJustifications = gameState.justificationData?.maxJustifications || 2;

  // تصفير حالة التبرير عند استلام بيانات تبرير جديدة
  useEffect(() => {
    if (gameState.phase === 'DAY_JUSTIFICATION' && gameState.justificationData) {
      setJustCurrentIdx(0);
      setJustTimerStarted(false);
      setJustAllDone(false);
    }
  }, [gameState.justificationData]);

  const handleStartJustificationTimer = async (physicalId: number) => {
    setLoading(true);
    try {
      await emit('day:start-justification-timer', {
        roomId: gameState.roomId,
        physicalId,
        timeLimitSeconds: justTimerDuration,
      });
      setJustTimerStarted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetJustificationTimer = async (physicalId: number) => {
    try {
      await emit('day:reset-justification-timer', {
        roomId: gameState.roomId,
        physicalId,
        timeLimitSeconds: justTimerDuration,
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleNextAccused = async () => {
    // إيقاف التايمر في شاشة العرض
    try {
      await emit('day:stop-justification-timer', { roomId: gameState.roomId });
    } catch (_) {}

    if (justCurrentIdx < canJustifyList.length - 1) {
      setJustCurrentIdx(justCurrentIdx + 1);
      setJustTimerStarted(false);
    } else {
      setJustAllDone(true);
    }
  };

  const handleExecuteElimination = async () => {
    setLoading(true);
    try {
      await emit('day:execute-elimination', { roomId: gameState.roomId });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // RENDER DAY_JUSTIFICATION
  // ==========================================
  if (gameState.phase === 'DAY_JUSTIFICATION') {
    const isTie = justResultType === 'TIE';

    // إذا كل المتهمين استنفدوا فرصهم → مباشرة للقرار
    // أو إذا انتهت كل التبريرات
    const showDecision = allExhausted || justAllDone;

    // مرحلة التيمر والدفاع (فقط لمن يقدر يبرر)
    if (!showDecision && canJustifyList.length > 0) {
      const currentAccused = canJustifyList[justCurrentIdx];
      if (currentAccused) {
        const isMafiaRole = currentAccused.role?.includes('MAFIA') || currentAccused.role === 'GODFATHER' || currentAccused.role === 'SILENCER' || currentAccused.role === 'CHAMELEON';
        return (
          <div className="p-6">
            <div className="text-center mb-6 border-b border-[#2a2a2a] pb-4">
              <h2 className="text-2xl font-black text-[#C5A059] mb-2" style={{ fontFamily: 'Amiri, serif' }}>مرحلة التبرير</h2>
              <p className="text-[#808080] font-mono uppercase text-xs tracking-widest">
                {canJustifyList.length > 1
                  ? `DEFENDANTS: ${canJustifyList.length} • CURRENT: ${justCurrentIdx + 1}/${canJustifyList.length}`
                  : 'SINGLE ACCUSED • DEFENSE HEARING'}
              </p>
              {/* عرض المستنفدين إن وجدوا */}
              {accused.some((a: any) => !a.canJustify) && (
                <p className="text-[#8A0303] font-mono text-[10px] mt-2 tracking-widest">
                  ⚠ {accused.filter((a: any) => !a.canJustify).length} EXHAUSTED ({maxJustifications}/{maxJustifications} USED)
                </p>
              )}
            </div>

            {/* Accused Info */}
            <div className="noir-card p-6 border-[#C5A059]/40 mb-6">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-[#111] border-2 border-[#C5A059] rounded-full flex items-center justify-center text-4xl text-[#C5A059] font-mono font-black">
                  {currentAccused.targetPhysicalId}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white" style={{ fontFamily: 'Amiri, serif' }}>{currentAccused.name || 'Unknown'}</h3>
                  <p className="text-[#808080] text-xs font-mono tracking-widest uppercase">
                    VOTES: {gameState.justificationData?.topVotes} • DEFENSE {currentAccused.justificationCount}/{maxJustifications}
                  </p>
                  {currentAccused.role && (
                    <p className="mt-2 text-sm font-mono font-bold px-3 py-1 inline-block border rounded" style={{
                      color: isMafiaRole ? '#ff4444' : '#44ff44',
                      borderColor: isMafiaRole ? '#ff4444' : '#44ff44',
                    }}>
                      🔒 {currentAccused.role}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Timer Controls */}
            {!justTimerStarted ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-[#808080] mb-2 uppercase">Defense Time (وقت التبرير)</label>
                  <select
                    value={justTimerDuration}
                    onChange={e => setJustTimerDuration(Number(e.target.value))}
                    className="w-full p-3 bg-[#050505] border border-[#2a2a2a] text-white focus:border-[#C5A059] outline-none"
                  >
                    <option value={15}>15 ثانية</option>
                    <option value={30}>30 ثانية</option>
                    <option value={45}>45 ثانية</option>
                    <option value={60}>دقيقة كاملة</option>
                  </select>
                </div>
                <button
                  onClick={() => handleStartJustificationTimer(currentAccused.targetPhysicalId)}
                  disabled={loading}
                  className="w-full btn-premium py-4"
                >
                  <span className="text-white uppercase tracking-widest">▶ ابدأ تايمر التبرير</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="noir-card p-6 border-[#2a2a2a] text-center">
                  <p className="text-[#C5A059] font-mono text-sm uppercase tracking-widest mb-2">DEFENSE ACTIVE</p>
                  <p className="text-[#808080] font-mono text-xs">Timer running on display screen</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleResetJustificationTimer(currentAccused.targetPhysicalId)}
                    className="bg-[#111] border border-[#555] text-white py-4 hover:border-[#C5A059] font-mono tracking-widest uppercase text-sm"
                  >
                    🔄 إعادة التايمر
                  </button>
                  <button
                    onClick={handleNextAccused}
                    className="bg-[#111] border border-[#C5A059]/50 text-[#C5A059] py-4 hover:bg-[#C5A059]/10 font-mono tracking-widest uppercase text-sm"
                  >
                    {justCurrentIdx < canJustifyList.length - 1 ? `⏭ التالي (${justCurrentIdx + 2}/${canJustifyList.length})` : '✅ إنهاء التبريرات'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      }
    }

    // مرحلة القرار (بعد انتهاء كل التبريرات)
    return (
      <div className="p-6">
        <div className="text-center mb-8 border-b border-[#2a2a2a] pb-4">
          <h2 className="text-2xl font-black text-[#C5A059] mb-2" style={{ fontFamily: 'Amiri, serif' }}>انتهت التبريرات - اتخذ القرار</h2>
          <p className="text-[#808080] font-mono uppercase text-xs tracking-widest">ALL DEFENSES COMPLETE. RENDER YOUR VERDICT.</p>
        </div>

        {/* Show accused summary */}
        <div className="space-y-3 mb-8">
          {accused.map((acc: any) => (
            <div key={acc.targetPhysicalId} className="noir-card p-4 border-[#2a2a2a] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#111] border border-[#555] rounded-full flex items-center justify-center text-xl text-white font-mono font-black">
                  {acc.targetPhysicalId}
                </div>
                <div>
                  <p className="text-white font-bold">{acc.name}</p>
                  <p className="text-xs font-mono" style={{ color: acc.role?.includes('MAFIA') || acc.role === 'GODFATHER' || acc.role === 'SILENCER' || acc.role === 'CHAMELEON' ? '#ff4444' : '#44ff44' }}>
                    🔒 {acc.role || 'UNKNOWN'}
                  </p>
                </div>
              </div>
              <span className="text-[#C5A059] font-mono font-bold text-lg">{gameState.justificationData?.topVotes} أصوات</span>
            </div>
          ))}
        </div>

        {/* Decision Buttons */}
        {isTie ? (
          <div className="space-y-3">
            <button onClick={() => handleTieBreaker('REVOTE')} className="w-full noir-card p-4 text-white hover:border-[#C5A059] transition-colors text-center font-mono uppercase tracking-widest">
              🔁 إعادة التصويت (Revote)
            </button>
            <button onClick={() => handleTieBreaker('NARROW')} className="w-full noir-card p-4 text-white hover:border-[#C5A059] transition-colors text-center font-mono uppercase tracking-widest">
              🎯 حصر التصويت بين المتعادلين (Narrow)
            </button>
            <button onClick={() => handleTieBreaker('ELIMINATE_ALL')} className="w-full bg-[#8A0303]/20 border border-[#8A0303] p-4 text-[#8A0303] font-bold text-center font-mono uppercase tracking-widest hover:bg-[#8A0303]/40 transition-colors">
              💀 إقصاء جميع المتعادلين (Eliminate All)
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleExecuteElimination}
              disabled={loading}
              className="w-full bg-[#8A0303]/20 border-2 border-[#8A0303] text-white p-5 font-mono uppercase tracking-widest hover:bg-[#8A0303]/40 transition-colors text-xl font-black"
            >
              💀 تنفيذ الإقصاء (Execute Elimination)
            </button>
            <button
              onClick={() => handleTieBreaker('REVOTE')}
              disabled={loading}
              className="w-full bg-[#C5A059]/10 border-2 border-[#C5A059]/50 text-[#C5A059] p-5 font-mono uppercase tracking-widest hover:bg-[#C5A059]/20 transition-colors text-lg"
            >
              🔁 سحب الأصوات وإعادة التصويت (Revote)
            </button>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // RENDER PENDING REVEAL
  // ==========================================
  if (gameState.phase === 'DAY_RESOLUTION_PENDING') {
    const pending = gameState.pendingResolution;
    const eliminatedIds: number[] = pending?.eliminated || [];
    const pendingRolesArr = pending?.revealedRoles || [];
    const pendingRolesMap: Record<number, string> = {};
    pendingRolesArr.forEach((r: any) => { pendingRolesMap[r.physicalId] = r.role; });

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-2xl font-black text-[#8A0303] mb-2" style={{ fontFamily: 'Amiri, serif' }}>اكتمل التصويت وجاهز للحسم</h2>
        <p className="text-[#808080] font-mono uppercase tracking-widest text-[10px] mb-8">
          AWAITING DIRECTOR ORDER TO DECLASSIFY IDENTITIES...
        </p>

        {/* كروت المُقصَين — MafiaCard */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <p className="w-full text-center text-[#555] font-mono text-[10px] tracking-widest uppercase mb-2">🔒 LEADER EYES ONLY</p>
          {eliminatedIds.map((physicalId: number) => {
            const player = gameState.players.find((p: any) => p.physicalId === physicalId);
            const role = pendingRolesMap[physicalId] || player?.role || 'UNKNOWN';
            return (
              <MafiaCard
                key={physicalId}
                playerNumber={physicalId}
                playerName={player?.name || 'Unknown'}
                role={role}
                isFlipped={true}
                flippable={false}
                size="sm"
              />
            );
          })}
        </div>

        <button
          onClick={handleTriggerReveal}
          className="btn-premium px-12 py-5 !text-lg !border-[#8A0303] animate-pulse"
        >
          <span className="text-white">DECLASSIFY AND REVEAL IDENTITY 💀</span>
        </button>
        <p className="text-[#555] font-mono text-[9px] mt-3 tracking-widest">الضغط سيكشف الهوية لجميع اللاعبين</p>
      </div>
    );
  }

  // ==========================================
  // RENDER DAY_REVEALED (بعد كشف الهوية — قبل الليل)
  // ==========================================
  if (gameState.phase === 'DAY_REVEALED') {
    const revealed = gameState.revealedData;
    const eliminated = revealed?.eliminated || [];
    // revealedRoles is array of {physicalId, role} — convert to map
    const rolesArr = revealed?.revealedRoles || [];
    const revealedRolesData: Record<number, string> = {};
    rolesArr.forEach((r: any) => { revealedRolesData[r.physicalId] = r.role; });

    const handleStartNight = async () => {
      setLoading(true);
      try {
        const result = await emit('night:start', { roomId: gameState.roomId });
        if (result?.nurseAvailable) {
          setShowNursePrompt(true);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const handleNurseDecision = async (activate: boolean) => {
      setLoading(true);
      try {
        await emit('night:begin-queue', { roomId: gameState.roomId, activateNurse: activate });
        setShowNursePrompt(false);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // ── شاشة سؤال تفعيل الممرضة ──
    if (showNursePrompt) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="noir-card p-10 border-[#2E5C31] max-w-md w-full"
          >
            <div className="text-6xl mb-4">⚕️</div>
            <h2 className="text-2xl font-black text-[#2E5C31] mb-3" style={{ fontFamily: 'Amiri, serif' }}>
              الطبيب خارج اللعبة
            </h2>
            <p className="text-[#808080] font-mono uppercase text-xs tracking-widest mb-8">
              DOCTOR IS ELIMINATED • NURSE AVAILABLE FOR ACTIVATION
            </p>
            <p className="text-white text-lg mb-8">
              هل تريد تفعيل دور الممرضة كبديل للطبيب في هذا الليل؟
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleNurseDecision(true)}
                disabled={loading}
                className="bg-[#2E5C31]/20 border-2 border-[#2E5C31] text-[#2E5C31] p-4 font-bold text-lg hover:bg-[#2E5C31]/40 transition-colors"
              >
                ⚕️ تفعيل الممرضة
              </button>
              <button
                onClick={() => handleNurseDecision(false)}
                disabled={loading}
                className="bg-[#111] border-2 border-[#555] text-white p-4 font-bold text-lg hover:border-white transition-colors"
              >
                ❌ تخطي
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-8">
          <div className="text-6xl mb-4">💀</div>
          <h2 className="text-3xl font-black text-[#8A0303] mb-3" style={{ fontFamily: 'Amiri, serif' }}>تم كشف الهوية</h2>
          <p className="text-[#808080] font-mono uppercase tracking-widest text-xs">IDENTITY DECLASSIFIED • ELIMINATION COMPLETE</p>
        </div>

        {/* قائمة المُقصَين — MafiaCard */}
        <div className="flex flex-wrap justify-center gap-4 mb-10">
          {eliminated.map((physicalId: number) => {
            const player = gameState.players.find((p: any) => p.physicalId === physicalId);
            const role = revealedRolesData[physicalId];
            return (
              <MafiaCard
                key={physicalId}
                playerNumber={physicalId}
                playerName={player?.name || 'Unknown'}
                role={role}
                isFlipped={true}
                flippable={false}
                isAlive={false}
                size="md"
              />
            );
          })}
        </div>

        {/* زر بدء الليل أو عرض النتيجة */}
        {gameState.pendingWinner ? (
          <button
            onClick={async () => {
              setLoading(true);
              try {
                await emit('game:confirm-end', { roomId: gameState.roomId });
              } catch (err: any) {
                setError(err.message);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="btn-premium px-16 py-6 !text-xl !border-[#C5A059] group animate-pulse"
          >
            <span className="text-white group-hover:tracking-[0.3em] transition-all">
              🏁 عرض النتيجة على الشاشة
            </span>
          </button>
        ) : (
          <button
            onClick={handleStartNight}
            disabled={loading}
            className="btn-premium px-16 py-6 !text-xl !border-[#C5A059] group"
          >
            <span className="text-white group-hover:tracking-[0.3em] transition-all">🌙 بدء مرحلة الليل</span>
          </button>
        )}
        <p className="text-[#555] font-mono text-[10px] mt-4 tracking-widest uppercase">
          {gameState.pendingWinner ? 'BROADCAST WINNER TO DISPLAY' : 'COMMENCE NIGHTFALL OPERATIONS'}
        </p>
      </div>
    );
  }

  // ==========================================
  // RENDER TIE-BREAKER (fallback for old flow)
  // ==========================================
  if (gameState.phase === 'DAY_TIEBREAKER') {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-black text-[#C5A059] mb-4 text-center">حالة تعادل!</h2>
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <button onClick={() => handleTieBreaker('REVOTE')} className="noir-card p-4 text-white hover:border-[#C5A059]">إعادة تصويت</button>
          <button onClick={() => handleTieBreaker('NARROW')} className="noir-card p-4 text-white hover:border-[#C5A059]">حصر التصويت بالمتعادلين</button>
          <button onClick={() => handleTieBreaker('CANCEL')} className="noir-card p-4 text-[#8A0303] hover:border-[#8A0303]">إلغاء التصويت (الانتقال لليل)</button>
          <button onClick={() => handleTieBreaker('ELIMINATE_ALL')} className="bg-[#8A0303]/20 border border-[#8A0303] p-4 text-[#8A0303] font-bold">إقصاء جميع المتعادلين</button>
        </div>
      </div>
    );
  }



  // ==========================================
  // RENDER DAY_DISCUSSION
  // ==========================================
  if (gameState.phase === 'DAY_DISCUSSION') {
    const ds = gameState.discussionState;

    if (!ds) {
      // ── START NEW DISCUSSION ──
      return (
        <div className="flex flex-col items-center justify-center p-8">
          <h2 className="text-3xl font-black text-white mb-6" style={{ fontFamily: 'Amiri, serif' }}>بدء جولة النقاش</h2>
          
          <div className="w-full max-w-md space-y-6 noir-card p-6 border-[#2a2a2a]">
            <div>
              <label className="block text-xs font-mono text-[#808080] mb-2 uppercase">Who starts? (نقطة البداية)</label>
              <select
                value={startSpeakerId}
                onChange={(e) => setStartSpeakerId(e.target.value ? Number(e.target.value) : '')}
                className="w-full p-3 bg-[#050505] border border-[#2a2a2a] text-white focus:border-[#C5A059] outline-none"
              >
                <option value="">-- اختر لاعب للبدء منه --</option>
                {alivePlayers.map((p: any) => (
                  <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#808080] mb-2 uppercase">Time per player (الوقت)</label>
              <select
                value={discussionTimeLimit}
                onChange={(e) => setDiscussionTimeLimit(Number(e.target.value))}
                className="w-full p-3 bg-[#050505] border border-[#2a2a2a] text-white focus:border-[#C5A059] outline-none"
              >
                <option value="15">15 ثانية (للتجربة)</option>
                <option value="30">30 ثانية</option>
                <option value="45">45 ثانية</option>
                <option value="60">دقيقة كاملة</option>
                <option value="90">دقيقة ونصف</option>
              </select>
            </div>

            <button
              onClick={async () => {
                if (!startSpeakerId) return setError('يجب اختيار اللاعب الذي سيبدأ.');
                setLoading(true);
                try {
                  await emit('day:start-discussion', {
                    roomId: gameState.roomId,
                    startPhysicalId: startSpeakerId,
                    timeLimitSeconds: discussionTimeLimit,
                  });
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full btn-premium py-4"
            >
              <span className="text-white uppercase tracking-widest">{loading ? 'INITIALIZING...' : 'COMMENCE ROTATION'}</span>
            </button>
          </div>
        </div>
      );
    }

    if (!ds.isFinished) {
      // ── ACTIVE DISCUSSION CONTROL PANEL ──
      const activePlayer = alivePlayers.find((p: any) => p.physicalId === ds.currentSpeakerId);
      const isCurrentSilenced = activePlayer?.isSilenced === true;
      
      return (
        <div className="flex flex-col h-full bg-[#050505]">
          <div className="text-center pb-6 border-b border-[#2a2a2a] mb-6">
            <h2 className="text-2xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>وحدة تحكم النقاش</h2>
            <div className="flex justify-center gap-4 mt-2 font-mono text-xs text-[#555]">
              <span>REMAINING IN QUEUE: {ds.speakingQueue.length}</span>
              <span>ALREADY SPOKEN: {ds.hasSpoken.length}</span>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full px-4">
            {/* Current Player Status */}
            <div className={`w-full noir-card p-8 flex flex-col items-center gap-4 transition-all duration-300 ${isCurrentSilenced ? 'border-[#8A0303] bg-[#8A0303]/10' : ds.status === 'SPEAKING' ? 'border-[#C5A059] bg-[#C5A059]/5' : ds.status === 'PAUSED' ? 'border-[#8A0303] bg-[#8A0303]/5' : 'border-[#2a2a2a]'}`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl font-mono relative ${isCurrentSilenced ? 'bg-[#8A0303]/20 border-2 border-[#8A0303] text-[#8A0303]' : 'bg-[#111] border border-[#555] text-white'}`}>
                {ds.currentSpeakerId}
                {isCurrentSilenced && (
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#8A0303] rounded-full flex items-center justify-center text-white text-lg animate-pulse">
                    🔇
                  </div>
                )}
              </div>
              <p className="text-2xl text-white font-bold">{activePlayer?.name || 'مجهول'}</p>
              
              {/* تنبيه الإسكات */}
              {isCurrentSilenced && (
                <div className="w-full bg-[#8A0303]/20 border border-[#8A0303] text-[#ffccd5] p-3 text-center text-sm font-bold uppercase tracking-widest animate-pulse">
                  🔇 هذا اللاعب مُسكَت — اضغط START للتخطي
                </div>
              )}

              {!isCurrentSilenced && (
                <>
                  <div className="text-center mt-4">
                    <p className="font-mono text-xs text-[#808080] tracking-widest uppercase mb-1">Status</p>
                    <div className="text-lg font-mono font-bold">
                      {ds.status === 'WAITING' && <span className="text-yellow-500">AWAITING START</span>}
                      {ds.status === 'SPEAKING' && <span className="text-green-500">{localTimeRemaining > 0 ? 'LIVE (MIC OPEN)' : 'TIME EXPIRED'}</span>}
                      {ds.status === 'PAUSED' && <span className="text-[#8A0303]">PAUSED (MIC MUTED)</span>}
                    </div>
                  </div>
                  
                  <div className="text-center mt-4 border-t border-[#2a2a2a] pt-4 w-full">
                     <span className={`text-6xl font-black font-mono transition-colors duration-300 ${localTimeRemaining <= 10 && ds.status === 'SPEAKING' ? 'text-[#8A0303] animate-pulse' : 'text-white'}`}>
                       {localTimeRemaining}
                     </span>
                     <span className="text-sm text-[#808080] font-mono tracking-widest uppercase ml-2">SEC</span>
                  </div>
                </>
              )}
            </div>

            {/* Controls */}
            <div className="grid grid-cols-3 gap-3 w-full mt-8">
              {ds.status !== 'SPEAKING' ? (
                <button
                  onClick={async () => await emit('day:timer-action', { roomId: gameState.roomId, action: ds.status === 'WAITING' ? 'START' : 'RESUME' })}
                  className={`p-4 font-mono uppercase tracking-widest transition-colors text-sm border ${isCurrentSilenced ? 'bg-[#8A0303]/30 border-[#8A0303] text-[#ffccd5] hover:bg-[#8A0303]/50 animate-pulse' : 'bg-green-900 border-green-500 text-white hover:bg-green-800'}`}
                >
                  {isCurrentSilenced ? '🔇 SKIP' : `▶ ${ds.status === 'WAITING' ? 'START' : 'RESUME'}`}
                </button>
              ) : (
                <button
                  onClick={async () => await emit('day:timer-action', { roomId: gameState.roomId, action: 'PAUSE' })}
                  className="bg-[#8A0303]/20 border border-[#8A0303] text-[#8A0303] p-4 font-mono uppercase tracking-widest hover:bg-[#8A0303]/40 transition-colors text-sm"
                >
                  ⏸ PAUSE
                </button>
              )}

              <button
                onClick={async () => await emit('day:timer-action', { roomId: gameState.roomId, action: 'RESET' })}
                className="bg-[#111] border border-[#555] text-white p-4 font-mono uppercase tracking-widest hover:border-[#C5A059] transition-colors text-sm"
              >
                🔄 RESET
              </button>

              <button
                onClick={async () => {
                  try {
                    await emit('day:next-speaker', { roomId: gameState.roomId });
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
                className={`p-4 font-mono uppercase tracking-widest transition-colors border text-sm ${
                  localTimeRemaining <= 0 && ds.status !== 'WAITING'
                    ? 'bg-[#8A0303] text-white border-[#ffccd5] animate-pulse shadow-[0_0_20px_rgba(138,3,3,0.8)]'
                    : 'bg-[#111] border-[#555] text-white hover:border-white'
                }`}
              >
                ⏭ NEXT
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!showDealsUI) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center h-[50vh]">
          <h2 className="text-3xl font-black text-white mb-6" style={{ fontFamily: 'Amiri, serif' }}>انتهت جولة النقاش</h2>
          <p className="text-[#808080] font-mono uppercase tracking-widest text-sm mb-12">
            ALL ROTATIONS COMPLETE. ANY DEALS ESTABLISHED?
          </p>
          <div className="flex gap-6">
            <button
              onClick={() => setShowDealsUI(true)}
              className="btn-premium px-12 py-4"
            >
              <span className="text-white">YES - REGISTER DEALS</span>
            </button>
            <button
              onClick={async () => {
                try {
                  await emit('day:start-voting', { roomId: gameState.roomId });
                } catch (err: any) {
                  setError(err.message);
                }
              }}
              className="px-12 py-4 border border-[#8A0303] text-[#8A0303] hover:bg-[#8A0303]/10 font-mono tracking-widest uppercase transition-colors"
            >
              NO - SKIP TO VOTING
            </button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-mono text-[#555] uppercase tracking-widest">DEAL REGISTRATION</h2>
          <button onClick={() => setShowDealsUI(false)} className="text-[#808080] text-xs font-mono uppercase hover:text-white pb-1 border-b border-[#2a2a2a]">&lt; CANCEL</button>
        </div>
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          
          {/* Create Deal Panel */}
          <div className="noir-card p-6 border-[#2a2a2a]">
            <h3 className="text-lg font-mono text-[#555] uppercase tracking-widest mb-4 border-b border-[#2a2a2a] pb-2">Establish Deal</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#808080] mb-2 uppercase">Initiator (المُبادر)</label>
                <select
                  value={dealInitiator}
                  onChange={(e) => setDealInitiator(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-3 bg-[#050505] border border-[#2a2a2a] text-white focus:border-[#C5A059] outline-none"
                >
                  <option value="">-- اختر اللاعب --</option>
                  {alivePlayers.map((p: any) => (
                    <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-[#808080] mb-2 uppercase">Target (المُستهدف)</label>
                <select
                  value={dealTarget}
                  onChange={(e) => setDealTarget(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-3 bg-[#050505] border border-[#2a2a2a] text-white focus:border-[#C5A059] outline-none"
                >
                  <option value="">-- اختر المستهدف --</option>
                  {alivePlayers.filter((p: any) => p.physicalId !== Number(dealInitiator)).map((p: any) => (
                    <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddDeal}
                disabled={loading || !dealInitiator || !dealTarget}
                className="w-full bg-[#111] border border-[#C5A059]/50 text-[#C5A059] py-3 mt-2 hover:bg-[#C5A059]/10 disabled:opacity-50 transition-colors font-mono tracking-widest uppercase text-sm"
              >
                + Register Deal
              </button>
            </div>
          </div>

          {/* Active Deals List */}
          <div className="noir-card p-6 border-[#2a2a2a]">
            <h3 className="text-lg font-mono text-[#555] uppercase tracking-widest mb-4 border-b border-[#2a2a2a] pb-2">Active Deals</h3>
            {deals.length === 0 ? (
              <p className="text-[#555] text-sm font-mono p-4 text-center">NO DEALS REGISTERED.</p>
            ) : (
              <div className="space-y-3">
                {deals.map((deal: any) => {
                  const initiator = alivePlayers.find((p: any) => p.physicalId === deal.initiatorPhysicalId);
                  const target = alivePlayers.find((p: any) => p.physicalId === deal.targetPhysicalId);
                  return (
                    <div key={deal.id} className="bg-[#050505] border border-[#2a2a2a] p-3 flex justify-between items-center group hover:border-[#8A0303]/40 transition-colors">
                      <div className="font-mono text-sm">
                        <span className="text-white">#{deal.initiatorPhysicalId} {initiator?.name}</span>
                        <span className="text-[#555] mx-2">TIES TO</span>
                        <span className="text-[#8A0303]">#{deal.targetPhysicalId} {target?.name}</span>
                      </div>
                      <button onClick={() => handleRemoveDeal(deal.id)} className="text-[#555] hover:text-[#8A0303] text-lg leading-none">&times;</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-12">
          <button onClick={handleStartVoting} className="btn-premium px-12 py-4">
            <span className="text-white">LOCK DEALS & COMMENCE VOTING</span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER DAY_VOTING (Live Vote Collection)
  // ==========================================
  if (gameState.phase === 'DAY_VOTING') {
    // حساب مجموع الأصوات
    const totalVotes = candidates.reduce((sum: number, c: any) => sum + c.votes, 0);
    const votingAliveCount = alivePlayers.length;
    const isComplete = totalVotes >= votingAliveCount;

    // عداد الفرق
    const citizenCount = alivePlayers.filter((p: any) => !['GODFATHER','SILENCER','CHAMELEON','MAFIA_REGULAR'].includes(p.role)).length;
    const mafiaCount = alivePlayers.filter((p: any) => ['GODFATHER','SILENCER','CHAMELEON','MAFIA_REGULAR'].includes(p.role)).length;

    // حالة التصويت (عادي / إعادة / حسم)
    const votingLabel = gameState.votingState?.tieBreakerLevel >= 2 ? 'NARROWED' 
      : gameState.votingState?.tieBreakerLevel === 1 ? 'REVOTE' : 'LIVE';
    const votingColor = votingLabel === 'NARROWED' ? 'text-[#ff4444]' 
      : votingLabel === 'REVOTE' ? 'text-[#C5A059]' : 'text-white';

    return (
      <div className="flex flex-col h-full">
        {/* ═══ Voting Info Bar (no logo — parent has it) ═══ */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a2a] bg-[#0a0a0a]/80">
          {/* Team Counts */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">🏛</span>
              <span className="text-xs font-mono font-bold text-[#44ff44]">{citizenCount}</span>
              <span className="text-[9px] text-[#555] font-mono">مواطن</span>
            </div>
            <span className="text-[#2a2a2a]">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]">🎭</span>
              <span className="text-xs font-mono font-bold text-[#ff4444]">{mafiaCount}</span>
              <span className="text-[9px] text-[#555] font-mono">مافيا</span>
            </div>
          </div>

          {/* Voting Status + Counter */}
          <div className="flex items-center gap-3">
            {votingLabel !== 'LIVE' && (
              <span className={`px-2 py-0.5 border text-[8px] font-mono tracking-widest uppercase animate-pulse ${
                votingLabel === 'NARROWED' ? 'bg-[#8A0303]/20 border-[#8A0303] text-[#ff4444]' : 'bg-[#C5A059]/10 border-[#C5A059]/50 text-[#C5A059]'
              }`}>{votingLabel}</span>
            )}
            <div className="text-right">
              <p className="text-[8px] font-mono text-[#555] uppercase tracking-widest">VOTES</p>
              <p className={`text-lg font-black font-mono leading-none ${isComplete ? 'text-[#C5A059]' : 'text-white'}`}>
                {totalVotes}<span className="text-xs text-[#555]">/{votingAliveCount}</span>
              </p>
            </div>
          </div>
        </div>

        {/* ═══ Card Instructions ═══ */}
        <div className="text-center py-2 border-b border-[#1a1a1a]">
          <p className="text-[9px] font-mono text-[#555] tracking-widest">
            TAP = +1 &nbsp;•&nbsp; DOUBLE TAP = -1 &nbsp;•&nbsp; SWIPE = REVEAL
          </p>
        </div>

        {/* ═══ Candidate Cards Grid ═══ */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="flex flex-wrap justify-center gap-4">
            {candidates.map((candidate: any, index: number) => {
              const isDeal = candidate.type === 'DEAL';
              const targetDetails = alivePlayers.find((p: any) => p.physicalId === candidate.targetPhysicalId);
              const initiatorDetails = isDeal ? alivePlayers.find((p: any) => p.physicalId === candidate.initiatorPhysicalId) : null;

              return (
                <VotingCard
                  key={`${candidate.targetPhysicalId}-${gameState.votingState?.tieBreakerLevel || 0}`}
                  candidate={candidate}
                  index={index}
                  isDeal={isDeal}
                  targetDetails={targetDetails}
                  initiatorDetails={initiatorDetails}
                  isComplete={isComplete}
                  handleVote={handleVote}
                  revealedRoles={revealedRoles}
                  setRevealedRoles={setRevealedRoles}
                />
              );
            })}
          </div>
        </div>

        {/* ═══ Resolve Button + Un-Narrow ═══ */}
        <div className="text-center py-4 border-t border-[#2a2a2a] bg-[#050505]/80 backdrop-blur-sm space-y-3">
          <button
            onClick={handleResolveVoting}
            disabled={!isComplete}
            className={`btn-premium px-12 py-4 ${isComplete ? '!border-[#C5A059]' : '!border-[#2a2a2a] grayscale opacity-50'}`}
          >
            <span className="text-white tracking-widest font-mono uppercase text-sm">RESOLVE SELECTION</span>
          </button>

          {/* زر العودة للتصويت العادي — يظهر عند الحصر أو إعادة التصويت */}
          {votingLabel !== 'LIVE' && (
            <button
              onClick={async () => {
                try {
                  await emit('day:un-narrow', { roomId: gameState.roomId });
                } catch (err: any) {
                  setError(err.message);
                }
              }}
              className="w-full bg-[#111] border border-[#C5A059]/50 text-[#C5A059] py-3 font-mono uppercase tracking-widest text-xs hover:bg-[#C5A059]/10 transition-colors"
            >
              🔓 العودة للتصويت العادي (Un-narrow)
            </button>
          )}
        </div>
      </div>
    );
  }

  return <div className="text-[#555] font-mono p-4">UNKNOWN SUB-PHASE: {gameState.phase}</div>;
}
