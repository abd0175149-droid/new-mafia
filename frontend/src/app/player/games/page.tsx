'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ROLE_NAMES } from '@/lib/constants';
import { usePlayer } from '@/context/PlayerContext';
import { useSearchParams } from 'next/navigation';
import { useModalScrollLock } from '@/hooks/useModalScrollLock';

type Tab = 'upcoming' | 'history';

const DIFFICULTY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  easy: { label: 'سهل', color: '#22c55e', icon: '🟢' },
  medium: { label: 'متوسط', color: '#f59e0b', icon: '🟡' },
  hard: { label: 'صعب', color: '#ef4444', icon: '🔴' },
  expert: { label: 'خبير', color: '#a855f7', icon: '🟣' },
};

function GamesContent() {
  const { player } = usePlayer();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [activities, setActivities] = useState<any[]>([]);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [activeRoomsMap, setActiveRoomsMap] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState<number | null>(null);
  const [followingBookers, setFollowingBookers] = useState<Record<number, any[]>>({});
  const [showBookersFor, setShowBookersFor] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // null = الكل
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [confirmBooking, setConfirmBooking] = useState<any>(null);
  const [selectedOffer, setSelectedOffer] = useState<number | null>(null);
  const [offerError, setOfferError] = useState(false);
  const searchParams = useSearchParams();
  const highlightActivityId = searchParams.get('activityId');

  // ── منع السكرول + swipe-to-close ──
  const activityModal = useModalScrollLock({
    isOpen: !!selectedActivity,
    onClose: () => setSelectedActivity(null),
  });
  const bookingModal = useModalScrollLock({
    isOpen: !!confirmBooking,
    onClose: () => { setConfirmBooking(null); setSelectedOffer(null); },
  });

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch(`/api/player-app/activities/upcoming?playerId=${player.playerId}`).then(r => r.json()),
      fetch(`/api/player-app/${player.playerId}/bookings`).then(r => r.json()),
      fetch(`/api/player/${player.playerId}/profile`).then(r => r.json()),
      fetch('/api/player-app/my-active-rooms', { headers: { Authorization: `Bearer ${player.token}` } }).then(r => r.json()),
    ]).then(([actData, bookData, profileData, roomsData]) => {
      if (actData.success) setActivities(actData.activities || []);
      if (bookData.success) setMyBookings(bookData.bookings || []);
      if (profileData.success) setMatchHistory(profileData.matchHistory || []);
      
      if (roomsData.success && roomsData.rooms) {
        const roomsMap: Record<number, any[]> = {};
        roomsData.rooms.forEach((r: any) => {
          roomsMap[r.activityId] = r.rooms || [];
        });
        setActiveRoomsMap(roomsMap);
      }

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

  // ── فتح كارد النشاط تلقائياً من الإشعار ──
  useEffect(() => {
    if (highlightActivityId && activities.length > 0 && !selectedActivity) {
      const act = activities.find(a => String(a.id) === highlightActivityId);
      if (act) setSelectedActivity(act);
    }
  }, [highlightActivityId, activities]);

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
      } else if (data.code === 'PENDING_SURVEYS') {
        // استبيانات إلزامية معلّقة → توجيه لإكمالها
        alert(data.error || 'يجب إكمال استبيانات فعالياتك السابقة قبل الحجز');
        window.location.href = '/player/feedback';
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

                  {/* شارة الحاجزين */}
                  {actFollowers.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setShowBookersFor(showBookersFor === act.id ? null : act.id)}
                        className="text-[11px] text-amber-400/80 hover:text-amber-400 transition-colors"
                      >
                        👥 {actFollowers.length} لاعب حجزوا
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
                                  {b.isFollowing ? (
                                    <span className="text-amber-400 text-[9px]" title="تتابعه">⭐</span>
                                  ) : (
                                    <span className="text-gray-600 text-[9px]" title="لاعب">👤</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* أزرار الدخول للغرف النشطة (إن وجدت) */}
                  {booked && activeRoomsMap[act.id] && activeRoomsMap[act.id].length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-xs text-amber-400 mb-2 font-medium">🎮 الغرف المتاحة حالياً:</p>
                      <div className="flex flex-col gap-2">
                        {activeRoomsMap[act.id].map((room: any, idx: number) => (
                          <a
                            key={idx}
                            href={`/player/join?code=${room.sessionCode}`}
                            className="flex items-center justify-between p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                          >
                            <span className="text-sm text-white font-bold">{room.sessionName || `غرفة ${idx + 1}`}</span>
                            <span className="text-xs px-3 py-1.5 bg-amber-500 text-black font-bold rounded-lg">
                              دخول ←
                            </span>
                          </a>
                        ))}
                      </div>
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
              const isMafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'].includes(m.role || '');
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
                      <span className="text-[10px] text-gray-600">{(ROLE_NAMES as Record<string, string>)[m.role] || m.role}</span>
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
            className="fixed top-0 left-0 right-0 bottom-20 z-40 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => setSelectedActivity(null)}
            {...activityModal.backdropProps}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
              style={{ background: 'linear-gradient(to bottom, #111827, #000)', borderTop: '1px solid rgba(255,255,255,0.1)', ...activityModal.modalProps.style }}
              onClick={e => e.stopPropagation()}
              ref={activityModal.modalContentRef}
              onTouchStart={activityModal.handleTouchStart}
              onTouchEnd={activityModal.handleTouchEnd}
            >
              <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-4" />
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

              {/* عروض المكان */}
              {(() => {
                const offers: any[] = Array.isArray(selectedActivity.locationOffers) ? selectedActivity.locationOffers : [];
                if (offers.length === 0) return null;
                return (
                  <div className="mb-5">
                    <p className="text-gray-400 text-xs mb-3 font-bold">🎁 العروض المتاحة (سيطلب تحديدها عند الحجز):</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                      {offers.map((offer: any, idx: number) => (
                        <div
                          key={idx}
                          className="shrink-0 w-48 p-4 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 snap-start relative overflow-hidden"
                        >
                          <div className="absolute -top-6 -right-6 w-16 h-16 bg-amber-500/10 blur-xl rounded-full" />
                          <h4 className="text-amber-400 text-sm font-bold mb-1 relative z-10">{offer.name || offer.title || `عرض ${idx + 1}`}</h4>
                          {offer.price && (
                            <div className="inline-block px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-bold mb-2 relative z-10">
                              {offer.price} ₪
                            </div>
                          )}
                          {offer.description && <p className="text-gray-400 text-[10px] leading-relaxed relative z-10">{offer.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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
            className="fixed top-0 left-0 right-0 bottom-20 z-40 bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
            onClick={() => { setConfirmBooking(null); setSelectedOffer(null); }}
            {...bookingModal.backdropProps}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-6"
              style={{ background: 'linear-gradient(to bottom, #111827, #000)', borderTop: '1px solid rgba(255,255,255,0.1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-4" />
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
                  <div className="mb-6">
                    <p className="text-gray-400 text-xs mb-3 font-bold">🎁 اختر العرض المناسب لك <span className="text-red-400">*</span>:</p>
                    <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                      {offers.map((offer: any, idx: number) => {
                        const isSelected = selectedOffer === idx;
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedOffer(isSelected ? null : idx);
                              setOfferError(false);
                            }}
                            className={`w-full text-right p-3 rounded-2xl border transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <p className={`text-sm font-bold ${isSelected ? 'text-amber-400' : 'text-gray-300'}`}>
                                {offer.name || offer.title || `عرض ${idx + 1}`}
                              </p>
                              {offer.price && <p className="text-amber-500/80 text-[10px] mt-1">{offer.price} ₪</p>}
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected ? 'border-amber-500 bg-amber-500/20' : 'border-gray-600 bg-black/50'
                            }`}>
                              {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {offerError && (
                      <p className="text-red-400 text-xs text-center mt-3 font-bold animate-pulse">⚠️ يرجى اختيار عرض قبل تأكيد الحجز</p>
                    )}
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
                  onClick={() => {
                    const offers: any[] = Array.isArray(confirmBooking.locationOffers) ? confirmBooking.locationOffers : [];
                    if (offers.length > 0 && selectedOffer === null) {
                      setOfferError(true);
                      return;
                    }
                    setOfferError(false);
                    handleBook(confirmBooking.id, selectedOffer ?? undefined);
                  }}
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

export default function GamesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    }>
      <GamesContent />
    </Suspense>
  );
}
