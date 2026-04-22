// ══════════════════════════════════════════════════════
// 🗄️ اتصال PostgreSQL — Database Connection
// ══════════════════════════════════════════════════════

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env.js';
import * as adminSchema from '../schemas/admin.schema.js';
import * as gameSchema from '../schemas/game.schema.js';
import * as playerSchema from '../schemas/player.schema.js';

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
    schema: { ...adminSchema, ...gameSchema, ...playerSchema },
  });

  return db;
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
