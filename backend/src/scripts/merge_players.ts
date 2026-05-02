import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { eq, or, and } from 'drizzle-orm';
import { players, playerFollows } from '../schemas/player.schema.js';
import { matchPlayers } from '../schemas/game.schema.js';
import { bookings } from '../schemas/admin.schema.js';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5432/mafia_db',
});
const db = drizzle(pool);

async function mergePlayers() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('❌ Usage: npx tsx src/scripts/merge_players.ts <OLD_PLAYER_ID> <NEW_PLAYER_ID>');
    process.exit(1);
  }

  const oldId = parseInt(args[0]);
  const newId = parseInt(args[1]);

  if (isNaN(oldId) || isNaN(newId)) {
    console.error('❌ Error: Both IDs must be numbers.');
    process.exit(1);
  }

  if (oldId === newId) {
    console.error('❌ Error: Old ID and New ID cannot be the same.');
    process.exit(1);
  }

  console.log(`🔄 Starting merge: Moving data from Player #${oldId} to Player #${newId}...`);

  try {
    // 1. Check if both players exist
    const [oldPlayer] = await db.select().from(players).where(eq(players.id, oldId));
    const [newPlayer] = await db.select().from(players).where(eq(players.id, newId));

    if (!oldPlayer) throw new Error(`Old Player #${oldId} not found!`);
    if (!newPlayer) throw new Error(`New Player #${newId} not found!`);

    console.log(`👤 Old Player: ${oldPlayer.name} (${oldPlayer.phone})`);
    console.log(`👤 New Player: ${newPlayer.name} (${newPlayer.phone})`);

    // 2. Transfer Match Players
    const matchUpdate = await db.update(matchPlayers)
      .set({ playerId: newId } as any)
      .where(eq(matchPlayers.playerId, oldId))
      .returning({ id: matchPlayers.id });
    console.log(`✅ Transferred ${matchUpdate.length} match records.`);

    // 3. Transfer Bookings
    const bookingUpdate = await db.update(bookings)
      .set({ playerId: newId, phone: newPlayer.phone, name: newPlayer.name } as any)
      .where(eq(bookings.playerId, oldId))
      .returning({ id: bookings.id });
    console.log(`✅ Transferred ${bookingUpdate.length} bookings.`);

    // 4. Transfer Follows (where old player is the follower)
    const followingUpdate = await db.update(playerFollows)
      .set({ followerId: newId } as any)
      .where(eq(playerFollows.followerId, oldId))
      .returning({ id: playerFollows.id });
    console.log(`✅ Transferred ${followingUpdate.length} following records.`);

    // 5. Transfer Follows (where old player is the followed)
    const followersUpdate = await db.update(playerFollows)
      .set({ followingId: newId } as any)
      .where(eq(playerFollows.followingId, oldId))
      .returning({ id: playerFollows.id });
    console.log(`✅ Transferred ${followersUpdate.length} follower records.`);

    // 6. Delete Old Player
    await db.delete(players).where(eq(players.id, oldId));
    console.log(`🗑️ Deleted old player account #${oldId}.`);

    console.log('🎉 Merge completed successfully!');
    console.log('⚠️  IMPORTANT: Please run the recalculate_progression.ts script now to aggregate the points and matches for the new account.');
    process.exit(0);
  } catch (err: any) {
    // Handling Unique Constraint Violations (e.g. following the same person from both accounts)
    if (err.code === '23505') {
      console.error('❌ Conflict in relationships (e.g., both accounts follow the same person).');
      console.error('To fix this cleanly, delete duplicate follows manually or ignore them.');
    } else {
      console.error('❌ Merge failed:', err.message);
    }
    process.exit(1);
  }
}

mergePlayers();
