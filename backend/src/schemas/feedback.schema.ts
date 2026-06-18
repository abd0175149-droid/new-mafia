// ══════════════════════════════════════════════════════
// 📋 مخطّط فيد باك الغرفة — Room (Session) Feedback Schema
// استبيان رضى إلزامي لكل (لاعب × غرفة/جلسة) على مقياس ليكرت 1..5.
// يُنشأ صفّ معلّق عند إغلاق الليدر للغرفة، ويُحدَّث عند تعبئة اللاعب.
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, integer, smallint, text, timestamp, unique,
} from 'drizzle-orm/pg-core';

export const roomFeedback = pgTable('room_feedback', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull(),   // 🔗 sessions.id (الغرفة)
  playerId: integer('player_id').notNull(),      // 🔗 players.id (المُجيب)
  // ── حقول مُشتقّة (مُجمّدة لحظة الإنشاء عند الإغلاق) ──
  activityId: integer('activity_id'),            // sessions.activityId
  locationId: integer('location_id'),            // activity.locationId (أين)
  leaderStaffId: integer('leader_staff_id'),     // sessions.createdBy (أي ليدر)
  playedAt: timestamp('played_at'),              // لحظة إغلاق الغرفة (متى)
  // ── أبعاد ليكرت 1..5 (null حتى التعبئة) ──
  overall: smallint('overall'),
  venue: smallint('venue'),
  gameplay: smallint('gameplay'),
  clarity: smallint('clarity'),
  pacing: smallint('pacing'),
  seating: smallint('seating'),
  leader: smallint('leader'),
  fairness: smallint('fairness'),
  atmosphere: smallint('atmosphere'),
  value: smallint('value_rating'),
  recommend: smallint('recommend'),
  notes: text('notes'),
  // ── حالة ──
  submittedAt: timestamp('submitted_at'),        // null = معلّق، غير null = مُعبّأ
  createdAt: timestamp('created_at').defaultNow().notNull(), // لحظة الإغلاق (مرساة مهلة الحجب)
}, (t) => ({
  uniq: unique('room_feedback_session_player_uniq').on(t.sessionId, t.playerId),
}));
