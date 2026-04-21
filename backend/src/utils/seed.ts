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
