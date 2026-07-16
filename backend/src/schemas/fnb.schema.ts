// ══════════════════════════════════════════════════════
// 🍽️ مخططات المنيو والطلبات والفواتير — F&B Schema
// منيو لكل مكان + طلبات اللاعبين أثناء الفعاليّات + سجلّ فواتير مُرقّم.
// قرارات مقفلة: الطلب يتطلّب حجزاً · حصّة نادي لكل صنف (قد تكون 0) ·
// لقطات اسم/سعر لكل بند · ترقيم فواتير تسلسليّ لكل مكان · عملة د.أ.
// ══════════════════════════════════════════════════════

import {
  pgTable, pgEnum, serial, text, timestamp, integer,
  boolean, varchar, decimal,
} from 'drizzle-orm/pg-core';
import { locations, activities } from './admin.schema.js';
import { players } from './player.schema.js';

export const orderStatusEnum = pgEnum('order_status', ['new', 'preparing', 'delivered', 'cancelled']);

// ── أصناف المنيو (لكل مكان) ──────────────────────────
// جدول مستقلّ عمداً — locations.offers jsonb يبقى لعروض الحجز فقط (شكله غير متّسق).
export const menuItems = pgTable('menu_items', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  category: varchar('category', { length: 50 }).default(''),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description').default(''),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  clubShare: decimal('club_share', { precision: 10, scale: 2 }).default('0'), // 💰 حصّة النادي للوحدة (0 = لا حصّة)
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// ── الطلبات ──────────────────────────────────────────
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'cascade' }).notNull(),
  locationId: integer('location_id').references(() => locations.id).notNull(), // منسوخ من الفعاليّة لعزل المكان سريعاً
  playerId: integer('player_id').references(() => players.id).notNull(),
  playerName: varchar('player_name', { length: 100 }).notNull(),  // لقطة وقت الطلب
  bookingId: integer('booking_id').notNull(),                     // 🔒 الطلب يتطلّب حجزاً (قرار مقفل)
  sessionId: integer('session_id'),
  physicalId: integer('physical_id'),                             // المقعد إن كان داخل غرفة
  status: orderStatusEnum('status').default('new').notNull(),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(), // Σ البنود لحظة الطلب (تسعير خادم)
  note: text('note').default(''),
  statusChangedBy: integer('status_changed_by'),                  // staff.id
  statusChangedAt: timestamp('status_changed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── بنود الطلب (لقطات) ───────────────────────────────
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  menuItemId: integer('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
  nameSnapshot: varchar('name_snapshot', { length: 150 }).notNull(),
  unitPriceSnapshot: decimal('unit_price_snapshot', { precision: 10, scale: 2 }).notNull(),
  clubShareSnapshot: decimal('club_share_snapshot', { precision: 10, scale: 2 }).default('0'),
  quantity: integer('quantity').default(1).notNull(),
});

// ── سجلّ الفواتير (تدقيق + ترقيم تسلسليّ لكل مكان) ────
export const orderInvoices = pgTable('order_invoices', {
  id: serial('id').primaryKey(),
  invoiceNo: integer('invoice_no').notNull(),                     // 🔢 تسلسليّ لكل مكان (MAX+1 داخل معاملة)
  locationId: integer('location_id').notNull(),
  activityId: integer('activity_id').notNull(),
  playerId: integer('player_id').notNull(),
  bookingId: integer('booking_id'),
  ordersTotal: decimal('orders_total', { precision: 10, scale: 2 }).default('0'),
  gameFeeApplied: boolean('game_fee_applied').default(false),
  gameFeeAmount: decimal('game_fee_amount', { precision: 10, scale: 2 }).default('0'),
  grandTotal: decimal('grand_total', { precision: 10, scale: 2 }).default('0'),
  printedBy: integer('printed_by'),                               // staff.id
  printedAt: timestamp('printed_at').defaultNow().notNull(),
});
