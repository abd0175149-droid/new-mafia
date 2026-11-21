// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٥ج «السعة وقائمة الانتظار بالدور»
// ⚠️ نسخةٌ مؤقّتة من قاعدة الإنتاج فقط (mafia_m2test) — يرفض العمل على غيرها. قاعدةٌ فقط، لا خادم حيّ.
//    أسماء الفعاليّات تبدأ بـ🧪 فلا يخرج أيّ إشعار أو رسالة (notifyOffer يتخطّاها).
// تشغيل: DATABASE_URL=${DATABASE_URL%/*}/mafia_m2test npx tsx src/scripts/e2e-capacity-m5c.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = '🧪 E2E-M5C';
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!/mafia_m2test/.test(String(process.env.DATABASE_URL || ''))) { console.error('❌ للنسخة المؤقّتة وحدها (mafia_m2test)'); process.exit(2); }
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const { migrateBookingEvents } = await import('../migrations-booking-events.js');
  await migrateBookingEvents(db);
  const Q = await import('../services/capacity-queue.service.js');
  await Q.migrateCapacityQueue(db);
  const C = await import('../services/booking-commands.service.js');

  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${TAG + '%'}`)) {
      await q(sql`DELETE FROM booking_events WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
  };
  await cleanup();
  try {
    const [loc] = await q(sql`SELECT id FROM locations WHERE COALESCE(is_test_location, false) = false AND deleted_at IS NULL ORDER BY id LIMIT 1`);
    const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, max_capacity, seat_template_id)
      VALUES (${TAG}, NOW() + INTERVAL '3 days', 3, 'planned', ${loc.id}, 6, NULL) RETURNING id`);
    const A = Number(act.id);
    const res = async (name: string, phone: string, people: number, status = 'confirmed') =>
      (await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${A}, ${name}, ${phone}, ${people}, ${status}, 'Qais') RETURNING id`))[0];

    console.log('\n① السقف مطفأ (الافتراض) ⟵ بلا سقف');
    const r1 = await res('ممتلئ', '0799999941', 5);
    let i = await Q.capInfo(A);
    ok('السعة ٦ والمحجوز ٥', i.total === 6 && i.booked === 5, JSON.stringify(i));
    ok('مطفأ ⟵ يكفي ولو طلب ١٠', !i.enabled && (await Q.fits(A, 10)).ok);
    ok('مطفأ ⟵ الدور لا يعمل', (await Q.runQueue(A)) === 0);

    console.log('\n② مشغَّل ⟵ المتاح ١');
    await Q.setCap(A, true, { channel: 'staff', actor: 'Qais' });
    i = await Q.capInfo(A);
    ok('المتاح ١', i.enabled && i.remaining === 1, JSON.stringify(i));
    ok('لا يكفي لشخصين', !(await Q.fits(A, 2)).ok);

    console.log('\n③ الدور: «معاً» يُتخطّى ولا يُؤخَّر، والمعروض يُحسب محجوزاً');
    const wA = await res('أ معاً', '0799999942', 2, 'waitlist');
    await sleep(30);
    const wB = await res('ب', '0799999943', 1, 'waitlist');
    const n = await Q.runQueue(A, 'فحص');
    const [rA] = await q(sql`SELECT wl_offer_until FROM reservations WHERE id = ${wA.id}`);
    const [rB] = await q(sql`SELECT wl_offer_until FROM reservations WHERE id = ${wB.id}`);
    ok('عُرض على ب (يكفيه المتاح) وتُخطّي أ (أكبر)', n === 1 && !rA.wl_offer_until && !!rB.wl_offer_until, JSON.stringify({ n, rA, rB }));
    i = await Q.capInfo(A);
    ok('المعروض محجوزٌ له ⟵ المتاح ٠', i.held === 1 && i.remaining === 0, JSON.stringify(i));
    const qu = await Q.queueOf(A);
    ok('أ ما زال الأوّل في الدور', Number(qu[0]?.id) === Number(wA.id) && qu[0].position === 1);

    console.log('\n④ التثبيت');
    let t = await Q.takeFromQueue(Number(wA.id), { channel: 'staff', actor: 'Qais' });
    ok('أ بلا مكان ⟵ CAP_FULL', !t.ok && t.code === 'CAP_FULL', JSON.stringify(t));
    t = await Q.takeFromQueue(Number(wB.id), { channel: 'bot', actor: 'ب' });
    const [rB2] = await q(sql`SELECT status, wl_offer_until FROM reservations WHERE id = ${wB.id}`);
    ok('ب صاحب العرض ⟵ يثبَّت ومهلته تُمسح', t.ok && rB2.status === 'confirmed' && !rB2.wl_offer_until, JSON.stringify({ t, rB2 }));
    t = await Q.takeFromQueue(Number(wA.id), { channel: 'staff', actor: 'Qais' }, { overCap: true, reason: 'طلب المالك' });
    const [ev] = await q(sql`SELECT reason FROM booking_events WHERE reservation_id = ${wA.id} AND kind = 'over_cap'`);
    ok('فوق السعة بزرٍّ صريح ⟵ يثبَّت ويُكتب السبب (ق٢٢)', t.ok && ev?.reason === 'طلب المالك', JSON.stringify({ t, ev }));

    console.log('\n⑤ «لا، شكراً» وانتهاء المهلة ⟵ آخر الدور ثمّ التالي');
    // نعيد المشهد: المحجوز ٨ من ٦ الآن. نلغي «ممتلئ» (٥) ⟵ المتاح ٣
    const wC = await res('ج', '0799999944', 1, 'waitlist');
    await sleep(30);
    const wD = await res('د', '0799999945', 1, 'waitlist');
    await C.cancelReservation(Number(r1.id), { channel: 'staff', actor: 'Qais' }, 'اعتذر العميل');
    await sleep(1500);   // seatFreed غير منتظر
    const [rC] = await q(sql`SELECT wl_offer_until FROM reservations WHERE id = ${wC.id}`);
    const [rD] = await q(sql`SELECT wl_offer_until FROM reservations WHERE id = ${wD.id}`);
    i = await Q.capInfo(A);
    ok('الإلغاء من أيّ قناة يشغّل الدور: عُرض على ج ود', !!rC.wl_offer_until && !!rD.wl_offer_until, JSON.stringify({ rC, rD, i }));
    await Q.releaseOffer(Number(wC.id), 'skip', { channel: 'bot', actor: 'ج' });
    const qu2 = await Q.queueOf(A);
    ok('ج اعتذر ⟵ صار آخر الدور', Number(qu2[qu2.length - 1]?.id) === Number(wC.id), JSON.stringify(qu2.map((x: any) => x.id)));
    const [rC2] = await q(sql`SELECT wl_offer_until FROM reservations WHERE id = ${wC.id}`);
    ok('ومن اعتذر لا يُعرض عليه المقعد نفسه فوراً', !rC2.wl_offer_until, JSON.stringify(rC2));
    const [ev2] = await q(sql`SELECT COUNT(*)::int AS n FROM booking_events WHERE reservation_id = ${wC.id} AND kind IN ('wl_offered', 'wl_skipped')`);
    ok('السجلّ: عُرض ثمّ اعتذر', Number(ev2.n) >= 2, String(ev2.n));
    await q(sql`UPDATE reservations SET wl_offer_until = NOW() - INTERVAL '1 minute' WHERE id = ${wD.id}`);
    const ex = await Q.expireOffers();
    const [evx] = await q(sql`SELECT COUNT(*)::int AS n FROM booking_events WHERE reservation_id = ${wD.id} AND kind = 'wl_expired'`);
    ok('المهلة المنتهية ⟵ تُسجَّل وتعود للدور', ex >= 1 && Number(evx.n) === 1, JSON.stringify({ ex, evx }));

    console.log('\n⑥ الإطفاء');
    await Q.setCap(A, false, { channel: 'staff', actor: 'Qais' });
    ok('أُطفئ ⟵ يكفي أيّ عدد، والمنتظرون باقون', (await Q.fits(A, 20)).ok && (await Q.queueOf(A)).length >= 1);
  } catch (e: any) {
    fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e);
  } finally { await cleanup(); }

  console.log(`\n${fail ? '❌' : '✅'} م٥ج: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
