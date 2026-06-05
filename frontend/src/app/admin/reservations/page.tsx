'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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

// ── ثوابت الحالات ──
const STATUS_CONFIG: Record<string, { label: string; emoji: string; bg: string; text: string; border: string; glow: string }> = {
  pending:   { label: 'معلق',      emoji: '⏳', bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/25', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]' },
  confirmed: { label: 'مؤكد',      emoji: '✅', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/25', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' },
  paid_all:  { label: 'مدفوع كلك', emoji: '💎', bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/25', glow: 'shadow-[0_0_12px_rgba(59,130,246,0.15)]' },
};

const ALL_STATUSES = ['pending', 'confirmed', 'paid_all'] as const;

export default function ReservationsPage() {
  const user = useMemo(() => getUser(), []);

  // ── Data ──
  const [reservations, setReservations] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ── (default: no activity selected → don't show reservations)
  const [filterActivity, setFilterActivity] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // ── Quick Add Form ──
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCount, setFormCount] = useState(1);
  const [formNotes, setFormNotes] = useState('');
  const [formActivity, setFormActivity] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // ── Edit Modal ──
  const [editing, setEditing] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCount, setEditCount] = useState(1);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('pending');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ══ Data Fetching ══
  const fetchAll = useCallback(async () => {
    try {
      const [res, acts] = await Promise.all([
        apiFetch('/api/reservations'),
        apiFetch('/api/activities'),
      ]);
      setReservations(res);
      setActivities(acts);
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

  // ══ Activities with reservations (show completed too) ══
  const activitiesWithReservations = useMemo(() => {
    // IDs of activities that have at least one reservation
    const reservedActivityIds = new Set(
      reservations.map(r => r.activityId).filter(Boolean)
    );
    // Show: planned, active, OR completed with existing reservations
    return activities.filter(a =>
      a.status === 'planned' || a.status === 'active' ||
      (a.status === 'completed' && reservedActivityIds.has(a.id))
    );
  }, [activities, reservations]);

  // ══ Filtered ══
  const filtered = useMemo(() => {
    if (!filterActivity) return []; // لا يظهر شيء حتى يتم اختيار نشاط
    return reservations
      .filter(r => {
        const matchActivity = filterActivity === 'all' || r.activityId === Number(filterActivity);
        const matchStatus = filterStatus === 'all' || r.status === filterStatus;
        return matchActivity && matchStatus;
      })
      .sort((a, b) => {
        // ترتيب: غير محدد الحضور أولاً، ثم حضر (أخضر)، ثم لم يحضر (أحمر)
        const attendOrder = (r: any) => r.attended === null || r.attended === undefined ? 0 : r.attended ? 1 : 2;
        return attendOrder(a) - attendOrder(b);
      });
  }, [reservations, filterActivity, filterStatus]);

  // ══ Stats ══ (فقط بعد اختيار نشاط)
  const stats = useMemo(() => {
    if (!filterActivity) return null;
    const data = filterActivity === 'all' ? reservations : reservations.filter(r => r.activityId === Number(filterActivity));
    const result: Record<string, { count: number; people: number }> = {};
    ALL_STATUSES.forEach(s => { result[s] = { count: 0, people: 0 }; });
    data.forEach(r => {
      if (result[r.status]) {
        result[r.status].count++;
        result[r.status].people += r.peopleCount || 1;
      }
    });
    return result;
  }, [reservations, filterActivity]);

  const totalPeople = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats).reduce((s, v) => s + v.people, 0);
  }, [stats]);

  // ══ Attendance Stats ══
  const attendanceStats = useMemo(() => {
    if (!filterActivity) return null;
    const data = filterActivity === 'all' ? reservations : reservations.filter(r => r.activityId === Number(filterActivity));
    const attended = data.filter(r => r.attended === true).length;
    const noShow = data.filter(r => r.attended === false).length;
    const unmarked = data.filter(r => r.attended === null || r.attended === undefined).length;
    return { attended, noShow, unmarked, total: data.length };
  }, [reservations, filterActivity]);

  // ══ Helpers ══
  function getActivityName(activityId: number | null) {
    if (!activityId) return 'بدون نشاط';
    return activities.find(a => a.id === activityId)?.name || 'غير معروف';
  }

  // ══ Create ══
  async function handleCreate() {
    if (!formName.trim()) return;
    setFormSubmitting(true);
    try {
      await apiFetch('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          activityId: formActivity ? Number(formActivity) : (filterActivity && filterActivity !== 'all' ? Number(filterActivity) : null),
          contactName: formName.trim(),
          contactMethod: formContact.trim(),
          phone: formPhone.trim(),
          peopleCount: formCount,
          notes: formNotes.trim(),
        }),
      });
      setFormName('');
      setFormContact('');
      setFormPhone('');
      setFormCount(1);
      setFormNotes('');
      await fetchAll();
    } catch (err: any) {
      alert('فشل التسجيل: ' + err.message);
    } finally {
      setFormSubmitting(false);
    }
  }

  // ══ Status Change (Quick) ══
  async function changeStatus(id: number, newStatus: string) {
    try {
      await apiFetch(`/api/reservations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchAll();
    } catch (err: any) {
      alert('فشل تغيير الحالة: ' + err.message);
    }
  }

  // ══ Attendance Toggle ══
  async function toggleAttendance(id: number, newValue: boolean | null) {
    try {
      await apiFetch(`/api/reservations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ attended: newValue }),
      });
      // تحديث مباشر (optimistic) لتجنب انتظار الـ API
      setReservations(prev => prev.map(r => r.id === id ? { ...r, attended: newValue } : r));
    } catch (err: any) {
      alert('فشل تحديث الحضور: ' + err.message);
    }
  }

  // ══ Edit ══
  function openEdit(r: any) {
    setEditing(r);
    setEditName(r.contactName || '');
    setEditContact(r.contactMethod || '');
    setEditPhone(r.phone || '');
    setEditCount(r.peopleCount || 1);
    setEditNotes(r.notes || '');
    setEditStatus(r.status || 'pending');
  }

  async function handleEditSave() {
    if (!editing) return;
    setEditSubmitting(true);
    try {
      await apiFetch(`/api/reservations/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          contactName: editName,
          contactMethod: editContact,
          phone: editPhone,
          peopleCount: editCount,
          notes: editNotes,
          status: editStatus,
        }),
      });
      setEditing(null);
      await fetchAll();
    } catch (err: any) {
      alert('فشل الحفظ: ' + err.message);
    } finally {
      setEditSubmitting(false);
    }
  }

  // ══ Delete ══
  async function handleDelete(id: number) {
    if (!confirm('هل أنت متأكد من حذف هذا الحجز؟')) return;
    try {
      await apiFetch(`/api/reservations/${id}`, { method: 'DELETE' });
      await fetchAll();
    } catch (err: any) {
      alert('فشل الحذف: ' + err.message);
    }
  }

  // ══ Loading ══
  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
    </div>
  );

  // ══ Activity not selected state ══
  const activitySelected = filterActivity !== '';

  return (
    <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">

      {/* ══════ HEADER ══════ */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">📋 متابعة الحجوزات</h1>
          {activitySelected && (
            <p className="text-gray-500 text-xs mt-0.5">{totalPeople} شخص — {filtered.length} حجز</p>
          )}
        </div>
        {activitySelected && (
          <button
            onClick={() => setShowForm(!showForm)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              showForm
                ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-700/70'
                : 'bg-gradient-to-r from-amber-500 to-rose-600 text-white hover:opacity-90 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
            }`}
          >
            {showForm ? '✕ إغلاق' : '+ حجز سريع'}
          </button>
        )}
      </div>

      {/* ══════ FILTER BAR (Activity Selector) ══════ */}
      <div className="flex gap-2">
        <select
          value={filterActivity}
          onChange={e => { setFilterActivity(e.target.value); if (!formActivity) setFormActivity(e.target.value !== 'all' && e.target.value !== '' ? e.target.value : ''); }}
          className="flex-1 px-3 py-2.5 bg-gray-800/50 border border-gray-700/30 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
        >
          <option value="">— اختر النشاط —</option>
          <option value="all">كل الأنشطة</option>
          {activitiesWithReservations.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.status === 'completed' ? ' (منتهي)' : ''}
            </option>
          ))}
        </select>
        {filterStatus !== 'all' && activitySelected && (
          <button
            onClick={() => setFilterStatus('all')}
            className="px-3 py-2 bg-gray-800/50 border border-gray-700/30 rounded-xl text-xs text-gray-400 hover:text-white transition"
          >
            كل الحالات ✕
          </button>
        )}
      </div>

      {/* ══════ NO ACTIVITY SELECTED ══════ */}
      {!activitySelected && (
        <div className="text-center py-20">
          <span className="text-5xl block mb-4 opacity-20">🎯</span>
          <p className="text-gray-500 text-sm">اختر نشاطاً من القائمة أعلاه لعرض الحجوزات</p>
        </div>
      )}

      {/* ══════ CONTENT AFTER ACTIVITY SELECTED ══════ */}
      {activitySelected && (
        <>
          {/* ══════ STATS CARDS ══════ */}
          {stats && (
            <div className="grid grid-cols-3 gap-2">
              {ALL_STATUSES.map(s => {
                const cfg = STATUS_CONFIG[s];
                const st = stats[s] || { count: 0, people: 0 };
                const isActive = filterStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
                    className={`p-3 rounded-xl border transition-all text-center ${
                      isActive
                        ? `${cfg.bg} ${cfg.border} ${cfg.glow}`
                        : 'bg-gray-800/30 border-gray-700/30 hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="text-lg mb-0.5">{cfg.emoji}</div>
                    <div className={`text-xl font-black ${isActive ? cfg.text : 'text-white'}`}>{st.people}</div>
                    <div className={`text-[10px] font-medium ${isActive ? cfg.text : 'text-gray-500'}`}>
                      {cfg.label} ({st.count})
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ══════ ATTENDANCE STATS BAR ══════ */}
          {attendanceStats && attendanceStats.total > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/30 border border-gray-700/20 rounded-xl text-xs">
              <span className="text-gray-500 font-medium">الحضور:</span>
              <span className="text-emerald-400 font-bold">✓ {attendanceStats.attended}</span>
              <span className="text-gray-600">|</span>
              <span className="text-rose-400 font-bold">✗ {attendanceStats.noShow}</span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400">⏳ {attendanceStats.unmarked}</span>
            </div>
          )}

          {/* ══════ QUICK ADD FORM ══════ */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-gray-800/40 border border-gray-700/30 rounded-2xl p-4 space-y-3">
                  <p className="text-xs text-gray-400 font-bold">تسجيل حجز جديد</p>

                  {/* النشاط (إذا لم يكن مختاراً من الفلتر) */}
                  {filterActivity === 'all' && (
                    <select
                      value={formActivity}
                      onChange={e => setFormActivity(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                    >
                      <option value="">اختر النشاط (اختياري)</option>
                      {activitiesWithReservations.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  )}

                  {/* الاسم + التواصل */}
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="اسم الشخص *"
                    className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      placeholder="📞 رقم الهاتف"
                      dir="ltr"
                      className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                    />
                    <input
                      type="text"
                      value={formContact}
                      onChange={e => setFormContact(e.target.value)}
                      placeholder="واتساب / انستا"
                      dir="ltr"
                      className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>

                  {/* العدد + ملاحظات */}
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    {/* عداد الأشخاص */}
                    <div className="flex items-center gap-1 bg-gray-900/60 border border-gray-600/40 rounded-xl px-2">
                      <button
                        type="button"
                        onClick={() => setFormCount(c => Math.max(1, c - 1))}
                        className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition text-lg"
                      >−</button>
                      <span className="w-8 text-center text-white font-bold text-sm">{formCount}</span>
                      <button
                        type="button"
                        onClick={() => setFormCount(c => c + 1)}
                        className="w-8 h-8 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition text-lg"
                      >+</button>
                      <span className="text-[10px] text-gray-500 mr-1">شخص</span>
                    </div>
                    <input
                      type="text"
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      placeholder="ملاحظات (اختياري)"
                      className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                    />
                  </div>

                  {/* زر التسجيل */}
                  <button
                    onClick={handleCreate}
                    disabled={formSubmitting || !formName.trim()}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-40 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                  >
                    {formSubmitting ? 'جاري التسجيل...' : '✓ تسجيل الحجز'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ══════ RESERVATION CARDS ══════ */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <span className="text-4xl block mb-3 opacity-20">📋</span>
                <p className="text-gray-600 text-sm">لا توجد حجوزات{filterStatus !== 'all' ? ' مطابقة للفلتر' : ' بعد'}</p>
              </div>
            ) : (
              filtered.map(r => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                const isAttended = r.attended === true;
                const isNoShow = r.attended === false;
                const isUnmarked = r.attended === null || r.attended === undefined;

                // تحديد ألوان الكارد بناءً على حالة الحضور
                let cardBorder = cfg.border;
                let cardBg = 'bg-gray-800/30';
                let cardGlow = '';
                if (isAttended) {
                  cardBorder = 'border-emerald-500/40';
                  cardBg = 'bg-emerald-500/5';
                  cardGlow = 'shadow-[0_0_8px_rgba(16,185,129,0.1)]';
                } else if (isNoShow) {
                  cardBorder = 'border-rose-500/40';
                  cardBg = 'bg-rose-500/5';
                  cardGlow = 'shadow-[0_0_8px_rgba(244,63,94,0.1)]';
                }

                return (
                  <motion.div
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`${cardBg} border rounded-xl p-3.5 transition-all ${cardBorder} ${cardGlow}`}
                  >
                    {/* الصف الأول: الاسم + Badge + حالة الحضور */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-white font-bold text-sm truncate">{r.contactName}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border} font-medium whitespace-nowrap`}>
                            {cfg.emoji} {cfg.label}
                          </span>
                          {isAttended && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold whitespace-nowrap">
                              ✓ حضر
                            </span>
                          )}
                          {isNoShow && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold whitespace-nowrap">
                              ✗ لم يحضر
                            </span>
                          )}
                        </div>
                        {r.contactMethod && (
                          <p className="text-gray-500 text-xs" dir="ltr">{r.contactMethod}</p>
                        )}
                      </div>
                      {/* زر اتصال */}
                      {r.phone && (
                        <a
                          href={`tel:${r.phone}`}
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition shrink-0"
                          title={`اتصال: ${r.phone}`}
                        >
                          📞
                        </a>
                      )}
                      <div className="text-center shrink-0">
                        <div className="text-white font-black text-lg leading-none">{r.peopleCount || 1}</div>
                        <div className="text-[9px] text-gray-600">شخص</div>
                      </div>
                    </div>

                    {/* ملاحظات */}
                    {r.notes && (
                      <div className="mb-2 px-2 py-1.5 bg-gray-900/40 rounded-lg">
                        <p className="text-[11px] text-gray-400">💬 {r.notes}</p>
                      </div>
                    )}

                    {/* النشاط + التاريخ */}
                    <div className="flex items-center justify-between text-[10px] text-gray-600 mb-2.5">
                      <span>🎯 {getActivityName(r.activityId)}</span>
                      <span>{r.createdAt ? new Date(r.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : ''}</span>
                    </div>

                    {/* ══ أزرار الحضور ══ */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <button
                        onClick={() => toggleAttendance(r.id, isAttended ? null : true)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                          isAttended
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                            : 'bg-gray-800/40 text-gray-500 border-gray-700/30 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                        }`}
                      >
                        ✓ حضر
                      </button>
                      <button
                        onClick={() => toggleAttendance(r.id, isNoShow ? null : false)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                          isNoShow
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                            : 'bg-gray-800/40 text-gray-500 border-gray-700/30 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30'
                        }`}
                      >
                        ✗ لم يحضر
                      </button>
                    </div>

                    {/* أزرار الحالة السريعة */}
                    <div className="flex items-center gap-1.5">
                      {ALL_STATUSES.filter(s => s !== r.status).map(s => {
                        const c = STATUS_CONFIG[s];
                        return (
                          <button
                            key={s}
                            onClick={() => changeStatus(r.id, s)}
                            className={`flex-1 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${c.bg} ${c.text} ${c.border} hover:opacity-80 active:scale-95`}
                          >
                            {c.emoji} {c.label}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => openEdit(r)}
                        className="py-1.5 px-2.5 rounded-lg border border-gray-700/30 text-gray-500 hover:text-white hover:bg-gray-700/30 text-[11px] transition"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="py-1.5 px-2.5 rounded-lg border border-gray-700/30 text-gray-600 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 text-[11px] transition"
                      >
                        🗑
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ══════ EDIT MODAL (Bottom Sheet Style) ══════ */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setEditing(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-gray-800 border border-gray-700/50 rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md space-y-3 max-h-[85vh] overflow-y-auto"
              dir="rtl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">تعديل الحجز</h3>
                <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white transition text-lg">✕</button>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">اسم الشخص *</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">📞 رقم الهاتف</label>
                  <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} dir="ltr"
                    className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">طريقة التواصل</label>
                  <input type="text" value={editContact} onChange={e => setEditContact(e.target.value)} dir="ltr"
                    className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">عدد الأشخاص</label>
                  <div className="flex items-center gap-1 bg-gray-900/60 border border-gray-600/40 rounded-xl px-2 py-1">
                    <button type="button" onClick={() => setEditCount(c => Math.max(1, c - 1))} className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition text-lg">−</button>
                    <span className="flex-1 text-center text-white font-bold text-sm">{editCount}</span>
                    <button type="button" onClick={() => setEditCount(c => c + 1)} className="w-8 h-8 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition text-lg">+</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">الحالة</label>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30">
                    {ALL_STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_CONFIG[s].emoji} {STATUS_CONFIG[s].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">ملاحظات</label>
                <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30" />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={handleEditSave} disabled={editSubmitting}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50">
                  {editSubmitting ? 'جاري الحفظ...' : '✓ حفظ التعديلات'}
                </button>
                <button onClick={() => setEditing(null)}
                  className="px-5 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">إلغاء</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
