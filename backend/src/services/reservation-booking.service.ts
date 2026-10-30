// ══════════════════════════════════════════════════════
// 🔗 تثبيت حجز المتابعة ⇐ حجزٌ فعليّ في الفعاليّة
// قبل هذا كان التثبيت في «متابعة الحجوزات» وسماً لا أثر له: اللاعب يُخبَر أنّ
// حجزه مؤكَّد، ثمّ لا يجده في التطبيق ولا يظهر في قائمة حجوزات الفعاليّة.
// الآن التثبيت يُنشئ صفّ bookings حقيقيّاً — وهو ما يقرؤه تطبيق اللاعب
// (bookings.playerId) وتقرؤه قائمة الفعاليّة والفواتير والتقارير.
//
// المبادئ:
//   • عمليّة **متكرّرة الأمان** (idempotent): تثبيتٌ مرّتين لا يُنشئ حجزين.
//   • لا تلمس مالاً: الحجز يُنشأ غير مدفوع، والتحصيل من مساره.
//   • التراجع عن التثبيت يزيل حجزاً **أنشأه هذا المسار ولم يُدفع** فقط —
//     حجزٌ دُفع أو أُدخل يدويّاً لا يُمسّ.
//
// 🔴 اتّفاقيّة العدّ (قرار المالك 2026-07-30 — لا تُخالَف):
//   صفّ الحجز يحمل **صاحب الحجز وحده count=1**، والمرافقون يبقون في صفّ
//   المتابعة. والسبب أنّ صيغة المقاعد في seatAvailability تحسب:
//       bookings.count + (appConfirmed ? people-1 : people)
//   فلو حملنا الحجز العدد الكامل لاحتُسب الجميع مرّتين. ووسم appConfirmed
//   إلزاميّ مع كلّ مرآة — بدونه يُحسب صاحب الحجز مرّتين.
//   عرضُ المرافقين والضيوف مجمَّعين شأنُ الواجهة لا شأنُ هذا الجدول.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { bookings, reservations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';

/** وسمٌ يميّز ما أنشأه التثبيت — شرطُ التراجع الآمن. */
export const RES_CREATED_BY = 'reservation-confirm';

interface ResRow {
  id: number;
  activityId: number | null;
  contactName: string;
  phone: string | null;
  peopleCount: number | null;
  playerId: number | null;
}

/** يبحث عن حجزٍ قائم لنفس الشخص في نفس الفعاليّة (بالحساب أو الهاتف). */
async function findBooking(db: Database, r: ResRow) {
  const phone = (r.phone || '').trim();
  if (!r.activityId) return null;
  if (!r.playerId && !phone) return null;

  const [row] = await db.select().from(bookings)
    .where(and(
      eq(bookings.activityId, r.activityId),
      isNull(bookings.deletedAt),
      or(
        r.playerId ? eq(bookings.playerId, r.playerId) : sql`false`,
        phone ? eq(bookings.phone, phone) : sql`false`,
      ),
    ))
    .limit(1);
  return row ?? null;
}

/**
 * يضمن وجود حجزٍ مطابقٍ لحجز المتابعة المثبَّت.
 * يعيد 'created' | 'updated' | 'skipped' لتُسجَّل النتيجة في الردّ.
 */
export async function ensureBookingForReservation(db: Database, r: ResRow): Promise<'created' | 'updated' | 'skipped' | 'unlinked'> {
  if (!r.activityId) return 'skipped';           // حجزٌ بلا فعاليّة لا يُترجَم
  // 🔗 رقمٌ غير مربوطٍ بحساب لاعب: لا صفّ حجزٍ له — لا حساب في التطبيق يُظهره،
  //    ووجوده هنا يُفسد صيغة المقاعد. يظهر مجمَّعاً كـ«لاعب جديد» في واجهة الفعاليّة.
  if (!r.playerId) return 'unlinked';

  const phone = (r.phone || '').trim();
  const existing = await findBooking(db, r);

  // الوسم إلزاميّ في الحالتين (صفٌّ جديد أو قائم) وإلّا حُسب صاحب الحجز مرّتين
  const stamp = async () => {
    await db.update(reservations)
      .set({ appConfirmed: true, appConfirmedAt: new Date() } as any)
      .where(eq(reservations.id, r.id));
  };

  if (existing) {
    // حجزٌ قائم (من التطبيق أو البوت أو إدخالٍ يدويّ): نكمّله لا نكرّره
    if (!existing.playerId && r.playerId) {
      await db.update(bookings).set({ playerId: r.playerId } as any).where(eq(bookings.id, existing.id));
      await stamp();
      return 'updated';
    }
    await stamp();
    return 'skipped';
  }

  // حسابٌ مجّانيّ يُنشأ حجزه مدفوعاً بصفر — مطابقةً لمسار حجز التطبيق
  const [p] = await db.select({ name: players.name, phone: players.phone, isFreeAccount: players.isFreeAccount })
    .from(players).where(eq(players.id, r.playerId)).limit(1);
  const isFree = p?.isFreeAccount === true;

  await db.insert(bookings).values({
    activityId: r.activityId,
    name: p?.name || r.contactName,
    phone: p?.phone || phone,
    count: 1,                          // 🔴 صاحب الحجز وحده — المرافقون بصفّ المتابعة
    isPaid: isFree,
    paidAmount: '0',
    isFree,
    playerId: r.playerId,
    createdBy: RES_CREATED_BY,
    notes: `من متابعة الحجوزات #${r.id}`,
  } as any);
  await stamp();
  return 'created';
}

/**
 * التراجع عن التثبيت: يزيل الحجز **إن كان هذا المسار أنشأه ولم يُدفع**.
 * الشرطان معاً مقصودان — حجزٌ دُفع أو أُدخل يدويّاً يبقى ويُعالَج بيدٍ بشريّة.
 */
export async function removeBookingForReservation(db: Database, r: ResRow): Promise<boolean> {
  // الوسم يُرفع دائماً كي تعود صيغة المقاعد تحسب كامل مرافقي هذا الحجز
  await db.update(reservations)
    .set({ appConfirmed: false, appConfirmedAt: null } as any)
    .where(eq(reservations.id, r.id));

  const existing = await findBooking(db, r);
  if (!existing) return false;
  // 🔴 القاعدة المكتوبة أعلاه: «حجزٌ دُفع أو أُدخل يدويّاً لا يُمسّ». وكان الشرط
  //    أضيقَ من قاعدته: يُبقي كلَّ ما لم يُنشئه هذا المسار — ومنه حجزُ اللاعب من
  //    التطبيق. فيفكّ الموظّف التثبيت ويبقى اللاعب «محجوزاً» في تطبيقه، ولا شيء
  //    يخبره. (١٤ حالة في فعاليّة ١٥٣ وحدها.)
  //    الآن يُزال غيرُ المدفوع من المسارات الآليّة كلِّها — التثبيت والتطبيق والبوت —
  //    ويبقى محفوظاً ما دُفع وما أدخله موظّفٌ بيده.
  // 🔴 المجّانيّ ليس مدفوعاً: الحساب المجّانيّ يُنشئ حجزه بـ`is_paid=true`
  //    و`paid_amount=0` — لا مالَ فيه. وحارسُ «المدفوع لا يُمسّ» كان يحسبه
  //    مدفوعاً فيرفض إزالته، فيبقى صاحبُه «محجوزاً» بعد فكّ التثبيت أو الحذف.
  if (existing.isPaid === true && existing.isFree !== true) return false;
  const by = String(existing.createdBy || '');
  const automated = by === RES_CREATED_BY || by === 'player-app'
    || by.startsWith('\u{1F916}') || by.startsWith('\u{1F512}');
  if (!automated) return false;

  await db.update(bookings).set({ deletedAt: new Date() } as any).where(eq(bookings.id, existing.id));
  return true;
}

/**
 * ↩️ الاتّجاه المعاكس: حجزٌ أدخله موظّفٌ بيده (نموذج الحجز في محادثة الواتساب وصفحتَي
 * الحجوزات والفعاليّات — كلّها POST /api/bookings) كان يُسجَّل في الحجوزات ولا يظهر في
 * «متابعة الحجوزات»، بينما حجز التطبيق والبوت والعروض يُنشئ صفّيه معاً (طلب المالك 2026-10-30).
 * فغاب عن التثبيت والحضور ورسائل التأكيد.
 *
 * اتّفاقيّة العدّ نفسها أعلاه: صفّ الحجز يُردّ إلى صاحبه count=1 والمرافقون إلى peopleCount،
 * والوسم appConfirmed إلزاميّ — فمجموع المقاعد يبقى ما أدخله الموظّف بالضبط.
 * صفّ متابعةٍ قائم للشخص نفسه (أُدخل قبلاً أو حجز من البوت) يُكمَّل ولا يُكرَّر: يُثبَّت
 * (غير المثبّت وقائمة الانتظار — الموظّف حجز له فعلاً)، ويُربط بحسابه، ولا ينقص عدده.
 */
export async function ensureReservationForBooking(
  db: Database,
  b: { id: number; activityId: number; name: string; phone: string | null; count: number | null; playerId: number | null },
  meta: { createdBy: string; contactMethod?: string; notes?: string },
): Promise<{ result: 'created' | 'updated'; reservationId: number }> {
  const people = Math.max(1, Number(b.count) || 1);
  if (people > 1) await db.update(bookings).set({ count: 1 } as any).where(eq(bookings.id, b.id));

  const phone = (b.phone || '').trim();
  const [ex] = await db.select({ id: reservations.id, status: reservations.status, playerId: reservations.playerId, peopleCount: reservations.peopleCount })
    .from(reservations)
    .where(and(
      eq(reservations.activityId, b.activityId),
      isNull(reservations.deletedAt),
      or(
        b.playerId ? eq(reservations.playerId, b.playerId) : sql`false`,
        phone ? eq(reservations.phone, phone) : sql`false`,
      ),
    ))
    .orderBy(reservations.id)
    .limit(1);

  if (ex) {
    await db.update(reservations).set({
      appConfirmed: true,
      appConfirmedAt: new Date(),
      ...(ex.status === 'pending' || ex.status === 'waitlist' ? { status: 'confirmed' } : {}),
      ...(!ex.playerId && b.playerId ? { playerId: b.playerId } : {}),
      ...(people > (ex.peopleCount || 1) ? { peopleCount: people } : {}),
      updatedAt: new Date(),
    } as any).where(eq(reservations.id, ex.id));
    return { result: 'updated', reservationId: ex.id };
  }

  const [saved] = await db.insert(reservations).values({
    activityId: b.activityId,
    contactName: b.name,
    contactMethod: meta.contactMethod || '',
    phone,
    peopleCount: people,
    playerId: b.playerId,
    status: 'confirmed',               // حجزه موظّفٌ بيده — مثبّت
    notes: meta.notes || '',
    createdBy: meta.createdBy,
    appConfirmed: true,                // 🔴 صاحبه محسوبٌ في صفّ الحجز
    appConfirmedAt: new Date(),
  } as any).returning({ id: reservations.id });
  return { result: 'created', reservationId: saved.id };
}
