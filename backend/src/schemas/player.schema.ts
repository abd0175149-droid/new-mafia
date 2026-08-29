// ══════════════════════════════════════════════════════
// 👤 مخطط جدول اللاعبين — Player Schema (PostgreSQL + Drizzle)
// يشمل: players, booking_members, player_follows
// ══════════════════════════════════════════════════════

import {
  pgTable, serial, text, timestamp, integer,
  varchar, boolean,
} from 'drizzle-orm/pg-core';

// ── إعدادات المصادقة ──────────────────────────────
export const PLAYER_DEFAULT_PASSWORD = '1234'; // كلمة السر الافتراضية للاعبين المهاجرين
export const PLAYER_TOKEN_EXPIRY = '30d';       // مدة صلاحية JWT للاعب

// ── Players (اللاعبون المسجلون) ──────────────────────

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 20 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  mustChangePassword: boolean('must_change_password').default(false),
  name: varchar('name', { length: 100 }).notNull(),
  gender: varchar('gender', { length: 10 }).default('MALE'),
  dob: varchar('dob', { length: 20 }),
  email: varchar('email', { length: 200 }),
  avatarUrl: text('avatar_url'),
  totalMatches: integer('total_matches').default(0),
  totalWins: integer('total_wins').default(0),
  totalSurvived: integer('total_survived').default(0),
  // 🏆 عدّاد مباريات مدى الحياة — لا يُصفَّر عند بدء موسم جديد
  // (يُستخدم لكشف "اللاعب الجديد" في محرك المقاعد ومؤشّرات النشاط)
  lifetimeMatches: integer('lifetime_matches').default(0),
  // ── نظام التقدم (Progression) — هذه تمثّل الموسم العادي النشط ──
  xp: integer('xp').default(0),
  level: integer('level').default(1),
  rankTier: varchar('rank_tier', { length: 20 }).default('INFORMANT'), // INFORMANT→SOLDIER→CAPO→UNDERBOSS→GODFATHER
  rankRR: integer('rank_rr').default(0),
  totalDeals: integer('total_deals').default(0),
  successfulDeals: integer('successful_deals').default(0),
  lastActiveAt: timestamp('last_active_at'),
  isTestAccount: boolean('is_test_account').default(false),
  isFreeAccount: boolean('is_free_account').default(false),
  welcomeBonusApplied: boolean('welcome_bonus_applied').default(false),
  genderConstraint: varchar('gender_constraint', { length: 20 }).default('NONE'),
  // ── 🪙 اقتصاد التشبس Chips ──
  // ⚠️ كاش مشتق فقط — الحقيقة في chips_ledger. لا يُعدَّل إلا عبر applyChipsTx().
  // ⚠️ لا يُصفَّر مع الموسم (تصفير الموسم قائمة بيضاء صريحة — season.service.ts).
  chipsBalance: integer('chips_balance').default(0).notNull(),
  // خانات التجهيز (خاملة حتى المرحلة 1 — الكتالوج والإيجارات)
  chipsFrameItemId: integer('chips_frame_item_id'),
  chipsTitleItemId: integer('chips_title_item_id'),
  chipsNameFxItemId: integer('chips_name_fx_item_id'),
  // ── ربط بحساب موظف (Staff) ──
  linkedStaffId: integer('linked_staff_id'),
  // ── 🌐 صلاحيّات اللعب عن بُعد ──
  // 📍 إعفاء من سياج الفعاليّة — للاعب الذي لا يُنتج جهازُه قراءة موقع
  // (حالة iOS الموثّقة: إذنٌ ممنوحٌ ومع ذلك لا إحداثيّات أبداً). ليس ثقةً بل اعترافٌ بأنّ
  // السياج يمنع التساهل لا الاحتيال — ومن لا يملك موقعاً لا يُعاقَب بمنعه من اللعب.
  geofenceExempt: boolean('geofence_exempt').default(false),
  geofenceExemptReason: varchar('geofence_exempt_reason', { length: 200 }).default(''),
  geofenceExemptBy: integer('geofence_exempt_by'),      // staff.id — من منحه
  geofenceExemptAt: timestamp('geofence_exempt_at'),
  canHostRemote: boolean('can_host_remote').default(false),   // 👑 مسموح له إنشاء غرف عن بُعد (يضبطها الأدمن؛ لاحقاً اشتراك استضافة)
  remoteAccessUntil: timestamp('remote_access_until'),        // 🎟️ نهاية اشتراك الانضمام للغرف البعيدة (null = بلا اشتراك؛ مُتجاوَز أثناء فترة المجّانيّة)
  // 🗑️ الحذف المؤجّل — قانون ٢٤/٢٠٢٣ + شرط آبل 5.1.1(v)
  //    الحسابُ يُعطَّل فوراً ويبقى قابلاً للاستعادة حتّى `deletionDueAt`، ثمّ يُجهَّل.
  //    ⚠️ لا يُحذف الصفّ إطلاقاً: صفوفُ المباريات تشير إليه، وحذفُه يُفسد تاريخ خصومه.
  deletedAt: timestamp('deleted_at'),
  deletionDueAt: timestamp('deletion_due_at'),
  deletionReason: varchar('deletion_reason', { length: 30 }),
  anonymizedAt: timestamp('anonymized_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Booking Members (أعضاء الحجز) ────────────────────
// يربط اللاعب بحجز محدد → لحساب الإيرادات ومعرفة الضيوف

export const bookingMembers = pgTable('booking_members', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').notNull(),   // FK → bookings.id
  playerId: integer('player_id').notNull(),      // FK → players.id
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  isGuest: boolean('is_guest').default(false),   // ضيف = ليس الحاجز الأصلي
  checkedIn: boolean('checked_in').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Player Follows (متابعة اللاعبين) ────────────────
// اللاعب يتابع لاعبين آخرين (شرط: لعبوا في نفس المباراة)

export const playerFollows = pgTable('player_follows', {
  id: serial('id').primaryKey(),
  followerId: integer('follower_id').notNull(),   // FK → players.id (اللي بيتابع)
  followingId: integer('following_id').notNull(),  // FK → players.id (اللي متابَع)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
