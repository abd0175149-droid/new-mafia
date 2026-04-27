'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';

type Tab = 'upcoming' | 'history';

const DIFFICULTY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  easy: { label: 'سهل', color: '#22c55e', icon: '🟢' },
  medium: { label: 'متوسط', color: '#f59e0b', icon: '🟡' },
  hard: { label: 'صعب', color: '#ef4444', icon: '🔴' },
  expert: { label: 'خبير', color: '#a855f7', icon: '🟣' },
};

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // null = الكل
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [confirmBooking, setConfirmBooking] = useState<any>(null);
  const [selectedOffer, setSelectedOffer] = useState<number | null>(null);

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch(`/api/player-app/activities/upcoming?playerId=${player.playerId}`).then(r => r.json()),
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

  const handleBook = async (activityId: number, offerId?: number) => {
    if (!player) return;
    setBookingLoading(activityId);

    try {
      const res = await fetch('/api/player-app/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${player.token}`,
        },
        body: JSON.stringify({ activityId, offerId }),
      });
      const data = await res.json();

      if (data.success) {
        setMyBookings(prev => [...prev, data.booking]);
        setActivities(prev => prev.map(a =>
          a.id === activityId ? { ...a, bookedCount: (a.bookedCount || 0) + 1 } : a
        ));
        setConfirmBooking(null);
        setSelectedOffer(null);
      } else {
        alert(data.error || 'خطأ في الحجز');
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

  // أي يوم فيه أنشطة
  const daysWithActivities = new Set(
    activities.map(a => new Date(a.date).toDateString())
  );

  // الأنشطة المفلترة
  const filteredActivities = selectedDate
    ? activities.filter(a => new Date(a.date).toDateString() === selectedDate)
    : activities;

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

      {/* ── شريط التقويم ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-3 mb-1 scrollbar-hide">
        {/* زر "الكل" */}
        <button
          onClick={() => setSelectedDate(null)}
          className={`shrink-0 w-12 py-2 rounded-xl text-center transition-all ${
            selectedDate === null
              ? 'bg-amber-500/20 border border-amber-500/40'
              : 'bg-white/[0.02] border border-white/5'
          }`}
        >
          <p className={`text-[9px] ${selectedDate === null ? 'text-amber-400' : 'text-gray-600'}`}>الكل</p>
          <p className={`text-sm font-bold ${selectedDate === null ? 'text-amber-400' : 'text-gray-500'}`}>📋</p>
        </button>

        {weekDays.map(d => {
          const dateStr = d.toDateString();
          const isToday = dateStr === today.toDateString();
          const isSelected = dateStr === selectedDate;
          const hasActivity = daysWithActivities.has(dateStr);
          return (
            <button
              key={dateStr}
              onClick={() => hasActivity ? setSelectedDate(dateStr) : null}
              disabled={!hasActivity}
              className={`shrink-0 w-12 py-2 rounded-xl text-center transition-all ${
                isSelected ? 'bg-amber-500/20 border border-amber-500/40' :
                isToday ? 'bg-white/5 border border-amber-500/10' :
                hasActivity ? 'bg-white/[0.02] border border-white/5 cursor-pointer' :
                'bg-white/[0.01] border border-white/[0.03] opacity-40 cursor-not-allowed'
              }`}
            >
              <p className={`text-[9px] ${isSelected ? 'text-amber-400' : hasActivity ? 'text-gray-500' : 'text-gray-700'}`}>
                {dayNames[d.getDay()]}
              </p>
              <p className={`text-sm font-bold ${
                isSelected ? 'text-amber-400' :
                isToday ? 'text-white' :
                hasActivity ? 'text-gray-400' : 'text-gray-700'
              }`}>
                {d.getDate()}
              </p>
              {hasActivity && (
                <div className={`w-1.5 h-1.5 rounded-full mx-auto mt-0.5 ${
                  isSelected ? 'bg-amber-400' : 'bg-green-500'
                }`} />
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <p className="text-amber-500/60 text-[10px] text-center mb-2">
          عرض أنشطة يوم {new Date(selectedDate).toLocaleDateString('ar-JO', { weekday: 'long', month: 'short', day: 'numeric' })}
          <button onClick={() => setSelectedDate(null)} className="text-amber-400 mr-2 underline">عرض الكل</button>
        </p>
      )}

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
          <motion.div key="upcoming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3 pb-6">
            {filteredActivities.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-8">
                {selectedDate ? 'لا توجد أنشطة في هذا اليوم' : 'لا توجد أنشطة قادمة حالياً'}
              </p>
            )}
            {filteredActivities.map(act => {
              const booked = isBooked(act.id);
              const actFollowers = followingBookers[act.id] || [];
              const diff = DIFFICULTY_LABELS[act.difficulty] || DIFFICULTY_LABELS.medium;
              const isFull = (act.bookedCount || 0) >= (act.maxPlayers || 20);
              const offers: any[] = Array.isArray(act.locationOffers) ? act.locationOffers : [];

              return (
                <motion.div
                  key={act.id}
                  layout
                  className="rounded-2xl p-4"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: booked ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0" onClick={() => setSelectedActivity(act)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white text-sm font-medium">{act.name}</p>
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0" style={{
                          background: `${diff.color}15`,
                          color: diff.color,
                        }}>{diff.icon} {diff.label}</span>
                      </div>
                      <p className="text-gray-500 text-[10px] mt-1">
                        {new Date(act.date).toLocaleDateString('ar-JO', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {act.locationName && (
                        <p className="text-gray-600 text-[10px] mt-0.5">📍 {act.locationName}</p>
                      )}
                      <p className="text-gray-600 text-[10px] mt-0.5">
                        👥 {act.bookedCount}/{act.maxPlayers || 20} لاعب
                        {act.basePrice && act.basePrice !== '0' && ` • 💰 ${act.basePrice} ₪`}
                      </p>
                      {/* Capacity Bar */}
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1.5 max-w-[140px]">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${Math.min(((act.bookedCount || 0) / (act.maxPlayers || 20)) * 100, 100)}%`,
                          background: isFull
                            ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                            : 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                        }} />
                      </div>
                    </div>

                    {booked ? (
                      <span className="text-green-400 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 shrink-0">✅ محجوز</span>
                    ) : isFull ? (
                      <span className="text-red-400 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 shrink-0">🚫 مكتمل</span>
                    ) : (
                      <button
                        onClick={() => {
                          if (offers.length > 0) {
                            setConfirmBooking(act);
                          } else {
                            setConfirmBooking(act);
                          }
                        }}
                        disabled={bookingLoading === act.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium text-black disabled:opacity-50 shrink-0"
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
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* ── Tab 2: تاريخ المباريات ── */}
        {tab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2 pb-6">
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

      {/* ── Modal تفاصيل الفعالية ── */}
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
                      <span style={{ color: d.color }}>مستوى {d.label}</span>
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

              <div className="flex gap-2">
                {!isBooked(selectedActivity.id) && (
                  <button
                    onClick={() => {
                      setSelectedActivity(null);
                      setConfirmBooking(selectedActivity);
                    }}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-black"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                  >
                    احجز الآن 🎟️
                  </button>
                )}
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

      {/* ── Modal تأكيد الحجز ── */}
      <AnimatePresence>
        {confirmBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center px-4"
            onClick={() => { setConfirmBooking(null); setSelectedOffer(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-white text-lg font-bold mb-1 text-center">تأكيد الحجز</h3>
              <p className="text-gray-400 text-sm text-center mb-4">{confirmBooking.name}</p>

              <div className="space-y-1.5 mb-4 text-sm text-gray-300">
                <p>📅 {new Date(confirmBooking.date).toLocaleDateString('ar-JO', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                {confirmBooking.locationName && <p>📍 {confirmBooking.locationName}</p>}
                <p>👥 {confirmBooking.bookedCount}/{confirmBooking.maxPlayers || 20} لاعب</p>
                {confirmBooking.basePrice && confirmBooking.basePrice !== '0' && (
                  <p>💰 {confirmBooking.basePrice} ₪</p>
                )}
              </div>

              {/* عروض المكان */}
              {(() => {
                const offers: any[] = Array.isArray(confirmBooking.locationOffers) ? confirmBooking.locationOffers : [];
                if (offers.length === 0) return null;
                return (
                  <div className="mb-4">
                    <p className="text-gray-400 text-xs mb-2">🎁 اختر عرض (اختياري):</p>
                    <div className="space-y-1.5">
                      {offers.map((offer: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedOffer(selectedOffer === idx ? null : idx)}
                          className={`w-full text-right p-2.5 rounded-xl text-xs transition-all ${
                            selectedOffer === idx
                              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                              : 'bg-white/5 border border-white/5 text-gray-400'
                          }`}
                        >
                          {offer.name || offer.title || `عرض ${idx + 1}`}
                          {offer.price && <span className="text-gray-500 mr-2">• {offer.price} ₪</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmBooking(null); setSelectedOffer(null); }}
                  className="flex-1 py-3 rounded-xl text-sm text-gray-400"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  إلغاء
                </button>
                <button
                  onClick={() => handleBook(confirmBooking.id, selectedOffer ?? undefined)}
                  disabled={bookingLoading === confirmBooking.id}
                  className="flex-1 py-3 rounded-xl text-sm font-medium text-black disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                >
                  {bookingLoading === confirmBooking.id ? '⏳ جاري...' : '✅ تأكيد الحجز'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
