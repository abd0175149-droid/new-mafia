// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء — «ختم الدون»
//
// ختم = حجزٌ من التطبيق قبل الفعاليّة بساعاتٍ كافية + مباراةٌ واحدة مكتملة.
// N أختام في الشهر = مكافأة يختارها اللاعب (زيارة / مشروب / تشبس).
//
// مبادئ (مأخوذة من دفتر التشبس):
//  • التصفير الشهريّ **اشتقاقيّ**: كلّ ختم يحمل فترته 'YYYY-MM' (بتوقيت الأردن،
//    بتاريخ الفعاليّة)، فلا حذف ولا cron — استعلام WHERE period = current.
//  • ختمٌ واحد لكلّ (لاعب، فعاليّة) بقيدٍ فريد في القاعدة — تكرار إنهاء المباراة
//    أو إعادة تشغيل الخادم لا يضاعف شيئاً.
//  • المكافأة صفٌّ بحالة: pending_choice → available → redeemed | expired | void.
// ══════════════════════════════════════════════════════

import { pgTable, serial, integer, varchar, timestamp, jsonb, text, numeric } from 'drizzle-orm/pg-core';
import { players } from './player.schema.js';

export const loyaltyConfig = pgTable('loyalty_config', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 40 }).notNull().unique(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const loyaltyStamps = pgTable('loyalty_stamps', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id, { onDelete: 'cascade' }).notNull(),
  activityId: integer('activity_id').notNull(),
  bookingId: integer('booking_id'),
  locationId: integer('location_id'),
  /** 'YYYY-MM' بتوقيت الأردن، من تاريخ الفعاليّة */
  period: varchar('period', { length: 7 }).notNull(),
  /** كم ساعة قبل الموعد حُجز (سالبٌ إن حُجز بعد البدء) */
  leadHours: numeric('lead_hours', { precision: 7, scale: 1 }),
  matchId: integer('match_id'),
  source: varchar('source', { length: 10 }).default('auto').notNull(),   // 'auto' | 'manual'
  grantedBy: integer('granted_by'),
  note: text('note'),
  voidedAt: timestamp('voided_at'),
  voidedBy: integer('voided_by'),
  voidReason: text('void_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const LOYALTY_REWARD_KINDS = ['free_visit', 'free_drink', 'chips'] as const;
export type LoyaltyRewardKind = (typeof LOYALTY_REWARD_KINDS)[number];
export const LOYALTY_REWARD_STATUSES = ['pending_choice', 'available', 'redeemed', 'expired', 'void'] as const;
export type LoyaltyRewardStatus = (typeof LOYALTY_REWARD_STATUSES)[number];

export const loyaltyRewards = pgTable('loyalty_rewards', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id, { onDelete: 'cascade' }).notNull(),
  period: varchar('period', { length: 7 }).notNull(),
  /** رقم البطاقة داخل الشهر (1..maxRewardsPerMonth) */
  seq: integer('seq').notNull(),
  kind: varchar('kind', { length: 12 }),                    // null قبل الاختيار
  status: varchar('status', { length: 16 }).default('pending_choice').notNull(),
  /** {jod?, chips?, capJod?, menuItemName?} — لقطة القيمة وقت الاختيار/الاستخدام */
  value: jsonb('value').default({}),
  earnedAt: timestamp('earned_at').defaultNow().notNull(),
  chooseBy: timestamp('choose_by'),
  expiresAt: timestamp('expires_at'),
  redeemedAt: timestamp('redeemed_at'),
  redeemedRefType: varchar('redeemed_ref_type', { length: 12 }),   // 'booking' | 'invoice' | 'ledger' | 'manual'
  redeemedRefId: integer('redeemed_ref_id'),
  redeemedBy: integer('redeemed_by'),
  celebratedAt: timestamp('celebrated_at'),
  voidReason: text('void_reason'),
  note: text('note'),
});
