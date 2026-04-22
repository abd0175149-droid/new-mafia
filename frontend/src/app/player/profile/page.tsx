'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

// ── أسماء الأدوار بالعربي ──
const ROLE_NAMES_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية المافيا',
  MAFIA_REGULAR: 'مافيا عادي', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', CITIZEN: 'مواطن صالح',
};

const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];

interface PlayerProfile {
  player: {
    id: number; phone: string; name: string; gender: string;
    totalMatches: number; totalWins: number; totalSurvived: number;
    createdAt: string;
  };
  stats: {
    totalMatches: number; totalWins: number; survivalRate: number;
    favoriteRole: string | null; mafiaWins: number; citizenWins: number;
  };
  matchHistory: Array<{
    matchId: number; role: string; survived: boolean;
    matchWinner: string; matchDate: string; matchDuration: number;
    matchPlayerCount: number;
  }>;
  activeGame: {
    roomId: string; roomCode: string; gameName: string;
    physicalId: number; role: string | null; isAlive: boolean; phase: string;
  } | null;
}

export default function PlayerProfilePage() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const playerId = localStorage.getItem('mafia_playerId');
    if (!playerId) {
      setError('لم يتم العثور على حساب. سجّل في لعبة أولاً');
      setLoading(false);
      return;
    }

    fetch(`/api/player/${playerId}/profile`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setProfile(data);
        } else {
          setError(data.error || 'خطأ في جلب البروفايل');
        }
      })
      .catch(() => setError('خطأ في الاتصال'))
      .finally(() => setLoading(false));
  }, []);

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

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-8">
        <div>
          <p className="text-[#C5A059] text-xl font-bold mb-4" style={{ fontFamily: 'Amiri, serif' }}>
            {error || 'لم يتم العثور على البروفايل'}
          </p>
          <Link href="/player" className="px-6 py-2 bg-[#1a1a1a] border border-[#C5A059]/30 text-[#C5A059] rounded-lg text-sm hover:bg-[#C5A059]/10 transition inline-block">
            العودة
          </Link>
        </div>
      </div>
    );
  }

  const { player, stats, matchHistory, activeGame } = profile;

  return (
    <div className="min-h-screen bg-black text-white" dir="rtl" style={{ fontFamily: 'Amiri, serif' }}>
      {/* ── Header ── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #1a1500 0%, #000 100%)' }}>
        <div className="max-w-lg mx-auto px-6 py-8 text-center relative z-10">
          {/* Avatar */}
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }}
            className="w-20 h-20 mx-auto mb-4 rounded-full border-2 border-[#C5A059]/50 flex items-center justify-center text-3xl"
            style={{ background: 'linear-gradient(145deg, #1a1a1a, #2a2a2a)' }}
          >
            {player.gender === 'FEMALE' ? '👩' : '👤'}
          </motion.div>
          <h1 className="text-3xl font-black text-[#C5A059] mb-1">{player.name}</h1>
          <p className="text-[#808080] text-[10px] font-mono tracking-widest mb-1">
            {player.phone}
          </p>
          <p className="text-[#555] text-[9px] font-mono">
            عضو منذ {new Date(player.createdAt).toLocaleDateString('ar-JO')}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-12 -mt-2">
        {/* ── Active Game Banner ── */}
        {activeGame && (
          <motion.div
            initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="mb-6 p-4 rounded-2xl border"
            style={{
              background: 'linear-gradient(135deg, rgba(139,0,0,0.15), rgba(0,0,0,0.8))',
              borderColor: activeGame.isAlive ? 'rgba(0,200,0,0.3)' : 'rgba(139,0,0,0.3)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-red-400 animate-pulse">
                🔴 لعبة نشطة
              </span>
              <span className="text-[10px] font-mono text-[#808080]">{activeGame.gameName}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">مقعد #{activeGame.physicalId}</p>
                <p className="text-[10px] text-[#808080] font-mono">
                  {activeGame.isAlive ? '✅ ALIVE' : '☠️ ELIMINATED'}
                  {activeGame.role && ` — ${ROLE_NAMES_AR[activeGame.role] || activeGame.role}`}
                </p>
              </div>
              <Link
                href={`/player?code=${activeGame.roomCode}`}
                className="px-4 py-2 bg-[#C5A059]/20 border border-[#C5A059]/40 text-[#C5A059] rounded-lg text-xs hover:bg-[#C5A059]/30 transition"
              >
                العودة للعبة
              </Link>
            </div>
          </motion.div>
        )}

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'المباريات', value: stats.totalMatches, icon: '🎮' },
            { label: 'الانتصارات', value: stats.totalWins, icon: '🏆' },
            { label: 'نسبة البقاء', value: `${stats.survivalRate}%`, icon: '🛡️' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="p-4 rounded-xl text-center"
              style={{
                background: 'linear-gradient(145deg, #111, #0a0a0a)',
                border: '1px solid rgba(197,160,89,0.15)',
              }}
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-black text-[#C5A059]">{stat.value}</div>
              <div className="text-[9px] text-[#808080] font-mono uppercase tracking-widest">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Detailed Stats ── */}
        <div className="mb-6 p-4 rounded-xl" style={{ background: '#0a0a0a', border: '1px solid rgba(197,160,89,0.1)' }}>
          <h3 className="text-sm font-bold text-[#C5A059] mb-3 tracking-wide">إحصائيات تفصيلية</h3>
          <div className="space-y-2 text-[12px]">
            {stats.favoriteRole && (
              <div className="flex justify-between">
                <span className="text-[#808080]">الدور الأكثر</span>
                <span className="text-white">{ROLE_NAMES_AR[stats.favoriteRole] || stats.favoriteRole}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#808080]">فوز كمافيا</span>
              <span className="text-red-400">{stats.mafiaWins}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#808080]">فوز كمواطن</span>
              <span className="text-blue-400">{stats.citizenWins}</span>
            </div>
          </div>
        </div>

        {/* ── Match History ── */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-[#C5A059] mb-3 tracking-wide">سجل المباريات</h3>
          {matchHistory.length === 0 ? (
            <p className="text-[#555] text-center text-sm py-8">لا توجد مباريات سابقة بعد</p>
          ) : (
            <div className="space-y-2">
              {matchHistory.slice(0, 20).map((m, i) => {
                const isMafia = MAFIA_ROLES.includes(m.role || '');
                return (
                  <motion.div
                    key={m.matchId}
                    initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.05 * i }}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{
                      background: 'linear-gradient(145deg, #111, #0a0a0a)',
                      border: '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isMafia ? 'bg-red-900/30 text-red-400' : 'bg-blue-900/30 text-blue-400'}`}>
                        {isMafia ? '🎭' : '🛡️'}
                      </div>
                      <div>
                        <p className="text-xs text-white/70">{ROLE_NAMES_AR[m.role] || m.role}</p>
                        <p className="text-[9px] text-[#555] font-mono">
                          {new Date(m.matchDate).toLocaleDateString('ar-JO')} • {m.matchPlayerCount} لاعب
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-mono px-2 py-1 rounded-md ${m.survived ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                        {m.survived ? 'بقي' : 'أُقصي'}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Back Button ── */}
        <div className="text-center">
          <Link href="/player"
            className="px-8 py-3 bg-[#1a1a1a] border border-[#C5A059]/30 text-[#C5A059] rounded-xl text-sm hover:bg-[#C5A059]/10 transition inline-block">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
