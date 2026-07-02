// ══════════════════════════════════════════════════════
// 📋 تقرير الحجوزات مقابل الحضور — Reservations vs Attendance
// من جدول reservations: الحالة، الحضور، نسبة عدم الحضور.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { reservations, activities } from '../../schemas/admin.schema.js';
import { num, pct, rangeDates, rangeLabel, notTestActivity } from '../helpers.js';

const STATUS_AR: Record<string, string> = { pending: 'قيد الانتظار', confirmed: 'مؤكّد', paid_all: 'مدفوع بالكامل' };

export const reservationsAttendanceReport: ReportDefinition = {
  key: 'reservations-attendance',
  titleAr: 'الحجوزات مقابل الحضور',
  descriptionAr: 'متابعة الحجوزات: حالتها، الحضور الفعلي، ونسبة عدم الحضور.',
  icon: '📋',
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

    const cond = and(
      isNull(reservations.deletedAt),
      gte(reservations.createdAt, from), lte(reservations.createdAt, to),
      actId ? eq(reservations.activityId, actId) : undefined,
      notTestActivity,   // يتطلّب ضمّ activities في كل استعلام يستخدم cond
    );

    const [agg] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      people: sql<number>`COALESCE(SUM(${reservations.peopleCount}), 0)::int`,
      attended: sql<number>`COALESCE(SUM(CASE WHEN ${reservations.attended} = true THEN 1 ELSE 0 END), 0)::int`,
      noShow: sql<number>`COALESCE(SUM(CASE WHEN ${reservations.attended} = false THEN 1 ELSE 0 END), 0)::int`,
      pending: sql<number>`COALESCE(SUM(CASE WHEN ${reservations.status} = 'pending' THEN 1 ELSE 0 END), 0)::int`,
      confirmed: sql<number>`COALESCE(SUM(CASE WHEN ${reservations.status} = 'confirmed' THEN 1 ELSE 0 END), 0)::int`,
    }).from(reservations)
      .leftJoin(activities, eq(reservations.activityId, activities.id))
      .where(cond);

    const rows = await db.select({
      contactName: reservations.contactName, phone: reservations.phone,
      peopleCount: reservations.peopleCount, status: reservations.status,
      attended: reservations.attended, activityName: activities.name, date: activities.date,
    }).from(reservations)
      .leftJoin(activities, eq(reservations.activityId, activities.id))
      .where(cond)
      .orderBy(desc(reservations.createdAt));

    const noShowRate = pct(num(agg?.noShow), num(agg?.attended) + num(agg?.noShow));

    return {
      header: {
        titleAr: 'الحجوزات مقابل الحضور', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '📋', labelAr: 'إجمالي الحجوزات', value: num(agg?.total), format: 'number', tone: 'blue' },
            { icon: '✅', labelAr: 'حضروا', value: num(agg?.attended), format: 'number', tone: 'green' },
            { icon: '❌', labelAr: 'لم يحضروا', value: num(agg?.noShow), format: 'number', tone: 'red' },
            { icon: '％', labelAr: 'نسبة عدم الحضور', value: noShowRate, format: 'percent', tone: 'amber' },
          ],
        },
        {
          type: 'keyvalue', titleAr: 'حسب الحالة',
          items: [
            { labelAr: 'قيد الانتظار', value: num(agg?.pending) },
            { labelAr: 'مؤكّد', value: num(agg?.confirmed) },
            { labelAr: 'إجمالي الأشخاص', value: num(agg?.people) },
          ],
        },
        {
          type: 'table', titleAr: 'الحجوزات',
          columns: [
            { key: 'contactName', labelAr: 'الاسم' },
            { key: 'phone', labelAr: 'الهاتف' },
            { key: 'activityName', labelAr: 'النشاط' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'peopleCount', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'statusAr', labelAr: 'الحالة', format: 'badge' },
            { key: 'attendedAr', labelAr: 'الحضور', format: 'badge' },
          ],
          rows: rows.map((r) => ({
            ...r, activityName: r.activityName ?? '—',
            statusAr: STATUS_AR[r.status] ?? r.status,
            attendedAr: r.attended === true ? 'حضر' : r.attended === false ? 'لم يحضر' : '—',
          })),
          emptyAr: 'لا توجد حجوزات في هذه الفترة',
        },
      ],
    };
  },
};
