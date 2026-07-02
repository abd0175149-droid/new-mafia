// ══════════════════════════════════════════════════════
// 🧾 تقرير المصاريف حسب الفئة — Expenses by Category
// تجميع المصاريف حسب البند والنطاق خلال فترة.
// ══════════════════════════════════════════════════════

import { and, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { costs } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel } from '../helpers.js';

const SCOPE_AR: Record<string, string> = {
  general: 'عام', activity: 'نشاط', player: 'لاعب', equipment: 'معدات', other: 'أخرى',
};

export const expensesByCategoryReport: ReportDefinition = {
  key: 'expenses-by-category',
  titleAr: 'المصاريف حسب الفئة',
  descriptionAr: 'تجميع المصاريف حسب البند والنطاق خلال فترة زمنية.',
  icon: '🧾',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);

    const byItem = await db.select({
      item: costs.item, scope: costs.scope,
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(costs)
      .where(and(isNull(costs.deletedAt), gte(costs.date, from), lte(costs.date, to)))
      .groupBy(costs.item, costs.scope)
      .orderBy(desc(sql`COALESCE(SUM(${costs.amount}::numeric), 0)`));

    const byScope = await db.select({
      scope: costs.scope,
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs)
      .where(and(isNull(costs.deletedAt), gte(costs.date, from), lte(costs.date, to)))
      .groupBy(costs.scope);

    const grand = byItem.reduce((s, r) => s + num(r.total), 0);

    return {
      header: {
        titleAr: 'المصاريف حسب الفئة', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '💸', labelAr: 'إجمالي المصاريف', value: grand, format: 'currency', tone: 'red' },
            { icon: '🗂️', labelAr: 'عدد البنود', value: byItem.length, format: 'number', tone: 'amber' },
          ],
        },
        {
          type: 'table', titleAr: 'حسب النطاق',
          columns: [
            { key: 'scopeAr', labelAr: 'النطاق' },
            { key: 'total', labelAr: 'المبلغ', format: 'currency' },
          ],
          rows: byScope.map((r) => ({ scopeAr: SCOPE_AR[r.scope ?? 'general'] ?? r.scope, total: num(r.total) })),
          totalsRow: { scopeAr: 'الإجمالي', total: grand },
        },
        {
          type: 'table', titleAr: 'حسب البند',
          columns: [
            { key: 'item', labelAr: 'البند' },
            { key: 'scopeAr', labelAr: 'النطاق', format: 'badge' },
            { key: 'count', labelAr: 'مرّات', format: 'number', align: 'center' },
            { key: 'total', labelAr: 'المبلغ', format: 'currency' },
          ],
          rows: byItem.map((r) => ({ item: r.item, scopeAr: SCOPE_AR[r.scope ?? 'general'] ?? r.scope, count: r.count, total: num(r.total) })),
          totalsRow: { item: 'الإجمالي', total: grand },
          emptyAr: 'لا توجد مصاريف في هذه الفترة',
        },
      ],
      totals: [{ labelAr: 'إجمالي المصاريف', value: grand, format: 'currency', tone: 'red' }],
    };
  },
};
