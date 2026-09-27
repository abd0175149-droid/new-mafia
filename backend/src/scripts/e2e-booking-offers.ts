// ══════════════════════════════════════════════════════
// 🧪 فحصٌ حيّ لعروض الحجز الجماعيّ («جيب صحابك») على القاعدة الحقيقيّة
// ══════════════════════════════════════════════════════
// معزول: مكانٌ وفعاليّةٌ وعرضٌ ولاعبون ومحادثةٌ مؤقّتة، وتنظيفٌ كامل في البداية
// (دفاعاً من تشغيلةٍ فاشلة) وفي النهاية. **لا رسالة حقيقيّة تخرج**: المحادثة
// المؤقّتة نافذتها مغلقة (sendMessage يرفض)، ومساعدو commitGroup بدائل تسجّل،
// والأرقام يُتحقَّق قبل البدء أنّها لا تخصّ أحداً (لا لاعب ولا محادثة ولا حجز).
// التشغيل: docker compose exec -T backend npx tsx src/scripts/e2e-booking-offers.ts
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = 'E2E-GROUP-OFFER';
const PH = { owner: '0799990101', f1: '0799990102', f2: '0799990103', f3: '0799990104', old: '0799990105', stranger: '0799990106' };
const ALL = Object.values(PH);
const API = `http://localhost:${process.env.PORT || 4000}`;

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(t: string) { console.log(`\n═══ ${t} ═══`); }

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const inPh = sql.raw(`(${ALL.map(p => `'${p}'`).join(',')})`);

  const S = await import('../services/booking-offers.service.js');
  const { countBookedPeople } = await import('../services/booking-count.service.js');
  const { mirrorBotReservationToBookings } = await import('../services/whatsapp-bot.service.js');
  const { buildAffinityPairs } = await import('../services/seat-affinity.service.js');
  const { pairKey, personKey } = await import('../game/seating/types.js');

  async function cleanup() {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    const ids = acts.map(a => Number(a.id));
    if (ids.length) {
      const arr = sql.raw(`ARRAY[${ids.join(',')}]::int[]`);
      await q(sql`DELETE FROM booking_group_members WHERE activity_id = ANY(${arr})`);
      await q(sql`DELETE FROM booking_groups WHERE activity_id = ANY(${arr})`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ANY(${arr})`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ANY(${arr})`);
      await q(sql`DELETE FROM activities WHERE id = ANY(${arr})`);
    }
    await q(sql`DELETE FROM booking_offers WHERE name LIKE ${'%' + TAG + '%'}`);
    await q(sql`DELETE FROM locations WHERE name LIKE ${'%' + TAG + '%'}`);
    const convs = await q(sql`SELECT id FROM wa_conversations WHERE phone IN ${inPh}`);
    for (const c of convs) await q(sql`DELETE FROM wa_messages WHERE conversation_id = ${c.id}`);
    await q(sql`DELETE FROM wa_conversations WHERE phone IN ${inPh}`);
    const pls = await q(sql`SELECT id FROM players WHERE phone IN ${inPh}`);
    for (const p of pls) {
      await q(sql`DELETE FROM player_notifications WHERE player_id = ${p.id}`).catch(() => {});
      await q(sql`DELETE FROM wa_customer_notes WHERE player_id = ${p.id}`).catch(() => {});
    }
    await q(sql`DELETE FROM players WHERE phone IN ${inPh}`);
  }

  // ── حارس: الأرقام لا تخصّ أحداً حقيقيّاً (قبل أيّ تنظيف — التنظيف يمحو ما يطابقها) ──
  const [clash] = await q(sql`
    SELECT (SELECT COUNT(*) FROM players WHERE phone IN ${inPh} AND name NOT LIKE ${'%' + TAG + '%'})::int
         + (SELECT COUNT(*) FROM wa_conversations WHERE phone IN ${inPh} AND COALESCE(display_name,'') NOT LIKE ${'%' + TAG + '%'})::int
         + (SELECT COUNT(*) FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.phone IN ${inPh} AND a.name NOT LIKE ${'%' + TAG + '%'})::int
         + (SELECT COUNT(*) FROM bookings b JOIN activities a ON a.id = b.activity_id WHERE b.phone IN ${inPh} AND a.name NOT LIKE ${'%' + TAG + '%'})::int AS n`);
  if (Number(clash?.n || 0) > 0) { console.error(`❌ أحد أرقام الفحص مستخدمٌ خارج الفحص (${clash.n}) — أُلغي`); process.exit(2); }
  await cleanup();
  try {

  // ══════════ التجهيز ══════════
  section('التجهيز');
  const [city] = await q(sql`SELECT id FROM cities WHERE is_active = true ORDER BY sort_order, id LIMIT 1`);
  const [loc] = await q(sql`INSERT INTO locations (name, city_id, region) VALUES (${'🧪 ' + TAG}, ${city?.id ?? null}, '') RETURNING id`);
  // بعيدةٌ في المستقبل: لو ظهرت في قائمةٍ خلال الثواني العشر فهي في آخرها
  const actDate = new Date(Date.now() + 400 * 24 * 3600e3);
  const [act] = await q(sql`INSERT INTO activities (name, date, status, location_id, base_price) VALUES (${'🧪 فحص آليّ ' + TAG}, ${actDate}, 'planned', ${loc.id}, '5') RETURNING id`);
  const A = Number(act.id);
  const mk = async (ph: string, name: string, extra = sql``) => (await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${ph}, ${name + ' ' + TAG}, 'x') RETURNING id`))[0];
  const pO = await mk(PH.owner, 'خالد'); const pF1 = await mk(PH.f1, 'عمر'); const pF3 = await mk(PH.f3, 'سامي');
  // محادثةُ صاحب المجموعة: **نافذتها مغلقة** (last_inbound_at فارغ) ⟵ أيّ sendMessage حقيقيّ يُرفض
  const [conv] = await q(sql`INSERT INTO wa_conversations (phone, wa_phone, display_name, player_id) VALUES (${PH.owner}, ${'962' + PH.owner.slice(1)}, ${'خالد ' + TAG}, ${pO.id}) RETURNING *`);
  const convObj = { id: Number(conv.id), phone: PH.owner, playerId: Number(pO.id), displayName: 'خالد', offersAnnounced: {} };
  const now = Date.now();
  const [offer] = await q(sql`INSERT INTO booking_offers (name, status, group_size, pay_for, repeat, book_from, book_until, lead_hours, activity_ids, max_groups, per_customer, priority_hours, announce, announce_text, notify_existing, created_by)
    VALUES (${'٢+١ ' + TAG}, 'live', 3, 2, true, ${new Date(now - 3600e3)}, ${new Date(now + 3600e3)}, 3, ${JSON.stringify([A])}::jsonb, 2, 1, 24, false, '', true, 'e2e') RETURNING id`);
  const O = Number(offer.id);
  ok('جُهّز مكانٌ وفعاليّةٌ (٥ د.أ) وعرضُ ٣ بسعر ٢ وثلاثة لاعبين ومحادثةٌ مغلقة النافذة', !!(loc?.id && A && O && pO?.id && conv?.id));

  const sent: any[] = []; const admins: any[] = [];
  const h = {
    sendMessage: async (m: any) => { sent.push(m); return {} as any; },
    notifyAdmins: async (...a: any[]) => { admins.push(a); },
    mirrorReservation: mirrorBotReservationToBookings as any,
  };

  // ══════════ ١. المحرّك على القاعدة ══════════
  section('١. التقييم');
  const e3 = await S.evaluateForCustomer({ activityId: A, people: 3, phone: PH.owner, playerId: Number(pO.id) });
  ok('٣ أشخاص ⟵ العرض ينطبق: واحد ببلاش، يدفعون ٢', e3.best?.offerId === O && e3.best?.free === 1 && e3.best?.pay === 2, JSON.stringify(e3.best));
  const e2 = await S.evaluateForCustomer({ activityId: A, people: 2, phone: PH.owner, playerId: Number(pO.id) });
  ok('شخصان ⟵ لا عرض، والبوت يقترح إضافة واحد', !e2.best && e2.nudge?.nudge?.need === 1, JSON.stringify(e2.nudge?.nudge));
  const facts = await S.offerFactsLines();
  ok('الحقائق الحيّة تذكر العرض ومعرّف الفعاليّة', facts.some(l => l.includes(TAG) && l.includes(`activity ${A}`)));
  const ann0 = await S.announcementFor(convObj, []);
  ok('العرض بلا إعلان ⟵ لا يُلحق بالردود', !ann0 || !ann0.text.includes(TAG));

  // ══════════ ٢. بطاقة الأسماء والأرقام ══════════
  section('٢. التخطيط');
  const plan: any = await S.planGroup({ activityId: A, ownerPhone: PH.owner, ownerPlayerId: Number(pO.id), ownerName: 'خالد', members: [
    { name: 'عمر', phone: '+962 79 999 0102' }, { name: 'فادي', phone: PH.f2 }, { name: 'غلط', phone: '12345' },
    { name: 'أنا', phone: PH.owner }, { name: 'عمر مكرّر', phone: PH.f1 },
  ] });
  ok('يُطبّع +962 ويقبل الصالحَين', plan.members?.filter((m: any) => m.ok).length === 2);
  ok('أسبابُ الرفض: رقم غير صالح · رقمك · مكرّر', ['رقم غير صالح', 'هذا رقمك', 'مكرّر'].every(r => plan.members.some((m: any) => !m.ok && String(m.reason).includes(r))));
  ok('الحجم ٣ ⟵ العرض في البطاقة', plan.people === 3 && plan.best?.free === 1);
  const lineOmar = plan.card.split('\n').find((l: string) => l.startsWith('• عمر ✓'));
  const lineFadi = plan.card.split('\n').find((l: string) => l.startsWith('• فادي ✓'));
  ok('🔒 صاحب الحساب والجديد يظهران بالعلامة نفسها (لا تعداد للحسابات)', !!lineOmar && !!lineFadi && lineOmar.replace('عمر', 'X') === lineFadi.replace('فادي', 'X'), `${lineOmar} | ${lineFadi}`);
  // الجملة العامّة عن «من ما عنده حساب» واحدةٌ للجميع فلا تكشف شيئاً؛ الممنوع اسمُ الحساب المسجّل
  ok('🔒 البطاقة بالأسماء التي كتبها صاحب الحجز لا بأسماء الحسابات', !plan.card.includes('عمر ' + TAG) && !plan.card.includes('خالد ' + TAG));

  // ══════════ ٣. التثبيت ══════════
  section('٣. التثبيت');
  const c1: any = await S.commitGroup({ conv: convObj, activityId: A, members: [{ name: 'عمر', phone: PH.f1 }, { name: 'فادي', phone: PH.f2 }], botTag: '🤖 بوت واتساب', contactMethod: 'بوت واتساب', h });
  ok('ثُبّتت المجموعة', c1.ok === true && !!c1.groupId, c1.text);
  const G = Number(c1.groupId);
  const [g1] = await q(sql`SELECT * FROM booking_groups WHERE id = ${G}`);
  ok('المجموعة: العرض + موعودٌ واحد + لقطة الشروط بالسعر', Number(g1.offer_id) === O && Number(g1.promised_free) === 1 && Number(g1.terms?.price) === 5 && g1.status === 'claimed');
  const [res1] = await q(sql`SELECT * FROM reservations WHERE activity_id = ${A} AND phone = ${PH.owner} AND deleted_at IS NULL`);
  ok('حجز المتابعة لصاحبها بثلاثة أشخاص ومربوطٌ بالمجموعة', Number(res1?.people_count) === 3 && Number(g1.reservation_id) === Number(res1?.id));
  const mem = await q(sql`SELECT * FROM booking_group_members WHERE group_id = ${G} ORDER BY id`);
  const mF1 = mem.find(m => m.phone === PH.f1), mF2 = mem.find(m => m.phone === PH.f2);
  ok('صديقٌ له حساب ⟵ «محجوز» بصفّ حجزٍ ورمز دعوة', mF1?.status === 'booked' && !!mF1?.booking_id && !!mF1?.invite_token);
  ok('صديقٌ جديد ⟵ «بانتظار» بلا صفّ', mF2?.status === 'pending' && !mF2?.booking_id);
  const [bF1] = await q(sql`SELECT * FROM bookings WHERE id = ${mF1?.booking_id}`);
  ok('صفّ الصديق بوسم المجموعة (لا يُحتسب ختماً قبل تأكيده) ومرتبط', bF1?.created_by === S.GROUP_BOOKING_TAG && Number(bF1?.group_id) === G);
  const [bO] = await q(sql`SELECT * FROM bookings WHERE activity_id = ${A} AND phone = ${PH.owner} AND deleted_at IS NULL`);
  ok('مرآة صاحب المجموعة في الحجوزات ومرتبطة', !!bO && Number(bO.group_id) === G);
  ok('لا رسالة واتساب للصديق (لا محادثة له) ولا لغيره', sent.length === 0, JSON.stringify(sent).slice(0, 200));
  ok('إبلاغ الإدارة', admins.length === 1);
  ok('العدّ = ٣ (لا يُعدّ الصديق مرّتين)', await countBookedPeople(A) === 3, String(await countBookedPeople(A)));
  const [col] = await q(sql`SELECT GREATEST(COALESCE(people_count,1) - 1 - (SELECT COUNT(*) FROM booking_group_members m JOIN booking_groups g ON g.id = m.group_id WHERE g.reservation_id = reservations.id AND g.status <> 'void' AND m.status IN ('booked','joined')), 0) AS c FROM reservations WHERE id = ${res1.id}`);
  ok('الطيّ عند الدخول يطوي المجهول وحده (١: فادي)', Number(col?.c) === 1);

  // ══════════ ٤. الدعوة العامّة ══════════
  section('٤. صفحة الدعوة /g');
  const gi = await fetch(`${API}/api/booking-offers/invite/${mF1.invite_token}`).then(r => r.json()).catch(() => null);
  ok('تُظهر الاسم الأوّل والفعاليّة', gi?.invite?.ownerFirstName === 'خالد' && gi?.invite?.activity?.name?.includes(TAG));
  ok('🔒 بلا أيّ رقم في الردّ', !JSON.stringify(gi || {}).match(/0799990\d{3}/));
  ok('رمزٌ مجهول ⟵ ٤٠٤', (await fetch(`${API}/api/booking-offers/invite/${'a'.repeat(32)}`)).status === 404);
  const acc = await fetch(`${API}/api/booking-offers/invite/${mF1.invite_token}/accept`, { method: 'POST' }).then(r => r.json()).catch(() => null);
  const [bF1b] = await q(sql`SELECT created_by FROM bookings WHERE id = ${mF1.booking_id}`);
  const [mF1b] = await q(sql`SELECT status FROM booking_group_members WHERE id = ${mF1.id}`);
  ok('«تمام، جاي» ⟵ أكّد، وصار صفّه حجز تطبيق (يُحتسب ختماً)', acc?.success && mF1b?.status === 'joined' && bF1b?.created_by === 'player-app');

  // ══════════ ٥. الصديق الجديد يحجز بنفس الرقم ══════════
  section('٥. الربط التلقائيّ');
  const [bF2] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, is_paid, paid_amount, created_by) VALUES (${A}, 'فادي', ${PH.f2}, 1, false, '0', 'player-app') RETURNING id`);
  const lk = await S.linkOnAppBooking({ playerId: null, phone: PH.f2, activityId: A, bookingId: Number(bF2.id) });
  const [mF2b] = await q(sql`SELECT status, booking_id FROM booking_group_members WHERE id = ${mF2.id}`);
  ok('يرتبط بالمجموعة تلقائيّاً', lk.linked && mF2b?.status === 'joined' && Number(mF2b?.booking_id) === Number(bF2.id));
  ok('العدّ ما زال ٣ بعد أن صار للصديق صفّ', await countBookedPeople(A) === 3, String(await countBookedPeople(A)));
  const replan: any = await S.planGroup({ activityId: A, ownerPhone: PH.owner, ownerPlayerId: Number(pO.id), ownerName: 'خالد', members: [{ name: 'عمر', phone: PH.f1 }] });
  ok('إعادة إرسال صديقٍ مسجّل ⟵ «(مسجّل)» ولا يُحسب مرّتين', replan.people === 3 && /عمر ✓ \(مسجّل\)/.test(replan.card), `${replan.people}`);

  // ══════════ ٦. إشارة الجلوس ══════════
  section('٦. الجلوس');
  const people = [
    { playerId: Number(pO.id), phone: PH.owner, name: 'خالد' }, { playerId: Number(pF1.id), phone: PH.f1, name: 'عمر' },
    { playerId: null, phone: PH.f2, name: 'فادي' }, { playerId: null, phone: PH.stranger, name: 'غريب' },
  ];
  const aff = await buildAffinityPairs({ activityId: A, people });
  ok('أفراد المجموعة الثلاثة زوجيّاً بوزن الحجز الجماعيّ', [[0, 1], [0, 2], [1, 2]].every(([i, j]) => (aff.get(pairKey(personKey(people[i]), personKey(people[j]))) ?? 0) >= 0.85));
  ok('الغريب بلا إشارة مجموعة', !aff.get(pairKey(personKey(people[0]), personKey(people[3]))));

  // ══════════ ٧. الحسم عند الباب ══════════
  section('٧. الحسم');
  const rows = await q(sql`SELECT id, phone FROM bookings WHERE group_id = ${G} AND deleted_at IS NULL ORDER BY id`);
  const idOf = (ph: string) => Number(rows.find(r => r.phone === ph)?.id);
  let st = await S.settleGroup(G, [idOf(PH.owner), idOf(PH.f1), idOf(PH.f2)], 'e2e');
  const free1 = await q(sql`SELECT id, phone, notes FROM bookings WHERE group_id = ${G} AND offer_free = true`);
  ok('حضر الثلاثة ⟵ واحد ببلاش، على صديقٍ لا صاحب المجموعة', st.ok && st.free === 1 && free1.length === 1 && free1[0].phone !== PH.owner);
  st = await S.settleGroup(G, [idOf(PH.owner), idOf(PH.f1), idOf(PH.f2)], 'e2e');
  const free2 = await q(sql`SELECT id, notes FROM bookings WHERE group_id = ${G} AND offer_free = true`);
  ok('إعادة الحسم ثابتة ولا تكرّر الملاحظة', free2.length === 1 && (String(free2[0].notes).match(/مجّانيّ بعرض/g) || []).length === 1);
  st = await S.settleGroup(G, [idOf(PH.owner), idOf(PH.f1)], 'e2e');
  ok('حضر اثنان ⟵ لا مجّانيّ (على الحضور الفعليّ)', st.free === 0 && (await q(sql`SELECT 1 FROM bookings WHERE group_id = ${G} AND offer_free = true`)).length === 0);
  await q(sql`UPDATE bookings SET is_free = true, is_paid = true WHERE id = ${idOf(PH.f1)}`);
  st = await S.settleGroup(G, [idOf(PH.owner), idOf(PH.f1), idOf(PH.f2)], 'e2e');
  ok('حسابٌ مجّانيّ لا يُكمل العدد ⟵ لا مجّانيّ', st.free === 0);
  await q(sql`UPDATE bookings SET is_free = false, is_paid = false WHERE id = ${idOf(PH.f1)}`);
  await q(sql`UPDATE bookings SET is_paid = true, paid_amount = '5' WHERE id IN (${idOf(PH.f1)}, ${idOf(PH.f2)})`);
  st = await S.settleGroup(G, [idOf(PH.owner), idOf(PH.f1), idOf(PH.f2)], 'e2e');
  const [paidF2] = await q(sql`SELECT is_paid, paid_amount, offer_free FROM bookings WHERE id = ${idOf(PH.f2)}`);
  ok('صفٌّ دُفع نقداً لا يُمحى دفعه ⟵ المجّانيّ على غير المدفوع', st.free === 1 && Number(paidF2.paid_amount) === 5 && !paidF2.offer_free && (st.freeIds || []).includes(idOf(PH.owner)));
  await q(sql`UPDATE bookings SET is_paid = false, paid_amount = '0' WHERE id IN (${idOf(PH.f1)}, ${idOf(PH.f2)})`);

  // ══════════ ٨. «مش أنا» والإلغاء ══════════
  section('٨. الرفض والإلغاء');
  const c2: any = await S.commitGroup({ conv: convObj, activityId: A, members: [{ name: 'سامي', phone: PH.f3 }], botTag: '🤖 بوت واتساب', contactMethod: 'بوت واتساب', h });
  const [g2] = await q(sql`SELECT declared_people, promised_free FROM booking_groups WHERE id = ${G}`);
  ok('إضافة صديقٍ رابع للمجموعة نفسها (ترقية) ⟵ ٤', c2.ok && Number(c2.groupId) === G && Number(g2.declared_people) === 4, c2.text);
  const [mF3] = await q(sql`SELECT * FROM booking_group_members WHERE group_id = ${G} AND phone = ${PH.f3}`);
  const dec = await fetch(`${API}/api/booking-offers/invite/${mF3.invite_token}/decline`, { method: 'POST' }).then(r => r.json()).catch(() => null);
  const [bF3] = await q(sql`SELECT deleted_at FROM bookings WHERE id = ${mF3.booking_id}`);
  const [g3] = await q(sql`SELECT declared_people FROM booking_groups WHERE id = ${G}`);
  const [res3] = await q(sql`SELECT people_count FROM reservations WHERE id = ${res1.id}`);
  ok('«مش أنا» ⟵ يُحذف حجزه وتصغر المجموعة والمتابعة', dec?.success && !!bF3?.deleted_at && Number(g3.declared_people) === 3 && Number(res3.people_count) === 3);
  ok('العدّ ٣ بعد الرفض', await countBookedPeople(A) === 3, String(await countBookedPeople(A)));
  await q(sql`UPDATE bookings SET deleted_at = NOW() WHERE id = ${idOf(PH.f2)}`);
  await S.onBookingDeleted(idOf(PH.f2));
  const [mF2c] = await q(sql`SELECT status FROM booking_group_members WHERE id = ${mF2.id}`);
  const [res4] = await q(sql`SELECT people_count FROM reservations WHERE id = ${res1.id}`);
  ok('صديقٌ ألغى حجزه ⟵ يخرج وتصغر المتابعة إلى ٢', mF2c?.status === 'removed' && Number(res4.people_count) === 2);
  ok('العدّ ٢', await countBookedPeople(A) === 2, String(await countBookedPeople(A)));

  // ══════════ ٩. إبلاغ الحاجزين مسبقاً (معاينة فقط) ══════════
  section('٩. إبلاغ الحاجزين');
  await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_at) VALUES (${A}, ${'نور ' + TAG}, ${PH.old}, 2, 'confirmed', ${new Date(now - 5 * 3600e3)})`);
  // صاحبُ المجموعة «حاجزٌ مسبق» أيضاً لو سبق حجزُه بدايةَ النافذة — نؤرّخه قبلها لنرى وسمه
  await q(sql`UPDATE reservations SET created_at = ${new Date(now - 6 * 3600e3)} WHERE id = ${res1.id}`);
  const pv: any = await S.notifyPreview(O);
  const rOld = pv.rows?.find((r: any) => r.phone === PH.old);
  ok('الحاجز المسبق يظهر «نافذته مغلقة» ولا تصله رسالة', rOld?.kind === 'closed' && !rOld?.qualifies);
  ok('رسالته: «لو صرتوا 3 بتدفعوا 2» بسعرها + الأولويّة + ذيل الإيقاف', /لو صرتوا 3 بتدفعوا 2 بس — 10 د\.أ بدل 15 د\.أ/.test(String(rOld?.message)) && /حاجز من قبل/.test(String(rOld?.message)) && /إيقاف/.test(String(rOld?.message)), String(rOld?.message).slice(0, 160));
  ok('صاحبُ المجموعة «في مجموعة»', pv.rows?.find((r: any) => r.phone === PH.owner)?.kind === 'in_group');
  const ns = await S.notifySend(O, 'e2e');
  ok('الإرسال يرفض حين لا نافذة مفتوحة', !ns.ok);

  // ══════════ ١٠. الإعلان ══════════
  section('١٠. الإعلان');
  await q(sql`UPDATE booking_offers SET announce = true WHERE id = ${O}`);
  const stranger = { id: -1, phone: PH.stranger, playerId: null, offersAnnounced: {} };
  const ann = await S.announcementFor(stranger, []);
  ok('من لا حجز له ⟵ نصُّ العرض بشروطه', !!ann && ann.text.includes('٢+١') && ann.text.includes('ابعتلي اسم ورقم') && ann.offerIds.includes(O));
  const annOld = await S.announcementFor({ id: -2, phone: PH.old, playerId: null, offersAnnounced: {} }, []);
  ok('الحاجز المسبق ⟵ صيغته بعدد حجزه', !!annOld && /لو صرتوا|صرتوا/.test(annOld.text), annOld?.text.slice(0, 100));
  const annDone = await S.announcementFor({ ...stranger, offersAnnounced: { [O]: new Date().toISOString() } }, []);
  ok('مرّةً لكلّ محادثة', !annDone || !annDone.offerIds.includes(O));

  // ══════════ ١١. ما لا يُعرض عليه ══════════
  section('١١. الاستثناءات');
  await q(sql`UPDATE locations SET is_test_location = true WHERE id = ${loc.id}`);
  const eT = await S.evaluateForCustomer({ activityId: A, people: 3, phone: PH.stranger });
  ok('موقع اختبار ⟵ لا عروض', !eT.best && eT.evals.length === 0);
  await q(sql`UPDATE locations SET is_test_location = false WHERE id = ${loc.id}`);
  await q(sql`UPDATE activities SET status = 'cancelled' WHERE id = ${A}`);
  const eC = await S.evaluateForCustomer({ activityId: A, people: 3, phone: PH.stranger });
  ok('فعاليّة ملغاة ⟵ لا عروض', !eC.best && eC.evals.length === 0);
  await q(sql`UPDATE activities SET status = 'planned' WHERE id = ${A}`);
  await q(sql`UPDATE booking_offers SET status = 'paused' WHERE id = ${O}`);
  const eP = await S.evaluateForCustomer({ activityId: A, people: 3, phone: PH.stranger });
  ok('عرضٌ موقوف ⟵ لا ينطبق', !eP.best);
  await q(sql`UPDATE booking_offers SET status = 'live' WHERE id = ${O}`);

  // ══════════ ١٢. إلغاء صاحب المجموعة ══════════
  section('١٢. إلغاء صاحب المجموعة');
  await q(sql`UPDATE reservations SET deleted_at = NOW() WHERE id = ${res1.id}`);
  await S.onReservationDeleted(Number(res1.id));
  const [gV] = await q(sql`SELECT status FROM booking_groups WHERE id = ${G}`);
  const [bF1c] = await q(sql`SELECT deleted_at, group_id FROM bookings WHERE id = ${idOf(PH.f1)}`);
  ok('المجموعة تبطل، وحجز الصديق يبقى مستقلّاً بلا رابط', gV?.status === 'void' && !bF1c?.deleted_at && bF1c?.group_id == null);

  // ══════════ ١٣. المحو بعد ٧ أيّام ══════════
  section('١٣. الاحتفاظ');
  await q(sql`INSERT INTO booking_groups (activity_id, owner_phone, owner_name, status, source, declared_people) VALUES (${A}, ${PH.stranger}, 'x', 'claimed', 'bot', 2) RETURNING id`);
  const [g9] = await q(sql`SELECT id FROM booking_groups WHERE activity_id = ${A} AND owner_phone = ${PH.stranger}`);
  await q(sql`INSERT INTO booking_group_members (group_id, activity_id, name, phone, status) VALUES (${g9.id}, ${A}, 'مجهول', '0799990107', 'pending')`);
  await q(sql`UPDATE activities SET date = NOW() - INTERVAL '8 days' WHERE id = ${A}`);
  await S.purgeStaleMembers();
  const [mP] = await q(sql`SELECT phone, status FROM booking_group_members WHERE group_id = ${g9.id}`);
  ok('رقم صديقٍ لم يرتبط يُمحى بعد ٧ أيّام من الفعاليّة', mP?.phone == null && mP?.status === 'removed');

  } finally {
    await cleanup();   // حتّى لو انهار الفحص: لا تبقى فعاليّةٌ مؤقّتة ظاهرة
  }
  const [left] = await q(sql`SELECT (SELECT COUNT(*) FROM activities WHERE name LIKE ${'%' + TAG + '%'})::int + (SELECT COUNT(*) FROM players WHERE phone IN ${inPh})::int + (SELECT COUNT(*) FROM booking_offers WHERE name LIKE ${'%' + TAG + '%'})::int AS n`);
  ok('التنظيف كامل', Number(left?.n) === 0);

  console.log(`\n${'─'.repeat(46)}\nنجح ${pass} · فشل ${fail}`);
  if (fail) { console.log('\nالإخفاقات:'); failures.forEach(f => console.log(' • ' + f)); }
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('💥', e);
  process.exit(1);
});
