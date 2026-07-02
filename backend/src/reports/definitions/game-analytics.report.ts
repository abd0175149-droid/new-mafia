// ══════════════════════════════════════════════════════
// ⚔️ تقرير تحليل المباريات — Game Analytics
// توزيع الفوز، متوسط المدة/الجولات، وتوازن الأدوار.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { matches, matchPlayers, sessions } from '../../schemas/game.schema.js';
import { num, pct, rangeDates, rangeLabel, notTestMatch } from '../helpers.js';

const WINNER_AR: Record<string, string> = { MAFIA: 'المافيا', CITIZEN: 'المدنيون', JESTER: 'المهرّج', ASSASSIN: 'القاتل' };

export const gameAnalyticsReport: ReportDefinition = {
  key: 'game-analytics',
  titleAr: 'تحليل المباريات',
  descriptionAr: 'توزيع الفوز بين الفرق، متوسط المدة والجولات، وتوازن الأدوار وأداءها.',
  icon: '⚔️',
  category: 'games',
  roles: ['admin', 'manager'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'seasonId', type: 'season-picker', labelAr: 'الموسم (اختياري)', required: false, optionsSource: 'seasons' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const seasonId = params.seasonId as number | undefined;

    const matchCond = and(
      isNull(matches.deletedAt), gte(matches.createdAt, from), lte(matches.createdAt, to),
      seasonId ? eq(matches.seasonId, seasonId) : undefined,
      notTestMatch,   // استبعاد مباريات أماكن الاختبار
    );

    const [summary] = await db.select({
      total: sql<number>`COUNT(*)::int`,
      mafiaWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'MAFIA' THEN 1 ELSE 0 END), 0)::int`,
      citizenWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'CITIZEN' THEN 1 ELSE 0 END), 0)::int`,
      jesterWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'JESTER' THEN 1 ELSE 0 END), 0)::int`,
      assassinWins: sql<number>`COALESCE(SUM(CASE WHEN ${matches.winner} = 'ASSASSIN' THEN 1 ELSE 0 END), 0)::int`,
      avgDuration: sql<number>`ROUND(AVG(${matches.durationSeconds}))::int`,
      avgRounds: sql<number>`ROUND(AVG(${matches.totalRounds}))::int`,
      avgPlayers: sql<number>`ROUND(AVG(${matches.playerCount}))::int`,
    }).from(matches).where(matchCond);

    // توازن الأدوار (عبر ربط match_players بالمباريات ضمن الفترة)
    const roles = await db.select({
      role: matchPlayers.role,
      count: sql<number>`COUNT(*)::int`,
      survived: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.survivedToEnd} = true THEN 1 ELSE 0 END), 0)::int`,
      abilityUsed: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.abilityUsed} = true THEN 1 ELSE 0 END), 0)::int`,
      abilityCorrect: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.abilityCorrect} = true THEN 1 ELSE 0 END), 0)::int`,
    }).from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(matchCond)
      .groupBy(matchPlayers.role)
      .orderBy(desc(sql`COUNT(*)`));

    const total = num(summary?.total);
    const avgMin = Math.round(num(summary?.avgDuration) / 60);

    return {
      header: {
        titleAr: 'تحليل المباريات', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '⚔️', labelAr: 'إجمالي المباريات', value: total, format: 'number', tone: 'blue' },
            { icon: '🕵️', labelAr: 'فوز المافيا', value: pct(num(summary?.mafiaWins), total), format: 'percent', tone: 'red' },
            { icon: '🛡️', labelAr: 'فوز المدنيين', value: pct(num(summary?.citizenWins), total), format: 'percent', tone: 'green' },
            { icon: '⏱️', labelAr: 'متوسط المدة (دقيقة)', value: avgMin, format: 'number', tone: 'amber' },
            { icon: '🔄', labelAr: 'متوسط الجولات', value: num(summary?.avgRounds), format: 'number', tone: 'purple' },
          ],
        },
        {
          type: 'table', titleAr: 'توزيع الفوز',
          columns: [
            { key: 'team', labelAr: 'الفريق' },
            { key: 'wins', labelAr: 'انتصارات', format: 'number', align: 'center' },
            { key: 'rate', labelAr: 'النسبة', format: 'percent', align: 'center' },
          ],
          rows: [
            { team: WINNER_AR.MAFIA, wins: num(summary?.mafiaWins), rate: pct(num(summary?.mafiaWins), total) },
            { team: WINNER_AR.CITIZEN, wins: num(summary?.citizenWins), rate: pct(num(summary?.citizenWins), total) },
            { team: WINNER_AR.JESTER, wins: num(summary?.jesterWins), rate: pct(num(summary?.jesterWins), total) },
            { team: WINNER_AR.ASSASSIN, wins: num(summary?.assassinWins), rate: pct(num(summary?.assassinWins), total) },
          ],
        },
        {
          type: 'table', titleAr: 'توازن الأدوار',
          columns: [
            { key: 'role', labelAr: 'الدور' },
            { key: 'count', labelAr: 'مرّات', format: 'number', align: 'center' },
            { key: 'survivalRate', labelAr: 'نسبة النجاة', format: 'percent', align: 'center' },
            { key: 'abilityUsed', labelAr: 'استُخدمت القدرة', format: 'number', align: 'center' },
            { key: 'abilityAccuracy', labelAr: 'دقة القدرة', format: 'percent', align: 'center' },
          ],
          rows: roles.map((r) => ({
            role: r.role, count: r.count,
            survivalRate: pct(r.survived, r.count),
            abilityUsed: r.abilityUsed,
            abilityAccuracy: pct(r.abilityCorrect, r.abilityUsed),
          })),
          emptyAr: 'لا توجد مباريات في هذه الفترة',
        },
      ],
    };
  },
};
