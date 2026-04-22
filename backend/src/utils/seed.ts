// ══════════════════════════════════════════════════════
// 🌱 بذر البيانات الأولية — Database Seeder
// ينشئ حساب admin افتراضي + إعداداته
// ══════════════════════════════════════════════════════

import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { staff, userSettings } from '../schemas/admin.schema.js';
import { hashPassword } from '../middleware/auth.js';

export async function seedDatabase(): Promise<void> {
  const db = getDB();
  if (!db) {
    console.warn('⚠️ Cannot seed — database not connected');
    return;
  }

  try {
    // ── 0. إنشاء جداول اللاعبين إذا لم تكن موجودة ──
    const { sql: rawSql } = await import('drizzle-orm');
    await db.execute(rawSql`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        gender VARCHAR(10) DEFAULT 'MALE',
        dob VARCHAR(20),
        total_matches INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_survived INTEGER DEFAULT 0,
        last_active_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(rawSql`
      CREATE TABLE IF NOT EXISTS booking_members (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        is_guest BOOLEAN DEFAULT FALSE,
        checked_in BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('✅ Player tables verified');
  } catch (err: any) {
    console.error('⚠️ Player tables migration:', err.message);
  }

  try {
    // ── 1. تحقق من وجود حساب admin ────────────────
    const existingAdmin = await db.select()
      .from(staff)
      .where(eq(staff.role, 'admin'))
      .limit(1);

    if (existingAdmin.length === 0) {
      // إنشاء حساب admin افتراضي
      const passwordHash = await hashPassword('admin123');
      const result = await db.insert(staff).values({
        username: 'admin',
        passwordHash,
        displayName: 'المدير العام',
        role: 'admin',
        permissions: ['activities', 'bookings', 'finances', 'locations', 'staff', 'games'],
      }).returning({ id: staff.id });

      const adminId = result[0]?.id;

      // إنشاء إعدادات افتراضية للأدمن
      if (adminId) {
        await db.insert(userSettings).values({
          userId: adminId,
        }).onConflictDoNothing();
      }

      console.log('✅ Default admin created (admin / admin123)');
    } else {
      // إعادة تعيين كلمة مرور الأدمن لضمان التوافق
      const passwordHash = await hashPassword('admin123');
      await db.update(staff)
        .set({ passwordHash })
        .where(eq(staff.role, 'admin'));
      console.log('ℹ️ Admin account exists — password reset to admin123');
    }
  } catch (err: any) {
    console.error('❌ Seed failed:', err.message);
  }
}
