'use client';

// ══════════════════════════════════════════════════════
// 📋 بياناتُ الحجوزات وأفعالُها — مصدرٌ واحدٌ للصفحة ولوضع الباب
//
// 🔴 استُخرج من مكوّنٍ سطورُه ١٢٥١: شاشتان تحتاجان نفسَ الجلب ونفسَ الأفعال،
//    ونسخُهما مرّتين يعني عطبَين يُصلَحان مرّةً واحدة.
//
// 🔴 الجلبُ صار مُقيَّداً بالفعاليّة: كان يسحب **كلّ** حجوزات القاعدة كلّ ٣٠ث
//    بلا معاملات، والنقطةُ تدعم `?activityId=` أصلاً.
//
// 🔴 والاستطلاعُ يتوقّف حين تختفي الصفحة: الموظّفُ يترك اللوحة مفتوحةً الليلةَ
//    كلَّها، فاستطلاعٌ كلّ نصف دقيقةٍ على شاشةٍ مطفأة نزيفُ بطّاريّةٍ وشبكة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isConfirmed, isPending, matchesSearch, attendOrder, countRows, needsWa,
  type ResCounts,
} from '@/lib/reservation-status';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const POLL_MS = 30_000;

export interface Reservation {
  id: number;
  activityId: number | null;
  contactName: string;
  contactMethod: string | null;
  phone: string | null;
  peopleCount: number | null;
  playerId: number | null;
  status: string | null;
  appConfirmed: boolean | null;
  appConfirmedAt: string | null;
  attended: boolean | null;
  notes: string | null;
  remindOptIn: boolean | null;
  /** آخرُ رسالةِ واتساب يدويّةٍ أرسلها موظّفٌ من حسابه — لا علاقة لها بالبوت */
  waSentAt: string | null;
  waSentBy: string | null;
  createdBy: string | null;
  createdAt: string | null;
  deletedAt: string | null;
}

export interface Activity { id: number; name: string; date: string; status: string; locationId: number | null }
export interface Loc { id: number; name: string; region?: string; mapUrl?: string }

export const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('token') : null;

export async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

export type AttendFilter = 'all' | 'attended' | 'noShow' | 'unmarked';
export type StatusFilter = 'all' | 'confirmed' | 'pending' | 'waitlist';
/** مرشِّحُ رسالةِ الواتساب اليدويّة — «مَن لم أراسله بعد» */
export type WaFilter = 'all' | 'needs';

export function useReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);

  const [activityId, setActivityId] = useState('');      // '' | 'all' | '<id>'
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [attend, setAttend] = useState<AttendFilter>('all');
  const [wa, setWa] = useState<WaFilter>('all');

  const inflight = useRef(false);

  const fetchAll = useCallback(async (scope?: string) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const id = scope ?? activityId;
      // نطاقُ الجلب يتبع الاختيار — لا تُسحب القاعدةُ كلُّها بلا سبب
      const q = id && id !== 'all' ? `?activityId=${encodeURIComponent(id)}` : '';
      const [res, acts, locs] = await Promise.all([
        apiFetch(`/api/reservations${q}`),
        apiFetch('/api/activities'),
        apiFetch('/api/locations').catch(() => []),
      ]);
      setReservations(Array.isArray(res) ? res : []);
      setActivities(Array.isArray(acts) ? acts : []);
      setLocations(Array.isArray(locs) ? locs : []);
    } catch (err) {
      console.error('reservations fetch:', err);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [activityId]);

  // ── الاستطلاع: يتوقّف حين تُخفى الصفحة ويُستأنف فوراً عند العودة ──
  useEffect(() => {
    fetchAll();
    let t: any = null;
    const start = () => { if (!t) t = setInterval(() => fetchAll(), POLL_MS); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { fetchAll(); start(); } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchAll]);

  // ── الفعاليّات المعروضة في القائمة ──
  const activityOptions = useMemo(() => {
    const withRes = new Set(reservations.map(r => r.activityId).filter(Boolean));
    return activities.filter(a =>
      a.status === 'planned' || a.status === 'active' ||
      (a.status === 'completed' && withRes.has(a.id)));
  }, [activities, reservations]);

  // ══ 🎯 الاختيارُ الافتراضيّ: أقرب فعاليّة قادمة ══
  // المقارنةُ مع **بداية اليوم** لا اللحظة: فعاليّةُ السابعة مساءً تبقى فعاليّةَ
  // اليوم لمن يفتح الصفحة في التاسعة وسط الليلة نفسها.
  // ومرّةً واحدة: الاستطلاعُ يتكرّر، ولولا الحارس لألغى اختيار الموظّف كلّ نصف دقيقة.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current) return;
    if (activityId !== '') { autoPicked.current = true; return; }
    if (!activities.length) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const next = activities
      .filter(a => (a.status === 'planned' || a.status === 'active') && a.date)
      .filter(a => new Date(a.date).getTime() >= start.getTime())
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())[0];
    if (!next) return;
    autoPicked.current = true;
    setActivityId(String(next.id));
  }, [activities, activityId]);

  /** صفوفُ الفعاليّة المختارة — قبل مرشِّحات العرض. أساسُ كلّ عدّ. */
  const scoped = useMemo(() => {
    if (!activityId) return [] as Reservation[];
    return activityId === 'all'
      ? reservations
      : reservations.filter(r => r.activityId === Number(activityId));
  }, [reservations, activityId]);

  /** ما يُعرض بعد المرشِّحات */
  const filtered = useMemo(() => scoped
    .filter(r => {
      if (status === 'confirmed' && !isConfirmed(r)) return false;
      if (status === 'pending' && !isPending(r)) return false;
      if (status === 'waitlist' && String(r.status) !== 'waitlist') return false;
      if (attend === 'attended' && r.attended !== true) return false;
      if (attend === 'noShow' && r.attended !== false) return false;
      if (attend === 'unmarked' && r.attended != null) return false;
      if (wa === 'needs' && !needsWa(r)) return false;
      return matchesSearch(r, search);
    })
    .sort((a, b) => attendOrder(a) - attendOrder(b)),
  [scoped, status, attend, wa, search]);

  const counts: ResCounts = useMemo(() => countRows(scoped), [scoped]);
  const pendingRows = useMemo(() => scoped.filter(isPending), [scoped]);

  const activityName = useCallback((id: number | null) => {
    if (!id) return 'بدون نشاط';
    return activities.find(a => a.id === id)?.name || 'غير معروف';
  }, [activities]);

  const activity = useMemo(
    () => (activityId && activityId !== 'all' ? activities.find(a => a.id === Number(activityId)) ?? null : null),
    [activities, activityId]);

  const location = useMemo(
    () => (activity?.locationId ? locations.find(l => l.id === activity.locationId) ?? null : null),
    [activity, locations]);

  // ══════════ الأفعال ══════════

  /** تعليمُ الحضور — تحديثٌ فوريّ ثمّ إرسال. الفشلُ يُرجع القيمة السابقة. */
  const setAttendance = useCallback(async (id: number, value: boolean | null) => {
    const prev = reservations.find(r => r.id === id)?.attended ?? null;
    setReservations(p => p.map(r => (r.id === id ? { ...r, attended: value } : r)));
    try {
      await apiFetch(`/api/reservations/${id}`, { method: 'PUT', body: JSON.stringify({ attended: value }) });
      return true;
    } catch (err: any) {
      setReservations(p => p.map(r => (r.id === id ? { ...r, attended: prev } : r)));
      alert('فشل تحديث الحضور: ' + (err?.message || ''));
      return false;
    }
  }, [reservations]);

  /**
   * التثبيتُ وإلغاؤه.
   * 🔴 لا يُغيّر `waitlist` ضمناً: تثبيتُ صفِّ انتظارٍ فعلٌ واعٍ يُطلب صراحةً.
   */
  const setConfirmed = useCallback(async (r: Reservation, confirmed: boolean) => {
    const next = confirmed ? 'confirmed' : 'pending';
    const prev = r.status;
    setReservations(p => p.map(x => (x.id === r.id ? { ...x, status: next } : x)));
    try {
      const res = await apiFetch(`/api/reservations/${r.id}`, {
        method: 'PUT', body: JSON.stringify({ status: next }),
      });
      // نتيجةُ المزامنة كانت تُعاد وتُهمَل، فيظنّ الموظّف أنّ حجزاً أُنشئ
      // بينما الرقمُ غير مربوطٍ بحساب (يُحتسب ضمن «لاعبون جدد»).
      if (res?.bookingSync === 'unlinked') {
        alert('ثُبّت الحجز ✅\n\nلكنّ الرقم غير مربوطٍ بحساب لاعب، فلا يظهر صفٌّ باسمه —\nيُحتسب ضمن «لاعبون جدد» في تفاصيل الفعاليّة.');
      } else if (res?.bookingSync === 'error') {
        alert('⚠️ ثُبّت الحجز لكنْ تعذّر إنشاء حجز الفعاليّة. راجع تفاصيل الفعاليّة.');
      }
      return true;
    } catch (err: any) {
      setReservations(p => p.map(x => (x.id === r.id ? { ...x, status: prev } : x)));
      alert('فشل تغيير الحالة: ' + (err?.message || ''));
      return false;
    }
  }, []);

  /**
   * 💬 تعليمُ «أُرسلت له رسالة» — تحديثٌ فوريٌّ ثمّ إرسال.
   *
   * 🔴 التعليمُ متفائل: يُكتب لحظةَ فتح واتساب لا بعد تأكيدٍ لاحق. السببُ أنّ
   *    الموظّف ينتقل إلى تطبيقٍ آخر فوراً، وقد لا يعود إلى هذه الصفحة أصلاً —
   *    فانتظارُ تأكيدٍ يعني ثقباً في السجلّ في أكثر الحالات شيوعاً. والتأكيدُ
   *    عند العودة وظيفتُه **النفي** لا الإثبات.
   *
   * 🔴 ولا يمرّ عبر PUT: ذاك يُشغّل مزامنةَ الحجوزات، وفتحُ محادثةٍ لا يُنشئ مقعداً.
   */
  const markWaSent = useCallback(async (id: number, sent: boolean) => {
    const prevAt = reservations.find(r => r.id === id)?.waSentAt ?? null;
    const prevBy = reservations.find(r => r.id === id)?.waSentBy ?? null;
    setReservations(p => p.map(r => (r.id === id
      ? { ...r, waSentAt: sent ? new Date().toISOString() : null, waSentBy: sent ? (r.waSentBy || '') : null }
      : r)));
    try {
      const res = await apiFetch(`/api/reservations/${id}/wa-sent`, {
        method: 'POST', body: JSON.stringify({ sent }),
      });
      setReservations(p => p.map(r => (r.id === id
        ? { ...r, waSentAt: res?.waSentAt ?? null, waSentBy: res?.waSentBy ?? null } : r)));
      return true;
    } catch {
      // الفشلُ يُرجع الحالةَ السابقة بلا نافذةِ تنبيه: الموظّفُ الآن داخل واتساب،
      // ونافذةٌ تنتظره عند العودة تعترض إيقاعَه من أجل حقلٍ ثانويّ.
      setReservations(p => p.map(r => (r.id === id ? { ...r, waSentAt: prevAt, waSentBy: prevBy } : r)));
      return false;
    }
  }, [reservations]);

  const updateRow = useCallback(async (id: number, patch: Record<string, any>) => {
    await apiFetch(`/api/reservations/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
    await fetchAll();
  }, [fetchAll]);

  const removeRow = useCallback(async (id: number) => {
    await apiFetch(`/api/reservations/${id}`, { method: 'DELETE' });
    await fetchAll();
  }, [fetchAll]);

  const createRow = useCallback(async (body: Record<string, any>) => {
    await apiFetch('/api/reservations', { method: 'POST', body: JSON.stringify(body) });
    await fetchAll();
  }, [fetchAll]);

  return {
    // بيانات
    reservations, activities, locations, loading,
    scoped, filtered, counts, pendingRows,
    activityOptions, activity, location, activityName,
    // مرشِّحات
    activityId, setActivityId, search, setSearch,
    status, setStatus, attend, setAttend, wa, setWa,
    // أفعال
    fetchAll, setAttendance, setConfirmed, markWaSent, updateRow, removeRow, createRow,
  };
}
