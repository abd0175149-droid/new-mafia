// ══════════════════════════════════════════════════════
// 🏢 مخططات جداول الإدارة — Admin Schema (PostgreSQL + Drizzle)
// يشمل: staff, locations, activities, bookings, costs,
//        foundational_costs, notifications, user_settings, audit_log
// ══════════════════════════════════════════════════════

import {
  pgTable, pgEnum, serial, text, timestamp, integer,
  boolean, varchar, decimal, jsonb, date, numeric, unique,
} from 'drizzle-orm/pg-core';
import { players } from './player.schema.js';

// ── Enums ─────────────────────────────────────────────

export const staffRoleEnum = pgEnum('staff_role', ['admin', 'manager', 'leader', 'location_owner', 'accountant']);
export const activityStatusEnum = pgEnum('activity_status', ['planned', 'active', 'completed', 'cancelled']);
export const costTypeEnum = pgEnum('cost_type', ['activity', 'general']);
export const notificationTypeEnum = pgEnum('notification_type', [
  'new_booking', 'upcoming_activity', 'cost_alert',
  'financial', 'new_location', 'new_activity',
  'foundational_cost', 'game_started', 'game_ended',
  'new_order', // 🍽️ طلب منيو جديد (تُضاف على قاعدة البيانات بـ ALTER TYPE في إقلاع index.ts)
]);

// ── Locations (أماكن الاستضافة) ─────────────────────

export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  mapUrl: text('map_url').default(''),
  offers: jsonb('offers').default([]),
  isTestLocation: boolean('is_test_location').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// ── Staff (الموظفون/الليدر) ─────────────────────────

export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  phone: varchar('phone', { length: 20 }).default(''),
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
  deletedAt: timestamp('deleted_at'),
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
  maxCapacity: integer('max_capacity').default(20),
  difficulty: varchar('difficulty', { length: 20 }).default('medium'),
  // ── نظام التذاكر والمقاعد ──
  requireTicket: boolean('require_ticket').default(false),
  seatConstraints: jsonb('seat_constraints').default(null),
  seatTemplateId: integer('seat_template_id'),           // ربط بقالب مقاعد
  // ── 🍽️ نظام طلبات المنيو (لكل فعاليّة) ──
  menuOrderingEnabled: boolean('menu_ordering_enabled').default(false),  // المفتاح الرئيس: طلبات المنيو من التطبيق
  addGameFeeToBill: boolean('add_game_fee_to_bill').default(false),      // إضافة رسوم اللعبة لفاتورة اللاعب
  // ربط النشاط بغرفة اللعبة
  sessionId: integer('session_id'),
  // 👤 مُنشئ الفعالية (staff.id) — للتمييز عن بقية الأدمن لاحقاً (صلاحيات خاصة)
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
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
  ticketNumber: varchar('ticket_number', { length: 50 }),
  checkedIn: boolean('checked_in').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// ── Costs (التكاليف والمصاريف) ───────────────────────

export const costs = pgTable('costs', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'set null' }),
  item: varchar('item', { length: 200 }).notNull(),          // نوع المصروف (اسم الفئة)
  amount: decimal('amount', { precision: 10, scale: 2 }).default('0'),
  date: timestamp('date').notNull(),
  paidBy: varchar('paid_by', { length: 100 }).default(''),
  type: costTypeEnum('type').default('general').notNull(),   // توافق قديم: activity|general
  // الارتباط (5 حالات): general | activity | player | equipment | other
  scope: varchar('scope', { length: 20 }).default('general'),
  playerId: integer('player_id'),                            // عند الارتباط بلاعب
  deletedAt: timestamp('deleted_at'),
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
  deletedAt: timestamp('deleted_at'),
});

// ── Expense Categories (أنواع المصاريف — قائمة قابلة للإضافة) ──
export const expenseCategories = pgTable('expense_categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
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

// ── Staff Action Log (سجل عمليات الموظفين داخل اللعبة) ────────────────
// يوثّق كل تدخّل يدوي للّيدر داخل اللعبة (تصويت بالنيابة، عقوبة، تغيير مقعد، تعديل حدث ليلي…)
// مصنّفاً حسب النوع/المستخدم/الفعالية/الغرفة مع طابع زمني. منفصل عن audit_log (عالي التردّد).
export const staffActionLog = pgTable('staff_action_log', {
  id: serial('id').primaryKey(),
  staffId: integer('staff_id'),
  staffUsername: varchar('staff_username', { length: 50 }),
  staffRole: varchar('staff_role', { length: 20 }),
  source: varchar('source', { length: 10 }).default('socket'), // socket | rest | ui
  action: varchar('action', { length: 80 }).notNull(),          // اسم الحدث/المسار
  category: varchar('category', { length: 30 }).default('OTHER'),
  labelAr: varchar('label_ar', { length: 120 }),
  outcome: varchar('outcome', { length: 10 }), // success | blocked | null (محاولة بلا رد)
  activityId: integer('activity_id'),
  roomId: varchar('room_id', { length: 50 }),
  roomCode: varchar('room_code', { length: 20 }),
  matchId: integer('match_id'),
  targetPhysicalId: integer('target_physical_id'),
  targetName: varchar('target_name', { length: 100 }),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Sound Effects (المؤثرات الصوتية المخصصة) ────────

export const soundEffects = pgTable('sound_effects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 50 }).notNull(),
  sizeBytes: integer('size_bytes').default(0),
  eventKeys: jsonb('event_keys').default([]),           // ["night_assassination", "phase_night_start"]
  isActive: boolean('is_active').default(true),
  uploadedBy: varchar('uploaded_by', { length: 100 }).default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Tickets (نظام التذاكر المركزي — مستقل عن الأنشطة) ──

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  ticketNumber: varchar('ticket_number', { length: 50 }).notNull().unique(),
  batchName: varchar('batch_name', { length: 100 }),
  ticketType: varchar('ticket_type', { length: 30 }).default('regular'),  // regular | vip | free
  price: numeric('price', { precision: 10, scale: 2 }),
  details: text('details'),                                                // تفاصيل إضافية حرة
  sellerName: varchar('seller_name', { length: 100 }),
  sellerPhone: varchar('seller_phone', { length: 20 }),
  notes: text('notes'),
  // ── حالة الاستخدام ──
  isUsed: boolean('is_used').default(false),
  usedAt: timestamp('used_at'),
  usedByPlayerId: integer('used_by_player_id'),
  usedByName: varchar('used_by_name', { length: 100 }),
  usedByPhone: varchar('used_by_phone', { length: 20 }),
  usedInActivityId: integer('used_in_activity_id'),
  // ── ربط مسبق بنشاط ──
  assignedActivityId: integer('assigned_activity_id'),
  // ── metadata ──
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by', { length: 100 }),
  deletedAt: timestamp('deleted_at'),
});

// ── Activity Tickets (قديم — للتوافق فقط) ──

export const activityTickets = pgTable('activity_tickets', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'cascade' }).notNull(),
  ticketNumber: varchar('ticket_number', { length: 50 }).notNull(),
  isUsed: boolean('is_used').default(false),
  usedByPhone: varchar('used_by_phone', { length: 20 }),
  usedByName: varchar('used_by_name', { length: 100 }),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// ── Progression Config (إعدادات نظام التقدم) ────────

export const progressionConfig = pgTable('progression_config', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 50 }).unique().notNull(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── 📊 تحليلات اللاعبين: كاش المقاييس + إعدادات قواعد الشرائح ──
export const analyticsCache = pgTable('analytics_cache', {
  key: varchar('key', { length: 40 }).primaryKey(),   // 'players'
  payload: jsonb('payload').notNull(),                 // المقاييس المحسوبة لكل اللاعبين
  refreshedAt: timestamp('refreshed_at').defaultNow().notNull(),
});
export const analyticsConfig = pgTable('analytics_config', {
  key: varchar('key', { length: 40 }).primaryKey(),   // 'segments'
  value: jsonb('value').notNull(),                     // قواعد الشرائح القابلة للتخصيص
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ══════════════════════════════════════════════════════
// 📲 WhatsApp — سجلات الإرسال وقوالب الرسائل
// ══════════════════════════════════════════════════════

// ── سجلات الإرسال ────────────────────────────────────
export const whatsappSendLogs = pgTable('whatsapp_send_logs', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'set null' }),
  messageTemplate: text('message_template').notNull(),
  totalSent: integer('total_sent').default(0),
  totalFailed: integer('total_failed').default(0),
  recipients: jsonb('recipients').notNull(),
  sentBy: varchar('sent_by', { length: 100 }).default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── قوالب الرسائل ────────────────────────────────────
export const whatsappTemplates = pgTable('whatsapp_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).default('general'),
  template: text('template').notNull(),
  variables: jsonb('variables').default([]),
  createdBy: varchar('created_by', { length: 100 }).default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── سجل رسائل تغيير الرتبة ────────────────────────
export const whatsappRankNotifications = pgTable('whatsapp_rank_notifications', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id, { onDelete: 'cascade' }).notNull(),
  rankTier: varchar('rank_tier', { length: 20 }).notNull(),
  notificationType: varchar('notification_type', { length: 20 }).default('promotion'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
}, (table) => ({
  uniquePlayerRank: unique().on(table.playerId, table.rankTier),
}));

// ══════════════════════════════════════════════════════
// 📋 Reservations — متابعة الحجوزات (مستقل عن نظام الحجوزات المالي)
// ══════════════════════════════════════════════════════

export const reservations = pgTable('reservations', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'set null' }),
  contactName: varchar('contact_name', { length: 150 }).notNull(),
  contactMethod: varchar('contact_method', { length: 200 }).default(''),
  phone: varchar('phone', { length: 30 }).default(''),
  peopleCount: integer('people_count').default(1),
  playerId: integer('player_id'),  // 🔗 ربط بحساب لاعب مسجّل (اختياريّ) — يُملأ عند اختيار لاعب أو مطابقة الهاتف
  status: varchar('status', { length: 20 }).default('pending').notNull(), // pending (غير مثبّت) | confirmed (مثبّت). paid_all قديم يُعامَل كمثبّت
  // 📱 اللاعب حجز فعليّاً من التطبيق (وسمٌ دائم — أقوى من تثبيت الواتساب): يُرفع عند حجز التطبيق
  appConfirmed: boolean('app_confirmed').default(false),
  appConfirmedAt: timestamp('app_confirmed_at'),
  attended: boolean('attended'),  // null = لم يُحدد بعد | true = حضر | false = لم يحضر
  notes: text('notes').default(''),
  createdBy: varchar('created_by', { length: 100 }).default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});
