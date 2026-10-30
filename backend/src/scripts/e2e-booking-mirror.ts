// ══════════════════════════════════════════════════════
// 🧪 الحجز اليدويّ ⟵ «متابعة الحجوزات» (2026-10-30) — على الإنتاج في موقع الاختبار، بلا إشعارات
// الدالّة نفسها التي يناديها POST /api/bookings (ensureReservationForBooking) — لا يُستدعى
// المسار لأنّه يرسل «حجز جديد» إشعاراً لهواتف الموظّفين.
// تشغيل: docker exec mafia-prod-backend-1 npx tsx src/scripts/e2e-booking-mirror.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { ensureReservationForBooking, removeBookingForReservation } from '../services/reservation-booking.service.js';
import { countBookedPeopleBatch } from '../services/booking-count.service.js';

const LOC = 3;
const TAG = 'E2E-BOOKING-MIRROR';
const PH = { a: '0799999961', b: '0799999962', c: '0799999963' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const cleanup = async () => {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    for (const a of acts) {
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone IN (${PH.a}, ${PH.b})`);
  };
  await cleanup();
  try {
    const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id)
      VALUES (${TAG}, NOW() + INTERVAL '2 days', 3.00, 'planned', ${LOC}) RETURNING id`);
    const [pa] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH.a}, 'فحص المرآة أ', 'x') RETURNING id`);
    const [pb] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH.b}, 'فحص المرآة ب', 'x') RETURNING id`);
    const book = async (name: string, phone: string, count: number, playerId: number | null) =>
      (await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
        VALUES (${act.id}, ${name}, ${phone}, ${count}, ${playerId}, 'موظّف الفحص', false, false) RETURNING *`))[0];
    const resOf = async (phone: string) => q(sql`SELECT * FROM reservations WHERE activity_id = ${act.id} AND phone = ${phone} AND deleted_at IS NULL`);
    const seats = async () => (await countBookedPeopleBatch([act.id])).get(act.id);

    console.log('\n═══ ١ · حجزٌ يدويّ من محادثة الواتساب ═══');
    const b1 = await book('فحص المرآة أ', PH.a, 1, pa.id);
    const r1 = await ensureReservationForBooking(db, { ...b1, activityId: b1.activity_id, playerId: b1.player_id }, { createdBy: 'موظّف الفحص', contactMethod: 'واتساب' });
    let rs = await resOf(PH.a);
    ok('صفّ متابعةٍ واحد أُنشئ', r1.result === 'created' && rs.length === 1);
    ok('مثبّت، مربوطٌ بحسابه، موسومٌ بحجزه، «واتساب»', rs[0]?.status === 'confirmed' && Number(rs[0]?.player_id) === pa.id
      && rs[0]?.app_confirmed === true && rs[0]?.contact_method === 'واتساب' && rs[0]?.people_count === 1, JSON.stringify(rs[0]));
    ok('المقاعد = 1 (لا يُحسب صاحبه مرّتين)', (await seats()) === 1, `${await seats()}`);
    const again = await ensureReservationForBooking(db, { ...b1, activityId: b1.activity_id, playerId: b1.player_id }, { createdBy: 'موظّف الفحص' });
    ok('تكرار المرآة لا يكرّر الصفّ', again.result === 'updated' && (await resOf(PH.a)).length === 1);

    console.log('\n═══ ٢ · حجزٌ لثلاثة برقمٍ بلا حساب ═══');
    const b2 = await book('ضيف بلا حساب', PH.c, 3, null);
    await ensureReservationForBooking(db, { ...b2, activityId: b2.activity_id, playerId: null }, { createdBy: 'موظّف الفحص' });
    rs = await resOf(PH.c);
    const [b2n] = await q(sql`SELECT count FROM bookings WHERE id = ${b2.id}`);
    ok('صفّ الحجز يُردّ لصاحبه (1) والمرافقون للمتابعة (3)', b2n.count === 1 && rs[0]?.people_count === 3 && rs[0]?.app_confirmed === true, `${b2n.count} ${rs[0]?.people_count}`);
    ok('المقاعد = 1 + 3 = 4 (ما أدخله الموظّف بالضبط)', (await seats()) === 4, `${await seats()}`);

    console.log('\n═══ ٣ · له صفّ متابعةٍ قائم (غير مثبّت، شخصان) ═══');
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by)
      VALUES (${act.id}, 'فحص المرآة ب', ${PH.b}, 2, 'pending', 'موظّف')`);
    ok('قبل الحجز: المقاعد 4 + 2 = 6', (await seats()) === 6, `${await seats()}`);
    const b3 = await book('فحص المرآة ب', PH.b, 1, pb.id);
    const r3 = await ensureReservationForBooking(db, { ...b3, activityId: b3.activity_id, playerId: b3.player_id }, { createdBy: 'موظّف الفحص' });
    rs = await resOf(PH.b);
    ok('لا صفّ ثانٍ — القائم يُكمَّل', r3.result === 'updated' && rs.length === 1);
    ok('صار مثبّتاً، مربوطاً بحسابه، موسوماً، بعدده (2)', rs[0]?.status === 'confirmed' && Number(rs[0]?.player_id) === pb.id && rs[0]?.app_confirmed === true && rs[0]?.people_count === 2, JSON.stringify(rs[0]));
    ok('المقاعد تبقى 6 (صاحبه انتقل لصفّ الحجز ولم يُضاعَف)', (await seats()) === 6, `${await seats()}`);

    console.log('\n═══ ٤ · فكّ التثبيت من المتابعة لا يحذف حجز الموظّف ═══');
    const removed = await removeBookingForReservation(db, { id: rs[0].id, activityId: act.id, contactName: rs[0].contact_name, phone: PH.b, peopleCount: 2, playerId: pb.id });
    const [b3n] = await q(sql`SELECT deleted_at FROM bookings WHERE id = ${b3.id}`);
    ok('الحجز اليدويّ باقٍ (أدخله موظّفٌ بيده)', removed === false && b3n.deleted_at === null);
  } finally {
    await cleanup();
  }
  console.log(`\n═══ النتيجة ═══\n\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) failures.forEach(f => console.log(`   • ${f}`));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('💥', e); process.exit(2); });
