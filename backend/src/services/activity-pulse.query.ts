// ══════════════════════════════════════════════════════
// 🌙 نبض الليلة — طبقة القاعدة وRedis
//
// الاشتقاق النقيّ في activity-pulse.service.ts، والحراسة في
// activity-pulse.projection.ts. هذا الملفّ يجمعهما ولا يقرّر شيئاً بنفسه.
//
// ⚠️ القراءة من Redis وحده عبر `getRoomByCode(sessions.session_code)`. سجلّ
//    activeRooms ذاكريٌّ في العمليّة، فغرفةٌ موجودةٌ في Redis قد تغيب عنه بعد
//    إعادة تشغيل — والاعتماد عليه يجعل النبض يكذب بلا سبب.
// ══════════════════════════════════════════════════════

import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings, locations } from '../schemas/admin.schema.js';
import { matches, sessions } from '../schemas/game.schema.js';
import { getRoomByCode } from '../game/state.js';
import { bindRoomSchedule, roomStatus, type BoundSlot } from './activity-pulse.service.js';
import { projectActivityPulse, findMySeat, type PulseLive, type PulseMe } from './activity-pulse.projection.js';

/** نافذةُ «فعاليّةٌ جاريةٌ الآن»: ساعتان قبل الموعد وعشر ساعاتٍ بعده */
const WINDOW_BEFORE_MS = 2 * 60 * 60_000;
const WINDOW_AFTER_MS = 10 * 60 * 60_000;

export interface PulseActivityRef {
  id: number; name: string; date: string; place: string | null;
  roomCount: number; selected: boolean;
}
export interface PulseRoomRef {
  id: number; name: string; joinCode: string;
  isMine: boolean; isRemote: boolean; selected: boolean;
}
export interface ActivityPulse {
  serverNow: number;
  activities: PulseActivityRef[];
  rooms: PulseRoomRef[];
  activityId: number | null;
  activityName: string | null;
  place: string | null;
  roomId: number | null;
  status: 'pre' | 'live' | 'break' | 'ended' | 'no-room';
  slots: BoundSlot[];
  live: (PulseLive & { roomOrdinal: number; ofRoom: number; outsidePlan: boolean }) | null;
  me: PulseMe | null;
}

/** أطوارُ الإعداد: اللعبة بدأت عند اللاعب وإن لم يُعتمد التوزيع بعد */
const SETUP_PHASES = new Set(['ROLE_GENERATION', 'ROLE_BINDING']);

/** معرّفُ الصفّ الاصطناعيّ — لعبةٌ بدأت ولمّا يُنشأ سجلُّها بعد */
export const PENDING_MATCH_ID = -1;

/**
 * بدايةُ اللعبة كما يراها اللاعب هي دخولُ الليدر شاشة اختيار الأدوار، لا لحظةَ
 * اعتماد التوزيع (وهي لحظةُ إنشاء صفّ `matches`). فرقٌ قد يبلغ دقائق.
 *
 * • قبل الاعتماد: لا صفَّ أصلاً ⇒ نُركّب صفّاً معلّقاً كي تظهر اللعبة «تجري».
 * • بعده: نُقدّم بدايةَ الصفّ الحيّ إلى لحظة الإعداد — وإلّا قفز الوقتُ المعروض
 *   أمام اللاعب من ١٩:١٦ إلى ١٩:٢٤ فجأةً، وتغيّر الانحرافُ بلا سبب.
 *
 * ⚠️ لا يُمسّ `matches.created_at` في القاعدة: مدّةُ المباراة وإحصاءاتُها تُقاس
 *    من الاعتماد كما كانت. هذا إسقاطُ عرضٍ لا تعديلُ سجلّ.
 */
export function withSetupStart<T extends { id: number; createdAt: any; endedAt: any; isActive: any }>(
  rows: T[], state: any,
): T[] {
  const setupAt = Number(state?.setupStartedAt) || 0;
  if (!setupAt) return rows;

  const liveIdx = rows.findIndex(r => !r.endedAt && r.isActive !== false);
  if (liveIdx >= 0) {
    const r = rows[liveIdx];
    const started = new Date(r.createdAt).getTime();
    if (started > setupAt) {
      const copy = [...rows];
      copy[liveIdx] = { ...r, createdAt: new Date(setupAt) };
      return copy;
    }
    return rows;
  }

  if (SETUP_PHASES.has(String(state?.phase))) {
    return [...rows, {
      id: PENDING_MATCH_ID, createdAt: new Date(setupAt), endedAt: null,
      isActive: true, winner: null, totalRounds: 0,
    } as unknown as T];
  }
  return rows;
}

const bookedBy = (playerId: number | null, phone: string | null) => or(
  phone ? eq(bookings.phone, phone) : sql`false`,
  playerId != null ? eq(bookings.playerId, playerId) : sql`false`,
);

/** الفعاليّات الجارية التي حجزها هذا اللاعب — مصدرُ القائمة الأولى */
export async function listLiveBookedActivities(playerId: number | null, phone: string | null) {
  const db = getDB();
  if (!db) return [];
  const now = Date.now();

  const rows = await db.selectDistinct({
    id: activities.id,
    name: activities.name,
    date: activities.date,
    locationName: locations.name,
  })
    .from(bookings)
    .innerJoin(activities, eq(bookings.activityId, activities.id))
    .leftJoin(locations, eq(activities.locationId, locations.id))
    .where(and(
      isNull(bookings.deletedAt),
      isNull(activities.deletedAt),
      bookedBy(playerId, phone),
    ))
    .orderBy(desc(activities.date));

  // 📋 ومَن ثُبِّت في جدول المتابعة بلا صفّ حجز (رقمٌ غير مربوط بحساب، أو مرافق):
  //    كان خارج النبض تماماً — وهم أكثر من يصل متأخّراً ولا يعرف الإيقاع.
  const extra: typeof rows = [];
  try {
    const digits = String(phone || '').replace(/\D/g, '');
    const tail = digits.length >= 9 ? digits.slice(-9) : '';
    if (playerId != null || tail) {
      const resRows: any = await db.execute(sql`
        SELECT DISTINCT a.id, a.name, a.date, l.name AS location_name
        FROM reservations r
        JOIN activities a ON a.id = r.activity_id
        LEFT JOIN locations l ON l.id = a.location_id
        WHERE r.status = 'confirmed'
          AND a.deleted_at IS NULL
          AND (
            (${playerId ?? null}::int IS NOT NULL AND r.player_id = ${playerId ?? null}::int)
            OR (${tail} <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(r.phone, ''), '\\D', '', 'g'), 9) = ${tail})
          )
      `);
      for (const r of ((resRows as any).rows || resRows || [])) {
        extra.push({ id: Number(r.id), name: r.name, date: r.date, locationName: r.location_name ?? null } as any);
      }
    }
  } catch { /* غير حاجب — النبض يبقى للحاجزين على الأقلّ */ }

  const seen = new Set(rows.map(r => r.id));
  const all = [...rows, ...extra.filter(e => !seen.has(e.id))];

  return all.filter(a => {
    const t = new Date(a.date).getTime();
    return now >= t - WINDOW_BEFORE_MS && now <= t + WINDOW_AFTER_MS;
  });
}

/** هل لهذا اللاعب حجزٌ على هذه الفعاليّة؟ البوّابة الوحيدة. */
export async function hasBooking(
  activityId: number, playerId: number | null, phone: string | null,
): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const [row] = await db.select({ id: bookings.id })
    .from(bookings)
    .where(and(
      eq(bookings.activityId, activityId),
      isNull(bookings.deletedAt),
      bookedBy(playerId, phone),
    ))
    .limit(1);
  if (row) return true;

  // ومَن ثُبِّت في المتابعة بلا صفّ حجز (C4)
  try {
    const digits = String(phone || '').replace(/\D/g, '');
    const tail = digits.length >= 9 ? digits.slice(-9) : '';
    if (playerId == null && !tail) return false;
    const r: any = await db.execute(sql`
      SELECT 1 FROM reservations
      WHERE activity_id = ${activityId} AND status = 'confirmed'
        AND (
          (${playerId ?? null}::int IS NOT NULL AND player_id = ${playerId ?? null}::int)
          OR (${tail} <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 9) = ${tail})
        )
      LIMIT 1
    `);
    return (((r as any).rows || r || []) as any[]).length > 0;
  } catch { return false; }
}

/**
 * بناءُ النبض لغرفةٍ واحدةٍ مختارة.
 * `activityId`/`roomId` اختياريّان: بدونهما تُختار الفعاليّة الأقرب زمناً،
 * والغرفةُ التي للّاعب مقعدٌ فيها — وإلّا فأبكرُ الغرف بدايةً.
 */
export async function buildActivityPulse(opts: {
  playerId: number | null;
  phone: string | null;
  activityId?: number | null;
  roomId?: number | null;
}): Promise<ActivityPulse | null> {
  const db = getDB();
  if (!db) return null;
  const now = Date.now();

  const liveActs = await listLiveBookedActivities(opts.playerId, opts.phone);
  if (!liveActs.length) return null;

  // الفعاليّة المختارة: المطلوبة إن كانت ضمن حجوزاته، وإلّا الأقرب زمناً.
  const wanted = opts.activityId != null ? liveActs.find(a => a.id === opts.activityId) : null;
  const act = wanted ?? [...liveActs].sort(
    (a, b) => Math.abs(new Date(a.date).getTime() - now) - Math.abs(new Date(b.date).getTime() - now),
  )[0];

  const [actRow] = await db.select({
    id: activities.id, date: activities.date, gameSchedule: activities.gameSchedule,
  }).from(activities).where(eq(activities.id, act.id)).limit(1);
  if (!actRow) return null;

  const roomRows = await db.select({
    id: sessions.id, name: sessions.sessionName, code: sessions.sessionCode,
    isRemote: sessions.isRemote, createdAt: sessions.createdAt,
  })
    .from(sessions)
    .where(and(
      eq(sessions.activityId, act.id),
      eq(sessions.isActive, true),
      isNull(sessions.deletedAt),
    ))
    .orderBy(sessions.createdAt);

  const activityRefs: PulseActivityRef[] = liveActs.map(a => ({
    id: a.id,
    name: a.name,
    date: new Date(a.date).toISOString(),
    place: a.locationName ?? null,
    roomCount: a.id === act.id ? roomRows.length : 0,
    selected: a.id === act.id,
  }));

  const base = {
    serverNow: now,
    activities: activityRefs,
    activityId: act.id,
    activityName: act.name,
    place: act.locationName ?? null,
  };

  if (!roomRows.length) {
    return {
      ...base, rooms: [], roomId: null, status: 'no-room' as const,
      slots: bindRoomSchedule(actRow.gameSchedule, [], new Date(actRow.date), now),
      live: null, me: null,
    };
  }

  // حالات Redis لكلّ غرفة — تُقرأ لمعرفة أين يجلس اللاعب، لا لتُبثّ.
  // الجسر هو sessionCode: الجدول لا يحمل مفتاح Redis، والخريطة `game:code:XXXX` تحمله.
  const states = await Promise.all(roomRows.map(r => getRoomByCode(r.code).catch(() => null)));
  const seats = states.map(st => findMySeat(st, opts.playerId, opts.phone));

  const mineIdx = seats.findIndex(s => s != null);
  const wantedIdx = opts.roomId != null ? roomRows.findIndex(r => r.id === opts.roomId) : -1;
  const idx = wantedIdx >= 0 ? wantedIdx : (mineIdx >= 0 ? mineIdx : 0);

  const room = roomRows[idx];
  const state = states[idx];

  const roomRefs: PulseRoomRef[] = roomRows.map((r, i) => ({
    id: r.id, name: r.name, joinCode: r.code,
    isMine: seats[i] != null, isRemote: r.isRemote === true,
    selected: i === idx,
  }));

  // مباريات هذه الغرفة وحدها — العدّ يخصّ الغرفة لا الفعاليّة.
  const matchRows = await db.select({
    id: matches.id, createdAt: matches.createdAt, endedAt: matches.endedAt,
    isActive: matches.isActive, winner: matches.winner, totalRounds: matches.totalRounds,
  })
    .from(matches)
    .where(and(eq(matches.sessionId, room.id), isNull(matches.deletedAt)))
    .orderBy(matches.createdAt);

  const rows = withSetupStart(matchRows as any[], state);
  const slots = bindRoomSchedule(actRow.gameSchedule, rows as any, new Date(actRow.date), now);
  for (const sl of slots) if (sl.matchId === PENDING_MATCH_ID) sl.matchId = null;
  const liveSlot = slots.find(s => s.state === 'live') || null;
  const projected = projectActivityPulse(state, seats[idx]);

  return {
    ...base,
    rooms: roomRefs,
    roomId: room.id,
    status: liveSlot ? 'live' : roomStatus(slots),
    slots,
    live: liveSlot && projected
      ? {
          ...projected.live,
          roomOrdinal: liveSlot.ordinal,
          ofRoom: slots.length,
          outsidePlan: liveSlot.outsidePlan,
        }
      : null,
    me: projected?.me ?? null,
  };
}

/**
 * 👮 نبضُ الليلة كما يراه الطاقم (C3) — بلا حارس «هل لديه حجز؟».
 *
 * المحرّك نفسه كان يحسب لكلّ غرفة: أيّ لعبةٍ جارية، ومتى تبدأ القادمة تقريباً،
 * وكم جالساً من السعة — لكنّه محجوبٌ خلف `listLiveBookedActivities` فلا يراه
 * إلّا حاجزٌ في تطبيق اللاعب. موظّفُ الباب والليدر كانا يسألان بعضهما شفهيّاً.
 *
 * يُعيد صفّاً لكلّ غرفة، ولا يرمي أبداً.
 */
export async function buildStaffActivityPulse(activityId: number): Promise<{
  activityId: number;
  serverNow: number;
  rooms: Array<{
    sessionId: number;
    name: string | null;
    joinCode: string;
    status: string;
    ordinal: number | null;
    ofRoom: number;
    seated: number;
    capacity: number;
    waiting: number;
    nextStartAt: number | null;
  }>;
} | null> {
  const db = getDB();
  if (!db) return null;
  const now = Date.now();

  try {
    const [actRow] = await db.select({
      id: activities.id, date: activities.date, gameSchedule: activities.gameSchedule,
    }).from(activities).where(eq(activities.id, activityId)).limit(1);
    if (!actRow) return null;

    const roomRows = await db.select({
      id: sessions.id, name: sessions.sessionName, code: sessions.sessionCode,
    })
      .from(sessions)
      .where(and(
        eq(sessions.activityId, activityId),
        eq(sessions.isActive, true),
        isNull(sessions.deletedAt),
      ))
      .orderBy(sessions.createdAt);

    const out = [];
    for (const r of roomRows) {
      const state: any = await getRoomByCode(r.code).catch(() => null);
      const matchRows = await db.select({
        id: matches.id, createdAt: matches.createdAt, endedAt: matches.endedAt,
        isActive: matches.isActive, winner: matches.winner, totalRounds: matches.totalRounds,
      })
        .from(matches)
        .where(and(eq(matches.sessionId, r.id), isNull(matches.deletedAt)))
        .orderBy(matches.createdAt);

      const rows = withSetupStart(matchRows as any[], state);
      const slots = bindRoomSchedule(actRow.gameSchedule, rows as any, new Date(actRow.date), now);
      const liveSlot = slots.find(sl => sl.state === 'live') || null;
      const nextSlot = slots.find(sl => sl.state === 'future') || null;
      const nextTs = nextSlot?.projectedStart ? Date.parse(String(nextSlot.projectedStart)) : NaN;

      const players = Array.isArray(state?.players) ? state.players : [];
      out.push({
        sessionId: r.id,
        name: r.name,
        joinCode: r.code,
        status: liveSlot ? 'live' : roomStatus(slots),
        ordinal: liveSlot?.ordinal ?? null,
        ofRoom: slots.length,
        seated: players.filter((p: any) => !p.seatHeld && !p.frozen).length,
        capacity: state?.config?.maxPlayers ?? 0,
        waiting: Array.isArray(state?.spectators) ? state.spectators.length : 0,
        nextStartAt: Number.isFinite(nextTs) ? nextTs : null,
      });
    }
    return { activityId, serverNow: now, rooms: out };
  } catch (e: any) {
    console.warn('⚠️ buildStaffActivityPulse failed:', e.message);
    return null;
  }
}

/**
 * الفعاليّة المرتبطة بغرفةٍ حيّة — لتوجيه البثّ.
 * الحالةُ نفسها تحمل activityId، فلا نداءَ للقاعدة في المسار الساخن.
 * القاعدة احتياطٌ لحالةٍ قديمةٍ سبقت إضافة الحقل.
 */
export async function activityIdForRoom(roomId: string, state?: any): Promise<number | null> {
  if (state?.activityId != null) return Number(state.activityId) || null;
  const db = getDB();
  if (!db) return null;
  const code = state?.sessionCode;
  if (!code) return null;
  const [row] = await db.select({ activityId: sessions.activityId })
    .from(sessions)
    .where(eq(sessions.sessionCode, code))
    .limit(1);
  return row?.activityId ?? null;
}
