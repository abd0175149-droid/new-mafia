'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

const ROLE_NAMES_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية المافيا',
  MAFIA_REGULAR: 'مافيا عادي', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', CITIZEN: 'مواطن صالح',
};
const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];

interface MatchDetails {
  matchId: number;
  gameName: string;
  matchDate: string;
  matchWinner: 'MAFIA' | 'CITIZEN' | null;
  durationSeconds: number;
  role: string;
  survivedToEnd: boolean;
  eliminatedDuring: string | null;
  roundsSurvived: number;
  dealInitiated: boolean;
  dealSuccess: boolean | null;
  abilityUsed: boolean;
  abilityCorrect: boolean | null;
  xpEarned: number;
  rrChange: number;
}

export default function MatchHistoryPage() {
  const [matches, setMatches] = useState<MatchDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<MatchDetails | null>(null);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('mafia_player_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    let playerId: string | null = null;
    const newAuth = localStorage.getItem('mafia_player_auth');
    if (newAuth) {
      try { playerId = String(JSON.parse(newAuth).playerId); } catch { }
    }
    if (!playerId) playerId = localStorage.getItem('mafia_playerId');

    if (!playerId) {
      setError('لم يتم العثور على الحساب');
      setLoading(false);
      return;
    }

    fetch(`/api/player-app/${playerId}/matches`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setMatches(data.matches);
        } else {
          setError(data.error || 'فشل في جلب السجل');
        }
      })
      .catch(() => setError('خطأ في الاتصال بالخادم'))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  useEffect(() => {
    if (selectedMatch) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedMatch]);

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full" />
      </motion.div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-black flex items-center justify-center text-center p-8">
      <div>
        <p className="text-amber-400 text-xl font-bold mb-4">{error}</p>
        <Link href="/player/profile" className="px-6 py-2 bg-gray-900 border border-amber-500/30 text-amber-400 rounded-lg text-sm hover:bg-amber-500/10 transition">العودة للبروفايل</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white" dir="rtl">
      {/* ═══ Header ═══ */}
      <div className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black text-amber-400">📜 سجل المباريات</h1>
        <Link href="/player/profile" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition">
          <span className="translate-y-[-1px]">✕</span>
        </Link>
      </div>

      <div className="max-w-lg mx-auto p-4 pb-20 space-y-3">
        {matches.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-5xl mb-4 block">🎮</span>
            <p className="text-gray-400 font-bold">لا يوجد مباريات مسجلة بعد!</p>
          </div>
        ) : (
          matches.map((m, i) => {
            const isMafia = MAFIA_ROLES.includes(m.role);
            const won = (isMafia && m.matchWinner === 'MAFIA') || (!isMafia && m.matchWinner === 'CITIZEN');
            const dur = m.durationSeconds ? `${Math.floor(m.durationSeconds / 60)}:${String(m.durationSeconds % 60).padStart(2, '0')}` : '—';
            const dt = m.matchDate ? new Date(m.matchDate) : null;
            const dateStr = dt ? `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}` : '—';

            return (
              <motion.div
                key={m.matchId}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                onClick={() => setSelectedMatch(m)}
                className={`relative overflow-hidden rounded-xl p-4 border cursor-pointer transition hover:scale-[1.01] ${won ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'
                  }`}
              >
                {/* Glow Background */}
                <div className={`absolute top-0 right-0 w-32 h-32 blur-[40px] opacity-20 ${won ? 'bg-emerald-500' : 'bg-rose-500'}`} />

                <div className="relative z-10 flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-white mb-1">{m.gameName || 'مباراة مافيا'}</h3>
                    <p className="text-xs text-gray-500">{dateStr} • ⏱️ {dur}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-lg text-xs font-bold border ${won ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                    {won ? '🏆 فوز' : '💀 خسارة'}
                  </div>
                </div>

                <div className="relative z-10 flex items-center justify-between border-t border-white/5 pt-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-1 rounded border ${isMafia ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'}`}>
                      {isMafia ? 'مافيا' : 'مواطن'}
                    </span>
                    <span className="text-sm font-bold text-gray-300">{ROLE_NAMES_AR[m.role] || m.role || '—'}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-amber-400">+{m.xpEarned} XP</span>
                    <span className={`text-sm font-bold ${m.rrChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {m.rrChange >= 0 ? '+' : ''}{m.rrChange} RR
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ═══ Match Details Modal ═══ */}
      <AnimatePresence>
        {selectedMatch && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-0 left-0 right-0 bottom-20 z-40 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setSelectedMatch(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-gradient-to-b from-gray-900 to-black border-t border-white/10 sm:border rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 space-y-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
              onClick={e => e.stopPropagation()} dir="rtl"
            >
              <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-2" />
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-black text-white">تفاصيل النقاط</h2>
                <button onClick={() => setSelectedMatch(null)} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors">✕</button>
              </div>

              {/* Roles & Match Basic */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 mb-1">الدور</p>
                  <p className="font-bold text-amber-400">{ROLE_NAMES_AR[selectedMatch.role] || selectedMatch.role}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-gray-500 mb-1">النتيجة</p>
                  <p className={`font-bold ${((MAFIA_ROLES.includes(selectedMatch.role) && selectedMatch.matchWinner === 'MAFIA') || (!MAFIA_ROLES.includes(selectedMatch.role) && selectedMatch.matchWinner === 'CITIZEN')) ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {((MAFIA_ROLES.includes(selectedMatch.role) && selectedMatch.matchWinner === 'MAFIA') || (!MAFIA_ROLES.includes(selectedMatch.role) && selectedMatch.matchWinner === 'CITIZEN')) ? 'فوز الفريق' : 'خسارة الفريق'}
                  </p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-400 border-b border-white/5 pb-2">تفصيل الاحتساب</h3>

                {/* Survival */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-300">🛡️ النجاة ({selectedMatch.roundsSurvived} جولات)</span>
                  <span className="text-green-400">{selectedMatch.survivedToEnd ? 'نجا للنهاية' : `أُقصي (جولة ${selectedMatch.eliminatedDuring || '?'})`}</span>
                </div>

                {/* Deals */}
                {selectedMatch.dealInitiated && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-300">🤝 الاتفاقية</span>
                    <span className={selectedMatch.dealSuccess ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {selectedMatch.dealSuccess ? 'ناجحة (+XP, +RR)' : 'فاشلة (-XP, -RR)'}
                    </span>
                  </div>
                )}

                {/* Abilities */}
                {selectedMatch.abilityUsed && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-300">✨ القدرة الخاصة</span>
                    <span className={selectedMatch.abilityCorrect ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {selectedMatch.abilityCorrect ? 'صحيحة (+XP, +RR)' : 'خاطئة (-XP, -RR)'}
                    </span>
                  </div>
                )}
              </div>

              {/* Total Rewards */}
              <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-5 flex justify-around items-center relative overflow-hidden">
                {/* Glow effect inside reward box */}
                <div className="absolute inset-0 bg-amber-500/5 blur-xl rounded-full" />
                
                <div className="text-center relative z-10">
                  <p className="text-[10px] text-amber-500/70 uppercase tracking-widest mb-1 font-bold">Total XP</p>
                  <p className="text-3xl font-black text-amber-400 drop-shadow-md">+{selectedMatch.xpEarned}</p>
                </div>
                <div className="w-px h-12 bg-gradient-to-b from-transparent via-amber-500/30 to-transparent relative z-10" />
                <div className="text-center relative z-10">
                  <p className="text-[10px] text-amber-500/70 uppercase tracking-widest mb-1 font-bold">Total RR</p>
                  <p className={`text-3xl font-black drop-shadow-md ${selectedMatch.rrChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedMatch.rrChange >= 0 ? '+' : ''}{selectedMatch.rrChange}
                  </p>
                </div>
              </div>
              
              <button onClick={() => setSelectedMatch(null)} className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold transition-all active:scale-[0.98]">
                إغلاق
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
