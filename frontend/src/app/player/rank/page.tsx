'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import { RANK_NAMES_AR, RANK_BADGES, RANK_COLORS, RANK_RR_REQUIRED } from '@/lib/ranks';
import { useModalScrollLock } from '@/hooks/useModalScrollLock';

type Tab = 'leaderboard' | 'coplayers' | 'howto';

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
  const [glowing, setGlowing] = useState(true);
  const [progressionConfig, setProgressionConfig] = useState<any>(null);
  const myCardRef = useRef<HTMLDivElement>(null);

  // ── منع السكرول + swipe-to-close ──
  const profileModal = useModalScrollLock({
    isOpen: !!selectedProfile,
    onClose: () => { setSelectedProfile(null); setSelectedPlayer(null); },
  });

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch('/api/player-app/leaderboard').then(r => r.json()),
      fetch(`/api/player-app/${player.playerId}/co-players`).then(r => r.json()),
      fetch(`/api/player/${player.playerId}/profile`).then(r => r.json()),
      fetch('/api/progression-settings/public').then(r => r.json()).catch(() => null),
    ]).then(([lbData, cpData, profData, progCfg]) => {
      if (lbData.success) setLeaderboard(lbData.leaderboard || []);
      if (cpData.success) setCoPlayers(cpData.coPlayers || []);
      if (profData.success) setMyProfile(profData);
      if (progCfg?.success) setProgressionConfig(progCfg.config);
    }).finally(() => setLoading(false));
  }, [player]);

  // ── Auto-scroll to my card + glowing timer ──
  useEffect(() => {
    if (loading || !myCardRef.current) return;
    const timer1 = setTimeout(() => {
      myCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    const timer2 = setTimeout(() => setGlowing(false), 5000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [loading, tab]);

  const handleFollow = async (targetId: number) => {
    if (!player) return;
    setFollowLoading(targetId);
    try {
      const res = await fetch(`/api/player-app/${player.playerId}/follow/${targetId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success || res.status === 200) {
        setCoPlayers(prev => prev.map(p => p.id === targetId ? { ...p, isFollowing: true } : p));
      }
    } catch {}
    setFollowLoading(null);
  };

  const handleUnfollow = async (targetId: number) => {
    if (!player) return;
    setFollowLoading(targetId);
    try {
      await fetch(`/api/player-app/${player.playerId}/follow/${targetId}`, { method: 'DELETE' });
      setCoPlayers(prev => prev.map(p => p.id === targetId ? { ...p, isFollowing: false } : p));
    } catch {}
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

  const isCoPlayer = (id: number) => coPlayers.some(p => p.id === id);
  const isFollowing = (id: number) => coPlayers.find(p => p.id === id)?.isFollowing || false;

  // ── حساب الترتيب الخاص بي ──
  const myRank = leaderboard.findIndex(p => p.id === player?.playerId) + 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const prog = myProfile?.progression;
  const myStats = myProfile?.stats;
  const isMe = (id: number) => id === player?.playerId;

  // ── Glow style ──
  const glowStyle = glowing ? {
    boxShadow: '0 0 15px rgba(251,191,36,0.4), 0 0 30px rgba(251,191,36,0.2), 0 0 45px rgba(251,191,36,0.1)',
    animation: 'pulse-glow 1.5s ease-in-out infinite',
  } : {};

  const renderPlayerRow = (p: any, rank: number) => {
    const me = isMe(p.id);
    return (
      <div
        key={p.id}
        ref={me ? myCardRef : undefined}
        onClick={() => !me && viewProfile(p.id)}
        className={`rounded-xl p-3 flex items-center gap-3 transition-all ${!me ? 'cursor-pointer hover:bg-white/5' : ''}`}
        style={{
          background: me ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.03)',
          border: me ? '2px solid rgba(251,191,36,0.3)' : '1px solid rgba(255,255,255,0.06)',
          ...(me ? glowStyle : {}),
        }}
      >
        <span className={`text-sm font-bold w-6 text-center ${me ? 'text-amber-400' : 'text-gray-600'}`}>{rank}</span>
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center overflow-hidden">
          {p.avatarUrl ? <img src={p.avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${me ? 'text-amber-400' : 'text-white'}`} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {(p.name || '').length > 16 ? p.name.slice(0, 16) + '…' : p.name} {me && '(أنت)'}
          </p>
          <p className="text-gray-500 text-[10px]">
            {p.totalMatches || 0} مباراة • {p.totalWins || 0} فوز
          </p>
        </div>
        <span className="text-gray-300 text-[10px] w-16 text-center truncate">{RANK_BADGES[p.rankTier]} {RANK_NAMES_AR[p.rankTier]}</span>
        <span className="text-amber-400 text-xs font-bold w-10 text-center tabular-nums">{p.rankRR}</span>
        {!me && isCoPlayer(p.id) && (
          <button
            onClick={(e) => { e.stopPropagation(); isFollowing(p.id) ? handleUnfollow(p.id) : handleFollow(p.id); }}
            disabled={followLoading === p.id}
            className={`text-[10px] px-2 py-1 rounded-lg transition-all ${isFollowing(p.id) ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-500 hover:text-amber-400'}`}
          >
            {followLoading === p.id ? '...' : isFollowing(p.id) ? '⭐' : '☆'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      {/* ── CSS للـ Glow Animation ── */}
      <style jsx global>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 15px rgba(251,191,36,0.4), 0 0 30px rgba(251,191,36,0.2); }
          50% { box-shadow: 0 0 25px rgba(251,191,36,0.6), 0 0 50px rgba(251,191,36,0.3), 0 0 70px rgba(251,191,36,0.1); }
        }
      `}</style>

      <h1 className="text-white text-lg font-bold mb-4">🏆 التصنيف والرتب</h1>

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
              {myRank > 0 && <span className="text-gray-500 text-xs">#{myRank}</span>}
            </div>
            <div className="text-left">
              <span className="text-xs text-gray-400">RR</span>
              <span className="text-lg font-bold mr-1" style={{ color: RANK_COLORS[prog.rankTier] }}>
                {prog.rankRR}
              </span>
              <span className="text-gray-600 text-[10px]">/{RANK_RR_REQUIRED[prog.rankTier] || 100}</span>
            </div>
          </div>
          {/* ── إحصائيات سريعة ── */}
          {myStats && (
            <div className="flex gap-3 mt-3 text-center">
              <div className="flex-1 bg-white/5 rounded-lg py-1.5">
                <div className="text-white text-sm font-bold">{myStats.totalMatches}</div>
                <div className="text-gray-500 text-[9px]">مباراة</div>
              </div>
              <div className="flex-1 bg-white/5 rounded-lg py-1.5">
                <div className="text-green-400 text-sm font-bold">{myStats.totalWins}</div>
                <div className="text-gray-500 text-[9px]">فوز</div>
              </div>
              <div className="flex-1 bg-white/5 rounded-lg py-1.5">
                <div className="text-amber-400 text-sm font-bold">{myStats.winRate}%</div>
                <div className="text-gray-500 text-[9px]">نسبة فوز</div>
              </div>
              <div className="flex-1 bg-white/5 rounded-lg py-1.5">
                <div className="text-blue-400 text-sm font-bold">{prog.rankTier}</div>
                <div className="text-gray-500 text-[9px]">الرانك</div>
              </div>
            </div>
          )}
          <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((prog.rankRR / (RANK_RR_REQUIRED[prog.rankTier] || 100)) * 100, 100)}%` }}
              className="h-full rounded-full"
              style={{ background: RANK_COLORS[prog.rankTier] }}
            />
          </div>
        </motion.div>
      )}

      <div className="flex gap-2 mb-4">
        {[
          { key: 'leaderboard', label: '🏅 الترتيب' },
          { key: 'coplayers', label: '👥 لعبت معهم' },
          { key: 'howto', label: '📖 النقاط' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as Tab); if (t.key === 'leaderboard') setGlowing(true); }}
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
                <div className="flex flex-col items-center" onClick={() => !isMe(leaderboard[1]?.id) && viewProfile(leaderboard[1]?.id)}>
                  <div className="w-14 h-14 rounded-full bg-white/5 border-2 border-gray-400/40 flex items-center justify-center overflow-hidden mb-1">
                    {leaderboard[1]?.avatarUrl ? <img src={leaderboard[1].avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <span className="text-xs">🥈</span>
                  <p className="text-[10px] text-white font-medium mt-0.5 text-center" style={{ maxWidth: 70, overflow: 'hidden', whiteSpace: 'nowrap' }}>{(leaderboard[1]?.name || '').length > 8 ? leaderboard[1].name.slice(0, 8) + '…' : leaderboard[1]?.name}</p>
                  <p className="text-[9px] text-gray-500">{leaderboard[1]?.totalMatches || 0} مباراة • {leaderboard[1]?.rankRR} RR</p>
                </div>
                {/* #1 Gold */}
                <div className="flex flex-col items-center -mt-4" onClick={() => !isMe(leaderboard[0]?.id) && viewProfile(leaderboard[0]?.id)}>
                  <div className="w-[72px] h-[72px] rounded-full border-[3px] border-amber-400/60 flex items-center justify-center overflow-hidden mb-1 shadow-lg shadow-amber-500/20" style={{background:'rgba(251,191,36,0.08)'}}>
                    {leaderboard[0]?.avatarUrl ? <img src={leaderboard[0].avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <span className="text-lg">🥇</span>
                  <p className="text-xs text-amber-400 font-bold mt-0.5 text-center" style={{ maxWidth: 80, overflow: 'hidden', whiteSpace: 'nowrap' }}>{(leaderboard[0]?.name || '').length > 10 ? leaderboard[0].name.slice(0, 10) + '…' : leaderboard[0]?.name}</p>
                  <p className="text-[9px] text-gray-400">{leaderboard[0]?.totalMatches || 0} مباراة • {leaderboard[0]?.rankRR} RR</p>
                </div>
                {/* #3 Bronze */}
                <div className="flex flex-col items-center" onClick={() => !isMe(leaderboard[2]?.id) && viewProfile(leaderboard[2]?.id)}>
                  <div className="w-14 h-14 rounded-full bg-white/5 border-2 border-amber-700/40 flex items-center justify-center overflow-hidden mb-1">
                    {leaderboard[2]?.avatarUrl ? <img src={leaderboard[2].avatarUrl} className="w-full h-full object-cover" alt="" /> : '🎭'}
                  </div>
                  <span className="text-xs">🥉</span>
                  <p className="text-[10px] text-white font-medium mt-0.5 text-center" style={{ maxWidth: 70, overflow: 'hidden', whiteSpace: 'nowrap' }}>{(leaderboard[2]?.name || '').length > 8 ? leaderboard[2].name.slice(0, 8) + '…' : leaderboard[2]?.name}</p>
                  <p className="text-[9px] text-gray-500">{leaderboard[2]?.totalMatches || 0} مباراة • {leaderboard[2]?.rankRR} RR</p>
                </div>
              </div>
            )}

            {/* ── Header Row ── */}
            <div className="flex items-center gap-3 px-3 mb-1">
              <span className="w-6" /><span className="w-8" />
              <span className="flex-1 text-[9px] text-gray-600">اللاعب</span>
              <span className="text-[9px] text-gray-600 w-16 text-center">الرتبة</span>
              <span className="text-[9px] text-gray-600 w-10 text-center">RR</span>
            </div>
            <div className="space-y-1.5">
              {leaderboard.slice(3).map((p: any, i: number) => renderPlayerRow(p, i + 4))}
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
                    {RANK_BADGES[p.rankTier]} {RANK_NAMES_AR[p.rankTier]} • {p.matchCount} مباراة مشتركة
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

        {/* ── How To Earn Points ── */}
        {tab === 'howto' && (
          <motion.div key="howto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 pb-4">
            {progressionConfig ? (
              <>
                <div className="rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <p className="text-amber-400 text-xs font-bold mb-2">⭐ نقاط الخبرة (XP) — ترفع مستواك</p>
                  {[
                    { icon: '🎮', label: 'مشاركة في مباراة', val: progressionConfig.xp?.participation },
                    { icon: '🏆', label: 'فوز الفريق', val: progressionConfig.xp?.teamWin },
                    { icon: '💪', label: 'نجاة لكل جولة', val: progressionConfig.xp?.survivalPerRound },
                    { icon: '✅', label: 'قدرة صحيحة', val: progressionConfig.xp?.abilityCorrect },
                    { icon: '❌', label: 'قدرة خاطئة', val: progressionConfig.xp?.abilityIncorrect },
                    { icon: '🤝', label: 'ديل ناجح (مواطن أخرج مافيا)', val: progressionConfig.xp?.citizenDealOnMafia },
                    { icon: '💔', label: 'ديل فاشل', val: progressionConfig.xp?.failedDeal },
                    { icon: '🔴', label: 'ديل مافيا على مافيا', val: progressionConfig.xp?.mafiaDealOnMafia },
                    { icon: '⚔️', label: 'إقصاء خصم', val: progressionConfig.xp?.teamEliminationBonus },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <span className="text-gray-300 text-[11px]">{item.icon} {item.label}</span>
                      <span className={`text-xs font-bold ${(item.val ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {(item.val ?? 0) > 0 ? '+' : ''}{item.val ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <p className="text-blue-400 text-xs font-bold mb-2">🎖️ نقاط الرانك (RR) — ترفع رتبتك</p>
                  {[
                    { icon: '🏆', label: 'فوز', val: progressionConfig.rr?.teamWin },
                    { icon: '💀', label: 'خسارة', val: progressionConfig.rr?.teamLoss },
                    { icon: '🤝', label: 'ديل ناجح (مواطن)', val: progressionConfig.rr?.citizenDealOnMafia },
                    { icon: '💔', label: 'ديل فاشل', val: progressionConfig.rr?.failedDeal },
                    { icon: '🔴', label: 'ديل مافيا على مافيا', val: progressionConfig.rr?.mafiaDealOnMafia },
                    { icon: '💪', label: 'نجاة للنهاية', val: progressionConfig.rr?.survivedToEnd },
                    { icon: '✅', label: 'قدرة صحيحة', val: progressionConfig.rr?.abilityCorrect },
                    { icon: '❌', label: 'قدرة خاطئة', val: progressionConfig.rr?.abilityIncorrect },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <span className="text-gray-300 text-[11px]">{item.icon} {item.label}</span>
                      <span className={`text-xs font-bold ${(item.val ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {(item.val ?? 0) > 0 ? '+' : ''}{item.val ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <p className="text-purple-400 text-xs font-bold mb-2">👑 الرتب — RR المطلوب للترقية</p>
                  {[
                    { tier: 'INFORMANT', label: 'المُخبر', badge: '⭐' },
                    { tier: 'SOLDIER', label: 'الجندي', badge: '⭐⭐' },
                    { tier: 'CAPO', label: 'الكابو', badge: '🌟' },
                    { tier: 'UNDERBOSS', label: 'الأندربوس', badge: '🌟🌟' },
                    { tier: 'GODFATHER', label: 'الأب الروحي', badge: '👑' },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <span className="text-gray-300 text-[11px]">{r.badge} {r.label}</span>
                      <span className="text-purple-400 text-xs font-bold">
                        {progressionConfig.ranks?.[r.tier]?.rrRequired ?? '?'} RR
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-600 text-sm text-center py-8">جاري تحميل البيانات...</p>
            )}
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
            style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))', ...profileModal.backdropProps.style }}
            onClick={() => { setSelectedProfile(null); setSelectedPlayer(null); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto"
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', ...profileModal.modalProps.style }}
              onClick={e => e.stopPropagation()}
              ref={profileModal.modalContentRef}
              onTouchStart={profileModal.handleTouchStart}
              onTouchEnd={profileModal.handleTouchEnd}
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
                  </p>
                </div>
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
