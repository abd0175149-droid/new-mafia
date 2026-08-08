// ══════════════════════════════════════════════════════
// 🍽️ مخططات المنيو والطلبات والفواتير — F&B Schema
// منيو لكل مكان + طلبات اللاعبين أثناء الفعاليّات + سجلّ فواتير مُرقّم.
// قرارات مقفلة: الطلب يتطلّب حجزاً · حصّة نادي لكل صنف (قد تكون 0) ·
// لقطات اسم/سعر لكل بند · ترقيم فواتير تسلسليّ لكل مكان · عملة د.أ.
// ══════════════════════════════════════════════════════

import {
  pgTable, pgEnum, serial, text, timestamp, integer,
  boolean, varchar, decimal, jsonb,
} from 'drizzle-orm/pg-core';
import { locations, activities } from './admin.schema.js';
import { players } from './player.schema.js';

export const orderStatusEnum = pgEnum('order_status', ['new', 'preparing', 'delivered', 'cancelled']);

// ── أقسام المنيو (مستويان: قسم ← قسم فرعيّ) ──────────
// 🎯 قرار المالك 2026-08-06: جدولٌ حقيقيّ بدل نصٍّ حرّ — إعادة التسمية والترتيب
// تتمّ مرّةً واحدة لا على كلّ صنف. المستوى الثاني اختياريّ:
// «أراجيل» بلا فرعيّ · «مشروبات» ← «باردة» و«ساخنة».
export const menuCategories = pgTable('menu_categories', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  parentId: integer('parent_id'),               // null = قسم رئيس (عمقٌ مستويان فقط — يُفرض في الراوت)
  name: varchar('name', { length: 60 }).notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// ── مجموعات الخيارات المشتركة (نكهات · أحجام · إضافات) ──
// تُعرَّف مرّةً لكلّ مكان وتُربط بعدّة أصناف. «نكهات المعسل» بعشرين نكهة
// تُدخَل مرّةً وتخدم كلّ الأراجيل — وإضافة نكهة تعديلٌ في مكانٍ واحد.
export const menuOptionGroups = pgTable('menu_option_groups', {
  id: serial('id').primaryKey(),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  selectionType: varchar('selection_type', { length: 10 }).default('single').notNull(), // single | multi
  isRequired: boolean('is_required').default(false).notNull(),
  maxSelect: integer('max_select').default(1),   // للمتعدّد فقط — سقف الاختيارات
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// ── قيم الخيارات ─────────────────────────────────────
// 💰 priceDelta يعود **للمكان كاملاً** (قرار مقفل): حصّة النادي تبقى مبلغاً
// ثابتاً على الصنف مهما اختار اللاعب — فلا تُحتسب حصّةٌ على فروق الأسعار.
export const menuOptionValues = pgTable('menu_option_values', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => menuOptionGroups.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  priceDelta: decimal('price_delta', { precision: 10, scale: 2 }).default('0').notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  sortOrder: integer('sort_order').default(0),
  deletedAt: timestamp('deleted_at'),
});

// ── أصناف المنيو (لكل مكان) ──────────────────────────
// 🎯 توحيد 2026-08-06: هذا الجدول هو الكتالوج الوحيد — الباقات (العروض سابقاً) صارت
// أصنافاً بـ isBundle=true وتركيبة bundleItems. locations.offers مجمَّد للتاريخ فقط.
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
  // 🎁 باقة مركَّبة: سعرها وحصّتها رقمٌ واحد يُدخَل يدويّاً، ومكوّناتها تُطبع في الفاتورة
  isBundle: boolean('is_bundle').default(false).notNull(),
  bundleItems: jsonb('bundle_items').default([]),  // [{ menuItemId, qty }] — أصناف فعليّة من نفس المكان
  // 🗂️ القسم الجديد (جدول menu_categories). عمود category النصّيّ يبقى محفوظاً
  // كلقطة اسمٍ للقراءة القديمة، والمصدر الحقيقيّ هو categoryId.
  categoryId: integer('category_id'),
  // ⚙️ الخيارات: مجموعاتٌ مشتركة مربوطة + مجموعاتٌ خاصّة بهذا الصنف (القرار: الاثنان معاً)
  optionGroupIds: jsonb('option_group_ids').default([]),   // [groupId]
  customOptions: jsonb('custom_options').default([]),      // [{ name, selectionType, isRequired, maxSelect, values:[{name, priceDelta}] }]
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
  // ⏰ تذكير الطلب المتأخّر: يُقاس عمر **المرحلة الحاليّة** لا عمر الطلب.
  // العمودان يمنعان التكرار عبر إعادة تشغيل الخادم، ويُصفَّران عند كلّ انتقال حالة.
  reminderSentAt: timestamp('reminder_sent_at'),
  reminderCount: integer('reminder_count').default(0).notNull(),
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
  // 🎁 لقطة مكوّنات الباقة لحظة الطلب — تُطبع مُسنَّنة تحت سطر الباقة في فاتورة A6
  // [{ name, qty, options?: [{ group, value }] }] — الخيارات تظهر حين يختارها اللاعب لمكوّن الباقة
  componentsSnapshot: jsonb('components_snapshot').default([]),
  // ⚙️ لقطة خيارات الصنف نفسه — [{ group, value, priceDelta }]. يراها موظّف التحضير
  // وتُطبع في الفاتورة: بلا هذا يُحضَّر الطلب خطأً (نكهة/حجم مجهولان).
  optionsSnapshot: jsonb('options_snapshot').default([]),
});

// ── 💨 طلبات خدمة الأرجيلة ──────────────────────────
// فحمٌ أو تزبيط: **ليست طلباً** ولا تدخل الفاتورة ولا تُحتسب في الدخل — إشارةٌ
// تصل مسؤول الأراجيل وتُغلَق حين يستجيب. لذلك جدولٌ مستقلّ لا صنفٌ بسعر صفر:
// صنفٌ بصفر كان سيظهر في المنيو وفي الفاتورة وفي تقارير المبيعات بلا معنى.
// 🔒 طلبٌ معلَّقٌ واحدٌ لكلّ لاعب لكلّ فعاليّة — يُفرض في المسار: خمس ضغطاتٍ
//    متلاحقة كانت خمسة إشعاراتٍ لموظّفٍ واحد.
export const serviceRequests = pgTable('service_requests', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').references(() => activities.id, { onDelete: 'cascade' }).notNull(),
  locationId: integer('location_id').references(() => locations.id).notNull(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  playerName: varchar('player_name', { length: 100 }).notNull(),  // لقطة وقت الطلب
  kind: varchar('kind', { length: 20 }).notNull(),                // coal | fix
  note: text('note').default(''),
  physicalId: integer('physical_id'),                             // المقعد إن كان داخل غرفة
  status: varchar('status', { length: 12 }).default('open').notNull(), // open | done | cancelled
  resolvedBy: integer('resolved_by'),                             // staff.id
  resolvedAt: timestamp('resolved_at'),
  // ⏰ تذكيرٌ إن لم يُستجَب — نفس آليّة الطلبات المتأخّرة
  reminderSentAt: timestamp('reminder_sent_at'),
  reminderCount: integer('reminder_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
  // 💵 تحصيل الفاتورة داخل النظام (توحيد 2026-08-06): دفعٌ كاملٌ فقط.
  // إن حملت سطر رسوم اللعبة يُقلَب حجز اللاعب إلى مدفوع في المعاملة نفسها.
  isPaid: boolean('is_paid').default(false).notNull(),
  paidAt: timestamp('paid_at'),
  paidBy: integer('paid_by'),                                     // staff.id — من حصّل
});
