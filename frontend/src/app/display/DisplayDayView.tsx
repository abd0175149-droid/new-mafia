'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket } from '@/lib/socket';
import MafiaCard from '@/components/MafiaCard';
import CircularTimer from '@/components/CircularTimer';
import Image from 'next/image';

const playAudioBeep = (type: 'tick' | 'buzzer') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    if (type === 'tick') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } else {
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.8);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.8);
    }
  } catch(e) {}
};

const playVoteSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch(e) {}
};

const playShiftSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch(e) {}
};

// ── مؤثرات صوتية للكشف عن الهوية ──
const playDrumroll = () => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // طبول متسارعة
    for (let i = 0; i < 12; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80 + i * 8, ctx.currentTime + i * 0.1);
      g.gain.setValueAtTime(0.15 + i * 0.02, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.08);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.08);
    }
  } catch(e) {}
};

const playRevealMafia = () => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // صوت مهيب — نغمة هابطة مع تشويه
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 1.2);
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.2);
    // ضربة ثانية
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(60, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.8);
    g2.gain.setValueAtTime(0.2, ctx.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.start(); osc2.stop(ctx.currentTime + 0.8);
  } catch(e) {}
};

const playRevealCitizen = () => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // صوت حزين — نغمة هابطة ناعمة
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 1.0);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.0);
    // نغمة ثانية متأخرة
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(330, ctx.currentTime + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(165, ctx.currentTime + 1.2);
    g2.gain.setValueAtTime(0.2, ctx.currentTime + 0.3);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.3); osc2.stop(ctx.currentTime + 1.2);
  } catch(e) {}
};

const playImpactBoom = () => {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
    g.gain.setValueAtTime(0.6, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
};

interface DisplayDayViewProps {
  roomId: string;
  players: any[]; // Roster to get names
  initialDiscussionState?: any;
  teamCounts?: {citizenAlive: number; mafiaAlive: number};
}

export default function DisplayDayView({ roomId, players, initialDiscussionState, teamCounts }: DisplayDayViewProps) {
  const [phase, setPhase] = useState<'DISCUSSION' | 'VOTING' | 'JUSTIFICATION' | 'PENDING' | 'REVEALED' | 'TIE'>('DISCUSSION');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [totalVotesCast, setTotalVotesCast] = useState(0);
  const [tieBreakerLevel, setTieBreakerLevel] = useState(0);
  const [localTeamCounts, setLocalTeamCounts] = useState<{citizenAlive: number; mafiaAlive: number} | null>(null);

  // استخدام القيمة المحلية أولاً، ثم الـ prop كـ fallback
  const effectiveTeamCounts = localTeamCounts || teamCounts;


  // Resolution UI States
  const [eliminatedIds, setEliminatedIds] = useState<number[]>([]);
  const [revealedRoles, setRevealedRoles] = useState<any[]>([]);
  const [revealType, setRevealType] = useState<string>('');

  // Justification UI States
  const [justificationData, setJustificationData] = useState<any>(null);
  const [justTimer, setJustTimer] = useState<{physicalId: number; timeLimitSeconds: number; startTime: number} | null>(null);
  const [justTimeRemaining, setJustTimeRemaining] = useState(0);

  // Discussion UI States
  const [discussionState, setDiscussionState] = useState<any>(initialDiscussionState || null);
  const [silencedPlayerId, setSilencedPlayerId] = useState<number | null>(null);
  const [localTimeRemaining, setLocalTimeRemaining] = useState<number>(initialDiscussionState?.timeRemaining || 0);
  const prevTimeRef = useRef<number>(initialDiscussionState?.timeRemaining || 0);

  // ═══════════════════════════════════════════════════════════
  // 🎥 Cinematic Camera — Dynamic Scale + Fixed Target Position
  // ═══════════════════════════════════════════════════════════
  // Strategy:
  //   1. Scale factor (S) is calculated dynamically so the card ALWAYS
  //      appears at ~75% of viewport height, regardless of its original size
  //   2. Target screen position is FIXED (38% or 62% horizontally, 50% vertically)
  //   3. Translation is computed to land the card exactly at that fixed spot
  // ═══════════════════════════════════════════════════════════

  const containerRef = useRef<HTMLDivElement>(null);
  const [boardPan, setBoardPan] = useState({ x: 0, y: 0 });
  const [timerPos, setTimerPos] = useState<'left' | 'right'>('right');
  const [zoomScale, setZoomScale] = useState(1);

  // Store parent's natural screen center (captured when scale=1, no speaker)
  const naturalParentPos = useRef<{ cx: number; cy: number } | null>(null);

  // Capture the grid container's natural screen position while at rest
  useEffect(() => {
    if (!discussionState?.currentSpeakerId && containerRef.current) {
      const timer = setTimeout(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          naturalParentPos.current = {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
          };
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [discussionState?.currentSpeakerId, players.length, phase]);

  // Calculate zoom + pan when speaker changes
  useEffect(() => {
    if (discussionState && discussionState.currentSpeakerId) {
      setTimeout(() => {
        const el = document.getElementById(`speaker-card-${discussionState.currentSpeakerId}`);
        const parent = containerRef.current;
        if (el && parent) {
          // ── Dynamic Scale Factor ──
          // Card always fills 75% of viewport height after zoom
          const targetHeight = window.innerHeight * 0.75;
          let S = targetHeight / el.offsetHeight;
          // Protect width: card must not exceed 42% of viewport width (space for timer)
          S = Math.min(S, (window.innerWidth * 0.42) / el.offsetWidth);
          S = Math.max(S, 1.2); // Minimum zoom
          setZoomScale(S);

          // ── Card's Layout Center (pre-transform coordinates) ──
          const elCx = el.offsetLeft + el.offsetWidth / 2;
          const elCy = el.offsetTop + el.offsetHeight / 2;
          const pCx = parent.offsetWidth / 2;
          const pCy = parent.offsetHeight / 2;

          // ── Timer Side ──
          const isNativeLeft = elCx < pCx;
          setTimerPos(isNativeLeft ? 'right' : 'left');

          // ── Fixed Target Screen Positions ──
          // These are ABSOLUTE screen coordinates where the card center will ALWAYS land
          const targetScreenX = isNativeLeft
            ? window.innerWidth * 0.38   // Card left-third, timer on right
            : window.innerWidth * 0.62;  // Card right-third, timer on left
          const targetScreenY = window.innerHeight * 0.50; // Always vertically centered

          // ── Parent's Natural Screen Center (captured at rest) ──
          const pScreenCx = naturalParentPos.current?.cx ?? window.innerWidth / 2;
          const pScreenCy = naturalParentPos.current?.cy ?? window.innerHeight / 2;

          // ── Framer Motion Translation Math ──
          // After scale S around parent center with transformOrigin:center:
          //   screenX = parentScreenCx + (elCx - pCx) * S + translateX
          // Solving for translateX to hit our fixed target:
          const tx = targetScreenX - pScreenCx - (elCx - pCx) * S;
          const ty = targetScreenY - pScreenCy - (elCy - pCy) * S;

          setBoardPan({ x: tx, y: ty });
        }
      }, 150);
    } else {
      setBoardPan({ x: 0, y: 0 });
    }
  }, [discussionState?.currentSpeakerId, phase]);

  // Timer Tick Effect
  useEffect(() => {
    if (!discussionState || discussionState.status !== 'SPEAKING' || discussionState.startTime === null) {
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - discussionState.startTime) / 1000);
      const remaining = Math.max(0, discussionState.timeRemaining - elapsed);
      setLocalTimeRemaining(remaining);
      
      if (remaining !== prevTimeRef.current) {
        if (remaining <= 10 && remaining > 0) {
          playAudioBeep('tick');
        } else if (remaining === 0 && prevTimeRef.current > 0) {
          playAudioBeep('buzzer');
        }
        prevTimeRef.current = remaining;
      }
    }, 100); // 100ms for smoother updates if needed, though seconds suffice
    return () => clearInterval(interval);
  }, [discussionState]);

  // Justification Timer Tick Effect
  useEffect(() => {
    if (!justTimer) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - justTimer.startTime) / 1000);
      const remaining = Math.max(0, justTimer.timeLimitSeconds - elapsed);
      setJustTimeRemaining(remaining);
      if (remaining <= 10 && remaining > 0) playAudioBeep('tick');
      if (remaining === 0) { playAudioBeep('buzzer'); clearInterval(interval); }
    }, 200);
    return () => clearInterval(interval);
  }, [justTimer]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !roomId) return;

    const onVotingStarted = (data: any) => {
      setCandidates(data.candidates);
      setTotalVotesCast(0);
      setTieBreakerLevel(data.tieBreakerLevel || 0);
      // تحديث عدادات الفرق من البيانات القادمة من الباك اند
      if (data.teamCounts) {
        setLocalTeamCounts(data.teamCounts);
      }
      setPhase('VOTING');
    };

    const onVoteUpdate = (data: any) => {
      setCandidates(data.candidates);
      setTotalVotesCast(data.totalVotesCast);
      if (data.tieBreakerLevel !== undefined) {
        setTieBreakerLevel(data.tieBreakerLevel);
      }
    };

    const onPending = (data: any) => {
      setEliminatedIds(data.eliminated);
      setRevealType(data.type);
      setPhase('PENDING');
    };

    const onRevealed = (data: any) => {
      setEliminatedIds(data.eliminated);
      setRevealedRoles(data.revealedRoles);
      setRevealType(data.type);
      // تحديث عداد الفرق فقط بعد كشف الهوية — وليس قبلها
      if (data.teamCounts) {
        setLocalTeamCounts(data.teamCounts);
      }
      setPhase('REVEALED');
    };

    const onTie = () => {
      setPhase('TIE');
    };

    const onPhaseChanged = (data: any) => {
      if (data.phase === 'DAY_DISCUSSION') {
        setPhase('DISCUSSION');
        setCandidates([]);
      }
    };

    const onDiscussionUpdated = (data: { discussionState: any }) => {
      setDiscussionState(data.discussionState);
      setLocalTimeRemaining(data.discussionState.timeRemaining);
      // إخفاء أنيميشن الإسكات عند انتقال المتحدث (الليدر ضغط NEXT)
      setSilencedPlayerId(null);
    };

    const onShowSilenced = (data: { physicalId: number }) => {
      setSilencedPlayerId(data.physicalId);
      // يبقى ظاهراً حتى الليدر يضغط NEXT — يختفي عند تغيّر currentSpeakerId عبر discussion-updated
    };

    const onJustificationStarted = (data: any) => {
      setJustificationData(data);
      setJustTimer(null);
      setPhase('JUSTIFICATION');
    };

    const onJustificationTimerStarted = (data: any) => {
      setJustTimer(data);
      setJustTimeRemaining(data.timeLimitSeconds);
    };

    const onJustificationTimerStopped = () => {
      setJustTimer(null);
      setJustTimeRemaining(0);
    };



    socket.on('day:voting-started', onVotingStarted);
    socket.on('day:vote-update', onVoteUpdate);
    socket.on('day:elimination-pending', onPending);
    socket.on('day:elimination-revealed', onRevealed);
    socket.on('day:tie', onTie);
    socket.on('game:phase-changed', onPhaseChanged);
    socket.on('day:discussion-updated', onDiscussionUpdated);
    socket.on('day:show-silenced', onShowSilenced);
    socket.on('day:justification-started', onJustificationStarted);
    socket.on('day:justification-timer-started', onJustificationTimerStarted);
    socket.on('day:justification-timer-stopped', onJustificationTimerStopped);


    return () => {
      socket.off('day:voting-started', onVotingStarted);
      socket.off('day:vote-update', onVoteUpdate);
      socket.off('day:elimination-pending', onPending);
      socket.off('day:elimination-revealed', onRevealed);
      socket.off('day:tie', onTie);
      socket.off('game:phase-changed', onPhaseChanged);
      socket.off('day:discussion-updated', onDiscussionUpdated);
      socket.off('day:show-silenced', onShowSilenced);
      socket.off('day:justification-started', onJustificationStarted);
      socket.off('day:justification-timer-started', onJustificationTimerStarted);
      socket.off('day:justification-timer-stopped', onJustificationTimerStopped);

    };
  }, [roomId]);

  // المسكت يمكنه التصويت — لذا الحد = كل الأحياء
  const aliveCount = players.filter((p: any) => p.isAlive).length;

  // حجم ديناميكي للكروت — أكبر حجم ممكن يناسب الشاشة
  const getCardSize = (count: number): 'sm' | 'md' | 'lg' => {
    if (count <= 8) return 'lg';
    if (count <= 14) return 'md';
    return 'sm';
  };
  const discussionCardSize = getCardSize(aliveCount);
  const votingCardSize = getCardSize(candidates.length);

  const prevVotesRef = useRef(totalVotesCast);
  const sortedCandidates = [...candidates].sort((a,b) => b.votes - a.votes);
  const currentOrderStr = sortedCandidates.map(c => c.targetPhysicalId).join(',');
  const prevOrderRef = useRef(currentOrderStr);

  useEffect(() => {
    if (phase === 'VOTING') {
      if (totalVotesCast > prevVotesRef.current) {
        playVoteSound();
      }
      prevVotesRef.current = totalVotesCast;

      if (currentOrderStr !== prevOrderRef.current) {
        if (prevOrderRef.current) {
           playShiftSound();
        }
        prevOrderRef.current = currentOrderStr;
      }
    }
  }, [totalVotesCast, currentOrderStr, phase]);

  return (
    <div className="w-full mx-auto flex flex-col items-center justify-center px-4 py-2">
      <AnimatePresence mode="wait">
        
        {/* DISCUSSION AREA */}
        {phase === 'DISCUSSION' && (
          <motion.div
            key="discussion"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="text-center w-full"
          >
            {/* Silenced Animation Block — with Lottie */}
            <AnimatePresence>
              {silencedPlayerId && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-[#050505]/95 backdrop-blur-md"
                >
                  {/* Lottie Animation */}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="w-64 h-64 mb-6"
                  >
                    {/* @ts-ignore */}
                    <dotlottie-player
                      src="/animations/sound-off.lottie"
                      autoplay
                      loop
                      style={{ width: '100%', height: '100%' }}
                    />
                  </motion.div>

                  {/* Player Number Badge */}
                  <motion.div
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="w-24 h-24 bg-[#111] border-4 border-[#8A0303] text-[#8A0303] rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(138,3,3,0.5)] mb-6"
                  >
                    <span className="text-5xl font-black font-mono">{silencedPlayerId}</span>
                  </motion.div>

                  {/* Title */}
                  <motion.h2
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-5xl font-black text-[#8A0303] uppercase tracking-[0.2em] bg-black px-8 py-3 border-y-2 border-[#8A0303]"
                  >
                    SILENCED BY SYNDICATE
                  </motion.h2>

                  {/* Player Name */}
                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="mt-6 text-[#ffccd5] font-mono text-xl tracking-widest uppercase"
                  >
                    {players.find(p => p.physicalId === silencedPlayerId)?.name || 'UNKNOWN'} IS MUZZLED
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>

            {!silencedPlayerId && (
              <>
                {/* Discussion Header Bar — Logo left, Phase name right */}
                {!discussionState?.currentSpeakerId && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full flex items-center justify-between px-6 mb-3"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-lg font-black text-white tracking-wide" style={{ fontFamily: 'Amiri, serif' }}>مرحلة النقاش</span>
                      <span className="text-[10px] font-mono text-[#555] tracking-[0.3em] uppercase">DISCUSSION PHASE</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end leading-none">
                        <span className="text-xl font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 15px rgba(138,3,3,0.4)' }}>MAFIA</span>
                        <span className="flex justify-between w-full text-[10px] font-light text-[#8A0303] pr-0.5" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l, i) => <span key={i}>{l}</span>)}</span>
                      </div>
                      <Image src="/mafia_logo.png" alt="Mafia" width={36} height={36} className="w-[36px] h-[36px] drop-shadow-[0_0_12px_rgba(138,3,3,0.3)]" priority />
                    </div>
                  </motion.div>
                )}

                <div className="w-full flex justify-center items-center h-full overflow-visible">
                  {/* Cinematic Virtual Camera Wrapper */}
                  <motion.div 
                    ref={containerRef}
                    animate={{
                      scale: discussionState?.currentSpeakerId ? zoomScale : 1,
                      x: discussionState?.currentSpeakerId ? boardPan.x : 0,
                      y: discussionState?.currentSpeakerId ? boardPan.y : 0,
                    }}
                    transition={{ duration: 1.2, type: 'spring', damping: 25, stiffness: 100 }}
                    style={{ transformOrigin: 'center center' }}
                    className="flex flex-wrap justify-center items-center gap-6 md:gap-8 w-full max-w-[2000px] mx-auto px-4 pt-2 relative"
                  >
                    {players.map((p) => {
                      if (!p.isAlive) return null;
                      
                      const isSpeaker = p.physicalId === discussionState?.currentSpeakerId;
                      const isSomeoneSpeaking = !!discussionState?.currentSpeakerId;
                      
                      return (
                        <motion.div
                          key={p.physicalId}
                          id={`speaker-card-${p.physicalId}`}
                          animate={{ 
                            opacity: isSpeaker ? 1 : isSomeoneSpeaking ? 0.2 : 1,
                            scale: isSpeaker ? 1.05 : isSomeoneSpeaking ? 0.95 : 1,
                            filter: isSpeaker ? 'blur(0px) grayscale(0%)' : isSomeoneSpeaking ? 'blur(4px) grayscale(70%)' : 'blur(0px) grayscale(0%)',
                            zIndex: isSpeaker ? 50 : 10
                          }}
                          transition={{ duration: 0.8, ease: "easeInOut" }}
                          className="flex flex-col items-center relative"
                        >
                          {/* Spotlight Effect for Active Speaker */}
                          {isSpeaker && (
                            <div 
                              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[350px] bg-[#C5A059]/30 blur-[50px] rounded-full pointer-events-none -z-10"
                            />
                          )}

                          <MafiaCard
                            playerNumber={p.physicalId}
                            playerName={p.name}
                            role={null}
                            gender={p.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                            isFlipped={false}
                            flippable={false}
                            size={discussionCardSize}
                            isAlive={p.isAlive}
                            avatarUrl={p.avatarUrl}
                            className={isSpeaker ? 'shadow-[0_0_50px_rgba(197,160,89,0.4)] border-2 border-[#C5A059]' : ''}
                          />
                          
                          {/* Dynamic Timer Placement */}
                          {isSpeaker && discussionState && (
                              <motion.div 
                                initial={{ opacity: 0, x: timerPos === 'right' ? -40 : 40 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.5, duration: 0.5 }}
                                className={`absolute top-1/2 -translate-y-1/2 flex flex-col items-center justify-center ${timerPos === 'right' ? 'left-[130%]' : 'right-[130%]'}`}
                              >
                                <CircularTimer
                                  timeRemaining={localTimeRemaining}
                                  totalTime={discussionState.timeLimitSeconds}
                                  size={100}
                                  enableHeartbeat={discussionState.status === 'SPEAKING'}
                                  enableShake={discussionState.status === 'SPEAKING'}
                                />
                                <div className="mt-4 text-[7px] text-center whitespace-nowrap font-mono tracking-[0.3em] font-bold">
                                  {discussionState.status === 'WAITING' && <span className="text-yellow-500 animate-pulse">AWAITING COMMENCEMENT...</span>}
                                  {discussionState.status === 'SPEAKING' && <span className="text-[#C5A059]">FLOOR IS OPEN</span>}
                                  {discussionState.status === 'PAUSED' && <span className="text-[#8A0303] animate-pulse">FLOOR SUSPENDED</span>}
                                </div>
                              </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* VOTING ARENA */}
        {phase === 'VOTING' && (
          <motion.div
            key="voting"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="w-full"
          >
            <div className="w-full mb-8">
              {/* ── الهيدر الموحد: لوجو + اسم + معلومات الفرق + الأصوات ── */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] bg-black/40 backdrop-blur-sm rounded-t-xl">

                {/* يسار: اللوجو + الاسم + المرحلة */}
                <div className="flex items-center gap-4">
                  <Image src="/mafia_logo.png" alt="Mafia" width={44} height={44} className="w-[44px] h-[44px] drop-shadow-[0_0_15px_rgba(138,3,3,0.3)]" priority />
                  <div className="flex flex-col leading-none">
                    <span className="text-2xl font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>MAFIA</span>
                    <span className="flex justify-between w-full text-[8px] font-light text-[#8A0303]" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l, i) => <span key={i}>{l}</span>)}</span>
                  </div>
                  <div className="w-[1px] h-8 bg-[#2a2a2a] mx-2" />
                  <div className="flex flex-col">
                    {tieBreakerLevel >= 2 ? (
                      <>
                        <span className="text-lg font-black text-[#8A0303]" style={{ fontFamily: 'Amiri, serif' }}>تصويت الحسم</span>
                        <span className="text-[8px] font-mono text-[#ff4444] tracking-[0.3em] uppercase animate-pulse">NARROWED VOTE</span>
                      </>
                    ) : tieBreakerLevel === 1 ? (
                      <>
                        <span className="text-lg font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>إعادة التصويت</span>
                        <span className="text-[8px] font-mono text-[#C5A059] tracking-[0.3em] uppercase">REVOTE</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>مرحلة التصويت</span>
                        <span className="text-[8px] font-mono text-[#808080] tracking-[0.3em] uppercase">VOTING PHASE</span>
                      </>
                    )}
                  </div>
                </div>

                {/* وسط: عدادات الفرق */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-[#44ff44] text-lg">🏛</span>
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] font-mono text-[#808080] uppercase tracking-widest">CITIZENS</span>
                      <span className="text-2xl font-mono font-black text-[#44ff44]">{effectiveTeamCounts?.citizenAlive ?? '?'}</span>
                    </div>
                  </div>
                  <div className="w-[1px] h-10 bg-[#2a2a2a]" />
                  <div className="flex items-center gap-2">
                    <span className="text-[#ff4444] text-lg">🎭</span>
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] font-mono text-[#808080] uppercase tracking-widest">MAFIA</span>
                      <span className="text-2xl font-mono font-black text-[#ff4444]">{effectiveTeamCounts?.mafiaAlive ?? '?'}</span>
                    </div>
                  </div>
                </div>

                {/* يمين: عداد الأصوات */}
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-mono text-[#808080] uppercase tracking-widest mb-1">VOTES</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-mono font-black text-[#C5A059]">{totalVotesCast}</span>
                    <span className="text-lg font-mono text-[#808080]">/</span>
                    <span className="text-lg font-mono text-white">{aliveCount}</span>
                  </div>
                  {totalVotesCast >= aliveCount && (
                    <span className="text-[8px] font-mono text-[#44ff44] tracking-widest uppercase mt-1 animate-pulse">COMPLETE ✓</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4 w-full">
              {sortedCandidates.map((candidate, idx) => {
                const isDeal = candidate.type === 'DEAL';
                const targetPlayer = players.find(p => p.physicalId === candidate.targetPhysicalId);
                const targetName = targetPlayer?.name || 'Unknown';
                const targetGender = targetPlayer?.gender;
                const maxVotes = sortedCandidates[0]?.votes || 1;
                const barWidth = candidate.votes > 0 ? (candidate.votes / maxVotes) * 100 : 0;
                const isFirst = idx === 0 && candidate.votes > 0;
                const fillBarColor = isDeal ? 'bg-[#8A0303]' : (isFirst ? 'bg-[#8A0303]' : 'bg-[#C5A059]');

                return (
                  <motion.div
                    layout
                    key={isDeal ? `deal-${candidate.id}` : `player-${candidate.targetPhysicalId}`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex flex-col items-center gap-2"
                  >
                    {/* ترتيب */}
                    <span className={`text-xs font-mono font-black tracking-widest ${isFirst ? 'text-[#8A0303] animate-pulse' : 'text-[#808080]'}`}>
                      #{idx + 1}
                    </span>

                    {/* الكارد */}
                    <div className={`relative ${isFirst ? 'ring-2 ring-[#8A0303] ring-offset-2 ring-offset-black rounded-2xl shadow-[0_0_30px_rgba(138,3,3,0.4)] animate-pulse' : ''}`}>
                      {isDeal && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[#8A0303] text-white text-[8px] font-mono px-3 py-0.5 font-bold tracking-widest rounded-full z-30 border border-[#ff4444]/50">
                          DEAL
                        </div>
                      )}
                      <MafiaCard
                        playerNumber={candidate.targetPhysicalId}
                        playerName={targetName}
                        role={null}
                        isFlipped={false}
                        flippable={false}
                        showVoting={true}
                        votes={candidate.votes}
                        gender={targetGender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                        size={votingCardSize}
                        isAlive={true}
                        avatarUrl={targetPlayer?.avatarUrl}
                      />
                    </div>

                    {/* شريط تقدم بارز تحت الكارد */}
                    <div className="w-full h-3 bg-[#0a0a0a] rounded-full overflow-hidden border border-[#1a1a1a]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ type: 'spring', damping: 15 }}
                        className={`h-full rounded-full ${fillBarColor} ${isFirst ? 'animate-pulse' : ''}`}
                        style={{
                          boxShadow: isFirst ? '0 0 10px rgba(138, 3, 3, 0.6)' : '0 0 6px rgba(197, 160, 89, 0.3)',
                        }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* JUSTIFICATION PHASE */}
        {phase === 'JUSTIFICATION' && justificationData && (
          <motion.div
            key="justification"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="w-full h-[calc(100vh-2rem)] flex flex-col items-center justify-center relative"
          >
            {/* ── كروت المتهمين أفقياً + تايمر ── */}
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 w-full max-w-[1600px] mx-auto px-4 relative">
              {justificationData.accused.map((acc: any, i: number) => {
                const p = players.find(pl => pl.physicalId === acc.targetPhysicalId);
                const isActiveJust = justTimer?.physicalId === acc.targetPhysicalId;
                const isSomeoneSpeaking = !!justTimer;
                // حساب موقع التايمر (يمين أو يسار حسب الترتيب)
                const timerSide = i === 0 ? 'left' : 'right';

                return (
                  <motion.div
                    key={acc.targetPhysicalId}
                    initial={{ opacity: 0, y: 40, scale: 0.8 }}
                    animate={{
                      opacity: isActiveJust ? 1 : isSomeoneSpeaking ? 0.25 : 1,
                      y: 0,
                      scale: isActiveJust ? 1.1 : isSomeoneSpeaking ? 0.95 : 1,
                      filter: isActiveJust ? 'blur(0px) grayscale(0%)' : isSomeoneSpeaking ? 'blur(3px) grayscale(60%)' : 'blur(0px) grayscale(0%)',
                    }}
                    transition={{ delay: 0.2 + i * 0.15, duration: 0.6, type: 'spring', damping: 15 }}
                    className="flex flex-col items-center relative"
                  >
                    {/* Spotlight — توهج خلفي للمتكلم النشط */}
                    {isActiveJust && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[400px] bg-[#C5A059]/25 blur-[60px] rounded-full pointer-events-none -z-10" />
                    )}

                    {/* الكارد */}
                    <div className={`relative transition-all duration-500 ${
                      isActiveJust
                        ? 'ring-4 ring-[#C5A059] ring-offset-4 ring-offset-black rounded-2xl shadow-[0_0_60px_rgba(197,160,89,0.4)]'
                        : ''
                    }`}>
                      <MafiaCard
                        playerNumber={acc.targetPhysicalId}
                        playerName={p?.name || 'Unknown'}
                        role={null}
                        isFlipped={false}
                        flippable={false}
                        gender={p?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                        size="lg"
                        isAlive={true}
                        avatarUrl={p?.avatarUrl}
                      />
                      {acc.type === 'DEAL' && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[#8A0303] text-white text-[8px] font-mono px-4 py-0.5 tracking-widest rounded-full z-30">DEAL</div>
                      )}
                    </div>

                    {/* Dynamic Timer — يظهر بجانب المتكلم النشط */}
                    {isActiveJust && justTimer && (
                      <motion.div
                        initial={{ opacity: 0, x: timerSide === 'right' ? -30 : 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        className={`absolute top-1/2 -translate-y-1/2 flex flex-col items-center ${
                          timerSide === 'right' ? 'left-[115%]' : 'right-[115%]'
                        }`}
                      >
                        <CircularTimer
                          timeRemaining={justTimeRemaining}
                          totalTime={justTimer.timeLimitSeconds}
                          size={120}
                          enableHeartbeat={true}
                          enableShake={true}
                        />
                        <motion.p
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="text-[#C5A059] text-[9px] font-mono tracking-[0.3em] uppercase mt-3"
                        >
                          🎙 DEFENDING
                        </motion.p>
                      </motion.div>
                    )}

                    {/* Time Expired */}
                    {isActiveJust && !justTimer && justTimeRemaining === 0 && isSomeoneSpeaking && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`absolute top-1/2 -translate-y-1/2 flex flex-col items-center ${
                          timerSide === 'right' ? 'left-[115%]' : 'right-[115%]'
                        }`}
                      >
                        <div className="w-[120px] h-[120px] rounded-full border-4 border-[#8A0303] flex items-center justify-center">
                          <span className="text-3xl font-mono font-black text-[#8A0303] animate-pulse">00</span>
                        </div>
                        <span className="text-[#8A0303] text-[8px] font-mono tracking-widest uppercase mt-3 animate-pulse">TIME EXPIRED</span>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* رسالة الانتظار — إذا التايمر لم يبدأ بعد */}
            {!justTimer && (
              <div className="text-center mt-10">
                <span className="text-yellow-500 text-sm font-mono tracking-[0.3em] animate-pulse uppercase">
                  AWAITING DIRECTOR TO START DEFENSE TIMER...
                </span>
              </div>
            )}

            {/* ── الهيدر — أسفل الشاشة ── */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-4 border-t border-[#2a2a2a] bg-black/60 backdrop-blur-sm">
              {/* يسار: لوجو + اسم + المرحلة */}
              <div className="flex items-center gap-4">
                <Image src="/mafia_logo.png" alt="Mafia" width={36} height={36} className="w-[36px] h-[36px] drop-shadow-[0_0_12px_rgba(138,3,3,0.3)]" priority />
                <div className="flex flex-col leading-none">
                  <span className="text-xl font-black tracking-tight text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>MAFIA</span>
                  <span className="flex justify-between w-full text-[7px] font-light text-[#8A0303]" dir="ltr" style={{ fontFamily: 'Amiri, serif' }}>{'CLUB'.split('').map((l, i) => <span key={i}>{l}</span>)}</span>
                </div>
                <div className="w-[1px] h-7 bg-[#2a2a2a] mx-2" />
                <div className="flex flex-col">
                  <span className="text-base font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
                    {justificationData.resultType === 'TIE' ? 'تعادل - كلمة الدفاع' : 'كلمة الدفاع الأخيرة'}
                  </span>
                  <span className="text-[7px] font-mono text-[#808080] tracking-[0.3em] uppercase">
                    {justificationData.resultType === 'TIE' ? 'TIED DEFENDANTS' : 'FINAL DEFENSE'}
                  </span>
                </div>
              </div>

              {/* وسط: عدد المتهمين */}
              <div className="flex flex-col items-center">
                <span className="text-[7px] font-mono text-[#808080] uppercase tracking-widest">ACCUSED</span>
                <span className="text-xl font-mono font-black text-[#C5A059]">{justificationData.accused.length}</span>
              </div>

              {/* يمين: عدد الأصوات */}
              <div className="flex flex-col items-center">
                <span className="text-[7px] font-mono text-[#808080] uppercase tracking-widest">VOTES AGAINST</span>
                <span className="text-xl font-mono font-black text-[#8A0303]">{justificationData.topVotes}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* PENDING RESOLUTION — ⏳ سينمائي */}
        {phase === 'PENDING' && (
          <motion.div
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="text-center w-full h-[calc(100vh-2rem)] flex flex-col items-center justify-center"
          >
            {/* خلفية حمراء نابضة */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ opacity: [0, 0.08, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ background: 'radial-gradient(circle at center, rgba(138,3,3,0.4) 0%, transparent 70%)' }}
            />

            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-9xl mb-8"
            >⚖️</motion.div>
            <h2 className="text-6xl font-black text-white mb-6 uppercase tracking-widest" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 30px rgba(138,3,3,0.4)' }}>بانتظار القرار</h2>
            <motion.p
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-[#808080] font-mono text-xl tracking-[0.5em] uppercase"
            >AWAITING DECLASSIFICATION ORDER...</motion.p>
          </motion.div>
        )}

        {/* REVEALED — كشف الهوية السينمائي */}
        {phase === 'REVEALED' && (
          <RevealCeremony players={players} revealedRoles={revealedRoles} revealType={revealType} />
        )}

        {/* TIE */}
        {phase === 'TIE' && (
          <motion.div
            key="tie"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="text-9xl mb-8 grayscale text-[#C5A059]">⚖️</div>
            <h2 className="text-7xl font-black text-white mb-6 uppercase" style={{ fontFamily: 'Amiri, serif' }}>تعادل تام</h2>
            <p className="text-[#C5A059] font-mono text-2xl tracking-[0.5em] uppercase">SYSTEM OVERRIDE REQUIRED</p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🎬 RevealCeremony — كشف الهوية السينمائي
// ══════════════════════════════════════════════════════
function RevealCeremony({ players, revealedRoles, revealType }: {
  players: any[];
  revealedRoles: any[];
  revealType: string;
}) {
  const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];
  const CARD_DELAY = 5; // ثوانٍ بين كل لاعب

  // مراحل الأنيميشن لكل لاعب
  const [revealStages, setRevealStages] = useState<Record<number, 'hidden' | 'face-down' | 'flipping' | 'revealed' | 'grayed'>>({});
  const soundPlayedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!revealedRoles.length) return;

    const timers: NodeJS.Timeout[] = [];

    revealedRoles.forEach((roleInfo, i) => {
      const baseDelay = i * CARD_DELAY * 1000;

      // المرحلة 1: ظهور الكارد بالوجه العادي
      timers.push(setTimeout(() => {
        setRevealStages(prev => ({ ...prev, [roleInfo.physicalId]: 'face-down' }));
      }, baseDelay + 500));

      // المرحلة 2: بدء الدرامرول + تدوير الكارد
      timers.push(setTimeout(() => {
        if (!soundPlayedRef.current.has(`drum-${i}`)) {
          playDrumroll();
          soundPlayedRef.current.add(`drum-${i}`);
        }
        setRevealStages(prev => ({ ...prev, [roleInfo.physicalId]: 'flipping' }));
      }, baseDelay + 2000));

      // المرحلة 3: الكارد مكشوف — صوت حسب الفريق
      timers.push(setTimeout(() => {
        const isMafia = MAFIA_ROLES.includes(roleInfo.role);
        if (!soundPlayedRef.current.has(`reveal-${i}`)) {
          if (isMafia) playRevealMafia(); else playRevealCitizen();
          soundPlayedRef.current.add(`reveal-${i}`);
        }
        setRevealStages(prev => ({ ...prev, [roleInfo.physicalId]: 'revealed' }));
      }, baseDelay + 3200));

      // المرحلة 4: تحول للرمادي + أيقونة الفريق
      timers.push(setTimeout(() => {
        if (!soundPlayedRef.current.has(`impact-${i}`)) {
          playImpactBoom();
          soundPlayedRef.current.add(`impact-${i}`);
        }
        setRevealStages(prev => ({ ...prev, [roleInfo.physicalId]: 'grayed' }));
      }, baseDelay + 4500));
    });

    return () => timers.forEach(clearTimeout);
  }, [revealedRoles]);

  return (
    <motion.div
      key="reveal-ceremony"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-[calc(100vh-2rem)] flex flex-col items-center justify-center relative overflow-hidden"
    >
      {/* خلفية سينمائية */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0, 0.15, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(138,3,3,0.3) 0%, transparent 60%)' }}
      />

      {/* عنوان */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center mb-12 z-10"
      >
        <h1 className="text-5xl font-black text-white uppercase tracking-widest mb-2" style={{ fontFamily: 'Amiri, serif', textShadow: '0 0 40px rgba(138,3,3,0.5)' }}>
          تم الإقصاء
        </h1>
        <p className="text-[#808080] font-mono text-sm tracking-[0.5em] uppercase">
          {revealType === 'DEAL_ELIMINATION' ? 'DEAL EXECUTION — IDENTITY REVEAL' : 'IDENTITY DECLASSIFIED'}
        </p>
      </motion.div>

      {/* الكروت */}
      <div className="flex items-center justify-center gap-16 z-10" style={{ transform: 'scale(1.3)', transformOrigin: 'center center' }}>
        {revealedRoles.map((roleInfo: any, i: number) => {
          const p = players.find((pl: any) => pl.physicalId === roleInfo.physicalId);
          const stage = revealStages[roleInfo.physicalId] || 'hidden';
          const isMafia = MAFIA_ROLES.includes(roleInfo.role);
          const isFlipped = stage === 'flipping' || stage === 'revealed' || stage === 'grayed';
          const isGrayed = stage === 'grayed';

          if (stage === 'hidden') return null;

          return (
            <motion.div
              key={roleInfo.physicalId}
              initial={{ opacity: 0, y: 60, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 15, delay: i * 0.3 }}
              className="flex flex-col items-center relative"
            >
              {/* أيقونة الفريق — تظهر فوق الكارد بعد التحول للرمادي */}
              <AnimatePresence>
                {isGrayed && (
                  <motion.div
                    initial={{ opacity: 0, y: 30, scale: 0 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                    className="mb-4 flex flex-col items-center"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className={`text-6xl ${
                        isMafia
                          ? 'drop-shadow-[0_0_30px_rgba(220,38,38,0.6)]'
                          : 'drop-shadow-[0_0_20px_rgba(161,161,170,0.4)]'
                      }`}
                    >
                      {isMafia ? '🩸' : '⚰️'}
                    </motion.div>
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className={`text-xs font-mono font-black tracking-[0.4em] uppercase mt-1 ${
                        isMafia ? 'text-red-500' : 'text-zinc-400'
                      }`}
                    >
                      {isMafia ? 'MAFIA' : 'CITIZEN'}
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* الكارد مع CSS perspective للتدوير */}
              <div
                className={`relative transition-all duration-1000 ${
                  isGrayed ? 'grayscale opacity-70' : ''
                } ${
                  stage === 'flipping' ? 'animate-pulse' : ''
                }`}
                style={{
                  perspective: '1200px',
                }}
              >
                {/* حلقة متوهجة أثناء الكشف */}
                {(stage === 'flipping' || stage === 'revealed') && (
                  <motion.div
                    className="absolute -inset-3 rounded-2xl z-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    transition={{ duration: 1.5, repeat: stage === 'flipping' ? Infinity : 0 }}
                    style={{
                      background: isMafia
                        ? 'linear-gradient(135deg, rgba(138,3,3,0.4), rgba(220,38,38,0.2))'
                        : 'linear-gradient(135deg, rgba(197,160,89,0.3), rgba(100,100,100,0.2))',
                      boxShadow: isMafia
                        ? '0 0 40px rgba(138,3,3,0.5)'
                        : '0 0 30px rgba(197,160,89,0.3)',
                    }}
                  />
                )}

                {/* impact burst عند الكشف */}
                {isGrayed && (
                  <motion.div
                    className="absolute -inset-6 rounded-3xl pointer-events-none z-0"
                    initial={{ opacity: 0.6, scale: 0.9 }}
                    animate={{ opacity: 0, scale: 1.5 }}
                    transition={{ duration: 1.2 }}
                    style={{
                      background: isMafia
                        ? 'radial-gradient(circle, rgba(138,3,3,0.6) 0%, transparent 70%)'
                        : 'radial-gradient(circle, rgba(100,100,100,0.4) 0%, transparent 70%)',
                    }}
                  />
                )}

                <div className="relative z-10">
                  <MafiaCard
                    playerNumber={roleInfo.physicalId}
                    playerName={p?.name || 'Unknown'}
                    role={roleInfo.role}
                    isFlipped={isFlipped}
                    flippable={false}
                    isAlive={!isGrayed}
                    gender={p?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                    size="fluid"
                    className="w-56 h-[19rem] md:w-64 md:h-[22rem]"
                    avatarUrl={p?.avatarUrl}
                  />
                </div>
              </div>

              {/* اسم اللاعب */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: isGrayed ? 0.5 : 1 }}
                className={`mt-4 text-sm font-mono tracking-[0.3em] uppercase ${
                  isGrayed
                    ? 'text-[#555] line-through'
                    : 'text-[#808080]'
                }`}
              >
                {p?.name || `OPERATIVE #${roleInfo.physicalId}`}
              </motion.p>
            </motion.div>
          );
        })}
      </div>

      {/* هيدر سفلي */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-3 border-t border-[#2a2a2a]/50 bg-black/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <Image src="/mafia_logo.png" alt="Mafia" width={28} height={28} className="w-[28px] h-[28px] opacity-60" priority />
          <span className="text-sm font-black text-[#C5A059]/60" style={{ fontFamily: 'Amiri, serif' }}>MAFIA CLUB</span>
        </div>
        <span className="text-[#808080] text-[10px] font-mono tracking-[0.4em] uppercase">
          {revealType === 'DEAL_ELIMINATION' ? 'DEAL EXECUTION' : 'ELIMINATION PROTOCOL'}
        </span>
      </div>
    </motion.div>
  );
}
