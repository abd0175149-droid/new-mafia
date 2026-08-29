// ══════════════════════════════════════════════════════
// 🔔 تنبيه الحاجزين حين تنزاح الليلة عن ورقتها
//
// النبض لا يصل إلّا لمن تبويبُه مفتوح. أمّا مَن حجز ولم يفتح التطبيق فلا يعرف
// أنّ لعبته أُجّلت أو قُدّمت — وهو أحوجُ الناس إلى معرفة ذلك، لأنّه في الطريق.
//
// 🔴 مرّةٌ واحدة لكلّ لعبةٍ في كلّ غرفة: مفتاحُ منعٍ في Redis يحمل
//    (الفعاليّة · الغرفة · رقم اللعبة). بدونه يُعاد الإرسال عند كلّ إعادة
//    تشغيلٍ أو إعادة بثّ.
// 🔴 لا يُرسَل لمن يجلس في غرفة: هو يرى شاشة اللعب أمامه، وإشعارٌ يقول
//    «لعبتك تأخّرت» وهو يلعبها إزعاجٌ لا خدمة.
// 🔴 عتبةُ الصمت: انحرافٌ دون سبع دقائق لا يُذكر — ليلةٌ تُعلن تأخّرها خمس
//    دقائق تبدو متعثّرة وهي تسير جيّداً. نفس عتبة الواجهة.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings } from '../schemas/admin.schema.js';
import { sessions } from '../schemas/game.schema.js';
import { getAux, setAux } from '../config/redis.js';
import { getRoomByCode } from '../game/state.js';
import { sendPushToPlayers } from './fcm.service.js';
import { bindRoomSchedule, slotToEpoch, orderedGameSlots, toMinutes } from './activity-pulse.service.js';

/** نفس عتبة الواجهة — رقمٌ واحد لا يفترق بين قناتين */
export const DRIFT_FLOOR_MIN = 7;

const TZ = 'Asia/Amman';
const hhmm = (ms: number) =>
  new Intl.DateTimeFormat('ar-JO-u-nu-arab', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));

/**
 * تُنادى عند بدء مباراة. تحسب انحراف هذه اللعبة عن شريحتها، وإن تجاوز العتبة
 * أرسلت إشعاراً واحداً لحاجزي الفعاليّة الذين لا يجلسون في أيّ غرفة.
 *
 * لا ترمي أبداً: التنبيه رفاهيّة، ومسارُ اللعب أهمّ منه.
 */
export async function notifyScheduleDrift(activityId: number, sessionId: number): Promise<void> {
  try {
    const db = getDB();
    if (!db || !activityId || !sessionId) return;

    const [act] = await db.select({
      id: activities.id, name: activities.name, date: activities.date,
      gameSchedule: activities.gameSchedule,
    }).from(activities).where(and(eq(activities.id, activityId), isNull(activities.deletedAt))).limit(1);
    if (!act) return;

    const games = orderedGameSlots(act.gameSchedule);
    if (!games.length) return;   // بلا خطّةٍ لا انحراف

    // ترتيبُ هذه اللعبة داخل غرفتها — العدّ يخصّ الغرفة لا الفعاليّة
    const { matches } = await import('../schemas/game.schema.js');
    const rows = await db.select({
      id: matches.id, createdAt: matches.createdAt, endedAt: matches.endedAt,
      isActive: matches.isActive, winner: matches.winner, totalRounds: matches.totalRounds,
    }).from(matches)
      .where(and(eq(matches.sessionId, sessionId), isNull(matches.deletedAt)))
      .orderBy(matches.createdAt);
    if (!rows.length) return;

    const now = Date.now();
    const slots = bindRoomSchedule(act.gameSchedule, rows as any, new Date(act.date), now);
    const live = slots.find(s => s.state === 'live') ?? slots[slots.length - 1];
    if (!live || live.driftMin == null) return;               // لعبةٌ خارج الجدول: لا شريحة تُقارن بها
    if (Math.abs(live.driftMin) < DRIFT_FLOOR_MIN) return;    // عتبة الصمت

    // 🔒 مرّةٌ واحدة لكلّ (فعاليّة · غرفة · لعبة)
    const key = `pulse:drift:${activityId}:${sessionId}:${live.ordinal}`;
    if (await getAux(key)) return;
    await setAux(key, { at: now, drift: live.driftMin });

    // الشرائح التي لم تبدأ بعد — هي ما يهمّ من ينتظر دورَه
    const upcoming = slots.filter(s => s.state === 'future');
    const nextSlot = upcoming[0] ?? null;

    const late = live.driftMin > 0;
    const mins = Math.abs(live.driftMin);
    const title = late ? '🌙 الليلة تأخّرت قليلاً' : '🌙 الليلة تسير أبكر';
    const body = nextSlot
      ? `${live.label} بدأت ${late ? 'متأخّرةً' : 'مبكّرةً'} ${mins} دقيقة. ${nextSlot.label} ≈ ${hhmm(nextSlot.projectedStart)}`
      : `${live.label} بدأت ${late ? 'متأخّرةً' : 'مبكّرةً'} ${mins} دقيقة.`;

    const targets = await bookedNotSeated(activityId);
    if (!targets.length) return;

    await sendPushToPlayers(targets, title, body, 'activity_schedule', {
      activityId: String(activityId),
      // وسمٌ واحد لكلّ فعاليّة: إشعارٌ حيٌّ واحد يُحدَّث بدل صفٍّ لكلّ إزاحة
      tag: `pulse:${activityId}`,
      url: '/player/games?tab=pulse',
    });
    console.log(`🔔 نبض الليلة: أُبلغ ${targets.length} حاجزاً بانحراف ${live.driftMin}د (فعاليّة ${activityId})`);
  } catch (err: any) {
    console.error('⚠️ notifyScheduleDrift:', err?.message);
  }
}

/** حاجزو الفعاليّة الذين لا يجلسون في أيّ غرفةٍ من غرفها */
async function bookedNotSeated(activityId: number): Promise<number[]> {
  const db = getDB();
  if (!db) return [];

  const booked = await db.select({ playerId: bookings.playerId, phone: bookings.phone })
    .from(bookings)
    .where(and(eq(bookings.activityId, activityId), isNull(bookings.deletedAt)));

  const rooms = await db.select({ code: sessions.sessionCode })
    .from(sessions)
    .where(and(eq(sessions.activityId, activityId), eq(sessions.isActive, true), isNull(sessions.deletedAt)));

  // مقاعدُ كلّ الغرف مجتمعةً — من كان في إحداها يرى شاشته ولا يُزعَج
  const seatedIds = new Set<number>();
  const seatedPhones = new Set<string>();
  for (const r of rooms) {
    const st = await getRoomByCode(r.code).catch(() => null);
    for (const p of (st?.players ?? [])) {
      if (p?.playerId != null) seatedIds.add(Number(p.playerId));
      if (p?.phone) seatedPhones.add(String(p.phone));
    }
  }

  const out = new Set<number>();
  for (const b of booked) {
    if (b.playerId == null) continue;
    if (seatedIds.has(b.playerId)) continue;
    if (b.phone && seatedPhones.has(String(b.phone))) continue;
    out.add(b.playerId);
  }
  return [...out];
}

/** مسحُ أثر التنبيهات لفعاليّةٍ — يُنادى عند إعادة جدولةٍ يدويّة */
export async function resetDriftNotices(activityId: number, ordinals: number[] = []): Promise<void> {
  try {
    const { deleteAux } = await import('../config/redis.js');
    const db = getDB();
    if (!db) return;
    const rooms = await db.select({ id: sessions.id })
      .from(sessions).where(eq(sessions.activityId, activityId));
    const list = ordinals.length ? ordinals : [1, 2, 3, 4, 5, 6, 7, 8];
    for (const r of rooms) for (const o of list) {
      await deleteAux(`pulse:drift:${activityId}:${r.id}:${o}`);
    }
  } catch { /* لا يُسقط شيئاً */ }
}
