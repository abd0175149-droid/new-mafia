// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م١ «سدّ الثغرات» (2026-11-21)
// على الإنتاج في موقع الاختبار، بأرقام فحصٍ بلا محادثات (فلا رسالة تخرج)، ويُنظَّف كلّ شيء.
// تشغيل: docker compose exec -T -w /app backend npx tsx src/scripts/e2e-booking-m1.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { unpaidWithEntryPrice, notBookable } from '../services/whatsapp-bot.service.js';
import { afterBookingRemoved, followUpUrl } from '../services/booking-lifecycle.service.js';
import { removeBookingForReservation, existingBookingAnywhere } from '../services/reservation-booking.service.js';

const LOC = 3;                                  // موقع الاختبار
const TAG = 'E2E-BOOKING-M1';
const PH = { a: '0799999971', b: '0799999972', c: '0799999973', d: '0799999974', e: '0799999975' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const phones = Object.values(PH);
  const cleanup = async () => {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    for (const a of acts) {
      await q(sql`DELETE FROM booking_group_members WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM booking_groups WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM loyalty_rewards WHERE player_id IN (SELECT id FROM players WHERE phone IN (${PH.a}, ${PH.b}, ${PH.c}, ${PH.d}, ${PH.e}))`);
    await q(sql`DELETE FROM players WHERE phone IN (${PH.a}, ${PH.b}, ${PH.c}, ${PH.d}, ${PH.e})`);
  };
  // أرقام الفحص يجب ألّا تملك محادثة — وإلّا قد تخرج رسالة لصاحب مجموعة
  const conv = await q(sql`SELECT COUNT(*)::int AS n FROM wa_conversations WHERE phone IN (${PH.a}, ${PH.b}, ${PH.c}, ${PH.d}, ${PH.e})`);
  if (conv[0].n > 0) { console.log('⛔ لأرقام الفحص محادثات — أوقفت الفحص كي لا تخرج رسالة'); process.exit(2); }
  await cleanup();
  try {
    const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id)
      VALUES (${TAG}, NOW() + INTERVAL '2 days', 3.00, 'planned', ${LOC}) RETURNING id`);
    const mkPlayer = async (ph: string, nm: string) => (await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${ph}, ${nm}, 'x') RETURNING id`))[0].id;
    const pa = await mkPlayer(PH.a, 'فحص م١ أ'), pb = await mkPlayer(PH.b, 'فحص م١ ب');
    const book = async (o: { name: string; phone: string; playerId?: number | null; paid?: boolean; free?: boolean; unit?: number | null; by?: string }) =>
      (await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free, paid_amount, unit_price)
        VALUES (${act.id}, ${o.name}, ${o.phone}, 1, ${o.playerId ?? null}, ${o.by || 'موظّف الفحص'}, ${!!o.paid}, ${!!o.free}, '0', ${o.unit == null ? null : String(o.unit)}) RETURNING *`))[0];

    console.log('\n① أدوات المال في الدون تقرأ السعر المقفول');
    const A = await book({ name: 'مقفول ٢', phone: PH.a, playerId: pa, unit: 2 });
    const B = await book({ name: 'عاديّ', phone: PH.b, playerId: pb });
    await book({ name: 'مدفوع', phone: PH.c, paid: true });
    await book({ name: 'مجّانيّ', phone: PH.d, free: true, paid: true });
    // قفلٌ موروث: صفّ حجزٍ بلا سعر وصفّ متابعةٍ للرقم نفسه مقفولٌ على ٢
    const E = await book({ name: 'قفل موروث', phone: PH.e });
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, unit_price, created_by) VALUES (${act.id}, 'قفل موروث', ${PH.e}, 1, 'confirmed', '2.00', 'e2e')`);
    const due = await unpaidWithEntryPrice(db, act.id);
    const byId = new Map(due.map((x) => [x.id, x.price]));
    ok('ثلاثة صفوف غير مدفوعة (المدفوع والمجّانيّ خارجها)', due.length === 3, JSON.stringify(due));
    ok('المقفول بسعره ٢', byId.get(A.id) === 2, String(byId.get(A.id)));
    ok('غير المقفول بسعر الفعاليّة ٣', byId.get(B.id) === 3, String(byId.get(B.id)));
    ok('الموروث من صفّ المتابعة ٢', byId.get(E.id) === 2, String(byId.get(E.id)));
    ok('المتوقَّع ٧ لا ٩', due.reduce((t, x) => t + x.count * x.price, 0) === 7);

    console.log('\n② التنظيف الموحّد بعد إزالة صفّ حجز');
    const [rw] = await q(sql`INSERT INTO loyalty_rewards (player_id, period, seq, kind, status, redeemed_at, redeemed_ref_type, redeemed_ref_id)
      VALUES (${pa}, '2026-11', 99, 'free_visit', 'redeemed', NOW(), 'booking', ${A.id}) RETURNING id`);
    await q(sql`UPDATE bookings SET loyalty_reward_id = ${rw.id}, is_free = true, is_paid = true WHERE id = ${A.id}`);
    const [g] = await q(sql`INSERT INTO booking_groups (activity_id, owner_phone, owner_name, declared_people, terms, status, source)
      VALUES (${act.id}, ${PH.c}, 'صاحب الفحص', 3, '{}'::jsonb, 'claimed', 'bot') RETURNING id`);
    await q(sql`INSERT INTO booking_group_members (group_id, activity_id, name, phone, booking_id, status) VALUES (${g.id}, ${act.id}, 'مقفول ٢', ${PH.a}, ${A.id}, 'booked')`);
    await q(sql`UPDATE bookings SET deleted_at = NOW() WHERE id = ${A.id}`);
    await afterBookingRemoved(A.id);
    const [rw2] = await q(sql`SELECT status, redeemed_ref_id FROM loyalty_rewards WHERE id = ${rw.id}`);
    ok('الزيارة المجّانيّة عادت متاحة', rw2.status === 'available' && rw2.redeemed_ref_id == null, JSON.stringify(rw2));
    const [m2] = await q(sql`SELECT status FROM booking_group_members WHERE booking_id = ${A.id}`);
    ok('العضو خرج من المجموعة', m2.status === 'removed', m2.status);
    const [g2] = await q(sql`SELECT declared_people FROM booking_groups WHERE id = ${g.id}`);
    ok('المجموعة صغرت إلى ٢', Number(g2.declared_people) === 2, String(g2.declared_people));
    await afterBookingRemoved(A.id);   // التكرار آمن
    const [g3] = await q(sql`SELECT declared_people FROM booking_groups WHERE id = ${g.id}`);
    ok('النداء الثاني لا يصغّرها مرّة أخرى', Number(g3.declared_people) === 2, String(g3.declared_people));

    console.log('\n③ فكّ التثبيت والحذف يمرّان بالتنظيف نفسه');
    const B2 = await book({ name: 'تطبيق بزيارة', phone: PH.b, playerId: pb, by: 'player-app', free: true, paid: true });
    await q(sql`UPDATE bookings SET deleted_at = NOW() WHERE id = ${B.id}`);   // الصفّ الأوّل لـ«ب» خارج الطريق
    const [rwb] = await q(sql`INSERT INTO loyalty_rewards (player_id, period, seq, kind, status, redeemed_at, redeemed_ref_type, redeemed_ref_id)
      VALUES (${pb}, '2026-11', 98, 'free_visit', 'redeemed', NOW(), 'booking', ${B2.id}) RETURNING id`);
    await q(sql`UPDATE bookings SET loyalty_reward_id = ${rwb.id} WHERE id = ${B2.id}`);
    const [rb] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, player_id, app_confirmed, created_by)
      VALUES (${act.id}, 'تطبيق بزيارة', ${PH.b}, 1, 'confirmed', ${pb}, true, 'player-app') RETURNING *`);
    const removed = await removeBookingForReservation(db as any, { ...rb, activityId: rb.activity_id, playerId: rb.player_id, peopleCount: rb.people_count, appConfirmed: rb.app_confirmed, createdBy: rb.created_by } as any);
    ok('صفّ الحجز أُزيل', removed === true);
    const [rwb2] = await q(sql`SELECT status FROM loyalty_rewards WHERE id = ${rwb.id}`);
    ok('وزيارته عادت متاحة (كانت تبقى مستهلكة)', rwb2.status === 'available', rwb2.status);

    console.log('\n④ «قابل للحجز» — الفحص الذي صار يمرّ به حجز التطبيق');
    ok('فعاليّة قادمة قابلة', (await notBookable(db, act.id)) === null);
    const [cx] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG + ' ملغاة'}, NOW() + INTERVAL '1 day', 3, 'cancelled', ${LOC}) RETURNING id`);
    const nbC = await notBookable(db, cx.id);
    ok('الملغاة مرفوضة', !!nbC?.cancelled, JSON.stringify(nbC));
    const [ex] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG + ' منتهية'}, NOW() - INTERVAL '2 days', 3, 'planned', ${LOC}) RETURNING id`);
    const nbE = await notBookable(db, ex.id);
    ok('المنتهية مرفوضة', !!nbE?.ended, JSON.stringify(nbE));

    console.log('\n⑤ منع التكرار من أيّ قناة عند الإضافة من المتابعة');
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${act.id}, 'في المتابعة', ${PH.c}, 1, 'pending', 'موظّف')`);
    const d1 = await existingBookingAnywhere(db as any, act.id, null, PH.c);
    ok('صفّ متابعة بالرقم', d1?.kind === 'res', JSON.stringify(d1));
    await book({ name: 'عضو مجموعة', phone: PH.d, by: '👥 مجموعة عبر الدون' });
    await q(sql`UPDATE bookings SET deleted_at = NOW() WHERE activity_id = ${act.id} AND phone = ${PH.d} AND is_free = true`);
    const d2 = await existingBookingAnywhere(db as any, act.id, null, '+962 79 999 9974');
    ok('صفّ حجزٍ لعضو مجموعة، والرقم الدوليّ يُطبَّع', d2?.kind === 'bk' && d2.via === 'ضمن مجموعة صاحبه', JSON.stringify(d2));
    const d3 = await existingBookingAnywhere(db as any, act.id, pa, '');
    ok('بالحساب وحده (صفّ «مقفول ٢» محذوف) ⟵ لا شيء', d3 === null, JSON.stringify(d3));
    ok('رقمٌ غريب ⟵ لا شيء', (await existingBookingAnywhere(db as any, act.id, null, '0799999979')) === null);

    console.log('\n⑥ روابط الإشعارات');
    ok('رابط المتابعة على الفعاليّة', followUpUrl(413) === '/admin/reservations?activityId=413');
    ok('بلا فعاليّة ⟵ الصفحة وحدها', followUpUrl(null) === '/admin/reservations');
  } catch (e: any) {
    fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e);
  } finally {
    await cleanup();
  }
  console.log(`\n${fail ? '❌' : '✅'} م١: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
