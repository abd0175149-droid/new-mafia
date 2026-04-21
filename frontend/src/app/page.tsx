'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

// ── SVG Icons ──
const DisplayIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all duration-500">
    <rect x="4" y="6" width="40" height="28" rx="3" stroke="currentColor" strokeWidth="2" fill="none"/>
    <line x1="24" y1="34" x2="24" y2="42" stroke="currentColor" strokeWidth="2"/>
    <line x1="16" y1="42" x2="32" y2="42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="24" cy="20" r="6" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <circle cx="24" cy="20" r="2" fill="currentColor"/>
  </svg>
);

const PlayerIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all duration-500">
    <circle cx="24" cy="16" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M8 42c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M20 14l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LeaderIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 4l4 8 8 2-6 6 2 8-8-4-8 4 2-8-6-6 8-2z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
  </svg>
);

export default function HomePage() {
  const [isLeaderLoggedIn, setIsLeaderLoggedIn] = useState(false);
  const [leaderName, setLeaderName] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('leader_token');
    if (token) {
      fetch('/api/leader/verify', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.valid) {
            setIsLeaderLoggedIn(true);
            setLeaderName(data.displayName);
          } else {
            localStorage.removeItem('leader_token');
          }
        })
        .catch(() => {
          localStorage.removeItem('leader_token');
        });
    }
  }, []);

  const handleLogout = () => {
    const token = localStorage.getItem('leader_token');
    if (token) {
      fetch('/api/leader/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    localStorage.removeItem('leader_token');
    localStorage.removeItem('leader_name');
    setIsLeaderLoggedIn(false);
    setLeaderName('');
  };

  return (
    <div className="display-bg min-h-screen flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden font-arabic selection:bg-[#8A0303] selection:text-white blood-vignette">

      {/* ── Title: MAFIA CLUB + Logo ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-center gap-6 md:gap-10 mb-14 relative z-10 w-full max-w-4xl"
      >
        {/* النصوص */}
        <h1 className="text-center md:text-right">
          <span
            className="block text-6xl md:text-8xl lg:text-9xl font-black tracking-tight text-[#C5A059]"
            style={{
              fontFamily: 'Amiri, serif',
              textShadow: '0 0 60px rgba(138,3,3,0.4), 0 4px 20px rgba(0,0,0,0.8)',
            }}
          >
            MAFIA
          </span>
          <span
            dir="ltr"
            className="flex justify-between text-2xl md:text-4xl lg:text-5xl font-light text-[#8A0303] mt-1 w-full"
            style={{
              fontFamily: 'Amiri, serif',
              textShadow: '0 0 30px rgba(138,3,3,0.3)',
            }}
          >
            {'CLUB'.split('').map((letter, i) => (
              <span key={i}>{letter}</span>
            ))}
          </span>
        </h1>

        {/* اللوجو — بنفس ارتفاع الكلمتين */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="shrink-0"
        >
          <Image
            src="/mafia_logo.png"
            alt="Mafia Club Logo"
            width={180}
            height={180}
            className="select-none w-[100px] h-[100px] md:w-[150px] md:h-[150px] lg:w-[180px] lg:h-[180px] drop-shadow-[0_0_30px_rgba(138,3,3,0.3)]"
            priority
          />
        </motion.div>
      </motion.div>

      {/* خط فاصل */}
      <div className="h-[1px] w-40 bg-gradient-to-r from-transparent via-[#C5A059] to-transparent mx-auto opacity-50 mb-14 relative z-10" />

      {/* ── Navigation Cards ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl relative z-10 mb-12"
      >
        {/* Display Card */}
        <Link href="/display" className="group block h-full">
          <motion.div
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="h-full p-10 text-center flex flex-col items-center justify-center rounded-xl
              bg-black/50 backdrop-blur-md border border-[#2a2a2a] 
              group-hover:border-[#8A0303]/60 group-hover:shadow-[0_0_40px_rgba(138,3,3,0.15)]
              transition-all duration-500 relative overflow-hidden"
          >
            {/* شريط علوي */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#8A0303]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="text-[#555] group-hover:text-[#8A0303] transition-colors duration-500 mb-5">
              <DisplayIcon />
            </div>
            <h2
              className="text-2xl font-black mb-2 text-white tracking-widest uppercase"
              style={{ fontFamily: 'Amiri, serif' }}
            >
              شاشة العرض
            </h2>
            <p className="text-[#555] text-xs font-mono tracking-widest uppercase">
              DISPLAY MONITOR
            </p>
          </motion.div>
        </Link>

        {/* Player Card */}
        <Link href="/player" className="group block h-full">
          <motion.div
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="h-full p-10 text-center flex flex-col items-center justify-center rounded-xl
              bg-black/50 backdrop-blur-md border border-[#2a2a2a]
              group-hover:border-[#C5A059]/60 group-hover:shadow-[0_0_40px_rgba(197,160,89,0.15)]
              transition-all duration-500 relative overflow-hidden"
          >
            {/* شريط علوي */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="text-[#555] group-hover:text-[#C5A059] transition-colors duration-500 mb-5">
              <PlayerIcon />
            </div>
            <h2
              className="text-2xl font-black mb-2 text-white tracking-widest uppercase"
              style={{ fontFamily: 'Amiri, serif' }}
            >
              بطاقة اللاعب
            </h2>
            <p className="text-[#555] text-xs font-mono tracking-widest uppercase">
              PLAYER CARD
            </p>
          </motion.div>
        </Link>
      </motion.div>

      {/* ── Leader Section ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
        className="relative z-10 w-full max-w-xl"
      >
        <AnimatePresence mode="wait">
          {isLeaderLoggedIn ? (
            <motion.div
              key="leader-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center justify-between mb-4 px-2 border-b border-[#2a2a2a] pb-3">
                <p className="text-[#808080] text-sm font-mono uppercase tracking-widest">
                  Agent: <span className="text-[#C5A059] font-bold">{leaderName}</span>
                </p>
                <button
                  onClick={handleLogout}
                  className="text-[#555] text-xs hover:text-[#8A0303] transition-colors uppercase tracking-widest font-bold"
                >
                  (تسجيل الخروج)
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/leader" className="group block flex-1">
                  <motion.div
                    whileHover={{ y: -2 }}
                    className="py-6 text-center rounded-xl bg-black/50 backdrop-blur-md border border-[#C5A059]/20 
                      group-hover:border-[#C5A059]/50 group-hover:shadow-[0_0_30px_rgba(197,160,89,0.1)]
                      transition-all duration-500 flex items-center justify-center gap-3"
                  >
                    <div className="text-[#C5A059]">
                      <LeaderIcon />
                    </div>
                    <h2
                      className="text-xl font-bold text-[#C5A059] tracking-widest uppercase"
                      style={{ fontFamily: 'Amiri, serif' }}
                    >
                      غرفة العمليات
                    </h2>
                  </motion.div>
                </Link>
                <Link href="/admin" className="group block flex-1">
                  <motion.div
                    whileHover={{ y: -2 }}
                    className="py-6 text-center rounded-xl bg-black/50 backdrop-blur-md border border-[#8A0303]/20 
                      group-hover:border-[#8A0303]/50 group-hover:shadow-[0_0_30px_rgba(138,3,3,0.1)]
                      transition-all duration-500 flex items-center justify-center gap-3"
                  >
                    <span className="text-[#8A0303] text-2xl">📊</span>
                    <h2
                      className="text-xl font-bold text-[#8A0303] tracking-widest uppercase"
                      style={{ fontFamily: 'Amiri, serif' }}
                    >
                      لوحة الإدارة
                    </h2>
                  </motion.div>
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="login-btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href="/leader/login">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-10 py-4 text-sm uppercase tracking-[0.2em] font-mono text-[#555] 
                    border border-[#2a2a2a] rounded-xl bg-black/30 backdrop-blur-sm
                    hover:text-[#C5A059] hover:border-[#C5A059]/30 transition-all duration-500"
                >
                  دخول القائد (Leader)
                </motion.button>
              </Link>
              <Link href="/admin/login">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-10 py-4 text-sm uppercase tracking-[0.2em] font-mono text-[#555] 
                    border border-[#2a2a2a] rounded-xl bg-black/30 backdrop-blur-sm
                    hover:text-[#8A0303] hover:border-[#8A0303]/30 transition-all duration-500"
                >
                  لوحة الإدارة (Admin)
                </motion.button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Footer ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute bottom-8 left-0 w-full text-center z-10 pointer-events-none"
      >
        <div className="h-[1px] w-24 bg-[#2a2a2a] mx-auto mb-4" />
        <p className="text-[#444] text-[10px] tracking-[0.4em] font-mono uppercase">
          Mafia Club • v2.0
        </p>
      </motion.div>
    </div>
  );
}
