// ══════════════════════════════════════════════════════
// 🏆 مخطط المواسم — Season Schema (PostgreSQL + Drizzle)
// يدعم مواسم متزامنة: موسم عادي (يرتّب كل اللاعبين) + مواسم بطولات
// مرتبطة بموقع محدّد (إحصاءات مستقلة تماماً).
// ══════════════════════════════════════════════════════

import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

// ── Seasons (المواسم) ───────────────────────────────
// type: REGULAR = الموسم العادي (locationId = null) | TOURNAMENT = بطولة مرتبطة بموقع
// status: ACTIVE | ENDED
// قيد منطقي: موسم REGULAR نشط واحد فقط، وموسم TOURNAMENT نشط واحد لكل locationId.
export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  seasonNumber: integer('season_number').notNull(),
  type: varchar('type', { length: 20 }).notNull().default('REGULAR'), // REGULAR | TOURNAMENT
  locationId: integer('location_id'),     // مطلوب لـ TOURNAMENT، null لـ REGULAR
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'), // ACTIVE | ENDED
  // نسخة من إعدادات التقدّم وقت الموسم (لإعادة الحساب التاريخي بدقة)
  progressionConfigSnapshot: varchar('progression_config_snapshot', { length: 20 }),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  createdBy: integer('created_by'), // staff.id
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Player Season Stats (إحصاءات اللاعب لكل موسم) ────
// مصدر الإحصاءات المُجمّعة لكل (لاعب، موسم). للموسم العادي النشط هي نسخة من players.*،
// وللبطولات هي المصدر الوحيد (players.* لا تُلمس بمباريات البطولة).
export const playerSeasonStats = pgTable('player_season_stats', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull(),  // FK → players.id
  seasonId: integer('season_id').notNull(),  // FK → seasons.id
  xp: integer('xp').default(0),
  level: integer('level').default(1),
  rankTier: varchar('rank_tier', { length: 20 }).default('INFORMANT'),
  rankRR: integer('rank_rr').default(0),
  totalMatches: integer('total_matches').default(0),
  totalWins: integer('total_wins').default(0),
  totalSurvived: integer('total_survived').default(0),
  totalDeals: integer('total_deals').default(0),
  successfulDeals: integer('successful_deals').default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
