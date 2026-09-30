// ══════════════════════════════════════════════════════
// 🎟️ عروض الحجز الجماعيّ — «جيب صحابك» (2026-09-28)
// ══════════════════════════════════════════════════════
//
// عرضٌ = «كلّ N يدفع منهم K» (١+١، ٣ بدخوليّة ١، ٤+١…) على فعاليّاتٍ محدَّدة، في نافذة
// حجز، بمهلةٍ قبل الفعاليّة، وبسقفٍ للمجموعات. يُدار من «🎟️ عروض الحجز» في مركز واتساب.
//
// 🔴 العقبةُ التي بُني عليها كلّ شيء: **لا هويّة للمجموعة في النظام**.
//    «خالد + ٤» = `reservations.people_count 5` رقماً بلا أسماء؛ التطبيق يحجز `count: 1`
//    لصاحبه وحده؛ فكلّ صديقٍ صفٌّ مستقلّ لا يربطه شيء بخالد (انظر reservation-collapse).
//    لذلك: **من يريد العرض يرسل للدون اسمَ ورقمَ كلّ صديق** (قرار المالك)، فتولد المجموعة
//    بهويّةٍ لحظةَ الحجز:
//      • صديقٌ له حساب ⟵ حجزٌ مستقلّ باسمه مربوطٌ بالمجموعة (GROUP_BOOKING_TAG)،
//        ويصله إشعارٌ بـ«تمام · مش أنا» (رقمٌ خاطئ لا يُحجز لغريبٍ دون علمه).
//      • صديقٌ جديد ⟵ عضوٌ معلَّق، يُربط **لحظة حجزه من التطبيق** بنفس الرقم.
//
// 📐 ثلاث قواعد لا تُكسر:
//   (١) **العدّ يتحرّك مع كلّ عضو**: المرافقون المجهولون = people − 1 − الأعضاءُ المرتبطون
//       (booking-count.service). بدونها يُعدّ الصديق مرّتين — خلل «٩ لخمسة».
//   (٢) **لا يُكشف إن كان للرقم حساب**: ردُّ الدون واحدٌ في الحالتين وبالاسم الذي كتبه
//       صاحبُ الحجز؛ وإلّا صار أيّ أحدٍ يفحص الأرقام ليعرف من المسجَّل عندنا وباسمه.
//   (٣) **الحسمُ عند الباب على الحاضرين الدافعين** بشروط اللقطة المحفوظة (terms) —
//       الحساباتُ المجّانيّة وزياراتُ الولاء لا تُكمل المجموعة (منعاً للتكديس).
//
// ⏱️ الأولويّة للحاجزين مسبقاً (قرار المالك): يستفيد رغم أنّ حجزه الأصليّ قبل النافذة
//    (يُقاس بزمن الترقية)، وحصّةٌ محجوزة له من السقف مدّة priority_hours بعد الإبلاغ.
//    المقاعدُ بلا سقف بقرارٍ مقفل — فالأولويّة لا تعني مقعداً.
// ══════════════════════════════════════════════════════

import crypto from 'crypto';
import { and, eq, inArray, isNull, sql, desc, or } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import {
  bookingOffers, bookingGroups, bookingGroupMembers, bookings, reservations, activities, locations,
  waConversations, waOptouts,
} from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';

export const GROUP_BOOKING_TAG = '👥 مجموعة عبر الدون';
const H = 3600e3;
export const MAX_GROUP = 12;
const NUDGE_MAX = 2;
const RETENTION_DAYS = 7;
const PACE_MS = 1300;
const OPTOUT_FOOTER = '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف';

// ── تاريخٌ بتوقيت الأردن بصيغة fmtJo نفسها (نسخةٌ محلّيّة: استيرادها من البوت يصنع حلقة) ──
const JO = 3 * H;
const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export function fmtWhen(input: any, withTime = true): string {
  const t = new Date(input).getTime(); if (isNaN(t)) return '';
  const d = new Date(t + JO);
  const base = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (!withTime) return base;
  let h = d.getUTCHours(); const m = d.getUTCMinutes(); const ap = h < 12 ? 'صباحاً' : 'مساءً'; h = h % 12 || 12;
  return `${base} — ${h}:${String(m).padStart(2, '0')} ${ap}`;
}
function rowsOf(r: any): any[] { return r?.rows ?? (Array.isArray(r) ? r : []); }
const ORD = ['', 'الأوّل', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
const jod = (x: number) => `${Math.round(x * 100) / 100} د.أ`;
export const pplAr = (n: number) => n === 1 ? 'شخص واحد' : n === 2 ? 'شخصين' : `${n} أشخاص`;

// ══════════════════════════════════════════════════════
// ⚙️ المحرّك — دوالّ نقيّة (يختبرها test-booking-offers.ts بلا قاعدة)
// ══════════════════════════════════════════════════════
export interface Terms { N: number; K: number; repeat: boolean }
export interface OfferLike extends Terms {
  id: number; name: string; status: string; bookFrom: number; bookUntil: number; leadHours: number;
  maxGroups: number; perCustomer: number; priorityHours: number; notifiedAt: number | null;
}
export type OfferState = 'draft' | 'paused' | 'scheduled' | 'live' | 'ended';

export function offerState(o: Pick<OfferLike, 'status' | 'bookFrom' | 'bookUntil'>, now: number): OfferState {
  if (o.status === 'draft') return 'draft';
  if (o.status === 'paused') return 'paused';
  if (now < o.bookFrom) return 'scheduled';
  if (now > o.bookUntil) return 'ended';
  return 'live';
}
export function blocksFor(t: Terms, n: number): number {
  if (n < t.N) return 0;
  return t.repeat ? Math.floor(n / t.N) : 1;
}
export function freeFor(t: Terms, n: number): number { return blocksFor(t, n) * (t.N - t.K); }
/** «٤ بيدفعوا والخامس مجاناً — ويتكرّر مع كلّ ٥» */
export function ruleText(t: Terms): string {
  let base: string;
  if (t.N - t.K === 1) base = `${t.K === 1 ? 'واحد بيدفع' : `${t.K} بيدفعوا`} و${ORD[t.N] || 'الأخير'} مجاناً`;
  else if (t.K === 1) base = `${t.N} أشخاص بسعر شخص واحد`;
  else base = `${t.N} أشخاص بسعر ${t.K}`;
  return base + (t.repeat ? ` — ويتكرّر مع كلّ ${t.N}` : ' — مرّة واحدة لكلّ حجز');
}
/** بدايةُ مدّة الأولويّة: لحظةُ الإبلاغ إن أُرسل، وإلّا بدايةُ النافذة */
export function priorityWindow(o: Pick<OfferLike, 'notifiedAt' | 'bookFrom' | 'priorityHours'>): [number, number] {
  const s = Math.max(o.bookFrom, o.notifiedAt ?? o.bookFrom);
  return [s, s + o.priorityHours * H];
}

export interface EvalCtx {
  now: number;
  activityAt: number;
  used: number;             // مجموعاتٌ استهلكت العرض (غير الملغاة)
  reserved: number;         // حصصٌ محجوزة للحاجزين مسبقاً (تُحسب لغيرهم فقط)
  existing: boolean;        // حاجزٌ مسبق على هذه الفعاليّة قبل الأولويّة
  bookedAt?: number | null; // أقدمُ طابعٍ لحجزه (قاعدة مكافأة الحجز المبكر)
  customerClaims: number;   // مجموعاتُه على هذا العرض (غير الملغاة)
  ownGroup?: boolean;       // له مجموعةٌ على هذا العرض لهذه الفعاليّة — الترقيةُ تعدّلها ولا تستهلك سقفاً
}
export interface Reason { text: string; customer: boolean }
export interface OfferEval {
  offerId: number; name: string; state: OfferState; ok: boolean; reasons: Reason[];
  free: number; pay: number; people: number;
  nudge: { need: number; people: number; free: number } | null;
  grandfathered: boolean; priority: boolean; terms: Terms;
}

export function evaluateOffer(o: OfferLike, people: number, c: EvalCtx): OfferEval {
  const reasons: Reason[] = [];
  const st = offerState(o, c.now);
  if (st !== 'live') {
    reasons.push({
      text: st === 'draft' ? 'مسودة لم تُفعَّل' : st === 'paused' ? 'موقوف من الإدارة'
        : st === 'scheduled' ? `يبدأ ${fmtWhen(o.bookFrom)}` : `انتهت نافذة الحجز ${fmtWhen(o.bookUntil)}`,
      customer: false, // غيرُ الفعّال لا يراه العميل إطلاقاً
    });
  }
  const leftH = (c.activityAt - c.now) / H;
  if (leftH <= 0) reasons.push({ text: 'الفعاليّة بدأت', customer: true });
  else if (leftH < o.leadHours) {
    reasons.push({ text: `لازم الحجز قبل الفعاليّة بـ${o.leadHours} ساعات على الأقلّ — باقي ${leftH < 1 ? 'أقلّ من ساعة' : `${Math.floor(leftH)} ساعات`}`, customer: true });
  }
  const [ps, pe] = priorityWindow(o);
  const inPrio = st === 'live' && c.now >= ps && c.now <= pe;
  const priority = !!c.existing && inPrio && !c.ownGroup;
  if (o.maxGroups > 0 && st === 'live' && !c.ownGroup) {
    if (c.existing && inPrio) {
      // حصّته محجوزة — لا يمنعه إلّا امتلاءٌ حقيقيّ بمجموعاتٍ قائمة فوق الحصص كلّها
      if (c.used >= o.maxGroups + c.reserved) reasons.push({ text: `اكتمل العرض (${o.maxGroups} مجموعات)`, customer: true });
    } else if (c.used >= o.maxGroups) {
      reasons.push({ text: `اكتمل العرض (${o.maxGroups} مجموعات)`, customer: true });
    } else if (c.used + c.reserved >= o.maxGroups) {
      reasons.push({ text: `المتبقّي من العرض محجوزٌ للحاجزين مسبقاً حتّى ${fmtWhen(pe)}`, customer: true });
    }
  }
  if (!c.ownGroup && c.customerClaims >= Math.max(1, o.perCustomer)) {
    reasons.push({ text: 'استفدت من هالعرض قبل', customer: true });
  }
  const ok = reasons.length === 0;
  const t: Terms = { N: o.N, K: o.K, repeat: o.repeat };
  const free = ok ? freeFor(t, people) : 0;
  let nudge: OfferEval['nudge'] = null;
  if (ok) {
    const b = blocksFor(t, people);
    const need = b === 0 ? t.N - people : t.repeat ? t.N - (people % t.N) : 0;
    if (need > 0 && need <= NUDGE_MAX && people + need <= MAX_GROUP) nudge = { need, people: people + need, free: freeFor(t, people + need) };
  }
  return {
    offerId: o.id, name: o.name, state: st, ok, reasons, free, pay: people - free, people, nudge,
    grandfathered: !!c.existing && c.bookedAt != null && c.bookedAt < o.bookFrom,
    priority, terms: t,
  };
}
/** الأوفر للعميل، بلا جمع؛ التعادل للأقدم */
export function pickBest(evals: OfferEval[]): OfferEval | null {
  return evals.filter(e => e.ok && e.free > 0).sort((a, b) => b.free - a.free || a.offerId - b.offerId)[0] || null;
}
/** حثٌّ على شخصٍ أو اثنين — أقلّ زيادةٍ تعطي أكثر مجّانيّ؛ ولا حثَّ إن كان الأفضل قائماً ولا يزيد */
export function pickNudge(evals: OfferEval[], best: OfferEval | null): OfferEval | null {
  let n: OfferEval | null = null;
  for (const e of evals) if (e.nudge && (!n || e.nudge.need < n.nudge!.need || (e.nudge.need === n.nudge!.need && e.nudge.free > n.nudge!.free))) n = e;
  if (best && n && n.nudge!.free <= best.free) return null;
  return n;
}
/**
 * حسمُ الباب: المجّانيّ على **الدافعين الحاضرين** وحدهم (الحساب المجّانيّ وزيارة الولاء
 * لا تُكمل المجموعة)، ولا يتجاوز عددَ الدافعين.
 */
export function settleCount(t: Terms, present: Array<{ paying: boolean }>): { size: number; free: number } {
  const size = present.filter(p => p.paying).length;
  return { size, free: Math.min(freeFor(t, size), size) };
}

// ══════════════════════════════════════════════════════
// 🗄️ العروض من القاعدة
// ══════════════════════════════════════════════════════
function toLike(r: any): OfferLike {
  return {
    id: Number(r.id), name: String(r.name), status: String(r.status),
    N: Number(r.groupSize ?? r.group_size), K: Number(r.payFor ?? r.pay_for), repeat: !!r.repeat,
    bookFrom: new Date(r.bookFrom ?? r.book_from).getTime(), bookUntil: new Date(r.bookUntil ?? r.book_until).getTime(),
    leadHours: Number(r.leadHours ?? r.lead_hours ?? 0), maxGroups: Number(r.maxGroups ?? r.max_groups ?? 0),
    perCustomer: Number(r.perCustomer ?? r.per_customer ?? 1), priorityHours: Number(r.priorityHours ?? r.priority_hours ?? 0),
    notifiedAt: (r.notifiedAt ?? r.notified_at) ? new Date(r.notifiedAt ?? r.notified_at).getTime() : null,
  } as any;
}
function actIdsOf(r: any): number[] { const a = r.activityIds ?? r.activity_ids; return (Array.isArray(a) ? a : []).map(Number).filter(Number.isFinite); }

export async function listOfferRows(): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  return db.select().from(bookingOffers).where(isNull(bookingOffers.deletedAt)).orderBy(desc(bookingOffers.id));
}
/** عروضٌ غير مسودة تستهدف هذه الفعاليّة — التقييمُ يقرّر الانطباق */
async function offersTargeting(activityId: number): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  return db.select().from(bookingOffers).where(and(
    isNull(bookingOffers.deletedAt),
    sql`${bookingOffers.status} <> 'draft'`,
    sql`${bookingOffers.activityIds} @> ${JSON.stringify([activityId])}::jsonb`,
  ));
}

async function usedCount(offerId: number): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const [r] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(bookingGroups)
    .where(and(eq(bookingGroups.offerId, offerId), sql`${bookingGroups.status} <> 'void'`));
  return Number(r?.n || 0);
}

/**
 * الحاجزون مسبقاً على فعاليّات العرض — شخصٌ واحد لكلّ (فعاليّة، رقم). المصدر: المتابعة
 * (reservations) + حجوزات التطبيق لمن لا متابعة له. «مسبقاً» = قبل بداية الأولويّة.
 */
export async function existingBookers(o: OfferLike, activityIds: number[]): Promise<Array<{
  activityId: number; phone: string; playerId: number | null; name: string; people: number; bookedAt: number; inGroup: boolean; reservationId: number | null;
}>> {
  const db = getDB(); if (!db || !activityIds.length) return [];
  const [ps] = priorityWindow(o);
  const ids = sql.join(activityIds.map(id => sql`${id}`), sql`, `);
  const r: any = await db.execute(sql`
    WITH p AS (
      SELECT r.activity_id, r.phone, r.player_id, r.contact_name AS name, COALESCE(r.people_count, 1) AS people, r.created_at, r.id AS res_id
        FROM reservations r
       WHERE r.activity_id IN (${ids}) AND r.deleted_at IS NULL AND r.status <> 'waitlist' AND COALESCE(r.phone, '') <> ''
      UNION ALL
      SELECT b.activity_id, b.phone, b.player_id, b.name, 1, b.created_at, NULL
        FROM bookings b
       WHERE b.activity_id IN (${ids}) AND b.deleted_at IS NULL AND COALESCE(b.phone, '') <> '' AND b.group_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM reservations r2 WHERE r2.activity_id = b.activity_id AND r2.deleted_at IS NULL AND r2.phone = b.phone)
    )
    SELECT p.activity_id, p.phone, MAX(p.player_id) AS player_id, MAX(p.name) AS name, MAX(p.people) AS people,
           MIN(p.created_at) AS booked_at, MAX(p.res_id) AS res_id,
           EXISTS (SELECT 1 FROM booking_groups g WHERE g.activity_id = p.activity_id AND g.owner_phone = p.phone AND g.status <> 'void') AS owner_group,
           EXISTS (SELECT 1 FROM booking_group_members m WHERE m.activity_id = p.activity_id AND m.phone = p.phone AND m.status IN ('booked','pending','joined')) AS member_group
      FROM p
     GROUP BY p.activity_id, p.phone
    HAVING MIN(p.created_at) < ${new Date(ps)}`);
  return rowsOf(r).map((x: any) => ({
    activityId: Number(x.activity_id), phone: String(x.phone), playerId: x.player_id ? Number(x.player_id) : null,
    name: String(x.name || ''), people: Number(x.people || 1), bookedAt: new Date(x.booked_at).getTime(),
    inGroup: !!(x.owner_group || x.member_group), reservationId: x.res_id ? Number(x.res_id) : null,
  }));
}
/** حصصُ الأولويّة: كلّ حاجزٍ مسبق لم يدخل مجموعةً بعد، خلال مدّة الأولويّة */
async function reservedCount(o: OfferLike, activityIds: number[], now: number): Promise<number> {
  const [ps, pe] = priorityWindow(o);
  if (offerState(o, now) !== 'live' || now < ps || now > pe) return 0;
  return (await existingBookers(o, activityIds)).filter(b => !b.inGroup).length;
}

/** `isTest` تشمل كلّ ما لا يُحجز: موقع اختبار، أو فعاليّة ملغاة/منتهية الحالة (لا عروض عليها) */
export interface ActivityInfo { id: number; name: string; date: Date; price: number; locationName: string; cityId: number | null; isTest: boolean; status: string }
export async function loadActivity(activityId: number): Promise<ActivityInfo | null> {
  const db = getDB(); if (!db) return null;
  const [a] = await db.select({
    id: activities.id, name: activities.name, date: activities.date, price: activities.basePrice,
    locationName: locations.name, cityId: locations.cityId, isTest: locations.isTestLocation, status: activities.status,
  }).from(activities).leftJoin(locations, eq(activities.locationId, locations.id))
    .where(and(eq(activities.id, activityId), isNull(activities.deletedAt))).limit(1);
  if (!a) return null;
  const status = String(a.status || 'planned');
  return { id: a.id, name: a.name, date: a.date as any, price: Number(a.price || 0), locationName: a.locationName || '', cityId: a.cityId ?? null, isTest: !!a.isTest || !['planned', 'active'].includes(status), status };
}

/** أقدمُ طابعٍ لحجز هذا الرقم/اللاعب على الفعاليّة (bookings أو reservations) — null إن لم يحجز */
async function bookedAtFor(activityId: number, phone: string, playerId: number | null): Promise<{ at: number; reservationId: number | null; people: number } | null> {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql`
    SELECT MIN(t.created_at) AS at, MAX(t.res_id) AS res_id, MAX(t.people) AS people FROM (
      SELECT created_at, id AS res_id, COALESCE(people_count,1) AS people FROM reservations
       WHERE activity_id = ${activityId} AND deleted_at IS NULL AND status <> 'waitlist'
         AND (phone = ${phone} ${playerId ? sql`OR player_id = ${playerId}` : sql``})
      UNION ALL
      SELECT created_at, NULL, 1 FROM bookings
       WHERE activity_id = ${activityId} AND deleted_at IS NULL
         AND (phone = ${phone} ${playerId ? sql`OR player_id = ${playerId}` : sql``})
    ) t`);
  const x = rowsOf(r)[0];
  if (!x?.at) return null;
  return { at: new Date(x.at).getTime(), reservationId: x.res_id ? Number(x.res_id) : null, people: Number(x.people || 1) };
}
async function ownActiveGroup(activityId: number, phone: string): Promise<any | null> {
  const db = getDB(); if (!db) return null;
  const [g] = await db.select().from(bookingGroups)
    .where(and(eq(bookingGroups.activityId, activityId), eq(bookingGroups.ownerPhone, phone), sql`${bookingGroups.status} <> 'void'`)).limit(1);
  return g || null;
}

/**
 * التقييمُ الكامل لعميلٍ على فعاليّة — الوحيدُ الذي يستعمله البوت والداشبورد.
 * `people` = حجمُ المجموعة المعرَّفة (صاحبُ الحجز + أصحابه المسجَّلون).
 */
export async function evaluateForCustomer(p: { activityId: number; people: number; phone: string; playerId?: number | null; now?: number }): Promise<{
  activity: ActivityInfo | null; evals: OfferEval[]; best: OfferEval | null; nudge: OfferEval | null; existing: boolean; bookedAt: number | null;
}> {
  const now = p.now ?? Date.now();
  const act = await loadActivity(p.activityId);
  if (!act || act.isTest) return { activity: act, evals: [], best: null, nudge: null, existing: false, bookedAt: null };
  const rows = await offersTargeting(p.activityId);
  const bk = p.phone ? await bookedAtFor(p.activityId, p.phone, p.playerId ?? null) : null;
  const own = p.phone ? await ownActiveGroup(p.activityId, p.phone) : null;
  const evals: OfferEval[] = [];
  const db = getDB();
  for (const r of rows) {
    const o = toLike(r);
    const [ps] = priorityWindow(o);
    const ids = actIdsOf(r);
    let claims = 0;
    if (db && p.phone) {
      const [c] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(bookingGroups)
        .where(and(eq(bookingGroups.offerId, o.id), eq(bookingGroups.ownerPhone, p.phone), sql`${bookingGroups.status} <> 'void'`));
      claims = Number(c?.n || 0);
    }
    const ownGroup = !!own && Number(own.offerId) === o.id;
    evals.push(evaluateOffer(o, p.people, {
      now, activityAt: new Date(act.date).getTime(), used: await usedCount(o.id), reserved: await reservedCount(o, ids, now),
      existing: !!bk && bk.at < ps, bookedAt: bk?.at ?? null, customerClaims: claims, ownGroup,
    }));
  }
  const best = pickBest(evals);
  return { activity: act, evals, best, nudge: pickNudge(evals, best), existing: !!bk, bookedAt: bk?.at ?? null };
}

// ══════════════════════════════════════════════════════
// 👥 الأعضاء — فحصُ ما أرسله صاحب الحجز
// ══════════════════════════════════════════════════════
export interface MemberInput { name?: string; phone?: string }
export interface MemberCheck {
  name: string; phone: string | null; raw: string; ok: boolean; reason?: string;
  /** مسجّلٌ أصلاً في مجموعة صاحب الحجز نفسه (أعاد إرساله) — يُعدّ ولا يُحجز له ثانية */
  alreadyInGroup?: boolean;
  /** داخليّ — لا يُعاد للنموذج ولا يُعرض للعميل (قاعدة ٢) */
  playerId?: number | null; existingBookingId?: number | null; accountName?: string | null;
}
export async function checkMembers(activityId: number, ownerPhone: string, list: MemberInput[], ownGroupId?: number | null): Promise<MemberCheck[]> {
  const db = getDB(); if (!db) return [];
  const seen = new Set<string>();
  const out: MemberCheck[] = [];
  for (const m of list.slice(0, MAX_GROUP - 1)) {
    const raw = String(m?.phone || '').trim();
    const name = String(m?.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'صديق';
    const phone = normalizeLocalPhone(raw);
    const c: MemberCheck = { name, phone, raw, ok: false };
    if (!phone) c.reason = 'رقم غير صالح — لازم موبايل أردني يبدأ بـ07';
    else if (phone === ownerPhone) c.reason = 'هذا رقمك أنت';
    else if (seen.has(phone)) c.reason = 'مكرّر';
    else {
      seen.add(phone);
      // في مجموعةٍ فعّالة أخرى على الفعاليّة نفسها؟ (مجموعتُه هو لا تُعدّ تعارضاً — ترقية)
      const [other] = await db.select({ id: bookingGroupMembers.id, groupId: bookingGroupMembers.groupId }).from(bookingGroupMembers)
        .where(and(eq(bookingGroupMembers.activityId, activityId), eq(bookingGroupMembers.phone, phone), inArray(bookingGroupMembers.status, ['booked', 'pending', 'joined']))).limit(1);
      const [ownerElsewhere] = await db.select({ id: bookingGroups.id }).from(bookingGroups)
        .where(and(eq(bookingGroups.activityId, activityId), eq(bookingGroups.ownerPhone, phone), sql`${bookingGroups.status} <> 'void'`)).limit(1);
      if ((other && Number(other.groupId) !== Number(ownGroupId || -1)) || ownerElsewhere) {
        c.reason = 'مسجّل ضمن مجموعة ثانية على هالفعاليّة';
      } else if (other && Number(other.groupId) === Number(ownGroupId)) {
        c.ok = true; c.alreadyInGroup = true;
      } else {
        c.ok = true;
        const [pl] = await db.select({ id: players.id, name: players.name }).from(players).where(eq(players.phone, phone)).limit(1);
        c.playerId = pl?.id ?? null; c.accountName = pl?.name ?? null;
        const [bk] = await db.select({ id: bookings.id }).from(bookings).where(and(
          eq(bookings.activityId, activityId), isNull(bookings.deletedAt),
          or(eq(bookings.phone, phone), pl?.id ? eq(bookings.playerId, pl.id) : sql`false`),
        )).limit(1);
        c.existingBookingId = bk?.id ?? null;
      }
    }
    out.push(c);
  }
  return out;
}

// ══════════════════════════════════════════════════════
// 🧾 بطاقةُ تأكيد المجموعة — حتميّة، ولا تكشف الحسابات
// ══════════════════════════════════════════════════════
export interface GroupPlan {
  activity: ActivityInfo; members: MemberCheck[]; okCount: number; people: number; declared: number;
  best: OfferEval | null; nudge: OfferEval | null; blocked: OfferEval[]; existingPeople: number | null; card: string;
  /** 💸 سعر الدون المبكّر لصاحب المجموعة الآن، وهل هو الأرخص (لا جمع — early-price.service) */
  early: { promoId: number; price: number; base: number; name: string; deadline: number } | null;
  useEarly: boolean; earlyStrike: boolean;
}
export async function planGroup(p: { activityId: number; ownerPhone: string; ownerPlayerId?: number | null; ownerName: string; members: MemberInput[]; now?: number }): Promise<GroupPlan | { error: string }> {
  const act = await loadActivity(p.activityId);
  if (!act) return { error: 'الفعاليّة غير موجودة — أعد عرض الفعاليّات' };
  if (act.isTest) return { error: 'هذه الفعاليّة غير متاحة عبر الواتساب' };
  if (new Date(act.date).getTime() <= (p.now ?? Date.now())) return { error: 'الفعاليّة بدأت أو انتهت' };
  const own = await ownActiveGroup(p.activityId, p.ownerPhone);
  const members = await checkMembers(p.activityId, p.ownerPhone, p.members, own?.id ?? null);
  // أعضاءُ مجموعته القائمة (الترقية) يُحسبون مع الجدد بلا تكرار
  let prior = 0;
  if (own) {
    const db = getDB();
    if (db) {
      const rows = await db.select({ phone: bookingGroupMembers.phone }).from(bookingGroupMembers)
        .where(and(eq(bookingGroupMembers.groupId, own.id), inArray(bookingGroupMembers.status, ['booked', 'pending', 'joined'])));
      const sent = new Set(members.filter(m => m.ok).map(m => m.phone));
      prior = rows.filter((r: any) => r.phone && !sent.has(r.phone)).length;
    }
  }
  const okCount = members.filter(m => m.ok).length;             // الجدد + من أعاد إرسالهم
  const people = 1 + prior + okCount;
  if (people > MAX_GROUP) return { error: `المجموعة أكبر من ${MAX_GROUP} — للمجموعات الكبيرة حوّله للإدارة` };
  const bk = await bookedAtFor(p.activityId, p.ownerPhone, p.ownerPlayerId ?? null);
  const declared = Math.max(people, bk?.people ?? 0);
  const ev = await evaluateForCustomer({ activityId: p.activityId, people, phone: p.ownerPhone, playerId: p.ownerPlayerId, now: p.now });
  const best = ev.best;
  const blocked = ev.evals.filter(e => e.state === 'live' && !e.ok && e.reasons.some(r => r.customer));
  const full = people * act.price;
  // 💸 سعر الدون المبكّر للحجز عبر الدون الآن — لا جمع مع عرض المجموعة: الأرخص للعميل (قرار المالك)
  let early: GroupPlan['early'] = null; let earlyStrike = false;
  try {
    const { earlyQuote } = await import('./early-price.service.js');
    const q = await earlyQuote({ activityId: p.activityId, phone: p.ownerPhone, playerId: p.ownerPlayerId ?? null, channel: 'bot', now: p.now });
    if (q.best) early = { promoId: q.best.promoId, price: q.best.price, base: q.best.base, name: q.best.name, deadline: q.best.deadline };
    earlyStrike = !!q.strikeBlocked;
  } catch { /* بلا سعر مبكّر */ }
  const useEarly = !!early && (!best || early.price * people < best.pay * act.price);
  const L: string[] = [`👥 حجز مجموعة — «${act.name}» (${fmtWhen(act.date)})`, `• أنت (${p.ownerName})`];
  if (prior) L.push(`• ${prior === 1 ? 'صديق مسجّل سابقاً' : `${prior} أصدقاء مسجّلون سابقاً`} ✓`);
  for (const m of members) L.push(!m.ok ? `• ${m.name} — ⚠️ ${m.reason}` : m.alreadyInGroup ? `• ${m.name} ✓ (مسجّل)` : `• ${m.name} ✓`);
  if (useEarly && early) {
    L.push(`💰 ${people} × ${early.price} = ${Math.round(people * early.price * 100) / 100} د.أ (سعر الدون المبكّر بدل ${act.price}${best ? `، أرخص من عرض «${best.name}»` : ''}) — الدفع بالمكان`);
    if (p.ownerPlayerId) L.push('ℹ️ بالسعر المبكّر ما بتنحسب هالزيارة ختم ولاء.');
  } else if (best) {
    L.push(`💰 ${people} × ${act.price} = ${full} − ${best.free * act.price} (عرض «${best.name}») = ${best.pay * act.price} د.أ — الدفع بالمكان`);
    L.push(`🎁 العرض على الحضور الفعليّ: لازم تكونوا ${blocksFor(best.terms, people) * best.terms.N} على الباب.`);
    if (best.grandfathered) L.push('⭐ حجزك قبل بداية العرض — بتستفيد منه لأنك حاجز من قبل.');
  } else {
    L.push(`💰 ${people > 1 ? `${people} × ${act.price} = ${full}` : act.price} د.أ — الدفع بالمكان`);
    const nu = ev.nudge;
    if (nu?.nudge) L.push(`💡 باقي ${nu.nudge.need === 1 ? 'صديق واحد' : `${nu.nudge.need} أصدقاء`} وبصير ${nu.nudge.free === 1 ? 'واحد منكم' : `${nu.nudge.free} منكم`} ببلاش (عرض «${nu.name}»).`);
    const b0 = blocked[0]; if (b0) L.push(`ℹ️ عرض «${b0.name}» ما بينطبق: ${b0.reasons.find(r => r.customer)!.text}.`);
  }
  if (okCount) L.push('📱 أصحابك بيوصلهم إشعار يأكّدوا فيه، واللي ما عنده حساب بيرتبط لحالو أوّل ما يحجز من التطبيق بنفس الرقم.');
  L.push('', okCount ? 'أثبّت المجموعة؟' : 'ما في رقم صالح — صحّحلي الأرقام وابعتها كمان مرّة.');
  if (!early && earlyStrike) L.splice(L.length - 1, 0, 'ℹ️ السعر المبكّر مش متاح بهالحجز لأنّك ما حضرت حجزك الأخير — بيرجعلك بالحجز اللي بعده.');
  return { activity: act, members, okCount, people, declared, best, nudge: ev.nudge, blocked, existingPeople: bk?.people ?? null, card: L.join('\n'), early, useEarly, earlyStrike };
}

// ══════════════════════════════════════════════════════
// ✅ تثبيتُ المجموعة — بضغطة الزرّ، لا بقرار النموذج
// ══════════════════════════════════════════════════════
export interface CommitHelpers {
  sendMessage: (i: any) => Promise<any>;
  mirrorReservation: (db: any, saved: any, tag: string) => Promise<any>;
  notifyAdmins: (title: string, body: string, data?: Record<string, any>) => Promise<void>;
}
export async function commitGroup(p: {
  conv: { id: number; phone: string; playerId?: number | null; displayName?: string | null };
  activityId: number; members: MemberInput[]; botTag: string; contactMethod: string; h: CommitHelpers;
}): Promise<{ ok: true; text: string; groupId: number } | { ok: false; text: string }> {
  const db = getDB(); if (!db) return { ok: false, text: 'صار خلل 🙏 جرّب بعد شوي.' };
  const ownerName = p.conv.displayName || p.conv.phone;
  const plan = await planGroup({ activityId: p.activityId, ownerPhone: p.conv.phone, ownerPlayerId: p.conv.playerId, ownerName, members: p.members });
  if ('error' in plan) return { ok: false, text: plan.error };
  if (!plan.okCount) return { ok: false, text: 'ما في رقم صالح بالقائمة 🙏 ابعتلي الأسماء والأرقام كمان مرّة.' };
  const act = plan.activity;
  const best = plan.best;
  const toBook = plan.members.filter(m => m.ok && !m.alreadyInGroup);
  if (!toBook.length && !plan.members.some(m => m.alreadyInGroup)) return { ok: false, text: 'ما في رقم صالح بالقائمة 🙏 ابعتلي الأسماء والأرقام كمان مرّة.' };

  const result = await db.transaction(async (tx: any) => {
    // 🔒 السقف يُفحص من جديد داخل المعاملة وعلى قفل صفّ العرض — قد يكتمل بين البطاقة والضغطة
    // 💸 السعر المبكّر أرخص ⟵ لا يُطالَب بعرض المجموعة (لا جمع)؛ المجموعة تُسجَّل هويّةً فقط
    let offerId: number | null = plan.useEarly ? null : (best?.offerId ?? null);
    if (offerId) {
      await tx.execute(sql`SELECT id FROM booking_offers WHERE id = ${offerId} FOR UPDATE`);
      const [o] = await tx.select().from(bookingOffers).where(eq(bookingOffers.id, offerId)).limit(1);
      const like = toLike(o);
      const [u] = await tx.select({ n: sql<number>`COUNT(*)::int` }).from(bookingGroups).where(and(eq(bookingGroups.offerId, offerId), sql`${bookingGroups.status} <> 'void'`));
      const own = await tx.select({ id: bookingGroups.id, offerId: bookingGroups.offerId }).from(bookingGroups)
        .where(and(eq(bookingGroups.activityId, p.activityId), eq(bookingGroups.ownerPhone, p.conv.phone), sql`${bookingGroups.status} <> 'void'`)).limit(1);
      const already = own[0] && Number(own[0].offerId) === offerId;
      // اكتمل للتوّ بين البطاقة والضغطة؟ صاحبُ الأولويّة يأخذ من حصّته المحجوزة فلا يُردّ
      if (!already && !best!.priority && like.maxGroups > 0 && Number(u?.n || 0) >= like.maxGroups) offerId = null;
    }
    const terms = best && offerId ? { N: best.terms.N, K: best.terms.K, repeat: best.terms.repeat, price: act.price, name: best.name, at: new Date().toISOString() } : {};
    const promisedFree = offerId && best ? best.free : 0;

    // ① حجزُ صاحب المجموعة في المتابعة
    const [ex] = await tx.select().from(reservations).where(and(
      eq(reservations.activityId, p.activityId), isNull(reservations.deletedAt),
      or(eq(reservations.phone, p.conv.phone), p.conv.playerId ? eq(reservations.playerId, p.conv.playerId) : sql`false`),
    )).limit(1);
    let resId: number; let source: 'bot' | 'upgrade' = 'bot';
    const memberNote = ` · 👥 مجموعة${offerId ? ` عرض «${best!.name}»` : ''}: ${plan.members.filter(m => m.ok).map(m => m.name).join('، ')}`;
    if (ex) {
      resId = ex.id; source = 'upgrade';
      await tx.update(reservations).set({
        peopleCount: Math.max(Number(ex.peopleCount || 1), plan.people),
        notes: sql`COALESCE(${reservations.notes}, '') || ${memberNote}`,
        ...(!ex.playerId && p.conv.playerId ? { playerId: p.conv.playerId } : {}),
        updatedAt: new Date(),
      } as any).where(eq(reservations.id, ex.id));
    } else {
      const [saved] = await tx.insert(reservations).values({
        activityId: p.activityId, contactName: ownerName, contactMethod: p.contactMethod, phone: p.conv.phone,
        peopleCount: plan.people, playerId: p.conv.playerId || null, status: 'confirmed',
        notes: `🤖 حجز مجموعة${memberNote}`, createdBy: p.botTag,
      } as any).returning();
      resId = saved.id;
    }

    // ② المجموعة (ترقيةٌ تعدّل القائمة ولا تُنشئ ثانية)
    const [og] = await tx.select().from(bookingGroups).where(and(eq(bookingGroups.activityId, p.activityId), eq(bookingGroups.ownerPhone, p.conv.phone), sql`${bookingGroups.status} <> 'void'`)).limit(1);
    let groupId: number;
    if (og) {
      groupId = og.id;
      await tx.update(bookingGroups).set({
        reservationId: resId, declaredPeople: Math.max(plan.declared, plan.people),
        ...(offerId ? { offerId, terms, promisedFree, priority: og.priority || !!best?.priority } : {}),
        updatedAt: new Date(),
      } as any).where(eq(bookingGroups.id, og.id));
    } else {
      const [g] = await tx.insert(bookingGroups).values({
        activityId: p.activityId, reservationId: resId, ownerPhone: p.conv.phone, ownerPlayerId: p.conv.playerId || null,
        ownerName, conversationId: p.conv.id, offerId, terms, declaredPeople: Math.max(plan.declared, plan.people), promisedFree,
        source, priority: !!best?.priority && !!offerId, status: 'claimed',
      } as any).returning();
      groupId = g.id;
    }

    // ③ الأعضاء
    const invites: Array<{ playerId: number; token: string; name: string }> = [];
    for (const m of toBook) {
      const token = crypto.randomBytes(18).toString('hex');
      let status = 'pending'; let bookingId: number | null = null;
      if (m.existingBookingId) {
        // حجز نفسه أصلاً ⟵ يُربط حجزه القائم ولا يُكرَّر
        status = 'joined'; bookingId = m.existingBookingId;
        await tx.update(bookings).set({ groupId } as any).where(eq(bookings.id, m.existingBookingId));
      } else if (m.playerId) {
        // له حساب ⟵ حجزٌ مستقلّ باسم حسابه، بوسم المجموعة (لا يُحتسب ختماً حتّى يؤكّد هو)
        const [pl] = await tx.select({ isFree: players.isFreeAccount, name: players.name }).from(players).where(eq(players.id, m.playerId)).limit(1);
        const [b] = await tx.insert(bookings).values({
          activityId: p.activityId, name: pl?.name || m.name, phone: m.phone!, count: 1,
          isPaid: !!pl?.isFree, paidAmount: '0', isFree: !!pl?.isFree, playerId: m.playerId,
          createdBy: GROUP_BOOKING_TAG, groupId, notes: `👥 ضمن مجموعة ${ownerName}`,
        } as any).returning();
        status = 'booked'; bookingId = b.id;
        invites.push({ playerId: m.playerId, token, name: m.name });
      }
      await tx.insert(bookingGroupMembers).values({
        groupId, activityId: p.activityId, name: m.name, phone: m.phone, playerId: m.playerId || null,
        bookingId, status, inviteToken: status === 'booked' ? token : null,
        acceptedAt: status === 'joined' ? new Date() : null,
      } as any).onConflictDoNothing();
    }
    return { groupId, resId, offerId, promisedFree, invites, isNew: !ex };
  });

  // ④ مرآةُ صاحب الحجز في تفاصيل النشاط (لاعبٌ مربوط) ثمّ وسمُ صفّه بالمجموعة
  try {
    const [saved] = await db.select().from(reservations).where(eq(reservations.id, result.resId)).limit(1);
    if (saved) await p.h.mirrorReservation(db, saved, p.botTag);
    await db.execute(sql`UPDATE bookings SET group_id = ${result.groupId}
                          WHERE activity_id = ${p.activityId} AND deleted_at IS NULL AND group_id IS NULL
                            AND (phone = ${p.conv.phone} ${p.conv.playerId ? sql`OR player_id = ${p.conv.playerId}` : sql``})`);
  } catch (e: any) { console.warn('⚠️ group owner mirror:', e?.message); }

  // ④′ 💸 السعر المبكّر: يُقفل على كلّ مقاعد صاحب المجموعة وصفوف أصحابه — أو يُستهلك غيابٌ حجبه
  let earlyLine = '';
  try {
    const E = await import('./early-price.service.js');
    if (plan.useEarly && plan.early) {
      await E.lockReservationSeats(result.resId, plan.early.promoId, plan.early.price, plan.people);
      await db.execute(sql`UPDATE bookings SET unit_price = ${String(plan.early.price)}, price_promo_id = ${plan.early.promoId}
                            WHERE group_id = ${result.groupId} AND deleted_at IS NULL AND COALESCE(is_paid, false) = false`);
      earlyLine = `💸 سعر الدون المبكّر محفوظ: ${plan.early.price} د.أ للشخص (${jod(plan.people * plan.early.price)} بدل ${jod(plan.people * plan.early.base)}).${p.conv.playerId ? '\nℹ️ بالسعر المبكّر ما بتنحسب هالزيارة ختم ولاء.' : ''}`;
    } else if (plan.earlyStrike && result.isNew) {
      await E.consumeOneStrike(result.resId, p.conv.phone, p.conv.playerId ?? null);
    }
  } catch (e: any) { console.warn('⚠️ group early price:', e?.message); }

  // ⑤ دعواتُ أصحاب الحسابات: إشعارٌ بـ«تمام · مش أنا» — ورسالةُ واتساب إن كانت نافذته مفتوحة
  for (const inv of result.invites) void inviteMember(inv.playerId, inv.token, ownerName, act, p.h);

  const L: string[] = [`تمّ ✓ ثبّتت مجموعتك على «${act.name}» — ${fmtWhen(act.date)}.`];
  if (earlyLine) L.push(earlyLine);
  else if (result.offerId && best) {
    L.push(`🎁 عرض «${best.name}» محفوظ باسمك: ${best.pay} بتدفعوا و${best.free === 1 ? 'واحد' : best.free} ببلاش (${jod(best.pay * act.price)} بدل ${jod(plan.people * act.price)}).`);
    L.push('العرض بيتحسب على الحضور الفعليّ عند الباب.');
  } else if (best && !result.offerId && !plan.useEarly) {
    L.push('⚠️ العرض اكتمل للتوّ قبل التثبيت — مجموعتك مسجّلة بالسعر العاديّ.');
  }
  L.push('📱 أصحابك بيوصلهم إشعار يأكّدوا فيه، واللي ما عنده حساب بيرتبط لحالو أوّل ما يحجز من التطبيق بنفس الرقم.');
  void p.h.notifyAdmins('👥 مجموعة حجز من البوت', `${ownerName} — ${pplAr(plan.people)} — ${act.name}${result.offerId ? ` · 🎁 ${best!.name}` : ''}`, { url: `/admin/activities/${act.id}` }).catch(() => {});
  return { ok: true, text: L.join('\n'), groupId: result.groupId };
}

async function inviteMember(playerId: number, token: string, ownerName: string, act: ActivityInfo, h: CommitHelpers) {
  const first = String(ownerName || '').split(/\s+/)[0] || 'صديقك';
  const url = `/g/${token}`;
  try {
    const { sendPushToPlayer } = await import('./fcm.service.js');
    await sendPushToPlayer(playerId, `👥 ${first} ضمّك لمجموعته`, `على «${act.name}» ${fmtWhen(act.date)} — اضغط لتأكّد أو «مش أنا»`, 'group_invite', { url });
  } catch (e: any) { console.warn('⚠️ group invite push:', e?.message); }
  // واتساب: فقط إن كانت له نافذةٌ مفتوحة — لا نبدأ محادثة مع أحد
  try {
    const db = getDB(); if (!db) return;
    const [pl] = await db.select({ phone: players.phone }).from(players).where(eq(players.id, playerId)).limit(1);
    if (!pl?.phone) return;
    const [conv] = await db.select().from(waConversations).where(eq(waConversations.phone, pl.phone)).limit(1);
    if (!conv) return;
    await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: {
      type: 'button',
      body: { text: `👥 ${first} ضمّك لمجموعته على «${act.name}» (${fmtWhen(act.date)}).\nانحجزلك مقعد باسمك — أكّد إنك جاي، أو قلّي إذا مش إنت.` },
      action: { buttons: [
        { type: 'reply', reply: { id: `grpm_ok:${token}`, title: 'تمام ✓' } },
        { type: 'reply', reply: { id: `grpm_no:${token}`, title: 'مش أنا' } },
      ] },
    } }).catch(() => {}); // نافذةٌ مغلقة ⟵ sendMessage يرفض، والإشعار كافٍ
  } catch { /* غير حاجب */ }
}

// ══════════════════════════════════════════════════════
// 🔗 الربط: صديقٌ جديد يحجز من التطبيق · صديقٌ له حساب يؤكّد أو يرفض
// ══════════════════════════════════════════════════════
/** بعد إنشاء حجز التطبيق: عضوٌ معلَّق بنفس الرقم على نفس الفعاليّة ⟵ ينضمّ للمجموعة */
export async function linkOnAppBooking(p: { playerId: number | null; phone: string; activityId: number; bookingId: number }): Promise<{ linked: boolean; groupId?: number }> {
  const db = getDB(); if (!db || !p.phone) return { linked: false };
  const [m] = await db.select().from(bookingGroupMembers).where(and(
    eq(bookingGroupMembers.activityId, p.activityId), eq(bookingGroupMembers.phone, p.phone), eq(bookingGroupMembers.status, 'pending'),
  )).limit(1);
  if (!m) return { linked: false };
  await db.update(bookingGroupMembers).set({ status: 'joined', playerId: p.playerId, bookingId: p.bookingId, acceptedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(bookingGroupMembers.id, m.id));
  await db.update(bookings).set({ groupId: m.groupId } as any).where(eq(bookings.id, p.bookingId));
  void tellOwner(m.groupId, `✅ ${m.name} ثبّت حجزه من التطبيق وصار ضمن مجموعتك.`);
  return { linked: true, groupId: m.groupId };
}
/**
 * صديقٌ له حساب حجزته المجموعة، ثمّ ضغط «احجز» في التطبيق: هذا **تأكيدٌ** لا تكرار.
 * يُرجع الحجز فيعيد التطبيق 200 بدل «محجوز مسبقاً».
 */
export async function acceptByAppBooking(p: { playerId: number | null; phone: string; activityId: number }): Promise<any | null> {
  const db = getDB(); if (!db) return null;
  const [b] = await db.select().from(bookings).where(and(
    eq(bookings.activityId, p.activityId), isNull(bookings.deletedAt), eq(bookings.createdBy, GROUP_BOOKING_TAG),
    or(p.playerId ? eq(bookings.playerId, p.playerId) : sql`false`, eq(bookings.phone, p.phone)),
  )).limit(1);
  if (!b) return null;
  const [m] = await db.select().from(bookingGroupMembers).where(and(eq(bookingGroupMembers.bookingId, b.id), eq(bookingGroupMembers.status, 'booked'))).limit(1);
  if (m) await acceptMember(m);
  const [fresh] = await db.select().from(bookings).where(eq(bookings.id, b.id)).limit(1);
  return fresh || b;
}
async function acceptMember(m: any): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.update(bookingGroupMembers).set({ status: 'joined', acceptedAt: new Date(), updatedAt: new Date() } as any).where(eq(bookingGroupMembers.id, m.id));
  // 🎟️ أكّد بنفسه ⟵ يُحتسب ختماً كحجز التطبيق (loyalty.service يقرأ created_by عند العرض)
  if (m.bookingId) await db.update(bookings).set({ createdBy: 'player-app' } as any).where(and(eq(bookings.id, m.bookingId), eq(bookings.createdBy, GROUP_BOOKING_TAG)));
  void tellOwner(m.groupId, `✅ ${m.name} أكّد إنّه جاي معك.`);
}
export async function inviteInfo(token: string): Promise<any | null> {
  const db = getDB(); if (!db || !/^[a-f0-9]{24,48}$/.test(token)) return null;
  const [m] = await db.select().from(bookingGroupMembers).where(eq(bookingGroupMembers.inviteToken, token)).limit(1);
  if (!m) return null;
  const [g] = await db.select().from(bookingGroups).where(eq(bookingGroups.id, m.groupId)).limit(1);
  const act = await loadActivity(m.activityId);
  return {
    status: m.status, memberName: m.name,
    ownerFirstName: String(g?.ownerName || '').split(/\s+/)[0] || '',
    activity: act ? { name: act.name, when: fmtWhen(act.date), location: act.locationName } : null,
    past: act ? new Date(act.date).getTime() < Date.now() : true,
  };
}
export async function acceptInvite(token: string): Promise<{ ok: boolean; status: string }> {
  const db = getDB(); if (!db) return { ok: false, status: 'error' };
  const [m] = await db.select().from(bookingGroupMembers).where(eq(bookingGroupMembers.inviteToken, token)).limit(1);
  if (!m) return { ok: false, status: 'not_found' };
  if (m.status === 'joined') return { ok: true, status: 'joined' };
  if (m.status !== 'booked') return { ok: false, status: m.status };
  await acceptMember(m);
  return { ok: true, status: 'joined' };
}
/** «مش أنا»: يُحذف الحجز الذي أنشأته المجموعة، ويُبلَّغ صاحبها، وتُعاد حسبة العرض */
export async function declineInvite(token: string): Promise<{ ok: boolean; status: string }> {
  const db = getDB(); if (!db) return { ok: false, status: 'error' };
  const [m] = await db.select().from(bookingGroupMembers).where(eq(bookingGroupMembers.inviteToken, token)).limit(1);
  if (!m) return { ok: false, status: 'not_found' };
  if (m.status === 'declined' || m.status === 'removed') return { ok: true, status: m.status };
  if (m.bookingId) await db.update(bookings).set({ deletedAt: new Date() } as any)
    .where(and(eq(bookings.id, m.bookingId), eq(bookings.createdBy, GROUP_BOOKING_TAG)));
  await db.update(bookingGroupMembers).set({ status: 'declined', updatedAt: new Date() } as any).where(eq(bookingGroupMembers.id, m.id));
  await shrinkGroup(m.groupId, `⚠️ الرقم اللي سجّلته لـ«${m.name}» ردّ «مش أنا» — شلته من المجموعة.`);
  return { ok: true, status: 'declined' };
}

/** نقصت المجموعة شخصاً: people_count و declared −1، وتُعاد حسبة الوعد، ويُبلَّغ صاحبها */
async function shrinkGroup(groupId: number, why: string): Promise<void> {
  const db = getDB(); if (!db) return;
  const [g] = await db.select().from(bookingGroups).where(eq(bookingGroups.id, groupId)).limit(1);
  if (!g || g.status === 'void') return;
  const declared = Math.max(1, Number(g.declaredPeople || 1) - 1);
  const t: any = g.terms || {};
  const promised = t.N ? freeFor({ N: t.N, K: t.K, repeat: !!t.repeat }, declared) : 0;
  await db.update(bookingGroups).set({ declaredPeople: declared, promisedFree: promised, updatedAt: new Date() } as any).where(eq(bookingGroups.id, groupId));
  if (g.reservationId) await db.update(reservations).set({ peopleCount: sql`GREATEST(COALESCE(${reservations.peopleCount}, 1) - 1, 1)`, updatedAt: new Date() } as any)
    .where(eq(reservations.id, g.reservationId));
  let msg = why;
  if (t.N && promised < Number(g.promisedFree || 0)) {
    const need = t.N - (declared % t.N || t.N);
    msg += promised === 0
      ? `\nصرتوا ${declared} — عرض «${t.name}» بدّه ${t.N}. ضيف ${need === 0 ? t.N - declared : need} وبرجعلكم العرض.`
      : `\nصرتوا ${declared} — المجّانيّ صار ${promised}.`;
  }
  void tellOwner(groupId, msg);
}
/** رسالةٌ لصاحب المجموعة إن كانت نافذته مفتوحة — وإلّا تكفي صفحةُ الفعاليّة للموظّفين */
async function tellOwner(groupId: number, text: string): Promise<void> {
  try {
    const db = getDB(); if (!db) return;
    const [g] = await db.select({ conversationId: bookingGroups.conversationId, ownerPhone: bookingGroups.ownerPhone }).from(bookingGroups).where(eq(bookingGroups.id, groupId)).limit(1);
    if (!g) return;
    let convId = g.conversationId;
    if (!convId) { const [c] = await db.select({ id: waConversations.id }).from(waConversations).where(eq(waConversations.phone, g.ownerPhone)).limit(1); convId = c?.id; }
    if (!convId) return;
    const { sendMessage } = await import('./whatsapp-inbox.service.js');
    await sendMessage({ conversationId: convId, text, source: 'system' }).catch(() => {});
  } catch { /* غير حاجب */ }
}

// ══════════════════════════════════════════════════════
// 🚫 الإلغاء — المجموعةُ لا تُترك معلَّقة
// ══════════════════════════════════════════════════════
/** ألغى صاحبُ المجموعة حجزه: تبطل المطالبة؛ حجوزاتُ أصحابه مستقلّة فتبقى وتفقد الرابط (قرار المالك) */
export async function onReservationDeleted(reservationId: number): Promise<void> {
  const db = getDB(); if (!db) return;
  try {
    const groups = await db.select().from(bookingGroups).where(and(eq(bookingGroups.reservationId, reservationId), sql`${bookingGroups.status} <> 'void'`));
    for (const g of groups) {
      await db.update(bookingGroups).set({ status: 'void', updatedAt: new Date() } as any).where(eq(bookingGroups.id, g.id));
      await db.update(bookingGroupMembers).set({ status: 'removed', updatedAt: new Date() } as any)
        .where(and(eq(bookingGroupMembers.groupId, g.id), eq(bookingGroupMembers.status, 'pending')));
      await db.update(bookings).set({ groupId: null } as any).where(eq(bookings.groupId, g.id));
    }
  } catch (e: any) { console.warn('⚠️ offers onReservationDeleted:', e?.message); }
}
/** حُذف صفُّ حجز: إن كان لعضوٍ في مجموعة ⟵ يخرج منها وتنقص؛ وإن كان صاحبها فلا شيء هنا */
/** الإدارة تُخرج عضواً من مجموعة: حجزُه (إن وُجد) يبقى مستقلّاً، والمجموعة تصغر ويُبلَّغ صاحبها */
export async function removeMember(memberId: number): Promise<{ ok: boolean; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [m] = await db.select().from(bookingGroupMembers).where(eq(bookingGroupMembers.id, memberId)).limit(1);
  if (!m) return { ok: false, error: 'العضو غير موجود' };
  if (!['booked', 'pending', 'joined'].includes(String(m.status))) return { ok: false, error: 'ليس ضمن المجموعة الآن' };
  await db.update(bookingGroupMembers).set({ status: 'removed', updatedAt: new Date() } as any).where(eq(bookingGroupMembers.id, m.id));
  if (m.bookingId) await db.update(bookings).set({ groupId: null } as any).where(and(eq(bookings.id, m.bookingId), eq(bookings.groupId, m.groupId)));
  await shrinkGroup(m.groupId, `ℹ️ ${m.name} انشال من مجموعتك.`);
  return { ok: true };
}
export async function onBookingDeleted(bookingId: number): Promise<void> {
  const db = getDB(); if (!db) return;
  try {
    const [m] = await db.select().from(bookingGroupMembers).where(and(eq(bookingGroupMembers.bookingId, bookingId), inArray(bookingGroupMembers.status, ['booked', 'joined']))).limit(1);
    if (!m) return;
    await db.update(bookingGroupMembers).set({ status: 'removed', updatedAt: new Date() } as any).where(eq(bookingGroupMembers.id, m.id));
    await shrinkGroup(m.groupId, `ℹ️ ${m.name} ألغى حجزه وطلع من المجموعة.`);
  } catch (e: any) { console.warn('⚠️ offers onBookingDeleted:', e?.message); }
}

// ══════════════════════════════════════════════════════
// 🚪 الباب — الحسمُ على الحاضرين الدافعين بشروط اللقطة
// ══════════════════════════════════════════════════════
export async function groupsForActivity(activityId: number): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  const gs = await db.select().from(bookingGroups).where(and(eq(bookingGroups.activityId, activityId), sql`${bookingGroups.status} <> 'void'`)).orderBy(bookingGroups.id);
  const out: any[] = [];
  for (const g of gs) {
    const members = await db.select().from(bookingGroupMembers).where(eq(bookingGroupMembers.groupId, g.id)).orderBy(bookingGroupMembers.id);
    const rows = await db.select({
      id: bookings.id, name: bookings.name, phone: bookings.phone, isPaid: bookings.isPaid, isFree: bookings.isFree,
      paidAmount: bookings.paidAmount, loyaltyRewardId: bookings.loyaltyRewardId, offerFree: bookings.offerFree, playerId: bookings.playerId, createdBy: bookings.createdBy,
    }).from(bookings).where(and(eq(bookings.groupId, g.id), isNull(bookings.deletedAt))).orderBy(bookings.id);
    const t: any = g.terms || {};
    const paying = rows.filter((r: any) => r.offerFree || (!r.isFree && !r.loyaltyRewardId));
    const preview = t.N ? settleCount({ N: t.N, K: t.K, repeat: !!t.repeat }, paying.map(() => ({ paying: true }))) : { size: paying.length, free: 0 };
    out.push({
      id: g.id, ownerName: g.ownerName, ownerPhone: g.ownerPhone, status: g.status, source: g.source, priority: g.priority,
      declaredPeople: g.declaredPeople, promisedFree: g.promisedFree, settledFree: g.settledFree, settledAt: g.settledAt, settledBy: g.settledBy,
      terms: t, offerId: g.offerId, createdAt: g.createdAt,
      members: members.map((m: any) => ({ id: m.id, name: m.name, phone: m.phone, status: m.status, bookingId: m.bookingId, hasAccount: !!m.playerId, acceptedAt: m.acceptedAt })),
      bookings: rows.map((r: any) => ({ ...r, paidAmount: Number(r.paidAmount || 0), freeAccount: !!r.isFree && !r.offerFree && !r.loyaltyRewardId, loyalty: !!r.loyaltyRewardId })),
      preview,
    });
  }
  return out;
}
/**
 * يحسم الموظّف: `present` = صفوف الحجز الحاضرة. المجّانيّ يُختار من غير المدفوع أوّلاً،
 * ويُعاد الحسم إن تكرّر (يُلغى الحسم السابق قبل الجديد).
 */
export async function settleGroup(groupId: number, present: number[], by: string): Promise<{ ok: boolean; free: number; freeIds: number[]; short?: number; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, free: 0, freeIds: [], error: 'DB unavailable' };
  const [g] = await db.select().from(bookingGroups).where(eq(bookingGroups.id, groupId)).limit(1);
  if (!g || g.status === 'void') return { ok: false, free: 0, freeIds: [], error: 'المجموعة غير موجودة' };
  const t: any = g.terms || {};
  // ① تراجعٌ عن أيّ حسمٍ سابق
  await db.update(bookings).set({ offerFree: false, isFree: false, isPaid: false, paidAmount: '0' } as any)
    .where(and(eq(bookings.groupId, groupId), eq(bookings.offerFree, true), isNull(bookings.deletedAt)));
  if (!t.N) {
    await db.update(bookingGroups).set({ status: 'settled', settledFree: 0, settledAt: new Date(), settledBy: by, updatedAt: new Date() } as any).where(eq(bookingGroups.id, groupId));
    return { ok: true, free: 0, freeIds: [] };
  }
  const rows = await db.select().from(bookings).where(and(eq(bookings.groupId, groupId), isNull(bookings.deletedAt))).orderBy(bookings.id);
  const set = new Set(present.map(Number));
  const here = rows.filter((r: any) => set.has(Number(r.id)));
  const paying = here.filter((r: any) => !r.isFree && !r.loyaltyRewardId);
  const { free } = settleCount({ N: t.N, K: t.K, repeat: !!t.repeat }, paying.map(() => ({ paying: true })));
  // المجّانيّ من غير المدفوع فقط — صفٌّ دُفع نقداً فعلاً لا يُمحى دفعُه (يُستردّ يدويّاً إن لزم).
  // والأعضاءُ قبل صاحب المجموعة، ثمّ الأحدث.
  const unpaid = paying.filter((r: any) => !(r.isPaid && Number(r.paidAmount || 0) > 0));
  const ranked = [...unpaid].sort((a: any, b: any) =>
    (Number(a.phone === g.ownerPhone) - Number(b.phone === g.ownerPhone)) || (b.id - a.id));
  const chosen = ranked.slice(0, free);
  const short = free - chosen.length;
  for (const r of chosen) {
    const tagNote = ` · 🎁 مجّانيّ بعرض «${t.name}»`;   // إعادةُ الحسم لا تكرّر الملاحظة
    await db.update(bookings).set({ offerFree: true, isFree: true, isPaid: true, paidAmount: '0', notes: sql`CASE WHEN POSITION(${tagNote} IN COALESCE(${bookings.notes}, '')) > 0 THEN ${bookings.notes} ELSE COALESCE(${bookings.notes}, '') || ${tagNote} END` } as any)
      .where(eq(bookings.id, r.id));
  }
  await db.update(bookingGroups).set({ status: 'settled', settledFree: chosen.length, settledAt: new Date(), settledBy: by, updatedAt: new Date() } as any).where(eq(bookingGroups.id, groupId));
  return { ok: true, free: chosen.length, freeIds: chosen.map((r: any) => r.id), ...(short > 0 ? { short } : {}) };
}

// ══════════════════════════════════════════════════════
// 📣 إبلاغ الحاجزين مسبقاً — معاينةٌ ثمّ إرسالٌ يؤكّده الأدمن
// ══════════════════════════════════════════════════════
function isWindowOpen(lastInboundAt: any): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * H;
}
export function notifyText(o: OfferLike & { name: string }, act: ActivityInfo, b: { name: string; people: number }): { text: string; qualifies: boolean; target: number } {
  const t: Terms = { N: o.N, K: o.K, repeat: o.repeat };
  const first = String(b.name || '').split(/\s+/)[0] || '';
  const qualifies = freeFor(t, b.people) > 0;
  const need = blocksFor(t, b.people) === 0 ? t.N - b.people : t.N - (b.people % t.N || t.N);
  const target = qualifies ? b.people : b.people + need;
  const fr = freeFor(t, target);
  const [, pe] = priorityWindow(o);
  const L = [`أهلاً ${first} 🎭`, `حجزك على «${act.name}» (${fmtWhen(act.date)}) لـ${pplAr(b.people)}.`, '', `🎁 انطلق عرض «${o.name}»: ${ruleText(t)}.`];
  if (qualifies) {
    L.push(`✅ عددكم بيستاهل العرض: ${fr === 1 ? 'واحد منكم' : `${fr} منكم`} ببلاش — بس ابعتلي اسم ورقم كل واحد من أصحابك لنثبّته باسمك.`);
  } else {
    L.push(`لو صرتوا ${target} بتدفعوا ${target - fr} بس — ${jod((target - fr) * act.price)} بدل ${jod(target * act.price)}.`);
  }
  if (o.priorityHours > 0) L.push(`⭐ لأنك حاجز من قبل: العرض محفوظلك حتّى ${fmtWhen(pe)} حتّى لو اكتمل العدد.`);
  return { text: L.join('\n') + OPTOUT_FOOTER, qualifies, target };
}
export async function notifyPreview(offerId: number): Promise<any> {
  const db = getDB(); if (!db) return { rows: [] };
  const [r] = await db.select().from(bookingOffers).where(and(eq(bookingOffers.id, offerId), isNull(bookingOffers.deletedAt))).limit(1);
  if (!r) return { error: 'العرض غير موجود' };
  const o = toLike(r); const ids = actIdsOf(r);
  const st = offerState(o, Date.now());
  const people = await existingBookers(o, ids);
  const rows: any[] = [];
  for (const b of people) {
    const act = await loadActivity(b.activityId);
    if (!act || act.isTest) continue;
    const [conv] = await db.select({ id: waConversations.id, lastInboundAt: waConversations.lastInboundAt }).from(waConversations).where(eq(waConversations.phone, b.phone)).limit(1);
    const [opt] = await db.select({ phone: waOptouts.phone }).from(waOptouts).where(eq(waOptouts.phone, b.phone)).limit(1);
    let kind: string;
    if (new Date(act.date).getTime() <= Date.now()) kind = 'past';
    else if (b.inGroup) kind = 'in_group';
    else if (opt) kind = 'optout';
    else if (!conv || !isWindowOpen(conv.lastInboundAt)) kind = 'closed';
    else kind = 'send';
    const msg = notifyText({ ...o, name: String(r.name) } as any, act, b);
    rows.push({ ...b, activityName: act.name, activityWhen: fmtWhen(act.date), conversationId: conv?.id ?? null,
      lastInboundAt: conv?.lastInboundAt ?? null, kind, qualifies: msg.qualifies, target: msg.target, message: msg.text });
  }
  const [ps, pe] = priorityWindow(o);
  return {
    offer: { id: o.id, name: r.name, state: st, notifiedAt: r.notifiedAt, priorityStart: new Date(ps), priorityEnd: new Date(pe), maxGroups: o.maxGroups },
    used: await usedCount(o.id), reserved: rows.filter(x => !x.inGroup && x.kind !== 'past').length,
    rows,
  };
}
let notifying = new Set<number>();
export async function notifySend(offerId: number, by: string): Promise<{ ok: boolean; error?: string; queued?: number }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  if (notifying.has(offerId)) return { ok: false, error: 'الإبلاغ جارٍ الآن' };
  const pv = await notifyPreview(offerId);
  if (pv.error) return { ok: false, error: pv.error };
  if (pv.offer.state !== 'live') return { ok: false, error: 'العرض ليس فعّالاً الآن — فعّله أوّلاً (أو انتظر بداية نافذته)' };
  const targets = pv.rows.filter((x: any) => x.kind === 'send');
  if (!targets.length) return { ok: false, error: 'لا أحد نافذته مفتوحة الآن من الحاجزين' };
  const { sendMessage, sendingSuspendedReason } = await import('./whatsapp-inbox.service.js');
  const blocked = sendingSuspendedReason(); if (blocked) return { ok: false, error: `الإرسال مقفل: ${blocked}` };
  // بدايةُ مدّة الأولويّة = أوّل إبلاغ
  const [cur] = await db.select({ notifiedAt: bookingOffers.notifiedAt }).from(bookingOffers).where(eq(bookingOffers.id, offerId)).limit(1);
  if (!cur?.notifiedAt) await db.update(bookingOffers).set({ notifiedAt: new Date(), updatedAt: new Date() } as any).where(eq(bookingOffers.id, offerId));
  notifying.add(offerId);
  (async () => {
    let sent = 0, skipped = 0;
    try {
      for (const x of targets) {
        if (sendingSuspendedReason()) break;
        try {
          await sendMessage({ conversationId: x.conversationId, source: 'broadcast', meta: { offerNotify: offerId, by }, interactive: {
            type: 'button', body: { text: x.message.slice(0, 1024) },
            action: { buttons: [
              { type: 'reply', reply: { id: `grp_add:${x.activityId}`, title: x.qualifies ? 'أبعت أرقامهم' : 'أضيف أصحابي' } },
              { type: 'reply', reply: { id: 'grp_no', title: 'لا شكراً' } },
            ] },
          } });
          sent++;
          await db.update(waConversations).set({ offersAnnounced: sql`COALESCE(${waConversations.offersAnnounced}, '{}'::jsonb) || ${JSON.stringify({ [offerId]: new Date().toISOString() })}::jsonb` } as any)
            .where(eq(waConversations.id, x.conversationId));
        } catch { skipped++; }
        await new Promise(r => setTimeout(r, PACE_MS + Math.random() * 400));
      }
    } finally {
      notifying.delete(offerId);
      console.log(`🎟️ offer #${offerId} notify: sent=${sent} skipped=${skipped} by ${by}`);
    }
  })();
  return { ok: true, queued: targets.length };
}

// ══════════════════════════════════════════════════════
// 🗣️ الدون: الحقائق الحيّة، والإعلانُ مرّةً لكلّ محادثة
// ══════════════════════════════════════════════════════
async function liveOfferRows(now: number): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  const rows = await db.select().from(bookingOffers).where(and(isNull(bookingOffers.deletedAt), eq(bookingOffers.status, 'live')));
  return rows.filter((r: any) => offerState(toLike(r), now) === 'live');
}
async function bookableActs(r: any, now: number, cityId?: number | null): Promise<ActivityInfo[]> {
  const out: ActivityInfo[] = [];
  for (const id of actIdsOf(r)) {
    const a = await loadActivity(id);
    if (!a || a.isTest) continue;
    if (new Date(a.date).getTime() - now <= Number(r.leadHours || 0) * H) continue;
    if (cityId && a.cityId && Number(a.cityId) !== Number(cityId)) continue;
    out.push(a);
  }
  return out;
}
/** سطورٌ للحقائق الحيّة (البادئة المخزَّنة) — يعرف النموذج العرض ليجيب عن الأسئلة */
export async function offerFactsLines(now = Date.now()): Promise<string[]> {
  const lines: string[] = [];
  for (const r of await liveOfferRows(now)) {
    const acts = await bookableActs(r, now);
    if (!acts.length) continue;
    const o = toLike(r);
    lines.push(`- 🎟️ عرض حجز «${r.name}» (offer ${r.id}): ${ruleText(o)} — على: ${acts.map(a => `${a.name} ${fmtWhen(a.date, false)} (activity ${a.id})`).join('، ')}`
      + ` — الحجز حتّى ${fmtWhen(o.bookUntil)} وقبل الفعاليّة بـ${o.leadHours} ساعات${o.maxGroups ? ` — لأوّل ${o.maxGroups} مجموعات` : ''}`
      + ` — يُطلب اسمُ ورقمُ كلّ صديق ثمّ set_group_members، ويُحسب على الحضور الفعليّ.`);
  }
  return lines;
}
/**
 * نصُّ الإعلان المستحَقّ لهذه المحادثة — الشيفرةُ تُلحقه حرفيّاً (لا يُترك للنموذج أن يتذكّر).
 * يُصفّى بمدينة اللاعب إن عُرفت؛ والحاجزُ المسبق على فعاليّة العرض يأخذ صيغته الخاصّة.
 * `explained` = عروضٌ شرحها get_booking_cost في هذا الردّ ⟵ يكفي سطرُ الشروط.
 */
export async function announcementFor(conv: any, explained: number[] = [], now = Date.now()): Promise<{ text: string; offerIds: number[] } | null> {
  const done: Record<string, any> = (conv.offersAnnounced && typeof conv.offersAnnounced === 'object') ? conv.offersAnnounced : {};
  let cityId: number | null = null;
  if (conv.playerId) {
    try { const { getOrInferHomeCity } = await import('./season.service.js'); cityId = await getOrInferHomeCity(conv.playerId); } catch { /* بلا مدينة ⟵ كلّ العروض */ }
  }
  const parts: string[] = []; const ids: number[] = [];
  for (const r of await liveOfferRows(now)) {
    if (!r.announce || done[String(r.id)]) continue;
    const acts = await bookableActs(r, now, cityId);
    if (!acts.length) continue;
    const o = toLike(r); const t: Terms = { N: o.N, K: o.K, repeat: o.repeat };
    ids.push(r.id);
    if (explained.includes(r.id)) {
      parts.push(`📌 شروط عرض «${r.name}»: الحجز حتّى ${fmtWhen(o.bookUntil)} وقبل الفعاليّة بـ${o.leadHours} ساعات${o.maxGroups ? `، لأوّل ${o.maxGroups} مجموعات` : ''} — ولتاخده ابعتلي اسم ورقم كل واحد من أصحابك. العرض على الحضور الفعليّ.`);
      continue;
    }
    // حاجزٌ مسبق على إحدى فعاليّاته ولم يدخل مجموعة؟
    let own: any = null;
    for (const a of acts) {
      const bk = await bookedAtFor(a.id, conv.phone, conv.playerId ?? null);
      const g = bk ? await ownActiveGroup(a.id, conv.phone) : null;
      if (bk && !g) { own = { a, people: bk.people }; break; }
    }
    if (own) {
      const n = notifyText({ ...o, name: String(r.name) } as any, own.a, { name: '', people: own.people }).text.replace(OPTOUT_FOOTER, '');
      parts.push(n.split('\n').slice(1).join('\n').trim());
      continue;
    }
    const custom = String(r.announceText || '').trim();
    parts.push(custom || [
      `🎁 عرض «${r.name}»: ${ruleText(t)}.`,
      `📅 على: ${acts.map(a => `${a.name} ${fmtWhen(a.date, false)}`).join('، ')}.`,
      `📌 الشروط: الحجز قبل ${fmtWhen(o.bookUntil)}، وقبل الفعاليّة بـ${o.leadHours} ساعات على الأقلّ${o.maxGroups ? `، لأوّل ${o.maxGroups} مجموعات` : ''}. لتاخد العرض ابعتلي اسم ورقم كل واحد من أصحابك. العرض يُحسب على الحضور الفعليّ.`,
    ].join('\n'));
  }
  return parts.length ? { text: parts.join('\n\n'), offerIds: ids } : null;
}
export async function markAnnounced(convId: number, offerIds: number[]): Promise<void> {
  const db = getDB(); if (!db || !offerIds.length) return;
  const patch: Record<string, string> = {}; for (const id of offerIds) patch[String(id)] = new Date().toISOString();
  await db.update(waConversations).set({ offersAnnounced: sql`COALESCE(${waConversations.offersAnnounced}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` } as any)
    .where(eq(waConversations.id, convId));
}
/** ملخّصٌ قصير للقائمة التفاعليّة وأداة الفعاليّات: «🎁 ٤+١» */
export async function offerBadgesFor(activityIds: number[], now = Date.now()): Promise<Map<number, { id: number; name: string; rule: string; tag: string }>> {
  const out = new Map<number, { id: number; name: string; rule: string; tag: string }>();
  for (const r of await liveOfferRows(now)) {
    const o = toLike(r); const t: Terms = { N: o.N, K: o.K, repeat: o.repeat };
    const tag = t.N - t.K === 1 ? `🎁 ${t.K}+1` : `🎁 ${t.N} بسعر ${t.K}`;
    for (const id of actIdsOf(r)) if (activityIds.includes(id) && !out.has(id)) out.set(id, { id: r.id, name: r.name, rule: ruleText(t), tag });
  }
  return out;
}

// ══════════════════════════════════════════════════════
// 🧹 الاحتفاظ — أرقامُ الجدد بياناتُ طرفٍ ثالث (قانون ٢٤/٢٠٢٣)
// ══════════════════════════════════════════════════════
/** عضوٌ لم يرتبط بعد انتهاء فعاليّته بـ٧ أيّام ⟵ يُمحى رقمه واسمه */
export async function purgeStaleMembers(): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r: any = await db.execute(sql`
    UPDATE booking_group_members m SET phone = NULL, name = 'صديق', invite_token = NULL,
           status = CASE WHEN m.status = 'pending' THEN 'removed' ELSE m.status END, updated_at = NOW()
      FROM activities a
     WHERE a.id = m.activity_id AND a.date < NOW() - (${RETENTION_DAYS} || ' days')::interval
       AND m.player_id IS NULL AND m.phone IS NOT NULL
     RETURNING m.id`);
  const n = rowsOf(r).length;
  if (n) console.log(`🧹 عروض الحجز: مُحيت ${n} أرقامٍ لأصدقاء لم يرتبطوا`);
  return n;
}
let jobsStarted = false;
export function startBookingOfferJobs(): void {
  if (jobsStarted) return; jobsStarted = true;
  setTimeout(() => { void purgeStaleMembers().catch(() => {}); }, 60e3);
  setInterval(() => { void purgeStaleMembers().catch(() => {}); }, 6 * H);
}

// ══════════════════════════════════════════════════════
// 🧰 إدارة العروض (الداشبورد)
// ══════════════════════════════════════════════════════
export interface OfferInput {
  name: string; groupSize: number; payFor: number; repeat: boolean; bookFrom: string | Date; bookUntil: string | Date;
  leadHours: number; activityIds: number[]; maxGroups: number; perCustomer: number; priorityHours: number;
  announce: boolean; announceText?: string; notifyExisting: boolean; status?: string;
}
export async function validateOffer(i: OfferInput): Promise<string | null> {
  const name = String(i.name || '').trim();
  if (name.length < 2 || name.length > 120) return 'الاسم مطلوب (٢–١٢٠ حرفاً)';
  const N = Number(i.groupSize), K = Number(i.payFor);
  if (!(Number.isInteger(N) && N >= 2 && N <= 10)) return 'حجم المجموعة بين ٢ و١٠';
  if (!(Number.isInteger(K) && K >= 1 && K < N)) return 'عدد الدافعين أقلّ من حجم المجموعة';
  const f = new Date(i.bookFrom).getTime(), u = new Date(i.bookUntil).getTime();
  if (!isFinite(f) || !isFinite(u) || u <= f) return 'آخر موعدٍ للحجز يجب أن يكون بعد بدايته';
  const ids = (i.activityIds || []).map(Number).filter(Number.isFinite);
  if (!ids.length) return 'اختر فعاليّةً واحدة على الأقلّ';
  for (const id of ids) { const a = await loadActivity(id); if (!a) return `الفعاليّة ${id} غير موجودة`; if (a.status === 'cancelled') return `«${a.name}» ملغاة — لا عروض عليها`; if (a.isTest && a.status !== 'completed') return `«${a.name}» في موقع اختبار — لا عروض عليها`; }
  const lead = Number(i.leadHours), cap = Number(i.maxGroups), per = Number(i.perCustomer), prio = Number(i.priorityHours);
  if (!(lead >= 0 && lead <= 168)) return 'المهلة بين ٠ و١٦٨ ساعة';
  if (!(cap >= 0 && cap <= 500)) return 'السقف بين ٠ و٥٠٠';
  if (!(per >= 1 && per <= 10)) return 'حدّ العميل بين ١ و١٠';
  if (!(prio >= 0 && prio <= 168)) return 'مدّة الأولويّة بين ٠ و١٦٨ ساعة';
  if (i.status && !['draft', 'live', 'paused'].includes(i.status)) return 'حالة غير معروفة';
  return null;
}
export function offerValues(i: OfferInput) {
  return {
    name: String(i.name).trim(), groupSize: Number(i.groupSize), payFor: Number(i.payFor), repeat: !!i.repeat,
    bookFrom: new Date(i.bookFrom), bookUntil: new Date(i.bookUntil), leadHours: Number(i.leadHours),
    activityIds: [...new Set((i.activityIds || []).map(Number).filter(Number.isFinite))], maxGroups: Number(i.maxGroups),
    perCustomer: Number(i.perCustomer), priorityHours: Number(i.priorityHours), announce: !!i.announce,
    announceText: String(i.announceText || '').slice(0, 900), notifyExisting: !!i.notifyExisting,
  };
}
export async function offerStats(offerId: number): Promise<any> {
  const db = getDB(); if (!db) return {};
  const r: any = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE status <> 'void')::int AS groups,
           COUNT(*) FILTER (WHERE status = 'settled')::int AS settled,
           COUNT(*) FILTER (WHERE source = 'upgrade' AND status <> 'void')::int AS upgrades,
           COUNT(*) FILTER (WHERE priority AND status <> 'void')::int AS priority,
           COALESCE(SUM(promised_free) FILTER (WHERE status <> 'void'), 0)::int AS promised,
           COALESCE(SUM(settled_free) FILTER (WHERE status = 'settled'), 0)::int AS given,
           COALESCE(SUM(settled_free * COALESCE((terms->>'price')::numeric, 0)) FILTER (WHERE status = 'settled'), 0) AS foregone
      FROM booking_groups WHERE offer_id = ${offerId}`);
  const m: any = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE m.status IN ('booked','joined'))::int AS linked,
           COUNT(*) FILTER (WHERE m.status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE m.status = 'declined')::int AS declined
      FROM booking_group_members m JOIN booking_groups g ON g.id = m.group_id
     WHERE g.offer_id = ${offerId} AND g.status <> 'void'`);
  const a = rowsOf(r)[0] || {}; const b = rowsOf(m)[0] || {};
  return { groups: a.groups || 0, settled: a.settled || 0, upgrades: a.upgrades || 0, priority: a.priority || 0, promised: a.promised || 0,
    given: a.given || 0, foregone: Number(a.foregone || 0), linked: b.linked || 0, pending: b.pending || 0, declined: b.declined || 0 };
}
