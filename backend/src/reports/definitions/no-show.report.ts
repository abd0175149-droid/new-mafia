// ══════════════════════════════════════════════════════
// 🚫 تقرير عدم الحضور — No-show
// حجوزات مدفوعة/غير مجانية لم يُسجَّل لها حضور (checked_in=false) ضمن الفترة.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { bookings, activities, locations } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel } from '../helpers.js';

export const noShowReport: ReportDefinition = {
  key: 'no-show',
  titleAr: 'تقرير عدم الحضور',
  descriptionAr: 'الحجوزات غير المجانية التي لم يُسجَّل لها حضور، مع الإيراد المعرّض للخطر.',
  icon: '🚫',
  category: 'operations',
  roles: ['admin', 'manager'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'activityId', type: 'activity-picker', labelAr: 'نشاط محدّد (اختياري)', required: false, optionsSource: 'activities' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const actId = params.activityId as number | undefined;

    const rows = await db.select({
      name: bookings.name, phone: bookings.phone, count: bookings.count,
      isPaid: bookings.isPaid, amount: bookings.paidAmount,
      activityName: activities.name, date: activities.date, locationName: locations.name,
    }).from(bookings)
      .innerJoin(activities, eq(bookings.activityId, activities.id))
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(and(
        eq(bookings.checkedIn, false), eq(bookings.isFree, false),
        isNull(bookings.deletedAt), isNull(activities.deletedAt),
        gte(activities.date, from), lte(activities.date, to),
        actId ? eq(activities.id, actId) : undefined,
      ))
      .orderBy(desc(activities.date));

    const paidNoShow = rows.filter((r) => r.isPaid);
    const revenueAtRisk = rows.filter((r) => !r.isPaid).reduce((s, r) => s + num(r.amount), 0);

    return {
      header: {
        titleAr: 'تقرير عدم الحضور', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '🚫', labelAr: 'حجوزات بلا حضور', value: rows.length, format: 'number', tone: 'red' },
            { icon: '💳', labelAr: 'منها مدفوعة', value: paidNoShow.length, format: 'number', tone: 'amber' },
            { icon: '⚠️', labelAr: 'إيراد معرّض للخطر', value: revenueAtRisk, format: 'currency', tone: 'red' },
          ],
        },
        {
          type: 'table', titleAr: 'الحجوزات غير الحاضرة',
          columns: [
            { key: 'name', labelAr: 'الاسم' },
            { key: 'phone', labelAr: 'الهاتف' },
            { key: 'activityName', labelAr: 'النشاط' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'count', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'statusAr', labelAr: 'الدفع', format: 'badge' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
          ],
          rows: rows.map((r) => ({ ...r, statusAr: r.isPaid ? 'مدفوع' : 'غير مدفوع' })),
          emptyAr: 'لا توجد حالات عدم حضور',
        },
      ],
      totals: [{ labelAr: 'إيراد معرّض للخطر', value: revenueAtRisk, format: 'currency', tone: 'red' }],
    };
  },
};
