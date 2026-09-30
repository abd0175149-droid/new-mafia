// ══════════════════════════════════════════════════════
// 🧪 فحصٌ حيّ لـ«سعر الدون المبكّر» والغياب على القاعدة الحقيقيّة
// ══════════════════════════════════════════════════════
// معزول: موقع **اختبار** مؤقّت (فالخادم الحيّ لا يعرض فعاليّاته ولا يسعّرها ولا يحكم
// بغيابها)، ومتغيّر EARLY_PRICE_E2E_LOCATION_ID في هذه العمليّة وحدها يجعله حقيقيّاً
// للمحرّك هنا. محادثةٌ مغلقة النافذة فلا رسالة تخرج، وأرقامٌ يُتحقَّق أنّها لا تخصّ أحداً،
// وتنظيفٌ مضمون حتّى عند الانهيار.
// التشغيل: docker compose exec -T backend npx tsx src/scripts/e2e-early-price.ts
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = 'E2E-EARLY-PRICE';
const PH = { O: '0799990301', N: '0799990302', F: '0799990303', S: '0799990304', X: '0799990305', Z: '0799990399' };
const ALL = Object.values(PH);
const API = `http://localhost:${process.env.PORT || 4000}`;
const H = 3600e3;
let pass = 0, fail = 0; const failures: string[] = [];
function ok(name: string, cond: boolean, extra: any = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${extra !== '' ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); console.log(`  ❌ ${name}`, extra); }
}
const section = (t: string) => console.log(`\n═══ ${t} ═══`);

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const inPh = sql.raw(`(${ALL.map(p => `'${p}'`).join(',')})`);

  async function cleanup() {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    const ids = acts.map(a => Number(a.id));
    if (ids.length) {
      const arr = sql.raw(`ARRAY[${ids.join(',')}]::int[]`);
      await q(sql`DELETE FROM no_show_strikes WHERE activity_id = ANY(${arr})`);
      const ss = await q(sql`SELECT id FROM sessions WHERE activity_id = ANY(${arr})`);
      for (const s of ss) { await q(sql`DELETE FROM session_players WHERE session_id = ${s.id}`); await q(sql`DELETE FROM matches WHERE session_id = ${s.id}`); }
      await q(sql`DELETE FROM sessions WHERE activity_id = ANY(${arr})`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ANY(${arr})`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ANY(${arr})`);
      await q(sql`DELETE FROM activities WHERE id = ANY(${arr})`);
    }
    await q(sql`DELETE FROM no_show_strikes WHERE phone IN ${inPh}`);
    await q(sql`DELETE FROM early_price_promos WHERE created_by = 'e2e-early-price'`);
    await q(sql`DELETE FROM locations WHERE name LIKE ${'%' + TAG + '%'}`);
    const convs = await q(sql`SELECT id FROM wa_conversations WHERE phone IN ${inPh}`);
    for (const c of convs) await q(sql`DELETE FROM wa_messages WHERE conversation_id = ${c.id}`);
    await q(sql`DELETE FROM wa_conversations WHERE phone IN ${inPh}`);
    const pls = await q(sql`SELECT id FROM players WHERE phone IN ${inPh}`);
    for (const p of pls) await q(sql`DELETE FROM player_notifications WHERE player_id = ${p.id}`).catch(() => {});
    await q(sql`DELETE FROM players WHERE phone IN ${inPh}`);
  }

  // ── حارس: الأرقام لا تخصّ أحداً حقيقيّاً ──
  const [clash] = await q(sql`
    SELECT (SELECT COUNT(*) FROM players WHERE phone IN ${inPh} AND name NOT LIKE ${'%' + TAG + '%'})::int
         + (SELECT COUNT(*) FROM wa_conversations WHERE phone IN ${inPh} AND COALESCE(display_name,'') NOT LIKE ${'%' + TAG + '%'})::int
         + (SELECT COUNT(*) FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.phone IN ${inPh} AND a.name NOT LIKE ${'%' + TAG + '%'})::int
         + (SELECT COUNT(*) FROM bookings b JOIN activities a ON a.id = b.activity_id WHERE b.phone IN ${inPh} AND a.name NOT LIKE ${'%' + TAG + '%'})::int AS n`);
  if (Number(clash?.n || 0) > 0) { console.error(`❌ أحد أرقام الفحص مستخدمٌ خارج الفحص (${clash.n}) — أُلغي`); process.exit(2); }
  await cleanup();

  // ── الموقع أوّلاً، ثمّ المتغيّر، ثمّ تحميل الخدمات (تقرأ المتغيّر عند تحميلها) ──
  const [city] = await q(sql`SELECT id FROM cities WHERE is_active = true ORDER BY sort_order, id LIMIT 1`);
  const [loc] = await q(sql`INSERT INTO locations (name, city_id, region, is_test_location) VALUES (${'🧪 ' + TAG}, ${city?.id ?? null}, '', true) RETURNING id`);
  process.env.EARLY_PRICE_E2E_LOCATION_ID = String(loc.id);
  const E = await import('../services/early-price.service.js');
  const L = await import('../services/loyalty.service.js');
  const { mirrorBotReservationToBookings } = await import('../services/whatsapp-bot.service.js');

  try {
    section('التجهيز');
    const now = Date.now();
    const mkAct = async (label: string, at: number, status = 'planned') =>
      Number((await q(sql`INSERT INTO activities (name, date, status, location_id, base_price) VALUES (${'🧪 ' + label + ' ' + TAG}, ${new Date(at)}, ${status}, ${loc.id}, '3') RETURNING id`))[0].id);
    const A1 = await mkAct('بعد ٣ أيّام', now + 72 * H), A2 = await mkAct('بعد ١٠ ساعات', now + 10 * H), A3 = await mkAct('بعد ٥ أيّام', now + 120 * H);
    const A4 = await mkAct('بعد ٣ ساعات', now + 3 * H), A6 = await mkAct('بعد ٤ أيّام', now + 96 * H), A0 = await mkAct('انتهت', now - 10 * H, 'completed');
    const mkP = async (ph: string, name: string, free = false) =>
      (await q(sql`INSERT INTO players (phone, name, password_hash, is_free_account) VALUES (${ph}, ${name + ' ' + TAG}, 'x', ${free}) RETURNING id`))[0];
    const pO = await mkP(PH.O, 'خالد'), pF = await mkP(PH.F, 'فرح', true), pS = await mkP(PH.S, 'سامي');
    await q(sql`INSERT INTO wa_conversations (phone, wa_phone, display_name, player_id) VALUES (${PH.O}, ${'962' + PH.O.slice(1)}, ${'خالد ' + TAG}, ${pO.id})`);   // نافذةٌ مغلقة
    // جلسةٌ منتهية بمباراة لـ A0 (فعاليّةٌ «جرت»)
    const [ses] = await q(sql`INSERT INTO sessions (session_name, session_code, activity_id, is_active, status) VALUES (${TAG}, ${'E2E' + String(now).slice(-5)}, ${A0}, false, 'closed') RETURNING id`);
    await q(sql`INSERT INTO matches (session_id, room_id, room_code, game_name, player_count) VALUES (${ses.id}, ${'e2e-room-' + now}, 'E2E', ${TAG}, 6)`);
    await q(sql`INSERT INTO session_players (session_id, physical_id, player_name, phone) VALUES (${ses.id}, 1, 'خالد', ${PH.O})`);
    const [promo] = await q(sql`INSERT INTO early_price_promos (name, status, mode, value, lead_hours, act_from, act_until, scope, activity_ids, announce, created_by)
      VALUES (${'سعر الفحص ' + TAG}, 'draft', 'fixed', '2', 24, ${new Date(now - 2 * 24 * H)}, ${new Date(now + 30 * 24 * H)}, 'acts', ${JSON.stringify([A0, A1, A2, A3, A4, A6])}::jsonb, true, 'e2e-early-price') RETURNING id`);
    const PID = Number(promo.id);
    E.invalidateEarlyCache();
    ok('فعاليّات في موقع اختبار + لاعبون + جلسة منتهية + عرض مسودة', !!(A1 && A0 && pO?.id && PID));

    const mkRes = async (act: number, ph: string, playerId: number | null, createdBy: string, people = 1, at = Date.now(), status = 'confirmed', appConfirmed = false) =>
      (await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, player_id, status, created_by, created_at, app_confirmed)
        VALUES (${act}, ${'ح ' + TAG}, ${ph}, ${people}, ${playerId}, ${status}, ${createdBy}, ${new Date(at)}, ${appConfirmed}) RETURNING *`))[0];

    // ══════════ ١. التفعيل بأثرٍ رجعيّ ══════════
    section('١. التفعيل بأثرٍ رجعيّ (بمعاينة)');
    const rO1 = await mkRes(A1, PH.O, pO.id, E.BOT_SELF_TAG, 2, now - H);
    await mirrorBotReservationToBookings(db, { id: rO1.id, activityId: A1, playerId: pO.id, phone: PH.O, contactName: 'خالد' }, E.BOT_SELF_TAG);
    const rN1 = await mkRes(A3, PH.N, null, E.BOT_ADMIN_TAG, 1, now - H);
    await mkRes(A1, PH.X, null, 'المدير العام', 1, now - H);
    const pv: any = await E.activationPreview(PID);
    const pvO = pv.rows.find((r: any) => r.reservationId === rO1.id), pvN = pv.rows.find((r: any) => r.reservationId === rN1.id);
    ok('المعاينة: حجز الدون المبكّر ⟵ ٣→٢ ويسقط ختمه (حساب مسجَّل)', pvO?.from === 3 && pvO?.to === 2 && pvO?.losesStamp === true, pvO);
    ok('المعاينة: حجز الأدمن لرقمٍ جديد ⟵ يدخل (قرار المالك) بلا ختمٍ يسقط', !!pvN && pvN.losesStamp === false, pvN);
    ok('المعاينة: إدخال الداشبورد لا يدخل', !pv.rows.some((r: any) => r.phone === PH.X));
    const act: any = await E.activate(PID, 'e2e', true);
    const [rO1b] = await q(sql`SELECT unit_price, price_promo_id, promo_seats FROM reservations WHERE id = ${rO1.id}`);
    const [bO] = await q(sql`SELECT id, unit_price FROM bookings WHERE activity_id = ${A1} AND phone = ${PH.O} AND deleted_at IS NULL`);
    ok('التفعيل طبّق على الحجزين', act.ok && act.applied === 2, act);
    ok('متابعة خالد: ٢ د.أ لمقعدين', Number(rO1b.unit_price) === 2 && Number(rO1b.price_promo_id) === PID && Number(rO1b.promo_seats) === 2, rO1b);
    ok('صفّ حجز خالد مقفولٌ أيضاً', Number(bO?.unit_price) === 2);
    await q(sql`UPDATE early_price_promos SET activated_at = ${new Date(now - 3 * 24 * H)} WHERE id = ${PID}`);   // ليُحكم بغياب A0
    E.invalidateEarlyCache();

    // ══════════ ٢. الحكم ══════════
    section('٢. الحكم لحظة الحجز');
    const q1 = await E.earlyQuote({ activityId: A1, phone: PH.S, playerId: pS.id, channel: 'bot' });
    ok('الدون قبل ٧٢ ساعة ⟵ ٢ بدل ٣', q1.best?.price === 2 && q1.best?.base === 3, q1.best);
    const q2 = await E.earlyQuote({ activityId: A2, phone: PH.S, playerId: pS.id, channel: 'bot' });
    ok('قبل ١٠ ساعات ⟵ فات الموعد', !q2.best && !!q2.nearest?.reasons.some(r => r.code === 'lead'));
    ok('التطبيق ⟵ لا', !(await E.earlyQuote({ activityId: A1, phone: PH.S, playerId: pS.id, channel: 'app' })).best);
    ok('الأدمن عبر البوت ⟵ نعم', !!(await E.earlyQuote({ activityId: A1, phone: PH.S, playerId: pS.id, channel: 'admin' })).best);
    ok('الحساب المجّانيّ ⟵ لا يُسجَّل عرض', !(await E.earlyQuote({ activityId: A1, phone: PH.F, playerId: pF.id, channel: 'bot' })).best);

    // ══════════ ٣. حجزٌ جديد يُقفل ══════════
    section('٣. القفل لحظة الحجز');
    const rS3 = await mkRes(A3, PH.S, pS.id, E.BOT_SELF_TAG, 1);
    const ap3 = await E.applyOnNewReservation(rS3.id);
    ok('حجز سامي عبر الدون ⟵ مقفول ٢', ap3.applied && ap3.price === 2, ap3);

    // ══════════ ٤. كلّ قراءات المال ══════════
    section('٤. السعر في كلّ مكان');
    ok('سعر صفّ خالد = ٢', (await E.entryPriceForBooking(bO.id)) === 2);
    const [bN] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, is_paid, paid_amount, created_by) VALUES (${A3}, 'جديد', ${PH.N}, 1, false, '0', 'النظام (Auto-Sync)') RETURNING id`);
    ok('صفٌّ أنشأه الباب لاحقاً يرث السعر من المتابعة', (await E.entryPriceForBooking(bN.id)) === 2);
    const [bX] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, is_paid, paid_amount, created_by) VALUES (${A1}, 'آخر', ${PH.X}, 1, false, '0', 'المدير العام') RETURNING id`);
    ok('بلا قفل ⟵ سعر الفعاليّة حرفيّاً', (await E.entryPriceForBooking(bX.id)) === 3);
    const [adm] = await q(sql`SELECT id, username, display_name FROM staff WHERE role = 'admin' AND COALESCE(is_active, true) = true ORDER BY id LIMIT 1`);
    const { generateToken } = await import('../middleware/auth.js');
    const tok = generateToken({ id: adm.id, username: adm.username, role: 'admin', displayName: adm.display_name || adm.username });
    const list: any[] = await fetch(`${API}/api/bookings?activityId=${A1}`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    ok('قائمة الحجوزات (الخادم الحيّ): خالد ٢، والآخر بلا قفل', Number(list.find(b => b.id === bO.id)?.unitPrice) === 2 && list.find(b => b.id === bX.id)?.unitPrice == null);
    const srv: any = await fetch(`${API}/api/early-price`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    const mine = (srv.offers || []).find((o: any) => o.id === PID);
    ok('🔒 الخادم الحيّ لا يرى فعاليّات الفحص (موقع اختبار)', !!mine && (mine.covered || []).length === 0, mine?.covered);

    // ══════════ ٥. الولاء ══════════
    section('٥. الولاء');
    const cfg = await L.getLoyaltyConfig();
    const j = L.judgeBooking(cfg, await L.bookingFor(A1, pO.id, PH.O));
    ok('من أخذ السعر ⟵ حكمه «promo» لا ختم', j.verdict === 'promo', j);
    ok('حجز الأدمن عبر البوت ⟵ قناةٌ مقبولة للختم', L.channelAccepts({ ...cfg, channel: 'app_bot' }, L.BOT_ADMIN_BOOKING_TAG));

    // ══════════ ٦. تعديل العدد والنقل ══════════
    section('٦. التعديل والنقل');
    await q(sql`UPDATE reservations SET people_count = 3 WHERE id = ${rO1.id}`); await E.onPeopleChanged(rO1.id, 3);
    ok('زاد قبل الموعد ⟵ ٣ مقاعد مبكّرة', Number((await q(sql`SELECT promo_seats FROM reservations WHERE id = ${rO1.id}`))[0].promo_seats) === 3);
    await q(sql`UPDATE activities SET date = ${new Date(now + 10 * H)} WHERE id = ${A1}`);
    await q(sql`UPDATE reservations SET people_count = 5 WHERE id = ${rO1.id}`); await E.onPeopleChanged(rO1.id, 5);
    const [r5] = await q(sql`SELECT promo_seats, unit_price FROM reservations WHERE id = ${rO1.id}`);
    ok('زاد بعد الموعد ⟵ المضافان بالسعر العاديّ (٣×٢ + ٢×٣ = ١٢)', Number(r5.promo_seats) === 3 && E.reservationTotal(5, 3, { unitPrice: Number(r5.unit_price), promoSeats: Number(r5.promo_seats) }) === 12, r5);
    await q(sql`UPDATE activities SET date = ${new Date(now + 72 * H)} WHERE id = ${A1}`);
    await q(sql`UPDATE reservations SET activity_id = ${A2} WHERE id = ${rS3.id}`); await E.onReservationMoved(rS3.id);
    ok('نُقل إلى فعاليّةٍ بعد ١٠ ساعات ⟵ يسقط السعر', (await q(sql`SELECT unit_price FROM reservations WHERE id = ${rS3.id}`))[0].unit_price == null);
    await q(sql`UPDATE reservations SET activity_id = ${A3} WHERE id = ${rS3.id}`); await E.onReservationMoved(rS3.id);
    ok('أُعيد إلى فعاليّةٍ بعد ٥ أيّام ⟵ يعود ٢', Number((await q(sql`SELECT unit_price FROM reservations WHERE id = ${rS3.id}`))[0].unit_price) === 2);

    // ══════════ ٧. الغياب ══════════
    section('٧. الغياب فور النهاية');
    const rS0 = await mkRes(A0, PH.S, pS.id, E.BOT_SELF_TAG, 1, now - 3 * 24 * H);
    await mkRes(A0, PH.O, pO.id, E.BOT_SELF_TAG, 1, now - 3 * 24 * H);               // دخل الغرفة برقمه
    await mkRes(A0, PH.X, null, 'المدير العام', 1, now - 3 * 24 * H);                  // إدخال موظّف
    await mkRes(A0, PH.F, pF.id, 'player-app', 1, now - 3 * 24 * H, 'pending', false);  // ألغى من التطبيق
    const jn = await E.judgeNoShows(A0, { force: true });
    const st0 = await q(sql`SELECT * FROM no_show_strikes WHERE activity_id = ${A0}`);
    ok('غيابٌ واحد: سامي وحده', jn.judged && jn.strikes === 1 && st0.length === 1 && st0[0].phone === PH.S, st0);
    ok('حجزه عُلّم «لم يحضر»', (await q(sql`SELECT attended FROM reservations WHERE id = ${rS0.id}`))[0].attended === false);
    ok('الحكم مرّةً واحدة', (await E.judgeNoShows(A0, { force: true })).strikes === 0);

    // ══════════ ٨. الاستهلاك والتصحيح ══════════
    section('٨. العقوبة والتصحيح');
    const rS1 = await mkRes(A1, PH.S, pS.id, E.BOT_SELF_TAG, 2);
    const ap1 = await E.applyOnNewReservation(rS1.id);
    ok('حجزه التالي المؤهَّل ⟵ بالسعر العاديّ ويُستهلك الغياب', !ap1.applied && !!ap1.penalized, ap1);
    const [c1] = await q(sql`SELECT status, consumed_by_reservation_id FROM no_show_strikes WHERE id = ${st0[0].id}`);
    ok('الغياب «استُهلك» بهذا الحجز', c1.status === 'consumed' && Number(c1.consumed_by_reservation_id) === rS1.id);
    ok('حجزه الذي بعده يعود له العرض', !!(await E.earlyQuote({ activityId: A6, phone: PH.S, playerId: pS.id, channel: 'bot' })).best);
    const wv = await E.waiveStrikes({ reservationId: rS0.id }, 'e2e');
    ok('«حضر» ⟵ يُلغى الغياب ويعود السعر المبكّر إلى الحجز الذي استهلكه', wv.waived === 1 && wv.restored === 1 && Number((await q(sql`SELECT unit_price FROM reservations WHERE id = ${rS1.id}`))[0].unit_price) === 2, wv);
    ok('وحجز الغياب صار «حضر»', (await q(sql`SELECT attended FROM reservations WHERE id = ${rS0.id}`))[0].attended === true);

    // ══════════ ٩. الإلغاء المتأخّر ══════════
    section('٩. الإلغاء المتأخّر');
    const rS4 = await mkRes(A4, PH.S, pS.id, E.BOT_SELF_TAG, 1, now - 24 * H);
    await q(sql`UPDATE reservations SET deleted_at = NOW() WHERE id = ${rS4.id}`);
    await E.onReservationCancelled(rS4.id, { byCustomer: true });
    ok('ألغى قبل اللعبة بـ٣ ساعات ⟵ غياب', (await q(sql`SELECT kind, status FROM no_show_strikes WHERE reservation_id = ${rS4.id}`))[0]?.kind === 'late_cancel');
    const rS6 = await mkRes(A6, PH.S, pS.id, E.BOT_SELF_TAG, 1);
    const ap6 = await E.applyOnNewReservation(rS6.id);
    ok('حجزه التالي يستهلكه', !ap6.applied && !!ap6.penalized);
    await q(sql`UPDATE reservations SET deleted_at = NOW() WHERE id = ${rS6.id}`);
    await E.onReservationCancelled(rS6.id, { byCustomer: false });
    ok('إلغاء الحجز الذي استهلكه ⟵ يعود الغياب قائماً (لا مهرب بالحجز والإلغاء)', (await q(sql`SELECT status FROM no_show_strikes WHERE reservation_id = ${rS4.id}`))[0]?.status === 'active');
    const rX = await mkRes(A4, PH.X, null, 'المدير العام', 1, now - 24 * H);
    await E.onReservationCancelled(rX.id, { byCustomer: true });
    ok('إلغاء إدخال موظّف ⟵ ليس غياباً', !(await q(sql`SELECT 1 FROM no_show_strikes WHERE reservation_id = ${rX.id}`)).length);

    // ══════════ ١٠. البوت: الإعلان والشارات ══════════
    section('١٠. البوت');
    const ann = await E.earlyAnnouncementFor({ id: -1, phone: PH.Z, playerId: null, offersAnnounced: {} });
    ok('الإعلان: الاسم والسعر والمهلة', !!ann && ann.text.includes(TAG) && ann.text.includes('2 د.أ') && ann.text.includes('24 ساعة'), ann?.text);
    ok('مرّةً لكلّ محادثة', !(await E.earlyAnnouncementFor({ id: -1, phone: PH.Z, playerId: null, offersAnnounced: { [`ep:${PID}`]: 'x' } })));
    const bd = await E.earlyBadgesFor([A1, A2]);
    ok('شارة «💸 ٢ د.أ حتّى…» للمفتوحة فقط', bd.has(A1) && !bd.has(A2) && bd.get(A1)!.tag.startsWith('💸'));
    ok('الحقائق الحيّة تذكره', (await E.earlyFactsLines()).some(l => l.includes(TAG) && l.includes(`activity ${A1}`)));

    // ══════════ ١١. تدخّل الأدمن ══════════
    section('١١. تدخّل الأدمن');
    await E.setBookingEarly(bO.id, false);
    ok('إزالة يدويّة ⟵ سعر الفعاليّة', (await E.entryPriceForBooking(bO.id)) === 3);
    const on = await E.setBookingEarly(bO.id, true);
    ok('تطبيق يدويّ ⟵ ٢', on.ok && (await E.entryPriceForBooking(bO.id)) === 2);
    await q(sql`UPDATE early_price_promos SET status = 'paused' WHERE id = ${PID}`); E.invalidateEarlyCache();
    ok('الإيقاف: لا حجز جديد، والمقفول يبقى', !(await E.earlyQuote({ activityId: A1, phone: PH.Z, playerId: null, channel: 'bot' })).best && (await E.entryPriceForBooking(bO.id)) === 2);
  } finally {
    await cleanup();   // حتّى لو انهار الفحص
  }
  const [left] = await q(sql`SELECT (SELECT COUNT(*) FROM activities WHERE name LIKE ${'%' + TAG + '%'})::int + (SELECT COUNT(*) FROM players WHERE phone IN ${inPh})::int
    + (SELECT COUNT(*) FROM early_price_promos WHERE created_by = 'e2e-early-price')::int + (SELECT COUNT(*) FROM no_show_strikes WHERE phone IN ${inPh})::int AS n`);
  ok('التنظيف كامل', Number(left?.n) === 0);
  console.log(`\n${'─'.repeat(46)}\nنجح ${pass} · فشل ${fail}`);
  if (fail) { console.log('\nالإخفاقات:'); failures.forEach(f => console.log(' • ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('💥', e); process.exit(1); });
