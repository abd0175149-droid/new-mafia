// ══════════════════════════════════════════════════════
// 🎁 منح مكافأة RR للحاجزين المرتبطين بحسابات في فعاليّة (حجز مبكر)
// التشغيل: ACTIVITY_ID=164 RR=20 npx tsx src/scripts/grant-early-booking-bonus.ts
// - يسجّل المكافأة في rank_bonuses بموسم الفعاليّة **ومدينة مكانها** (تدخل في إعادة الاحتساب فلا تُمحى)
// - يطبّقها عبر المصالحة المستهدفة (صفّ الموسم/المدينة + مرآة players.*) — لا كتابةَ مباشرة
// - يرسل إشعاراً دفعياً لكل لاعب
// - آمن لإعادة التشغيل: يتخطّى من نال نفس المكافأة (نفس reason)
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB, connectDB } from '../config/db.js';
import { sendPushToPlayer } from '../services/fcm.service.js';
import { resolveSeasonForActivity, describeScope, getStanding } from '../services/season.service.js';
import { reconcileSeasonProgression } from '../services/reconcile.service.js';

const ACTIVITY_ID = parseInt(process.env.ACTIVITY_ID || '0');
const RR = parseInt(process.env.RR || '20');

async function main() {
  if (!ACTIVITY_ID) { console.error('❌ ACTIVITY_ID مطلوب'); process.exit(1); }
  await connectDB();
  const db = getDB();
  if (!db) { console.error('❌ لا قاعدة بيانات'); process.exit(1); }

  // الفعاليّة
  const actRes: any = await db.execute(sql`SELECT id, name FROM activities WHERE id = ${ACTIVITY_ID} AND deleted_at IS NULL`);
  const act = (actRes?.rows ?? actRes)?.[0];
  if (!act) { console.error('❌ الفعاليّة غير موجودة'); process.exit(1); }
  const reason = `early-booking:activity-${ACTIVITY_ID}`;

  // 🏙️ النطاق: موسم الفعاليّة ومدينة مكانها — بلا موسمٍ أو مدينةٍ لا منح (مكافأةٌ بلا نطاق تُمحى في أوّل مصالحة)
  const scope = await describeScope(await resolveSeasonForActivity(ACTIVITY_ID));
  if (!scope.seasonId) { console.error('❌ لا موسمَ نشطاً لهذه الفعاليّة (أو بلا مكان) — لا منح'); process.exit(1); }
  if (scope.isRegular && scope.cityId == null) { console.error('❌ مكان الفعاليّة بلا مدينة — لا منح'); process.exit(1); }
  console.log(`🎯 ${act.name} — مكافأة ${RR} RR — سبب: ${reason} — الموسم #${scope.seasonId} (${scope.seasonName || ''})${scope.cityName ? ` — المدينة: ${scope.cityName}` : ''}`);

  // الحاجزون المرتبطون (غير الملغيّين) — لاعب واحد مرة واحدة
  const rRes: any = await db.execute(sql`
    SELECT DISTINCT r.player_id, p.name
    FROM reservations r JOIN players p ON p.id = r.player_id
    WHERE r.activity_id = ${ACTIVITY_ID} AND r.deleted_at IS NULL
      AND r.status <> 'cancelled' AND r.player_id IS NOT NULL
    ORDER BY r.player_id`);
  const rows: any[] = rRes?.rows ?? rRes ?? [];
  console.log(`👥 حاجزون مرتبطون: ${rows.length}`);

  let granted = 0, skipped = 0, pushed = 0;
  const grantedIds: number[] = [];
  for (const r of rows) {
    const pid = Number(r.player_id);
    // منع الازدواج
    const dupRes: any = await db.execute(sql`SELECT id FROM rank_bonuses WHERE player_id = ${pid} AND reason = ${reason} LIMIT 1`);
    if (((dupRes?.rows ?? dupRes) || []).length) { console.log(`⏭️ ${r.name} (#${pid}) — ناله سابقاً`); skipped++; continue; }

    await db.execute(sql`INSERT INTO rank_bonuses (player_id, rr, xp, reason, season_id, activity_id, city_id)
      VALUES (${pid}, ${RR}, 0, ${reason}, ${scope.seasonId}, ${ACTIVITY_ID}, ${scope.cityId ?? null})`);
    granted++;
    grantedIds.push(pid);
  }

  // المصالحة المستهدفة — تكتب صفّ (الموسم، المدينة) وتزامن المرآة
  if (grantedIds.length) {
    const rec = await reconcileSeasonProgression(scope.seasonId, true, () => {}, { onlyPlayerIds: grantedIds });
    console.log(`🔄 مصالحة: applied=${rec.applied} rows=${rec.rows}`);
    for (const r of rows) {
      const pid = Number(r.player_id);
      if (!grantedIds.includes(pid)) continue;
      const st = await getStanding(pid, scope.seasonId, scope.cityId ?? null);
      console.log(`✅ ${r.name} (#${pid}) +${RR} RR → ${st.rankTier} ${st.rankRR}RR${st.cityName ? ` (${st.cityName})` : ''}`);
      try {
        await sendPushToPlayer(pid, '🎁 مكافأة الحجز المبكر',
          `حصلت على ${RR} نقطة رانك${scope.cityName ? ` في ${scope.cityName}` : ''} لحجزك المبكر في ${act.name} — شكراً لالتزامك! 🎉`,
          'rank_bonus', { activityId: String(ACTIVITY_ID), cityId: scope.cityId != null ? String(scope.cityId) : '', cityName: scope.cityName || '' });
        pushed++;
      } catch (e: any) { console.log(`  ⚠️ إشعار ${r.name}: ${e.message}`); }
    }
  }
  console.log(`\n🏁 مُنح: ${granted} | مُتخطّى: ${skipped} | إشعارات: ${pushed}/${granted}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAIL:', e); process.exit(1); });
