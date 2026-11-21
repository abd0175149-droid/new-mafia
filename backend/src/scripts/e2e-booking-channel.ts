// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٢-أ «القناة والفاعل والرابط» (2026-11-21)
// يطبّق الترحيل (آمنٌ للتكرار)، ثمّ يكتب صفوفاً في موقع الاختبار ويتحقّق ممّا ملأه المشغّل، ثمّ ينظّف.
// ويطبع تغطية الملء القديم (قراءةٌ فقط). شغّله على staging أوّلاً.
// تشغيل: docker compose exec -T -w /app backend npx tsx src/scripts/e2e-booking-channel.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { migrateBookingChannelLink } from '../migrations-booking-channel.js';

const LOC = 3;
const TAG = 'E2E-BOOKING-CHANNEL';
const PH = { a: '0799999981', b: '0799999982', c: '0799999983', d: '0799999984' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`)) {
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone IN (${PH.a}, ${PH.b}, ${PH.c}, ${PH.d})`);
  };
  console.log('\n① الترحيل (مرّتين — آمنٌ للتكرار)');
  await migrateBookingChannelLink(db);
  await migrateBookingChannelLink(db);
  const trg = await q(sql`SELECT tgname FROM pg_trigger WHERE tgname IN ('reservations_fill_trg','bookings_fill_trg','reservations_link_bookings_trg') ORDER BY 1`);
  ok('المشغّلات الثلاثة موجودة مرّةً واحدة', trg.length === 3, JSON.stringify(trg));
  await cleanup();
  try {
    const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG}, NOW() + INTERVAL '2 days', 3, 'planned', ${LOC}) RETURNING id`);
    const [pa] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH.a}, 'قناة أ', 'x') RETURNING id`);

    console.log('\n② الكتابة الجديدة يملؤها المشغّل');
    const [r1] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, player_id, created_by) VALUES (${act.id}, 'قناة أ', ${PH.a}, 2, 'confirmed', ${pa.id}, 'player-app') RETURNING channel, actor, id`);
    ok('حجز التطبيق ⟵ app وفاعله حسابه', r1.channel === 'app' && r1.actor === `player:${pa.id}`, JSON.stringify(r1));
    const [b1] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by) VALUES (${act.id}, 'قناة أ', ${PH.a}, 1, ${pa.id}, 'player-app') RETURNING channel, reservation_id`);
    ok('صفّ حجزه مربوطٌ بصفّ متابعته', Number(b1.reservation_id) === Number(r1.id) && b1.channel === 'app', JSON.stringify(b1));
    const [r2] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'ضيف', '+962 79 999 9982', 1, 'pending', 'Qais') RETURNING channel, actor, id`);
    ok('حجز موظّف ⟵ staff وفاعله اسمه', r2.channel === 'staff' && r2.actor === 'Qais', JSON.stringify(r2));
    const [b2] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, created_by) VALUES (${act.id}, 'ضيف', ${PH.b}, 1, 'reservation-confirm') RETURNING channel, reservation_id`);
    ok('مرآة التثبيت ترث قناة المتابعة، والرقم الدوليّ يطابق المحلّيّ', Number(b2.reservation_id) === Number(r2.id) && b2.channel === 'staff', JSON.stringify(b2));
    const [b3] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, created_by) VALUES (${act.id}, 'باب', ${PH.c}, 1, 'النظام (Auto-Sync)') RETURNING id, channel, reservation_id`);
    ok('دخول الغرفة ⟵ door وبلا رابط بعد', b3.channel === 'door' && b3.reservation_id == null, JSON.stringify(b3));
    const [r3] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'باب', ${PH.c}, 1, 'confirmed', 'النظام (Auto-Sync)') RETURNING id, channel`);
    const [b3b] = await q(sql`SELECT reservation_id FROM bookings WHERE id = ${b3.id}`);
    ok('صفّ المتابعة بعده يلتقط صفّ الحجز', Number(b3b.reservation_id) === Number(r3.id) && r3.channel === 'door', JSON.stringify({ b3b, r3 }));
    const [r4] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'دون', ${PH.d}, 1, 'confirmed', '🤖 بوت واتساب') RETURNING channel, actor`);
    ok('الدون ⟵ bot وفاعله رقمه', r4.channel === 'bot' && r4.actor === 'phone:799999984', JSON.stringify(r4));
    const [r5] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by, channel, actor) VALUES (${act.id}, 'صريح', '0799999985', 1, 'pending', 'player-app', 'staff', 'test') RETURNING channel, actor`);
    ok('القيمة الصريحة لا يغيّرها المشغّل', r5.channel === 'staff' && r5.actor === 'test', JSON.stringify(r5));
    await q(sql`DELETE FROM reservations WHERE id = ${r1.id}`);
    const [b1b] = await q(sql`SELECT reservation_id FROM bookings WHERE activity_id = ${act.id} AND player_id = ${pa.id}`);
    ok('حذف صفّ المتابعة فعلاً ⟵ الرابط يُفرَّغ ولا يُكسر', b1b.reservation_id == null, JSON.stringify(b1b));
  } catch (e: any) {
    fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e);
  } finally { await cleanup(); }

  console.log('\n③ تغطية الملء القديم (قراءةٌ فقط)');
  const cov = await q(sql`SELECT channel, COUNT(*)::int AS n, COUNT(reservation_id)::int AS linked FROM bookings WHERE deleted_at IS NULL GROUP BY channel ORDER BY n DESC`);
  for (const c of cov) console.log(`  ℹ️ صفوف حجز ${c.channel}: ${c.n} · مربوطة ${c.linked} (${Math.round((c.linked / Math.max(1, c.n)) * 100)}٪)`);
  const rc = await q(sql`SELECT channel, COUNT(*)::int AS n FROM reservations WHERE deleted_at IS NULL GROUP BY channel ORDER BY n DESC`);
  console.log('  ℹ️ صفوف متابعة:', rc.map((c) => `${c.channel} ${c.n}`).join(' · '));
  const nulls = await q(sql`SELECT (SELECT COUNT(*)::int FROM reservations WHERE channel IS NULL) AS r, (SELECT COUNT(*)::int FROM bookings WHERE channel IS NULL) AS b`);
  ok('لا صفّ بلا قناة', nulls[0].r === 0 && nulls[0].b === 0, JSON.stringify(nulls[0]));
  // الرابط يطابق القاعدة القديمة: الشخص نفسه في الفعاليّة نفسها
  const bad = await q(sql`SELECT COUNT(*)::int AS n FROM bookings b JOIN reservations r ON r.id = b.reservation_id
     WHERE r.activity_id <> b.activity_id OR NOT ((b.player_id IS NOT NULL AND r.player_id = b.player_id) OR (phone9(b.phone) <> '' AND phone9(r.phone) = phone9(b.phone)))`);
  ok('كلّ رابطٍ يصل الشخص نفسه في الفعاليّة نفسها', bad[0].n === 0, String(bad[0].n));

  console.log(`\n${fail ? '❌' : '✅'} م٢-أ: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
