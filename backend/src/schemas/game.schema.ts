// ══════════════════════════════════════════════════════
// 🎮 مخططات جداول اللعبة — Game Schema (PostgreSQL + Drizzle)
// يشمل: sessions, session_players, matches, match_players, surveys
// ══════════════════════════════════════════════════════

import {
  pgTable, pgEnum, serial, text, timestamp, integer,
  boolean, varchar, date,
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────

export const winnerEnum = pgEnum('winner_type', ['MAFIA', 'CITIZEN']);
export const genderEnum = pgEnum('gender_type', ['male', 'female']);

// ── Sessions (غرف الألعاب — الحاوي الأكبر) ──────────

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  sessionCode: varchar('session_code', { length: 6 }).notNull(),
  displayPin: varchar('display_pin', { length: 6 }),
  sessionName: varchar('session_name', { length: 100 }).notNull(),
  maxPlayers: integer('max_players').default(10),
  isActive: boolean('is_active').default(true),
  // 🔗 من أنشأ الغرفة (staff.id)
  createdBy: integer('created_by'),
  // 🔗 ربط بالنشاط (activities.id) — يُملأ لاحقاً من admin.schema
  activityId: integer('activity_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Session Players (لاعبو الغرفة) ──────────────────

export const sessionPlayers = pgTable('session_players', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id).notNull(),
  playerId: integer('player_id'),  // 🔗 FK → players.id (حساب اللاعب الدائم)
  physicalId: integer('physical_id').notNull(),
  playerName: varchar('player_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  gender: varchar('gender', { length: 10 }).default('MALE'),
  dateOfBirth: date('date_of_birth'),
  // 🔗 ربط بالحجز (bookings.id) — يُملأ لاحقاً من admin.schema
  bookingId: integer('booking_id'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

// ── Matches (سجل المباريات) ─────────────────────────

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id),
  roomId: varchar('room_id', { length: 50 }).notNull(),
  roomCode: varchar('room_code', { length: 6 }).notNull(),
  gameName: varchar('game_name', { length: 100 }).notNull(),
  // 🔗 ربط الليدر بجدول staff بدلاً من leaders
  leaderStaffId: integer('leader_staff_id'),
  displayPin: varchar('display_pin', { length: 6 }),
  playerCount: integer('player_count').notNull(),
  maxPlayers: integer('max_players').default(10),
  isActive: boolean('is_active').default(true),
  winner: winnerEnum('winner'),
  totalRounds: integer('total_rounds').default(0),
  durationSeconds: integer('duration_seconds'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
});

// ── Match Players (لاعبو كل مباراة) ─────────────────

export const matchPlayers = pgTable('match_players', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id).notNull(),
  sessionPlayerId: integer('session_player_id').references(() => sessionPlayers.id),
  playerId: integer('player_id'),  // 🔗 FK → players.id (حساب اللاعب الدائم)
  physicalId: integer('physical_id').notNull(),
  playerName: varchar('player_name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  survivedToEnd: boolean('survived_to_end').default(false),
  eliminatedAtRound: integer('eliminated_at_round'),
  eliminatedDuring: varchar('eliminated_during', { length: 20 }),
  // ── تتبع الأداء (Progression Tracking) ──
  roundsSurvived: integer('rounds_survived').default(0),
  dealInitiated: boolean('deal_initiated').default(false),
  dealSuccess: boolean('deal_success'),
  abilityUsed: boolean('ability_used').default(false),
  abilityCorrect: boolean('ability_correct'),
  xpEarned: integer('xp_earned').default(0),
  rrChange: integer('rr_change').default(0),
});

// ── Surveys (التقييمات بعد المباراة) ─────────────────

export const surveys = pgTable('surveys', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id).notNull(),
  voterSessionPlayerId: integer('voter_session_player_id').references(() => sessionPlayers.id),
  bestPlayerSessionPlayerId: integer('best_player_session_player_id').references(() => sessionPlayers.id),
  leaderRating: integer('leader_rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
