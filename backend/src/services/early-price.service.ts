// ══════════════════════════════════════════════════════
// 💸 سعر الدون المبكّر — حجزٌ عبر البوت قبل اللعبة بمهلة ⟵ دخوليّةٌ أقلّ، بلا ختم ولاء
// ══════════════════════════════════════════════════════
// قرارات المالك (2026-09-30، التصوّر: artifact 56mXddvBzG3yAk9Mur8imv):
//   • القناة: حجز اللاعب بنفسه عبر الدون، أو ما يسجّله الأدمن له عبر البوت (🔒). لا
//     التطبيق ولا إدخالات الداشبورد.
//   • الفترة تحكم **موعد الفعاليّة** (act_from..act_until)، والنطاق: الكلّ/مدن/فعاليّات
//     مع استثناء فعاليّات. المهلة بالساعات قبل بداية الفعاليّة.
//   • السعر **يُقفل لحظة الحجز** على صفّ المتابعة (unit_price + price_promo_id + promo_seats)
//     وعلى صفّ الحجز؛ كلّ قراءةٍ للسعر تمرّ عبر entryPriceSql (نافذة الدفع، الفاتورة،
//     بوّابة التذكرة، الدَّين، أداة المال). بلا قفلٍ = سعر الفعاليّة حرفيّاً.
//   • المرافقون يأخذون السعر (كلّ مقعدٍ في الحجز). الرقم الجديد مشمول.
//   • من أخذ السعر لا يأخذ الختم (loyalty.service ⟵ حكم 'promo').
//   • لا جمع مع عرض المجموعة — الأرخص للعميل (booking-offers.service).
//   • تعديل العدد والنقل يُعاد تقييمهما لحظة التغيير.
//   • الغياب: من حجز بنفسه (دون/تطبيق/🔒) ولم يدخل الغرفة ⟵ غيابٌ فور نهاية الفعاليّة؛
//     الإلغاء في آخر ٦ ساعات غياب. كلّ غيابٍ يحرمه العرض في **حجزٍ واحد** بعده (يُستهلك
//     حين كان الحجز سيأخذ السعر لولاه). «حضر» من الموظّف يلغيه ويعيد السعر إن لم يُدفع.
//   • التفعيل يطبّق السعر بأثرٍ رجعيّ على الحجوزات المبكّرة القائمة، بمعاينةٍ أوّلاً.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, sql, desc, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { activities, bookings, reservations, locations, waConversations, earlyPricePromos, noShowStrikes } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';

const H = 3600e3;
export const BOT_SELF_TAG = '🤖 بوت واتساب';
export const BOT_ADMIN_TAG = '🔒 أدمن عبر بوت واتساب';
export const LATE_CANCEL_HOURS = 6;
const OPTOUT_FOOTER = '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف';
const PACE_MS = 1300;
/**
 * 🧪 فاصلُ الفحص الحيّ (src/scripts/e2e-early-price.ts): الفحص يعمل على **موقع اختبارٍ مؤقّت**
 * فيبقى مخفيّاً عن الخادم الحيّ (قوائم البوت لا تعرضه، والمحرّك لا يسعّره، والغياب لا يُحكم به)؛
 * ومتغيّرٌ يُضبط في عمليّة الفحص وحدها يجعل ذلك الموقع «حقيقيّاً» للمحرّك داخلها. الخادم لا يضبطه.
 */
const E2E_LOC = Number(process.env.EARLY_PRICE_E2E_LOCATION_ID || 0) || null;
export const E2E_TAG = 'e2e-early-price';

function rowsOf(r: any): any[] { return r?.rows ?? (Array.isArray(r) ? r : []); }
const round2 = (x: number) => Math.round(x * 100) / 100;
export const jod = (x: number) => `${round2(x)} د.أ`;

// ── تاريخٌ بتوقيت الأردن (نسخةٌ محلّيّة؛ استيرادها من البوت يصنع حلقة) ──
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

// ══════════════════════════════════════════════════════
// ⚙️ المحرّك النقيّ (test-early-price.ts يختبره بلا قاعدة)
// ══════════════════════════════════════════════════════
export type Channel = 'bot' | 'admin' | 'app' | 'staff';
export type PromoStatus = 'draft' | 'live' | 'paused';
export interface PromoLike {
  id: number; name: string; status: PromoStatus; mode: 'fixed' | 'off'; value: number; leadHours: number;
  actFrom: number; actUntil: number; scope: 'all' | 'cities' | 'acts'; cityIds: number[]; activityIds: number[]; excludeIds: number[];
  activatedAt: number | null;
}
export interface ActLite { id: number; name: string; date: number; price: number; cityId: number | null; isTest: boolean; status: string; locationName: string }
export interface EarlyCtx { now: number; bookedAt: number; channel: Channel; strikes: number; freeAccount?: boolean; retro?: boolean }
export interface Reason { code: string; text: string }
export interface EarlyVerdict {
  promoId: number; name: string; ok: boolean; price: number; base: number; deadline: number;
  reasons: Reason[]; blockedOnlyByStrike: boolean;
}

/** وسم created_by ⟵ القناة. «🤖 بوت واتساب» اللاعب بنفسه، «🔒 أدمن عبر بوت واتساب» الأدمن له */
export function channelOfTag(createdBy: string | null | undefined): Channel {
  const t = String(createdBy || '');
  if (t === BOT_SELF_TAG) return 'bot';
  if (t === BOT_ADMIN_TAG) return 'admin';
  if (t === 'player-app') return 'app';
  return 'staff';
}
export function promoPrice(p: Pick<PromoLike, 'mode' | 'value'>, base: number): number {
  const v = Number(p.value) || 0;
  return round2(p.mode === 'fixed' ? Math.min(v, base) : Math.max(0, base - v));
}
export function deadlineOf(p: Pick<PromoLike, 'leadHours'>, a: Pick<ActLite, 'date'>): number { return a.date - p.leadHours * H; }
export function inScope(p: PromoLike, a: ActLite): Reason | null {
  if (p.scope === 'cities' && !(a.cityId != null && p.cityIds.includes(Number(a.cityId)))) return { code: 'scope', text: 'مدينة الفعاليّة خارج العرض' };
  if (p.scope === 'acts' && !p.activityIds.includes(a.id)) return { code: 'scope', text: 'الفعاليّة ليست ضمن العرض' };
  if (p.scope !== 'acts' && p.excludeIds.includes(a.id)) return { code: 'excluded', text: 'الفعاليّة مستثناة من العرض' };
  return null;
}
export function judgeEarly(p: PromoLike, a: ActLite, c: EarlyCtx): EarlyVerdict {
  const R: Reason[] = [];
  const base = Number(a.price) || 0;
  const price = promoPrice(p, base);
  const deadline = deadlineOf(p, a);
  if (p.status !== 'live') R.push({ code: 'state', text: 'العرض غير فعّال' });
  if (a.isTest) R.push({ code: 'test', text: 'فعاليّة غير متاحة للعروض' });
  if (!['planned', 'active'].includes(a.status)) R.push({ code: 'closed', text: 'الفعاليّة غير مفتوحة للحجز' });
  if (a.date < p.actFrom || a.date > p.actUntil) R.push({ code: 'window', text: 'الفعاليّة خارج فترة العرض' });
  const sc = inScope(p, a); if (sc) R.push(sc);
  if (c.channel !== 'bot' && c.channel !== 'admin') R.push({ code: 'channel', text: 'العرض للحجز عبر الدون فقط' });
  if (!c.retro && p.activatedAt && c.bookedAt < p.activatedAt) R.push({ code: 'before', text: 'الحجز قبل تفعيل العرض' });
  if (a.date - c.bookedAt < p.leadHours * H) R.push({ code: 'lead', text: `الحجز قبل اللعبة بأقلّ من ${p.leadHours} ساعة` });
  if (!(base > 0) || price >= base) R.push({ code: 'noop', text: 'لا فرق عن السعر العاديّ' });
  if (c.freeAccount) R.push({ code: 'free_account', text: 'حسابه مجّانيّ أصلاً' });
  if (c.strikes > 0) R.push({ code: 'strike', text: 'حجزٌ سابق لم يُحضَر' });
  return { promoId: p.id, name: p.name, ok: R.length === 0, price, base, deadline, reasons: R, blockedOnlyByStrike: R.length === 1 && R[0].code === 'strike' };
}
/** أرخص عرضٍ ينطبق، وإلّا أوّل عرضٍ حجبه الغياب وحده (للعقوبة)، وإلّا الأقرب للانطباق (للشرح) */
export function pickEarly(ps: PromoLike[], a: ActLite, c: EarlyCtx): { best: EarlyVerdict | null; strikeBlocked: EarlyVerdict | null; nearest: EarlyVerdict | null } {
  const ev = ps.map(p => judgeEarly(p, a, c));
  const ok = ev.filter(e => e.ok).sort((x, y) => x.price - y.price);
  const sb = ev.filter(e => e.blockedOnlyByStrike).sort((x, y) => x.price - y.price);
  const near = ev.filter(e => !e.ok && !e.reasons.some(r => ['state', 'test', 'closed', 'window', 'scope', 'excluded', 'noop'].includes(r.code)))
    .sort((x, y) => x.reasons.length - y.reasons.length);
  return { best: ok[0] || null, strikeBlocked: ok[0] ? null : sb[0] || null, nearest: near[0] || null };
}
/** سعرُ حجزٍ مقفول: المقاعد المقفولة بسعر العرض والباقي بسعر الفعاليّة */
export function reservationTotal(people: number, base: number, lock: { unitPrice: number | null; promoSeats: number | null }): number {
  const n = Math.max(1, people || 1);
  if (lock.unitPrice == null) return round2(n * base);
  const s = Math.min(n, Math.max(0, lock.promoSeats ?? n));
  return round2(s * Number(lock.unitPrice) + (n - s) * base);
}
export function scopeText(p: PromoLike, cityNames: Map<number, string>): string {
  if (p.scope === 'all') return 'كلّ فعاليّاتنا';
  if (p.scope === 'cities') return `فعاليّات ${p.cityIds.map(id => cityNames.get(id) || '').filter(Boolean).join(' و')}`;
  return 'فعاليّات مختارة';
}

// ══════════════════════════════════════════════════════
// 🗄️ القراءة
// ══════════════════════════════════════════════════════
const ids = (v: any) => (Array.isArray(v) ? v : []).map(Number).filter(Number.isFinite);
export function toPromo(r: any): PromoLike {
  return {
    id: Number(r.id), name: String(r.name), status: String(r.status) as PromoStatus, mode: r.mode === 'off' ? 'off' : 'fixed',
    value: Number(r.value ?? 0), leadHours: Number(r.leadHours ?? r.lead_hours ?? 24),
    actFrom: new Date(r.actFrom ?? r.act_from).getTime(), actUntil: new Date(r.actUntil ?? r.act_until).getTime(),
    scope: (['all', 'cities', 'acts'].includes(r.scope) ? r.scope : 'all') as any,
    cityIds: ids(r.cityIds ?? r.city_ids), activityIds: ids(r.activityIds ?? r.activity_ids), excludeIds: ids(r.excludeIds ?? r.exclude_ids),
    activatedAt: (r.activatedAt ?? r.activated_at) ? new Date(r.activatedAt ?? r.activated_at).getTime() : null,
  };
}
let cache: { at: number; rows: any[] } | null = null;
export function invalidateEarlyCache() { cache = null; }
async function promoRows(): Promise<any[]> {
  if (cache && Date.now() - cache.at < 20_000) return cache.rows;
  const db = getDB(); if (!db) return [];
  const rows = await db.select().from(earlyPricePromos).where(isNull(earlyPricePromos.deletedAt)).orderBy(desc(earlyPricePromos.id));
  cache = { at: Date.now(), rows };
  return rows;
}
export async function livePromos(): Promise<PromoLike[]> { return (await promoRows()).filter(r => r.status === 'live').map(toPromo); }
export async function listPromoRows(): Promise<any[]> { return promoRows(); }

export async function actLite(activityId: number): Promise<ActLite | null> {
  const db = getDB(); if (!db) return null;
  const [a] = await db.select({
    id: activities.id, name: activities.name, date: activities.date, price: activities.basePrice, status: activities.status,
    cityId: locations.cityId, isTest: locations.isTestLocation, locationName: locations.name, deletedAt: activities.deletedAt, locationId: activities.locationId,
  }).from(activities).leftJoin(locations, eq(activities.locationId, locations.id)).where(eq(activities.id, activityId)).limit(1);
  if (!a || a.deletedAt) return null;
  const isTest = !!a.isTest && !(E2E_LOC && Number(a.locationId) === E2E_LOC);
  return { id: a.id, name: a.name, date: new Date(a.date as any).getTime(), price: Number(a.price || 0), status: String(a.status || 'planned'), cityId: a.cityId ?? null, isTest, locationName: a.locationName || '' };
}

/** الغيابات القائمة (غير المستهلكة وغير الملغاة) لشخص — بحسابه أو رقمه */
export async function activeStrikes(phone: string | null | undefined, playerId: number | null | undefined): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  const ph = normalizeLocalPhone(phone || '') || null;
  if (!ph && !playerId) return [];
  const r: any = await db.execute(sql`
    SELECT s.*, a.name AS activity_name, a.date AS activity_date FROM no_show_strikes s LEFT JOIN activities a ON a.id = s.activity_id
     WHERE s.status = 'active' AND (${playerId ? sql`s.player_id = ${playerId} OR` : sql``} ${ph ? sql`s.phone = ${ph}` : sql`false`})
     ORDER BY s.created_at ASC`);
  return rowsOf(r);
}
async function isFreeAccount(playerId: number | null | undefined): Promise<boolean> {
  if (!playerId) return false;
  const db = getDB(); if (!db) return false;
  const [p] = await db.select({ f: players.isFreeAccount }).from(players).where(eq(players.id, playerId)).limit(1);
  return !!p?.f;
}

export interface EarlyQuote {
  act: ActLite | null; best: EarlyVerdict | null; strikeBlocked: EarlyVerdict | null; nearest: EarlyVerdict | null;
  strike: { activityName: string; date: number; kind: string } | null;
}
/** ما يأخذه هذا الشخص لو حجز الآن (أو في bookedAt) عبر قناةٍ ما */
export async function earlyQuote(p: { activityId: number; phone?: string | null; playerId?: number | null; channel: Channel; bookedAt?: number; now?: number; ignoreStrikes?: boolean; retro?: boolean }): Promise<EarlyQuote> {
  const now = p.now ?? Date.now();
  const act = await actLite(p.activityId);
  if (!act) return { act: null, best: null, strikeBlocked: null, nearest: null, strike: null };
  const ps = await livePromos();
  if (!ps.length) return { act, best: null, strikeBlocked: null, nearest: null, strike: null };
  const st = p.ignoreStrikes ? [] : await activeStrikes(p.phone, p.playerId);
  const ctx: EarlyCtx = { now, bookedAt: p.bookedAt ?? now, channel: p.channel, strikes: st.length, freeAccount: await isFreeAccount(p.playerId), retro: p.retro };
  const r = pickEarly(ps, act, ctx);
  const s0 = st[0];
  return { act, ...r, strike: s0 ? { activityName: String(s0.activity_name || ''), date: new Date(s0.activity_date || s0.created_at).getTime(), kind: String(s0.kind) } : null };
}

/** شارات قائمة الفعاليّات: «💸 ٢ د.أ حتّى الأربعاء ٧:٣٠م» لكلّ فعاليّةٍ مفتوحةٍ الآن */
export async function earlyBadgesFor(activityIds: number[], now = Date.now()): Promise<Map<number, { price: number; base: number; deadline: number; name: string; tag: string }>> {
  const out = new Map<number, { price: number; base: number; deadline: number; name: string; tag: string }>();
  const ps = await livePromos(); if (!ps.length) return out;
  for (const id of activityIds) {
    const a = await actLite(id); if (!a) continue;
    const r = pickEarly(ps, a, { now, bookedAt: now, channel: 'bot', strikes: 0 });
    if (r.best) out.set(id, { price: r.best.price, base: r.best.base, deadline: r.best.deadline, name: r.best.name, tag: `💸 ${jod(r.best.price)} حتّى ${fmtWhen(r.best.deadline)}` });
  }
  return out;
}

// ══════════════════════════════════════════════════════
// 💰 السعر الفعليّ للحجز — المصدر الواحد لكلّ قراءات المال
// ══════════════════════════════════════════════════════
/**
 * تعبير SQL لسعر دخول صفّ حجز: قفلُه، وإلّا قفلُ صفّ المتابعة لنفس الشخص في نفس
 * الفعاليّة (صفٌّ أنشأه الباب أو التطبيق لاحقاً يرث السعر)، وإلّا سعر الفعاليّة.
 * بلا أيّ قفلٍ في القاعدة = `a.base_price` حرفيّاً.
 */
export function entryPriceSql(b = 'b', a = 'a'): string {
  return `COALESCE(${b}.unit_price, (SELECT r_ep.unit_price FROM reservations r_ep WHERE r_ep.activity_id = ${b}.activity_id AND r_ep.deleted_at IS NULL AND r_ep.unit_price IS NOT NULL AND ((${b}.player_id IS NOT NULL AND r_ep.player_id = ${b}.player_id) OR (COALESCE(${b}.phone, '') <> '' AND r_ep.phone = ${b}.phone)) ORDER BY r_ep.id LIMIT 1), ${a}.base_price)`;
}
/** الأسعار المقفولة لصفوف حجز (القفل المباشر أو الموروث) — ما لا قفل له لا يظهر في الخريطة */
export async function lockedPricesFor(bookingIds: number[]): Promise<Map<number, { price: number; promoId: number | null }>> {
  const out = new Map<number, { price: number; promoId: number | null }>();
  const db = getDB(); if (!db || !bookingIds.length) return out;
  const r: any = await db.execute(sql.raw(`
    SELECT b.id, COALESCE(b.unit_price, x.unit_price) AS price, COALESCE(b.price_promo_id, x.price_promo_id) AS promo
      FROM bookings b
      LEFT JOIN LATERAL (SELECT r_ep.unit_price, r_ep.price_promo_id FROM reservations r_ep WHERE r_ep.activity_id = b.activity_id AND r_ep.deleted_at IS NULL AND r_ep.unit_price IS NOT NULL
             AND ((b.player_id IS NOT NULL AND r_ep.player_id = b.player_id) OR (COALESCE(b.phone, '') <> '' AND r_ep.phone = b.phone)) ORDER BY r_ep.id LIMIT 1) x ON true
     WHERE b.id IN (${bookingIds.map(n => Math.trunc(Number(n))).filter(Number.isFinite).join(',') || 0})
       AND COALESCE(b.unit_price, x.unit_price) IS NOT NULL`));
  for (const x of rowsOf(r)) out.set(Number(x.id), { price: Number(x.price), promoId: x.promo != null ? Number(x.promo) : null });
  return out;
}
export async function entryPriceForBooking(bookingId: number): Promise<number | null> {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql.raw(`SELECT ${entryPriceSql('b', 'a')} AS p FROM bookings b JOIN activities a ON a.id = b.activity_id WHERE b.id = ${Math.trunc(Number(bookingId)) || 0}`));
  const v = rowsOf(r)[0]?.p; return v == null ? null : Number(v);
}
/** للولاء: هل أخذ هذا الشخص السعر المبكّر في هذه الفعاليّة؟ (على الشخص لا على صفٍّ واحد) */
export async function hasEarlyPriceIn(activityId: number, playerId: number | null, phone: string | null): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const r: any = await db.execute(sql`
    SELECT 1 WHERE EXISTS (SELECT 1 FROM bookings WHERE activity_id = ${activityId} AND deleted_at IS NULL AND price_promo_id IS NOT NULL
                             AND (${playerId ? sql`player_id = ${playerId} OR` : sql``} ${phone ? sql`phone = ${phone}` : sql`false`}))
             OR EXISTS (SELECT 1 FROM reservations WHERE activity_id = ${activityId} AND deleted_at IS NULL AND price_promo_id IS NOT NULL
                             AND (${playerId ? sql`player_id = ${playerId} OR` : sql``} ${phone ? sql`phone = ${phone}` : sql`false`}))`);
  return rowsOf(r).length > 0;
}

// ══════════════════════════════════════════════════════
// 🔒 القفل
// ══════════════════════════════════════════════════════
async function lockPerson(resId: number, promoId: number, price: number, seats: number): Promise<void> {
  const db = getDB(); if (!db) return;
  const [r] = await db.select().from(reservations).where(eq(reservations.id, resId)).limit(1);
  if (!r) return;
  await db.update(reservations).set({ unitPrice: String(price), pricePromoId: promoId, promoSeats: seats, updatedAt: new Date() } as any).where(eq(reservations.id, resId));
  await db.execute(sql`UPDATE bookings SET unit_price = ${String(price)}, price_promo_id = ${promoId}
    WHERE activity_id = ${r.activityId} AND deleted_at IS NULL AND COALESCE(is_paid, false) = false AND COALESCE(offer_free, false) = false
      AND (${r.playerId ? sql`player_id = ${r.playerId} OR` : sql``} (COALESCE(${r.phone}, '') <> '' AND phone = ${r.phone}))`);
}
async function clearPerson(resId: number): Promise<void> {
  const db = getDB(); if (!db) return;
  const [r] = await db.select().from(reservations).where(eq(reservations.id, resId)).limit(1);
  if (!r) return;
  await db.update(reservations).set({ unitPrice: null, pricePromoId: null, promoSeats: null, updatedAt: new Date() } as any).where(eq(reservations.id, resId));
  await db.execute(sql`UPDATE bookings SET unit_price = NULL, price_promo_id = NULL
    WHERE activity_id = ${r.activityId} AND deleted_at IS NULL AND COALESCE(is_paid, false) = false
      AND (${r.playerId ? sql`player_id = ${r.playerId} OR` : sql``} (COALESCE(${r.phone}, '') <> '' AND phone = ${r.phone}))`);
}
/** يُقفل سعر عضو مجموعةٍ (صفّ حجزٍ بلا متابعة) — عرض المجموعة خسر المقارنة */
export async function lockBookingRow(bookingId: number, promoId: number, price: number): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.update(bookings).set({ unitPrice: String(price), pricePromoId: promoId } as any).where(and(eq(bookings.id, bookingId), eq(bookings.isPaid, false)));
}
export async function lockReservationSeats(resId: number, promoId: number, price: number, seats: number) { await lockPerson(resId, promoId, price, seats); }

export interface ApplyResult { applied: boolean; price?: number; base?: number; name?: string; deadline?: number; penalized?: { activityName: string; date: number } | null }
/**
 * حجزٌ جديد عبر الدون أو الأدمن: يُقفل السعر إن انطبق. وإن حجبه غيابٌ وحده يُستهلك
 * أقدم غياب على هذا الحجز (العقوبة = حرمانٌ من العرض في حجزٍ واحد).
 * يُنادى بعد إنشاء صفّ المتابعة (ومرآته إن وُجدت).
 */
export async function applyOnNewReservation(resId: number): Promise<ApplyResult> {
  const db = getDB(); if (!db) return { applied: false };
  try {
    const [r] = await db.select().from(reservations).where(eq(reservations.id, resId)).limit(1);
    if (!r || !r.activityId) return { applied: false };   // قائمة الانتظار تُقفل أيضاً: السعر لحظة الحجز لا لحظة تأكيد الإدارة
    const channel = channelOfTag(r.createdBy);
    if (channel !== 'bot' && channel !== 'admin') return { applied: false };
    const q = await earlyQuote({ activityId: r.activityId, phone: r.phone, playerId: r.playerId, channel, bookedAt: new Date(r.createdAt as any).getTime() });
    if (q.best) {
      await lockPerson(r.id, q.best.promoId, q.best.price, Math.max(1, Number(r.peopleCount || 1)));
      await db.update(reservations).set({ notes: sql`COALESCE(${reservations.notes}, '') || ${` · 💸 سعر الدون المبكّر ${jod(q.best.price)} (بدل ${jod(q.best.base)})`}` } as any).where(eq(reservations.id, r.id));
      invalidateEarlyCache();
      return { applied: true, price: q.best.price, base: q.best.base, name: q.best.name, deadline: q.best.deadline };
    }
    if (q.strikeBlocked) {
      const st = await activeStrikes(r.phone, r.playerId);
      if (st[0]) {
        await db.update(noShowStrikes).set({ status: 'consumed', consumedByReservationId: r.id, consumedAt: new Date() } as any).where(eq(noShowStrikes.id, st[0].id));
        await db.update(reservations).set({ notes: sql`COALESCE(${reservations.notes}, '') || ${` · ⛔ بالسعر العاديّ: غاب عن «${st[0].activity_name || ''}»`}` } as any).where(eq(reservations.id, r.id));
        return { applied: false, penalized: { activityName: String(st[0].activity_name || ''), date: new Date(st[0].activity_date || st[0].created_at).getTime() } };
      }
    }
    return { applied: false };
  } catch (e: any) { console.warn('⚠️ early applyOnNewReservation:', e?.message); return { applied: false }; }
}

/** يُستهلك أقدم غيابٍ قائم على حجزٍ بعينه (مسار المجموعات: حجبه الغياب عن السعر المبكّر) */
export async function consumeOneStrike(resId: number, phone: string | null | undefined, playerId: number | null | undefined): Promise<{ activityName: string } | null> {
  const db = getDB(); if (!db) return null;
  const st = await activeStrikes(phone, playerId);
  if (!st[0]) return null;
  await db.update(noShowStrikes).set({ status: 'consumed', consumedByReservationId: resId, consumedAt: new Date() } as any).where(eq(noShowStrikes.id, st[0].id));
  return { activityName: String(st[0].activity_name || '') };
}

/** تعديل العدد: المقاعد المضافة تُقيَّم لحظة التعديل (قرار ٧) */
export async function onPeopleChanged(resId: number, newPeople: number): Promise<void> {
  const db = getDB(); if (!db) return;
  try {
    const [r] = await db.select().from(reservations).where(eq(reservations.id, resId)).limit(1);
    if (!r || r.pricePromoId == null || !r.activityId) return;
    const q = await earlyQuote({ activityId: r.activityId, phone: r.phone, playerId: r.playerId, channel: channelOfTag(r.createdBy) === 'admin' ? 'admin' : 'bot', ignoreStrikes: true });
    const seats = Number(r.promoSeats ?? r.peopleCount ?? 1);
    const next = q.best ? newPeople : Math.min(seats, newPeople);
    await db.update(reservations).set({ promoSeats: next } as any).where(eq(reservations.id, resId));
  } catch (e: any) { console.warn('⚠️ early onPeopleChanged:', e?.message); }
}
/** النقل لفعاليّة أخرى: يُعاد التقييم لحظة النقل على الفعاليّة الجديدة (قرار ٧) */
export async function onReservationMoved(resId: number): Promise<void> {
  const db = getDB(); if (!db) return;
  try {
    const [r] = await db.select().from(reservations).where(eq(reservations.id, resId)).limit(1);
    if (!r || !r.activityId) return;
    const channel = channelOfTag(r.createdBy);
    const q = (channel === 'bot' || channel === 'admin')
      ? await earlyQuote({ activityId: r.activityId, phone: r.phone, playerId: r.playerId, channel, ignoreStrikes: true })
      : null;
    if (q?.best) await lockPerson(r.id, q.best.promoId, q.best.price, Math.max(1, Number(r.peopleCount || 1)));
    else if (r.pricePromoId != null) await clearPerson(r.id);
  } catch (e: any) { console.warn('⚠️ early onReservationMoved:', e?.message); }
}

// ══════════════════════════════════════════════════════
// 🚫 الغياب
// ══════════════════════════════════════════════════════
/** أوّلُ تفعيلٍ لأيّ عرض — لا يُحكم على غيابٍ قبله (لا عقوبة بأثرٍ رجعيّ على ما لم يُعلَن) */
async function judgingSince(): Promise<Date | null> {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql`SELECT MIN(activated_at) AS t FROM early_price_promos WHERE activated_at IS NOT NULL ${E2E_LOC ? sql`` : sql`AND created_by <> ${E2E_TAG}`}`);
  const t = rowsOf(r)[0]?.t; return t ? new Date(t) : null;
}
/** حجزٌ قائمٌ صنعه صاحبه أو سُجّل له بطلبه (للحكم بالغياب): الدون أو الأدمن عبر البوت مثبّتاً، أو ثبّته من التطبيق.
 *  إلغاء التطبيق يعيد المتابعة «غير مثبّتة» فيسقط من هنا — لا غياب على من ألغى. */
const OWN_TAGS_SQL = sql`(r.status IN ('confirmed', 'paid_all') AND (r.created_by IN (${BOT_SELF_TAG}, ${BOT_ADMIN_TAG}) OR r.app_confirmed = TRUE))`;
/** للإلغاء: أيّ حجزٍ ذاتيّ (يُنادى قبل أن يعيده التطبيق «غير مثبّت») */
const OWN_ANY_SQL = sql`(r.created_by IN (${BOT_SELF_TAG}, ${BOT_ADMIN_TAG}, 'player-app') OR r.app_confirmed = TRUE)`;

async function notifyStrike(s: { playerId: number | null; phone: string | null; activityName: string; kind: string }) {
  const title = s.kind === 'late_cancel' ? 'إلغاء متأخّر' : 'غياب عن حجزك';
  const body = s.kind === 'late_cancel'
    ? `ألغيت حجزك في «${s.activityName}» قبل اللعبة بأقلّ من ${LATE_CANCEL_HOURS} ساعات — حجزك الجاي عبر الدون بالسعر العاديّ.`
    : `حجزت في «${s.activityName}» وما حضرت — حجزك الجاي عبر الدون بالسعر العاديّ. إذا كنت موجود راسل الدون وبتراجعها الإدارة.`;
  if (s.playerId) {
    try { const { sendPushToPlayer } = await import('./fcm.service.js'); await sendPushToPlayer(s.playerId, title, body, 'no_show', { url: '/player/home' }); } catch { /* غير حاجب */ }
  }
  // واتساب: فقط إن كانت نافذته مفتوحة — لا نبدأ محادثة
  try {
    const db = getDB(); if (!db || !s.phone) return;
    const [conv] = await db.select().from(waConversations).where(eq(waConversations.phone, s.phone)).limit(1);
    if (!conv) return;
    const { sendMessage, isFreeWindowOpen } = await import('./whatsapp-inbox.service.js');
    if (!isFreeWindowOpen(conv as any)) return;
    await sendMessage({ conversationId: conv.id, text: `⚠️ ${body}`, source: 'system' }).catch(() => {});
  } catch { /* غير حاجب */ }
}

/** الحكم بالغياب فور نهاية الفعاليّة: من حجز بنفسه ولم يدخل الغرفة بحسابه ولا برقمه */
export async function judgeNoShows(activityId: number, opts?: { force?: boolean }): Promise<{ judged: boolean; strikes: number }> {
  const db = getDB(); if (!db) return { judged: false, strikes: 0 };
  try {
    const since = await judgingSince();
    const act = await actLite(activityId);
    if (!act || act.isTest) return { judged: false, strikes: 0 };
    if (!since || act.date < since.getTime()) {
      await db.update(activities).set({ noShowJudgedAt: new Date() } as any).where(eq(activities.id, activityId));
      return { judged: false, strikes: 0 };
    }
    if (!opts?.force) {
      // غرفةٌ أخرى للفعاليّة ما زالت مفتوحة ⟵ ننتظر آخرها (المتأخّر قد يدخلها)
      const open: any = await db.execute(sql`SELECT 1 FROM sessions WHERE activity_id = ${activityId} AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`);
      if (rowsOf(open).length) return { judged: false, strikes: 0 };
    }
    const ran: any = await db.execute(sql`SELECT 1 FROM sessions s JOIN matches m ON m.session_id = s.id WHERE s.activity_id = ${activityId} LIMIT 1`);
    if (!rowsOf(ran).length) {   // فعاليّة لم تجرِ فيها مباراة — لا غياب لأحد
      await db.update(activities).set({ noShowJudgedAt: new Date() } as any).where(eq(activities.id, activityId));
      return { judged: true, strikes: 0 };
    }
    const cand: any = await db.execute(sql`
      SELECT r.id, r.player_id, r.phone FROM reservations r
       WHERE r.activity_id = ${activityId} AND r.deleted_at IS NULL AND r.status <> 'waitlist'
         AND r.attended IS DISTINCT FROM TRUE AND ${OWN_TAGS_SQL}
         AND NOT EXISTS (
           SELECT 1 FROM session_players sp JOIN sessions s ON s.id = sp.session_id
            WHERE s.activity_id = r.activity_id
              AND ((r.player_id IS NOT NULL AND sp.player_id = r.player_id)
                OR (length(regexp_replace(COALESCE(r.phone,''), '[^0-9]', '', 'g')) >= 9
                    AND right(regexp_replace(COALESCE(sp.phone,''), '[^0-9]', '', 'g'), 9) = right(regexp_replace(COALESCE(r.phone,''), '[^0-9]', '', 'g'), 9))))`);
    let n = 0;
    for (const c of rowsOf(cand)) {
      const ph = normalizeLocalPhone(c.phone || '') || null;
      const ins: any = await db.execute(sql`
        INSERT INTO no_show_strikes (player_id, phone, activity_id, reservation_id, kind, status)
        VALUES (${c.player_id ?? null}, ${ph}, ${activityId}, ${c.id}, 'no_show', 'active')
        ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL DO NOTHING RETURNING id`);
      if (!rowsOf(ins).length) continue;
      n++;
      await db.execute(sql`UPDATE reservations SET attended = FALSE WHERE id = ${c.id} AND attended IS NULL`);
      void notifyStrike({ playerId: c.player_id ?? null, phone: ph, activityName: act.name, kind: 'no_show' });
    }
    await db.update(activities).set({ noShowJudgedAt: new Date() } as any).where(eq(activities.id, activityId));
    if (n) console.log(`🚫 early-price: ${n} no-show(s) for activity #${activityId}`);
    return { judged: true, strikes: n };
  } catch (e: any) { console.warn('⚠️ judgeNoShows:', e?.message); return { judged: false, strikes: 0 }; }
}

/**
 * إلغاء حجز: ما استهلكه من غيابٍ يعود قائماً (حجزٌ يُلغى لا يُسقط العقوبة)، وإلغاءُ
 * صاحبه بنفسه في آخر ٦ ساعات غياب (قرار ٤).
 */
export async function onReservationCancelled(resId: number, opts: { byCustomer: boolean }): Promise<void> {
  const db = getDB(); if (!db) return;
  try {
    await db.update(noShowStrikes).set({ status: 'active', consumedByReservationId: null, consumedAt: null } as any)
      .where(and(eq(noShowStrikes.consumedByReservationId, resId), eq(noShowStrikes.status, 'consumed')));
    if (!opts.byCustomer) return;
    const since = await judgingSince(); if (!since) return;
    const r: any = await db.execute(sql`
      SELECT r.id, r.player_id, r.phone, a.name, a.date FROM reservations r JOIN activities a ON a.id = r.activity_id
        LEFT JOIN locations l ON l.id = a.location_id
       WHERE r.id = ${resId} AND ${OWN_ANY_SQL} AND (COALESCE(l.is_test_location, false) = false ${E2E_LOC ? sql`OR l.id = ${E2E_LOC}` : sql``})`);
    const x = rowsOf(r)[0]; if (!x) return;
    const left = new Date(x.date).getTime() - Date.now();
    if (!(left > 0 && left < LATE_CANCEL_HOURS * H)) return;
    const ph = normalizeLocalPhone(x.phone || '') || null;
    const ins: any = await db.execute(sql`
      INSERT INTO no_show_strikes (player_id, phone, activity_id, reservation_id, kind, status)
      VALUES (${x.player_id ?? null}, ${ph}, (SELECT activity_id FROM reservations WHERE id = ${resId}), ${resId}, 'late_cancel', 'active')
      ON CONFLICT (reservation_id) WHERE reservation_id IS NOT NULL DO NOTHING RETURNING id`);
    if (rowsOf(ins).length) void notifyStrike({ playerId: x.player_id ?? null, phone: ph, activityName: String(x.name), kind: 'late_cancel' });
  } catch (e: any) { console.warn('⚠️ early onReservationCancelled:', e?.message); }
}

/** «حضر»: يُلغى الغياب، ويعود السعر المبكّر إلى الحجز الذي استهلكه إن لم يُدفع (قرار ٥) */
export async function waiveStrikes(where: { reservationId?: number; strikeId?: number }, by: string): Promise<{ waived: number; restored: number }> {
  const db = getDB(); if (!db) return { waived: 0, restored: 0 };
  const cond = where.strikeId ? eq(noShowStrikes.id, where.strikeId) : where.reservationId ? eq(noShowStrikes.reservationId, where.reservationId) : null;
  if (!cond) return { waived: 0, restored: 0 };
  const rows = await db.select().from(noShowStrikes).where(and(cond, inArray(noShowStrikes.status, ['active', 'consumed'])));
  let restored = 0;
  for (const s of rows) {
    await db.update(noShowStrikes).set({ status: 'waived', waivedBy: by, waivedAt: new Date() } as any).where(eq(noShowStrikes.id, s.id));
    if (s.reservationId) await db.update(reservations).set({ attended: true } as any).where(and(eq(reservations.id, s.reservationId), sql`${reservations.attended} IS DISTINCT FROM TRUE`)).catch(() => {});
    if (s.status === 'consumed' && s.consumedByReservationId) {
      const [c] = await db.select().from(reservations).where(and(eq(reservations.id, s.consumedByReservationId), isNull(reservations.deletedAt))).limit(1);
      if (c && c.activityId && c.pricePromoId == null) {
        const q = await earlyQuote({ activityId: c.activityId, phone: c.phone, playerId: c.playerId, channel: channelOfTag(c.createdBy), bookedAt: new Date(c.createdAt as any).getTime(), ignoreStrikes: true });
        if (q.best && q.act && q.act.date > Date.now()) { await lockPerson(c.id, q.best.promoId, q.best.price, Math.max(1, Number(c.peopleCount || 1))); restored++; }
      }
    }
  }
  if (rows.length) console.log(`✅ early-price: waived ${rows.length} strike(s) by ${by}${restored ? ` · restored ${restored} price(s)` : ''}`);
  return { waived: rows.length, restored };
}
export async function strikesForActivity(activityId: number): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  const r: any = await db.execute(sql`
    SELECT s.id, s.kind, s.status, s.player_id, s.phone, s.reservation_id, s.created_at, s.waived_by, s.waived_at, s.consumed_at,
           r.contact_name AS name, r.people_count AS people, r.created_by, ca.name AS consumed_in
      FROM no_show_strikes s LEFT JOIN reservations r ON r.id = s.reservation_id
      LEFT JOIN reservations cr ON cr.id = s.consumed_by_reservation_id LEFT JOIN activities ca ON ca.id = cr.activity_id
     WHERE s.activity_id = ${activityId} ORDER BY s.id`);
  return rowsOf(r).map((x: any) => ({ id: Number(x.id), kind: x.kind, status: x.status, playerId: x.player_id, phone: x.phone, reservationId: x.reservation_id,
    name: x.name || '', people: Number(x.people || 1), channel: channelOfTag(x.created_by), createdAt: x.created_at, waivedBy: x.waived_by, waivedAt: x.waived_at, consumedAt: x.consumed_at, consumedIn: x.consumed_in }));
}

/** مجدولٌ احتياطيّ: فعاليّةٌ انتهت ولم تُغلق غرفها ⟵ يُحكم بعد ٨ ساعات من موعدها */
let jobs = false;
export function startEarlyPriceJobs(): void {
  if (jobs) return; jobs = true;
  const tick = async () => {
    const db = getDB(); if (!db) return;
    try {
      const since = await judgingSince(); if (!since) return;
      const r: any = await db.execute(sql`
        SELECT a.id FROM activities a LEFT JOIN locations l ON l.id = a.location_id
         WHERE a.no_show_judged_at IS NULL AND a.deleted_at IS NULL AND a.date >= ${since}
           AND a.date < NOW() - INTERVAL '8 hours' AND a.date > NOW() - INTERVAL '4 days'
           AND COALESCE(l.is_test_location, false) = false`);
      for (const x of rowsOf(r)) await judgeNoShows(Number(x.id), { force: true });
    } catch (e: any) { console.warn('⚠️ early-price job:', e?.message); }
  };
  setTimeout(() => { void tick(); }, 90e3);
  setInterval(() => { void tick(); }, 30 * 60e3);
}

// ══════════════════════════════════════════════════════
// ▶️ التفعيل (بأثرٍ رجعيّ بمعاينة — قرار المالك ٧)
// ══════════════════════════════════════════════════════
export async function activationPreview(promoId: number): Promise<any> {
  const db = getDB(); if (!db) return { rows: [] };
  const [row] = await db.select().from(earlyPricePromos).where(and(eq(earlyPricePromos.id, promoId), isNull(earlyPricePromos.deletedAt))).limit(1);
  if (!row) return { error: 'العرض غير موجود' };
  const p = { ...toPromo(row), status: 'live' as const };
  const now = Date.now();
  const r: any = await db.execute(sql`
    SELECT r.id, r.activity_id, r.contact_name, r.phone, r.player_id, r.people_count, r.created_by, r.created_at,
           EXISTS (SELECT 1 FROM bookings b WHERE b.activity_id = r.activity_id AND b.deleted_at IS NULL AND b.is_paid AND COALESCE(b.paid_amount, 0) > 0
                     AND ((r.player_id IS NOT NULL AND b.player_id = r.player_id) OR b.phone = r.phone)) AS paid
      FROM reservations r JOIN activities a ON a.id = r.activity_id
     WHERE r.deleted_at IS NULL AND r.status <> 'waitlist' AND r.price_promo_id IS NULL
       AND r.created_by IN (${BOT_SELF_TAG}, ${BOT_ADMIN_TAG}) AND a.date > NOW() AND a.deleted_at IS NULL
     ORDER BY a.date, r.id`);
  const rows: any[] = [];
  for (const x of rowsOf(r)) {
    const a = await actLite(Number(x.activity_id)); if (!a) continue;
    const v = judgeEarly(p, a, { now, bookedAt: new Date(x.created_at).getTime(), channel: channelOfTag(x.created_by), strikes: 0, freeAccount: await isFreeAccount(x.player_id), retro: true });
    if (!v.ok) continue;
    rows.push({
      reservationId: Number(x.id), activityId: a.id, activityName: a.name, activityDate: new Date(a.date), name: x.contact_name, phone: x.phone,
      people: Number(x.people_count || 1), from: v.base, to: v.price, paid: !!x.paid, losesStamp: !!x.player_id && !x.paid,
      bookedHoursBefore: Math.round((a.date - new Date(x.created_at).getTime()) / H),
    });
  }
  const apply = rows.filter(x => !x.paid);
  return {
    promo: { id: p.id, name: p.name }, rows,
    summary: { apply: apply.length, seats: apply.reduce((s, x) => s + x.people, 0), losesStamp: apply.filter(x => x.losesStamp).length, paidSkipped: rows.length - apply.length,
      foregone: round2(apply.reduce((s, x) => s + (x.from - x.to) * x.people, 0)) },
  };
}
export async function activate(promoId: number, by: string, applyRetro: boolean): Promise<{ ok: boolean; error?: string; applied?: number; notified?: number }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [row] = await db.select().from(earlyPricePromos).where(and(eq(earlyPricePromos.id, promoId), isNull(earlyPricePromos.deletedAt))).limit(1);
  if (!row) return { ok: false, error: 'العرض غير موجود' };
  const pv = applyRetro ? await activationPreview(promoId) : { rows: [] };
  await db.update(earlyPricePromos).set({ status: 'live', activatedAt: row.activatedAt || new Date(), updatedAt: new Date() } as any).where(eq(earlyPricePromos.id, promoId));
  invalidateEarlyCache();
  let applied = 0; const toNotify: any[] = [];
  for (const x of (pv.rows || []).filter((y: any) => !y.paid)) {
    await lockPerson(x.reservationId, promoId, x.to, x.people);
    await db.update(reservations).set({ notes: sql`COALESCE(${reservations.notes}, '') || ${` · 💸 سعر الدون المبكّر بأثرٍ رجعيّ (${by})`}` } as any).where(eq(reservations.id, x.reservationId));
    applied++; toNotify.push(x);
  }
  // إبلاغُ من نافذته مفتوحة فقط، وإشعارُ التطبيق لصاحب الحساب
  let notified = 0;
  (async () => {
    const { sendMessage, isFreeWindowOpen } = await import('./whatsapp-inbox.service.js');
    for (const x of toNotify) {
      const text = `💸 حجزك على «${x.activityName}» صار بـ${jod(x.to)} للشخص بدل ${jod(x.from)} — سعر الدون المبكّر لأنّك حجزت بكّير 🎭${x.losesStamp ? '\nℹ️ بالسعر المبكّر ما بتنحسب هالزيارة ختم ولاء.' : ''}`;
      try {
        const [conv] = await db.select().from(waConversations).where(eq(waConversations.phone, x.phone)).limit(1);
        if (conv && isFreeWindowOpen(conv as any)) { await sendMessage({ conversationId: conv.id, text: text + OPTOUT_FOOTER, source: 'system' }); notified++; await new Promise(r => setTimeout(r, PACE_MS)); }
      } catch { /* نافذة مغلقة */ }
    }
  })().catch(() => {});
  console.log(`💸 early-price #${promoId} activated by ${by} · retro applied ${applied}`);
  return { ok: true, applied, notified };
}

// ══════════════════════════════════════════════════════
// 🛠️ تدخّلُ الأدمن على حجزٍ بعينه (قرار ٨) — يُسجَّل في سجلّ الموظّفين
// ══════════════════════════════════════════════════════
export async function setBookingEarly(bookingId: number, on: boolean): Promise<{ ok: boolean; error?: string; price?: number }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [b] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), isNull(bookings.deletedAt))).limit(1);
  if (!b) return { ok: false, error: 'الحجز غير موجود' };
  if (b.isPaid && Number(b.paidAmount || 0) > 0) return { ok: false, error: 'الحجز مدفوع — عدّل المبلغ من نافذة الدفع' };
  const [r] = await db.select().from(reservations).where(and(eq(reservations.activityId, b.activityId), isNull(reservations.deletedAt),
    sql`(${b.playerId ? sql`${reservations.playerId} = ${b.playerId} OR` : sql``} (COALESCE(${b.phone}, '') <> '' AND ${reservations.phone} = ${b.phone}))`)).limit(1);
  if (!on) {
    await db.update(bookings).set({ unitPrice: null, pricePromoId: null } as any).where(eq(bookings.id, b.id));
    if (r) await db.update(reservations).set({ unitPrice: null, pricePromoId: null, promoSeats: null, updatedAt: new Date() } as any).where(eq(reservations.id, r.id));
    return { ok: true };
  }
  const a = await actLite(b.activityId); if (!a) return { ok: false, error: 'الفعاليّة غير موجودة' };
  const ps = (await livePromos()).filter(p => !inScope(p, a) && a.date >= p.actFrom && a.date <= p.actUntil);
  if (!ps.length) return { ok: false, error: 'لا عرض سعرٍ مبكّر فعّال على هذه الفعاليّة' };
  const p = ps.sort((x, y) => promoPrice(x, a.price) - promoPrice(y, a.price))[0];
  const price = promoPrice(p, a.price);
  await db.update(bookings).set({ unitPrice: String(price), pricePromoId: p.id } as any).where(eq(bookings.id, b.id));
  if (r) await db.update(reservations).set({ unitPrice: String(price), pricePromoId: p.id, promoSeats: Math.max(1, Number(r.peopleCount || 1)), updatedAt: new Date() } as any).where(eq(reservations.id, r.id));
  return { ok: true, price };
}

// ══════════════════════════════════════════════════════
// 📣 الإعلان والحقائق للبوت
// ══════════════════════════════════════════════════════
async function openActs(p: PromoLike, now: number): Promise<ActLite[]> {
  const db = getDB(); if (!db) return [];
  const r: any = await db.execute(sql`
    SELECT a.id FROM activities a LEFT JOIN locations l ON l.id = a.location_id
     WHERE a.deleted_at IS NULL AND a.status IN ('planned', 'active') AND a.date > NOW()
       AND a.date >= ${new Date(p.actFrom)} AND a.date <= ${new Date(p.actUntil)}
       AND (COALESCE(l.is_test_location, false) = false ${E2E_LOC ? sql`OR l.id = ${E2E_LOC}` : sql``})
     ORDER BY a.date LIMIT 30`);
  const out: ActLite[] = [];
  for (const x of rowsOf(r)) {
    const a = await actLite(Number(x.id)); if (!a) continue;
    const v = judgeEarly(p, a, { now, bookedAt: now, channel: 'bot', strikes: 0 });
    if (v.ok) out.push(a);
  }
  return out;
}
async function cityNameMap(): Promise<Map<number, string>> {
  try { const { cityMap } = await import('./cities.service.js'); return new Map([...(await cityMap()).entries()].map(([id, c]: any) => [Number(id), c.name])); } catch { return new Map(); }
}
export async function earlyFactsLines(now = Date.now()): Promise<string[]> {
  const out: string[] = [];
  for (const p of await livePromos()) {
    const acts = await openActs(p, now); if (!acts.length) continue;
    out.push(`- 💸 «${p.name}» (عرض سعر مبكّر): الحجز عبرك (أو بتسجيل الأدمن) قبل اللعبة بـ${p.leadHours} ساعة على الأقلّ ⟵ ${acts.map(a => `${a.name} (activity ${a.id}): ${jod(promoPrice(p, a.price))} بدل ${jod(a.price)} حتّى ${fmtWhen(deadlineOf(p, a))}`).join('، ')}.`
      + ` كلّ مقعدٍ في الحجز يأخذه. من يأخذه لا تُحتسب زيارته ختم ولاء. غيابٌ سابق يحرمه في حجزٍ واحد. الأرقام تأتيك من get_booking_cost — لا تحسب بنفسك.`);
  }
  return out;
}
/** إعلانٌ مرّةً لكلّ محادثة لكلّ عرض (مفتاح 'ep:<id>' في offers_announced)، مُصفّى بمدينة اللاعب */
export async function earlyAnnouncementFor(conv: any, now = Date.now()): Promise<{ text: string; keys: string[] } | null> {
  const done: Record<string, any> = (conv.offersAnnounced && typeof conv.offersAnnounced === 'object') ? conv.offersAnnounced : {};
  let cityId: number | null = null;
  if (conv.playerId) { try { const { getOrInferHomeCity } = await import('./season.service.js'); cityId = await getOrInferHomeCity(conv.playerId); } catch { /* الكلّ */ } }
  const names = await cityNameMap();
  const parts: string[] = []; const keys: string[] = [];
  for (const p of await livePromos()) {
    const key = `ep:${p.id}`;
    if (done[key]) continue;
    const row = (await promoRows()).find(r => Number(r.id) === p.id);
    if (!row?.announce) continue;
    let acts = await openActs(p, now);
    if (cityId) acts = acts.filter(a => a.cityId == null || Number(a.cityId) === Number(cityId));
    if (!acts.length) continue;
    keys.push(key);
    const custom = String(row.announceText || '').trim();
    const ex = acts[0];
    parts.push(custom || `💸 ${p.name}: احجز عن طريقي قبل اللعبة بـ${p.leadHours} ساعة على الأقلّ وادخل بـ${jod(promoPrice(p, ex.price))} بدل ${jod(ex.price)} — على ${scopeText(p, names)} لحدّ ${fmtWhen(p.actUntil, false)}. أقرب فعاليّة: ${ex.name}، والسعر المبكّر فيها لحدّ ${fmtWhen(deadlineOf(p, ex))}.`);
  }
  return parts.length ? { text: parts.join('\n\n'), keys } : null;
}
export async function markEarlyAnnounced(convId: number, keys: string[]): Promise<void> {
  const db = getDB(); if (!db || !keys.length) return;
  const patch: Record<string, string> = {}; for (const k of keys) patch[k] = new Date().toISOString();
  await db.update(waConversations).set({ offersAnnounced: sql`COALESCE(${waConversations.offersAnnounced}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` } as any)
    .where(eq(waConversations.id, convId));
}

// ══════════════════════════════════════════════════════
// ✍️ الإدارة
// ══════════════════════════════════════════════════════
export interface PromoInput {
  name: string; mode: 'fixed' | 'off'; value: number; leadHours: number; actFrom: string | Date; actUntil: string | Date;
  scope: 'all' | 'cities' | 'acts'; cityIds?: number[]; activityIds?: number[]; excludeIds?: number[]; announce?: boolean; announceText?: string;
}
export async function validatePromo(i: PromoInput): Promise<string | null> {
  const name = String(i.name || '').trim();
  if (name.length < 2 || name.length > 120) return 'الاسم مطلوب (٢–١٢٠ حرفاً)';
  if (!['fixed', 'off'].includes(i.mode)) return 'شكل السعر غير معروف';
  const v = Number(i.value);
  if (!(v > 0 && v <= 50)) return 'القيمة بين ٠ و٥٠ د.أ';
  const lead = Number(i.leadHours);
  if (!(Number.isInteger(lead) && lead >= 1 && lead <= 168)) return 'المهلة بين ١ و١٦٨ ساعة';
  const f = new Date(i.actFrom).getTime(), u = new Date(i.actUntil).getTime();
  if (!isFinite(f) || !isFinite(u) || u <= f) return 'نهاية الفترة يجب أن تكون بعد بدايتها';
  if (!['all', 'cities', 'acts'].includes(i.scope)) return 'النطاق غير معروف';
  if (i.scope === 'cities' && !ids(i.cityIds).length) return 'اختر مدينةً واحدة على الأقلّ';
  if (i.scope === 'acts' && !ids(i.activityIds).length) return 'اختر فعاليّةً واحدة على الأقلّ';
  return null;
}
export function promoValues(i: PromoInput) {
  return {
    name: String(i.name).trim(), mode: i.mode, value: String(Number(i.value)), leadHours: Number(i.leadHours),
    actFrom: new Date(i.actFrom), actUntil: new Date(i.actUntil), scope: i.scope,
    cityIds: [...new Set(ids(i.cityIds))], activityIds: [...new Set(ids(i.activityIds))], excludeIds: [...new Set(ids(i.excludeIds))],
    announce: i.announce !== false, announceText: String(i.announceText || '').slice(0, 900),
  };
}
export async function promoStats(promoId: number): Promise<any> {
  const db = getDB(); if (!db) return {};
  const r: any = await db.execute(sql`
    SELECT COUNT(*)::int AS reservations, COALESCE(SUM(COALESCE(r.promo_seats, r.people_count, 1)), 0)::int AS seats,
           COALESCE(SUM(COALESCE(r.promo_seats, r.people_count, 1) * (a.base_price - r.unit_price)), 0) AS foregone
      FROM reservations r JOIN activities a ON a.id = r.activity_id
     WHERE r.price_promo_id = ${promoId} AND r.deleted_at IS NULL`);
  const x = rowsOf(r)[0] || {};
  return { reservations: Number(x.reservations || 0), seats: Number(x.seats || 0), foregone: round2(Number(x.foregone || 0)) };
}
