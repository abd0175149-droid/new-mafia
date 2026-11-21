// ══════════════════════════════════════════════════════
// 🧪 تعديل العدد من الدون — حالة عامر #1199 (2026-11-21)
// النموذج خمّن فعاليّة ١٢ بدل ٤١٣ حين كتب العميل «تثبيت»، فقال «ما لقيت حجز» وعرض حجزاً جديداً.
// الآن: البطاقة المعروضة قبل دقائق هي المرجع، وإلّا حجزه القادم الوحيد. والسجلّ بقناة الدون وفاعله.
// ⚠️ نسخةٌ مؤقّتة فقط (mafia_m2test) — وضع التجربة (dryRun) فلا إرسال، والزرّ بمساعد إرسالٍ وهميّ.
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = '🧪 E2E-BOTCHG';
const PH = '0799999931';
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  if (!/mafia_m2test/.test(String(process.env.DATABASE_URL || ''))) { console.error('❌ للنسخة المؤقّتة وحدها'); process.exit(2); }
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const { migrateBookingEvents } = await import('../migrations-booking-events.js'); await migrateBookingEvents(db);
  const Q = await import('../services/capacity-queue.service.js'); await Q.migrateCapacityQueue(db);
  const X = await import('../services/wa-bot-ext.service.js');
  const cleanup = async () => {
    for (const a of await q(sql`SELECT id FROM activities WHERE name LIKE ${TAG + '%'}`)) {
      await q(sql`DELETE FROM booking_events WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
  };
  await cleanup();
  const sent: any[] = [];
  const h: any = {
    fmtJo: (d: any) => new Date(d).toISOString(), sendMessage: async (m: any) => { sent.push(m); return {}; },
    notifyAdmins: async () => {}, isAdminConversation: async () => false,
    seatAvailability: async () => ({ total: 30, booked: 1, remaining: 29, capped: false }),
  };
  try {
    const [loc] = await q(sql`SELECT id FROM locations WHERE COALESCE(is_test_location, false) = false AND deleted_at IS NULL ORDER BY id LIMIT 1`);
    const [a] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG}, NOW() + INTERVAL '2 days', 3, 'planned', ${loc.id}) RETURNING id`);
    const [r] = await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${a.id}, 'عامر فحص', ${PH}, 1, 'confirmed', 'player-app') RETURNING id`);
    const conv = { id: -1199, phone: PH, playerId: null, displayName: 'عامر فحص' };

    const ctx = { conv, dryRun: true, interactives: [] as any[], settings: {} };
    let res = await X.execExtTool('request_change_people', { activity_id: Number(a.id), new_count: 5 }, ctx as any, h);
    ok('المعرّف الصحيح ⟵ بطاقة التعديل', res?.sent === true && ctx.interactives.length === 1, JSON.stringify(res));
    const ctx2 = { conv, dryRun: true, interactives: [] as any[], settings: {} };
    res = await X.execExtTool('request_change_people', { activity_id: 12, new_count: 5 }, ctx2 as any, h);
    ok('معرّفٌ خاطئ (١٢) وله حجزٌ قادم واحد ⟵ البطاقة نفسها لا «ما لقيت حجز»', res?.sent === true, JSON.stringify(res));
    // حجزٌ ثانٍ قادم ⟵ لا تخمين
    const [a2] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id) VALUES (${TAG + ' ٢'}, NOW() + INTERVAL '4 days', 3, 'planned', ${loc.id}) RETURNING id`);
    await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by) VALUES (${a2.id}, 'عامر فحص', ${PH}, 1, 'confirmed', 'player-app')`);
    res = await X.execExtTool('request_change_people', { activity_id: 12, new_count: 5 }, { conv, dryRun: true, interactives: [], settings: {} } as any, h);
    ok('حجزان قادمان ومعرّفٌ خاطئ ⟵ لا تخمين', res?.found === false, JSON.stringify(res));

    const done = await X.handleExtButton(conv, `chgp:${r.id}:5`, h);
    const [rr] = await q(sql`SELECT people_count FROM reservations WHERE id = ${r.id}`);
    const [ev] = await q(sql`SELECT channel, actor FROM booking_events WHERE reservation_id = ${r.id} AND kind = 'people' ORDER BY id DESC LIMIT 1`);
    ok('الزرّ يعدّل ١ ⟵ ٥', done && Number(rr.people_count) === 5, JSON.stringify(rr));
    ok('سطر السجلّ بقناة الدون وفاعله', ev?.channel === 'bot' && ev?.actor === 'عامر فحص', JSON.stringify(ev));
    ok('ردّ «صار لـ5 أشخاص»', sent.some((m) => /صار لـ5/.test(String(m.text || ''))));
  } catch (e: any) { fail++; failures.push(`استثناء: ${e?.message}`); console.log('💥', e); }
  finally { await cleanup(); }
  console.log(`\n${fail ? '❌' : '✅'} تعديل العدد: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
