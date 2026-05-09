import { eq, like } from 'drizzle-orm';
import { getDB, connectDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import * as dotenv from 'dotenv';
import path from 'path';

// تحميل الإعدادات من .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function run() {
  console.log('🔄 Connecting to Database...');
  await connectDB();
  const db = getDB();

  if (!db) {
    console.error('❌ Failed to connect to DB');
    process.exit(1);
  }

  const targetPhone = '07916224155';
  
  console.log(`🔍 Looking for player with phone: ${targetPhone}...`);
  const foundPlayer = await db.select()
    .from(players)
    .where(like(players.phone, `%${targetPhone}%`));

  if (foundPlayer.length > 0) {
    const player = foundPlayer[0];
    console.log(`✅ Player Found: ID ${player.id}, Name: ${player.name}, Phone: ${player.phone}`);
    console.log(`📊 Current Stats -> Level: ${player.level}, XP: ${player.xp}, Rank: ${player.rankTier}, RR: ${player.rankRR}`);

    // الهدف: كابو (CAPO) ومستوى (Level) 10
    // RR for CAPO is ~300. XP for Level 10 is cumulative.
    const newStats = {
      level: 10,
      xp: 8500, // XP مناسب للمستوى 10
      rankTier: 'CAPO',
      rankRR: 315, // RR مناسب لكابو
      gamesPlayed: (player.gamesPlayed || 0) + 42,
      gamesWon: (player.gamesWon || 0) + 27,
      timesSurvived: (player.timesSurvived || 0) + 18,
    };

    console.log(`🚀 Updating player ${player.id} with new stats:`, newStats);
    
    await db.update(players)
      .set(newStats as any)
      .where(eq(players.id, player.id));
      
    console.log('🎉 Update complete! Player is now a CAPO with Level 10.');
  } else {
    console.log(`❌ Player not found with phone number ${targetPhone}.`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error executing script:', err);
  process.exit(1);
});
