'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BookingForm from '../components/BookingForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const CURRENCY = 'د.أ';
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50];

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

function safeDate(d: any) { return d ? new Date(d) : new Date(); }

// ── ثوابت الحالات ──
const STATUS_BADGE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  paid:   { label: 'تم الدفع',     bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  free:   { label: 'مجاني',       bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  unpaid: { label: 'لم يتم الدفع', bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
};

function getBookingStatus(b: any): 'paid' | 'free' | 'unpaid' {
  if (b.isFree) return 'free';
  if (b.isPaid) return 'paid';
  return 'unpaid';
}

export default function BookingsPage() {
  const user = useMemo(() => getUser(), []);

  // ── Data ──
  const [bookings, setBookings] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActivity, setFilterActivity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterActiveUpcoming, setFilterActiveUpcoming] = useState(false);

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── Dialogs ──
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [viewingBooking, setViewingBooking] = useState<any | null>(null);
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [payingBooking, setPayingBooking] = useState<any | null>(null);

  // ── Edit form state ──
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCount, setEditCount] = useState(1);
  const [editPaidAmount, setEditPaidAmount] = useState('');
  const [editReceivedBy, setEditReceivedBy] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editOfferQuantities, setEditOfferQuantities] = useState<Record<number, number>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── Pay form state ──
  const [payAmount, setPayAmount] = useState('');
  const [payReceivedBy, setPayReceivedBy] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  // ══ Data Fetching ══
  const fetchAll = useCallback(async () => {
    try {
      const [bks, acts, locs] = await Promise.all([
        apiFetch('/api/bookings'),
        apiFetch('/api/activities'),
        apiFetch('/api/locations'),
      ]);
      setBookings(bks);
      setActivities(acts);
      setLocations(locs);
      try { setStaffList(await apiFetch('/api/staff')); } catch {}
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ══ Active/Upcoming Activity IDs ══
  const activeUpcomingIds = useMemo(() => {
    const ids = new Set<number>();
    activities.filter(a => a.status === 'planned' || a.status === 'active').forEach(a => ids.add(a.id));
    return ids;
  }, [activities]);

  // ══ Filtered Bookings ══
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      // بحث
      const matchSearch = !searchQuery ||
        b.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.phone?.includes(searchQuery);
      // فلتر النشاط
      const matchActivity = filterActivity === 'all' || b.activityId === Number(filterActivity);
      // فلتر الحالة
      const st = getBookingStatus(b);
      const matchStatus = filterStatus === 'all' || filterStatus === st;
      // أنشطة نشطة فقط
      const matchActive = !filterActiveUpcoming || activeUpcomingIds.has(b.activityId);
      return matchSearch && matchActivity && matchStatus && matchActive;
    });
  }, [bookings, searchQuery, filterActivity, filterStatus, filterActiveUpcoming, activeUpcomingIds]);

  // ══ Pagination ══
  const totalPages = Math.ceil(filteredBookings.length / pageSize) || 1;
  const paginatedData = filteredBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterActivity, filterStatus, filterActiveUpcoming, pageSize]);

  // ══ Helpers ══
  function getActivityName(activityId: number) {
    return activities.find(a => a.id === activityId)?.name || 'غير معروف';
  }
  function isActivityLocked(activityId: number) {
    return activities.find(a => a.id === activityId)?.isLocked || false;
  }
  function getActivityOffers(activityId: number) {
    const act = activities.find(a => a.id === activityId);
    if (!act?.enabledOfferIds?.length || !act.locationId) return [];
    const loc = locations.find(l => l.id === act.locationId);
    if (!loc?.offers) return [];
    return (loc.offers as any[]).filter((o: any, i: number) => act.enabledOfferIds.includes(o.id ?? i));
  }

  // ══ Handlers ══
  async function handleCreateBooking(data: any) {
    await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(data) });
    setShowBookingForm(false);
    fetchAll();
  }

  async function handleDelete(id: number) {
    const confirmation = prompt('تأكيد الحذف؟ اكتب "نعم" للمتابعة:');
    if (confirmation !== 'نعم') return;
    try {
      await apiFetch(`/api/bookings/${id}`, { method: 'DELETE' });
      fetchAll();
      alert('تم الحذف بنجاح');
    } catch (err: any) {
      alert('فشل الحذف: ' + (err.message || ''));
    }
  }

  // ── Open Edit ──
  function openEdit(booking: any) {
    setEditingBooking(booking);
    setEditName(booking.name || '');
    setEditPhone(booking.phone || '');
    setEditCount(booking.count || 1);
    setEditPaidAmount(String(booking.paidAmount || 0));
    setEditReceivedBy(booking.receivedBy || '');
    setEditNotes(booking.notes || '');
    // عروض
    const offers = getActivityOffers(booking.activityId);
    const qtys: Record<number, number> = {};
    if (offers.length > 0 && booking.offerItems?.length) {
      booking.offerItems.forEach((item: any) => { qtys[item.offerId] = item.quantity || 0; });
    }
    setEditOfferQuantities(qtys);
  }

  // ── Save Edit ──
  async function handleEditSave() {
    if (!editingBooking) return;
    setEditSubmitting(true);
    const offers = getActivityOffers(editingBooking.activityId);
    const hasOffers = offers.length > 0;

    let finalCount = editCount;
    let finalAmount = Number(editPaidAmount) || 0;
    let offerItems: any[] | undefined;

    if (hasOffers) {
      finalCount = Object.values(editOfferQuantities).reduce((s, v) => s + v, 0);
      finalAmount = offers.reduce((s: number, o: any, i: number) => s + (o.price || 0) * (editOfferQuantities[o.id ?? i] || 0), 0);
      offerItems = offers.map((o: any, i: number) => ({
        offerId: o.id ?? i,
        offerName: o.description || o.name || '',
        quantity: editOfferQuantities[o.id ?? i] || 0,
        unitPrice: o.price || 0,
        clubShare: o.clubShare || 0,
        venueShare: o.venueShare || 0,
      })).filter((o: any) => o.quantity > 0);
    }

    const canChangeReceiver = !editingBooking.isPaid || !editingBooking.receivedBy || user.username === 'admin';

    try {
      await apiFetch(`/api/bookings/${editingBooking.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName,
          phone: editPhone,
          count: finalCount,
          paidAmount: finalAmount,
          notes: editNotes,
          ...(offerItems ? { offerItems } : {}),
          ...(canChangeReceiver ? { receivedBy: editReceivedBy } : {}),
        }),
      });
      setEditingBooking(null);
      fetchAll();
    } catch {} finally {
      setEditSubmitting(false);
    }
  }

  // ── Open Pay ──
  function openPay(booking: any) {
    setPayingBooking(booking);
    const act = activities.find(a => a.id === booking.activityId);
    // حساب المبلغ المقترح
    let suggested = 0;
    if (booking.offerItems?.length > 0) {
      suggested = booking.offerItems.reduce((s: number, item: any) => s + ((item.unitPrice || item.price || 0) * (item.quantity || 0)), 0);
    } else {
      suggested = (Number(act?.basePrice || 0)) * (booking.count || 1);
    }
    setPayAmount(String(suggested || 0));
    setPayReceivedBy('');
  }

  // ── Confirm Pay ──
  async function handlePayConfirm() {
    if (!payingBooking) return;
    if (!payAmount || Number(payAmount) <= 0) { alert('أدخل مبلغ صحيح'); return; }
    if (!payReceivedBy) { alert('اختر الموظف المستلم'); return; }
    setPaySubmitting(true);
    try {
      await apiFetch(`/api/bookings/${payingBooking.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isPaid: true, paidAmount: Number(payAmount), receivedBy: payReceivedBy }),
      });
      setPayingBooking(null);
      fetchAll();
    } catch {} finally {
      setPaySubmitting(false);
    }
  }

  // ── Filter helpers ──
  function handleToggleActiveUpcoming() {
    const newVal = !filterActiveUpcoming;
    if (newVal && filterActivity !== 'all') {
      const selected = activities.find(a => a.id === Number(filterActivity));
      if (selected && selected.status !== 'planned' && selected.status !== 'active') {
        setFilterActivity('all');
      }
    }
    setFilterActiveUpcoming(newVal);
  }

  const activitiesForFilter = filterActiveUpcoming
    ? activities.filter(a => a.status === 'planned' || a.status === 'active')
    : activities;

  const isLocationOwner = user.role === 'location_owner';

  // ══ Loading ══
  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-5" dir="rtl">

      {/* ══════ HEADER ══════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">سجل الحجوزات</h1>
          <p className="text-gray-400 text-sm mt-1">إدارة المشاركين وحالة الدفع — {filteredBookings.length} من {bookings.length}</p>
        </div>
        {!isLocationOwner && (
          <button
            onClick={() => setShowBookingForm(!showBookingForm)}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition"
          >
            + حجز جديد
          </button>
        )}
      </div>

      {/* ══════ BOOKING FORM ══════ */}
      <AnimatePresence>
        {showBookingForm && (
          <BookingForm
            activities={activities}
            locations={locations}
            staffList={staffList}
            onSubmit={handleCreateBooking}
            onCancel={() => setShowBookingForm(false)}
            userRole={user.role}
            username={user.username}
          />
        )}
      </AnimatePresence>

      {/* ══════ FILTERS BAR ══════ */}
      <div className="flex items-center gap-3 flex-wrap bg-gray-800/30 border border-gray-700/30 rounded-xl py-3 px-4">
        {/* بحث */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            className="w-full pr-9 pl-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          />
        </div>

        {/* فلتر النشاط */}
        <select
          value={filterActivity}
          onChange={e => setFilterActivity(e.target.value)}
          className="px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 max-w-[200px]"
        >
          <option value="all">كل الأنشطة</option>
          {activitiesForFilter.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* فلتر الحالة */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-gray-900/60 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
        >
          <option value="all">كل الحالات</option>
          <option value="paid">تم الدفع</option>
          <option value="free">مجاني</option>
          <option value="unpaid">لم يدفع</option>
        </select>

        {/* أنشطة نشطة فقط */}
        <button
          onClick={handleToggleActiveUpcoming}
          className={`px-3 py-2 rounded-lg text-xs transition border ${
            filterActiveUpcoming
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              : 'bg-gray-900/40 text-gray-500 border-gray-700/30 hover:text-gray-300'
          }`}
        >
          {filterActiveUpcoming ? '📅 أنشطة نشطة ✕' : '📅 أنشطة نشطة فقط'}
        </button>
      </div>

      {/* ══════ TABLE ══════ */}
      <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
        {paginatedData.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-4xl block mb-3 opacity-30">📋</span>
            <p className="text-gray-500 font-medium">
              {bookings.length === 0 ? 'لا توجد حجوزات بعد' : 'لا توجد نتائج مطابقة'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead>
                <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium">النشاط</th>
                  <th className="text-center px-4 py-3 font-medium">العدد</th>
                  <th className="text-center px-4 py-3 font-medium">الحالة</th>
                  <th className="text-center px-4 py-3 font-medium">المبلغ</th>
                  <th className="text-right px-4 py-3 font-medium">المستلم</th>
                  <th className="text-right px-4 py-3 font-medium">مدخل الحجز</th>
                  <th className="text-center px-4 py-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((b: any) => {
                  const st = getBookingStatus(b);
                  const badge = STATUS_BADGE[st];
                  const locked = isActivityLocked(b.activityId);
                  const canEdit = !locked && (!b.isPaid || user.username === 'admin');
                  const canPay = !locked && !b.isPaid && !b.isFree;
                  const canDelete = !locked && !isLocationOwner;

                  return (
                    <tr
                      key={b.id}
                      id={`glow-booking-${b.id}`}
                      className="border-b border-gray-700/15 hover:bg-gray-700/10 transition-all"
                    >
                      <td className="px-4 py-3 text-white font-medium">{b.name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{getActivityName(b.activityId)}</td>
                      <td className="px-4 py-3 text-center text-white">{b.count || 1}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        <span className={st === 'paid' ? 'text-emerald-400' : st === 'unpaid' ? 'text-amber-400' : 'text-gray-500'}>
                          {b.isFree ? '—' : `${Number(b.paidAmount || 0)} ${CURRENCY}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{b.receivedBy || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{b.createdBy || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* عرض */}
                          <button onClick={() => setViewingBooking(b)} className="p-1.5 rounded-lg text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition" title="عرض">👁</button>
                          {/* تعديل */}
                          {canEdit && !isLocationOwner && (
                            <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg text-gray-400/70 hover:text-white hover:bg-gray-500/10 transition" title="تعديل">✏️</button>
                          )}
                          {/* دفع */}
                          {canPay && !isLocationOwner && (
                            <button onClick={() => openPay(b)} className="text-[10px] px-2 py-1 rounded-lg border border-gray-600/50 text-gray-400 hover:text-amber-400 hover:border-amber-500/30 transition">دفع</button>
                          )}
                          {/* حذف */}
                          {canDelete && (
                            <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition" title="حذف">🗑️</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════ PAGINATION ══════ */}
      {filteredBookings.length > pageSize && (
        <div className="flex items-center justify-between flex-wrap gap-3 bg-gray-800/30 border border-gray-700/30 rounded-xl py-3 px-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition disabled:opacity-30">◄</button>
            <span className="text-sm text-gray-400">صفحة {currentPage} من {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-3 py-1.5 bg-gray-700/50 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition disabled:opacity-30">►</button>
          </div>
          <div className="flex items-center gap-1">
            {PAGE_SIZE_OPTIONS.map(size => (
              <button key={size} onClick={() => setPageSize(size)} className={`px-2.5 py-1 rounded-lg text-xs transition ${pageSize === size ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-gray-500 hover:text-white'}`}>{size}</button>
            ))}
            <span className="text-xs text-gray-600 mr-1">لكل صفحة</span>
          </div>
        </div>
      )}

      {/* ══════ VIEW DIALOG ══════ */}
      <AnimatePresence>
        {viewingBooking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setViewingBooking(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">تفاصيل الحجز</h3>
                <button onClick={() => setViewingBooking(null)} className="text-gray-500 hover:text-white transition">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'الاسم', value: viewingBooking.name },
                  { label: 'رقم الهاتف', value: viewingBooking.phone || '—', dir: 'ltr' },
                  { label: 'النشاط', value: getActivityName(viewingBooking.activityId) },
                  { label: 'عدد الأشخاص', value: viewingBooking.count || 1 },
                  { label: 'حالة الدفع', value: STATUS_BADGE[getBookingStatus(viewingBooking)].label, color: STATUS_BADGE[getBookingStatus(viewingBooking)].text },
                  { label: 'المبلغ المدفوع', value: viewingBooking.isFree ? '—' : `${Number(viewingBooking.paidAmount || 0)} ${CURRENCY}` },
                  { label: 'الموظف المستلم', value: viewingBooking.receivedBy || '—' },
                  { label: 'مدخل الحجز', value: viewingBooking.createdBy || '—' },
                ].map((f, i) => (
                  <div key={i} className="bg-gray-900/50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 mb-1">{f.label}</p>
                    <p className={`text-sm font-bold ${(f as any).color || 'text-white'}`} dir={(f as any).dir}>{f.value}</p>
                  </div>
                ))}
              </div>
              {/* تاريخ */}
              <div className="bg-gray-900/50 rounded-xl p-3">
                <p className="text-[10px] text-gray-500 mb-1">تاريخ التسجيل</p>
                <p className="text-sm font-bold text-white">{viewingBooking.createdAt ? safeDate(viewingBooking.createdAt).toLocaleString('ar-EG') : '—'}</p>
              </div>
              {/* ملاحظات */}
              {viewingBooking.notes && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-amber-400 mb-1">⚠️ ملاحظات</p>
                  <p className="text-sm text-amber-300">{viewingBooking.notes}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ EDIT DIALOG ══════ */}
      <AnimatePresence>
        {editingBooking && (() => {
          const editOffers = getActivityOffers(editingBooking.activityId);
          const hasOffers = editOffers.length > 0;
          const editTotalCount = hasOffers ? Object.values(editOfferQuantities).reduce((s, v) => s + v, 0) : editCount;
          const editTotalAmount = hasOffers ? editOffers.reduce((s: number, o: any, i: number) => s + (o.price || 0) * (editOfferQuantities[o.id ?? i] || 0), 0) : Number(editPaidAmount);
          const receiverLocked = editingBooking.isPaid && editingBooking.receivedBy && user.username !== 'admin';

          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingBooking(null)}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">تعديل الحجز</h3>
                  <button onClick={() => setEditingBooking(null)} className="text-gray-500 hover:text-white transition">✕</button>
                </div>

                {/* الاسم */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">الاسم *</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
                </div>

                {/* العروض أو العدد */}
                {hasOffers ? (
                  <div>
                    <label className="block text-xs text-gray-400 mb-2">تعديل العروض والكميات</label>
                    <div className="space-y-2">
                      {editOffers.map((o: any, i: number) => {
                        const oid = o.id ?? i;
                        const qty = editOfferQuantities[oid] || 0;
                        return (
                          <div key={oid} className="flex items-center gap-3 p-3 bg-gray-900/30 border border-gray-700/30 rounded-xl">
                            <div className="flex-1"><p className="text-sm text-white">{o.description || o.name}</p><p className="text-[11px] text-gray-500">{o.price} {CURRENCY}</p></div>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setEditOfferQuantities(p => ({ ...p, [oid]: Math.max(0, (p[oid] || 0) - 1) }))} className="w-7 h-7 rounded-lg bg-gray-700/50 text-white hover:bg-gray-700 text-sm">−</button>
                              <span className="w-6 text-center text-white font-bold text-sm">{qty}</span>
                              <button type="button" onClick={() => setEditOfferQuantities(p => ({ ...p, [oid]: (p[oid] || 0) + 1 }))} className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-sm">+</button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm">
                        <span className="text-amber-300">العدد: {editTotalCount} شخص</span>
                        <span className="text-amber-400 font-bold">{editTotalAmount} {CURRENCY}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">العدد</label>
                      <input type="number" min="1" value={editCount} onChange={e => setEditCount(Number(e.target.value))} className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">المبلغ ({CURRENCY})</label>
                      <input type="number" min="0" value={editPaidAmount} onChange={e => setEditPaidAmount(e.target.value)} className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
                    </div>
                  </div>
                )}

                {/* هاتف + مستلم */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">رقم الهاتف</label>
                    <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} dir="ltr" className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">المستلم</label>
                    <select value={editReceivedBy} onChange={e => setEditReceivedBy(e.target.value)} disabled={receiverLocked} className={`w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 ${receiverLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <option value="">غير محدد</option>
                      {staffList.map(s => <option key={s.id} value={s.displayName}>{s.displayName}</option>)}
                    </select>
                    {receiverLocked && <p className="text-[10px] text-rose-400 mt-1">لا يمكن تغيير المستلم لحجز مدفوع (صلاحية المدير فقط)</p>}
                  </div>
                </div>

                {/* ملاحظات */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ملاحظات</label>
                  <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
                </div>

                {/* أزرار */}
                <div className="flex gap-3 pt-2">
                  <button onClick={handleEditSave} disabled={editSubmitting} className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm">
                    {editSubmitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                  </button>
                  <button onClick={() => setEditingBooking(null)} className="px-5 py-2.5 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">إلغاء</button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ══════ PAY DIALOG ══════ */}
      <AnimatePresence>
        {payingBooking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPayingBooking(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-sm space-y-4">
              <h3 className="text-lg font-bold text-white text-center">تأكيد الدفع</h3>
              <p className="text-sm text-gray-400 text-center">الحجز: <strong className="text-white">{payingBooking.name}</strong></p>

              <div>
                <label className="block text-xs text-gray-400 mb-1">المبلغ المدفوع ({CURRENCY})</label>
                <input type="number" min="0" step="0.5" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">الموظف المستلم *</label>
                <select value={payReceivedBy} onChange={e => setPayReceivedBy(e.target.value)} className="w-full px-4 py-3 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50">
                  <option value="">اختر الموظف</option>
                  {staffList.map(s => <option key={s.id} value={s.displayName}>{s.displayName}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handlePayConfirm} disabled={paySubmitting} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm">
                  {paySubmitting ? 'جاري التأكيد...' : '✅ تأكيد الدفع'}
                </button>
                <button onClick={() => setPayingBooking(null)} className="px-5 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">إلغاء</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
