// ══════════════════════════════════════════════════════
// 🍽️ تقرير تسوية المنيو مع المكان — F&B Settlement
// 🎯 توحيد 2026-08-06: يقرأ لقطات بنود الطلبات (unit_price_snapshot / club_share_snapshot)
// وهي المصدر الوحيد للحقيقة — تعديل المنيو أو حذفه لاحقاً لا يغيّر تسوية فترةٍ ماضية.
// يسدّ الفجوة القديمة: حصّة النادي كانت تُلتقط ولا يقرأها أيّ تقرير.
// حصّة المكان = السعر − حصّة النادي (ضمنيّة بالتعريف). الطلبات الملغاة مستبعدة.
// ══════════════════════════════════════════════════════

import { and, eq, ne, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { orders, orderItems, orderInvoices } from '../../schemas/fnb.schema.js';
import { activities, locations, staff } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel, notTestActivity } from '../helpers.js';

// Σ (سعر اللقطة × الكمّية) و Σ (حصّة اللقطة × الكمّية) — تُستخدم في كل تجميعات التقرير
const grossExpr = sql<number>`COALESCE(SUM(${orderItems.unitPriceSnapshot}::numeric * ${orderItems.quantity}), 0)`;
const clubExpr = sql<number>`COALESCE(SUM(${orderItems.clubShareSnapshot}::numeric * ${orderItems.quantity}), 0)`;

export const fnbSettlementReport: ReportDefinition = {
  key: 'fnb-settlement',
  titleAr: 'تسوية المنيو مع المكان',
  descriptionAr: 'مبيعات طلبات المنيو خلال فترة، مقسومةً إلى حصّة النادي وحصّة المكان من لقطات البنود، مع حالة تحصيل الفواتير (أساس تاريخ النشاط، الطلبات الملغاة مستبعدة).',
  icon: '🍽️',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant', 'location_owner'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'locationId', type: 'location-picker', labelAr: 'المكان (اختياري)', required: false, optionsSource: 'locations' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);

    // 🔒 عزل المكان: التوكن لا يحمل locationId (كما في requireVenuePermission) — يُقرأ من
    // قاعدة البيانات في كلّ تنفيذ. حساب المكان يرى مكانه حصراً مهما مرّر من معاملات،
    // و«مكانٌ غير مربوط» يعني لا شيء (وليس كلّ الأماكن).
    let locId = params.locationId as number | undefined;
    if (user.role === 'location_owner') {
      const [row] = await db.select({ locationId: staff.locationId })
        .from(staff).where(eq(staff.id, user.id)).limit(1);
      locId = row?.locationId ?? -1;
    }

    const scope = and(
      ne(orders.status, 'cancelled'),
      isNull(activities.deletedAt),
      gte(activities.date, from),
      lte(activities.date, to),
      locId ? eq(orders.locationId, locId) : undefined,
      notTestActivity,
    );

    // ── إجماليّات الفترة ──
    const [totals] = await db.select({
      gross: grossExpr,
      club: clubExpr,
      ordersCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
      playersCount: sql<number>`COUNT(DISTINCT ${orders.playerId})::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(activities, eq(orders.activityId, activities.id))
      .where(scope);

    const gross = num(totals?.gross);
    const club = num(totals?.club);
    const venue = gross - club;

    // ── حسب المكان ──
    const byLocation = await db.select({
      locationName: locations.name,
      gross: grossExpr,
      club: clubExpr,
      ordersCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(activities, eq(orders.activityId, activities.id))
      .leftJoin(locations, eq(orders.locationId, locations.id))
      .where(scope)
      .groupBy(locations.name)
      .orderBy(desc(grossExpr));

    // ── حسب الفعاليّة ──
    const byActivity = await db.select({
      activityName: activities.name,
      activityDate: activities.date,
      locationName: locations.name,
      gross: grossExpr,
      club: clubExpr,
      ordersCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(activities, eq(orders.activityId, activities.id))
      .leftJoin(locations, eq(orders.locationId, locations.id))
      .where(scope)
      .groupBy(activities.id, activities.name, activities.date, locations.name)
      .orderBy(desc(activities.date));

    // ── حسب الصنف (اسم اللقطة — الصنف قد يكون حُذف من المنيو) ──
    const byItem = await db.select({
      name: orderItems.nameSnapshot,
      qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
      gross: grossExpr,
      club: clubExpr,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(activities, eq(orders.activityId, activities.id))
      .where(scope)
      .groupBy(orderItems.nameSnapshot)
      .orderBy(desc(grossExpr));

    // ── حالة تحصيل الفواتير (القرار 4: التحصيل يُسجَّل على الفاتورة) ──
    const [inv] = await db.select({
      issued: sql<number>`COUNT(*)::int`,
      paid: sql<number>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = true THEN 1 ELSE 0 END), 0)::int`,
      paidTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = true THEN ${orderInvoices.grandTotal}::numeric ELSE 0 END), 0)`,
      unpaidTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = false THEN ${orderInvoices.grandTotal}::numeric ELSE 0 END), 0)`,
      gameFees: sql<number>`COALESCE(SUM(CASE WHEN ${orderInvoices.isPaid} = true THEN ${orderInvoices.gameFeeAmount}::numeric ELSE 0 END), 0)`,
    }).from(orderInvoices)
      .innerJoin(activities, eq(orderInvoices.activityId, activities.id))
      .where(and(
        isNull(activities.deletedAt),
        gte(activities.date, from),
        lte(activities.date, to),
        locId ? eq(orderInvoices.locationId, locId) : undefined,
        notTestActivity,
      ));

    const isVenueUser = user.role === 'location_owner';

    return {
      header: {
        titleAr: 'تسوية المنيو مع المكان',
        subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'JOD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis',
          items: [
            { icon: '🍽️', labelAr: 'مبيعات المنيو', value: gross, format: 'currency', tone: 'blue' },
            { icon: '🏪', labelAr: 'حصّة المكان', value: venue, format: 'currency', tone: 'green' },
            ...(isVenueUser ? [] : [{ icon: '💰', labelAr: 'حصّة النادي', value: club, format: 'currency' as const, tone: 'purple' as const }]),
            { icon: '🧾', labelAr: 'عدد الطلبات', value: num(totals?.ordersCount), format: 'number', tone: 'amber' },
            { icon: '👥', labelAr: 'لاعبون طلبوا', value: num(totals?.playersCount), format: 'number', tone: 'blue' },
          ],
        },
        {
          type: 'table', titleAr: 'حسب المكان',
          columns: [
            { key: 'locationName', labelAr: 'المكان' },
            { key: 'ordersCount', labelAr: 'الطلبات', format: 'number', align: 'center' },
            { key: 'gross', labelAr: 'المبيعات', format: 'currency' },
            { key: 'venue', labelAr: 'حصّة المكان', format: 'currency' },
            ...(isVenueUser ? [] : [{ key: 'club', labelAr: 'حصّة النادي', format: 'currency' as const }]),
          ],
          rows: byLocation.map(r => ({
            locationName: r.locationName ?? 'غير محدد',
            ordersCount: num(r.ordersCount),
            gross: num(r.gross),
            club: num(r.club),
            venue: num(r.gross) - num(r.club),
          })),
          totalsRow: { locationName: 'الإجمالي', ordersCount: num(totals?.ordersCount), gross, venue, club },
          emptyAr: 'لا طلبات منيو في هذه الفترة',
        },
        {
          type: 'table', titleAr: 'حسب الفعاليّة',
          columns: [
            { key: 'activityName', labelAr: 'الفعاليّة' },
            { key: 'activityDate', labelAr: 'التاريخ', format: 'date' },
            { key: 'locationName', labelAr: 'المكان' },
            { key: 'ordersCount', labelAr: 'الطلبات', format: 'number', align: 'center' },
            { key: 'gross', labelAr: 'المبيعات', format: 'currency' },
            { key: 'venue', labelAr: 'حصّة المكان', format: 'currency' },
            ...(isVenueUser ? [] : [{ key: 'club', labelAr: 'حصّة النادي', format: 'currency' as const }]),
          ],
          rows: byActivity.map(r => ({
            activityName: r.activityName,
            activityDate: r.activityDate,
            locationName: r.locationName ?? 'غير محدد',
            ordersCount: num(r.ordersCount),
            gross: num(r.gross),
            club: num(r.club),
            venue: num(r.gross) - num(r.club),
          })),
          emptyAr: 'لا فعاليّات بطلبات في هذه الفترة',
        },
        {
          type: 'table', titleAr: 'حسب الصنف (الأكثر مبيعاً)',
          columns: [
            { key: 'name', labelAr: 'الصنف' },
            { key: 'qty', labelAr: 'الكمّية', format: 'number', align: 'center' },
            { key: 'gross', labelAr: 'المبيعات', format: 'currency' },
            { key: 'venue', labelAr: 'حصّة المكان', format: 'currency' },
            ...(isVenueUser ? [] : [{ key: 'club', labelAr: 'حصّة النادي', format: 'currency' as const }]),
          ],
          rows: byItem.map(r => ({
            name: r.name,
            qty: num(r.qty),
            gross: num(r.gross),
            club: num(r.club),
            venue: num(r.gross) - num(r.club),
          })),
          totalsRow: { name: 'الإجمالي', gross, venue, club },
          emptyAr: 'لا أصناف مباعة في هذه الفترة',
        },
        {
          type: 'kpis', titleAr: 'تحصيل الفواتير',
          items: [
            { icon: '🧾', labelAr: 'فواتير صادرة', value: num(inv?.issued), format: 'number', tone: 'blue' },
            { icon: '✅', labelAr: 'محصَّلة', value: num(inv?.paid), format: 'number', tone: 'green' },
            { icon: '💵', labelAr: 'مبلغ محصَّل', value: num(inv?.paidTotal), format: 'currency', tone: 'green' },
            { icon: '⏳', labelAr: 'غير محصَّل', value: num(inv?.unpaidTotal), format: 'currency', tone: 'amber' },
            { icon: '🎮', labelAr: 'رسوم لعبة محصَّلة عند المكان', value: num(inv?.gameFees), format: 'currency', tone: 'purple' },
          ],
        },
      ],
      totals: [
        { labelAr: 'حصّة المكان', value: venue, format: 'currency', tone: 'green' },
        ...(isVenueUser ? [] : [{ labelAr: 'حصّة النادي', value: club, format: 'currency' as const, tone: 'purple' as const }]),
      ],
    };
  },
};
