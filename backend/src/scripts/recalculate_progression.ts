import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { matchPlayers } from '../schemas/game.schema.js';
import { players } from '../schemas/player.schema.js';
import { eq, sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5432/mafia_db',
});
const db = drizzle(pool);

async function recalculate() {
  console.log('🔄 Starting progression recalculation...');

  // 1. تصفير نقاط كل اللاعبين كبداية لضمان عدم ازدواجية النقاط
  await db.update(players).set({
    xp: 0,
    level: 1,
    rankTier: 'INFORMANT',
    rankRR: 0,
    totalDeals: 0,
    successfulDeals: 0,
  });
  console.log('✅ Reset all players progression to 0');

  // 2. سحب كل سجلات المباريات السابقة مرتبة زمنياً
  const allMatchPlayers = await db.select().from(matchPlayers).orderBy(matchPlayers.id);
  console.log(`📊 Found ${allMatchPlayers.length} match player records to process.`);

  // 3. تطبيق نقاط كل مباراة على اللاعب
  for (const record of allMatchPlayers) {
    if (!record.playerId) continue;

    // استخراج النقاط والديلات المسجلة من الجدول (والتي تم حسابها مسبقاً بنجاح في نهاية المباريات)
    const xpToAdd = record.xpEarned || 0;
    const rrToAdd = record.rrChange || 0;
    const isDealInitiated = record.dealInitiated ? 1 : 0;
    const isDealSuccessful = record.dealSuccess ? 1 : 0;

    // بما أننا نعتمد على applyXPAndLevel و applyRR الموجودة في الخدمة، سنستخدم تحديث مباشر للتبسيط هنا
    // ولكن ليكون التقدم صحيح تماماً (Levels + Tiers)، يجب جلب اللاعب وتطبيق المنطق عليه
    
    // سحب بيانات اللاعب الحالية
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
    if (currentRR < 0) currentRR = 0; // حماية ضد السالب المستمر

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

    // ترقية
    while (tierIdx < RANK_TIERS_LIST.length - 1 && currentRR >= RANK_RR_REQUIRED[RANK_TIERS_LIST[tierIdx]]) {
      currentRR -= RANK_RR_REQUIRED[RANK_TIERS_LIST[tierIdx]];
      tierIdx++;
    }

    // تنزيل (فقط إذا لم يكن في أقل رتبة)
    while (currentRR < 0 && tierIdx > 0) {
      tierIdx--;
      currentRR += RANK_RR_REQUIRED[RANK_TIERS_LIST[tierIdx]];
    }
    
    if (currentRR < 0) currentRR = 0;
    let currentTier = RANK_TIERS_LIST[tierIdx];

    // تحديث قاعدة البيانات لهذا اللاعب
    await db.update(players).set({
      xp: currentXP,
      level: currentLevel,
      rankRR: currentRR,
      rankTier: currentTier,
      totalDeals: (p.totalDeals || 0) + isDealInitiated,
      successfulDeals: (p.successfulDeals || 0) + isDealSuccessful,
    }).where(eq(players.id, record.playerId));
  }

  console.log('🎉 Recalculation complete! Players stats have been restored.');
  process.exit(0);
}

recalculate().catch(console.error);
