'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

// ── أسماء الأدوار بالعربي ──
const ROLE_NAMES_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا',
  SILENCER: 'قص المافيا',
  CHAMELEON: 'حرباية المافيا',
  MAFIA_REGULAR: 'مافيا عادي',
  SHERIFF: 'الشريف',
  DOCTOR: 'الطبيب',
  SNIPER: 'القناص',
  POLICEWOMAN: 'الشرطية',
  NURSE: 'الممرضة',
  CITIZEN: 'مواطن صالح',
};

const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];

interface PlayerData {
  physicalId: number;
  name: string;
  role: string | null;
  isAlive: boolean;
  gender: string;
  addedBy: 'self' | 'leader';
}

// ══════════════════════════════════════════════════════
// المرحلة 1: جدول اختيار اللاعبين
// ══════════════════════════════════════════════════════
function PlayerSelectionTable({
  players,
  gameName,
  onStartReveal,
}: {
  players: PlayerData[];
  gameName: string;
  onStartReveal: (selected: PlayerData[]) => void;
}) {
  // تهيئة: اللاعبين اليدويين مختارين تلقائياً
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    players.forEach(p => {
      if (p.addedBy === 'leader') initial.add(p.physicalId);
    });
    return initial;
  });

  const togglePlayer = (physicalId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(physicalId)) {
        next.delete(physicalId);
      } else {
        next.add(physicalId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === players.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(players.map(p => p.physicalId)));
    }
  };

  const selectedPlayers = players
    .filter(p => selected.has(p.physicalId))
    .sort((a, b) => a.physicalId - b.physicalId);

  return (
    <div className="min-h-screen bg-black p-4 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="text-center mb-6 pt-2">
        <h1 className="text-2xl font-black text-[#C5A059] mb-1" style={{ fontFamily: 'Amiri, serif' }}>
          عرض الأدوار
        </h1>
        {gameName && (
          <p className="text-zinc-600 font-mono text-[10px] tracking-[0.3em] uppercase">{gameName}</p>
        )}
        <p className="text-zinc-500 text-xs mt-2">
          اختر اللاعبين الذين تريد عرض أدوارهم بشكل متسلسل
        </p>
      </div>

      {/* Select All */}
      <div className="flex items-center justify-between mb-3 px-2">
        <button
          onClick={toggleAll}
          className="text-[11px] font-mono text-[#C5A059]/70 hover:text-[#C5A059] transition-colors"
        >
          {selected.size === players.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
        </button>
        <span className="text-[11px] font-mono text-zinc-600">
          {selected.size} / {players.length} مختار
        </span>
      </div>

      {/* Players Table */}
      <div className="flex-1 overflow-y-auto space-y-1.5 mb-4">
        {players
          .sort((a, b) => a.physicalId - b.physicalId)
          .map(player => {
            const isChecked = selected.has(player.physicalId);
            const isManual = player.addedBy === 'leader';

            return (
              <div
                key={player.physicalId}
                onClick={() => togglePlayer(player.physicalId)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                  isChecked
                    ? 'bg-[#C5A059]/10 border-[#C5A059]/30'
                    : 'bg-zinc-900/30 border-zinc-800/50 hover:border-zinc-700'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  isChecked
                    ? 'bg-[#C5A059] border-[#C5A059]'
                    : 'border-zinc-600 bg-transparent'
                }`}>
                  {isChecked && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>

                {/* Player Number */}
                <div className="w-10 h-10 flex items-center justify-center bg-black border border-[#C5A059]/30 rounded-lg text-[#C5A059] font-mono font-bold text-lg flex-shrink-0">
                  {player.physicalId}
                </div>

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-bold truncate" style={{ fontFamily: 'Amiri, serif' }}>
                    {player.name}
                  </p>
                  <p className="text-zinc-500 text-[10px] font-mono">
                    {isManual ? '📋 مُدخل يدوياً' : '📱 مسجّل ذاتياً'}
                  </p>
                </div>

                {/* Gender indicator */}
                <span className={`text-[10px] ${player.gender === 'FEMALE' ? 'text-purple-400' : 'text-zinc-600'}`}>
                  {player.gender === 'FEMALE' ? '♀' : '♂'}
                </span>
              </div>
            );
          })}
      </div>

      {/* Start Reveal Button */}
      <div className="sticky bottom-0 bg-black pt-3 pb-4 border-t border-zinc-800/50">
        <button
          onClick={() => onStartReveal(selectedPlayers)}
          disabled={selectedPlayers.length === 0}
          className="w-full py-4 rounded-xl font-mono text-sm uppercase tracking-[0.2em] font-bold transition-all duration-300 border-2 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: selectedPlayers.length > 0
              ? 'linear-gradient(135deg, rgba(197,160,89,0.15), rgba(197,160,89,0.05))'
              : 'transparent',
            borderColor: selectedPlayers.length > 0 ? 'rgba(197,160,89,0.5)' : 'rgba(100,100,100,0.3)',
            color: selectedPlayers.length > 0 ? '#C5A059' : '#555',
          }}
        >
          🎬 عرض أدوار {selectedPlayers.length} لاعب
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// المرحلة 2: عرض الكاردات بشكل متسلسل
// ══════════════════════════════════════════════════════
function CardRevealFlow({
  players,
  gameName,
  onBack,
}: {
  players: PlayerData[];
  gameName: string;
  onBack: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const goNext = () => {
    if (currentIndex < players.length - 1) {
      setFlipped(false);
      setTimeout(() => setCurrentIndex(prev => prev + 1), 200);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setFlipped(false);
      setTimeout(() => setCurrentIndex(prev => prev - 1), 200);
    }
  };

  const currentPlayer = players[currentIndex];
  const isMafia = currentPlayer?.role ? MAFIA_ROLES.includes(currentPlayer.role) : false;
  const isLast = currentIndex === players.length - 1;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 select-none overflow-hidden"
         dir="rtl" style={{ fontFamily: 'Amiri, serif' }}>

      {/* ── رأس الصفحة ── */}
      <div className="absolute top-4 left-0 right-0 text-center z-10">
        <p className="text-[#808080] text-[10px] font-mono uppercase tracking-widest">
          {gameName} — CARD REVEAL
        </p>
        <p className="text-[#C5A059] text-[11px] font-mono mt-1">
          {currentIndex + 1} / {players.length}
        </p>
      </div>

      {/* زر العودة */}
      <button
        onClick={onBack}
        className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full border border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
      >
        ✕
      </button>

      {/* ── الكارد الرئيسي ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPlayer.physicalId}
          initial={{ scale: 0.8, opacity: 0, x: 100 }}
          animate={{ scale: 1, opacity: 1, x: 0 }}
          exit={{ scale: 0.8, opacity: 0, x: -100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="w-full max-w-sm mx-auto"
          style={{ perspective: '1200px' }}
        >
          <motion.div
            onClick={() => setFlipped(prev => !prev)}
            className="relative w-full cursor-pointer"
            style={{ aspectRatio: '2/3', transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d' as any }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.42, 0, 0.58, 1] }}
          >
            {/* ── الوجه الأمامي (السري) ── */}
            <div
              className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden' as any,
                transform: 'translateZ(0)',
                background: 'linear-gradient(145deg, #0a0a0a, #1a1a1a)',
                border: '2px solid rgba(197, 160, 89, 0.3)',
                boxShadow: '0 0 60px rgba(197, 160, 89, 0.05), inset 0 0 60px rgba(0,0,0,0.5)',
              }}
            >
              <div className="text-7xl font-black text-[#C5A059] mb-4"
                   style={{ textShadow: '0 0 30px rgba(197,160,89,0.3)' }}>
                {currentPlayer.physicalId}
              </div>
              <p className="text-2xl text-[#C5A059]/80 mb-8">{currentPlayer.name}</p>
              <motion.p
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-[#555] text-[10px] font-mono uppercase tracking-widest"
              >
                TAP TO REVEAL ROLE
              </motion.p>
            </div>

            {/* ── الوجه الخلفي (الكشف) ── */}
            <div
              className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden' as any,
                transform: 'rotateY(180deg) translateZ(0)',
                background: isMafia
                  ? 'linear-gradient(145deg, #1a0000, #2d0000)'
                  : 'linear-gradient(145deg, #000d1a, #001a33)',
                border: `2px solid ${isMafia ? 'rgba(139, 0, 0, 0.5)' : 'rgba(0, 100, 200, 0.3)'}`,
                boxShadow: isMafia
                  ? '0 0 80px rgba(139, 0, 0, 0.15), inset 0 0 60px rgba(0,0,0,0.5)'
                  : '0 0 80px rgba(0, 100, 200, 0.1), inset 0 0 60px rgba(0,0,0,0.5)',
              }}
            >
              <div className="text-5xl font-black mb-2"
                   style={{
                     color: isMafia ? '#8B0000' : '#0064C8',
                     textShadow: `0 0 30px ${isMafia ? 'rgba(139,0,0,0.4)' : 'rgba(0,100,200,0.3)'}`,
                   }}>
                {currentPlayer.physicalId}
              </div>
              <p className="text-xl text-white/60 mb-6">{currentPlayer.name}</p>
              <div className="text-6xl mb-4">
                {isMafia ? '🎭' : '🛡️'}
              </div>
              <p className="text-3xl font-black mb-2"
                 style={{ color: isMafia ? '#ff4444' : '#4499ff' }}>
                {currentPlayer.role ? (ROLE_NAMES_AR[currentPlayer.role] || currentPlayer.role) : 'بدون دور'}
              </p>
              <p className="text-[11px] font-mono uppercase tracking-widest mt-2"
                 style={{ color: isMafia ? 'rgba(255,68,68,0.5)' : 'rgba(68,153,255,0.5)' }}>
                {isMafia ? 'MAFIA TEAM' : 'CITIZEN TEAM'}
              </p>
              <motion.p
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-[#8A0303] text-[10px] font-mono uppercase tracking-widest mt-6"
              >
                ⚠️ أخفِ الشاشة الآن
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* ── أزرار التنقل ── */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6 z-10">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="w-14 h-14 rounded-full border border-[#C5A059]/30 bg-[#0a0a0a] text-[#C5A059] flex items-center justify-center disabled:opacity-20 transition hover:bg-[#C5A059]/10 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <button
          onClick={() => setFlipped(prev => !prev)}
          className="w-14 h-14 rounded-full border border-[#C5A059]/50 bg-[#1a1a1a] text-[#C5A059] flex items-center justify-center transition hover:bg-[#C5A059]/20 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4" />
          </svg>
        </button>

        <button
          onClick={isLast ? onBack : goNext}
          className={`w-14 h-14 rounded-full border bg-[#0a0a0a] flex items-center justify-center transition active:scale-95 ${
            isLast 
              ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
              : 'border-[#C5A059]/30 text-[#C5A059] hover:bg-[#C5A059]/10'
          }`}
        >
          {isLast ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// المكوّن الرئيسي
// ══════════════════════════════════════════════════════
function LeaderCardsContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('roomId') || '';

  const [allPlayers, setAllPlayers] = useState<PlayerData[]>([]);
  const [gameName, setGameName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // المرحلة: 'select' = الجدول | 'reveal' = عرض الكاردات
  const [phase, setPhase] = useState<'select' | 'reveal'>('select');
  const [selectedPlayers, setSelectedPlayers] = useState<PlayerData[]>([]);

  // جلب اللاعبين
  const fetchPlayers = useCallback(async () => {
    if (!roomId) return;
    try {
      const token = localStorage.getItem('leader_token');
      const res = await fetch(`/api/leader/manual-players/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setAllPlayers(data.players || []);
        setGameName(data.gameName || '');
      } else {
        setError(data.error || 'خطأ في جلب البيانات');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // بدء عرض الكاردات
  const handleStartReveal = (selected: PlayerData[]) => {
    setSelectedPlayers(selected);
    setPhase('reveal');
  };

  // العودة للجدول
  const handleBack = () => {
    setPhase('select');
  };

  // شاشة التحميل
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </motion.div>
      </div>
    );
  }

  // خطأ أو لا لاعبين
  if (error || allPlayers.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-8">
        <div>
          <p className="text-[#C5A059] text-xl font-bold mb-4" style={{ fontFamily: 'Amiri, serif' }}>
            {error || 'لا يوجد لاعبين في هذه الغرفة'}
          </p>
          <button
            onClick={() => window.close()}
            className="px-6 py-2 bg-[#1a1a1a] border border-[#C5A059]/30 text-[#C5A059] rounded-lg text-sm hover:bg-[#C5A059]/10 transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  // المرحلة 2: عرض الكاردات
  if (phase === 'reveal') {
    return (
      <CardRevealFlow
        players={selectedPlayers}
        gameName={gameName}
        onBack={handleBack}
      />
    );
  }

  // المرحلة 1: جدول الاختيار
  return (
    <PlayerSelectionTable
      players={allPlayers}
      gameName={gameName}
      onStartReveal={handleStartReveal}
    />
  );
}

export default function LeaderCardsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </motion.div>
      </div>
    }>
      <LeaderCardsContent />
    </Suspense>
  );
}
