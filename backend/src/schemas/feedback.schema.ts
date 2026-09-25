// ══════════════════════════════════════════════════════
// 📋 مخطّط فيد باك الغرفة — Room (Session) Feedback Schema
// استبيان رضى إلزامي لكل (لاعب × غرفة/جلسة) على مقياس ليكرت 1..5.
// يُنشأ صفّ معلّق عند إغلاق الليدر للغرفة، ويُحدَّث عند تعبئة اللاعب.
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, integer, smallint, text, timestamp, unique, jsonb, boolean, varchar,
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
  // ── إجابات الأسئلة المُحدَثة من اللوحة ──
  // 🔴 الأعمدة أعلاه تبقى كما هي: تقرؤها التحليلات وبطاقة اللاعب والتقارير
  //    وحذف الحساب. تحويلُها كلّها إلى JSONB في نشرةٍ واحدة مخاطرةٌ بلا مقابل.
  //    فالجديد يسكن هنا {questionKey: 1..5}، وإن أثبت سؤالٌ أهميّته رُقّي لاحقاً
  //    إلى عمودٍ بترحيلٍ صغيرٍ يخصّه وحده.
  answers: jsonb('answers').default({}),
  // ── حالة ──
  submittedAt: timestamp('submitted_at'),        // null = معلّق، غير null = مُعبّأ
  createdAt: timestamp('created_at').defaultNow().notNull(), // لحظة الإغلاق (مرساة مهلة الحجب)
}, (t) => ({
  uniq: unique('room_feedback_session_player_uniq').on(t.sessionId, t.playerId),
}));


// ══════════════════════════════════════════════════════
// 📝 أسئلة الاستبيان — بياناتٌ تُحرَّر لا شيفرةٌ تُنشَر
// ══════════════════════════════════════════════════════
// كانت الأسئلة ثابتةً في `FEEDBACK_QUESTIONS` وأعمدةً في `room_feedback`،
// فإضافةُ سؤالٍ واحد تعني ترحيلاً وتعديلَ التحليلات وواجهةَ التطبيق معاً.
//
// `column`: اسمُ العمود القديم لمن كان منها عموداً (overall, venue…). الجديد
// بلا عمود فتُكتب إجابته في `room_feedback.answers`.
// `retiredAt`: لا يُحذف سؤالٌ أُجيب عنه — يُتقاعد. حذفُه يفقد معنى إجاباته.
export const surveyQuestions = pgTable('survey_questions', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 40 }).notNull().unique(),
  text: text('text').notNull(),
  // scale = خياراتٌ مخصّصة · likert = مقياس ١–٥ ثابت · text = نصّ حرّ
  type: varchar('type', { length: 12 }).default('likert').notNull(),
  // app | wa | both
  channel: varchar('channel', { length: 8 }).default('app').notNull(),
  options: jsonb('options').default([]),          // [{label, score}] لنوع scale
  sortOrder: integer('sort_order').default(100).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  column: varchar('column_name', { length: 40 }),  // عمودٌ قائم، أو null للجديد
  createdAt: timestamp('created_at').defaultNow().notNull(),
  retiredAt: timestamp('retired_at'),
});
