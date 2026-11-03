// ══════════════════════════════════════════════════════
// 🖐️ اختيار المقعد اليدويّ — قراءة المفتاح من الفعاليّة
//
// يُقرأ من الفعاليّة عند كلّ انضمامٍ/مغادرة لا من لقطةٍ في Redis: تبديله من
// نموذج الفعاليّة أثناء الليلة يسري من الحركة التالية بلا إعادة إنشاء للغرفة.
// المنطق المحض في game/seating/manual-seat.ts.
// ══════════════════════════════════════════════════════

export async function isManualSeatActivity(activityId: number | null | undefined): Promise<boolean> {
  const id = Number(activityId);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    const { getDB } = await import('../config/db.js');
    const db = getDB();
    if (!db) return false;
    const { activities } = await import('../schemas/admin.schema.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select({ on: activities.manualSeatSelection })
      .from(activities).where(eq(activities.id, id)).limit(1);
    return row?.on === true;
  } catch (e: any) {
    // عطلٌ تقنيّ ⇒ السلوك المعتاد (التوزيع الآليّ والحجز المؤقّت) — لا حجبَ ولا إفراغ
    console.warn('⚠️ manual seat flag read failed:', e.message);
    return false;
  }
}

/** يحسم المفتاح لغرفةٍ ويختمه عليها (`manualSeats`) لمن يقرأ الحالة بلا قاعدة بيانات */
export async function stampManualSeats(state: any): Promise<boolean> {
  const on = await isManualSeatActivity(state?.activityId);
  if (state) state.manualSeats = on;
  return on;
}
