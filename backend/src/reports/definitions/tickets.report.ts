// ══════════════════════════════════════════════════════
// 🎫 تقرير التذاكر — Tickets
// مباعة/مستخدمة/متبقية حسب النوع والبائع، ودخل التذاكر المستخدمة.
// ══════════════════════════════════════════════════════

import { and, isNull, gte, lte, eq, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { tickets } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel } from '../helpers.js';

const TYPE_AR: Record<string, string> = { regular: 'عادية', vip: 'VIP', free: 'مجانية' };

export const ticketsReport: ReportDefinition = {
  key: 'tickets',
  titleAr: 'تقرير التذاكر',
  descriptionAr: 'التذاكر المُصدَرة/المستخدمة/المتبقية حسب النوع والبائع، ودخل التذاكر المستخدمة.',
  icon: '🎫',
  category: 'operations',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'ticketType', type: 'select', labelAr: 'نوع التذكرة', required: false, defaultValue: 'all',
      options: [{ value: 'all', labelAr: 'الكل' }, { value: 'regular', labelAr: 'عادية' }, { value: 'vip', labelAr: 'VIP' }, { value: 'free', labelAr: 'مجانية' }] },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const type = params.ticketType as string | undefined;

    const cond = and(
      isNull(tickets.deletedAt),
      gte(tickets.createdAt, from), lte(tickets.createdAt, to),
      type && type !== 'all' ? eq(tickets.ticketType, type) : undefined,
    );

    const [agg] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      used: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.isUsed} = true THEN 1 ELSE 0 END), 0)::int`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.isUsed} = true THEN ${tickets.price}::numeric ELSE 0 END), 0)`,
    }).from(tickets).where(cond);

    const byType = await db.select({
      type: tickets.ticketType,
      total: sql<number>`COUNT(*)::int`,
      used: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.isUsed} = true THEN 1 ELSE 0 END), 0)::int`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.isUsed} = true THEN ${tickets.price}::numeric ELSE 0 END), 0)`,
    }).from(tickets).where(cond).groupBy(tickets.ticketType);

    const bySeller = await db.select({
      seller: tickets.sellerName,
      total: sql<number>`COUNT(*)::int`,
      used: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.isUsed} = true THEN 1 ELSE 0 END), 0)::int`,
      revenue: sql<number>`COALESCE(SUM(CASE WHEN ${tickets.isUsed} = true THEN ${tickets.price}::numeric ELSE 0 END), 0)`,
    }).from(tickets).where(cond).groupBy(tickets.sellerName).orderBy(desc(sql`COUNT(*)`));

    const total = num(agg?.total), used = num(agg?.used);

    return {
      header: {
        titleAr: 'تقرير التذاكر', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '🎫', labelAr: 'إجمالي التذاكر', value: total, format: 'number', tone: 'blue' },
            { icon: '✅', labelAr: 'مستخدمة', value: used, format: 'number', tone: 'green' },
            { icon: '🕓', labelAr: 'متبقية', value: total - used, format: 'number', tone: 'amber' },
            { icon: '💰', labelAr: 'دخل التذاكر المستخدمة', value: num(agg?.revenue), format: 'currency', tone: 'green' },
          ],
        },
        {
          type: 'table', titleAr: 'حسب النوع',
          columns: [
            { key: 'typeAr', labelAr: 'النوع', format: 'badge' },
            { key: 'total', labelAr: 'الإجمالي', format: 'number', align: 'center' },
            { key: 'used', labelAr: 'مستخدمة', format: 'number', align: 'center' },
            { key: 'revenue', labelAr: 'الدخل', format: 'currency' },
          ],
          rows: byType.map((r) => ({ typeAr: TYPE_AR[r.type ?? 'regular'] ?? r.type, total: r.total, used: r.used, revenue: num(r.revenue) })),
          emptyAr: 'لا توجد تذاكر',
        },
        {
          type: 'table', titleAr: 'حسب البائع',
          columns: [
            { key: 'seller', labelAr: 'البائع' },
            { key: 'total', labelAr: 'الإجمالي', format: 'number', align: 'center' },
            { key: 'used', labelAr: 'مستخدمة', format: 'number', align: 'center' },
            { key: 'revenue', labelAr: 'الدخل', format: 'currency' },
          ],
          rows: bySeller.map((r) => ({ seller: r.seller ?? '—', total: r.total, used: r.used, revenue: num(r.revenue) })),
          emptyAr: 'لا يوجد بائعون',
        },
      ],
      totals: [{ labelAr: 'دخل التذاكر المستخدمة', value: num(agg?.revenue), format: 'currency', tone: 'green' }],
    };
  },
};
