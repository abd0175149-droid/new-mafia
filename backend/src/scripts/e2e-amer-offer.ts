// ══════════════════════════════════════════════════════
// 🧪 حالة عامر: حجزٌ لخمسة بمرافقين بلا أسماء على فعاليّةٍ بعرض «٢ بسعر ١» ⟵ رمز الانضمام يسمّي
//    المقاعد ويُعاد تقييم العرض على المسمَّين (٣ ⟵ واحدٌ ببلاش، ٥ ⟵ اثنان)، والمقاعد تُظهر المجّانيّ.
// ⚠️ نسخةٌ مؤقّتة فقط (mafia_m2test). فعاليّة 🧪. قاعدةٌ فقط.
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = '🧪 E2E-AMER';
const PH = ['0799999891', '0799999892', '0799999893', '0799999894', '0799999895'];
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
  for (const s of [sql`ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS weekdays JSONB DEFAULT '[]'::jsonb`, sql`ALTER TABLE booking_offers ADD COLUMN IF NOT EXISTS exclude_ids JSONB DEFAULT '[]'::jsonb`]) await db.execute(s);
  const inPh = sql.raw(`(${PH.map((p) => `'${p}'`).join(',')})`);
  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${TAG + '%'}`)) {
      for (const t of ['booking_events', 'booking_group_members', 'booking_groups', 'booking_join_codes', 'bookings', 'reservations']) await q(sql.raw(`DELETE FROM ${t} WHERE activity_id = ${a.id}`));
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM booking_offers WHERE name LIKE ${TAG + '%'}`);
    await q(sql`DELETE FROM players WHERE phone IN ${inPh}`);
  };
  await cleanup();
  try {
    const [loc] = await q(sql`SELECT id FROM locations WHERE COALESCE(is_test_location, false) = false AND deleted_at IS NULL ORDER BY id LIMIT 1`);
    const [A] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG}, NOW() + INTERVAL '20 hours', 3, 'planned', ${loc.id}) RETURNING id`);
    await q(sql`INSERT INTO booking_offers (name, status, group_size, pay_for, repeat, book_from, book_until, lead_hours, activity_ids, max_groups, per_customer, priority_hours, announce, notify_existing, created_by)
      VALUES (${TAG + ' اللمة'}, 'live', 2, 1, true, NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 days', 3, ${JSON.stringify([Number(A.id)])}::jsonb, 0, 1, 24, false, false, 'e2e')`);
    const [O] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH[0]}, 'عامر فحص', 'x') RETURNING id`);
    const [r] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, player_id, status, created_by, app_confirmed) VALUES (${A.id}, 'عامر فحص', ${PH[0]}, 5, ${O.id}, 'confirmed', 'player-app', true) RETURNING id`);
    await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, reservation_id) VALUES (${A.id}, 'عامر فحص', ${PH[0]}, 1, ${O.id}, 'player-app', ${r.id})`);

    let v = await S.seatsOf(Number(r.id));
    ok('قبل: ٥ مقاعد بـ١٥ د.أ بلا عرض', v?.due === 15 && !v?.seats.some((s) => s.pay === 'free'), JSON.stringify(v?.seats.map((s) => `${s.kind}:${s.pay}`)));
    const code = await F.createJoinCode(Number(r.id), 4);
    ok('رمزٌ لأربعة مقاعد', !!code);
    const c1 = await F.claimJoinCode(code!, { phone: PH[1], name: 'صديق ١', playerId: null });
    const c2 = await F.claimJoinCode(code!, { phone: PH[2], name: 'صديق ٢', playerId: null });
    let [g] = await q(sql`SELECT offer_id, promised_free FROM booking_groups WHERE reservation_id = ${r.id}`);
    ok('اثنان انضمّا ⟵ العرض على ٣: واحدٌ ببلاش', c1.ok && c2.ok && g?.offer_id != null && Number(g.promised_free) === 1, JSON.stringify(g));
    await F.claimJoinCode(code!, { phone: PH[3], name: 'صديق ٣', playerId: null });
    await F.claimJoinCode(code!, { phone: PH[4], name: 'صديق ٤', playerId: null });
    [g] = await q(sql`SELECT offer_id, promised_free FROM booking_groups WHERE reservation_id = ${r.id}`);
    ok('الأربعة انضمّوا ⟵ العرض على ٥: اثنان ببلاش', Number(g?.promised_free) === 2, JSON.stringify(g));
    v = await S.seatsOf(Number(r.id));
    ok('المقاعد: ٥ مسمّاة، اثنان «بالعرض»، والمستحقّ ٩ بدل ١٥', v?.seats.filter((s) => s.kind === 'friend').length === 4 && v?.seats.filter((s) => s.freeReason === 'group').length === 2 && v?.due === 9, JSON.stringify({ due: v?.due, seats: v?.seats.map((s) => `${s.kind}:${s.pay}`) }));
    const [p] = await q(sql`SELECT people_count FROM reservations WHERE id = ${r.id}`);
    ok('العدد بقي ٥', Number(p.people_count) === 5);
  } catch (e: any) { fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e); }
  finally { await cleanup(); }
  console.log(`\n${fail ? '❌' : '✅'} حالة عامر: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
