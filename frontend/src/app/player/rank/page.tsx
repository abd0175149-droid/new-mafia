'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import { RANK_NAMES_AR, RANK_BADGES, RANK_COLORS } from '@/lib/ranks';

type Tab = 'leaderboard' | 'myrank' | 'coplayers';

export default function RankPage() {
  const { player } = usePlayer();
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [coPlayers, setCoPlayers] = useState<any[]>([]);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState<number | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch('/api/player-app/leaderboard').then(r => r.json()),
      fetch(`/api/player-app/${player.playerId}/co-players`).then(r => r.json()),
      fetch(`/api/player/${player.playerId}/profile`).then(r => r.json()),
    ]).then(([lbData, cpData, profData]) => {
      if (lbData.success) setLeaderboard(lbData.leaderboard || []);
      if (cpData.success) setCoPlayers(cpData.coPlayers || []);
      if (profData.success) setMyProfile(profData);
    }).finally(() => setLoading(false));
  }, [player]);

  const handleFollow = async (targetId: number) => {
    if (!player) return;
    setFollowLoading(targetId);

    try {
      const res = await fetch(`/api/player-app/${player.playerId}/follow/${targetId}`, { method: 'POST' });
      const data = await res.json();

      if (data.success || res.status === 200) {
        setCoPlayers(prev => prev.map(p => p.id === targetId ? { ...p, isFollowing: true } : p));
      }
    } catch { /* ignore */ }
    setFollowLoading(null);
  };

  const handleUnfollow = async (targetId: number) => {
    if (!player) return;
    setFollowLoading(targetId);

    try {
      await fetch(`/api/player-app/${player.playerId}/follow/${targetId}`, { method: 'DELETE' });
      setCoPlayers(prev => prev.map(p => p.id === targetId ? { ...p, isFollowing: false } : p));
    } catch { /* ignore */ }
    setFollowLoading(null);
  };

  const viewProfile = async (id: number) => {
    const res = await fetch(`/api/player/${id}/profile`);
    const data = await res.json();
    if (data.success) {
      setSelectedProfile(data);
      setSelectedPlayer(id);
    }
  };

  // هل هذا اللاعب co-player (يمكن متابعته)
  const isCoPlayer = (id: number) => coPlayers.some(p => p.id === id);
  const isFollowing = (id: number) => coPlayers.find(p => p.id === id)?.isFollowing || false;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const prog = myProfile?.progression;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <h1 className="text-white text-lg font-bold mb-4">🏆 التصنيف والرانك</h1>

      {/* ── رتبتي ── */}
      {prog && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 mb-4"
          style={{
            background: `linear-gradient(135deg, ${RANK_COLORS[prog.rankTier]}15, rgba(5,5,5,0.9))`,
            border: `1px solid ${RANK_COLORS[prog.rankTier]}30`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl">{RANK_BADGES[prog.rankTier]}</span>
              <span className="text-white text-sm font-bold mr-2">{RANK_NAMES_AR[prog.rankTier]}</span>
            </div>
            <div className="text-left">
              <span className="text-xs text-gray-400">RR</span>
              <span className="text-lg font-bold mr-1" style={{ color: RANK_COLORS[prog.rankTier] }}>
                {prog.rankRR}
              </span>
              <span className="text-gray-600 text-[10px]">/100</span>
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(prog.rankRR, 100)}%` }}
              className="h-full rounded-full"
              style={{ background: RANK_COLORS[prog.rankTier] }}
            />
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'leaderboard', label: '🏅 الترتيب' },
          { key: 'coplayers', label: '👥 لعبت معهم' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all ${
              tab === t.key
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-white/5 text-gray-500 border border-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Leaderboard ── */}
        {tab === 'leaderboard' && (
          <motion.div key="lb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* ── Podium Top 3 ── */}
            {leaderboard.length >= 3 && (
              <div className="flex items-end justify-center gap-3 pt-4 pb-2">
                {/* #2 Silver */}
                <div className="flex flex-col items-center" onClick={() => leaderboard[1]?.id !== player?.playerId && viewProfile(leaderboard[1]?.id)}>
                  <div className="w-14 h-14 rounded-full bg-white/5 border-2 border-gray-400/40 flex items-center justify-center overflow-hidden mb-1">
                    {leaderboard[1]?.avatarUrl ? <img src={leaderboard[1].avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <span className="text-xs">🥈</span>
                  <p className="text-[10px] text-white font-medium mt-0.5 max-w-[70px] truncate text-center">{leaderboard[1]?.name}</p>
                  <p className="text-[9px] text-gray-500">Lv.{leaderboard[1]?.level} • {leaderboard[1]?.rankRR} RR</p>
                </div>
                {/* #1 Gold */}
                <div className="flex flex-col items-center -mt-4" onClick={() => leaderboard[0]?.id !== player?.playerId && viewProfile(leaderboard[0]?.id)}>
                  <div className="w-[72px] h-[72px] rounded-full border-[3px] border-amber-400/60 flex items-center justify-center overflow-hidden mb-1 shadow-lg shadow-amber-500/20" style={{background:'rgba(251,191,36,0.08)'}}>
                    {leaderboard[0]?.avatarUrl ? <img src={leaderboard[0].avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <span className="text-lg">🥇</span>
                  <p className="text-xs text-amber-400 font-bold mt-0.5 max-w-[80px] truncate text-center">{leaderboard[0]?.name}</p>
                  <p className="text-[9px] text-gray-400">Lv.{leaderboard[0]?.level} • {leaderboard[0]?.rankRR} RR</p>
                </div>
                {/* #3 Bronze */}
                <div className="flex flex-col items-center" onClick={() => leaderboard[2]?.id !== player?.playerId && viewProfile(leaderboard[2]?.id)}>
                  <div className="w-14 h-14 rounded-full bg-white/5 border-2 border-amber-700/40 flex items-center justify-center overflow-hidden mb-1">
                    {leaderboard[2]?.avatarUrl ? <img src={leaderboard[2].avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <span className="text-xs">🥉</span>
                  <p className="text-[10px] text-white font-medium mt-0.5 max-w-[70px] truncate text-center">{leaderboard[2]?.name}</p>
                  <p className="text-[9px] text-gray-500">Lv.{leaderboard[2]?.level} • {leaderboard[2]?.rankRR} RR</p>
                </div>
              </div>
            )}

            {/* ── Remaining List ── */}
            <div className="space-y-1.5">
              {leaderboard.slice(3).map((p: any, i: number) => (
                <div
                  key={p.id}
                  onClick={() => p.id !== player?.playerId && viewProfile(p.id)}
                  className={`rounded-xl p-3 flex items-center gap-3 transition-colors ${p.id !== player?.playerId ? 'cursor-pointer hover:bg-white/5' : ''}`}
                  style={{
                    background: player?.playerId === p.id ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)',
                    border: player?.playerId === p.id ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-sm font-bold w-6 text-center text-gray-600">{i + 4}</span>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center overflow-hidden">
                    {p.avatarUrl ? <img src={p.avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-xs font-medium">{p.name}</p>
                    <p className="text-gray-500 text-[10px]">{RANK_BADGES[p.rankTier]} {RANK_NAMES_AR[p.rankTier]} • Lv.{p.level}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-amber-400 text-xs font-bold">{p.rankRR} RR</p>
                    <p className="text-gray-600 text-[10px]">{p.totalMatches} مباراة</p>
                  </div>
                  {p.id !== player?.playerId && isCoPlayer(p.id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); isFollowing(p.id) ? handleUnfollow(p.id) : handleFollow(p.id); }}
                      disabled={followLoading === p.id}
                      className={`text-[10px] px-2 py-1 rounded-lg transition-all ${isFollowing(p.id) ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-500 hover:text-amber-400'}`}
                    >
                      {followLoading === p.id ? '...' : isFollowing(p.id) ? '⭐' : '☆'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Co-Players ── */}
        {tab === 'coplayers' && (
          <motion.div key="cp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {coPlayers.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-8">العب مباراة أولاً لتعرف لاعبين!</p>
            )}
            {coPlayers.map((p: any) => (
              <div
                key={p.id}
                onClick={() => viewProfile(p.id)}
                className="rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center overflow-hidden">
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} className="w-full h-full object-cover" alt="" />
                  ) : '🎭'}
                </div>
                <div className="flex-1">
                  <p className="text-white text-xs font-medium">{p.name}</p>
                  <p className="text-gray-500 text-[10px]">
                    {RANK_BADGES[p.rankTier]} {RANK_NAMES_AR[p.rankTier]} • Lv.{p.level} • {p.matchCount} مباراة مشتركة
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); p.isFollowing ? handleUnfollow(p.id) : handleFollow(p.id); }}
                  disabled={followLoading === p.id}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                    p.isFollowing
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-gray-500 border border-white/10 hover:text-amber-400'
                  }`}
                >
                  {followLoading === p.id ? '...' : p.isFollowing ? '⭐ متابع' : '☆ تابع'}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── بروفايل لاعب (Modal) ── */}
      <AnimatePresence>
        {selectedProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-black/80 flex items-end justify-center"
            style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
            onClick={() => { setSelectedProfile(null); setSelectedPlayer(null); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto"
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-gray-700 mx-auto mb-4" />

              {/* هيدر */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-white/5 border-2 flex items-center justify-center overflow-hidden"
                  style={{ borderColor: RANK_COLORS[selectedProfile.progression?.rankTier] || '#6b7280' }}
                >
                  {selectedProfile.player?.avatarUrl ? (
                    <img src={selectedProfile.player.avatarUrl} className="w-full h-full object-cover" alt="" />
                  ) : <span className="text-2xl">🎭</span>}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-bold">{selectedProfile.player?.name}</h3>
                  <p className="text-gray-500 text-xs">
                    {RANK_BADGES[selectedProfile.progression?.rankTier]} {RANK_NAMES_AR[selectedProfile.progression?.rankTier]}
                    {' • '}Lv.{selectedProfile.progression?.level}
                  </p>
                </div>

                {/* زر متابعة */}
                {selectedPlayer && selectedPlayer !== player?.playerId && isCoPlayer(selectedPlayer) && (
                  <button
                    onClick={() => isFollowing(selectedPlayer!) ? handleUnfollow(selectedPlayer!) : handleFollow(selectedPlayer!)}
                    disabled={followLoading === selectedPlayer}
                    className={`text-xs px-4 py-2 rounded-xl transition-all ${
                      isFollowing(selectedPlayer!)
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-white/5 text-gray-500 border border-white/10'
                    }`}
                  >
                    {followLoading === selectedPlayer ? '...' : isFollowing(selectedPlayer!) ? '⭐ متابع' : '☆ تابع'}
                  </button>
                )}
              </div>

              {/* إحصائيات */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'مباريات', value: selectedProfile.stats?.totalMatches || 0 },
                  { label: 'فوز', value: `${selectedProfile.stats?.winRate || 0}%` },
                  { label: 'نجاة', value: `${selectedProfile.stats?.survivalRate || 0}%` },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="text-white text-sm font-bold">{s.value}</div>
                    <div className="text-gray-500 text-[10px]">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* آخر مباريات */}
              {selectedProfile.matchHistory?.slice(0, 5).map((m: any, i: number) => {
                const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(m.role || '');
                const won = (isMafia && m.matchWinner === 'MAFIA') || (!isMafia && m.matchWinner === 'CITIZEN');
                return (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5">
                    <span className={won ? 'text-green-400' : 'text-red-400'}>{won ? '🏆' : '💀'} {m.role}</span>
                    <span className="text-gray-600">
                      {m.matchDate ? new Date(m.matchDate).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' }) : ''}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
