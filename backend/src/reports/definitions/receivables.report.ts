// ══════════════════════════════════════════════════════
// ⏳ تقرير المستحقات (الذمم) — Receivables
// كل حجز غير مدفوع وغير مجاني ضمن الفترة (أساس تاريخ النشاط).
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { bookings, activities, locations } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel, notTestActivity } from '../helpers.js';

export const receivablesReport: ReportDefinition = {
  key: 'receivables',
  titleAr: 'تقرير المستحقات (الذمم)',
  descriptionAr: 'الحجوزات غير المدفوعة خلال الفترة: مَن عليه مبالغ وكم، ولأي نشاط.',
  icon: '⏳',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
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
      amount: bookings.paidAmount, createdBy: bookings.createdBy,
      activityName: activities.name, date: activities.date, locationName: locations.name,
    }).from(bookings)
      .innerJoin(activities, eq(bookings.activityId, activities.id))
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(and(
        eq(bookings.isPaid, false), eq(bookings.isFree, false),
        isNull(bookings.deletedAt), isNull(activities.deletedAt),
        gte(activities.date, from), lte(activities.date, to),
        actId ? eq(activities.id, actId) : undefined,
        notTestActivity,
      ))
      .orderBy(desc(activities.date));

    const total = rows.reduce((s, r) => s + num(r.amount), 0);
    const people = rows.reduce((s, r) => s + num(r.count), 0);

    return {
      header: {
        titleAr: 'تقرير المستحقات (الذمم)',
        subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '⏳', labelAr: 'إجمالي المستحقات', value: total, format: 'currency', tone: 'red' },
            { icon: '🧾', labelAr: 'عدد الحجوزات', value: rows.length, format: 'number', tone: 'amber' },
            { icon: '👥', labelAr: 'إجمالي الأشخاص', value: people, format: 'number', tone: 'blue' },
          ],
        },
        {
          type: 'table', titleAr: 'الحجوزات غير المدفوعة',
          columns: [
            { key: 'name', labelAr: 'الاسم' },
            { key: 'phone', labelAr: 'الهاتف' },
            { key: 'activityName', labelAr: 'النشاط' },
            { key: 'date', labelAr: 'تاريخ النشاط', format: 'date' },
            { key: 'count', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'createdBy', labelAr: 'أنشأ الحجز' },
          ],
          rows,
          totalsRow: { name: 'الإجمالي', count: people, amount: total },
          emptyAr: 'لا توجد مستحقات في هذه الفترة',
        },
      ],
      totals: [{ labelAr: 'إجمالي المستحقات غير المحصّلة', value: total, format: 'currency', tone: 'red' }],
    };
  },
};
