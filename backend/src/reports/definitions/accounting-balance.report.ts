// ══════════════════════════════════════════════════════
// ⚖️ تقرير الميزان المحاسبي — Accounting Balance
// دخل ومصاريف فترة زمنية (أساس تاريخ النشاط، نقدي فقط).
// تفصيل بالأنشطة + مصاريف عامة + مصاريف لاعبين + تكاليف تأسيسية.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { activities, bookings, costs, locations } from '../../schemas/admin.schema.js';
import { players } from '../../schemas/player.schema.js';
import { paidRevenue, unpaidReceivable, unpaidCount, num, pct, rangeDates, rangeLabel, notTestActivity, notTestCost } from '../helpers.js';

const SCOPE_AR: Record<string, string> = {
  general: 'عام', activity: 'نشاط', player: 'لاعب', equipment: 'معدات', other: 'أخرى',
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
      income: paidRevenue(), receivables: unpaidReceivable(), unpaidBookings: unpaidCount(),
    }).from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .where(actDateCond);

    // ── تفصيل لكل نشاط ──
    const perActivity = await db.select({
      id: activities.id,
      name: activities.name, date: activities.date, status: activities.status,
      locationName: locations.name,
      income: paidRevenue(), receivables: unpaidReceivable(),
    }).from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(actDateCond)
      .groupBy(activities.id, activities.name, activities.date, activities.status, locations.name)
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

    // ── المصاريف خلال الفترة — تفصيل كل مصروف (البند/النوع/المبلغ/التاريخ) ──
    const expenseRows = await db.select({
      item: costs.item, scope: costs.scope, amount: costs.amount, date: costs.date, paidBy: costs.paidBy,
      playerName: players.name, activityName: activities.name,
    }).from(costs)
      .leftJoin(players, eq(costs.playerId, players.id))
      .leftJoin(activities, eq(costs.activityId, activities.id))
      .where(and(isNull(costs.deletedAt), gte(costs.date, from), lte(costs.date, to), notTestCost))
      .orderBy(desc(costs.date));

    const operationalTotal = expenseRows.reduce((s, c) => s + num(c.amount), 0);

    // ── مصاريف مرتبطة بلاعبين (قد تكون مرتبطة بنشاط أيضاً أو عامة على اللاعب) ──
    const playerCosts = expenseRows.filter((c) => c.scope === 'player');

    const income = num(inc?.income);
    const receivables = num(inc?.receivables);
    const unpaidBookings = num(inc?.unpaidBookings);
    const totalExpenses = operationalTotal;   // التكاليف التأسيسية خارج هذا التقرير (لها تقرير مستقل)
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
            { icon: '📈', labelAr: 'صافي الربح', value: net, format: 'currency', tone: net >= 0 ? 'green' : 'red' },
            { icon: '％', labelAr: 'هامش الربح', value: margin, format: 'percent', tone: 'blue' },
          ],
        },
        {
          type: 'keyvalue', titleAr: 'الحجوزات غير المدفوعة (خارج الصافي)',
          items: [
            { labelAr: 'عدد الحجوزات غير المدفوعة', value: unpaidBookings, format: 'number' },
            { labelAr: 'مبالغ مسجّلة عليها ولم تُحصَّل', value: receivables, format: 'currency' },
          ],
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
          ],
          rows: perActivity.map((a) => {
            const inc2 = num(a.income);
            const cost = actCostMap.get(a.id) ?? 0;
            return {
              name: a.name, locationName: a.locationName ?? '—', date: a.date,
              income: inc2, cost, net: inc2 - cost,
            };
          }),
          totalsRow: { name: 'الإجمالي', income, cost: actCostRows.reduce((s, c) => s + num(c.total), 0), net: income - actCostRows.reduce((s, c) => s + num(c.total), 0) },
          emptyAr: 'لا توجد أنشطة في هذه الفترة',
        },
        {
          type: 'table', titleAr: 'تفاصيل المصاريف',
          columns: [
            { key: 'item', labelAr: 'البند' },
            { key: 'scopeAr', labelAr: 'النوع', format: 'badge' },
            { key: 'linkAr', labelAr: 'الارتباط' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'paidBy', labelAr: 'دفعها' },
          ],
          rows: expenseRows.map((c) => ({
            item: c.item,
            scopeAr: SCOPE_AR[c.scope ?? 'general'] ?? c.scope,
            linkAr: c.scope === 'player'
              ? `${c.playerName ?? '—'}${c.activityName ? ` (${c.activityName})` : ''}`
              : (c.activityName ?? '—'),
            amount: num(c.amount), date: c.date, paidBy: c.paidBy || '—',
          })),
          totalsRow: { item: 'الإجمالي التشغيلي', amount: operationalTotal },
          emptyAr: 'لا توجد مصاريف في هذه الفترة',
        },
        {
          type: 'table', titleAr: 'المصاريف المرتبطة بلاعبين',
          columns: [
            { key: 'playerName', labelAr: 'اللاعب' },
            { key: 'item', labelAr: 'البند' },
            { key: 'activityAr', labelAr: 'النشاط' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
          ],
          rows: playerCosts.map((p) => ({
            playerName: p.playerName ?? '—', item: p.item,
            activityAr: p.activityName ?? 'غير مرتبط بنشاط',
            amount: num(p.amount), date: p.date,
          })),
          totalsRow: { playerName: 'الإجمالي', amount: playerCosts.reduce((s, c) => s + num(c.amount), 0) },
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
