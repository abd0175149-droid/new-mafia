// ══════════════════════════════════════════════════════
// 🔗 حجزٌ سبق الحساب — ربط الحجز بصاحبه بعد أن يُنشئ حسابه (2026-11-16)
//
// الخلل الذي وُجد (فعاليّة ٣٩٢): موظّفٌ أدخل حجزاً بالاسم والهاتف لمن لا حساب له، ثمّ
// أنشأ صاحبه حسابه بالرقم نفسه. بقي الحجز بلا صاحب حساب (player_id = NULL)، فتناقض النظام:
//   • «احجز» يطابق بالهاتف            ⟵ «محجوز مسبقاً»
//   • قائمة حجوزاته تطابق بالحساب وحده ⟵ كأنّه لم يحجز: لا «✅ محجوز» ولا «دخول ←»
//   • فاتورة الليلة لا تجد حجزه        ⟵ بلا دخوليّة، والمنيو يرفض طلبه
// الربط كان يحدث لحظةَ إدخال الحجز فقط (POST /api/bookings يبحث عن حسابٍ بالرقم)، ولا
// يُعاد حين يولد الحساب لاحقاً.
//
// العلاج في موضعٍ واحد:
//   ١. linkPhoneBookings — يربط ما على الرقم من حجوزاتٍ ومتابعاتٍ بلا حساب. يُنادى عند
//      إنشاء أيّ حساب (التطبيق · البوت · الموظّف)، ومن مسارات اللاعب إن ظهر حجزٌ يتيم
//      (علاجٌ ذاتيّ لما فات). بعده يعمل كلّ ما يقرأ player_id بلا تعديل: المنيو والفواتير
//      والولاء والتقارير.
//   ٢. ownBookingCond — شرطٌ واحد لسؤال «هل هذا حجزُه؟» في مسارات اللاعب كلّها (الحجز،
//      القائمة، الإلغاء، الغرف المفتوحة) كي لا يتناقض جوابان بعد اليوم.
//
// 🔴 حدود الربط (لا تُوسَّع بلا قرار):
//   • الفعاليّات القائمة وحدها (planned/active): ربطُ حجزٍ في فعاليّةٍ انتهت يغيّر كشوفها
//     وتقاريرها بأثرٍ رجعيّ.
//   • لا ربط إن كان للّاعب حجزٌ آخر في الفعاليّة نفسها — لا حجزان لشخصٍ واحد.
//   • لا ربط تخميناً: حسابٌ آخر على الرقم نفسه بكتابةٍ أخرى ⟵ يُترك للموظّف.
//   • رقمٌ فارغ أو قصير لا يطابق شيئاً أبداً (حجوزاتٌ كثيرة بلا رقم).
// ══════════════════════════════════════════════════════

import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings } from '../schemas/admin.schema.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';

const rows = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const LIVE = ['planned', 'active'];

/**
 * كلّ كتابةٍ قد يكون الرقم حُفظ بها في صفّ حجز: الموظّف يكتبه كما يشاء
 * (07… · 7… · 962… · +962… · 00962…) والحساب يحفظه بصيغته المعتمدة.
 * رقمٌ فارغ أو أقصر من سبع خانات ⟵ قائمة فارغة: لا يطابق شيئاً.
 */
export function phoneWritings(phone: string | null | undefined): string[] {
  const raw = String(phone ?? '').trim();
  const out = new Set<string>();
  const local = normalizeLocalPhone(raw);          // 07XXXXXXXX
  if (local) {
    const n = local.slice(1);                      // 7XXXXXXXX
    for (const w of [local, n, '962' + n, '+962' + n, '00962' + n, raw]) out.add(w);
  } else if (raw.replace(/\D/g, '').length >= 7) {
    out.add(raw);                                  // رقمٌ غير أردنيّ: كما حُفظ فقط
  }
  return [...out];
}

/**
 * «هذا حجزُ هذا اللاعب»: مربوطٌ بحسابه · أو على رقمه كما حُفظ (السلوك السابق) ·
 * أو على رقمه بأيّ كتابة وهو **بلا صاحب حساب**. الأخير مقيَّدٌ باليتيم عمداً: شخصان على
 * رقمٍ واحد بكتابتين لا يرى أحدهما حجز الآخر حجزاً له.
 */
export function ownBookingCond(playerId: number | null | undefined, phone: string | null | undefined): SQL {
  const raw = String(phone ?? '').trim();
  const w = phoneWritings(raw);
  const parts: SQL[] = [];
  if (playerId) parts.push(eq(bookings.playerId, playerId));
  if (w.length) {
    parts.push(eq(bookings.phone, raw));
    parts.push(and(inArray(bookings.phone, w), isNull(bookings.playerId))!);
  }
  return parts.length ? or(...parts)! : sql`false`;
}

export interface LinkResult { bookings: number[]; reservations: number[] }

/**
 * يربط بالحساب ما على رقمه من حجوزاتٍ ومتابعاتٍ حيّة بلا صاحب حساب، في الفعاليّات القائمة.
 * متكرّر الأمان: نداءٌ ثانٍ لا يجد ما يربطه. `activityId` يحصر الربط بفعاليّةٍ واحدة.
 */
export async function linkPhoneBookings(
  playerId: number | null | undefined,
  phone: string | null | undefined,
  opts: { activityId?: number } = {},
): Promise<LinkResult> {
  const none: LinkResult = { bookings: [], reservations: [] };
  const db = getDB();
  const w = phoneWritings(phone);
  if (!db || !playerId || w.length === 0) return none;

  // فعاليّةٌ طُلب الحصر بها ولم تُقرأ رقماً ⟵ لا ربط (لا يتّسع الحصر إلى الكلّ بالخطأ)
  const aid = opts.activityId === undefined ? null : Number(opts.activityId);
  if (aid !== null && !Number.isInteger(aid)) return none;

  const list = sql.join(w.map(x => sql`${x}`), sql`, `);
  const only = aid !== null ? sql`AND a.id = ${aid}` : sql``;
  // حسابٌ آخر (غير مدموج) على الرقم نفسه بكتابةٍ أخرى ⟵ لا نخمّن لمن الحجز
  const [other] = rows(await db.execute(sql`
    SELECT 1 FROM players p
    WHERE p.id <> ${playerId} AND p.phone IN (${list}) AND p.merged_into_id IS NULL LIMIT 1`));
  if (other) return none;

  const bk = rows(await db.execute(sql`
    UPDATE bookings b SET player_id = ${playerId}
    WHERE b.player_id IS NULL AND b.deleted_at IS NULL AND b.phone IN (${list})
      AND EXISTS (SELECT 1 FROM activities a WHERE a.id = b.activity_id AND a.deleted_at IS NULL
                    AND a.status IN ('planned', 'active') ${only})
      AND NOT EXISTS (SELECT 1 FROM bookings o WHERE o.activity_id = b.activity_id
                        AND o.player_id = ${playerId} AND o.deleted_at IS NULL)
    RETURNING b.id`));
  const rs = rows(await db.execute(sql`
    UPDATE reservations r SET player_id = ${playerId}, updated_at = NOW()
    WHERE r.player_id IS NULL AND r.deleted_at IS NULL AND r.phone IN (${list})
      AND EXISTS (SELECT 1 FROM activities a WHERE a.id = r.activity_id AND a.deleted_at IS NULL
                    AND a.status IN ('planned', 'active') ${only})
      AND NOT EXISTS (SELECT 1 FROM reservations o WHERE o.activity_id = r.activity_id
                        AND o.player_id = ${playerId} AND o.deleted_at IS NULL)
    RETURNING r.id`));

  const out: LinkResult = { bookings: bk.map(x => Number(x.id)), reservations: rs.map(x => Number(x.id)) };
  if (out.bookings.length || out.reservations.length) {
    console.log(`🔗 [booking-link] اللاعب #${playerId}: رُبط به ${out.bookings.length} حجز (${out.bookings.join(',') || '—'}) و${out.reservations.length} متابعة (${out.reservations.join(',') || '—'}) كانت على رقمه بلا حساب`);
  }
  return out;
}

/** الربط عند إنشاء الحساب — لا يُفشل التسجيل أبداً. */
export async function linkOnAccountCreated(playerId: number | null | undefined, phone: string | null | undefined): Promise<void> {
  try { await linkPhoneBookings(playerId, phone); }
  catch (e: any) { console.warn('⚠️ [booking-link] ربط حجوزات الحساب الجديد:', e?.message); }
}

/**
 * قائمة حجوزات اللاعب كما يقرؤها التطبيق (✅ محجوز + زرّ «دخول ←»).
 * `selfPhone` يُمرَّر حين يطلب اللاعب قائمته هو: تُضاف حجوزات رقمه التي بلا حساب،
 * وما كان منها في فعاليّةٍ قائمة يُربط به الآن. بدونه: المربوط بالحساب وحده (كما كان).
 */
export async function listPlayerBookings(playerId: number, selfPhone?: string | null) {
  const db = getDB();
  if (!db || !Number.isFinite(playerId)) return [];
  const mine = selfPhone != null ? ownBookingCond(playerId, selfPhone) : eq(bookings.playerId, playerId);
  const found = await db.select({
    bookingId: bookings.id,
    activityId: bookings.activityId,
    isPaid: bookings.isPaid,
    isFree: bookings.isFree,
    createdAt: bookings.createdAt,
    activityName: activities.name,
    activityDate: activities.date,
    activityStatus: activities.status,
    linkedTo: bookings.playerId,
  })
    .from(bookings)
    .innerJoin(activities, eq(bookings.activityId, activities.id))
    .where(and(mine, isNull(bookings.deletedAt)))
    .orderBy(desc(activities.date));

  if (selfPhone != null && found.some(b => b.linkedTo == null && LIVE.includes(String(b.activityStatus)))) {
    try { await linkPhoneBookings(playerId, selfPhone); }
    catch (e: any) { console.warn('⚠️ [booking-link] ربط عند قراءة القائمة:', e?.message); }
  }
  return found.map(({ linkedTo: _l, ...b }) => b);
}

/**
 * ضغط «احجز» وله في الفعاليّة حجزٌ على رقمه بلا حساب ⟵ يُربط به ويُعاد صفُّه
 * (فيردّ المسار «تمّ» لا «محجوز مسبقاً»). null إن لم يُربط شيء.
 */
export async function claimPhoneBooking(playerId: number, phone: string | null | undefined, activityId: number): Promise<any | null> {
  const db = getDB();
  if (!db) return null;
  const linked = await linkPhoneBookings(playerId, phone, { activityId });
  if (!linked.bookings.length) return null;
  const [row] = await db.select().from(bookings).where(eq(bookings.id, linked.bookings[0])).limit(1);
  return row ?? null;
}
