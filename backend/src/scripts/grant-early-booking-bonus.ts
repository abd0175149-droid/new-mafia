// ══════════════════════════════════════════════════════
// 🎁 منح مكافأة RR للحاجزين المرتبطين بحسابات في فعاليّة (حجز مبكر)
// التشغيل: ACTIVITY_ID=164 RR=20 npx tsx src/scripts/grant-early-booking-bonus.ts
// - يسجّل المكافأة في rank_bonuses (تدخل في إعادة الاحتساب فلا تُمحى)
// - يطبّقها حيّاً عبر applyRR (يتولّى الترقيات)
// - يرسل إشعاراً دفعياً لكل لاعب
// - آمن لإعادة التشغيل: يتخطّى من نال نفس المكافأة (نفس reason)
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB, connectDB } from '../config/db.js';
import { applyRR } from '../services/progression.service.js';
import { sendPushToPlayer } from '../services/fcm.service.js';
import { getActiveRegularSeasonId } from '../services/season.service.js';

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
  console.log(`🎯 ${act.name} — مكافأة ${RR} RR — سبب: ${reason}`);

  // الجدول (احتياط إن سبق تشغيل السكربت قبل نشر ميغريشن الإقلاع)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS rank_bonuses (
    id SERIAL PRIMARY KEY, player_id INTEGER NOT NULL, rr INTEGER NOT NULL,
    reason VARCHAR(200) DEFAULT '', season_id INTEGER, created_at TIMESTAMP DEFAULT NOW() NOT NULL)`);

  // الحاجزون المرتبطون (غير الملغيّين) — لاعب واحد مرة واحدة
  const rRes: any = await db.execute(sql`
    SELECT DISTINCT r.player_id, p.name
    FROM reservations r JOIN players p ON p.id = r.player_id
    WHERE r.activity_id = ${ACTIVITY_ID} AND r.deleted_at IS NULL
      AND r.status <> 'cancelled' AND r.player_id IS NOT NULL
    ORDER BY r.player_id`);
  const rows: any[] = rRes?.rows ?? rRes ?? [];
  console.log(`👥 حاجزون مرتبطون: ${rows.length}`);

  const seasonId = await getActiveRegularSeasonId();
  let granted = 0, skipped = 0, pushed = 0;
  for (const r of rows) {
    const pid = Number(r.player_id);
    // منع الازدواج
    const dupRes: any = await db.execute(sql`SELECT id FROM rank_bonuses WHERE player_id = ${pid} AND reason = ${reason} LIMIT 1`);
    if (((dupRes?.rows ?? dupRes) || []).length) { console.log(`⏭️ ${r.name} (#${pid}) — ناله سابقاً`); skipped++; continue; }

    await db.execute(sql`INSERT INTO rank_bonuses (player_id, rr, reason, season_id) VALUES (${pid}, ${RR}, ${reason}, ${seasonId ?? null})`);
    const res = await applyRR(pid, RR);
    granted++;
    console.log(`✅ ${r.name} (#${pid}) +${RR} RR → ${res.newTier} ${res.newRR}RR${res.promoted ? ' 🎉 ترقية!' : ''}`);

    try {
      await sendPushToPlayer(pid, '🎁 مكافأة الحجز المبكر',
        `حصلت على ${RR} نقطة رانك لحجزك المبكر في ${act.name} — شكراً لالتزامك! 🎉`,
        'rank_bonus', { activityId: String(ACTIVITY_ID) });
      pushed++;
    } catch (e: any) { console.log(`  ⚠️ إشعار ${r.name}: ${e.message}`); }
  }
  console.log(`\n🏁 مُنح: ${granted} | مُتخطّى: ${skipped} | إشعارات: ${pushed}/${granted}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAIL:', e); process.exit(1); });
