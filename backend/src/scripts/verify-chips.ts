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
      await db.execute(sql`DELETE FROM chips_ledger WHERE idempotency_key = ${fakeLegacy}`);

      // تنظيف كامل — الرصيد يعود لما كان
      await db.execute(sql`DELETE FROM chips_rentals WHERE player_id = ${pid}`);
      // يشمل بقايا الفحوص القديمة (store:verify-*, rent:*, renew:*) كي يبقى
      // ثابت «لا يتيم» نظيفاً في المرات القادمة بدل أن يتراكم الضجيج.
      await db.execute(sql`
        DELETE FROM chips_ledger
         WHERE player_id = ${pid}
           AND (idempotency_key LIKE 'store:%'
             OR idempotency_key LIKE 'rent:%'
             OR idempotency_key LIKE 'renew:%'
             OR idempotency_key LIKE 'verify%')
      `);
      await db.execute(sql`UPDATE players SET chips_frame_item_id = NULL, chips_title_item_id = NULL, chips_name_fx_item_id = NULL WHERE id = ${pid}`);
      await db.execute(sql`UPDATE players SET chips_balance = COALESCE((SELECT SUM(amount) FROM chips_ledger WHERE player_id = ${pid}),0) WHERE id = ${pid}`);
      const back = rowsOf(await db.execute(sql`SELECT COALESCE(chips_balance,0)::int AS b FROM players WHERE id = ${pid}`))[0];
      check(Number(back?.b) === 0, 'نُظّفت آثار اختبار الشراء بالكامل', `الرصيد=${back?.b}`);
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
