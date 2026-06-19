// ══════════════════════════════════════════════════════
// 📋 خدمة فيد باك الغرفة — Room (Session) Feedback Service
// استبيان رضى على مستوى الغرفة (session). يُنشأ معلّقاً عند إغلاق الليدر للغرفة.
// ══════════════════════════════════════════════════════

import { eq, and, isNull, isNotNull, gte, lte, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { roomFeedback } from '../schemas/feedback.schema.js';
import { sessions, sessionPlayers, matches, matchPlayers } from '../schemas/game.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';

// ── الأسئلة (مصدر وحيد — تُرجَع للواجهة لتُعرض) ──
export const FEEDBACK_QUESTIONS: { key: string; dimension: string; text: string }[] = [
  { key: 'overall',    dimension: 'عام',          text: 'تجربتي في هذه الفعالية كانت ممتازة بشكل عام' },
  { key: 'venue',      dimension: 'المكان',        text: 'المكان كان مريحاً ومناسباً (إضاءة، صوت، جلوس، نظافة)' },
  { key: 'gameplay',   dimension: 'تجربة اللعب',   text: 'تجربة اللعب نفسها كانت ممتعة ومشوّقة' },
  { key: 'clarity',    dimension: 'وضوح القوانين', text: 'كانت القوانين وسير اللعبة واضحة ومفهومة' },
  { key: 'pacing',     dimension: 'الإيقاع',       text: 'إيقاع اللعبة كان مناسباً (لا ممل ولا متسرّع)' },
  { key: 'seating',    dimension: 'توزيع المقاعد', text: 'آلية توزيع المقاعد كانت عادلة ومريحة' },
  { key: 'leader',     dimension: 'الليدر',        text: 'الليدر كان محترفاً ولبقاً في التعامل' },
  { key: 'fairness',   dimension: 'الحياد',        text: 'شعرت بالعدل والحياد في إدارة اللعبة' },
  { key: 'atmosphere', dimension: 'الأجواء',       text: 'الأجواء العامة والروح الاجتماعية كانت رائعة' },
  { key: 'value',      dimension: 'القيمة',        text: 'كانت الفعالية تستحق وقتي وتكلفتها' },
  { key: 'recommend',  dimension: 'الولاء',        text: 'أنوي الحضور مجدداً وأنصح أصدقائي بالنادي' },
];

export const FEEDBACK_KEYS = FEEDBACK_QUESTIONS.map(q => q.key);

// مهلة قبل الحجب (إشعار لحظي، لكن لا يُحجب اللاعب إلا بعد ساعة من إغلاق الغرفة)
export const FEEDBACK_GRACE_MS = 60 * 60 * 1000;

// تاريخ فاصل: الغرف قبله غير مطلوب تقييمها (تجنّب إغراق اللاعبين بالقديم)
export const FEEDBACK_CUTOFF = new Date('2026-06-17T00:00:00+03:00');

// ── إنشاء/ترحيل الجدول (idempotent — يُستدعى عند الإقلاع) ──
export async function ensureFeedbackTable(): Promise<void> {
  const db = getDB();
  if (!db) return;
  const stmts = [
    sql`CREATE TABLE IF NOT EXISTS room_feedback (
      id serial PRIMARY KEY,
      session_id integer,
      match_id integer,
      player_id integer NOT NULL,
      activity_id integer,
      location_id integer,
      leader_staff_id integer,
      played_at timestamp,
      overall smallint, venue smallint, gameplay smallint, clarity smallint,
      pacing smallint, seating smallint, leader smallint, fairness smallint,
      atmosphere smallint, value_rating smallint, recommend smallint,
      notes text,
      submitted_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )`,
    // ترحيل أي جدول قديم (كان match-based) إلى session-based
    sql`ALTER TABLE room_feedback ADD COLUMN IF NOT EXISTS session_id integer`,
    sql`ALTER TABLE room_feedback ADD COLUMN IF NOT EXISTS submitted_at timestamp`,
    sql`ALTER TABLE room_feedback ALTER COLUMN match_id DROP NOT NULL`,
    sql`ALTER TABLE room_feedback DROP CONSTRAINT IF EXISTS room_feedback_match_player_uniq`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS room_feedback_session_player_uniq ON room_feedback(session_id, player_id)`,
    sql`CREATE INDEX IF NOT EXISTS room_feedback_player_idx ON room_feedback(player_id)`,
  ];
  for (const s of stmts) {
    try { await db.execute(s); } catch (err: any) { console.warn('⚠️ ensureFeedbackTable stmt:', err.message); }
  }
  console.log('✅ room_feedback table ensured (session-based)');
}

// ── إنشاء استبيانات معلّقة لكل مشاركي الغرفة (يُستدعى عند إغلاق الليدر للغرفة) ──
// يُرجع قائمة معرّفات اللاعبين المُنشأة حديثاً (لإرسال الإشعار لهم فقط).
export async function createPendingForSession(sessionId: number): Promise<number[]> {
  const db = getDB();
  if (!db) return [];

  // سياق الغرفة
  const [ses] = await db.select({
    activityId: sessions.activityId,
    createdBy: sessions.createdBy,
    createdAt: sessions.createdAt,
  }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!ses) return [];

  let activityDate: Date | null = null;
  let locationId: number | null = null;
  let isTest = false;
  if (ses.activityId) {
    const [act] = await db.select({
      date: activities.date,
      locationId: activities.locationId,
      isTest: locations.isTestLocation,
    }).from(activities)
      .leftJoin(locations, eq(locations.id, activities.locationId))
      .where(eq(activities.id, ses.activityId)).limit(1);
    activityDate = act?.date ?? null;
    locationId = act?.locationId ?? null;
    isTest = act?.isTest === true;
  }

  // استثناء المواقع الاختبارية والغرف الأقدم من التاريخ الفاصل
  if (isTest) return [];
  const refDate = activityDate || ses.createdAt;
  if (refDate && refDate.getTime() < FEEDBACK_CUTOFF.getTime()) return [];

  // مشاركو الغرفة (لاعبون لهم حساب).
  // نوحّد مصدرين: session_players (الروستر) + match_players (من لعبوا فعلاً) — لأن الروستر
  // قد يكون ناقصاً (لاعبون أُضيفوا للمباريات دون كتابتهم في session_players) فلا يفوتنا أحد.
  const fromRoster = await db.select({ playerId: sessionPlayers.playerId })
    .from(sessionPlayers)
    .where(and(eq(sessionPlayers.sessionId, sessionId), isNotNull(sessionPlayers.playerId)));
  const fromMatches = await db.select({ playerId: matchPlayers.playerId })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matches.sessionId, sessionId), isNotNull(matchPlayers.playerId)));
  const playerIds = Array.from(new Set(
    [...fromRoster, ...fromMatches].map(p => p.playerId!).filter(Boolean)
  ));
  if (playerIds.length === 0) return [];

  const now = new Date();
  const inserted = await db.insert(roomFeedback).values(
    playerIds.map(pid => ({
      sessionId,
      playerId: pid,
      activityId: ses.activityId ?? null,
      locationId,
      leaderStaffId: ses.createdBy ?? null,
      playedAt: now,
    }))
  ).onConflictDoNothing().returning({ playerId: roomFeedback.playerId });

  return inserted.map(r => r.playerId!).filter(Boolean);
}

export interface PendingSession {
  sessionId: number;
  sessionName: string | null;
  sessionCode: string | null;
  activityName: string | null;
  locationName: string | null;
  playedAt: Date | null;
}

// ── الاستبيانات المعلّقة للّاعب (للطابور) ──
export async function getPendingSessions(playerId: number): Promise<PendingSession[]> {
  const db = getDB();
  if (!db) return [];
  const rows = await db.select({
    sessionId: roomFeedback.sessionId,
    playedAt: roomFeedback.playedAt,
    sessionName: sessions.sessionName,
    sessionCode: sessions.sessionCode,
    activityName: activities.name,
    locationName: locations.name,
  }).from(roomFeedback)
    .leftJoin(sessions, eq(sessions.id, roomFeedback.sessionId))
    .leftJoin(activities, eq(activities.id, roomFeedback.activityId))
    .leftJoin(locations, eq(locations.id, roomFeedback.locationId))
    .where(and(
      eq(roomFeedback.playerId, playerId),
      isNull(roomFeedback.submittedAt),
      gte(roomFeedback.createdAt, FEEDBACK_CUTOFF),
    ))
    .orderBy(roomFeedback.createdAt);
  return rows as any;
}

// عدد الاستبيانات التي تحجب اللاعب فعلياً (مرّت عليها مهلة الساعة)
export async function countBlockingPending(playerId: number): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const graceCutoff = new Date(Date.now() - FEEDBACK_GRACE_MS);
  const [r] = await db.select({ c: sql<number>`COUNT(*)::int` })
    .from(roomFeedback)
    .where(and(
      eq(roomFeedback.playerId, playerId),
      isNull(roomFeedback.submittedAt),
      // نفس الحد الأدنى المستخدم في getPendingSessions: لا نَحجب على استبيانات
      // أقدم من التاريخ الفاصل (وإلا حُجب اللاعب على استبيان لا يظهر له في القائمة)
      gte(roomFeedback.createdAt, FEEDBACK_CUTOFF),
      lte(roomFeedback.createdAt, graceCutoff),
    ));
  return r?.c || 0;
}

// ── سياق استبيان غرفة لهذا اللاعب (null إن لا يوجد استبيان مطلوب) ──
export async function getSessionContext(sessionId: number, playerId: number) {
  const db = getDB();
  if (!db) return null;
  const [row] = await db.select({
    submittedAt: roomFeedback.submittedAt,
    playedAt: roomFeedback.playedAt,
    sessionName: sessions.sessionName,
    sessionCode: sessions.sessionCode,
    activityName: activities.name,
    locationName: locations.name,
  }).from(roomFeedback)
    .leftJoin(sessions, eq(sessions.id, roomFeedback.sessionId))
    .leftJoin(activities, eq(activities.id, roomFeedback.activityId))
    .leftJoin(locations, eq(locations.id, roomFeedback.locationId))
    .where(and(eq(roomFeedback.sessionId, sessionId), eq(roomFeedback.playerId, playerId)))
    .limit(1);
  return row || null;
}

// ── حفظ استجابة الاستبيان (تحديث الصف المعلّق) ──
export async function submitSessionFeedback(
  sessionId: number,
  playerId: number,
  answers: Record<string, number>,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDB();
  if (!db) return { ok: false, error: 'DB unavailable' };

  const ctx = await getSessionContext(sessionId, playerId);
  if (!ctx) return { ok: false, error: 'لا يوجد استبيان مطلوب لهذه الغرفة' };
  if (ctx.submittedAt) return { ok: true }; // عُبّئ مسبقاً — لا شيء للقيام به

  try {
    await db.update(roomFeedback).set({
      overall: answers.overall,
      venue: answers.venue,
      gameplay: answers.gameplay,
      clarity: answers.clarity,
      pacing: answers.pacing,
      seating: answers.seating,
      leader: answers.leader,
      fairness: answers.fairness,
      atmosphere: answers.atmosphere,
      value: answers.value,
      recommend: answers.recommend,
      notes: notes?.slice(0, 1000) || null,
      submittedAt: new Date(),
    } as any).where(and(
      eq(roomFeedback.sessionId, sessionId),
      eq(roomFeedback.playerId, playerId),
      isNull(roomFeedback.submittedAt),
    ));
    return { ok: true };
  } catch (err: any) {
    console.error('❌ submitSessionFeedback:', err.message);
    return { ok: false, error: err.message };
  }
}
