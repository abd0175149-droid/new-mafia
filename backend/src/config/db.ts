// ══════════════════════════════════════════════════════
// 🗄️ اتصال PostgreSQL — Database Connection
// ══════════════════════════════════════════════════════

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env.js';
import * as adminSchema from '../schemas/admin.schema.js';
import * as gameSchema from '../schemas/game.schema.js';
import * as playerSchema from '../schemas/player.schema.js';
import * as notificationSchema from '../schemas/notification.schema.js';
import * as gameConfigSchema from '../schemas/game-config.schema.js';
import * as seasonSchema from '../schemas/season.schema.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export type Database = ReturnType<typeof drizzle>;

// ── الاتصال بقاعدة البيانات ─────────────────────────
export async function connectDB(): Promise<Database> {
  if (db) return db;

  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // اختبار الاتصال
  const client = await pool.connect();
  console.log('✅ PostgreSQL connected successfully');
  client.release();

  db = drizzle(pool, {
    schema: { ...adminSchema, ...gameSchema, ...playerSchema, ...notificationSchema, ...gameConfigSchema, ...seasonSchema },
  });

  // ── Auto-migration: إضافة أعمدة جديدة تلقائياً ──
  await runAutoMigrations(pool);

  return db;
}

// ── ترحيل تلقائي — إضافة أعمدة وجداول مفقودة ──────────────
async function runAutoMigrations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // 1. التحقق من وجود عمود linked_staff_id في جدول players
    const checkCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'players' AND column_name = 'linked_staff_id'
    `);
    if (checkCol.rows.length === 0) {
      await client.query(`ALTER TABLE players ADD COLUMN linked_staff_id INTEGER`);
      console.log('🔄 Migration: Added linked_staff_id column to players table');
    }

    // التحقق من وجود عمود gender_constraint في جدول players
    const checkGenderConstraintCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'players' AND column_name = 'gender_constraint'
    `);
    if (checkGenderConstraintCol.rows.length === 0) {
      await client.query(`ALTER TABLE players ADD COLUMN gender_constraint VARCHAR(20) DEFAULT 'NONE'`);
      console.log('🔄 Migration: Added gender_constraint column to players table');
    }

    // 1.5 التحقق من وجود حقل الهاتف في جدول الموظفين
    const checkPhoneCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'staff' AND column_name = 'phone'
    `);
    if (checkPhoneCol.rows.length === 0) {
      await client.query(`ALTER TABLE staff ADD COLUMN phone VARCHAR(20) DEFAULT ''`);
      console.log('🔄 Migration: Added phone column to staff table');
    }

    // 2. إنشاء جدول تاريخ جيران اللاعبين المعاقبين
    await client.query(`
      CREATE TABLE IF NOT EXISTS penalty_neighbor_history (
        id              SERIAL PRIMARY KEY,
        player_a_id     INTEGER NOT NULL,
        player_b_id     INTEGER NOT NULL,
        session_id      INTEGER,
        match_id        INTEGER,
        seat_a          INTEGER NOT NULL,
        seat_b          INTEGER NOT NULL,
        penalty_player_id INTEGER NOT NULL,
        created_at      TIMESTAMP DEFAULT NOW()
      )
    `);

    // فهارس للبحث السريع
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_penalty_neighbor_a ON penalty_neighbor_history(player_a_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_penalty_neighbor_b ON penalty_neighbor_history(player_b_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_penalty_neighbor_session ON penalty_neighbor_history(session_id)
    `);

    // 3. التحقق من وجود عمود seat_constraints في جدول activities
    const checkSeatCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'activities' AND column_name = 'seat_constraints'
    `);
    if (checkSeatCol.rows.length === 0) {
      await client.query(`ALTER TABLE activities ADD COLUMN seat_constraints JSONB DEFAULT NULL`);
      console.log('🔄 Migration: Added seat_constraints column to activities table');
    }

    // 4. إنشاء جدول الأزواج الممنوعة العالمية (مستقل عن الأنشطة)
    await client.query(`
      CREATE TABLE IF NOT EXISTS blocked_pairs (
        id              SERIAL PRIMARY KEY,
        player1_id      INTEGER NOT NULL,
        player1_phone   VARCHAR(20) NOT NULL,
        player1_name    VARCHAR(100) NOT NULL,
        player2_id      INTEGER NOT NULL,
        player2_phone   VARCHAR(20) NOT NULL,
        player2_name    VARCHAR(100) NOT NULL,
        reason          TEXT,
        created_by      INTEGER,
        created_at      TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_pairs_unique
      ON blocked_pairs (LEAST(player1_id, player2_id), GREATEST(player1_id, player2_id))
    `);

    // ── 4.5 🪑 عمود إعدادات التخطيط المستطيل (3D) في قوالب المقاعد ──
    try {
      const tblExists = await client.query(`SELECT to_regclass('public.seat_templates') AS t`);
      if (tblExists.rows[0]?.t) {
        const checkLayoutConfigCol = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'seat_templates' AND column_name = 'layout_config'
        `);
        if (checkLayoutConfigCol.rows.length === 0) {
          await client.query(`ALTER TABLE seat_templates ADD COLUMN layout_config JSONB DEFAULT NULL`);
          console.log('🔄 Migration: Added layout_config column to seat_templates table');
        }
      }
    } catch (e: any) { console.warn('⚠️ layout_config migration skipped:', e.message); }

    // ── 5. 🏆 نظام المواسم: الجداول + الأعمدة + باك-فيل Season 1 ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(100) NOT NULL,
        season_number INTEGER NOT NULL,
        type          VARCHAR(20) NOT NULL DEFAULT 'REGULAR',
        location_id   INTEGER,
        status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        progression_config_snapshot VARCHAR(20),
        started_at    TIMESTAMP DEFAULT NOW() NOT NULL,
        ended_at      TIMESTAMP,
        created_by    INTEGER,
        created_at    TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    // موسم عادي نشط واحد فقط
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_regular_season
      ON seasons (status) WHERE status = 'ACTIVE' AND type = 'REGULAR'
    `);
    // موسم بطولة نشط واحد لكل موقع
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_tournament_per_location
      ON seasons (location_id) WHERE status = 'ACTIVE' AND type = 'TOURNAMENT'
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS player_season_stats (
        id               SERIAL PRIMARY KEY,
        player_id        INTEGER NOT NULL,
        season_id        INTEGER NOT NULL,
        xp               INTEGER DEFAULT 0,
        level            INTEGER DEFAULT 1,
        rank_tier        VARCHAR(20) DEFAULT 'INFORMANT',
        rank_rr          INTEGER DEFAULT 0,
        total_matches    INTEGER DEFAULT 0,
        total_wins       INTEGER DEFAULT 0,
        total_survived   INTEGER DEFAULT 0,
        total_deals      INTEGER DEFAULT 0,
        successful_deals INTEGER DEFAULT 0,
        updated_at       TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE (player_id, season_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pss_season ON player_season_stats(season_id)`);

    // أعمدة جديدة
    const checkSeasonIdCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'matches' AND column_name = 'season_id'
    `);
    if (checkSeasonIdCol.rows.length === 0) {
      await client.query(`ALTER TABLE matches ADD COLUMN season_id INTEGER`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id)`);
      console.log('🔄 Migration: Added season_id column to matches table');
    }
    const checkBreakdownCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'match_players' AND column_name = 'reward_breakdown'
    `);
    if (checkBreakdownCol.rows.length === 0) {
      await client.query(`ALTER TABLE match_players ADD COLUMN reward_breakdown JSONB`);
      console.log('🔄 Migration: Added reward_breakdown column to match_players');
    }

    const checkLifetimeCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'players' AND column_name = 'lifetime_matches'
    `);
    if (checkLifetimeCol.rows.length === 0) {
      await client.query(`ALTER TABLE players ADD COLUMN lifetime_matches INTEGER DEFAULT 0`);
      // باك-فيل: lifetime_matches = total_matches الحالي (موسم واحد حتى الآن)
      await client.query(`UPDATE players SET lifetime_matches = COALESCE(total_matches, 0)`);
      console.log('🔄 Migration: Added lifetime_matches column to players + backfilled');
    }

    // باك-فيل Season 1: إن لم يوجد أي موسم → كل التاريخ = الموسم العادي الأول
    const seasonCount = await client.query(`SELECT COUNT(*)::int AS c FROM seasons`);
    if (seasonCount.rows[0].c === 0) {
      await client.query(`
        INSERT INTO seasons (name, season_number, type, status, started_at)
        VALUES ('الموسم الأول', 1, 'REGULAR', 'ACTIVE',
                COALESCE((SELECT MIN(created_at) FROM matches), NOW()))
      `);
      const s1 = await client.query(`SELECT id FROM seasons WHERE season_number = 1 LIMIT 1`);
      const s1Id = s1.rows[0].id;
      await client.query(`UPDATE matches SET season_id = $1 WHERE season_id IS NULL`, [s1Id]);
      // إحصاءات الموسم 1 = القيم الحالية في players.* (كلها تخصّ الموسم 1 حتى الآن)
      await client.query(`
        INSERT INTO player_season_stats
          (player_id, season_id, xp, level, rank_tier, rank_rr, total_matches, total_wins, total_survived, total_deals, successful_deals)
        SELECT id, $1, COALESCE(xp,0), COALESCE(level,1), COALESCE(rank_tier,'INFORMANT'), COALESCE(rank_rr,0),
               COALESCE(total_matches,0), COALESCE(total_wins,0), COALESCE(total_survived,0), COALESCE(total_deals,0), COALESCE(successful_deals,0)
        FROM players
        ON CONFLICT (player_id, season_id) DO NOTHING
      `, [s1Id]);
      console.log(`🏆 Migration: Created Season 1 (id=${s1Id}), stamped all matches + seeded player_season_stats`);
    }

  } catch (err: any) {
    console.warn('⚠️ Auto-migration warning:', err.message);
  } finally {
    client.release();
  }
}

// ── جلب الاتصال الحالي ──────────────────────────────
export function getDB(): Database | null {
  return db;
}

// ── إغلاق الاتصال ──────────────────────────────────
export async function disconnectDB(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
    console.log('🔌 PostgreSQL disconnected');
  }
}
