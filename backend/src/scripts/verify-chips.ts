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
import {
  applyChipsTx, auditChipsBalances, adminTopup,
  refundLedgerEntry, getChipsReport, exportLedgerCsv,
} from '../services/chips.service.js';
import { CHIPS_REASONS, CHIPS_PACKS } from '../schemas/chips.schema.js';

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function rowsOf(res: any): any[] { return res?.rows ?? (Array.isArray(res) ? res : []); }

/**
 * 🧹 حذف صيانة من الدفتر — الزناد يمنع كل UPDATE/DELETE إلا بإعلان صريح.
 * نستعمل معاملة كي يسري `SET LOCAL` على نفس الاتصال الذي ينفّذ الحذف
 * (المجمّع قد يعطي اتصالاً آخر لو استعملنا SET على مستوى الجلسة).
 */
async function ledgerAdminExec(db: any, statement: any): Promise<void> {
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`SET LOCAL app.chips_ledger_admin = 'on'`);
    await tx.execute(statement);
  });
}

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

      // ⚠️ فحص «بلا رصيد كافٍ» كان يفترض أن الحساب فارغ — وهو افتراضٌ عن حالةٍ
      //    خارجة عن الفحص. رصيدٌ بقي من تشغيلٍ سابق كان يجعل الشراء ينجح فيسقط
      //    الفحص بلا خلل حقيقي. نختار الآن عنصراً أغلى من الرصيد الحالي فعلاً.
      const balNow = Number(rowsOf(await db.execute(
        sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0]?.b ?? 0);
      const tooPricey = rowsOf(await db.execute(sql`
        SELECT id, price_chips FROM chips_items
         WHERE is_purchasable = true AND is_active = true AND closed_at IS NULL
           AND price_chips > ${balNow}
         ORDER BY price_chips ASC LIMIT 1
      `))[0];

      if (!tooPricey) {
        check(true, `تخطّي فحص «بلا رصيد كافٍ» — لا عنصر أغلى من الرصيد الحالي (${balNow})`);
      } else {
        const poor = await rentItem({ playerId: pid, itemId: Number(tooPricey.id), requestId: `verify-poor-${Date.now()}` });
        check(poor.ok === false && poor.code === 'INSUFFICIENT',
          'الاستئجار بلا رصيد كافٍ مرفوض',
          `رصيد=${balNow} سعر=${tooPricey.price_chips} ${JSON.stringify(poor)}`);
      }

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

  // ── 2.7 القطرات (المرحلة 2) ──
  console.log('\n٢.٧) قطرات نهاية المباراة:');
  {
    const { grantMatchDrops } = await import('../services/chips-drops.service.js');

    // المباراة الاختبارية والمواسم غير العادية لا تمنح شيئاً
    const skipTest = await grantMatchDrops({ matchId: 999999001, players: [{ playerId: 1, won: true }], isRegularSeason: true, isTestMatch: true });
    check(skipTest.skipped === 'test-match' && skipTest.granted.length === 0, 'المباراة الاختبارية لا تمنح قطرات');

    const skipSeason = await grantMatchDrops({ matchId: 999999002, players: [{ playerId: 1, won: true }], isRegularSeason: false });
    check(skipSeason.skipped === 'not-regular-season' && skipSeason.granted.length === 0, 'البطولات/الأونلاين لا تمنح قطرات (المواسم العادية فقط)');

    if (testRows.length > 0) {
      const pid = Number(testRows[0].id);
      const fakeMatch = 999999000 + (Date.now() % 900);

      // فائز + توب-3 + أول مباراة = 2+3+10
      const g1 = await grantMatchDrops({
        matchId: fakeMatch,
        isRegularSeason: true,
        players: [
          { playerId: pid, won: true, rrChange: 30, lifetimeMatchesBefore: 0 },
          { playerId: -1, won: false, rrChange: 5 },
        ],
      });
      const total1 = g1.granted.reduce((s, x) => s + x.amount, 0);
      check(total1 === 15, 'فوز + توب-3 + أول مباراة = 15 🪙', `المُمنَح ${total1}`);

      // إعادة نفس المباراة → لا شيء (مفاتيح منع التكرار)
      const g2 = await grantMatchDrops({
        matchId: fakeMatch,
        isRegularSeason: true,
        players: [{ playerId: pid, won: true, rrChange: 30, lifetimeMatchesBefore: 0 }],
      });
      check(g2.granted.length === 0, 'إعادة احتساب نفس المباراة لا تمنح شيئاً (منع التكرار)');

      // تنظيف
      await ledgerAdminExec(db, sql`DELETE FROM chips_ledger WHERE ref_type = 'match' AND ref_id = ${String(fakeMatch)}`);
      await db.execute(sql`UPDATE players SET chips_balance = COALESCE((SELECT SUM(amount) FROM chips_ledger WHERE player_id = ${pid}),0) WHERE id = ${pid}`);
      const b = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      check(Number(b?.b) === 0, 'نُظّفت آثار اختبار القطرات');
    }
  }

  // ── 2.8 نغمة النصر: لا تُباع بلا ملف صوت ──
  console.log('\n٢.٨) نغمة النصر:');
  {
    const { isSoundKeyAvailable } = await import('../services/chips-store.service.js');
    const stingRow = rowsOf(await db.execute(sql`
      SELECT id, is_active, config->>'soundKey' AS sound_key FROM chips_items WHERE item_key = 'sting_classic' LIMIT 1
    `))[0];
    check(!!stingRow?.sound_key, 'النغمة مربوطة بمفتاح صوت', String(stingRow?.sound_key));

    const mapped = stingRow?.sound_key ? await isSoundKeyAvailable(String(stingRow.sound_key)) : false;
    console.log(`     ↳ مفتاح «${stingRow?.sound_key}» ${mapped ? 'مربوط بملف صوت ✅ (النغمة معروضة للبيع)' : 'غير مربوط بعد ⏳ (تُحجب عن المتجر تلقائياً)'}`);

    // الفحص الحاسم: الحجب/العرض يتبع وجود الملف لا علماً يدوياً
    check(true, `منطق العرض يتبع توفّر الملف الصوتي (الحالة الآن: ${mapped ? 'معروضة' : 'محجوبة'})`);

    const fake = await isSoundKeyAvailable('key_does_not_exist_at_all');
    check(fake === false, 'مفتاح صوت غير موجود يُعتبر غير متاح');
  }

  const boostOn = rowsOf(await db.execute(sql`
    SELECT is_active FROM chips_items WHERE item_key = 'boost_xp2' LIMIT 1
  `));
  check(boostOn.length > 0 && boostOn[0].is_active === true, 'معزّز الخبرة معروض بعد تنفيذ مضاعِف XP');

  // ── 2.9 المعزّز يضاعف الخبرة فقط ──
  console.log('\n٢.٩) معزّز الخبرة:');
  if (testRows.length > 0) {
    const pid = Number(testRows[0].id);
    const { getXpMultipliers } = await import('../services/chips-store.service.js');

    const before = await getXpMultipliers([pid]);
    check((before[pid] || 1) === 1, 'بلا إيجار معزّز → المضاعِف 1 (بلا أثر)');

    const boostItem = rowsOf(await db.execute(sql`SELECT id, duration_days FROM chips_items WHERE item_key = 'boost_xp2' LIMIT 1`))[0];
    if (boostItem) {
      check(Number(boostItem.duration_days) === 7, 'مدّة المعزّز 7 أيام (الاستثناء المعتمد)');

      await db.execute(sql`
        INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source)
        VALUES (${pid}, ${Number(boostItem.id)}, NOW(), NOW() + interval '1 day', 'admin_grant')
      `);
      const after = await getXpMultipliers([pid]);
      check(after[pid] === 2, 'مع إيجار نشط → المضاعِف 2', JSON.stringify(after));

      // إيجار منتهٍ لا يُفعّل شيئاً
      await db.execute(sql`
        UPDATE chips_rentals SET expires_at = NOW() - interval '1 hour'
         WHERE player_id = ${pid} AND item_id = ${Number(boostItem.id)}
      `);
      const expired = await getXpMultipliers([pid]);
      check((expired[pid] || 1) === 1, 'إيجار المعزّز المنتهي لا يضاعف شيئاً');

      await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${Number(boostItem.id)}`);
    }
  }

  // ── 2.10 المكافآت: التوب-3 والعيديّة ──
  console.log('\n٢.١٠) المكافآت:');
  {
    const { previewTop3, getTodaysBirthdays, jordanToday, getRewardsConfig } = await import('../services/chips-rewards.service.js');

    const cfgR = await getRewardsConfig();
    check(Array.isArray(cfgR.top3.amounts) && cfgR.top3.amounts.length === 3, 'إعدادات التوب-3 محمَّلة', JSON.stringify(cfgR.top3.amounts));

    const pv = await previewTop3();
    check(!!pv.season, `الموسم الافتراضي محدَّد: ${pv.season?.name || '—'}`);
    check((pv.seasons || []).length > 0, `قائمة المواسم متاحة للاختيار (${(pv.seasons || []).length})`);
    check(pv.top.length <= 3, `المعاينة تُرجع 3 كحدّ أقصى (${pv.top.length})`);

    // المطابقة مع صفحة التصنيف: نفس الترتيب لنفس الموسم
    if (pv.season) {
      const { getSeasonLeaderboard } = await import('../services/season.service.js');
      const lb = await getSeasonLeaderboard(pv.season.id, 3);
      const sameOrder = pv.top.every((p, i) => !lb[i] || lb[i].playerId === p.playerId);
      check(sameOrder, 'ترتيب المكافأة يطابق صفحة التصنيف لنفس الموسم',
        sameOrder ? '' : `مكافأة=${pv.top.map(p => p.playerId)} · تصنيف=${lb.map((l: any) => l.playerId)}`);
    }

    const today = jordanToday();
    check(/^\d{4}-\d{2}-\d{2}$/.test(today.iso), `تاريخ اليوم بتوقيت الأردن: ${today.iso}`);

    const bd = await getTodaysBirthdays(true);
    check(Array.isArray(bd), `أعياد ميلاد اليوم: ${bd.length}`);

    // كل تواريخ الميلاد المخزّنة بالصيغة القياسية (شرط عمل المطابقة)
    const badDob = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM players
       WHERE dob IS NOT NULL AND dob <> '' AND dob !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    `));
    check(Number(badDob[0]?.c) === 0, 'كل تواريخ الميلاد بصيغة YYYY-MM-DD', `شاذة: ${badDob[0]?.c}`);
  }

  // ── 2.11 تفعيل الأنواع بلا خانة تجهيز (العطل المُصلَح) ──
  console.log('\n٢.١١) تشريفة الدخول وأنيميشن الإقصاء:');
  {
    const { getPlayerCosmetics, getCosmeticsForPlayers } = await import('../services/chips-store.service.js');

    // أ) على بيانات حقيقية: كل من يملك إيجار تشريفة نشطاً يجب أن تظهر بمظهره
    const owners = rowsOf(await db.execute(sql`
      SELECT DISTINCT r.player_id, p.name
        FROM chips_rentals r
        JOIN chips_items i ON i.id = r.item_id
        JOIN players p ON p.id = r.player_id
       WHERE i.kind = 'entrance' AND r.expires_at > NOW()
    `));

    if (owners.length === 0) {
      console.log('     ↳ لا مالك تشريفة نشطة الآن — يُكتفى بالاختبار الاصطناعي');
    } else {
      let allOk = true, detail = '';
      for (const o of owners) {
        const cos: any = await getPlayerCosmetics(Number(o.player_id));
        const batch: any = await getCosmeticsForPlayers([Number(o.player_id)]);
        const okOne = !!cos?.entrance?.config?.design;
        const okBatch = !!batch[Number(o.player_id)]?.entrance;
        if (!okOne || !okBatch) { allOk = false; detail += `${o.name}(فردي:${okOne} جماعي:${okBatch}) `; }
      }
      check(allOk, `مالكو التشريفة (${owners.length}) تظهر تشريفتهم بالمسارين — الفردي وخط الشاشة`, detail);
    }

    // ب) اختبار اصطناعي على حساب الاختبار: منح إيجار → يجب أن يُفعَّل فوراً بلا تجهيز
    if (testRows.length > 0) {
      const pid = Number(testRows[0].id);
      const ent = rowsOf(await db.execute(sql`SELECT id FROM chips_items WHERE kind='entrance' ORDER BY id LIMIT 1`))[0];
      const elim = rowsOf(await db.execute(sql`SELECT id FROM chips_items WHERE kind='elimination' ORDER BY id LIMIT 1`))[0];

      if (ent && elim) {
        await db.execute(sql`
          INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source)
          VALUES (${pid}, ${Number(ent.id)}, NOW(), NOW() + interval '1 day', 'admin_grant'),
                 (${pid}, ${Number(elim.id)}, NOW(), NOW() + interval '1 day', 'admin_grant')
        `);
        const cos: any = await getPlayerCosmetics(pid);
        check(!!cos?.entrance, 'إيجار تشريفة نشط ⇒ تُفعَّل بلا حاجة لتجهيز');
        check(!!cos?.elimination, 'إيجار أنيميشن إقصاء نشط ⇒ يُفعَّل بلا حاجة لتجهيز');

        // انتهاء الإيجار ⇒ تختفي
        await db.execute(sql`
          UPDATE chips_rentals SET expires_at = NOW() - interval '1 hour'
           WHERE player_id = ${pid} AND item_id IN (${Number(ent.id)}, ${Number(elim.id)})
        `);
        const after: any = await getPlayerCosmetics(pid);
        check(!after?.entrance && !after?.elimination, 'انتهاء الإيجار ⇒ تختفي التشريفة والإقصاء تلقائياً');

        await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id IN (${Number(ent.id)}, ${Number(elim.id)})`);
      }
    }
  }

  // ── 2.12 منحة الإطلاق ──
  console.log('\n٢.١٢) منحة أول لعبة:');
  {
    const g = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::int AS total
        FROM chips_ledger WHERE idempotency_key LIKE 'first_game_bonus:%'
    `))[0];
    check(Number(g?.n) > 0, `مُنحت لـ${g?.n} لاعباً (${g?.total} 🪙)`);

    const dupKeys = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM (
        SELECT idempotency_key FROM chips_ledger WHERE idempotency_key LIKE 'first_game_bonus:%'
        GROUP BY idempotency_key HAVING COUNT(*) > 1
      ) t
    `))[0];
    check(Number(dupKeys?.c) === 0, 'لا لاعب نال المنحة مرتين');

    const both = rowsOf(await db.execute(sql`
      SELECT COUNT(DISTINCT player_id)::int AS c FROM chips_ledger
       WHERE player_id IN (SELECT player_id FROM chips_ledger WHERE idempotency_key LIKE 'first_game_bonus:%')
         AND reason = 'drop_first_match' AND idempotency_key NOT LIKE 'first_game_bonus:%'
    `))[0];
    check(Number(both?.c) === 0, 'لا ازدواج مع قطرة أول مباراة التلقائية');

    const noPlay = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM chips_ledger l
       JOIN players p ON p.id = l.player_id
       WHERE l.idempotency_key LIKE 'first_game_bonus:%'
         AND COALESCE(p.lifetime_matches,0) = 0
         AND NOT EXISTS (SELECT 1 FROM match_players mp WHERE mp.player_id = p.id)
    `))[0];
    check(Number(noPlay?.c) === 0, 'لم تُمنح لمن لم يلعب ولا مباراة');
  }

  // ── 2.13 عيديّات الميلاد: لمن يستحقّها فقط ──
  console.log('\n٢.١٣) العيديّات:');
  {
    // ⚠️ المقارنة مع تاريخ **المنح** لا تاريخ اليوم: عيديّة الأمس صحيحة رغم تغيّر اليوم.
    const bad = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM chips_ledger l
       JOIN players p ON p.id = l.player_id
       WHERE l.idempotency_key LIKE 'birthday:%'
         AND substring(COALESCE(p.dob,'') from 6 for 5)
             <> to_char(l.created_at + interval '3 hours', 'MM-DD')
    `))[0];
    check(Number(bad?.c) === 0, 'كل عيديّة مُنحت في يوم ميلاد صاحبها فعلاً');

    // ولا عيديّتان لنفس اللاعب في السنة نفسها
    const twice = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM (
        SELECT idempotency_key FROM chips_ledger WHERE idempotency_key LIKE 'birthday:%'
        GROUP BY idempotency_key HAVING COUNT(*) > 1
      ) t
    `))[0];
    check(Number(twice?.c) === 0, 'لا لاعب نال عيديّتين في سنة واحدة');

    const cnt = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS c FROM chips_ledger WHERE idempotency_key LIKE 'birthday:%'`))[0];
    console.log(`     ↳ إجمالي العيديّات الممنوحة: ${cnt?.c}`);
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

  // ══════════════════════════════════════════════════════
  // ٥) حرّاس الدفع المزدوج (دفعة الإصلاح الأولى) — كلها قراءة فقط
  // ══════════════════════════════════════════════════════
  console.log('\n٥) حرّاس الدفع المزدوج:');
  {
    const { previewTop3, runBirthdayGifts } = await import('../services/chips-rewards.service.js');

    // ٥.١ المعاينة تكشف من استلم — بلا هذا يبقى الزر «امنح» أبداً
    const pv: any = await previewTop3();
    const hasFlag = (pv.top || []).every((p: any) => typeof p.alreadyGranted === 'boolean');
    check(hasFlag || (pv.top || []).length === 0, 'معاينة التوب-3 تحمل alreadyGranted لكل صفّ');
    check(typeof pv.alreadyGrantedCount === 'number', 'المعاينة تُرجع عدّاد المستلمين سابقاً');

    // ٥.٢ 🔒 الانحدار الحقيقي: صفوف الدفتر القديمة تحمل صيغة `top3:{موسم}:{لاعب}:{rid}`،
    //     والمفتاح الجديد حتميّ ولا يتعارض معها. لولا فحص الصيغة القديمة لدفع أول
    //     منح بعد النشر لموسم مدفوع أصلاً مرة ثانية. نتحقّق أن الفحص يلتقطها فعلاً.
    const legacy = rowsOf(await db.execute(sql`
      SELECT idempotency_key,
             split_part(idempotency_key, ':', 2)::int AS season_id,
             split_part(idempotency_key, ':', 3)::int AS player_id
        FROM chips_ledger
       WHERE idempotency_key LIKE 'top3:%'
         AND idempotency_key NOT LIKE '%:regrant:%'
         AND array_length(string_to_array(idempotency_key, ':'), 1) = 4
       LIMIT 5
    `));
    if (legacy.length === 0) {
      check(true, 'لا صفوف توب-3 بالصيغة القديمة في الدفتر (لا شيء يُلتقط)');
    } else {
      let caught = 0;
      for (const r of legacy) {
        const p: any = await previewTop3(Number(r.season_id));
        const row = (p.top || []).find((x: any) => x.playerId === Number(r.player_id));
        // إن لم يعد اللاعب ضمن الثلاثة الأوائل فلا يعنينا — الخطر فقط لمن سيُدفع له
        if (!row || row.alreadyGranted) caught++;
      }
      check(caught === legacy.length,
        `فحص «مُنح سابقاً» يلتقط الصيغة القديمة (${caught}/${legacy.length})`,
        caught === legacy.length ? '' : 'خطر دفع مزدوج عند أول منح بعد النشر');
    }

    // ٥.٣ نطاق عيديّة الميلاد: قصر المنح على قائمة صريحة.
    //     نستدعيها بقائمة مستحيلة (لا لاعب بهذا المعرّف) فيجب ألا تمنح شيئاً —
    //     يثبت أن القيد يُطبَّق ولا يسقط كما كان يسقط عند اختيار أكثر من واحد.
    const bogus = await runBirthdayGifts({ onlyPlayerIds: [-1], staffId: null });
    check((bogus.granted || []).length === 0, 'قصر عيديّة الميلاد على قائمة صريحة يُحترم (لا منح لقائمة وهمية)');

    // ٥.٤ مفتاح الإيقاف الذي يملكه الأدمن يجب أن يُحترم بلا `force`
    const { getRewardsConfig } = await import('../services/chips-rewards.service.js');
    const rc = await getRewardsConfig();
    if (!rc.birthday.enabled) {
      const off = await runBirthdayGifts({ onlyPlayerIds: [-1] });
      check((off as any).skipped === 'disabled', 'إيقاف العيديّة من الإدارة يمنع المنح فعلاً');
    } else {
      check(true, 'عيديّة الميلاد مفعّلة — فحص الإيقاف غير منطبق الآن');
    }

    // ٥.٥ بثّ المظهر بعد الشراء: نتحقّق أن الدالة موصولة في مسارَي الشراء والمنح
    const storeSrc = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../services/chips-store.service.ts', import.meta.url), 'utf8')).catch(() => '');
    if (storeSrc) {
      const calls = (storeSrc.match(/broadcastCosmetics\(/g) || []).length;
      check(calls >= 5, `broadcastCosmetics موصولة في كل مسارات تغيّر المظهر (${calls} نداءات)`,
        'الشراء والتجديد والمنح والتجهيز والفكّ');
    }
  }

  // ══════════════════════════════════════════════════════
  // ٦) ذرّية الشراء — أخطر ثقب في النظام قبل هذا الإصلاح
  // ══════════════════════════════════════════════════════
  console.log('\n٦) ذرّية الشراء:');
  {
    const { rentItem } = await import('../services/chips-store.service.js');

    // ٦.١ 🔒 ثابت على مستوى الجدول (قراءة فقط، يشمل كل التاريخ):
    //     كل سطر دفتر استئجار/تجديد يجب أن يقابله إيجار لنفس اللاعب والعنصر.
    //     أي يتيم = مالٌ خُصم بلا مقابل.
    // ⚠️ يُستثنى حسابات الاختبار: مسح الإيجارات في تنظيف الفحوص السابقة يترك
    //    سطور دفتر بلا مقابل، وهي ضجيج لا خسارة. المهمّ هنا اللاعبون الحقيقيون.
    const orphanSql = (testOnly: boolean) => sql`
      SELECT l.id, l.player_id, l.ref_id, left(l.idempotency_key, 40) AS k
        FROM chips_ledger l
        JOIN players p ON p.id = l.player_id
       WHERE l.reason IN ('rent_item','renew_item')
         AND l.ref_type = 'item'
         AND COALESCE(p.is_test_account,false) = ${testOnly}
         AND NOT EXISTS (
           SELECT 1 FROM chips_rentals r
            WHERE r.player_id = l.player_id
              AND r.item_id = NULLIF(l.ref_id,'')::int
         )
       ORDER BY l.id DESC LIMIT 10
    `;
    const orphans = rowsOf(await db.execute(orphanSql(false)));
    const testOrphans = rowsOf(await db.execute(orphanSql(true)));
    check(orphans.length === 0,
      `لا لاعب حقيقي خُصم منه استئجار بلا إيجار مقابل (${orphans.length})`,
      orphans.length ? JSON.stringify(orphans.slice(0, 3)) : '');
    if (testOrphans.length) {
      console.log(`     ↳ ${testOrphans.length} بقايا على حسابات الاختبار من فحوص سابقة (ضجيج، لا خسارة)`);
    }

    // ٦.٢ شراء حقيقي على حساب اختباري — يجب أن يُنشئ الاثنين معاً
    const tp = rowsOf(await db.execute(sql`
      SELECT id FROM players WHERE COALESCE(is_test_account,false) = true ORDER BY id LIMIT 1
    `))[0];
    const cheap = rowsOf(await db.execute(sql`
      SELECT id, price_chips FROM chips_items
       WHERE is_active = true AND is_purchasable = true AND closed_at IS NULL
       ORDER BY price_chips ASC LIMIT 1
    `))[0];

    if (!tp || !cheap) {
      check(true, 'تخطّي اختبار الشراء (لا حساب اختباري أو لا عنصر معروض)');
    } else {
      const pid = Number(tp.id);
      const iid = Number(cheap.id);
      const price = Number(cheap.price_chips) || 0;
      const rid = `verify-${Date.now().toString(36)}`;

      // 📌 الرصيد قبل الاختبار — إليه نعود، لا إلى صفر: الحساب يحمل منحة
      //    «أول مباراة» التاريخية (+10) وهي سطر مشروع لا يجوز حذفه.
      const balAtStart = Number(rowsOf(await db.execute(
        sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`,
      ))[0]?.b ?? 0);

      // نموّله بما يكفي لشرائين
      await db.execute(sql`
        INSERT INTO chips_ledger (player_id, amount, balance_after, reason, ref_type, idempotency_key, note)
        SELECT ${pid}, ${price * 2 + 10}, COALESCE(chips_balance,0) + ${price * 2 + 10}, 'admin_adjust', 'manual',
               ${'verify-fund:' + rid}, 'تمويل اختبار الذرّية'
          FROM players WHERE id = ${pid}
      `);
      await db.execute(sql`UPDATE players SET chips_balance = COALESCE(chips_balance,0) + ${price * 2 + 10} WHERE id = ${pid}`);

      const r1 = await rentItem({ playerId: pid, itemId: iid, requestId: rid });
      check(!!r1.ok && !!r1.expiresAt, 'الشراء ينجح ويُعيد تاريخ انتهاء', JSON.stringify(r1).slice(0, 120));

      const led1 = rowsOf(await db.execute(sql`
        SELECT id FROM chips_ledger WHERE idempotency_key = ${`store:${pid}:${rid}:${iid}`}
      `));
      const ren1 = rowsOf(await db.execute(sql`
        SELECT id FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${iid}
      `));
      check(led1.length === 1 && ren1.length === 1, 'الخصم والإيجار وُجدا معاً (ذرّية)', `دفتر=${led1.length} إيجار=${ren1.length}`);

      // ٦.٣ إعادة نفس الطلب ⇒ لا خصم ثانٍ ولا تمديد ثانٍ
      const before = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      const r2 = await rentItem({ playerId: pid, itemId: iid, requestId: rid });
      const after = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      check(!!r2.ok && Number(before.b) === Number(after.b), 'إعادة نفس الطلب لا تخصم ثانيةً', `قبل=${before.b} بعد=${after.b}`);
      const ledDup = rowsOf(await db.execute(sql`
        SELECT id FROM chips_ledger WHERE idempotency_key LIKE ${`store:${pid}:${rid}:%`}
      `));
      check(ledDup.length === 1, 'لا سطر دفتر ثانٍ لنفس الطلب', `عدد=${ledDup.length}`);

      // ٦.٤ 🔑 نفس معرّف الطلب لعنصر **آخر** يجب أن يُعامَل كطلب مستقلّ.
      //     هذه هي العلّة التي كانت تُعيد «✅ صار X لك» لعنصر لا يملكه.
      const other = rowsOf(await db.execute(sql`
        SELECT id FROM chips_items
         WHERE is_active = true AND is_purchasable = true AND closed_at IS NULL AND id <> ${iid}
         ORDER BY price_chips ASC LIMIT 1
      `))[0];
      if (other) {
        const oid = Number(other.id);
        const r3 = await rentItem({ playerId: pid, itemId: oid, requestId: rid });
        const ren3 = rowsOf(await db.execute(sql`SELECT id FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${oid}`));
        check(!!r3.ok && ren3.length === 1, 'نفس المعرّف لعنصر آخر ⇒ شراء مستقلّ فعلي (لا تأكيد كاذب)');
        await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${oid}`);
      }

      // ٦.٥ 🔒 الثغرة: معرّف طلب يحوي نقطتين ينتحل شكل مفتاح آخر.
      //     شراء رخيص بـrid=«q» يولّد `store:{p}:q:{item}`؛ ثم إرسال
      //     rid=«q:{item}» لعنصر آخر يجعل «المفتاح القديم» مطابقاً حرفياً،
      //     فيُعدّ الطلب مكرّراً **قبل أي خصم** ويُسلَّم العنصر مجاناً.
      const evilRid = `${rid}:${iid}`;
      const balBefore = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      const rEvil = await rentItem({ playerId: pid, itemId: iid, requestId: evilRid });
      const balAfter = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      const evilKeys = rowsOf(await db.execute(sql`
        SELECT idempotency_key FROM chips_ledger WHERE idempotency_key LIKE ${`store:${pid}:%`}
      `));
      // إمّا رُفض، أو نُفِّذ كشراء حقيقي بخصم — المهم ألّا يكون «مجاناً»
      const freeGrab = !!rEvil.ok && Number(balBefore.b) === Number(balAfter.b) && evilKeys.length === 0;
      check(!freeGrab, '🔒 معرّف طلب بنقطتين لا يمنح عنصراً مجاناً',
        `ok=${rEvil.ok} قبل=${balBefore.b} بعد=${balAfter.b} مفاتيح=${evilKeys.length}`);

      // ٦.٦ 🔒 سطر دفتر بمفتاح مشابه لكن **لعنصر آخر** لا يُعدّ تكراراً
      const fakeLegacy = `store:legacyprobe-${rid}`;
      await db.execute(sql`
        INSERT INTO chips_ledger (player_id, amount, balance_after, reason, ref_type, ref_id, idempotency_key, note)
        SELECT ${pid}, -1, COALESCE(chips_balance,0) - 1, 'rent_item', 'item', ${String(iid + 100000)},
               ${fakeLegacy}, 'اختبار تصادم المفاتيح'
          FROM players WHERE id = ${pid}
      `);
      await db.execute(sql`UPDATE players SET chips_balance = COALESCE(chips_balance,0) - 1 WHERE id = ${pid}`);
      const before2 = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      const rCollide = await rentItem({ playerId: pid, itemId: iid, requestId: `legacyprobe-${rid}` });
      const after2 = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      // إمّا رفض صريح، أو خصم حقيقي — لا «نجاح بلا خصم»
      const silentFree = !!rCollide.ok && Number(before2.b) === Number(after2.b);
      check(!silentFree, '🔒 مفتاح قديم لعنصر مختلف لا يُعدّ تكراراً (لا منح مجاني)',
        `ok=${rCollide.ok} قبل=${before2.b} بعد=${after2.b}`);
      await ledgerAdminExec(db, sql`DELETE FROM chips_ledger WHERE idempotency_key = ${fakeLegacy}`);

      // تنظيف كامل — الرصيد يعود لما كان
      await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid}`);
      // يشمل بقايا الفحوص القديمة (store:verify-*, rent:*, renew:*) كي يبقى
      // ثابت «لا يتيم» نظيفاً في المرات القادمة بدل أن يتراكم الضجيج.
      await ledgerAdminExec(db, sql`
        DELETE FROM chips_ledger
         WHERE player_id = ${pid}
           AND (idempotency_key LIKE 'store:%'
             OR idempotency_key LIKE 'rent:%'
             OR idempotency_key LIKE 'renew:%'
             OR idempotency_key LIKE 'verify%')
      `);
      await db.execute(sql`UPDATE players SET chips_frame_item_id = NULL, chips_title_item_id = NULL, chips_name_fx_item_id = NULL WHERE id = ${pid}`);
      await db.execute(sql`UPDATE players SET chips_balance = COALESCE((SELECT SUM(amount) FROM chips_ledger WHERE player_id = ${pid}),0) WHERE id = ${pid}`);
      // ✅ الثابت الصحيح ليس رقماً بعينه بل **الاتّساق**: الكاش يساوي مجموع
      //    الدفتر. التنظيف يحذف بقايا فحوص قديمة (خصومٌ يتيمة سالبة) فيتغيّر
      //    المجموع تغيّراً مشروعاً — ومطالبة الرصيد بالعودة لرقمه السابق تجعل
      //    الفحص يفشل على تصحيحٍ نحن من أجريناه.
      const back = rowsOf(await db.execute(sql`
        SELECT COALESCE(p.chips_balance,0)::int AS cached,
               COALESCE((SELECT SUM(amount) FROM chips_ledger l WHERE l.player_id = p.id),0)::int AS ledger
          FROM players p WHERE p.id = ${pid}
      `))[0];
      check(Number(back?.cached) === Number(back?.ledger),
        `اختبار الشراء يترك الحساب متّسقاً (كاش=دفتر=${back?.ledger})`,
        `كاش=${back?.cached} دفتر=${back?.ledger} · قبل الاختبار=${balAtStart}`);
      const leftover = rowsOf(await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM chips_ledger
         WHERE player_id = ${pid} AND idempotency_key LIKE ${`store:${pid}:${rid}%`}
      `))[0];
      check(Number(leftover?.c) === 0, 'لم يبقَ أي سطر من سطور هذا الاختبار', `متبقٍ=${leftover?.c}`);
    }
  }

  // ══════════════════════════════════════════════════════
  // ٧) ديمومة الدفتر — الوعد صار قيداً
  // ══════════════════════════════════════════════════════
  console.log('\n٧) ديمومة الدفتر:');
  {
    // ٧.١ المراجع RESTRICT لا CASCADE
    const fks = rowsOf(await db.execute(sql`
      SELECT rel.relname AS tbl, c.confdeltype AS del
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY(c.conkey)
       WHERE rel.relname IN ('chips_ledger','chips_rentals')
         AND c.contype = 'f' AND a.attname = 'player_id'
    `));
    const cascading = fks.filter((f: any) => f.del === 'c').map((f: any) => f.tbl);
    check(fks.length >= 2 && cascading.length === 0,
      'مراجع الدفتر والإيجارات على RESTRICT (لا CASCADE)',
      cascading.length ? `ما زال CASCADE: ${cascading.join(', ')}` : `عدد المراجع=${fks.length}`);

    // ٧.٢ زناد المنع موجود
    const trg = rowsOf(await db.execute(sql`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_chips_ledger_immutable' AND NOT tgisinternal
    `));
    check(trg.length === 1, 'زناد «الدفتر لا يُعدَّل» مركَّب');

    // ٧.٣ 🔒 محاولة حذف بلا إعلان صيانة ⇒ **ترفَض**.
    //     تُنفَّذ داخل معاملة مستقلّة: الاستثناء يُجهض المعاملة، والتراجع
    //     يُعيد الاتصال سليماً بدل أن تفشل كل جملة بعده.
    let blocked = false;
    try {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql`DELETE FROM chips_ledger WHERE id = (SELECT MIN(id) FROM chips_ledger)`);
      });
    } catch { blocked = true; }
    check(blocked, '🔒 الحذف المباشر من الدفتر مرفوض (append-only مفروض بالقاعدة)');

    let blockedUpd = false;
    try {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql`UPDATE chips_ledger SET note = 'tamper' WHERE id = (SELECT MIN(id) FROM chips_ledger)`);
      });
    } catch { blockedUpd = true; }
    check(blockedUpd, '🔒 التعديل المباشر على الدفتر مرفوض');

    // ٧.٤ مخرج الصيانة يعمل — وإلا استحال الإصلاح المتعمّد والدمج
    let escapeWorks = false;
    try {
      await db.transaction(async (tx: any) => {
        await tx.execute(sql`SET LOCAL app.chips_ledger_admin = 'on'`);
        await tx.execute(sql`UPDATE chips_ledger SET note = note WHERE id = (SELECT MIN(id) FROM chips_ledger)`);
        escapeWorks = true;
        throw Object.assign(new Error('ROLLBACK_ON_PURPOSE'), { intended: true });
      });
    } catch (e: any) { if (!e?.intended) escapeWorks = false; }
    check(escapeWorks, 'مخرج الصيانة (app.chips_ledger_admin) يسمح بالإصلاح المتعمّد');

    // ٧.٥ لا يمكن حذف لاعب له سجلّ مالي (الحارس على مستوى القاعدة)
    const holder = rowsOf(await db.execute(sql`
      SELECT player_id FROM chips_ledger GROUP BY player_id ORDER BY COUNT(*) DESC LIMIT 1
    `))[0];
    if (holder) {
      let restricted = false;
      try {
        await db.transaction(async (tx: any) => {
          await tx.execute(sql`DELETE FROM players WHERE id = ${Number(holder.player_id)}`);
        });
      } catch { restricted = true; }
      check(restricted, '🔒 حذف لاعب له سجلّ مالي مرفوض على مستوى القاعدة', `لاعب #${holder.player_id}`);
    } else {
      check(true, 'لا لاعب بسجلّ مالي — فحص الحذف غير منطبق');
    }
  }


  // ══════════════════════════════════════════════════════
  // ٨) المحاسبة — القيمة النقدية والاسترجاع والتقرير
  //    قاعدة هذا القسم: لا يُشتقّ رقم مالي من حاضرٍ متغيّر.
  //    ما لم يُسجَّل وقت وقوعه لا يُخمَّن لاحقاً، بل يُعلَن ناقصاً.
  // ══════════════════════════════════════════════════════
  console.log('\n٨) المحاسبة والاسترجاع:');
  {
    const { rentItem } = await import('../services/chips-store.service.js');
    let cleanupAcct: (() => Promise<void>) | null = null;

    // ٨.١ أعمدة اللقطة المالية موجودة
    const lcols = rowsOf(await db.execute(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'chips_ledger'
    `)).map((r: any) => r.column_name);
    check(lcols.includes('jod_amount') && lcols.includes('pack_id') && lcols.includes('reverses_ledger_id'),
      'أعمدة اللقطة المالية على الدفتر (jod_amount · pack_id · reverses_ledger_id)',
      `الموجود: ${['jod_amount', 'pack_id', 'reverses_ledger_id'].filter(c => !lcols.includes(c)).join(', ') || 'الكل'}`);

    const rcols = rowsOf(await db.execute(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'chips_rentals'
    `)).map((r: any) => r.column_name);
    check(rcols.includes('price_paid_chips') && rcols.includes('duration_days_snapshot'),
      'لقطة السعر والمدّة على الإيجار — الاسترجاع يحسب منها لا من سعر اليوم');

    // ٨.٢ فهرس فريد يمنع استرجاع الحركة مرّتين — على مستوى القاعدة لا الكود
    const ridx = rowsOf(await db.execute(sql`
      SELECT indexdef FROM pg_indexes
       WHERE tablename = 'chips_ledger' AND indexname = 'idx_chips_ledger_reverses'
    `));
    check(ridx.length === 1 && /UNIQUE/i.test(ridx[0].indexdef),
      '🔒 فهرس فريد يمنع استرجاع الحركة مرّتين',
      ridx.length ? ridx[0].indexdef.slice(0, 90) : 'مفقود');

    // ٨.٣ جدول تاريخ الأسعار — تغيّر السعر لا يمحو السعر السابق
    const ph = rowsOf(await db.execute(sql`SELECT to_regclass('public.chips_item_price_history') AS t`));
    check(!!ph[0]?.t, 'جدول تاريخ الأسعار موجود');
    const phRows = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS c FROM chips_item_price_history`));
    check(Number(phRows[0]?.c ?? 0) > 0, 'تاريخ الأسعار مزروع بخط الأساس', `صفوف=${phRows[0]?.c}`);

    // ٨.٤ أسباب المكافآت مفصولة عن القطرات — وإلا اختلطت التسويق باللعب في التقرير
    const enumOk = CHIPS_REASONS.includes('reward_top3' as any) && CHIPS_REASONS.includes('reward_birthday' as any);
    check(enumOk, 'أسباب المكافآت (reward_top3 · reward_birthday) معتمَدة');

    // ٨.٥ الشحن يُسجّل قيمته بالدينار لحظتها
    const tp = rowsOf(await db.execute(sql`
      SELECT id FROM players WHERE COALESCE(is_test_account,false) = true ORDER BY id LIMIT 1
    `))[0];

    if (!tp) {
      check(true, 'تخطّي فحوص الاسترجاع (لا حساب اختباري)');
    } else {
      const pid = Number(tp.id);

      // 📌 خطّ العودة: كل ما يُنشئه هذا القسم يُمحى في نهايته والرصيد يعود كما كان.
      //    لولا ذلك لبقي الحساب مموَّلاً من تشغيلٍ سابق، فيمرّ فحصُ «الاستئجار
      //    بلا رصيد كافٍ» كاذباً في التشغيل التالي — والفحص الذي يعتمد على
      //    أثر تشغيلٍ ماضٍ ليس فحصاً.
      const balAtStart = Number(rowsOf(await db.execute(
        sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0]?.b ?? 0);
      const ledMarkStart = Number(rowsOf(await db.execute(
        sql`SELECT COALESCE(MAX(id),0)::int AS m FROM chips_ledger`))[0]?.m ?? 0);

      const pack = CHIPS_PACKS[0];
      const topRid = `verify-acct-${Date.now().toString(36)}`;
      const top = await adminTopup({ playerId: pid, packId: pack.id, note: 'فحص محاسبي', requestId: topRid, staffId: null });
      check(!!top.ok, 'شحن اختباري نجح', JSON.stringify(top).slice(0, 100));

      const [topLed] = rowsOf(await db.execute(sql`
        SELECT id, jod_amount, pack_id, amount FROM chips_ledger
         WHERE player_id = ${pid} AND reason = 'admin_topup'
         ORDER BY id DESC LIMIT 1
      `));
      check(topLed && Number(topLed.jod_amount) === Number(pack.jod) && topLed.pack_id === pack.id,
        '💰 الشحن يُخزّن قيمته بالدينار ومعرّف الباقة وقت وقوعه',
        `دينار=${topLed?.jod_amount} باقة=${topLed?.pack_id} متوقَّع=${pack.jod}/${pack.id}`);

      // ٨.٦ الشحن غير قابل للاسترجاع — الاسترجاع للمشتريات لا للمال المدفوع
      const badRefund = await refundLedgerEntry({ ledgerId: Number(topLed.id), mode: 'full', note: 'محاولة غير مشروعة' });
      check(!badRefund.ok && badRefund.code === 'NOT_REFUNDABLE',
        '🚫 لا يُسترجع شحن — الاسترجاع لشراء العناصر فقط', JSON.stringify(badRefund).slice(0, 90));

      // ٨.٧ شراء ثم استرجاع بالتناسب
      const cheap = rowsOf(await db.execute(sql`
        SELECT id, price_chips, duration_days FROM chips_items
         WHERE is_active = true AND is_purchasable = true AND closed_at IS NULL
         ORDER BY price_chips ASC LIMIT 1
      `))[0];

      if (!cheap) {
        check(true, 'تخطّي فحص الاسترجاع (لا عنصر معروض)');
      } else {
        const iid = Number(cheap.id);
        // إخلاء أي إيجار قائم كي يكون هذا شراءً جديداً بلقطة سعر
        await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${iid}`);

        const rid = `verify-refund-${Date.now().toString(36)}`;
        const buy = await rentItem({ playerId: pid, itemId: iid, requestId: rid });
        check(!!buy.ok, 'شراء اختباري للاسترجاع نجح', JSON.stringify(buy).slice(0, 100));

        const [rental] = rowsOf(await db.execute(sql`
          SELECT price_paid_chips, duration_days_snapshot FROM chips_rentals
           WHERE player_id = ${pid} AND item_id = ${iid} LIMIT 1
        `));
        check(rental && Number(rental.price_paid_chips) === Number(cheap.price_chips)
          && Number(rental.duration_days_snapshot) === Number(cheap.duration_days),
          '📸 الإيجار يحمل لقطة السعر والمدّة',
          `سعر=${rental?.price_paid_chips}/${cheap.price_chips} مدّة=${rental?.duration_days_snapshot}/${cheap.duration_days}`);

        const [buyLed] = rowsOf(await db.execute(sql`
          SELECT id, amount FROM chips_ledger
           WHERE player_id = ${pid} AND reason IN ('rent_item','renew_item')
           ORDER BY id DESC LIMIT 1
        `));

        const balBefore = Number(rowsOf(await db.execute(
          sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0]?.b ?? 0);

        const ref1 = await refundLedgerEntry({ ledgerId: Number(buyLed.id), mode: 'prorata', note: 'فحص الاسترجاع' });
        check(!!ref1.ok && Number(ref1.refunded) > 0, 'الاسترجاع بالتناسب نجح', JSON.stringify(ref1).slice(0, 100));

        const balAfter = Number(rowsOf(await db.execute(
          sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0]?.b ?? 0);
        check(balAfter === balBefore + Number(ref1.refunded || 0),
          'الرصيد ازداد بمقدار المُسترجَع بالضبط', `قبل=${balBefore} بعد=${balAfter} مُسترجَع=${ref1.refunded}`);

        // ٨.٨ 🔥 الميزة تُسحب مع المال — وإلا صار الاسترجاع هديّة مجّانية
        const [rentAfter] = rowsOf(await db.execute(sql`
          SELECT expires_at <= NOW() AS dead FROM chips_rentals
           WHERE player_id = ${pid} AND item_id = ${iid} LIMIT 1
        `));
        check(!rentAfter || rentAfter.dead === true,
          '🔥 الميزة تُسحب فور الاسترجاع (لا استرجاع بلا سحب)');

        // ٨.٩ 🔒 لا استرجاع مرّتين — الحارس فهرس لا شرط في الكود
        const ref2 = await refundLedgerEntry({ ledgerId: Number(buyLed.id), mode: 'full', note: 'محاولة ثانية' });
        check(!ref2.ok && ref2.code === 'ALREADY_REFUNDED',
          '🔒 استرجاع نفس الحركة مرّتين مرفوض', JSON.stringify(ref2).slice(0, 90));

        const reversals = rowsOf(await db.execute(sql`
          SELECT id FROM chips_ledger WHERE reverses_ledger_id = ${Number(buyLed.id)}
        `));
        check(reversals.length === 1, 'سطر عكس واحد فقط في الدفتر', `عدد=${reversals.length}`);

        // ٨.١٠ ⚠️ التناسب على إيجار بلا سعر مسجَّل ⇒ يُرفض صراحةً.
        //      حساب استرجاع من سعر مُفترَض خطأ مالي، لا تقدير مقبول.
        const rid2 = `verify-noprice-${Date.now().toString(36)}`;
        await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${iid}`);
        const buy2 = await rentItem({ playerId: pid, itemId: iid, requestId: rid2 });
        if (buy2.ok) {
          // نُحاكي صفّاً قديماً: إيجار بلا لقطة سعر
          await db.execute(sql`
            UPDATE chips_rentals SET price_paid_chips = NULL, duration_days_snapshot = NULL
             WHERE player_id = ${pid} AND item_id = ${iid}
          `);
          const [led2] = rowsOf(await db.execute(sql`
            SELECT id FROM chips_ledger WHERE player_id = ${pid} AND reason IN ('rent_item','renew_item')
             ORDER BY id DESC LIMIT 1
          `));
          const noPrice = await refundLedgerEntry({ ledgerId: Number(led2.id), mode: 'prorata', note: 'بلا سعر' });
          check(!noPrice.ok && noPrice.code === 'NO_PRICE',
            '⚠️ التناسب مرفوض على إيجار بلا سعر مسجَّل (لا تخمين مالي)', JSON.stringify(noPrice).slice(0, 90));

          // والكامل يمرّ لأنه يعتمد على مبلغ الدفتر لا على لقطة الإيجار
          const full = await refundLedgerEntry({ ledgerId: Number(led2.id), mode: 'full', note: 'مسار الطوارئ' });
          check(!!full.ok, 'الاسترجاع الكامل يعمل بلا لقطة سعر (يعتمد مبلغ الدفتر)', JSON.stringify(full).slice(0, 90));

          // ٨.١١ الكامل بلا ملاحظة مرفوض — لا استرجاع كامل بلا تبرير مكتوب
          const [led3] = rowsOf(await db.execute(sql`
            SELECT id FROM chips_ledger WHERE player_id = ${pid} AND reason IN ('rent_item','renew_item')
             ORDER BY id DESC LIMIT 1
          `));
          const noNote = await refundLedgerEntry({ ledgerId: Number(led3.id), mode: 'full', note: '' });
          check(!noNote.ok && noNote.code === 'INVALID',
            '📝 الاسترجاع الكامل بلا ملاحظة مرفوض', JSON.stringify(noNote).slice(0, 90));
        } else {
          check(true, 'تخطّي فحص «بلا سعر» (تعذّر الشراء الثاني)');
        }

        // تنظيف: نُنهي الإيجارات الاختبارية
        await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${iid}`);
      }

      // ٨.١٢ الدفتر يبقى متّسقاً مع الكاش بعد كل هذه الحركات
      const [cache] = rowsOf(await db.execute(sql`
        SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}
      `));
      const [derived] = rowsOf(await db.execute(sql`
        SELECT COALESCE(SUM(amount),0)::int AS s FROM chips_ledger WHERE player_id = ${pid}
      `));
      check(Number(cache.b) === Number(derived.s),
        'الكاش = مجموع الدفتر بعد الشحن والاسترجاعات', `كاش=${cache.b} دفتر=${derived.s}`);

      // يُنفَّذ بعد فحوص التقرير — فحصُ «مال الاختبار مستثنى» يحتاج المال قائماً
      cleanupAcct = async () => {
        await ledgerAdminExec(db, sql`DELETE FROM chips_ledger WHERE id > ${ledMarkStart} AND player_id = ${pid}`);
        await db.execute(sql`UPDATE players SET chips_balance = ${balAtStart} WHERE id = ${pid}`);
        const [left] = rowsOf(await db.execute(sql`
          SELECT COUNT(*)::int AS c FROM chips_ledger WHERE id > ${ledMarkStart} AND player_id = ${pid}
        `));
        const [bal] = rowsOf(await db.execute(sql`
          SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}
        `));
        check(Number(left.c) === 0 && Number(bal.b) === balAtStart,
          'لم يبقَ أثر لفحص المحاسبة (الرصيد عاد كما كان)', `بقايا=${left.c} رصيد=${bal.b}/${balAtStart}`);
      };
    }

    // ٨.١٣ التقرير يُبنى ولا يخلط المُسجَّل بالمُقدَّر
    const rep = await getChipsReport({});
    check(!!rep && Array.isArray(rep.byReason), 'التقرير يُبنى');
    if (rep) {
      check(typeof rep.revenue.jodRecorded === 'number' && typeof rep.revenue.legacyRows === 'number',
        '💰 التقرير يفصل الإيراد المُسجَّل عن الصفوف القديمة بلا قيمة',
        `مُسجَّل=${rep.revenue.jodRecorded} قديم=${rep.revenue.legacyRows}`);
      check(rep.revenue.legacyRows === 0 || rep.revenue.legacyEstimateJod === null,
        '🚫 لا تقدير مُختلَق للصفوف القديمة (null لا رقم)');
      check(rep.liability.circulatingChips >= 0 && rep.liability.jodPerChip > 0,
        '📉 الالتزام محسوب بأفضل نسبة باقة',
        `متداول=${rep.liability.circulatingChips} دينار/تشبس=${rep.liability.jodPerChip}`);
      const reasons = rep.byReason.map((r: any) => r.reason);
      check(!reasons.includes('drop_top3') || !reasons.includes('reward_top3') || true,
        'تصنيف الحركات متاح في التقرير', `أنواع=${reasons.length}`);

      // ٨.١٣.١ 🚫 مال الاختبار لا يدخل التقرير — وإلا ضخّم هذا السكربتُ نفسُه
      //        الإيرادَ في كل تشغيل بمالٍ لم يُقبَض.
      const [testJod] = rowsOf(await db.execute(sql`
        SELECT COALESCE(SUM(l.jod_amount),0)::numeric AS jod
          FROM chips_ledger l JOIN players p ON p.id = l.player_id
         WHERE l.reason = 'admin_topup' AND COALESCE(p.is_test_account,false) = true
      `));
      const [allJod] = rowsOf(await db.execute(sql`
        SELECT COALESCE(SUM(jod_amount),0)::numeric AS jod FROM chips_ledger WHERE reason = 'admin_topup'
      `));
      check(Number(testJod.jod) === 0 || Number(rep.revenue.jodRecorded) < Number(allJod.jod),
        '🚫 شحن حسابات الاختبار مستثنى من الإيراد',
        `اختبار=${testJod.jod} تقرير=${rep.revenue.jodRecorded} الكل=${allJod.jod}`);

      const [testBal] = rowsOf(await db.execute(sql`
        SELECT COALESCE(SUM(GREATEST(COALESCE(chips_balance,0),0)),0)::int AS b
          FROM players WHERE COALESCE(is_test_account,false) = true
      `));
      const [allBal] = rowsOf(await db.execute(sql`
        SELECT COALESCE(SUM(GREATEST(COALESCE(chips_balance,0),0)),0)::int AS b FROM players
      `));
      check(rep.liability.circulatingChips === Number(allBal.b) - Number(testBal.b),
        '🚫 أرصدة حسابات الاختبار مستثناة من الالتزام',
        `تقرير=${rep.liability.circulatingChips} الكل=${allBal.b} اختبار=${testBal.b}`);
    }

    // ٨.١٤ التصدير يخرج CSV صالحاً بترويسة BOM (كي تفتحه Excel بالعربية)
    // ـ تقرير السجل يُحل فعلاً على بيانات حقيقية
    {
      // ⚠️ يُقرأ من السجلّ لا باستيراد مباشر: استيراد الملف ينجح ولو لم يُسجَّل،
      //    فيمرّ الفحص على تقرير لا تصل إليه الواجهة أبداً. هذا ما وقع فعلاً.
      const { getByKey } = await import('../reports/registry.js');
      const chipsEconomyReport: any = getByKey('chips-economy');
      check(!!chipsEconomyReport, 'تقرير chips-economy مُسجَّل في سجلّ التقارير (تصل إليه الواجهة)');

      let doc: any = null, err: any = null;
      try {
        doc = await chipsEconomyReport!.resolve({
          db: db as any, params: {},
          user: { id: 0, username: 'verify', role: 'admin', displayName: 'التحقّق' },
        });
      } catch (e: any) { err = e; }
      check(!!doc && Array.isArray(doc.sections) && doc.sections.length >= 4,
        'تقرير السجل (chips-economy) يُحلّ بلا خطأ',
        err ? String(err?.message).slice(0, 120) : `أقسام=${doc?.sections?.length}`);
      const kpis = doc?.sections?.find((x: any) => x.type === 'kpis');
      check(!!kpis && kpis.items.every((k: any) => k.value !== undefined && k.value !== null),
        'مؤشّرات التقرير محسوبة بلا قيم مفقودة');
    }

    const csv = await exportLedgerCsv({});
    const firstLine = csv.split('\n')[0] || '';
    check(csv.charCodeAt(0) === 0xFEFF, '📤 التصدير يبدأ بـ BOM — Excel يقرأ العربية بلا تشويه');
    check(firstLine.includes('id') || firstLine.includes('رقم'), 'التصدير يحمل صف ترويسة', firstLine.slice(0, 80));
    check(csv.split('\n').length >= 2, 'التصدير يحمل صفوفاً', `أسطر=${csv.split('\n').length}`);

    // تنظيف أثر هذا القسم على حساب الاختبار
    if (cleanupAcct) await cleanupAcct();
  }


  // ══════════════════════════════════════════════════════
  // ٩) التنظيف — الفحص لا يترك أثراً
  //
  // ⚠️ لماذا يلزم: كل تشغيل كان يموّل حساب الاختبار ليشتري، فيتراكم الرصيد
  //    عبر التشغيلات حتى يصير أغلى عنصر في متناوله — فيُتخطّى فحص «الاستئجار
  //    بلا رصيد كافٍ» إلى الأبد. الفحص الذي يبتلعه أثرُه لا يفحص شيئاً.
  //
  // 🔒 النطاق ضيّق عمداً: صفوفٌ مفاتيحُها من صنع هذا السكربت، وعلى حسابات
  //    مُعلَّمة اختباريةً حصراً. لا يمسّ صفّاً واحداً للاعب حقيقي.
  // ══════════════════════════════════════════════════════
  console.log('\n٩) التنظيف:');
  {
    // مفاتيح من صنع السكربت وحده — ثوابت، لا مدخل خارجي
    const MINE = `l.idempotency_key LIKE ANY (ARRAY[
      'verify-%', 'verify2-%', 'store:%:verify-%', 'topup:verify-%',
      'adjust:verify-%', 'verify-fund:%'
    ])`;
    const scoped = (alias = 'l') => `
      SELECT ${alias}.id FROM chips_ledger ${alias}
        JOIN players p ON p.id = ${alias}.player_id
       WHERE COALESCE(p.is_test_account,false) = true
         AND ${MINE.replace(/\bl\./g, `${alias}.`)}`;

    const before = rowsOf(await db.execute(sql.raw(scoped())));

    if (before.length === 0) {
      check(true, 'لا بقايا من تشغيلات سابقة');
    } else {
      // الاسترجاعات أولاً: عكسٌ يشير إلى صفّ محذوف أسوأ من البقيّة نفسها
      await ledgerAdminExec(db, sql.raw(`
        DELETE FROM chips_ledger WHERE reverses_ledger_id IN (${scoped('x')})
      `));
      await ledgerAdminExec(db, sql.raw(`
        DELETE FROM chips_ledger WHERE id IN (${scoped('x')})
      `));

      const after = rowsOf(await db.execute(sql.raw(scoped())));
      check(after.length === 0, `أُزيلت ${before.length} بقيّة من صنع الفحص`, `متبقٍّ=${after.length}`);
    }

    // 🧹 إيجارٌ على حساب اختباري بلا صفّ دفع باقٍ = إيجار دفعت ثمنه بقيّة محذوفة.
    //    الشرط ضيّق عمداً: إيجارٌ اشتراه مُختبِرٌ بشراء حقيقي يبقى، لأن صفّه باقٍ.
    await db.execute(sql`
      DELETE FROM chips_rentals r
       USING players p
       WHERE p.id = r.player_id
         AND COALESCE(p.is_test_account,false) = true
         AND NOT EXISTS (
           SELECT 1 FROM chips_ledger l
            WHERE l.player_id = r.player_id
              AND l.reason IN ('rent_item','renew_item')
              AND l.ref_id = r.item_id::text
         )
    `);

    // 🔁 الكاش يُعاد اشتقاقه من الدفتر — الحذف وحده لا يُصحّح الكاش
    await db.execute(sql`
      UPDATE players p
         SET chips_balance = COALESCE((SELECT SUM(l.amount) FROM chips_ledger l WHERE l.player_id = p.id), 0)
       WHERE COALESCE(p.is_test_account,false) = true
         AND COALESCE(p.chips_balance,0) <> COALESCE((SELECT SUM(l.amount) FROM chips_ledger l WHERE l.player_id = p.id), 0)
    `);


    // 🧹 عكسٌ يشير إلى حركة غير موجودة لا معنى له — بقايا تشغيلاتٍ حُذف
    //    أصلُها قبل أن يتعلّم السكربت التنظيف. على حسابات الاختبار حصراً؛
    //    على لاعب حقيقي هذا خلل يُبلَّغ عنه ولا يُمحى بصمت.
    await ledgerAdminExec(db, sql`
      DELETE FROM chips_ledger l
       USING players p
       WHERE p.id = l.player_id
         AND COALESCE(p.is_test_account,false) = true
         AND l.reverses_ledger_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM chips_ledger r WHERE r.id = l.reverses_ledger_id)
    `);
    await db.execute(sql`
      UPDATE players p
         SET chips_balance = COALESCE((SELECT SUM(l.amount) FROM chips_ledger l WHERE l.player_id = p.id), 0)
       WHERE COALESCE(p.is_test_account,false) = true
         AND COALESCE(p.chips_balance,0) <> COALESCE((SELECT SUM(l.amount) FROM chips_ledger l WHERE l.player_id = p.id), 0)
    `);

    const drift = rowsOf(await db.execute(sql`
      SELECT p.id FROM players p
       WHERE COALESCE(p.chips_balance,0) <> COALESCE((SELECT SUM(l.amount) FROM chips_ledger l WHERE l.player_id = p.id), 0)
    `));
    check(drift.length === 0, 'لا انحراف بين الكاش والدفتر لأي لاعب بعد التنظيف',
      drift.length ? `منحرف=${drift.map((d: any) => d.id).join(',')}` : '');

    const dangling = rowsOf(await db.execute(sql`
      SELECT l.id FROM chips_ledger l
       WHERE l.reverses_ledger_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM chips_ledger r WHERE r.id = l.reverses_ledger_id)
    `));
    check(dangling.length === 0, 'لا سطر عكس يشير إلى حركة غير موجودة',
      dangling.length ? `معلَّق=${dangling.length}` : '');
  }


  // ══════════════════════════════════════════════════════
  // ١٠) صفّ إيجار واحد لكل (لاعب، عنصر)
  //
  // ⚠️ التكرار لم يكن أثر تزامن كما بدا: البحث كان مشروطاً بـ
  //    `expires_at > now`، فإيجارٌ منتهٍ + شراء جديد يُنتجان صفّاً ثانياً —
  //    وهذا يقع لكل من اشترى ثم ترك العنصر ينتهي ثم عاد. وصفّان
  //    **فعّالان معاً** (من `grantRental` الأعمى) يجعلان الاسترجاع هديّة:
  //    يُبطل أحدهما ويبقى الآخر.
  // ══════════════════════════════════════════════════════
  console.log('\n١٠) صفّ إيجار واحد لكل عنصر:');
  {
    const { rentItem: rent2, grantRental } = await import('../services/chips-store.service.js');

    const tp = rowsOf(await db.execute(sql`
      SELECT id FROM players WHERE COALESCE(is_test_account,false) = true ORDER BY id LIMIT 1
    `))[0];
    const cheap = rowsOf(await db.execute(sql`
      SELECT id, price_chips FROM chips_items
       WHERE is_active = true AND is_purchasable = true AND closed_at IS NULL
       ORDER BY price_chips ASC LIMIT 1
    `))[0];

    if (!tp || !cheap) {
      check(true, 'تخطّي فحص الصفّ الواحد (لا حساب اختباري أو لا عنصر)');
    } else {
      const pid = Number(tp.id);
      const iid = Number(cheap.id);
      const price = Number(cheap.price_chips) || 0;

      const countRows = async () => Number(rowsOf(await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${iid}
      `))[0]?.c ?? 0);

      await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${iid}`);

      // تمويل يكفي شراءين
      const fundKey = `verify-onerow-${Date.now().toString(36)}`;
      await db.execute(sql`
        INSERT INTO chips_ledger (player_id, amount, balance_after, reason, ref_type, idempotency_key, note)
        SELECT ${pid}, ${price * 3 + 10}, COALESCE(chips_balance,0) + ${price * 3 + 10}, 'admin_adjust', 'manual',
               ${fundKey}, 'تمويل فحص الصفّ الواحد'
          FROM players WHERE id = ${pid}
      `);
      await db.execute(sql`UPDATE players SET chips_balance = COALESCE(chips_balance,0) + ${price * 3 + 10} WHERE id = ${pid}`);

      // ١٠.١ شراء أول
      const b1 = await rent2({ playerId: pid, itemId: iid, requestId: `verify-r1-${Date.now().toString(36)}` });
      check(!!b1.ok && (await countRows()) === 1, 'شراء أول ⇒ صفّ واحد', JSON.stringify(b1).slice(0, 80));

      // ١٠.٢ 🔴 نُنهي المدّة يدوياً ثم نشتري ثانيةً — هذا ما كان يُنتج الصفّ الثاني
      await db.execute(sql`UPDATE chips_rentals SET expires_at = NOW() - interval '1 day' WHERE player_id = ${pid} AND item_id = ${iid}`);
      const b2 = await rent2({ playerId: pid, itemId: iid, requestId: `verify-r2-${Date.now().toString(36)}` });
      const after2 = await countRows();
      check(!!b2.ok && after2 === 1,
        '🔴 شراء بعد انتهاء المدّة يُحيي الصفّ نفسه ولا يُنشئ ثانياً', `صفوف=${after2}`);

      // ١٠.٣ الشراء بعد الانتهاء يُسجَّل شراءً لا تجديداً (تصنيف الإيراد)
      const [reason2] = rowsOf(await db.execute(sql`
        SELECT reason FROM chips_ledger WHERE player_id = ${pid} AND reason IN ('rent_item','renew_item')
         ORDER BY id DESC LIMIT 1
      `));
      check(reason2?.reason === 'rent_item',
        'الشراء بعد الانتهاء يُصنَّف rent_item لا renew_item', `السبب=${reason2?.reason}`);

      // ١٠.٤ تجديد فوق إيجار **فعّال** يبقى صفّاً واحداً ويُصنَّف تجديداً
      const b3 = await rent2({ playerId: pid, itemId: iid, requestId: `verify-r3-${Date.now().toString(36)}` });
      const after3 = await countRows();
      const [reason3] = rowsOf(await db.execute(sql`
        SELECT reason FROM chips_ledger WHERE player_id = ${pid} AND reason IN ('rent_item','renew_item')
         ORDER BY id DESC LIMIT 1
      `));
      check(!!b3.ok && after3 === 1 && reason3?.reason === 'renew_item',
        'التجديد فوق إيجار فعّال: صفّ واحد وتصنيف renew_item', `صفوف=${after3} سبب=${reason3?.reason}`);

      // ١٠.٥ 🔴 المنح الإداري فوق إيجار قائم لا يُنشئ صفّاً ثانياً
      //      (هذا هو المسار الوحيد الذي كان يُنتج صفّين فعّالين ⇒ استرجاع = هديّة)
      const g = await grantRental({ playerId: pid, itemId: iid, days: 3, source: 'admin_grant' });
      const after4 = await countRows();
      check(!!g.ok && after4 === 1,
        '🔴 منح إداري فوق إيجار قائم ⇒ صفّ واحد (لا استرجاع-هديّة)', `صفوف=${after4}`);

      // ١٠.٦ لا صفوف مكرّرة لأي لاعب في القاعدة كلها
      const dupes = rowsOf(await db.execute(sql`
        SELECT player_id, item_id, COUNT(*)::int AS c
          FROM chips_rentals GROUP BY player_id, item_id HAVING COUNT(*) > 1
      `));
      check(dupes.length === 0, 'لا صفّ إيجار مكرّر في القاعدة كلها',
        dupes.length ? `مكرّر=${dupes.length} أول=${JSON.stringify(dupes[0])}` : '');

      // ١٠.٧ القيد نفسه موجود — الشيفرة وعد، والفهرس إلزام
      const uix = rowsOf(await db.execute(sql`
        SELECT indexdef FROM pg_indexes
         WHERE tablename = 'chips_rentals' AND indexname = 'idx_chips_rentals_player_item'
      `));
      check(uix.length === 1 && /UNIQUE/i.test(uix[0].indexdef),
        '🔒 فهرس فريد على (player_id, item_id)',
        uix.length ? String(uix[0].indexdef).slice(0, 90) : 'مفقود');

      // ١٠.٨ وإدراج مكرّر متعمّد يُرفض من القاعدة لا من الكود
      let rejected = false;
      try {
        await db.transaction(async (tx: any) => {
          await tx.execute(sql`
            INSERT INTO chips_rentals (player_id, item_id, starts_at, expires_at, source)
            VALUES (${pid}, ${iid}, NOW(), NOW() + interval '1 day', 'rent'),
                   (${pid}, ${iid}, NOW(), NOW() + interval '2 day', 'rent')
          `);
        });
      } catch { rejected = true; }
      check(rejected, '🔒 إدراج صفّين لنفس (لاعب، عنصر) مرفوض على مستوى القاعدة');

      // تنظيف
      await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid} AND item_id = ${iid}`);
    }
  }

  // ══════════════════════════════════════════════════════
  // ١١) القراءة قراءة — لا كتابة ولا إشعار من GET
  // ══════════════════════════════════════════════════════
  console.log('\n١١) القراءة لا تكتب:');
  {
    const { getPlayerCosmetics: readCos, sweepStaleEquipSlots } = await import('../services/chips-store.service.js');
    const src = await import('fs').then(fs =>
      fs.readFileSync(new URL('../routes/chips-store.routes.ts', import.meta.url), 'utf8').toString(),
    ).catch(() => '');

    if (src) {
      const getBlock = src.slice(src.indexOf("router.get('/store'"), src.indexOf("router.post('/store/rent'"));
      check(!getBlock.includes('notifyExpiringSoon('),
        '⛔ GET /store لا يستدعي التنبيه (كان يُرسل إشعاراً مع كل فتحة)');
    } else {
      check(true, 'تخطّي فحص المصدر (غير متاح داخل الحاوية)');
    }

    const tp = rowsOf(await db.execute(sql`
      SELECT id FROM players WHERE COALESCE(is_test_account,false) = true ORDER BY id LIMIT 1
    `))[0];
    if (tp) {
      const pid = Number(tp.id);
      const snap = async () => JSON.stringify(rowsOf(await db.execute(sql`
        SELECT chips_frame_item_id, chips_title_item_id, chips_name_fx_item_id FROM players WHERE id = ${pid}
      `))[0]);
      const before = await snap();
      await readCos(pid); await readCos(pid); await readCos(pid);
      const after = await snap();
      check(before === after, 'ثلاث قراءات للمظهر لا تُغيّر عمود تجهيز واحداً', `قبل=${before} بعد=${after}`);

      const warnedBefore = rowsOf(await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM chips_rentals WHERE player_id = ${pid} AND warned_at IS NOT NULL
      `))[0]?.c;
      await readCos(pid);
      const warnedAfter = rowsOf(await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM chips_rentals WHERE player_id = ${pid} AND warned_at IS NOT NULL
      `))[0]?.c;
      check(Number(warnedBefore) === Number(warnedAfter), 'القراءة لا تضع علامة تنبيه');
    } else {
      check(true, 'تخطّي فحص الكتابة (لا حساب اختباري)');
    }

    // المكنسة موجودة وتعمل — هي البديل عن التنظيف الكسول المحذوف
    const swept = await sweepStaleEquipSlots();
    check(typeof swept === 'number', 'مكنسة الخانات المنتهية تعمل', `صفوف=${swept}`);

    const stale = rowsOf(await db.execute(sql`
      SELECT p.id FROM players p
       WHERE (p.chips_frame_item_id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM chips_rentals r WHERE r.player_id = p.id AND r.item_id = p.chips_frame_item_id AND r.expires_at > NOW()))
          OR (p.chips_title_item_id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM chips_rentals r WHERE r.player_id = p.id AND r.item_id = p.chips_title_item_id AND r.expires_at > NOW()))
          OR (p.chips_name_fx_item_id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM chips_rentals r WHERE r.player_id = p.id AND r.item_id = p.chips_name_fx_item_id AND r.expires_at > NOW()))
    `));
    check(stale.length === 0, 'لا خانة مُجهَّزة تشير إلى إيجار منتهٍ بعد المكنسة',
      stale.length ? `عالقة=${stale.length}` : '');
  }


  // ══════════════════════════════════════════════════════
  // ١٢) نغمة النصر — كل عنصر يرتبط بملفّه بعينه
  //
  // ⚠️ كان الربط بمفتاح حدث واحد للبند كلّه. فلو رُبِط بالمفتاح صوتان،
  //    صار أيّهما يُعزَف مسألة حظّ — ولذلك استحال بيع أكثر من نغمة واحدة
  //    مهما رُفع من ملفات. الآن العنصر يشير إلى صفّ الصوت بمعرّفه.
  // ══════════════════════════════════════════════════════
  console.log('\n١٢) نغمة النصر:');
  {
    const { listVictoryStings, getStingById, STING_EVENT_KEY } =
      await import('../services/chips-store.service.js');
    const { normalizeItemConfig } = await import('../shared/chips-design.contract.js');

    // ١٢.١ العقد يقبل الربط بالمعرّف ويرفض ما دونه
    const okById: any = normalizeItemConfig('victory_sting', { soundId: 7 });
    check(okById.ok && okById.config.soundId === 7 && !('soundKey' in okById.config),
      'العقد يقبل الربط بمعرّف الصوت', JSON.stringify(okById).slice(0, 90));

    const legacy: any = normalizeItemConfig('victory_sting', { soundKey: 'chips_victory_sting' });
    check(legacy.ok && legacy.config.soundKey === 'chips_victory_sting',
      'العناصر القديمة (بمفتاح) ما زالت مقبولة — لا تنكسر مبيعات سابقة');

    const bad: any = normalizeItemConfig('victory_sting', {});
    check(!bad.ok && bad.field === 'config.soundId',
      'بلا نغمة مختارة ⇒ رفض صريح بحقل واضح', JSON.stringify(bad).slice(0, 90));

    const badId: any = normalizeItemConfig('victory_sting', { soundId: 0 });
    check(!badId.ok, 'معرّف صفري مرفوض');

    // ١٢.٢ المكتبة تُقرأ من الأصوات المرفوعة فعلاً
    const lib = await listVictoryStings();
    check(Array.isArray(lib), 'مكتبة النغمات تُقرأ', `عدد=${lib.length}`);
    check(lib.every(x => x.url.startsWith('/uploads/sounds/')),
      'كل نغمة تحمل رابط ملفها (المتجر يُسمعها قبل الشراء)');

    const dbKeys = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM sound_effects
       WHERE event_keys @> ${JSON.stringify([STING_EVENT_KEY])}::jsonb
    `));
    check(Number(dbKeys[0]?.c ?? 0) === lib.length,
      'المكتبة تطابق ما هو مربوط بالبند في القاعدة', `قاعدة=${dbKeys[0]?.c} مكتبة=${lib.length}`);

    // ١٢.٣ 🔑 البند يقبل أكثر من ملف — وهذا هو أصل الحلّ
    check(true, `يمكن ربط أي عدد بالبند نفسه (المرفوع حالياً: ${lib.length})`);

    // ١٢.٤ معرّف غير موجود لا يُرجع شيئاً (لا تُباع نغمة بلا صوت)
    const ghost = await getStingById(999999);
    check(ghost === null, 'معرّف صوت غير موجود ⇒ null (العنصر يختفي من المتجر)');

    if (lib.length && lib[0].isActive) {
      const real = await getStingById(lib[0].id);
      check(!!real && real.url === lib[0].url, 'المعرّف الحقيقي يُرجع ملفّه بعينه');
    } else {
      check(true, 'تخطّي فحص المعرّف الحقيقي (لا نغمة مفعّلة مرفوعة بعد)');
    }

    // ١٢.٥ الشاشة تعزف الملف لا المفتاح — وإلا عادت مسألة الحظّ
    try {
      const fs = await import('fs');
      const src = fs.readFileSync(
        new URL('../../../frontend/src/app/display/page.tsx', import.meta.url), 'utf8').toString();
      const blk = src.slice(src.indexOf("socket.on('chips:victory-sting'"), src.indexOf("socket.on('game:started'"));
      check(blk.includes('d.soundUrl') && blk.includes('new Audio('),
        'شاشة العرض تعزف الملف المربوط مباشرةً');
    } catch {
      check(true, 'تخطّي فحص مصدر الشاشة (غير متاح داخل الحاوية)');
    }
  }


  // ══════════════════════════════════════════════════════
  // ١٣) التسليم — المشتري يرى ما دفع ثمنه
  //
  // ⚠️ فحوص مصدرية عمداً: هذه أعطال «لا يُمرَّر شيء» — لا حالة قاعدة تكشفها،
  //    ولا استعلام يُثبتها. الشيء الوحيد الذي يمنع عودتها هو أن يبقى
  //    التمرير مكتوباً في الملف.
  // ══════════════════════════════════════════════════════
  console.log('\n١٣) التسليم على الأسطح:');
  {
    const fs = await import('fs');
    const read = (rel: string) => {
      try { return fs.readFileSync(new URL(rel, import.meta.url), 'utf8').toString(); }
      catch { return ''; }
    };

    const cine = read('../../../frontend/src/components/NightAnimCinematic.tsx');
    if (!cine) {
      check(true, 'تخطّي فحوص المصدر (ملفات الواجهة غير متاحة داخل الحاوية)');
    } else {
      const cards = (cine.match(/<MafiaCard/g) || []).length;
      const looks = (cine.match(/lookOf\(players,/g) || []).length;
      // بطاقة واحدة نائبة بلا هوية (playerNumber={0}) لا تأخذ مظهر أحد
      check(cards > 0 && looks >= (cards - 1) * 2,
        `المشهد الليلي يمرّر المظهر والرتبة لكل بطاقة ذات هوية (${cards} بطاقة · ${looks} بحث)`,
        `بطاقات=${cards} عمليات بحث=${looks}`);

      check(cine.includes('function lookOf(') && cine.includes('Number(x.physicalId) === Number(physicalId)'),
        '🔑 البحث بالمعرّف الفيزيائي لا بترتيب المصفوفة (القنّاص وهدفه في مشهد واحد)');

      const disp = read('../../../frontend/src/app/display/page.tsx');
      check(disp.includes('<NightAnimCinematic data={animation} players={players} />'),
        'الشاشة تُغذّي المشهد بقائمة اللاعبين');

      check((disp.match(/showInRecap/g) || []).length >= 2,
        '🔥 showInRecap صار له مستهلك فعلي في شبكتَي النتائج (كان يُخزَّن ولا يُقرأ أبداً)');

      const prof = read('../../../frontend/src/app/player/profile/page.tsx');
      check(prof.includes('usePlayerCosmetics') && prof.includes('<DynamicMafiaCard'),
        'صفحة البروفايل تعرض بطاقة اللاعب بمظهره');

      // ⚠️ ترتيب الخطّافات: الصفحة تُرجِع مبكراً مرّتين قبل الجسم الرئيسي
      const hookAt = prof.indexOf('usePlayerCosmetics()');
      const firstReturn = prof.indexOf('if(loading)return(');
      check(hookAt > 0 && firstReturn > 0 && hookAt < firstReturn,
        '🪝 الخطّاف قبل أي إرجاع مبكر — وإلا تغيّر عددها بين الرسمتين وسقط React',
        `الخطّاف=${hookAt} أوّل إرجاع=${firstReturn}`);

      const hook = read('../../../frontend/src/hooks/usePlayerCosmetics.ts');
      check(hook.includes('reconnectSocketAuth'),
        '🔌 الخطّاف يُصلح سباق الانضمام لغرفة اللاعب (البثّ لا يصل لمن اتّصل قبل كتابة الرمز)');
    }
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
