import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { matchPlayers, matches } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { eq, sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5432/mafia_db',
});
const db = drizzle(pool);

function isMafiaRole(role: string): boolean {
  const mafiaRoles = [
    'GODFATHER', 'MAFIA', 'SILENCER', 'SNIPER', 'NIGHTMARE',
    'THIEF', 'POISONER', 'HACKER', 'SPY', 'HYPNOTIST',
    'BOMBER', 'CORRUPT_COP'
  ];
  return mafiaRoles.includes(role);
}

async function recalculate() {
  console.log('🔄 Starting progression recalculation...');

  // 1. تصفير نقاط وإحصائيات جميع اللاعبين
  await db.update(players).set({
    xp: 0,
    level: 1,
    rankTier: 'INFORMANT',
    rankRR: 0,
    totalDeals: 0,
    successfulDeals: 0,
    totalMatches: 0,
    totalWins: 0,
    totalSurvived: 0,
  });
  console.log('✅ Reset all players progression to 0');

  // 2. سحب كل سجلات المباريات مع تفاصيل المباراة (لمعرفة الفريق الفائز)
  const allMatchPlayers = await db.select({
    record: matchPlayers,
    matchWinner: matches.winner,
  })
  .from(matchPlayers)
  .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
  .orderBy(matchPlayers.id);

  console.log(`📊 Found ${allMatchPlayers.length} match player records to process.`);

  // 3. تطبيق نقاط وإحصائيات كل مباراة على اللاعب
  for (const { record, matchWinner } of allMatchPlayers) {
    if (!record.playerId) continue;

    const xpToAdd = record.xpEarned || 0;
    const rrToAdd = record.rrChange || 0;
    const isDealInitiated = record.dealInitiated ? 1 : 0;
    const isDealSuccessful = record.dealSuccess ? 1 : 0;
    const isSurvived = record.survivedToEnd ? 1 : 0;
    
    const playerIsMafia = isMafiaRole(record.role);
    const won = (matchWinner === 'MAFIA' && playerIsMafia) || (matchWinner === 'CITIZEN' && !playerIsMafia) ? 1 : 0;

    const [p] = await db.select().from(players).where(eq(players.id, record.playerId)).limit(1);
    if (!p) continue;

    // --- حساب Level و XP ---
    let currentXP = (p.xp || 0) + xpToAdd;
    let currentLevel = p.level || 1;
    let xpRequired = currentLevel * 500;

    while (currentXP >= xpRequired) {
      currentXP -= xpRequired;
      currentLevel++;
      xpRequired = currentLevel * 500;
    }

    // --- حساب RR و Tier ---
    let currentRR = (p.rankRR || 0) + rrToAdd;
    if (currentRR < 0) currentRR = 0;

    const RANK_TIERS_LIST = ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'GODFATHER'] as const;
    const RANK_RR_REQUIRED: Record<string, number> = {
      'INFORMANT': 100,
      'SOLDIER': 200,
      'CAPO': 300,
      'UNDERBOSS': 400,
      'GODFATHER': 999999,
    };

    let tierIdx = RANK_TIERS_LIST.indexOf(p.rankTier as any) || 0;
    if (tierIdx === -1) tierIdx = 0;

    while (tierIdx < RANK_TIERS_LIST.length - 1 && currentRR >= RANK_RR_REQUIRED[RANK_TIERS_LIST[tierIdx]]) {
      currentRR -= RANK_RR_REQUIRED[RANK_TIERS_LIST[tierIdx]];
      tierIdx++;
    }

    while (currentRR < 0 && tierIdx > 0) {
      tierIdx--;
      currentRR += RANK_RR_REQUIRED[RANK_TIERS_LIST[tierIdx]];
    }
    
    if (currentRR < 0) currentRR = 0;
    let currentTier = RANK_TIERS_LIST[tierIdx];

    // تحديث الإحصائيات الشاملة
    await db.update(players).set({
      xp: currentXP,
      level: currentLevel,
      rankRR: currentRR,
      rankTier: currentTier,
      totalDeals: (p.totalDeals || 0) + isDealInitiated,
      successfulDeals: (p.successfulDeals || 0) + isDealSuccessful,
      totalMatches: (p.totalMatches || 0) + 1,
      totalWins: (p.totalWins || 0) + won,
      totalSurvived: (p.totalSurvived || 0) + isSurvived,
    }).where(eq(players.id, record.playerId));
  }

  console.log('🎉 Recalculation complete! Players stats (including matches and wins) have been restored.');
  process.exit(0);
}

recalculate().catch(console.error);
