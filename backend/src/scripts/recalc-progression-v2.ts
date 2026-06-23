// ══════════════════════════════════════════════════════
// 🔄 إعادة احتساب التقدّم (RR/XP/المباريات) من مصدر الحقيقة: match_players
// ══════════════════════════════════════════════════════
// واجهة CLI رفيعة فوق reconcile.service — نفس المنطق المستخدم في الإنهاء التلقائي
// للفعالية (session.service.endActivityRoom). كل منطق إعادة الاحتساب يعيش الآن في
// services/reconcile.service.ts (مصدر واحد، بلا تكرار).
//
// التشغيل:
//   tsx src/scripts/recalc-progression-v2.ts                     → تقرير فقط (dry-run)
//   tsx src/scripts/recalc-progression-v2.ts --apply             → يطبّق التغييرات
//   tsx src/scripts/recalc-progression-v2.ts --apply --season 2  → موسم محدّد
// ══════════════════════════════════════════════════════

import { connectDB, getDB } from '../config/db.js';
import { reconcileSeasonProgression } from '../services/reconcile.service.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`🔄 Recalc progression [stored xp/rr for ALL roles from match_players] — mode: ${APPLY ? '⚠️  APPLY (writes)' : '🔍 DRY-RUN (report only)'}`);
  await connectDB();
  if (!getDB()) { console.error('❌ DB unavailable'); process.exit(1); }

  const seasonArgIdx = process.argv.indexOf('--season');
  const targetSeasonId: number | null = seasonArgIdx >= 0 ? parseInt(process.argv[seasonArgIdx + 1]) : null;

  const res = await reconcileSeasonProgression(targetSeasonId, APPLY, (m) => console.log(m));

  if (res.reason === 'mass-zero-guard') {
    console.error('❌ Recalc aborted by mass-zero guard. No changes written.');
    process.exit(1);
  }
  if (!APPLY) console.log('Re-run with --apply to write.');
  process.exit(0);
}

main().catch(err => { console.error('❌ Recalc failed:', err); process.exit(1); });
