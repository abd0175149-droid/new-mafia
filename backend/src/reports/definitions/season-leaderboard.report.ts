// ══════════════════════════════════════════════════════
// 🏆 تقرير ترتيب الموسم — Season Leaderboard
// ترتيب اللاعبين لموسم مختار من player_season_stats.
// ══════════════════════════════════════════════════════

import { and, eq, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { playerSeasonStats, seasons } from '../../schemas/season.schema.js';
import { players } from '../../schemas/player.schema.js';
import { num, pct } from '../helpers.js';

const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب',
};
const RANK_WEIGHT = sql`CASE ${playerSeasonStats.rankTier}
  WHEN 'GODFATHER' THEN 5 WHEN 'UNDERBOSS' THEN 4 WHEN 'CAPO' THEN 3
  WHEN 'SOLDIER' THEN 2 WHEN 'INFORMANT' THEN 1 ELSE 0 END`;

export const seasonLeaderboardReport: ReportDefinition = {
  key: 'season-leaderboard',
  titleAr: 'ترتيب الموسم',
  descriptionAr: 'ترتيب اللاعبين لموسم مختار حسب الرتبة ونقاط الترتيب.',
  icon: '🏆',
  category: 'players',
  roles: ['admin', 'manager'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'seasonId', type: 'season-picker', labelAr: 'الموسم', required: true, optionsSource: 'seasons' },
    { key: 'limit', type: 'select', labelAr: 'عدد اللاعبين', required: false, defaultValue: '50',
      options: [{ value: '20', labelAr: 'أفضل 20' }, { value: '50', labelAr: 'أفضل 50' }, { value: '100', labelAr: 'أفضل 100' }] },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const seasonId = params.seasonId as number;
    const limit = parseInt(String(params.limit ?? '50'), 10) || 50;

    const [season] = await db.select({ name: seasons.name, type: seasons.type, status: seasons.status })
      .from(seasons).where(eq(seasons.id, seasonId)).limit(1);
    if (!season) throw new Error('الموسم غير موجود');

    const rows = await db.select({
      name: players.name, phone: players.phone,
      rankTier: playerSeasonStats.rankTier, level: playerSeasonStats.level,
      rankRR: playerSeasonStats.rankRR, xp: playerSeasonStats.xp,
      totalMatches: playerSeasonStats.totalMatches, totalWins: playerSeasonStats.totalWins,
    }).from(playerSeasonStats)
      .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
      .where(and(eq(playerSeasonStats.seasonId, seasonId), eq(players.isTestAccount, false)))
      .orderBy(desc(RANK_WEIGHT), desc(playerSeasonStats.rankRR))
      .limit(limit);

    return {
      header: {
        titleAr: `ترتيب الموسم — ${season.name}`,
        subtitleAr: `${season.type === 'TOURNAMENT' ? 'بطولة' : 'موسم عادي'}${season.status === 'ACTIVE' ? ' — نشط' : ' — منتهٍ'}`,
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [`الموسم: ${season.name}`, `أفضل ${limit}`],
      },
      sections: [
        {
          type: 'table', titleAr: 'الترتيب',
          columns: [
            { key: 'rank', labelAr: '#', align: 'center' },
            { key: 'name', labelAr: 'اللاعب' },
            { key: 'rankAr', labelAr: 'الرتبة', format: 'badge' },
            { key: 'level', labelAr: 'المستوى', format: 'number', align: 'center' },
            { key: 'rankRR', labelAr: 'RR', format: 'number', align: 'center' },
            { key: 'totalMatches', labelAr: 'مباريات', format: 'number', align: 'center' },
            { key: 'totalWins', labelAr: 'فوز', format: 'number', align: 'center' },
            { key: 'winRate', labelAr: 'نسبة الفوز', format: 'percent', align: 'center' },
          ],
          rows: rows.map((r, i) => ({
            rank: i + 1, name: r.name,
            rankAr: RANK_AR[r.rankTier ?? ''] ?? r.rankTier,
            level: num(r.level), rankRR: num(r.rankRR),
            totalMatches: num(r.totalMatches), totalWins: num(r.totalWins),
            winRate: pct(num(r.totalWins), num(r.totalMatches)),
          })),
          emptyAr: 'لا يوجد لاعبون في هذا الموسم',
        },
      ],
    };
  },
};
