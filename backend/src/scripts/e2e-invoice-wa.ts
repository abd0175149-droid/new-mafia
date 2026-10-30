// ══════════════════════════════════════════════════════
// 🧪 فواتير واتساب — E2E على الإنتاج، معزولاً على Test Location (#3)
// لا رسالة واتساب حقيقيّة: المرسِل والقارئ (Gemini) مستبدَلان بمسجِّلين، والمفتاح
// مفروضٌ في هذه العمليّة وحدها (testHooks) — علم القاعدة الحقيقيّ لا يُلمس.
// الصفوف تُعالَج هنا مباشرةً قبل أن يحين موعدها، فلا يلتقطها عامل الخادم.
// تشغيل: docker exec mafia-prod-backend-1 npx tsx src/scripts/e2e-invoice-wa.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { generateToken } from '../middleware/auth.js';
import * as W from '../services/invoice-wa.service.js';
import { buildInvoiceData, invoiceHtml, receiptHtml } from '../services/fnb-invoice.service.js';

const BASE = 'http://localhost:4000';
const LOC = 3;
const TAG = 'E2E-INVOICE-WA';
const PH1 = '0799999989', PH2 = '0799999988', PH3 = '0799999987';   // صيغةٌ صالحة لا مالك لها (فُحص) — والمرسِل مستبدَل
const VENUE_PH = '0799999986';

let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
const section = (t: string) => console.log(`\n═══ ${t} ═══`);

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];

  // ── المسجِّلات بدل الإرسال والقراءة والرسم ──
  const sent: { to: string; kind: 'image' | 'text'; body: string; path?: string }[] = [];
  const files: string[] = [];
  W.sender.image = async (phone, localPath, caption) => { sent.push({ to: phone, kind: 'image', body: caption, path: localPath }); files.push(localPath); return { channel: 'web' }; };
  W.sender.text = async (phone, text) => { sent.push({ to: phone, kind: 'text', body: text }); };
  const realRender = W.sender.render;
  W.sender.render = async () => Buffer.from('fake-jpeg');
  let nextRead: W.TransferRead = { ok: true, isTransfer: true, amount: null, payee: '', method: 'cliq' };
  W.reader.read = async () => nextRead;
  W.testHooks.forceEnabled = true;
  W.testHooks.allowTestLocation = true;

  async function cleanup() {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    for (const a of acts) {
      await q(sql`DELETE FROM invoice_wa_jobs WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM order_invoices WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE activity_id = ${a.id})`);
      await q(sql`DELETE FROM orders WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      const ss = await q(sql`SELECT id FROM sessions WHERE activity_id = ${a.id}`);
      for (const s of ss) {
        const ms = await q(sql`SELECT id FROM matches WHERE session_id = ${s.id}`);
        for (const m of ms) await q(sql`DELETE FROM match_players WHERE match_id = ${m.id}`);
        await q(sql`DELETE FROM matches WHERE session_id = ${s.id}`);
        await q(sql`DELETE FROM session_players WHERE session_id = ${s.id}`);
        await q(sql`DELETE FROM sessions WHERE id = ${s.id}`);
      }
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone IN (${PH1}, ${PH2}, ${PH3})`);
    for (const f of files) { try { fs.unlinkSync(f); } catch { /* */ } }
    try { fs.unlinkSync('uploads/wa-media/owa-e2einvoicewa.jpg'); } catch { /* */ }
  }
  await cleanup();

  const [saved] = await q(sql`SELECT pay_cash, pay_card, pay_cliq, cliq_method, cliq_value, cliq_bank, cliq_name, wa_phone,
    min_charge_enabled, minimum_charge, auto_water FROM locations WHERE id = ${LOC}`);
  const restore = async () => q(sql`UPDATE locations SET pay_cash = ${saved.pay_cash}, pay_card = ${saved.pay_card}, pay_cliq = ${saved.pay_cliq},
    cliq_method = ${saved.cliq_method}, cliq_value = ${saved.cliq_value}, cliq_bank = ${saved.cliq_bank}, cliq_name = ${saved.cliq_name},
    wa_phone = ${saved.wa_phone}, min_charge_enabled = ${saved.min_charge_enabled}, minimum_charge = ${saved.minimum_charge}, auto_water = ${saved.auto_water}
    WHERE id = ${LOC}`);

  try {
    const [adminRow] = await q(sql`SELECT id, username, display_name FROM staff WHERE role='admin' ORDER BY id LIMIT 1`);
    const aTok = generateToken({ id: adminRow.id, username: adminRow.username, role: 'admin', displayName: adminRow.display_name });
    const A = { Authorization: `Bearer ${aTok}`, 'Content-Type': 'application/json' };
    const api = async (path: string, init?: any) => {
      const r = await fetch(BASE + path, init); let body: any = null; try { body = await r.json(); } catch { /* */ }
      return { status: r.status, body };
    };
    const vURL = (p: string) => `${p}${p.includes('?') ? '&' : '?'}locationId=${LOC}`;

    // ══ ١ · إعدادات طرق الدفع (HTTP) ══
    section('١ · طرق الدفع من كونسول المكان');
    let r = await api(vURL('/api/venue/payment-settings'), { method: 'PUT', headers: A, body: JSON.stringify({ payCash: false, payCard: false, payCliq: false }) });
    ok('بلا أيّ طريقة يُرفض', r.status === 400, JSON.stringify(r.body));
    r = await api(vURL('/api/venue/payment-settings'), { method: 'PUT', headers: A, body: JSON.stringify({ payCash: true, payCliq: true, cliqMethod: 'alias', cliqValue: 'mafia hub', cliqBank: 'x', cliqName: 'y' }) });
    ok('اسم مستخدم بمسافة يُرفض', r.status === 400, JSON.stringify(r.body));
    r = await api(vURL('/api/venue/payment-settings'), { method: 'PUT', headers: A, body: JSON.stringify({ payCash: true, payCliq: true, cliqMethod: 'alias', cliqValue: 'MAFIAHUB', cliqBank: '', cliqName: 'y' }) });
    ok('كليك بلا بنك يُرفض', r.status === 400, JSON.stringify(r.body));
    r = await api(vURL('/api/venue/payment-settings'), { method: 'PUT', headers: A, body: JSON.stringify({ payCash: true, payCard: true, payCliq: true, cliqMethod: 'phone', cliqValue: '962791112233', cliqBank: 'البنك العربي', cliqName: 'محمد الخطيب', waPhone: '+962 79 999 9986' }) });
    ok('الحفظ يقبل ويطبّع الرقمين', r.body?.success === true && r.body.payment.cliqValue === '0791112233' && r.body.payment.waPhone === VENUE_PH, JSON.stringify(r.body));
    r = await api(vURL('/api/venue/payment-settings'), { headers: A });
    ok('القراءة تعيد المحفوظ', r.body?.payment?.payCard === true && r.body?.payment?.cliqMethod === 'phone');
    // نعود إلى اسم مستخدم لبقيّة الفحص
    await q(sql`UPDATE locations SET cliq_method = 'alias', cliq_value = 'MAFIAHUB', min_charge_enabled = false, auto_water = false WHERE id = ${LOC}`);

    // ── التجهيز ──
    const [p1] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH1}, 'رامي فحص', 'x') RETURNING id, phone, name`);
    const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, menu_ordering_enabled, add_game_fee_to_bill)
      VALUES (${TAG + ' ' + new Date().toISOString().slice(0, 16)}, NOW(), 3.00, 'planned', ${LOC}, true, true) RETURNING id`);
    const [bk1] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
      VALUES (${act.id}, ${p1.name}, ${p1.phone}, 1, ${p1.id}, 'e2e', false, false) RETURNING id`);
    const addOrder = async (pid: number, name: string, bkId: number, item: string, price: number) => {
      const [o] = await q(sql`INSERT INTO orders (activity_id, location_id, player_id, player_name, booking_id, status, total)
        VALUES (${act.id}, ${LOC}, ${pid}, ${name}, ${bkId}, 'delivered', ${price.toFixed(2)}) RETURNING id`);
      await q(sql`INSERT INTO order_items (order_id, name_snapshot, unit_price_snapshot, quantity) VALUES (${o.id}, ${item}, ${price.toFixed(2)}, 1)`);
      return o.id;
    };
    const claim = async (id: number) => (await q(sql`UPDATE invoice_wa_jobs SET status = 'sending' WHERE id = ${id} RETURNING *`))[0];
    const job = async (id: number) => (await q(sql`SELECT * FROM invoice_wa_jobs WHERE id = ${id}`))[0];

    // ══ ٢ · القالب: طرق الدفع على المطلوب وحده ══
    section('٢ · طرق الدفع على الفاتورة');
    await addOrder(p1.id, p1.name, bk1.id, 'أرجيلة', 4);
    let d: any = await buildInvoiceData(db, LOC, act.id, p1.id);
    ok('الفاتورة المفتوحة: أرجيلة 4 + دخوليّة 3 = 7', d.grandTotal === 7, String(d.grandTotal));
    ok('طرق الدفع محمولة في البيانات', d.payment?.cash === true && d.payment?.card === true && d.payment?.cliq?.value === 'MAFIAHUB');
    let html = invoiceHtml(d, 47, '', null);
    ok('A6 المطلوب يحمل «طرق الدفع» وتفاصيل كليك', html.includes('طرق الدفع') && html.includes('MAFIAHUB') && html.includes('البنك العربي'));
    ok('A6 المطلوب: نقد أو بطاقة عند الكاشير', html.includes('نقداً أو بطاقة (فيزا) عند الكاشير'));
    ok('إيصال 80مم المطلوب يحمل كليك', receiptHtml(d, 47, '', null).includes('MAFIAHUB'));
    ok('المحصَّل بلا طرق دفع', !invoiceHtml({ ...d, paidAt: new Date() }, 47, '', null).includes('طرق الدفع'));
    await q(sql`UPDATE locations SET pay_cliq = false WHERE id = ${LOC}`);
    d = await buildInvoiceData(db, LOC, act.id, p1.id);
    ok('كليك مطفأ ⟵ لا تفاصيل كليك', d.payment.cliq === null && !invoiceHtml(d, 47, '', null).includes('MAFIAHUB'));
    await q(sql`UPDATE locations SET pay_cliq = true WHERE id = ${LOC}`);

    // ══ ٣ · «وُصِّل» ⟵ ملفّ مطلوب (تأجيلٌ واحد للمتقاربين) ══
    section('٣ · الفاتورة عند التوصيل');
    const j1 = await W.scheduleOpen(LOC, act.id, p1.id, {});
    const j1b = await W.scheduleOpen(LOC, act.id, p1.id, {});
    const pend = await q(sql`SELECT id, due_at FROM invoice_wa_jobs WHERE activity_id = ${act.id} AND status = 'pending'`);
    ok('توصيلان متقاربان = صفٌّ واحد ينتظر', j1 === j1b && pend.length === 1);
    ok('الموعد بعد دقيقة', new Date(pend[0].due_at).getTime() - Date.now() > 45_000);
    sent.length = 0;
    await W.processJob(await claim(j1!));
    let jr = await job(j1!);
    ok('أُرسلت', jr.status === 'sent' && jr.channel === 'web', JSON.stringify({ s: jr.status, r: jr.reason }));
    ok('رقم الفاتورة صدر وسُجّل', Number(jr.invoice_no) > 0 && Number(jr.total) === 7);
    const img1 = sent.find(x => x.kind === 'image');
    ok('صورةٌ للّاعب بتعليق «طلبك وصل»', img1?.to === PH1 && img1.body.includes('طلبك وصل') && img1.body.includes('7.00'), img1?.body);
    ok('التعليق فيه طرق الدفع وكليك والردّ بالصورة', !!img1 && img1.body.includes('طرق الدفع') && img1.body.includes('اسم المستخدم: MAFIAHUB') && img1.body.includes('ردّ على هذه الرسالة بصورة الحوالة'));
    const copy1 = sent.find(x => x.kind === 'text');
    ok('رسالةٌ ثانية بالقيمة وحدها للنسخ', copy1?.body === 'MAFIAHUB');
    ok('الصورة في المجلّد الخاصّ', !!img1?.path?.startsWith('uploads/private/wa-invoices/') && fs.existsSync(img1!.path!));
    const invNo = Number(jr.invoice_no);

    // ══ ٤ · طلبٌ ثانٍ: نفس الملفّ والدخوليّة مرّة ══
    section('٤ · طلبٌ ثانٍ');
    await addOrder(p1.id, p1.name, bk1.id, 'قهوة تركية', 1.5);
    const j2 = await W.scheduleOpen(LOC, act.id, p1.id, {});
    sent.length = 0;
    await W.processJob(await claim(j2!));
    jr = await job(j2!);
    ok('نفس رقم الملفّ', Number(jr.invoice_no) === invNo);
    ok('المطلوب 8.50 (الدخوليّة مرّة واحدة)', Number(jr.total) === 8.5, String(jr.total));
    ok('التعليق «حدّثنا ملفّك»', !!sent.find(x => x.kind === 'image' && x.body.includes('حدّثنا ملفّك') && x.body.includes('8.50')));

    // ══ ٥ · التحصيل والختم والتراجع ══
    section('٥ · الختم بعد التحصيل');
    r = await api(vURL(`/api/venue/invoices/${act.id}/${p1.id}/pay`), { method: 'POST', headers: A, body: JSON.stringify({ expectedTotal: 8.5 }) });
    ok('التحصيل يُقبل', r.body?.success === true, JSON.stringify(r.body));
    const paidId = Number(r.body?.invoiceId);
    await W.schedulePaidStamp(LOC, act.id, p1.id, paidId, null);
    let st = await q(sql`SELECT id, due_at, status FROM invoice_wa_jobs WHERE invoice_id = ${paidId} AND kind = 'paid'`);
    ok('الختم ينتظر مهلة التراجع', st.length === 1 && st[0].status === 'pending' && new Date(st[0].due_at).getTime() - Date.now() > 110_000);
    const cancelled = await W.cancelPaidStamp(paidId);
    st = await q(sql`SELECT status FROM invoice_wa_jobs WHERE invoice_id = ${paidId} AND kind = 'paid'`);
    ok('التراجع يلغي الختم', cancelled === 1 && st[0].status === 'cancelled');
    await W.schedulePaidStamp(LOC, act.id, p1.id, paidId, null);
    const [ps] = await q(sql`SELECT id FROM invoice_wa_jobs WHERE invoice_id = ${paidId} AND kind = 'paid' AND status = 'pending'`);
    sent.length = 0;
    await W.processJob(await claim(ps.id));
    jr = await job(ps.id);
    ok('الختم أُرسل', jr.status === 'sent', jr.reason);
    ok('تعليق «أُغلقت القضيّة» بالمبلغ', !!sent.find(x => x.kind === 'image' && x.body.includes('أُغلقت القضيّة') && x.body.includes('8.50')));
    ok('لا رسالة نسخٍ مع الختم', !sent.some(x => x.kind === 'text'));
    // ختمٌ لفاتورةٍ تُراجع عنها بعد الجدولة (أدمن متأخّر) ⟵ يُلغى عند المعالجة
    await q(sql`INSERT INTO invoice_wa_jobs (location_id, activity_id, player_id, kind, invoice_id, status) VALUES (${LOC}, ${act.id}, ${p1.id}, 'paid', ${paidId}, 'sending')`);
    await q(sql`UPDATE order_invoices SET is_paid = false WHERE id = ${paidId}`);
    const [late] = await q(sql`SELECT * FROM invoice_wa_jobs WHERE invoice_id = ${paidId} AND status = 'sending'`);
    await W.processJob(late);
    ok('فاتورةٌ لم تعد محصَّلة ⟵ الختم يُلغى', (await job(late.id)).status === 'cancelled');
    await q(sql`UPDATE order_invoices SET is_paid = true WHERE id = ${paidId}`);

    // ══ ٦ · بعد التحصيل: ملفٌّ جديد بلا دخوليّة + «شو حسابي؟» ══
    section('٦ · طلب بعد التحصيل و«شو حسابي؟»');
    await addOrder(p1.id, p1.name, bk1.id, 'تغيير راس', 2);
    d = await buildInvoiceData(db, LOC, act.id, p1.id);
    ok('الملفّ الجديد 2.00 بلا دخوليّة', d.grandTotal === 2 && d.gameFeeApplied === false, String(d.grandTotal));
    sent.length = 0;
    const bot: any = await W.invoiceForBot(LOC, act.id, p1.id);
    ok('البوت: صورةٌ أُرسلت', bot.imageSent === true, JSON.stringify(bot));
    ok('البوت: ما حُصّل وما بقي', bot.paidTotalJOD === 8.5 && bot.remainingJOD === 2 && bot.paidInvoices?.length === 1);
    const bimg = sent.find(x => x.kind === 'image');
    ok('تعليق البوت: «حصّلنا منك» و«الباقي»', !!bimg && bimg.body.includes('حصّلنا منك 8.50') && bimg.body.includes('الباقي 2.00'), bimg?.body);

    // ══ ٧ · صورة الحوالة ══
    section('٧ · صورة الحوالة');
    await q(sql`UPDATE locations SET wa_phone = ${VENUE_PH} WHERE id = ${LOC}`);
    fs.mkdirSync('uploads/wa-media', { recursive: true });
    fs.writeFileSync('uploads/wa-media/owa-e2einvoicewa.jpg', Buffer.from('fake'));
    const conv = { id: 0, playerId: p1.id, phone: PH1 };
    const msg = { type: 'image', image: { id: 'owa-e2einvoicewa' } };
    nextRead = { ok: true, isTransfer: false, amount: null, payee: '', method: '' };
    sent.length = 0;
    ok('صورة ليست حوالة ⟵ للبوت (لا تحويل)', (await W.handleTransferImage(conv, msg)) === false && sent.length === 0);
    nextRead = { ok: true, isTransfer: true, amount: 2, payee: 'محمد الخطيب', method: 'cliq' };
    ok('حوالة ⟵ عولجت (لا بوت)', (await W.handleTransferImage(conv, msg)) === true);
    const fwd = sent.find(x => x.kind === 'image');
    ok('حُوّلت لرقم المكان', fwd?.to === VENUE_PH, fwd?.to);
    ok('التحويل يحمل الاسم والرقم والمبلغ مطابقاً', !!fwd && fwd.body.includes('رامي فحص') && fwd.body.includes(PH1) && fwd.body.includes('= المطلوب ✓'), fwd?.body);
    ok('ردٌّ ثابت للّاعب', !!sent.find(x => x.kind === 'text' && x.to === PH1 && x.body.includes('وصلتنا صورة الحوالة')));
    let ws = await W.nightWaStatus(act.id);
    ok('الكونسول: «وصلت حوالة»', ws[p1.id]?.transfer?.forwarded === true && ws[p1.id]?.transfer?.short === false);
    nextRead = { ok: true, isTransfer: true, amount: 1, payee: '', method: 'cliq' };
    sent.length = 0;
    await W.handleTransferImage(conv, msg);
    ok('حوالة ناقصة ⟵ تنبيه «أقلّ من المطلوب»', !!sent.find(x => x.kind === 'image' && x.body.includes('أقلّ من المطلوب')));
    ws = await W.nightWaStatus(act.id);
    ok('الكونسول: المبلغ أقلّ', ws[p1.id]?.transfer?.short === true);
    nextRead = { ok: false, isTransfer: false, amount: null, payee: '', method: '' };
    sent.length = 0;
    ok('تعطّل القراءة ⟵ تُحوَّل احتياطاً', (await W.handleTransferImage(conv, msg)) === true && !!sent.find(x => x.kind === 'image' && x.body.includes('قد تكون حوالة')));
    await q(sql`UPDATE locations SET pay_cliq = false WHERE id = ${LOC}`);
    sent.length = 0;
    nextRead = { ok: true, isTransfer: true, amount: 2, payee: '', method: 'cliq' };
    ok('كليك مطفأ في المكان ⟵ الصورة للبوت', (await W.handleTransferImage(conv, msg)) === false && sent.length === 0);
    await q(sql`UPDATE locations SET pay_cliq = true WHERE id = ${LOC}`);
    ok('لاعبٌ لم يصله ملفّ ⟵ للبوت', (await W.handleTransferImage({ id: 0, playerId: null, phone: '0799999985' }, msg)) === false);

    // ══ ٨ · الساعة والنصف ══
    section('٨ · الملفّ التلقائيّ بعد ٩٠ دقيقة');
    await q(sql`UPDATE locations SET min_charge_enabled = true, minimum_charge = 2.00 WHERE id = ${LOC}`);
    const [p2] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH2}, 'لاعب لعب ولم يطلب', 'x') RETURNING id, phone, name`);
    const [p3] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES (${PH3}, 'لاعب لم يلعب', 'x') RETURNING id, phone, name`);
    await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
      VALUES (${act.id}, ${p2.name}, ${p2.phone}, 1, ${p2.id}, 'e2e', false, false), (${act.id}, ${p3.name}, ${p3.phone}, 1, ${p3.id}, 'e2e', false, false)`);
    const [sess] = await q(sql`INSERT INTO sessions (session_code, session_name, activity_id) VALUES ('E2EIWA', ${TAG + ' room'}, ${act.id}) RETURNING id`);
    await q(sql`INSERT INTO session_players (session_id, player_id, physical_id, player_name, joined_at)
      VALUES (${sess.id}, ${p2.id}, 7, ${p2.name}, NOW() - INTERVAL '100 minutes'), (${sess.id}, ${p3.id}, 8, ${p3.name}, NOW() - INTERVAL '100 minutes')`);
    const [m] = await q(sql`INSERT INTO matches (session_id, room_id, room_code, game_name, player_count, is_active, winner)
      VALUES (${sess.id}, 'e2e-iwa', 'E2EIWA', ${TAG + ' game'}, 2, false, 'CITIZEN') RETURNING id`);
    await q(sql`INSERT INTO match_players (match_id, player_id, physical_id, player_name, role) VALUES (${m.id}, ${p2.id}, 7, ${p2.name}, 'SHERIFF')`);
    const n1 = await W.sweepAuto(600_000, act.id);
    const autos = await q(sql`SELECT * FROM invoice_wa_jobs WHERE activity_id = ${act.id} AND kind = 'auto'`);
    ok('لعب ولم يطلب ⟵ ملفٌّ تلقائيّ', autos.length === 1 && Number(autos[0].player_id) === p2.id, `n=${n1} ${JSON.stringify(autos.map(a => a.player_id))}`);
    ok('لم يلعب ⟵ ينتظر (لا ملفّ)', !autos.some(a => Number(a.player_id) === p3.id));
    ok('الفحص مرّةً أخرى لا يكرّر', (await W.sweepAuto(600_000, act.id)) === 0);
    sent.length = 0;
    await W.processJob(await claim(autos[0].id));
    jr = await job(autos[0].id);
    ok('الملفّ التلقائيّ: دخوليّة 3 + حدّ أدنى 2 = 5', jr.status === 'sent' && Number(jr.total) === 5, `${jr.status} ${jr.total} ${jr.reason}`);
    const aimg = sent.find(x => x.kind === 'image');
    ok('تعليقه يشرح الحدّ الأدنى ويقترح الطلب', !!aimg && aimg.body.includes('حدٍّ أدنى') && aimg.body.includes('اطلب الآن'), aimg?.body);
    const p2ord = await addOrder(p2.id, p2.name, (await q(sql`SELECT id FROM bookings WHERE player_id = ${p2.id} AND activity_id = ${act.id}`))[0].id, 'عصير', 2.5);
    d = await buildInvoiceData(db, LOC, act.id, p2.id);
    ok('طلبٌ بعده يُسقط الحدّ: 2.50 + 3 = 5.50', d.grandTotal === 5.5 && d.minTopup === 0, `${d.grandTotal} ${d.minTopup}`);
    void p2ord;

    // ══ ٩ · المفتاح وموقع الاختبار والحالة ══
    section('٩ · المفتاح والحراسات');
    W.testHooks.forceEnabled = false;
    ok('المفتاح مطفأ ⟵ لا جدولة', (await W.scheduleOpen(LOC, act.id, p1.id, {})) === null);
    W.testHooks.forceEnabled = true;
    W.testHooks.allowTestLocation = false;
    ok('موقع اختبار ⟵ لا جدولة', (await W.scheduleOpen(LOC, act.id, p1.id, {})) === null);
    W.testHooks.allowTestLocation = true;
    r = await api(vURL(`/api/venue/invoices/candidates?activityId=${act.id}`), { headers: A });
    ok('«التحصيل» يحمل حالة واتساب لكلّ لاعب', !!r.body?.wa?.[p1.id] && typeof r.body?.waEnabled === 'boolean', JSON.stringify(r.body?.wa?.[p1.id]));
    const flagOn = (await q(sql`SELECT value FROM wa_runtime_flags WHERE key = 'invoice_wa'`))[0]?.value?.enabled === true;
    r = await api(vURL(`/api/venue/invoices/${act.id}/${p1.id}/wa-send`), { method: 'POST', headers: A });
    ok(flagOn ? '«أعد الإرسال» يقبل والمفتاح شغّال' : '«أعد الإرسال» يُرفض والمفتاح مطفأ', flagOn ? r.status === 400 || r.body?.success === true : r.status === 400, JSON.stringify(r.body));
    r = await api('/api/admin/invoice-wa', { headers: A });
    ok('بطاقة الداشبورد تقرأ الحالة', r.body?.success === true && typeof r.body?.enabled === 'boolean' && !!r.body?.channels);
    r = await api('/api/admin/invoice-wa', { method: 'PUT', headers: A, body: JSON.stringify({ enabled: 'yes' }) });
    ok('التبديل بقيمةٍ غير منطقيّة يُرفض', r.status === 400);
    const [{ x: priv }] = await q(sql`SELECT 1 AS x`);
    void priv;
    const pr = await fetch(`${BASE}/uploads/private/wa-invoices/${(img1?.path || '').split('/').pop()}`);
    ok('صور الفواتير لا تُخدَم من الإنترنت', pr.status === 404, String(pr.status));

    // ══ ١٠ · الرسم الحقيقيّ مرّةً واحدة ══
    section('١٠ · رسم الصورة على الخادم');
    d = await buildInvoiceData(db, LOC, act.id, p1.id);
    const t0 = Date.now();
    const jpg = await realRender(invoiceHtml(d, invNo, '', { games: 2, wins: 1, lastRole: 'الشريف' }));
    ok('JPEG حقيقيّ', jpg[0] === 0xff && jpg[1] === 0xd8 && jpg.length > 20_000, `${jpg.length} بايت`);
    console.log(`     ${jpg.length} بايت في ${Date.now() - t0}ms`);
    fs.writeFileSync('/tmp/e2e-invoice-wa.jpg', jpg);
  } finally {
    await cleanup();
    await restore();
  }

  console.log(`\n═══ النتيجة ═══\n\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) { console.log('\n  الإخفاقات:'); failures.forEach(f => console.log(`   • ${f}`)); }
  console.log('  🧹 نُظّفت كلّ بيانات الفحص وأُعيدت إعدادات الموقع');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('💥', e); process.exit(2); });
