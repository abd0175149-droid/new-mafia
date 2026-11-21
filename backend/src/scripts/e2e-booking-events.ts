// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٣ «الإلغاء حالةٌ ظاهرة + سجلّ الحجز» (2026-11-21)
// يطبّق الترحيل (مرّتين)، ثمّ يمرّ بالأوامر الموحّدة في موقع الاختبار: إلغاءٌ بسبب، واسترجاع،
// وحذف إدخالٍ خاطئ، ورفض الاسترجاع فوق حجزٍ قائم، وسطور السجلّ بقناتها وفاعلها — ثمّ ينظّف.
// شغّله على نسخةٍ مؤقّتة من قاعدة الإنتاج (لا على staging القديمة).
// تشغيل: npx tsx src/scripts/e2e-booking-events.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { migrateBookingChannelLink } from '../migrations-booking-channel.js';
import { migrateBookingEvents } from '../migrations-booking-events.js';

const LOC = 3;
const TAG = 'E2E-BOOKING-EVENTS';
const PH = { a: '0799999971', b: '0799999972', c: '0799999973' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`)) {
      await q(sql`DELETE FROM booking_events WHERE activity_id = ${a.id}`).catch(() => {});
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone IN (${PH.a}, ${PH.b}, ${PH.c})`);
  };
  const evs = async (resId: number) => q(sql`SELECT kind, channel, actor, reason, detail FROM booking_events WHERE reservation_id = ${resId} ORDER BY id`);

  console.log('\n① الترحيل (مرّتين — آمنٌ للتكرار)');
  await migrateBookingChannelLink(db);
  await migrateBookingEvents(db);
  await migrateBookingEvents(db);
  const trg = await q(sql`SELECT tgname FROM pg_trigger WHERE tgname IN ('reservations_events_trg','bookings_events_trg') ORDER BY 1`);
  ok('مشغّلا السجلّ موجودان مرّةً واحدة', trg.length === 2, JSON.stringify(trg));
  const cols = await q(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'reservations' AND column_name IN ('cancelled_at','cancel_reason','cancelled_by','cancel_channel')`);
  ok('أعمدة الإلغاء الأربعة', cols.length === 4, JSON.stringify(cols));

  await cleanup();
  const C = await import('../services/booking-commands.service.js');
  const staff = { channel: 'staff' as const, actor: 'Qais' };
  try {
    const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG}, NOW() + INTERVAL '2 days', 3, 'planned', ${LOC}) RETURNING id`);

    console.log('\n② الإنشاء والتغيير يُكتبان بفاعلهما');
    const [r1] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'سجلّ أ', ${PH.a}, 2, 'pending', 'Qais') RETURNING id`);
    let e = await evs(r1.id);
    ok('«أُنشئ» بقناة الموظّف واسمه', e.length === 1 && e[0].kind === 'created' && e[0].channel === 'staff' && e[0].actor === 'Qais', JSON.stringify(e));
    await C.withActor({ channel: 'staff', actor: 'Rami' }, (tx) => tx.execute(sql`UPDATE reservations SET status = 'confirmed', people_count = 3 WHERE id = ${r1.id}`));
    e = await evs(r1.id);
    const st = e.find((x) => x.kind === 'status'); const pp = e.find((x) => x.kind === 'people');
    ok('تغيير الحالة بفاعل المعاملة', !!st && st.actor === 'Rami' && st.channel === 'staff' && st.detail?.to === 'confirmed', JSON.stringify(st));
    ok('تغيير العدد ٢ ← ٣', !!pp && Number(pp.detail?.from) === 2 && Number(pp.detail?.to) === 3, JSON.stringify(pp));
    await q(sql`UPDATE reservations SET attended = true WHERE id = ${r1.id}`);
    e = await evs(r1.id);
    const at = e.find((x) => x.kind === 'attended');
    ok('بلا فاعل مضبوط ⟵ system (الضبط لا يتسرّب من معاملةٍ سابقة)', !!at && at.actor === 'system', JSON.stringify(at));
    await q(sql`UPDATE reservations SET attended = NULL WHERE id = ${r1.id}`);

    console.log('\n③ الإلغاء بسبب ثمّ الاسترجاع');
    const cx = await C.cancelReservation(r1.id, staff, 'اعتذر العميل');
    ok('الإلغاء نجح', cx.ok === true, JSON.stringify(cx));
    const [row1] = await q(sql`SELECT deleted_at, cancelled_at, cancel_reason, cancelled_by, cancel_channel FROM reservations WHERE id = ${r1.id}`);
    ok('محذوفٌ للعدّ، ملغى بسببه وفاعله وقناته', !!row1.deleted_at && !!row1.cancelled_at && row1.cancel_reason === 'اعتذر العميل' && row1.cancelled_by === 'Qais' && row1.cancel_channel === 'staff', JSON.stringify(row1));
    e = await evs(r1.id);
    const ce = e.find((x) => x.kind === 'cancelled');
    ok('سطر «أُلغي» بالسبب', !!ce && ce.reason === 'اعتذر العميل' && ce.actor === 'Qais' && ce.channel === 'staff', JSON.stringify(ce));
    const list = await C.cancelledFor(act.id);
    ok('يظهر تحت «ملغى»', list.some((x: any) => Number(x.id) === Number(r1.id) && x.cancelReason === 'اعتذر العميل'), JSON.stringify(list));
    const again = await C.cancelReservation(r1.id, staff, 'مرّة ثانية');
    ok('إلغاء الملغى يُرفض', again.ok === false);
    const rs = await C.restoreReservation(r1.id, { channel: 'staff', actor: 'Rami' });
    ok('الاسترجاع نجح', rs.ok === true, JSON.stringify(rs));
    const [row1b] = await q(sql`SELECT deleted_at, cancelled_at, cancel_reason, status FROM reservations WHERE id = ${r1.id}`);
    ok('يعود حيّاً بلا أثر إلغاء وبحالته', row1b.deleted_at == null && row1b.cancelled_at == null && row1b.cancel_reason == null && row1b.status === 'confirmed', JSON.stringify(row1b));
    e = await evs(r1.id);
    ok('سطر «استُرجع» بفاعله', e.some((x) => x.kind === 'restored' && x.actor === 'Rami'), JSON.stringify(e.map((x) => x.kind)));
    const bk = await q(sql`SELECT id FROM bookings WHERE activity_id = ${act.id} AND deleted_at IS NULL AND reservation_id = ${r1.id}`);
    console.log(`  ℹ️ صفوف حجزٍ حيّة لهذا الصفّ بعد الاسترجاع: ${bk.length}`);

    console.log('\n④ الاسترجاع لا يكرّر حجزاً قائماً');
    await C.cancelReservation(r1.id, staff, 'غيّر الموعد');
    const [r1dup] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'سجلّ أ', ${PH.a}, 1, 'pending', 'Qais') RETURNING id`);
    const rs2 = await C.restoreReservation(r1.id, staff);
    ok('يُرفض الاسترجاع فوق حجزٍ قائمٍ للرقم نفسه', rs2.ok === false && /حجز/.test(String(rs2.error)), JSON.stringify(rs2));
    await q(sql`DELETE FROM reservations WHERE id = ${r1dup.id}`);

    console.log('\n⑤ الحذف للإدخال الخاطئ');
    const [r2] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'خطأ', ${PH.b}, 1, 'pending', 'Qais') RETURNING id`);
    const dx = await C.deleteReservation(r2.id, staff);
    ok('الحذف نجح', dx.ok === true);
    const [row2] = await q(sql`SELECT deleted_at, cancelled_at FROM reservations WHERE id = ${r2.id}`);
    ok('محذوفٌ بلا أثر إلغاء', !!row2.deleted_at && row2.cancelled_at == null, JSON.stringify(row2));
    ok('لا يظهر تحت «ملغى»', !(await C.cancelledFor(act.id)).some((x: any) => Number(x.id) === Number(r2.id)));
    e = await evs(r2.id);
    ok('سطر «حُذف» لا «أُلغي»', e.some((x) => x.kind === 'deleted') && !e.some((x) => x.kind === 'cancelled'), JSON.stringify(e.map((x) => x.kind)));
    const rs3 = await C.restoreReservation(r2.id, staff);
    ok('المحذوف خطأً لا يُسترجع', rs3.ok === false);

    console.log('\n⑥ صفوف الحجز: مقعد، دفع، إزالة');
    const [r3] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'مقعد', ${PH.c}, 1, 'confirmed', 'player-app') RETURNING id`);
    const [b3] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, created_by) VALUES (${act.id}, 'مقعد', ${PH.c}, 1, 'player-app') RETURNING id, reservation_id`);
    await q(sql`UPDATE bookings SET is_paid = true, paid_amount = 3, received_by = 'Cashier' WHERE id = ${b3.id}`);
    await C.withActor({ channel: 'app', actor: 'مقعد' }, (tx) => tx.execute(sql`UPDATE bookings SET deleted_at = NOW() WHERE id = ${b3.id}`));
    const be = await q(sql`SELECT kind, channel, actor FROM booking_events WHERE booking_id = ${b3.id} ORDER BY id`);
    ok('مقعدٌ مربوط بصفّ متابعته', Number(b3.reservation_id) === Number(r3.id));
    ok('سطور: مقعد ← دفع (بمستلمه) ← إزالة (بقناة التطبيق)',
      be.map((x) => x.kind).join(',') === 'seat_added,paid,seat_removed'
      && be[1].actor === 'Cashier' && be[2].channel === 'app' && be[2].actor === 'مقعد', JSON.stringify(be));

    console.log('\n⑦ الخطّ الزمنيّ والتقرير');
    const tl = await C.timelineOf(r1.id);
    ok('الخطّ الزمنيّ: الأحدث أوّلاً وفيه الإلغاءان والاسترجاع', tl.length >= 5 && tl[0].kind === 'cancelled'
      && tl.filter((x: any) => x.kind === 'cancelled').length === 2 && tl.some((x: any) => x.kind === 'restored'), JSON.stringify(tl.map((x: any) => x.kind)));
    ok('مفاتيح الخطّ فريدة', new Set(tl.map((x: any) => x.key)).size === tl.length);
    const rep = await C.cancellationReport(30);
    ok('التقرير يعمل ويستثني موقع الاختبار', !!rep && Array.isArray(rep.rows) && Array.isArray(rep.reasons), JSON.stringify(rep).slice(0, 200));
  } catch (e: any) {
    fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e);
  } finally { await cleanup(); }

  console.log(`\n${fail ? '❌' : '✅'} م٣: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
