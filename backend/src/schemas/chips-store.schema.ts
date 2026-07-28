// ══════════════════════════════════════════════════════
// 🏦 خزنة الدون — كتالوج العناصر والإيجارات (المرحلة 1)
//
// ⏳ القرار الحاكم (مقفل): لا تملّك أبدياً — كل عنصر يُستأجر لمدة.
//    «الملكية» = إيجار نشط (expires_at > now) يُفحص كسولاً عند القراءة،
//    بلا أي كرون. التجديد يمدّد ولا يبدأ من الصفر.
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, text, timestamp, integer, varchar, boolean, jsonb,
} from 'drizzle-orm/pg-core';
import { players } from './player.schema.js';

// ── أنواع العناصر (الخانات القابلة للتجهيز) ──

export const CHIPS_ITEM_KINDS = [
  'frame',        // إطار البطاقة (كائن تأثيرات بنفس بنية rank_effects)
  'title',        // لقب تحت الاسم
  'name_fx',      // تأثير لون/توهج الاسم
  'entrance',     // تشريفة الدخول على شاشة العرض
  'elimination',  // أنيميشن الإقصاء
  'victory_sting',// نغمة النصر
  'xp_boost',     // ×2 خبرة (٧ أيام — الاستثناء الوحيد عن الـ٣٠)
] as const;
export type ChipsItemKind = (typeof CHIPS_ITEM_KINDS)[number];

/** الخانات التي يُجهَّز فيها عنصر واحد فقط في كل وقت */
export const EQUIP_SLOTS: ChipsItemKind[] = ['frame', 'title', 'name_fx', 'entrance', 'elimination', 'victory_sting'];

export const CHIPS_RARITIES = ['common', 'rare', 'epic', 'myth', 'achievement'] as const;
export type ChipsRarity = (typeof CHIPS_RARITIES)[number];

/** المدة القياسية للإيجار — القرار المقفل */
export const DEFAULT_RENTAL_DAYS = 30;
/** تنبيه قرب الانتهاء */
export const EXPIRY_WARN_DAYS = 3;

// ── كتالوج العناصر ────────────────────────────────────

export const chipsItems = pgTable('chips_items', {
  id: serial('id').primaryKey(),
  kind: varchar('kind', { length: 20 }).notNull(),               // ChipsItemKind
  itemKey: varchar('item_key', { length: 40 }).unique().notNull(), // 'frame_don' … ثابت لا يتغيّر
  nameAr: varchar('name_ar', { length: 80 }).notNull(),
  descriptionAr: text('description_ar').default(''),
  hookAr: text('hook_ar').default(''),                            // جملة البيع بالمتجر
  rarity: varchar('rarity', { length: 20 }).default('common').notNull(),
  priceChips: integer('price_chips').default(0).notNull(),        // سعر إيجار المدة
  durationDays: integer('duration_days').default(DEFAULT_RENTAL_DAYS).notNull(),
  emblemId: varchar('emblem_id', { length: 30 }),                 // شعار SVG (مكتبة ChipsEmblems)
  config: jsonb('config').default({}),                            // للإطارات: كائن التأثيرات كاملاً
  isActive: boolean('is_active').default(true).notNull(),         // معروض بالمتجر
  isPurchasable: boolean('is_purchasable').default(true).notNull(), // false = إنجاز فقط (إكليل البطل)
  closedAt: timestamp('closed_at'),                               // موسمي محدود أُغلق نهائياً
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── الإيجارات (الملكية المؤقّتة) ──────────────────────

export const chipsRentals = pgTable('chips_rentals', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id, { onDelete: 'cascade' }).notNull(),
  itemId: integer('item_id').references(() => chipsItems.id, { onDelete: 'cascade' }).notNull(),
  startsAt: timestamp('starts_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),                   // ⏳ لبّ النموذج
  source: varchar('source', { length: 20 }).default('rent').notNull(), // rent | renew | achievement | admin_grant
  ledgerId: integer('ledger_id'),                                 // ربط بحركة الدفتر
  warnedAt: timestamp('warned_at'),                               // أُرسل تنبيه قرب الانتهاء
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
