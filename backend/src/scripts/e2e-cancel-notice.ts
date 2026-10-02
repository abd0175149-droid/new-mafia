// ══════════════════════════════════════════════════════
// 📣 فحصٌ حيّ لإشعار الإلغاء — على موقع الاختبار (لا يصل واتساب أبداً، بالتصميم)
// ══════════════════════════════════════════════════════
//   docker compose exec -T backend npx tsx src/scripts/e2e-cancel-notice.ts
// ينشئ فعاليّتين اختبار + حجوزات/محادثات وهميّة (0799990771–0799990774)، يلغي عبر الـAPI
// الحقيقيّ، يقرأ التقرير، ثمّ يحذف كلّ ما أنشأه. الإرسال الفعليّ لا يُختبر هنا (لا مراسلة
// أحدٍ من موقع اختبار) — يظهر في التقرير عند أوّل إلغاءٍ حقيقيّ.
// ══════════════════════════════════════════════════════
import jwt from 'jsonwebtoken';
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

await connectDB(); const db = getDB()!;
const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x: any = '') => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}`, c ? '' : (typeof x === 'string' ? x : JSON.stringify(x))); };
const API = `http://localhost:${process.env.PORT || 4000}`;
const P = { open: '0799990771', closed: '0799990772', noconv: '0799990773', wait: '0799990774' };
const TAG = 'E2E-CANCEL-NOTICE';
const inList = (xs: number[]) => sql.join(xs.map(i => sql`${i}`), sql`, `);

const [clash] = await q(sql`SELECT COUNT(*)::int n FROM wa_conversations WHERE phone IN (${P.open}, ${P.closed}, ${P.noconv}, ${P.wait})`);
if (clash.n) { console.log('❌ أرقام الفحص مستخدمة — أُلغي'); process.exit(2); }
const [loc] = await q(sql`SELECT id FROM locations WHERE is_test_location AND deleted_at IS NULL LIMIT 1`);
const [adm] = await q(sql`SELECT id, username FROM staff WHERE role = 'admin' ORDER BY id LIMIT 1`);
const tok = jwt.sign({ id: adm.id, username: adm.username, role: 'admin', displayName: 'e2e' }, process.env.JWT_SECRET!, { expiresIn: '5m' });
const call = async (method: string, path: string, body?: any): Promise<any> =>
  (await fetch(API + path, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const ids: number[] = []; const convIds: number[] = [];
try {
  const [a] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${'🧪 ' + TAG + ' قادمة'}, NOW() + interval '2 days', 3, 'planned', ${loc.id}) RETURNING id`);
  const [past] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${'🧪 ' + TAG + ' فائتة'}, NOW() - interval '2 hours', 3, 'planned', ${loc.id}) RETURNING id`);
  ids.push(Number(a.id), Number(past.id));
  const [c1] = await q(sql`INSERT INTO wa_conversations (phone, wa_phone, display_name, last_inbound_at) VALUES (${P.open}, '962799990771', 'E2E open', NOW() - interval '1 hour') RETURNING id`);
  const [c2] = await q(sql`INSERT INTO wa_conversations (phone, wa_phone, display_name, last_inbound_at) VALUES (${P.closed}, '962799990772', 'E2E closed', NOW() - interval '3 days') RETURNING id`);
  convIds.push(Number(c1.id), Number(c2.id));
  await q(sql`INSERT INTO bookings (activity_id, name, phone, count) VALUES
    (${a.id}, 'سامي نافذة مفتوحة', ${P.open}, 2), (${a.id}, 'رامي نافذة مغلقة', ${P.closed}, 1),
    (${a.id}, 'هادي بلا محادثة', ${P.noconv}, 1), (${a.id}, 'رقم معطوب', '123', 1),
    (${past.id}, 'فائت', ${P.open}, 1)`);
  await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status) VALUES
    (${a.id}, 'سامي مكرّر', ${P.open}, 2, 'confirmed'), (${a.id}, 'وائل انتظار', ${P.wait}, 1, 'waitlist'), (${a.id}, 'ملغى قديم', '0799990779', 1, 'cancelled')`);

  // ── المعاينة قبل الإلغاء ──
  const pv = await call('GET', `/api/activities/${a.id}/cancel-notice/preview`);
  ok('المعاينة: ٤ حاجزين فريدين (المكرّر يُدمج، الملغى يُستبعد) + رقم معطوب', pv.total === 4 && pv.invalid === 1, pv);
  ok('المعاينة: موقع اختبار ⟵ لا إرسال (willSend=false)', pv.activity?.isTest === true && pv.willSend === false, pv.activity);
  ok('المعاينة: قبل الموعد', pv.beforeStart === true);

  // ── الإلغاء عبر الـAPI الحقيقيّ ──
  const r1 = await call('PUT', `/api/activities/${a.id}`, { status: 'cancelled' });
  ok('الردّ يحمل cancelNotice.started وقبل الموعد', r1.cancelNotice?.started === true && r1.cancelNotice?.beforeStart === true, r1.cancelNotice);
  await wait(2500);
  const rep = (await call('GET', `/api/activities/${a.id}/cancel-notice`)).report;
  ok('التقرير موجود ومُعلَّم «موقع اختبار»', rep?.notice?.skippedReason === 'test_location', rep?.notice);
  ok('التقرير: ٥ صفوف (٤ أرقام + معطوب)', rep?.recipients?.length === 5, rep?.recipients?.length);
  const by = (ph: string) => rep?.recipients?.find((x: any) => x.phone === ph);
  ok('سامي: مصدره «حجز» لا المتابعة المكرّرة', by(P.open)?.source === 'booking' && by(P.open)?.people === 2, by(P.open));
  ok('وائل: مصدره «انتظار»', by(P.wait)?.source === 'waitlist', by(P.wait));
  ok('الرقم المعطوب مسجَّلٌ «غير صالح»', !!rep?.recipients?.some((x: any) => x.outcome === 'invalid_phone' && x.phone === '123'), rep?.recipients);
  ok('الملغى القديم غير مُدرَج', !by('0799990779'));
  ok('التقرير يحمل اسم الفعاليّة وموعدها (لزرّ «من هاتفي»)', !!rep?.activity?.name && !!rep?.activity?.when, rep?.activity);
  const rec: any[] = await q(sql`SELECT phone, window_open, conversation_id, outcome FROM activity_cancel_recipients WHERE activity_id = ${a.id}`);
  const rw = (ph: string) => rec.find(x => x.phone === ph);
  ok('تصنيف النافذة: مفتوحة ⟵ window_open=true ومرتبطة بمحادثتها', rw(P.open)?.window_open === true && Number(rw(P.open)?.conversation_id) === Number(c1.id), rw(P.open));
  ok('تصنيف النافذة: مغلقة ⟵ false', rw(P.closed)?.window_open === false && Number(rw(P.closed)?.conversation_id) === Number(c2.id), rw(P.closed));
  ok('بلا محادثة ⟵ conversation_id فارغ', rw(P.noconv)?.conversation_id == null, rw(P.noconv));
  const [sentMsgs] = await q(sql`SELECT COUNT(*)::int n FROM wa_messages WHERE conversation_id IN (${inList(convIds)})`);
  ok('🔒 لا رسالة واتساب واحدة من موقع الاختبار', sentMsgs.n === 0, sentMsgs);

  // ── إعادة الإلغاء بعد التراجع: لا تكرار ──
  await call('PUT', `/api/activities/${a.id}`, { status: 'planned' });
  await call('PUT', `/api/activities/${a.id}`, { status: 'cancelled' });
  await wait(2000);
  const [n2] = await q(sql`SELECT runs FROM activity_cancel_notices WHERE activity_id = ${a.id}`);
  const [cnt] = await q(sql`SELECT COUNT(*)::int n FROM activity_cancel_recipients WHERE activity_id = ${a.id}`);
  ok('تراجعٌ ثمّ إلغاءٌ ثانٍ ⟵ تشغيلٌ ثانٍ بلا مستلمين مكرّرين', Number(n2?.runs) === 2 && cnt.n === 5, { runs: n2?.runs, n: cnt.n });
  const r3 = await call('PUT', `/api/activities/${a.id}`, { status: 'cancelled', name: '🧪 ' + TAG + ' قادمة' });
  ok('حفظُ فعاليّةٍ ملغاة أصلاً ⟵ لا إطلاق', !r3.cancelNotice, r3.cancelNotice);

  // ── بعد الموعد: لا رسائل ──
  const r4 = await call('PUT', `/api/activities/${past.id}`, { status: 'cancelled' });
  ok('إلغاءٌ بعد الموعد ⟵ beforeStart=false', r4.cancelNotice?.started === true && r4.cancelNotice?.beforeStart === false, r4.cancelNotice);
  await wait(1500);
  const [np] = await q(sql`SELECT skipped_reason FROM activity_cancel_notices WHERE activity_id = ${past.id}`);
  const [cp] = await q(sql`SELECT COUNT(*)::int n FROM activity_cancel_recipients WHERE activity_id = ${past.id}`);
  ok('…يُسجَّل «بعد الموعد» ولا مستلمين', np?.skipped_reason === 'after_start' && cp.n === 0, { np, cp });

  // ── الملغاة لم تعد قابلةً للحجز (ed0e11a) + «أعد الإرسال» لا يعمل على موقع اختبار ──
  const { notBookable } = await import('../services/whatsapp-bot.service.js');
  const nb = await notBookable(db, Number(a.id));
  ok('البوت يرفض الحجز فيها', !!nb?.cancelled, nb);
  const rs = await call('POST', `/api/activities/${a.id}/cancel-notice/resend`);
  ok('«أعد الإرسال» على موقع اختبار ⟵ مرفوض', !!rs.error && /اختبار/.test(rs.error), rs);
} finally {
  if (ids.length) {
    await q(sql`DELETE FROM activity_cancel_recipients WHERE activity_id IN (${inList(ids)})`);
    await q(sql`DELETE FROM activity_cancel_notices WHERE activity_id IN (${inList(ids)})`);
    await q(sql`DELETE FROM bookings WHERE activity_id IN (${inList(ids)})`);
    await q(sql`DELETE FROM reservations WHERE activity_id IN (${inList(ids)})`);
    await q(sql`DELETE FROM staff_action_log WHERE action = 'rest:activity-cancel' AND details->>'activityId' IN (${sql.join(ids.map(i => sql`${String(i)}`), sql`, `)})`);
    await q(sql`DELETE FROM activities WHERE id IN (${inList(ids)})`);
  }
  if (convIds.length) await q(sql`DELETE FROM wa_conversations WHERE id IN (${inList(convIds)})`);
}
console.log(`نجح ${pass} · فشل ${fail}`); process.exit(fail ? 1 : 0);
