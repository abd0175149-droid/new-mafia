// ══════════════════════════════════════════════════════
// 🏢 مخططات جداول الإدارة — Admin Schema (PostgreSQL + Drizzle)
// يشمل: staff, locations, activities, bookings, costs,
//        foundational_costs, notifications, user_settings, audit_log
// ══════════════════════════════════════════════════════

import {
  pgTable, pgEnum, serial, text, timestamp, integer,
  boolean, varchar, decimal, jsonb, date,
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────

export const staffRoleEnum = pgEnum('staff_role', ['admin', 'manager', 'leader', 'location_owner']);
export const activityStatusEnum = pgEnum('activity_status', ['planned', 'active', 'completed', 'cancelled']);
export const costTypeEnum = pgEnum('cost_type', ['activity', 'general']);
export const notificationTypeEnum = pgEnum('notification_type', [
  'new_booking', 'upcoming_activity', 'cost_alert',
  'financial', 'new_location', 'new_activity',
  'foundational_cost', 'game_started', 'game_ended',
]);

// ── Locations (أماكن الاستضافة) ─────────────────────

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  mapUrl: text('map_url').default(''),
  offers: jsonb('offers').default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Staff (الموظفون/الليدر) ─────────────────────────

export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  role: staffRoleEnum('role').default('manager').notNull(),
  photoUrl: text('photo_url'),
  permissions: jsonb('permissions').default(['activities', 'bookings', 'finances', 'locations']),
  lastLogin: timestamp('last_login'),
  isPartner: boolean('is_partner').default(false),
  isActive: boolean('is_active').default(true),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Activities (الأنشطة/جلسات الألعاب) ───────────────

export const activities = pgTable('activities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  date: timestamp('date').notNull(),
  description: text('description').default(''),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).default('0'),
  status: activityStatusEnum('status').default('planned').notNull(),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
  driveLink: text('drive_link').default(''),
  enabledOfferIds: jsonb('enabled_offer_ids').default([]),
  isLocked: boolean('is_locked').default(false),
  // 🔗 ربط النشاط بغرفة اللعبة (FK → sessions.id — logical, not enforced in Drizzle to avoid circular deps)
  sessionId: integer('session_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Bookings (الحجوزات) ─────────────────────────────

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }).default(''),
  count: integer('count').default(1),
  isPaid: boolean('is_paid').default(false),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).default('0'),
  receivedBy: varchar('received_by', { length: 100 }).default(''),
  isFree: boolean('is_free').default(false),
  notes: text('notes').default(''),
  offerItems: jsonb('offer_items').default([]),
  createdBy: varchar('created_by', { length: 100 }).default(''),
  // 🔗 ربط الحجز بلاعب في الغرفة (FK → session_players.id — logical)
  playerId: integer('player_id'),
  checkedIn: boolean('checked_in').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Costs (التكاليف والمصاريف) ───────────────────────

export const costs = pgTable('costs', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'set null' }),
  item: varchar('item', { length: 200 }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).default('0'),
  date: timestamp('date').notNull(),
  paidBy: varchar('paid_by', { length: 100 }).default(''),
  type: costTypeEnum('type').default('general').notNull(),
});

// ── Foundational Costs (التكاليف التأسيسية) ──────────

export const foundationalCosts = pgTable('foundational_costs', {
  id: serial('id').primaryKey(),
  item: varchar('item', { length: 200 }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).default('0'),
  paidBy: varchar('paid_by', { length: 100 }).default(''),
  source: varchar('source', { length: 100 }).default(''),
  date: timestamp('date').notNull(),
  isProcessed: boolean('is_processed').default(false),
});

// ── Notifications (الإشعارات) ────────────────────────

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => staff.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  message: text('message').default(''),
  type: notificationTypeEnum('type').notNull(),
  read: boolean('read').default(false),
  targetId: varchar('target_id', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── User Settings (إعدادات المستخدم) ─────────────────

export const userSettings = pgTable('user_settings', {
  userId: integer('user_id').primaryKey().references(() => staff.id, { onDelete: 'cascade' }),
  newBooking: boolean('new_booking').default(true),
  upcomingActivity: boolean('upcoming_activity').default(true),
  costAlert: boolean('cost_alert').default(true),
  dashboardLayout: jsonb('dashboard_layout').default(['revenue', 'costs', 'profit', 'bookings', 'upcoming']),
});

// ── Audit Log (سجل العمليات) ─────────────────────────

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  action: varchar('action', { length: 50 }),
  entity: varchar('entity', { length: 50 }),
  entityId: varchar('entity_id', { length: 50 }),
  details: jsonb('details'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
