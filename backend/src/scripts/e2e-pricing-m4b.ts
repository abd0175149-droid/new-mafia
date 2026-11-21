// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٤-ب «القنوات، والأيّام، والعرض اليدويّ، وزيارة الولاء، ومشروب ليلة العرض»
// ⚠️ يكتب عروضاً فعّالة على فعاليّةٍ في مكانٍ حقيقيّ — شغّله على نسخةٍ مؤقّتة من قاعدة الإنتاج فقط
//    (DATABASE_URL=…/mafia_m2test). قاعدةٌ فقط، لا يكلّم الخادم الحيّ. يرفض العمل على mafia_db.
// تشغيل: DATABASE_URL=${DATABASE_URL%/*}/mafia_m2test npx tsx src/scripts/e2e-pricing-m4b.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = 'E2E-M4B';
const PH = { a: '0799999951', b: '0799999952' };
const H = 3600e3;
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  if (!/mafia_m2test/.test(String(process.env.DATABASE_URL || ''))) { console.error('❌ هذا الفحص للنسخة المؤقّتة وحدها (mafia_m2test)'); process.exit(2); }
  const E = await import('../services/early-price.service.js');

  console.log('\n① القنوات والأيّام (دوالّ نقيّة)');
  const now = Date.now();
  const act = { id: 1, name: 'x', date: now + 3 * 24 * H, price: 3, cityId: null, isTest: false, status: 'planned', locationName: '' };
  const dow = E.ammanWeekday(act.date);
  const base = E.toPromo({ id: 9, name: 'p', status: 'live', mode: 'fixed', value: 2, lead_hours: 24, act_from: new Date(now - H), act_until: new Date(now + 30 * 24 * H), scope: 'all' });
  ok('بلا قنوات محفوظة ⟵ الدون وأدمن البوت (كما كان)', JSON.stringify(base.channels) === '["bot","admin"]');
  const ctx = (channel: any) => ({ now, bookedAt: now, channel, strikes: 0 });
  ok('الدون ينطبق، والتطبيق لا', E.judgeEarly(base, act, ctx('bot')).ok && !E.judgeEarly(base, act, ctx('app')).ok);
  const appOnly = { ...base, channels: ['app'] as any };
  ok('عرضٌ للتطبيق وحده ⟵ التطبيق ينطبق والدون لا (ق٣)', E.judgeEarly(appOnly, act, ctx('app')).ok && !E.judgeEarly(appOnly, act, ctx('bot')).ok);
  ok('سبب القناة يذكر قنوات العرض', E.judgeEarly(appOnly, act, ctx('bot')).reasons.some((r) => r.text.includes('التطبيق')));
  ok('يوم الفعاليّة ضمن أيّام العرض ⟵ ينطبق (ق٢٣)', E.judgeEarly({ ...base, weekdays: [dow] }, act, ctx('bot')).ok);
  ok('يومٌ آخر ⟵ خارج النطاق', !E.judgeEarly({ ...base, weekdays: [(dow + 1) % 7] }, act, ctx('bot')).ok);
  ok('الحفظ: قنوات غير معروفة تُرمى، وفارغة ⟵ الافتراض', JSON.stringify(E.promoValues({ ...({} as any), name: 'x', mode: 'fixed', value: 2, leadHours: 24, actFrom: new Date(), actUntil: new Date(), scope: 'all', channels: ['zzz'] as any }).channels) === '["bot","admin"]');

  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  for (const s of [
    sql`ALTER TABLE early_price_promos ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '["bot","admin"]'::jsonb`,
    sql`ALTER TABLE early_price_promos ADD COLUMN IF NOT EXISTS weekdays JSONB DEFAULT '[]'::jsonb`,
    sql`ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS weekdays JSONB DEFAULT '[]'::jsonb`,
    sql`ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS exclude_ids JSONB DEFAULT '[]'::jsonb`,
  ]) await db.execute(s);
  const { migrateBookingEvents } = await import('../migrations-booking-events.js');
  await migrateBookingEvents(db);

  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`)) {
      await q(sql`DELETE FROM booking_events WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM early_price_promos WHERE name LIKE ${'%' + TAG + '%'}`);
    await q(sql`DELETE FROM booking_offers WHERE name LIKE ${'%' + TAG + '%'}`);
    await q(sql`DELETE FROM loyalty_rewards WHERE player_id IN (SELECT id FROM players WHERE phone IN (${PH.a}, ${PH.b}))`);
    await q(sql`DELETE FROM players WHERE phone IN (${PH.a}, ${PH.b})`);
    E.invalidateEarlyCache();
  };
  await cleanup();
  try {
    const [loc] = await q(sql`SELECT id FROM locations WHERE COALESCE(is_test_location, false) = false AND deleted_at IS NULL ORDER BY id LIMIT 1`);
    const date = new Date(now + 3 * 24 * H);
    const [a1] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG + ' أ'}, ${date}, 3, 'planned', ${loc.id}) RETURNING id`);
    const [a2] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG + ' ب'}, ${new Date(date.getTime() + 24 * H)}, 3, 'planned', ${loc.id}) RETURNING id`);

    console.log('\n② عرض المجموعة بالأيّام (ق٢٣)');
    const O = await import('../services/booking-offers.service.js');
    const d1 = E.ammanWeekday(date.getTime());
    const [g] = await q(sql`INSERT INTO booking_offers (name, status, group_size, pay_for, book_from, book_until, activity_ids, weekdays, exclude_ids)
      VALUES (${TAG + ' لمة'}, 'paused', 3, 2, ${new Date(now - H)}, ${new Date(now + 10 * 24 * H)}, '[]'::jsonb, ${JSON.stringify([d1])}::jsonb, '[]'::jsonb) RETURNING id`);
    await O.syncOfferWeekdays(Number(g.id));
    let [gr] = await q(sql`SELECT activity_ids FROM booking_offers WHERE id = ${g.id}`);
    ok('فعاليّة اليوم المختار تنضمّ، والأخرى لا', gr.activity_ids.includes(Number(a1.id)) && !gr.activity_ids.includes(Number(a2.id)), JSON.stringify(gr.activity_ids));
    await q(sql`UPDATE booking_offers SET activity_ids = '[]'::jsonb, exclude_ids = ${JSON.stringify([Number(a1.id)])}::jsonb WHERE id = ${g.id}`);
    await O.syncOfferWeekdays(Number(g.id));
    [gr] = await q(sql`SELECT activity_ids FROM booking_offers WHERE id = ${g.id}`);
    ok('المستثناة لا تعود', !gr.activity_ids.includes(Number(a1.id)), JSON.stringify(gr.activity_ids));

    console.log('\n③ «طبّق عرضاً» من المتابعة (ق٤)');
    const [p] = await q(sql`INSERT INTO early_price_promos (name, status, mode, value, lead_hours, act_from, act_until, scope, activity_ids, channels, created_by)
      VALUES (${TAG + ' مبكّر'}, 'live', 'fixed', '2', 24, ${new Date(now - H)}, ${new Date(now + 30 * 24 * H)}, 'acts', ${JSON.stringify([Number(a1.id)])}::jsonb, '["bot","admin"]'::jsonb, ${TAG}) RETURNING id`);
    E.invalidateEarlyCache();
    const [rs] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${a1.id}, 'موظّف', ${PH.b}, 2, 'confirmed', 'Qais') RETURNING id`);
    const ap0 = await E.applyOnNewReservation(Number(rs.id));
    ok('حجز الموظّف بالسعر العاديّ (لا قفل آليّ)', !ap0.applied);
    const offs = await E.manualOffersFor(Number(a1.id));
    ok('العرض متاحٌ للتطبيق اليدويّ', offs.some((o) => o.id === Number(p.id) && o.price === 2), JSON.stringify(offs));
    const who = { channel: 'staff' as const, actor: 'Qais' };
    ok('بلا سبب ⟵ يُرفض', !(await E.setReservationOffer(Number(rs.id), Number(p.id), '  ', who)).ok);
    const so = await E.setReservationOffer(Number(rs.id), Number(p.id), 'حجز بالهاتف قبل الموعد', who);
    const [rr] = await q(sql`SELECT unit_price, price_promo_id, promo_seats FROM reservations WHERE id = ${rs.id}`);
    ok('يُقفل السعر على المقعدين', so.ok && Number(rr.unit_price) === 2 && Number(rr.price_promo_id) === Number(p.id) && Number(rr.promo_seats) === 2, JSON.stringify({ so, rr }));
    let [ev] = await q(sql`SELECT actor, reason FROM booking_events WHERE reservation_id = ${rs.id} AND kind = 'offer_manual' ORDER BY id DESC LIMIT 1`);
    ok('سطرٌ في السجلّ بالسبب والفاعل', ev?.reason === 'حجز بالهاتف قبل الموعد' && ev?.actor === 'Qais', JSON.stringify(ev));
    await E.setReservationOffer(Number(rs.id), null, 'طلب الإدارة', who);
    const [rr2] = await q(sql`SELECT unit_price FROM reservations WHERE id = ${rs.id}`);
    ok('«أزل العرض» يعيده للسعر العاديّ', rr2.unit_price == null);
    ok('عرضٌ لا يشمل الفعاليّة يُرفض', !(await E.setReservationOffer(Number(rs.id), Number(p.id), 'x', who).then(async () => {
      return E.setReservationOffer(Number((await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${a2.id}, 'آخر', '0799999953', 1, 'confirmed', 'Qais') RETURNING id`))[0].id), Number(p.id), 'سبب', who);
    })).ok);

    console.log('\n④ قنوات العرض في التطبيق (ق٣)');
    const [ra] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${a1.id}, 'تطبيق', '0799999954', 1, 'confirmed', 'player-app') RETURNING id`);
    ok('عرضٌ للدون وحده ⟵ حجز التطبيق بالسعر العاديّ', !(await E.applyOnNewReservation(Number(ra.id))).applied);
    await q(sql`UPDATE early_price_promos SET channels = '["bot","admin","app"]'::jsonb WHERE id = ${p.id}`); E.invalidateEarlyCache();
    const apA = await E.applyOnNewReservation(Number(ra.id));
    ok('أُضيف «التطبيق» ⟵ يُقفل المبكّر لحجز التطبيق', apA.applied && apA.price === 2, JSON.stringify(apA));

    console.log('\n⑤ زيارة الولاء من الباب، حصريّة (ق٦، ق١٣)، ومشروب ليلة العرض (ق١٤)');
    const [pl] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH.a}, ${TAG + ' لاعب'}, 'x') RETURNING id`);
    const [rw] = await q(sql`INSERT INTO loyalty_rewards (player_id, period, seq, kind, status, expires_at) VALUES (${pl.id}, '2026-11', 1, 'free_visit', 'available', NOW() + INTERVAL '20 days') RETURNING id`);
    const [rl] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, player_id, created_by) VALUES (${a1.id}, 'ولاء', ${PH.a}, 2, 'confirmed', ${pl.id}, 'Qais') RETURNING id`);
    await E.setReservationOffer(Number(rl.id), Number(p.id), 'تجربة قبل الزيارة', who);
    const L = await import('../services/loyalty.service.js');
    ok('ليلة عرض ⟵ المشروب لا يُطبَّق آليّاً', await L.offerNightFor(db, Number(pl.id), Number(a1.id)));
    const C = await import('../services/booking-commands.service.js');
    const x0 = await C.reservationExtras(Number(rl.id));
    ok('بطاقة الشخص ترى الزيارة المتاحة والعرض المقفول', !!x0?.visit.available && x0?.lock?.unitPrice === 2, JSON.stringify(x0));
    const lv = await C.setLoyaltyVisit(Number(rl.id), true, { channel: 'staff', actor: 'Qais' }, 'طبّقها الموظّف عند الباب');
    const [bk] = await q(sql`SELECT id, is_free, loyalty_reward_id FROM bookings WHERE activity_id = ${a1.id} AND player_id = ${pl.id} AND deleted_at IS NULL`);
    const [rr3] = await q(sql`SELECT unit_price FROM reservations WHERE id = ${rl.id}`);
    const [rw2] = await q(sql`SELECT status FROM loyalty_rewards WHERE id = ${rw.id}`);
    ok('الزيارة تُطبَّق على صفّ حجز صاحبها', lv.ok && bk?.is_free === true && Number(bk?.loyalty_reward_id) === Number(rw.id), JSON.stringify({ lv, bk }));
    ok('حصريّة: يُزال العرض المقفول عن الحجز (ق١٣)', lv.removedOffer === true && rr3.unit_price == null, JSON.stringify(rr3));
    ok('المكافأة «مستعملة»', rw2.status === 'redeemed');
    ok('تطبيقها ثانيةً يُرفض', !(await C.setLoyaltyVisit(Number(rl.id), true, { channel: 'staff', actor: 'Qais' }, '')).ok);
    const un = await C.setLoyaltyVisit(Number(rl.id), false, { channel: 'staff', actor: 'Qais' }, 'أعادها الموظّف');
    const [rw3] = await q(sql`SELECT status FROM loyalty_rewards WHERE id = ${rw.id}`);
    ok('«أعدها له» ⟵ متاحة ثانيةً', un.ok && rw3.status === 'available', JSON.stringify({ un, rw3 }));
    [ev] = await q(sql`SELECT COUNT(*)::int AS n FROM booking_events WHERE reservation_id = ${rl.id} AND kind = 'loyalty_manual'`);
    ok('السجلّ يحمل التطبيق والإعادة', Number(ev.n) === 2, String(ev.n));
    ok('بلا عرضٍ ولا زيارة ⟵ ليست ليلة عرض', !(await L.offerNightFor(db, Number(pl.id), Number(a1.id))));
  } catch (e: any) {
    fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e);
  } finally { await cleanup(); }

  console.log(`\n${fail ? '❌' : '✅'} م٤-ب: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
