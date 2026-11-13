'use client';

// ══════════════════════════════════════════════════════
// لوحة التحكّم — ما يحتاجه الطاقم الآن (2026-11)
// الغرف النشطة ودخولها · نشاط الليلة · الأسبوع · ما يحتاج نظراً · المال (أدمن ومحاسب).
// مفاتيح النظام الستّة انتقلت إلى /admin/system-switches.
// كلّ بطاقة تُخفى كاملةً عمّن لا حقّ له فيها — لا زرّ يقود إلى تحويل.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarDays, ChevronLeft, Clock, Coins, DoorOpen, Headset, ListChecks,
  MessageCircle, Play, Tv,
} from 'lucide-react';
import { useAdminScope } from './scope-context';
import { withCity } from '@/hooks/useCities';
import { isConfirmed, isPending } from '@/lib/reservation-status';
import { Badge, Banner, Card, Empty, Meter, Seg, Skel, Tile } from './whatsapp/wa-ui';
import './whatsapp/wa.css';
import './dash.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const LOCALE = 'ar-JO-u-nu-latn';
const TZ = 'Asia/Amman';
const CURRENCY = 'د.أ';

/** من يفتح /leader اليوم (NAV_EXTERNAL في layout + requireLeader في الخادم) */
const LEADER_ROLES = ['admin', 'manager', 'leader'];
const MONEY_ROLES = ['admin', 'accountant'];

const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

async function apiFetch(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** استطلاع يتوقّف حين تُخفى الصفحة ويُستأنف فوراً عند العودة؛ يُعاد من أوّله حين يتغيّر `key` */
function usePoll(fn: () => void, ms: number, enabled = true, key: unknown = null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setInterval> | null = null;
    const run = () => ref.current();
    const start = () => { if (!t) t = setInterval(run, ms); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const onVis = () => { if (document.visibilityState === 'visible') { run(); start(); } else stop(); };
    run();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [ms, enabled, key]);
}

// ── تنسيق ──
const N = ({ children }: { children: ReactNode }) => <span className="ltr">{children}</span>;
const num = (v: number) => Number(v || 0).toLocaleString(LOCALE);
const amount = (v: number) => Number(v || 0).toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const dayKey = (d: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const daysUntil = (d: string | Date) => Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(new Date()))) / 86_400_000);
/** ملخّص الخادم قد يبدأ برمز (تحذير/منع) — الأيقونة تحمل المعنى، فيُحذف ما قبل أوّل حرف أو رقم */
const stripLead = (s: string) => {
  const i = s.search(/[0-9A-Za-z؀-ۿ]/);
  return i > 0 ? s.slice(i) : s;
};

/** عدد + معدود بصيغته العربيّة (مفرد · مثنّى · جمع 3–10 · مفرد منصوب لما فوق) */
function counted(n: number, one: string, two: string, few: string, many: string): ReactNode {
  if (n === 1) return one;
  if (n === 2) return two;
  return <><N>{num(n)}</N> {n >= 3 && n <= 10 ? few : many}</>;
}

const PHASE_AR: Record<string, string> = {
  LOBBY: 'في الانتظار',
  ROLE_GENERATION: 'توزيع الأدوار',
  ROLE_BINDING: 'ربط الأدوار',
  DAY_DISCUSSION: 'النقاش',
  DAY_VOTING: 'التصويت',
  DAY_JUSTIFICATION: 'التبرير',
  DAY_TIEBREAKER: 'كسر التعادل',
  DAY_ELIMINATION: 'الإقصاء',
  NIGHT: 'الليل',
  MORNING_RECAP: 'ملخّص الصباح',
  GAME_OVER: 'انتهت اللعبة',
};
const PRE_GAME = new Set(['LOBBY', 'ROLE_GENERATION', 'ROLE_BINDING', 'GAME_OVER']);

interface LiveRoom {
  roomId: string; roomCode: string; gameName: string; playerCount: number; maxPlayers: number; displayPin: string;
  activityId?: number | null; activityName?: string | null; locationName?: string | null; cityId?: number | null; cityName?: string | null;
}
interface Act {
  id: number; name: string; date: string; status: string; cityId: number | null; cityName: string | null;
  locationName: string | null; booked: number; capacity: number; isToday: boolean;
}

// ══════════════════════════════════════════════════════

export default function AdminDashboard() {
  const scope = useAdminScope();
  const [user, setUser] = useState<{ displayName?: string; role?: string } | null>(null);
  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('user') || '{}')); } catch { setUser({}); }
  }, []);
  const role = user?.role || '';
  const isAdmin = role === 'admin';
  const canEnter = LEADER_ROLES.includes(role);
  const canMoney = MONEY_ROLES.includes(role);

  // ── الإحصاءات (نشاط الليلة · الأسبوع · العدّادات · المال) ──
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const scopeRef = useRef<number | null>(null);
  scopeRef.current = scope.cityId;
  const loadStats = useCallback(async () => {
    if (!scope.ready) return;
    const asked = scope.cityId;
    try {
      const d = await apiFetch(withCity('/api/dashboard/stats', asked));
      if (scopeRef.current !== asked) return;      // تبدّل النطاق أثناء الجلب
      if (d?.success) { setData(d); setFailed(false); }
    } catch {
      if (scopeRef.current === asked) setFailed(true);
    } finally {
      if (scopeRef.current === asked) setLoading(false);
    }
  }, [scope.ready, scope.cityId]);
  useEffect(() => { setLoading(true); setData(null); }, [scope.cityId]);
  usePoll(loadStats, 60_000, scope.ready, scope.cityId);

  // ── الغرف النشطة: كلّ 15 ثانية ما دامت الصفحة ظاهرة ──
  const [rooms, setRooms] = useState<LiveRoom[] | null>(null);
  const [phases, setPhases] = useState<Record<string, { phase: string; round: number }>>({});
  const loadRooms = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/game/leader-rooms`);
      const d = await r.json();
      const list: LiveRoom[] = d?.success && Array.isArray(d.rooms) ? d.rooms : [];
      setRooms(list);
      // المرحلة والجولة — أفضل جهد، ولمن يملك صلاحيّة واجهة القائد فقط (المسار يرفض غيرهم)
      if (!canEnter || !list.length) { setPhases({}); return; }
      const next: Record<string, { phase: string; round: number }> = {};
      await Promise.all(list.map(async room => {
        try {
          const s = await apiFetch(`/api/leader/state/${encodeURIComponent(room.roomId)}`);
          if (s?.success && s.state?.phase) next[room.roomId] = { phase: String(s.state.phase), round: Number(s.state.round) || 0 };
        } catch { /* يُخفى نصّ المرحلة لهذه الغرفة */ }
      }));
      setPhases(next);
    } catch { /* تبقى آخر قائمة */ }
  }, [canEnter]);
  usePoll(loadRooms, 15_000, user !== null, canEnter);

  // غرفة بلا مدينة تظهر في كلّ نطاق — الغرفة الحيّة لا تُخفى لنقص بيان
  const liveRooms = useMemo(
    () => (rooms || []).filter(r => scope.cityId == null || r.cityId == null || Number(r.cityId) === scope.cityId),
    [rooms, scope.cityId]);

  /**
   * دخول الغرفة — آليّة «RESUME» نفسها في /leader:
   * الصفحة تقرأ `leader_active_room` عند الإقلاع فتجلب الحالة وتُصدر `room:rejoin-leader`.
   * (`leader_room_entry` لإنشاء غرفة من سجلّ فقط، ووجوده يُلغي الاستئناف — فيُمسح.)
   * 🔴 في التبويب نفسه: التطبيق المثبَّت على آيفون يفتح التبويب الجديد في سفاري فتضيع الجلسة.
   */
  const enterRoom = (room: LiveRoom) => {
    try {
      sessionStorage.removeItem('leader_room_entry');
      sessionStorage.setItem('leader_active_room', room.roomId);
      // دخول الإدارة يكتب المفتاحين معاً؛ إن مُسح مفتاح القائد يُعاد من الجلسة نفسها
      if (!localStorage.getItem('leader_token')) {
        const t = localStorage.getItem('token');
        if (t) localStorage.setItem('leader_token', t);
      }
    } catch { /* تخزين محجوب — صفحة القائد تعرض الغرف النشطة */ }
    window.location.href = '/leader';
  };

  // ── نشاط الليلة وحجوزاته ──
  const focus: Act | null = data?.focusActivity || null;
  const week: Act[] = Array.isArray(data?.upcomingActivities) ? data.upcomingActivities : [];
  const todayAct = focus?.isToday ? focus : week.find(a => a.isToday && a.status !== 'cancelled') || null;

  const [resRows, setResRows] = useState<any[] | null>(null);
  const focusId = focus?.id ?? null;
  const loadRes = useCallback(async () => {
    if (!focusId) { setResRows(null); return; }
    try {
      const rows = await apiFetch(`/api/reservations?activityId=${focusId}`);
      setResRows(Array.isArray(rows) ? rows : []);
    } catch { /* تبقى البلاطات على آخر قراءة */ }
  }, [focusId]);
  useEffect(() => { setResRows(null); }, [focusId]);
  usePoll(loadRes, 30_000, !!focusId, focusId);

  const tonight = useMemo(() => {
    if (!resRows) return null;
    const ppl = (r: any) => Math.max(1, Number(r.peopleCount) || 1);
    let arrived = 0, onWay = 0, silent = 0, confirmed = 0, pending = 0;
    for (const r of resRows) {
      const att = r.attended ?? null, eta = r.etaAt ?? null, declined = r.declinedAt ?? null;
      if (isConfirmed(r)) confirmed += ppl(r);
      if (isPending(r)) pending += ppl(r);
      if (att === true) arrived += ppl(r);
      else if (att == null && eta && !declined) onWay += ppl(r);
      else if (att == null && !eta && !declined && isConfirmed(r)) silent += ppl(r);
    }
    return { arrived, onWay, silent, confirmed, pending };
  }, [resRows]);

  // ── واتساب (أدمن فقط): محادثات تنتظر موظّفاً + صحّة الخطّ ──
  const [waAttn, setWaAttn] = useState(0);
  const [waHealth, setWaHealth] = useState<{ level: string; summary: string } | null>(null);
  const loadWa = useCallback(async () => {
    try { const d = await apiFetch('/api/whatsapp/conversations/counts?x=1'); setWaAttn(Number(d?.counts?.attn) || 0); } catch { /* غير حرج */ }
    try { const h = await apiFetch('/api/whatsapp/health'); if (h?.level) setWaHealth({ level: String(h.level), summary: String(h.summary || '') }); } catch { /* غير حرج */ }
  }, []);
  usePoll(loadWa, 60_000, isAdmin);

  // ── «يحتاج نظرك» ──
  const pendingList: any[] = Array.isArray(data?.attention?.pendingReservations) ? data.attention.pendingReservations : [];
  const pendingCount = pendingList.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const unpaid = Number(data?.bookings?.unpaid) || 0;
  const unpaidAmount = data?.bookings?.unpaidAmount;
  const healthOk = waHealth?.level === 'ok';
  const attnItems = (isAdmin && waAttn > 0 ? 1 : 0) + (pendingCount > 0 ? 1 : 0) + (unpaid > 0 ? 1 : 0) + (isAdmin && waHealth && !healthOk ? 1 : 0);

  // ── المال ──
  const fin = canMoney ? data?.finance : null;
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const money = fin
    ? (period === 'week' && fin.week
      ? { revenue: Number(fin.week.revenue) || 0, costs: Number(fin.week.activityCosts) || 0, net: Number(fin.week.net) || 0 }
      : { revenue: Number(fin.totalRevenue) || 0, costs: Number(fin.totalActivityCosts) || 0, net: Number(fin.netProfit) || 0 })
    : null;

  // ── الرأس ──
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now));
  const greeting = hour >= 4 && hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const scopeKey = scope.cityId == null ? 'all' : String(scope.cityId);
  const scopeOptions = useMemo(
    () => [...scope.cities.map(c => [String(c.id), c.name] as const), ['all', 'الكلّ'] as const],
    [scope.cities]);

  const weekBadge = (a: Act) => {
    if (a.status === 'cancelled') return <Badge tone="danger">ملغي</Badge>;
    if (a.isToday && a.status === 'active') return <Badge tone="ok"><i className="wa-dot ok" />جارية</Badge>;
    if (a.isToday && a.status === 'completed') return <Badge>انتهت</Badge>;
    if (a.isToday) return <Badge tone="gold">اليوم</Badge>;
    const d = daysUntil(a.date);
    return <Badge>{d === 1 ? 'غداً' : d === 2 ? 'بعد غد' : <>بعد <N>{d}</N> أيّام</>}</Badge>;
  };
  const fillTone = (pct: number): 'gold' | 'warn' | undefined => (pct >= 80 ? undefined : pct >= 35 ? 'gold' : 'warn');
  const seatsLeft = (a: Act): ReactNode => (a.capacity - a.booked > 0
    ? counted(a.capacity - a.booked, 'مقعد واحد متاح', 'مقعدان متاحان', 'مقاعد متاحة', 'مقعداً متاحاً')
    : 'اكتملت المقاعد');

  return (
    <div className="wa dash" dir="rtl" style={{ background: 'transparent' }}>
      {/* ── ١) التحيّة والتاريخ ونطاق المدينة ── */}
      <header className="dash-h">
        <div>
          <h1>{greeting}{user?.displayName ? `، ${user.displayName}` : ''}</h1>
          <p>{fmtDay(now)} · {scope.label}</p>
        </div>
        {scope.cities.length > 0 && (
          <div className="acts">
            <Seg value={scopeKey} options={scopeOptions} label="نطاق المدينة"
              onChange={k => scope.setCityId(k === 'all' ? null : Number(k))} />
          </div>
        )}
      </header>

      {/* ── ٢) الغرف النشطة — أو سطر هادئ لنشاط اليوم ── */}
      {liveRooms.length > 0 ? (
        <section className="dash-lives" aria-label="الغرف النشطة">
          {liveRooms.map(room => {
            const ph = phases[room.roomId];
            const phaseText = ph && PHASE_AR[ph.phase]
              ? (ph.round > 0 && !PRE_GAME.has(ph.phase) ? <>الجولة <N>{ph.round}</N>، {PHASE_AR[ph.phase]}</> : PHASE_AR[ph.phase])
              : null;
            const place = [room.activityName || room.gameName, room.locationName].filter(Boolean).join(' — ');
            return (
              <div className="dash-live" key={room.roomId}>
                <div className="head">
                  <i className="pulse" aria-hidden="true" />
                  <div className="grow">
                    <div className="ttl">غرفة نشطة الآن{place ? ` · ${place}` : ''}</div>
                    <div className="sub">
                      الرمز <N>{room.roomCode}</N> · <N>{num(room.playerCount)} / {num(room.maxPlayers)}</N> لاعباً
                      {phaseText && <> · {phaseText}</>}
                    </div>
                  </div>
                </div>
                <div className="btns">
                  {room.roomCode && (
                    <a className="wa-btn" target="_blank" rel="noopener noreferrer"
                      href={`/display?sessionCode=${encodeURIComponent(room.roomCode)}&pin=${encodeURIComponent(room.displayPin || '')}`}>
                      <Tv aria-hidden="true" />شاشة العرض
                    </a>
                  )}
                  {canEnter && (
                    <button type="button" className="wa-btn send enter" onClick={() => enterRoom(room)}>
                      <Play aria-hidden="true" />ادخل الغرفة
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ) : rooms !== null && todayAct ? (
        <Link className="dash-quiet" href={`/admin/activities/${todayAct.id}`}>
          <CalendarDays aria-hidden="true" />
          <span>لا غرفة نشطة الآن — نشاط اليوم: <b>{todayAct.name}</b> · <N>{fmtTime(todayAct.date)}</N></span>
          <span className="end"><ChevronLeft aria-hidden="true" /></span>
        </Link>
      ) : null}

      {failed && !data && (
        <Banner tone="danger" icon={<AlertTriangle aria-hidden="true" />} action="إعادة المحاولة" onAction={() => { setLoading(true); loadStats(); }}>
          تعذّر تحميل لوحة التحكّم.
        </Banner>
      )}

      <div className="dash-grid">
        <div className="dash-col">
          {/* ── ٣) الليلة ── */}
          {loading && !data ? (
            <Card className="dash-o1"><div className="stack"><Skel h={24} w="50%" /><Skel h={76} /><Skel h={44} w="70%" /></div></Card>
          ) : focus ? (
            <Card className="dash-o1"
              title={<>{focus.isToday ? 'الليلة' : 'النشاط القادم'} · {focus.name}</>}
              aside={<>{!focus.isToday && <>{fmtDay(focus.date)} · </>}<N>{fmtTime(focus.date)}</N>{focus.locationName ? ` · ${focus.locationName}` : ''}</>}>
              {focus.isToday ? (
                <div className="dash-kpis">
                  <Tile k="الحاجزون" v={<>{num(focus.booked)}<span className="of"> / {num(focus.capacity)}</span></>} h={seatsLeft(focus)} />
                  <Tile tone="ok" k="وصلوا" v={tonight ? num(tonight.arrived) : '—'}
                    h={tonight && focus.booked > 0 ? <><N>{Math.round((tonight.arrived / focus.booked) * 100)}%</N> من الحاجزين</> : undefined} />
                  <Tile tone="gold" k="في الطريق" v={tonight ? num(tonight.onWay) : '—'} h="أبلغوا بموعد وصولهم" />
                  <Tile tone={tonight && tonight.silent > 0 ? 'danger' : undefined} k="لم يردّوا" v={tonight ? num(tonight.silent) : '—'} h="مثبَّتون بلا وصول ولا موعد" />
                </div>
              ) : (
                <div className="dash-kpis three">
                  <Tile k="الحاجزون" v={<>{num(focus.booked)}<span className="of"> / {num(focus.capacity)}</span></>} h={seatsLeft(focus)} />
                  <Tile tone="ok" k="مثبَّتون" v={tonight ? num(tonight.confirmed) : '—'} h="في متابعة الحجوزات" />
                  <Tile tone={tonight && tonight.pending > 0 ? 'gold' : undefined} k="غير مثبَّتين" v={tonight ? num(tonight.pending) : '—'} h="بانتظار التثبيت" />
                </div>
              )}
              <div className="dash-acts">
                <Link className="wa-btn primary" href="/admin/reservations"><ListChecks aria-hidden="true" />متابعة الحجوزات</Link>
                <Link className="wa-btn" href="/admin/reservations/door"><DoorOpen aria-hidden="true" />الباب</Link>
                <Link className="wa-btn ghost" href={`/admin/activities/${focus.id}`}>تفاصيل النشاط</Link>
              </div>
            </Card>
          ) : data ? (
            <Card className="dash-o1">
              <Empty icon={<CalendarDays aria-hidden="true" />} title="لا نشاط قادم">
                لا نشاط مجدول في {scope.cityId == null ? 'أيّ مدينة' : scope.label}. <Link href="/admin/activities">الأنشطة</Link>
              </Empty>
            </Card>
          ) : null}

          {/* ── ٤) هذا الأسبوع ── */}
          {data && (
            <Card className="dash-flush dash-o3" title="هذا الأسبوع" aside={<Link href="/admin/activities">كلّ الأنشطة</Link>}>
              {week.length === 0 ? (
                <Empty icon={<CalendarDays aria-hidden="true" />} title="لا أنشطة في الأيّام السبعة القادمة" />
              ) : week.map(a => {
                const pct = a.capacity > 0 ? Math.round((a.booked / a.capacity) * 100) : 0;
                const d = new Date(a.date);
                return (
                  <Link key={a.id} className="dash-row" href={`/admin/activities/${a.id}`}>
                    <div className="dash-date">
                      <b>{d.toLocaleDateString(LOCALE, { day: 'numeric', timeZone: TZ })}</b>
                      <span>{d.toLocaleDateString(LOCALE, { weekday: 'long', timeZone: TZ })}</span>
                    </div>
                    <div className="grow">
                      <span className="nm trunc">{a.name}</span>
                      <span className="meta trunc">
                        <N>{fmtTime(a.date)}</N>{a.locationName ? ` · ${a.locationName}` : ''}{scope.cityId == null && a.cityName ? ` · ${a.cityName}` : ''}
                      </span>
                    </div>
                    <div className="dash-fill">
                      <Meter pct={pct} tone={fillTone(pct)} />
                      <div className="cap"><N>{num(a.booked)} / {num(a.capacity)}</N> حاجزاً</div>
                    </div>
                    {weekBadge(a)}
                  </Link>
                );
              })}
            </Card>
          )}
        </div>

        <div className="dash-col">
          {/* ── ٥) يحتاج نظرك ── */}
          {data && (
            <Card className="dash-flush dash-o2" title="يحتاج نظرك" aside={attnItems > 0 ? <N>{attnItems}</N> : undefined}>
              <div className="wa-menu">
                {isAdmin && waAttn > 0 && (
                  <Link href="/admin/whatsapp">
                    <Headset className="dash-ic-danger" aria-hidden="true" />
                    <span className="grow">{counted(waAttn, 'محادثة واحدة تنتظر موظّفاً', 'محادثتان تنتظران موظّفاً', 'محادثات تنتظر موظّفاً', 'محادثة تنتظر موظّفاً')}</span>
                    <span className="end"><ChevronLeft aria-hidden="true" /></span>
                  </Link>
                )}
                {pendingCount > 0 && (
                  <Link href="/admin/reservations">
                    <Clock className="dash-ic-warn" aria-hidden="true" />
                    <span className="grow">
                      {counted(pendingCount, 'حجز واحد غير مثبَّت', 'حجزان غير مثبَّتين', 'حجوزات غير مثبَّتة', 'حجزاً غير مثبَّت')}
                      {pendingList.length === 1 ? ` — ${pendingList[0].name}` : pendingList.length === 2 ? ' في نشاطين قادمين' : <> في <N>{pendingList.length}</N> أنشطة قادمة</>}
                    </span>
                    <span className="end"><ChevronLeft aria-hidden="true" /></span>
                  </Link>
                )}
                {unpaid > 0 && (
                  <Link href="/admin/bookings">
                    <Coins className="dash-ic-warn" aria-hidden="true" />
                    <span className="grow">{counted(unpaid, 'حجز واحد غير مدفوع', 'حجزان غير مدفوعين', 'حجوزات غير مدفوعة', 'حجزاً غير مدفوع')}</span>
                    <span className="end">
                      {canMoney && Number(unpaidAmount) > 0 && <><N>{amount(Number(unpaidAmount))}</N> {CURRENCY}</>}
                      <ChevronLeft aria-hidden="true" />
                    </span>
                  </Link>
                )}
                {isAdmin && waHealth && (
                  <Link href="/admin/whatsapp">
                    <MessageCircle className={healthOk ? 'dash-ic-ok' : 'dash-ic-danger'} aria-hidden="true" />
                    <span className="grow">واتساب: {stripLead(waHealth.summary) || (healthOk ? 'سليم' : 'يحتاج فحصاً')}</span>
                    <span className="end"><ChevronLeft aria-hidden="true" /></span>
                  </Link>
                )}
              </div>
              {attnItems === 0 && !(isAdmin && waHealth) && <div className="dash-calm">لا شيء ينتظرك الآن.</div>}
            </Card>
          )}

          {/* ── ٦) المال — للأدمن والمحاسب فقط ── */}
          {money && fin && (
            <Card className="dash-o4" title={period === 'week' ? 'مال آخر 7 أيّام' : 'المال — الإجماليّ'} aside={<Link href="/admin/finance">الماليّة</Link>}>
              <Seg block value={period} label="الفترة" onChange={setPeriod}
                options={[['week', 'آخر 7 أيّام'], ['all', 'الإجماليّ']] as const} />
              <div className="stack" style={{ gap: 4, marginTop: 12 }}>
                <div className="wa-kv"><span>الإيرادات</span><b className="ltr">{amount(money.revenue)}</b><span className="dash-cur">{CURRENCY}</span></div>
                <div className="wa-kv"><span>تكاليف الأنشطة</span><b className="ltr">{amount(money.costs)}</b><span className="dash-cur">{CURRENCY}</span></div>
                <div className="wa-kv dash-net">
                  <span>الصافي</span>
                  <b className={`ltr ${money.net >= 0 ? 'dash-pos' : 'dash-neg'}`}>{amount(money.net)}</b><span className="dash-cur">{CURRENCY}</span>
                </div>
              </div>
              {period === 'week' && fin.week?.from && (
                <p className="dash-note">الأنشطة المقامة منذ {fmtDay(fin.week.from)}: إيراد حجوزاتها المدفوعة ناقص التكاليف المربوطة بها.</p>
              )}
              {scope.cityId != null ? (
                <p className="dash-note">
                  تكاليف {scope.label} وحدها — لا تُطرح منها تكاليف مدن أخرى.
                  {period === 'all' && Number(fin.unassignedCosts) > 0 && <> تكاليف عامّة بلا نشاط (<N>{amount(Number(fin.unassignedCosts))}</N> {CURRENCY}) والتكاليف التأسيسيّة لا مدينة لها، فتظهر في نطاق «الكلّ» فقط.</>}
                </p>
              ) : period === 'all' && Number(fin.totalFoundational) > 0 ? (
                <p className="dash-note">
                  التكاليف التأسيسيّة: <N>{amount(Number(fin.totalFoundational))}</N> {CURRENCY} في <N>{num(fin.foundationalCount)}</N> بنداً — غير مطروحة من الصافي.
                </p>
              ) : null}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
