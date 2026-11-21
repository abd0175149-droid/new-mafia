// ══════════════════════════════════════════════════════
// 🧭 خدمة الحجز الموحّدة — الأوامر (خطّة توحيد الحجز م٢ + م٣)
// ══════════════════════════════════════════════════════
// أوّل الأوامر التي تمرّ بها كلّ القنوات: الإلغاء (حالةٌ ظاهرة بسببها وفاعلها وقناتها — ق٩)،
// والحذف للإدخال الخاطئ، والاسترجاع. كلٌّ منها يكتب الفاعل والقناة في معاملته (app.actor /
// app.channel) فيلتقطهما مشغّل سجلّ الحجز، وينادي آثار ما بعد الحذف نفسها في كلّ مرّة:
// إزالة صفّ الحجز المرتبط (المرآة)، وإعادة الزيارة المجّانيّة، وخروج العضو من مجموعته،
// وإلغاء رسالة التثبيت المنتظرة، وإبطال مجموعة العرض، وحكم الغياب على الإلغاء المتأخّر.

import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { reservations } from '../schemas/admin.schema.js';

export type BookingChannel = 'app' | 'bot' | 'botadmin' | 'group' | 'door' | 'staff' | 'system';
export interface Who { channel: BookingChannel; actor: string }

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);

/** ينفّذ fn في معاملةٍ ضُبط فيها الفاعل والقناة لمشغّل السجلّ */
export async function withActor<T>(who: Who, fn: (tx: any) => Promise<T>): Promise<T> { return asActor(who, fn); }
async function asActor<T>(who: Who, fn: (tx: any) => Promise<T>): Promise<T> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT set_config('app.actor', ${String(who.actor || 'system').slice(0, 120)}, true), set_config('app.channel', ${who.channel}, true)`);
    return fn(tx);
  });
}

/**
 * ❌ إلغاء حجز (صفّ متابعة): يبقى ظاهراً تحت «ملغى» بسببه وفاعله وقناته.
 * byCustomer: ألغاه صاحبه (التطبيق أو الدون) — يُحكم الغياب إن كان متأخّراً.
 */
export async function cancelReservation(resId: number, who: Who, reason: string, opts: { byCustomer?: boolean } = {}): Promise<{ ok: boolean; error?: string; bookingRemoved?: boolean | null }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [r] = await db.select().from(reservations).where(and(eq(reservations.id, resId), isNull(reservations.deletedAt))).limit(1);
  if (!r) return { ok: false, error: 'الحجز غير موجود أو أُلغي سابقاً' };
  // المرآة قبل الإلغاء — بعده لا شيء يدلّ على صفّ حجزه (الآثار: الزيارة والمجموعة داخلها)
  let bookingRemoved: boolean | null = null;
  try {
    const { removeBookingForReservation } = await import('./reservation-booking.service.js');
    bookingRemoved = await removeBookingForReservation(db as any, r as any);
  } catch (e: any) { console.warn('⚠️ cancel → booking sync:', e?.message); }
  await asActor(who, (tx) => tx.update(reservations).set({
    deletedAt: new Date(), cancelledAt: new Date(), cancelReason: String(reason || '').slice(0, 200) || null,
    cancelledBy: String(who.actor || '').slice(0, 120), cancelChannel: who.channel, updatedAt: new Date(),
  } as any).where(eq(reservations.id, resId)));
  await afterReservationGone(resId, !!opts.byCustomer, 'أُلغي الحجز قبل الإرسال');
  return { ok: true, bookingRemoved };
}

/** 🗑️ حذف إدخالٍ خاطئ — لا يظهر تحت «ملغى» (ق٩: الحذف للأخطاء) */
export async function deleteReservation(resId: number, who: Who): Promise<{ ok: boolean; error?: string; bookingRemoved?: boolean | null }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [r] = await db.select().from(reservations).where(and(eq(reservations.id, resId), isNull(reservations.deletedAt))).limit(1);
  if (!r) return { ok: false, error: 'الحجز غير موجود' };
  let bookingRemoved: boolean | null = null;
  try {
    const { removeBookingForReservation } = await import('./reservation-booking.service.js');
    bookingRemoved = await removeBookingForReservation(db as any, r as any);
  } catch (e: any) { console.warn('⚠️ delete → booking sync:', e?.message); }
  await asActor(who, (tx) => tx.update(reservations).set({ deletedAt: new Date(), updatedAt: new Date() } as any).where(eq(reservations.id, resId)));
  await afterReservationGone(resId, false, 'حُذف الحجز قبل الإرسال');
  return { ok: true, bookingRemoved };
}

/** ↩️ استرجاع حجزٍ ملغى: يعود كما كان (المثبَّت تُعاد مرآته في التطبيق) */
export async function restoreReservation(resId: number, who: Who): Promise<{ ok: boolean; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [r] = await db.select().from(reservations).where(eq(reservations.id, resId)).limit(1);
  if (!r || !r.deletedAt) return { ok: false, error: 'الحجز ليس ملغى' };
  if (!(r as any).cancelledAt) return { ok: false, error: 'حُذف هذا الحجز كإدخالٍ خاطئ — لا يُسترجع' };
  // حجزٌ قائمٌ للشخص نفسه في الفعاليّة يمنع الاسترجاع (لا يتكرّر)
  const { existingBookingAnywhere } = await import('./reservation-booking.service.js');
  const dup = await existingBookingAnywhere(db as any, Number(r.activityId), r.playerId ?? null, String(r.phone || ''));
  if (dup) return { ok: false, error: `له حجزٌ قائم في الفعاليّة ${dup.via} — لا يُسترجع فوقه` };
  await asActor(who, (tx) => tx.update(reservations).set({ deletedAt: null, cancelledAt: null, cancelReason: null, cancelledBy: null, cancelChannel: null, updatedAt: new Date() } as any).where(eq(reservations.id, resId)));
  if (r.status === 'confirmed') {
    try {
      const { ensureBookingForReservation } = await import('./reservation-booking.service.js');
      const [fresh] = await db.select().from(reservations).where(eq(reservations.id, resId)).limit(1);
      if (fresh) await ensureBookingForReservation(db as any, fresh as any);
    } catch (e: any) { console.warn('⚠️ restore → booking sync:', e?.message); }
  }
  return { ok: true };
}

/** آثار ما بعد زوال صفّ المتابعة — مكانٌ واحد لكلّ المسارات */
async function afterReservationGone(resId: number, byCustomer: boolean, confirmReason: string): Promise<void> {
  try { const C = await import('./reservation-confirm.service.js'); await C.cancelReservationConfirm(resId, confirmReason); } catch { /* تكميليّ */ }
  try { const O = await import('./booking-offers.service.js'); await O.onReservationDeleted(resId); } catch { /* تكميليّ */ }
  try { const E = await import('./early-price.service.js'); await E.onReservationCancelled(resId, { byCustomer }); } catch { /* تكميليّ */ }
}

// ══════════════════════════════════════════════════════
// 📜 القراءة: الملغى، والخطّ الزمنيّ، وتقرير الإلغاءات
// ══════════════════════════════════════════════════════

/** الحجوزات الملغاة لفعاليّة — للقسم «ملغى» في المتابعة */
export async function cancelledFor(activityId: number) {
  const db = getDB(); if (!db) return [];
  return rowsOf(await db.execute(sql`
    SELECT id, contact_name AS "contactName", phone, people_count AS "peopleCount", player_id AS "playerId", status,
           channel, created_at AS "createdAt", cancelled_at AS "cancelledAt", cancel_reason AS "cancelReason",
           cancelled_by AS "cancelledBy", cancel_channel AS "cancelChannel"
      FROM reservations WHERE activity_id = ${Math.trunc(activityId)} AND deleted_at IS NOT NULL AND cancelled_at IS NOT NULL
     ORDER BY cancelled_at DESC`));
}

/** الخطّ الزمنيّ لحجز: سجلّ الحجز (وصفوف حجزه) وسجلّ متابعة الوصول معاً */
export async function timelineOf(resId: number) {
  const db = getDB(); if (!db) return [];
  const id = Math.trunc(resId);
  const ev = rowsOf(await db.execute(sql`
    SELECT 'b' || id AS key, at, channel, actor, kind, detail, reason FROM booking_events WHERE reservation_id = ${id}
    UNION ALL
    SELECT 'r' || id AS key, at, NULL AS channel, COALESCE(NULLIF(actor_name, ''), actor) AS actor, kind, detail, quote AS reason
      FROM reservation_events WHERE reservation_id = ${id} AND undone_at IS NULL
    ORDER BY at DESC LIMIT 120`));
  return ev.map((e) => ({ ...e, at: new Date(e.at).toISOString() }));
}

/** تقرير الإلغاءات: بالقناة، وبالتوقيت قبل اللعبة (أكثر من يوم، ٢٤–٦، ٦–٣، أقلّ من ٣، بعد البدء) */
export async function cancellationReport(days = 30) {
  const db = getDB(); if (!db) return null;
  const d = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  const rows = rowsOf(await db.execute(sql`
    SELECT COALESCE(r.cancel_channel, 'staff') AS channel,
           CASE WHEN r.cancelled_at >= a.date THEN 'after'
                WHEN a.date - r.cancelled_at < INTERVAL '3 hours' THEN 'lt3'
                WHEN a.date - r.cancelled_at < INTERVAL '6 hours' THEN 'h3_6'
                WHEN a.date - r.cancelled_at < INTERVAL '24 hours' THEN 'h6_24'
                ELSE 'gt24' END AS bucket,
           COUNT(*)::int AS n, COALESCE(SUM(r.people_count), 0)::int AS people
      FROM reservations r JOIN activities a ON a.id = r.activity_id
      LEFT JOIN locations l ON l.id = a.location_id
     WHERE r.cancelled_at IS NOT NULL AND r.cancelled_at > NOW() - make_interval(days => ${d})
       AND COALESCE(l.is_test_location, false) = false
     GROUP BY 1, 2`));
  const reasons = rowsOf(await db.execute(sql`
    SELECT COALESCE(NULLIF(cancel_reason, ''), '—') AS reason, COUNT(*)::int AS n FROM reservations
     WHERE cancelled_at IS NOT NULL AND cancelled_at > NOW() - make_interval(days => ${d})
     GROUP BY 1 ORDER BY 2 DESC LIMIT 8`));
  return { days: d, rows, reasons };
}

// ══════════════════════════════════════════════════════
// 🎟️ م٤-ب: العروض والولاء على حجزٍ بعينه من المتابعة (ق٤، ق٦، ق١٣)
// ══════════════════════════════════════════════════════

/** صفّ الحجز الحيّ لصفّ متابعة (بالرابط، وإلّا بالحساب في الفعاليّة نفسها) */
async function liveBookingOf(r: any): Promise<any | null> {
  const db = getDB(); if (!db || !r?.activityId) return null;
  const rows = rowsOf(await db.execute(sql`
    SELECT id, is_paid, is_free, paid_amount, loyalty_reward_id, unit_price FROM bookings
     WHERE activity_id = ${r.activityId} AND deleted_at IS NULL
       AND (reservation_id = ${r.id} ${r.playerId ? sql`OR player_id = ${r.playerId}` : sql``})
     ORDER BY (reservation_id = ${r.id}) DESC, id LIMIT 1`));
  return rows[0] ?? null;
}

/** ما يمكن فعله بعروض هذا الحجز وولائه الآن — لبطاقة الشخص */
export async function reservationExtras(resId: number) {
  const db = getDB(); if (!db) return null;
  const [r] = await db.select().from(reservations).where(and(eq(reservations.id, resId), isNull(reservations.deletedAt))).limit(1);
  if (!r || !r.activityId) return null;
  const E = await import('./early-price.service.js');
  const L = await import('./loyalty.service.js');
  const bk = await liveBookingOf(r);
  const paid = !!bk && bk.is_paid === true && bk.is_free !== true && Number(bk.paid_amount || 0) > 0;
  let visit: { available: boolean; applied: boolean; enabled: boolean } = { available: false, applied: !!bk?.loyalty_reward_id, enabled: false };
  if (r.playerId) {
    try {
      const cfg = await L.getLoyaltyConfig();
      visit.enabled = cfg.enabled && cfg.rewards.freeVisit.enabled;
      visit.available = visit.enabled && !!(await L.availableReward(Number(r.playerId), 'free_visit'));
    } catch { /* الولاء غير متاح */ }
  }
  return {
    reservationId: r.id, activityId: r.activityId, playerId: r.playerId ?? null, bookingId: bk?.id ?? null, paid,
    lock: r.unitPrice != null ? { promoId: r.pricePromoId ?? null, unitPrice: Number(r.unitPrice), seats: r.promoSeats ?? null } : null,
    offers: await E.manualOffersFor(Number(r.activityId)),
    visit,
  };
}

/**
 * 🎟️ زيارة الولاء من الباب أو المتابعة (ق٦) — على صاحب الحجز وحده، حصريّةٌ على الحجز كلّه (ق١٣):
 * يُزال أيّ عرضٍ مقفول عن الحجز قبلها. on=false يعيد المكافأة «متاحة».
 */
export async function setLoyaltyVisit(resId: number, on: boolean, who: Who, reason: string): Promise<{ ok: boolean; error?: string; removedOffer?: boolean }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [r] = await db.select().from(reservations).where(and(eq(reservations.id, resId), isNull(reservations.deletedAt))).limit(1);
  if (!r || !r.activityId) return { ok: false, error: 'الحجز غير موجود' };
  if (!r.playerId) return { ok: false, error: 'الحجز غير مربوط بحساب لاعب — لا بطاقة ولاء' };
  const L = await import('./loyalty.service.js');
  let bk = await liveBookingOf(r);
  if (!on) {
    if (!bk?.loyalty_reward_id) return { ok: false, error: 'لا زيارة ولاء على هذا الحجز' };
    await L.releaseFreeVisit(Number(bk.id));
  } else {
    if (!bk) {
      // حجزٌ بلا مرآة (غير مثبّت) — يُنشأ صفّ حجزه كما يفعل التثبيت
      try { const { ensureBookingForReservation } = await import('./reservation-booking.service.js'); await ensureBookingForReservation(db as any, r as any); } catch { /* يُفحص أدناه */ }
      bk = await liveBookingOf(r);
      if (!bk) return { ok: false, error: 'لا صفّ حجزٍ لهذا الشخص — ثبّت الحجز أوّلاً' };
    }
    if (bk.loyalty_reward_id) return { ok: false, error: 'زيارة الولاء مطبّقة أصلاً' };
    if (bk.is_paid === true && bk.is_free !== true && Number(bk.paid_amount || 0) > 0) return { ok: false, error: 'الحجز مدفوع — أعد المبلغ أوّلاً من نافذة الدفع' };
    if (!(await L.availableReward(Number(r.playerId), 'free_visit'))) return { ok: false, error: 'ليس عنده زيارة مجّانيّة متاحة' };
    let removedOffer = false;
    if (r.unitPrice != null || bk.unit_price != null) {
      const E = await import('./early-price.service.js');
      const x = await E.setReservationOffer(r.id, null, 'زيارة الولاء حصريّة على الحجز (ق١٣)', { channel: 'staff', actor: who.actor });
      removedOffer = x.ok;
    }
    const [act] = rowsOf(await db.execute(sql`SELECT id, name, base_price FROM activities WHERE id = ${r.activityId}`));
    const res = await L.applyFreeVisit(Number(r.playerId), Number(bk.id), { id: Number(act.id), name: String(act.name), basePrice: act.base_price });
    if (!res.applied) return { ok: false, error: 'تعذّر تطبيق الزيارة — ربّما استُعملت للتوّ' };
    await db.execute(sql`INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail, reason)
      VALUES (${r.id}, ${bk.id}, ${r.activityId}, ${who.channel}, ${who.actor.slice(0, 120)}, 'loyalty_manual', ${JSON.stringify({ on: true, rewardId: res.rewardId })}::jsonb, ${String(reason || '').slice(0, 200) || null})`).catch(() => {});
    return { ok: true, removedOffer };
  }
  await db.execute(sql`INSERT INTO booking_events (reservation_id, booking_id, activity_id, channel, actor, kind, detail, reason)
    VALUES (${r.id}, ${bk.id}, ${r.activityId}, ${who.channel}, ${who.actor.slice(0, 120)}, 'loyalty_manual', ${JSON.stringify({ on: false })}::jsonb, ${String(reason || '').slice(0, 200) || null})`).catch(() => {});
  return { ok: true };
}
