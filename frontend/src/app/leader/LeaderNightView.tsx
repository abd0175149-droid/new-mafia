'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MafiaCard from '@/components/MafiaCard';

interface LeaderNightViewProps {
  gameState: any;
  emit: (event: string, payload: any) => Promise<any>;
  setError: (err: string) => void;
}

// أيقونة + لون كل إجراء ليلي
const ACTION_META: Record<string, { icon: string; color: string; bgGlow: string }> = {
  GODFATHER:  { icon: '🔪', color: 'text-[#8A0303]', bgGlow: 'shadow-[0_0_40px_rgba(138,3,3,0.2)]' },
  SILENCER:   { icon: '🤐', color: 'text-[#555]',    bgGlow: 'shadow-[0_0_40px_rgba(85,85,85,0.2)]' },
  SHERIFF:    { icon: '🔍', color: 'text-[#C5A059]', bgGlow: 'shadow-[0_0_40px_rgba(197,160,89,0.2)]' },
  DOCTOR:     { icon: '💉', color: 'text-[#2E5C31]', bgGlow: 'shadow-[0_0_40px_rgba(46,92,49,0.2)]' },
  SNIPER:     { icon: '🎯', color: 'text-[#8A0303]', bgGlow: 'shadow-[0_0_40px_rgba(138,3,3,0.2)]' },
  NURSE:      { icon: '⚕️', color: 'text-[#2E5C31]', bgGlow: 'shadow-[0_0_40px_rgba(46,92,49,0.2)]' },
};

// أيقونة أحداث الصباح
const EVENT_META: Record<string, { icon: string; title: string; color: string; displayable: boolean }> = {
  ASSASSINATION:        { icon: '🩸', title: 'اغتيال ناجح',       color: 'text-[#8A0303]', displayable: true },
  ASSASSINATION_BLOCKED:{ icon: '🛡️', title: 'حماية ناجحة',       color: 'text-[#2E5C31]', displayable: true },
  PROTECTION_FAILED:    { icon: '💔', title: 'حماية فاشلة',       color: 'text-[#8B4513]', displayable: false },
  SILENCED:             { icon: '🤐', title: 'تم إسكات لاعب',     color: 'text-[#888]',    displayable: false },
  SNIPE_MAFIA:          { icon: '🎯', title: 'القناص نجح',        color: 'text-[#C5A059]', displayable: true },
  SNIPE_CITIZEN:        { icon: '💀', title: 'القناص فشل',        color: 'text-[#8A0303]', displayable: true },
  SHERIFF_RESULT:       { icon: '🔍', title: 'نتيجة التحقيق',     color: 'text-[#C5A059]', displayable: false },
};

export default function LeaderNightView({ gameState, emit, setError }: LeaderNightViewProps) {
  const [loading, setLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [revealedEvents, setRevealedEvents] = useState<Set<number>>(new Set());
  const [sheriffOverlay, setSheriffOverlay] = useState<any>(null);
  const [peekedCard, setPeekedCard] = useState<number | null>(null);
  const peekTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 👮‍♀️ حالة الشرطية
  const [policewomanTarget, setPolicewomanTarget] = useState<number | null>(null);
  const [policewomanLoading, setPolicewomanLoading] = useState(false);
  const [policewomanResult, setPolicewomanResult] = useState<any>(null);

  const [penalizingId, setPenalizingId] = useState<number | null>(null);
  const [penalizingLoading, setPenalizingLoading] = useState(false);
  const [showQuickPenalties, setShowQuickPenalties] = useState(false);

  const handleRecordPenalty = async (physicalId: number) => {
    setPenalizingLoading(true);
    try {
      await emit('leader:record-penalty', { roomId: gameState.roomId, targetPhysicalId: physicalId });
      setPenalizingId(null);
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل العقوبة');
    } finally {
      setPenalizingLoading(false);
    }
  };

  const renderWithGlobals = (content: React.ReactNode) => {
    const alivePlayers = (gameState.players || []).filter((p: any) => p.isAlive);
    return (
      <div className="relative min-h-screen pb-20">
        {content}

        {/* Floating ⚖️ button */}
        <button
          onClick={() => setShowQuickPenalties(true)}
          className="fixed bottom-6 right-6 z-45 bg-[#C5A059] text-black w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 cursor-pointer font-bold border border-[#C5A059]/50 hover:bg-[#b08b47] transition-all"
          title="نظام العقوبات السريع"
        >
          ⚖️
        </button>

        {/* Quick Penalties Drawer */}
        <AnimatePresence>
          {showQuickPenalties && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowQuickPenalties(false)}
                className="fixed inset-0 bg-black z-40"
              />
              {/* Drawer Panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full max-w-md bg-[#080808]/95 border-l border-[#2a2a2a] shadow-2xl z-50 p-6 flex flex-col backdrop-blur-md"
                dir="rtl"
              >
                <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚖️</span>
                    <h3 className="text-xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>نظام العقوبات السريع</h3>
                  </div>
                  <button
                    onClick={() => setShowQuickPenalties(false)}
                    className="text-[#808080] hover:text-white text-lg font-mono"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {alivePlayers.map((player: any) => (
                    <div key={player.physicalId} className="bg-[#111]/80 border border-[#2a2a2a] rounded-xl p-3 flex items-center justify-between group hover:border-amber-500/30 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#050505] border border-[#555] flex items-center justify-center font-mono font-bold text-white text-sm">
                          {player.physicalId}
                        </div>
                        <div>
                          <p className="text-white font-bold text-sm">{player.name}</p>
                          {/* Penalty Dots */}
                          <div className="flex gap-1 mt-1.5">
                            {Array.from({ length: gameState.config.maxPenalties || 3 }).map((_, idx) => (
                              <span
                                key={idx}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  idx < (player.penalties || 0) ? 'bg-red-500 animate-pulse shadow-[0_0_4px_#ef4444]' : 'bg-zinc-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setPenalizingId(player.physicalId);
                          setShowQuickPenalties(false);
                        }}
                        className="px-3 py-1.5 bg-amber-950/40 border border-amber-500/40 text-amber-400 rounded-lg text-xs font-mono font-bold hover:bg-amber-900/50 hover:scale-105 active:scale-95 transition-all flex items-center gap-1"
                      >
                        ⚠️ عقوبة
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Confirm Modal */}
        <AnimatePresence>
          {penalizingId !== null && (() => {
            const player = gameState.players.find((p: any) => p.physicalId === penalizingId);
            if (!player) return null;
            const currentPenalties = player.penalties || 0;
            const maxPenalties = gameState.config.maxPenalties || 3;
            const willBeKicked = currentPenalties + 1 >= maxPenalties;

            return (
              <>
                {/* Modal Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"
                />
                {/* Modal Content */}
                <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" dir="rtl">
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="w-full max-w-md bg-[#0a0a0a] border-2 border-amber-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden text-center"
                  >
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-amber-500" />
                    
                    <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 animate-bounce">
                      ⚠️
                    </div>

                    <h3 className="text-xl font-black text-amber-500 mb-2" style={{ fontFamily: 'Amiri, serif' }}>
                      تسجيل عقوبة جديدة
                    </h3>

                    <p className="text-white text-lg font-bold mb-1">
                      اللاعب: {player.name} (مقعد #{player.physicalId})
                    </p>

                    <div className="flex justify-center gap-1 mb-4">
                      {Array.from({ length: maxPenalties }).map((_, idx) => (
                        <span
                          key={idx}
                          className={`w-3 h-3 rounded-full ${
                            idx < currentPenalties ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-zinc-700'
                          }`}
                        />
                      ))}
                    </div>

                    <p className="text-zinc-400 text-xs leading-relaxed mb-6">
                      هذه ستكون <span className="text-amber-400 font-bold">العقوبة رقم {currentPenalties + 1}</span> من أصل {maxPenalties}.
                      <br/>
                      {currentPenalties + 1 < maxPenalties ? (
                        <span>باقي <span className="text-amber-400 font-bold">{maxPenalties - currentPenalties - 1}</span> عقوبة للإقصاء.</span>
                      ) : null}
                      {willBeKicked && (
                        <span className="block text-red-500 font-black text-sm mt-3 animate-pulse">
                          🚨 تحذير: سيتم طرد هذا اللاعب فوراً لتجاوزه الحد الأقصى للعقوبات!
                        </span>
                      )}
                    </p>

                    <div className="flex gap-4">
                      <button
                        onClick={() => handleRecordPenalty(player.physicalId)}
                        disabled={penalizingLoading}
                        className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                      >
                        {penalizingLoading ? 'جاري التسجيل...' : 'تأكيد وتسجيل'}
                      </button>
                      <button
                        onClick={() => setPenalizingId(null)}
                        disabled={penalizingLoading}
                        className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 rounded-lg transition-all active:scale-95"
                      >
                        إلغاء
                      </button>
                    </div>
                  </motion.div>
                </div>
              </>
            );
          })()}
        </AnimatePresence>
      </div>
    );
  };

  const renderContent = (content: React.ReactNode) => renderWithGlobals(content);

  // بدء الضغط المطول — إذا استمر 500ms → كشف الكارد
  const handleCardPressStart = useCallback((physicalId: number) => {
    longPressTimerRef.current = setTimeout(() => {
      setPeekedCard(physicalId);
      // إعادة الكارد بعد ثانيتين
      peekTimerRef.current = setTimeout(() => {
        setPeekedCard(null);
      }, 2000);
    }, 500);
  }, []);

  // إنهاء الضغط — إذا لم يكتمل 500ms → اختيار الهدف فقط
  const handleCardPressEnd = useCallback((physicalId: number) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // في وضع الأوتو، القائد لا يمكنه اختيار الأهداف
    if (gameState.config?.nightMode === 'auto') return;

    // إذا لم يكن الكارد مكشوفاً = ضغطة قصيرة → اختيار
    if (peekedCard !== physicalId) {
      setSelectedTarget(physicalId);
    }
  }, [peekedCard, gameState.config?.nightMode]);

  // تصفير الاختيار عند تغير الخطوة
  useEffect(() => {
    setSelectedTarget(null);
    setPeekedCard(null);
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, [gameState.nightStep?.role]);

  // تصفير الأحداث المكشوفة عند دخول morning recap
  useEffect(() => {
    if (gameState.phase === 'MORNING_RECAP') {
      setRevealedEvents(new Set());
      setSheriffOverlay(null);
    }
  }, [gameState.phase]);

  // عند وصول نتيجة الشريف → فتح الـ overlay الكبير (فقط في مرحلة الليل)
  useEffect(() => {
    if (gameState.sheriffResult && gameState.phase === 'NIGHT') {
      setSheriffOverlay(gameState.sheriffResult);
    }
  }, [gameState.sheriffResult, gameState.phase]);

  // مسح overlay الشريف عند دخول ليل جديد
  useEffect(() => {
    if (gameState.phase === 'NIGHT') {
      setSheriffOverlay(null);
    }
  }, [gameState.round]);

  const nightStep = gameState.nightStep;
  const nightComplete = gameState.nightComplete;
  const morningEvents = gameState.morningEvents || [];
  const meta = nightStep ? (ACTION_META[nightStep.role] || ACTION_META.GODFATHER) : null;

  // تحديد الهدف في وضع الأوتو
  const getAutoTargetId = (role: any) => {
    if (!gameState.nightActions) return null;
    switch (role) {
      case 'GODFATHER': case 'CHAMELEON': case 'MAFIA_REGULAR': return gameState.nightActions.godfatherTarget;
      case 'SILENCER': return gameState.nightActions.silencerTarget;
      case 'SHERIFF': return gameState.nightActions.sheriffTarget;
      case 'DOCTOR': return gameState.nightActions.doctorTarget;
      case 'NURSE': return gameState.nightActions.nurseTarget;
      case 'SNIPER': return gameState.nightActions.sniperTarget;
      default: return null;
    }
  };
  const autoTargetId = gameState.config?.nightMode === 'auto' && nightStep ? getAutoTargetId(nightStep.role) : null;

  // اللاعبين الأحياء
  const alivePlayers = (gameState.players || []).filter((p: any) => p.isAlive);

  // ── تأكيد الاختيار ──
  const handleSubmitAction = async () => {
    if (!nightStep || selectedTarget === null) return;
    setLoading(true);
    try {
      await emit('night:submit-action', {
        roomId: gameState.roomId,
        role: nightStep.role,
        targetPhysicalId: selectedTarget,
      });
      setSelectedTarget(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── تخطي الإجراء ──
  const handleSkipAction = async () => {
    if (!nightStep) return;
    setLoading(true);
    try {
      await emit('night:skip-action', {
        roomId: gameState.roomId,
        role: nightStep.role,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── معالجة التقاطعات ──
  const handleResolve = async () => {
    setLoading(true);
    try {
      await emit('night:resolve', { roomId: gameState.roomId });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── عرض حدث على شاشة العرض ──
  const handleDisplayEvent = async (index: number) => {
    try {
      await emit('night:display-event', {
        roomId: gameState.roomId,
        eventIndex: index,
      });
      setRevealedEvents(prev => new Set(prev).add(index));
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── بدء النهار ──
  const handleStartDay = async () => {
    setLoading(true);
    try {
      await emit('night:end-recap', { roomId: gameState.roomId });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── تأكيد إنهاء اللعبة (عند فوز ليلي) ──
  const handleConfirmEnd = async () => {
    setLoading(true);
    try {
      await emit('game:confirm-end', { roomId: gameState.roomId });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════
  // OVERLAY: نتيجة الشريف — كارد كبير مستقل
  // ══════════════════════════════════════════════════
  const renderSheriffOverlay = () => {
    if (!sheriffOverlay) return null;
    const isMafia = sheriffOverlay.result === 'MAFIA';
    const targetPlayer = gameState.players?.find((p: any) => p.physicalId === sheriffOverlay.targetPhysicalId);

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setSheriffOverlay(null)}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="flex flex-col items-center gap-6"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] font-mono text-[#808080] tracking-widest">🔒 LEADER EYES ONLY</p>

            {/* كرت اللاعب + بنر قطري */}
            <div className="relative overflow-hidden rounded-2xl">
              <MafiaCard
                playerNumber={sheriffOverlay.targetPhysicalId}
                playerName={targetPlayer?.name || sheriffOverlay.targetName || 'Unknown'}
                role={null}
                isFlipped={false}
                flippable={false}
                gender={targetPlayer?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                avatarUrl={targetPlayer?.avatarUrl || null}
                size="md"
                isAlive={true}
              />
              {/* البنر القطري */}
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.5, type: 'spring' }}
                className="absolute inset-0 pointer-events-none flex items-center justify-center"
              >
                <div
                  className={`absolute w-[200%] py-2 text-center font-black text-2xl tracking-widest shadow-lg ${
                    isMafia ? 'bg-[#8A0303]/90 text-white' : 'bg-[#2E5C31]/90 text-white'
                  }`}
                  style={{
                    fontFamily: 'Amiri, serif',
                    transform: 'rotate(35deg)',
                    boxShadow: isMafia
                      ? '0 0 30px rgba(138,3,3,0.6)'
                      : '0 0 30px rgba(46,92,49,0.6)',
                  }}
                >
                  {isMafia ? '🎭 مافيا' : '🏛 مواطن'}
                </div>
              </motion.div>
            </div>

            <button
              onClick={() => setSheriffOverlay(null)}
              className={`px-8 py-3 border font-mono text-xs uppercase tracking-widest transition-all rounded-lg ${
                isMafia
                  ? 'border-[#ff4444]/40 text-[#ff4444]/70 hover:text-[#ff4444] hover:border-[#ff4444]'
                  : 'border-[#44ff44]/40 text-[#44ff44]/70 hover:text-[#44ff44] hover:border-[#44ff44]'
              }`}
            >
              ✓ فهمت
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  };

  // ══════════════════════════════════════════════════
  // RENDER: 👮‍♀️ اختيار الشرطية (بعد ملخص الليل)
  // ══════════════════════════════════════════════════
  if (gameState.phase === 'MORNING_RECAP' && gameState.policewomanChoice && !policewomanResult) {
    const pwData = gameState.policewomanChoice;
    const handlePolicewomanExecute = async () => {
      if (policewomanTarget === null) return;
      setPolicewomanLoading(true);
      try {
        const res = await emit('policewoman:execute', {
          roomId: gameState.roomId,
          targetPhysicalId: policewomanTarget,
        });
        if (res.success) {
          setPolicewomanResult(res);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setPolicewomanLoading(false);
      }
    };

    const handlePolicewomanSkip = async () => {
      setPolicewomanLoading(true);
      try {
        await emit('policewoman:skip', { roomId: gameState.roomId });
        setPolicewomanResult(null);
        setPolicewomanTarget(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setPolicewomanLoading(false);
      }
    };

    return renderContent(
      <div className="h-full flex flex-col p-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <motion.span
              className="text-3xl"
              animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >👮‍♀️</motion.span>
            <div>
              <h2 className="text-xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>صلاحية الشرطية</h2>
              <p className="text-[#808080] font-mono text-[8px] tracking-widest uppercase">POLICEWOMAN ABILITY ACTIVATED</p>
            </div>
          </div>
        </div>

        {/* معلومات */}
        <div className="bg-[#1a0a2e]/60 border border-[#6a3d9a]/40 rounded-xl p-4 mb-4">
          <p className="text-[#a78bfa] text-sm font-bold mb-2" style={{ fontFamily: 'Amiri, serif' }}>
            🏅 {pwData.policewomanName} (#{pwData.policewomanPhysicalId})
          </p>
          <p className="text-[#808080] text-xs font-mono">
            المواطنون عند خروجها: <span className="text-white font-bold">{pwData.threshold * 4}</span> | العتبة: <span className="text-[#C5A059] font-bold">{pwData.threshold}</span> | الوفيات: <span className="text-[#ff4444] font-bold">{pwData.citizenDeaths}</span>
          </p>
          <p className="text-[#a78bfa]/70 text-[10px] font-mono mt-2 tracking-widest">
            اختر لاعباً لإقصائه — إذا كان مافيا ستحصل الشرطية على نقاط رانك
          </p>
        </div>

        {/* كروت اللاعبين */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-wrap justify-center gap-3">
            {pwData.targets.map((t: any) => {
              const isSelected = policewomanTarget === t.physicalId;
              const playerData = gameState.players?.find((p: any) => p.physicalId === t.physicalId);
              const playerPenalties = playerData?.penalties || 0;
              const maxPenalties = gameState.config.maxPenalties || 3;
              return (
                <div
                  key={t.physicalId}
                  onClick={() => setPolicewomanTarget(t.physicalId)}
                  className="relative group cursor-pointer select-none"
                >
                  {/* ⚠️ Penalty Button on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPenalizingId(t.physicalId);
                    }}
                    className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-[#201505] border border-amber-500/60 text-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-950 hover:scale-110 z-20 shadow-lg"
                    title="تسجيل عقوبة"
                  >
                    ⚠️
                  </button>

                  {/* Warning dots */}
                  {playerPenalties > 0 && (
                    <div className="absolute top-2 right-2 flex gap-1 z-25 bg-black/60 px-1.5 py-0.5 rounded-full border border-red-500/30">
                      {Array.from({ length: maxPenalties }).map((_, idx) => (
                        <span
                          key={idx}
                          className={`w-1.5 h-1.5 rounded-full ${
                            idx < playerPenalties ? 'bg-red-500 animate-pulse shadow-[0_0_4px_#ef4444]' : 'bg-zinc-700'
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  <MafiaCard
                    playerNumber={t.physicalId}
                    playerName={t.name}
                    role={null}
                    isFlipped={false}
                    flippable={false}
                    gender={playerData?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                    avatarUrl={playerData?.avatarUrl || null}
                    size="sm"
                    isAlive={true}
                    className={`transition-all duration-300 ${
                      isSelected ? 'ring-2 ring-[#a78bfa] shadow-lg scale-[1.05]' : ''
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* أزرار */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#2a2a2a] mt-4 shrink-0">
          <button
            onClick={handlePolicewomanExecute}
            disabled={policewomanTarget === null || policewomanLoading}
            className={`py-4 border font-mono text-sm uppercase tracking-widest transition-all rounded-lg ${
              policewomanTarget !== null
                ? 'border-[#a78bfa] text-[#a78bfa] hover:bg-[#a78bfa]/10'
                : 'border-[#1a1a1a] text-[#333] cursor-not-allowed'
            }`}
          >
            {policewomanLoading ? '...' : '⚡ تنفيذ الإقصاء'}
          </button>
          <button
            onClick={handlePolicewomanSkip}
            disabled={policewomanLoading}
            className="py-4 border border-[#333] text-[#555] font-mono text-sm uppercase tracking-widest hover:border-[#555] hover:text-[#808080] transition-all rounded-lg"
          >
            ⏭ تخطي
          </button>
        </div>
      </div>
    );
  }

  // 👮‍♀️ نتيجة إقصاء الشرطية — عرض مؤقت ثم الانتقال للنهار أو إنهاء اللعبة
  if (policewomanResult) {
    const isMafia = policewomanResult.targetIsMafia;
    const hasPendingWinner = !!policewomanResult.pendingWinner;
    return renderContent(
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="text-6xl">{isMafia ? '🎯' : '💔'}</div>
          <h2 className="text-2xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>
            {isMafia ? 'الشرطية أصابت! 🎭' : 'الشرطية أخطأت'}
          </h2>
          <p className={`text-lg font-bold ${isMafia ? 'text-[#C5A059]' : 'text-[#8A0303]'}`}>
            #{policewomanResult.targetName} — {policewomanResult.targetRole}
          </p>
          {isMafia && (
            <p className="text-[#a78bfa] text-sm font-mono">+نقاط رانك للشرطية 🏆</p>
          )}

          {/* إذا فيه فائز معلق → زر إنهاء اللعبة */}
          {hasPendingWinner ? (
            <div className="flex flex-col items-center gap-3 mt-4">
              <div className="text-4xl">{policewomanResult.pendingWinner === 'MAFIA' ? '🩸' : '⚖️'}</div>
              <h3 className="text-lg font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>
                {policewomanResult.pendingWinner === 'MAFIA' ? 'المافيا انتصرت!' : 'المدينة انتصرت!'}
              </h3>
              <button
                onClick={async () => {
                  setPolicewomanResult(null);
                  setPolicewomanTarget(null);
                  try {
                    await emit('game:confirm-end', { roomId: gameState.roomId });
                  } catch (err: any) {
                    setError(err.message);
                  }
                }}
                className="btn-premium px-12 py-4 !text-sm !border-[#C5A059] mt-2"
              >
                <span>🏁 عرض النتائج</span>
              </button>
            </div>
          ) : (
            <button
              onClick={async () => {
                setPolicewomanResult(null);
                setPolicewomanTarget(null);
                // الانتقال للنهار
                try {
                  await emit('night:end-recap', { roomId: gameState.roomId });
                } catch (err: any) {
                  setError(err.message);
                }
              }}
              className="btn-premium px-12 py-4 !text-sm !border-[#C5A059] mt-4"
            >
              <span>☀️ متابعة لنقاش اليوم</span>
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // RENDER: MORNING_RECAP — ملخص الصباح المرحلي
  // ══════════════════════════════════════════════════
  if (gameState.phase === 'MORNING_RECAP') {
    const displayableEvents = morningEvents.filter((_: any, i: number) => {
      const e = morningEvents[i];
      const m = EVENT_META[e.type];
      return m?.displayable !== false;
    });

    const allRevealed = displayableEvents.every((_: any, i: number) => {
      const originalIndex = morningEvents.findIndex((e: any) => e === displayableEvents[i]);
      return revealedEvents.has(originalIndex);
    });

    return renderContent(
      <div className="h-full flex flex-col p-4 overflow-hidden">
        {renderSheriffOverlay()}

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">☀️</span>
            <div>
              <h2 className="text-xl font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>ملخص الليلة</h2>
              <p className="text-[#808080] font-mono text-[8px] tracking-widest uppercase">MORNING INTELLIGENCE BRIEFING</p>
            </div>
          </div>
          <div className="flex items-center gap-2 opacity-60">
            <span className="text-[#C5A059] font-mono text-[9px] tracking-widest uppercase">MAFIA CLUB</span>
            <span className="text-xl">🎭</span>
          </div>
        </div>

        {/* ── Two Columns ── */}
        <div className="flex-1 flex gap-4 overflow-hidden min-h-0">

          {/* ═══ العمود الأيمن: أحداث الليل ═══ */}
          <div className="w-[35%] shrink-0 flex flex-col min-w-0 overflow-y-auto">
            <p className="text-[#808080] font-mono text-[8px] tracking-widest uppercase mb-3 text-center">
              📋 NIGHT EVENTS — {morningEvents.length} REPORT{morningEvents.length !== 1 ? 'S' : ''}
            </p>

            {morningEvents.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-[#555] font-mono text-sm tracking-widest uppercase">لا أحداث هذه الليلة</p>
                  <p className="text-[#333] font-mono text-xs mt-2">NO CASUALTIES REPORTED</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {morningEvents.map((event: any, index: number) => {
                  const evMeta = EVENT_META[event.type] || { icon: '❓', title: event.type, color: 'text-[#808080]', displayable: true };
                  const isRevealed = revealedEvents.has(index);
                  const isSheriff = event.type === 'SHERIFF_RESULT';
                  const isBlocked = event.type === 'ASSASSINATION_BLOCKED';

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.15 }}
                      className={`border p-4 bg-black/60 relative overflow-hidden rounded-lg ${
                        isRevealed ? 'border-[#2E5C31]/40' :
                        isSheriff ? 'border-[#C5A059]/40' : 'border-[#2a2a2a]'
                      }`}
                    >
                      <div className={`absolute top-0 left-0 w-1 h-full ${evMeta.color.replace('text-', 'bg-')}`} />

                      <div className="flex items-start gap-3 pl-2">
                        <div className="text-2xl shrink-0">{evMeta.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className={`font-bold text-sm ${evMeta.color}`} style={{ fontFamily: 'Amiri, serif' }}>
                              {evMeta.title}
                            </h3>
                            {event.wasRandom && (
                              <span className="px-1.5 py-0.5 bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059] text-[7px] font-mono tracking-widest rounded-sm">
                                🎲 AUTO
                              </span>
                            )}
                          </div>

                          {/* بيانات المنفذ (لكل الأحداث) */}
                          {event.performerPhysicalId && (
                            <p className="text-[#555] text-[9px] font-mono mt-0.5 tracking-wider">
                              ← #{event.performerPhysicalId} {event.performerName}
                            </p>
                          )}

                          {event.type === 'ASSASSINATION' && (
                            <p className="text-white text-xs font-mono mt-1">
                              #{event.targetPhysicalId} — {event.targetName}
                              {event.extra?.targetRole && (
                                <span className="text-[#555] text-[9px] ml-2">({event.extra.targetRole})</span>
                              )}
                            </p>
                          )}
                          {isBlocked && (
                            <div className="mt-1">
                              <p className="text-[#2E5C31] text-xs font-mono">
                                🛡️ #{event.targetPhysicalId} — {event.targetName} — تم إنقاذه
                              </p>
                              {event.extra?.assassinName && (
                                <p className="text-[#8A0303]/60 text-[9px] font-mono mt-0.5">
                                  🔪 المغتال: #{event.extra.assassinId} {event.extra.assassinName}
                                  {event.extra.wasAssassinRandom && <span className="text-[#C5A059]"> 🎲</span>}
                                </p>
                              )}
                            </div>
                          )}
                          {event.type === 'SNIPE_MAFIA' && (
                            <p className="text-[#C5A059] text-xs font-mono mt-1">
                              🎯 #{event.targetPhysicalId} — {event.targetName}
                              {event.extra?.targetRole && (
                                <span className="text-[#555] text-[9px] ml-2">({event.extra.targetRole})</span>
                              )}
                            </p>
                          )}
                          {event.type === 'SNIPE_CITIZEN' && (
                            <div className="mt-1">
                              <p className="text-[#8A0303] text-xs font-mono">
                                💀 الهدف: #{event.targetPhysicalId} — {event.targetName}
                              </p>
                              {event.extra?.sniperName && (
                                <p className="text-[#8A0303]/60 text-[9px] font-mono mt-0.5">
                                  💀 القناص: #{event.extra.sniperPhysicalId} {event.extra.sniperName} (ميت أيضاً)
                                </p>
                              )}
                            </div>
                          )}
                          {event.type === 'SILENCED' && (
                            <p className="text-[#888] text-xs font-mono mt-1">#{event.targetPhysicalId} — {event.targetName}</p>
                          )}
                          {event.type === 'PROTECTION_FAILED' && (
                            <p className="text-[#8B4513] text-xs font-mono mt-1">حُمي #{event.targetPhysicalId} — {event.targetName} لكن الاغتيال استهدف شخصاً آخر</p>
                          )}

                          {isSheriff && event.extra && (
                            <div className={`mt-2 p-2 border rounded text-center ${
                              event.extra.result === 'MAFIA'
                                ? 'border-[#ff4444]/50 bg-[#ff4444]/10'
                                : 'border-[#44ff44]/50 bg-[#44ff44]/10'
                            }`}>
                              <p className="text-[9px] font-mono text-[#555] mb-1 tracking-widest">🔒 LEADER ONLY</p>
                              <p className={`text-xl font-black ${
                                event.extra.result === 'MAFIA' ? 'text-[#ff4444]' : 'text-[#44ff44]'
                              }`} style={{ fontFamily: 'Amiri, serif' }}>
                                {event.extra.result === 'MAFIA' ? '🎭 مافيا' : '🏛 مواطن'}
                              </p>
                              <p className="text-[#808080] text-[9px] font-mono mt-1">
                                #{event.targetPhysicalId} — {event.targetName}
                              </p>
                            </div>
                          )}
                        </div>

                        {evMeta.displayable && (
                          <button
                            onClick={() => handleDisplayEvent(index)}
                            className={`shrink-0 px-3 py-1.5 border font-mono text-[10px] uppercase tracking-widest transition-all rounded ${
                              isRevealed
                                ? 'border-[#555]/40 text-[#808080] hover:bg-[#333]/30 hover:border-[#808080]'
                                : 'border-[#C5A059]/50 text-[#C5A059] hover:bg-[#C5A059]/10 hover:border-[#C5A059] animate-pulse'
                            }`}
                          >
                            {isRevealed ? '🔄 إعادة' : '👁 عرض'}
                          </button>
                        )}

                        {isSheriff && (
                          <div className="shrink-0 px-2 py-1 border border-[#C5A059]/30 text-[#C5A059] font-mono text-[8px] tracking-widest rounded">
                            سري
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* زر بدء النهار أو إنهاء اللعبة */}
            <div className="mt-auto pt-4 border-t border-[#2a2a2a]">
              {gameState.pendingWinner ? (
                <div className="text-center">
                  <div className="text-4xl mb-2">{gameState.pendingWinner === 'MAFIA' ? '🩸' : '⚖️'}</div>
                  <h3 className="text-lg font-black text-white mb-1" style={{ fontFamily: 'Amiri, serif' }}>
                    {gameState.pendingWinner === 'MAFIA' ? 'المافيا انتصرت!' : 'المدينة انتصرت!'}
                  </h3>
                  <button
                    onClick={handleConfirmEnd}
                    disabled={loading || (!allRevealed && displayableEvents.length > 0)}
                    className="btn-premium px-8 py-3 !text-sm w-full !border-[#C5A059] mt-3"
                  >
                    <span>🏁 عرض النتائج</span>
                  </button>
                  {!allRevealed && displayableEvents.length > 0 && (
                    <p className="text-[#555] font-mono text-[8px] mt-2 tracking-widest">اعرض جميع الأحداث أولاً</p>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <button
                    onClick={handleStartDay}
                    disabled={loading || (!allRevealed && displayableEvents.length > 0)}
                    className={`btn-premium px-8 py-3 !text-sm w-full group ${
                      allRevealed || displayableEvents.length === 0
                        ? '!border-[#C5A059]'
                        : '!border-[#2a2a2a] grayscale opacity-50'
                    }`}
                  >
                    <span className="text-white group-hover:tracking-[0.15em] transition-all">
                      ☀️ بدء نقاش اليوم الجديد
                    </span>
                  </button>
                  {!allRevealed && displayableEvents.length > 0 && (
                    <p className="text-[#555] font-mono text-[8px] mt-2 tracking-widest">اعرض جميع الأحداث أولاً</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══ العمود الأيسر: كروت اللاعبين الأحياء ═══ */}
          <div className="flex-1 flex flex-col overflow-y-auto border-r border-[#2a2a2a] pr-4">
            <p className="text-[#555] font-mono text-[8px] tracking-widest uppercase mb-3 text-center">
              🎴 SURVIVING AGENTS — {alivePlayers.length} REMAINING
            </p>
            <div className="flex flex-wrap justify-center gap-2 content-start">
              {alivePlayers.map((p: any) => {
                const isPeeked = peekedCard === p.physicalId;
                const playerPenalties = p.penalties || 0;
                const maxPenalties = gameState.config.maxPenalties || 3;
                return (
                  <div
                    key={p.physicalId}
                    onPointerDown={() => handleCardPressStart(p.physicalId)}
                    onPointerUp={() => handleCardPressEnd(p.physicalId)}
                    onPointerLeave={() => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                    }}
                    className="relative group cursor-pointer select-none"
                  >
                    {/* ⚠️ Penalty Button on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPenalizingId(p.physicalId);
                      }}
                      className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-[#201505] border border-amber-500/60 text-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-950 hover:scale-110 z-20 shadow-lg"
                      title="تسجيل عقوبة"
                    >
                      ⚠️
                    </button>

                    {/* Warning dots */}
                    {playerPenalties > 0 && (
                      <div className="absolute top-2 right-2 flex gap-1 z-25 bg-black/60 px-1.5 py-0.5 rounded-full border border-red-500/30">
                        {Array.from({ length: maxPenalties }).map((_, idx) => (
                          <span
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full ${
                              idx < playerPenalties ? 'bg-red-500 animate-pulse shadow-[0_0_4px_#ef4444]' : 'bg-zinc-700'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    <MafiaCard
                      playerNumber={p.physicalId}
                      playerName={p.name}
                      role={p.role || null}
                      isFlipped={isPeeked}
                      flippable={false}
                      gender={p.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                      avatarUrl={p.avatarUrl || null}
                      size="sm"
                      isAlive={true}
                    />
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // RENDER: NIGHT — Queue Complete — انتهى الطابور
  // ══════════════════════════════════════════════════
  if (nightComplete) {
    return renderContent(
      <div className="flex flex-col items-center justify-center p-12 text-center">
        {renderSheriffOverlay()}
        <motion.div
          className="text-7xl mb-6 grayscale opacity-60"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          ⚙️
        </motion.div>
        <h2 className="text-2xl font-black text-white mb-3" style={{ fontFamily: 'Amiri, serif' }}>
          اكتمل طابور الليل
        </h2>
        <p className="text-[#808080] font-mono uppercase text-xs tracking-widest mb-8">
          ALL NIGHT ACTIONS REGISTERED • READY FOR RESOLUTION
        </p>

        <button
          onClick={handleResolve}
          disabled={loading}
          className="btn-premium px-16 py-6 !text-xl !border-[#C5A059] animate-pulse"
        >
          <span className="text-white">{loading ? 'جارٍ المعالجة...' : '⚡ معالجة تقاطعات الليل'}</span>
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // RENDER: NIGHT — Queue Step — خطوة في الطابور
  // ══════════════════════════════════════════════════
  if (nightStep && meta) {
    return renderContent(
      <div className="p-4 pb-8">
        {renderSheriffOverlay()}

        {/* ── الهيدر: عنوان + شريط تقدم ── */}
        <div className="flex items-center justify-between mb-4 border-b border-[#2a2a2a] pb-3">
          <div className="flex items-center gap-2">
            <motion.div
              className="text-2xl"
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
            >🌑</motion.div>
            <div>
              <h2 className="text-base font-black text-white" style={{ fontFamily: 'Amiri, serif' }}>مرحلة الليل</h2>
              <p className="text-[#808080] font-mono uppercase text-[7px] tracking-widest">ROUND {gameState.round || '?'}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {['GODFATHER', 'SILENCER', 'SHERIFF', 'DOCTOR', 'SNIPER'].map((role) => {
              const roleMeta = ACTION_META[role];
              const isCurrent = nightStep.role === role;
              const isPast = ['GODFATHER', 'SILENCER', 'SHERIFF', 'DOCTOR', 'SNIPER'].indexOf(role) <
                             ['GODFATHER', 'SILENCER', 'SHERIFF', 'DOCTOR', 'SNIPER'].indexOf(nightStep.role);
              return (
                <div key={role} className="flex flex-col items-center gap-0.5">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all ${
                    isCurrent ? 'bg-[#1a1a1a] border border-[#C5A059]/50 shadow-[0_0_10px_rgba(197,160,89,0.2)]' :
                    isPast ? 'bg-[#111] border border-[#333]' : 'bg-[#0a0a0a] border border-[#1a1a1a]'
                  }`}>
                    <span className={isCurrent ? '' : isPast ? 'grayscale opacity-40' : 'grayscale opacity-20'}>{roleMeta?.icon || '?'}</span>
                  </div>
                  {isCurrent && <div className="w-1 h-1 rounded-full bg-[#C5A059]" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── شريط المؤدي: أيقونة + اسم الدور + رقم واسم اللاعب ── */}
        <motion.div
          key={nightStep.role}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-3 p-3 rounded-xl border border-[#2a2a2a] bg-black/40 mb-5 ${meta.bgGlow}`}
        >
          <motion.span
            className="text-3xl shrink-0"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >{meta.icon}</motion.span>
          <div className="flex-1 min-w-0">
            <h3 className={`text-lg font-black ${meta.color}`} style={{ fontFamily: 'Amiri, serif' }}>
              {nightStep.roleName}
            </h3>
          </div>
          <div className="shrink-0 flex items-center gap-2 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-1.5">
            <span className={`text-xl font-mono font-black ${meta.color}`}>#{nightStep.performerPhysicalId}</span>
            <span className="text-white text-sm font-bold" style={{ fontFamily: 'Amiri, serif' }}>{nightStep.performerName}</span>
          </div>
        </motion.div>

        {/* ── اختيار الهدف ── */}
        <label className="block text-[9px] font-mono text-[#808080] mb-3 tracking-widest uppercase text-center">
          🎯 اختر الهدف — SELECT TARGET
          <span className="block text-[7px] text-[#555] mt-1">اضغط مطولاً على الكارد لكشف الدور</span>
        </label>
        <div className="flex flex-wrap justify-center gap-3 mb-5">
          {nightStep.availableTargets.map((target: any) => {
            const isSelected = gameState.config?.nightMode === 'auto' 
              ? autoTargetId === target.physicalId 
              : selectedTarget === target.physicalId;
            const targetPlayer = gameState.players?.find((p: any) => p.physicalId === target.physicalId);
            const isPeeked = peekedCard === target.physicalId;
            const playerPenalties = targetPlayer?.penalties || 0;
            const maxPenalties = gameState.config.maxPenalties || 3;
            return (
              <div
                key={target.physicalId}
                onPointerDown={() => handleCardPressStart(target.physicalId)}
                onPointerUp={() => handleCardPressEnd(target.physicalId)}
                onPointerLeave={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                className="relative group cursor-pointer select-none"
              >
                {/* ⚠️ Penalty Button on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPenalizingId(target.physicalId);
                  }}
                  className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-[#201505] border border-amber-500/60 text-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-950 hover:scale-110 z-20 shadow-lg"
                  title="تسجيل عقوبة"
                >
                  ⚠️
                </button>

                {/* Warning dots */}
                {playerPenalties > 0 && (
                  <div className="absolute top-2 right-2 flex gap-1 z-25 bg-black/60 px-1.5 py-0.5 rounded-full border border-red-500/30">
                    {Array.from({ length: maxPenalties }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`w-1.5 h-1.5 rounded-full ${
                          idx < playerPenalties ? 'bg-red-500 animate-pulse shadow-[0_0_4px_#ef4444]' : 'bg-zinc-700'
                        }`}
                      />
                    ))}
                  </div>
                )}

                <MafiaCard
                  playerNumber={target.physicalId}
                  playerName={target.name}
                  role={targetPlayer?.role || null}
                  isFlipped={isPeeked}
                  flippable={false}
                  gender={targetPlayer?.gender === 'FEMALE' ? 'FEMALE' : 'MALE'}
                  avatarUrl={targetPlayer?.avatarUrl || null}
                  size={nightStep.availableTargets.length <= 12 ? 'md' : 'sm'}
                  isAlive={true}
                  className={`transition-all duration-300 ${
                    isSelected
                      ? `ring-2 ${meta.color.replace('text-', 'ring-')} shadow-lg scale-[1.03]`
                      : ''
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* أزرار الإجراء أو رسالة الأوتو */}
        {gameState.config?.nightMode === 'auto' ? (
          <div className="bg-[#111] border border-[#333] rounded-xl p-4 text-center mt-4">
            {autoTargetId ? (
              <div className="animate-pulse">
                <p className="text-[#4ade80] font-mono text-sm uppercase tracking-widest mb-1">✅ تم اختيار الهدف بنجاح</p>
                <p className="text-[#808080] text-[10px] font-mono tracking-widest uppercase">
                  (سينتقل للخطوة التالية قريباً)
                </p>
              </div>
            ) : (
              <p className="text-[#C5A059] font-mono text-sm uppercase tracking-widest animate-pulse">
                📱 يختار اللاعبون من أجهزتهم...
              </p>
            )}
          </div>
        ) : (
          <div className={`grid ${nightStep.canSkip ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mt-4`}>
            <button
              onClick={handleSubmitAction}
              disabled={selectedTarget === null || loading}
              className={`py-4 border font-mono text-sm uppercase tracking-widest transition-all rounded-lg ${
                selectedTarget !== null
                  ? `${meta.color.replace('text-', 'border-')} text-white hover:bg-white/5`
                  : 'border-[#1a1a1a] text-[#333] cursor-not-allowed'
              }`}
            >
              {loading ? '...' : '✅ تأكيد'}
            </button>

            {nightStep.canSkip && (
              <button
                onClick={handleSkipAction}
                disabled={loading}
                className="py-4 border border-[#333] text-[#555] font-mono text-sm uppercase tracking-widest hover:border-[#555] hover:text-[#808080] transition-all rounded-lg"
              >
                ⏭ تخطي
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // RENDER: NIGHT — انتظار بيانات الليل
  // ══════════════════════════════════════════════════
  return renderContent(
    <div className="flex flex-col items-center justify-center p-12 text-center">
      {renderSheriffOverlay()}
      <motion.div
        className="text-7xl mb-6 grayscale opacity-40"
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        🌑
      </motion.div>
      <p className="text-[#555] font-mono text-sm tracking-widest uppercase">AWAITING NIGHT DATA...</p>
    </div>
  );
}
