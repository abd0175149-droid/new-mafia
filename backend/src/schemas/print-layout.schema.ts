// ══════════════════════════════════════════════════════
// 🖨️ مخطط تخطيط الطباعة — Print Layout Schema
// letterheads (الأوراق الرسمية) + print_layouts (تخطيط لكل نوع تقرير)
// ══════════════════════════════════════════════════════

import { pgTable, serial, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

// ── Letterheads (الأوراق الرسمية المرفوعة) ───────────
// يُرفع PDF من الواجهة، يُحوَّل إلى PNG عالي الدقة، ويُخزَّن الاسمان.
export const letterheads = pgTable('letterheads', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  imageFilename: varchar('image_filename', { length: 255 }).notNull(), // PNG تحت uploads/letterheads
  pdfFilename: varchar('pdf_filename', { length: 255 }),               // الأصل (اختياري)
  widthPx: integer('width_px').default(0),
  heightPx: integer('height_px').default(0),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// ── Print Layouts (تخطيط الطباعة لكل نوع تقرير) ──────
// reportKey = مفتاح التقرير (accounting-balance, activity-summary, ...) أو 'default'
export const printLayouts = pgTable('print_layouts', {
  id: serial('id').primaryKey(),
  reportKey: varchar('report_key', { length: 60 }).unique().notNull(),
  letterheadId: integer('letterhead_id'),   // FK → letterheads.id (منطقي)
  layout: jsonb('layout').notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
