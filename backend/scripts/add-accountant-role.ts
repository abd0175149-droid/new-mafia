// ══════════════════════════════════════════════════════
// 🧾 سكربت إضافة دور المحاسب (accountant) للـ enum
// شغّل على السيرفر:
// docker exec -it mafia-backend npx tsx scripts/add-accountant-role.ts
// ══════════════════════════════════════════════════════

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('🧾 إضافة قيمة accountant لـ staff_role enum...');
    
    // Check if already exists
    const check = await client.query(`
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'accountant' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'staff_role')
    `);
    
    if (check.rows.length > 0) {
      console.log('✅ القيمة accountant موجودة بالفعل في الـ enum');
    } else {
      await client.query(`ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'accountant'`);
      console.log('✅ تم إضافة accountant بنجاح!');
    }
  } catch (err: any) {
    console.error('❌ خطأ:', err.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

main();
