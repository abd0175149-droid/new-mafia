// 🧪 فحص حيّ معزول لمنيو مزاج افندينا عبر استعارة Test Location — نمط e2e-fnb
// يبدّل مصدر الاستعارة عبر PUT /api/locations (النقطة الشرعيّة) ويعيده في النهاية.
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { generatePlayerToken } from '../middleware/player-auth.middleware.js';
import { generateToken } from '../middleware/auth.js';

const BASE = 'http://localhost:4000';
const LOC_TEST = 3;
const TAG = 'E2E-MAZAJ-AUDIT';

let pass = 0, fail = 0;
const bad: string[] = [];
function ok(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; bad.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(t: string) { console.log(`\n═══ ${t} ═══`); }

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => (await db.execute(s)).rows as any[];

  async function cleanup() {
    const acts = await q(sql`SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    for (const a of acts) {
      await q(sql`DELETE FROM service_requests WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM order_invoices WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE activity_id = ${a.id})`);
      await q(sql`DELETE FROM orders WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM bookings WHERE activity_id = ${a.id}`);
      await q(sql`DELETE FROM activities WHERE id = ${a.id}`);
    }
    await q(sql`DELETE FROM players WHERE phone = '0700000997'`);
  }
  await cleanup();

  // ── حفظ مصدر الاستعارة الحاليّ ثم تحويله إلى مزاج (#2) عبر الـAPI ──
  section('التجهيز');
  const [locRow] = await q(sql`SELECT name, region, map_url, menu_source_location_id FROM locations WHERE id = ${LOC_TEST}`);
  const savedSrc = locRow.menu_source_location_id;
  console.log(`  مصدر الاستعارة الحاليّ: ${savedSrc ?? '—'} → سيتحوّل إلى 2 مؤقّتاً`);

  const [adminRow] = await q(sql`SELECT id, username, display_name FROM staff WHERE role='admin' ORDER BY id LIMIT 1`);
  const aTok = generateToken({ id: adminRow.id, username: adminRow.username, role: 'admin', displayName: adminRow.display_name });
  const A = { Authorization: `Bearer ${aTok}`, 'Content-Type': 'application/json' };
  const api = async (path: string, init?: any) => {
    const r = await fetch(BASE + path, init);
    let body: any = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  };
  const setSrc = (src: number | null) => api(`/api/locations/${LOC_TEST}`, {
    method: 'PUT', headers: A,
    body: JSON.stringify({ name: locRow.name, region: locRow.region, mapUrl: locRow.map_url, menuSourceLocationId: src }),
  });

  let r = await setSrc(2);
  ok('تحويل المصدر إلى مزاج عبر الـAPI', r.body?.success === true, JSON.stringify(r.body));

  try {
    // ── لاعب + فعاليّة + حجز (موسومة — تنظيفٌ كامل في النهاية) ──
    const [player] = await q(sql`INSERT INTO players (phone, name, password_hash)
      VALUES ('0700000997', 'لاعب فحص مزاج', 'x') RETURNING id, phone, name`);
    const [act] = await q(sql`INSERT INTO activities (name, date, base_price, status, location_id, menu_ordering_enabled, add_game_fee_to_bill)
      VALUES (${TAG + ' ' + new Date().toISOString().slice(0, 16)}, NOW(), 3.00, 'planned', ${LOC_TEST}, true, false)
      RETURNING id`);
    await q(sql`INSERT INTO bookings (activity_id, name, phone, count, player_id, created_by, is_paid, is_free)
      VALUES (${act.id}, ${player.name}, ${player.phone}, 1, ${player.id}, 'e2e', false, false)`);
    const pTok = generatePlayerToken({ playerId: player.id, phone: player.phone, name: player.name });
    const P = { Authorization: `Bearer ${pTok}`, 'Content-Type': 'application/json' };
    console.log(`  لاعب #${player.id} · فعاليّة #${act.id}`);

    // ── المنيو المستعار = منيو مزاج ──
    section('١ · المنيو المستعار من مزاج');
    const menu = await api(`/api/fnb/menu?activityId=${act.id}`, { headers: P });
    const items: any[] = menu.body?.items ?? [];
    ok('61 صنفاً من منيو مزاج', items.length === 61, `فعليّاً ${items.length}`);
    const by = new Map(items.map(i => [i.name, i]));
    const shisha = by.get('أرجيلة'), fancy = by.get('أرجيلة فاخرة'), kinza = by.get('كينزا'),
      shake = by.get('ميلك شيك'), ice = by.get('بوظة'), water = by.get('مياه'),
      b1 = by.get('أرجيلة + مشروب + مياه'), b4 = by.get('أرجيلة فاخر/نخلة + مشروب مميّز + مياه');
    ok('الأصناف المحوريّة موجودة', !!(shisha && fancy && kinza && shake && ice && water && b1 && b4));

    const grp = (it: any, n: string) => (it.optionGroups as any[]).find(g => g.name === n);
    const val = (it: any, gn: string, vn: string) => grp(it, gn)?.values.find((v: any) => v.name === vn)?.key;
    const slotOf = (b: any, pred: (s: any) => boolean) => (b.slots as any[]).find(pred);

    // ── الطلبات ──
    section('٢ · الطلبات: إلزام النكهة والتسعير السياديّ');
    // ٢.١ أرجيلة بلا نكهة تُرفض
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: shisha.id, quantity: 1 }] }) });
    ok('أرجيلة بلا نكهة تُرفض', r.status === 400 && r.body?.success !== true);

    // ٢.٢ كينزا مفردة بلا نوع تُرفض ثم بنوعٍ = 1.50
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: kinza.id, quantity: 1 }] }) });
    ok('كينزا بلا نوع تُرفض', r.status === 400);
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: kinza.id, quantity: 1, unitPrice: 0.01,
        options: [{ group: grp(kinza, 'نوع الكينزا').key, value: val(kinza, 'نوع الكينزا', 'برتقال') }] }] }) });
    let [o] = await q(sql`SELECT total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
    ok('كينزا برتقال = 1.50 (تجاهل سعر العميل)', r.body?.success === true && o?.total === '1.50', `${o?.total}`);

    // ٢.٣ باقة 1: أرجيلة(عنب) + كينزا(كولا) + مياه = 4.00
    const b1Shisha = slotOf(b1, s => s.kind === 'fixed' && s.menuItemId === shisha.id);
    const b1Choice = slotOf(b1, s => s.kind === 'choice');
    const b1Water = slotOf(b1, s => s.kind === 'fixed' && s.menuItemId === water.id);
    const kCand = b1Choice.from.find((c: any) => c.menuItemId === kinza.id);
    const kg = (kCand.optionGroups as any[]).find(g => g.name === 'نوع الكينزا');
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: b1.id, quantity: 1, slots: [
        { i: b1Shisha.i, options: [{ group: grp(shisha, 'نكهة الأرجيلة').key, value: val(shisha, 'نكهة الأرجيلة', 'عنب') }] },
        { i: b1Choice.i, menuItemId: kinza.id, options: [{ group: kg.key, value: kg.values.find((v: any) => v.name === 'كولا').key }] },
        { i: b1Water.i, options: [] },
      ] }] }) });
    [o] = await q(sql`SELECT total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
    ok('باقة 1 (عنب + كينزا كولا + مياه) = 4.00', r.body?.success === true && o?.total === '4.00', `${o?.total ?? JSON.stringify(r.body)}`);

    // ٢.٤ باقة 1 بكينزا **بلا نوع** تُرفض — الإلزام يسري داخل الخانات
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: b1.id, quantity: 1, slots: [
        { i: b1Shisha.i, options: [{ group: grp(shisha, 'نكهة الأرجيلة').key, value: val(shisha, 'نكهة الأرجيلة', 'عنب') }] },
        { i: b1Choice.i, menuItemId: kinza.id, options: [] },
        { i: b1Water.i, options: [] },
      ] }] }) });
    ok('باقة بكينزا بلا نوع تُرفض', r.status === 400, JSON.stringify(r.body));

    // ٢.٥ باقة 1 بمشروبٍ غير مؤهَّل (بوظة) تُرفض
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: b1.id, quantity: 1, slots: [
        { i: b1Shisha.i, options: [{ group: grp(shisha, 'نكهة الأرجيلة').key, value: val(shisha, 'نكهة الأرجيلة', 'عنب') }] },
        { i: b1Choice.i, menuItemId: ice.id, options: [] },
        { i: b1Water.i, options: [] },
      ] }] }) });
    ok('مرشّح من خارج القائمة يُرفض', r.status === 400);

    // ٢.٦ باقة 4: فاخرة(نخلة) + ميلك شيك(أوريو) + مياه = 6.00
    const b4Shisha = slotOf(b4, s => s.kind === 'fixed' && s.menuItemId === fancy.id);
    const b4Choice = slotOf(b4, s => s.kind === 'choice');
    const b4Water = slotOf(b4, s => s.kind === 'fixed' && s.menuItemId === water.id);
    const sCand = b4Choice.from.find((c: any) => c.menuItemId === shake.id);
    const sg = (sCand.optionGroups as any[]).find(g => g.name === 'نكهة الميلك شيك');
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: b4.id, quantity: 1, slots: [
        { i: b4Shisha.i, options: [{ group: grp(fancy, 'النكهة الفاخرة').key, value: val(fancy, 'النكهة الفاخرة', 'نخلة') }] },
        { i: b4Choice.i, menuItemId: shake.id, options: [{ group: sg.key, value: sg.values.find((v: any) => v.name === 'أوريو').key }] },
        { i: b4Water.i, options: [] },
      ] }] }) });
    [o] = await q(sql`SELECT total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
    ok('باقة 4 (نخلة + ميلك شيك أوريو + مياه) = 6.00', r.body?.success === true && o?.total === '6.00', `${o?.total ?? JSON.stringify(r.body)}`);

    // ٢.٧ بوظة سنيكرز ×2 = 4.00 · ومياه مفردة = 0.00
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: ice.id, quantity: 2,
        options: [{ group: grp(ice, 'نكهة البوظة').key, value: val(ice, 'نكهة البوظة', 'سنيكرز') }] }] }) });
    [o] = await q(sql`SELECT total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
    ok('بوظة سنيكرز ×2 = 4.00', r.body?.success === true && o?.total === '4.00', `${o?.total}`);
    r = await api('/api/fnb/orders', { method: 'POST', headers: P, body: JSON.stringify({
      items: [{ menuItemId: water.id, quantity: 1 }] }) });
    [o] = await q(sql`SELECT total FROM orders WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
    ok('مياه مفردة = 0.00 لا تكسر الطلب', r.body?.success === true && o?.total === '0.00', `${o?.total ?? JSON.stringify(r.body)}`);

    // ── لقطة الفاتورة ──
    section('٣ · الفاتورة');
    const vURL = (p: string) => `${p}${p.includes('?') ? '&' : '?'}locationId=${LOC_TEST}`;
    const cand = await api(vURL(`/api/venue/invoices/candidates?activityId=${act.id}`), { headers: A });
    const c0 = (cand.body?.candidates ?? []).find((c: any) => c.playerId === player.id);
    // 1.50 + 4.00 + 6.00 + 4.00 + 0.00 = 15.50
    ok('مرشّح الفاتورة بمجموع 15.50', c0 && Number(c0.total ?? c0.ordersTotal ?? 0) === 15.5,
      JSON.stringify(c0 ?? cand.body).slice(0, 200));
    const inv = await api(vURL(`/api/venue/invoices/${act.id}/${player.id}/pdf`), { method: 'POST', headers: A });
    ok('الفاتورة تصدر (PDF يسجّلها برقم)', inv.status === 200);
    const [invRow] = await q(sql`SELECT orders_total, grand_total FROM order_invoices WHERE activity_id=${act.id} ORDER BY id DESC LIMIT 1`);
    ok('إجماليّ الفاتورة 15.50', invRow?.orders_total === '15.50' && invRow?.grand_total === '15.50', `orders=${invRow?.orders_total} grand=${invRow?.grand_total}`);

  } finally {
    // ── تنظيفٌ وإرجاع المصدر مهما حدث ──
    section('التنظيف والإرجاع');
    await cleanup();
    const rr = await setSrc(savedSrc ?? null);
    ok(`أُرجع مصدر الاستعارة إلى ${savedSrc ?? '—'}`, rr.body?.success === true);
    const [after] = await q(sql`SELECT menu_source_location_id FROM locations WHERE id=${LOC_TEST}`);
    ok('المصدر في القاعدة كما كان', String(after.menu_source_location_id) === String(savedSrc));
  }

  console.log(`\n═══ النتيجة: ${pass} ✅ · ${fail} ❌ ═══`);
  if (bad.length) { console.log('الإخفاقات:'); bad.forEach(b => console.log('  • ' + b)); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
