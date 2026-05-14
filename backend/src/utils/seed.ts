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
      } as any).returning({ id: staff.id });

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

  // ── 2. إنشاء جدول rank_effects + بذر افتراضي ──
  try {
    const { sql: rawSql } = await import('drizzle-orm');
    await db.execute(rawSql`
      CREATE TABLE IF NOT EXISTS rank_effects (
        id VARCHAR(50) PRIMARY KEY,
        name_ar VARCHAR(100) NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        effects JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // بذر البيانات الافتراضية إذا كان الجدول فارغ
    const { rankEffects } = await import('../schemas/game-config.schema.js');
    const existing = await db.select().from(rankEffects);
    if (existing.length === 0) {
      const noFx = {
        border: { enabled: false, color: '#6b7280', width: 1, inset: -1, style: 'solid', gradientColors: [], travelSpeed: 3 },
        glow: { enabled: false, color: '#6b7280', size: 0, opacity: 0, pulseEnabled: false, pulseDuration: 3 },
        shimmer: { enabled: false, color: '#ffffff', opacity: 0.06, duration: 5 },
        particles: { enabled: false, count: 0, color: '#ffffff', size: 3, orbitRadius: '52%', baseDuration: 3 },
        corners: { enabled: false, color: '#6b7280', size: 12, width: 2, pulseEnabled: false },
        gradientOverlay: { enabled: false, color: '#6b7280', opacity: 0.06, direction: 'to top' },
        floating: { enabled: false, content: '👑', position: 'top', size: 18, animation: 'float', glowColor: '#f59e0b' },
        badge: { enabled: false, emoji: '', label: '', bgColor: 'rgba(107,114,128,0.15)', textColor: '#9ca3af', borderColor: 'rgba(107,114,128,0.3)', position: 'top-left' },
        nameEffect: { enabled: false, color: '#ffffff', glowColor: '#ffffff', glowSize: 0 },
      };
      await db.insert(rankEffects).values([
        { id: 'INFORMANT', nameAr: 'مُخبر', sortOrder: 0, effects: { ...noFx } },
        { id: 'SOLDIER', nameAr: 'جندي', sortOrder: 1, effects: { ...noFx, border: { ...noFx.border, enabled: true, color: '#10b981' }, glow: { ...noFx.glow, enabled: true, color: '#10b981', size: 8, opacity: 0.3 }, badge: { ...noFx.badge, enabled: true, emoji: '⚔️', label: 'جندي', bgColor: 'rgba(16,185,129,0.15)', textColor: '#6ee7b7', borderColor: 'rgba(16,185,129,0.3)' } } },
        { id: 'CAPO', nameAr: 'كابو', sortOrder: 2, effects: { ...noFx, border: { ...noFx.border, enabled: true, color: '#3b82f6', width: 1.5, inset: -2 }, glow: { ...noFx.glow, enabled: true, color: '#3b82f6', size: 12, opacity: 0.4, pulseEnabled: true }, corners: { ...noFx.corners, enabled: true, color: '#3b82f6' }, gradientOverlay: { ...noFx.gradientOverlay, enabled: true, color: '#3b82f6' }, badge: { ...noFx.badge, enabled: true, emoji: '🎖️', label: 'كابو', bgColor: 'rgba(59,130,246,0.15)', textColor: '#93c5fd', borderColor: 'rgba(59,130,246,0.3)' } } },
        { id: 'UNDERBOSS', nameAr: 'نائب العراب', sortOrder: 3, effects: { ...noFx, border: { ...noFx.border, enabled: true, color: '#8b5cf6', width: 2, inset: -2, style: 'gradient', gradientColors: ['#8b5cf6','#f59e0b','#8b5cf6'] }, glow: { ...noFx.glow, enabled: true, color: '#8b5cf6', size: 18, opacity: 0.45, pulseEnabled: true, pulseDuration: 2.5 }, shimmer: { ...noFx.shimmer, enabled: true, color: '#8b5cf6', opacity: 0.08 }, particles: { ...noFx.particles, enabled: true, count: 4, color: '#8b5cf6' }, gradientOverlay: { ...noFx.gradientOverlay, enabled: true, color: '#8b5cf6', opacity: 0.08 }, badge: { ...noFx.badge, enabled: true, emoji: '👑', label: 'نائب', bgColor: 'rgba(139,92,246,0.2)', textColor: '#c4b5fd', borderColor: 'rgba(139,92,246,0.35)' } } },
        { id: 'GODFATHER', nameAr: 'العراب', sortOrder: 4, effects: { ...noFx, border: { ...noFx.border, enabled: true, color: '#f59e0b', width: 2, inset: -3, style: 'traveling', gradientColors: ['#f59e0b','#eab308','#f59e0b','#fcd34d'] }, glow: { ...noFx.glow, enabled: true, color: '#f59e0b', size: 25, opacity: 0.5, pulseEnabled: true, pulseDuration: 2 }, shimmer: { ...noFx.shimmer, enabled: true, color: '#f59e0b', opacity: 0.1, duration: 4 }, particles: { ...noFx.particles, enabled: true, count: 4, color: '#f59e0b', orbitRadius: '54%' }, gradientOverlay: { ...noFx.gradientOverlay, enabled: true, color: '#f59e0b', opacity: 0.1 }, floating: { ...noFx.floating, enabled: true }, badge: { ...noFx.badge, enabled: true, emoji: '👑', label: 'العراب', bgColor: 'rgba(245,158,11,0.2)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.4)' }, nameEffect: { ...noFx.nameEffect, enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 8 } } },
      ]);
      console.log('🎖️ Default rank effects seeded (5 tiers)');
    } else {
      console.log(`ℹ️ Rank effects already exist (${existing.length} ranks)`);
    }
  } catch (err: any) {
    console.error('⚠️ Rank effects seed:', err.message);
  }
}
