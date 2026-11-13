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
import { swalAlert } from '@/lib/swal';
import { getSocket } from '@/lib/socket';
import {
  isConfirmed, isPending, matchesSearch, attendOrder, countRows, needsWa,
  type ResCounts, genderSplit,
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
  /** ♂♀ جنس صاحب الحجز من حسابه — null لغير المربوط */
  playerGender?: string | null;
  status: string | null;
  appConfirmed: boolean | null;
  appConfirmedAt: string | null;
  attended: boolean | null;
  /** 🪑 كم مرافقاً انطوى بعد أن حجز كلٌّ منهم لنفسه (العدد الأصليّ = 1 + هذا) */
  companionsCollapsed?: number | null;
  companionsCollapsedAt?: string | null;
  notes: string | null;
  remindOptIn: boolean | null;
  /** آخرُ رسالةِ واتساب يدويّةٍ أرسلها موظّفٌ من حسابه — لا علاقة لها بالبوت */
  waSentAt: string | null;
  waSentBy: string | null;
  createdBy: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  // ── وقت الوصول والمتابعة (2026-11) — الخادم قد لا يرسلها بعد، فكلّها اختياريّة وتُعامَل null ──
  /** متى قال إنّه يصل (ISO) */
  etaAt?: string | null;
  /** من سجّل الوقت: موظّف أو الدون من ردّ العميل */
  etaSource?: 'staff' | 'bot' | null;
  /** كلمات العميل كما كتبها، أو ملاحظة الموظّف */
  etaNote?: string | null;
  followupSentAt?: string | null;
  followupStatus?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  declinedAt?: string | null;
  declinedVia?: string | null;
}

export interface Activity {
  id: number; name: string; date: string; status: string; locationId: number | null; gameSchedule?: any[];
  /** 🏙️ من `/api/activities` — تُلحق باسم الفعاليّة في القوائم حين تتوفّر */
  cityId?: number | null; cityName?: string | null; locationName?: string | null;
}
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
    // `status` على الخطأ: الصفحة تُخفي الميزة التي لم تصل الخادم بعد (404) بدل أن تتعطّل
    throw Object.assign(new Error(err.error || `API error ${res.status}`), { status: res.status });
  }
  return res.json();
}

export type AttendFilter = 'all' | 'attended' | 'noShow' | 'unmarked';
export type StatusFilter = 'all' | 'confirmed' | 'pending' | 'waitlist';
/** مرشِّحُ رسالةِ الواتساب اليدويّة — «مَن لم أراسله بعد» */
export type WaFilter = 'all' | 'needs';

/** `live`: اشتراك في حدث السوكيت `reservations:changed` — الاستطلاع كلّ ٣٠ث يبقى احتياطاً */
export function useReservations(opts?: { live?: boolean }) {
  const live = !!opts?.live;
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  /** معرّفاتُ الفعاليّات التي لها حجوزات — من الخادم لا من الصفوف المحمَّلة */
  const [withRes, setWithRes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const [activityId, setActivityId] = useState('');      // '' | 'all' | '<id>'
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [attend, setAttend] = useState<AttendFilter>('all');
  const [wa, setWa] = useState<WaFilter>('all');
  /** ♂♀ مرشِّح الجنس: الحجز الذي فيه شخصٌ من هذا الجنس */
  const [gender, setGender] = useState<'all' | 'male' | 'female' | 'unknown'>('all');

  const inflight = useRef(false);
  /** يزيد مع كلّ تغيير يبلّغ به الخادم — الصفحة تعيد به جلب ما يخصّها (سجلّ الدون) */
  const [liveTick, setLiveTick] = useState(0);

  const fetchAll = useCallback(async (scope?: string) => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const id = scope ?? activityId;
      // نطاقُ الجلب يتبع الاختيار — لا تُسحب القاعدةُ كلُّها بلا سبب
      const q = id && id !== 'all' ? `?activityId=${encodeURIComponent(id)}` : '';
      const [res, acts, locs, summary] = await Promise.all([
        apiFetch(`/api/reservations${q}`),
        apiFetch('/api/activities'),
        apiFetch('/api/locations').catch(() => []),
        apiFetch('/api/reservations/activity-summary').catch(() => []),
      ]);
      setReservations(Array.isArray(res) ? res : []);
      setActivities(Array.isArray(acts) ? acts : []);
      setLocations(Array.isArray(locs) ? locs : []);
      if (Array.isArray(summary)) {
        setWithRes(new Set(summary.map((x: any) => Number(x.activityId)).filter(Boolean)));
      }
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

  // ── تحديث لحظيّ: الخادم يبلّغ بتغيّر حجوزات فعاليّة ⟵ جلب فوريّ إن كانت هي المعروضة ──
  useEffect(() => {
    if (!live || !activityId) return;
    let s: ReturnType<typeof getSocket>;
    try { s = getSocket(); } catch { return; }
    const onChanged = (p: any) => {
      const id = Number(p?.activityId);
      if (activityId !== 'all' && Number.isFinite(id) && id > 0 && id !== Number(activityId)) return;
      if (document.visibilityState !== 'visible') return;   // العودة للصفحة تجلب وحدها
      fetchAll();
      setLiveTick(t => t + 1);
    };
    s.on('reservations:changed', onChanged);
    return () => { s.off('reservations:changed', onChanged); };
  }, [live, activityId, fetchAll]);

  // ── الفعاليّات المعروضة في القائمة ──
  // 🔴 `withRes` من الخادم لا من `reservations`: الصفوفُ المحمَّلة صارت صفوفَ
  //    الفعاليّة المختارة وحدها، فاستنتاجُها منها يُخفي كلَّ فعاليّةٍ منتهيةٍ سواها.
  const activityOptions = useMemo(() =>
    activities.filter(a =>
      a.status === 'planned' || a.status === 'active' ||
      (a.status === 'completed' && withRes.has(a.id))),
  [activities, withRes]);

  // ══ 🎯 الاختيارُ الافتراضيّ ══
  // فعاليّةُ **اليوم** أوّلاً أيّاً كانت حالتُها، ثمّ أقربُ قادمة.
  //
  // 🔴 اشتراطُ `planned|active` كان يُسقط فعاليّةَ الليلة نفسِها: الحالةُ تصير
  //    `completed` عند موعد البدء، فتقفز الصفحةُ إلى فعاليّةِ الأسبوع القادم
  //    بينما الموظّفُ واقفٌ على الباب يستقبل حجوزاتِ الليلة.
  //
  // 🔴 والمقارنةُ مع **بداية اليوم** لا اللحظة: فعاليّةُ السابعة مساءً تبقى
  //    فعاليّةَ اليوم لمن يفتح الصفحة في التاسعة وسط الليلة نفسها.
  //
  // ومرّةً واحدة: الاستطلاعُ يتكرّر، ولولا الحارس لألغى اختيار الموظّف كلّ نصف دقيقة.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current) return;
    if (activityId !== '') { autoPicked.current = true; return; }
    if (!activityOptions.length) return;

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 86_400_000;
    const dated = activityOptions.filter(a => a.date);
    const at = (a: Activity) => new Date(a.date).getTime();

    const today = dated
      .filter(a => at(a) >= start.getTime() && at(a) < end)
      .sort((x, y) => at(x) - at(y))[0];
    const upcoming = dated
      .filter(a => at(a) >= end)
      .sort((x, y) => at(x) - at(y))[0];
    // رابط من لوحة التحكّم أو الأنشطة: ?activityId= يسبق الاختيار التلقائيّ
    let asked: Activity | undefined;
    try { const q = new URLSearchParams(window.location.search).get('activityId'); if (q) asked = activityOptions.find(x => String(x.id) === q); } catch { /* بلا رابط */ }
    const pick = asked || today || upcoming;
    if (!pick) return;

    autoPicked.current = true;
    setActivityId(String(pick.id));
  }, [activityOptions, activityId]);

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
      if (gender !== 'all' && genderSplit(r)[gender] === 0) return false;
      return matchesSearch(r, search);
    })
    .sort((a, b) => attendOrder(a) - attendOrder(b)),
  [scoped, status, attend, wa, gender, search]);

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
      swalAlert('فشل تحديث الحضور: ' + (err?.message || ''), 'error');
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
        swalAlert('ثُبّت الحجز.\n\nلكنّ الرقم غير مربوطٍ بحساب لاعب، فلا يظهر صفٌّ باسمه —\nيُحتسب ضمن «لاعبون جدد» في تفاصيل الفعاليّة.', 'info');
      } else if (res?.bookingSync === 'error') {
        swalAlert('ثُبّت الحجز لكنْ تعذّر إنشاء حجز الفعاليّة. راجع تفاصيل الفعاليّة.', 'warning');
      }
      return true;
    } catch (err: any) {
      setReservations(p => p.map(x => (x.id === r.id ? { ...x, status: prev } : x)));
      swalAlert('فشل تغيير الحالة: ' + (err?.message || ''), 'error');
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

  /**
   * ⏱ وقت الوصول — يضبطه الموظّف بضغطة (أو يمسحه بـ null). تحديث فوريّ ثمّ إرسال، والفشل يُرجع السابق.
   * لا علاقة له بـ«وصل»: الوصول يقرّره الباب والغرفة والموظّف فقط.
   */
  const setEta = useCallback(async (id: number, etaAt: string | null, etaNote?: string | null) => {
    const prev = reservations.find(r => r.id === id);
    setReservations(p => p.map(r => (r.id === id
      ? { ...r, etaAt, etaSource: etaAt ? 'staff' : null, ...(etaNote !== undefined ? { etaNote } : etaAt ? {} : { etaNote: null }) }
      : r)));
    try {
      await apiFetch(`/api/reservations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(etaNote !== undefined ? { etaAt, etaNote } : { etaAt }),
      });
      fetchAll();
      return true;
    } catch (err: any) {
      setReservations(p => p.map(r => (r.id === id
        ? { ...r, etaAt: prev?.etaAt ?? null, etaSource: prev?.etaSource ?? null, etaNote: prev?.etaNote ?? null }
        : r)));
      swalAlert('تعذّر حفظ وقت الوصول: ' + (err?.message || ''), 'error');
      return false;
    }
  }, [reservations, fetchAll]);

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
    status, setStatus, attend, setAttend, wa, setWa, gender, setGender,
    // أفعال
    fetchAll, setAttendance, setConfirmed, markWaSent, setEta, updateRow, removeRow, createRow,
    liveTick,
  };
}
