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

    // الهدف المطلوب: رتبة جندي (SOLDIER) و 50 نقطة RR
    // رتبة Soldier تقع بين 100-200 RR إجمالاً أو يتم ضبطها كـ Rank مستقل مع 50 نقطة RR
    const newStats = {
      level: 3, // مستوى مناسب لرتبة جندي
      xp: 1250, // XP منطقي لمستوى 3
      rankTier: 'SOLDIER', // جندي
      rankRR: 50, // 50 نقطة RR
      gamesPlayed: Math.max(12, ((player as any).gamesPlayed || 0) - 25), // تخفيض الألعاب الملعوبة لتبدو منطقية
      gamesWon: Math.max(4, ((player as any).gamesWon || 0) - 18),
      timesSurvived: Math.max(2, ((player as any).timesSurvived || 0) - 10),
    };

    console.log(`🚀 Updating player ${player.id} with new stats:`, newStats);
    
    await db.update(players)
      .set(newStats as any)
      .where(eq(players.id, player.id));
      
    console.log('🎉 Update complete! Player is now a SOLDIER with 50 RR and Level 3.');
  } else {
    console.log(`❌ Player not found with phone number ${targetPhone}.`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error executing script:', err);
  process.exit(1);
});
