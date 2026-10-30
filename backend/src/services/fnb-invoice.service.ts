// ══════════════════════════════════════════════════════
// 🧾 فواتير المنيو — F&B Invoice Service
// فاتورة A6 لكل لاعب لكل فعاليّة: مجموع طلباته (غير الملغاة) + سطر رسوم اللعبة
// الاختياريّ (addGameFeeToBill ولم يُدفع الحجز). ترقيم تسلسليّ لكل مكان بقفل استشاريّ.
// المال لا يلمس bookings.paid_amount هنا إطلاقاً — التحصيل عبر مسار الدفع الموجود.
// ══════════════════════════════════════════════════════

import { eq, and, ne, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../config/db.js';
import { orders, orderItems, orderInvoices, menuItems } from '../schemas/fnb.schema.js';
import { activities, bookings, locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';

export interface InvoiceComponent { name: string; qty: number; options?: { group: string; value: string }[] }
export interface InvoiceLine {
  name: string; quantity: number; unitPrice: number; lineTotal: number;
  components: InvoiceComponent[];   // 🎁 مكوّنات الباقة (لقطة الطلب) — تُطبع مُسنَّنة تحت السطر
  options: { group: string; value: string }[];   // ⚙️ الخيارات المختارة (نكهة/حجم/إضافات)
}
export interface InvoiceData {
  locationId: number;
  locationName: string;
  activityId: number;
  activityName: string;
  activityDate: Date;
  playerId: number;
  playerName: string;
  bookingId: number | null;
  lines: InvoiceLine[];
  ordersCount: number;
  ordersTotal: number;
  /** 💳 تكملة الحدّ الأدنى للاستهلاك — صفر إن كان معطّلاً أو الطلبات بلغته أو اللاعب لم يلعب */
  minTopup: number;
  /** 💧 الماء التلقائيّ — صفر إن كان معطّلاً أو وصله ماءٌ من طلبه (مفرداً أو ضمن عرض) */
  waterCharge: number;
  /** 🎟️ خصم مشروب بطاقة الولاء (أغلى مشروبٍ مؤهَّل حتى السقف) — صفر بلا مكافأة متاحة */
  loyaltyDiscount: number;
  loyaltyRewardId: number | null;
  loyaltyItemName: string | null;
  gameFeeApplied: boolean;
  gameFeeAmount: number;
  grandTotal: number;
  /** الطلبات التي تغطّيها هذه الفاتورة — التحصيل يختمها بها */
  orderIds: number[];
  /** مقعد اللاعب (آخر مقعدٍ جلس عليه في الفعاليّة) — للطباعة والبحث */
  seat: number | null;
  /** لقطة فاتورةٍ محصَّلة بعينها (لا الجزء المفتوح) — تُطبع بمجاميعها المجمَّدة */
  snapshotInvoiceId: number | null;
  paidAt: Date | null;
  /** 💳 طرق الدفع المفعّلة في المكان — تُكتب على الملفّ المطلوب. كليك وحده بتفاصيله */
  payment: PaymentInfo;
}

export interface PaymentInfo {
  cash: boolean;
  card: boolean;
  /** null = كليك غير مفعّل أو ناقص القيمة (لا تُطبع تفاصيلٌ نصفيّة) */
  cliq: { method: 'alias' | 'phone'; value: string; bank: string; name: string } | null;
}

/** طرق الدفع من صفّ المكان — كليك يُعرض فقط مفعّلاً وبقيمةٍ مكتوبة */
export function paymentInfoOf(loc: any): PaymentInfo {
  const value = String(loc?.cliqValue || '').trim();
  return {
    cash: loc?.payCash !== false,
    card: loc?.payCard === true,
    cliq: loc?.payCliq === true && value
      ? { method: loc.cliqMethod === 'phone' ? 'phone' : 'alias', value, bank: String(loc.cliqBank || '').trim(), name: String(loc.cliqName || '').trim() }
      : null,
  };
}

/** «لعب» = جلس في لعبةٍ بدأت (match_participants عند البداية)، أو احتُسبت له مباراة (match_players —
 *  الأقدم من السجلّ الجديد). من بداية اللعبة لا نهايتها (طلب المالك 2026-10-30). */
const PLAYED_ROWS = (activityId: number) => sql`
  SELECT mpt.player_id FROM match_participants mpt WHERE mpt.activity_id = ${activityId}
  UNION
  SELECT mp.player_id FROM match_players mp
    JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
   WHERE s.activity_id = ${activityId} AND mp.player_id IS NOT NULL`;

/** هل لعب اللاعب جولةً واحدة على الأقلّ في هذه الفعاليّة؟ (شرط استحقاق الحدّ الأدنى) */
export async function playedInActivity(db: Database, activityId: number, playerId: number): Promise<boolean> {
  const r: any = await db.execute(sql`SELECT 1 FROM (${PLAYED_ROWS(activityId)}) x WHERE x.player_id = ${playerId} LIMIT 1`);
  return Boolean(r?.rows?.[0] ?? r?.[0]);
}

/** حاضرٌ في الليلة: جالسٌ في غرفةٍ من غرف الفعاليّة أو لعب فيها — فيُفوتَر برسم دخوله ولو لم يطلب ولم يلعب */
const PRESENT_ROWS = (activityId: number) => sql`
  SELECT sp.player_id FROM session_players sp JOIN sessions s ON s.id = sp.session_id
   WHERE s.activity_id = ${activityId} AND sp.player_id IS NOT NULL
  UNION ${PLAYED_ROWS(activityId)}`;

export async function presentInActivity(db: Database, activityId: number, playerId: number): Promise<boolean> {
  const r: any = await db.execute(sql`SELECT 1 FROM (${PRESENT_ROWS(activityId)}) x WHERE x.player_id = ${playerId} LIMIT 1`);
  return Boolean(r?.rows?.[0] ?? r?.[0]);
}

export async function playersPresent(db: Database, activityId: number): Promise<number[]> {
  const r: any = await db.execute(sql`SELECT DISTINCT player_id FROM (${PRESENT_ROWS(activityId)}) x`);
  return (r?.rows ?? r ?? []).map((x: any) => Number(x.player_id)).filter(Number.isFinite);
}

/**
 * 💧 صنف الماء في المنيو الفعّال للمكان — بالاسم («مياه» أو «ماء»).
 * موقع الاختبار يستعير منيو مصدره، فالبحث يتبع الاستعارة (نفس دلالة
 * effectiveMenuLocation في fnb.routes — منسوخة هنا لتفادي استيرادٍ دائريّ).
 */
export async function waterItemOf(db: Database, locationId: number):
  Promise<{ id: number; name: string; price: number } | null> {
  let menuLocId = locationId;
  const [loc] = await db.select({
    isTest: locations.isTestLocation, src: locations.menuSourceLocationId,
  }).from(locations).where(eq(locations.id, locationId)).limit(1);
  if (loc?.isTest === true && loc.src) {
    const [src] = await db.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, loc.src), isNull(locations.deletedAt))).limit(1);
    if (src) menuLocId = src.id;
  }
  const [w] = await db.select({ id: menuItems.id, name: menuItems.name, price: menuItems.price })
    .from(menuItems)
    .where(and(
      eq(menuItems.locationId, menuLocId),
      inArray(menuItems.name, ['مياه', 'ماء']),
      isNull(menuItems.deletedAt),
    )).limit(1);
  return w ? { id: w.id, name: w.name, price: parseFloat(w.price) } : null;
}

/** لاعبو الفعاليّة الذين لعبوا جولةً على الأقلّ (معرّفاتهم المميّزة) */
export async function playersWhoPlayed(db: Database, activityId: number): Promise<number[]> {
  const r: any = await db.execute(sql`SELECT DISTINCT player_id FROM (${PLAYED_ROWS(activityId)}) x`);
  const rows: any[] = r?.rows ?? r ?? [];
  return rows.map(x => Number(x.player_id)).filter(Number.isFinite);
}

/** مصادر المقعد لكلّ لاعب: طلباته، ثمّ مقعده عند بدء لعبه، ثمّ مقعده الحاليّ في الغرفة */
export const SEAT_SOURCES = (activityId: number) => sql`
  SELECT o.player_id, o.physical_id, o.created_at AS t FROM orders o
   WHERE o.activity_id = ${activityId} AND o.physical_id IS NOT NULL AND o.player_id IS NOT NULL
  UNION ALL
  SELECT mpt.player_id, mpt.physical_id, mpt.created_at AS t FROM match_participants mpt
   WHERE mpt.activity_id = ${activityId} AND mpt.physical_id IS NOT NULL
  UNION ALL
  SELECT mp.player_id, mp.physical_id, m.created_at AS t FROM match_players mp
    JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
   WHERE s.activity_id = ${activityId} AND mp.player_id IS NOT NULL AND mp.physical_id IS NOT NULL
  UNION ALL
  SELECT sp.player_id, sp.physical_id, sp.joined_at AS t FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
   WHERE s.activity_id = ${activityId} AND sp.player_id IS NOT NULL`;

/** آخر مقعدٍ جلس عليه اللاعب في الفعاليّة: من طلباته، وإلّا من لعبه، وإلّا من مقعده في الغرفة */
export async function seatOf(db: Database, activityId: number, playerId: number): Promise<number | null> {
  const r: any = await db.execute(sql`
    SELECT physical_id FROM (${SEAT_SOURCES(activityId)}) x WHERE x.player_id = ${playerId} ORDER BY t DESC LIMIT 1
  `);
  const v = (r?.rows?.[0] ?? r?.[0])?.physical_id;
  return v == null ? null : Number(v);
}

/**
 * يجمع بيانات فاتورة لاعبٍ واحد لفعاليّة واحدة (بلا كتابة).
 *
 * 🧾 فواتير متعدّدة لليلة الواحدة (2026-10-30): الطلبات التي غطّتها فاتورةٌ
 *    محصَّلة مختومةٌ بها (orders.invoice_id). بلا `invoiceId` تُبنى **الفاتورة
 *    المفتوحة**: ما لم يُختم بعد. ومع `invoiceId` تُعاد لقطة تلك الفاتورة المحصَّلة
 *    بمجاميعها المجمَّدة (للعرض وإعادة الطباعة).
 *    ما سبق تحصيله لا يتكرّر: الماء مرّةً في الليلة، والتكملة بقدر ما بقي من
 *    الحدّ بعد ما حُصّل، والدخوليّة تسقط وحدها لأنّ الحجز صار مدفوعاً.
 */
export async function buildInvoiceData(
  db: Database, locationId: number, activityId: number, playerId: number,
  opts: { invoiceId?: number } = {},
): Promise<InvoiceData | { error: string }> {
  const [act] = await db.select({
    id: activities.id, name: activities.name, date: activities.date,
    locationId: activities.locationId, addGameFee: activities.addGameFeeToBill,
    basePrice: activities.basePrice,
  }).from(activities).where(and(eq(activities.id, activityId), isNull(activities.deletedAt))).limit(1);
  if (!act || act.locationId !== locationId) return { error: 'الفعاليّة غير موجودة لهذا المكان' };

  const [loc] = await db.select({
    name: locations.name,
    minChargeEnabled: locations.minChargeEnabled,
    minimumCharge: locations.minimumCharge,
    autoWater: locations.autoWater,
    payCash: locations.payCash, payCard: locations.payCard, payCliq: locations.payCliq,
    cliqMethod: locations.cliqMethod, cliqValue: locations.cliqValue, cliqBank: locations.cliqBank, cliqName: locations.cliqName,
  }).from(locations).where(eq(locations.id, locationId)).limit(1);

  const allInvoices = await db.select().from(orderInvoices).where(and(
    eq(orderInvoices.locationId, locationId),
    eq(orderInvoices.activityId, activityId),
    eq(orderInvoices.playerId, playerId),
  ));

  // ── لقطة فاتورةٍ محصَّلة بعينها ──
  if (opts.invoiceId) {
    const inv = allInvoices.find(i => i.id === opts.invoiceId);
    if (!inv) return { error: 'الفاتورة غير موجودة لهذا اللاعب' };
    const snapOrders = await db.select().from(orders).where(and(
      eq(orders.invoiceId, inv.id), ne(orders.status, 'cancelled')));
    const snapItems = snapOrders.length > 0
      ? await db.select().from(orderItems).where(inArray(orderItems.orderId, snapOrders.map(o => o.id)))
      : [];
    const [p] = await db.select({ name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
    const n = (x: unknown) => parseFloat(String(x ?? '0')) || 0;
    return {
      locationId, locationName: loc?.name || '', activityId, activityName: act.name, activityDate: act.date,
      playerId, playerName: snapOrders[0]?.playerName || p?.name || `لاعب #${playerId}`,
      bookingId: inv.bookingId ?? null,
      lines: mergeLines(snapItems), ordersCount: snapOrders.length,
      ordersTotal: n(inv.ordersTotal), minTopup: n(inv.minTopup), waterCharge: n(inv.waterCharge),
      loyaltyDiscount: n((inv as any).loyaltyDiscount), loyaltyRewardId: (inv as any).loyaltyRewardId ?? null, loyaltyItemName: null,
      gameFeeApplied: inv.gameFeeApplied === true, gameFeeAmount: n(inv.gameFeeAmount), grandTotal: n(inv.grandTotal),
      orderIds: snapOrders.map(o => o.id), seat: await seatOf(db, activityId, playerId),
      snapshotInvoiceId: inv.id, paidAt: inv.isPaid ? inv.paidAt : null,
      payment: paymentInfoOf(loc),
    };
  }

  const priorPaid = allInvoices.filter(i => i.isPaid === true);
  const openInvoice = allInvoices.find(i => i.isPaid !== true) ?? null;

  const nightOrders = await db.select().from(orders).where(and(
    eq(orders.activityId, activityId),
    eq(orders.locationId, locationId),
    eq(orders.playerId, playerId),
    ne(orders.status, 'cancelled'),
  ));
  const playerOrders = nightOrders.filter(o => o.invoiceId == null);

  // 💳 الحدّ الأدنى: يستحقّه من لعب جولةً على الأقلّ — فحضورٌ بلا لعبٍ ليس زبون طاولة
  const minCharge = loc?.minChargeEnabled === true ? parseFloat(loc.minimumCharge || '0') : 0;
  // 💧 الماء التلقائيّ — يفتح هو الآخر فاتورةَ من لعب بلا طلبات
  const water = loc?.autoWater === true ? await waterItemOf(db, locationId) : null;
  const played = (minCharge > 0 || water !== null) ? await playedInActivity(db, activityId, playerId) : false;

  // 🎟️ حاضرٌ بلا طلبٍ ولا لعب (2026-10-30): فاتورته رسم دخوله وحده — كي يُرسلها الموظّف لمن يغادر مبكّراً.
  //    تُرفض في آخر البناء إن لم يكن عليه شيء.
  let presenceOnly = false;
  if (playerOrders.length === 0 && !((minCharge > 0 || water !== null) && played) && !openInvoice) {
    // فاتورةٌ مفتوحة سبق إصدارها (تكملة حدٍّ أدنى مثلاً) تبقى قابلةً للعرض ولو عُطّلت
    // الميزة لاحقاً — والمحصَّلة تُفتح بمعرّفها (invoiceId) لا من هنا
    if (!(await presentInActivity(db, activityId, playerId))) {
      return { error: priorPaid.length > 0 ? 'لا شيء مستحقّ — فواتيره محصَّلة' : 'لا طلبات لهذا اللاعب في هذه الفعاليّة' };
    }
    presenceOnly = true;
  }

  // البنود: المفتوحة للسطور، وكلّ بنود الليلة لمعرفة من وصله ماءٌ من طلبه
  const nightItems = nightOrders.length > 0
    ? await db.select().from(orderItems)
        .where(inArray(orderItems.orderId, nightOrders.map(o => o.id)))
    : [];
  const openIds = new Set(playerOrders.map(o => o.id));
  const items = nightItems.filter(it => openIds.has(it.orderId));

  const lines = mergeLines(items);
  const ordersTotal = playerOrders.reduce((s, o) => s + parseFloat(o.total), 0);
  const nightOrdersTotal = nightOrders.reduce((s, o) => s + parseFloat(o.total), 0);
  const priorWater = priorPaid.reduce((s, i) => s + (parseFloat(i.waterCharge || '0') || 0), 0);
  const priorTopup = priorPaid.reduce((s, i) => s + (parseFloat(i.minTopup || '0') || 0), 0);

  // 💧 ماءٌ واحدٌ تلقائيّاً في الليلة — إلا من وصله ماءٌ من طلبه (في أيّ فاتورة):
  //    مفرداً باسمه أو مكوّناً في عرض. وما حُصّل ماؤه سابقاً لا يُحمَّل ثانيةً.
  let waterCharge = 0;
  // (الماء لمن طلب أو لعب أو له فاتورةٌ مفتوحة — لا للحاضر وحده، كدفتر الليلة)
  if (water && priorWater === 0 && !presenceOnly) {
    const hasWater = nightItems.some(it =>
      it.nameSnapshot === water.name ||
      (Array.isArray(it.componentsSnapshot)
        && (it.componentsSnapshot as any[]).some(c => String(c?.name || '') === water.name)));
    waterCharge = hasWater ? 0 : water.price;
  }

  // 🎟️ مشروب الولاء: خصمٌ من النادي (حصّته) — يُحتسب ضمن الحدّ الأدنى كما الماء (الاستهلاك حصل فعلاً)
  let loyaltyDiscount = 0; let loyaltyRewardId: number | null = null; let loyaltyItemName: string | null = null;
  if (playerOrders.length > 0) {
    try {
      const { drinkDiscountFor } = await import('./loyalty.service.js');
      const d = await drinkDiscountFor(db, playerId, locationId, activityId);
      loyaltyDiscount = d.discount; loyaltyRewardId = d.rewardId; loyaltyItemName = d.itemName;
    } catch { /* بلا خصم */ }
  }

  // 💳 التكملة على مستوى الليلة: الماء استهلاكٌ فعليّ فيُحتسب ضمن الحدّ — الدخوليّة خارج المقارنة.
  //    ما حُصّل من تكملةٍ سابقاً يُطرح، فلا يدفع اللاعب الحدّ مرّتين في ليلةٍ واحدة.
  const nightRequired = minCharge > 0 && played
    ? Math.max(0, minCharge - (nightOrdersTotal + waterCharge + priorWater)) : 0;
  const minTopup = Math.max(0, nightRequired - priorTopup);

  // هويّة اللاعب وحجزه: من الطلبات إن وُجدت، وإلا من حسابه وحجزه في الفعاليّة
  let playerName = playerOrders[0]?.playerName || nightOrders[0]?.playerName || '';
  let bookingId: number | null = playerOrders[0]?.bookingId ?? nightOrders[0]?.bookingId ?? null;
  if (nightOrders.length === 0) {
    const [p] = await db.select({ name: players.name }).from(players)
      .where(eq(players.id, playerId)).limit(1);
    playerName = p?.name || `لاعب #${playerId}`;
    const [bk] = await db.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.activityId, activityId), eq(bookings.playerId, playerId), isNull(bookings.deletedAt)))
      .limit(1);
    bookingId = bk?.id ?? null;
  }

  // رسوم اللعبة: مفعَّلة على الفعاليّة + للحجز غير المدفوع فقط (المدفوع حُصّل من مساره)
  let gameFeeApplied = false;
  let gameFeeAmount = 0;
  if (act.addGameFee === true && bookingId) {
    const [bk] = await db.select({ isPaid: bookings.isPaid, isFree: bookings.isFree })
      .from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (bk && bk.isPaid !== true && bk.isFree !== true) {
      gameFeeApplied = true;
      // 💸 سعر الحجز المقفول (سعر الدون المبكّر) وإلّا سعر الفعاليّة
      let ep: number | null = null;
      try { const { entryPriceForBooking } = await import('./early-price.service.js'); ep = await entryPriceForBooking(bookingId); } catch { /* سعر الفعاليّة */ }
      gameFeeAmount = ep != null ? ep : parseFloat(act.basePrice || '0');
    }
  }

  const grandTotal = Math.max(0, ordersTotal + waterCharge + minTopup + gameFeeAmount - loyaltyDiscount);
  if (presenceOnly && grandTotal <= 0) {
    return { error: priorPaid.length > 0 ? 'لا شيء مستحقّ — فواتيره محصَّلة' : 'لا شيء مستحقّ على هذا اللاعب بعد' };
  }

  return {
    locationId,
    locationName: loc?.name || '',
    activityId,
    activityName: act.name,
    activityDate: act.date,
    playerId,
    playerName,
    bookingId,
    lines,
    ordersCount: playerOrders.length,
    ordersTotal,
    minTopup,
    waterCharge,
    loyaltyDiscount,
    loyaltyRewardId,
    loyaltyItemName,
    gameFeeApplied,
    gameFeeAmount,
    grandTotal,
    orderIds: playerOrders.map(o => o.id),
    seat: await seatOf(db, activityId, playerId),
    snapshotInvoiceId: null,
    paidAt: null,
    payment: paymentInfoOf(loc),
  };
}

/** دمج البنود المتطابقة (نفس الصنف ونفس سعر اللقطة ونفس الخيارات) عبر الطلبات */
function mergeLines(items: (typeof orderItems.$inferSelect)[]): InvoiceLine[] {
  const merged = new Map<string, InvoiceLine>();
  for (const it of items) {
    const opts = (Array.isArray(it.optionsSnapshot) ? it.optionsSnapshot as any[] : [])
      .map(o => ({ group: String(o?.group || ''), value: String(o?.value || '') })).filter(o => o.value);
    // ⚙️ الخيارات جزءٌ من هويّة السطر: «أرجيلة/تفاحتين» و«أرجيلة/عنب» سطران
    // منفصلان في الفاتورة وإن تساوى سعرهما — الزبون يجب أن يقرأ ما طلبه.
    const key = `${it.nameSnapshot}|${it.unitPriceSnapshot}|${opts.map(o => `${o.group}:${o.value}`).join(',')}`;
    const prev = merged.get(key);
    const unitPrice = parseFloat(it.unitPriceSnapshot);
    if (prev) { prev.quantity += it.quantity; prev.lineTotal = prev.quantity * unitPrice; }
    else merged.set(key, {
      name: it.nameSnapshot, quantity: it.quantity, unitPrice, lineTotal: unitPrice * it.quantity,
      components: (Array.isArray(it.componentsSnapshot) ? it.componentsSnapshot as any[] : [])
        .map(c => ({
          name: String(c?.name || ''), qty: Number(c?.qty) || 1,
          options: (Array.isArray(c?.options) ? c.options : [])
            .map((o: any) => ({ group: String(o?.group || ''), value: String(o?.value || '') })).filter((o: any) => o.value),
        })).filter(c => c.name),
      options: opts,
    });
  }
  return [...merged.values()];
}

// يثبّت رقم الفاتورة: يعيد رقم الفاتورة **المفتوحة** لنفس (مكان، فعاليّة، لاعب) أو يصدر التالي.
// المحصَّلة لا تُفتح ثانيةً: طلبٌ بعد التحصيل يأخذ رقماً جديداً.
// قفل استشاريّ لكل مكان يمنع سباق MAX+1 عند طباعة جهازين معاً.
export async function issueInvoiceNumber(
  db: Database, data: InvoiceData, printedBy: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'fnb_invoice_' + data.locationId}))`);

    // 🔴 لقطةٌ محصَّلة: الختم وحده يُحدَّث — مبالغها مجمَّدة (data بُنيت منها أصلاً)
    if (data.snapshotInvoiceId) {
      const [snap] = await tx.update(orderInvoices).set({ printedBy, printedAt: new Date() } as any)
        .where(eq(orderInvoices.id, data.snapshotInvoiceId)).returning({ no: orderInvoices.invoiceNo });
      return snap.no;
    }

    const [existing] = await tx.select().from(orderInvoices).where(and(
      eq(orderInvoices.locationId, data.locationId),
      eq(orderInvoices.activityId, data.activityId),
      eq(orderInvoices.playerId, data.playerId),
      eq(orderInvoices.isPaid, false),
    )).limit(1);

    if (existing) {
      // إعادة طباعة فاتورةٍ غير محصَّلة: نحدّث المجاميع والختم بلا رقم جديد
      await tx.update(orderInvoices).set({
        ordersTotal: data.ordersTotal.toFixed(2),
        minTopup: data.minTopup.toFixed(2),
        waterCharge: data.waterCharge.toFixed(2),
        loyaltyDiscount: data.loyaltyDiscount.toFixed(2),
        loyaltyRewardId: data.loyaltyRewardId,
        gameFeeApplied: data.gameFeeApplied,
        gameFeeAmount: data.gameFeeAmount.toFixed(2),
        grandTotal: data.grandTotal.toFixed(2),
        printedBy,
        printedAt: new Date(),
      } as any).where(eq(orderInvoices.id, existing.id));
      return existing.invoiceNo;
    }

    // execute يعيد {rows} مع درايفر pg ومصفوفةً مع postgres-js — نتعامل مع الشكلين
    const result: any = await tx.execute(sql`
      SELECT COALESCE(MAX(invoice_no), 0) + 1 AS next FROM order_invoices WHERE location_id = ${data.locationId}
    `);
    const next = Number((result?.rows?.[0] ?? result?.[0])?.next ?? 1);

    await tx.insert(orderInvoices).values({
      invoiceNo: next,
      locationId: data.locationId,
      activityId: data.activityId,
      playerId: data.playerId,
      bookingId: data.bookingId,
      ordersTotal: data.ordersTotal.toFixed(2),
      minTopup: data.minTopup.toFixed(2),
      waterCharge: data.waterCharge.toFixed(2),
      loyaltyDiscount: data.loyaltyDiscount.toFixed(2),
      loyaltyRewardId: data.loyaltyRewardId,
      gameFeeApplied: data.gameFeeApplied,
      gameFeeAmount: data.gameFeeAmount.toFixed(2),
      grandTotal: data.grandTotal.toFixed(2),
      printedBy,
    } as any);
    return next;
  });
}

// 🗂️ القالب «ملفّ القضيّة» (A6 + إيصال 80مم) في ملفّه — يُعاد تصديره كي تبقى الاستيرادات كما هي
export { invoiceHtml, mergeInvoicePages, receiptHtml, nightRecordOf, invoiceImageHtml } from './fnb-invoice-template.js';
export type { NightRecord } from './fnb-invoice-template.js';
