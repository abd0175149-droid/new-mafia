// ══════════════════════════════════════════════════════
// 📈 تقرير اتجاه الإيرادات — Revenue Trend
// دخل مقابل مصاريف عبر الزمن (شهري/يومي)، أساس تاريخ النشاط للدخل.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { activities, bookings, costs } from '../../schemas/admin.schema.js';
import { paidRevenue, num, rangeDates, rangeLabel, notTestActivity, notTestCost } from '../helpers.js';

export const revenueTrendReport: ReportDefinition = {
  key: 'revenue-trend',
  titleAr: 'اتجاه الإيرادات',
  descriptionAr: 'تطوّر الدخل مقابل المصاريف عبر الزمن (شهري أو يومي).',
  icon: '📈',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'granularity', type: 'select', labelAr: 'التقسيم', required: false, defaultValue: 'month',
      options: [{ value: 'month', labelAr: 'شهري' }, { value: 'day', labelAr: 'يومي' }] },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const fmt = params.granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';

    const revByPeriod = await db.select({
      period: sql<string>`TO_CHAR(${activities.date}, ${sql.raw(`'${fmt}'`)})`,
      revenue: paidRevenue(),
    }).from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .where(and(isNull(activities.deletedAt), gte(activities.date, from), lte(activities.date, to), notTestActivity))
      .groupBy(sql`TO_CHAR(${activities.date}, ${sql.raw(`'${fmt}'`)})`)
      .orderBy(sql`TO_CHAR(${activities.date}, ${sql.raw(`'${fmt}'`)})`);

    const costByPeriod = await db.select({
      period: sql<string>`TO_CHAR(${costs.date}, ${sql.raw(`'${fmt}'`)})`,
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs)
      .where(and(isNull(costs.deletedAt), gte(costs.date, from), lte(costs.date, to), notTestCost))
      .groupBy(sql`TO_CHAR(${costs.date}, ${sql.raw(`'${fmt}'`)})`);

    const costMap = new Map(costByPeriod.map((c) => [c.period, num(c.total)]));

    const periods = Array.from(new Set([...revByPeriod.map((r) => r.period), ...costByPeriod.map((c) => c.period)])).sort();
    const rows = periods.map((period) => {
      const revenue = num(revByPeriod.find((r) => r.period === period)?.revenue);
      const cost = costMap.get(period) ?? 0;
      return { period, revenue, cost, net: revenue - cost };
    });

    const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);

    return {
      header: {
        titleAr: 'اتجاه الإيرادات', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range), params.granularity === 'day' ? 'يومي' : 'شهري'],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '💰', labelAr: 'إجمالي الدخل', value: totalRev, format: 'currency', tone: 'green' },
            { icon: '💸', labelAr: 'إجمالي المصاريف', value: totalCost, format: 'currency', tone: 'red' },
            { icon: '📈', labelAr: 'الصافي', value: totalRev - totalCost, format: 'currency', tone: (totalRev - totalCost) >= 0 ? 'green' : 'red' },
          ],
        },
        {
          type: 'table', titleAr: 'التطوّر الزمني',
          columns: [
            { key: 'period', labelAr: 'الفترة' },
            { key: 'revenue', labelAr: 'الدخل', format: 'currency' },
            { key: 'cost', labelAr: 'المصاريف', format: 'currency' },
            { key: 'net', labelAr: 'الصافي', format: 'currency' },
          ],
          rows,
          totalsRow: { period: 'الإجمالي', revenue: totalRev, cost: totalCost, net: totalRev - totalCost },
          emptyAr: 'لا توجد بيانات في هذه الفترة',
        },
      ],
      totals: [{ labelAr: 'صافي الفترة', value: totalRev - totalCost, format: 'currency', tone: (totalRev - totalCost) >= 0 ? 'green' : 'red' }],
    };
  },
};
