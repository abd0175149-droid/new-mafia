'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ROLE_NAMES } from '@/lib/constants';
import { usePlayer } from '@/context/PlayerContext';
import { useSearchParams } from 'next/navigation';
import { useModalScrollLock } from '@/hooks/useModalScrollLock';
import { useActivityPulse } from '@/hooks/useActivityPulse';
import NightPulse from '@/components/NightPulse';

type Tab = 'upcoming' | 'pulse' | 'history';

const AR_D = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toArNum = (v: string | number) => String(v).replace(/[0-9]/g, c => AR_D[+c]);

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
  // 🗓️ أيّ فعاليّةٍ جدولُها مفتوح — واحدٌ في كلّ مرّة كنمط قائمة الحاجزين
  const [showScheduleFor, setShowScheduleFor] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // null = الكل
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [confirmBooking, setConfirmBooking] = useState<any>(null);
  const [confirmCancel, setConfirmCancel] = useState<any>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<number | null>(null);
  const [offerError, setOfferError] = useState(false);
  // 🍽️ استعراض منيو المكان وقت الحجز (عرضٌ فقط — الطلب يبقى داخل نافذته)
  const [menuFor, setMenuFor] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [browseQ, setBrowseQ] = useState('');
  // بحثٌ عالق من فتحةٍ سابقة يجعل المنيو يبدو ناقصاً عند الفتح التالي
  useEffect(() => { if (!menuFor) setBrowseQ(''); }, [menuFor]);
  const searchParams = useSearchParams();
  const highlightActivityId = searchParams.get('activityId');

  // 🌙 نبض الليلة — يُشتقّ كاملاً من الخادم، ولا يُجلب إلّا حين يُفتح تبويبه
  const nightPulse = useActivityPulse(player?.token, tab === 'pulse');

  // ── منع السكرول + swipe-to-close ──
  const activityModal = useModalScrollLock({
    isOpen: !!selectedActivity,
    onClose: () => setSelectedActivity(null),
  });
  const cancelModal = useModalScrollLock({
    isOpen: !!confirmCancel,
    onClose: () => setConfirmCancel(null),
  });
  const bookingModal = useModalScrollLock({
    isOpen: !!confirmBooking,
    onClose: () => { setConfirmBooking(null); setSelectedOffer(null); },
  });
  const menuModal = useModalScrollLock({
    isOpen: !!menuFor,
    onClose: () => setMenuFor(null),
  });

  // فتح منيو مكان الفعاليّة — نقطة عامّة بلا مصادقة، وبلا حصص النادي
  const openMenu = (act: any) => {
    if (!act?.locationId) return;
    setMenuFor(act); setMenuItems([]); setMenuLoading(true);
    fetch(`/api/player-app/locations/${act.locationId}/menu`)
      .then(r => r.json())
      .then(d => { if (d.success) setMenuItems(d.items || []); })
      .catch(() => {})
      .finally(() => setMenuLoading(false));
  };

  useEffect(() => {
    if (!player) return;
    Promise.all([
      fetch(`/api/player-app/activities/upcoming?playerId=${player.playerId}`).then(r => r.json()),
      fetch(`/api/player-app/${player.playerId}/bookings`, { headers: { Authorization: `Bearer ${player.token}` } }).then(r => r.json()),
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
          fetch(`/api/player-app/activities/${act.id}/following-bookers?playerId=${player!.playerId}`, { headers: { Authorization: `Bearer ${player!.token}` } })
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

  // ❌ إلغاء الحجز — بتأكيدٍ دائماً، ولا يُنادى إلّا من نافذة التأكيد
  const handleCancel = async (activityId: number) => {
    if (!player) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/player-app/book/${activityId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${player.token}` },
      });
      const data = await res.json();
      if (data.success) {
        setMyBookings(prev => prev.filter((b: any) => b.activityId !== activityId));
        setActivities(prev => prev.map(a =>
          a.id === activityId ? { ...a, bookedCount: Math.max(0, (a.bookedCount || 1) - 1) } : a
        ));
        setConfirmCancel(null);
      } else {
        alert(data.error || 'تعذّر إلغاء الحجز');
      }
    } catch {
      alert('تعذّر الاتصال — أعد المحاولة');
    }
    setCancelLoading(false);
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

      {/* ── شريط التقويم — لا معنى له داخل نبض الليلة ── */}
      <div className={`flex gap-1.5 overflow-x-auto pb-3 mb-1 scrollbar-hide ${tab === 'pulse' ? 'hidden' : ''}`}>
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

      {selectedDate && tab !== 'pulse' && (
        <p className="text-amber-500/60 text-[10px] text-center mb-2">
          عرض أنشطة يوم {new Date(selectedDate).toLocaleDateString('ar-JO', { weekday: 'long', month: 'short', day: 'numeric' })}
          <button onClick={() => setSelectedDate(null)} className="text-amber-400 mr-2 underline">عرض الكل</button>
        </p>
      )}

      {/* Tabs — ثلاثةٌ الآن: النصوص أقصر لأنّ flex-1 يوزّع العرض بالتساوي */}
      <div className="flex gap-1.5 mb-4">
        {([
          ['upcoming', '📅 قادمة'],
          ['pulse', '🌙 نبض الليلة'],
          ['history', '📊 مبارياتي'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all whitespace-nowrap ${
              tab === t
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-white/5 text-gray-500 border border-white/5'
            }`}
          >
            {label}
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
              const offers: any[] = Array.isArray(act.locationOffers) ? act.locationOffers : [];

              const d = new Date(act.date);
              // أرقامٌ عربيّة (٠١٢…) في كلّ ما يُعرض من تاريخٍ ووقت
              const dayNum = toArNum(d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Amman' }));
              const monthAr = d.toLocaleDateString('ar-JO', { month: 'long', timeZone: 'Asia/Amman' });
              const weekdayAr = d.toLocaleDateString('ar-JO', { weekday: 'long', timeZone: 'Asia/Amman' });
              const timeAr = toArNum(d.toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Amman',
              }));
              // 👥 الطلب بلغةٍ تجذب — لا «مزدحم» ولا «مكتمل»: الحجز بلا سقف،
              //    والإقبال دعوةٌ لا عائق. السعة مرجعُ نسبةٍ داخليّ لا تُعرض للّاعب.
              const cnt = act.bookedCount || 0;
              const cap = act.maxPlayers || 20;
              const ratio = cap ? cnt / cap : 0;
              const demand = ratio < 0.5
                ? { t: 'مقاعد متاحة', c: '#22c55e' }
                : ratio < 0.85
                ? { t: 'إقبال جيّد', c: '#fbbf24' }
                : { t: '🔥 الأكثر طلباً', c: '#fb923c' };
              const shownBookers = actFollowers.slice(0, 4);
              const followedCount = actFollowers.filter((b: any) => b.isFollowing).length;

              return (
                <motion.div
                  key={act.id}
                  layout
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'linear-gradient(155deg, rgba(245,158,11,0.13), rgba(5,5,5,0) 58%), rgba(255,255,255,0.03)',
                    border: booked ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <div className="p-4">
                    {/* ── الرأس: التاريخ والوقت أوّلَ ما تقع عليه العين ──
                        كانا ٩–١٠ بكسل لا يُقرآن من مسافة الذراع؛ اليومُ والساعة
                        هما ما يبحث عنه فاتحُ الصفحة، فرُفعا وأُبرزا. */}
                    <div className="flex gap-3.5 items-start" onClick={() => setSelectedActivity(act)}>
                      <div className="text-center shrink-0 border-l border-white/10 pl-3.5 pt-0.5">
                        <p className="text-[34px] font-black text-amber-400 leading-none tracking-tight">{dayNum}</p>
                        <p className="text-[13px] text-gray-300 font-bold mt-1 leading-none">{monthAr}</p>
                        <p className="text-[16px] font-black mt-2 leading-none" style={{ color: '#fbbf24' }}>{timeAr}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[15px] font-bold leading-snug truncate">
                          {act.locationName || act.name}
                        </p>
                        <p className="text-gray-300 text-[13px] font-bold mt-1">{weekdayAr}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span
                            className="text-[8px] px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: diff.color + '18', color: diff.color }}
                          >
                            {diff.icon} {diff.label}
                          </span>
                          {act.basePrice && act.basePrice !== '0' && (
                            <span className="text-[9px] text-gray-500">{act.basePrice} د.أ</span>
                          )}
                          {act.hasMenu && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openMenu(act); }}
                              className="text-[9px] text-gray-500 hover:text-amber-400 transition-colors"
                            >
                              🍽️ المنيو
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── العدد رقماً كبيراً + حالة الطلب ── */}
                    <div className="flex items-end justify-between mt-3.5 pt-3.5 border-t border-white/[0.06]">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[30px] font-black text-amber-400 leading-none">{cnt}</span>
                        <div>
                          <p className="text-[11.5px] font-bold text-gray-200 leading-none">قادماً</p>
                          <p className="text-[9.5px] mt-1 leading-none" style={{ color: demand.c }}>{demand.t}</p>
                        </div>
                      </div>
                      {booked ? (
                        <button
                          onClick={() => setConfirmCancel(act)}
                          className="text-green-400 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0 active:bg-green-500/20 transition-colors"
                        >
                          ✅ محجوز
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmBooking(act)}
                          disabled={bookingLoading === act.id}
                          className="text-xs px-4 py-2 rounded-lg font-bold text-black disabled:opacity-50 shrink-0"
                          style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                        >
                          {bookingLoading === act.id ? '...' : 'احجز'}
                        </button>
                      )}
                    </div>

                    {/* ── مَن حجز: وجوهٌ تُفتح على القائمة كاملةً ── */}
                    {actFollowers.length > 0 && (
                      <div className="mt-3">
                        <button
                          onClick={() => setShowBookersFor(showBookersFor === act.id ? null : act.id)}
                          className="flex items-center gap-2 w-full"
                        >
                          <div className="flex items-center">
                            {shownBookers.map((b: any, bi: number) => (
                              <div
                                key={b.id}
                                className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[9px] bg-white/10 text-gray-300"
                                style={{ border: '2px solid #050505', marginRight: bi === 0 ? 0 : '-8px' }}
                              >
                                {b.avatarUrl
                                  ? <img src={b.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  : (b.name || '؟').charAt(0)}
                              </div>
                            ))}
                            {actFollowers.length > 4 && (
                              <div
                                className="w-6 h-6 rounded-full bg-white/10 text-gray-300 flex items-center justify-center text-[8.5px] font-bold"
                                style={{ border: '2px solid #050505', marginRight: '-8px' }}
                              >
                                +{actFollowers.length - 4}
                              </div>
                            )}
                          </div>
                          <span className="text-[10.5px] text-amber-400/90">
                            {followedCount > 0
                              ? followedCount + ' تتابعهم حجزوا'
                              : actFollowers.length + ' لاعباً حجزوا'}
                          </span>
                          <span className="text-gray-600 text-[10px] mr-auto">
                            {showBookersFor === act.id ? '▲' : '▼'}
                          </span>
                        </button>

                        <AnimatePresence>
                          {showBookersFor === act.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-2 max-h-52 overflow-y-auto">
                                {actFollowers.map((b: any) => (
                                  <div key={b.id} className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center overflow-hidden shrink-0 text-[11px]">
                                      {b.avatarUrl
                                        ? <img src={b.avatarUrl} className="w-full h-full object-cover" alt="" />
                                        : '🎭'}
                                    </div>
                                    <span className="text-[12px] text-gray-200 truncate flex-1">{b.name}</span>
                                    <span className="text-[9.5px] text-gray-600 shrink-0">Lv.{b.level}</span>
                                    {b.isFollowing && (
                                      <span className="text-amber-400 text-[10px] shrink-0" title="تتابعه">⭐</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* ── 🗓️ جدول الليلة — يختفي كلّيّاً إن لم يُدخِله الأدمن ── */}
                    {(() => {
                      const slots = Array.isArray(act.gameSchedule) ? act.gameSchedule : [];
                      if (slots.length === 0) return null;   // لا جدول ⇒ لا زرّ
                      const open = showScheduleFor === act.id;
                      const gamesN = slots.filter((x: any) => x?.kind !== 'break').length;
                      return (
                        <div className="mt-3">
                          <button
                            onClick={() => setShowScheduleFor(open ? null : act.id)}
                            aria-expanded={open}
                            className="flex items-center gap-2 w-full text-right"
                          >
                            <span className="text-[13px]">🗓️</span>
                            <span className="text-[11px] text-sky-300/90">
                              جدول الليلة — {gamesN} {gamesN === 1 ? 'لعبة' : gamesN === 2 ? 'لعبتان' : 'ألعاب'}
                            </span>
                            <span className="text-gray-600 text-[10px] mr-auto">{open ? '▲' : '▼'}</span>
                          </button>

                          <AnimatePresence>
                            {open && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1.5">
                                  {slots.map((sl: any, si: number) => {
                                    const isBreak = sl?.kind === 'break';
                                    // ترقيمُ الألعاب بترتيبها بينها وحدها — كما في محرّر الأدمن
                                    const n = slots.slice(0, si + 1).filter((x: any) => x?.kind !== 'break').length;
                                    return (
                                      <div key={si} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${isBreak ? 'bg-white/[0.02] border border-dashed border-white/10' : 'bg-white/[0.04]'}`}>
                                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] shrink-0 ${isBreak ? 'text-gray-500' : 'bg-sky-500/15 text-sky-300 font-bold'}`}>
                                          {isBreak ? '☕' : n}
                                        </span>
                                        <span className={`text-[12px] truncate flex-1 ${isBreak ? 'text-gray-500' : 'text-gray-200'}`}>
                                          {sl?.label || (isBreak ? 'استراحة' : 'لعبة')}
                                        </span>
                                        <span className="text-[11px] text-gray-400 tabular-nums shrink-0" dir="ltr">
                                          {sl?.start || '—'} – {sl?.end || '—'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })()}

                    {/* ── الغرف المفتوحة ── */}
                    {booked && activeRoomsMap[act.id] && activeRoomsMap[act.id].length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5">
                        <p className="text-xs text-amber-400 mb-2 font-medium">🎮 الغرف المتاحة حالياً:</p>
                        <div className="flex flex-col gap-2">
                          {activeRoomsMap[act.id].map((room: any, idx: number) => (
                            <a
                              key={idx}
                              href={'/player/join?code=' + room.sessionCode}
                              className="flex items-center justify-between p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                            >
                              <span className="text-sm text-white font-bold">{room.sessionName || 'غرفة ' + (idx + 1)}</span>
                              <span className="text-xs px-3 py-1.5 bg-amber-500 text-black font-bold rounded-lg">
                                دخول ←
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* ── Tab 2: نبض الليلة ── */}
        {tab === 'pulse' && (
          <motion.div key="pulse" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <NightPulse
              pulse={nightPulse.pulse}
              serverNow={nightPulse.serverNow}
              onSelectActivity={nightPulse.selectActivity}
              onSelectRoom={nightPulse.selectRoom}
              loading={nightPulse.loading}
              denied={nightPulse.denied}
            />
          </motion.div>
        )}

        {/* ── Tab 3: تاريخ المباريات ── */}
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
                    <span>{selectedActivity.basePrice} د.أ</span>
                  </div>
                )}
              </div>

              {/* 🍽️ منيو المكان — استعراضٌ قبل الحجز (الكتالوج الموحّد) */}
              {selectedActivity.hasMenu && (
                <button
                  onClick={() => { const a = selectedActivity; setSelectedActivity(null); openMenu(a); }}
                  className="w-full mb-5 p-3.5 rounded-2xl flex items-center gap-3 text-right"
                  style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(13,148,136,0.06))', border: '1px solid rgba(16,185,129,0.25)' }}
                >
                  <span className="text-2xl">🍽️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-emerald-400 text-sm font-bold">استعرض منيو {selectedActivity.locationName || 'المكان'}</p>
                    <p className="text-gray-500 text-[10px] mt-0.5">الأصناف والعروض وأسعارها — الطلب يفتح قبل موعد الفعاليّة بساعة</p>
                  </div>
                  <span className="text-emerald-400 text-sm">←</span>
                </button>
              )}

              {/* 🗄️ عروض حجزٍ قديمة (فعاليّات ما قبل التوحيد فقط) */}
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
                              {offer.price} د.أ
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

      {/* ── Modal تأكيد إلغاء الحجز ── */}
      <AnimatePresence>
        {confirmCancel && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setConfirmCancel(null)}
            {...cancelModal.backdropProps}
            className="fixed top-0 left-0 right-0 bottom-20 z-40 flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-5 pb-6"
              style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" />
              <p className="text-white text-base font-bold text-center">إلغاء حجزك؟</p>
              <p className="text-gray-400 text-xs text-center mt-2 leading-relaxed">
                {confirmCancel.locationName || confirmCancel.name}
                <br />
                {new Date(confirmCancel.date).toLocaleDateString('ar-JO', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })} · {new Date(confirmCancel.date).toLocaleTimeString('ar-JO', {
                  hour: 'numeric', minute: '2-digit',
                })}
              </p>
              <p className="text-gray-600 text-[11px] text-center mt-3">
                يُفتح مقعدك لغيرك، وتستطيع الحجز ثانيةً ما دام في الوقت متّسع.
              </p>
              <div className="flex gap-2.5 mt-5">
                <button
                  onClick={() => setConfirmCancel(null)}
                  disabled={cancelLoading}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-300 bg-white/5 border border-white/10 disabled:opacity-50"
                >
                  تراجع
                </button>
                <button
                  onClick={() => handleCancel(confirmCancel.id)}
                  disabled={cancelLoading}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-red-300 bg-red-500/15 border border-red-500/30 disabled:opacity-50"
                >
                  {cancelLoading ? '...' : 'نعم، ألغِ الحجز'}
                </button>
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
                  <p>💰 {confirmBooking.basePrice} د.أ</p>
                )}
              </div>

              {/* 🍽️ منيو المكان — يطّلع عليه قبل تأكيد الحجز */}
              {confirmBooking.hasMenu && (
                <button
                  onClick={() => { const a = confirmBooking; setConfirmBooking(null); setSelectedOffer(null); openMenu(a); }}
                  className="w-full mb-4 p-3 rounded-xl flex items-center gap-3 text-right"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
                >
                  <span className="text-xl">🍽️</span>
                  <span className="flex-1 text-emerald-400 text-xs font-bold">استعرض منيو {confirmBooking.locationName || 'المكان'} قبل الحجز</span>
                  <span className="text-emerald-400 text-xs">←</span>
                </button>
              )}

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
                              {offer.price && <p className="text-amber-500/80 text-[10px] mt-1">{offer.price} د.أ</p>}
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

      {/* ══ 🍽️ منيو المكان — استعراضٌ فقط قبل الحجز ══ */}
      <AnimatePresence>
        {menuFor && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            {...menuModal.backdropProps}
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', ...menuModal.backdropProps.style }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              // 🔴 الشريط السفليّ للتطبيق ثابتٌ فوق كلّ شيء، فزرّ الإغلاق في ذيل
              //    المحتوى كان يقف تحته ولا يُضغَط — ومنيو ٦٢ صنفاً يجعل الوصول
              //    إليه رحلة تمريرٍ كاملة. الإغلاق صار لاصقاً في الترويسة،
              //    والحشوة السفليّة تُخلّص آخر صنفٍ من تحت الشريط.
              className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl px-5 pt-4 pb-24 sm:pb-6 max-h-[85vh] overflow-y-auto"
              style={{ background: 'linear-gradient(to bottom, #111827, #000)', borderTop: '1px solid rgba(255,255,255,0.1)', ...menuModal.modalProps.style }}
              onClick={e => e.stopPropagation()}
              ref={menuModal.modalContentRef}
              onTouchStart={menuModal.handleTouchStart}
              onTouchEnd={menuModal.handleTouchEnd}
            >
              <div className="sticky -top-4 z-20 -mx-5 px-5 pt-4 pb-3"
                style={{ background: 'linear-gradient(to bottom, #111827 80%, rgba(17,24,39,0))' }}>
                <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-3" />
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-lg font-bold truncate">🍽️ منيو {menuFor.locationName || 'المكان'}</h3>
                    <p className="text-gray-500 text-[11px] mt-1">
                      للاطّلاع فقط — يفتح الطلب قبل موعد الفعاليّة بساعة ويحتاج حجزاً باسمك.
                    </p>
                  </div>
                  <button onClick={() => setMenuFor(null)} aria-label="إغلاق"
                    className="shrink-0 w-9 h-9 rounded-full text-gray-300 text-sm flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    ✕
                  </button>
                </div>
                {menuItems.length > 8 && (
                  <div className="relative mt-3">
                    <input
                      value={browseQ} onChange={e => setBrowseQ(e.target.value)}
                      placeholder="ابحث في المنيو…"
                      className="w-full rounded-xl py-2 pr-9 pl-3 text-sm text-white placeholder:text-gray-600 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">🔎</span>
                  </div>
                )}
              </div>

              {menuLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ) : menuItems.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-12">المكان لم يضف أصنافاً بعد</p>
              ) : (
                (() => {
                  const q = browseQ.trim();
                  const list = q
                    ? menuItems.filter((i: any) => i.name.includes(q) || (i.description || '').includes(q))
                    : menuItems;
                  if (list.length === 0) {
                    return <p className="text-center text-gray-500 text-sm py-12">لا صنف يطابق «{q}»</p>;
                  }
                  return Array.from(new Set(list.map((i: any) => i.category || ''))).map((cat: any) => (
                  <div key={cat || '_none'} className="mb-4">
                    <h4 className="text-xs font-bold text-emerald-400/80 mb-2 flex items-center gap-2">
                      <span>{cat || 'المنيو'}</span>
                      <span className="flex-1 h-px bg-emerald-500/10" />
                    </h4>
                    {/* القسم الفرعيّ عنوانٌ داخل القسم — بدونه صار الأربعون مشروباً كتلةً واحدة */}
                    {Array.from(new Set(list.filter((i: any) => (i.category || '') === cat).map((i: any) => i.subcategory || ''))).map((sub: any) => (
                    <div key={sub || '_direct'} className="mb-3">
                      {sub && <p className="text-[10px] font-bold text-gray-500 mb-1.5 pr-1">↳ {sub}</p>}
                    <div className="space-y-2">
                      {list.filter((i: any) => (i.category || '') === cat && (i.subcategory || '') === sub).map((it: any) => (
                        <div key={it.id} className="rounded-xl p-3 flex items-center gap-3"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="w-11 h-11 rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center shrink-0">
                            {it.imageUrl ? <img src={it.imageUrl} alt="" className="w-full h-full object-cover" /> : <span>{it.isBundle ? '🎁' : '🍴'}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">
                              {it.isBundle && <span className="text-[9px] px-1.5 py-0.5 rounded-md ml-1.5" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}>عرض</span>}
                              {it.name}
                            </p>
                            {it.isBundle && it.components?.length > 0 ? (
                              <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.75)' }}>
                                {it.components.map((c: any) => `${c.name}${c.qty > 1 ? ` ×${c.qty}` : ''}`).join(' + ')}
                              </p>
                            ) : it.description ? (
                              <p className="text-gray-600 text-[10px] truncate">{it.description}</p>
                            ) : null}
                          </div>
                          <span className="text-emerald-400 text-sm font-bold shrink-0 tabular-nums">{parseFloat(it.price).toFixed(2)} د.أ</span>
                        </div>
                      ))}
                    </div>
                    </div>
                    ))}
                  </div>
                  ));
                })()
              )}

              <button onClick={() => setMenuFor(null)}
                className="w-full mt-2 py-3 rounded-xl text-sm text-gray-400"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                إغلاق
              </button>
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
