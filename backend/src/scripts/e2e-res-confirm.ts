// ══════════════════════════════════════════════════════
// 🧪 رسالة تثبيت الحجز — E2E على الإنتاج في موقع الاختبار، بلا أيّ رسالة حقيقيّة
// الإرسال مستبدَل (testHooks.send)، والساعة مفروضة بعد ٣٠ يوماً: مهامّ الفحص مستحقّة في زمنٍ
// لا يبلغه عامل الخادم، فلا يلتقطها. والمفتاح مفروضٌ في هذه العمليّة وحدها.
// تشغيل: docker exec mafia-prod-backend-1 npx tsx src/scripts/e2e-res-confirm.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { generateToken } from '../middleware/auth.js';
import * as C from '../services/reservation-confirm.service.js';

const BASE = 'http://localhost:4000';
const LOC = 3;
const TAG = 'E2E-RES-CONFIRM';
const PH = { a: '0799999951', b: '0799999952', c: '0799999953', d: '0799999954', e: '0799999955' };
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };
const section = (t: string) => console.log(`\n═══ ${t} ═══`);

// ساعةٌ مفروضة: بعد ٣٠ يوماً، الخامسة مساءً بتوقيت عمّان
const DAY = 86400e3, JO = 3 * 3600e3;
const base = new Date(Date.now() + 30 * DAY + JO);
const at = (h: number, m = 0, plusDays = 0) => Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + plusDays, h, m) - JO;
let clock = at(17);
C.testHooks.now = () => clock;

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const sent: any[] = [];
  C.testHooks.send = async (input) => { sent.push(input); return { message: { id: null, channel: 'cloud' } }; };
  C.testHooks.forceEnabled = true;
  C.testHooks.allowTestLocation = true;

  const cleanup = async () => {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    for (const a of acts) {
      await q(sql`DELETE FROM reservation_confirm_jobs WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM reservations WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM wa_number_checks WHERE phone IN (${sql.join(Object.values(PH).map(x => sql`${x}`), sql`, `)})`);
  };
  await cleanup();
  // 🔒 tick() بساعة الفحص يلتقط كلّ مستحقّ — مهمّةٌ حقيقيّة منتظرة كانت ستُعلَّم «أُرسلت» بالإرسال المستبدَل
  const [real] = await q(sql`SELECT COUNT(*)::int AS n FROM reservation_confirm_jobs WHERE status = 'pending'`);
  if (real.n > 0) { console.error(`⛔ ${real.n} مهمّة حقيقيّة منتظرة — أعد الفحص بعد خروجها`); process.exit(3); }
  const [tplSaved] = await q(sql`SELECT value FROM wa_runtime_flags WHERE key = 'res_confirm_tpl'`);

  try {
    const mkAct = async (suffix: string, date: number, schedule: any[] = []) => (await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, game_schedule)
      VALUES (${TAG + ' ' + suffix}, ${new Date(date).toISOString()}::timestamptz, 3.00, 'planned', ${LOC}, ${JSON.stringify(schedule)}::jsonb) RETURNING id`))[0];
    const sched = [{ kind: 'game', label: 'اللعبة الأولى', start: '20:00' }, { kind: 'break', start: '21:00', end: '21:15' }, { kind: 'game', label: 'اللعبة الثانية', start: '21:15' }];
    const act = await mkAct('A', at(20, 0, 2), sched);
    const act2 = await mkAct('B', at(20, 0, 4));
    const mkRes = async (phone: string, status = 'pending', extra: any = {}) => (await q(sql`INSERT INTO reservations (activity_id, contact_name, phone, people_count, status, created_by, wa_sent_at, wa_sent_by)
      VALUES (${extra.act ?? act.id}, ${extra.name ?? 'فحص التثبيت'}, ${phone}, ${extra.people ?? 2}, ${status}, 'e2e', ${extra.sentAt ?? null}, ${extra.sentBy ?? ''}) RETURNING id`))[0];
    const job = async (resId: number) => (await q(sql`SELECT * FROM reservation_confirm_jobs WHERE reservation_id = ${resId} ORDER BY id DESC LIMIT 1`))[0];
    const setStatus = (id: number, s: string) => q(sql`UPDATE reservations SET status = ${s} WHERE id = ${id}`);

    section('١ · القالب يُملأ في الخادم');
    const d = { name: 'سامر', activityName: 'ليلة الفحص', count: 2, locationName: 'The Hub', region: 'عبدون', mapUrl: 'maps.app.goo.gl/x', date: at(20, 0, 2), schedule: sched };
    const txt = C.renderTemplate(C.DEFAULT_TPL, d);
    ok('الاسم والفعاليّة والعدد', txt.includes('مرحباً سامر 👋') && txt.includes('«ليلة الفحص» لعدد شخصين'));
    ok('المكان والخريطة (يُكمَل https)', txt.includes('📍 المكان: The Hub — عبدون') && txt.includes('https://maps.app.goo.gl/x'));
    ok('برنامج الليلة بأرقامٍ عربيّة واستراحة', txt.includes('• اللعبة الأولى — ٨:٠٠ م') && txt.includes('استراحة ١٥ دقيقة'));
    ok('الختام الجديد لا القديم (القرار ٤)', txt.includes('إذا تغيّرت خطّتك') && !txt.includes('لتثبيت الحجز نهائيّاً'));
    const bare = C.renderTemplate(C.DEFAULT_TPL, { name: '', activityName: 'ليلة', count: 1 });
    ok('سطرٌ اختياريّ فارغ يسقط، والاسم الغائب بلا مسافتين', !bare.includes('📍') && !bare.includes('🗺️') && bare.startsWith('مرحباً 👋') && bare.includes('شخص واحد'));

    section('٢ · ساعات الهدوء (القرار ٦)');
    ok('١:٣٠ ليلاً ⟵ ٩:٠٠ صباحاً', C.quietAdjust(at(1, 30), at(20, 0, 2)) === at(9));
    ok('٥:٠٠ مساءً ⟵ كما هو', C.quietAdjust(at(17), at(20, 0, 2)) === at(17));
    ok('فعاليّةٌ ١٠ صباح اليوم نفسه ⟵ لا انتظار', C.quietAdjust(at(1, 30), at(10)) === at(1, 30));

    section('٣ · التثبيت يُجدول، والفكّ يلغي');
    const r1 = await mkRes(PH.a);
    ok('غير مثبّت ⟵ لا جدولة', (await C.scheduleReservationConfirm(r1.id, 'page')).scheduled === false && !(await job(r1.id)));
    await setStatus(r1.id, 'confirmed');
    const s1 = await C.scheduleReservationConfirm(r1.id, 'page', 'موظّف الفحص');
    ok('مثبّت ⟵ مهمّة بعد دقيقتين (مهلة التراجع)', s1.scheduled && s1.dueAt?.getTime() === clock + C.UNDO_MS, String(s1.dueAt));
    ok('جدولةٌ ثانية لا تُنشئ مهمّة ثانية', (await C.scheduleReservationConfirm(r1.id, 'page')).scheduled && (await q(sql`SELECT 1 FROM reservation_confirm_jobs WHERE reservation_id = ${r1.id}`)).length === 1);
    clock += 60e3; await C.tick();
    ok('قبل انقضاء المهلة لا إرسال', sent.length === 0 && (await job(r1.id)).status === 'pending');
    await setStatus(r1.id, 'pending');
    ok('فكّ التثبيت خلال المهلة يلغيها', (await C.cancelReservationConfirm(r1.id, 'فُكّ')) === 1 && (await job(r1.id)).status === 'cancelled');
    clock += 5 * 60e3; await C.tick();
    ok('ولا يصل شيء', sent.length === 0);

    section('٤ · الإرسال بعد المهلة');
    await setStatus(r1.id, 'confirmed');
    await C.scheduleReservationConfirm(r1.id, 'page');
    ok('إعادة التثبيت تعيد المهمّة منتظرة', (await job(r1.id)).status === 'pending');
    clock += C.UNDO_MS + 1000; await C.tick();
    let j1 = await job(r1.id);
    ok('أُرسلت مرّةً واحدة', j1.status === 'sent' && sent.length === 1, `${j1.status} ${sent.length}`);
    ok('من المسار المقيّد بوقت وموسومةً «تثبيت»', sent[0]?.lane === 'timely' && sent[0]?.meta?.kind === 'res_confirm' && sent[0]?.meta?.reservationId === r1.id);
    ok('إلى رقمه (لا محادثة له)', sent[0]?.phone === PH.a && !sent[0]?.conversationId);
    ok('النصّ: الفعاليّة والعدد وبرنامج الليلة', String(sent[0]?.text).includes(`${TAG} A`) && String(sent[0]?.text).includes('لعدد شخصين') && String(sent[0]?.text).includes('برنامج الليلة'));
    const [r1row] = await q(sql`SELECT wa_sent_at, wa_sent_by FROM reservations WHERE id = ${r1.id}`);
    ok('ميتا ⟵ «أُرسلت» تُختم فوراً باسم الإرسال التلقائيّ', !!r1row.wa_sent_at && r1row.wa_sent_by === C.AUTO_SENDER);
    await setStatus(r1.id, 'pending'); await setStatus(r1.id, 'confirmed');
    ok('فكٌّ وإعادة تثبيت بعد الإرسال ⟵ لا تتكرّر', (await C.scheduleReservationConfirm(r1.id, 'page')).scheduled === false);

    section('٥ · النقل لفعاليّةٍ أخرى');
    await q(sql`UPDATE reservations SET activity_id = ${act2.id} WHERE id = ${r1.id}`);
    const mv = await C.scheduleReservationConfirm(r1.id, 'move');
    ok('موعدٌ جديد ⟵ مهمّة جديدة (ختم الإرسال التلقائيّ ليس يدويّاً)', mv.scheduled === true, mv.reason);
    clock += C.UNDO_MS + 1000; await C.tick();
    ok('ووصلت رسالة الفعاليّة الجديدة', sent.length === 2 && String(sent[1]?.text).includes(`${TAG} B`));

    section('٦ · مداخل اللاعب نفسه بلا مهلة');
    const r2 = await mkRes(PH.b, 'confirmed', { people: 1 });
    const s2 = await C.scheduleReservationConfirm(r2.id, 'bot');
    ok('البوت ⟵ بعد ١٥ ثانية (يسبقها ردّ البوت القصير)', s2.scheduled && s2.dueAt!.getTime() - clock === 15_000);
    clock += 16_000; await C.tick();
    ok('ووصلت لشخصٍ واحد', sent.length === 3 && String(sent[2]?.text).includes('شخص واحد'));

    section('٧ · ما يمنع الإرسال');
    const r3 = await mkRes(PH.c, 'confirmed', { sentAt: new Date().toISOString(), sentBy: 'موظّف' });
    ok('أرسلها موظّفٌ يدويّاً ⟵ لا تلقائيّة', (await C.scheduleReservationConfirm(r3.id, 'page')).reason === 'أُرسلت يدويّاً من قبل');
    const r4 = await mkRes('', 'confirmed');
    await C.scheduleReservationConfirm(r4.id, 'page'); clock += C.UNDO_MS + 1000; await C.tick();
    ok('بلا رقم ⟵ «✗ لا رقم صالح» على الصفّ', (await job(r4.id))?.status === 'failed' && (await job(r4.id))?.reason === 'لا رقم صالح');
    await q(sql`INSERT INTO wa_number_checks (phone, on_wa, checked_at) VALUES (${PH.d}, false, NOW()) ON CONFLICT (phone) DO UPDATE SET on_wa = false, checked_at = NOW()`);
    const r5 = await mkRes(PH.d, 'confirmed');
    await C.scheduleReservationConfirm(r5.id, 'page'); clock += C.UNDO_MS + 1000; await C.tick();
    ok('رقمٌ بلا واتساب ⟵ لا محاولة، والسبب على الصفّ', (await job(r5.id))?.reason === 'الرقم بلا واتساب' && sent.length === 3);
    const past = await mkAct('past', clock - 3600e3);
    const r6 = await mkRes(PH.e, 'confirmed', { act: past.id });
    ok('فعاليّةٌ بدأت ⟵ لا جدولة', (await C.scheduleReservationConfirm(r6.id, 'page')).scheduled === false);
    const r7 = await mkRes(PH.e, 'confirmed');
    const r7b = await mkRes(PH.e, 'confirmed', { name: 'الشخص نفسه بصفٍّ ثانٍ' });
    await C.scheduleReservationConfirm(r7.id, 'page'); await C.scheduleReservationConfirm(r7b.id, 'page');
    clock += C.UNDO_MS + 1000; await C.tick();
    ok('الرقم نفسه بصفّين للفعاليّة ⟵ رسالةٌ واحدة', sent.length === 4 && (await job(r7b.id))?.reason === 'وصلت الرقمَ نفسه لهذه الفعاليّة', `${sent.length} ${(await job(r7b.id))?.reason}`);

    section('٨ · ساعات الهدوء عند الجدولة');
    clock = at(1, 30, 1);
    const r8 = await mkRes('0799999956', 'confirmed');
    const s8 = await C.scheduleReservationConfirm(r8.id, 'page');
    ok('تثبيتٌ ١:٣٠ ليلاً ⟵ مجدولة لـ٩:٠٠', s8.dueAt?.getTime() === at(9, 0, 1), String(s8.dueAt));
    clock = at(8, 0, 1); await C.tick();
    ok('الثامنة صباحاً ما زالت تنتظر', (await job(r8.id)).status === 'pending');
    clock = at(9, 0, 1) + 1000; await C.tick();
    ok('التاسعة ⟵ خرجت', (await job(r8.id)).status === 'sent');
    clock = at(17, 0, 1);

    section('٩ · المفتاح وموقع الاختبار');
    C.testHooks.forceEnabled = false;
    const r9 = await mkRes('0799999957', 'confirmed');
    ok('المفتاح مطفأ ⟵ لا مهمّة أصلاً (لا رجعيّة عند التشغيل — القرار ٩)', (await C.scheduleReservationConfirm(r9.id, 'page')).reason === 'مطفأ' && !(await job(r9.id)));
    C.testHooks.allowTestLocation = false;
    await C.scheduleReservationConfirm(r9.id, 'page');
    ok('موقع الاختبار يعمل والمفتاح مطفأ، ولغير الموظّف «تُخطّي» بسببه', (await job(r9.id))?.status === 'skipped' && /موقع اختبار/.test((await job(r9.id))?.reason));
    C.testHooks.forceEnabled = true; C.testHooks.allowTestLocation = true;

    section('١٠ · المسارات (HTTP)');
    const [adm] = await q(sql`SELECT id, username, display_name FROM staff WHERE role='admin' ORDER BY id LIMIT 1`);
    const H = { Authorization: `Bearer ${generateToken({ id: adm.id, username: adm.username, role: 'admin', displayName: adm.display_name })}`, 'Content-Type': 'application/json' };
    const api = async (path: string, init?: any) => { const r = await fetch(BASE + path, init); let body: any = null; try { body = await r.json(); } catch { /* */ } return { status: r.status, body }; };
    const r10 = await mkRes('0799999958', 'pending');
    let r = await api(`/api/reservations/${r10.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ status: 'confirmed' }) });
    let j10 = await job(r10.id);
    // عمليّة الخادم بلا فرضٍ للمفتاح: موقع الاختبار ⟵ صفٌّ «تُخطّي» لغير الموظّف — يثبت أنّ «ثبّت» في الصفحة يجدول
    ok('«ثبّت» من الصفحة يُنشئ مهمّة التثبيت', r.status === 200 && !!j10, JSON.stringify(r.body).slice(0, 100));
    r = await api(`/api/reservations?activityId=${act.id}`, { headers: H });
    const row10 = (r.body || []).find((x: any) => x.id === r10.id);
    ok('صفّ المتابعة يحمل حالة الرسالة', !!row10?.confirmJob && row10.confirmJob.status === j10?.status, JSON.stringify(row10?.confirmJob));
    r = await api(`/api/reservations/${r10.id}`, { method: 'DELETE', headers: H });
    ok('الحذف يُقبل', r.status === 200);
    r = await api('/api/reservations/confirm-template', { headers: H });
    ok('القالب يُقرأ من الخادم', r.body?.success === true && typeof r.body?.text === 'string' && r.body?.defaultText === C.DEFAULT_TPL);
    r = await api('/api/reservations/confirm-template', { method: 'PUT', headers: H, body: JSON.stringify({ text: 'مرحباً {الاسم} — فحص' }) });
    ok('الأدمن يحفظ القالب المشترك', r.body?.success === true && (await C.getTemplate()).text === 'مرحباً {الاسم} — فحص');
    r = await api('/api/reservations/confirm-template', { method: 'PUT', headers: H, body: JSON.stringify({ text: '   ' }) });
    ok('قالبٌ فارغ يُرفض', r.status === 400);
    r = await api('/api/admin/res-confirm', { headers: H });
    ok('بطاقة الداشبورد تقرأ الحالة', r.body?.success === true && typeof r.body?.enabled === 'boolean' && 'last24h' in r.body);
  } finally {
    // القالب كما كان
    if (tplSaved) await q(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES ('res_confirm_tpl', ${JSON.stringify(tplSaved.value)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    else await q(sql`DELETE FROM wa_runtime_flags WHERE key = 'res_confirm_tpl'`);
    await cleanup();
  }
  console.log(`\n═══ النتيجة ═══\n\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) failures.forEach(f => console.log(`   • ${f}`));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('💥', e); process.exit(2); });
