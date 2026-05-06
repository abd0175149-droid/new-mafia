// سكربت حذف الحجوزات قبل 2026-05-05
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  // 1) عدد الحجوزات المرتبطة بأنشطة قبل التاريخ
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as total FROM bookings b
    JOIN activities a ON b.activity_id = a.id
    WHERE a.date < '2026-05-05'
  `);
  console.log('📊 عدد الحجوزات المرتبطة بأنشطة قبل 2026-05-05:', countResult.rows[0]?.total);

  // 2) حذف الحجوزات
  const deleteResult = await db.execute(sql`
    DELETE FROM bookings
    WHERE activity_id IN (
      SELECT id FROM activities WHERE date < '2026-05-05'
    )
  `);
  console.log('🗑️ تم حذف الحجوزات:', deleteResult.rowCount);

  await pool.end();
  console.log('✅ تم الانتهاء');
}

main().catch(e => { console.error('❌ خطأ:', e.message); process.exit(1); });
