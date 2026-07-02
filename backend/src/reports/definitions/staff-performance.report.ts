// ══════════════════════════════════════════════════════
// 🧑‍💼 تقرير أداء الموظفين — Staff Performance
// لكل موظف: الغرف المُنشأة، المباريات المُدارة، متوسط تقييمه، وعدد تدخّلاته.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { staff, staffActionLog } from '../../schemas/admin.schema.js';
import { sessions, matches, surveys } from '../../schemas/game.schema.js';
import { num, rangeDates, rangeLabel } from '../helpers.js';

export const staffPerformanceReport: ReportDefinition = {
  key: 'staff-performance',
  titleAr: 'أداء الموظفين',
  descriptionAr: 'لكل موظف: عدد الغرف المُنشأة، المباريات المُدارة، متوسط تقييم الليدر، وعدد التدخّلات.',
  icon: '🧑‍💼',
  category: 'staff',
  roles: ['admin', 'manager'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'staffId', type: 'select', labelAr: 'موظف محدّد (اختياري)', required: false, optionsSource: 'staff' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);

    const staffRows = await db.select({ id: staff.id, name: staff.displayName, role: staff.role })
      .from(staff).where(and(eq(staff.isActive, true), isNull(staff.deletedAt)));

    // الغرف المُنشأة
    const roomsBy = await db.select({
      createdBy: sessions.createdBy, count: sql<number>`COUNT(*)::int`,
    }).from(sessions)
      .where(and(isNull(sessions.deletedAt), gte(sessions.createdAt, from), lte(sessions.createdAt, to)))
      .groupBy(sessions.createdBy);
    const roomsMap = new Map(roomsBy.map((r) => [r.createdBy, r.count]));

    // المباريات المُدارة + متوسط التقييم
    const matchBy = await db.select({
      leader: matches.leaderStaffId, count: sql<number>`COUNT(*)::int`,
    }).from(matches)
      .where(and(isNull(matches.deletedAt), gte(matches.createdAt, from), lte(matches.createdAt, to)))
      .groupBy(matches.leaderStaffId);
    const matchMap = new Map(matchBy.map((r) => [r.leader, r.count]));

    const ratingBy = await db.select({
      leader: matches.leaderStaffId, avg: sql<number>`ROUND(AVG(${surveys.leaderRating}), 1)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(surveys)
      .innerJoin(matches, eq(surveys.matchId, matches.id))
      .where(and(isNull(matches.deletedAt), gte(matches.createdAt, from), lte(matches.createdAt, to)))
      .groupBy(matches.leaderStaffId);
    const ratingMap = new Map(ratingBy.map((r) => [r.leader, { avg: num(r.avg), count: r.count }]));

    // التدخّلات
    const actionBy = await db.select({
      staffId: staffActionLog.staffId, count: sql<number>`COUNT(*)::int`,
      blocked: sql<number>`COALESCE(SUM(CASE WHEN ${staffActionLog.outcome} = 'blocked' THEN 1 ELSE 0 END), 0)::int`,
    }).from(staffActionLog)
      .where(and(gte(staffActionLog.createdAt, from), lte(staffActionLog.createdAt, to)))
      .groupBy(staffActionLog.staffId);
    const actionMap = new Map(actionBy.map((r) => [r.staffId, { count: r.count, blocked: r.blocked }]));

    const onlyStaff = params.staffId ? parseInt(String(params.staffId), 10) : undefined;

    const rows = staffRows
      .filter((s) => !onlyStaff || s.id === onlyStaff)
      .map((s) => {
        const rating = ratingMap.get(s.id);
        const actions = actionMap.get(s.id) ?? { count: 0, blocked: 0 };
        return {
          name: s.name, role: s.role,
          rooms: roomsMap.get(s.id) ?? 0,
          matches: matchMap.get(s.id) ?? 0,
          avgRating: rating?.avg ?? 0,
          ratingsCount: rating?.count ?? 0,
          actions: actions.count,
          blocked: actions.blocked,
        };
      })
      .sort((a, b) => b.matches - a.matches);

    return {
      header: {
        titleAr: 'أداء الموظفين', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'table', titleAr: 'الموظفون',
          columns: [
            { key: 'name', labelAr: 'الموظف' },
            { key: 'role', labelAr: 'الدور', format: 'badge' },
            { key: 'rooms', labelAr: 'غرف مُنشأة', format: 'number', align: 'center' },
            { key: 'matches', labelAr: 'مباريات مُدارة', format: 'number', align: 'center' },
            { key: 'avgRating', labelAr: 'متوسط التقييم', format: 'number', align: 'center' },
            { key: 'actions', labelAr: 'تدخّلات', format: 'number', align: 'center' },
            { key: 'blocked', labelAr: 'محظورة', format: 'number', align: 'center' },
          ],
          rows,
          emptyAr: 'لا يوجد موظفون',
        },
      ],
    };
  },
};
