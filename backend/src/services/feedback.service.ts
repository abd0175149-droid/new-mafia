// ══════════════════════════════════════════════════════
// 📋 خدمة فيد باك ما بعد الغرفة — Room Feedback Service
// ══════════════════════════════════════════════════════

import { eq, and, isNull, isNotNull, gte, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { roomFeedback } from '../schemas/feedback.schema.js';
import { matches, matchPlayers, sessions } from '../schemas/game.schema.js';
import { activities, locations } from '../schemas/admin.schema.js';

// ── الأسئلة (مصدر وحيد — تُرجَع للواجهة لتُعرض) ──
export const FEEDBACK_QUESTIONS: { key: string; dimension: string; text: string }[] = [
  { key: 'overall',    dimension: 'عام',            text: 'تجربتي في هذه الفعالية كانت ممتازة بشكل عام' },
  { key: 'venue',      dimension: 'المكان',          text: 'المكان كان مريحاً ومناسباً (إضاءة، صوت، جلوس، نظافة)' },
  { key: 'gameplay',   dimension: 'تجربة اللعب',     text: 'تجربة اللعب نفسها كانت ممتعة ومشوّقة' },
  { key: 'clarity',    dimension: 'وضوح القوانين',   text: 'كانت القوانين وسير اللعبة واضحة ومفهومة' },
  { key: 'pacing',     dimension: 'الإيقاع',         text: 'إيقاع اللعبة كان مناسباً (لا ممل ولا متسرّع)' },
  { key: 'seating',    dimension: 'توزيع المقاعد',   text: 'آلية توزيع المقاعد كانت عادلة ومريحة' },
  { key: 'leader',     dimension: 'الليدر',          text: 'الليدر كان محترفاً ولبقاً في التعامل' },
  { key: 'fairness',   dimension: 'الحياد',          text: 'شعرت بالعدل والحياد في إدارة اللعبة' },
  { key: 'atmosphere', dimension: 'الأجواء',         text: 'الأجواء العامة والروح الاجتماعية كانت رائعة' },
  { key: 'value',      dimension: 'القيمة',          text: 'كانت الفعالية تستحق وقتي وتكلفتها' },
  { key: 'recommend',  dimension: 'الولاء',          text: 'أنوي الحضور مجدداً وأنصح أصدقائي بالنادي' },
];

export const FEEDBACK_KEYS = FEEDBACK_QUESTIONS.map(q => q.key);

// مهلة قبل الحجب (إشعار لحظي، لكن لا يُحجب اللاعب إلا بعد ساعة من نهاية اللعبة)
export const FEEDBACK_GRACE_MS = 60 * 60 * 1000;

// تاريخ فاصل: الألعاب التي انتهت قبله غير مطلوب تقييمها (تجنّب إغراق اللاعبين بالقديم)
export const FEEDBACK_CUTOFF = new Date('2026-06-17T00:00:00+03:00');

// ── إنشاء الجدول إن لم يكن موجوداً (idempotent — يُستدعى عند الإقلاع) ──
export async function ensureFeedbackTable(): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS room_feedback (
        id serial PRIMARY KEY,
        match_id integer NOT NULL,
        player_id integer NOT NULL,
        activity_id integer,
        location_id integer,
        leader_staff_id integer,
        played_at timestamp,
        overall smallint,
        venue smallint,
        gameplay smallint,
        clarity smallint,
        pacing smallint,
        seating smallint,
        leader smallint,
        fairness smallint,
        atmosphere smallint,
        value_rating smallint,
        recommend smallint,
        notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT room_feedback_match_player_uniq UNIQUE (match_id, player_id)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS room_feedback_player_idx ON room_feedback(player_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS room_feedback_match_idx ON room_feedback(match_id)`);
    console.log('✅ room_feedback table ensured');
  } catch (err: any) {
    console.error('❌ ensureFeedbackTable:', err.message);
  }
}

export interface PendingMatch {
  matchId: number;
  roomCode: string;
  gameName: string;
  playedAt: Date | null;
  activityId: number | null;
  activityName: string | null;
  locationId: number | null;
  locationName: string | null;
  leaderStaffId: number | null;
}

// ── الاستبيانات المعلّقة للّاعب (غرف منتهية شارك بها ولم يُقيّمها، تُستثنى المواقع الاختبارية) ──
export async function getPendingMatches(playerId: number): Promise<PendingMatch[]> {
  const db = getDB();
  if (!db) return [];

  const candidates = await db.select({
    matchId: matches.id,
    roomCode: matches.roomCode,
    gameName: matches.gameName,
    playedAt: matches.endedAt,
    leaderStaffId: matches.leaderStaffId,
    activityId: sessions.activityId,
    activityName: activities.name,
    locationId: activities.locationId,
    locationName: locations.name,
    isTest: locations.isTestLocation,
  })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .leftJoin(sessions, eq(sessions.id, matches.sessionId))
    .leftJoin(activities, eq(activities.id, sessions.activityId))
    .leftJoin(locations, eq(locations.id, activities.locationId))
    .where(and(
      eq(matchPlayers.playerId, playerId),
      isNotNull(matches.endedAt),
      gte(matches.endedAt, FEEDBACK_CUTOFF),  // الألعاب قبل التاريخ الفاصل غير مطلوبة
      isNull(matches.deletedAt),
    ));

  const done = new Set(
    (await db.select({ matchId: roomFeedback.matchId })
      .from(roomFeedback)
      .where(eq(roomFeedback.playerId, playerId))).map(r => r.matchId)
  );

  const seen = new Set<number>();
  const pending: PendingMatch[] = [];
  for (const c of candidates) {
    if (c.isTest === true) continue;            // استثناء المواقع الاختبارية
    if (done.has(c.matchId)) continue;          // عُبّئ مسبقاً
    if (seen.has(c.matchId)) continue;          // إزالة تكرار صفوف match_players
    seen.add(c.matchId);
    pending.push({
      matchId: c.matchId,
      roomCode: c.roomCode,
      gameName: c.gameName,
      playedAt: c.playedAt,
      activityId: c.activityId ?? null,
      activityName: c.activityName ?? null,
      locationId: c.locationId ?? null,
      locationName: c.locationName ?? null,
      leaderStaffId: c.leaderStaffId ?? null,
    });
  }
  // الأقدم أولاً
  pending.sort((a, b) => (a.playedAt?.getTime() || 0) - (b.playedAt?.getTime() || 0));
  return pending;
}

// عدد الاستبيانات التي تحجب اللاعب فعلياً (مرّت عليها مهلة السماح)
export async function countBlockingPending(playerId: number): Promise<number> {
  const pending = await getPendingMatches(playerId);
  const cutoff = Date.now() - FEEDBACK_GRACE_MS;
  return pending.filter(p => p.playedAt && p.playedAt.getTime() <= cutoff).length;
}

// ── هل شارك اللاعب في هذه الغرفة؟ ──
export async function hasParticipated(matchId: number, playerId: number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const [row] = await db.select({ id: matchPlayers.id })
    .from(matchPlayers)
    .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, playerId)))
    .limit(1);
  return !!row;
}

// ── سياق الغرفة (للعرض + الحقول المُشتقّة) ──
export async function getMatchContext(matchId: number) {
  const db = getDB();
  if (!db) return null;
  const [ctx] = await db.select({
    gameName: matches.gameName,
    roomCode: matches.roomCode,
    endedAt: matches.endedAt,
    leaderStaffId: matches.leaderStaffId,
    activityId: sessions.activityId,
    activityName: activities.name,
    activityDate: activities.date,
    locationId: activities.locationId,
    locationName: locations.name,
  })
    .from(matches)
    .leftJoin(sessions, eq(sessions.id, matches.sessionId))
    .leftJoin(activities, eq(activities.id, sessions.activityId))
    .leftJoin(locations, eq(locations.id, activities.locationId))
    .where(eq(matches.id, matchId))
    .limit(1);
  return ctx || null;
}

// ── حفظ استجابة الاستبيان ──
export async function submitFeedback(
  matchId: number,
  playerId: number,
  answers: Record<string, number>,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDB();
  if (!db) return { ok: false, error: 'DB unavailable' };

  // تحقّق المشاركة
  if (!(await hasParticipated(matchId, playerId))) {
    return { ok: false, error: 'لم تشارك في هذه الغرفة' };
  }

  const ctx = await getMatchContext(matchId);
  if (!ctx) return { ok: false, error: 'الغرفة غير موجودة' };

  try {
    await db.insert(roomFeedback).values({
      matchId,
      playerId,
      activityId: ctx.activityId ?? null,
      locationId: ctx.locationId ?? null,
      leaderStaffId: ctx.leaderStaffId ?? null,
      playedAt: ctx.endedAt ?? null,
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
    } as any).onConflictDoNothing();
    return { ok: true };
  } catch (err: any) {
    console.error('❌ submitFeedback:', err.message);
    return { ok: false, error: err.message };
  }
}
