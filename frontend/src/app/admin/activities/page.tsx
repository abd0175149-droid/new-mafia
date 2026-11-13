'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { CalendarDays, CalendarPlus, CalendarRange, Lock, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import ActivityForm from '../components/ActivityForm';
import BookingForm from '../components/BookingForm';
import EditActivityForm from '../components/EditActivityForm';
import WeekGamesModal from '../components/WeekGamesModal';
import { useAdminScope } from '../scope-context';
import { CitySegment } from '@/components/admin/CityBadge';
import { withCity } from '@/hooks/useCities';
import { confirmActivityCancel, toastCancelStarted } from '@/lib/cancel-notice';
import { swalConfirm, swalToast } from '@/lib/swal';
import { Banner, Chip, Empty, Pop, Skel } from '../whatsapp/wa-ui';
import ActCard, { type ActStats } from './components/ActCard';
import { apiFetch, enterRoom, getUser, STATUS_OPTIONS } from './components/acts-shared';
import '../whatsapp/wa.css';
import './acts.css';

// ── تحديث الحالة التلقائي ──
function getAutoStatus(dateStr: string, currentStatus: string): string | null {
  if (currentStatus === 'cancelled') return null;
  const now = new Date();
  const actDate = new Date(dateStr);
  const nextDay = new Date(actDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);

  let newStatus = currentStatus;
  if (now >= nextDay) newStatus = 'completed';
  else if (now >= actDate) newStatus = 'active';
  else newStatus = 'planned';

  return newStatus !== currentStatus ? newStatus : null;
}

// ── شرائح الحالة (هي فلتر الحالة) ──
type Tab = 'upcoming' | 'running' | 'done' | 'cancelled' | 'all';
const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['upcoming', 'القادمة'], ['running', 'جارية'], ['done', 'منتهية'], ['cancelled', 'ملغاة'], ['all', 'الكلّ'],
];
const inTab = (a: any, t: Tab) =>
  t === 'all' ? true
    : t === 'upcoming' ? a.status === 'planned' || a.status === 'active'
      : t === 'running' ? a.status === 'active'
        : t === 'done' ? a.status === 'completed'
          : a.status === 'cancelled';

const PAGE_STEP = 12;
const EMPTY_STATS: ActStats = { revenue: 0, expense: 0, profit: 0, attendees: 0, freeAttendees: 0, paidAttendees: 0, arrived: 0, early: 0 };

export default function ActivitiesPage() {
  // ── State ──
  const [activities, setActivities] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [costs, setCosts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [, setStaffError] = useState(false);
  const [roomsByAct, setRoomsByAct] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);

  // Forms
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showWeek, setShowWeek] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState<any | null>(null);
  const [menuFor, setMenuFor] = useState<any | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [tab, setTab] = useState<Tab>('upcoming');
  const [search, setSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  // إظهار الفعاليات المرتبطة بـ Test Location (مخفية افتراضياً)
  const [showTestLocation, setShowTestLocation] = useState(false);

  // «المزيد» بدل ترقيم الصفحات
  const [visible, setVisible] = useState(PAGE_STEP);

  const user = useMemo(() => getUser(), []);
  const canManage = user.role !== 'location_owner' && user.role !== 'accountant';

  // 🏙️ نطاق المدينة: يتبع مبدّلَ الشريط الجانبيّ افتراضاً (undefined)، ويتجاوزه المستعمل من الشريحة هنا
  const scope = useAdminScope();
  const [cityOverride, setCityOverride] = useState<number | null | undefined>(undefined);
  const cityFilter: number | null = cityOverride === undefined ? scope.cityId : cityOverride;
  useEffect(() => { setCityOverride(undefined); }, [scope.cityId]);

  // ── Data Fetch ──
  const fetchAll = useCallback(async () => {
    try {
      const [acts, bks, csts, locs] = await Promise.all([
        apiFetch(withCity('/api/activities', cityFilter)),
        apiFetch('/api/bookings'),
        apiFetch('/api/costs'),
        apiFetch('/api/locations'),
      ]);
      setActivities(acts);
      setBookings(bks);
      setCosts(csts);
      setLocations(locs);

      // أسماء العرض وحدها — متاحة لأي موظّف. المسار الغنيّ /api/staff
      // محصور بـadmin/accountant، فكان غيرهم يرى منسدلة «المستلم» فارغة بلا سبب ظاهر.
      try { setStaffList(await apiFetch('/api/staff/names')); }
      catch (e) { console.warn('المستلمون: تعذّر جلب الأسماء', e); setStaffError(true); }

      // 🎮 الغرف النشطة للأنشطة الجارية وحدها (واحد أو اثنان عادةً) — لزرّ «الغرفة» على البطاقة
      const live = (acts as any[]).filter(a => (getAutoStatus(a.date, a.status) ?? a.status) === 'active');
      const pairs = await Promise.all(live.map(async a => {
        try {
          const rooms = await apiFetch(`/api/activities/${a.id}/rooms`);
          return [a.id, (Array.isArray(rooms) ? rooms : []).filter((r: any) => r.isActive)] as const;
        } catch { return [a.id, []] as const; }
      }));
      setRoomsByAct(Object.fromEntries(pairs));

      // Auto-status update — الخادم لا يحدّث الحالة بنفسه، فتبقى الحلقة كما كانت
      for (const act of acts) {
        const newStatus = getAutoStatus(act.date, act.status);
        if (newStatus) {
          try {
            await apiFetch(`/api/activities/${act.id}`, {
              method: 'PUT',
              body: JSON.stringify({ status: newStatus }),
            });
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [cityFilter]);

  // 🔴 يُنتظر `ready` كي لا يُجلب مرّتين (بلا نطاقٍ ثمّ بالنطاق المحفوظ)
  useEffect(() => {
    if (!scope.ready) return;
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, scope.ready]);

  // ── Computed Stats (مرّة واحدة لكلّ الأنشطة) ──
  const statsByAct = useMemo(() => {
    const m = new Map<number, ActStats>();
    const at = (id: number) => { let s = m.get(id); if (!s) { s = { ...EMPTY_STATS }; m.set(id, s); } return s; };
    for (const b of bookings) {
      const s = at(b.activityId);
      const n = b.count || 1;
      s.revenue += b.isPaid ? Number(b.paidAmount || 0) : 0;
      s.attendees += n;
      if (b.isFree) s.freeAttendees += n;
      if (b.isPaid && !b.isFree) s.paidAttendees += n;
      if (b.checkedIn) s.arrived += n;
      if (b.unitPrice != null && !b.isFree) s.early += n;
    }
    for (const c of costs) at(c.activityId).expense += Number(c.amount || 0);
    m.forEach(s => { s.profit = s.revenue - s.expense; });
    return m;
  }, [bookings, costs]);

  // معرّفات مواقع الاختبار — بعلم isTestLocation لا بمطابقة الاسم
  const testLocationIds = useMemo(
    () => new Set(locations.filter((l: any) => l.isTestLocation === true).map((l: any) => l.id)),
    [locations]
  );
  const locationById = useMemo(() => new Map<number, any>(locations.map((l: any) => [l.id, l])), [locations]);

  // ── كلّ الفلاتر عدا شريحة الحالة — منها تُحسب عدّادات الشرائح ──
  const base = useMemo(() => {
    let result = [...activities];

    // 🏙️ فلتر المدينة محلّيّاً أيضاً — احتياطٌ حين يتجاهل الخادم ?cityId= (صفٌّ بلا cityId يُقرأ من مكانه)
    if (cityFilter != null) {
      result = result.filter(a => Number(a.cityId ?? locationById.get(a.locationId)?.cityId) === cityFilter);
    }

    // إخفاء فعاليات Test Location ما لم يُفعّل الخيار
    if (!showTestLocation) {
      result = result.filter(a => !testLocationIds.has(a.locationId));
    }

    // فلتر التاريخ
    if (filterDateFrom) {
      result = result.filter(a => new Date(a.date) >= new Date(filterDateFrom));
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59);
      result = result.filter(a => new Date(a.date) <= to);
    }

    // بحث بالاسم أو المكان
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(a => {
        const loc = locationById.get(a.locationId);
        return [a.name, a.locationName ?? loc?.name, a.locationRegion ?? loc?.region, a.cityName ?? loc?.cityName]
          .some(v => String(v || '').toLowerCase().includes(q));
      });
    }
    return result;
  }, [activities, filterDateFrom, filterDateTo, showTestLocation, testLocationIds, cityFilter, locationById, search]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { upcoming: 0, running: 0, done: 0, cancelled: 0, all: base.length };
    for (const a of base) for (const [t] of TABS) if (t !== 'all' && inTab(a, t)) c[t]++;
    return c;
  }, [base]);

  // القادمة والجارية: الأقرب أوّلاً · غيرها: الأحدث أوّلاً
  const filteredActivities = useMemo(() => {
    const asc = tab === 'upcoming' || tab === 'running';
    return base.filter(a => inTab(a, tab)).sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      return asc ? d : -d;
    });
  }, [base, tab]);

  const shown = filteredActivities.slice(0, visible);
  useEffect(() => { setVisible(PAGE_STEP); }, [tab, search, filterDateFrom, filterDateTo, showTestLocation, cityFilter]);

  // ── Handlers ──
  async function handleCreateActivity(data: any) {
    await apiFetch('/api/activities', { method: 'POST', body: JSON.stringify(data) });
    setShowActivityForm(false);
    await fetchAll();
  }

  async function handleCreateBooking(data: any) {
    await apiFetch('/api/bookings', { method: 'POST', body: JSON.stringify(data) });
    setShowBookingForm(false);
    await fetchAll();
  }

  async function handleEditActivity(id: number, data: any) {
    // 📣 التحويل إلى «ملغاة» يراسل الحاجزين آليّاً — معاينةٌ وتأكيدٌ قبل الحفظ
    const before = activities.find((a: any) => a.id === id);
    if (data?.status === 'cancelled' && before?.status !== 'cancelled' && !(await confirmActivityCancel(id, (p) => apiFetch(p)))) return;
    const r = await apiFetch(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    toastCancelStarted(r);
    setShowEditForm(null);
    await fetchAll();
  }

  async function handleStatusChange(id: number, newStatus: string) {
    try {
      if (newStatus === 'cancelled' && !(await confirmActivityCancel(id, (p) => apiFetch(p)))) { await fetchAll(); return; }
      const r = await apiFetch(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
      toastCancelStarted(r);
      await fetchAll();
    } catch (err: any) {
      swalToast('فشل تغيير الحالة: ' + (err.message || ''), 'error');
    }
  }

  async function handleDelete(activity: any) {
    if (!(await swalConfirm(`حذف «${activity.name || 'بدون اسم'}»؟ لا يمكن التراجع عن الحذف.`, { title: 'حذف النشاط؟', danger: true, confirmText: 'احذف' }))) return;
    try {
      await apiFetch(`/api/activities/${activity.id}`, { method: 'DELETE' });
      fetchAll();
      swalToast('تم الحذف بنجاح', 'success');
    } catch (err: any) {
      swalToast('فشل الحذف: ' + (err.message || ''), 'error');
    }
  }

  const cityOverridden = cityOverride !== undefined && cityOverride !== scope.cityId;
  const extraFilters = (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0) + (showTestLocation ? 1 : 0) + (cityOverridden ? 1 : 0);
  const hasActiveFilters = tab !== 'upcoming' || !!search || extraFilters > 0;

  function clearFilters() {
    setTab('upcoming');
    setSearch('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setShowTestLocation(false);
    setCityOverride(undefined);
  }

  // عناصر التصفية — تُرسم مرّة في السطر (حاسوب) ومرّة داخل نافذة «تصفية» (هاتف)
  const filterControls = (idp: string) => (
    <>
      <label className="acts-date" htmlFor={`${idp}-from`}>من
        <input id={`${idp}-from`} type="date" className="wa-input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
      </label>
      <label className="acts-date" htmlFor={`${idp}-to`}>إلى
        <input id={`${idp}-to`} type="date" className="wa-input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
      </label>
      {/* 🏙️ المدينة — الافتراضيّ من مبدّل النطاق في الشريط الجانبيّ */}
      <CitySegment cities={scope.cities} value={cityFilter} onChange={id => setCityOverride(id)} ariaLabel="فلتر المدينة" />
      <label className="acts-checkline">
        <input type="checkbox" className="acts-check" checked={showTestLocation} onChange={e => setShowTestLocation(e.target.checked)} />
        إظهار فعاليّات مواقع الاختبار
      </label>
    </>
  );

  const menuLocked = !!menuFor?.isLocked;

  return (
    <div className="wa acts-page" dir="rtl" style={{ background: 'transparent' }}>
      {/* ══ Header ══ */}
      <div className="acts-head">
        <div>
          <h1>الأنشطة</h1>
          <p>كلّ نشاط بطاقة: الامتلاء أوّلاً ثمّ المال.</p>
        </div>
        {canManage && (
          <div className="acts-acts spread">
            <button type="button" className="wa-btn" onClick={() => setShowBookingForm(true)}><CalendarPlus />حجز جديد</button>
            {/* 🔴 زرٌّ مستقلٌّ لا خيارٌ داخل نموذج النشاط: هذا فعلٌ أسبوعيٌّ واحد */}
            <button type="button" className="wa-btn" onClick={() => setShowWeek(true)}><CalendarRange />ألعاب الأسبوع</button>
            <button type="button" className="wa-btn primary" onClick={() => setShowActivityForm(true)}><Plus />نشاط جديد</button>
          </div>
        )}
      </div>

      {/* ══ شرائح الحالة + بحث + تصفية ══ */}
      <div className="acts-tools">
        <div className="wa-chips" role="group" aria-label="حالة النشاط">
          {TABS.map(([k, l]) => <Chip key={k} on={tab === k} onClick={() => setTab(k)} n={counts[k]}>{l}</Chip>)}
        </div>
        <div className="acts-line">
          <div className="wa-search">
            <Search />
            <input type="search" className="wa-input" placeholder="ابحث باسم النشاط أو المكان" aria-label="بحث في الأنشطة" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button type="button" className="wa-btn wa-only-phone" onClick={() => setShowFilters(true)}>
            <SlidersHorizontal />تصفية{extraFilters > 0 && <span className="wa-count">{extraFilters}</span>}
          </button>
          <span className="acts-count"><span className="ltr">{filteredActivities.length}</span> من <span className="ltr">{activities.length}</span> نشاط</span>
          {hasActiveFilters && <button type="button" className="wa-btn ghost sm" onClick={clearFilters}><X />مسح</button>}
        </div>
        <div className="acts-line wa-only-desk">{filterControls('f')}</div>
      </div>

      {/* ══ Cards Grid ══ */}
      {loading ? (
        <div className="acts-grid" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="wa-card acts-card"><Skel h={72} /><Skel w="60%" /><Skel h={56} /><Skel h={44} /></div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="wa-card">
          <Empty icon={<CalendarDays />} title={hasActiveFilters ? 'لا أنشطة بهذه التصفية' : 'لا أنشطة قادمة'}>
            {hasActiveFilters ? 'جرّب شريحة أخرى أو امسح التصفية.' : canManage ? 'ابدأ بإضافة نشاط جديد.' : undefined}
          </Empty>
        </div>
      ) : (
        <div className="acts-grid">
          {shown.map((activity: any) => (
            <ActCard
              key={activity.id}
              activity={activity}
              stats={statsByAct.get(activity.id) ?? EMPTY_STATS}
              location={locationById.get(activity.locationId)}
              activeRooms={roomsByAct[activity.id] ?? []}
              canManage={canManage}
              onMenu={() => setMenuFor(activity)}
              onEnterRoom={(room) => enterRoom(room, activity.id)}
            />
          ))}
        </div>
      )}

      {/* ══ المزيد ══ */}
      {!loading && filteredActivities.length > shown.length && (
        <button type="button" className="wa-more" onClick={() => setVisible(v => v + PAGE_STEP)}>
          اعرض المزيد (<span className="ltr">{filteredActivities.length - shown.length}</span> باقية)
        </button>
      )}

      {/* ══ نافذة التصفية (هاتف) ══ */}
      {showFilters && (
        <Pop title="تصفية" onClose={() => setShowFilters(false)}>
          <div className="stack">{filterControls('p')}</div>
          <div className="acts">
            <button type="button" className="wa-btn" onClick={() => { clearFilters(); setShowFilters(false); }}>مسح الكلّ</button>
            <button type="button" className="wa-btn primary" onClick={() => setShowFilters(false)}>اعرض <span className="ltr">{filteredActivities.length}</span></button>
          </div>
        </Pop>
      )}

      {/* ══ إجراءات البطاقة «⋯» ══ */}
      {menuFor && (
        <Pop title={menuFor.name || 'بدون اسم'} onClose={() => setMenuFor(null)}>
          {menuLocked ? (
            <Banner tone="danger" icon={<Lock />}>هذا النشاط مقفول إداريّاً: لا تغيير حالة ولا تعديل ولا حذف. المدير العامّ يفكّ القفل من صفحة النشاط.</Banner>
          ) : (
            <>
              <div className="wa-field">
                <label id="acts-status-l">الحالة</label>
                <div className="stack" role="radiogroup" aria-labelledby="acts-status-l" style={{ gap: 'var(--space-2)' }}>
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s.value} type="button" className="wa-radio" role="radio" aria-checked={menuFor.status === s.value}
                      onClick={() => { const a = menuFor; setMenuFor(null); if (a.status !== s.value) handleStatusChange(a.id, s.value); }}
                    >
                      <span className="o" />
                      <span className="t"><b>{s.label}</b><span>{s.hint}</span></span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="acts">
                <button type="button" className="wa-btn" onClick={() => { setShowEditForm(menuFor); setMenuFor(null); }}><Pencil />تعديل</button>
                <button type="button" className="wa-btn danger" onClick={() => { const a = menuFor; setMenuFor(null); handleDelete(a); }}><Trash2 />حذف</button>
              </div>
            </>
          )}
        </Pop>
      )}

      {/* ══ 🗓️ ألعاب الأسبوع ══ */}
      <WeekGamesModal
        open={showWeek}
        onClose={() => setShowWeek(false)}
        apiFetch={apiFetch}
        onDone={async (msg) => { swalToast(msg, 'success'); await fetchAll(); }}
      />

      {/* ══ النماذج المشتركة — داخل نافذة، ومظهرها يُلبَّس من wa-legacy ══ */}
      {showActivityForm && (
        <Pop wide onClose={() => setShowActivityForm(false)} label="نشاط جديد">
          <div className="wa-legacy">
            <ActivityForm locations={locations} onSubmit={handleCreateActivity} onCancel={() => setShowActivityForm(false)} />
          </div>
        </Pop>
      )}
      {showBookingForm && (
        <Pop wide onClose={() => setShowBookingForm(false)} label="حجز جديد">
          <div className="wa-legacy">
            <BookingForm
              activities={activities}
              locations={locations}
              staffList={staffList}
              onSubmit={handleCreateBooking}
              onCancel={() => setShowBookingForm(false)}
              userRole={user.role}
              username={user.username}
            />
          </div>
        </Pop>
      )}
      {showEditForm && (
        <Pop wide onClose={() => setShowEditForm(null)} label="تعديل النشاط">
          <div className="wa-legacy">
            <EditActivityForm activity={showEditForm} locations={locations} onSubmit={handleEditActivity} onCancel={() => setShowEditForm(null)} />
          </div>
        </Pop>
      )}
    </div>
  );
}
