// ══════════════════════════════════════════════════════
// ⚖️ تقرير الميزان المحاسبي — Accounting Balance
// دخل ومصاريف فترة زمنية (أساس تاريخ النشاط، نقدي فقط).
// تفصيل بالأنشطة + مصاريف عامة + مصاريف لاعبين + تكاليف تأسيسية.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { activities, bookings, costs, foundationalCosts, locations } from '../../schemas/admin.schema.js';
import { players } from '../../schemas/player.schema.js';
import { paidRevenue, unpaidReceivable, num, pct, rangeDates, rangeLabel, notTestActivity, notTestCost } from '../helpers.js';

const SCOPE_AR: Record<string, string> = {
  general: 'مصاريف عامة', activity: 'مصاريف أنشطة', player: 'مصاريف لاعبين', equipment: 'معدات', other: 'أخرى',
};

export const accountingBalanceReport: ReportDefinition = {
  key: 'accounting-balance',
  titleAr: 'الميزان المحاسبي',
  descriptionAr: 'دخل ومصاريف فترة زمنية (أساس تاريخ النشاط) مع تفصيل بالأنشطة والمصاريف العامة والمرتبطة باللاعبين.',
  icon: '⚖️',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'locationId', type: 'location-picker', labelAr: 'الموقع (اختياري)', required: false, optionsSource: 'locations' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const locId = params.locationId as number | undefined;

    const actDateCond = and(
      isNull(activities.deletedAt),
      gte(activities.date, from),
      lte(activities.date, to),
      locId ? eq(activities.locationId, locId) : undefined,
      notTestActivity,   // استبعاد أنشطة أماكن الاختبار
    );

    // ── دخل الفترة (أساس تاريخ النشاط) ──
    const [inc] = await db.select({
      income: paidRevenue(), receivables: unpaidReceivable(),
    }).from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .where(actDateCond);

    // ── تفصيل لكل نشاط ──
    const perActivity = await db.select({
      id: activities.id,
      name: activities.name, date: activities.date, status: activities.status,
      locationName: locations.name,
      income: paidRevenue(), receivables: unpaidReceivable(),
      attendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      maxCapacity: activities.maxCapacity,
    }).from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(actDateCond)
      .groupBy(activities.id, activities.name, activities.date, activities.status, activities.maxCapacity, locations.name)
      .orderBy(desc(activities.date));

    // تكاليف كل نشاط (خريطة activityId → مبلغ) ضمن نفس الفترة
    const actCostRows = await db.select({
      activityId: costs.activityId,
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs)
      .innerJoin(activities, eq(costs.activityId, activities.id))
      .where(and(isNull(costs.deletedAt), actDateCond))
      .groupBy(costs.activityId);
    const actCostMap = new Map(actCostRows.map((c) => [c.activityId, num(c.total)]));

    // ── المصاريف خلال الفترة (حسب تاريخ المصروف) مصنّفة ──
    const costsByScope = await db.select({
      scope: costs.scope,
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(costs)
      .where(and(isNull(costs.deletedAt), gte(costs.date, from), lte(costs.date, to), notTestCost))
      .groupBy(costs.scope);

    const operationalTotal = costsByScope.reduce((s, c) => s + num(c.total), 0);

    // ── مصاريف مرتبطة بلاعبين (تفصيل بالاسم) ──
    const playerCosts = await db.select({
      playerName: players.name, item: costs.item, amount: costs.amount, date: costs.date,
    }).from(costs)
      .leftJoin(players, eq(costs.playerId, players.id))
      .where(and(isNull(costs.deletedAt), eq(costs.scope, 'player'), gte(costs.date, from), lte(costs.date, to)))
      .orderBy(desc(costs.date));

    // ── التكاليف التأسيسية خلال الفترة ──
    const [found] = await db.select({
      total: sql<number>`COALESCE(SUM(${foundationalCosts.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(foundationalCosts)
      .where(and(isNull(foundationalCosts.deletedAt), gte(foundationalCosts.date, from), lte(foundationalCosts.date, to)));

    const income = num(inc?.income);
    const receivables = num(inc?.receivables);
    const foundationalTotal = num(found?.total);
    const totalExpenses = operationalTotal + foundationalTotal;
    const net = income - totalExpenses;
    const margin = pct(net, income);

    return {
      header: {
        titleAr: 'الميزان المحاسبي',
        subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range), ...(locId ? ['مُرشّح حسب موقع'] : [])],
      },
      sections: [
        {
          type: 'kpis',
          items: [
            { icon: '💰', labelAr: 'الإيرادات المحصّلة', value: income, format: 'currency', tone: 'green' },
            { icon: '💸', labelAr: 'التكاليف التشغيلية', value: operationalTotal, format: 'currency', tone: 'amber' },
            { icon: '🏗️', labelAr: 'التكاليف التأسيسية', value: foundationalTotal, format: 'currency', tone: 'purple' },
            { icon: '📈', labelAr: 'صافي الربح', value: net, format: 'currency', tone: net >= 0 ? 'green' : 'red' },
            { icon: '％', labelAr: 'هامش الربح', value: margin, format: 'percent', tone: 'blue' },
          ],
        },
        {
          type: 'keyvalue', titleAr: 'المستحقات (خارج الصافي)',
          items: [{ labelAr: 'إجمالي المستحقات غير المحصّلة', value: receivables, format: 'currency' }],
        },
        {
          type: 'table', titleAr: 'أداء الأنشطة',
          columns: [
            { key: 'name', labelAr: 'النشاط' },
            { key: 'locationName', labelAr: 'الموقع' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'income', labelAr: 'الدخل', format: 'currency' },
            { key: 'cost', labelAr: 'المصاريف', format: 'currency' },
            { key: 'net', labelAr: 'الصافي', format: 'currency' },
            { key: 'occupancy', labelAr: 'الإشغال', format: 'percent', align: 'center' },
          ],
          rows: perActivity.map((a) => {
            const inc2 = num(a.income);
            const cost = actCostMap.get(a.id) ?? 0;
            return {
              name: a.name, locationName: a.locationName ?? '—', date: a.date,
              income: inc2, cost, net: inc2 - cost,
              occupancy: pct(num(a.attendees), num(a.maxCapacity)),
            };
          }),
          totalsRow: { name: 'الإجمالي', income, cost: actCostRows.reduce((s, c) => s + num(c.total), 0), net: income - actCostRows.reduce((s, c) => s + num(c.total), 0) },
          emptyAr: 'لا توجد أنشطة في هذه الفترة',
        },
        {
          type: 'table', titleAr: 'المصاريف حسب النوع',
          columns: [
            { key: 'scopeAr', labelAr: 'النوع' },
            { key: 'count', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'total', labelAr: 'المبلغ', format: 'currency' },
          ],
          rows: costsByScope.map((c) => ({ scopeAr: SCOPE_AR[c.scope ?? 'general'] ?? c.scope, count: c.count, total: num(c.total) })),
          totalsRow: { scopeAr: 'الإجمالي التشغيلي', total: operationalTotal },
          emptyAr: 'لا توجد مصاريف في هذه الفترة',
        },
        {
          type: 'table', titleAr: 'المصاريف المرتبطة بلاعبين',
          columns: [
            { key: 'playerName', labelAr: 'اللاعب' },
            { key: 'item', labelAr: 'البند' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
          ],
          rows: playerCosts.map((p) => ({ ...p, playerName: p.playerName ?? '—' })),
          emptyAr: 'لا توجد مصاريف مرتبطة بلاعبين',
        },
      ],
      totals: [
        { labelAr: 'الإيرادات المحصّلة', value: income, format: 'currency', tone: 'green' },
        { labelAr: 'إجمالي المصاريف', value: totalExpenses, format: 'currency', tone: 'red' },
        { labelAr: 'صافي الربح', value: net, format: 'currency', tone: net >= 0 ? 'green' : 'red' },
      ],
    };
  },
};
