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

// ── ترحيل تلقائي — إضافة أعمدة مفقودة ──────────────
async function runAutoMigrations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // التحقق من وجود عمود linked_staff_id في جدول players
    const checkCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'players' AND column_name = 'linked_staff_id'
    `);
    if (checkCol.rows.length === 0) {
      await client.query(`ALTER TABLE players ADD COLUMN linked_staff_id INTEGER`);
      console.log('🔄 Migration: Added linked_staff_id column to players table');
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
