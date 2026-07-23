'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { swalConfirm } from '@/lib/swal';

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

// ── حالة التثبيت: ثنائية مثبّت/غير مثبّت (paid_all القديم يُعامَل كمثبّت) ──
function isConfirmed(r: any): boolean {
  return r?.status === 'confirmed' || r?.status === 'paid_all';
}
function confirmMeta(confirmed: boolean) {
  return confirmed
    ? { label: 'مثبّت', emoji: '✅', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/25', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' }
    : { label: 'غير مثبّت', emoji: '⏳', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/25', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]' };
}

// ── واتساب: تطبيع رقم أردنيّ للصيغة الدوليّة + رسالة تأكيد جاهزة ──
const WA_COUNTRY = '962';
function normalizePhoneIntl(raw: string): string | null {
  let p = String(raw || '').replace(/\D/g, '');
  if (!p || p.length < 6) return null;
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith(WA_COUNTRY)) return p;
  if (p.startsWith('0')) return WA_COUNTRY + p.slice(1);
  return WA_COUNTRY + p; // رقم محلّيّ بلا صفر بادئ
}
// أرقام فقط بلا صفرٍ بادئ — لمقارنة الهواتف بصرف النظر عن التنسيق
function normPhoneKey(p: string): string {
  return String(p || '').replace(/\D/g, '').replace(/^0+/, '');
}
function confirmMessage(name: string, activityName: string, count: number): string {
  const ppl = count === 1 ? 'شخص واحد' : count === 2 ? 'شخصين' : `${count} أشخاص`;
  return `مرحباً ${name || ''} 👋\nنؤكّد حجزك في «${activityName}» لعدد ${ppl}.\nيُرجى الردّ على هذه الرسالة لتثبيت الحجز بشكلٍ نهائيّ. بانتظارك! 🎭`;
}

export default function ReservationsPage() {
  const user = useMemo(() => getUser(), []);

  // ── Data ──
  const [reservations, setReservations] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── 🖨️ كشف الحاجزين (PDF/Excel عبر نظام التقارير) ──
  const [rosterBusy, setRosterBusy] = useState<null | 'pdf' | 'excel'>(null);

  // ── Filters ── (default: no activity selected → don't show reservations)
  const [filterActivity, setFilterActivity] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterAttendance, setFilterAttendance] = useState('all');

  // ── Quick Add Form ──
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCount, setFormCount] = useState(1);
  const [formNotes, setFormNotes] = useState('');
  const [formActivity, setFormActivity] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  // 🔗 الربط الذكي باللاعب: اقتراحات أثناء كتابة الاسم/الرقم + مُعرّف اللاعب المربوط
  const [formPlayerId, setFormPlayerId] = useState<number | null>(null);
  const [playerSuggest, setPlayerSuggest] = useState<any[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [phoneSuggest, setPhoneSuggest] = useState<any[]>([]);
  const [showPhoneSuggest, setShowPhoneSuggest] = useState(false);
  // ⚠️ كشف تكرار الحجز: تمييز الحجز الموجود + رسالة تنبيه
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [dupWarn, setDupWarn] = useState<string>('');

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
        const matchStatus = filterStatus === 'all' || (filterStatus === 'confirmed' ? isConfirmed(r) : !isConfirmed(r));
        
        let matchAttendance = true;
        if (filterAttendance === 'attended') matchAttendance = r.attended === true;
        else if (filterAttendance === 'noShow') matchAttendance = r.attended === false;
        else if (filterAttendance === 'unmarked') matchAttendance = r.attended === null || r.attended === undefined;

        let matchSearch = true;
        if (filterSearch) {
          const s = filterSearch.toLowerCase();
          matchSearch = (r.contactName && r.contactName.toLowerCase().includes(s)) || (r.phone && r.phone.includes(s));
        }

        return matchActivity && matchStatus && matchAttendance && matchSearch;
      })
      .sort((a, b) => {
        // ترتيب: غير محدد الحضور أولاً، ثم حضر (أخضر)، ثم لم يحضر (أحمر)
        const attendOrder = (r: any) => r.attended === null || r.attended === undefined ? 0 : r.attended ? 1 : 2;
        return attendOrder(a) - attendOrder(b);
      });
  }, [reservations, filterActivity, filterStatus, filterAttendance, filterSearch]);

  // ══ Stats ══ (فقط بعد اختيار نشاط)
  const stats = useMemo(() => {
    if (!filterActivity) return null;
    const data = filterActivity === 'all' ? reservations : reservations.filter(r => r.activityId === Number(filterActivity));
    const result: Record<'confirmed' | 'unconfirmed', { count: number; people: number }> = {
      confirmed: { count: 0, people: 0 }, unconfirmed: { count: 0, people: 0 },
    };
    data.forEach(r => {
      const k = isConfirmed(r) ? 'confirmed' : 'unconfirmed';
      result[k].count++;
      result[k].people += r.peopleCount || 1;
    });
    return result;
  }, [reservations, filterActivity]);

  const totalPeople = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats).reduce((s, v) => s + v.people, 0);
  }, [stats]);

  // ══ Attendance Stats ══
  // فصل المتوقَّع عن الفعليّ: «متوقَّع» = مجموع الأشخاص (peopleCount) للتخطيط والصورة،
  // أمّا «حضر/لعب فعليّاً» فكلّ حجز = لاعبٌ واحد فعليّ (المرافقون لا يحجزون من التطبيق ولا يدخلون اللعبة).
  const attendanceStats = useMemo(() => {
    if (!filterActivity) return null;
    const data = filterActivity === 'all' ? reservations : reservations.filter(r => r.activityId === Number(filterActivity));
    const attended = data.filter(r => r.attended === true).length;
    const noShow = data.filter(r => r.attended === false).length;
    const unmarked = data.filter(r => r.attended === null || r.attended === undefined).length;
    const total = data.length;                                            // لاعبون فعليّون (حجوزات)
    const expectedPeople = data.reduce((s, r) => s + (r.peopleCount || 1), 0); // أشخاص متوقَّعون
    return { attended, noShow, unmarked, total, expectedPeople };
  }, [reservations, filterActivity]);

  // ══ Helpers ══
  function getActivityName(activityId: number | null) {
    if (!activityId) return 'بدون نشاط';
    return activities.find(a => a.id === activityId)?.name || 'غير معروف';
  }

  // ══ 🖨️ توليد كشف الحاجزين — عبر نظام التقارير (يرث تخطيط الطباعة والترويسة) ══
  async function exportRoster(format: 'pdf' | 'excel') {
    if (!filterActivity || filterActivity === 'all') return;
    setRosterBusy(format);
    try {
      const res = await fetch(`${API_URL}/api/reports/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          key: 'reservation-roster',
          format,
          params: { activityId: Number(filterActivity) },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as any));
        throw new Error(d?.error || 'فشل توليد الكشف');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (format === 'pdf') {
        // فتح للعرض — والطباعة من عارض المتصفّح
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `كشف حجوزات - ${getActivityName(Number(filterActivity))}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err: any) {
      alert('فشل توليد الكشف: ' + (err.message || ''));
    } finally {
      setRosterBusy(null);
    }
  }

  // ══ ✅ تحديث الحضور من الألعاب — يحوّل المثبّت إلى «حاضر» لمن له لعبة مسجّلة في يوم فعاليّته ══
  const [attBusy, setAttBusy] = useState(false);
  async function markAttendanceFromGames() {
    if (attBusy) return;
    const scope = filterActivity && filterActivity !== 'all' ? getActivityName(Number(filterActivity)) : 'كلّ الفعاليّات';
    if (!confirm(`مراجعة الحجوزات المثبّتة في «${scope}» وتحويل من له لعبة مسجّلة إلى «حاضر»؟`)) return;
    setAttBusy(true);
    try {
      const r = await apiFetch('/api/reservations/mark-attendance-from-games', {
        method: 'POST',
        body: JSON.stringify({ activityId: filterActivity || 'all' }),
      });
      await fetchAll();
      alert(r.marked > 0 ? `✅ حُوّل ${r.marked} حجزاً إلى «حاضر» بناءً على الألعاب المسجّلة.` : 'لا حجوزات جديدة للتحويل — كلّ من له ألعاب مُعلَّم حاضراً بالفعل.');
    } catch (err: any) {
      alert('فشل التحديث: ' + (err.message || ''));
    } finally {
      setAttBusy(false);
    }
  }

  // ══ 🔗 بحث اللاعبين أثناء الكتابة (اسم أو رقم) — للربط الذكيّ ══
  useEffect(() => {
    const term = formName.trim();
    if (!showForm || term.length < 2 || formPlayerId) { setPlayerSuggest([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/staff-notifications/players/search?q=${encodeURIComponent(term)}`);
        setPlayerSuggest(Array.isArray(data?.players) ? data.players.slice(0, 6) : []);
      } catch { setPlayerSuggest([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [formName, showForm, formPlayerId]);

  // 🔗 بحث اللاعبين برقم الهاتف (حقل الهاتف) — مطابقة جزئيّة (لا يلزم الرقم كاملاً)
  useEffect(() => {
    const term = formPhone.trim();
    if (!showForm || term.length < 2 || formPlayerId) { setPhoneSuggest([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/staff-notifications/players/search?q=${encodeURIComponent(term)}`);
        setPhoneSuggest(Array.isArray(data?.players) ? data.players.slice(0, 6) : []);
      } catch { setPhoneSuggest([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [formPhone, showForm, formPlayerId]);

  function selectPlayer(p: any) {
    setFormName(p.name || '');
    if (p.phone) setFormPhone(p.phone);
    setFormPlayerId(p.id);
    setPlayerSuggest([]);
    setShowSuggest(false);
    setPhoneSuggest([]);
    setShowPhoneSuggest(false);
  }

  // ⚠️ كشف حجزٍ مسبق لنفس اللاعب في نفس الفعالية (بالمُعرّف أو الهاتف أو الاسم)
  function findDuplicate(activityId: number | null): any | null {
    const nm = formName.trim().toLowerCase();
    const ph = normPhoneKey(formPhone);
    return reservations.find((r: any) => {
      if (r.deletedAt) return false;
      if ((r.activityId ?? null) !== (activityId ?? null)) return false;
      const pidMatch = !!formPlayerId && r.playerId === formPlayerId;
      const phoneMatch = ph.length >= 6 && normPhoneKey(r.phone) === ph;
      const nameMatch = !formPlayerId && ph.length < 6 && !!nm && (r.contactName || '').trim().toLowerCase() === nm;
      return pidMatch || phoneMatch || nameMatch;
    }) || null;
  }

  // سكرول تلقائيّ للحجز المميَّز عند اكتشاف تكرار
  useEffect(() => {
    if (highlightId == null) return;
    const el = document.getElementById(`res-${highlightId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, filtered]);

  // ══ Create ══
  async function handleCreate() {
    if (!formName.trim()) return;
    // منع التكرار: إن وُجد حجزٌ مسبق لنفس الشخص في الفعالية → تنبيه + سكرول إليه بلا إنشاء
    const targetActivityId = formActivity ? Number(formActivity) : (filterActivity && filterActivity !== 'all' ? Number(filterActivity) : null);
    const dup = findDuplicate(targetActivityId);
    if (dup) {
      if (targetActivityId != null) setFilterActivity(String(targetActivityId));
      setFilterStatus('all'); setFilterAttendance('all'); setFilterSearch('');
      setDupWarn(`⚠️ يوجد حجز مسبق لـ«${dup.contactName}» في هذه الفعالية — تمّ الانتقال إليه.`);
      setHighlightId(dup.id);
      setTimeout(() => setDupWarn(''), 5000);
      setTimeout(() => setHighlightId(null), 3500);
      return;
    }
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
          playerId: formPlayerId,
        }),
      });
      setFormName('');
      setFormContact('');
      setFormPhone('');
      setFormCount(1);
      setFormNotes('');
      setFormPlayerId(null);
      setPlayerSuggest([]);
      await fetchAll();
    } catch (err: any) {
      alert('فشل التسجيل: ' + err.message);
    } finally {
      setFormSubmitting(false);
    }
  }

  // ══ تبديل التثبيت (مثبّت/غير مثبّت) — تحديث فوريّ (optimistic) ══
  async function toggleConfirmed(r: any) {
    const newStatus = isConfirmed(r) ? 'pending' : 'confirmed';
    setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: newStatus } : x));
    try {
      await apiFetch(`/api/reservations/${r.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err: any) {
      alert('فشل تغيير الحالة: ' + err.message);
      await fetchAll();
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
    if (!(await swalConfirm('هل أنت متأكد من حذف هذا الحجز؟'))) return;
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

      {/* ⚠️ تنبيه تكرار الحجز */}
      <AnimatePresence>
        {dupWarn && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-bold shadow-xl backdrop-blur-md max-w-[92vw] text-center"
            onClick={() => setDupWarn('')}
          >
            {dupWarn}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ HEADER ══════ */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">📋 متابعة الحجوزات</h1>
          {activitySelected && (
            <p className="text-gray-500 text-xs mt-0.5">{totalPeople} شخص — {filtered.length} حجز</p>
          )}
        </div>
        {activitySelected && (
          <div className="flex items-center gap-2">
            {/* 🖨️ كشف الحاجزين — PDF للطباعة + Excel (لنشاط محدّد فقط) */}
            {filterActivity !== 'all' && (
              <>
                <button
                  onClick={() => exportRoster('pdf')}
                  disabled={rosterBusy !== null}
                  title="كشف الحاجزين PDF — يُفتح للعرض والطباعة"
                  className="px-3.5 py-2.5 rounded-xl text-sm font-bold bg-gray-800/60 border border-gray-600/40 text-gray-200 hover:border-amber-500/40 hover:text-amber-400 transition-all disabled:opacity-50"
                >
                  {rosterBusy === 'pdf' ? '⏳' : '🖨️'} كشف
                </button>
                <button
                  onClick={() => exportRoster('excel')}
                  disabled={rosterBusy !== null}
                  title="تنزيل الكشف Excel"
                  className="px-3 py-2.5 rounded-xl text-sm bg-gray-800/60 border border-gray-600/40 text-gray-400 hover:border-emerald-500/40 hover:text-emerald-400 transition-all disabled:opacity-50"
                >
                  {rosterBusy === 'excel' ? '⏳' : '📊'}
                </button>
                {/* 🖼️ كشف الحضور المصوّر (بطاقات) — يُفتح في تبويب جديد للعرض/الطباعة/المشاركة */}
                <button
                  onClick={() => window.open(`/print/attendance/${filterActivity}`, '_blank')}
                  title="كشف الحضور المصوّر — بطاقات بالصور والرتب، للطباعة أو المشاركة"
                  className="px-3.5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-amber-600/20 to-yellow-700/10 border border-amber-500/40 text-amber-300 hover:from-amber-600/30 hover:text-amber-200 transition-all"
                >
                  🖼️ كشف مصوّر
                </button>
              </>
            )}
            {/* ✅ تحديث الحضور من الألعاب المسجّلة */}
            <button
              onClick={markAttendanceFromGames}
              disabled={attBusy}
              title="مراجعة المثبّتين وتحويل من لعب فعليّاً إلى «حاضر»"
              className="px-3.5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/25 transition-all disabled:opacity-50"
            >
              {attBusy ? '⏳ يراجع…' : '✅ تحديث الحضور'}
            </button>
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
          </div>
        )}
      </div>

      {/* ══════ FILTER BAR (Activity Selector) ══════ */}
      <div className="flex gap-2 mb-3">
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

      {activitySelected && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="🔍 بحث باسم الشخص أو رقم الهاتف..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder-gray-500"
          />
        </div>
      )}

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
            <div className="grid grid-cols-2 gap-2">
              {(['unconfirmed', 'confirmed'] as const).map(k => {
                const cfg = confirmMeta(k === 'confirmed');
                const st = stats[k] || { count: 0, people: 0 };
                const isActive = filterStatus === k;
                return (
                  <button
                    key={k}
                    onClick={() => setFilterStatus(filterStatus === k ? 'all' : k)}
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
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-gray-800/30 border border-gray-700/20 rounded-xl text-xs">
              <span className="text-gray-500 font-medium">الحضور — لاعبون فعليّون ({attendanceStats.total}) · متوقَّع {attendanceStats.expectedPeople} شخص:</span>
              
              <button 
                onClick={() => setFilterAttendance(filterAttendance === 'attended' ? 'all' : 'attended')}
                className={`font-bold transition-colors ${filterAttendance === 'attended' ? 'text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded' : 'text-emerald-400 hover:text-emerald-300'}`}
              >
                ✓ {attendanceStats.attended}
              </button>
              
              <span className="text-gray-600">|</span>
              
              <button 
                onClick={() => setFilterAttendance(filterAttendance === 'noShow' ? 'all' : 'noShow')}
                className={`font-bold transition-colors ${filterAttendance === 'noShow' ? 'text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded' : 'text-rose-400 hover:text-rose-300'}`}
              >
                ✗ {attendanceStats.noShow}
              </button>
              
              <span className="text-gray-600">|</span>
              
              <button 
                onClick={() => setFilterAttendance(filterAttendance === 'unmarked' ? 'all' : 'unmarked')}
                className={`transition-colors ${filterAttendance === 'unmarked' ? 'text-gray-200 bg-gray-700/50 px-2 py-0.5 rounded font-bold' : 'text-gray-400 hover:text-gray-300'}`}
              >
                ⏳ {attendanceStats.unmarked}
              </button>
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

                  {/* الاسم — بحثٌ ذكيّ يربط بحساب لاعب مسجّل أثناء الكتابة */}
                  <div className="relative">
                    <input
                      type="text"
                      value={formName}
                      onChange={e => { setFormName(e.target.value); setFormPlayerId(null); setShowSuggest(true); }}
                      onFocus={() => setShowSuggest(true)}
                      onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                      placeholder="اسم الشخص أو رقمه *"
                      className={`w-full px-3 py-2.5 bg-gray-900/60 border rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 ${formPlayerId ? 'border-sky-500/50' : 'border-gray-600/40'}`}
                      autoFocus
                    />
                    {formPlayerId && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 pointer-events-none">👤 مربوط</span>
                    )}
                    {showSuggest && playerSuggest.length > 0 && (
                      <div className="absolute z-20 top-full mt-1 w-full bg-[#0d0d0d] border border-gray-700/50 rounded-xl overflow-hidden shadow-xl max-h-60 overflow-y-auto">
                        <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-gray-800/60">لاعبون مسجّلون — اختر للربط</div>
                        {playerSuggest.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectPlayer(p)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 text-right border-b border-gray-800/40 last:border-0"
                          >
                            <img src={p.avatarUrl || '/avatars/male.png'} alt="" className="w-7 h-7 rounded-full object-cover bg-gray-700 shrink-0" onError={e => { (e.target as HTMLImageElement).src = '/avatars/male.png'; }} />
                            <span className="flex-1 text-white text-sm truncate">{p.name}</span>
                            <span className="text-gray-500 text-[11px] font-mono" dir="ltr">{p.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={e => { setFormPhone(e.target.value); setFormPlayerId(null); setShowPhoneSuggest(true); }}
                        onFocus={() => setShowPhoneSuggest(true)}
                        onBlur={() => setTimeout(() => setShowPhoneSuggest(false), 150)}
                        placeholder="📞 رقم الهاتف"
                        dir="ltr"
                        className={`w-full px-3 py-2.5 bg-gray-900/60 border rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500/30 ${formPlayerId ? 'border-sky-500/50' : 'border-gray-600/40'}`}
                      />
                      {showPhoneSuggest && phoneSuggest.length > 0 && (
                        <div className="absolute z-20 top-full mt-1 w-[240px] max-w-[80vw] bg-[#0d0d0d] border border-gray-700/50 rounded-xl overflow-hidden shadow-xl max-h-60 overflow-y-auto" dir="rtl">
                          <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-gray-800/60">مطابقة بالرقم — اختر للربط</div>
                          {phoneSuggest.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => selectPlayer(p)}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 text-right border-b border-gray-800/40 last:border-0"
                            >
                              <img src={p.avatarUrl || '/avatars/male.png'} alt="" className="w-7 h-7 rounded-full object-cover bg-gray-700 shrink-0" onError={e => { (e.target as HTMLImageElement).src = '/avatars/male.png'; }} />
                              <span className="flex-1 text-white text-sm truncate">{p.name}</span>
                              <span className="text-gray-500 text-[11px] font-mono" dir="ltr">{p.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
                const confirmed = isConfirmed(r);
                const cfg = confirmMeta(confirmed);
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
                    id={`res-${r.id}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`${cardBg} border rounded-xl p-3.5 transition-all ${cardBorder} ${cardGlow} ${highlightId === r.id ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-black' : ''}`}
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
                          {r.playerId && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 font-bold whitespace-nowrap" title="مربوط بحساب لاعب مسجّل">
                              👤 لاعب
                            </span>
                          )}
                          {r.appConfirmed && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/40 font-bold whitespace-nowrap shadow-[0_0_10px_rgba(139,92,246,0.15)]"
                              title={`اللاعب حجز بنفسه من التطبيق${r.appConfirmedAt ? ' — ' + new Date(r.appConfirmedAt).toLocaleString('ar-JO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}`}
                            >
                              📱 تأكّد من التطبيق
                            </span>
                          )}
                        </div>
                        {r.contactMethod && (
                          <p className="text-gray-500 text-xs" dir="ltr">{r.contactMethod}</p>
                        )}
                      </div>
                      {/* زر واتساب — يفتح محادثة برسالة تأكيد جاهزة */}
                      {r.phone && normalizePhoneIntl(r.phone) && (
                        <button
                          onClick={() => {
                            const intl = normalizePhoneIntl(r.phone);
                            if (!intl) return;
                            const msg = confirmMessage(r.contactName, getActivityName(r.activityId), r.peopleCount || 1);
                            window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank');
                          }}
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition shrink-0"
                          title="واتساب — إرسال رسالة تأكيد"
                        >
                          💬
                        </button>
                      )}
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

                    {/* ══ الحضور — ضبطٌ مباشر بنقرة (لا إعادة تعيين بالخطأ) ══ */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <button
                        onClick={() => toggleAttendance(r.id, true)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                          isAttended
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                            : 'bg-gray-800/40 text-gray-500 border-gray-700/30 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                        }`}
                      >
                        ✓ حضر
                      </button>
                      <button
                        onClick={() => toggleAttendance(r.id, false)}
                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                          isNoShow
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
                            : 'bg-gray-800/40 text-gray-500 border-gray-700/30 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30'
                        }`}
                      >
                        ✗ لم يحضر
                      </button>
                      {!isUnmarked && (
                        <button
                          onClick={() => toggleAttendance(r.id, null)}
                          title="مسح تحديد الحضور"
                          className="px-2.5 py-2 rounded-lg border border-gray-700/30 text-gray-500 hover:text-gray-200 hover:bg-gray-700/30 text-xs transition"
                        >
                          ↺
                        </button>
                      )}
                    </div>

                    {/* ══ التثبيت (زرّ إجراء واحد واضح) + تعديل/حذف ══ */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleConfirmed(r)}
                        className={`flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition-all active:scale-95 ${
                          confirmed
                            ? 'bg-gray-800/40 text-gray-400 border-gray-700/30 hover:bg-gray-700/40'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25 shadow-[0_0_10px_rgba(16,185,129,0.12)]'
                        }`}
                      >
                        {confirmed ? '↩ إلغاء التثبيت' : '✅ تثبيت الحجز'}
                      </button>
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
                  <label className="block text-xs text-gray-400 mb-1">حالة التثبيت</label>
                  <select value={editStatus === 'confirmed' || editStatus === 'paid_all' ? 'confirmed' : 'pending'} onChange={e => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-900/60 border border-gray-600/40 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30">
                    <option value="pending">⏳ غير مثبّت</option>
                    <option value="confirmed">✅ مثبّت</option>
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
