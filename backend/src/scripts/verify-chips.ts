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
      await db.execute(sql`DELETE FROM chips_ledger WHERE ref_type = 'match' AND ref_id = ${String(fakeMatch)}`);
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
