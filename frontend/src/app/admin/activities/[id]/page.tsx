'use client';

// ══════════════════════════════════════════════════════
// تفاصيل النشاط — الخيار أ «حسب الوقت»: قبل · الليلة · بعد
// الصفحة تفتح على المرحلة التي يعيشها النشاط الآن، وكلّ قسم آخر على بُعد نقرة
// من قائمة «كلّ ما يخصّ هذا النشاط».
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight, Armchair, Banknote, CalendarClock, CalendarX, Check, ChevronLeft, DoorOpen, FolderOpen, Gift, LayoutList,
  ListChecks, Lock, LockOpen, MapPin, Pencil, Receipt, RefreshCw, Ticket, UserX, Users, Wallet,
} from 'lucide-react';
import DriveFolderBrowser from '../../components/DriveFolderBrowser';
import EditActivityForm from '../../components/EditActivityForm';
import BookingBonusSection from '../../components/BookingBonusSection';
import AbsenceSection from '../../components/AbsenceSection';
import OfferGroupsSection from '../../components/OfferGroupsSection';
import NoShowSection from '../../components/NoShowSection';
import CancelNoticeSection from '../../components/CancelNoticeSection';
import ScheduleEditor from '../../components/ScheduleEditor';
import { confirmActivityCancel, toastCancelStarted } from '@/lib/cancel-notice';
import { isWaitlist } from '@/lib/reservation-status';
import { swalToast } from '@/lib/swal';
import { Badge, Banner, Card, Empty, HBar, Meter, Pop, Skel, Tile } from '../../whatsapp/wa-ui';
import { Acc, Show, STATUS_META, CURRENCY, ammanMinutes, apiFetch, fmtDay, fmtDayShort, fmtTime, getUser, num } from '../components/acts-shared';
import RoomsSection from './RoomsSection';
import SeatAssignmentSection from './SeatAssignmentSection';
import BookingsPanel from './BookingsPanel';
import { SeatingConstraintsPanel, TicketsSection } from './SeatingAndTickets';
import '../../whatsapp/wa.css';
import '../acts.css';

type Phase = 'before' | 'tonight' | 'after';
const PHASES: ReadonlyArray<{ key: Phase; short: string; long: string }> = [
  { key: 'before', short: 'قبل', long: 'التحضير' },
  { key: 'tonight', short: 'الليلة', long: 'التشغيل' },
  { key: 'after', short: 'بعد', long: 'الإغلاق' },
];
const DIFFICULTY: Record<string, string> = { easy: 'سهل', medium: 'متوسّط', hard: 'صعب', expert: 'خبير' };

/** المرحلة من الوقت والحالة: قبل الموعد بأكثر من ساعتين «قبل»، ثمّ «الليلة» حتّى ينتهي النشاط، ثمّ «بعد» */
function derivePhase(activity: any): Phase {
  if (!activity || activity.status === 'cancelled') return 'before';
  if (activity.status === 'completed') return 'after';
  const start = new Date(activity.date);
  if (isNaN(start.getTime())) return 'before';
  const now = Date.now();
  if (now < start.getTime() - 2 * 3600_000) return 'before';
  // نفس قاعدة التحديث التلقائيّ للحالة: ينتهي النشاط عند منتصف الليل التالي لموعده
  const nextDay = new Date(start);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);
  return now >= nextDay.getTime() ? 'after' : 'tonight';
}

const toMin = (hhmm: string) => { const [h, m] = String(hhmm || '').split(':'); return (Number(h) || 0) * 60 + (Number(m) || 0); };
/** وقت 24 ساعة «HH:MM» ← «7:30 م» */
const hhmm12 = (s: string) => {
  const t = toMin(s); const h = Math.floor(t / 60) % 24; const m = t % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
};

export default function ActivityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = Number(params.id);
  const user = useMemo(() => getUser(), []);
  const isAccountant = user.role === 'accountant';
  const isAdmin = user.role === 'admin';

  const [activity, setActivity] = useState<any>(null);
  const [cancelTick, setCancelTick] = useState(0);   // 📣 يعيد تحميل تقرير الإلغاء بعد الإلغاء من هنا
  const [bookings, setBookings] = useState<any[]>([]);
  // 👥 مجموعات القائمة: لاعبون جدد (بلا حساب) + مرافقو اللاعبين — تُشتقّ من المتابعة
  const [rosterGroups, setRosterGroups] = useState<{ newcomers: any; companions: any } | null>(null);
  const [bookedCount, setBookedCount] = useState<{ total: number; booked: number; newcomers: number; companions: number } | null>(null);
  const [playerGames, setPlayerGames] = useState<any[]>([]); // عدد الألعاب لكل لاعب في هذا النشاط
  const [costs, setCosts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [resRows, setResRows] = useState<any[] | null>(null);   // صفوف المتابعة — لملخّص الحضور
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // المرحلة: لا تُحفظ بين الزيارات — كلّ فتح يبدأ من مرحلة الوقت
  const [phaseSel, setPhaseSel] = useState<Phase | null>(null);
  const [openSecs, setOpenSecs] = useState<Set<string> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [act, bks, csts, locs, stf, pg, groups, booked] = await Promise.all([
          apiFetch(`/api/activities/${activityId}`),
          apiFetch(`/api/bookings?activityId=${activityId}`),
          apiFetch(`/api/costs?activityId=${activityId}`),
          apiFetch('/api/locations'),
          apiFetch('/api/staff/names').catch(() => []),   // أسماء العرض وحدها — متاحة لكل موظّف
          apiFetch(`/api/activities/${activityId}/games-per-player`).catch(() => ({ players: [] })),
          apiFetch(`/api/reservations/roster-groups/${activityId}`).catch(() => null),
          apiFetch(`/api/activities/${activityId}/booked-count`).catch(() => null),
        ]);
        setActivity(act);
        setBookings(bks);
        setCosts(csts);
        setLocations(locs);
        setStaffList(stf);
        setPlayerGames(pg?.players || []);
        if (groups?.success) setRosterGroups({ newcomers: groups.newcomers, companions: groups.companions });
        if (booked?.success) setBookedCount(booked);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId]);

  const derived = useMemo(() => derivePhase(activity), [activity]);
  const phase: Phase = phaseSel ?? derived;
  const open = useMemo(() => openSecs ?? new Set<string>(derived === 'tonight' ? [] : ['bookings']), [openSecs, derived]);

  // ملخّص الحضور من المتابعة — يُجلب عند دخول «الليلة» ويتجدّد كلّ نصف دقيقة ما دامت ظاهرة
  const loadAttendance = useCallback(() => {
    apiFetch(`/api/reservations?activityId=${activityId}`)
      .then(r => setResRows(Array.isArray(r) ? r : []))
      .catch(() => setResRows(prev => prev ?? []));
  }, [activityId]);
  useEffect(() => {
    if (!activity || phase !== 'tonight') return;
    loadAttendance();
    // البرنامج قد يكون عُدّل للتوّ في «قبل» — تُحدَّث نسخة القراءة
    apiFetch(`/api/activities/${activityId}`)
      .then(a => setActivity((prev: any) => (prev ? { ...prev, gameSchedule: a?.gameSchedule ?? prev.gameSchedule } : prev)))
      .catch(() => {});
    const t = setInterval(loadAttendance, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, !!activity, activityId, loadAttendance]);

  // خرائط عدد الألعاب لكل لاعب في هذا النشاط — بالحساب (playerId) وبالهاتف (بديل)
  const gamesMaps = useMemo(() => {
    const byId: Record<number, number> = {};
    const byPhone: Record<string, number> = {};
    for (const r of playerGames) {
      if (r?.playerId != null) byId[r.playerId] = r.games;
      const ph = String(r?.phone || '').replace(/[^0-9]/g, '');
      if (ph.length >= 9) byPhone[ph] = r.games;
    }
    return { byId, byPhone };
  }, [playerGames]);

  const attendance = useMemo(() => {
    const a = { arrived: 0, onWay: 0, declined: 0, silent: 0 };
    for (const r of resRows || []) {
      if (r.deletedAt || isWaitlist(r)) continue;
      const n = Number(r.peopleCount) || 1;
      // الحقول etaAt/declinedAt قد لا يرسلها الخادم بعد — تُعامَل كأنّها فارغة
      if (r.attended === true) a.arrived += n;
      else if (r.declinedAt ?? null) a.declined += n;
      else if (r.etaAt ?? null) a.onWay += n;
      else a.silent += n;
    }
    return a;
  }, [resRows]);

  if (loading) {
    return (
      <div className="wa acts-page" dir="rtl" style={{ background: 'transparent' }} aria-busy="true">
        <Skel h={36} w="50%" /><Skel h={44} /><Skel h={220} /><Skel h={160} />
      </div>
    );
  }
  if (!activity) {
    return (
      <div className="wa acts-page" dir="rtl" style={{ background: 'transparent' }}>
        <div className="wa-card">
          <Empty icon={<CalendarX />} title="النشاط غير موجود">ربّما حُذف أو أنّ الرابط غير صحيح.</Empty>
          <Link href="/admin/activities" className="wa-btn block">العودة إلى الأنشطة</Link>
        </div>
      </div>
    );
  }

  const actBookings = bookings;
  const actCosts = costs;

  // عدد الألعاب التي لعبها صاحب الحجز في هذا النشاط (عبر كل الغرف) — مطابقة بالحساب ثم بالهاتف
  const gamesForBooking = (b: any): number => {
    if (b?.playerId != null && gamesMaps.byId[b.playerId] != null) return gamesMaps.byId[b.playerId];
    const ph = String(b?.phone || '').replace(/[^0-9]/g, '');
    if (ph.length >= 9 && gamesMaps.byPhone[ph] != null) return gamesMaps.byPhone[ph];
    return 0;
  };
  const location = locations.find(l => l.id === activity.locationId) || null;
  const capacity = activity.maxCapacity || 20;

  const revenue = actBookings.reduce((s: number, b: any) => s + (b.isPaid ? Number(b.paidAmount || 0) : 0), 0);
  const expense = actCosts.reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const profit = revenue - expense;
  // 🔢 الحضور = صفوف الحجز + المجمَّعون (لاعبون جدد + مرافقون) — نفس صيغة المقاعد في seatAvailability.
  const groupedExtra = (rosterGroups?.newcomers?.count ?? 0) + (rosterGroups?.companions?.count ?? 0);
  // 👥 العدد الحقيقيّ من المصدر الموحّد (حجوزات + متابعة بلا قائمة الانتظار).
  // 🔴 الحساب المحليّ احتياطٌ فقط: كان يجمع الحجوزات مع مجموعات المتابعة **المثبَّتة وحدها**،
  //    فيسقط كلُّ حجزٍ غير مثبَّت. وعلى هذا الرقم يُقال للزبون «فيه مجال» أو «امتلأنا».
  const totalAttendees = bookedCount?.total
    ?? (actBookings.reduce((s: number, b: any) => s + (b.count || 1), 0) + groupedExtra);
  const paidAttendees = actBookings.filter((b: any) => b.isPaid && !b.isFree).reduce((s: number, b: any) => s + (b.count || 1), 0);
  const freeAttendees = actBookings.filter((b: any) => b.isFree).reduce((s: number, b: any) => s + (b.count || 1), 0);
  const unpaidAttendees = actBookings.filter((b: any) => !b.isPaid && !b.isFree).reduce((s: number, b: any) => s + (b.count || 1), 0);
  // 💸 المتوقّع بسعر كلّ حجز (المقفول بسعر الدون المبكّر وإلّا سعر الفعاليّة)
  const unpaidExpected = actBookings.filter((b: any) => !b.isPaid && !b.isFree)
    .reduce((s: number, b: any) => s + Number(b.unitPrice ?? activity?.basePrice ?? 0) * (b.count || 1), 0);
  const seatsLeft = Math.max(0, capacity - totalAttendees);
  const pctOfCap = (n: number) => Math.min(100, (n / capacity) * 100);

  const status = STATUS_META[activity.status] || STATUS_META.planned;
  const schedule: any[] = Array.isArray(activity.gameSchedule) ? activity.gameSchedule : [];
  const nowMin = ammanMinutes();
  const isNow = (s: any) => {
    if (derived !== 'tonight') return false;
    const a = toMin(s.start); let b = toMin(s.end); if (b <= a) b += 1440;
    return (nowMin >= a && nowMin < b) || (nowMin + 1440 >= a && nowMin + 1440 < b);
  };
  const notArrived = attendance.onWay + attendance.silent;

  async function toggleLock() {
    try {
      await apiFetch(`/api/activities/${activity.id}`, { method: 'PUT', body: JSON.stringify({ isLocked: !activity.isLocked }) });
      setActivity({ ...activity, isLocked: !activity.isLocked });
    } catch (err: any) {
      swalToast('تعذّر تغيير القفل: ' + (err.message || ''), 'error');
    }
  }

  async function handleEditActivity(id: number, data: any) {
    // 📣 التحويل إلى «ملغاة» يراسل الحاجزين آليّاً — معاينةٌ وتأكيدٌ قبل الحفظ
    const cancelling = data?.status === 'cancelled' && activity?.status !== 'cancelled';
    if (cancelling && !(await confirmActivityCancel(id, (p) => apiFetch(p)))) return;
    const updated = await apiFetch(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setActivity(updated);
    setShowEditForm(false);
    if (cancelling) { toastCancelStarted(updated); setTimeout(() => setCancelTick(t => t + 1), 1500); }
  }

  const refreshBookings = () => { apiFetch(`/api/bookings?activityId=${activity.id}`).then(setBookings).catch(() => {}); };

  // ── التنقّل بين المراحل والأقسام ──
  function goPhase(p: Phase) {
    setPhaseSel(p);
    setOpenSecs(() => { const n = new Set(open); if (p === 'tonight') n.delete('bookings'); else n.add('bookings'); return n; });
  }
  const toggleSec = (id: string) => setOpenSecs(() => { const n = new Set(open); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  function jump(id: string, p?: Phase) {
    setShowMenu(false);
    const target = p ?? phase;
    setPhaseSel(target);
    setOpenSecs(() => {
      const n = new Set(open);
      if (p && p !== phase) { if (p === 'tonight') n.delete('bookings'); else n.add('bookings'); }
      n.add(id);
      return n;
    });
    setTimeout(() => {
      const el = document.getElementById(`sec-${id}`);
      if (!el) return;
      if (el.classList.contains('acts-legacy') && el.childElementCount === 0) { swalToast('لا شيء في هذا القسم لهذا النشاط', 'info'); return; }
      el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }, 120);
  }

  // ── «كلّ ما يخصّ هذا النشاط» — كلّ الأقسام، مجموعةً حسب المرحلة ──
  type Item = { id: string; label: string; phase?: Phase; end?: ReactNode; show?: boolean };
  const groups: Array<{ title: string; items: Item[] }> = [
    {
      title: 'دائماً', items: [
        { id: 'bookings', label: 'قائمة الحجوزات والدفع', end: unpaidAttendees > 0 ? <span className="acts-warn"><span className="ltr">{unpaidAttendees}</span> لم يدفعوا</span> : <span className="ltr">{actBookings.length}</span> },
      ],
    },
    {
      title: 'قبل · التحضير', items: [
        { id: 'cancel', label: 'إشعار الإلغاء', phase: 'before', show: activity.status === 'cancelled' },
        { id: 'seating', label: 'الجلوس الذكيّ', phase: 'before' },
        { id: 'seats', label: 'توزيع المقاعد', phase: 'before', show: !!activity.seatTemplateId },
        { id: 'tickets', label: 'التذاكر المستخدمة', phase: 'before', show: !!activity.requireTicket },
        { id: 'bonus', label: 'مكافأة الحجز المبكّر', phase: 'before' },
        { id: 'offers', label: 'مجموعات العروض', phase: 'before' },
        { id: 'venue', label: 'المكان والخريطة', phase: 'before', end: location?.name },
        { id: 'schedule', label: 'تعديل برنامج الليلة', phase: 'before', end: schedule.length ? <span className="ltr">{schedule.length}</span> : undefined },
      ],
    },
    {
      title: 'الليلة · التشغيل', items: [
        { id: 'rooms', label: 'غرف اللعبة', phase: 'tonight' },
        { id: 'attendance', label: 'الحضور', phase: 'tonight' },
        { id: 'tonight-schedule', label: 'برنامج الليلة', phase: 'tonight' },
        { id: 'money', label: 'مال الليلة حتّى الآن', phase: 'tonight' },
      ],
    },
    {
      title: 'بعد · الإغلاق', items: [
        { id: 'finance', label: 'الملخّص الماليّ', phase: 'after', end: <span className={`ltr ${profit >= 0 ? 'acts-pos' : 'acts-neg'}`}>{num(profit)}</span> },
        { id: 'noshow', label: 'الغياب', phase: 'after' },
        { id: 'absence', label: 'إعفاء من عقوبة الغياب', phase: 'after' },
        { id: 'costs', label: 'التكاليف', phase: 'after', end: <span className="ltr">{num(expense)}</span> },
        { id: 'bonus', label: 'سجلّ مكافآت الحجز', phase: 'after' },
        { id: 'drive', label: 'الصور والملفّات', phase: 'after' },
      ],
    },
  ];
  const menuBody = groups.map(g => (
    <div key={g.title}>
      <div className="grp">{g.title}</div>
      <div className="wa-menu">
        {g.items.filter(it => it.show !== false).map(it => (
          <button key={`${it.phase ?? 'x'}-${it.id}`} type="button" onClick={() => jump(it.id, it.phase)}>
            <span className="grow trunc">{it.label}</span>
            <span className="end">{it.end}<ChevronLeft /></span>
          </button>
        ))}
      </div>
    </div>
  ));

  const menuCard = (
    <section className="wa-card acts-menucard wa-only-desk">
      <h3><LayoutList />كلّ ما يخصّ هذا النشاط</h3>
      {menuBody}
    </section>
  );

  return (
    <div className="wa acts-page" dir="rtl" style={{ background: 'transparent' }}>

      {/* ══ Header ══ */}
      <div className="acts-head">
        <button type="button" className="wa-iconbtn" aria-label="رجوع للأنشطة" onClick={() => router.push('/admin/activities')}><ArrowRight className="l" /></button>
        <div className="grow">
          <h1>{activity.name}</h1>
          <div className="acts-meta">
            <span><CalendarClock className="s" />{fmtDay(activity.date)} · <span className="ltr">{fmtTime(activity.date)}</span></span>
            {location && <span><MapPin className="s" />{location.name}</span>}
            <span><span className="ltr">{num(activity.basePrice)}</span> {CURRENCY} للشخص</span>
            <span><span className="ltr">{capacity}</span> مقعداً</span>
            <span>{DIFFICULTY[activity.difficulty as string] || DIFFICULTY.medium}</span>
          </div>
        </div>
        <div className="acts-acts">
          <Badge tone={status.tone}>{activity.status === 'active' && <i className="wa-dot ok" />}{status.label}</Badge>
          {activity.isLocked && <Badge tone="danger"><Lock />مقفول إداريّاً</Badge>}
          {!isAccountant && (
            <button type="button" className="wa-btn" onClick={() => setShowEditForm(true)}><Pencil />تعديل</button>
          )}
          {isAdmin && (
            <button type="button" className={`wa-btn${activity.isLocked ? ' danger' : ''}`} onClick={toggleLock}>
              {activity.isLocked ? <><LockOpen />فكّ القفل</> : <><Lock />قفل</>}
            </button>
          )}
        </div>
      </div>
      {activity.description && <p className="muted" style={{ margin: 0 }}>{activity.description}</p>}
      {activity.isLocked && (
        <Banner tone="danger" icon={<Lock />}>
          <b>هذا النشاط مقفول.</b> يُمنع أيّ تعديل ماليّ أو إداريّ. المدير العامّ وحده يغيّر حالة القفل.
        </Banner>
      )}

      {/* ══ المراحل ══ */}
      <div className="wa-steps acts-steps" role="tablist" aria-label="مرحلة النشاط">
        {PHASES.map((p, i) => {
          const done = PHASES.findIndex(x => x.key === derived) > i && phase !== p.key;
          return (
            <button key={p.key} type="button" role="tab" aria-selected={phase === p.key} aria-current={phase === p.key ? 'step' : undefined} className={done ? 'done' : undefined} onClick={() => goPhase(p.key)}>
              <span className="i">{done ? <Check className="s" /> : i + 1}</span>
              {p.short}<span className="acts-long"> · {p.long}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="wa-btn wa-only-phone" onClick={() => setShowMenu(true)}><LayoutList />كلّ ما يخصّ هذا النشاط</button>

      {/* ══ المحتوى الأساسيّ للمرحلة + العمود الجانبيّ ══ */}
      <div className="acts-cols">
        <div className="stack">
          {/* ── قبل ── */}
          <Show when={phase === 'before'}>
            {activity.status === 'cancelled' && (
              <div id="sec-cancel" className="acts-sec acts-legacy"><CancelNoticeSection key={cancelTick} activityId={activity.id} /></div>
            )}
            <Card title={<><Users />الحجز حتّى الآن</>} aside={<><span className="ltr">{actBookings.length}</span> حجز · <span className="ltr">{seatsLeft}</span> مقعد متبقٍّ</>}>
              <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
                <Meter pct={pctOfCap(totalAttendees)} tone={totalAttendees >= capacity ? undefined : 'gold'} style={{ flex: 1, height: 8 }} />
                <b className="ltr">{totalAttendees}/{capacity}</b>
              </div>
              <div className="wa-grid3">
                <Tile k="مدفوع" v={num(paidAttendees)} tone="ok" />
                <Tile k="غير مدفوع" v={num(unpaidAttendees)} tone={unpaidAttendees > 0 ? 'gold' : undefined} />
                <Tile k="مجّانيّ" v={num(freeAttendees)} />
              </div>
              <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                <Link href={`/admin/reservations?activityId=${activity.id}`} className="wa-btn primary"><ListChecks />افتح المتابعة</Link>
                <button type="button" className="wa-btn" onClick={() => jump('bookings')}>قائمة الحجوزات</button>
              </div>
            </Card>
          </Show>

          {/* ── الليلة ── */}
          <Show when={phase === 'tonight'}>
            <div id="sec-rooms" className="acts-sec"><RoomsSection activityId={activity.id} /></div>

            <section id="sec-attendance" className="wa-card acts-sec">
              <h3><Users />الحضور
                <small><button type="button" className="wa-iconbtn" aria-label="تحديث الحضور" onClick={loadAttendance}><RefreshCw /></button></small>
              </h3>
              {resRows == null ? <Skel h={76} /> : (
                <div className="wa-kpis">
                  <Tile k="وصلوا" v={num(attendance.arrived)} tone="ok" />
                  <Tile k="في الطريق" v={num(attendance.onWay)} tone="gold" />
                  <Tile k="لم يردّوا" v={num(attendance.silent)} tone={attendance.silent > 0 ? 'danger' : undefined} />
                  <Tile k="مقاعد متاحة" v={num(seatsLeft)} h={attendance.declined > 0 ? <>اعتذر <span className="ltr">{attendance.declined}</span></> : undefined} />
                </div>
              )}
              <div className="row" style={{ marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                <Link href={`/admin/reservations?activityId=${activity.id}`} className="wa-btn primary">
                  <ListChecks />تابع من لم يصل{notArrived > 0 && <> (<span className="ltr">{notArrived}</span>)</>}
                </Link>
                <Link href={`/admin/reservations/door?activityId=${activity.id}`} className="wa-btn"><DoorOpen />الباب</Link>
                {activity.seatTemplateId && (
                  <button type="button" className="wa-btn ghost" onClick={() => jump('seats', 'before')}><Armchair />خريطة المقاعد</button>
                )}
              </div>
            </section>

            <section id="sec-tonight-schedule" className="wa-card acts-sec">
              <h3><CalendarClock />برنامج الليلة
                <small><button type="button" className="wa-btn sm" onClick={() => jump('schedule', 'before')}><Pencil />عدّل</button></small>
              </h3>
              {schedule.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>لا برنامج لهذه الليلة بعد.</p>
              ) : schedule.map((s, i) => (
                <div key={i} className={`acts-kv${isNow(s) ? ' now' : ''}`} aria-current={isNow(s) ? 'time' : undefined}>
                  <span><span className="ltr">{hhmm12(s.start)}</span>{isNow(s) && ' · الآن'}</span>
                  <b>{s.label}</b>
                </div>
              ))}
            </section>
          </Show>

          {/* ── بعد ── */}
          <Show when={phase === 'after'}>
            <section id="sec-finance" className="wa-card acts-sec">
              <h3><Wallet />الملخّص الماليّ</h3>
              <div className="wa-grid3">
                <Tile k={`صافي الربح (${CURRENCY})`} v={num(profit)} tone={profit >= 0 ? 'ok' : 'danger'} />
                <Tile k="الإيرادات" v={`+${num(revenue)}`} />
                <Tile k="التكاليف" v={`-${num(expense)}`} />
              </div>
              <h3 style={{ margin: 'var(--space-4) 0 var(--space-2)' }}><Users />توزيع الحضور
                <small><span className="ltr">{totalAttendees}/{capacity}</span> · <span className="ltr">{actBookings.length}</span> حجز · <span className="ltr">{seatsLeft}</span> مقعد متبقٍّ</small>
              </h3>
              <HBar label="مدفوع" pct={pctOfCap(paidAttendees)} value={paidAttendees} />
              <HBar label="مجّانيّ" pct={pctOfCap(freeAttendees)} value={freeAttendees} tone="info" />
              <HBar label="غير مدفوع" pct={pctOfCap(unpaidAttendees)} value={unpaidAttendees} tone="warn" />
              <HBar label="متبقٍّ" pct={pctOfCap(seatsLeft)} value={seatsLeft} tone="gold" />
            </section>
          </Show>
        </div>

        <div className="stack">
          <Show when={phase === 'tonight'}>
            <section id="sec-money" className="wa-card acts-sec">
              <h3><Banknote />مال الليلة حتّى الآن</h3>
              <div className="acts-kv"><span>دخوليّة محصَّلة</span><b className="ltr">{num(revenue)}</b></div>
              <div className="acts-kv"><span>دخوليّة غير محصَّلة (<span className="ltr">{unpaidAttendees}</span>)</span><b className={`ltr${unpaidExpected > 0 ? ' acts-warn' : ''}`}>{num(Math.round(unpaidExpected * 100) / 100)}</b></div>
              <div className="acts-kv"><span>التكاليف المسجَّلة</span><b className="ltr">{num(expense)}</b></div>
              <div className="acts-kv total"><span>الصافي ({CURRENCY})</span><b className={`ltr ${profit >= 0 ? 'acts-pos' : 'acts-neg'}`}>{num(profit)}</b></div>
            </section>
          </Show>
          {menuCard}
        </div>
      </div>

      {/* ══ باقي الأقسام — كلٌّ يُفتح بنقرة ══ */}
      <div className="acts-more">
        <Acc
          id="bookings" icon={<Users />} open={open.has('bookings')} onToggle={() => toggleSec('bookings')}
          title={phase === 'after' ? 'الحجوزات والتحصيل' : 'قائمة الحجوزات والدفع'}
          end={<>{unpaidAttendees > 0 && <span className="acts-warn">{unpaidAttendees} لم يدفعوا ·</span>}{actBookings.length} حجز</>}
        >
          <BookingsPanel
            activityId={activity.id} activity={activity} bookings={actBookings} setBookings={setBookings}
            staffList={staffList} rosterGroups={rosterGroups} gamesForBooking={gamesForBooking}
            isAdmin={isAdmin} isAccountant={isAccountant} unpaidFirst={phase === 'after'}
            totalAttendees={totalAttendees} revenue={revenue} unpaidAttendees={unpaidAttendees} unpaidExpected={unpaidExpected}
          />
        </Acc>

        {/* ── قبل ── */}
        <Show when={phase === 'before'}>
          <Acc id="seating" icon={<Armchair />} title="الجلوس الذكيّ" open={open.has('seating')} onToggle={() => toggleSec('seating')}>
            <SeatingConstraintsPanel activityId={activity.id} />
          </Acc>
          {activity.seatTemplateId && (
            <Acc id="seats" icon={<Armchair />} title="توزيع مقاعد النشاط" open={open.has('seats')} onToggle={() => toggleSec('seats')}>
              <SeatAssignmentSection
                activityId={activity.id}
                seatTemplateId={activity.seatTemplateId}
                bookings={bookings}
                initialAssignments={activity.seatAssignments || []}
              />
            </Acc>
          )}
          {activity.requireTicket && (
            <Acc id="tickets" icon={<Ticket />} title="التذاكر المستخدمة في هذا النشاط" open={open.has('tickets')} onToggle={() => toggleSec('tickets')}>
              <TicketsSection activityId={activity.id} />
            </Acc>
          )}
          {/* مجموعات عروض الحجز — الحسمُ عند الباب على الحضور الفعليّ (تختفي حين لا مجموعات) */}
          <div id="sec-offers" className="acts-sec acts-legacy">
            <OfferGroupsSection activityId={activity.id} onChanged={refreshBookings} />
          </div>
          <Acc id="venue" icon={<MapPin />} title="المكان والخريطة" end={location?.name} open={open.has('venue')} onToggle={() => toggleSec('venue')}>
            <div className="wa-card">
              {location ? (
                <div className="stack">
                  <div className="row">
                    <b className="grow">{location.name}</b>
                    {location.mapUrl && <a className="wa-btn" href={location.mapUrl} target="_blank" rel="noreferrer"><MapPin />الخريطة</a>}
                  </div>
                  {location.offers && (location.offers as any[]).length > 0 && (
                    <div>
                      <div className="muted" style={{ font: '700 12px/16px var(--font-sans)' }}><Gift className="s" /> عروض المكان</div>
                      <div className="wa-list">
                        {(location.offers as any[]).map((offer: any, i: number) => (
                          <div key={i}>
                            <span className="t">{typeof offer === 'string' ? offer : offer.description || offer.name}</span>
                            {typeof offer !== 'string' && offer.price && <Badge tone="gold"><span className="ltr">{offer.price}</span> {CURRENCY}</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Empty icon={<MapPin />} title="لم يُحدَّد مكان لهذا النشاط" />
              )}
            </div>
          </Acc>
          {/* برنامج الليلة — يُطبع في كشف الحضور */}
          <div id="sec-schedule" className="acts-sec acts-legacy">
            <ScheduleEditor activityId={activity.id} activityDate={activity.date} initial={activity.gameSchedule || []} />
          </div>
        </Show>

        {/* ── بعد ── */}
        <Show when={phase === 'after'}>
          {/* الغياب — يثبت فور نهاية الفعاليّة، و«حضر» يصحّحه */}
          <Acc id="noshow" icon={<UserX />} title="الغياب" open={open.has('noshow')} onToggle={() => toggleSec('noshow')}>
            <div className="acts-legacy acts-maybe"><NoShowSection activityId={activity.id} onChanged={refreshBookings} /></div>
          </Acc>
          <div id="sec-absence" className="acts-sec acts-legacy"><AbsenceSection activityId={activity.id} /></div>
          <Acc
            id="costs" icon={<Receipt />} title="تكاليف النشاط" open={open.has('costs')} onToggle={() => toggleSec('costs')}
            end={<>{actCosts.length} بند{actCosts.length > 0 && <> · <span className="acts-neg">{num(expense)}</span></>}</>}
          >
            <div className="wa-card" style={{ padding: actCosts.length > 0 ? 0 : undefined }}>
              {actCosts.length > 0 ? (
                <div className="wa-tablewrap">
                  <table className="wa-table cards">
                    <thead><tr><th>#</th><th>البند</th><th>المبلغ</th><th>المدفوع بواسطة</th><th>التاريخ</th></tr></thead>
                    <tbody>
                      {actCosts.map((c: any, i: number) => (
                        <tr key={c.id}>
                          <td data-l="#"><span className="ltr muted">{i + 1}</span></td>
                          <td data-l="البند"><b>{c.item}</b></td>
                          <td data-l="المبلغ"><span><span className="ltr acts-neg">{num(c.amount)}</span> {CURRENCY}</span></td>
                          <td data-l="المدفوع بواسطة">{c.paidBy || '—'}</td>
                          <td data-l="التاريخ">{c.date ? fmtDayShort(c.date) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={<Receipt />} title="لا تكاليف مسجَّلة" />
              )}
            </div>
          </Acc>
        </Show>

        {/* مكافأة الحجز المبكّر وسجلّها — مكوّن واحد يظهر في «قبل» و«بعد» */}
        <Show when={phase !== 'tonight'}>
          <div id="sec-bonus" className="acts-sec acts-legacy">
            <BookingBonusSection
              activityId={activity.id}
              activityName={activity.name}
              activityDate={activity.date}
              role={user?.role}
            />
          </div>
        </Show>

        <Show when={phase === 'after'}>
          <Acc id="drive" icon={<FolderOpen />} title="الصور والملفّات" open={open.has('drive')} onToggle={() => toggleSec('drive')}>
            <div className="acts-legacy">
              <DriveFolderBrowser
                driveLink={activity.driveLink || ''}
                activityId={activity.id}
                onDriveLinkCreated={(newLink) => setActivity((prev: any) => ({ ...prev, driveLink: newLink }))}
              />
            </div>
          </Acc>
        </Show>
      </div>

      {/* ══ قائمة الأقسام (هاتف) ══ */}
      {showMenu && (
        <Pop title="كلّ ما يخصّ هذا النشاط" onClose={() => setShowMenu(false)}>
          <div className="acts-menucard">{menuBody}</div>
        </Pop>
      )}

      {/* ══ نموذج التعديل — مكوّن مشترك داخل نافذة ══ */}
      {showEditForm && (
        <Pop wide onClose={() => setShowEditForm(false)} label="تعديل النشاط">
          <div className="wa-legacy">
            <EditActivityForm
              activity={activity}
              locations={locations}
              onSubmit={handleEditActivity}
              onCancel={() => setShowEditForm(false)}
            />
          </div>
        </Pop>
      )}
    </div>
  );
}
