// ══════════════════════════════════════════════════════
// 🪑 المقاعد والمال — لكلّ شخصٍ في الحجز مقعدٌ بسعره وحالة دفعه (خطّة توحيد الحجز م٥ · ق٥)
// ══════════════════════════════════════════════════════
// المقعد ثلاثة أنواع، كلٌّ من مصدره القائم — فلا يتغيّر العدّ ولا رقم صفحة الفعاليّة:
//   • صاحب الحجز: صفّ حجزه (bookings) — دفعه ومجّانيّته وسعر دخوله.
//   • صديقٌ مسمّى: عضو المجموعة (booking_group_members). له حساب ⟵ صفّ حجزه الخاصّ؛ بلا حساب ⟵
//     حالة دفعه على العضو نفسه (pay_state / paid_amount).
//   • مرافقٌ بلا اسم: الباقي من people_count — دفعهم عددٌ على الحجز (companions_paid).
// مقاعد العرض المجّانيّة (promised_free / settled_free) تظهر «مجّاناً بالعرض» على آخر المقاعد.
// «المتوقَّع من المقاعد» = مجموع أسعار المقاعد غير المدفوعة التي لا صفّ مالٍ لها — يُضاف إلى
// «المتوقَّع» الرسميّ (صفوف الحجز) فيصير المجموع حقّ كلّ الأشخاص.

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const r2 = (x: number) => Math.round(x * 100) / 100;

export async function migrateSeats(db: any): Promise<void> {
  await db.execute(sql`ALTER TABLE booking_group_members ADD COLUMN IF NOT EXISTS pay_state VARCHAR(8)`);
  await db.execute(sql`ALTER TABLE booking_group_members ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2)`);
  await db.execute(sql`ALTER TABLE booking_group_members ADD COLUMN IF NOT EXISTS received_by VARCHAR(100)`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS companions_paid INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS companions_paid_amount NUMERIC(10,2) DEFAULT 0`);
}

export type SeatKind = 'owner' | 'friend' | 'companion';
export type PayState = 'paid' | 'unpaid' | 'free';
export interface Seat {
  ref: string;                    // owner | m:<memberId> | c:<n>
  kind: SeatKind; name: string; hasAccount: boolean; status?: string;
  price: number; pay: PayState; paidAmount: number; freeReason: string | null;
  bookingId: number | null; moneyRow: boolean;     // له صفّ مال (bookings) يُحسب في «المتوقَّع» الرسميّ
}
export interface SeatsView { reservationId: number; activityId: number; base: number; people: number; seats: Seat[]; due: number; dueNoRow: number; payer: 'each' | 'owner' }

function payOfBooking(b: any): { pay: PayState; paidAmount: number; freeReason: string | null } {
  if (!b) return { pay: 'unpaid', paidAmount: 0, freeReason: null };
  if (b.is_free) return { pay: 'free', paidAmount: 0, freeReason: b.loyalty_reward_id ? 'loyalty' : 'free' };
  if (b.is_paid) return { pay: 'paid', paidAmount: Number(b.paid_amount || 0), freeReason: null };
  return { pay: 'unpaid', paidAmount: 0, freeReason: null };
}

/** مقاعد حجزٍ واحد بأسعارها وحالة دفع كلٍّ منها */
export async function seatsOf(resId: number): Promise<SeatsView | null> {
  const db = getDB(); if (!db) return null;
  const [r] = rowsOf(await db.execute(sql`
    SELECT r.id, r.activity_id, r.contact_name, r.player_id, r.phone, r.people_count, r.unit_price, r.promo_seats,
           COALESCE(r.companions_paid, 0) AS companions_paid, COALESCE(r.companions_paid_amount, 0) AS companions_paid_amount, a.base_price
      FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.id = ${Math.trunc(resId)} AND r.deleted_at IS NULL`));
  if (!r) return null;
  const base = Number(r.base_price || 0);
  const lock = r.unit_price != null ? Number(r.unit_price) : null;
  const people = Math.max(1, Number(r.people_count || 1));
  let lockedLeft = lock != null ? Math.min(people, Math.max(0, r.promo_seats != null ? Number(r.promo_seats) : people)) : 0;
  const priceNext = () => { if (lockedLeft > 0) { lockedLeft--; return lock as number; } return base; };
  const seats: Seat[] = [];
  // صاحب الحجز
  const [ob] = rowsOf(await db.execute(sql`
    SELECT id, is_paid, is_free, paid_amount, unit_price, loyalty_reward_id FROM bookings
     WHERE activity_id = ${r.activity_id} AND deleted_at IS NULL AND (reservation_id = ${r.id} ${r.player_id ? sql`OR player_id = ${r.player_id}` : sql``})
       AND COALESCE(created_by, '') <> '👥 مجموعة عبر الدون'
     ORDER BY (reservation_id = ${r.id}) DESC, id LIMIT 1`));
  const op = payOfBooking(ob);
  const ownerPrice = priceNext();
  seats.push({ ref: 'owner', kind: 'owner', name: String(r.contact_name || ''), hasAccount: !!r.player_id,
    price: op.pay === 'free' ? 0 : (ob?.unit_price != null ? Number(ob.unit_price) : ownerPrice), ...op, bookingId: ob ? Number(ob.id) : null, moneyRow: !!ob });
  // الأصدقاء المسمَّون
  const [g] = rowsOf(await db.execute(sql`SELECT id, payer, promised_free, settled_free, status FROM booking_groups WHERE reservation_id = ${r.id} AND status <> 'void' ORDER BY id LIMIT 1`));
  const members = g ? rowsOf(await db.execute(sql`
    SELECT m.id, m.name, m.player_id, m.status, m.booking_id, m.pay_state, m.paid_amount, b.is_paid, b.is_free, b.paid_amount AS b_paid, b.unit_price AS b_price, b.loyalty_reward_id
      FROM booking_group_members m LEFT JOIN bookings b ON b.id = m.booking_id AND b.deleted_at IS NULL
     WHERE m.group_id = ${g.id} AND m.status IN ('booked', 'pending', 'joined') ORDER BY m.id`)) : [];
  for (const m of members.slice(0, Math.max(0, people - 1))) {
    const p = priceNext();
    if (m.booking_id && (m.is_paid != null || m.is_free != null)) {
      const bp = payOfBooking({ is_paid: m.is_paid, is_free: m.is_free, paid_amount: m.b_paid, loyalty_reward_id: m.loyalty_reward_id });
      seats.push({ ref: `m:${m.id}`, kind: 'friend', name: String(m.name), hasAccount: true, status: m.status, price: bp.pay === 'free' ? 0 : (m.b_price != null ? Number(m.b_price) : p), ...bp, bookingId: Number(m.booking_id), moneyRow: true });
    } else {
      const st: PayState = m.pay_state === 'paid' ? 'paid' : m.pay_state === 'free' ? 'free' : 'unpaid';
      seats.push({ ref: `m:${m.id}`, kind: 'friend', name: String(m.name), hasAccount: !!m.player_id, status: m.status, price: st === 'free' ? 0 : p, pay: st, paidAmount: Number(m.paid_amount || 0), freeReason: st === 'free' ? 'free' : null, bookingId: null, moneyRow: false });
    }
  }
  // المرافقون بلا اسم
  const comp = Math.max(0, people - seats.length);
  let paidLeft = Math.min(comp, Number(r.companions_paid || 0));
  const perPaid = paidLeft > 0 ? Number(r.companions_paid_amount || 0) / paidLeft : 0;
  for (let i = 1; i <= comp; i++) {
    const p = priceNext();
    const paid = paidLeft > 0; if (paid) paidLeft--;
    seats.push({ ref: `c:${i}`, kind: 'companion', name: `مرافق ${i}`, hasAccount: false, price: p, pay: paid ? 'paid' : 'unpaid', paidAmount: paid ? r2(perPaid) : 0, freeReason: null, bookingId: null, moneyRow: false });
  }
  // مقاعد العرض المجّانيّة: على آخر المقاعد غير المدفوعة (العرض على الحضور الفعليّ عند الباب)
  let freeN = g ? Number(g.status === 'settled' ? (g.settled_free ?? 0) : (g.promised_free ?? 0)) : 0;
  for (let i = seats.length - 1; i >= 0 && freeN > 0; i--) {
    if (seats[i].pay === 'unpaid') { seats[i] = { ...seats[i], price: 0, pay: 'free', freeReason: 'group' }; freeN--; }
  }
  const due = r2(seats.filter((s) => s.pay === 'unpaid').reduce((a, s) => a + s.price, 0));
  const dueNoRow = r2(seats.filter((s) => s.pay === 'unpaid' && !s.moneyRow).reduce((a, s) => a + s.price, 0));
  return { reservationId: Number(r.id), activityId: Number(r.activity_id), base, people, seats, due, dueNoRow, payer: g?.payer === 'owner' ? 'owner' : 'each' };
}

/** 💵 دفع مقعد — صفّ حجزه إن وُجد، وإلّا العضو أو عدد المرافقين. السجلّ يحمل الفاعل والمبلغ. */
export async function paySeat(resId: number, ref: string, amount: number | null, who: { channel: string; actor: string }): Promise<{ ok: boolean; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const v = await seatsOf(resId); if (!v) return { ok: false, error: 'الحجز غير موجود' };
  const s = v.seats.find((x) => x.ref === ref || (ref === 'companion' && x.kind === 'companion' && x.pay === 'unpaid'));
  if (!s) return { ok: false, error: 'المقعد غير موجود' };
  if (s.pay !== 'unpaid') return { ok: false, error: s.pay === 'free' ? 'المقعد مجّانيّ' : 'المقعد مدفوع' };
  const amt = amount == null ? s.price : Math.max(0, Number(amount) || 0);
  const by = who.actor.slice(0, 100);
  const { withActor } = await import('./booking-commands.service.js');
  await withActor({ channel: who.channel as any, actor: by }, async (tx: any) => {
    if (s.bookingId) await tx.execute(sql`UPDATE bookings SET is_paid = true, paid_amount = ${String(amt)}, received_by = ${by} WHERE id = ${s.bookingId}`);
    else if (s.kind === 'friend') await tx.execute(sql`UPDATE booking_group_members SET pay_state = 'paid', paid_amount = ${String(amt)}, received_by = ${by}, updated_at = NOW() WHERE id = ${Number(s.ref.slice(2))}`);
    else await tx.execute(sql`UPDATE reservations SET companions_paid = COALESCE(companions_paid, 0) + 1, companions_paid_amount = COALESCE(companions_paid_amount, 0) + ${String(amt)}, updated_at = NOW() WHERE id = ${resId}`);
  });
  if (!s.bookingId) {
    await db.execute(sql`INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail)
      VALUES (${resId}, ${v.activityId}, ${who.channel.slice(0, 12)}, ${by}, 'seat_paid', ${JSON.stringify({ ref, name: s.name, amount: amt })}::jsonb)`).catch(() => {});
  }
  return { ok: true };
}

/** «ادفع عن الكلّ» (ق١٨): كلّ مقعدٍ غير مدفوع بسعره */
export async function payAll(resId: number, who: { channel: string; actor: string }): Promise<{ ok: boolean; paid: number; total: number }> {
  const v = await seatsOf(resId); if (!v) return { ok: false, paid: 0, total: 0 };
  let paid = 0, total = 0;
  for (const s of v.seats.filter((x) => x.pay === 'unpaid')) {
    const r = await paySeat(resId, s.kind === 'companion' ? 'companion' : s.ref, s.price, who);
    if (r.ok) { paid++; total += s.price; }
  }
  return { ok: true, paid, total: r2(total) };
}

/** للمال في المتابعة: حقّ المقاعد التي لا صفّ مال لها (أصدقاء بلا حساب ومرافقون) — غير المدفوع */
export async function dueWithoutRows(activityId: number): Promise<{ due: number; seats: number; paid: number }> {
  const db = getDB(); if (!db) return { due: 0, seats: 0, paid: 0 };
  const rs = rowsOf(await db.execute(sql`SELECT id FROM reservations WHERE activity_id = ${Math.trunc(activityId)} AND deleted_at IS NULL AND status <> 'waitlist' AND people_count > 1`));
  let due = 0, seats = 0, paid = 0;
  for (const x of rs) {
    const v = await seatsOf(Number(x.id)); if (!v) continue;
    for (const s of v.seats.filter((y) => !y.moneyRow)) { seats++; if (s.pay === 'unpaid') due += s.price; else if (s.pay === 'paid') paid += s.paidAmount; }
  }
  return { due: r2(due), seats, paid: r2(paid) };
}
