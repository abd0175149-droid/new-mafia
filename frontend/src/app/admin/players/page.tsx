'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import WhatsAppButton from '@/components/WhatsAppButton';
import { swalConfirm } from '@/lib/swal';
import { useAdminScope } from '../scope-context';
import CityBadge, { CitySegment } from '@/components/admin/CityBadge';
import { withCity } from '@/hooks/useCities';
import { RANK_ORDER, rankName, rankBadge, rankColor } from '@/lib/ranks';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `API error ${res.status}`);
  }
  return res.json();
}

function fmtDate(d: any) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(d: any) {
  if (!d) return '—';
  const dt = new Date(d);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
  return `${fmtDate(d)} ${dt.toLocaleTimeString('en-US', timeOpts)}`;
}

// ══════════════════════════════════════════════════════
// 📡 «آخر نشاط» — ثلاثُ حالاتٍ لا تاريخٌ واحد
//
// 🔴 كان العمودُ يعرض تاريخاً لكلّ لاعبٍ بلا استثناء، وهو ما صنع الوهم: ٣٤٧
//    منها كانت لحظةَ إنشاء الحساب. والآن لا قيمةَ إلّا عن تفاعلٍ حقيقيّ،
//    والفراغُ يُقال صراحةً بدل أن يُملأ بتاريخٍ يُتّخذ عليه قرار.
//
// 🔴 و«لعب ولم يفتح التطبيق» ليست نقصاً في البيانات بل معلومةُ عمل: هؤلاء
//    زبائنُ حاضرون لا يصلهم إشعارٌ ولا رسالة — وهم أكبرُ فئةٍ في القاعدة.
// ══════════════════════════════════════════════════════
const PLATFORM_AR: Record<string, string> = {
  web: 'ويب', android: 'أندرويد', ios: 'آيفون', app: 'تطبيق',
};

function relativeAr(d: any): string {
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return '—';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 2) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `قبل ${h} س`;
  const days = Math.floor(h / 24);
  if (days < 30) return `قبل ${days} ي`;
  const mo = Math.floor(days / 30);
  return mo < 12 ? `قبل ${mo} شهر` : `قبل ${Math.floor(mo / 12)} سنة`;
}

// ══════════════════════════════════════════════════════
// 🔴 مصنِّفٌ واحدٌ يخدم العمودَ والمرشِّحَ معاً.
//
//    لو رشّح المرشِّحُ بحسابٍ خاصٍّ به لاختلف عن العمود عند أوّل حدّ: تُرشّح
//    «نشط» فترى صفوفاً صفراء، أو يقول العدّادُ ١٢ ويظهر ١١. الفصلُ بينهما
//    عطبٌ لا يُكتشف إلّا بعد أن يفقد أحدٌ ثقتَه بالشاشة كلِّها.
// ══════════════════════════════════════════════════════
const ACTIVITY_BUCKETS = [
  { key: 'w1',     label: 'نشط — آخر ٧ أيّام',  color: '#34d399' },
  { key: 'm1',     label: 'خلال ٣٠ يوماً',       color: '#fbbf24' },
  { key: 'old',    label: 'أقدم من ٣٠ يوماً',    color: '#9ca3af' },
  { key: 'played', label: 'لعب ولم يفتح التطبيق', color: '#c084fc' },
  { key: 'none',   label: 'حساب غير مستعمَل',    color: '#6b7280' },
] as const;

type ActivityBucket = typeof ACTIVITY_BUCKETS[number]['key'];

function activityBucket(p: any): ActivityBucket {
  if (p.lastActiveAt) {
    const days = (Date.now() - new Date(p.lastActiveAt).getTime()) / 86400000;
    return days <= 7 ? 'w1' : days <= 30 ? 'm1' : 'old';
  }
  return (p.totalMatches || 0) > 0 ? 'played' : 'none';
}

function lastActiveCell(p: any) {
  const b = activityBucket(p);
  const color = ACTIVITY_BUCKETS.find(x => x.key === b)!.color;
  if (b === 'w1' || b === 'm1' || b === 'old') {
    return { kind: b, color, main: relativeAr(p.lastActiveAt),
             sub: PLATFORM_AR[p.lastActivePlatform] || '',
             title: fmtDateTime(p.lastActiveAt) };
  }
  if (b === 'played') {
    return { kind: b, color, main: 'لم يفتح التطبيق', sub: `${p.totalMatches} مباراة`,
             title: 'لعب فعلاً ولا أثرَ رقميّ — لا يصله إشعار' };
  }
  return { kind: b, color, main: '—', sub: 'حساب غير مستعمَل',
           title: 'لا تفاعلَ ولا مباريات' };
}

// ══════════════════════════════════════════════════════
// 🎛️ أعمدةُ الإجراءات — كلٌّ منها علمٌ ثنائيّ
//
// 🔴 ثلاثيّةُ الحال لا ثنائيّة: «الكلّ · نعم · لا». وبلا «لا» لا يمكن سؤالُ
//    «مَن ليس مجّانيّاً» إلّا بقلب الشاشة يدويّاً — وهو نصفُ الأسئلة عمليّاً.
// ══════════════════════════════════════════════════════
const ACTION_FLAGS = [
  { key: 'isTestAccount',  icon: '🧪', label: 'حساب اختبار',      yes: 'اختبار',  no: 'غير اختبار' },
  { key: 'isFreeAccount',  icon: '🏷️', label: 'حساب مجّاني',       yes: 'مجّاني',   no: 'غير مجّاني' },
  { key: 'canHostRemote',  icon: '🌐', label: 'استضافة أونلاين',  yes: 'يستضيف',  no: 'لا يستضيف' },
  { key: 'geofenceExempt', icon: '📍', label: 'إعفاء السياج',      yes: 'مُعفى',    no: 'غير مُعفى' },
  { key: 'isLocked',       icon: '🔒', label: 'حالة الحساب',       yes: 'مقفول',   no: 'مفتوح' },
] as const;

type FlagState = 'yes' | 'no' | null;

// ══════════════════════════════════════════════════════
// 🔽 قائمةُ ترشيحٍ في رأس العمود
//
// 🔴 موضعُها `fixed` محسوبٌ من موضع الزرّ، لا `absolute` داخل الخليّة:
//    حاويةُ الجدول `overflow-hidden` (لتستدير حوافّها)، فقائمةٌ داخلها تُقصّ
//    عند أوّل صفٍّ — تظهر نصفَ قائمةٍ بلا سببٍ ظاهر.
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// ↕️ ترتيبُ الأعمدة
//
// 🔴 «المجهول» يبقى في الذيل في الاتّجاهين. لاعبٌ بلا «آخر نشاط» ليس أقدمَ
//    الناس ولا أحدثَهم — لا قيمةَ له أصلاً. ولو عومل صفراً لتصدّر ٢٨٧ صفّاً
//    فارغاً ترتيبَ «الأقدم» وأخفى مَن يُسأل عنهم فعلاً.
//
// 🔴 واتّجاهُ النقرة الأولى يختلف بالنوع: الأرقامُ والتواريخ تنازليّاً (الأكثرُ
//    والأحدثُ أوّلاً)، والنصوصُ تصاعديّاً (أ ← ي). النقرةُ الأولى يجب أن تُظهر
//    ما يريده الناسُ عادةً، لا أن تُجبرهم على نقرتين.
//
// 🔴 والمعرّفُ فاصلٌ أخير دائماً: بلاه تتبادل الصفوفُ المتساوية مواضعَها بين
//    عرضٍ وآخر — كلَّما بُدّل علمٌ أو وصل استطلاعٌ جديد.
// ══════════════════════════════════════════════════════
// 🔴 ترتيبُ الرتب من `@/lib/ranks` — النسخةُ المحلّيّة كانت تحمل رتبةً سادسةً لا وجودَ لها

type SortDir = 'asc' | 'desc';
interface SortDef {
  key: string;
  /** القيمةُ المقارَنة — `null` تعني «مجهول» فيُذيَّل دائماً */
  get: (p: any) => number | string | null;
  type: 'num' | 'text';
  first: SortDir;
  /** فاصلٌ ثانٍ حين تتساوى القيمة الأولى */
  tie?: (p: any) => number;
}

const digits = (v: any) => Number(String(v ?? '').replace(/\D/g, '')) || 0;

const SORTS: Record<string, SortDef> = {
  name:    { key: 'name',    type: 'text', first: 'asc',
             get: p => String(p.name || '').trim() || null },
  phone:   { key: 'phone',   type: 'num',  first: 'asc',
             get: p => (p.phone ? digits(p.phone) : null) },
  matches: { key: 'matches', type: 'num',  first: 'desc',
             get: p => p.totalMatches || 0 },
  // 🔴 يُرتَّب بعددِ الفوز لا بنسبته: العددُ هو الرقمُ الرئيسيّ في الخليّة،
  //    والنسبةُ بين قوسين. ولو رُتِّب بالنسبة لتصدّر مَن فاز مرّةً من مرّة.
  //    والنسبةُ فاصلٌ ثانٍ فقط.
  wins:    { key: 'wins',    type: 'num',  first: 'desc',
             get: p => p.totalWins || 0,
             tie: p => (p.totalMatches > 0 ? (p.totalWins || 0) / p.totalMatches : 0) },
  survived:{ key: 'survived', type: 'num', first: 'desc',
             get: p => p.totalSurvived || 0 },
  // 🔴 بترتيبِ التقدّم لا بأبجديّةِ الاسم: «الأب الروحي» قبل «الجندي» أبجديّاً
  //    وبعده رتبةً. ثمّ نقاطُ الرتبة ثمّ المستوى.
  rank:    { key: 'rank',    type: 'num',  first: 'desc',
             get: p => (RANK_ORDER[p.rankTier] || 1) * 1e9 + (p.rankRR || 0) * 1e3 + (p.level || 1) },
  // 🔴 الزمنُ نفسُه لا رقمُ الدلو: داخل «نشط» ترتيبٌ حقيقيّ بالساعات.
  //    والمجهولُ (٢٨٧ صفّاً) لا زمنَ له فيُذيَّل — ومع ذلك يُرتَّب بينه:
  //    مَن لعب قبل مَن لم يلعب، فالذيلُ نفسُه ليس عشوائيّاً.
  activity:{ key: 'activity', type: 'num', first: 'desc',
             get: p => (p.lastActiveAt ? new Date(p.lastActiveAt).getTime() : null),
             tie: p => (p.totalMatches || 0) },
  // 🔴 «الحالة» ترتيبُها بالحاجةِ إلى الانتباه: المقفولُ أوّلاً عند التنازليّ.
  status:  { key: 'status',  type: 'num',  first: 'desc',
             get: p => (p.isLocked ? 1 : 0) },
  // 🔴 «الإجراءات» خمسةُ أيقوناتٍ لا ترتيبَ طبيعيَّ لها. فالمفتاحُ الوحيد ذو
  //    المعنى: كم علماً خاصّاً على هذا الحساب — أيْ مَن خرج عن الإعداد الافتراضيّ.
  flags:   { key: 'flags',   type: 'num',  first: 'desc',
             get: p => ACTION_FLAGS.reduce((n, f) => n + (p[f.key] ? 1 : 0), 0) },
};

function compareBy(def: SortDef, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1;
  return (a: any, b: any) => {
    const va = def.get(a), vb = def.get(b);
    // المجهولُ في الذيل دائماً — لا يقلبه اتّجاهُ الترتيب
    if (va === null && vb === null) {
      const ta = def.tie?.(a) ?? 0, tb = def.tie?.(b) ?? 0;
      return (tb - ta) || (a.id - b.id);
    }
    if (va === null) return 1;
    if (vb === null) return -1;

    let d = def.type === 'text'
      ? String(va).localeCompare(String(vb), 'ar', { numeric: true, sensitivity: 'base' })
      : (va as number) - (vb as number);
    if (d === 0 && def.tie) d = def.tie(a) - def.tie(b);
    return d * sign || (a.id - b.id);
  };
}

/** رأسٌ قابلٌ للترتيب — نقرةٌ تُفعّل، ثانيةٌ تعكس، ثالثةٌ تُلغي. */
function SortHead({ id, label, sort, onSort, children }: {
  id: string; label: string;
  sort: { key: string; dir: SortDir } | null;
  onSort: (key: string) => void;
  children?: React.ReactNode;
}) {
  const on = sort?.key === id;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => onSort(id)}
        title={on ? (sort!.dir === 'asc' ? 'تصاعدي — اضغط للعكس' : 'تنازلي — اضغط للعكس') : 'رتّبْ'}
        className={`inline-flex items-center gap-1 transition ${
          on ? 'text-amber-400 font-bold' : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <span>{label}</span>
        {/* 🔴 سهامٌ لا مثلّثات: زرُّ الترشيح في نفس الرأس رمزُه ▼، ورمزان
            متطابقان يجعلان الزرَّين واحداً في العين. */}
        <span className="text-[10px] leading-none">
          {on ? (sort!.dir === 'asc' ? '↑' : '↓') : '⇅'}
        </span>
      </button>
      {children}
    </span>
  );
}

/** عرضُ القائمة — ثابتٌ هنا وفي CSS معاً كي لا يتفرّقا */
const MENU_W = 224;

function ColumnFilter({
  id, label, open, onOpen, active, options, onPick, onClear,
}: {
  id: string;
  label: string;
  open: boolean;
  onOpen: (id: string | null) => void;
  active: boolean;
  options: { key: string; label: string; count: number; color?: string; selected: boolean }[];
  onPick: (key: string) => void;
  onClear: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // 🔴 الحصرُ على الحافّتين لا على واحدة: `right` مسافةٌ من اليمين، فحصرُها
  //    بحدٍّ أدنى وحدَه يترك الحافّةَ اليسرى تخرج عن الشاشة — وقُصّ عمودُ
  //    الأعداد فعلاً، وهو أهمُّ ما في القائمة. الحدُّ الأعلى يضمن بقاءَ يسارها.
  useEffect(() => {
    if (!open || !btnRef.current) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const W = MENU_W, pad = 8, vw = window.innerWidth;
    const right = Math.min(Math.max(pad, vw - r.right), Math.max(pad, vw - W - pad));
    // ولو ضاقت الشاشةُ عن القائمة أسفلَ الزرّ، تُفتح فوقه بدل أن تُقصّ
    const below = r.bottom + 6;
    const top = below + 300 > window.innerHeight ? Math.max(8, r.top - 306) : below;
    setPos({ top, right });
  }, [open]);

  return (
    <span data-colfilter className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button
        ref={btnRef}
        onClick={() => onOpen(open ? null : id)}
        title={active ? 'مرشَّح — اضغط للتغيير' : 'ترشيح'}
        aria-expanded={open}
        className={`w-5 h-5 rounded flex items-center justify-center text-[10px] transition ${
          active ? 'bg-amber-500/20 text-amber-400' : 'text-gray-600 hover:text-gray-300'
        }`}
      >
        ▼
      </button>

      {open && pos && (
        <div
          data-colfilter
          className="fixed z-[120] w-56 rounded-xl border border-gray-700 bg-[#14161b] shadow-2xl overflow-hidden"
          style={{ top: pos.top, right: pos.right }}
        >
          <div className="max-h-72 overflow-y-auto py-1">
            {options.map(o => (
              <button
                key={o.key}
                onClick={() => { onPick(o.key); onOpen(null); }}
                disabled={o.count === 0 && !o.selected}
                className={`w-full flex items-center gap-2 px-3 py-2 text-right text-xs transition ${
                  o.selected ? 'bg-amber-500/10' : 'hover:bg-gray-700/40'
                } disabled:opacity-35 disabled:cursor-not-allowed`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: o.color || '#6b7280' }} />
                <span className={`flex-1 ${o.selected ? 'text-amber-400 font-bold' : 'text-gray-300'}`}>
                  {o.label}
                </span>
                <span className="font-mono text-[10.5px] text-gray-500 tabular-nums">{o.count}</span>
              </button>
            ))}
          </div>
          {active && (
            <button
              onClick={() => { onClear(); onOpen(null); }}
              className="w-full px-3 py-2 text-[11px] text-gray-400 hover:text-white border-t border-gray-700/70"
            >
              إلغاء ترشيح هذا العمود
            </button>
          )}
        </div>
      )}
    </span>
  );
}

// ── أسماءُ الرتب وشاراتُها وألوانُها من `@/lib/ranks` (rankName / rankBadge / rankColor) ──

export default function PlayersManagementPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 🏙️ الرتبةُ المعروضةُ بمدينتها: الافتراضيّ من مبدّل النطاق، ويتجاوزه المستعمل هنا.
  //    «الكلّ» يعرض المدينةَ الأساسيّة لكلّ لاعب (سلوك الخادم بلا cityId).
  const scope = useAdminScope();
  const [cityOverride, setCityOverride] = useState<number | null | undefined>(undefined);
  const cityFilter: number | null = cityOverride === undefined ? scope.cityId : cityOverride;
  useEffect(() => { setCityOverride(undefined); }, [scope.cityId]);
  const cityFilterName = cityFilter == null ? null : (scope.cities.find(c => c.id === cityFilter)?.name || null);
  const [search, setSearch] = useState('');
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [togglingTestId, setTogglingTestId] = useState<number | null>(null);
  const [togglingFreeId, setTogglingFreeId] = useState<number | null>(null);
  const [togglingHostId, setTogglingHostId] = useState<number | null>(null);
  const [togglingGeoId, setTogglingGeoId] = useState<number | null>(null);
  const [togglingLockId, setTogglingLockId] = useState<number | null>(null);
  // 📍 محاولاتُ الدخول على حسابٍ مقفول — تُجلب عند الطلب لا مع القائمة
  const [attemptsFor, setAttemptsFor] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<any[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ── Pagination ──
  const [fActivity, setFActivity] = useState<ActivityBucket | null>(null);
  const [fFlags, setFFlags] = useState<Record<string, FlagState>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // ── Load Players ──
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

  // ── Toast ──
  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Reset Password ──
  async function handleResetPassword(player: any) {
    if (!(await swalConfirm(`هل تريد إعادة تعيين كلمة مرور "${player.name}" إلى الافتراضية (1234)؟`))) return;
    setResettingId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/reset-password`, { method: 'POST' });
      showToast(`تم إعادة تعيين كلمة مرور ${player.name}`, 'success');
      loadPlayers();
    } catch (err: any) {
      showToast(err.message || 'فشل إعادة التعيين', 'error');
    } finally {
      setResettingId(null);
    }
  }

  // ── View Profile ──
  function handleViewProfile(playerId: number) {
    router.push(`/admin/players/${playerId}`);
  }

  // ── Delete Player ──
  //
  // 🪙 اللاعب الذي له سجلّ مالي (حركات تشبس أو إيجارات) لا يُحذف بلا جواب عن
  //    سؤال «أين يذهب ماله؟». الخادم يردّ 409 يسمّي الأرقام، ونحن نعرض هنا
  //    مسار النقل إلى الحساب الباقي — وإلا صار الحارس جداراً بلا باب.
  async function handleDeletePlayer(player: any) {
    if (!(await swalConfirm(`⚠️ هل تريد حذف اللاعب "${player.name}" نهائياً؟\nلن يمكن استرجاع الحساب.`))) return;
    try {
      await apiFetch(`/api/player/${player.id}`, { method: 'DELETE' });
      setPlayers(prev => prev.filter(p => p.id !== player.id));
      showToast(`تم حذف ${player.name}`, 'success');
      return;
    } catch (err: any) {
      const chips = err?.body?.chips || err?.chips;
      const isChipsBlock = err?.body?.code === 'CHIPS_HISTORY' || err?.code === 'CHIPS_HISTORY'
        || /سجلّ مالي/.test(String(err?.message || ''));
      if (!isChipsBlock) {
        showToast(err.message || 'فشل حذف اللاعب', 'error');
        return;
      }

      const detail = chips
        ? `${chips.ledgerRows} حركة · ${chips.rentals} إيجار · رصيد ${chips.balance} 🪙`
        : 'له سجلّ مالي';
      const target = window.prompt(
        `🪙 لا يُحذف «${player.name}» — ${detail}.\n\n`
        + 'اكتب معرّف الحساب الذي يُنقل إليه سجلّه المالي (الحساب الباقي بعد الدمج).\n'
        + 'اتركه فارغاً للإلغاء.',
      );
      const toId = parseInt(String(target || '').trim());
      if (!toId || isNaN(toId)) return;

      const dest = players.find((p: any) => p.id === toId);
      if (!(await swalConfirm(
        `نقل سجلّ «${player.name}» المالي إلى ${dest ? `«${dest.name}» (#${toId})` : `الحساب #${toId}`} ثم حذف حسابه؟\n\n`
        + 'الحركات والإيجارات تنتقل، والرصيد يُعاد احتسابه من الدفتر. لا رجعة.',
      ))) return;

      try {
        await apiFetch(`/api/player/${player.id}?transferTo=${toId}`, { method: 'DELETE' });
        setPlayers(prev => prev.filter(p => p.id !== player.id));
        showToast(`حُذف ${player.name} ونُقل سجلّه المالي`, 'success');
      } catch (e2: any) {
        showToast(e2.message || 'فشل النقل والحذف', 'error');
      }
    }
  }

  // ── Toggle Test Account ──
  async function handleToggleTestAccount(player: any) {
    setTogglingTestId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-test`, { method: 'POST' });
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, isTestAccount: !p.isTestAccount } : p));
      showToast(`${player.name}: ${player.isTestAccount ? 'تم إلغاء حساب الاختبار' : 'تم تفعيل حساب الاختبار'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setTogglingTestId(null);
    }
  }

  // ── Toggle Free Account ──
  async function handleToggleFreeAccount(player: any) {
    setTogglingFreeId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-free`, { method: 'POST' });
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, isFreeAccount: !p.isFreeAccount } : p));
      showToast(`${player.name}: ${player.isFreeAccount ? 'تم إلغاء الحساب المجاني' : 'تم تفعيل الحساب المجاني'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setTogglingFreeId(null);
    }
  }

  // ── Toggle Can-Host-Remote (صلاحيّة إنشاء الغرف أونلاين) ──
  async function handleToggleHostRemote(player: any) {
    setTogglingHostId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-host-remote`, { method: 'POST' });
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, canHostRemote: !p.canHostRemote } : p));
      showToast(`${player.name}: ${player.canHostRemote ? 'تم سحب صلاحيّة إنشاء الغرف أونلاين' : 'تم منح صلاحيّة إنشاء الغرف أونلاين'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setTogglingHostId(null);
    }
  }

  // ── Toggle إعفاء سياج الموقع ──
  // السبب يُطلب عند المنح وحده: إعفاءٌ بلا سببٍ مكتوب يصير بعد شهرٍ لغزاً
  // لا يعرف أحدٌ أيُسحَب أم يُترك. والسحب لا يحتاج سبباً — العودة للأصل لا تُبرّر.
  async function handleToggleGeofenceExempt(player: any) {
    let reason = '';
    if (!player.geofenceExempt) {
      const ok = await swalConfirm(
        `سيدخل «${player.name}» الغرف بلا فحص موقع إطلاقاً — في كلّ فعاليّة، حتّى إن كان خارج المكان.

` +
        `امنحه لمن لا يُنتج جهازُه قراءة موقع، لا لمن يتعذّر عليه الحضور.`,
        { title: '📍 إعفاء من سياج الموقع', confirmText: 'نعم، أعفِه', icon: 'question' },
      );
      if (!ok) return;
      reason = window.prompt('السبب (يظهر في السجلّ):', 'iOS — الجهاز لا يُنتج قراءة موقع') || '';
    }
    setTogglingGeoId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-geofence-exempt`, {
        method: 'POST', body: JSON.stringify({ reason }),
      });
      setPlayers(prev => prev.map(p => p.id === player.id
        ? { ...p, geofenceExempt: !p.geofenceExempt, geofenceExemptReason: p.geofenceExempt ? '' : (reason || 'جهاز لا يُنتج قراءة موقع') }
        : p));
      showToast(`${player.name}: ${player.geofenceExempt ? 'تمّ سحب إعفاء الموقع' : 'أُعفي من سياج الموقع'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setTogglingGeoId(null);
    }
  }

  // ── 🔒 قفلُ الحساب وفكُّه ──
  // السبب يُطلب عند القفل وحده: الفكُّ عودةٌ إلى الأصل ولا يحتاج تبريراً،
  // والقفلُ قرارٌ يقرؤه غيرُك بعد أسبوعٍ فيحتاج أن يعرف لِمَ.
  async function handleToggleLock(player: any) {
    let reason = '';
    if (!player.isLocked) {
      const ok = await swalConfirm(
        `لن يستطيع «${player.name}» تسجيل الدخول، وستُقطع جلستُه الحاليّة فوراً.

` +
        `ولا تُخبره الشاشةُ بالسبب — يرى «حدث خطأ، يرجى التواصل مع الإدارة.» فقط.

` +
        `الحسابُ وبياناتُه تبقى كما هي، والفكُّ بضغطةٍ واحدة.`,
        { title: '🔒 قفل الحساب', confirmText: 'نعم، اقفِله', icon: 'warning' },
      );
      if (!ok) return;
      reason = window.prompt('السبب (يظهر في السجلّ ولا يراه اللاعب):', '') || '';
    } else {
      const ok = await swalConfirm(
        `سيعود «${player.name}» إلى الدخول فوراً.`,
        { title: '🔓 فكّ القفل', confirmText: 'نعم، افكّه', icon: 'question' },
      );
      if (!ok) return;
    }
    setTogglingLockId(player.id);
    try {
      await apiFetch(`/api/player/${player.id}/toggle-lock`, {
        method: 'POST', body: JSON.stringify({ reason }),
      });
      setPlayers(prev => prev.map(p => p.id === player.id
        ? { ...p, isLocked: !p.isLocked, lockedReason: p.isLocked ? '' : reason }
        : p));
      showToast(`${player.name}: ${player.isLocked ? 'فُكّ القفل' : 'قُفل الحساب'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل', 'error');
    } finally {
      setTogglingLockId(null);
    }
  }

  // ── 📍 عرضُ محاولات الدخول على حسابٍ مقفول ──
  async function showLockAttempts(player: any) {
    setAttemptsFor(player); setAttempts(null);
    try {
      const d = await apiFetch(`/api/player/${player.id}/lock-attempts`);
      setAttempts(Array.isArray(d?.attempts) ? d.attempts : []);
    } catch {
      setAttempts([]);
    }
  }

  // ══════════════════════════════════════════════════════
  // 🔎 الترشيح
  //
  // 🔴 بين الأعمدة «و» لا «أو»: مرشِّحان معاً يضيّقان لا يوسّعان — وهو ما
  //    يتوقّعه من يضيف شرطاً ثانياً.
  //
  // 🔴 و`skip` هو جوهرُ العدّادات: عدُّ خيارٍ يُحسب على المجموعة مرشَّحةً بكلّ
  //    شيءٍ **إلّا عمودَه**. فالرقمُ يقول «ما ستراه لو ضغطتَ هنا» لا «ما تراه
  //    الآن» — وبلا ذلك تظهر كلُّ الخيارات غيرِ المختارة أصفاراً، فتصير القائمةُ
  //    عديمةَ الفائدة بالضبط حين يحتاجها المستعمل.
  // ══════════════════════════════════════════════════════
  const matchesFilters = (p: any, skip?: string) => {
    if (skip !== 'search' && search.trim()) {
      const q = search.toLowerCase();
      if (!(p.name?.toLowerCase().includes(q) || p.phone?.includes(q))) return false;
    }
    if (skip !== 'activity' && fActivity && activityBucket(p) !== fActivity) return false;
    for (const f of ACTION_FLAGS) {
      if (skip === f.key) continue;
      const want = fFlags[f.key];
      if (!want) continue;
      const has = !!p[f.key];
      if ((want === 'yes') !== has) return false;
    }
    return true;
  };

  // 🔴 الترتيبُ **بعد** الترشيح لا قبله: ترتيبُ ٧٥١ صفّاً ثمّ رميُ معظمها هدرٌ،
  //    والأهمّ أنّ المستعمل يقرأ «الأوّل» على أنّه أوّلُ ما يراه لا أوّلَ القاعدة.
  const filteredRaw = players.filter(p => matchesFilters(p));
  const filtered = sort
    ? [...filteredRaw].sort(compareBy(SORTS[sort.key], sort.dir))
    : filteredRaw;

  /** نقرةٌ تُفعّل بالاتّجاه المفيد · ثانيةٌ تعكس · ثالثةٌ تُلغي الترتيب */
  const cycleSort = (key: string) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: SORTS[key].first };
      const flipped: SortDir = prev.dir === 'asc' ? 'desc' : 'asc';
      return flipped === SORTS[key].first ? null : { key, dir: flipped };
    });
  };

  /** عددُ ما ستراه لو اخترتَ هذا الخيار — بكلّ المرشِّحات إلّا مرشِّحَ عموده. */
  const facet = (col: string, pred: (p: any) => boolean) =>
    players.filter(p => pred(p) && matchesFilters(p, col)).length;

  const activeCount =
    (fActivity ? 1 : 0) + ACTION_FLAGS.filter(f => fFlags[f.key]).length;

  const clearFilters = () => { setFActivity(null); setFFlags({}); };

  // ── Pagination Logic ──
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedPlayers = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // 🔴 العودةُ للصفحة الأولى عند أيّ تضييق: البقاءُ في الصفحة ٧ بعد ترشيحٍ
  //    يترك ٤٠ نتيجةً يعني شاشةً فارغةً يظنّها المستعمل «لا نتائج».
  useEffect(() => { setCurrentPage(1); }, [search, fActivity, fFlags, sort]);

  // إغلاقُ قائمة الترشيح بالنقر خارجها أو بمفتاح الهروب
  useEffect(() => {
    if (!openFilter) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-colfilter]')) setOpenFilter(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenFilter(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openFilter]);

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>🎮</span> إدارة اللاعبين
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            عرض وإدارة حسابات اللاعبين المسجلين ({players.length} لاعب) · الرتبةُ المعروضة حسب المدينة المختارة
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* 🏙️ مفتاح المدينة — يحدّد أيّ رتبةٍ تُعرض في العمود الرئيس */}
          <CitySegment cities={scope.cities} value={cityFilter} onChange={id => { setCityOverride(id); setCurrentPage(1); }} ariaLabel="مدينة الرتبة" />
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="🔍 بحث بالاسم أو الهاتف..."
              className="px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 w-64 placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* ═══ STATS CARDS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي اللاعبين', value: players.length, icon: '👥', color: 'from-blue-500 to-blue-600' },
          // 🔴 لا يعدّ إلّا قيمةً لها مصدرٌ موثّق — الفراغُ لا يُحتسب نشاطاً ولا خمولاً
          { label: 'نشط (آخر 7 أيام)', value: players.filter(p => p.lastActiveAt && (Date.now() - new Date(p.lastActiveAt).getTime()) < 7 * 86400000).length, icon: '🟢', color: 'from-emerald-500 to-emerald-600' },
          { label: 'إجمالي المباريات', value: players.reduce((s, p) => s + (p.totalMatches || 0), 0), icon: '🎯', color: 'from-amber-500 to-amber-600' },
          { label: 'يحتاج تغيير كلمة مرور', value: players.filter(p => p.mustChangePassword).length, icon: '🔐', color: 'from-rose-500 to-rose-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-gray-800/30 border border-gray-700/30 rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-lg shrink-0`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-black text-white tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-gray-500 font-medium">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ المرشِّحاتُ النشطة ═══
          🔴 تُعرض خارج الجدول لا داخله: مَن يرشّح ثمّ يمرّر لأسفلَ ينسى ما رشّح،
             فيقرأ ٣٠ صفّاً على أنّها القاعدةُ كلُّها. الشريطُ يبقى في الأعلى. */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-1">
          <span className="text-[11px] text-gray-500">مرشَّح:</span>
          {fActivity && (
            <button
              onClick={() => setFActivity(null)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            >
              {ACTIVITY_BUCKETS.find(b => b.key === fActivity)?.label} ✕
            </button>
          )}
          {ACTION_FLAGS.filter(f => fFlags[f.key]).map(f => (
            <button
              key={f.key}
              onClick={() => setFFlags(prev => ({ ...prev, [f.key]: null }))}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            >
              {f.icon} {fFlags[f.key] === 'yes' ? f.yes : f.no} ✕
            </button>
          ))}
          <span className="text-[11px] text-gray-500 font-mono">
            {filtered.length} من {players.length}
          </span>
          <button onClick={clearFilters} className="text-[11px] text-gray-500 hover:text-white underline">
            امسح الكلّ
          </button>
        </div>
      )}

      {/* ═══ TABLE ═══ */}
      <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 font-medium">
            {search || activeCount > 0 ? 'لا توجد نتائج مطابقة' : 'لا يوجد لاعبين مسجلين'}
            {activeCount > 0 && (
              <button onClick={clearFilters} className="block mx-auto mt-3 text-xs text-amber-400 hover:text-amber-300 underline">
                امسح المرشِّحات
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                  <th className="text-right px-4 py-3 font-medium"><SortHead id="name" label="اللاعب" sort={sort} onSort={cycleSort} /></th>
                  <th className="text-center px-4 py-3 font-medium" dir="ltr">
                    <SortHead id="phone" label="الهاتف" sort={sort} onSort={cycleSort} /></th>
                  <th className="text-center px-4 py-3 font-medium"><SortHead id="matches" label="مباريات" sort={sort} onSort={cycleSort} /></th>
                  <th className="text-center px-4 py-3 font-medium"><SortHead id="wins" label="فوز" sort={sort} onSort={cycleSort} /></th>
                  <th className="text-center px-4 py-3 font-medium"><SortHead id="survived" label="نجا" sort={sort} onSort={cycleSort} /></th>
                  <th className="text-center px-4 py-3 font-medium">
                    <SortHead id="rank" label="المستوى / الرانك" sort={sort} onSort={cycleSort} /></th>
                  {/* 🏙️ رتبُ اللاعب في المدن غير المعروضة — فلا تختفي رتبةٌ ولا تُجمَع رتبتان */}
                  <th className="text-center px-4 py-3 font-medium whitespace-nowrap">المدن الأخرى</th>
                  <th className="text-center px-4 py-3 font-medium">
                    <SortHead id="activity" label="آخر نشاط" sort={sort} onSort={cycleSort}>
                    <ColumnFilter
                      id="activity" label=""
                      open={openFilter === 'activity'} onOpen={setOpenFilter}
                      active={!!fActivity}
                      onClear={() => setFActivity(null)}
                      onPick={k => setFActivity(prev => (prev === k ? null : k as ActivityBucket))}
                      options={ACTIVITY_BUCKETS.map(b => ({
                        key: b.key, label: b.label, color: b.color,
                        selected: fActivity === b.key,
                        count: facet('activity', p => activityBucket(p) === b.key),
                      }))}
                    />
                    </SortHead>
                  </th>
                  <th className="text-center px-4 py-3 font-medium"><SortHead id="status" label="الحالة" sort={sort} onSort={cycleSort} /></th>
                  <th className="text-center px-4 py-3 font-medium">
                    {/* 🔴 عمودٌ واحدٌ يحمل خمسةَ أعلام، فقائمتُه تجمعها كلَّها:
                        قائمةٌ لكلّ علمٍ في رأسٍ واحدٍ تعني خمسةَ أزرارٍ متلاصقة
                        لا يفرّقها أحد. */}
                    <SortHead id="flags" label="الإجراءات" sort={sort} onSort={cycleSort}>
                    <ColumnFilter
                      id="flags" label=""
                      open={openFilter === 'flags'} onOpen={setOpenFilter}
                      active={ACTION_FLAGS.some(f => fFlags[f.key])}
                      onClear={() => setFFlags({})}
                      onPick={k => {
                        const [key, val] = k.split('|') as [string, 'yes' | 'no'];
                        setFFlags(prev => ({ ...prev, [key]: prev[key] === val ? null : val }));
                      }}
                      options={ACTION_FLAGS.flatMap(f => ([
                        { key: `${f.key}|yes`, label: `${f.icon} ${f.yes}`, color: '#34d399',
                          selected: fFlags[f.key] === 'yes',
                          count: facet(f.key, p => !!p[f.key]) },
                        { key: `${f.key}|no`, label: `${f.icon} ${f.no}`, color: '#4b5563',
                          selected: fFlags[f.key] === 'no',
                          count: facet(f.key, p => !p[f.key]) },
                      ]))}
                    />
                    </SortHead>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedPlayers.map(p => {
                  const winRate = p.totalMatches > 0 ? Math.round((p.totalWins / p.totalMatches) * 100) : 0;
                  return (
                    <tr key={p.id} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                      {/* Avatar + Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden shrink-0">
                            {p.avatarUrl ? (
                              <Image src={`${API_URL}${p.avatarUrl}`} alt="" width={40} height={40} className="w-full h-full object-cover" />
                            ) : (
                              p.name?.[0] || '👤'
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-white">{p.name}</p>
                            <p className="text-[10px] text-gray-500">{p.gender === 'FEMALE' ? 'أنثى' : 'ذكر'} • #{p.id}</p>
                          </div>
                        </div>
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-3 text-center font-mono text-gray-300 text-xs" dir="ltr">
                        <span className="inline-flex items-center justify-center gap-2">
                          {p.phone}
                          <WhatsAppButton phone={p.phone} size={14} />
                        </span>
                      </td>
                      {/* Matches */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-white font-bold">{p.totalMatches || 0}</span>
                      </td>
                      {/* Wins */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-emerald-400 font-bold">{p.totalWins || 0}</span>
                        {p.totalMatches > 0 && (
                          <span className="text-gray-600 text-[10px] mr-1">({winRate}%)</span>
                        )}
                      </td>
                      {/* Survived */}
                      <td className="px-4 py-3 text-center text-blue-400 font-bold">{p.totalSurvived || 0}</td>
                      {/* Level + Rank — بمدينتها */}
                      {(() => {
                        // 🏙️ المدينةُ المعروضة: المختارةُ من المفتاح، وإلّا الأساسيّةُ للاعب
                        const standings: any[] = Array.isArray(p.standings) ? p.standings : [];
                        const shownCityId: number | null = cityFilter ?? (p.homeCityId == null ? null : Number(p.homeCityId));
                        const shownCityName: string | null = cityFilter != null ? cityFilterName : (p.homeCityName || null);
                        const shownStanding = shownCityId == null ? null : standings.find(s => Number(s.cityId) === shownCityId) || null;
                        // «لم يلعب في X» لا تُقال إلّا حين يرسل الخادم standings ولا صفَّ فيها للمدينة المختارة
                        const notPlayedHere = cityFilter != null && Array.isArray(p.standings) && !shownStanding;
                        const others = standings.filter(s => Number(s.cityId) !== shownCityId);
                        return (
                          <>
                            <td className="px-4 py-3 text-center">
                              {notPlayedHere ? (
                                <span className="text-[11px] text-gray-500">لم يلعب في {cityFilterName || 'هذه المدينة'}</span>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-xs font-bold" style={{ color: rankColor(p.rankTier) }}>{rankBadge(p.rankTier)} {rankName(p.rankTier)}</span>
                                  <span className="text-[10px] text-gray-600">Lv.{p.level || 1} · {p.rankRR || 0} RR</span>
                                  {shownCityName && <CityBadge cityId={shownCityId} cityName={shownCityName} />}
                                </div>
                              )}
                            </td>
                            {/* المدن الأخرى */}
                            <td className="px-4 py-3 text-center">
                              {others.length === 0 ? (
                                <span className="text-gray-600">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  {others.map(s => (
                                    <CityBadge key={s.cityId} cityId={s.cityId} cityName={s.cityName} icon={false} title={`Lv.${s.level || 1} · ${s.totalMatches || 0} مباراة`}>
                                      {s.cityName} · {rankBadge(s.rankTier)} {rankName(s.rankTier)} {s.rankRR || 0}
                                    </CityBadge>
                                  ))}
                                </div>
                              )}
                            </td>
                          </>
                        );
                      })()}
                      {/* Last Active — ثلاثُ حالات */}
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const c = lastActiveCell(p);
                          return (
                            <div title={c.title} className="flex flex-col items-center leading-tight">
                              <span className="text-xs font-bold" style={{ color: c.color }}>{c.main}</span>
                              {c.sub && <span className="text-[10px] text-gray-600 mt-0.5">{c.sub}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {p.mustChangePassword ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">افتراضي</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">مفعّل</span>
                          )}
                          {p.isTestAccount && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/20">🧪 اختبار</span>
                          )}
                          {p.isFreeAccount && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-teal-500/10 text-teal-400 border-teal-500/20">🏷️ مجاني</span>
                          )}
                          {p.canHostRemote && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-sky-500/10 text-sky-400 border-sky-500/20">🌐 مضيف أونلاين</span>
                          )}
                          {p.geofenceExempt && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20"
                              title={p.geofenceExemptReason || 'معفى من فحص الموقع'}
                            >📍 معفى من السياج</span>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleResetPassword(p)}
                            disabled={resettingId === p.id}
                            className="p-1.5 rounded-lg text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-30"
                            title="إعادة تعيين كلمة المرور"
                          >
                            {resettingId === p.id ? (
                              <span className="animate-spin inline-block">⏳</span>
                            ) : '🔄'}
                          </button>
                          <button
                            onClick={() => handleViewProfile(p.id)}
                            className="p-1.5 rounded-lg text-blue-400/70 hover:text-blue-400 hover:bg-blue-500/10 transition"
                            title="عرض البروفايل"
                          >
                            👁
                          </button>
                          <button
                            onClick={() => handleToggleTestAccount(p)}
                            disabled={togglingTestId === p.id}
                            className={`p-1.5 rounded-lg transition ${p.isTestAccount ? 'text-purple-400 hover:bg-purple-500/10' : 'text-gray-500/50 hover:text-purple-400 hover:bg-purple-500/10'}`}
                            title={p.isTestAccount ? 'إلغاء حساب اختبار' : 'تفعيل حساب اختبار'}
                          >
                            {togglingTestId === p.id ? '⏳' : '🧪'}
                          </button>
                          <button
                            onClick={() => handleToggleFreeAccount(p)}
                            disabled={togglingFreeId === p.id}
                            className={`p-1.5 rounded-lg transition ${p.isFreeAccount ? 'text-teal-400 hover:bg-teal-500/10' : 'text-gray-500/50 hover:text-teal-400 hover:bg-teal-500/10'}`}
                            title={p.isFreeAccount ? 'إلغاء حساب مجاني' : 'تفعيل حساب مجاني'}
                          >
                            {togglingFreeId === p.id ? '⏳' : '🏷️'}
                          </button>
                          <button
                            onClick={() => handleToggleHostRemote(p)}
                            disabled={togglingHostId === p.id}
                            className={`p-1.5 rounded-lg transition ${p.canHostRemote ? 'text-sky-400 hover:bg-sky-500/10' : 'text-gray-500/50 hover:text-sky-400 hover:bg-sky-500/10'}`}
                            title={p.canHostRemote ? 'سحب صلاحيّة إنشاء الغرف أونلاين' : 'منح صلاحيّة إنشاء الغرف أونلاين'}
                          >
                            {togglingHostId === p.id ? '⏳' : '🌐'}
                          </button>
                          <button
                            onClick={() => handleToggleGeofenceExempt(p)}
                            disabled={togglingGeoId === p.id}
                            className={`p-1.5 rounded-lg transition ${p.geofenceExempt ? 'text-amber-400 hover:bg-amber-500/10' : 'text-gray-500/50 hover:text-amber-400 hover:bg-amber-500/10'}`}
                            title={p.geofenceExempt ? 'سحب إعفاء سياج الموقع' : 'إعفاء من سياج الموقع (جهاز لا يُنتج قراءة)'}
                          >
                            {togglingGeoId === p.id ? '⏳' : '📍'}
                          </button>
                          <button
                            onClick={() => handleToggleLock(p)}
                            disabled={togglingLockId === p.id}
                            className={`p-1.5 rounded-lg transition ${p.isLocked ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20' : 'text-gray-500/50 hover:text-rose-400 hover:bg-rose-500/10'}`}
                            title={p.isLocked ? `مقفول${p.lockedReason ? ' — ' + p.lockedReason : ''} · اضغط لفكّ القفل` : 'قفل الحساب (يمنع الدخول)'}
                          >
                            {togglingLockId === p.id ? '⏳' : p.isLocked ? '🔒' : '🔓'}
                          </button>
                          {p.isLocked && (
                            <button
                              onClick={() => showLockAttempts(p)}
                              className="p-1.5 rounded-lg text-gray-500/60 hover:text-amber-400 hover:bg-amber-500/10 transition"
                              title="محاولات الدخول على هذا الحساب"
                            >
                              📍
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePlayer(p)}
                            className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="حذف اللاعب"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ PAGINATION ══ */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700/30">
            <p className="text-xs text-gray-500">
              عرض {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} من {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-30 text-gray-400 hover:bg-gray-700/40"
              >◀</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-1.5 text-gray-600 text-xs">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                        currentPage === p
                          ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                          : 'text-gray-400 hover:bg-gray-700/40'
                      }`}
                    >{p}</button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-30 text-gray-400 hover:bg-gray-700/40"
              >▶</button>
            </div>
          </div>
        )}
      </div>



      {/* ═══ BLOCKED PAIRS ═══ */}
      <BlockedPairsPanel players={players} setPlayers={setPlayers} showToast={showToast} onLoadPlayers={loadPlayers} />

      {/* ═══ TOAST ═══ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-xl text-sm font-bold shadow-xl ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ 📍 محاولاتُ الدخول على حسابٍ مقفول ══ */}
      <AnimatePresence>
        {attemptsFor && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setAttemptsFor(null)}
            dir="rtl"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-gray-700 bg-[#0c0c0e] overflow-hidden"
              style={{ maxHeight: '80vh' }}
            >
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <span className="text-lg">📍</span>
                <span className="flex-1 min-w-0">
                  <b className="block text-[14px] text-white truncate">محاولات الدخول</b>
                  <span className="block text-[11px] text-gray-500 truncate">{attemptsFor.name}</span>
                </span>
                <button onClick={() => setAttemptsFor(null)} className="w-9 h-9 rounded-lg text-gray-500 hover:text-white">✕</button>
              </div>

              <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: 'calc(80vh - 110px)' }}>
                {attempts === null ? (
                  <p className="text-center text-gray-500 text-sm py-8">…</p>
                ) : !attempts.length ? (
                  <p className="text-center text-gray-500 text-sm py-8">لا محاولةَ دخولٍ منذ القفل</p>
                ) : attempts.map((a: any) => (
                  <div key={a.id} className="rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold px-1.5 py-px rounded-full border"
                        style={a.passwordOk
                          ? { color: '#D9453F', borderColor: 'rgba(217,69,63,.5)' }
                          : { color: '#9ca3af', borderColor: 'rgba(255,255,255,.15)' }}>
                        {a.passwordOk ? 'كلمة السرّ صحيحة' : 'كلمة سرّ خاطئة'}
                      </span>
                      <span className="flex-1" />
                      <span className="text-[11px] text-gray-500">
                        {new Date(a.at).toLocaleString('ar-JO', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-300 font-mono" dir="ltr">{a.ip || '—'}</p>
                    {a.phoneTried && a.phoneTried !== attemptsFor.phone && (
                      <p className="text-[11px] text-amber-500/80 mt-0.5">كُتب الرقم: {a.phoneTried}</p>
                    )}
                    {/* 📍 النقطة — تُقرأ بمنطق صفحة مواقع اللاعبين: الدقّة تُذكر
                        لأنّها تُضاف لا تُقارَن، والتزييفُ يُعلَّم، وعمرُ القراءة
                        من capturedAt لا من وقت وصولها. */}
                    {a.latitude != null && a.longitude != null ? (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <a
                          href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[12px] font-bold text-emerald-400 hover:text-emerald-300 underline"
                          dir="ltr"
                        >
                          📍 {Number(a.latitude).toFixed(5)}, {Number(a.longitude).toFixed(5)}
                        </a>
                        {a.accuracyM != null && (
                          <span className="text-[11px] text-gray-500">دقّة ±{Math.round(a.accuracyM)}م</span>
                        )}
                        {a.fixSource && <span className="text-[11px] text-gray-600">{a.fixSource === 'app' ? 'تطبيق' : 'ويب'}</span>}
                        {a.isMocked && (
                          <span className="text-[11px] font-bold px-1.5 rounded-full border"
                            style={{ color: '#D9453F', borderColor: 'rgba(217,69,63,.5)' }}>موقعٌ مزيّف</span>
                        )}
                        {a.capturedAt && Math.abs(new Date(a.at).getTime() - new Date(a.capturedAt).getTime()) > 120000 && (
                          <span className="text-[11px] text-amber-500/80">
                            قراءةٌ أقدمُ من المحاولة
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-600 mt-1">لا نقطةَ موقع — الإذنُ غير ممنوحٍ على ذلك الجهاز</p>
                    )}
                    {a.userAgent && (
                      <p className="text-[10.5px] text-gray-600 mt-1 leading-snug break-all" dir="ltr">{a.userAgent}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="px-4 py-2.5 border-t border-gray-800">
                <p className="text-[10.5px] text-gray-600 leading-relaxed">
                  العنوانُ يُقرأ من الاتّصال نفسِه لا من ترويسةٍ يرسلها الجهاز — فلا يُنتحل.
                  والنقطةُ تصل من الجهاز إن كان إذنُ الموقع ممنوحاً عليه سلفاً — ولا تُطلب في شاشة الدخول.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// 🚫 لوحة القيود المخصصة والذكية للاعبين
// ══════════════════════════════════════════════════════

function BlockedPairsPanel({ players, setPlayers, showToast, onLoadPlayers }: { players: any[]; setPlayers: React.Dispatch<React.SetStateAction<any[]>>; showToast: (msg: string, type: 'success' | 'error') => void; onLoadPlayers: (background?: boolean) => void }) {
  const [pairs, setPairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [updatingGenderId, setUpdatingGenderId] = useState<number | null>(null);

  // ── إضافة لاعب جديد لتهيئة قيوده ──
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalDropdownOpen, setGlobalDropdownOpen] = useState(false);
  const [manuallySelectedPlayerIds, setManuallySelectedPlayerIds] = useState<number[]>([]);

  // ── إضافة أزواج ممنوعة لكل كارد ──
  const [partnerSearchMap, setPartnerSearchMap] = useState<Record<number, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  useEffect(() => {
    loadPairs();
  }, []);

  // إغلاق الـ dropdowns عند الضغط خارجها
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setGlobalDropdownOpen(false);
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadPairs() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/seating/blocked-pairs');
      setPairs(data.pairs || []);
    } catch (err: any) {
      console.warn('Failed to load blocked pairs:', err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── تحديث قيد الجنس ──
  async function handleUpdateGenderConstraint(playerId: number, value: string) {
    setUpdatingGenderId(playerId);
    // تحديث الحالة المحلية فوراً لتفادي وميض أو إعادة تحميل الصفحة
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, genderConstraint: value } : p));
    try {
      await apiFetch(`/api/player/${playerId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ genderConstraint: value }),
      });
      showToast('تم تحديث شرط الجنس للاعب بنجاح', 'success');
      onLoadPlayers(true); // تحديث صامت في الخلفية للمزامنة
    } catch (err: any) {
      showToast(err.message || 'فشل التحديث', 'error');
      onLoadPlayers(true); // تراجع صامت
    } finally {
      setUpdatingGenderId(null);
    }
  }

  // ── إضافة قيد زوج ممنوع للاعب ──
  async function handleAddPartner(player1Id: number, player2Id: number) {
    try {
      await apiFetch('/api/seating/blocked-pairs', {
        method: 'POST',
        body: JSON.stringify({ player1Id, player2Id, reason: 'قيد مخصص للجلوس متجاورين' }),
      });
      showToast('تم إضافة القيد بنجاح', 'success');
      setPartnerSearchMap(prev => ({ ...prev, [player1Id]: '' }));
      setOpenDropdownId(null);
      loadPairs();
    } catch (err: any) {
      showToast(err.message || 'فشل الإضافة', 'error');
    }
  }

  // ── حذف قيد زوج ممنوع ──
  async function handleDeletePair(pairId: number) {
    if (!(await swalConfirm('هل تريد إزالة هذا القيد؟'))) return;
    try {
      await apiFetch(`/api/seating/blocked-pairs/${pairId}`, { method: 'DELETE' });
      setPairs(prev => prev.filter(p => p.id !== pairId));
      showToast('تم إزالة قيد المجاورة', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل الحذف', 'error');
    }
  }

  // ── إزالة كل القيود للاعب ──
  async function handleRemoveAllConstraints(playerId: number) {
    if (!(await swalConfirm('⚠️ هل تريد إزالة كافة قيود الجوار والجنس لهذا اللاعب؟'))) return;
    try {
      // 1. إزالة قيد الجنس
      await apiFetch(`/api/player/${playerId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ genderConstraint: 'NONE' }),
      });

      // 2. إزالة كل الأزواج المرتبطة به
      const relatedPairs = pairs.filter(p => p.player1_id === playerId || p.player2_id === playerId);
      for (const pair of relatedPairs) {
        await apiFetch(`/api/seating/blocked-pairs/${pair.id}`, { method: 'DELETE' });
      }

      showToast('تم تنظيف كافة قيود اللاعب', 'success');
      setManuallySelectedPlayerIds(prev => prev.filter(id => id !== playerId));
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, genderConstraint: 'NONE' } : p));
      onLoadPlayers(true); // تحديث صامت في الخلفية
      loadPairs();
    } catch (err: any) {
      showToast(err.message || 'فشل تنظيف القيود', 'error');
    }
  }

  // ── فلترة اللاعبين ──
  function filterPlayers(query: string, excludeId?: number) {
    const q = query.toLowerCase().trim();
    return players
      .filter(p => {
        if (excludeId && p.id === excludeId) return false;
        if (!q) return true;
        return p.name?.toLowerCase().includes(q) || p.phone?.includes(q);
      })
      .slice(0, 8);
  }

  // ── تجميع البيانات للاعبين الحاصلين على قيود ──
  const playerConstraintsMap = new Map<number, {
    player: any;
    blockedPartners: any[];
    genderConstraint: string;
  }>();

  // إضافة من لديه قيد جنس
  players.forEach(p => {
    if (p.genderConstraint && p.genderConstraint !== 'NONE') {
      playerConstraintsMap.set(p.id, {
        player: p,
        blockedPartners: [],
        genderConstraint: p.genderConstraint,
      });
    }
  });

  // إضافة من لديه أزواج ممنوعة
  pairs.forEach(pair => {
    const p1 = players.find(p => p.id === pair.player1_id) || { id: pair.player1_id, name: pair.player1_name, phone: pair.player1_phone, gender: 'MALE', genderConstraint: 'NONE' };
    const p2 = players.find(p => p.id === pair.player2_id) || { id: pair.player2_id, name: pair.player2_name, phone: pair.player2_phone, gender: 'MALE', genderConstraint: 'NONE' };

    // Player 1
    if (!playerConstraintsMap.has(pair.player1_id)) {
      playerConstraintsMap.set(pair.player1_id, {
        player: p1,
        blockedPartners: [],
        genderConstraint: p1.genderConstraint || 'NONE',
      });
    }
    playerConstraintsMap.get(pair.player1_id)!.blockedPartners.push({
      pairId: pair.id,
      partnerId: pair.player2_id,
      partnerName: p2.name,
      partnerPhone: p2.phone,
    });

    // Player 2
    if (!playerConstraintsMap.has(pair.player2_id)) {
      playerConstraintsMap.set(pair.player2_id, {
        player: p2,
        blockedPartners: [],
        genderConstraint: p2.genderConstraint || 'NONE',
      });
    }
    playerConstraintsMap.get(pair.player2_id)!.blockedPartners.push({
      pairId: pair.id,
      partnerId: pair.player1_id,
      partnerName: p1.name,
      partnerPhone: p1.phone,
    });
  });

  // إضافة اللاعبين الذين تم اختيارهم يدوياً لبدء التعديل
  manuallySelectedPlayerIds.forEach(id => {
    if (!playerConstraintsMap.has(id)) {
      const p = players.find(x => x.id === id);
      if (p) {
        playerConstraintsMap.set(id, {
          player: p,
          blockedPartners: [],
          genderConstraint: p.genderConstraint || 'NONE',
        });
      }
    }
  });

  const constrainedPlayers = Array.from(playerConstraintsMap.values());

  return (
    <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-700/10 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center text-lg shrink-0">
            🚫
          </div>
          <div className="text-right">
            <h2 className="text-sm font-bold text-white">إدارة قيود اللاعبين (الجلوس الذكي)</h2>
            <p className="text-[10px] text-gray-500">
              تحديد قيود الجنس الفردية واللاعبين الممنوع مجاورتهم لـ {constrainedPlayers.length} لاعب
            </p>
          </div>
        </div>
        <span className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* ── Content ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-gray-700/20 pt-4">

              {/* ── اختيار لاعب جديد لتهيئة قيوده ── */}
              <div className={`bg-gray-900/40 border border-gray-700/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3 relative ${
                globalDropdownOpen ? 'z-40' : 'z-20'
              }`}>
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-400">➕ تهيئة قيود مخصصة للاعب جديد</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">ابحث عن لاعب لفتحه في لوحة التحكم وتعديل شروطه الخاصة</p>
                </div>

                <div className="relative dropdown-container md:w-80 w-full">
                  <input
                    type="text"
                    value={globalSearch}
                    onChange={e => { setGlobalSearch(e.target.value); setGlobalDropdownOpen(true); }}
                    onFocus={() => setGlobalDropdownOpen(true)}
                    placeholder="ابحث عن لاعب باسمه أو هاتفه..."
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-600/40 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/30 placeholder-gray-600"
                  />
                  {globalDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700/50 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                      {filterPlayers(globalSearch).length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-600">لا توجد نتائج</p>
                      ) : filterPlayers(globalSearch).map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (!manuallySelectedPlayerIds.includes(p.id)) {
                              setManuallySelectedPlayerIds(prev => [...prev, p.id]);
                            }
                            setGlobalSearch('');
                            setGlobalDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 transition text-right"
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {p.name?.[0] || '?'}
                          </div>
                          <span className="text-sm text-white truncate flex-1">{p.name}</span>
                          <span className="text-[10px] text-gray-500 font-mono" dir="ltr">{p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── لوحة الكروت الذكية ── */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" />
                </div>
              ) : constrainedPlayers.length === 0 ? (
                <div className="text-center py-12 bg-gray-950/20 border border-dashed border-gray-800 rounded-xl">
                  <span className="text-4xl block mb-2 opacity-20">🪑</span>
                  <p className="text-gray-500 text-sm">لا توجد قيود مخصصة لأي لاعب حتى الآن</p>
                  <p className="text-[10px] text-gray-700 mt-1">ابدأ بالبحث عن لاعب أعلاه لتعيين قيود مخصصة له</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {constrainedPlayers.map(({ player, blockedPartners, genderConstraint }) => (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`bg-gray-900/60 border border-gray-700/40 backdrop-blur-sm rounded-2xl p-4 space-y-4 flex flex-col justify-between relative ${
                        openDropdownId === player.id ? 'z-30' : 'z-10'
                      }`}
                    >
                      {/* Player Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-gray-800/60">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white font-bold text-base overflow-hidden shrink-0">
                            {player.avatarUrl ? (
                              <img src={`${API_URL}${player.avatarUrl}`} alt="" className="w-full h-full object-cover" />
                            ) : (
                              player.name?.[0] || '👤'
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-white text-xs truncate">{player.name}</h3>
                            <p className="text-[9px] text-gray-500 font-mono truncate" dir="ltr">
                              {player.phone} • {player.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveAllConstraints(player.id)}
                          className="text-[10px] text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded-lg transition shrink-0 font-bold"
                          title="مسح كافة شروط هذا اللاعب"
                        >
                          🗑️ إزالة
                        </button>
                      </div>

                      {/* 1. Gender Constraint Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-gray-400 block font-bold">🚺🚹 شرط الجوار مع الجنس:</label>
                        <div className="flex gap-1 bg-gray-950/40 p-0.5 rounded-lg border border-gray-800/60">
                          {[
                            { value: 'NONE', label: 'لا قيود' },
                            { value: 'FORBID_SAME', label: 'ممنوع نفس الجنس' },
                            { value: 'FORBID_OPPOSITE', label: 'ممنوع جنس آخر' },
                          ].map(opt => {
                            const active = genderConstraint === opt.value;
                            return (
                              <button
                                key={opt.value}
                                disabled={updatingGenderId === player.id}
                                onClick={() => handleUpdateGenderConstraint(player.id, opt.value)}
                                className={`flex-1 py-1.5 px-1 rounded-md text-[9px] font-black transition ${
                                  active
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Forbidden Partners list */}
                      <div className="space-y-1.5 flex-1 flex flex-col justify-start">
                        <label className="text-[10px] text-gray-400 block font-bold">🚫 أزواج ممنوعة ({blockedPartners.length}):</label>
                        {blockedPartners.length === 0 ? (
                          <p className="text-[9px] text-gray-600 italic">لا توجد أزواج ممنوعة</p>
                        ) : (
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {blockedPartners.map((bp: any) => (
                              <div key={bp.pairId} className="flex items-center justify-between bg-gray-950/30 border border-gray-800/40 rounded-lg px-2 py-1 group/partner hover:border-rose-500/20 transition">
                                <span className="text-[10px] text-gray-300 font-bold truncate flex-1">{bp.partnerName}</span>
                                <span className="text-[9px] text-gray-600 font-mono mx-2" dir="ltr">{bp.partnerPhone}</span>
                                <button
                                  onClick={() => handleDeletePair(bp.pairId)}
                                  className="text-gray-600 hover:text-rose-400 text-xs transition shrink-0"
                                  title="حذف هذا القيد"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. Add Forbidden Partner Dropdown */}
                      <div className="relative dropdown-container pt-2 border-t border-gray-800/40">
                        <input
                          type="text"
                          placeholder="🔍 منع الجلوس بجانب لاعب..."
                          value={partnerSearchMap[player.id] || ''}
                          onChange={e => {
                            setPartnerSearchMap(prev => ({ ...prev, [player.id]: e.target.value }));
                            setOpenDropdownId(player.id);
                          }}
                          onFocus={() => setOpenDropdownId(player.id)}
                          className="w-full px-2.5 py-1.5 bg-gray-950/50 border border-gray-800/80 rounded-lg text-[10px] text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/30"
                        />
                        {openDropdownId === player.id && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-950 border border-gray-800 rounded-lg shadow-2xl max-h-32 overflow-y-auto">
                            {filterPlayers(partnerSearchMap[player.id] || '', player.id)
                              .filter(p => !blockedPartners.some((bp: any) => bp.partnerId === p.id))
                              .length === 0 ? (
                                <p className="px-3 py-1.5 text-[10px] text-gray-600">لا توجد نتائج</p>
                              ) : filterPlayers(partnerSearchMap[player.id] || '', player.id)
                                .filter(p => !blockedPartners.some((bp: any) => bp.partnerId === p.id))
                                .map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => handleAddPartner(player.id, p.id)}
                                    className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-800/40 transition text-right"
                                  >
                                    <span className="text-[10px] text-white font-bold">{p.name}</span>
                                    <span className="text-[9px] text-gray-500 font-mono" dir="ltr">{p.phone}</span>
                                  </button>
                                ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── ملاحظة ── */}
              <div className="bg-gray-900/30 border border-gray-700/20 rounded-xl p-3">
                <p className="text-[10px] text-gray-600 text-center">
                  💡 هذه القيود مخصصة لكل لاعب وتُطبق تلقائياً على كل الأنشطة والألعاب لتنظيم الجلوس وحل التنازعات
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
