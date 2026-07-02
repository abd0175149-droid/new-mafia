// ══════════════════════════════════════════════════════
// 📉 تقرير النمو والاحتفاظ — Player Retention / Cohort
// أفواج التسجيل الشهرية مقابل النشاط الحالي + اللاعبون غير النشطين.
// ══════════════════════════════════════════════════════

import { and, eq, gte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { players } from '../../schemas/player.schema.js';
import { num, pct, rangeDates, rangeLabel } from '../helpers.js';

export const playerRetentionReport: ReportDefinition = {
  key: 'player-retention',
  titleAr: 'النمو والاحتفاظ',
  descriptionAr: 'أفواج التسجيل الشهرية، ونسبة اللاعبين الذين ما زالوا نشطين، واللاعبون المتعثّرون.',
  icon: '📉',
  category: 'players',
  roles: ['admin', 'manager'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'فترة التسجيل', required: false },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);

    // ملخص عام
    const [summary] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      active30: sql<number>`COALESCE(SUM(CASE WHEN ${players.lastActiveAt} >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)::int`,
      active90: sql<number>`COALESCE(SUM(CASE WHEN ${players.lastActiveAt} >= NOW() - INTERVAL '90 days' THEN 1 ELSE 0 END), 0)::int`,
      dormant: sql<number>`COALESCE(SUM(CASE WHEN ${players.lifetimeMatches} > 0 AND (${players.lastActiveAt} IS NULL OR ${players.lastActiveAt} < NOW() - INTERVAL '60 days') THEN 1 ELSE 0 END), 0)::int`,
    }).from(players).where(eq(players.isTestAccount, false));

    // أفواج شهرية
    const cohorts = await db.select({
      month: sql<string>`TO_CHAR(${players.createdAt}, 'YYYY-MM')`,
      signups: sql<number>`COUNT(*)::int`,
      played: sql<number>`COALESCE(SUM(CASE WHEN ${players.lifetimeMatches} > 0 THEN 1 ELSE 0 END), 0)::int`,
      stillActive: sql<number>`COALESCE(SUM(CASE WHEN ${players.lastActiveAt} >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0)::int`,
    }).from(players)
      .where(and(eq(players.isTestAccount, false), gte(players.createdAt, from)))
      .groupBy(sql`TO_CHAR(${players.createdAt}, 'YYYY-MM')`)
      .orderBy(desc(sql`TO_CHAR(${players.createdAt}, 'YYYY-MM')`));

    // اللاعبون المتعثّرون (لعبوا وغابوا > 60 يوم) — للاسترجاع
    const winback = await db.select({
      name: players.name, phone: players.phone,
      lifetimeMatches: players.lifetimeMatches, lastActiveAt: players.lastActiveAt,
    }).from(players)
      .where(and(
        eq(players.isTestAccount, false),
        sql`${players.lifetimeMatches} > 0`,
        sql`(${players.lastActiveAt} IS NULL OR ${players.lastActiveAt} < NOW() - INTERVAL '60 days')`,
      ))
      .orderBy(desc(players.lifetimeMatches))
      .limit(100);

    return {
      header: {
        titleAr: 'النمو والاحتفاظ', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '👥', labelAr: 'إجمالي اللاعبين', value: num(summary?.total), format: 'number', tone: 'blue' },
            { icon: '🟢', labelAr: 'نشط (30 يوم)', value: num(summary?.active30), format: 'number', tone: 'green' },
            { icon: '🟡', labelAr: 'نشط (90 يوم)', value: num(summary?.active90), format: 'number', tone: 'amber' },
            { icon: '🔴', labelAr: 'متعثّرون', value: num(summary?.dormant), format: 'number', tone: 'red' },
          ],
        },
        {
          type: 'table', titleAr: 'أفواج التسجيل الشهرية',
          columns: [
            { key: 'month', labelAr: 'الشهر' },
            { key: 'signups', labelAr: 'تسجيلات', format: 'number', align: 'center' },
            { key: 'played', labelAr: 'لعبوا', format: 'number', align: 'center' },
            { key: 'stillActive', labelAr: 'ما زالوا نشطين', format: 'number', align: 'center' },
            { key: 'retention', labelAr: 'نسبة البقاء', format: 'percent', align: 'center' },
          ],
          rows: cohorts.map((c) => ({ ...c, retention: pct(c.stillActive, c.signups) })),
          emptyAr: 'لا توجد بيانات',
        },
        {
          type: 'table', titleAr: 'لاعبون للاسترجاع (متعثّرون)',
          columns: [
            { key: 'name', labelAr: 'اللاعب' },
            { key: 'phone', labelAr: 'الهاتف' },
            { key: 'lifetimeMatches', labelAr: 'مباريات مدى الحياة', format: 'number', align: 'center' },
            { key: 'lastActiveAt', labelAr: 'آخر نشاط', format: 'date' },
          ],
          rows: winback,
          emptyAr: 'لا يوجد لاعبون متعثّرون',
        },
      ],
    };
  },
};
