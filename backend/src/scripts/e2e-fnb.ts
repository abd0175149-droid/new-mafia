// ══════════════════════════════════════════════════════
// 🧪 الفحص الشامل لمنطق المنيو والطلبات — E2E على الإنتاج، معزولاً
// يجري كاملاً على Test Location (#3) المستعير منيو «كافية جلسة» (#8):
// لا إشعار يصل موظّفاً حقيقيّاً، ولا قرشَ يدخل حسابات جلسة.
// كلّ نداءٍ عبر HTTP على المسارات الحقيقيّة بتوكنات لاعبٍ وإدارةٍ موقَّعة
// بنفس دوالّ النظام — ثمّ تأكيدٌ من قاعدة البيانات مباشرة.
// التنظيف كاملٌ في النهاية (وفي البداية دفاعاً من تشغيلةٍ سابقة فاشلة).
// 📌 العدّة مكتوبة بأسماء أصناف جلسة، فتثبّت مصدر الاستعارة على 8 بنفسها
//    وتعيده كما كان — تبديل المصدر لتجربة منيو مكانٍ آخر لا يكسرها.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { generatePlayerToken } from '../middleware/player-auth.middleware.js';
import { generateToken } from '../middleware/auth.js';
import { runStalledOrderScan, runStalledServiceScan } from '../services/fnb-reminder.service.js';

const BASE = 'http://localhost:4000';
const LOC_TEST = 3;
const E2E_TAG = 'E2E-FNB-AUDIT';

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
  const q = async (s: any) => (await db.execute(s)).rows as any[];

  // ── تنظيف بقايا تشغيلةٍ سابقة ──
  async function cleanup() {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + E2E_TAG + '%'}`);
    for (const a of acts) {
      await q(sql`DELETE FROM service_requests WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM order_invoices WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE activity_id = ${a.id})`);
      await q(sql`DELETE FROM orders WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone = '0700000999'`);
    // 💳 تجهيزات قسم الحدّ الأدنى (٩): غرفة ومباراة موسومتان + لاعبان إضافيّان
    const ms = await q(sql`SELECT id FROM matches WHERE game_name LIKE ${'%' + E2E_TAG + '%'}`);
    for (const m of ms) await q(sql`DELETE FROM match_players WHERE match_id = ${m.id}`);
    await q(sql`DELETE FROM matches WHERE game_name LIKE ${'%' + E2E_TAG + '%'}`);
    const ss = await q(sql`SELECT id FROM sessions WHERE session_name LIKE ${'%' + E2E_TAG + '%'}`);
    for (const s of ss) await q(sql`DELETE FROM session_players WHERE session_id = ${s.id}`);
    await q(sql`DELETE FROM sessions WHERE session_name LIKE ${'%' + E2E_TAG + '%'}`);
    await q(sql`DELETE FROM players WHERE phone IN ('0700000998', '0700000996')`);
  }
  await cleanup();

  // 📌 تثبيت مصدر الاستعارة على جلسة (#8) — يُعاد في النهاية
  const [{ menu_source_location_id: savedSrc }] =
    await q(sql`SELECT menu_source_location_id FROM locations WHERE id = ${LOC_TEST}`);
  if (String(savedSrc) !== '8') {
    await q(sql`UPDATE locations SET menu_source_location_id = 8 WHERE id = ${LOC_TEST}`);
    console.log(`  📌 مصدر الاستعارة ثُبّت على 8 (كان ${savedSrc ?? '—'}) — يُعاد في النهاية`);
  }

  // ── التجهيز: لاعب + فعاليّة + حجز ──
  section('التجهيز');
  const [player] = await q(sql`INSERT INTO players (phone, name, password_hash)
    VALUES ('0700000999', 'لاعب الفحص E2E', 'x') RETURNING id, phone, name`);
  const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, menu_ordering_enabled, add_game_fee_to_bill)
    VALUES (${E2E_TAG + ' ' + new Date().toISOString().slice(0, 16)}, NOW(), 3.00, 'planned', ${LOC_TEST}, true, true)
    RETURNING id`);
  const [booking] = await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
    VALUES (${act.id}, ${player.name}, ${player.phone}, 1, ${player.id}, 'e2e', false, false) RETURNING id`);
  const pTok = generatePlayerToken({ playerId: player.id, phone: player.phone, name: player.name });
  const [adminRow] = await q(sql`SELECT id, username, display_name FROM staff WHERE role='admin' ORDER BY id LIMIT 1`);
  const aTok = generateToken({ id: adminRow.id, username: adminRow.username, role: 'admin', displayName: adminRow.display_name });
  console.log(`  لاعب #${player.id} · فعاليّة #${act.id} · حجز #${booking.id} · إدارة ${adminRow.username}`);

  const P = { Authorization: `Bearer ${pTok}`, 'Content-Type': 'application/json' };
  const A = { Authorization: `Bearer ${aTok}`, 'Content-Type': 'application/json' };
  const api = async (path: string, init?: any) => {
    const r = await fetch(BASE + path, init);
    let body: any = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  };
  const vURL = (p: string) => `${p}${p.includes('?') ? '&' : '?'}locationId=${LOC_TEST}`;

  // ══ ١ · السياق والمنيو ══
  section('١ · السياق والمنيو المستعار');
  const ctx = await api('/api/fnb/context', { headers: P });
  ok('السياق يُحلّ من الحجز داخل النافذة', ctx.body?.success === true && !!ctx.body?.context, JSON.stringify(ctx.body));
  ok('السياق على موقع الاختبار', ctx.body?.context?.locationId === LOC_TEST);

  const menu = await api(`/api/fnb/menu?activityId=${act.id}`, { headers: P });
  const items: any[] = menu.body?.items ?? [];
  ok('المنيو المستعار يصل (66 صنفاً)', items.length === 66, `فعليّاً ${items.length}`);
  ok('لا حصّة نادٍ في منيو اللاعب', items.every(i => !('clubShare' in i)));
  const shisha = items.find(i => i.name === 'أرجيلة');
  const mojito = items.find(i => i.name === 'موهيتو');
  const classic = items.find(i => i.name === 'ول كلاسيك');
  const crispy = items.find(i => i.name === 'كرسبي ون');
  const tea = items.find(i => i.name === 'شاي');
  const pkgSoft = items.find(i => i.name === 'أرجيلة + سوفت درينك');
  const pkgBurger = items.find(i => i.name === 'أرجيلة + غازي + بطاطا + برجر كلاسيك');
  ok('الأصناف المحوريّة موجودة', !!(shisha && mojito && classic && crispy && tea && pkgSoft && pkgBurger));
  ok('باقة البرغر تحمل خانةً مقفلة 150غم', pkgBurger?.slots?.some((s: any) => s.kind === 'fixed' && s.lockedOptions?.['وزن القطعة'] === '150 غم'));
  ok('الباقات بلا مجموعات خياراتٍ على نفسها', items.filter(i => i.isBundle).every((p: any) => (p.optionGroups ?? []).length === 0));
  const gk = (it: any, gname: string) => (it.optionGroups as any[]).find(g => g.name === gname);
  const vk = (it: any, gname: string, vname: string) => gk(it, gname)?.values.find((v: any) => v.name === vname)?.key;

  // ══ ٢ · إنشاء الطلبات: تسعيرٌ سياديّ وخيارات ══
  section('٢ · الطلب: تسعير وتحقّق');
  // ٢.١ صنف بسيط + محاولة تلاعبٍ بالسعر من العميل
  let r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: tea.id, quantity: 2, unitPrice: 0.01, price: '0.01' }], note: 'e2e بسيط' }) });
  ok('طلب شايين يُقبل', r.body?.success === true, JSON.stringify(r.body));
  let [o1] = await q(sql`SELECT id, total, status FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
  ok('التسعير سياديّ — تجاهل سعر العميل (3.00)', o1?.total === '3.00', `فعليّاً ${o1?.total}`);

  // ٢.٢ خيارٌ إلزاميّ ناقص يُرفض
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: shisha.id, quantity: 1 }] }) });
  ok('أرجيلة بلا نكهة تُرفض', r.body?.success !== true && r.status === 400, JSON.stringify(r.body));

  // ٢.٣ أرجيلة نخلة (+1) = 4.50
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: shisha.id, quantity: 1, options: [{ group: gk(shisha, 'النكهة').key, value: vk(shisha, 'النكهة', 'تفاحتين نخلة') }] }] }) });
  let [o2] = await q(sql`SELECT id, total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
  ok('أرجيلة نخلة = 4.50', r.body?.success === true && o2?.total === '4.50', `${o2?.total}`);
  const shishaOrderId = o2?.id;

  // ٢.٤ موهيتو بمستويين: طاقة + فراولة = 3.50
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: mojito.id, quantity: 1, options: [
      { group: gk(mojito, 'الأساس').key, value: vk(mojito, 'الأساس', 'مشروب طاقة') },
      { group: gk(mojito, 'النكهة').key, value: vk(mojito, 'النكهة', 'فراولة') },
    ] }] }) });
  let [o3] = await q(sql`SELECT total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
  ok('موهيتو طاقة+فراولة = 3.50', r.body?.success === true && o3?.total === '3.50', `${o3?.total}`);

  // ٢.٥ برغر + ترقية وجبة = 2.75+0.75+1.00 = 4.50 واللقطة تحمل الخيارين
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: classic.id, quantity: 1, options: [
      { group: gk(classic, 'وزن القطعة').key, value: vk(classic, 'وزن القطعة', '150 غم') },
      { group: gk(classic, 'حوّلها إلى وجبة').key, value: gk(classic, 'حوّلها إلى وجبة').values[0].key },
    ] }] }) });
  let [o4] = await q(sql`SELECT o.total, oi.options_snapshot FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.activity_id=${act.id} ORDER BY o.id DESC LIMIT 1`);
  ok('كلاسيك 150 + وجبة = 4.50', r.body?.success === true && o4?.total === '4.50', `${o4?.total}`);
  ok('اللقطة تحمل الوزن والترقية', JSON.stringify(o4?.options_snapshot).includes('150') && JSON.stringify(o4?.options_snapshot).includes('بطاطا'));

  // ٢.٦ باقة بخانة اختيار: أرجيلة(كاندي) + شاي = 4.00 ثابت
  const slotOf = (p: any, kind: string) => (p.slots as any[]).find(s => s.kind === kind);
  const fixedSlot = slotOf(pkgSoft, 'fixed'), choiceSlot = slotOf(pkgSoft, 'choice');
  const sGroups = fixedSlot.optionGroups as any[];
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: pkgSoft.id, quantity: 1, slots: [
      { i: fixedSlot.i, options: [{ group: sGroups[0].key, value: sGroups[0].values.find((v: any) => v.name === 'كاندي').key }] },
      { i: choiceSlot.i, menuItemId: tea.id, options: [] },
    ] }] }) });
  let [o5] = await q(sql`SELECT o.total, oi.components_snapshot FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.activity_id=${act.id} ORDER BY o.id DESC LIMIT 1`);
  ok('باقة أرجيلة+شاي = 4.00', r.body?.success === true && o5?.total === '4.00', `${o5?.total}`);
  ok('لقطة المكوّنات تحمل النكهة', JSON.stringify(o5?.components_snapshot).includes('كاندي'));

  // ٢.٧ باقة نخلة: الفرق يمرّ = 5.00
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: pkgSoft.id, quantity: 1, slots: [
      { i: fixedSlot.i, options: [{ group: sGroups[0].key, value: sGroups[0].values.find((v: any) => v.name === 'تفاحتين نخلة').key }] },
      { i: choiceSlot.i, menuItemId: tea.id, options: [] },
    ] }] }) });
  let [o6] = await q(sql`SELECT total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
  ok('باقة بنكهة نخلة = 5.00 (الفرق يمرّ)', r.body?.success === true && o6?.total === '5.00', `${o6?.total}`);

  // ٢.٨ خانة اختيارٍ فارغة تُرفض · ٢.٩ اختيارٌ خارج المسموح يُرفض
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: pkgSoft.id, quantity: 1, slots: [
      { i: fixedSlot.i, options: [{ group: sGroups[0].key, value: sGroups[0].values[0].key }] },
      { i: choiceSlot.i, options: [] } ] }] }) });
  ok('خانة اختيارٍ فارغة تُرفض', r.status === 400);
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: pkgSoft.id, quantity: 1, slots: [
      { i: fixedSlot.i, options: [{ group: sGroups[0].key, value: sGroups[0].values[0].key }] },
      { i: choiceSlot.i, menuItemId: classic.id, options: [] } ] }] }) });
  ok('اختيارٌ خارج قائمة الخانة يُرفض', r.status === 400);

  // ٢.١٠ دمج البنود المتطابقة في طلبٍ واحد
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [
      { menuItemId: tea.id, quantity: 1 },
      { menuItemId: tea.id, quantity: 2 },
    ] }) });
  let [o7] = await q(sql`SELECT o.id, o.total, (SELECT count(*) FROM order_items oi WHERE oi.order_id=o.id) items, (SELECT sum(quantity) FROM order_items oi WHERE oi.order_id=o.id) qty FROM orders o WHERE o.activity_id=${act.id} ORDER BY o.id DESC LIMIT 1`);
  ok('بندان متطابقان يُدمجان (سطر واحد ×3)', Number(o7?.items) === 1 && Number(o7?.qty) === 3 && o7?.total === '4.50', `items=${o7?.items} qty=${o7?.qty} total=${o7?.total}`);

  // ٢.١١ مفتاح التكرار: إعادة الإرسال بنفس المفتاح تعيد الطلب الأوّل
  const ck = 'e2e-key-' + Date.now();
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: tea.id, quantity: 1 }], clientKey: ck }) });
  const [{ n_before }] = await q(sql`SELECT count(*)::int AS n_before FROM orders WHERE activity_id=${act.id}`);
  const r2 = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
    items: [{ menuItemId: tea.id, quantity: 1 }], clientKey: ck }) });
  const [{ n_after }] = await q(sql`SELECT count(*)::int AS n_after FROM orders WHERE activity_id=${act.id}`);
  ok('نفس المفتاح لا ينشئ طلباً ثانياً (replayed)', r.body?.success === true && r2.body?.replayed === true && Number(n_before) === Number(n_after), `before=${n_before} after=${n_after}`);

  // ══ ٣ · تكرار الطلبات والسقوف ══
  section('٣ · تكرار الطلبات والسقوف');
  // السقف يَعُدّ كلّ غير الملغيّ (بما فيه المسلَّم) — نملأ حتى ١٠
  const [{ open_now }] = await q(sql`SELECT count(*)::int AS open_now FROM orders WHERE activity_id=${act.id} AND player_id=${player.id} AND status != 'cancelled'`);
  const toFill = 10 - Number(open_now);
  for (let i = 0; i < toFill; i++) {
    await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({ items: [{ menuItemId: tea.id, quantity: 1 }] }) });
  }
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({ items: [{ menuItemId: tea.id, quantity: 1 }] }) });
  ok('السقف: الطلب الحادي عشر يُرفض 429', r.status === 429, `status=${r.status} ${JSON.stringify(r.body)}`);

  const my = await api(`/api/fnb/my-orders?activityId=${act.id}`, { headers: P });
  ok('طلباتي تعيد كلّ الطلبات', (my.body?.orders?.length ?? 0) >= 10, `${my.body?.orders?.length}`);

  // إلغاء طلبٍ جديد يفكّ السقف
  const newest = my.body.orders[0];
  r = await api(`/api/fnb/orders/${newest.id}/cancel`, { method: 'POST', headers: P });
  ok('إلغاء طلبٍ جديد يُقبل', r.body?.success === true);
  r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({ items: [{ menuItemId: tea.id, quantity: 1 }] }) });
  ok('بعد الإلغاء يُقبل طلبٌ جديد', r.body?.success === true);

  // ══ ٤ · الكونسول: الاستلام والمراحل ══
  section('٤ · الكونسول: المراحل والانتقالات');
  const vOrders = await api(vURL('/api/venue/orders'), { headers: A });
  ok('كونسول موقع الاختبار يرى الطلبات', (vOrders.body?.orders?.length ?? 0) >= 10, `${vOrders.body?.orders?.length}`);
  ok('العزل: لا طلب منها على جلسة', (await q(sql`SELECT count(*)::int n FROM orders WHERE location_id=8 AND activity_id=${act.id}`))[0].n === 0);

  // new → preparing → delivered على طلب الأرجيلة
  r = await api(vURL(`/api/venue/orders/${shishaOrderId}/status`), { method: 'PUT', headers: A, body: JSON.stringify({ status: 'preparing' }) });
  ok('new→preparing يُقبل', r.body?.success === true, JSON.stringify(r.body));
  let [os] = await q(sql`SELECT status, status_changed_at, status_changed_by FROM orders WHERE id=${shishaOrderId}`);
  ok('statusChangedAt/By يُختمان', !!os.status_changed_at && os.status_changed_by === adminRow.id);
  r = await api(vURL(`/api/venue/orders/${shishaOrderId}/status`), { method: 'PUT', headers: A, body: JSON.stringify({ status: 'delivered' }) });
  ok('preparing→delivered يُقبل', r.body?.success === true);
  r = await api(vURL(`/api/venue/orders/${shishaOrderId}/status`), { method: 'PUT', headers: A, body: JSON.stringify({ status: 'new' }) });
  ok('delivered→new (رجوع) يُرفض', r.body?.success !== true, JSON.stringify(r.body));
  r = await api(`/api/fnb/orders/${shishaOrderId}/cancel`, { method: 'POST', headers: P });
  ok('اللاعب لا يلغي طلباً سُلّم', r.body?.success !== true);

  // ══ ٥ · التذكير (٥ دقائق) ══
  section('٥ · تذكير الطلبات المتأخّرة');
  const [stale] = await q(sql`SELECT id FROM orders WHERE activity_id=${act.id} AND status='new' ORDER BY id LIMIT 1`);
  await q(sql`UPDATE orders SET created_at = NOW() - INTERVAL '6 minutes', status_changed_at = NULL, reminder_sent_at = NULL, reminder_count = 0 WHERE id=${stale.id}`);
  await runStalledOrderScan();
  let [rem] = await q(sql`SELECT reminder_count, reminder_sent_at FROM orders WHERE id=${stale.id}`);
  ok('طلبٌ متأخّر 6د يُذكَّر (عدّاد=1 + ختم)', Number(rem.reminder_count) === 1 && !!rem.reminder_sent_at, `count=${rem.reminder_count}`);
  await runStalledOrderScan();
  [rem] = await q(sql`SELECT reminder_count FROM orders WHERE id=${stale.id}`);
  ok('لا تذكير ثانٍ قبل مرور ٥ دقائق أخرى', Number(rem.reminder_count) === 1, `count=${rem.reminder_count}`);
  await q(sql`UPDATE orders SET reminder_sent_at = NOW() - INTERVAL '6 minutes', reminder_count = 3 WHERE id=${stale.id}`);
  await runStalledOrderScan();
  [rem] = await q(sql`SELECT reminder_count FROM orders WHERE id=${stale.id}`);
  ok('سقف الثلاثة تذكيرات يُحترم', Number(rem.reminder_count) === 3);

  // ══ ٦ · خدمة الأرجيلة ══
  section('٦ · خدمة الأرجيلة (فحم/تزبيط)');
  let svc = await api('/api/fnb/service/state', { headers: P });
  ok('الخدمة متاحة بعد تسليم أرجيلة', svc.body?.available === true, JSON.stringify(svc.body));
  r = await api('/api/fnb/service', { method: 'POST', headers: P, body: JSON.stringify({ kind: 'coal', note: 'فحم e2e' }) });
  ok('طلب فحم يُقبل', r.status === 201 && r.body?.success === true, JSON.stringify(r.body));
  const svcId = r.body?.request?.id;
  r = await api('/api/fnb/service', { method: 'POST', headers: P, body: JSON.stringify({ kind: 'fix' }) });
  ok('طلبٌ ثانٍ أثناء المعلَّق يُرفض 429', r.status === 429);
  r = await api('/api/fnb/service', { method: 'POST', headers: P, body: JSON.stringify({ kind: 'blah' }) });
  ok('نوعٌ مجهول يُرفض', r.status === 400 || r.status === 429);

  const vSvc = await api(vURL('/api/venue/service'), { headers: A });
  ok('الكونسول يرى طلب الخدمة', vSvc.body?.requests?.some((s: any) => s.id === svcId));

  // تذكير الخدمة
  await q(sql`UPDATE service_requests SET created_at = NOW() - INTERVAL '6 minutes' WHERE id=${svcId}`);
  await runStalledServiceScan();
  let [srem] = await q(sql`SELECT reminder_count FROM service_requests WHERE id=${svcId}`);
  ok('تذكير خدمةٍ متأخّرة 6د', Number(srem.reminder_count) === 1, `count=${srem.reminder_count}`);

  r = await api(vURL(`/api/venue/service/${svcId}/done`), { method: 'PUT', headers: A });
  ok('إغلاق الخدمة يُقبل', r.body?.success === true);
  r = await api(vURL(`/api/venue/service/${svcId}/done`), { method: 'PUT', headers: A });
  ok('إغلاقٌ مكرّر يُرفض', r.status === 404);
  svc = await api('/api/fnb/service/state', { headers: P });
  ok('بعد الإغلاق يستطيع الطلب ثانيةً', svc.body?.available === true && !svc.body?.pending);

  // ══ ٧ · الفواتير والمحاسبة ══
  section('٧ · الفواتير والمحاسبة');
  // مجموع الطلبات غير الملغاة من القاعدة
  const [{ expected_total }] = await q(sql`SELECT COALESCE(sum(total::numeric),0)::text AS expected_total FROM orders WHERE activity_id=${act.id} AND player_id=${player.id} AND status != 'cancelled'`);
  const cand = await api(vURL(`/api/venue/invoices/candidates?activityId=${act.id}`), { headers: A });
  const meCand = (cand.body?.players ?? cand.body?.candidates ?? []).find((c: any) => c.playerId === player.id);
  ok('اللاعب مرشّحٌ للفوترة', !!meCand, JSON.stringify(cand.body).slice(0, 200));

  // القراءة لا تستهلك رقماً
  const before = (await q(sql`SELECT COALESCE(max(invoice_no),0)::int AS n FROM order_invoices WHERE location_id=${LOC_TEST}`))[0].n;
  await api(vURL(`/api/venue/invoices/${act.id}/${player.id}`), { headers: A });
  const afterRead = (await q(sql`SELECT COALESCE(max(invoice_no),0)::int AS n FROM order_invoices WHERE location_id=${LOC_TEST}`))[0].n;
  ok('قراءة الفاتورة لا تستهلك رقماً', afterRead === before);

  // إصدار PDF يستهلك رقماً ويجمّد اللقطة
  r = await api(vURL(`/api/venue/invoices/${act.id}/${player.id}/pdf`), { method: 'POST', headers: A });
  ok('إصدار الفاتورة PDF يعمل', r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
  let [inv] = await q(sql`SELECT * FROM order_invoices WHERE activity_id=${act.id} AND player_id=${player.id} ORDER BY id DESC LIMIT 1`);
  ok('الفاتورة سُجّلت برقم', !!inv && Number(inv.invoice_no) > before, `no=${inv?.invoice_no}`);
  ok('مجموع الطلبات في الفاتورة صحيح', Number(inv?.orders_total) === Number(expected_total), `فاتورة=${inv?.orders_total} متوقَّع=${expected_total}`);
  ok('رسوم اللعبة أُضيفت (3.00)', inv?.game_fee_applied === true && inv?.game_fee_amount === '3.00');
  ok('الإجمالي = طلبات + رسوم', Math.abs(Number(inv?.grand_total) - (Number(expected_total) + 3)) < 0.005, `${inv?.grand_total}`);

  // إعادة الإصدار لا تكرّر الرقم لنفس اللاعب
  r = await api(vURL(`/api/venue/invoices/${act.id}/${player.id}/pdf`), { method: 'POST', headers: A });
  const invCount = (await q(sql`SELECT count(*)::int n FROM order_invoices WHERE activity_id=${act.id} AND player_id=${player.id}`))[0].n;
  ok('إعادة الطباعة لا تنشئ فاتورةً ثانية', invCount === 1, `count=${invCount}`);

  // الدفع يقلب الفاتورة والحجز معاً
  r = await api(vURL(`/api/venue/invoices/${act.id}/${player.id}/pay`), { method: 'POST', headers: A });
  ok('تسجيل الدفع يُقبل', r.body?.success === true, JSON.stringify(r.body));
  const [bAfter] = await q(sql`SELECT is_paid, paid_amount FROM bookings WHERE id=${booking.id}`);
  const [iAfter] = await q(sql`SELECT is_paid, paid_by FROM order_invoices WHERE activity_id=${act.id} AND player_id=${player.id}`);
  ok('الحجز انقلب مدفوعاً', bAfter?.is_paid === true, JSON.stringify(bAfter));
  ok('الفاتورة مدفوعة وباسم المحصّل', iAfter?.is_paid === true && iAfter?.paid_by === adminRow.id);
  r = await api(vURL(`/api/venue/invoices/${act.id}/${player.id}/pay`), { method: 'POST', headers: A });
  ok('دفعٌ مكرّر يُرفض 400', r.status === 400 && r.body?.success !== true, `status=${r.status}`);

  // إعادة طباعة فاتورةٍ محصَّلة لا تصفّر رسومها (كان الحجز صار مدفوعاً فتُحسب 0)
  r = await api(vURL(`/api/venue/invoices/${act.id}/${player.id}/pdf`), { method: 'POST', headers: A });
  const [invRe] = await q(sql`SELECT game_fee_amount, game_fee_applied, grand_total, is_paid FROM order_invoices WHERE activity_id=${act.id} AND player_id=${player.id}`);
  ok('إعادة طباعة المحصَّلة تحفظ الرسوم (3.00)', r.status === 200 && invRe?.game_fee_amount === '3.00' && invRe?.game_fee_applied === true && invRe?.is_paid === true, JSON.stringify(invRe));

  // إلغاء اللاعب طلباً بعد تحصيل الفاتورة — محظور
  const [freshNew] = await q(sql`SELECT id FROM orders WHERE activity_id=${act.id} AND player_id=${player.id} AND status='new' ORDER BY id DESC LIMIT 1`);
  if (freshNew) {
    r = await api(`/api/fnb/orders/${freshNew.id}/cancel`, { method: 'POST', headers: P });
    ok('إلغاءٌ بعد التحصيل يُرفض', r.status === 400 && String(r.body?.error || '').includes('حُصِّلت'), JSON.stringify(r.body));
  } else { ok('إلغاءٌ بعد التحصيل يُرفض', false, 'لا طلب new متبقٍّ للفحص'); }

  // الدخل من اللقطات
  const rev = await api(vURL(`/api/venue/revenue?from=2000-01-01&to=2100-01-01`), { headers: A });
  const revOK = rev.body?.success === true;
  const gross = Number(rev.body?.totals?.gross ?? rev.body?.gross ?? NaN);
  ok('تقرير الدخل يعمل', revOK, JSON.stringify(rev.body).slice(0, 150));
  ok('إجماليّ الدخل ≥ مجموع طلباتنا', !Number.isNaN(gross) && gross >= Number(expected_total), `gross=${gross}`);

  // حارس حذف مكوّن باقةٍ حيّة — بطاطا مقلية داخل باقات جلسة
  const [fries] = await q(sql`SELECT id FROM menu_items WHERE location_id=8 AND name='بطاطا مقلية' AND deleted_at IS NULL LIMIT 1`);
  if (fries) {
    r = await api(`/api/venue/menu-items/${fries.id}?locationId=8`, { method: 'DELETE', headers: A });
    const [still] = await q(sql`SELECT deleted_at FROM menu_items WHERE id=${fries.id}`);
    if (still?.deleted_at) await q(sql`UPDATE menu_items SET deleted_at=NULL WHERE id=${fries.id}`); // استرجاعٌ دفاعيّ
    ok('حذف مكوّن باقةٍ حيّة يُرفض 400', r.status === 400 && !still?.deleted_at, `status=${r.status} ${JSON.stringify(r.body)}`);
  } else { ok('حذف مكوّن باقةٍ حيّة يُرفض 400', false, 'بطاطا مقلية غير موجودة'); }

  // معرّف خدمةٍ غير رقميّ → 400 لا 500
  r = await api(vURL('/api/venue/service/abc/done'), { method: 'PUT', headers: A });
  ok('معرّف خدمةٍ غير رقميّ يُرفض 400', r.status === 400, `status=${r.status}`);

  // طباعة كلّ الفواتير
  const all = await fetch(BASE + vURL(`/api/venue/invoices/${act.id}/print-all`), { headers: A });
  ok('طباعة فواتير الفعاليّة كاملةً تعمل', all.status === 200, `status=${all.status}`);

  // ══ ٩ · الحدّ الأدنى للاستهلاك ══
  section('٩ · الحدّ الأدنى للاستهلاك');
  // إعدادات المكان تُحفظ وتُعاد في النهاية — الفحص لا يترك أثراً
  const [minSaved] = await q(sql`SELECT min_charge_enabled AS en, minimum_charge AS val FROM locations WHERE id = ${LOC_TEST}`);
  await q(sql`UPDATE locations SET min_charge_enabled = true, minimum_charge = 3.00 WHERE id = ${LOC_TEST}`);

  // فعاليّة نظيفة (بلا رسوم لعبة — عزل الحساب) + ثلاثة لاعبين:
  //   999: لعب وطلب 1.50 → تكملة 1.50 · 998: لعب بلا طلبات → تكملة 3.00
  //   996: طلب 1.50 ولم يلعب → لا تكملة
  const [act9] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, menu_ordering_enabled, add_game_fee_to_bill)
    VALUES (${E2E_TAG + ' minChg'}, NOW(), 3.00, 'planned', ${LOC_TEST}, true, false) RETURNING id`);
  const [p998] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES ('0700000998', 'لاعبٌ لعب بلا طلبات', 'x') RETURNING id, phone, name`);
  const [p996] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES ('0700000996', 'طلب ولم يلعب', 'x') RETURNING id, phone, name`);
  await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
    VALUES (${act9.id}, ${player.name}, ${player.phone}, 1, ${player.id}, 'e2e', false, false),
           (${act9.id}, ${p996.name}, ${p996.phone}, 1, ${p996.id}, 'e2e', false, false)`);
  // «لعب جولةً» = صفّ match_players عبر sessions(activity_id) — نفس ما يكتبه binding-complete
  const [sess9] = await q(sql`INSERT INTO sessions (session_code, session_name, activity_id)
    VALUES ('E2E9CH', ${E2E_TAG + ' room'}, ${act9.id}) RETURNING id`);
  // 999 يجلس في الغرفة الحيّة → سياق طلبه يتحدّد على فعاليّة هذا القسم حتماً
  // (قاعدة «الغرفة الحيّة هي الحدث») لا على حجزه الأقدم في فعاليّة الأقسام السابقة
  await q(sql`INSERT INTO session_players (session_id, player_id, physical_id, player_name)
    VALUES (${sess9.id}, ${player.id}, 1, ${player.name})`);
  const [m9] = await q(sql`INSERT INTO matches (session_id, room_id, room_code, game_name, player_count)
    VALUES (${sess9.id}, 'e2e-room', 'E2E9CH', ${E2E_TAG + ' game'}, 2) RETURNING id`);
  await q(sql`INSERT INTO match_players (match_id, player_id, physical_id, player_name, role)
    VALUES (${m9.id}, ${player.id}, 1, ${player.name}, 'citizen'),
           (${m9.id}, ${p998.id}, 2, ${p998.name}, 'mafia')`);

  // طلبا الشاي (1.50): من 999 (لعب) ومن 996 (لم يلعب)
  const p996Tok = generatePlayerToken({ playerId: p996.id, phone: p996.phone, name: p996.name });
  for (const tok of [pTok, p996Tok]) {
    r = await api('/api/fnb/orders', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId: act9.id, items: [{ menuItemId: tea.id, quantity: 1 }] }) });
    if (r.body?.success !== true) ok('طلب شاي فعاليّة الحدّ الأدنى', false, JSON.stringify(r.body));
  }

  const cand9 = await api(vURL(`/api/venue/invoices/candidates?activityId=${act9.id}`), { headers: A });
  const cs: any[] = cand9.body?.candidates ?? [];
  const c999 = cs.find(c => c.playerId === player.id);
  const c998 = cs.find(c => c.playerId === p998.id);
  const c996 = cs.find(c => c.playerId === p996.id);
  ok('الحدّ مفعَّل في الاستجابة', cand9.body?.minChargeEnabled === true && cand9.body?.minimumCharge === 3);
  ok('لَعِبَ وطلب 1.50 → تكملة 1.50 وإجماليّ 3.00', c999?.minTopup === 1.5 && c999?.grandTotal === 3, JSON.stringify(c999));
  ok('لَعِبَ بلا طلبات → مرشّحٌ بتكملة 3.00', c998?.ordersCount === 0 && c998?.minTopup === 3 && c998?.grandTotal === 3, JSON.stringify(c998));
  ok('طلب ولم يلعب → بلا تكملة', c996?.minTopup === 0 && c996?.grandTotal === 1.5, JSON.stringify(c996));

  // فاتورة من لم يطلب: سطر التكملة وحده — والإصدار يجمّدها
  r = await api(vURL(`/api/venue/invoices/${act9.id}/${p998.id}/pdf`), { method: 'POST', headers: A });
  ok('فاتورة التكملة وحدها تصدر', r.status === 200, `status=${r.status}`);
  let [inv9] = await q(sql`SELECT orders_total, min_topup, grand_total FROM order_invoices WHERE activity_id=${act9.id} AND player_id=${p998.id}`);
  ok('لقطتها: طلبات 0 + تكملة 3.00 = 3.00', inv9?.orders_total === '0.00' && inv9?.min_topup === '3.00' && inv9?.grand_total === '3.00', JSON.stringify(inv9));

  r = await api(vURL(`/api/venue/invoices/${act9.id}/${p998.id}/pay`), { method: 'POST', headers: A });
  ok('تحصيل فاتورة التكملة يُقبل', r.body?.success === true, JSON.stringify(r.body));

  // تعطيل الحدّ بعد التحصيل: المحصَّلة تبقى بلقطتها، والحيّة تفقد تكملتها
  await q(sql`UPDATE locations SET min_charge_enabled = false WHERE id = ${LOC_TEST}`);
  const cand9b = await api(vURL(`/api/venue/invoices/candidates?activityId=${act9.id}`), { headers: A });
  const cs2: any[] = cand9b.body?.candidates ?? [];
  const b998 = cs2.find(c => c.playerId === p998.id);
  const b999 = cs2.find(c => c.playerId === player.id);
  ok('بعد التعطيل: المحصَّلة مجمَّدة على 3.00', b998?.isPaid === true && b998?.minTopup === 3 && b998?.grandTotal === 3, JSON.stringify(b998));
  ok('بعد التعطيل: غير المحصَّلة بلا تكملة', b999?.minTopup === 0 && b999?.grandTotal === 1.5, JSON.stringify(b999));
  r = await api(vURL(`/api/venue/invoices/${act9.id}/print-all`), { headers: A });
  ok('طباعة الكلّ تشمل فاتورة التكملة المؤرشفة', r.status === 200, `status=${r.status}`);

  await q(sql`UPDATE locations SET min_charge_enabled = ${minSaved.en === true}, minimum_charge = ${minSaved.val} WHERE id = ${LOC_TEST}`);

  // ══ ١٠ · الماء التلقائيّ ══
  section('١٠ · الماء التلقائيّ على الفواتير');
  const [waterSaved] = await q(sql`SELECT auto_water AS aw, min_charge_enabled AS en FROM locations WHERE id = ${LOC_TEST}`);
  await q(sql`UPDATE locations SET auto_water = true, min_charge_enabled = false WHERE id = ${LOC_TEST}`);

  // فعاليّة نظيفة + غرفة حيّة جديدة: انضمام 999 و996 إليها الأحدث يجعل سياق
  // طلبيهما عليها (قاعدة «الغرفة الحيّة» بأحدث جلوس) — و998 لعب بلا طلبات
  const [act10] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, menu_ordering_enabled, add_game_fee_to_bill)
    VALUES (${E2E_TAG + ' water'}, NOW(), 3.00, 'planned', ${LOC_TEST}, true, false) RETURNING id`);
  await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
    VALUES (${act10.id}, ${player.name}, ${player.phone}, 1, ${player.id}, 'e2e', false, false),
           (${act10.id}, ${p996.name}, ${p996.phone}, 1, ${p996.id}, 'e2e', false, false)`);
  const [sess10] = await q(sql`INSERT INTO sessions (session_code, session_name, activity_id)
    VALUES ('E2E10W', ${E2E_TAG + ' water room'}, ${act10.id}) RETURNING id`);
  await q(sql`INSERT INTO session_players (session_id, player_id, physical_id, player_name)
    VALUES (${sess10.id}, ${player.id}, 1, ${player.name}), (${sess10.id}, ${p996.id}, 2, ${p996.name})`);
  const [m10] = await q(sql`INSERT INTO matches (session_id, room_id, room_code, game_name, player_count)
    VALUES (${sess10.id}, 'e2e-room-w', 'E2E10W', ${E2E_TAG + ' water game'}, 2) RETURNING id`);
  await q(sql`INSERT INTO match_players (match_id, player_id, physical_id, player_name, role)
    VALUES (${m10.id}, ${player.id}, 1, ${player.name}, 'citizen'),
           (${m10.id}, ${p998.id}, 3, ${p998.name}, 'mafia')`);

  // 999: شاي بلا ماء → ماءٌ تلقائيّ 0.50
  r = await api('/api/fnb/orders', { method: 'POST', headers: P,
    body: JSON.stringify({ items: [{ menuItemId: tea.id, quantity: 1 }] }) });
  ok('طلب شاي فعاليّة الماء يُقبل', r.body?.success === true, JSON.stringify(r.body));

  // 996: باقة «سوفت درينك + ماء» تحوي الماء → لا ماء تلقائيّ
  const pkgWater = items.find(i => i.name === 'سوفت درينك + ماء');
  ok('باقة «سوفت درينك + ماء» موجودة', !!pkgWater);
  if (pkgWater) {
    const chSlot = (pkgWater.slots as any[]).find(sl => sl.kind === 'choice');
    const fxSlots = (pkgWater.slots as any[]).filter(sl => sl.kind === 'fixed');
    r = await api('/api/fnb/orders', { method: 'POST',
      headers: { Authorization: `Bearer ${p996Tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ menuItemId: pkgWater.id, quantity: 1, slots: [
        { i: chSlot.i, menuItemId: tea.id, options: [] },
        ...fxSlots.map((sl: any) => ({ i: sl.i, options: [] })),
      ] }] }) });
    ok('طلب الباقة ذات الماء يُقبل', r.body?.success === true, JSON.stringify(r.body));
  }

  const cw = await api(vURL(`/api/venue/invoices/candidates?activityId=${act10.id}`), { headers: A });
  const cws: any[] = cw.body?.candidates ?? [];
  const w999 = cws.find(c => c.playerId === player.id);
  const w996 = cws.find(c => c.playerId === p996.id);
  const w998 = cws.find(c => c.playerId === p998.id);
  ok('الماء مفعَّل في الاستجابة بسعر 0.50', cw.body?.autoWaterEnabled === true && cw.body?.waterPrice === 0.5, JSON.stringify([cw.body?.autoWaterEnabled, cw.body?.waterPrice]));
  ok('شايٌ بلا ماء → ماء 0.50 وإجماليّ 2.00', w999?.waterCharge === 0.5 && w999?.grandTotal === 2, JSON.stringify(w999));
  ok('عرضٌ يحوي الماء → لا ماء تلقائيّ', w996?.waterCharge === 0 && w996?.grandTotal === 1.5, JSON.stringify(w996));
  ok('لعب بلا طلبات → فاتورة ماءٍ وحده 0.50', w998?.ordersCount === 0 && w998?.waterCharge === 0.5 && w998?.grandTotal === 0.5, JSON.stringify(w998));

  // 999 يطلب ماءً مفرداً → ماؤه من طلبه لا تلقائيّاً
  const waterItem = items.find(i => i.name === 'ماء');
  ok('صنف «ماء» في المنيو المستعار', !!waterItem);
  if (waterItem) {
    r = await api('/api/fnb/orders', { method: 'POST', headers: P,
      body: JSON.stringify({ items: [{ menuItemId: waterItem.id, quantity: 1 }] }) });
    const cw2 = await api(vURL(`/api/venue/invoices/candidates?activityId=${act10.id}`), { headers: A });
    const w999b = (cw2.body?.candidates ?? []).find((c: any) => c.playerId === player.id);
    ok('طلب ماءً بنفسه → التلقائيّ يسقط والإجماليّ 2.00', w999b?.waterCharge === 0 && w999b?.grandTotal === 2, JSON.stringify(w999b));
  }

  // إصدار فاتورة 998 وتحصيلها ثم تعطيل الميزة: اللقطة تصمد
  r = await api(vURL(`/api/venue/invoices/${act10.id}/${p998.id}/pdf`), { method: 'POST', headers: A });
  ok('فاتورة الماء وحده تصدر', r.status === 200, `status=${r.status}`);
  const [invW] = await q(sql`SELECT orders_total, water_charge, grand_total FROM order_invoices WHERE activity_id=${act10.id} AND player_id=${p998.id}`);
  ok('لقطتها: طلبات 0 + ماء 0.50 = 0.50', invW?.orders_total === '0.00' && invW?.water_charge === '0.50' && invW?.grand_total === '0.50', JSON.stringify(invW));
  r = await api(vURL(`/api/venue/invoices/${act10.id}/${p998.id}/pay`), { method: 'POST', headers: A });
  ok('تحصيل فاتورة الماء يُقبل', r.body?.success === true, JSON.stringify(r.body));

  // 💵 التحصيل المباشر بلا إصدار PDF مسبق (2026-08-12): الخادم يُصدر الرقم بنفسه
  //    — كان يردّ «أصدر الفاتورة أوّلاً» فيفرض تبويب PDF قبل كلّ قبض
  const before996 = (await q(sql`SELECT count(*)::int n FROM order_invoices WHERE activity_id=${act10.id} AND player_id=${p996.id}`))[0].n;
  r = await api(vURL(`/api/venue/invoices/${act10.id}/${p996.id}/pay`), { method: 'POST', headers: A });
  const [inv996] = await q(sql`SELECT invoice_no, is_paid FROM order_invoices WHERE activity_id=${act10.id} AND player_id=${p996.id}`);
  ok('تحصيلٌ بلا إصدارٍ مسبق يُصدر الرقم ويقبض',
    before996 === 0 && r.body?.success === true && Number(inv996?.invoice_no) > 0 && inv996?.is_paid === true,
    JSON.stringify([before996, r.body, inv996]));
  ok('الردّ يحمل رقم الفاتورة للتوست', Number(r.body?.invoiceNo) === Number(inv996?.invoice_no), JSON.stringify(r.body));
  await q(sql`UPDATE locations SET auto_water = false WHERE id = ${LOC_TEST}`);
  const cw3 = await api(vURL(`/api/venue/invoices/candidates?activityId=${act10.id}`), { headers: A });
  const w998b = (cw3.body?.candidates ?? []).find((c: any) => c.playerId === p998.id);
  const w999c = (cw3.body?.candidates ?? []).find((c: any) => c.playerId === player.id);
  ok('بعد التعطيل: المحصَّلة مجمَّدة على مائها', w998b?.isPaid === true && w998b?.waterCharge === 0.5, JSON.stringify(w998b));
  ok('بعد التعطيل: الحيّة بلا ماء', w999c?.waterCharge === 0, JSON.stringify(w999c));

  await q(sql`UPDATE locations SET auto_water = ${waterSaved.aw === true}, min_charge_enabled = ${waterSaved.en === true} WHERE id = ${LOC_TEST}`);

  // ══ ٨ · الخلاصة والتنظيف ══
  section('النتيجة');
  console.log(`\n  ✅ نجح: ${pass}   ❌ فشل: ${fail}`);
  if (failures.length) { console.log('  الإخفاقات:'); failures.forEach(f => console.log(`   • ${f}`)); }

  await cleanup();
  if (String(savedSrc) !== '8') {
    await q(sql`UPDATE locations SET menu_source_location_id = ${savedSrc} WHERE id = ${LOC_TEST}`);
    console.log(`  📌 أُعيد مصدر الاستعارة إلى ${savedSrc ?? '—'}`);
  }
  console.log('  🧹 نُظّفت كلّ بيانات الفحص');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('💥', e); process.exit(2); });
