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
