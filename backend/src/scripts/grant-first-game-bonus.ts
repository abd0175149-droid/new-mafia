// ══════════════════════════════════════════════════════
// 🎉 منحة تأسيسية: 10 🪙 لكل من لعب معنا مرة واحدة على الأقل
//
// قرار المالك عند إطلاق النظام: من لعب قبل إطلاق التشبس يستحق
// مكافأة «أول لعبة» بأثر رجعي، تماماً كما يستحقّها اللاعب الجديد.
//
// 🔒 مفتاح `first_game_bonus:{playerId}` ⇒ التشغيل مرتين لا يمنح مرتين.
// 🔒 من نال drop_first_match أصلاً (لاعب جديد بعد الإطلاق) يُستثنى — لا ازدواج.
//
// التشغيل:  docker exec mafia-prod-backend-1 npx tsx src/scripts/grant-first-game-bonus.ts [--apply]
//   بلا --apply → عرض فقط (جفاف تام، لا يمسّ شيئاً)
// ══════════════════════════════════════════════════════

import { connectDB, getDB, disconnectDB } from '../config/db.js';
import { sql } from 'drizzle-orm';
import { applyChipsTx } from '../services/chips.service.js';

const AMOUNT = 10;
const APPLY = process.argv.includes('--apply');
// ⚠️ الإشعار صامت افتراضياً: منحة جماعية = إعلان جماعي.
//    الرصيد يُودَع بهدوء الآن، والإعلان يبقى بيد المالك (--notify).
const NOTIFY = process.argv.includes('--notify');

function rowsOf(res: any): any[] { return res?.rows ?? (Array.isArray(res) ? res : []); }

async function main() {
  await connectDB();
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  console.log(`\n🎉 منحة أول لعبة — ${AMOUNT} 🪙 لكل من لعب مرة على الأقل`);
  console.log(APPLY ? '⚙️  وضع التنفيذ' : '👀 وضع العرض فقط (أضف --apply للتنفيذ)');
  console.log(NOTIFY ? '🔔 مع إشعار لكل لاعب\n' : '🔕 بلا إشعارات — الإيداع صامت (أضف --notify للإعلان)\n');

  // المؤهَّلون: لعب مباراة واحدة على الأقل (بأي مصدر: عدّاد مدى الحياة أو سجل المباريات)
  // ولم ينل منحة أول لعبة من قبل — لا التلقائية ولا هذه.
  const res: any = await db.execute(sql`
    SELECT p.id, p.name, COALESCE(p.lifetime_matches,0)::int AS lm,
           COALESCE(p.chips_balance,0)::int AS bal, COALESCE(p.is_test_account,false) AS is_test
      FROM players p
     WHERE (
            COALESCE(p.lifetime_matches,0) > 0
            OR EXISTS (SELECT 1 FROM match_players mp WHERE mp.player_id = p.id)
           )
       AND NOT EXISTS (
            SELECT 1 FROM chips_ledger l
             WHERE l.player_id = p.id
               AND (l.reason = 'drop_first_match' OR l.idempotency_key = 'first_game_bonus:' || p.id)
           )
     ORDER BY p.id
  `);

  const list = rowsOf(res);
  const tests = list.filter((r: any) => r.is_test).length;

  console.log(`👥 المؤهَّلون: ${list.length} لاعباً (منهم ${tests} محسوبون حسابات اختبار)`);
  console.log(`🪙 الإجمالي المطلوب: ${list.length * AMOUNT}\n`);

  if (list.length === 0) { console.log('لا أحد مؤهَّل — ربما نُفِّذت المنحة سابقاً.'); await disconnectDB(); return; }

  console.log('أول 10 أسماء:');
  list.slice(0, 10).forEach((r: any) => console.log(`   #${r.id} ${r.name} (${r.lm} مباراة · رصيده ${r.bal})`));
  if (list.length > 10) console.log(`   … و${list.length - 10} غيرهم`);

  if (!APPLY) {
    console.log('\n👀 لم يُنفَّذ شيء. أعد التشغيل مع --apply للتنفيذ الفعلي.\n');
    await disconnectDB();
    return;
  }

  let ok = 0, dup = 0, fail = 0;
  for (const r of list) {
    const res2 = await applyChipsTx({
      playerId: Number(r.id),
      amount: AMOUNT,
      reason: 'drop_first_match',
      idempotencyKey: `first_game_bonus:${r.id}`,
      refType: 'manual',
      refId: 'launch_grant',
      note: 'مكافأة أول لعبة — منحة إطلاق النظام',
      notify: NOTIFY ? {
        title: `🎉 +${AMOUNT} 🪙 مكافأة أول لعبة`,
        body: 'وصل نظام التشبس! هديّة النادي لك لأنك لعبت معنا — افتح الخزنة واختر شكلك',
      } : null,
    });
    if (res2.ok && !res2.duplicate) ok++;
    else if (res2.ok && res2.duplicate) dup++;
    else { fail++; console.warn(`   ⚠️ فشل #${r.id}: ${res2.message}`); }
  }

  console.log(`\n✅ مُنحت: ${ok} · مكرّرة (تُخطّت): ${dup} · فشلت: ${fail}`);
  console.log(`🪙 إجمالي ما وُزّع: ${ok * AMOUNT}\n`);
  await disconnectDB();
}

main().catch(async (e) => {
  console.error('💥 فشل:', e?.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
