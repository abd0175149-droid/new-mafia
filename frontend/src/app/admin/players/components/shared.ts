// ══════════════════════════════════════════════════════
// صفحة اللاعبين — المشترك بين القائمة واللوح الجانبيّ والنوافذ
// (الجلب، مصنِّف «آخر نشاط»، الأعلام، الترتيب، الصلاحيّات)
// ══════════════════════════════════════════════════════

import type { LucideIcon } from 'lucide-react';
import { FlaskConical, Globe, KeyRound, Lock, MapPinOff, Tag } from 'lucide-react';
import type { Tone } from '../../whatsapp/wa-ui';
import { RANK_ORDER } from '@/lib/ranks';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const LOCALE = 'ar-JO-u-nu-latn';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

/** خطأ الخادم مع جسمه — نافذةُ نقل السجلّ الماليّ تقرأ منه `code` و`chips` */
export class ApiError extends Error {
  status: number;
  code?: string;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.body = body;
    this.code = body?.code;
  }
}

export async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(errorData.error || `API error ${res.status}`, res.status, errorData);
  }
  return res.json();
}

/** دور الموظّف من التخزين المحلّيّ — `null` إن لم يُعرف بعد */
export function readRole(): string | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem('user') || '{}')?.role || null; } catch { return null; }
}

/** أدوارُ الروابط كما في قائمة لوحة الإدارة (admin/layout.tsx) وحرّاس الخادم */
export const ROLES = {
  /** إجراءات اللاعب كلّها adminOnly على الخادم */
  actions: ['admin'],
  /** /api/seating/blocked-pairs — leaderOrAbove */
  seating: ['admin', 'manager', 'leader'],
  map: ['admin', 'manager'],
  consents: ['admin'],
  contacts: ['admin'],
} as const;

/** الدورُ المجهول لا يُخفي شيئاً — الخادم هو الحارس، والإخفاءُ هنا تنظيفٌ للواجهة فقط */
export const may = (role: string | null, allowed: readonly string[]) => role == null || allowed.includes(role);

// ── التواريخ ──
export function fmtDate(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return '—';
  return dt.toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return '—';
  return dt.toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
}

export function relativeAr(d: any): string {
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
// «آخر نشاط» — ثلاثُ حالاتٍ لا تاريخٌ واحد
//
// 🔴 لا قيمةَ إلّا عن تفاعلٍ حقيقيّ، والفراغُ يُقال صراحةً بدل أن يُملأ بتاريخٍ
//    يُتّخذ عليه قرار. و«لعب ولم يفتح التطبيق» ليست نقصاً في البيانات بل معلومةُ
//    عمل: زبائنُ حاضرون لا يصلهم إشعارٌ ولا رسالة.
//
// 🔴 مصنِّفٌ واحدٌ يخدم العمودَ والشريحةَ معاً — لو رشّحت الشريحةُ بحسابٍ خاصٍّ
//    بها لاختلف عدّادُها عن الصفوف عند أوّل حدّ.
// ══════════════════════════════════════════════════════
export const PLATFORM_AR: Record<string, string> = {
  web: 'ويب', android: 'أندرويد', ios: 'آيفون', app: 'تطبيق',
};

export const ACTIVITY_BUCKETS = [
  { key: 'w1',     label: 'نشط 7 أيّام',           dot: 'ok' },
  { key: 'm1',     label: 'خلال 30 يوماً',         dot: 'warn' },
  { key: 'old',    label: 'أقدم من 30 يوماً',      dot: '' },
  { key: 'played', label: 'لعب ولم يفتح التطبيق',  dot: 'violet' },
  { key: 'none',   label: 'حساب غير مستعمَل',      dot: 'none' },
] as const;

export type ActivityBucket = typeof ACTIVITY_BUCKETS[number]['key'];

export function activityBucket(p: any): ActivityBucket {
  if (p.lastActiveAt) {
    const days = (Date.now() - new Date(p.lastActiveAt).getTime()) / 86400000;
    return days <= 7 ? 'w1' : days <= 30 ? 'm1' : 'old';
  }
  return (p.totalMatches || 0) > 0 ? 'played' : 'none';
}

export function lastActiveCell(p: any) {
  const b = activityBucket(p);
  const dot = ACTIVITY_BUCKETS.find(x => x.key === b)!.dot;
  if (b === 'w1' || b === 'm1' || b === 'old') {
    return { kind: b, dot, main: relativeAr(p.lastActiveAt),
             sub: PLATFORM_AR[p.lastActivePlatform] || '',
             title: fmtDateTime(p.lastActiveAt) };
  }
  if (b === 'played') {
    return { kind: b, dot, main: 'لم يفتح التطبيق', sub: '',
             title: 'لعب فعلاً ولا أثرَ رقميّ — لا يصله إشعار' };
  }
  return { kind: b, dot, main: 'حساب غير مستعمَل', sub: '',
           title: 'لا تفاعلَ ولا مباريات' };
}

// ══════════════════════════════════════════════════════
// الأعلام — قائمةٌ واحدةٌ تخدم الشرائحَ والشاراتِ معاً، بترتيب الحاجة إلى الانتباه
// ══════════════════════════════════════════════════════
export interface FlagDef { key: string; label: string; icon: LucideIcon; tone: Tone }

export const FLAGS: FlagDef[] = [
  { key: 'isLocked',           label: 'مقفول',               icon: Lock,         tone: 'danger' },
  { key: 'mustChangePassword', label: 'كلمة سرّ افتراضيّة',   icon: KeyRound,     tone: 'warn' },
  { key: 'isFreeAccount',      label: 'مجّانيّ',              icon: Tag,          tone: 'gold' },
  { key: 'isTestAccount',      label: 'اختبار',              icon: FlaskConical, tone: 'violet' },
  { key: 'canHostRemote',      label: 'مضيف أونلاين',        icon: Globe,        tone: 'info' },
  { key: 'geofenceExempt',     label: 'معفى من السياج',      icon: MapPinOff,    tone: 'web' },
];

export const playerFlags = (p: any): FlagDef[] => FLAGS.filter(f => !!p[f.key]);

/** الأعلامُ التي تُعَدّ في ترتيب «الأعلام الخاصّة» — كما كانت (بلا كلمة السرّ) */
const SORT_FLAG_KEYS = ['isTestAccount', 'isFreeAccount', 'canHostRemote', 'geofenceExempt', 'isLocked'];

// ══════════════════════════════════════════════════════
// الترتيب
//
// 🔴 «المجهول» يبقى في الذيل في الاتّجاهين: لاعبٌ بلا «آخر نشاط» ليس أقدمَ الناس
//    ولا أحدثَهم. ولو عومل صفراً لتصدّر مئاتُ الصفوف الفارغة ترتيبَ «الأقدم».
// 🔴 والمعرّفُ فاصلٌ أخير دائماً: بلاه تتبادل الصفوفُ المتساوية مواضعَها بين
//    عرضٍ وآخر — كلَّما بُدّل علمٌ أو أُعيد الجلب.
// ══════════════════════════════════════════════════════
export type SortDir = 'asc' | 'desc';
export interface SortDef {
  key: string;
  label: string;
  /** القيمةُ المقارَنة — `null` تعني «مجهول» فيُذيَّل دائماً */
  get: (p: any) => number | string | null;
  type: 'num' | 'text';
  /** الاتّجاهُ عند الاختيار: الأرقامُ والتواريخ تنازليّاً، والنصوصُ تصاعديّاً */
  first: SortDir;
  /** فاصلٌ ثانٍ حين تتساوى القيمة الأولى */
  tie?: (p: any) => number;
}

const digits = (v: any) => Number(String(v ?? '').replace(/\D/g, '')) || 0;

export const SORTS: Record<string, SortDef> = {
  // 🔴 الزمنُ نفسُه لا رقمُ الدلو. والمجهولُ لا زمنَ له فيُذيَّل — ومع ذلك يُرتَّب
  //    بينه: مَن لعب قبل مَن لم يلعب.
  activity: { key: 'activity', label: 'آخر نشاط', type: 'num', first: 'desc',
              get: p => (p.lastActiveAt ? new Date(p.lastActiveAt).getTime() : null),
              tie: p => (p.totalMatches || 0) },
  name:     { key: 'name', label: 'الاسم', type: 'text', first: 'asc',
              get: p => String(p.name || '').trim() || null },
  matches:  { key: 'matches', label: 'المباريات', type: 'num', first: 'desc',
              get: p => p.totalMatches || 0 },
  // 🔴 بعددِ الفوز لا بنسبته: لو رُتِّب بالنسبة لتصدّر مَن فاز مرّةً من مرّة.
  //    والنسبةُ فاصلٌ ثانٍ فقط.
  wins:     { key: 'wins', label: 'الفوز', type: 'num', first: 'desc',
              get: p => p.totalWins || 0,
              tie: p => (p.totalMatches > 0 ? (p.totalWins || 0) / p.totalMatches : 0) },
  survived: { key: 'survived', label: 'النجاة', type: 'num', first: 'desc',
              get: p => p.totalSurvived || 0 },
  // 🔴 بترتيبِ التقدّم لا بأبجديّةِ الاسم، ثمّ نقاطُ الرتبة ثمّ المستوى.
  rank:     { key: 'rank', label: 'الرتبة', type: 'num', first: 'desc',
              get: p => (RANK_ORDER[p.rankTier] || 1) * 1e9 + (p.rankRR || 0) * 1e3 + (p.level || 1) },
  phone:    { key: 'phone', label: 'الهاتف', type: 'num', first: 'asc',
              get: p => (p.phone ? digits(p.phone) : null) },
  status:   { key: 'status', label: 'المقفول أوّلاً', type: 'num', first: 'desc',
              get: p => (p.isLocked ? 1 : 0) },
  flags:    { key: 'flags', label: 'الأعلام الخاصّة', type: 'num', first: 'desc',
              get: p => SORT_FLAG_KEYS.reduce((n, k) => n + (p[k] ? 1 : 0), 0) },
};

export function compareBy(def: SortDef, dir: SortDir) {
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

// ── أرقامٌ مشتقّة ──
export const winRate = (p: any): number =>
  p.totalMatches > 0 ? Math.round(((p.totalWins || 0) / p.totalMatches) * 100) : 0;

/**
 * 🏙️ الرتبةُ بمدينتها: المختارةُ من المفتاح، وإلّا الأساسيّةُ للاعب.
 * «لم يلعب في X» لا تُقال إلّا حين يرسل الخادم standings ولا صفَّ فيها للمدينة المختارة.
 */
export function cityStanding(p: any, cityFilter: number | null, cityFilterName: string | null) {
  const standings: any[] = Array.isArray(p.standings) ? p.standings : [];
  const shownCityId: number | null = cityFilter ?? (p.homeCityId == null ? null : Number(p.homeCityId));
  const shownCityName: string | null = cityFilter != null ? cityFilterName : (p.homeCityName || null);
  const shownStanding = shownCityId == null ? null : standings.find(s => Number(s.cityId) === shownCityId) || null;
  const notPlayedHere = cityFilter != null && Array.isArray(p.standings) && !shownStanding;
  const others = standings.filter(s => Number(s.cityId) !== shownCityId);
  return { shownCityId, shownCityName, notPlayedHere, others };
}

// تحويل الرقم إلى الصيغة الدوليّة لرابط واتساب — مطابقٌ لـ components/WhatsAppButton.tsx
export function toWaNumber(phone?: string | null): string | null {
  let d = (phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '962' + d.slice(1);
  return d.length >= 11 ? d : null;
}

/** الإجراءات التي يطلبها اللوحُ والنافذة من الصفحة */
export interface PlayerActions {
  busy: string | null;
  resetPassword: (p: any) => void;
  toggleLock: (p: any) => void;
  showAttempts: (p: any) => void;
  toggleFree: (p: any) => void;
  toggleTest: (p: any) => void;
  toggleHost: (p: any) => void;
  toggleGeofence: (p: any) => void;
  remove: (p: any) => void;
}
