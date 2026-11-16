// ══════════════════════════════════════════════════════
// 🧪 حجزٌ سبق الحساب (2026-11-16) — على الإنتاج في موقع الاختبار، بلا إشعارات
// الدوالّ نفسها التي تناديها مسارات اللاعب (القائمة · «احجز» · الغرف المفتوحة) ومسارات
// إنشاء الحساب — لا تُستدعى المسارات لأنّها ترسل إشعاراتٍ وتحتاج رمز لاعب.
// تشغيل: docker exec mafia-prod-backend-1 npx tsx src/scripts/e2e-booking-link.ts
// ══════════════════════════════════════════════════════
import { and, eq, isNull, sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { bookings } from '../schemas/admin.schema.js';
import { ensureReservationForBooking } from '../services/reservation-booking.service.js';
import { countBookedPeopleBatch } from '../services/booking-count.service.js';
import { phoneWritings, ownBookingCond, linkPhoneBookings, listPlayerBookings, claimPhoneBooking } from '../services/booking-link.service.js';

const LOC = 3;
const TAG = 'E2E-BOOKING-LINK';
const PH = { a: '0799999971', b: '0799999972', c: '0799999973', d: '0799999974', dAlt: '799999974' };
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
    await q(sql`DELETE FROM players WHERE phone IN (${PH.a}, ${PH.b}, ${PH.c}, ${PH.d}, ${PH.dAlt})`);
  };
  await cleanup();
  try {
    const mkAct = async (suffix: string, status: string) => (await q(sql`INSERT INTO activities (name, date, base_price, status, location_id)
      VALUES (${TAG + ' ' + suffix}, NOW() + INTERVAL '2 days', 3.00, ${status}, ${LOC}) RETURNING id`))[0];
    const mkPlayer = async (phone: string, name: string) =>
      (await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${phone}, ${name}, 'x') RETURNING id`))[0];
    const book = async (actId: number, name: string, phone: string, playerId: number | null) =>
      (await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
        VALUES (${actId}, ${name}, ${phone}, 1, ${playerId}, 'موظّف الفحص', false, false) RETURNING *`))[0];
    const bkRow = async (id: number) => (await q(sql`SELECT player_id, deleted_at FROM bookings WHERE id = ${id}`))[0];
    const resOf = async (actId: number, phone: string) => q(sql`SELECT player_id FROM reservations WHERE activity_id = ${actId} AND phone = ${phone} AND deleted_at IS NULL`);
    // «المنع» كما يسأله POST /book
    const blocked = async (actId: number, pid: number, phone: string) => (await db.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.activityId, actId), isNull(bookings.deletedAt), ownBookingCond(pid, phone))).limit(1)).length > 0;

    const act = await mkAct('قائمة', 'planned');
    const act2 = await mkAct('ثانية', 'planned');
    const done = await mkAct('منتهية', 'completed');
    const seats = async () => (await countBookedPeopleBatch([act.id])).get(act.id);

    console.log('\n═══ ٠ · كتابات الرقم ═══');
    const w = phoneWritings(PH.a);
    ok('الصيغ الخمس كلّها', ['0799999971', '799999971', '962799999971', '+962799999971', '00962799999971'].every(x => w.includes(x)), w.join(' '));
    ok('كتابةٌ بمسافاتٍ ورمز دوليّ تُردّ للرقم نفسه', phoneWritings('+962 79 999 9971').includes(PH.a));
    ok('أرقامٌ عربيّة تُردّ للرقم نفسه', phoneWritings('٠٧٩٩٩٩٩٩٧١').includes(PH.a));
    ok('الفارغ والقصير لا يطابقان شيئاً', phoneWritings('').length === 0 && phoneWritings(null).length === 0 && phoneWritings('12').length === 0);

    console.log('\n═══ ١ · حجزٌ سبق الحساب ⟵ إنشاء الحساب يربطه ═══');
    const b1 = await book(act.id, 'ضيف أ', PH.a, null);
    await ensureReservationForBooking(db, { ...b1, activityId: b1.activity_id, playerId: null }, { createdBy: 'موظّف الفحص' });
    const pa = await mkPlayer(PH.a, 'فحص الربط أ');
    ok('الخلل القديم قائمٌ قبل الربط: «احجز» يمنعه…', await blocked(act.id, pa.id, PH.a));
    ok('…والقائمة بالحساب وحده لا تعرض حجزه', (await listPlayerBookings(pa.id)).length === 0);
    const seats0 = await seats();
    const l1 = await linkPhoneBookings(pa.id, PH.a);
    ok('رُبط حجزٌ واحد ومتابعةٌ واحدة', l1.bookings.length === 1 && l1.bookings[0] === Number(b1.id) && l1.reservations.length === 1, JSON.stringify(l1));
    ok('صفّ الحجز صار لحسابه', Number((await bkRow(b1.id)).player_id) === pa.id);
    ok('صفّ المتابعة صار لحسابه', Number((await resOf(act.id, PH.a))[0]?.player_id) === pa.id);
    ok('عدد المقاعد لم يتغيّر', (await seats()) === seats0, `${seats0} → ${await seats()}`);
    ok('القائمة بالحساب وحده تعرضه الآن (ما يقرؤه المنيو والفواتير)', (await listPlayerBookings(pa.id)).some(b => b.activityId === act.id));
    const l1b = await linkPhoneBookings(pa.id, PH.a);
    ok('نداءٌ ثانٍ لا يجد ما يربطه', l1b.bookings.length === 0 && l1b.reservations.length === 0);

    console.log('\n═══ ٢ · العلاج الذاتيّ: قراءة قائمته تعرض الحجز وتربطه ═══');
    const b2 = await book(act.id, 'ضيف ب', '+962799999972', null);        // كتبه الموظّف بصيغةٍ دوليّة
    const pb = await mkPlayer(PH.b, 'فحص الربط ب');
    const list2 = await listPlayerBookings(pb.id, PH.b);
    ok('يرى حجزه من أوّل قراءة (✅ محجوز + زرّ الدخول)', list2.length === 1 && list2[0].activityId === act.id, JSON.stringify(list2));
    ok('القائمة بشكلها السابق — لا حقول زائدة', !('linkedTo' in (list2[0] || {})) && 'bookingId' in (list2[0] || {}) && 'activityStatus' in (list2[0] || {}));
    ok('والحجز رُبط بحسابه في القراءة نفسها', Number((await bkRow(b2.id)).player_id) === pb.id);

    console.log('\n═══ ٣ · «احجز» على حجزٍ يتيم = تمّ، لا «محجوز مسبقاً» ═══');
    const b3 = await book(act.id, 'ضيف ج', '799999973', null);
    const pc = await mkPlayer(PH.c, 'فحص الربط ج');
    ok('المنع يراه (بكتابةٍ أخرى للرقم)', await blocked(act.id, pc.id, PH.c));
    const claimed = await claimPhoneBooking(pc.id, PH.c, act.id);
    ok('يُعاد صفّ حجزه مربوطاً به', !!claimed && Number(claimed.id) === Number(b3.id) && Number(claimed.playerId) === pc.id && Number(claimed.activityId) === act.id, JSON.stringify(claimed));
    ok('ضغطةٌ ثانية: لا ربط جديد ⟵ يبقى «محجوز مسبقاً»', (await claimPhoneBooking(pc.id, PH.c, act.id)) === null && await blocked(act.id, pc.id, PH.c));

    console.log('\n═══ ٤ · حدود الربط ═══');
    const bDone = await book(done.id, 'ضيف أ', PH.a, null);
    await linkPhoneBookings(pa.id, PH.a);
    ok('فعاليّةٌ انتهت: لا ربط بأثرٍ رجعيّ', (await bkRow(bDone.id)).player_id === null);
    ok('…ولا عبر «احجز»', (await claimPhoneBooking(pa.id, PH.a, done.id)) === null && (await bkRow(bDone.id)).player_id === null);

    await book(act2.id, 'فحص الربط أ', PH.a, pa.id);
    const bDup = await book(act2.id, 'ضيف أ مكرّر', PH.a, null);
    await linkPhoneBookings(pa.id, PH.a);
    ok('له حجزٌ في الفعاليّة نفسها: اليتيم لا يُربط (لا حجزان لشخص)', (await bkRow(bDup.id)).player_id === null);

    const pe = await mkPlayer(PH.dAlt, 'فحص الربط هـ');                    // حسابٌ آخر على الرقم بكتابةٍ أخرى
    const pd = await mkPlayer(PH.d, 'فحص الربط د');
    const bShared = await book(act.id, 'ضيف د', PH.d, null);
    const l4 = await linkPhoneBookings(pd.id, PH.d);
    ok('حسابان على رقمٍ واحد: لا ربط تخميناً', l4.bookings.length === 0 && (await bkRow(bShared.id)).player_id === null, `${pd.id}/${pe.id}`);

    const bEmpty = await book(act.id, 'بلا رقم', '', null);
    const listA = await listPlayerBookings(pa.id, PH.a);
    ok('حجزٌ بلا رقم لا يُنسب لأحد', !listA.some(b => b.bookingId === Number(bEmpty.id)) && (await bkRow(bEmpty.id)).player_id === null);
    ok('لاعبٌ بلا رقم: قائمته بحسابه وحده', (await listPlayerBookings(pa.id, '')).length === (await listPlayerBookings(pa.id)).length);

    const bOther = await book(act2.id, 'حجز لاعبٍ آخر برقم أ', '+962799999971', pb.id);
    ok('حجزٌ مربوطٌ بحسابٍ آخر لا يظهر في قائمته ولو طابق رقمه بكتابةٍ أخرى', !(await listPlayerBookings(pa.id, PH.a)).some(b => b.bookingId === Number(bOther.id)));

    const bGone = await book(act2.id, 'ضيف ج ملغى', PH.c, null);
    await q(sql`UPDATE bookings SET deleted_at = NOW() WHERE id = ${bGone.id}`);
    await linkPhoneBookings(pc.id, PH.c);
    ok('حجزٌ ملغى لا يُربط ولا يُعرض', (await bkRow(bGone.id)).player_id === null && !(await listPlayerBookings(pc.id, PH.c)).some(b => b.bookingId === Number(bGone.id)));
  } finally {
    await cleanup();
  }
  console.log(`\n═══ النتيجة ═══\n\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) failures.forEach(f => console.log(`   • ${f}`));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('💥', e); process.exit(2); });
