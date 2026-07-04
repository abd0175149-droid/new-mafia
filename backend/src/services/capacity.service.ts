// ══════════════════════════════════════════════════════
// 🪑 خدمة سعة الغرفة — المصدر الموحّد الوحيد لقرار «كم مقعداً في الغرفة»
//
// شجرة القرار (من الأعلى أولوية):
//   1. تجاوز يدوي من الليدر (state.config.maxPlayersManual) — يُحترم حتى يُلغى صراحة
//   2. قالب المقاعد المرتبط بالفعالية (seat_templates.totalSeats)
//   3. سعة الفعالية (activities.maxCapacity)
//   4. الافتراضي 27
// الحدود دائماً: 6..50.
//
// ملاحظة: الحجوزات بلا سقف نهائياً (قرار تشغيلي — اللاعبون يتناوبون)؛
// هذه الخدمة تخص مقاعد الغرفة فقط.
// ══════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities } from '../schemas/admin.schema.js';
import { seatTemplates } from '../schemas/seat-templates.schema.js';

export const DEFAULT_ROOM_CAPACITY = 27;
export const MIN_ROOM_CAPACITY = 6;
export const MAX_ROOM_CAPACITY = 50;

export function clampCapacity(n: number): number {
  return Math.min(MAX_ROOM_CAPACITY, Math.max(MIN_ROOM_CAPACITY, Math.floor(n)));
}

/**
 * يحسم سعة الغرفة لفعالية: قالب المقاعد ← سعة الفعالية ← الافتراضي 27.
 * يُستخدم من مسارَي إنشاء الغرفة (السوكت وREST) لضمان نتيجة واحدة دائماً.
 */
export async function resolveRoomCapacity(activityId?: number | null): Promise<number> {
  if (!activityId) return DEFAULT_ROOM_CAPACITY;
  const db = getDB();
  if (!db) return DEFAULT_ROOM_CAPACITY;
  try {
    const [act] = await db
      .select({ maxCapacity: activities.maxCapacity, seatTemplateId: activities.seatTemplateId })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);
    if (!act) return DEFAULT_ROOM_CAPACITY;

    // 1) قالب المقاعد المرتبط — الأولوية العليا
    if (act.seatTemplateId) {
      const [tpl] = await db
        .select({ totalSeats: seatTemplates.totalSeats })
        .from(seatTemplates)
        .where(eq(seatTemplates.id, act.seatTemplateId))
        .limit(1);
      if (tpl && Number(tpl.totalSeats) >= MIN_ROOM_CAPACITY) {
        return clampCapacity(Number(tpl.totalSeats));
      }
    }

    // 2) سعة الفعالية
    if (act.maxCapacity && Number(act.maxCapacity) >= MIN_ROOM_CAPACITY) {
      return clampCapacity(Number(act.maxCapacity));
    }
  } catch { /* fallback للافتراضي */ }
  return DEFAULT_ROOM_CAPACITY;
}
