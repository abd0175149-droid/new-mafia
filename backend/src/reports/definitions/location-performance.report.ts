// ══════════════════════════════════════════════════════
// 📍 تقرير أداء المواقع — Location Performance
// لكل موقع: عدد الأنشطة، الدخل، الحضور، الإشغال خلال فترة (أساس تاريخ النشاط).
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { locations, activities, bookings } from '../../schemas/admin.schema.js';
import { paidRevenue, num, pct, rangeDates, rangeLabel } from '../helpers.js';

export const locationPerformanceReport: ReportDefinition = {
  key: 'location-performance',
  titleAr: 'أداء المواقع',
  descriptionAr: 'لكل موقع: عدد الأنشطة، الدخل المحصّل، الحضور، ونسبة الإشغال خلال فترة.',
  icon: '📍',
  category: 'operations',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const actDateCond = and(isNull(activities.deletedAt), gte(activities.date, from), lte(activities.date, to));

    // عدد الأنشطة والسعة (بلا ربط الحجوزات لتفادي التضخيم)
    const actRows = await db.select({
      locId: locations.id, name: locations.name, isTest: locations.isTestLocation,
      activities: sql<number>`COUNT(${activities.id})::int`,
      completed: sql<number>`COALESCE(SUM(CASE WHEN ${activities.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
      capacity: sql<number>`COALESCE(SUM(${activities.maxCapacity}), 0)::int`,
    }).from(locations)
      .leftJoin(activities, and(eq(activities.locationId, locations.id), actDateCond))
      .where(isNull(locations.deletedAt))
      .groupBy(locations.id, locations.name, locations.isTestLocation);

    // الدخل والحضور (عبر ربط الحجوزات)
    const revRows = await db.select({
      locId: locations.id,
      revenue: paidRevenue(),
      attendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
    }).from(locations)
      .leftJoin(activities, and(eq(activities.locationId, locations.id), actDateCond))
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .where(isNull(locations.deletedAt))
      .groupBy(locations.id);
    const revMap = new Map(revRows.map((r) => [r.locId, { revenue: num(r.revenue), attendees: r.attendees }]));

    const enriched = actRows.map((r) => {
      const rev = revMap.get(r.locId) ?? { revenue: 0, attendees: 0 };
      return {
        name: r.name, isTestAr: r.isTest ? 'تجريبي' : '—',
        activities: r.activities, completed: r.completed,
        revenue: rev.revenue, attendees: rev.attendees,
        occupancy: pct(rev.attendees, num(r.capacity)),
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const totalRev = enriched.reduce((s, r) => s + r.revenue, 0);

    return {
      header: {
        titleAr: 'أداء المواقع', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '📍', labelAr: 'عدد المواقع', value: enriched.length, format: 'number', tone: 'blue' },
            { icon: '💰', labelAr: 'إجمالي الدخل', value: totalRev, format: 'currency', tone: 'green' },
          ],
        },
        {
          type: 'table', titleAr: 'المواقع',
          columns: [
            { key: 'name', labelAr: 'الموقع' },
            { key: 'activities', labelAr: 'أنشطة', format: 'number', align: 'center' },
            { key: 'completed', labelAr: 'مكتملة', format: 'number', align: 'center' },
            { key: 'revenue', labelAr: 'الدخل', format: 'currency' },
            { key: 'attendees', labelAr: 'الحضور', format: 'number', align: 'center' },
            { key: 'occupancy', labelAr: 'الإشغال', format: 'percent', align: 'center' },
            { key: 'isTestAr', labelAr: 'نوع', format: 'badge' },
          ],
          rows: enriched,
          totalsRow: { name: 'الإجمالي', revenue: totalRev },
          emptyAr: 'لا توجد مواقع',
        },
      ],
      totals: [{ labelAr: 'إجمالي الدخل', value: totalRev, format: 'currency', tone: 'green' }],
    };
  },
};
