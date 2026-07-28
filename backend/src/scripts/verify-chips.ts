// ══════════════════════════════════════════════════════
// 🪙 تحقّق من أساس اقتصاد التشبس (المرحلة 0)
//
// يفحص معايير القبول على قاعدة البيانات الحيّة:
//   1. الجداول والأعمدة والفهارس موجودة
//   2. القيد الفريد يمنع تكرار الحركة فعلياً
//   3. الصرف فوق الرصيد مرفوض ولا يترك أثراً
//   4. الكاش يطابق مجموع الدفتر لكل لاعب
//
// التشغيل داخل الحاوية:
//   docker exec mafia-prod-backend-1 npx tsx src/scripts/verify-chips.ts
//
// ⚠️ حركات الاختبار تُنفَّذ على حساب اختباري فقط (is_test_account)
//    وتُعكس فوراً، فيبقى الصافي صفراً (والدفتر يوثّقها — وهذا مقصود).
// ══════════════════════════════════════════════════════

import { connectDB, getDB, disconnectDB } from '../config/db.js';
import { sql } from 'drizzle-orm';
import { applyChipsTx, auditChipsBalances } from '../services/chips.service.js';

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function rowsOf(res: any): any[] { return res?.rows ?? (Array.isArray(res) ? res : []); }

async function main() {
  await connectDB();
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  console.log('\n🪙 تحقّق أساس التشبس — المرحلة 0\n');

  // ── 1. البنية ──
  console.log('١) البنية:');
  const tbl = rowsOf(await db.execute(sql`SELECT to_regclass('public.chips_ledger') AS t`));
  check(!!tbl[0]?.t, 'جدول chips_ledger موجود');

  const cols = rowsOf(await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'players' AND column_name LIKE 'chips%'
  `)).map((r: any) => r.column_name);
  check(cols.includes('chips_balance'), 'عمود players.chips_balance موجود');
  check(cols.includes('chips_frame_item_id'), 'أعمدة التجهيز موجودة (خاملة حتى المرحلة 1)');

  const idx = rowsOf(await db.execute(sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'chips_ledger'
  `)).map((r: any) => r.indexname);
  check(idx.includes('idx_chips_ledger_idem'), 'الفهرس الفريد على idempotency_key موجود');
  check(idx.includes('idx_chips_ledger_player'), 'فهرس حركات اللاعب موجود');

  // ── 2. حساب الاختبار ──
  const testRows = rowsOf(await db.execute(sql`
    SELECT id, name, COALESCE(chips_balance,0)::int AS bal FROM players
    WHERE is_test_account = true ORDER BY id LIMIT 1
  `));

  if (testRows.length === 0) {
    console.log('\n⚠️  لا يوجد حساب اختباري (is_test_account) — تُخطّى اختبارات الحركة.');
  } else {
    const p = testRows[0];
    const pid = Number(p.id);
    const before = Number(p.bal);
    const stamp = `verify-${Date.now().toString(36)}`;
    console.log(`\n٢) اختبارات الحركة على «${p.name}» (#${pid}، الرصيد ${before} 🪙):`);

    // إيداع
    const r1 = await applyChipsTx({
      playerId: pid, amount: 7, reason: 'admin_adjust',
      idempotencyKey: `${stamp}:in`, refType: 'manual', note: 'اختبار تحقق — إيداع',
    });
    check(r1.ok === true && r1.balance === before + 7, 'الإيداع نجح وحدَّث الرصيد', JSON.stringify(r1));

    // نفس المفتاح مرة ثانية → مكرر بلا حركة جديدة
    const r2 = await applyChipsTx({
      playerId: pid, amount: 7, reason: 'admin_adjust',
      idempotencyKey: `${stamp}:in`, refType: 'manual', note: 'اختبار تحقق — تكرار',
    });
    check(r2.ok === true && r2.duplicate === true && r2.balance === before + 7,
      'إعادة نفس المفتاح لا تُنشئ حركة ثانية (منع التكرار يعمل)', JSON.stringify(r2));

    const cnt = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM chips_ledger WHERE idempotency_key = ${`${stamp}:in`}
    `));
    check(Number(cnt[0]?.c) === 1, 'صف واحد فقط بالدفتر لهذا المفتاح');

    // صرف فوق الرصيد → مرفوض
    const r3 = await applyChipsTx({
      playerId: pid, amount: -(before + 7 + 1000), reason: 'admin_adjust',
      idempotencyKey: `${stamp}:over`, refType: 'manual', note: 'اختبار تحقق — تجاوز',
    });
    check(r3.ok === false && r3.code === 'INSUFFICIENT', 'الصرف فوق الرصيد مرفوض', JSON.stringify(r3));

    const overRow = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM chips_ledger WHERE idempotency_key = ${`${stamp}:over`}
    `));
    check(Number(overRow[0]?.c) === 0, 'المحاولة المرفوضة لم تترك أثراً بالدفتر');

    // عكس الإيداع (إعادة الحساب لحالته)
    const r4 = await applyChipsTx({
      playerId: pid, amount: -7, reason: 'admin_adjust',
      idempotencyKey: `${stamp}:out`, refType: 'manual', note: 'اختبار تحقق — عكس',
    });
    check(r4.ok === true && r4.balance === before, 'عُكست حركة الاختبار — الرصيد عاد كما كان', JSON.stringify(r4));
  }

  // ── 2.5 نموذج الإيجار (المرحلة 1) ──
  console.log('\n٢.٥) خزنة الدون ونموذج الإيجار:');
  const cat = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS c FROM chips_items`));
  check(Number(cat[0]?.c) > 0, `الكتالوج مبذور (${cat[0]?.c} عنصراً)`);

  const noDur = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS c FROM chips_items WHERE duration_days <= 0`));
  check(Number(noDur[0]?.c) === 0, 'لا عنصر بمدة صفرية — لا تملّك أبدي');

  const champ = rowsOf(await db.execute(sql`
    SELECT is_purchasable FROM chips_items WHERE item_key = 'frame_champ' LIMIT 1
  `));
  check(champ.length > 0 && champ[0].is_purchasable === false, 'إكليل البطل غير قابل للشراء (إنجاز فقط)');

  if (testRows.length > 0) {
    const pid = Number(testRows[0].id);
    const { rentItem, getPlayerCosmetics, getActiveRentals } = await import('../services/chips-store.service.js');

    const cheap = rowsOf(await db.execute(sql`
      SELECT id, name_ar, price_chips FROM chips_items
      WHERE is_purchasable = true AND is_active = true AND kind = 'frame'
      ORDER BY price_chips ASC LIMIT 1
    `))[0];

    if (cheap) {
      const price = Number(cheap.price_chips);
      // استئجار بلا رصيد كافٍ → مرفوض
      const poor = await rentItem({ playerId: pid, itemId: Number(cheap.id), requestId: `verify-poor-${Date.now()}` });
      check(poor.ok === false && poor.code === 'INSUFFICIENT', 'الاستئجار بلا رصيد كافٍ مرفوض', JSON.stringify(poor));

      // نشحن ثم نستأجر
      const stamp2 = `verify2-${Date.now().toString(36)}`;
      await applyChipsTx({ playerId: pid, amount: price * 3, reason: 'admin_adjust', idempotencyKey: `${stamp2}:fund`, note: 'اختبار تحقق — تمويل' });

      const rentKey = `verify-rent-${Date.now()}`;
      const r1 = await rentItem({ playerId: pid, itemId: Number(cheap.id), requestId: rentKey });
      check(r1.ok === true && !!r1.expiresAt, `استئجار «${cheap.name_ar}» نجح`, JSON.stringify(r1));

      const exp1 = r1.expiresAt ? new Date(r1.expiresAt as any).getTime() : 0;

      // نفس المفتاح مرة ثانية → لا يمدّد ولا يخصم
      const balBeforeDup = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0]?.b;
      const r2 = await rentItem({ playerId: pid, itemId: Number(cheap.id), requestId: rentKey });
      const exp2 = r2.expiresAt ? new Date(r2.expiresAt as any).getTime() : 0;
      const balAfterDup = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0]?.b;
      check(r2.ok === true && Math.abs(exp2 - exp1) < 2000 && Number(balAfterDup) === Number(balBeforeDup),
        'إعادة نفس طلب الاستئجار لا تمدّد ولا تخصم مرتين',
        `exp∆=${exp2 - exp1}ms · رصيد ${balBeforeDup}→${balAfterDup}`);

      // تجهيز تلقائي للخانة الفارغة
      const cos = await getPlayerCosmetics(pid);
      check(!!cos?.frame && cos.frame.itemId === Number(cheap.id), 'أول شراء يُجهَّز تلقائياً ويظهر بالمظهر');

      // التجديد يمدّد فوق المتبقّي
      const r3 = await rentItem({ playerId: pid, itemId: Number(cheap.id), requestId: `verify-renew-${Date.now()}` });
      const exp3 = r3.expiresAt ? new Date(r3.expiresAt as any).getTime() : 0;
      check(r3.ok === true && r3.renewed === true && exp3 > exp1 + 86000000, 'التجديد يمدّد فوق المتبقّي (لا يبدأ من الصفر)');

      // تنظيف: إنهاء الإيجار + فكّ التجهيز + عكس الرصيد
      const active = await getActiveRentals(pid);
      const mine = active.find(a => a.itemId === Number(cheap.id));
      if (mine) await db.execute(sql`DELETE FROM chips_rentals WHERE id = ${mine.rentalId}`);
      const afterCos = await getPlayerCosmetics(pid);
      check(!afterCos?.frame, 'انتهاء الإيجار يفكّ التجهيز تلقائياً عند القراءة');

      const bal = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      const back = Number(bal?.b || 0);
      if (back > 0) {
        await applyChipsTx({ playerId: pid, amount: -back, reason: 'admin_adjust', idempotencyKey: `${stamp2}:unfund`, note: 'اختبار تحقق — تصفية' });
      }
      const bal2 = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      check(Number(bal2?.b) === 0, 'أُعيد حساب الاختبار لرصيد صفر');
    }
  }

  // ── 3. التطابق العام ──
  console.log('\n٣) تطابق الكاش مع الدفتر:');
  const audit = await auditChipsBalances(false);
  check(audit.drifted.length === 0, `لا انحراف بين الكاش والدفتر (${audit.checked} لاعباً)`,
    audit.drifted.length ? JSON.stringify(audit.drifted.slice(0, 5)) : '');

  // ── 4. البروفايل العام لا يسرّب الرصيد ──
  console.log('\n٤) عدم التسريب:');
  const { getPlayerProfile } = await import('../services/player.service.js');
  const anyPlayer = rowsOf(await db.execute(sql`SELECT id FROM players ORDER BY id LIMIT 1`));
  if (anyPlayer.length) {
    const prof: any = await getPlayerProfile(Number(anyPlayer[0].id));
    const keys = Object.keys(prof?.player || {});
    check(!keys.some(k => k.toLowerCase().startsWith('chips')), 'البروفايل العام لا يحمل أي حقل chips');
    check(!keys.includes('passwordHash'), 'البروفايل العام لا يحمل passwordHash');
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} النتيجة: ${pass} ناجح · ${fail} فاشل\n`);
  await disconnectDB();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('💥 فشل التحقق:', e?.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
