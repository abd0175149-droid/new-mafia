// ══════════════════════════════════════════════════════
// 💸 المال والعروض والختم على صفوف «متابعة الحجوزات» — قراءةٌ فقط
// ══════════════════════════════════════════════════════
// خطّة توحيد الحجز، م١ب: المالك يعمل من المتابعة وحدها، وكانت لا ترى سعراً ولا
// دفعاً ولا عرضاً ولا ختماً — كلّها في صفحة الفعاليّة. هنا تُلحق بكلّ صفّ متابعة،
// كما تُلحق علامات الواتساب وحالة المتابعة، من المصادر نفسها التي تقرؤها صفحة
// الفعاليّة: صفّ الحجز المرتبط (الدفع والمجّانيّ والولاء) وسعر دخوله (entryPriceSql:
// المقفول وإلّا سعر الفعاليّة)، ومجموعات العروض، وحكم الختم (judgeBooking نفسه).
// لا كتابة هنا إطلاقاً.
//
// المرافقون بلا صفّ مال حتّى م٥ (مقعدٌ لكلّ شخص)، فيُقدَّر حقّهم بسعر الفعاليّة
// (أو السعر المقفول على مقاعد العرض) ويظهر منفصلاً عن «المتوقَّع» الرسميّ.

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const r2 = (x: number) => Math.round(x * 100) / 100;
const ids = (xs: number[]) => [...new Set(xs.map((n) => Math.trunc(Number(n))).filter((n) => Number.isFinite(n) && n > 0))];

export type FollowChannel = 'app' | 'bot' | 'botadmin' | 'group' | 'door' | 'staff';
/** القناة من «أُنشئ بواسطة» — الاستنتاج النصّيّ مؤقّت حتّى عمود القناة الصريح في م٢ */
export function channelOfCreatedBy(by: string | null | undefined): FollowChannel {
  const t = String(by || '');
  if (t === 'player-app') return 'app';
  if (t.startsWith('🤖')) return 'bot';
  if (t.startsWith('🔒')) return 'botadmin';
  if (t.startsWith('👥')) return 'group';
  if (t.includes('Auto-Sync')) return 'door';
  return 'staff';
}

export interface RowMoney {
  channel: FollowChannel;
  base: number;                 // سعر الفعاليّة
  unit: number;                 // سعر صاحب الحجز (المقفول وإلّا سعر الفعاليّة، و٠ للمجّانيّ)
  people: number;
  ownerDue: number;             // ما على صاحب الحجز غير مدفوع
  companionsDue: number;        // تقدير حقّ المرافقين (بلا صفّ مال حتّى م٥)
  total: number;                // صاحب الحجز + المرافقون
  pay: 'paid' | 'free' | 'unpaid' | 'none';   // none = لا صفّ حجز بعد (غير مثبّت)
  paidAmount: number;
  freeReason: 'loyalty' | 'freeacc' | 'group' | 'other' | null;
  offers: Array<{ k: 'early' | 'group' | 'loyalty' | 'freeacc'; label: string }>;
  stamp: { k: 'stamped' | 'eligible' | 'promo' | 'channel' | 'late' | 'noaccount' | 'location'; label: string } | null;
}

export interface ActivityMoney {
  base: number;
  expected: number;             // غير المدفوع من صفوف الحجز بسعر دخولها — رقم صفحة الفعاليّة نفسه
  collected: number;            // المدفوع المسجَّل
  free: number; freeReasons: Record<string, number>;
  earlySeats: number;           // صفوف حجزٍ بسعرٍ مقفول
  companionsDue: number;        // م٥: حقّ المقاعد بلا صفّ مال (أصدقاء بلا حساب ومرافقون) غير المدفوع
  seatsPaid: number;            // م٥: المدفوع على تلك المقاعد
  groups: number; strikes: number;
}

interface Ctx {
  acts: Map<number, { base: number; date: Date; locationId: number | null; isTest: boolean }>;
  bks: any[];
  byAct: Map<number, Map<string, any>>;
  groups: Map<number, any>;
  freeAcc: Set<number>;
  stamped: Set<string>;
  cfg: any | null;
}

async function load(activityIds: number[], playerIds: number[]): Promise<Ctx | null> {
  const db = getDB(); if (!db || !activityIds.length) return null;
  const A = ids(activityIds).join(',');
  const { entryPriceSql } = await import('./early-price.service.js');
  const acts = new Map<number, any>();
  for (const a of rowsOf(await db.execute(sql.raw(`
    SELECT a.id, a.base_price, a.date, a.location_id, COALESCE(l.is_test_location, false) AS is_test
      FROM activities a LEFT JOIN locations l ON l.id = a.location_id WHERE a.id IN (${A})`))))
    acts.set(Number(a.id), { base: Number(a.base_price) || 0, date: new Date(a.date), locationId: a.location_id != null ? Number(a.location_id) : null, isTest: !!a.is_test });
  const bks = rowsOf(await db.execute(sql.raw(`
    SELECT b.id, b.activity_id, b.player_id, b.phone, COALESCE(b.count, 1) AS count, b.is_paid, b.is_free, b.paid_amount,
           b.price_promo_id, b.loyalty_reward_id, COALESCE(b.offer_free, false) AS offer_free, b.created_at, b.created_by,
           ${entryPriceSql('b', 'a')} AS price
      FROM bookings b JOIN activities a ON a.id = b.activity_id
     WHERE b.activity_id IN (${A}) AND b.deleted_at IS NULL ORDER BY b.id`)));
  // مفتاح المطابقة: الحساب أو الرقم المطبَّع — كما تُطابق المرآة صفّ المتابعة بصفّ الحجز
  const byAct = new Map<number, Map<string, any>>();
  for (const b of bks) {
    const m = byAct.get(Number(b.activity_id)) || new Map<string, any>();
    if (b.player_id && !m.has(`p:${b.player_id}`)) m.set(`p:${b.player_id}`, b);
    const ph = normalizeLocalPhone(String(b.phone || ''));
    if (ph && !m.has(`t:${ph}`)) m.set(`t:${ph}`, b);
    byAct.set(Number(b.activity_id), m);
  }
  const groups = new Map<number, any>();
  for (const g of rowsOf(await db.execute(sql.raw(`
    SELECT id, reservation_id, promised_free, settled_free, status, terms->>'name' AS name
      FROM booking_groups WHERE activity_id IN (${A}) AND status <> 'void' AND reservation_id IS NOT NULL`))))
    groups.set(Number(g.reservation_id), g);
  const P = ids([...playerIds, ...bks.map((b) => Number(b.player_id))]);
  const freeAcc = new Set<number>();
  const stamped = new Set<string>();
  if (P.length) {
    for (const p of rowsOf(await db.execute(sql.raw(`SELECT id FROM players WHERE id IN (${P.join(',')}) AND is_free_account = true`)))) freeAcc.add(Number(p.id));
    for (const s of rowsOf(await db.execute(sql.raw(`SELECT player_id, activity_id FROM loyalty_stamps WHERE activity_id IN (${A}) AND player_id IN (${P.join(',')}) AND voided_at IS NULL`)))) stamped.add(`${s.player_id}:${s.activity_id}`);
  }
  let cfg: any = null;
  try { const { getLoyaltyConfig } = await import('./loyalty.service.js'); const c = await getLoyaltyConfig(); cfg = c.enabled ? c : null; } catch { /* بلا ولاء */ }
  return { acts, bks, byAct, groups, freeAcc, stamped, cfg };
}

function freeReasonOf(b: any, freeAcc: Set<number>): RowMoney['freeReason'] {
  if (!b?.is_free) return null;
  if (b.loyalty_reward_id) return 'loyalty';
  if (b.offer_free) return 'group';
  if (b.player_id && freeAcc.has(Number(b.player_id))) return 'freeacc';
  return 'other';
}

async function stampOf(ctx: Ctx, r: any, b: any): Promise<RowMoney['stamp']> {
  if (!ctx.cfg) return null;
  const A = ctx.acts.get(Number(r.activityId));
  if (!A) return null;
  if (!r.playerId) return { k: 'noaccount', label: 'بلا حساب' };
  if (ctx.stamped.has(`${r.playerId}:${r.activityId}`)) return { k: 'stamped', label: 'خُتم ✓' };
  const { isLocationEnabled, judgeBooking } = await import('./loyalty.service.js');
  if (A.isTest || !isLocationEnabled(ctx.cfg, A.locationId)) return { k: 'location', label: 'لا ختم: المكان' };
  if (!b) return null;   // غير مثبّت بعد: لا حكم قبل صفّ الحجز
  const lead = (A.date.getTime() - new Date(b.created_at).getTime()) / 3600e3;
  const early = b.price_promo_id != null || r.pricePromoId != null || r.unitPrice != null;
  const by = String(b.created_by || '');
  const v = judgeBooking(ctx.cfg, { bookingId: Number(b.id), createdAt: new Date(b.created_at), createdBy: by, leadHours: Math.round(lead * 10) / 10, isApp: by === 'player-app', isBot: by.startsWith('🤖') || by.startsWith('🔒'), earlyPrice: early });
  if (v.ok) return { k: 'eligible', label: 'ختمٌ إن لعب' };
  if (v.verdict === 'promo') return { k: 'promo', label: 'لا ختم: سعر مبكّر' };
  if (v.verdict === 'late') return { k: 'late', label: `لا ختم: حُجز قبل أقلّ من ${ctx.cfg.minLeadHours} ساعات` };
  return { k: 'channel', label: 'لا ختم: حجز موظّف' };
}

/** يُلحق `money` بكلّ صفّ متابعة. لا يرمي: الحقل تكميليّ كبقيّة العلامات. */
export async function attachMoney(rows: any[]): Promise<void> {
  const live = rows.filter((r) => r && r.activityId);
  if (!live.length) return;
  const ctx = await load(live.map((r) => Number(r.activityId)), live.map((r) => Number(r.playerId)));
  if (!ctx) return;
  const { reservationTotal } = await import('./early-price.service.js');
  for (const r of live) {
    const A = ctx.acts.get(Number(r.activityId)); if (!A) continue;
    const m = ctx.byAct.get(Number(r.activityId));
    const ph = normalizeLocalPhone(String(r.phone || ''));
    const b = (r.playerId && m?.get(`p:${r.playerId}`)) || (ph && m?.get(`t:${ph}`)) || null;
    const people = Math.max(1, Number(r.peopleCount) || 1);
    const lock = { unitPrice: r.unitPrice != null ? Number(r.unitPrice) : null, promoSeats: r.promoSeats != null ? Number(r.promoSeats) : null };
    const ownerLocked = lock.unitPrice != null && (lock.promoSeats == null || lock.promoSeats >= 1) ? lock.unitPrice : A.base;
    const ownerPrice = b ? Number(b.price) : ownerLocked;
    const fr = freeReasonOf(b, ctx.freeAcc);
    const unit = fr ? 0 : ownerPrice;
    // المرافقون: مجموعُ الحجز بسعر العرض على مقاعده، ناقصاً حصّة صاحبه
    const companionsDue = people > 1 ? r2(reservationTotal(people, A.base, lock) - ownerLocked) : 0;
    const pay: RowMoney['pay'] = !b ? 'none' : fr ? 'free' : b.is_paid ? 'paid' : 'unpaid';
    const ownerDue = pay === 'unpaid' ? r2(unit * Math.max(1, Number(b.count) || 1)) : pay === 'none' ? unit : 0;
    const offers: RowMoney['offers'] = [];
    if (lock.unitPrice != null || b?.price_promo_id != null) offers.push({ k: 'early', label: `مبكّر ${lock.unitPrice ?? ownerPrice}` });
    const g = ctx.groups.get(Number(r.id));
    if (g) {
      const settled = g.settled_free != null;
      offers.push({ k: 'group', label: `${g.name || 'مجموعة'} · ${settled ? `حُسم ${g.settled_free}` : `${g.promised_free || 0} مجّانيّ موعود`}` });
    }
    if (fr === 'loyalty') offers.push({ k: 'loyalty', label: 'زيارة الولاء' });
    if (fr === 'freeacc') offers.push({ k: 'freeacc', label: 'حساب مجّانيّ' });
    r.money = {
      // م٨: القناة من العمود الصريح (م٢-أ)؛ الوسم النصّيّ احتياطٌ لصفٍّ بلا قناة
      channel: (['app', 'bot', 'botadmin', 'group', 'door', 'staff'].includes(String((r as any).channel)) ? (r as any).channel : channelOfCreatedBy(r.createdBy)) as FollowChannel, base: A.base, unit: r2(unit), people,
      ownerDue, companionsDue, total: r2(unit + companionsDue), pay,
      paidAmount: b && b.is_paid ? r2(Number(b.paid_amount) || 0) : 0, freeReason: fr, offers,
      stamp: await stampOf(ctx, r, b),
    } satisfies RowMoney;
  }
}

/** رأس الفعاليّة في المتابعة — الأرقام نفسها التي تحسبها صفحة الفعاليّة من صفوف الحجز */
export async function activityMoney(activityId: number): Promise<ActivityMoney | null> {
  const db = getDB(); if (!db) return null;
  const actId = Math.trunc(Number(activityId)); if (!actId) return null;
  const resRows = rowsOf(await db.execute(sql`
    SELECT id, player_id AS "playerId", phone, people_count AS "peopleCount", unit_price AS "unitPrice", promo_seats AS "promoSeats", status
      FROM reservations WHERE activity_id = ${actId} AND deleted_at IS NULL AND status <> 'waitlist'`));
  const ctx = await load([actId], resRows.map((r) => Number(r.playerId)));
  if (!ctx) return null;
  const A = ctx.acts.get(actId); if (!A) return null;
  let expected = 0, collected = 0, free = 0, earlySeats = 0;
  const freeReasons: Record<string, number> = {};
  for (const b of ctx.bks) {
    const n = Math.max(1, Number(b.count) || 1);
    const fr = freeReasonOf(b, ctx.freeAcc);
    if (fr) { free += n; freeReasons[fr] = (freeReasons[fr] || 0) + n; continue; }
    if (b.is_paid) collected += Number(b.paid_amount) || 0;
    else expected += n * (Number(b.price) || 0);
    if (Number(b.price) !== A.base) earlySeats += n;
  }
  // 🪑 م٥: المقاعد بلا صفّ مال من المقاعد نفسها (كان تقديراً يحسب أصحاب الحسابات مرّتين)
  const { dueWithoutRows } = await import('./seats.service.js');
  const sd = await dueWithoutRows(actId);
  const companionsDue = sd.due;
  const g: any = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS n FROM booking_groups WHERE activity_id = ${actId} AND status <> 'void'`))[0];
  let strikes = 0;
  try { strikes = Number(rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS n FROM no_show_strikes WHERE activity_id = ${actId}`))[0]?.n || 0); } catch { /* بلا جدول */ }
  return { base: A.base, expected: r2(expected), collected: r2(collected), free, freeReasons, earlySeats, companionsDue: r2(companionsDue), seatsPaid: sd.paid, groups: Number(g?.n || 0), strikes };
}
