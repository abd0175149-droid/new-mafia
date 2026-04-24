// ══════════════════════════════════════════════════════
// 👤 مخطط جدول اللاعبين — Player Schema (PostgreSQL + Drizzle)
// يشمل: players, booking_members
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, text, timestamp, integer,
  varchar, boolean,
} from 'drizzle-orm/pg-core';

// ── إعدادات المصادقة ──────────────────────────────
export const PLAYER_DEFAULT_PASSWORD = '1234'; // كلمة السر الافتراضية للاعبين المهاجرين
export const PLAYER_TOKEN_EXPIRY = '30d';       // مدة صلاحية JWT للاعب

// ── Players (اللاعبون المسجلون) ──────────────────────

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 20 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  mustChangePassword: boolean('must_change_password').default(false),
  name: varchar('name', { length: 100 }).notNull(),
  gender: varchar('gender', { length: 10 }).default('MALE'),
  dob: varchar('dob', { length: 20 }),
  email: varchar('email', { length: 200 }),
  avatarUrl: text('avatar_url'),
  totalMatches: integer('total_matches').default(0),
  totalWins: integer('total_wins').default(0),
  totalSurvived: integer('total_survived').default(0),
  lastActiveAt: timestamp('last_active_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Booking Members (أعضاء الحجز) ────────────────────
// يربط اللاعب بحجز محدد → لحساب الإيرادات ومعرفة الضيوف

export const bookingMembers = pgTable('booking_members', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').notNull(),   // FK → bookings.id
  playerId: integer('player_id').notNull(),      // FK → players.id
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  isGuest: boolean('is_guest').default(false),   // ضيف = ليس الحاجز الأصلي
  checkedIn: boolean('checked_in').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
