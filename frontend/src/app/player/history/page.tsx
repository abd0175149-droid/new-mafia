'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

const ROLE_NAMES_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية المافيا',
  MAFIA_REGULAR: 'مافيا عادي', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', CITIZEN: 'مواطن صالح',
  WITCH: 'الساحرة', OLDER_BROTHER: 'الأخ الأكبر', YOUNGER_BROTHER: 'الأخ الأصغر', JESTER: 'المهرج', ASSASSIN: 'السفّاح',
};
const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'];

interface BreakdownLine { key: string; label: string; icon: string; value: number; }

interface MatchDetails {
  matchId: number;
  gameName: string;
  matchDate: string;
  matchWinner: 'MAFIA' | 'CITIZEN' | null;
  durationSeconds: number;
  totalRounds: number;
  playerCount: number;
  role: string;
  survivedToEnd: boolean;
  eliminatedDuring: string | null;
  eliminatedAtRound: number | null;
  roundsSurvived: number;
  dealInitiated: boolean;
  dealSuccess: boolean | null;
  abilityUsed: boolean;
  abilityCorrect: boolean | null;
  xpEarned: number;
  rrChange: number;
  penaltyCount: number;
  penaltyRRDeduction: number;
  bombRRChange: number;
  breakdown?: {
    team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
    won: boolean;
    xp: BreakdownLine[];
    rr: BreakdownLine[];
    xpTotal: number;
    rrTotal: number;
  };
}

// مكوّن سطر نقاط واحد
function PointRow({ icon, label, value, type }: { icon: string; label: string; value: number; type: 'xp' | 'rr' }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  const colorClass = isPositive ? 'text-green-400' : 'text-red-400';
  const prefix = isPositive ? '+' : '';
  const suffix = type === 'xp' ? ' XP' : ' RR';

  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03] last:border-b-0">
      <span className="flex items-center gap-2 text-[11px] text-gray-300">
        <span className="text-sm w-5 text-center">{icon}</span>
        {label}
      </span>
      <span className={`text-[11px] font-bold font-mono ${colorClass}`}>
        {prefix}{value}{suffix}
      </span>
    </div>
  );
}

export default function MatchHistoryPage() {
  const [matches, setMatches] = useState<MatchDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<MatchDetails | null>(null);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    let token = localStorage.getItem('mafia_player_token');
    if (!token) {
      // احتياط: التوكن قد يكون مخزّناً ضمن جلسة الـ context الجديدة (mafia_player_auth)
      try { token = JSON.parse(localStorage.getItem('mafia_player_auth') || '{}')?.token || null; } catch {}
    }
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    let playerId: string | null = null;
    const newAuth = localStorage.getItem('mafia_player_auth');
    if (newAuth) {
      try { const pid = JSON.parse(newAuth)?.playerId; if (pid != null) playerId = String(pid); } catch { }
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
    if (!selectedMatch) return;

    const scrollY = window.scrollY;

    // إضافة modal-open — يوقف ميزة pull-to-refresh المخصصة في layout.tsx
    document.body.classList.add('modal-open');
    // تجميد الصفحة بالكامل
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
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
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setSelectedMatch(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="modal-scroll bg-gradient-to-b from-gray-900 to-black border-t border-white/10 sm:border rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
              style={{ overscrollBehavior: 'contain' }}
              onClick={e => e.stopPropagation()} dir="rtl"
            >
              <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-3" />

              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-black text-white">📊 تفصيل النقاط</h2>
                <button onClick={() => setSelectedMatch(null)} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors">✕</button>
              </div>

              {(() => {
                const m = selectedMatch;
                const b = m.breakdown;
                const isNeutral = b?.team === 'NEUTRAL';
                const isMafia = b?.team ? b.team === 'MAFIA' : MAFIA_ROLES.includes(m.role);
                const won = b ? b.won : ((isMafia && m.matchWinner === 'MAFIA') || (!isMafia && m.matchWinner === 'CITIZEN'));

                return (
                  <div className="space-y-4">
                    {/* Match Info Card */}
                    <div className={`rounded-xl p-4 border ${won ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-rose-500/5 border-rose-500/15'}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-[10px] text-gray-500 mb-0.5">الدور</p>
                          <p className="font-bold text-amber-400 text-sm">{ROLE_NAMES_AR[m.role] || m.role}</p>
                          <span className={`text-[9px] px-2 py-0.5 rounded mt-1 inline-block ${isNeutral ? 'bg-purple-500/10 text-purple-400' : isMafia ? 'bg-red-500/10 text-red-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                            {isNeutral ? 'دور محايد' : isMafia ? 'فريق المافيا' : 'فريق المواطنين'}
                          </span>
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] text-gray-500 mb-0.5">النتيجة</p>
                          <p className={`font-black text-lg ${won ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {won ? '🏆 فوز' : '💀 خسارة'}
                          </p>
                        </div>
                      </div>
                      {/* Match meta */}
                      <div className="flex justify-between mt-3 pt-2 border-t border-white/5 text-[10px] text-gray-500">
                        <span>🛡️ {m.survivedToEnd ? 'نجا للنهاية' : `أُقصي ${m.eliminatedDuring === 'NIGHT' ? 'ليلاً' : 'نهاراً'} (جولة ${m.eliminatedAtRound || '?'})`}</span>
                        <span>📊 {m.roundsSurvived} جولات</span>
                      </div>
                    </div>

                    {/* ═══ XP Breakdown ═══ */}
                    <div className="bg-amber-500/[0.03] border border-amber-500/10 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-amber-400 mb-2 flex items-center gap-2">
                        ⭐ تفصيل نقاط الخبرة (XP)
                      </h3>
                      <div className="space-y-0.5">
                        {b && b.xp.length ? (
                          b.xp.map((l: any) => <PointRow key={l.key} icon={l.icon} label={l.label} value={l.value} type="xp" />)
                        ) : (
                          <p className="text-[10px] text-gray-600 text-center py-2">لا نقاط خبرة</p>
                        )}
                      </div>
                      {/* XP Total */}
                      <div className="flex justify-between items-center mt-3 pt-2 border-t border-amber-500/15">
                        <span className="text-xs font-bold text-gray-300">المجموع</span>
                        <span className="text-lg font-black text-amber-400 font-mono">+{m.xpEarned} XP</span>
                      </div>
                    </div>

                    {/* ═══ RR Breakdown ═══ */}
                    <div className="bg-purple-500/[0.03] border border-purple-500/10 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                        🏆 تفصيل نقاط الرتبة (RR)
                      </h3>
                      <div className="space-y-0.5">
                        {b && b.rr.length ? (
                          b.rr.map((l: any) => <PointRow key={l.key} icon={l.icon} label={l.label} value={l.value} type="rr" />)
                        ) : (
                          <p className="text-[10px] text-gray-600 text-center py-2">لا تغيّر في الرتبة</p>
                        )}
                      </div>
                      {/* RR Total */}
                      <div className="flex justify-between items-center mt-3 pt-2 border-t border-purple-500/15">
                        <span className="text-xs font-bold text-gray-300">المجموع</span>
                        <span className={`text-lg font-black font-mono ${m.rrChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {m.rrChange >= 0 ? '+' : ''}{m.rrChange} RR
                        </span>
                      </div>
                    </div>

                    {/* ═══ Total Rewards Box ═══ */}
                    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-5 flex justify-around items-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-amber-500/5 blur-xl rounded-full" />
                      <div className="text-center relative z-10">
                        <p className="text-[10px] text-amber-500/70 uppercase tracking-widest mb-1 font-bold">TOTAL XP</p>
                        <p className="text-3xl font-black text-amber-400 drop-shadow-md">+{m.xpEarned}</p>
                      </div>
                      <div className="w-px h-12 bg-gradient-to-b from-transparent via-amber-500/30 to-transparent relative z-10" />
                      <div className="text-center relative z-10">
                        <p className="text-[10px] text-amber-500/70 uppercase tracking-widest mb-1 font-bold">TOTAL RR</p>
                        <p className={`text-3xl font-black drop-shadow-md ${m.rrChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {m.rrChange >= 0 ? '+' : ''}{m.rrChange}
                        </p>
                      </div>
                    </div>

                    {/* Deal info note */}
                    {m.dealInitiated && (
                      <div className={`rounded-xl p-3 border text-[10px] ${m.dealSuccess ? 'bg-green-500/5 border-green-500/15 text-green-400' : 'bg-red-500/5 border-red-500/15 text-red-400'}`}>
                        {m.dealSuccess
                          ? '✅ الاتفاقية ناجحة — صوّت عليها الأغلبية وكان الهدف مافيا'
                          : '❌ الاتفاقية فاشلة — الهدف كان مواطناً (تمت معاقبة المبادر)'}
                      </div>
                    )}

                    <button onClick={() => setSelectedMatch(null)} className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold transition-all active:scale-[0.98]">
                      إغلاق
                    </button>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
