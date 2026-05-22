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
    pendingResolution?: any;
    deals?: any[];
    round?: number;
  } | null;
  roomId?: string;
}

export default function PlayerPhaseView({
  gamePhase, physicalId, assignedRole, isPlayerDead, on, emit,
  myVote, votingCandidates, votingPlayersInfo, pollData, roomId
}: PlayerPhaseViewProps) {
  // ── حالة النقاش ──
  const [discussionState, setDiscussionState] = useState<any>(null);
  // ── حالة الاتفاقيات (Deals) ──
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | ''>('');
  const [dealError, setDealError] = useState('');
  const [dealSubmitting, setDealSubmitting] = useState(false);
  // ── حالة التبرير ──
  const [justificationData, setJustificationData] = useState<any>(pollData?.justificationData || null);
  const [justTimer, setJustTimer] = useState<number | null>(null);
  const justTimerRef = useRef<any>(null);
  // ── حالة الإقصاء ──
  const [eliminationData, setEliminationData] = useState<any>(null);
  const [eliminationRevealed, setEliminationRevealed] = useState(false);
  // ── حالة التعادل ──
  const [tiedCandidates, setTiedCandidates] = useState<any[]>([]);
  // ── ملخص الصباح ──
  const [morningEvents, setMorningEvents] = useState<any[]>([]);
  // ── تفاصيل خطوة الليل (متاحة للجميع) ──
  const [nightStepInfo, setNightStepInfo] = useState<string | null>(null);
  // ── نتيجة اللعبة ──
  const [gameWinner, setGameWinner] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  // ── سحب الصوت ──
  const [withdrawalActive, setWithdrawalActive] = useState(false);
  const [hasWithdrawn, setHasWithdrawn] = useState(false);
  const [withdrawalCount, setWithdrawalCount] = useState(0);
  const [withdrawalNeeded, setWithdrawalNeeded] = useState(0);
  // Ref لحماية حالة السحب من التصفير بواسطة الـ polling أو fetchLatestState
  const withdrawalActiveRef = useRef(false);

  // ── تايمر النقاش (يجب أن يكون هنا قبل أي return مشروط) ──
  const [discCountdown, setDiscCountdown] = useState<number | null>(null);
  const discTimerRef = useRef<any>(null);
  const prevSpeakerRef = useRef<number | null>(null);

  // ── مرونة كاملة في جلب وتحديث physicalId لتجنب الـ Closure Trap والـ NaN ──
  const physicalIdRef = useRef(physicalId);
  const roomIdRef = useRef(roomId);
  const emitRef = useRef(emit);

  useEffect(() => {
    physicalIdRef.current = physicalId;
  }, [physicalId]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  const getLatestMyId = () => {
    let pid = physicalId;
    if (!pid || isNaN(parseInt(pid))) {
      pid = physicalIdRef.current;
    }
    if (!pid || isNaN(parseInt(pid))) {
      try {
        const session = JSON.parse(localStorage.getItem('mafia_session') || '{}');
        if (session.physicalId) pid = String(session.physicalId);
      } catch {}
    }
    if (!pid || isNaN(parseInt(pid))) {
      try {
        const info = JSON.parse(localStorage.getItem('mafia_player_info') || '{}');
        if (info.physicalId) pid = String(info.physicalId);
      } catch {}
    }
    const parsed = parseInt(pid);
    return isNaN(parsed) ? 0 : parsed;
  };

  const myId = getLatestMyId();

  // ── مزامنة pollData لتجنب Closure Trap ──
  const pollDataRef = useRef<any>(pollData);
  useEffect(() => {
    pollDataRef.current = pollData;
  }, [pollData]);

  // ── جلب الحالة الكاملة لحظياً لتفادي الـ Race Condition ──
  const fetchLatestState = async () => {
    const activeEmit = emit || emitRef.current;
    const activeRoomId = roomId || roomIdRef.current;
    if (!activeEmit || !activeRoomId) return;
    try {
      let savedPlayerId: number | undefined = undefined;
      const pidStr = localStorage.getItem('mafia_playerId');
      if (pidStr && parseInt(pidStr)) {
        savedPlayerId = parseInt(pidStr);
      } else {
        try {
          const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
          if (auth.playerId) savedPlayerId = Number(auth.playerId);
        } catch {}
        if (!savedPlayerId) {
          try {
            const info = JSON.parse(localStorage.getItem('mafia_player_info') || '{}');
            if (info.playerId) savedPlayerId = Number(info.playerId);
          } catch {}
        }
      }

      let savedPhone: string | undefined = undefined;
      try {
        const info = JSON.parse(localStorage.getItem('mafia_player_info') || '{}');
        if (info.phone) savedPhone = String(info.phone);
      } catch {}
      if (!savedPhone) {
        try {
          const auth = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}');
          if (auth.phone) savedPhone = String(auth.phone);
        } catch {}
      }
      if (!savedPhone) {
        try {
          const session = JSON.parse(localStorage.getItem('mafia_session') || '{}');
          if (session.phone) savedPhone = String(session.phone);
        } catch {}
      }

      const normalizedPhone = savedPhone ? (savedPhone.startsWith('0') ? savedPhone : '0' + savedPhone) : undefined;
      const currentMyId = getLatestMyId();

      const res = await activeEmit('room:get-my-state', {
        roomId: activeRoomId,
        playerId: savedPlayerId,
        phone: normalizedPhone,
      });

      if (res?.success) {
        if (res.justificationData) {
          // دمج بدلاً من استبدال: للحفاظ على timerFinished المحلي
          setJustificationData((prev: any) => ({
            ...prev,
            ...res.justificationData,
            timerFinished: prev?.timerFinished || res.justificationData.timerFinished
          }));
        }
        if (res.withdrawalState) {
          withdrawalActiveRef.current = true;
          setWithdrawalActive(true);
          setWithdrawalCount(res.withdrawalState.count || 0);
          setWithdrawalNeeded(res.withdrawalState.needed || 0);
          if (res.withdrawalState.withdrawn?.some((id: any) => String(id) === String(currentMyId))) {
            setHasWithdrawn(true);
          } else {
            setHasWithdrawn(false);
          }
        }
        // لا تصفير هنا — دع فقط الـ socket events أو pollData تتعامل مع التصفير
        if (res.discussionState) {
          setDiscussionState(res.discussionState);
          if (res.discussionState.deals) {
            setDeals(res.discussionState.deals);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching latest state in PlayerPhaseView:', err);
    }
  };

  // جلب فوري عند تحميل المكون أو توفر المعرفات
  useEffect(() => {
    if (roomId && emit) {
      fetchLatestState();
    }
  }, [roomId, emit]);

  // ── استعادة البيانات من الـ polling عند reconnect ──
  useEffect(() => {
    if (!pollData) return;
    if (pollData.justificationData) {
      setJustificationData((prev: any) => ({
        ...prev,
        ...pollData.justificationData,
        timerFinished: prev?.timerFinished || pollData.justificationData.timerFinished
      }));
      
      // استعادة تايمر التبرير إذا كان يعمل
      if (pollData.justificationData.timer && justTimer === null) {
        const tData = pollData.justificationData.timer;
        const limit = tData.timeLimitSeconds || 60;
        const elapsed = Math.floor((Date.now() - (tData.startTime || Date.now())) / 1000);
        const remaining = Math.max(0, limit - elapsed);
        
        if (remaining > 0) {
          setJustTimer(remaining);
          if (justTimerRef.current) clearInterval(justTimerRef.current);
          justTimerRef.current = setInterval(() => {
            setJustTimer(prev => {
              if (prev === null || prev <= 1) {
                clearInterval(justTimerRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          setJustTimer(0);
        }
      }
    }
    // استعادة حالة السحب عند وجود بيانات سحب نشطة من البولينج
    if (pollData.withdrawalState) {
      withdrawalActiveRef.current = true;
      setWithdrawalActive(true);
      setWithdrawalCount(pollData.withdrawalState.count || 0);
      setWithdrawalNeeded(pollData.withdrawalState.needed || 0);
      const myId = getLatestMyId();
      if (pollData.withdrawalState.withdrawn?.some((id: any) => String(id) === String(myId))) {
        setHasWithdrawn(true);
      } else {
        setHasWithdrawn(false);
      }
    } else {
      // لمنع البولينج من تصفير حالة السحب الحية:
      // لا نصفّر إلا إذا خرجنا من مرحلة التبرير أو لم يكن السوكيت قد فعّل السحب
      if (gamePhase !== 'DAY_JUSTIFICATION' || !withdrawalActiveRef.current) {
        withdrawalActiveRef.current = false;
        setWithdrawalActive(false);
        setHasWithdrawn(false);
        setWithdrawalCount(0);
        setWithdrawalNeeded(0);
      }
    }
    if (pollData.discussionState && !discussionState) {
      setDiscussionState(pollData.discussionState);
      if (pollData.discussionState.deals) {
        setDeals(pollData.discussionState.deals);
      }
    } else if (pollData.discussionState && pollData.discussionState.deals) {
      setDeals(pollData.discussionState.deals);
    }
    if (pollData.deals) {
      setDeals(pollData.deals);
    }
    if (pollData.winner && !gameWinner) {
      setGameWinner(pollData.winner);
    }
    if (pollData.allPlayers && allPlayers.length === 0) {
      setAllPlayers(pollData.allPlayers);
    }
    // استعادة بيانات الإقصاء عند reconnect في DAY_ELIMINATION
    if (pollData.pendingResolution && !eliminationData) {
      setEliminationData(pollData.pendingResolution);
    }
  }, [pollData]);

  // ── Event Listeners ──
  // ── تايمر النقاش: مزامنة مع حالة الباكإند ──
  useEffect(() => {
    const ds = discussionState;
    if (!ds) { setDiscCountdown(null); return; }
    const { status, timeRemaining, startTime, timeLimitSeconds } = ds;
    if (status === 'SPEAKING' && startTime) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, (timeRemaining ?? timeLimitSeconds ?? 60) - elapsed);
      setDiscCountdown(remaining);
      if (discTimerRef.current) clearInterval(discTimerRef.current);
      discTimerRef.current = setInterval(() => {
        setDiscCountdown(prev => {
          if (prev === null || prev <= 1) { clearInterval(discTimerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else if (status === 'PAUSED' || status === 'WAITING') {
      if (discTimerRef.current) clearInterval(discTimerRef.current);
      setDiscCountdown(timeRemaining ?? timeLimitSeconds ?? null);
    }
    return () => { if (discTimerRef.current) clearInterval(discTimerRef.current); };
  }, [discussionState?.status, discussionState?.startTime, discussionState?.timeRemaining]);

  // ── تنبيه عند حلول دور اللاعب (اهتزاز أندرويد + صوت iOS) ──
  useEffect(() => {
    const currentSpeakerId = discussionState?.currentSpeakerId;
    if (currentSpeakerId === myId && prevSpeakerRef.current !== myId) {
      // محاولة الاهتزاز مع تفادي حظر المتصفح (try/catch)
      try {
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200, 100, 300]);
        }
      } catch (e) {
        console.warn('Vibration blocked by browser policies:', e);
      }
      // تنبيه صوتي قصير (يعمل على iOS + أندرويد)
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const playTone = (freq: number, start: number, dur: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + dur);
          };
          // 3 نغمات صاعدة قصيرة
          playTone(660, 0, 0.15);
          playTone(880, 0.2, 0.15);
          playTone(1100, 0.4, 0.2);
          setTimeout(() => ctx.close(), 1000);
        }
      } catch {}
    }
    prevSpeakerRef.current = currentSpeakerId ?? null;
  }, [discussionState?.currentSpeakerId, myId]);

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
        // تصفير كامل لحالة السحب عند بدء تبرير جديد
        withdrawalActiveRef.current = false;
        setWithdrawalActive(false);
        setHasWithdrawn(false);
        setWithdrawalCount(0);
        setWithdrawalNeeded(0);
      }
      fetchLatestState();
    });

    // ── تايمر التبرير ──
    const c3 = on('day:justification-timer-started', (data: any) => {
      if (justTimerRef.current) clearInterval(justTimerRef.current);
      const limit = data.timeLimitSeconds || data.duration || 60;
      const elapsed = Math.floor((Date.now() - (data.startTime || Date.now())) / 1000);
      const remaining = Math.max(0, limit - elapsed);
      setJustTimer(remaining);
      setJustificationData((prev: any) => {
        const current = prev || pollDataRef.current?.justificationData || {};
        return { ...current, timerFinished: false };
      });
      
      justTimerRef.current = setInterval(() => {
        setJustTimer(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(justTimerRef.current);
            setJustificationData((p: any) => {
              const current = p || pollDataRef.current?.justificationData || {};
              return { ...current, timerFinished: true };
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    const c4 = on('day:justification-timer-stopped', () => {
      if (justTimerRef.current) clearInterval(justTimerRef.current);
      setJustTimer(null);
      setJustificationData((prev: any) => {
        const current = prev || pollDataRef.current?.justificationData || {};
        return { ...current, timerFinished: true };
      });
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
        const myId = getLatestMyId();
        if (data.eliminated?.includes(myId)) {
          try {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          } catch (e) {
            console.warn('Vibration blocked by browser policies:', e);
          }
        }
      }
    });

    // ── أحداث الصباح ──
    const c8 = on('display:morning-event', (data: any) => {
      // منع التكرار عند إعادة العرض من الليدر
      setMorningEvents(prev => {
        const exists = prev.some((e: any) => e.targetPhysicalId === data.targetPhysicalId && e.type === data.type);
        if (exists) return prev;
        return [...prev, data];
      });
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
      console.log('🗳️ [Socket] day:withdrawal-period received:', data);
      withdrawalActiveRef.current = true;
      setWithdrawalActive(true);
      setWithdrawalCount(0);
      setWithdrawalNeeded(data?.needed || 0);
      setHasWithdrawn(false);
      // لا نستدعي fetchLatestState هنا لتجنب أي سباق زمني
    });

    const c11 = on('day:withdrawal-update', (data: any) => {
      setWithdrawalCount(data?.count || 0);
      setWithdrawalNeeded(data?.needed || 0);
      // تحقق هل أنا ضمن الذين سحبوا
      const myId = getLatestMyId();
      if (data?.withdrawn?.some((id: any) => String(id) === String(myId))) {
        setHasWithdrawn(true);
      } else {
        setHasWithdrawn(false);
      }
    });

    const c12 = on('day:withdrawal-result', (data: any) => {
      withdrawalActiveRef.current = false;
      setWithdrawalActive(false);
    });

    // ── معلومات طابور الليل ──
    const c14 = on('night:step-info', (data: any) => {
      setNightStepInfo(data.roleName || null);
    });

    // ── أحداث الاتفاقيات (Deals) ──
    const cDealsCreated = on('day:deal-created', (data: { deals: any[] }) => {
      setDeals(data.deals || []);
    });

    const cDealsRemoved = on('day:deal-removed', (data: { deals: any[] }) => {
      setDeals(data.deals || []);
    });

    // ── مسح عند تغيير المرحلة ──
    const c13 = on('game:phase-changed', (data: any) => {
      const p = data?.phase;
      if (p === 'DAY_DISCUSSION') {
        setJustificationData(null);
        setEliminationData(null);
        setTiedCandidates([]);
        withdrawalActiveRef.current = false;
        setWithdrawalActive(false);
        setHasWithdrawn(false);
        setWithdrawalCount(0);
        setWithdrawalNeeded(0);
        // تصفير واجهة الاتفاقيات للجولة الجديدة
        setSelectedTargetId('');
        setDealError('');
        setDealSubmitting(false);
        setDeals([]);
      }
      if (p === 'DAY_VOTING') {
        // تصفير كل شيء عند إعادة التصويت
        setJustificationData(null);
        setEliminationData(null);
        setTiedCandidates([]);
        withdrawalActiveRef.current = false;
        setWithdrawalActive(false);
        setHasWithdrawn(false);
        setWithdrawalCount(0);
        setWithdrawalNeeded(0);
      }
      if (p === 'NIGHT') {
        setDiscussionState(null);
        setJustificationData(null);
        setEliminationData(null);
        setMorningEvents([]);
        withdrawalActiveRef.current = false;
        setWithdrawalActive(false);
        setDeals([]);
        setSelectedTargetId('');
        setDealError('');
      } else {
        setNightStepInfo(null);
      }
      if (p === 'MORNING_RECAP') {
        setMorningEvents([]);
      }
      if (p === 'LOBBY') {
        setGameWinner(null);
        setAllPlayers([]);
        setDiscussionState(null);
        setDeals([]);
        setSelectedTargetId('');
        setDealError('');
      }
    });

    return () => {
      [c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,cDealsCreated,cDealsRemoved].forEach(c => c?.());
      if (justTimerRef.current) clearInterval(justTimerRef.current);
    };
  }, [on, physicalId, roomId, emit]);

  // ── دالة سحب الصوت ──
  const handleWithdraw = async () => {
    if (!emit || hasWithdrawn) return;
    try {
      const res = await emit('player:withdraw-vote', { physicalId: getLatestMyId() });
      if (res?.success) {
        setHasWithdrawn(true);
        if (res.count !== undefined) setWithdrawalCount(res.count);
        if (res.needed !== undefined) setWithdrawalNeeded(res.needed);
      }
    } catch {}
  };

  // ── دالة إبرام الاتفاقية آلياً ──
  const handleCreateDeal = async () => {
    if (!selectedTargetId || !roomId || dealSubmitting) return;
    setDealSubmitting(true);
    setDealError('');
    try {
      const res = await emit('day:create-deal', {
        roomId,
        initiatorPhysicalId: myId,
        targetPhysicalId: Number(selectedTargetId),
      });
      if (!res.success) {
        setDealError(res.error || 'فشل إبرام الاتفاقية');
      } else {
        setSelectedTargetId('');
      }
    } catch (err: any) {
      setDealError(err.message || 'خطأ في الاتصال بالخادم');
    } finally {
      setDealSubmitting(false);
    }
  };


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
        <p className="text-[#666] text-xs mt-2">يُرجى الانتظار...</p>
      </motion.div>
    );
  }

  // ── توزيع الأدوار ──
  if (gamePhase === 'ROLE_BINDING') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
        <motion.div animate={{ rotateY: [0, 180, 360] }} transition={{ duration: 2, repeat: Infinity }} className="text-4xl mb-3">🎴</motion.div>
        <h3 className="text-lg font-bold text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>جاري توزيع الأدوار</h3>
        <p className="text-[#666] text-xs mt-2">يُرجى الانتظار...</p>
      </motion.div>
    );
  }

  if (gamePhase === 'DAY_DISCUSSION') {
    const ds = discussionState;
    const currentSpeaker = ds?.currentSpeakerId;
    const speakerInfo = ds?.speakers?.find((s: any) => s.physicalId === currentSpeaker);
    const speakers = ds?.speakers || [];
    const isMyTurn = currentSpeaker === myId;
    const isSpeaking = ds?.status === 'SPEAKING';
    const timeUp = discCountdown !== null && discCountdown <= 0 && isSpeaking;
    const totalTime = ds?.timeLimitSeconds || 60;

    return (
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="py-4">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🎤</div>
          <h3 className="text-lg font-bold text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>مرحلة النقاش</h3>
        </div>

        {/* تنبيه دور اللاعب */}
        <AnimatePresence>
          {isMyTurn && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              className="mx-2 mb-4 bg-gradient-to-r from-[#C5A059]/25 to-[#C5A059]/10 border-2 border-[#C5A059] rounded-2xl p-4 text-center"
              style={{ boxShadow: '0 0 30px rgba(197,160,89,0.3)' }}
            >
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <span className="text-4xl">{timeUp ? '🔇' : '🎙️'}</span>
              </motion.div>
              <p className="text-[#C5A059] font-black text-lg mt-2">
                {timeUp ? 'انتهى وقتك!' : 'دورك في النقاش!'}
              </p>
              <p className="text-[#C5A059]/70 text-xs mt-1">
                {timeUp ? 'يُرجى التوقف عن الكلام' : 'تحدّث الآن أمام الجميع'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* المتكلم الحالي + التايمر */}
        {speakerInfo ? (
          <motion.div
            key={currentSpeaker}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`border rounded-2xl p-5 mx-2 mb-4 text-center ${
              isMyTurn
                ? 'bg-gradient-to-br from-[#C5A059]/30 to-[#C5A059]/10 border-[#C5A059]'
                : 'bg-gradient-to-br from-[#C5A059]/20 to-[#C5A059]/5 border-[#C5A059]/30'
            }`}
            style={isMyTurn ? { boxShadow: '0 0 20px rgba(197,160,89,0.2)' } : {}}
          >
            <div className="w-16 h-16 rounded-full bg-[#C5A059]/20 border-2 border-[#C5A059] flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-black text-[#C5A059]">#{speakerInfo.physicalId}</span>
            </div>
            <p className="text-white font-bold text-lg">{speakerInfo.name || `لاعب #${speakerInfo.physicalId}`}</p>
            <p className="text-[#C5A059] text-xs font-bold mt-1">
              {timeUp ? 'انتهى الوقت' : isSpeaking ? 'يتحدث الآن' : 'بالانتظار'}
            </p>

            {/* التايمر الدائري */}
            {discCountdown !== null && isSpeaking && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <span className="text-2xl">{timeUp ? '🔇' : '🎙️'}</span>
                <div className="relative w-16 h-16">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1a1a2e" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.5" fill="none"
                      stroke={discCountdown <= 5 ? '#ef4444' : discCountdown <= 10 ? '#f59e0b' : '#C5A059'}
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${Math.max(0, (discCountdown / totalTime) * 97.4)} 97.4`}
                      style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease' }}
                    />
                  </svg>
                  <span className={`absolute inset-0 flex items-center justify-center text-lg font-black font-mono ${
                    discCountdown <= 5 ? 'text-red-400 animate-pulse' : discCountdown <= 10 ? 'text-amber-400' : 'text-white'
                  }`}>
                    {discCountdown}
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="text-center text-[#666] text-sm py-4 font-mono">بانتظار بدء النقاش...</div>
        )}

        {/* ── قسم الاتفاقيات التلقائية (Deals Section) ── */}
        {!isPlayerDead && (
          <div className="mx-2 mb-4 p-4 rounded-2xl bg-black/40 border border-[#C5A059]/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#C5A059] font-bold">🤝 الاتفاقيات الثنائية</span>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/20">
                {deals.length} / 3
              </span>
            </div>

            {pollData?.round === 1 ? (
              <div className="p-3.5 rounded-xl bg-black/20 border border-[#C5A059]/10 text-center">
                <p className="text-[#C5A059] text-xs font-bold">🤝 ميزة الديل (Deals)</p>
                <p className="text-[#666] text-[10px] mt-1.5 leading-relaxed">
                  🔒 الاتفاقيات غير متاحة في الجولة الأولى.<br />
                  سيبدأ تفعيل ميزة الديل تلقائياً بدءاً من الجولة الثانية.
                </p>
              </div>
            ) : (() => {
              const myDeal = deals.find(d => d.initiatorPhysicalId === myId);
              if (myDeal) {
                const targetPlayer = votingPlayersInfo.find(p => p.physicalId === myDeal.targetPhysicalId);
                return (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-green-500/10 border border-green-500/30 text-center">
                      <p className="text-green-400 text-sm font-bold">🤝 تم إبرام اتفاقيتك بنجاح!</p>
                      <p className="text-[#999] text-xs mt-1">
                        أنت شريك الآن مع: <strong className="text-white">
                          {targetPlayer?.name || `لاعب #${myDeal.targetPhysicalId}`}
                        </strong>
                      </p>
                    </div>
                    {/* تحذير المخاطرة */}
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center text-red-400 text-[11px] font-bold leading-relaxed">
                      ⚠️ مخاطرة: في حال تم إقصاء شريكك في الاتفاقية وكان مواطناً، فسيتم إقصاؤك معه تلقائياً!
                    </div>
                  </div>
                );
              }

              // إذا تم الوصول للحد الأقصى
              if (deals.length >= 3) {
                return (
                  <div className="p-4 rounded-xl bg-[#C5A059]/5 border border-[#C5A059]/10 text-center">
                    <p className="text-[#C5A059] text-xs font-bold">
                      🔒 تم الوصول للحد الأقصى للاتفاقيات في هذه الجولة (3/3)
                    </p>
                    <p className="text-[#666] text-[10px] mt-1">لا يمكن إرسال اتفاقيات جديدة حالياً</p>
                  </div>
                );
              }

              // نموذج إرسال اتفاقية جديدة
              const eligibleTargets = votingPlayersInfo.filter(p => p.physicalId !== myId);
              
              return (
                <div className="space-y-3">
                  {/* اختيار اللاعب */}
                  <select
                    value={selectedTargetId}
                    onChange={(e) => {
                      setSelectedTargetId(e.target.value ? Number(e.target.value) : '');
                      setDealError('');
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-[#C5A059] transition-colors"
                    disabled={dealSubmitting}
                  >
                    <option value="" className="bg-[#111] text-[#666]">-- اختر لاعباً لإبرام اتفاقية معه --</option>
                    {eligibleTargets.map(p => {
                      const isTargeted = deals.some(d => d.targetPhysicalId === p.physicalId);
                      return (
                        <option
                          key={p.physicalId}
                          value={p.physicalId}
                          disabled={isTargeted}
                          className="bg-[#111] text-white disabled:text-[#444]"
                        >
                          لاعب #{p.physicalId} - {p.name} {isTargeted ? ' (مستهدف 🔒)' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* زر التأكيد — عرض كامل */}
                  <button
                    onClick={handleCreateDeal}
                    disabled={!selectedTargetId || dealSubmitting}
                    className="w-full bg-gradient-to-r from-[#C5A059] to-[#b38e4b] hover:from-[#d6ae61] hover:to-[#c5a059] text-black font-bold px-4 py-3.5 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#C5A059]/10 flex items-center justify-center gap-2"
                  >
                    {dealSubmitting ? (
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      '🤝 إبرام اتفاقية'
                    )}
                  </button>

                  {dealError && (
                    <p className="text-red-400 text-xs text-center font-bold bg-red-500/10 border border-red-500/20 py-2 rounded-xl">
                      ❌ {dealError}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* قائمة ترتيب النقاش */}
        {speakers.length > 0 && (
          <div className="mx-2 space-y-1.5">
            <p className="text-[#666] text-[10px] font-bold mb-2 text-center">ترتيب النقاش</p>
            {speakers.map((s: any, i: number) => {
              const isCurrent = s.physicalId === currentSpeaker;
              const isDone = s.status === 'done';
              const isMe = s.physicalId === myId;
              return (
                <div key={s.physicalId}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                    isCurrent ? 'bg-[#C5A059]/15 border border-[#C5A059]/30' :
                    isDone ? 'bg-white/5 opacity-50' :
                    isMe ? 'bg-[#C5A059]/5 border border-[#C5A059]/10' : 'bg-white/5'
                  }`}
                >
                  <span className={`text-xs font-mono w-5 ${isCurrent ? 'text-[#C5A059]' : 'text-[#555]'}`}>{i + 1}</span>
                  <span className={`flex-1 text-sm ${
                    isCurrent ? 'text-white font-bold' :
                    isDone ? 'text-[#666] line-through' :
                    isMe ? 'text-[#C5A059] font-bold' : 'text-[#999]'
                  }`}>
                    {s.name || `#${s.physicalId}`}
                    {isMe && !isCurrent && !isDone && ' (أنت)'}
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
    // هل أنا صوّتت على أحد المتهمين؟ (نستخدم votersForAccused من الباك مباشرة مع حماية من تباين الأنواع)
    const iVotedForAccused = justificationData?.votersForAccused?.some((id: any) => String(id) === String(myId)) || false;
    // حساب العداد الفعلي — من الباك إن وُجد، وإلا من votersForAccused
    const totalVoters = justificationData?.votersForAccused?.length || 0;
    const effectiveNeeded = withdrawalNeeded || Math.ceil(totalVoters / 2);
    const effectiveCount = withdrawalCount;

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
              <p className="text-red-400 text-xs font-bold mt-1">{topVotes} صوت ضده</p>
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

        {/* سحب الصوت — يظهر بعد انتهاء التبرير لمن صوّت على المتهم */}
        {(withdrawalActive || justTimer === 0 || justificationData?.timerFinished) && iVotedForAccused && !isPlayerDead && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-2 mt-4 bg-gradient-to-br from-blue-500/15 to-blue-900/10 border border-blue-500/30 rounded-2xl p-4 text-center">
            <p className="text-blue-300 text-sm mb-2 font-bold">أنت صوّتت على هذا اللاعب</p>
            <p className="text-[#888] text-xs mb-3">هل تريد سحب صوتك؟ إذا سحب أكثر من النصف تُعاد عملية التصويت</p>
            <p className="text-[#666] text-xs mb-3 font-mono">{effectiveCount}/{effectiveNeeded} سحبوا أصواتهم</p>
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
                <p className="text-yellow-400 text-xs font-bold">{c.votes} صوت</p>
              </div>
            );
          })}
        </div>
        <p className="text-[#666] text-xs font-bold mt-4">بانتظار قرار الليدر...</p>
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
        <p className="text-[#555] text-xs font-bold mt-3">مرحلة الليل</p>
        
        {nightStepInfo && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 inline-block bg-[#111] border border-[#C5A059]/30 rounded-lg px-6 py-3">
            <p className="text-[#C5A059] text-sm font-bold animate-pulse" style={{ fontFamily: 'Amiri, serif' }}>
              جارٍ اختيار الهدف من قبل {nightStepInfo}...
            </p>
          </motion.div>
        )}

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
            <p className="text-[#666] text-xs mt-2">تم إخراجك من اللعبة</p>
          </motion.div>
        ) : myEvents.length === 0 ? (
          <p className="text-[#666] text-sm mt-6">بانتظار كشف الأحداث...</p>
        ) : (
          <div className="mt-4 mx-4 space-y-2">
            {myEvents.map((e: any, i: number) => {
              // ── ترجمة أنواع الأحداث للعربي ──
              const eventLabels: Record<string, { icon: string; text: string }> = {
                'ASSASSINATION': { icon: '💀', text: 'تم اغتيالك!' },
                'ASSASSINATION_BLOCKED': { icon: '🛡️', text: 'تم حمايتك من الاغتيال!' },
                'SNIPE_MAFIA': { icon: '🎯', text: 'تم قنصك!' },
                'SNIPE_CITIZEN': { icon: '🎯', text: 'تم قنصك!' },
                'SILENCED': { icon: '🤫', text: 'تم إسكاتك! لا يمكنك التحدث هذه الجولة.' },
                'SHERIFF_RESULT': { icon: '🔍', text: `نتيجة التحقيق: ${e.extra?.result === 'MAFIA' ? '🔴 مافيا' : '🟢 مواطن'}` },
                'PROTECTION_FAILED': { icon: '❌', text: 'فشلت الحماية! الهدف اُغتيل.' },
                'POLICEWOMAN_REVEAL': { icon: '👮', text: 'الشرطية كشفت هويتك!' },
              };
              const label = eventLabels[e.type] || { icon: '📋', text: e.type };

              return (
                <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.3 }}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <p className="text-white text-sm">{label.icon} {label.text}</p>
                </motion.div>
              );
            })}
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
          <p className="text-[#666] text-xs font-bold mt-2">
            {isMafiaWin ? 'سيطرة مطلقة' : 'العدالة انتصرت'}
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
