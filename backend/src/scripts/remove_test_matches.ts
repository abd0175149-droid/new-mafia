import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { matchPlayers, matches } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { eq, like, inArray } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5432/mafia_db',
});
const db = drizzle(pool);

async function run() {
  console.log('🔄 Searching for players...');

  const playerA_phone = '07916224155'; // الحساب الاختباري
  const playerB_phone = '0775002923';  // الحساب الحقيقي الذي لم يلعب في الاختبارات

  const [playerA] = await db.select().from(players).where(like(players.phone, `%${playerA_phone}%`)).limit(1);
  const [playerB] = await db.select().from(players).where(like(players.phone, `%${playerB_phone}%`)).limit(1);

  if (!playerA) {
    console.error(`❌ Player A (${playerA_phone}) not found`);
    process.exit(1);
  }
  if (!playerB) {
    console.error(`❌ Player B (${playerB_phone}) not found`);
    process.exit(1);
  }

  console.log(`✅ Player A ID: ${playerA.id}`);
  console.log(`✅ Player B ID: ${playerB.id}`);

  // جلب كل المباريات التي لعبها A
  const aMatches = await db.select({ matchId: matchPlayers.matchId })
    .from(matchPlayers)
    .where(eq(matchPlayers.playerId, playerA.id));

  // جلب كل المباريات التي لعبها B
  const bMatches = await db.select({ matchId: matchPlayers.matchId })
    .from(matchPlayers)
    .where(eq(matchPlayers.playerId, playerB.id));

  const aMatchIds = aMatches.map(m => m.matchId);
  const bMatchIds = new Set(bMatches.map(m => m.matchId));

  // تصفية المباريات: التي لعبها A ولم يلعبها B
  const testMatchIds = aMatchIds.filter(id => id !== null && !bMatchIds.has(id)) as number[];

  if (testMatchIds.length === 0) {
    console.log('✅ No test matches found to delete.');
    process.exit(0);
  }

  console.log(`🗑️ Found ${testMatchIds.length} test matches to delete:`, testMatchIds);

  // 1. حذف سجلات اللاعبين في هذه المباريات
  await db.delete(matchPlayers).where(inArray(matchPlayers.matchId, testMatchIds));
  console.log('✅ Deleted test match players records');

  // 2. حذف المباريات نفسها
  await db.delete(matches).where(inArray(matches.id, testMatchIds));
  console.log('✅ Deleted test matches entirely');

  console.log('🎉 Done! Test matches removed. You should run recalculate_progression.ts now.');
  process.exit(0);
}

run().catch(console.error);
