'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';

type Tab = 'upcoming' | 'history';

export default function GamesPage() {
  const { player } = usePlayer();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [activities, setActivities] = useState<any[]>([]);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState<number | null>(null);
  const [followingBookers, setFollowingBookers] = useState<Record<number, any[]>>({});
  const [showBookersFor, setShowBookersFor] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toDateString());

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch('/api/player-app/activities/upcoming').then(r => r.json()),
      fetch(`/api/player-app/${player.playerId}/bookings`).then(r => r.json()),
      fetch(`/api/player/${player.playerId}/profile`).then(r => r.json()),
    ]).then(([actData, bookData, profileData]) => {
      if (actData.success) setActivities(actData.activities || []);
      if (bookData.success) setMyBookings(bookData.bookings || []);
      if (profileData.success) setMatchHistory(profileData.matchHistory || []);

      // جلب المتابَعين الحاجزين لكل نشاط
      if (actData.success && actData.activities) {
        actData.activities.forEach((act: any) => {
          fetch(`/api/player-app/activities/${act.id}/following-bookers?playerId=${player!.playerId}`)
            .then(r => r.json())
            .then(data => {
              if (data.success) {
                setFollowingBookers(prev => ({ ...prev, [act.id]: data.bookers || [] }));
              }
            });
        });
      }
    }).finally(() => setLoading(false));
  }, [player]);

  const isBooked = (activityId: number) => myBookings.some(b => b.activityId === activityId);

  const handleBook = async (activityId: number) => {
    if (!player) return;
    setBookingLoading(activityId);

    try {
      const res = await fetch('/api/player-app/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${player.token}`,
        },
        body: JSON.stringify({ activityId }),
      });
      const data = await res.json();

      if (data.success) {
        setMyBookings(prev => [...prev, data.booking]);
        setActivities(prev => prev.map(a =>
          a.id === activityId ? { ...a, bookedCount: (a.bookedCount || 0) + 1 } : a
        ));
      }
    } catch { /* ignore */ }
    setBookingLoading(null);
  };

  // ── شريط التقويم ──
  const today = new Date();
  const weekDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const dayNames = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-white text-lg font-bold">🎮 الألعاب والحجوزات</h1>
        <span className="text-xs text-gray-500">{monthNames[today.getMonth()]} {today.getFullYear()}</span>
      </div>

      {/* ── شريط التقويم الأسبوعي ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 scrollbar-hide">
        {weekDays.map(d => {
          const isToday = d.toDateString() === today.toDateString();
          const isSelected = d.toDateString() === selectedDate;
          const hasActivity = activities.some(a => new Date(a.date).toDateString() === d.toDateString());
          return (
            <button
              key={d.toDateString()}
              onClick={() => setSelectedDate(d.toDateString())}
              className={`shrink-0 w-12 py-2 rounded-xl text-center transition-all ${
                isSelected ? 'bg-amber-500/20 border border-amber-500/40' :
                isToday ? 'bg-white/5 border border-amber-500/10' :
                'bg-white/[0.02] border border-white/5'
              }`}
            >
              <p className={`text-[9px] ${isSelected ? 'text-amber-400' : 'text-gray-600'}`}>{dayNames[d.getDay()]}</p>
              <p className={`text-sm font-bold ${isSelected ? 'text-amber-400' : isToday ? 'text-white' : 'text-gray-500'}`}>{d.getDate()}</p>
              {hasActivity && <div className={`w-1 h-1 rounded-full mx-auto mt-0.5 ${isSelected ? 'bg-amber-400' : 'bg-amber-500/40'}`} />}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['upcoming', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === t
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-white/5 text-gray-500 border border-white/5'
            }`}
          >
            {t === 'upcoming' ? '📅 أنشطة قادمة' : '📊 تاريخ مبارياتي'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Tab 1: الأنشطة ── */}
        {tab === 'upcoming' && (
          <motion.div key="upcoming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {activities.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-8">لا توجد أنشطة قادمة حالياً</p>
            )}
            {activities.map(act => {
              const booked = isBooked(act.id);
              const actFollowers = followingBookers[act.id] || [];

              return (
                <div key={act.id} className="rounded-2xl p-4" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: booked ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white text-sm font-medium">{act.name}</p>
                      <p className="text-gray-500 text-[10px] mt-1">
                        {new Date(act.date).toLocaleDateString('ar-JO', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <p className="text-gray-600 text-[10px] mt-0.5">
                        👥 {act.bookedCount} حاجز
                        {act.basePrice && act.basePrice !== '0' && ` • 💰 ${act.basePrice} ₪`}
                      </p>
                    </div>

                    {booked ? (
                      <span className="text-green-400 text-xs px-3 py-1.5 rounded-lg bg-green-500/10">✅ محجوز</span>
                    ) : (
                      <button
                        onClick={() => handleBook(act.id)}
                        disabled={bookingLoading === act.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium text-black disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                      >
                        {bookingLoading === act.id ? '...' : 'احجز'}
                      </button>
                    )}
                  </div>

                  {/* شارة أصدقاء حاجزين */}
                  {actFollowers.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setShowBookersFor(showBookersFor === act.id ? null : act.id)}
                        className="text-[11px] text-amber-400/80 hover:text-amber-400 transition-colors"
                      >
                        👥 {actFollowers.length} من أصدقائك حجزوا
                      </button>

                      <AnimatePresence>
                        {showBookersFor === act.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 space-y-1.5">
                              {actFollowers.map((b: any) => (
                                <div key={b.id} className="flex items-center gap-2 text-[11px] text-gray-400">
                                  <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center overflow-hidden">
                                    {b.avatarUrl ? (
                                      <img src={b.avatarUrl} className="w-full h-full object-cover" alt="" />
                                    ) : '🎭'}
                                  </div>
                                  <span>{b.name}</span>
                                  <span className="text-gray-600">Lv.{b.level}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}

        {/* ── Tab 2: تاريخ المباريات ── */}
        {tab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {matchHistory.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-8">لم تلعب أي مباراة بعد</p>
            )}
            {matchHistory.slice(0, 20).map((m: any, i: number) => {
              const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'].includes(m.role || '');
              const won = (isMafia && m.matchWinner === 'MAFIA') || (!isMafia && m.matchWinner === 'CITIZEN');

              return (
                <div key={i} className="rounded-xl p-3 flex items-center justify-between" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${won ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${won ? 'text-green-400' : 'text-red-400'}`}>
                        {won ? '🏆 فوز' : '💀 خسارة'}
                      </span>
                      <span className="text-[10px] text-gray-600">{m.role}</span>
                    </div>
                    <p className="text-gray-500 text-[10px] mt-0.5">
                      {m.matchDate ? new Date(m.matchDate).toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' }) : ''}
                      {m.matchPlayerCount ? ` • ${m.matchPlayerCount} لاعب` : ''}
                    </p>
                  </div>
                  <div className="text-left">
                    <span className={`text-xs ${m.survived ? 'text-cyan-400' : 'text-gray-600'}`}>
                      {m.survived ? '🛡️ نجا' : '☠️ أُقصي'}
                    </span>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
