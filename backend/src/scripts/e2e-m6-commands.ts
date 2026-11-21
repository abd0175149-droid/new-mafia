// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٦ «النقل والسعر اليدويّ من بطاقة الشخص»
// ⚠️ نسخةٌ مؤقّتة فقط (mafia_m2test). فعاليّات 🧪 فلا رسائل. قاعدةٌ فقط.
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = '🧪 E2E-M6';
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  if (!/mafia_m2test/.test(String(process.env.DATABASE_URL || ''))) { console.error('❌ للنسخة المؤقّتة وحدها'); process.exit(2); }
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const { migrateBookingEvents } = await import('../migrations-booking-events.js'); await migrateBookingEvents(db);
  const Q = await import('../services/capacity-queue.service.js'); await Q.migrateCapacityQueue(db);
  const C = await import('../services/booking-commands.service.js');
  const who = { channel: 'staff' as const, actor: 'Qais' };
  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${TAG + '%'}`)) {
      await q(sql`DELETE FROM booking_events WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone = '0799999921'`);
  };
  await cleanup();
  try {
    const [loc] = await q(sql`SELECT id FROM locations WHERE COALESCE(is_test_location, false) = false AND deleted_at IS NULL ORDER BY id LIMIT 1`);
    const mk = async (n: string, days: number, cap = 30) => (await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, max_capacity) VALUES (${TAG + ' ' + n}, NOW() + make_interval(days => ${days}), 3, 'planned', ${loc.id}, ${cap}) RETURNING id`))[0];
    const A = await mk('أ', 2); const B = await mk('ب', 4, 6); const D = await mk('ج', 5);
    const [pl] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES ('0799999921', ${TAG + ' لاعب'}, 'x') RETURNING id`);
    const [r] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, player_id, created_by) VALUES (${A.id}, 'نقل', '0799999921', 2, 'confirmed', ${pl.id}, 'player-app') RETURNING id`);
    await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by) VALUES (${A.id}, 'نقل', '0799999921', 1, ${pl.id}, 'player-app')`);

    console.log('\n① النقل');
    ok('النقل للفعاليّة نفسها يُرفض', !(await C.moveReservation(Number(r.id), Number(A.id), who)).ok);
    // ب بسقفٍ مشغَّل ومحجوزٌ ٥ من ٦ ⟵ لا يكفي اثنين
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${B.id}, 'ممتلئ', '0799999922', 5, 'confirmed', 'Qais')`);
    await Q.setCap(Number(B.id), true, who);
    let m = await C.moveReservation(Number(r.id), Number(B.id), who);
    ok('وجهةٌ ممتلئة بسقفٍ مشغَّل ⟵ CAP_FULL', !m.ok && m.code === 'CAP_FULL', JSON.stringify(m));
    m = await C.moveReservation(Number(r.id), Number(B.id), who, { overCap: true, reason: 'طلب المالك' });
    const [rr] = await q(sql`SELECT activity_id FROM reservations WHERE id = ${r.id}`);
    const [bb] = await q(sql`SELECT activity_id FROM bookings WHERE player_id = ${pl.id} AND deleted_at IS NULL`);
    ok('فوق السعة صراحةً ⟵ نُقل الحجز وصفّ حجزه معه', m.ok && Number(rr.activity_id) === Number(B.id) && Number(bb.activity_id) === Number(B.id) && m.movedBookings === 1, JSON.stringify({ m, rr, bb }));
    const [ev] = await q(sql`SELECT detail->>'from' AS f, detail->>'overCap' AS oc, actor FROM booking_events WHERE reservation_id = ${r.id} AND kind = 'moved'`);
    ok('سطر «نُقل» في السجلّ بالمصدر والفاعل', Number(ev?.f) === Number(A.id) && ev?.oc === 'true' && ev?.actor === 'Qais', JSON.stringify(ev));
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, player_id, created_by) VALUES (${D.id}, 'نقل', '0799999921', 1, 'confirmed', ${pl.id}, 'Qais')`);
    ok('له حجزٌ في الوجهة ⟵ لا يُكرَّر', !(await C.moveReservation(Number(r.id), Number(D.id), who)).ok);

    console.log('\n② السعر اليدويّ');
    ok('بلا سبب ⟵ يُرفض', !(await C.setReservationPrice(Number(r.id), 1.5, who, '')).ok);
    const sp = await C.setReservationPrice(Number(r.id), 1.5, who, 'تعويض عن ليلة أمس');
    const [p1] = await q(sql`SELECT unit_price, promo_seats, price_promo_id FROM reservations WHERE id = ${r.id}`);
    const [b1] = await q(sql`SELECT unit_price FROM bookings WHERE player_id = ${pl.id} AND deleted_at IS NULL`);
    ok('يُقفل ١٫٥ على المقعدين وصفّ الحجز، بلا عرض', sp.ok && Number(p1.unit_price) === 1.5 && Number(p1.promo_seats) === 2 && p1.price_promo_id == null && Number(b1.unit_price) === 1.5, JSON.stringify({ p1, b1 }));
    const x = await C.reservationExtras(Number(r.id));
    ok('المتوقَّع في البطاقة = ٢ × ١٫٥', x?.expected === 3, JSON.stringify(x?.expected));
    await C.setReservationPrice(Number(r.id), null, who, 'أُعيد');
    const [p2] = await q(sql`SELECT unit_price FROM reservations WHERE id = ${r.id}`);
    ok('null ⟵ السعر العاديّ', p2.unit_price == null);
    await q(sql`UPDATE bookings SET is_paid = true, paid_amount = 3 WHERE player_id = ${pl.id} AND deleted_at IS NULL`);
    ok('المدفوع لا يُعاد تسعيره', !(await C.setReservationPrice(Number(r.id), 1, who, 'x')).ok);
  } catch (e: any) { fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e); }
  finally { await cleanup(); }
  console.log(`\n${fail ? '❌' : '✅'} م٦: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
