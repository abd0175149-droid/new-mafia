// ══════════════════════════════════════════════════════
// 🏗️ تقرير التكاليف التأسيسية — Foundational Costs
// ══════════════════════════════════════════════════════

import { and, isNull, gte, lte, eq, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { foundationalCosts } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel } from '../helpers.js';

export const foundationalCostsReport: ReportDefinition = {
  key: 'foundational-costs',
  titleAr: 'التكاليف التأسيسية',
  descriptionAr: 'قائمة التكاليف التأسيسية خلال فترة مع حالة المعالجة.',
  icon: '🏗️',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'processed', type: 'select', labelAr: 'حالة المعالجة', required: false, defaultValue: 'all',
      options: [{ value: 'all', labelAr: 'الكل' }, { value: 'yes', labelAr: 'معالَجة' }, { value: 'no', labelAr: 'غير معالَجة' }] },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const processed = params.processed as string | undefined;

    const rows = await db.select({
      item: foundationalCosts.item, amount: foundationalCosts.amount,
      paidBy: foundationalCosts.paidBy, source: foundationalCosts.source,
      date: foundationalCosts.date, isProcessed: foundationalCosts.isProcessed,
    }).from(foundationalCosts)
      .where(and(
        isNull(foundationalCosts.deletedAt),
        gte(foundationalCosts.date, from), lte(foundationalCosts.date, to),
        processed === 'yes' ? eq(foundationalCosts.isProcessed, true)
          : processed === 'no' ? eq(foundationalCosts.isProcessed, false) : undefined,
      ))
      .orderBy(desc(foundationalCosts.date));

    const total = rows.reduce((s, r) => s + num(r.amount), 0);

    return {
      header: {
        titleAr: 'التكاليف التأسيسية', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '🏗️', labelAr: 'إجمالي التأسيسي', value: total, format: 'currency', tone: 'purple' },
            { icon: '🧾', labelAr: 'عدد البنود', value: rows.length, format: 'number', tone: 'amber' },
          ],
        },
        {
          type: 'table', titleAr: 'البنود',
          columns: [
            { key: 'item', labelAr: 'البند' },
            { key: 'source', labelAr: 'المصدر' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'paidBy', labelAr: 'دفعها' },
            { key: 'processedAr', labelAr: 'معالَجة', format: 'badge' },
          ],
          rows: rows.map((r) => ({ ...r, processedAr: r.isProcessed ? '✓' : '—' })),
          totalsRow: { item: 'الإجمالي', amount: total },
          emptyAr: 'لا توجد تكاليف تأسيسية في هذه الفترة',
        },
      ],
      totals: [{ labelAr: 'إجمالي التكاليف التأسيسية', value: total, format: 'currency', tone: 'purple' }],
    };
  },
};
