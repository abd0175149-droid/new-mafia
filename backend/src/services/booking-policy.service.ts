// ══════════════════════════════════════════════════════
// 📜 سياسة الحجز — مصدرٌ واحد لكلّ القنوات (خطّة توحيد الحجز م٢-ب، 2026-11-21)
// ══════════════════════════════════════════════════════
// كانت مهلُ الحجز ثوابتَ مبعثرة بقيمٍ مختلفة: التطبيق يلغي حتّى البدء، والدون حتّى ٣ ساعات،
// وتعديل العدد في الدون ٣ ساعات، والحجز بعد البدء ٦ ساعات، والإلغاء المتأخّر (غياب) ٦ ساعات.
// قرار المالك ق٢ (معتمد): قاعدةٌ واحدة للتطبيق والدون — الإلغاء الذاتيّ حتّى ٣ ساعات قبل اللعبة،
// وبعدها طلبٌ للإدارة، والمدفوع للإدارة دائماً. والقيم تُضبط من «قواعد الحجز والعروض».
// تُقرأ متزامنةً من ذاكرةٍ مخبّأة تُنعَّش كلّ ٣٠ ثانية وعند كلّ حفظ (مثل إعدادات القنوات).

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

export interface BookingPolicy {
  /** الإلغاء الذاتيّ (التطبيق والدون) حتّى هذا العدد من الساعات قبل اللعبة؛ بعده طلبٌ للإدارة */
  selfCancelHours: number;
  /** تعديل العدد أو الأسماء بنفسه حتّى هذا العدد من الساعات قبل اللعبة */
  changeHours: number;
  /** الحجز مسموحٌ بعد موعد البدء لهذا العدد من الساعات (الغرفة الحيّة تُحجز دائماً) */
  bookableGraceHours: number;
  /** إلغاءٌ في آخر هذا العدد من الساعات يُحسب غياباً (يحرم من السعر المبكّر التالي) */
  lateCancelHours: number;
  /** ق٧: الغياب ينتهي بعد هذا العدد من الأيّام (٠ = لا ينتهي) */
  strikeExpiryDays: number;
  /** ق٢٠: مهلة المقعد المعروض على أوّل الدور (دقائق) */
  waitlistHoldMinutes: number;
}

export const DEFAULT_BOOKING_POLICY: BookingPolicy = { selfCancelHours: 3, changeHours: 3, bookableGraceHours: 6, lateCancelHours: 6, strikeExpiryDays: 45, waitlistHoldMinutes: 30 };
const KEY = 'booking_policy';

const clamp = (v: any, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 2) / 2)) : d;
};
export function normalizePolicy(raw: any): BookingPolicy {
  const d = DEFAULT_BOOKING_POLICY;
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    selfCancelHours: clamp(r.selfCancelHours, d.selfCancelHours, 0, 72),
    changeHours: clamp(r.changeHours, d.changeHours, 0, 72),
    bookableGraceHours: clamp(r.bookableGraceHours, d.bookableGraceHours, 0, 24),
    lateCancelHours: clamp(r.lateCancelHours, d.lateCancelHours, 0, 72),
    strikeExpiryDays: Math.round(clamp(r.strikeExpiryDays, d.strikeExpiryDays, 0, 365)),
    waitlistHoldMinutes: Math.round(clamp(r.waitlistHoldMinutes, d.waitlistHoldMinutes, 5, 240)),
  };
}

let cached: BookingPolicy = { ...DEFAULT_BOOKING_POLICY };
let loadedAt = 0;
async function refresh(): Promise<void> {
  try {
    const db = getDB(); if (!db) return;
    const r: any = await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${KEY} LIMIT 1`);
    cached = normalizePolicy((r?.rows ?? r ?? [])[0]?.value);
    loadedAt = Date.now();
  } catch { /* تبقى الأخيرة */ }
}
/** القيمة الحاليّة متزامنةً — تُنعَّش في الخلفيّة كلّ ٣٠ ثانية */
export function bookingPolicy(): BookingPolicy {
  if (Date.now() - loadedAt > 30_000) { loadedAt = Date.now(); void refresh(); }
  return cached;
}
/** للمسارات التي تقرّر الآن (الإلغاء): القيمة من القاعدة */
export async function bookingPolicyFresh(): Promise<BookingPolicy> { await refresh(); return cached; }

export async function saveBookingPolicy(input: any, by: string): Promise<BookingPolicy> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  const v = normalizePolicy({ ...cached, ...(input || {}) });
  // الجدول بلا عمود «من حفظ» — يُحفظ داخل القيمة
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
    VALUES (${KEY}, ${JSON.stringify({ ...v, _by: by, _at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  cached = v; loadedAt = Date.now();
  return v;
}

const H = 3600e3;
/** هل ما زال الإلغاء الذاتيّ مفتوحاً لفعاليّةٍ بهذا الموعد؟ */
export function selfCancelOpen(activityDate: Date | string | number, now = Date.now()): boolean {
  return new Date(activityDate as any).getTime() - now >= bookingPolicy().selfCancelHours * H;
}
