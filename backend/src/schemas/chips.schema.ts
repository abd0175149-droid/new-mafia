// ══════════════════════════════════════════════════════
// 🪙 اقتصاد التشبس Chips — المخطط
// المرحلة 0: الدفتر (append-only) + كاش الرصيد على players
//
// ⚠️ قواعد غير قابلة للتفاوض (أرتفاكت 8ccc392d):
//  1. الدفتر مصدر الحقيقة الوحيد — players.chips_balance كاش مشتق.
//  2. لا حركة تشبس خارج applyChipsTx() في chips.service.ts.
//  3. كل حركة لها idempotency_key فريد — التكرار يفشل على القيد لا على المنطق.
//  4. الرصيد لا يُبث أبداً بحالة الغرفة ولا بالبروفايل العام.
//  5. أرصدة التشبس تُستثنى من تصفير الموسم (season.service.ts:253-256 قائمة بيضاء — آمنة).
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, text, timestamp, integer, varchar, jsonb,
} from 'drizzle-orm/pg-core';
import { players } from './player.schema.js';

// ── إعدادات الاقتصاد القابلة للتعديل من لوحة الإدارة ──
// (منفصلة عن progression_config كي لا تختلط إعدادات المال بإعدادات اللعب)

export const chipsConfig = pgTable('chips_config', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 40 }).unique().notNull(),   // 'rewards'
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── دفتر الحركات (append-only — لا UPDATE ولا DELETE إطلاقاً) ──

export const chipsLedger = pgTable('chips_ledger', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').references(() => players.id, { onDelete: 'cascade' }).notNull(),
  amount: integer('amount').notNull(),                              // موجب = إيداع · سالب = صرف · لا صفر
  balanceAfter: integer('balance_after').notNull(),                 // لقطة تدقيق بعد الحركة
  reason: varchar('reason', { length: 40 }).notNull(),              // ChipsReason
  refType: varchar('ref_type', { length: 20 }),                     // 'topup_pack' | 'item' | 'match' | 'manual'
  refId: varchar('ref_id', { length: 60 }),
  idempotencyKey: varchar('idempotency_key', { length: 120 }).unique().notNull(),
  staffId: integer('staff_id'),                                     // FK → users.id (للحركات الإدارية)
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── أسباب الحركة (مغلقة — أي سبب جديد يُضاف هنا أولاً) ──

export const CHIPS_REASONS = [
  'admin_topup',        // شحن إداري بباقة معتمدة
  'admin_adjust',       // تصحيح يدوي (note إلزامي)
  'drop_win',           // قطرة فوز (+2) — المرحلة 2
  'drop_top3',          // قطرة توب-3 على صافي الرانك (+3) — المرحلة 2
  'drop_first_match',   // قطرة أول مباراة (+10) — المرحلة 2
  'rent_item',          // استئجار عنصر 30 يوماً — المرحلة 1
  'renew_item',         // تجديد/تمديد إيجار — المرحلة 1
  'refund',             // استرجاع تشبس (لا استرداد نقدي أبداً)
  'gift_in',            // إهداء وارد — المرحلة 4
  'gift_out',           // إهداء صادر — المرحلة 4
] as const;

export type ChipsReason = (typeof CHIPS_REASONS)[number];

// ── باقات الشحن المعتمدة (مقفلة بقرار المالك 2026-07-28) ──
// الشحن بالباقات حصراً — لا مبالغ حرة (يضبط المحاسبة).

export interface ChipsPack {
  id: string;
  jod: number;
  chips: number;
  labelAr: string;
}

export const CHIPS_PACKS: ChipsPack[] = [
  { id: 'p5',  jod: 5,  chips: 55,  labelAr: '5 د.أ — 55 🪙' },
  { id: 'p10', jod: 10, chips: 120, labelAr: '10 د.أ — 120 🪙' },
  { id: 'p20', jod: 20, chips: 260, labelAr: '20 د.أ — 260 🪙' },
];

export function getChipsPack(id: string): ChipsPack | undefined {
  return CHIPS_PACKS.find(p => p.id === id);
}
