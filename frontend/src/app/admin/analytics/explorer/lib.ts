// ══════════════════════════════════════════════════════
// 🔎 مستكشف اللاعبين — أنواع، اتّصال، وحسابات الأفواج
// ══════════════════════════════════════════════════════

const API = process.env.NEXT_PUBLIC_API_URL || '';
const token = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

// ── الأنواع (مرآةٌ لـbackend/src/services/player-explorer.service.ts) ──
export interface Lens {
  signupFrom: string; signupTo: string;
  windowFrom: string; windowTo: string;
  locationIds: number[]; seasonIds: number[];
  gender: '' | 'MALE' | 'FEMALE';
  minActivities: number | null; maxActivities: number | null;
  includeTestLocations: boolean; includeTestAccounts: boolean;
}

export const EMPTY_LENS: Lens = {
  signupFrom: '', signupTo: '', windowFrom: '', windowTo: '',
  locationIds: [], seasonIds: [], gender: '',
  minActivities: null, maxActivities: null,
  includeTestLocations: false, includeTestAccounts: true,
};

export interface Act { id: number; name: string; date: string | null; location: string | null; matches: number; wins: number; spend: number; }

export interface Player {
  id: number; name: string; phone: string; gender: string | null;
  dob: string | null; email: string | null; createdAt: string; lastActiveAt: string | null;
  rankTier: string | null; level: number; isTestAccount: boolean; hasPush: boolean;
  activities: number; matches: number; wins: number; losses: number; survived: number;
  matchesWithoutActivity: number;
  firstActivityAt: string | null; lastActivityAt: string | null;
  daysToFirstActivity: number | null; daysSinceLastActivity: number | null;
  longestGapDays: number; locationsCount: number; activitiesMissedSince: number;
  bookings: number; bookedActivities: number; attendedOfBooked: number; noShows: number; walkIns: number;
  paidTotal: number; unpaidTotal: number; fnbTotal: number;
  chipsEarned: number; chipsSpent: number; chipsTopupJod: number;
  feedbackCount: number; feedbackAvg: number | null; lastFeedbackAt: string | null;
  cheatSignals: number; cheatWeight: number; penalties: number;
  followers: number; following: number;
  acts: Act[];
}

export interface Totals {
  players: number; attended: number; returned: number; regular: number; neverAttended: number;
  activities: number; matches: number; wins: number;
  bookings: number; noShows: number; walkIns: number;
  paidTotal: number; unpaidTotal: number; fnbTotal: number;
  chipsEarned: number; chipsSpent: number; chipsTopupJod: number;
  feedbackCount: number; feedbackAvg: number | null; withPush: number;
  avgActivities: number; returnRate: number; noShowRate: number; winRate: number;
}

export interface ExploreResult {
  generatedAt: string; tookMs: number;
  totals: Totals;
  funnel: { key: string; labelAr: string; count: number; pct: number }[];
  distribution: { activities: number; players: number }[];
  players: Player[];
}

export interface SavedView { id: string; name: string; lens: any; createdAt: string; createdBy?: string; }
export interface Option { value: string; labelAr: string; }

// ── الاتّصال ──────────────────────────────────────────
async function ok(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

export function lensToQuery(l: Lens): string {
  const q = new URLSearchParams();
  const put = (k: string, v: unknown) => { if (v !== '' && v !== null && v !== undefined) q.set(k, String(v)); };
  put('signupFrom', l.signupFrom); put('signupTo', l.signupTo);
  put('windowFrom', l.windowFrom); put('windowTo', l.windowTo);
  if (l.locationIds.length) put('locationIds', l.locationIds.join(','));
  if (l.seasonIds.length) put('seasonIds', l.seasonIds.join(','));
  put('gender', l.gender);
  put('minActivities', l.minActivities); put('maxActivities', l.maxActivities);
  put('includeTestLocations', l.includeTestLocations);
  put('includeTestAccounts', l.includeTestAccounts);
  return q.toString();
}

export async function fetchExplore(l: Lens, signal?: AbortSignal): Promise<ExploreResult> {
  const res = await fetch(`${API}/api/analytics/explore?${lensToQuery(l)}`, { headers: headers(), signal });
  return (await ok(res)) as ExploreResult;
}

export async function fetchOptions(): Promise<{ locations: Option[]; seasons: Option[] }> {
  const res = await fetch(`${API}/api/analytics/explore/options`, { headers: headers() });
  const d = await ok(res);
  return { locations: d.locations || [], seasons: d.seasons || [] };
}

export async function fetchViews(): Promise<SavedView[]> {
  const res = await fetch(`${API}/api/analytics/views`, { headers: headers() });
  return (await ok(res)).views || [];
}
export async function saveView(name: string, lens: Lens): Promise<SavedView[]> {
  const res = await fetch(`${API}/api/analytics/views`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ name, lens }) });
  return (await ok(res)).views || [];
}
export async function removeView(id: string): Promise<SavedView[]> {
  const res = await fetch(`${API}/api/analytics/views/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: headers() });
  return (await ok(res)).views || [];
}
export async function pushNotify(playerId: number, title: string, body: string): Promise<void> {
  const res = await fetch(`${API}/api/analytics/notify`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ playerId, title, body }) });
  await ok(res);
}

// ── تحويل العدسة إلى معاملات تقرير التصدير ──
// نفس العدسة تماماً كي لا يختلف رقمُ الملفّ عن رقم الشاشة.
export function lensToReportParams(l: Lens): Record<string, unknown> {
  const abs = !!(l.windowFrom || l.windowTo);
  return {
    signup: { from: l.signupFrom || '2020-01-01', to: l.signupTo || new Date().toISOString().slice(0, 10) },
    absoluteWindow: abs,
    window: abs ? { from: l.windowFrom || '2020-01-01', to: l.windowTo || new Date().toISOString().slice(0, 10) } : undefined,
    locationId: l.locationIds[0],
    gender: l.gender,
    minActivities: l.minActivities ?? undefined,
    maxActivities: l.maxActivities ?? undefined,
    excludeTestAccounts: !l.includeTestAccounts,
    includeTestLocations: l.includeTestLocations,
  };
}

// ── أدوات ────────────────────────────────────────────
export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');
export const fmtMoney = (n: number | null | undefined) => `${(Math.round((n ?? 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.أ`;
export const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const shiftDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** بداية أسبوع الأحد لتاريخٍ نصّيّ (الأسبوع العمليّ في الأردن). */
export function weekStart(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

// ── مصفوفة الاحتفاظ ──────────────────────────────────
// صفٌّ لكلّ أسبوع تسجيل، وعمودٌ للأسبوع رقم k بعده. الخليّة = نسبة من حضر فعاليّةً
// في ذلك الأسبوع. الخلايا التي لم يمرّ عليها أسبوعٌ كامل تُوسَم `censored` وتُعتَّم:
// بدون ذلك تُقرأ حداثةُ الفوج انهياراً في الاحتفاظ.
export interface CohortRow {
  week: string; size: number;
  cells: { pct: number; count: number; censored: boolean }[];
}

export function buildCohorts(players: Player[], maxWeeks = 8): { rows: CohortRow[]; weeks: number } {
  const today = todayISO();
  const groups = new Map<string, Player[]>();
  players.forEach((p) => {
    const w = weekStart(p.createdAt);
    const bucket = groups.get(w);
    if (bucket) bucket.push(p); else groups.set(w, [p]);
  });

  const rows: CohortRow[] = [];
  let widest = 1;
  Array.from(groups.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).forEach(([week, group]: [string, Player[]]) => {
    // آخر عمودٍ ذو معنى لهذا الفوج = عدد الأسابيع المنقضية منذ بدايته
    const elapsed = Math.floor(daysBetween(week, today) / 7);
    const cols = Math.min(maxWeeks, Math.max(1, elapsed + 1));
    widest = Math.max(widest, cols);
    const cells = Array.from({ length: cols }, (_, k) => {
      const from = shiftDays(week, k * 7), to = shiftDays(week, k * 7 + 6);
      const count = group.filter((p) => p.acts.some((a) => a.date && a.date >= from && a.date <= to)).length;
      return { count, pct: pctOf(count, group.length), censored: to > today };
    });
    rows.push({ week, size: group.length, cells });
  });
  return { rows, weeks: widest };
}

// ── واتساب ───────────────────────────────────────────
// المحرّك والنطاق من المصدر المشترك lib/whatsapp.ts — لا نسخةَ ثانية هنا.
import { normalizePhoneIntl, fillTemplate as fill, type TemplateVar } from '@/lib/whatsapp';

export const normalizePhone = normalizePhoneIntl;

export const WA_VARS: TemplateVar<Player>[] = [
  { token: '{الاسم}', label: 'الاسم', get: (p) => p.name },
  { token: '{الفعاليات}', label: 'عدد فعاليّاته', get: (p) => String(p.activities) },
  { token: '{آخر_حضور}', label: 'آخر حضور', optional: true, get: (p) => p.lastActivityAt || '' },
  { token: '{الأيام}', label: 'أيّام منذ آخر حضور', optional: true,
    get: (p) => (p.daysSinceLastActivity == null ? '' : String(p.daysSinceLastActivity)) },
  { token: '{الغياب}', label: 'فعاليّات فاتته', get: (p) => String(p.activitiesMissedSince) },
];

export const WA_DEFAULT = [
  'مرحباً {الاسم} 👋',
  'اشتقنالك في نادي المافيا 🎭 فاتتك {الغياب} فعاليّة من آخر مرّة لعبت معنا.',
  'في فعاليّات جديدة قريباً — احجز مكانك! 🎟️',
].join('\n');

export const fillTemplate = (tpl: string, p: Player): string => fill(tpl, WA_VARS, p);
