// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٥ «مقعدٌ لكلّ شخص بسعره وحالة دفعه»
// ⚠️ نسخةٌ مؤقّتة فقط (mafia_m2test). فعاليّة 🧪. قاعدةٌ فقط.
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = '🧪 E2E-M5';
const PH = { o: '0799999901', a: '0799999902', b: '0799999903' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  if (!/mafia_m2test/.test(String(process.env.DATABASE_URL || ''))) { console.error('❌ للنسخة المؤقّتة وحدها'); process.exit(2); }
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const { migrateBookingEvents } = await import('../migrations-booking-events.js'); await migrateBookingEvents(db);
  const F = await import('../services/friends.service.js'); await F.migrateFriends(db);
  const S = await import('../services/seats.service.js'); await S.migrateSeats(db);
  const Q = await import('../services/capacity-queue.service.js'); await Q.migrateCapacityQueue(db);
  const inPh = sql.raw(`(${Object.values(PH).map((p) => `'${p}'`).join(',')})`);
  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${TAG + '%'}`)) {
      await q(sql`DELETE FROM booking_events WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM booking_group_members WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM booking_groups WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone IN ${inPh}`);
  };
  await cleanup();
  const who = { channel: 'staff', actor: 'Qais' };
  try {
    const [loc] = await q(sql`SELECT id FROM locations WHERE COALESCE(is_test_location, false) = false AND deleted_at IS NULL ORDER BY id LIMIT 1`);
    const [A] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG}, NOW() + INTERVAL '3 days', 3, 'planned', ${loc.id}) RETURNING id`);
    const [O] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH.o}, 'صاحب', 'x') RETURNING id`);
    const [P] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH.a}, 'راكان', 'x') RETURNING id`);
    const [r] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, player_id, status, created_by, app_confirmed) VALUES (${A.id}, 'صاحب', ${PH.o}, 4, ${O.id}, 'confirmed', 'player-app', true) RETURNING id`);
    await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, reservation_id) VALUES (${A.id}, 'صاحب', ${PH.o}, 1, ${O.id}, 'player-app', ${r.id})`);
    const [g] = await q(sql`INSERT INTO booking_groups (activity_id, reservation_id, owner_phone, owner_player_id, owner_name, offer_id, terms, declared_people, promised_free, source, status)
      VALUES (${A.id}, ${r.id}, ${PH.o}, ${O.id}, 'صاحب', NULL, '{}'::jsonb, 4, 1, 'bot', 'claimed') RETURNING id`);
    const [fb] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, group_id) VALUES (${A.id}, 'راكان', ${PH.a}, 1, ${P.id}, '👥 مجموعة عبر الدون', ${g.id}) RETURNING id`);
    await q(sql`INSERT INTO booking_group_members (group_id, activity_id, name, phone, player_id, booking_id, status) VALUES (${g.id}, ${A.id}, 'راكان', ${PH.a}, ${P.id}, ${fb.id}, 'joined')`);
    await q(sql`INSERT INTO booking_group_members (group_id, activity_id, name, phone, status) VALUES (${g.id}, ${A.id}, 'حمزة', ${PH.b}, 'pending')`);

    console.log('\n① المقاعد');
    let v = await S.seatsOf(Number(r.id));
    ok('أربعة مقاعد: صاحب + صديقان + مرافق', v?.seats.length === 4 && v.seats.map((s) => s.kind).join(',') === 'owner,friend,friend,companion', JSON.stringify(v?.seats.map((s) => s.kind)));
    ok('مقعد العرض المجّانيّ على آخر المقاعد (المرافق)', v?.seats[3].pay === 'free' && v?.seats[3].freeReason === 'group');
    ok('الصديق بحساب له صفّ مال، وبلا حساب لا', v?.seats[1].moneyRow === true && v?.seats[2].moneyRow === false);
    ok('المستحقّ ٩ (ثلاثة × ٣)، منها ٣ بلا صفّ مال', v?.due === 9 && v?.dueNoRow === 3, JSON.stringify({ due: v?.due, dueNoRow: v?.dueNoRow }));
    const d0 = await S.dueWithoutRows(Number(A.id));
    ok('المتابعة: ٣ د.أ على مقاعد بلا صفّ مال', d0.due === 3 && d0.seats === 2, JSON.stringify(d0));

    console.log('\n② الدفع لكلّ مقعد');
    ok('حمزة (بلا حساب) يدفع', (await S.paySeat(Number(r.id), v!.seats[2].ref, null, who)).ok);
    ok('المقعد المجّانيّ لا يُدفع', !(await S.paySeat(Number(r.id), v!.seats[3].ref, 3, who)).ok);
    v = await S.seatsOf(Number(r.id));
    ok('حمزة «مدفوع ٣»، والمستحقّ صار ٦', v?.seats[2].pay === 'paid' && v?.seats[2].paidAmount === 3 && v?.due === 6, JSON.stringify(v?.seats[2]));
    const all = await S.payAll(Number(r.id), who);
    v = await S.seatsOf(Number(r.id));
    const [ob] = await q(sql`SELECT is_paid, paid_amount, received_by FROM bookings WHERE player_id = ${O.id} AND activity_id = ${A.id}`);
    ok('«ادفع عن الكلّ» ⟵ صاحب الحجز وراكان، والمستحقّ ٠', all.paid === 2 && all.total === 6 && v?.due === 0 && ob.is_paid === true && ob.received_by === 'Qais', JSON.stringify({ all, ob }));
    const ev = await q(sql`SELECT COUNT(*)::int AS n FROM booking_events WHERE reservation_id = ${r.id} AND kind = 'seat_paid'`);
    ok('دفع المقعد بلا صفّ مال يُكتب في السجلّ', Number(ev[0].n) >= 1);

    console.log('\n③ المرافقون بلا اسم');
    await q(sql`UPDATE reservations SET people_count = 6 WHERE id = ${r.id}`);
    v = await S.seatsOf(Number(r.id));
    ok('العدد ٦ ⟵ ثلاثة مرافقين (واحدٌ مجّانيّ بالعرض)', v?.seats.filter((s) => s.kind === 'companion').length === 3 && v?.seats.filter((s) => s.pay === 'free').length === 1);
    ok('دفع مرافق', (await S.paySeat(Number(r.id), 'companion', 3, who)).ok);
    v = await S.seatsOf(Number(r.id));
    ok('مرافقٌ مدفوع وآخر غير مدفوع', v?.seats.filter((s) => s.kind === 'companion' && s.pay === 'paid').length === 1 && v?.due === 3, JSON.stringify(v?.seats.map((s) => `${s.ref}:${s.pay}`)));
  } catch (e: any) { fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e); }
  finally { await cleanup(); }
  console.log(`\n${fail ? '❌' : '✅'} م٥: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
