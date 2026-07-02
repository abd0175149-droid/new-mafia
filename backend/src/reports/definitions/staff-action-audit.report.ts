// ══════════════════════════════════════════════════════
// 🕵️ تقرير سجل تدخّلات الموظفين — Staff Action Audit
// من staff_action_log: تدخّلات الليدر داخل اللعبة مصنّفة.
// ══════════════════════════════════════════════════════

import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { staffActionLog } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel } from '../helpers.js';

export const staffActionAuditReport: ReportDefinition = {
  key: 'staff-action-audit',
  titleAr: 'سجل تدخّلات الموظفين',
  descriptionAr: 'تدخّلات الموظفين داخل اللعبة مصنّفة حسب النوع والنتيجة خلال فترة.',
  icon: '🕵️',
  category: 'staff',
  roles: ['admin', 'manager'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'staffId', type: 'select', labelAr: 'موظف محدّد (اختياري)', required: false, optionsSource: 'staff' },
    { key: 'outcome', type: 'select', labelAr: 'النتيجة', required: false, defaultValue: 'all',
      options: [{ value: 'all', labelAr: 'الكل' }, { value: 'success', labelAr: 'ناجحة' }, { value: 'blocked', labelAr: 'محظورة' }] },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const staffId = params.staffId ? parseInt(String(params.staffId), 10) : undefined;
    const outcome = params.outcome as string | undefined;

    const cond = and(
      gte(staffActionLog.createdAt, from), lte(staffActionLog.createdAt, to),
      staffId ? eq(staffActionLog.staffId, staffId) : undefined,
      outcome && outcome !== 'all' ? eq(staffActionLog.outcome, outcome) : undefined,
    );

    const byCategory = await db.select({
      category: staffActionLog.category, count: sql<number>`COUNT(*)::int`,
      blocked: sql<number>`COALESCE(SUM(CASE WHEN ${staffActionLog.outcome} = 'blocked' THEN 1 ELSE 0 END), 0)::int`,
    }).from(staffActionLog).where(cond).groupBy(staffActionLog.category).orderBy(desc(sql`COUNT(*)`));

    const recent = await db.select({
      createdAt: staffActionLog.createdAt, staffUsername: staffActionLog.staffUsername,
      labelAr: staffActionLog.labelAr, action: staffActionLog.action,
      category: staffActionLog.category, outcome: staffActionLog.outcome,
      targetName: staffActionLog.targetName, roomCode: staffActionLog.roomCode,
    }).from(staffActionLog).where(cond).orderBy(desc(staffActionLog.createdAt)).limit(200);

    const totalCount = byCategory.reduce((s, c) => s + num(c.count), 0);
    const totalBlocked = byCategory.reduce((s, c) => s + num(c.blocked), 0);

    return {
      header: {
        titleAr: 'سجل تدخّلات الموظفين', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '🕵️', labelAr: 'إجمالي التدخّلات', value: totalCount, format: 'number', tone: 'blue' },
            { icon: '🚫', labelAr: 'محظورة', value: totalBlocked, format: 'number', tone: 'red' },
          ],
        },
        {
          type: 'table', titleAr: 'حسب الفئة',
          columns: [
            { key: 'category', labelAr: 'الفئة' },
            { key: 'count', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'blocked', labelAr: 'محظورة', format: 'number', align: 'center' },
          ],
          rows: byCategory,
          totalsRow: { category: 'الإجمالي', count: totalCount, blocked: totalBlocked },
          emptyAr: 'لا توجد تدخّلات في هذه الفترة',
        },
        {
          type: 'table', titleAr: 'آخر التدخّلات',
          columns: [
            { key: 'createdAt', labelAr: 'الوقت', format: 'datetime' },
            { key: 'staffUsername', labelAr: 'الموظف' },
            { key: 'labelText', labelAr: 'الإجراء' },
            { key: 'category', labelAr: 'الفئة', format: 'badge' },
            { key: 'outcomeAr', labelAr: 'النتيجة', format: 'badge' },
            { key: 'targetName', labelAr: 'الهدف' },
            { key: 'roomCode', labelAr: 'الغرفة' },
          ],
          rows: recent.map((r) => ({
            createdAt: r.createdAt, staffUsername: r.staffUsername ?? '—',
            labelText: r.labelAr ?? r.action,
            category: r.category, targetName: r.targetName ?? '—', roomCode: r.roomCode ?? '—',
            outcomeAr: r.outcome === 'blocked' ? 'محظورة' : r.outcome === 'success' ? 'ناجحة' : '—',
          })),
          emptyAr: 'لا توجد سجلات',
        },
      ],
    };
  },
};
