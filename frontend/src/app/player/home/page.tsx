'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RANK_NAMES_AR, RANK_BADGES } from '@/lib/ranks';
import { NotificationBell } from '@/components/NotificationBell';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const WHATSAPP_NUMBER = '962793390966';
const INSTAGRAM_URL = 'https://www.instagram.com/mafia_club_jo/';
const SNAPCHAT_URL = 'https://www.snapchat.com/add/mafia_club26';

const DIFFICULTY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  easy: { label: 'سهل', color: '#22c55e', icon: '🟢' },
  medium: { label: 'متوسط', color: '#f59e0b', icon: '🟡' },
  hard: { label: 'صعب', color: '#ef4444', icon: '🔴' },
  expert: { label: 'خبير', color: '#a855f7', icon: '🟣' },
};

export default function HomePage() {
  const { player } = usePlayer();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch(`/api/player/${player.playerId}/profile`).then(r => r.json()),
      fetch(`/api/player-app/${player.playerId}/following-feed`).then(r => r.json()),
      fetch(`/api/player-app/activities/upcoming?playerId=${player.playerId}`).then(r => r.json()),
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

  // تجميع فيد الأصدقاء بالجلسة
  const groupedFeed = groupFeedBySession(feed);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 space-y-5 pb-6">
      {/* ── الجرس + Hero ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
        <NotificationBell />
      </div>

      {/* ── بانر تفعيل الإشعارات ── */}
      <PushBanner />
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
      {profile?.activeGame && (() => {
        const g = profile.activeGame;
        const isDead = g.isAlive === false;
        const isOver = g.phase === 'GAME_OVER';
        const canLeave = isDead || isOver;

        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl p-4"
            style={{
              background: canLeave
                ? 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(5,5,5,0.9))'
                : 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(5,5,5,0.9))',
              border: canLeave
                ? '1px solid rgba(239,68,68,0.25)'
                : '1px solid rgba(34,197,94,0.3)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-xs font-medium ${canLeave ? 'text-red-400' : 'text-green-400'}`}>
                  {isOver ? '🏁 اللعبة انتهت' : isDead ? '💀 تم إقصاؤك' : '🟢 لعبة نشطة'}
                </span>
                <p className="text-white text-sm mt-1">{g.gameName}</p>
              </div>
              <div className="flex items-center gap-2">
                {canLeave && (
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        const { io } = await import('socket.io-client');
                        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '';
                        const s = io(socketUrl, { transports: ['websocket'] });
                        s.emit('room:player-exit', {
                          roomId: g.roomId,
                          playerId: player?.playerId,
                        }, (res: any) => {
                          s.disconnect();
                          if (res?.success) {
                            setProfile((prev: any) => prev ? { ...prev, activeGame: null } : prev);
                          }
                        });
                        // timeout fallback
                        setTimeout(() => { s.disconnect(); }, 3000);
                      } catch {}
                    }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                  >
                    🚪 مغادرة
                  </button>
                )}
                <Link href="/player/join">
                  <span className={`text-xs ${canLeave ? 'text-gray-500' : 'text-green-400'}`}>العودة ←</span>
                </Link>
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* ── أنشطة قادمة ── */}
      {upcoming.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white text-sm font-semibold">📅 أنشطة قادمة</h2>
            <Link href="/player/games" className="text-amber-500/60 text-[10px]">عرض الكل ←</Link>
          </div>
          <div className="space-y-2">
            {upcoming.map((act: any) => {
              const diff = DIFFICULTY_LABELS[act.difficulty] || DIFFICULTY_LABELS.medium;
              return (
                <motion.div
                  key={act.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedActivity(act)}
                  className="rounded-xl p-3 flex items-center justify-between cursor-pointer active:bg-white/[0.06] transition-colors"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm">{act.name}</p>
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{
                        background: `${diff.color}15`,
                        color: diff.color,
                      }}>{diff.icon} {diff.label}</span>
                    </div>
                    <p className="text-gray-500 text-[10px] mt-0.5">
                      {new Date(act.date).toLocaleDateString('ar-JO', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {act.locationName && ` • 📍 ${act.locationName}`}
                    </p>
                    <p className="text-gray-600 text-[10px] mt-0.5">
                      👥 {act.bookedCount}/{act.maxPlayers || 20} لاعب
                    </p>
                  </div>
                  <span className="text-amber-400 text-xs">🎟️</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── فيد الأصدقاء ── */}
      {groupedFeed.length > 0 ? (
        <div>
          <h2 className="text-white text-sm font-semibold mb-3">👥 أخبار أصدقائك</h2>
          <div className="space-y-2">
            {groupedFeed.slice(0, 8).map((item: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs shrink-0 overflow-hidden">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" />
                  ) : '🎭'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{item.playerName}</p>
                  <p className="text-gray-500 text-[10px]">{item.description}</p>
                </div>
                {item.type === 'level_up' && (
                  <span className="text-amber-400 text-xs shrink-0">🎉</span>
                )}
                {item.type === 'session' && (
                  <span className="text-cyan-400 text-[10px] shrink-0">🎮 {item.matchCount}</span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-gray-600 text-sm">لا أخبار بعد — تابع لاعبين من صفحة التصنيف!</p>
        </div>
      )}

      {/* ── تابعنا على وسائل التواصل ── */}
      <div className="space-y-2">
        <h2 className="text-white text-sm font-semibold">📱 تابعنا</h2>
        <div className="grid grid-cols-2 gap-2">
          <motion.a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="block rounded-2xl p-4 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(225,48,108,0.1), rgba(131,58,180,0.1), rgba(253,29,29,0.05))',
              border: '1px solid rgba(225,48,108,0.2)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#e1306c' }}>
              📸 Instagram
            </p>
            <p className="text-gray-500 text-[10px] mt-1">@mafia_club_jo</p>
          </motion.a>

          <motion.a
            href={SNAPCHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="block rounded-2xl p-4 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(255,252,0,0.08), rgba(255,221,0,0.05))',
              border: '1px solid rgba(255,252,0,0.2)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: '#FFFC00' }}>
              👻 Snapchat
            </p>
            <p className="text-gray-500 text-[10px] mt-1">@mafia_club26</p>
          </motion.a>
        </div>
      </div>

      {/* ── زر WhatsApp عائم ── */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 left-4 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 transition-transform hover:scale-110 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)' }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>

      {/* ── Modal تفاصيل النشاط ── */}
      <AnimatePresence>
        {selectedActivity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center"
            onClick={() => setSelectedActivity(null)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-lg rounded-t-3xl p-6"
              style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
              <h3 className="text-white text-lg font-bold mb-1">{selectedActivity.name}</h3>

              {selectedActivity.description && (
                <p className="text-gray-400 text-xs mb-3">{selectedActivity.description}</p>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span>📅</span>
                  <span>{new Date(selectedActivity.date).toLocaleDateString('ar-JO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {selectedActivity.locationName && (
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span>📍</span>
                    <span>{selectedActivity.locationName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <span>👥</span>
                  <span>{selectedActivity.bookedCount}/{selectedActivity.maxPlayers || 20} لاعب</span>
                </div>
                {(() => {
                  const d = DIFFICULTY_LABELS[selectedActivity.difficulty] || DIFFICULTY_LABELS.medium;
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <span>{d.icon}</span>
                      <span style={{ color: d.color }}>{d.label}</span>
                    </div>
                  );
                })()}
                {selectedActivity.basePrice && selectedActivity.basePrice !== '0' && (
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <span>💰</span>
                    <span>{selectedActivity.basePrice} ₪</span>
                  </div>
                )}
              </div>

              {/* عروض المكان */}
              {(() => {
                const offers: any[] = Array.isArray(selectedActivity.locationOffers) ? selectedActivity.locationOffers : [];
                if (offers.length === 0) return null;
                return (
                  <div className="mb-4">
                    <p className="text-gray-400 text-xs mb-2">🎁 العروض المتاحة:</p>
                    <div className="space-y-1.5">
                      {offers.map((offer: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl text-xs bg-white/5 border border-white/5 text-gray-300"
                        >
                          <span className="text-amber-400">{offer.name || offer.title || `عرض ${idx + 1}`}</span>
                          {offer.price && <span className="text-gray-500 mr-2"> • {offer.price} ₪</span>}
                          {offer.description && <p className="text-gray-500 text-[10px] mt-0.5">{offer.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedActivity(null);
                    router.push('/player/games');
                  }}
                  className="flex-1 py-3 rounded-xl text-sm font-medium text-black"
                  style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                >
                  احجز الآن 🎟️
                </button>
                {selectedActivity.locationMapUrl && (
                  <a
                    href={selectedActivity.locationMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 rounded-xl text-sm font-medium text-white flex items-center gap-1"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    📍 الموقع
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── تجميع الفيد بالجلسة ──
function groupFeedBySession(feed: any[]): any[] {
  const groups: any[] = [];
  const sessionMap = new Map<string, any>();

  for (const item of feed) {
    const playerId = item.playerId;
    const dateKey = item.matchDate ? new Date(item.matchDate).toDateString() : '';
    const key = `${playerId}-${dateKey}`;

    if (sessionMap.has(key)) {
      sessionMap.get(key).matchCount++;
    } else {
      const entry = {
        type: 'session',
        playerId,
        playerName: item.playerInfo?.name || item.playerName,
        avatarUrl: item.playerInfo?.avatarUrl,
        matchCount: 1,
        dateKey,
        description: `لعب يوم ${dateKey ? new Date(dateKey).toLocaleDateString('ar-JO', { weekday: 'long', month: 'short', day: 'numeric' }) : ''}`,
      };
      sessionMap.set(key, entry);
    }
  }

  // تحديث الوصف بعد التجميع
  sessionMap.forEach((entry) => {
    entry.description += ` — ${entry.matchCount} ${entry.matchCount === 1 ? 'لعبة' : 'ألعاب'}`;
    groups.push(entry);
  });

  return groups;
}

// ══════════════════════════════════════════════════════
// 🔔 بانر تفعيل الإشعارات — يظهر مرة واحدة
// ══════════════════════════════════════════════════════
function PushBanner() {
  const { permissionState, needsInstall, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const d = localStorage.getItem('push_banner_dismissed');
      if (d) setDismissed(true);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('push_banner_dismissed', '1');
  };

  // لا تعرض إذا: ممنوح / مرفوض / أخفاه المستخدم
  if (dismissed || permissionState === 'granted' || permissionState === 'denied') return null;

  // ── iOS بدون PWA ──
  if (needsInstall) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.03))',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 14, padding: '14px 16px', position: 'relative',
        }}
      >
        <button onClick={dismiss} style={{
          position: 'absolute', top: 8, left: 8, background: 'none', border: 'none',
          color: 'rgba(255,255,255,0.3)', fontSize: 16, cursor: 'pointer', lineHeight: 1,
        }}>✕</button>
        <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
          📱 فعّل الإشعارات على iPhone
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.7 }}>
          1. اضغط <span style={{ fontSize: 15 }}>⎙</span> (مشاركة) في أسفل Safari<br/>
          2. اختر <strong style={{ color: '#fff' }}>"إضافة إلى الشاشة الرئيسية"</strong><br/>
          3. افتح التطبيق من الشاشة الرئيسية ثم فعّل الإشعارات
        </div>
      </motion.div>
    );
  }

  // ── زر تفعيل عادي (Android / Desktop / iOS PWA) ──
  if (permissionState === 'prompt') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(59,130,246,0.03))',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 14, padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12, position: 'relative',
        }}
      >
        <button onClick={dismiss} style={{
          position: 'absolute', top: 8, left: 8, background: 'none', border: 'none',
          color: 'rgba(255,255,255,0.3)', fontSize: 16, cursor: 'pointer', lineHeight: 1,
        }}>✕</button>
        <div style={{ fontSize: 28 }}>🔔</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
            لا تفوّت أي تحديث!
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
            فعّل الإشعارات لتصلك أخبار الأنشطة والألعاب
          </div>
        </div>
        <button
          onClick={async () => {
            setEnabling(true);
            const ok = await requestPermission();
            setEnabling(false);
            if (ok) dismiss();
          }}
          disabled={enabling}
          style={{
            padding: '8px 18px', borderRadius: 10, border: 'none',
            background: enabling ? 'rgba(59,130,246,0.3)' : '#3b82f6',
            color: '#fff', fontWeight: 600, fontSize: 13,
            cursor: enabling ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {enabling ? '⏳' : 'تفعيل'}
        </button>
      </motion.div>
    );
  }

  return null;
}
