// ══════════════════════════════════════════════════════
// 🔍 سكربت تدقيق عدد المباريات لكل لاعب
// يقارن total_matches المخزن في players مع العدد الفعلي من match_players
// ══════════════════════════════════════════════════════
// 
// الاستخدام:
//   npx tsx src/scripts/audit_match_counts.ts          → تدقيق فقط (عرض الفروقات)
//   npx tsx src/scripts/audit_match_counts.ts --fix    → تصحيح القيم الخاطئة
//

import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { matchPlayers, matches } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { eq, isNotNull } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5432/mafia_db',
});
const db = drizzle(pool);

const FIX_MODE = process.argv.includes('--fix');

// ── أدوار المافيا (لحساب الفوز) ──
function isMafiaRole(role: string): boolean {
  const mafiaRoles = [
    'GODFATHER', 'MAFIA', 'MAFIA_REGULAR', 'SILENCER', 'SNIPER', 'NIGHTMARE',
    'THIEF', 'POISONER', 'HACKER', 'SPY', 'HYPNOTIST', 'CHAMELEON',
    'BOMBER', 'CORRUPT_COP'
  ];
  return mafiaRoles.includes(role);
}

async function audit() {
  console.log('═══════════════════════════════════════════════');
  console.log(`🔍 تدقيق عدد المباريات — الوضع: ${FIX_MODE ? '✏️ تصحيح' : '👁️ عرض فقط'}`);
  console.log('═══════════════════════════════════════════════\n');

  // ── 1. جلب كل اللاعبين ──
  const allPlayers = await db.select({
    id: players.id,
    name: players.name,
    phone: players.phone,
    storedMatches: players.totalMatches,
    storedWins: players.totalWins,
    storedSurvived: players.totalSurvived,
  }).from(players).orderBy(players.id);

  console.log(`📋 عدد اللاعبين في قاعدة البيانات: ${allPlayers.length}\n`);

  // ── 2. معلومات عامة ──
  console.log(`ℹ️  ملاحظة: هذا السكربت يحسب كل المباريات بما فيها الاختبارية\n`);

  // ── 3. جلب كل سجلات match_players مع بيانات المباراة ──
  const allMatchPlayerRecords = await db.select({
    playerId: matchPlayers.playerId,
    matchId: matchPlayers.matchId,
    role: matchPlayers.role,
    survived: matchPlayers.survivedToEnd,
    matchWinner: matches.winner,
    matchSessionId: matches.sessionId,
  })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .where(isNotNull(matchPlayers.playerId));

  console.log(`🎮 إجمالي سجلات match_players (بـ playerId): ${allMatchPlayerRecords.length}\n`);

  // ── 4. حساب العدد الحقيقي لكل لاعب ──
  const realCounts = new Map<number, { matches: number; wins: number; survived: number }>();

  for (const record of allMatchPlayerRecords) {
    if (!record.playerId) continue;

    // استبعاد المباريات الاختبارية (اختياري — يمكن تعطيله)
    // if (testMatchIds.has(record.matchId)) continue;

    const existing = realCounts.get(record.playerId) || { matches: 0, wins: 0, survived: 0 };
    existing.matches += 1;

    const playerIsMafia = isMafiaRole(record.role);
    const won = (record.matchWinner === 'MAFIA' && playerIsMafia) || (record.matchWinner === 'CITIZEN' && !playerIsMafia);
    if (won) existing.wins += 1;
    if (record.survived) existing.survived += 1;

    realCounts.set(record.playerId, existing);
  }

  // ── 5. مقارنة وعرض النتائج ──
  let mismatchCount = 0;
  let correctCount = 0;
  let noRecordCount = 0;
  const mismatches: Array<{
    id: number; name: string; phone: string;
    stored: number; real: number; diff: number;
    storedWins: number; realWins: number;
  }> = [];

  for (const player of allPlayers) {
    const real = realCounts.get(player.id);
    const realMatches = real?.matches || 0;
    const realWins = real?.wins || 0;
    const realSurvived = real?.survived || 0;
    const storedMatches = player.storedMatches || 0;

    if (realMatches === 0 && storedMatches === 0) {
      noRecordCount++;
      continue;
    }

    if (storedMatches !== realMatches) {
      mismatchCount++;
      mismatches.push({
        id: player.id,
        name: player.name,
        phone: player.phone,
        stored: storedMatches,
        real: realMatches,
        diff: realMatches - storedMatches,
        storedWins: player.storedWins || 0,
        realWins,
      });
    } else {
      correctCount++;
    }
  }

  // ── عرض الملخص ──
  console.log('╔════════════════════════════════════════════╗');
  console.log(`║  ✅ متطابق:    ${String(correctCount).padStart(4)}  لاعب                  ║`);
  console.log(`║  ❌ مختلف:     ${String(mismatchCount).padStart(4)}  لاعب                  ║`);
  console.log(`║  ⚪ بدون سجل:  ${String(noRecordCount).padStart(4)}  لاعب                  ║`);
  console.log('╚════════════════════════════════════════════╝\n');

  if (mismatches.length === 0) {
    console.log('🎉 كل القيم متطابقة! لا حاجة لأي تصحيح.');
    await pool.end();
    process.exit(0);
  }

  // ── عرض التفاصيل ──
  console.log('╔══════╦════════════════════╦═══════════╦══════════╦══════════╦════════╗');
  console.log('║  ID  ║     الاسم          ║  مُخزّن  ║  حقيقي   ║  فرق    ║ فوز    ║');
  console.log('╠══════╬════════════════════╬═══════════╬══════════╬══════════╬════════╣');

  // ترتيب حسب أكبر فرق
  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  for (const m of mismatches) {
    const nameCol = m.name.padEnd(18).slice(0, 18);
    const diffStr = m.diff > 0 ? `+${m.diff}` : `${m.diff}`;
    const winsStr = `${m.storedWins}→${m.realWins}`;
    console.log(`║ ${String(m.id).padStart(4)} ║ ${nameCol} ║ ${String(m.stored).padStart(7)}   ║ ${String(m.real).padStart(6)}   ║ ${diffStr.padStart(6)}   ║ ${winsStr.padStart(6)} ║`);
  }
  console.log('╚══════╩════════════════════╩═══════════╩══════════╩══════════╩════════╝\n');

  // ── 6. تصحيح (إن كان --fix) ──
  if (FIX_MODE) {
    console.log('✏️ بدء التصحيح...\n');
    let fixed = 0;

    for (const m of mismatches) {
      const real = realCounts.get(m.id)!;
      await db.update(players).set({
        totalMatches: real.matches,
        totalWins: real.wins,
        totalSurvived: real.survived,
      } as any).where(eq(players.id, m.id));
      fixed++;
      console.log(`  ✅ ${m.name} (ID: ${m.id}): ${m.stored} → ${m.real} مباراة`);
    }

    console.log(`\n🎉 تم تصحيح ${fixed} لاعب بنجاح!`);
  } else {
    console.log('💡 لتصحيح القيم، شغّل الأمر مع --fix:');
    console.log('   npx tsx src/scripts/audit_match_counts.ts --fix\n');
  }

  await pool.end();
  process.exit(0);
}

audit().catch((err) => {
  console.error('❌ خطأ:', err);
  process.exit(1);
});
