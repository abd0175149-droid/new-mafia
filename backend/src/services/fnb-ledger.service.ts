// ══════════════════════════════════════════════════════
// 💰 دفتر المكان — F&B Ledger (إعادة بناء الكونسول 2026-10-30)
//
// نموذج المال (قرارات المالك المقفلة 2026-10-30):
//   • الطلبات وفروق الخيارات وتكملة الحدّ الأدنى والماء ⟵ للمكان كاملةً.
//   • دخوليّة اللعبة ⟵ للنادي (وخصم مشروب الولاء على حسابه). حصّة النادي من المنيو صفر.
//   • ما في صندوق المكان = الفواتير المحصّلة = للمكان + للنادي.
//   • باقٍ على المكان للنادي = دخوليّاتٌ حصّلها − ما سلّمه (تراكميّ، لا يتبع الفترة).
//   • لم يُحصَّل = فواتير مفتوحة + طلباتٌ بلا فاتورة + تكملة من لعب ولم يُفوتَر.
//
// المصدر الوحيد لكلّ رقم: لقطات order_invoices المحصّلة، والحساب الحيّ للجزء المفتوح
// بنفس قواعد buildInvoiceData — فما يراه الكاشير سطراً هو ما يجمعه «الحساب».
// ══════════════════════════════════════════════════════

import { eq, and, ne, inArray, isNull, sql, desc } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { orders, orderInvoices, venueHandovers } from '../schemas/fnb.schema.js';
import { activities, bookings, locations, staff } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { playersWhoPlayed, waterItemOf } from './fnb-invoice.service.js';

const n = (x: unknown) => { const v = parseFloat(String(x ?? '0')); return Number.isFinite(v) ? v : 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;
const rows = (r: any): any[] => r?.rows ?? r ?? [];
/** تاريخ الفعاليّة من استعلامٍ خام يصل نصّاً بلا منطقة («2026-10-29 16:30:00») — والعمود UTC.
 *  بلا هذا يقرؤه متصفّح الهاتف بتوقيت عمّان (الساعة تتأخّر ٣) أو يرفضه سفاري القديم. */
const isoUtc = (d: unknown): string => d instanceof Date ? d.toISOString()
  : typeof d === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? d.replace(' ', 'T') + 'Z' : String(d ?? '');

/** مهلة التراجع عن التحصيل — التوست يعرض الزرّ ٦ ثوانٍ، والخادم يتسامح دقيقتين */
export const UNDO_WINDOW_MS = 120_000;

export interface LedgerRow {
  key: string;
  kind: 'open' | 'paid';
  playerId: number;
  playerName: string;
  seat: number | null;
  bookingId: number | null;
  invoiceId: number | null;
  invoiceNo: number | null;
  printedAt: Date | null;
  isPaid: boolean;
  paidAt: Date | null;
  paidById: number | null;
  paidByName: string;
  canUndoUntil: string | null;
  ordersCount: number;
  ordersTotal: number;
  minTopup: number;
  waterCharge: number;
  loyaltyDiscount: number;
  gameFee: number;
  grandTotal: number;
  isFree: boolean;
  /** طلبٌ مفتوح لم تُصدَر له فاتورة بعد (تُصدَر عند التحصيل) */
  noInvoice: boolean;
}

export interface NightLedger {
  activityId: number;
  activityName: string;
  activityDate: Date;
  gameFeeEnabled: boolean;
  minChargeEnabled: boolean;
  minimumCharge: number;
  autoWaterEnabled: boolean;
  waterPrice: number;
  rows: LedgerRow[];
  totals: { collected: number; due: number; total: number; paidCount: number; dueCount: number };
}

/**
 * دفتر ليلةٍ واحدة: كلّ فاتورةٍ محصَّلة سطر، ولكلّ لاعبٍ عليه مستحقٌّ سطرٌ مفتوح.
 * استعلاماتٌ مجمّعة (لا استعلاماً لكلّ لاعب) إلا خصم الولاء — لاعبون قلائل.
 */
export async function nightLedger(db: Database, locId: number, activityId: number): Promise<NightLedger | null> {
  const [act] = await db.select({
    id: activities.id, name: activities.name, date: activities.date,
    addGameFee: activities.addGameFeeToBill, basePrice: activities.basePrice,
  }).from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.locationId, locId), isNull(activities.deletedAt))).limit(1);
  if (!act) return null;

  const [locRow] = await db.select({
    minChargeEnabled: locations.minChargeEnabled, minimumCharge: locations.minimumCharge, autoWater: locations.autoWater,
  }).from(locations).where(eq(locations.id, locId)).limit(1);
  const minCharge = locRow?.minChargeEnabled === true ? n(locRow.minimumCharge) : 0;
  const water = locRow?.autoWater === true ? await waterItemOf(db, locId) : null;

  const ords = await db.select({
    id: orders.id, playerId: orders.playerId, playerName: orders.playerName, bookingId: orders.bookingId,
    total: orders.total, invoiceId: orders.invoiceId,
  }).from(orders)
    .where(and(eq(orders.activityId, activityId), eq(orders.locationId, locId), ne(orders.status, 'cancelled')));

  const invs = await db.select().from(orderInvoices)
    .where(and(eq(orderInvoices.locationId, locId), eq(orderInvoices.activityId, activityId)));

  const playedIds = (minCharge > 0 || water) ? new Set(await playersWhoPlayed(db, activityId)) : new Set<number>();

  // من وصله ماءٌ من طلبه (في أيّ فاتورة) لا يُحمَّل ماءً تلقائيّاً
  const waterOwners = water
    ? new Set(rows(await db.execute(sql`
        SELECT DISTINCT o.player_id FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.activity_id = ${activityId} AND o.location_id = ${locId} AND o.status != 'cancelled'
          AND (oi.name_snapshot = ${water.name}
               OR oi.components_snapshot @> ${JSON.stringify([{ name: water.name }])}::jsonb)
      `)).map((x: any) => Number(x.player_id)))
    : new Set<number>();

  const playerIds = [...new Set([
    ...ords.map(o => o.playerId),
    ...invs.map(i => i.playerId),
    ...(minCharge > 0 || water ? [...playedIds] : []),
  ])];
  if (playerIds.length === 0) {
    return {
      activityId, activityName: act.name, activityDate: act.date,
      gameFeeEnabled: act.addGameFee === true, minChargeEnabled: minCharge > 0, minimumCharge: minCharge,
      autoWaterEnabled: water !== null, waterPrice: water?.price ?? 0, rows: [],
      totals: { collected: 0, due: 0, total: 0, paidCount: 0, dueCount: 0 },
    };
  }

  const names = new Map((await db.select({ id: players.id, name: players.name })
    .from(players).where(inArray(players.id, playerIds))).map(p => [p.id, p.name]));
  const bks = await db.select({ id: bookings.id, playerId: bookings.playerId, isPaid: bookings.isPaid, isFree: bookings.isFree })
    .from(bookings).where(and(eq(bookings.activityId, activityId), inArray(bookings.playerId, playerIds), isNull(bookings.deletedAt)));
  const bkById = new Map(bks.map(b => [b.id, b]));
  const bkByPlayer = new Map(bks.map(b => [b.playerId, b]));

  // آخر مقعدٍ لكلّ لاعب — من طلباته وإلّا من لعبه
  const seatRows = rows(await db.execute(sql`
    SELECT DISTINCT ON (player_id) player_id, physical_id FROM (
      SELECT o.player_id, o.physical_id, o.created_at AS t FROM orders o
       WHERE o.activity_id = ${activityId} AND o.physical_id IS NOT NULL
      UNION ALL
      SELECT mp.player_id, mp.physical_id, m.created_at AS t FROM match_players mp
        JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
       WHERE s.activity_id = ${activityId} AND mp.physical_id IS NOT NULL AND mp.player_id IS NOT NULL
    ) x ORDER BY player_id, t DESC
  `));
  const seatBy = new Map(seatRows.map((x: any) => [Number(x.player_id), Number(x.physical_id)]));

  const paidByIds = [...new Set(invs.map(i => i.paidBy).filter((x): x is number => !!x))];
  const staffNames = new Map(paidByIds.length
    ? (await db.select({ id: staff.id, displayName: staff.displayName, username: staff.username })
        .from(staff).where(inArray(staff.id, paidByIds))).map(s => [s.id, s.displayName || s.username || ''])
    : []);

  let lockedFee = new Map<number, { price: number; promoId: number | null }>();
  const bookingIds = bks.map(b => b.id);
  try { const { lockedPricesFor } = await import('./early-price.service.js'); lockedFee = await lockedPricesFor(bookingIds); } catch { /* سعر الفعاليّة */ }

  let drinkDiscountFor: ((...a: any[]) => Promise<{ discount: number }>) | null = null;
  try { ({ drinkDiscountFor } = await import('./loyalty.service.js') as any); } catch { /* بلا ولاء */ }

  const now = Date.now();
  const out: LedgerRow[] = [];
  for (const pid of playerIds) {
    const pOrders = ords.filter(o => o.playerId === pid);
    const pInvs = invs.filter(i => i.playerId === pid);
    const paid = pInvs.filter(i => i.isPaid === true);
    const unpaidRow = pInvs.find(i => i.isPaid !== true) ?? null;
    const name = pOrders[0]?.playerName || names.get(pid) || `لاعب #${pid}`;
    const bookingId = pOrders[0]?.bookingId ?? bkByPlayer.get(pid)?.id ?? null;
    const bk = bookingId ? bkById.get(bookingId) ?? bkByPlayer.get(pid) : bkByPlayer.get(pid);
    const seat = seatBy.get(pid) ?? null;

    for (const i of paid) {
      const paidAt = i.paidAt ? new Date(i.paidAt) : null;
      out.push({
        key: `paid-${i.id}`, kind: 'paid', playerId: pid, playerName: name, seat, bookingId: i.bookingId ?? bookingId,
        invoiceId: i.id, invoiceNo: i.invoiceNo, printedAt: i.printedAt, isPaid: true, paidAt,
        paidById: i.paidBy ?? null, paidByName: (i.paidBy && staffNames.get(i.paidBy)) || '',
        canUndoUntil: paidAt && now - paidAt.getTime() < UNDO_WINDOW_MS ? new Date(paidAt.getTime() + UNDO_WINDOW_MS).toISOString() : null,
        ordersCount: pOrders.filter(o => o.invoiceId === i.id).length,
        ordersTotal: n(i.ordersTotal), minTopup: n(i.minTopup), waterCharge: n(i.waterCharge),
        loyaltyDiscount: n((i as any).loyaltyDiscount), gameFee: n(i.gameFeeAmount), grandTotal: n(i.grandTotal),
        isFree: bk?.isFree === true, noInvoice: false,
      });
    }

    // ── الجزء المفتوح: نفس قواعد buildInvoiceData ──
    const openOrders = pOrders.filter(o => o.invoiceId == null);
    const openTotal = openOrders.reduce((s, o) => s + n(o.total), 0);
    const nightTotal = pOrders.reduce((s, o) => s + n(o.total), 0);
    const priorWater = paid.reduce((s, i) => s + n(i.waterCharge), 0);
    const priorTopup = paid.reduce((s, i) => s + n(i.minTopup), 0);
    const played = playedIds.has(pid);
    const waterOpen = water && priorWater === 0 && !waterOwners.has(pid) && (openOrders.length > 0 || played || !!unpaidRow) ? water.price : 0;
    const required = minCharge > 0 && played ? Math.max(0, minCharge - (nightTotal + waterOpen + priorWater)) : 0;
    const topupOpen = Math.max(0, required - priorTopup);
    const fee = act.addGameFee === true && bk && bk.isPaid !== true && bk.isFree !== true
      ? (lockedFee.get(bk.id)?.price ?? n(act.basePrice)) : 0;
    let loyalty = 0;
    if (openOrders.length > 0 && drinkDiscountFor) {
      try { loyalty = (await drinkDiscountFor(db, pid, locId, activityId)).discount || 0; } catch { /* بلا خصم */ }
    }
    const openGrand = Math.max(0, openTotal + waterOpen + topupOpen + fee - loyalty);
    const hasOpen = openOrders.length > 0 || !!unpaidRow || ((minCharge > 0 || !!water) && played && openGrand > 0);
    if (hasOpen) {
      out.push({
        key: `open-${pid}`, kind: 'open', playerId: pid, playerName: name, seat, bookingId,
        invoiceId: unpaidRow?.id ?? null, invoiceNo: unpaidRow?.invoiceNo ?? null, printedAt: unpaidRow?.printedAt ?? null,
        isPaid: false, paidAt: null, paidById: null, paidByName: '', canUndoUntil: null,
        ordersCount: openOrders.length, ordersTotal: r2(openTotal), minTopup: r2(topupOpen), waterCharge: r2(waterOpen),
        loyaltyDiscount: r2(loyalty), gameFee: r2(fee), grandTotal: r2(openGrand),
        isFree: bk?.isFree === true, noInvoice: !unpaidRow,
      });
    }
  }

  // المفتوح أوّلاً بالمقعد ثمّ الاسم، ثمّ المحصَّل بالأحدث
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'open' ? -1 : 1;
    if (a.kind === 'paid') return (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0);
    return (a.seat ?? 999) - (b.seat ?? 999) || a.playerName.localeCompare(b.playerName, 'ar');
  });

  const collected = out.filter(x => x.kind === 'paid').reduce((s, x) => s + x.grandTotal, 0);
  const due = out.filter(x => x.kind === 'open').reduce((s, x) => s + x.grandTotal, 0);
  return {
    activityId, activityName: act.name, activityDate: act.date,
    gameFeeEnabled: act.addGameFee === true, minChargeEnabled: minCharge > 0, minimumCharge: minCharge,
    autoWaterEnabled: water !== null, waterPrice: water?.price ?? 0,
    rows: out,
    totals: {
      collected: r2(collected), due: r2(due), total: r2(collected + due),
      paidCount: out.filter(x => x.kind === 'paid').length,
      dueCount: out.filter(x => x.kind === 'open' && x.grandTotal > 0).length,
    },
  };
}

export interface NightSummary {
  activityId: number; activityName: string; activityDate: Date;
  collected: number; due: number; total: number; paidCount: number; dueCount: number;
}

/**
 * ليالي التحصيل: آخر ٧ أيّام دائماً، وما قبلها حتّى ٦٠ يوماً إن بقي فيها مستحقّ.
 * كان التبويب يقف عند ٧ أيّام فيصير مال الليالي الأقدم طريقاً مسدوداً.
 */
export async function collectionNights(db: Database, locId: number): Promise<NightSummary[]> {
  const acts = rows(await db.execute(sql`
    SELECT a.id, a.date,
      (a.date >= NOW() - INTERVAL '7 days') AS recent,
      EXISTS (SELECT 1 FROM order_invoices i WHERE i.activity_id = a.id AND i.location_id = ${locId} AND i.is_paid = false) AS has_unpaid,
      EXISTS (SELECT 1 FROM orders o WHERE o.activity_id = a.id AND o.location_id = ${locId}
                AND o.status <> 'cancelled' AND o.invoice_id IS NULL) AS has_open
    FROM activities a
    WHERE a.location_id = ${locId} AND a.menu_ordering_enabled = true AND a.deleted_at IS NULL
      AND (a.status IS NULL OR a.status <> 'cancelled')
      AND a.date >= NOW() - INTERVAL '60 days' AND a.date <= NOW() + INTERVAL '1 day'
    ORDER BY a.date DESC
    LIMIT 40
  `));
  const picked = acts.filter((a: any) => a.recent || a.has_unpaid || a.has_open).slice(0, 14);
  const out: NightSummary[] = [];
  for (const a of picked) {
    const L = await nightLedger(db, locId, Number(a.id));
    if (!L) continue;
    // الليالي الأقدم تظهر فقط إن بقي فيها مال — الحديثة تظهر دائماً
    if (!a.recent && L.totals.due <= 0) continue;
    out.push({
      activityId: L.activityId, activityName: L.activityName, activityDate: L.activityDate,
      collected: L.totals.collected, due: L.totals.due, total: L.totals.total,
      paidCount: L.totals.paidCount, dueCount: L.totals.dueCount,
    });
  }
  return out;
}

/** تاريخ عمّان اليوم بصيغة YYYY-MM-DD */
function ammanToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(ymd: string, d: number): string {
  const t = new Date(ymd + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
/** حدود الفترة بتواريخ عمّان: الأسبوع من السبت، والشهر من أوّله */
export function periodRange(period: string): { from: string; to: string } {
  const today = ammanToday();
  if (period === 'week') {
    const dow = new Date(today + 'T00:00:00Z').getUTCDay(); // 0=أحد … 6=سبت
    const back = (dow + 1) % 7;                              // السبت = 0
    return { from: addDays(today, -back), to: today };
  }
  if (period === 'month') return { from: today.slice(0, 8) + '01', to: today };
  return { from: today, to: today };
}

/** مجاميع الفواتير المحصّلة لكلّ فعاليّة في المدى (تاريخ الفعاليّة) */
async function paidByActivity(db: Database, locId: number, from: string, to: string) {
  return rows(await db.execute(sql`
    SELECT a.id, a.name, a.date,
      COALESCE(SUM(i.grand_total) FILTER (WHERE i.is_paid), 0)::numeric AS collected,
      COALESCE(SUM(i.orders_total) FILTER (WHERE i.is_paid), 0)::numeric AS orders,
      COALESCE(SUM(i.min_topup) FILTER (WHERE i.is_paid), 0)::numeric AS topup,
      COALESCE(SUM(i.water_charge) FILTER (WHERE i.is_paid), 0)::numeric AS water,
      COALESCE(SUM(i.game_fee_amount) FILTER (WHERE i.is_paid), 0)::numeric AS fees,
      COALESCE(SUM(i.loyalty_discount) FILTER (WHERE i.is_paid), 0)::numeric AS loyalty,
      COUNT(i.id) FILTER (WHERE i.is_paid AND i.game_fee_applied AND i.game_fee_amount > 0)::int AS fee_count,
      COUNT(i.id) FILTER (WHERE i.is_paid)::int AS paid_count,
      (SELECT COUNT(*)::int FROM bookings b WHERE b.activity_id = a.id AND b.deleted_at IS NULL AND b.is_free = true) AS free_count
    FROM activities a
    LEFT JOIN order_invoices i ON i.activity_id = a.id AND i.location_id = ${locId}
    WHERE a.location_id = ${locId} AND a.deleted_at IS NULL AND (a.status IS NULL OR a.status <> 'cancelled')
      AND a.date::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY a.id, a.name, a.date
    ORDER BY a.date ASC
  `));
}

/** حساب النادي مع المكان منذ أوّل ليلة: دخوليّاتٌ (− خصم ولاء) حصّلها، والمسلَّم */
export async function clubAccount(db: Database, locId: number) {
  const [c] = rows(await db.execute(sql`
    SELECT COALESCE(SUM(game_fee_amount - COALESCE(loyalty_discount, 0)), 0)::numeric AS club
    FROM order_invoices WHERE location_id = ${locId} AND is_paid = true
  `));
  const hs = await db.select().from(venueHandovers)
    .where(eq(venueHandovers.locationId, locId)).orderBy(desc(venueHandovers.declaredAt)).limit(30);
  const confirmed = hs.filter(h => h.status === 'confirmed').reduce((s, h) => s + n(h.amount), 0);
  const pending = hs.filter(h => h.status === 'pending').reduce((s, h) => s + n(h.amount), 0);
  // الإجماليّ المؤكَّد لا يُقصّ بحدّ الـ30 سجلّاً
  const [allConf] = rows(await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::numeric AS v FROM venue_handovers WHERE location_id = ${locId} AND status = 'confirmed'`));
  const confirmedAll = n(allConf?.v);
  const ids = [...new Set(hs.flatMap(h => [h.declaredBy, h.resolvedBy]).filter((x): x is number => !!x))];
  const nm = new Map(ids.length ? (await db.select({ id: staff.id, d: staff.displayName, u: staff.username })
    .from(staff).where(inArray(staff.id, ids))).map(s => [s.id, s.d || s.u || '']) : []);
  const club = n(c?.club);
  return {
    collected: r2(club),
    confirmed: r2(confirmedAll),
    pending: r2(pending),
    /** ما يراه المكان: الباقي بعد كلّ ما صرّح بتسليمه (المؤكَّد والمنتظر) */
    remainingForVenue: r2(Math.max(0, club - confirmedAll - pending)),
    /** ما تراه الإدارة: الباقي بعد المؤكَّد فقط — المنتظر لم يصل يدها بعد */
    heldForAdmin: r2(club - confirmedAll),
    handovers: hs.map(h => ({
      id: h.id, amount: n(h.amount), toLabel: h.toLabel || '', note: h.note || '', status: h.status,
      declaredAt: h.declaredAt, declaredByName: (h.declaredBy && nm.get(h.declaredBy)) || '',
      resolvedAt: h.resolvedAt, resolvedByName: (h.resolvedBy && nm.get(h.resolvedBy)) || '',
      byAdmin: !h.declaredBy,
    })),
    _confirmedRecent: confirmed,
  };
}

/** «الحساب» في كونسول المكان */
export async function moneySummary(db: Database, locId: number, period: string, activityId?: number) {
  let nightsRows: any[];
  let range: { from: string; to: string };
  if (period === 'night') {
    // الليلة = الفعاليّة المحدّدة، وإلّا أحدث فعاليّة بدأت (أو تبدأ خلال ١٢ ساعة)
    let actId = activityId;
    if (!actId) {
      const [last] = rows(await db.execute(sql`
        SELECT id FROM activities WHERE location_id = ${locId} AND deleted_at IS NULL
          AND (status IS NULL OR status <> 'cancelled') AND date <= NOW() + INTERVAL '12 hours'
        ORDER BY date DESC LIMIT 1`));
      actId = last ? Number(last.id) : undefined;
    }
    if (!actId) { nightsRows = []; range = periodRange('night'); }
    else {
      const [a] = rows(await db.execute(sql`SELECT date::date::text AS d FROM activities WHERE id = ${actId} AND location_id = ${locId}`));
      range = { from: a?.d, to: a?.d };
      nightsRows = a ? (await paidByActivity(db, locId, a.d, a.d)).filter((x: any) => Number(x.id) === actId) : [];
    }
  } else {
    range = periodRange(period);
    nightsRows = await paidByActivity(db, locId, range.from, range.to);
  }

  const nights = [];
  for (const x of nightsRows) {
    const L = await nightLedger(db, locId, Number(x.id));
    nights.push({
      activityId: Number(x.id), activityName: x.name, activityDate: isoUtc(x.date),
      collected: r2(n(x.collected)),
      venue: r2(n(x.orders) + n(x.topup) + n(x.water)),
      club: r2(n(x.fees) - n(x.loyalty)),
      orders: r2(n(x.orders)), topup: r2(n(x.topup)), water: r2(n(x.water)),
      fees: r2(n(x.fees)), loyalty: r2(n(x.loyalty)),
      feeCount: Number(x.fee_count) || 0, paidCount: Number(x.paid_count) || 0, freeCount: Number(x.free_count) || 0,
      due: L?.totals.due ?? 0, dueCount: L?.totals.dueCount ?? 0,
    });
  }
  const sum = (k: string) => r2(nights.reduce((s, x: any) => s + (x[k] as number), 0));
  const totals = {
    collected: sum('collected'), venue: sum('venue'), club: sum('club'),
    orders: sum('orders'), topup: sum('topup'), water: sum('water'), fees: sum('fees'), loyalty: sum('loyalty'),
    feeCount: nights.reduce((s, x) => s + x.feeCount, 0), paidCount: nights.reduce((s, x) => s + x.paidCount, 0),
    freeCount: nights.reduce((s, x) => s + x.freeCount, 0),
  };
  const account = await clubAccount(db, locId);
  const uncollected = (await collectionNights(db, locId)).filter(x => x.due > 0);
  return { period, range, totals, nights, account, uncollected };
}

/**
 * الفعاليّات التي مرّت — قائمة الاختيار في «الحساب» (2026-10-30).
 * مجاميع المحصَّل من اللقطات (رخيصة)، وعلامة «فيها مالٌ مفتوح» بفحص وجودٍ لا بالدفتر.
 */
export async function pastNights(db: Database, locId: number) {
  const list = rows(await db.execute(sql`
    SELECT a.id, a.name, a.date,
      COALESCE(SUM(i.grand_total) FILTER (WHERE i.is_paid), 0)::numeric AS collected,
      COUNT(i.id) FILTER (WHERE i.is_paid)::int AS paid_count,
      (SELECT COUNT(*)::int FROM orders o WHERE o.activity_id = a.id AND o.location_id = ${locId} AND o.status <> 'cancelled') AS orders_count,
      (EXISTS (SELECT 1 FROM order_invoices u WHERE u.activity_id = a.id AND u.location_id = ${locId} AND NOT u.is_paid)
        OR EXISTS (SELECT 1 FROM orders o WHERE o.activity_id = a.id AND o.location_id = ${locId}
                     AND o.status <> 'cancelled' AND o.invoice_id IS NULL)) AS has_open
    FROM activities a
    LEFT JOIN order_invoices i ON i.activity_id = a.id AND i.location_id = ${locId}
    WHERE a.location_id = ${locId} AND a.deleted_at IS NULL AND (a.status IS NULL OR a.status <> 'cancelled')
      AND a.date <= NOW() + INTERVAL '12 hours' AND a.date >= NOW() - INTERVAL '180 days'
    GROUP BY a.id, a.name, a.date
    ORDER BY a.date DESC
    LIMIT 80
  `));
  return list.map((x: any) => ({
    activityId: Number(x.id), activityName: x.name, activityDate: isoUtc(x.date),
    collected: r2(n(x.collected)), paidCount: Number(x.paid_count) || 0,
    ordersCount: Number(x.orders_count) || 0, hasOpen: x.has_open === true,
  }));
}

/**
 * حساب فعاليّةٍ واحدة كاملاً: الملخّص والتقسيم، وكلّ فاتورة، وما لم يُحصَّل،
 * والأصناف المباعة، والملغى، والمجّانيّات المسقطة، وعدد من حجز ومن لعب.
 * نفس مصادر «الحساب» و«الفواتير» — لا رقم يُحسب هنا بقاعدةٍ ثانية.
 */
export async function nightAccount(db: Database, locId: number, activityId: number) {
  const L = await nightLedger(db, locId, activityId);
  if (!L) return null;
  const [d] = rows(await db.execute(sql`SELECT date::date::text AS d FROM activities WHERE id = ${activityId}`));
  const [p] = (await paidByActivity(db, locId, d.d, d.d)).filter((x: any) => Number(x.id) === activityId);

  const items = rows(await db.execute(sql`
    SELECT oi.name_snapshot AS name, SUM(oi.quantity)::int AS qty,
           SUM(oi.unit_price_snapshot * oi.quantity)::numeric AS amount
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.activity_id = ${activityId} AND o.location_id = ${locId} AND o.status <> 'cancelled'
    GROUP BY oi.name_snapshot
    ORDER BY amount DESC, qty DESC
  `)).map((x: any) => ({ name: x.name, qty: Number(x.qty) || 0, amount: r2(n(x.amount)) }));

  const [cx] = rows(await db.execute(sql`
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total), 0)::numeric AS total
    FROM orders WHERE activity_id = ${activityId} AND location_id = ${locId} AND status = 'cancelled'`));

  // آخر قرارٍ لكلّ لاعب هو النافذ: إسقاطٌ ثمّ إعادة احتساب = لا إسقاط
  const waivers = rows(await db.execute(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (w.player_id) w.player_id, w.waived, w.reason, w.created_at,
             COALESCE(p.name, '') AS player_name, COALESCE(NULLIF(s.display_name, ''), s.username, '') AS staff_name
      FROM fee_waivers w
      LEFT JOIN players p ON p.id = w.player_id
      LEFT JOIN staff s ON s.id = w.staff_id
      WHERE w.activity_id = ${activityId} AND w.location_id = ${locId}
      ORDER BY w.player_id, w.created_at DESC
    ) x WHERE x.waived = true ORDER BY x.created_at
  `)).map((x: any) => ({
    playerId: Number(x.player_id), playerName: x.player_name, reason: x.reason || '',
    staffName: x.staff_name, at: x.created_at,
  }));

  const [bk] = rows(await db.execute(sql`
    SELECT COUNT(*)::int AS booked,
      COUNT(*) FILTER (WHERE b.is_free = true)::int AS free,
      COUNT(*) FILTER (WHERE b.is_paid = true AND COALESCE(b.is_free, false) = false AND b.paid_amount > 0
        AND b.id NOT IN (SELECT booking_id FROM order_invoices
                          WHERE is_paid = true AND game_fee_applied = true AND booking_id IS NOT NULL))::int AS direct
    FROM bookings b WHERE b.activity_id = ${activityId} AND b.deleted_at IS NULL`));
  const played = (await playersWhoPlayed(db, activityId)).length;

  const ordersT = r2(n(p?.orders)), topup = r2(n(p?.topup)), water = r2(n(p?.water));
  const fees = r2(n(p?.fees)), loyalty = r2(n(p?.loyalty));
  return {
    activity: { id: L.activityId, name: L.activityName, date: L.activityDate },
    rules: {
      gameFeeEnabled: L.gameFeeEnabled, minChargeEnabled: L.minChargeEnabled, minimumCharge: L.minimumCharge,
      autoWaterEnabled: L.autoWaterEnabled, waterPrice: L.waterPrice,
    },
    totals: {
      collected: r2(n(p?.collected)), venue: r2(ordersT + topup + water), club: r2(fees - loyalty),
      orders: ordersT, topup, water, fees, loyalty,
      feeCount: Number(p?.fee_count) || 0, paidCount: Number(p?.paid_count) || 0,
      due: L.totals.due, dueCount: L.totals.dueCount,
    },
    counts: {
      booked: Number(bk?.booked) || 0, played, free: Number(bk?.free) || 0, directPaid: Number(bk?.direct) || 0,
      cancelledOrders: Number(cx?.cnt) || 0, cancelledTotal: r2(n(cx?.total)),
    },
    rows: L.rows,
    items,
    waivers,
  };
}

/** تسويات كلّ الأماكن — صفحة الإدارة */
export async function settlementsOverview(db: Database, from: string, to: string) {
  const locs = rows(await db.execute(sql`
    SELECT id, name FROM locations WHERE deleted_at IS NULL AND COALESCE(is_test_location, false) = false ORDER BY id`));
  const venues = [];
  for (const l of locs) {
    const locId = Number(l.id);
    const acts = await paidByActivity(db, locId, from, to);
    const [direct] = rows(await db.execute(sql`
      SELECT COALESCE(SUM(b.paid_amount), 0)::numeric AS amount, COUNT(*)::int AS cnt
      FROM bookings b JOIN activities a ON a.id = b.activity_id
      WHERE a.location_id = ${locId} AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND b.is_paid = true AND COALESCE(b.is_free, false) = false AND b.paid_amount > 0
        AND a.date::date BETWEEN ${from}::date AND ${to}::date
        AND b.id NOT IN (SELECT booking_id FROM order_invoices
                          WHERE is_paid = true AND game_fee_applied = true AND booking_id IS NOT NULL)
    `));
    const [ordersIn] = rows(await db.execute(sql`
      SELECT COALESCE(SUM(o.total), 0)::numeric AS total, COUNT(DISTINCT o.activity_id)::int AS nights
      FROM orders o JOIN activities a ON a.id = o.activity_id
      WHERE o.location_id = ${locId} AND o.status <> 'cancelled' AND a.date::date BETWEEN ${from}::date AND ${to}::date`));
    const [lastInv] = rows(await db.execute(sql`SELECT MAX(paid_at) AS t FROM order_invoices WHERE location_id = ${locId} AND is_paid`));
    // المستحقّ من الليالي التي فيها مالٌ مفتوح فقط (فحصٌ رخيص قبل الدفتر).
    // 🔴 مكانٌ لا يحصّل بالنظام (مزاج: طلباتٌ تُسجَّل بلا فواتير منذ آب) لا «مستحقّ» له هنا:
    //    كلّ طلباته ستبدو ديناً وهي محصَّلةٌ نقداً خارج النظام — فتتضخّم خانة الإدارة بلا معنى.
    const invoicesInRange = acts.some((x: any) => (Number(x.paid_count) || 0) > 0);
    let due = 0; let dueNoInvoice = 0;
    for (const a of invoicesInRange ? acts : []) {
      const [chk] = rows(await db.execute(sql`
        SELECT EXISTS (SELECT 1 FROM order_invoices i WHERE i.activity_id = ${a.id} AND i.location_id = ${locId} AND NOT i.is_paid)
            OR EXISTS (SELECT 1 FROM orders o WHERE o.activity_id = ${a.id} AND o.location_id = ${locId} AND o.status <> 'cancelled' AND o.invoice_id IS NULL)
            OR EXISTS (SELECT 1 FROM order_invoices i WHERE i.activity_id = ${a.id} AND i.location_id = ${locId}) AS any`));
      if (!chk?.any) continue;
      const L = await nightLedger(db, locId, Number(a.id));
      if (!L) continue;
      due += L.totals.due;
      dueNoInvoice += L.rows.filter(r => r.kind === 'open' && r.noInvoice).reduce((s, r) => s + r.grandTotal, 0);
    }
    const account = await clubAccount(db, locId);
    const nightsDetail = acts.map((x: any) => ({
      activityId: Number(x.id), activityName: x.name, activityDate: isoUtc(x.date),
      collected: r2(n(x.collected)), venue: r2(n(x.orders) + n(x.topup) + n(x.water)), club: r2(n(x.fees) - n(x.loyalty)),
      feeCount: Number(x.fee_count) || 0, paidCount: Number(x.paid_count) || 0, freeCount: Number(x.free_count) || 0,
    }));
    const box = nightsDetail.reduce((s, x) => s + x.collected, 0);
    const usesInvoicing = nightsDetail.some(x => x.paidCount > 0);
    venues.push({
      locationId: locId, name: l.name, nights: acts.length,
      box: r2(box),
      venue: r2(nightsDetail.reduce((s, x) => s + x.venue, 0)),
      clubVia: r2(nightsDetail.reduce((s, x) => s + x.club, 0)),
      direct: r2(n(direct?.amount)), directCount: Number(direct?.cnt) || 0,
      due: r2(due), dueNoInvoice: r2(dueNoInvoice),
      ordersRecorded: r2(n(ordersIn?.total)), ordersNights: Number(ordersIn?.nights) || 0,
      usesInvoicing, lastInvoiceAt: lastInv?.t ?? null,
      held: account.heldForAdmin, received: account.confirmed, pendingTotal: account.pending,
      handovers: account.handovers,
      nightsDetail,
    });
  }
  const pending = venues.flatMap(v => v.handovers.filter(h => h.status === 'pending')
    .map(h => ({ ...h, locationId: v.locationId, venueName: v.name })));
  const totals = {
    clubVia: r2(venues.reduce((s, v) => s + v.clubVia, 0)),
    direct: r2(venues.reduce((s, v) => s + v.direct, 0)),
    held: r2(venues.reduce((s, v) => s + Math.max(0, v.held), 0)),
    venue: r2(venues.reduce((s, v) => s + v.venue, 0)),
    due: r2(venues.reduce((s, v) => s + v.due, 0)),
    dueNoInvoice: r2(venues.reduce((s, v) => s + v.dueNoInvoice, 0)),
  };
  return { range: { from, to }, totals, venues, pending };
}

export { ammanToday, addDays };
