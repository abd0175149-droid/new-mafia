// ══════════════════════════════════════════════════════
// 🔔 مخطط جداول الإشعارات — Notification Schema
// يشمل: player_fcm_tokens, staff_fcm_tokens, player_notifications
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, text, timestamp, integer,
  varchar, boolean, jsonb,
} from 'drizzle-orm/pg-core';
import { players } from './player.schema.js';
import { staff } from './admin.schema.js';

// ── FCM Tokens (اللاعبون) ──────────────────────────
export const playerFcmTokens = pgTable('player_fcm_tokens', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  fcmToken: text('fcm_token').notNull(),
  deviceInfo: varchar('device_info', { length: 200 }).default(''),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── FCM Tokens (الموظفون) ──────────────────────────
export const staffFcmTokens = pgTable('staff_fcm_tokens', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  fcmToken: text('fcm_token').notNull(),
  deviceInfo: varchar('device_info', { length: 200 }).default(''),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── إشعارات اللاعبين ────────────────────────────────
export const playerNotifications = pgTable('player_notifications', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').default(''),
  type: varchar('type', { length: 30 }).notNull(),
  // 'new_activity' | 'game_ended' | 'custom' | 'reminder' | 'friend_booked' | 'level_up' | 'booking_confirmed' | 'comeback'
  data: jsonb('data').default({}),
  isRead: boolean('is_read').default(false),
  isPushSent: boolean('is_push_sent').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
