// ══════════════════════════════════════════════════════
// 📐 مخطط قوالب المقاعد — Seat Templates Schema
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, text, timestamp, integer,
  boolean, varchar, jsonb,
} from 'drizzle-orm/pg-core';
import { staff } from './admin.schema.js';

// ── Seat Templates (قوالب المقاعد) ────────────────────
export const seatTemplates = pgTable('seat_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  layoutType: varchar('layout_type', { length: 20 }).default('circle').notNull(), // circle | rectangle | rows
  totalSeats: integer('total_seats').notNull(),
  reservedTailCount: integer('reserved_tail_count').default(5),     // عدد المقاعد المؤخرة
  pinnedSeats: jsonb('pinned_seats').default([]),                    // [{seatNumber, playerId?, phone?, playerName}]
  constraintsConfig: jsonb('constraints_config').default([]),        // إعدادات القيود الافتراضية
  seatPositions: jsonb('seat_positions').default(null),              // مواقع المقاعد البصرية [{id, x, y}]
  // ── إعدادات التخطيط المستطيل (ثلاثي الأبعاد) ──
  // { shape:'rectangle', sides:{top,right,bottom,left}, numbering:{startCorner,direction}, doors:[{side,offset,type}], doorSeats:number[] }
  layoutConfig: jsonb('layout_config').default(null),
  isDefault: boolean('is_default').default(false),
  createdBy: integer('created_by').references(() => staff.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});
