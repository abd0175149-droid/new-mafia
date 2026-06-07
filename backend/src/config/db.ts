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
    schema: { ...adminSchema, ...gameSchema, ...playerSchema, ...notificationSchema, ...gameConfigSchema },
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
