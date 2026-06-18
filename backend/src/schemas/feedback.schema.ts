// ══════════════════════════════════════════════════════
// 📋 مخطّط فيد باك ما بعد الغرفة — Room Feedback Schema
// استبيان رضى إلزامي لكل (لاعب × غرفة/مباراة) على مقياس ليكرت 1..5.
// حقول مُشتقّة (activity/location/leader/playedAt) لتحليلات سريعة ومستقرّة.
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, integer, smallint, text, timestamp, unique,
} from 'drizzle-orm/pg-core';

export const roomFeedback = pgTable('room_feedback', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').notNull(),       // 🔗 matches.id (الغرفة)
  playerId: integer('player_id').notNull(),     // 🔗 players.id (المُجيب)
  // ── حقول مُشتقّة (مُجمّدة لحظة التعبئة) ──
  activityId: integer('activity_id'),           // session.activityId
  locationId: integer('location_id'),           // activity.locationId (أين)
  leaderStaffId: integer('leader_staff_id'),    // matches.leaderStaffId (أي ليدر)
  playedAt: timestamp('played_at'),             // matches.endedAt (متى)
  // ── أبعاد ليكرت 1..5 ──
  overall: smallint('overall'),
  venue: smallint('venue'),
  gameplay: smallint('gameplay'),
  clarity: smallint('clarity'),
  pacing: smallint('pacing'),
  seating: smallint('seating'),
  leader: smallint('leader'),
  fairness: smallint('fairness'),
  atmosphere: smallint('atmosphere'),
  value: smallint('value_rating'),              // value كلمة حسّاسة → عمود value_rating
  recommend: smallint('recommend'),
  // ── ملاحظات حرّة ──
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqMatchPlayer: unique('room_feedback_match_player_uniq').on(t.matchId, t.playerId),
}));
