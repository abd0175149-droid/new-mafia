// ══════════════════════════════════════════════════════
// 🧮 مساعدات التقارير — شظايا SQL مشتركة + أدوات
// كل تعبيرات الدخل النقدي مأخوذة حرفياً من المنطق المثبّت في
// reports.routes.ts (الدخل = المدفوع فقط، المستحقات منفصلة).
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { bookings } from '../schemas/admin.schema.js';

type BookingsTable = typeof bookings;

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
