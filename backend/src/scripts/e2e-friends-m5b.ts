// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م٥ب «أصحابي» والحجز لهم + م٧ب رمز الانضمام
// ⚠️ نسخةٌ مؤقّتة فقط (mafia_m2test). فعاليّة 🧪 فلا دعوات ولا إشعارات. قاعدةٌ فقط.
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = '🧪 E2E-M5B';
const PH = { o: '0799999911', f1: '0799999912', f2: '0799999913', f3: '0799999914', f4: '0799999915' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  if (!/mafia_m2test/.test(String(process.env.DATABASE_URL || ''))) { console.error('❌ للنسخة المؤقّتة وحدها'); process.exit(2); }
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  for (const m of ['../migrations-booking-events.js']) { const M = await import(m); await M.migrateBookingEvents(db); }
  const F = await import('../services/friends.service.js'); await F.migrateFriends(db);
  const Q = await import('../services/capacity-queue.service.js'); await Q.migrateCapacityQueue(db);
  await db.execute(sql`ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS weekdays JSONB DEFAULT '[]'::jsonb`);
  await db.execute(sql`ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS exclude_ids JSONB DEFAULT '[]'::jsonb`);
  const phones = Object.values(PH);
  const inPh = sql.raw(`(${phones.map((p) => `'${p}'`).join(',')})`);
  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${TAG + '%'}`)) {
      await q(sql`DELETE FROM booking_events WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM booking_group_members WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM booking_groups WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM booking_join_codes WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM booking_offers WHERE name LIKE ${TAG + '%'}`);
    const pl = await q(sql`SELECT id FROM players WHERE phone IN ${inPh}`);
    for (const p of pl) {
      await q(sql`DELETE FROM player_friends WHERE owner_player_id = ${p.id} OR friend_player_id = ${p.id}`);
      await q(sql`DELETE FROM player_friend_groups WHERE owner_player_id = ${p.id}`);
      await q(sql`DELETE FROM player_trust WHERE player_id = ${p.id} OR trusts_player_id = ${p.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone IN ${inPh}`);
  };
  await cleanup();
  try {
    const [loc] = await q(sql`SELECT id FROM locations WHERE COALESCE(is_test_location, false) = false AND deleted_at IS NULL ORDER BY id LIMIT 1`);
    const [A] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, max_capacity) VALUES (${TAG}, NOW() + INTERVAL '3 days', 3, 'planned', ${loc.id}, 30) RETURNING id`);
    const [B] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, max_capacity) VALUES (${TAG + ' ٢'}, NOW() + INTERVAL '5 days', 3, 'planned', ${loc.id}, 30) RETURNING id`);
    await q(sql`INSERT INTO booking_offers (name, status, group_size, pay_for, repeat, book_from, book_until, lead_hours, activity_ids, max_groups, per_customer, priority_hours, announce, notify_existing, created_by)
      VALUES (${TAG + ' اللمة'}, 'live', 2, 1, true, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '10 days', 0, ${JSON.stringify([Number(A.id)])}::jsonb, 0, 5, 0, false, false, 'e2e')`);
    const mk = async (ph: string, name: string) => (await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${ph}, ${name}, 'x') RETURNING id`))[0];
    const O = await mk(PH.o, 'أبو لين محمد'); const P1 = await mk(PH.f1, 'راكان فحص');
    const owner = { playerId: Number(O.id), phone: PH.o, name: 'أبو لين محمد' };

    console.log('\n① أصحابي');
    ok('صديقٌ بحساب', (await F.addFriend(owner.playerId, { playerId: Number(P1.id) })).ok);
    ok('صديقٌ بلا حساب (اسم ورقم)', (await F.addFriend(owner.playerId, { name: 'حمزة', phone: PH.f2 })).ok);
    ok('رقمي أنا يُرفض', !(await F.addFriend(owner.playerId, { name: 'أنا', phone: PH.o })).ok);
    ok('رقمٌ غير صالح يُرفض', !(await F.addFriend(owner.playerId, { name: 'خطأ', phone: '12' })).ok);
    let fr = await F.friendsOf(owner.playerId);
    const k1 = fr.friends.find((f) => f.playerId === Number(P1.id))?.key; const k2 = fr.friends.find((f) => f.name === 'حمزة')?.key;
    ok('اثنان في القائمة، ورقم صاحب الحساب لا يُكشف', fr.friends.length === 2 && fr.friends.find((f) => f.hasAccount)?.phoneHint === null && !!k1 && !!k2, JSON.stringify(fr.friends));
    ok('مجموعة محفوظة', (await F.saveGroup(owner.playerId, 'شلّة الأحد', [k1!, k2!])).ok && (await F.friendsOf(owner.playerId)).groups.length === 1);
    ok('الكنية كلمتان', F.kunyaFirst('أبو لين محمد') === 'أبو لين' && F.kunyaFirst('راكان فحص') === 'راكان');

    console.log('\n② المعاينة والعرض');
    const pv: any = await F.previewFriendsBooking(owner, { activityId: Number(A.id), keys: [k1!] });
    ok('صاحبٌ واحد مع عرض ٢ بسعر ١ ⟵ واحدٌ ببلاش', pv.ok && pv.people === 2 && pv.offer?.free === 1 && pv.total === 3, JSON.stringify(pv));
    const pv2: any = await F.previewFriendsBooking(owner, { activityId: Number(A.id), keys: [], companions: 1 });
    ok('مرافقٌ بلا اسم ⟵ بالسعر العاديّ وتلميح «سمِّه»', pv2.ok && pv2.people === 2 && !pv2.offer && pv2.total === 6 && !!pv2.nameHint, JSON.stringify(pv2));

    console.log('\n③ الحجز للأصحاب (بعد حجزه لنفسه كما يفعل التطبيق)');
    await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by) VALUES (${A.id}, ${owner.name}, ${PH.o}, 1, ${O.id}, 'player-app')`);
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, player_id, status, created_by, app_confirmed) VALUES (${A.id}, ${owner.name}, ${PH.o}, 1, ${O.id}, 'confirmed', 'player-app', true)`);
    const bk: any = await F.bookForFriends(owner, { activityId: Number(A.id), keys: [k1!, k2!], companions: 1, payer: 'owner' });
    ok('ثُبّت', bk.ok, JSON.stringify(bk).slice(0, 300));
    const [res] = await q(sql`SELECT id, people_count FROM reservations WHERE activity_id = ${A.id} AND player_id = ${O.id}`);
    ok('الحجز ٤: هو + صاحبان مسمَّيان + مرافق', Number(res.people_count) === 4, JSON.stringify(res));
    const mem = await q(sql`SELECT name, status, booking_id, player_id FROM booking_group_members WHERE activity_id = ${A.id} ORDER BY id`);
    ok('صاحب الحساب «محجوز» بصفّ حجزٍ باسمه، والآخر «معلَّق» برقمه', mem.length === 2 && mem.some((m) => m.status === 'booked' && m.booking_id) && mem.some((m) => m.status === 'pending' && !m.player_id), JSON.stringify(mem));
    const [g] = await q(sql`SELECT payer, offer_id, promised_free FROM booking_groups WHERE activity_id = ${A.id}`);
    ok('العرض محفوظ للمجموعة، و«أنا بدفع عن الكلّ»', g?.payer === 'owner' && g?.offer_id != null && Number(g?.promised_free) >= 1, JSON.stringify(g));
    ok('رمز انضمام للمرافق', !!bk.joinCode, String(bk.joinCode));

    console.log('\n④ رمز الانضمام');
    const c1 = await F.claimJoinCode(bk.joinCode, { phone: PH.f3, name: 'سامي', playerId: null });
    ok('من يرسل الرمز يأخذ مقعداً باسمه', c1.ok, c1.text);
    const [m3] = await q(sql`SELECT status FROM booking_group_members WHERE activity_id = ${A.id} AND phone = ${PH.f3}`);
    ok('… عضوٌ «منضمّ»', m3?.status === 'joined');
    const c2 = await F.claimJoinCode(bk.joinCode, { phone: PH.f4, name: 'آخر', playerId: null });
    ok('المقاعد على الرمز انتهت ⟵ يُرفض', !c2.ok, c2.text);
    ok('صاحب الحجز لا يأخذ مقعداً برمزه', !(await F.claimJoinCode(bk.joinCode, { phone: PH.o, name: 'أنا', playerId: null })).ok);
    const [cnt] = await q(sql`SELECT people_count FROM reservations WHERE id = ${res.id}`);
    ok('العدد لم يتغيّر (المرافق صار مسمّى)', Number(cnt.people_count) === 4);

    console.log('\n⑤ «اقبل دائماً من فلان» (ق١٧)');
    await F.setTrust(Number(P1.id), owner.playerId, true);
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, player_id, status, created_by, app_confirmed) VALUES (${B.id}, ${owner.name}, ${PH.o}, 1, ${O.id}, 'confirmed', 'player-app', true)`);
    const bk2: any = await F.bookForFriends(owner, { activityId: Number(B.id), keys: [k1!] });
    const [m4] = await q(sql`SELECT status FROM booking_group_members WHERE activity_id = ${B.id} AND player_id = ${P1.id}`);
    ok('يثق به ⟵ يُثبَّت بلا سؤال', bk2.ok && m4?.status === 'joined', JSON.stringify({ bk2: bk2.ok, m4 }));

    console.log('\n⑥ «مش أنا» يُخرج الرقم من القوائم (ق١٦)');
    await F.forgetPhoneEverywhere(PH.f2);
    fr = await F.friendsOf(owner.playerId);
    ok('حمزة خرج من قائمة صاحبه', !fr.friends.some((f) => f.name === 'حمزة'));
  } catch (e: any) { fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e); }
  finally { await cleanup(); }
  console.log(`\n${fail ? '❌' : '✅'} م٥ب: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
