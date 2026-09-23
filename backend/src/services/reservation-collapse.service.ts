// ══════════════════════════════════════════════════════
// 🪑 طيُّ مجموعات المتابعة — علاج العدّ المزدوج
// ══════════════════════════════════════════════════════
//
// 🔴 المشكلة التي يحلّها هذا الملفّ (شُخِّصت 2026-09-23):
//
//   صفّ المتابعة يحمل **رقماً لا هويّات**: «خالد + ٤ أصدقاء» = people_count 5.
//   وصيغةُ العدّ الموحّدة (booking-count.service) تحسب:
//       bookings.count + (appConfirmed ? people−1 : people)
//   وهي صحيحةٌ ما دام المرافقون مجرّد رقم. لكنّ قاعدة النادي أنّ **كلّ لاعب
//   يحجز من التطبيق قبل دخول الغرفة** — فيتجسّد كلّ مرافقٍ لاعباً مستقلّاً له
//   صفُّ حجزٍ خاصّ (+1) بينما يبقى محسوباً داخل الـ٥. أربعة أصدقاء ⟵ **٩ لخمسة**.
//
//   ولا يمكن إصلاحها لحظة حجز الصديق: لا شيء يربطه بمجموعة خالد، ومعاملةُ كلّ
//   حجزٍ جديد كأنّه مرافقٌ لمجموعةٍ ما تُفسد الحجوزات المستقلّة وهي الأغلب.
//
// 💡 الحلّ يتجاوز مشكلة الهويّة: لا نسأل «مَن كان مرافقاً؟» بل «هل انتهت مهمّة
//    الرقم المجهول؟». وعند **دخول الغرفة** تكون الإجابة نعم قطعاً — لأنّ كلّ
//    حاضرٍ صار له حجزُ تطبيقٍ يعدّه بنفسه، فما تبقّى من (people−1) تكرارٌ محض.
//
// 📌 قرارا المالك (2026-09-23):
//    • الطيّ يقع **فور دخول الغرفة** (room:auto-join) لا عند بدء اللعبة.
//    • ومن لم يدخل صاحبُ مجموعته تُطوى مجموعته **عند إنهاء الفعاليّة**.
//
// 🧾 المعلومة لا تضيع مرّتين: ملاحظةٌ نصّيّة للبشر في الصفحة، **وعمودٌ رقميّ**
//    (companions_collapsed) للتقارير — فملاحظةٌ نصّيّة لا تُجمع ولا تُحصى.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

export interface CollapseResult {
  collapsed: number;        // كم صفّ متابعة طُوي
  companions: number;       // كم مرافقاً انطوى (مجموع people−1)
}

const EMPTY: CollapseResult = { collapsed: 0, companions: 0 };

/**
 * 🚪 طيُّ مجموعة لاعبٍ دخل غرفة فعاليّته.
 *
 * يُطابق صفّ المتابعة بـplayer_id **أو بالهاتف** — فمتابعةُ البوت قد تُكتب قبل
 * ربط الحساب، وحينها يكون الهاتف هو الرابط الوحيد.
 *
 * متكرّرةُ الأمان: الحارسان `people_count > 1` و`collapsed_at IS NULL` يجعلان
 * إعادة الانضمام (أو دخول اللاعب من جهازين) بلا أثرٍ إضافيّ.
 */
export async function collapseGroupOnRoomJoin(
  playerId: number | null | undefined,
  activityId: number | null | undefined,
  phone?: string | null,
): Promise<CollapseResult> {
  const db = getDB();
  if (!db || !activityId || (!playerId && !phone)) return EMPTY;

  try {
    const res = await db.execute(sql`
      UPDATE reservations SET
        people_count = 1,
        companions_collapsed = GREATEST(COALESCE(people_count, 1) - 1, 0),
        companions_collapsed_at = NOW(),
        notes = COALESCE(notes, '') ||
          ' · 🪑 كان حاجزاً لـ' || COALESCE(people_count, 1)::text ||
          ' — انطوى عند دخوله الغرفة (أصدقاؤه يحجزون لأنفسهم من التطبيق)',
        updated_at = NOW()
      WHERE activity_id = ${activityId}
        AND deleted_at IS NULL
        AND COALESCE(people_count, 1) > 1
        AND companions_collapsed_at IS NULL
        AND (
          ${playerId ? sql`player_id = ${playerId}` : sql`false`}
          OR ${phone ? sql`phone = ${phone}` : sql`false`}
        )
      RETURNING id, companions_collapsed`);
    const rows = rowsOf(res);
    if (!rows.length) return EMPTY;
    const companions = rows.reduce((s: number, r: any) => s + Number(r.companions_collapsed || 0), 0);
    console.log(`🪑 طُويت ${rows.length} مجموعة عند دخول الغرفة (فعاليّة ${activityId}) — ${companions} مرافقاً`);
    return { collapsed: rows.length, companions };
  } catch (e: any) {
    // ⚠️ لا يُفشل الانضمام أبداً: هذا تصحيحُ عدٍّ لا بوّابةُ دخول.
    console.warn('⚠️ collapseGroupOnRoomJoin:', e?.message || e);
    return EMPTY;
  }
}

/**
 * 🏁 الطيُّ الختاميّ عند إنهاء الفعاليّة — لمن لم يدخل صاحبُ مجموعته الغرفة.
 *
 * بعد انتهاء الأمسية لم يعد للرقم المجهول وظيفة: المقاعد لم تعد تُحجز، ومن حضر
 * فعلاً له صفّ حجزٍ يعدّه. فإبقاء (people−1) يُبقي التقارير التاريخيّة منتفخة.
 *
 * ⚠️ ما يُفقد عمداً: مرافقٌ حضر ولم يحجز من التطبيق — لكنّه غير مرئيٍّ للماليّة
 *    أصلاً (لا صفّ حجزٍ له)، والعدد الأصليّ محفوظٌ في العمود والملاحظة فلا يضيع.
 */
export async function collapseRemainingForActivity(activityId: number | null | undefined): Promise<CollapseResult> {
  const db = getDB();
  if (!db || !activityId) return EMPTY;

  try {
    const res = await db.execute(sql`
      UPDATE reservations SET
        people_count = 1,
        companions_collapsed = GREATEST(COALESCE(people_count, 1) - 1, 0),
        companions_collapsed_at = NOW(),
        notes = COALESCE(notes, '') ||
          ' · 🏁 كان حاجزاً لـ' || COALESCE(people_count, 1)::text ||
          ' — انطوى عند إنهاء الفعاليّة (لم يدخل الغرفة بنفسه)',
        updated_at = NOW()
      WHERE activity_id = ${activityId}
        AND deleted_at IS NULL
        AND COALESCE(people_count, 1) > 1
        AND companions_collapsed_at IS NULL
        AND status <> 'waitlist'
      RETURNING id, companions_collapsed`);
    const rows = rowsOf(res);
    if (!rows.length) return EMPTY;
    const companions = rows.reduce((s: number, r: any) => s + Number(r.companions_collapsed || 0), 0);
    console.log(`🏁 طيٌّ ختاميّ: ${rows.length} مجموعة (فعاليّة ${activityId}) — ${companions} مرافقاً`);
    return { collapsed: rows.length, companions };
  } catch (e: any) {
    console.warn('⚠️ collapseRemainingForActivity:', e?.message || e);
    return EMPTY;
  }
}

/**
 * ↩️ فكُّ الطيّ — للتصحيح اليدويّ من اللوحة إن طُويت مجموعةٌ خطأً.
 * يُعيد العدد الأصليّ من العمود المحفوظ (لا من الملاحظة النصّيّة).
 */
export async function undoCollapse(reservationId: number): Promise<{ ok: boolean; restored?: number; error?: string }> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };
  const res = await db.execute(sql`
    UPDATE reservations SET
      people_count = 1 + COALESCE(companions_collapsed, 0),
      companions_collapsed = 0,
      companions_collapsed_at = NULL,
      notes = COALESCE(notes, '') || ' · ↩️ فُكّ الطيّ يدويّاً',
      updated_at = NOW()
    WHERE id = ${reservationId} AND companions_collapsed_at IS NOT NULL
    RETURNING people_count`);
  const row = rowsOf(res)[0];
  if (!row) return { ok: false, error: 'هذا الحجز غير مطويّ' };
  return { ok: true, restored: Number(row.people_count) };
}
