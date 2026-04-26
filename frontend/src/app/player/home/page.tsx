'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import Link from 'next/link';
import { RANK_NAMES_AR, RANK_BADGES } from '@/lib/ranks';

export default function HomePage() {
  const { player } = usePlayer();
  const [profile, setProfile] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch(`/api/player/${player.playerId}/profile`).then(r => r.json()),
      fetch(`/api/player-app/${player.playerId}/following-feed`).then(r => r.json()),
      fetch('/api/player-app/activities/upcoming').then(r => r.json()),
    ]).then(([profileData, feedData, actData]) => {
      if (profileData.success) setProfile(profileData);
      if (feedData.success) setFeed(feedData.feed || []);
      if (actData.success) setUpcoming((actData.activities || []).slice(0, 3));
    }).finally(() => setLoading(false));
  }, [player]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const p = profile?.player;
  const stats = profile?.stats;
  const prog = profile?.progression;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
      {/* ── Hero ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(5,5,5,0.9))',
          border: '1px solid rgba(251,191,36,0.15)',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden shadow-lg shadow-amber-500/10" style={{border:'3px solid rgba(251,191,36,0.4)',background:'linear-gradient(145deg,#1a1a1a,#2a2a2a)'}}>
            {p?.avatarUrl ? (
              <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">🎭</span>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">أهلاً {p?.name || 'لاعب'} 👋</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{
                background: 'rgba(251,191,36,0.15)',
                color: '#fbbf24',
              }}>
                {RANK_BADGES[prog?.rankTier] || '🕵️'} {RANK_NAMES_AR[prog?.rankTier] || 'مُخبر'} • Lv.{prog?.level || 1}
              </span>
            </div>
          </div>
        </div>

        {/* XP Progress */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>XP {prog?.xp || 0}</span>
            <span>{prog?.nextLevelXP || 500}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${prog?.xpProgress || 0}%` }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #fbbf24, #ef4444)' }}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'مباريات', value: stats?.totalMatches || 0, color: '#fbbf24' },
          { label: 'فوز', value: `${stats?.winRate || 0}%`, color: '#22c55e' },
          { label: 'نجاة', value: `${stats?.survivalRate || 0}%`, color: '#3b82f6' },
          { label: 'سلسلة', value: stats?.longestWinStreak || 0, color: '#f97316' },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl p-3 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── لعبة نشطة ── */}
      {profile?.activeGame && (
        <Link href="/player/join">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl p-4 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(5,5,5,0.9))',
              border: '1px solid rgba(34,197,94,0.3)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-green-400 text-xs font-medium">🟢 لعبة نشطة</span>
                <p className="text-white text-sm mt-1">{profile.activeGame.gameName}</p>
              </div>
              <span className="text-green-400 text-xs">العودة ←</span>
            </div>
          </motion.div>
        </Link>
      )}

      {/* ── أنشطة قادمة ── */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-white text-sm font-semibold mb-3">📅 أنشطة قادمة</h2>
          <div className="space-y-2">
            {upcoming.map((act: any) => (
              <div key={act.id} className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <p className="text-white text-sm">{act.name}</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">
                    {new Date(act.date).toLocaleDateString('ar-JO', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {' • '}{act.bookedCount} حاجز
                  </p>
                </div>
                <span className="text-amber-400 text-xs">🎟️</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── فيد الأصدقاء ── */}
      {feed.length > 0 && (
        <div>
          <h2 className="text-white text-sm font-semibold mb-3">👥 أخبار أصدقائك</h2>
          <div className="space-y-2">
            {feed.slice(0, 5).map((item: any, i: number) => (
              <div key={i} className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs">
                  {item.playerInfo?.avatarUrl ? (
                    <img src={item.playerInfo.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" />
                  ) : '🎭'}
                </div>
                <div className="flex-1">
                  <p className="text-white text-xs">{item.playerInfo?.name || item.playerName}</p>
                  <p className="text-gray-500 text-[10px]">
                    {item.role} • {item.xpEarned > 0 ? `+${item.xpEarned} XP` : ''}
                    {item.rrChange > 0 ? ` +${item.rrChange} RR` : item.rrChange < 0 ? ` ${item.rrChange} RR` : ''}
                  </p>
                </div>
                <span className={`text-[10px] ${item.matchWinner === 'MAFIA' ? 'text-red-400' : 'text-cyan-400'}`}>
                  {item.matchWinner === 'MAFIA' ? '🔴' : '🔵'} {item.survived ? 'نجا' : 'أُقصي'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {feed.length === 0 && (
        <div className="text-center py-6">
          <p className="text-gray-600 text-sm">لا أخبار بعد — تابع لاعبين من صفحة التصنيف!</p>
        </div>
      )}
    </div>
  );
}
