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

interface ManualPlayer {
  physicalId: number;
  name: string;
  role: string | null;
  isAlive: boolean;
  gender: string;
}

function LeaderCardsContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('roomId') || '';

  const [players, setPlayers] = useState<ManualPlayer[]>([]);
  const [gameName, setGameName] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── جلب اللاعبين اليدويين ──
  const fetchPlayers = useCallback(async () => {
    if (!roomId) return;

    try {
      const token = localStorage.getItem('leader_token');
      const res = await fetch(`/api/leader/manual-players/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlayers(data.players || []);
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

  // ── التنقل بين الكاردات ──
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

  // ── شاشة التحميل ──
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

  // ── خطأ أو لا لاعبين ──
  if (error || players.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-8">
        <div>
          <p className="text-[#C5A059] text-xl font-bold mb-4" style={{ fontFamily: 'Amiri, serif' }}>
            {error || 'لا يوجد لاعبين مضافين يدوياً في هذه الغرفة'}
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

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 select-none overflow-hidden"
         dir="rtl" style={{ fontFamily: 'Amiri, serif' }}>

      {/* ── رأس الصفحة ── */}
      <div className="absolute top-4 left-0 right-0 text-center z-10">
        <p className="text-[#808080] text-[10px] font-mono uppercase tracking-widest">
          {gameName} — MANUAL PLAYERS
        </p>
        <p className="text-[#C5A059] text-[11px] font-mono mt-1">
          {currentIndex + 1} / {players.length}
        </p>
      </div>

      {/* ── الكارد الرئيسي (Full Screen) ── */}
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
            style={{ aspectRatio: '2/3', transformStyle: 'preserve-3d' }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.42, 0, 0.58, 1] }}
          >
            {/* ── وجه الكارد (المقلوب) ── */}
            <div
              className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center"
              style={{
                backfaceVisibility: 'hidden',
                background: 'linear-gradient(145deg, #0a0a0a, #1a1a1a)',
                border: '2px solid rgba(197, 160, 89, 0.3)',
                boxShadow: '0 0 60px rgba(197, 160, 89, 0.05), inset 0 0 60px rgba(0,0,0,0.5)',
              }}
            >
              {/* رقم المقعد */}
              <div className="text-7xl font-black text-[#C5A059] mb-4"
                   style={{ textShadow: '0 0 30px rgba(197,160,89,0.3)' }}>
                {currentPlayer.physicalId}
              </div>
              {/* اسم اللاعب */}
              <p className="text-2xl text-[#C5A059]/80 mb-8">{currentPlayer.name}</p>
              {/* تعليمات */}
              <motion.p
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-[#555] text-[10px] font-mono uppercase tracking-widest"
              >
                TAP TO REVEAL ROLE
              </motion.p>
            </div>

            {/* ── وجه الكارد (المكشوف) ── */}
            <div
              className="absolute inset-0 rounded-3xl overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: isMafia
                  ? 'linear-gradient(145deg, #1a0000, #2d0000)'
                  : 'linear-gradient(145deg, #000d1a, #001a33)',
                border: `2px solid ${isMafia ? 'rgba(139, 0, 0, 0.5)' : 'rgba(0, 100, 200, 0.3)'}`,
                boxShadow: isMafia
                  ? '0 0 80px rgba(139, 0, 0, 0.15), inset 0 0 60px rgba(0,0,0,0.5)'
                  : '0 0 80px rgba(0, 100, 200, 0.1), inset 0 0 60px rgba(0,0,0,0.5)',
              }}
            >
              {/* scaleX(-1) لعكس انعكاس rotateY(180deg) */}
              <div className="w-full h-full flex flex-col items-center justify-center" style={{ transform: 'scaleX(-1)' }}>
              {/* رقم المقعد */}
              <div className="text-5xl font-black mb-2"
                   style={{
                     color: isMafia ? '#8B0000' : '#0064C8',
                     textShadow: `0 0 30px ${isMafia ? 'rgba(139,0,0,0.4)' : 'rgba(0,100,200,0.3)'}`,
                   }}>
                {currentPlayer.physicalId}
              </div>
              {/* اسم اللاعب */}
              <p className="text-xl text-white/60 mb-6">{currentPlayer.name}</p>
              {/* أيقونة الفريق */}
              <div className="text-6xl mb-4">
                {isMafia ? '🎭' : '🛡️'}
              </div>
              {/* اسم الدور */}
              <p className="text-3xl font-black mb-2"
                 style={{ color: isMafia ? '#ff4444' : '#4499ff' }}>
                {currentPlayer.role ? (ROLE_NAMES_AR[currentPlayer.role] || currentPlayer.role) : 'بدون دور'}
              </p>
              {/* تصنيف الفريق */}
              <p className="text-[11px] font-mono uppercase tracking-widest mt-2"
                 style={{ color: isMafia ? 'rgba(255,68,68,0.5)' : 'rgba(68,153,255,0.5)' }}>
                {isMafia ? 'MAFIA TEAM' : 'CITIZEN TEAM'}
              </p>
              {/* تحذير */}
              <motion.p
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-[#8A0303] text-[10px] font-mono uppercase tracking-widest mt-6"
              >
                ⚠️ أخفِ الشاشة الآن
              </motion.p>
              </div>
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
          onClick={goNext}
          disabled={currentIndex === players.length - 1}
          className="w-14 h-14 rounded-full border border-[#C5A059]/30 bg-[#0a0a0a] text-[#C5A059] flex items-center justify-center disabled:opacity-20 transition hover:bg-[#C5A059]/10 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    </div>
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
