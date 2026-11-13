'use client';

// ══════════════════════════════════════════════════════
// اللاعبون — القائمة (+ تبويب قيود الجلوس)
//
// الترشيحُ والترتيبُ على المتصفّح كما كانا، والجلبُ واحد: GET /api/player/all[?cityId=].
// القطع في ./components — والأنماط الخاصّة في ./players.css (بادئة pl-).
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownWideNarrow, ArrowUpNarrowWide, Ellipsis, Search, SearchX, UserRound, Users,
} from 'lucide-react';
import { swalConfirm, swalToast } from '@/lib/swal';
import { withCity } from '@/hooks/useCities';
import { useAdminScope } from '../scope-context';
import '../whatsapp/wa.css';
import './players.css';
import { Chip, Empty, Pop, Skel } from '../whatsapp/wa-ui';
import {
  ACTIVITY_BUCKETS, FLAGS, ROLES, SORTS, activityBucket, apiFetch, compareBy, lastActiveCell, may,
  readRole, toWaNumber, winRate,
  type ActivityBucket, type PlayerActions, type SortDir,
} from './components/shared';
import { Avatar, CallLink, PlayerPanel, RankLine, StatusBadges, WaLink } from './components/PlayerBits';
import { AttemptsPop, ReasonPop, TransferPop } from './components/PlayerDialogs';
import SeatingRules from './components/SeatingRules';

const PAGE_SIZE = 25;

function useMedia(query: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

/** عرضُ عنصرٍ بالبكسل — القائمةُ تختار «جدول أم بطاقات» من عرضها هي لا من عرض الشاشة،
 *  فالشريطُ الجانبيّ للوحة الإدارة يأكل ٢٦٠ بكسلاً والجدولُ لا يتمرّر أفقيّاً. */
function useWidth(el: HTMLElement | null): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

/** أضيقُ عرضٍ يتّسع فيه الجدول (بلا خانة الهاتف) */
const TABLE_MIN = 640;

export default function PlayersManagementPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(readRole()); }, []);
  const canAct = may(role, ROLES.actions);

  const isPhone = useMedia('(max-width: 767px)');
  const isWide = useMedia('(min-width: 1200px)');

  // ── التبويب: القائمة | قيود الجلوس (?view=seating يفتح الثاني مباشرةً) ──
  const [view, setView] = useState<'list' | 'seating'>('list');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'seating') setView('seating');
  }, []);
  const switchView = (v: 'list' | 'seating') => {
    setView(v);
    const u = new URL(window.location.href);
    if (v === 'seating') u.searchParams.set('view', 'seating'); else u.searchParams.delete('view');
    window.history.replaceState(null, '', u);
  };

  // 🏙️ الرتبةُ المعروضةُ بمدينتها: الافتراضيّ من مبدّل النطاق، ويتجاوزه المستعمل هنا.
  //    «الكلّ» يعرض المدينةَ الأساسيّة لكلّ لاعب (سلوك الخادم بلا cityId).
  const scope = useAdminScope();
  const [cityOverride, setCityOverride] = useState<number | null | undefined>(undefined);
  const cityFilter: number | null = cityOverride === undefined ? scope.cityId : cityOverride;
  useEffect(() => { setCityOverride(undefined); }, [scope.cityId]);
  const cityFilterName = cityFilter == null ? null : (scope.cities.find(c => c.id === cityFilter)?.name || null);

  const [search, setSearch] = useState('');
  const [fActivity, setFActivity] = useState<ActivityBucket | null>(null);
  const [fFlags, setFFlags] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lockId, setLockId] = useState<number | null>(null);
  const [geoId, setGeoId] = useState<number | null>(null);
  const [transfer, setTransfer] = useState<{ id: number; detail: string } | null>(null);
  // 📍 محاولاتُ الدخول على حسابٍ مقفول — تُجلب عند الطلب لا مع القائمة
  const [attemptsFor, setAttemptsFor] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<any[] | null>(null);

  // عنصرُ القائمة في الحالة لا في ref: يُفكّ ويُركَّب مع تبديل التبويب، والمراقِبُ يتبعه
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const listWidth = useWidth(listEl);
  const asCards = isPhone || (listWidth > 0 && listWidth < TABLE_MIN);

  const showToast = (msg: string, type: 'success' | 'error') => swalToast(msg, type);

  // ── الجلب ──
  async function loadPlayers(background = false) {
    if (!background) setLoading(true);
    try {
      const data = await apiFetch(withCity('/api/player/all', cityFilter));
      setPlayers(data.players || []);
    } catch (err: any) {
      showToast(err.message || 'خطأ في جلب اللاعبين', 'error');
    } finally {
      if (!background) setLoading(false);
    }
  }
  // 🔴 يُنتظر `ready` كي لا يُجلب مرّتين؛ ويُعاد الجلبُ حين تتبدّل المدينة
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (scope.ready) loadPlayers(); }, [scope.ready, cityFilter]);

  const patch = (id: number, fn: (p: any) => any) => setPlayers(prev => prev.map(p => (p.id === id ? fn(p) : p)));
  const byId = (id: number | null) => (id == null ? null : players.find(p => p.id === id) || null);

  // ══════════════════════════════════════════════════════
  // الإجراءات — المساراتُ نفسُها، وكلُّها adminOnly على الخادم
  // ══════════════════════════════════════════════════════

  async function handleResetPassword(player: any) {
    if (!(await swalConfirm(`هل تريد إعادة تعيين كلمة مرور «${player.name}» إلى الافتراضية (1234)؟`))) return;
    setBusy(`${player.id}:pwd`);
    try {
      await apiFetch(`/api/player/${player.id}/reset-password`, { method: 'POST' });
      showToast(`تم إعادة تعيين كلمة مرور ${player.name}`, 'success');
      loadPlayers(true);
    } catch (err: any) {
      showToast(err.message || 'فشل إعادة التعيين', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function simpleToggle(player: any, k: string, path: string, field: string, onMsg: string, offMsg: string) {
    setBusy(`${player.id}:${k}`);
    try {
      await apiFetch(`/api/player/${player.id}/${path}`, { method: 'POST' });
      patch(player.id, p => ({ ...p, [field]: !p[field] }));
      showToast(`${player.name}: ${player[field] ? offMsg : onMsg}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setBusy(null);
    }
  }
  const handleToggleTest = (p: any) => simpleToggle(p, 'test', 'toggle-test', 'isTestAccount', 'تم تفعيل حساب الاختبار', 'تم إلغاء حساب الاختبار');
  const handleToggleFree = (p: any) => simpleToggle(p, 'free', 'toggle-free', 'isFreeAccount', 'تم تفعيل الحساب المجاني', 'تم إلغاء الحساب المجاني');
  const handleToggleHost = (p: any) => simpleToggle(p, 'host', 'toggle-host-remote', 'canHostRemote', 'تم منح صلاحيّة إنشاء الغرف أونلاين', 'تم سحب صلاحيّة إنشاء الغرف أونلاين');

  // ── إعفاء سياج الموقع ──
  // السبب يُطلب عند المنح وحده: إعفاءٌ بلا سببٍ مكتوب يصير بعد شهرٍ لغزاً لا يعرف
  // أحدٌ أيُسحَب أم يُترك. والسحب لا يحتاج سبباً — العودة للأصل لا تُبرّر.
  async function doToggleGeofence(player: any, reason: string) {
    setBusy(`${player.id}:geo`);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-geofence-exempt`, {
        method: 'POST', body: JSON.stringify({ reason }),
      });
      patch(player.id, p => ({
        ...p, geofenceExempt: !p.geofenceExempt,
        geofenceExemptReason: p.geofenceExempt ? '' : (reason || 'جهاز لا يُنتج قراءة موقع'),
      }));
      showToast(`${player.name}: ${player.geofenceExempt ? 'تمّ سحب إعفاء الموقع' : 'أُعفي من سياج الموقع'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setBusy(null);
    }
  }
  function handleToggleGeofence(player: any) {
    if (!player.geofenceExempt) setGeoId(player.id);
    else void doToggleGeofence(player, '');
  }

  // ── 🔒 قفلُ الحساب وفكُّه ──
  // السبب يُطلب عند القفل وحده: الفكُّ عودةٌ إلى الأصل ولا يحتاج تبريراً، والقفلُ
  // قرارٌ يقرؤه غيرُك بعد أسبوعٍ فيحتاج أن يعرف لِمَ.
  async function doToggleLock(player: any, reason: string) {
    setBusy(`${player.id}:lock`);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-lock`, {
        method: 'POST', body: JSON.stringify({ reason }),
      });
      patch(player.id, p => ({ ...p, isLocked: !p.isLocked, lockedReason: p.isLocked ? '' : reason }));
      showToast(`${player.name}: ${player.isLocked ? 'فُكّ القفل' : 'قُفل الحساب'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setBusy(null);
    }
  }
  async function handleToggleLock(player: any) {
    if (!player.isLocked) { setLockId(player.id); return; }
    const ok = await swalConfirm(
      `سيعود «${player.name}» إلى الدخول فوراً.`,
      { title: 'فكّ القفل', confirmText: 'نعم، افكّه', icon: 'question' },
    );
    if (ok) void doToggleLock(player, '');
  }

  async function showLockAttempts(player: any) {
    setAttemptsFor(player); setAttempts(null);
    try {
      const d = await apiFetch(`/api/player/${player.id}/lock-attempts`);
      setAttempts(Array.isArray(d?.attempts) ? d.attempts : []);
    } catch {
      setAttempts([]);
    }
  }

  // ── الحذف ──
  // 🪙 اللاعب الذي له سجلّ مالي (حركات تشبس أو إيجارات) لا يُحذف بلا جواب عن سؤال
  //    «أين يذهب ماله؟». الخادم يردّ 409 يسمّي الأرقام، ونعرض هنا مسار النقل إلى
  //    الحساب الباقي — وإلا صار الحارس جداراً بلا باب.
  function forget(id: number) {
    setPlayers(prev => prev.filter(p => p.id !== id));
    setMenuId(m => (m === id ? null : m));
    setSelectedId(s => (s === id ? null : s));
  }

  async function handleDeletePlayer(player: any) {
    if (!(await swalConfirm(
      `هل تريد حذف اللاعب «${player.name}» نهائياً؟\nلن يمكن استرجاع الحساب.`,
      { title: 'حذف الحساب', confirmText: 'نعم، احذفه', danger: true },
    ))) return;
    setBusy(`${player.id}:del`);
    try {
      await apiFetch(`/api/player/${player.id}`, { method: 'DELETE' });
      forget(player.id);
      showToast(`تم حذف ${player.name}`, 'success');
    } catch (err: any) {
      const chips = err?.body?.chips;
      const isChipsBlock = err?.code === 'CHIPS_HISTORY' || /سجلّ مالي/.test(String(err?.message || ''));
      if (!isChipsBlock) {
        showToast(err.message || 'فشل حذف اللاعب', 'error');
        return;
      }
      setTransfer({
        id: player.id,
        detail: chips
          ? `${chips.ledgerRows} حركة · ${chips.rentals} إيجار · رصيد ${chips.balance} تشبس`
          : 'له سجلّ مالي',
      });
    } finally {
      setBusy(null);
    }
  }

  async function confirmTransfer(player: any, toId: number) {
    const dest = players.find(p => p.id === toId);
    if (!(await swalConfirm(
      `نقل سجلّ «${player.name}» المالي إلى ${dest ? `«${dest.name}» (#${toId})` : `الحساب #${toId}`} ثم حذف حسابه؟\n\n`
      + 'الحركات والإيجارات تنتقل، والرصيد يُعاد احتسابه من الدفتر. لا رجعة.',
      { title: 'نقل ثمّ حذف', confirmText: 'نعم، انقل واحذف', danger: true },
    ))) return;
    setBusy(`${player.id}:del`);
    try {
      await apiFetch(`/api/player/${player.id}?transferTo=${toId}`, { method: 'DELETE' });
      setTransfer(null);
      forget(player.id);
      showToast(`حُذف ${player.name} ونُقل سجلّه المالي`, 'success');
    } catch (e2: any) {
      showToast(e2.message || 'فشل النقل والحذف', 'error');
    } finally {
      setBusy(null);
    }
  }

  const actions: PlayerActions = {
    busy,
    resetPassword: handleResetPassword,
    toggleLock: handleToggleLock,
    showAttempts: showLockAttempts,
    toggleFree: handleToggleFree,
    toggleTest: handleToggleTest,
    toggleHost: handleToggleHost,
    toggleGeofence: handleToggleGeofence,
    remove: handleDeletePlayer,
  };

  // ══════════════════════════════════════════════════════
  // 🔎 الترشيح
  //
  // 🔴 بين الشرائح «و» لا «أو»: شرطان معاً يضيّقان لا يوسّعان.
  // 🔴 و`skip` هو جوهرُ العدّادات: عدُّ شريحةٍ يُحسب على المجموعة مرشَّحةً بكلّ شيءٍ
  //    **إلّا شرطَها**. فالرقمُ يقول «ما ستراه لو ضغطتَ هنا» لا «ما تراه الآن».
  // ══════════════════════════════════════════════════════
  const q = search.trim().toLowerCase();
  const qId = q.replace(/^#/, '');
  const qDigits = q.replace(/\D/g, '');

  const matchesSearch = (p: any) => {
    if (!q) return true;
    if (p.name?.toLowerCase().includes(q) || p.phone?.includes(q)) return true;
    if (/^\d+$/.test(qId) && String(p.id) === qId) return true;
    // رقمٌ كُتب بالصيغة الدوليّة أو بفراغات
    if (qDigits.length < 4 || qDigits !== q.replace(/[\s+\-()]/g, '')) return false;
    return String(p.phone || '').replace(/\D/g, '').includes(qDigits) || !!toWaNumber(p.phone)?.includes(qDigits);
  };

  const matchesFilters = (p: any, skip?: string) => {
    if (!matchesSearch(p)) return false;
    if (skip === 'all') return true;
    if (skip !== 'activity' && fActivity && activityBucket(p) !== fActivity) return false;
    for (const f of FLAGS) {
      if (skip === f.key) continue;
      if (fFlags[f.key] && !p[f.key]) return false;
    }
    return true;
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const b of ACTIVITY_BUCKETS) c[b.key] = 0;
    for (const f of FLAGS) c[f.key] = 0;
    for (const p of players) {
      if (!matchesSearch(p)) continue;
      c.all++;
      if (matchesFilters(p, 'activity')) c[activityBucket(p)]++;
      for (const f of FLAGS) if (p[f.key] && matchesFilters(p, f.key)) c[f.key]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, q, fActivity, fFlags]);

  // 🔴 الترتيبُ **بعد** الترشيح: المستعمل يقرأ «الأوّل» على أنّه أوّلُ ما يراه لا أوّلَ القاعدة.
  const filtered = useMemo(() => {
    const rows = players.filter(p => matchesFilters(p));
    return sort ? [...rows].sort(compareBy(SORTS[sort.key], sort.dir)) : rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, q, fActivity, fFlags, sort]);

  const activeFilterCount = (fActivity ? 1 : 0) + FLAGS.filter(f => fFlags[f.key]).length;
  const clearFilters = () => { setFActivity(null); setFFlags({}); };
  const clearAll = () => { clearFilters(); setSearch(''); };

  // ── الصفحات ──
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 🔴 العودةُ للصفحة الأولى عند أيّ تضييق: البقاءُ في الصفحة ٧ بعد ترشيحٍ يترك ٤٠
  //    نتيجةً يعني شاشةً فارغةً يظنّها المستعمل «لا نتائج».
  useEffect(() => { setCurrentPage(1); }, [search, fActivity, fFlags, sort, cityFilter]);

  const goPage = (n: number) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, n)));
    listEl?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  const activeWeek = useMemo(() => players.filter(p => activityBucket(p) === 'w1').length, [players]);
  const selected = isWide ? byId(selectedId) : null;
  const menuPlayer = byId(menuId);
  const lockPlayer = byId(lockId);
  const geoPlayer = byId(geoId);
  const transferPlayer = transfer ? byId(transfer.id) : null;

  const moreBtn = (p: any) => (
    <button type="button" className="wa-iconbtn" aria-label={`إجراءات ${p.name}`} title="إجراءات أخرى"
      onClick={e => { e.stopPropagation(); setMenuId(p.id); }}>
      <Ellipsis />
    </button>
  );

  return (
    <div className="wa pl-root" dir="rtl" style={{ background: 'transparent' }}>
      {/* ═══ الرأس ═══ */}
      <header className="pl-head">
        <div>
          <h1>اللاعبون</h1>
          <p>
            {loading && !players.length ? 'جارٍ التحميل…' : (
              <><span className="ltr">{players.length}</span> حساباً · <span className="ltr">{activeWeek}</span> نشطاً هذا الأسبوع</>
            )}
          </p>
        </div>
        <nav className="pl-tabs" aria-label="أقسام اللاعبين">
          <button type="button" className="pl-tab" aria-current={view === 'list' ? 'page' : undefined} onClick={() => switchView('list')}>القائمة</button>
          {may(role, ROLES.seating) && (
            <button type="button" className="pl-tab" aria-current={view === 'seating' ? 'page' : undefined} onClick={() => switchView('seating')}>قيود الجلوس</button>
          )}
          {may(role, ROLES.map) && <Link className="pl-tab" href="/admin/players/map">الخريطة</Link>}
          {may(role, ROLES.consents) && <Link className="pl-tab" href="/admin/players/consents">الموافقات</Link>}
          {may(role, ROLES.contacts) && <Link className="pl-tab" href="/admin/players/contacts">جهات الاتصال</Link>}
        </nav>
      </header>

      {view === 'seating' && may(role, ROLES.seating) ? (
        loading && !players.length
          ? <Skel h={160} />
          : <SeatingRules players={players} setPlayers={setPlayers} showToast={showToast} onLoadPlayers={loadPlayers} />
      ) : (
        <>
          {/* ═══ البحث والمدينة والترتيب ═══ */}
          <div className="pl-tools">
            <div className="pl-toolrow">
              <div className="wa-search pl-search">
                <Search />
                <input className="wa-input" type="search" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="اسم أو رقم هاتف أو رقم اللاعب" aria-label="بحث في اللاعبين" />
              </div>

              {/* 🏙️ مفتاح المدينة — يحدّد أيّ رتبةٍ وأرقامٍ تُعرض */}
              <div className="pl-ctl">
                <span className="pl-ctl-l" id="pl-city-l">مدينة الرتبة</span>
                <div className="wa-seg pl-cityseg" role="group" aria-labelledby="pl-city-l">
                  <button type="button" aria-pressed={cityFilter === null} onClick={() => setCityOverride(null)}>الكلّ</button>
                  {scope.cities.map(c => (
                    <button type="button" key={c.id} aria-pressed={cityFilter === c.id} onClick={() => setCityOverride(c.id)}>{c.name}</button>
                  ))}
                </div>
              </div>

              <div className="pl-ctl">
                <label className="pl-ctl-l" htmlFor="pl-sort">الترتيب</label>
                <div className="row">
                  <select id="pl-sort" className="wa-select pl-sortsel" value={sort?.key || ''}
                    onChange={e => { const k = e.target.value; setSort(k ? { key: k, dir: SORTS[k].first } : null); }}>
                    <option value="">الأحدث تسجيلاً</option>
                    {Object.values(SORTS).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button type="button" className="wa-iconbtn pl-dirbtn" disabled={!sort}
                    onClick={() => setSort(s => (s ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s))}
                    title={!sort ? 'اختر ترتيباً أوّلاً' : sort.dir === 'asc' ? 'تصاعديّ — اضغط للعكس' : 'تنازليّ — اضغط للعكس'}
                    aria-label={!sort ? 'اتّجاه الترتيب' : sort.dir === 'asc' ? 'تصاعديّ، اضغط للعكس' : 'تنازليّ، اضغط للعكس'}>
                    {sort?.dir === 'asc' ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
                  </button>
                </div>
              </div>
            </div>

            {/* ═══ الشرائح — بدل قائمتَي «▼» وبطاقات الأرقام ═══ */}
            <div className="pl-chips" role="group" aria-label="ترشيح اللاعبين">
              <Chip on={activeFilterCount === 0} onClick={clearFilters} n={counts.all}>الكلّ</Chip>
              {ACTIVITY_BUCKETS.map(b => (
                <Chip key={b.key} on={fActivity === b.key} n={counts[b.key]}
                  onClick={() => setFActivity(prev => (prev === b.key ? null : b.key))}>
                  <i className={`wa-dot pl-dot ${b.dot}`} aria-hidden="true" />{b.label}
                </Chip>
              ))}
              <span className="pl-chipsep" aria-hidden="true" />
              {FLAGS.map(f => {
                const Icon = f.icon;
                return (
                  <Chip key={f.key} on={!!fFlags[f.key]} n={counts[f.key]}
                    onClick={() => setFFlags(prev => ({ ...prev, [f.key]: !prev[f.key] }))}>
                    <Icon className="s" />{f.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          {/* ═══ القائمة + اللوح الجانبيّ ═══ */}
          <div className={`pl-body${isWide ? ' has-side' : ''}`}>
            <div className="wa-card pl-listcard" ref={setListEl}>
              {loading ? (
                <div className="pl-skel">{Array.from({ length: 8 }, (_, i) => <Skel key={i} h={48} />)}</div>
              ) : filtered.length === 0 ? (
                players.length === 0 ? (
                  <Empty icon={<Users />} title="لا لاعبين مسجّلين" />
                ) : (
                  <Empty icon={<SearchX />} title="لا نتائج مطابقة">
                    {q ? 'لا أحد يطابق البحث مع الشرائح المختارة.' : 'لا أحد يطابق الشرائح المختارة معاً.'}
                    <button type="button" className="wa-btn sm pl-clear" onClick={clearAll}>امسح المرشِّحات</button>
                  </Empty>
                )
              ) : asCards ? (
                /* ── الهاتف (وكلّ عرضٍ لا يتّسع للجدول): بطاقات ── */
                <div>
                  {pageRows.map(p => {
                    const act = lastActiveCell(p);
                    return (
                      <div className="pl-card" key={p.id}>
                        <Avatar p={p} />
                        <Link className="pl-t" href={`/admin/players/${p.id}`}>
                          <b className="trunc">{p.name}</b>
                          <span className="pl-sub trunc">
                            {act.main} · <span className="ltr">{p.totalMatches || 0}</span> مباراة
                            {cityFilter != null && Array.isArray(p.standings) && !p.standings.some((s: any) => Number(s.cityId) === cityFilter)
                              ? ` · لم يلعب في ${cityFilterName || 'هذه المدينة'}` : ''}
                          </span>
                          {FLAGS.some(f => p[f.key]) && <StatusBadges p={p} max={2} />}
                        </Link>
                        <WaLink phone={p.phone} name={p.name} />
                        {moreBtn(p)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── الحاسوب: جدول ── */
                <table className="wa-table pl-table">
                  <thead>
                    <tr>
                      <th>اللاعب</th>
                      <th className="pl-col-phone">الهاتف</th>
                      <th>آخر نشاط</th>
                      <th>المباريات</th>
                      <th>الحالة</th>
                      <th className="pl-col-acts"><span className="pl-vh">إجراءات</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(p => {
                      const act = lastActiveCell(p);
                      const on = isWide && selectedId === p.id;
                      return (
                        <tr key={p.id} className={`pl-row${isWide ? ' pick' : ''}`} aria-selected={isWide ? on : undefined}
                          tabIndex={isWide ? 0 : undefined}
                          onClick={isWide ? () => setSelectedId(p.id) : undefined}
                          onDoubleClick={isWide ? () => router.push(`/admin/players/${p.id}`) : undefined}
                          onKeyDown={isWide ? e => { if (e.key === 'Enter' && e.target === e.currentTarget) setSelectedId(p.id); } : undefined}>
                          <td>
                            <span className="row" style={{ gap: 12 }}>
                              <Avatar p={p} size="sm" />
                              <span className="grow">
                                {isWide
                                  ? <b className="pl-name trunc">{p.name}</b>
                                  : <Link className="pl-name trunc" href={`/admin/players/${p.id}`}>{p.name}</Link>}
                                <RankLine p={p} cityFilter={cityFilter} cityFilterName={cityFilterName} />
                              </span>
                            </span>
                          </td>
                          <td className="pl-col-phone"><span className="ltr">{p.phone || '—'}</span></td>
                          <td title={act.title}>
                            <span className="pl-act">
                              <i className={`wa-dot pl-dot ${act.dot}`} aria-hidden="true" />
                              <span className={act.kind === 'none' || act.kind === 'played' ? 'muted' : undefined}>{act.main}</span>
                            </span>
                            {act.sub && <span className="pl-sub">{act.sub}</span>}
                          </td>
                          <td>
                            {p.totalMatches > 0 ? (
                              <>
                                <span className="ltr">{p.totalMatches}</span> مباراة
                                <span className="pl-sub">فوز <span className="ltr">{winRate(p)}%</span></span>
                              </>
                            ) : <span className="muted">لم يلعب</span>}
                          </td>
                          <td><StatusBadges p={p} /></td>
                          <td className="pl-col-acts">
                            <span className="pl-acts">
                              <WaLink phone={p.phone} name={p.name} />
                              <CallLink phone={p.phone} name={p.name} />
                              {moreBtn(p)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {!loading && filtered.length > 0 && (
                <div className="pl-pager">
                  <span className="muted grow">
                    <span className="ltr">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</span> من <span className="ltr">{filtered.length}</span>
                    {filtered.length !== players.length && <> (الكلّ <span className="ltr">{players.length}</span>)</>}
                  </span>
                  {totalPages > 1 && (
                    <>
                      <span className="muted pl-pageno"><span className="ltr">{page} / {totalPages}</span></span>
                      <button type="button" className="wa-btn sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>السابق</button>
                      <button type="button" className="wa-btn sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>التالي</button>
                    </>
                  )}
                </div>
              )}
            </div>

            {isWide && (
              <aside className={`wa-card pl-side${selected ? ' on' : ''}`} aria-label="ملخّص اللاعب المختار">
                {selected ? (
                  <PlayerPanel p={selected} cityFilter={cityFilter} cityFilterName={cityFilterName} actions={actions} canAct={canAct} />
                ) : (
                  <Empty icon={<UserRound />} title="اختر لاعباً">اضغط صفّاً لترى ملخّصه وإجراءاته هنا.</Empty>
                )}
              </aside>
            )}
          </div>
        </>
      )}

      {/* ═══ «⋯» — كلّ إجراءات اللاعب ═══ */}
      {menuPlayer && (
        <Pop title={menuPlayer.name} onClose={() => setMenuId(null)}>
          <PlayerPanel p={menuPlayer} cityFilter={cityFilter} cityFilterName={cityFilterName} actions={actions} canAct={canAct} compact />
        </Pop>
      )}

      {lockPlayer && (
        <ReasonPop
          title="قفل الحساب"
          danger
          confirmText="اقفل الحساب"
          label="السبب (يظهر في السجلّ ولا يراه اللاعب)"
          hint="اختياريّ — لكنّ مَن يقرأ القفل بعد أسبوع يحتاج أن يعرف لِمَ."
          intro={(
            <>
              <p>لن يستطيع «{lockPlayer.name}» تسجيل الدخول، وستُقطع جلستُه الحاليّة فوراً.</p>
              <p>ولا تُخبره الشاشةُ بالسبب — يرى «حدث خطأ، يرجى التواصل مع الإدارة.» فقط.</p>
              <p>الحسابُ وبياناتُه تبقى كما هي، والفكُّ بضغطةٍ واحدة.</p>
            </>
          )}
          onCancel={() => setLockId(null)}
          onConfirm={reason => { setLockId(null); void doToggleLock(lockPlayer, reason); }}
        />
      )}

      {geoPlayer && (
        <ReasonPop
          title="إعفاء من سياج الموقع"
          confirmText="نعم، أعفِه"
          label="السبب (يظهر في السجلّ)"
          initial="iOS — الجهاز لا يُنتج قراءة موقع"
          intro={(
            <>
              <p>سيدخل «{geoPlayer.name}» الغرف بلا فحص موقع إطلاقاً — في كلّ فعاليّة، حتّى إن كان خارج المكان.</p>
              <p>امنحه لمن لا يُنتج جهازُه قراءة موقع، لا لمن يتعذّر عليه الحضور.</p>
            </>
          )}
          onCancel={() => setGeoId(null)}
          onConfirm={reason => { setGeoId(null); void doToggleGeofence(geoPlayer, reason); }}
        />
      )}

      {transfer && transferPlayer && (
        <TransferPop
          player={transferPlayer}
          detail={transfer.detail}
          players={players}
          onCancel={() => setTransfer(null)}
          onConfirm={toId => { void confirmTransfer(transferPlayer, toId); }}
        />
      )}

      {attemptsFor && <AttemptsPop player={attemptsFor} attempts={attempts} onClose={() => setAttemptsFor(null)} />}
    </div>
  );
}
