// ══════════════════════════════════════════════════════
// 👥 عدد المحجوزين — المصدر الموحّد الوحيد
// ══════════════════════════════════════════════════════
//
// 🔴 لماذا وُجد هذا الملفّ: كان في النظام **ثلاثة** أجوبةٍ مختلفة لسؤالٍ واحد،
//    وكلٌّ منها يظهر لجمهورٍ مختلف فيتناقض ما يراه الموظّف مع ما يراه اللاعب:
//
//      • تطبيق اللاعب  → `SUM(bookings.count)` وحده. لا يرى المتابعة إطلاقاً،
//        فمن أدخلتَهم يدويّاً بلا حسابات ومرافقو اللاعبين **يختفون من العدّ**.
//        (فعاليّة ٢٢٤: عرض ٢٠ والحقيقة ٢٧ — سبعة أشخاصٍ غير مرئيّين.)
//      • بوت الواتساب → الصيغة الكاملة أدناه، وهي الصحيحة.
//      • صفحة الفعاليّة → حجوزات + مجموعات المتابعة **المثبَّتة وحدها**.
//
//    والفرق ليس تجميليّاً: على هذا الرقم يُقال للزبون «فيه مجال» أو «امتلأنا».
//
// 🧮 الصيغة:
//      المحجوزون = مجموع bookings.count
//                + Σ على المتابعة: appConfirmed ? (people−1) : people
//
//    ومعناها: صفُّ الحجز يحمل **صاحبه وحده** (اتّفاقيّة العدّ في
//    reservation-booking.service)، فمتى وُجد صفُّ حجزٍ لصاحب المتابعة — وهذا
//    ما يعنيه `appConfirmed` — احتُسب من هناك ولم يبقَ من صفّ المتابعة إلّا
//    مرافقوه. وبدون الوسم لا صفَّ حجزٍ له، فيُحتسب كاملاً من المتابعة.
//    إسقاطُ أحد الطرفين يُنقص العدّ، وجمعُهما بلا الطرح يُضاعف صاحب الحجز.
//
// ⚖️ وقائمةُ الانتظار وحدها تُستثنى: هي نيّةُ حجزٍ لم تُقبل بعد، فعدّها يملأ
//    فعاليّةً بمن لم يُحجز لهم. أمّا «غير المثبَّت» فمحجوزٌ ينتظر التثبيت —
//    يُعدّ. (وهذا يختلف عن `roster-groups` التي تَعدّ المثبَّت وحده عمداً،
//    لأنّ سؤالها آخر: **من يُخصَّص له مقعد**، لا كم مقعداً مشغول.)
// ══════════════════════════════════════════════════════

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { bookings, reservations } from '../schemas/admin.schema.js';

/**
 * عدد المحجوزين لعدّة فعاليّات دفعةً واحدة.
 * 🔴 استعلامان اثنان مهما بلغ عدد الفعاليّات — لا استعلامٌ لكلّ صفّ: النداءُ
 *    الأصليّ في تطبيق اللاعب كان داخل حلقة، فقائمةُ عشرين فعاليّة عشرون رحلة.
 */
export async function countBookedPeopleBatch(activityIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const db = getDB();
  const ids = [...new Set(activityIds.filter(n => Number.isFinite(n)))];
  if (!db || ids.length === 0) return out;
  for (const id of ids) out.set(id, 0);

  // ── الحجوزات الفعليّة ──
  const bkRows = await db
    .select({
      activityId: bookings.activityId,
      total: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
    })
    .from(bookings)
    .where(and(inArray(bookings.activityId, ids), isNull(bookings.deletedAt)))
    .groupBy(bookings.activityId);
  for (const r of bkRows) {
    out.set(Number(r.activityId), (out.get(Number(r.activityId)) || 0) + Number(r.total || 0));
  }

  // ── متابعة الحجوزات (بلا قائمة الانتظار) ──
  const resRows = await db
    .select({
      activityId: reservations.activityId,
      total: sql<number>`COALESCE(SUM(
        CASE WHEN ${reservations.appConfirmed} THEN GREATEST(COALESCE(${reservations.peopleCount}, 1) - 1, 0)
             ELSE COALESCE(${reservations.peopleCount}, 1) END
      ), 0)::int`,
    })
    .from(reservations)
    .where(and(
      inArray(reservations.activityId, ids),
      isNull(reservations.deletedAt),
      sql`${reservations.status} <> 'waitlist'`,
    ))
    .groupBy(reservations.activityId);
  for (const r of resRows) {
    const id = Number(r.activityId);
    if (!out.has(id)) continue;
    out.set(id, (out.get(id) || 0) + Number(r.total || 0));
  }

  return out;
}

/** عدد المحجوزين لفعاليّة واحدة. */
export async function countBookedPeople(activityId: number): Promise<number> {
  const m = await countBookedPeopleBatch([activityId]);
  return m.get(Number(activityId)) ?? 0;
}

/**
 * تفصيلُ العدد — للواجهات التي تشرح الرقم لا تعرضه فقط
 * (كم منهم له صفُّ حجز، وكم لاعبٌ جديدٌ بلا حساب، وكم مرافق).
 */
export async function bookedBreakdown(activityId: number): Promise<{
  total: number; booked: number; newcomers: number; companions: number;
}> {
  const db = getDB();
  if (!db) return { total: 0, booked: 0, newcomers: 0, companions: 0 };

  const [bk] = await db
    .select({ total: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int` })
    .from(bookings)
    .where(and(eq(bookings.activityId, activityId), isNull(bookings.deletedAt)));

  const rows = await db
    .select({
      playerId: reservations.playerId,
      people: reservations.peopleCount,
      appConfirmed: reservations.appConfirmed,
    })
    .from(reservations)
    .where(and(
      eq(reservations.activityId, activityId),
      isNull(reservations.deletedAt),
      sql`${reservations.status} <> 'waitlist'`,
    ));

  let newcomers = 0, companions = 0;
  for (const r of rows) {
    const ppl = Math.max(1, Number(r.people ?? 1));
    if (r.appConfirmed) {
      companions += Math.max(0, ppl - 1);        // صاحبُه محسوبٌ في bookings
    } else if (r.playerId) {
      companions += Math.max(0, ppl - 1);
      newcomers += 1;                            // صاحبُه بلا صفّ حجزٍ بعد
    } else {
      newcomers += ppl;                          // لا حساب له ولا صفّ — هو ومرافقوه
    }
  }

  const booked = Number(bk?.total || 0);
  return { total: booked + newcomers + companions, booked, newcomers, companions };
}
