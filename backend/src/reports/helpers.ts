// ══════════════════════════════════════════════════════
// 🧮 مساعدات التقارير — شظايا SQL مشتركة + أدوات
// كل تعبيرات الدخل النقدي مأخوذة حرفياً من المنطق المثبّت في
// reports.routes.ts (الدخل = المدفوع فقط، المستحقات منفصلة).
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { bookings, costs, activities } from '../schemas/admin.schema.js';
import { matches } from '../schemas/game.schema.js';

type BookingsTable = typeof bookings;

// ── استبعاد بيانات أماكن الاختبار (test location) من التقارير التجميعية ──
// المحور الصحيح هو "المكان" لا "الحساب" (مطابقةً لـ reconcile.service الحيّ).
// كل شرط قائم بذاته (subquery) فلا يحتاج JOIN، ويُستخدم فقط في استعلام يضمّ جدوله.

// على جدول activities: يُبقي الأنشطة بلا موقع، ويستبعد أنشطة أماكن الاختبار.
export const notTestActivity = sql`(${activities.locationId} IS NULL OR ${activities.locationId} NOT IN (SELECT id FROM locations WHERE is_test_location IS TRUE))`;

// على جدول costs: يستبعد المصاريف المرتبطة بنشاط في مكان اختبار (يُبقي المصاريف العامة).
export const notTestCost = sql`(${costs.activityId} IS NULL OR ${costs.activityId} NOT IN (SELECT id FROM activities WHERE location_id IN (SELECT id FROM locations WHERE is_test_location IS TRUE)))`;

// على جدول matches: يستبعد مباريات أماكن الاختبار.
export const notTestMatch = sql`(${matches.sessionId} IS NULL OR ${matches.sessionId} NOT IN (SELECT s.id FROM sessions s JOIN activities a ON s.activity_id = a.id WHERE a.location_id IN (SELECT id FROM locations WHERE is_test_location IS TRUE)))`;

// ── تعبيرات مالية (نقدي فقط) ──────────────────────────
// الدخل المحصّل: مدفوع وغير مجاني
export const paidRevenue = (b: BookingsTable = bookings) =>
  sql<number>`COALESCE(SUM(CASE WHEN ${b.isPaid} = true AND ${b.isFree} = false THEN ${b.paidAmount}::numeric ELSE 0 END), 0)`;

// المستحقات المعلّقة: غير مدفوع وغير مجاني (خارج الصافي)
export const unpaidReceivable = (b: BookingsTable = bookings) =>
  sql<number>`COALESCE(SUM(CASE WHEN ${b.isPaid} = false AND ${b.isFree} = false THEN ${b.paidAmount}::numeric ELSE 0 END), 0)`;

export const paidCount = (b: BookingsTable = bookings) =>
  sql<number>`COALESCE(SUM(CASE WHEN ${b.isPaid} = true AND ${b.isFree} = false THEN 1 ELSE 0 END), 0)::int`;

export const unpaidCount = (b: BookingsTable = bookings) =>
  sql<number>`COALESCE(SUM(CASE WHEN ${b.isPaid} = false AND ${b.isFree} = false THEN 1 ELSE 0 END), 0)::int`;

export const freeCount = (b: BookingsTable = bookings) =>
  sql<number>`COALESCE(SUM(CASE WHEN ${b.isFree} = true THEN 1 ELSE 0 END), 0)::int`;

// ── أدوات أرقام/تواريخ ────────────────────────────────
export const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

export const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** يحوّل {from,to} النصّيين إلى كائنَي Date (نهاية اليوم للـ to). */
export function rangeDates(range: { from: string; to: string } | undefined): { from: Date; to: Date } {
  const from = range?.from ? new Date(range.from) : new Date('2020-01-01');
  const to = range?.to ? new Date(range.to) : new Date();
  // شمول اليوم الأخير كاملاً
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

/** ملخّص فترة عربي للعرض في رأس التقرير. */
export function rangeLabel(range: { from: string; to: string } | undefined): string {
  if (!range?.from && !range?.to) return 'كل الفترات';
  const fmt = (d: string) => {
    try { return new Date(d).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return d; }
  };
  return `من ${fmt(range.from)} إلى ${fmt(range.to)}`;
}
