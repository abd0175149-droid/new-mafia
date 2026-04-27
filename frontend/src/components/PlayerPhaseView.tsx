'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PlayerPhaseViewProps {
  gamePhase: string | null;
  physicalId: string;
  assignedRole: string | null;
  isPlayerDead: boolean;
  on: any;
  emit: any;
  myVote: number | null;
  votingCandidates: any[];
  votingPlayersInfo: any[];
  pollData?: {
    justificationData?: any;
    withdrawalState?: any;
    discussionState?: any;
    winner?: string | null;
    allPlayers?: any[];
  } | null;
}

export default function PlayerPhaseView({
  gamePhase, physicalId, assignedRole, isPlayerDead, on, emit,
  myVote, votingCandidates, votingPlayersInfo, pollData
}: PlayerPhaseViewProps) {
  // ── حالة النقاش ──
  const [discussionState, setDiscussionState] = useState<any>(null);
  // ── حالة التبرير ──
  const [justificationData, setJustificationData] = useState<any>(null);
  const [justTimer, setJustTimer] = useState<number | null>(null);
  const justTimerRef = useRef<any>(null);
  // ── حالة الإقصاء ──
  const [eliminationData, setEliminationData] = useState<any>(null);
  const [eliminationRevealed, setEliminationRevealed] = useState(false);
  // ── حالة التعادل ──
  const [tiedCandidates, setTiedCandidates] = useState<any[]>([]);
  // ── ملخص الصباح ──
  const [morningEvents, setMorningEvents] = useState<any[]>([]);
  // ── نتيجة اللعبة ──
  const [gameWinner, setGameWinner] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  // ── سحب الصوت ──
  const [withdrawalActive, setWithdrawalActive] = useState(false);
  const [hasWithdrawn, setHasWithdrawn] = useState(false);
  const [withdrawalCount, setWithdrawalCount] = useState(0);
  const [withdrawalNeeded, setWithdrawalNeeded] = useState(0);

  // ── استعادة البيانات من الـ polling عند reconnect ──
  useEffect(() => {
    if (!pollData) return;
    if (pollData.justificationData && !justificationData) {
      setJustificationData(pollData.justificationData);
    }
    if (pollData.withdrawalState) {
      setWithdrawalActive(true);
      setWithdrawalCount(pollData.withdrawalState.count || 0);
      setWithdrawalNeeded(pollData.withdrawalState.needed || 0);
      // تحقق هل أنا سبق سحبت صوتي
      const myId = parseInt(physicalId);
      if (pollData.withdrawalState.withdrawn?.includes(myId)) {
        setHasWithdrawn(true);
      }
    }
    if (pollData.discussionState && !discussionState) {
      setDiscussionState(pollData.discussionState);
    }
    if (pollData.winner && !gameWinner) {
      setGameWinner(pollData.winner);
    }
    if (pollData.allPlayers && allPlayers.length === 0) {
      setAllPlayers(pollData.allPlayers);
    }
  }, [pollData]);

  // ── Event Listeners ──
  useEffect(() => {
    if (!on) return;

    // ── النقاش ──
    const c1 = on('day:discussion-updated', (data: any) => {
      setDiscussionState(data.discussionState);
    });

    // ── التبرير — قراءة البيانات ──
    const c2 = on('day:justification-started', (data: any) => {
      if (data && data.accused) {
        setJustificationData(data);
        setWithdrawalActive(false);
        setHasWithdrawn(false);
      }
    });

    // ── تايمر التبرير ──
    const c3 = on('day:justification-timer-started', (data: any) => {
      if (justTimerRef.current) clearInterval(justTimerRef.current);
      setJustTimer(data.duration || 60);
      justTimerRef.current = setInterval(() => {
        setJustTimer(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(justTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    const c4 = on('day:justification-timer-stopped', () => {
      if (justTimerRef.current) clearInterval(justTimerRef.current);
      setJustTimer(null);
    });

    // ── التعادل ──
    const c5 = on('day:tie', (data: any) => {
      setTiedCandidates(data.tiedCandidates || []);
    });

    // ── الإقصاء ──
    const c6 = on('day:elimination-pending', (data: any) => {
      if (data) {
        setEliminationData(data);
        setEliminationRevealed(false);
      }
    });

    const c7 = on('day:elimination-revealed', (data: any) => {
      if (data) {
        setEliminationData(data);
        setEliminationRevealed(true);
        // تحقق هل أنا المُقصى
        const myId = parseInt(physicalId);
        if (data.eliminated?.includes(myId)) {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
      }
    });

    // ── أحداث الصباح ──
    const c8 = on('display:morning-event', (data: any) => {
      setMorningEvents(prev => [...prev, data]);
    });

    // ── انتهاء اللعبة — قراءة البيانات ──
    const c9 = on('game:over', (data: any) => {
      if (data) {
        setGameWinner(data.winner || null);
        setAllPlayers(data.players || []);
      }
    });

    // ── سحب الأصوات ──
    const c10 = on('day:withdrawal-period', (data: any) => {
      setWithdrawalActive(true);
      setWithdrawalCount(0);
      setWithdrawalNeeded(data?.needed || 0);
      setHasWithdrawn(false);
    });

    const c11 = on('day:withdrawal-update', (data: any) => {
      setWithdrawalCount(data?.count || 0);
      setWithdrawalNeeded(data?.needed || 0);
    });

    const c12 = on('day:withdrawal-result', (data: any) => {
      setWithdrawalActive(false);
    });

    // ── مسح عند تغيير المرحلة ──
    const c13 = on('game:phase-changed', (data: any) => {
      const p = data?.phase;
      if (p === 'DAY_DISCUSSION') {
        setJustificationData(null);
        setEliminationData(null);
        setTiedCandidates([]);
        setWithdrawalActive(false);
      }
      if (p === 'NIGHT') {
        setDiscussionState(null);
        setJustificationData(null);
        setEliminationData(null);
        setMorningEvents([]);
        setWithdrawalActive(false);
      }
      if (p === 'MORNING_RECAP') {
        setMorningEvents([]);
      }
      if (p === 'LOBBY') {
        setGameWinner(null);
        setAllPlayers([]);
        setDiscussionState(null);
      }
    });

    return () => {
      [c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13].forEach(c => c?.());
      if (justTimerRef.current) clearInterval(justTimerRef.current);
    };
  }, [on, physicalId]);

  // ── دالة سحب الصوت ──
  const handleWithdraw = async () => {
    if (!emit || hasWithdrawn) return;
    try {
      const res = await emit('player:withdraw-vote', { physicalId: parseInt(physicalId) });
      if (res?.success) {
        setHasWithdrawn(true);
        if (res.count !== undefined) setWithdrawalCount(res.count);
        if (res.needed !== undefined) setWithdrawalNeeded(res.needed);
      }
    } catch {}
  };

  const myId = parseInt(physicalId);

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════

  // ── تجهيز الأدوار ──
  if (gamePhase === 'ROLE_GENERATION') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
        <div className="text-4xl mb-3">⚙️</div>
        <div className="w-10 h-10 border-2 border-[#C5A059]/30 border-t-[#C5A059] rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-lg font-bold text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>جاري تجهيز الأدوار</h3>
        <p className="text-[#666] text-xs font-mono mt-2">GENERATING ROLES...</p>
      </motion.div>
    );
  }

  // ── توزيع الأدوار ──
  if (gamePhase === 'ROLE_BINDING') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
        <motion.div animate={{ rotateY: [0, 180, 360] }} transition={{ duration: 2, repeat: Infinity }} className="text-4xl mb-3">🎴</motion.div>
        <h3 className="text-lg font-bold text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>جاري توزيع الأدوار</h3>
        <p className="text-[#666] text-xs font-mono mt-2">ASSIGNING ROLES...</p>
      </motion.div>
    );
  }

  // ── مرحلة النقاش ──
  if (gamePhase === 'DAY_DISCUSSION') {
    const ds = discussionState;
    const currentSpeaker = ds?.currentSpeakerId;
    const speakerInfo = ds?.speakers?.find((s: any) => s.physicalId === currentSpeaker);
    const speakers = ds?.speakers || [];

    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="py-4">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🎤</div>
          <h3 className="text-lg font-bold text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>مرحلة النقاش</h3>
        </div>

        {/* المتكلم الحالي */}
        {speakerInfo ? (
          <motion.div
            key={currentSpeaker}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gradient-to-br from-[#C5A059]/20 to-[#C5A059]/5 border border-[#C5A059]/30 rounded-2xl p-5 mx-2 mb-4 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#C5A059]/20 border-2 border-[#C5A059] flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-black text-[#C5A059]">#{speakerInfo.physicalId}</span>
            </div>
            <p className="text-white font-bold text-lg">{speakerInfo.name || `لاعب #${speakerInfo.physicalId}`}</p>
            <p className="text-[#C5A059] text-xs font-mono mt-1 tracking-widest">SPEAKING NOW</p>
            {currentSpeaker === myId && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-3 bg-[#C5A059]/20 rounded-lg py-2 px-4">
                <p className="text-[#C5A059] text-sm font-bold">🎙️ دورك في الكلام!</p>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <div className="text-center text-[#666] text-sm py-4 font-mono">بانتظار بدء النقاش...</div>
        )}

        {/* قائمة ترتيب النقاش */}
        {speakers.length > 0 && (
          <div className="mx-2 space-y-1.5">
            <p className="text-[#666] text-[10px] font-mono tracking-widest mb-2 text-center">DISCUSSION ORDER</p>
            {speakers.map((s: any, i: number) => {
              const isCurrent = s.physicalId === currentSpeaker;
              const isDone = s.status === 'done';
              return (
                <div key={s.physicalId}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                    isCurrent ? 'bg-[#C5A059]/15 border border-[#C5A059]/30' :
                    isDone ? 'bg-white/5 opacity-50' : 'bg-white/5'
                  }`}
                >
                  <span className={`text-xs font-mono w-5 ${isCurrent ? 'text-[#C5A059]' : 'text-[#555]'}`}>{i + 1}</span>
                  <span className={`flex-1 text-sm ${isCurrent ? 'text-white font-bold' : isDone ? 'text-[#666] line-through' : 'text-[#999]'}`}>
                    {s.name || `#${s.physicalId}`}
                  </span>
                  {isDone && <span className="text-green-500 text-xs">✓</span>}
                  {isCurrent && <span className="text-[#C5A059] text-xs animate-pulse">●</span>}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  }

  // ── مرحلة التبرير ──
  if (gamePhase === 'DAY_JUSTIFICATION') {
    const accused = justificationData?.accused || [];
    const topVotes = justificationData?.topVotes || 0;
    // هل أنا صوّتت على أحد المتهمين؟ (نستخدم votersForAccused من الباك مباشرة)
    const iVotedForAccused = justificationData?.votersForAccused?.includes(myId) || false;

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">⚖️</div>
          <h3 className="text-lg font-bold text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>مرحلة التبرير</h3>
        </div>

        {/* كروت المتهمين */}
        {accused.map((a: any) => {
          const info = votingPlayersInfo.find((p: any) => p.physicalId === a.targetPhysicalId);
          return (
            <motion.div
              key={a.targetPhysicalId}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-gradient-to-br from-red-500/15 to-red-900/10 border border-red-500/30 rounded-2xl p-5 mx-2 mb-3 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-black text-red-400">#{a.targetPhysicalId}</span>
              </div>
              <p className="text-white font-bold text-lg">{info?.name || a.name || `لاعب #${a.targetPhysicalId}`}</p>
              <p className="text-red-400 text-xs font-mono mt-1">{topVotes} VOTES AGAINST</p>
              {a.canJustify && <p className="text-yellow-500 text-xs mt-2">🎙️ يبرر الآن...</p>}
            </motion.div>
          );
        })}

        {/* تايمر التبرير */}
        {justTimer !== null && justTimer > 0 && (
          <div className="text-center mt-3">
            <div className="inline-flex items-center gap-2 bg-black/40 border border-[#C5A059]/20 rounded-full px-5 py-2">
              <span className="text-[#C5A059] text-xs font-mono">⏱</span>
              <span className={`text-2xl font-black font-mono ${justTimer <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{justTimer}s</span>
            </div>
          </div>
        )}

        {/* سحب الصوت — يظهر مباشرة أثناء التبرير لمن صوّت على المتهم */}
        {iVotedForAccused && !isPlayerDead && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-2 mt-4 bg-gradient-to-br from-blue-500/15 to-blue-900/10 border border-blue-500/30 rounded-2xl p-4 text-center">
            <p className="text-blue-300 text-sm mb-2 font-bold">أنت صوّتت على هذا اللاعب</p>
            <p className="text-[#888] text-xs mb-3">هل تريد سحب صوتك؟ إذا سحب أكثر من النصف تُعاد عملية التصويت</p>
            {withdrawalCount > 0 && (
              <p className="text-[#666] text-xs mb-3 font-mono">{withdrawalCount}/{withdrawalNeeded} سحبوا أصواتهم</p>
            )}
            {!hasWithdrawn ? (
              <button onClick={handleWithdraw} className="bg-blue-500/20 border border-blue-500/40 text-blue-300 font-bold py-3 px-8 rounded-xl hover:bg-blue-500/30 transition-all text-base">
                🗳️ سحب صوتي
              </button>
            ) : (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl py-2 px-4">
                <p className="text-green-400 text-sm font-mono">✓ تم سحب صوتك</p>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    );
  }

  // ── تعادل ──
  if (gamePhase === 'DAY_TIEBREAKER') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
        <div className="text-4xl mb-3">⚖️</div>
        <h3 className="text-lg font-bold text-yellow-400" style={{ fontFamily: 'Amiri, serif' }}>تعادل في الأصوات</h3>
        <div className="flex justify-center gap-3 mt-4 flex-wrap px-4">
          {tiedCandidates.map((c: any) => {
            const info = votingPlayersInfo.find((p: any) => p.physicalId === c.targetPhysicalId);
            return (
              <div key={c.targetPhysicalId} className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-center">
                <span className="text-yellow-400 font-black text-lg">#{c.targetPhysicalId}</span>
                <p className="text-white text-xs mt-1">{info?.name || ''}</p>
                <p className="text-yellow-400 text-xs font-mono">{c.votes} votes</p>
              </div>
            );
          })}
        </div>
        <p className="text-[#666] text-xs font-mono mt-4 tracking-widest">LEADER DECIDING...</p>
      </motion.div>
    );
  }

  // ── الإقصاء ──
  if (gamePhase === 'ELIMINATION_PENDING') {
    const elim = eliminationData;
    const eliminated = elim?.eliminated || [];
    const revealed = elim?.revealedRoles || [];
    const amIEliminated = eliminated.includes(myId);

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">💀</div>
          <h3 className="text-lg font-bold text-red-400" style={{ fontFamily: 'Amiri, serif' }}>إقصاء</h3>
        </div>

        {eliminated.map((pid: number) => {
          const rev = revealed.find((r: any) => r.physicalId === pid);
          const info = votingPlayersInfo.find((p: any) => p.physicalId === pid);
          return (
            <motion.div key={pid} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={`border rounded-2xl p-5 mx-2 mb-3 text-center ${pid === myId ? 'bg-red-500/20 border-red-500/50' : 'bg-white/5 border-white/10'}`}>
              <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-black text-red-400">#{pid}</span>
              </div>
              <p className="text-white font-bold text-lg">{info?.name || `لاعب #${pid}`}</p>
              {eliminationRevealed && rev && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[#C5A059] text-sm font-mono mt-2 tracking-wider">
                  {rev.role}
                </motion.p>
              )}
            </motion.div>
          );
        })}

        {amIEliminated && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mx-2 mt-3 bg-red-500/20 border border-red-500/40 rounded-xl p-4 text-center">
            <p className="text-red-400 font-bold text-lg">❌ تم إقصاؤك!</p>
          </motion.div>
        )}
      </motion.div>
    );
  }

  // ── الليل ──
  if (gamePhase === 'NIGHT') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
        <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }} transition={{ duration: 3, repeat: Infinity }} className="text-6xl mb-4">🌙</motion.div>
        <h3 className="text-xl font-bold text-indigo-300" style={{ fontFamily: 'Amiri, serif' }}>الليل يسدل ستاره</h3>
        <p className="text-[#555] text-xs font-mono mt-3 tracking-widest">NIGHT PHASE</p>
        <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
          className="flex justify-center gap-1 mt-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400/50" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </motion.div>
      </motion.div>
    );
  }

  // ── ملخص الصباح ──
  if (gamePhase === 'MORNING_RECAP') {
    // فقط أعرض الأحداث التي تخص هذا اللاعب (عدا الإسكات والحماية)
    const myEvents = morningEvents.filter((e: any) =>
      e.targetPhysicalId === myId && e.type !== 'SILENCE' && e.type !== 'PROTECTION'
    );
    const amIKilled = myEvents.some((e: any) => e.type === 'KILL' || e.type === 'SNIPE');

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
        <motion.div initial={{ y: -20 }} animate={{ y: 0 }} className="text-5xl mb-4">☀️</motion.div>
        <h3 className="text-xl font-bold text-amber-300" style={{ fontFamily: 'Amiri, serif' }}>الصباح يطل</h3>

        {amIKilled ? (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-6 mx-4 bg-red-500/20 border border-red-500/40 rounded-2xl p-6">
            <div className="text-4xl mb-3">💀</div>
            <p className="text-red-400 font-bold text-lg">لقد اُغتلت!</p>
            <p className="text-[#666] text-xs font-mono mt-2">YOU WERE ELIMINATED</p>
          </motion.div>
        ) : myEvents.length === 0 ? (
          <p className="text-[#666] text-sm font-mono mt-6 tracking-widest">بانتظار كشف الأحداث...</p>
        ) : (
          <div className="mt-4 mx-4 space-y-2">
            {myEvents.map((e: any, i: number) => (
              <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.3 }}
                className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-white text-sm">{e.targetName}: {e.type === 'SNIPE' ? '🎯 تم قنصك!' : e.extra || e.type}</p>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── نتيجة اللعبة ──
  if (gamePhase === 'GAME_OVER' && gameWinner) {
    const isMafiaWin = gameWinner === 'MAFIA';
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-6">
        <div className="text-center mb-6">
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-6xl mb-3">
            {isMafiaWin ? '🩸' : '⚖️'}
          </motion.div>
          <h3 className="text-2xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>
            {isMafiaWin ? 'انتصار المافيا' : 'تطهير المدينة'}
          </h3>
          <p className="text-[#666] text-xs font-mono mt-2 tracking-widest">
            {isMafiaWin ? 'MAFIA WINS' : 'CITIZENS WIN'}
          </p>
        </div>

        {/* كشف أدوار الجميع */}
        {allPlayers.length > 0 && (
          <div className="grid grid-cols-3 gap-2 px-2">
            {allPlayers.map((p: any) => (
              <motion.div key={p.physicalId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-2.5 text-center border ${
                  p.physicalId === myId ? 'bg-[#C5A059]/15 border-[#C5A059]/40' :
                  !p.isAlive ? 'bg-red-500/10 border-red-500/20 opacity-60' :
                  'bg-white/5 border-white/10'
                }`}>
                <p className="text-white text-xs font-bold">#{p.physicalId}</p>
                <p className="text-[#999] text-[10px] truncate">{p.name}</p>
                <p className={`text-[10px] font-mono mt-1 ${p.role && (p.role.includes('MAFIA') || p.role === 'GODFATHER' || p.role === 'SILENCER' || p.role === 'CHAMELEON') ? 'text-red-400' : 'text-green-400'}`}>
                  {p.role || '?'}
                </p>
                {!p.isAlive && <span className="text-red-500 text-[8px]">💀</span>}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── لا مرحلة خاصة — لا نعرض شيء ──
  return null;
}
