// ══════════════════════════════════════════════════════
// 👤 تقرير لاعب — Player Statement
// ملف اللاعب الكامل: مشاركاته، ألعابه، نسبة الفوز، ما دفعه، ومصاريفه.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { bookings, costs, activities } from '../../schemas/admin.schema.js';
import { players } from '../../schemas/player.schema.js';
import { matches, matchPlayers, sessions } from '../../schemas/game.schema.js';
import { paidRevenue, unpaidReceivable, num, pct, rangeDates, rangeLabel, notTestActivity, notTestMatch } from '../helpers.js';

const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب',
};

export const playerStatementReport: ReportDefinition = {
  key: 'player-statement',
  titleAr: 'تقرير لاعب',
  descriptionAr: 'ملف اللاعب الكامل: مشاركاته في الفعاليات، ألعابه، نسبة الفوز، المبالغ المدفوعة، والمصاريف المرتبطة به.',
  icon: '👤',
  category: 'players',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'playerId', type: 'player-picker', labelAr: 'اللاعب', required: true, optionsSource: 'players' },
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية (اختياري)', required: false },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const pid = params.playerId as number;
    const hasRange = !!(params.range?.from || params.range?.to);
    const { from, to } = rangeDates(params.range);

    // (1) ملف اللاعب
    const [p] = await db.select({
      id: players.id, name: players.name, phone: players.phone, gender: players.gender,
      createdAt: players.createdAt, lastActiveAt: players.lastActiveAt,
      rankTier: players.rankTier, level: players.level, xp: players.xp, rankRR: players.rankRR,
      totalMatches: players.totalMatches, totalWins: players.totalWins, totalSurvived: players.totalSurvived,
      lifetimeMatches: players.lifetimeMatches, totalDeals: players.totalDeals, successfulDeals: players.successfulDeals,
    }).from(players).where(eq(players.id, pid)).limit(1);

    if (!p) throw new Error('اللاعب غير موجود');

    // (2) المبالغ المدفوعة عبر حجوزاته (نقدي)
    const bookingDateCond = hasRange
      ? and(gte(activities.date, from), lte(activities.date, to))
      : undefined;
    const [money] = await db.select({
      paid: paidRevenue(), receivables: unpaidReceivable(),
      count: sql<number>`COUNT(*)::int`,
    }).from(bookings)
      .leftJoin(activities, eq(bookings.activityId, activities.id))
      .where(and(eq(bookings.playerId, pid), isNull(bookings.deletedAt), bookingDateCond, notTestActivity));

    // صفوف الحجوزات
    const bookingRows = await db.select({
      activityName: activities.name, date: activities.date,
      isPaid: bookings.isPaid, isFree: bookings.isFree, paidAmount: bookings.paidAmount,
    }).from(bookings)
      .leftJoin(activities, eq(bookings.activityId, activities.id))
      .where(and(eq(bookings.playerId, pid), isNull(bookings.deletedAt), bookingDateCond, notTestActivity))
      .orderBy(desc(activities.date));

    // (3) مصاريف مرتبطة باللاعب
    const [pcost] = await db.select({
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs).where(and(eq(costs.scope, 'player'), eq(costs.playerId, pid), isNull(costs.deletedAt)));
    const playerCostRows = await db.select({
      item: costs.item, amount: costs.amount, date: costs.date, paidBy: costs.paidBy,
    }).from(costs)
      .where(and(eq(costs.scope, 'player'), eq(costs.playerId, pid), isNull(costs.deletedAt)))
      .orderBy(desc(costs.date));

    // (4) توزيع الأدوار وأداء المباريات
    const roleRows = await db.select({
      role: matchPlayers.role,
      count: sql<number>`COUNT(*)::int`,
      survived: sql<number>`COALESCE(SUM(CASE WHEN ${matchPlayers.survivedToEnd} = true THEN 1 ELSE 0 END), 0)::int`,
    }).from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(and(eq(matchPlayers.playerId, pid), notTestMatch))
      .groupBy(matchPlayers.role)
      .orderBy(desc(sql`COUNT(*)`));

    // (5) الأنشطة التي شارك فيها فعلاً (لعب)
    const playedActivities = await db.select({
      activityName: activities.name, date: activities.date,
      games: sql<number>`COUNT(DISTINCT ${matches.id})::int`,
    }).from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .innerJoin(sessions, eq(matches.sessionId, sessions.id))
      .leftJoin(activities, eq(sessions.activityId, activities.id))
      .where(and(eq(matchPlayers.playerId, pid), isNull(matches.deletedAt), notTestMatch))
      .groupBy(activities.id, activities.name, activities.date)
      .orderBy(desc(activities.date));

    const paid = num(money?.paid);
    const receivables = num(money?.receivables);
    const playerExpenses = num(pcost?.total);
    const netContribution = paid - playerExpenses;
    const winRate = pct(num(p.totalWins), num(p.totalMatches));
    const survivalRate = pct(num(p.totalSurvived), num(p.totalMatches));
    const dealRate = pct(num(p.successfulDeals), num(p.totalDeals));

    return {
      header: {
        titleAr: `تقرير لاعب — ${p.name}`,
        subtitleAr: `${p.phone} — ${RANK_AR[p.rankTier ?? ''] ?? p.rankTier} (مستوى ${p.level})`,
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'IQD',
        filtersSummaryAr: [`اللاعب: ${p.name}`, ...(hasRange ? [rangeLabel(params.range)] : [])],
      },
      sections: [
        {
          type: 'kpis',
          items: [
            { icon: '💰', labelAr: 'إجمالي المدفوع', value: paid, format: 'currency', tone: 'green' },
            { icon: '💸', labelAr: 'مصاريف مرتبطة به', value: playerExpenses, format: 'currency', tone: 'amber' },
            { icon: '📈', labelAr: 'صافي المساهمة', value: netContribution, format: 'currency', tone: netContribution >= 0 ? 'green' : 'red' },
            { icon: '🎮', labelAr: 'إجمالي المباريات', value: num(p.totalMatches), format: 'number', tone: 'blue' },
            { icon: '🏆', labelAr: 'نسبة الفوز', value: winRate, format: 'percent', tone: 'purple' },
          ],
        },
        {
          type: 'keyvalue', titleAr: 'الملف والإحصاءات',
          items: [
            { labelAr: 'الرتبة', value: RANK_AR[p.rankTier ?? ''] ?? p.rankTier ?? '—' },
            { labelAr: 'المستوى', value: num(p.level) },
            { labelAr: 'XP', value: num(p.xp) },
            { labelAr: 'نقاط الترتيب (RR)', value: num(p.rankRR) },
            { labelAr: 'مباريات مدى الحياة', value: num(p.lifetimeMatches) },
            { labelAr: 'انتصارات', value: num(p.totalWins) },
            { labelAr: 'نسبة النجاة', value: `${survivalRate}%` },
            { labelAr: 'الصفقات (ناجحة/إجمالي)', value: `${num(p.successfulDeals)}/${num(p.totalDeals)} (${dealRate}%)` },
            { labelAr: 'تاريخ الانضمام', value: p.createdAt ? new Date(p.createdAt).toLocaleDateString('ar-IQ') : '—' },
            { labelAr: 'آخر نشاط', value: p.lastActiveAt ? new Date(p.lastActiveAt).toLocaleDateString('ar-IQ') : '—' },
            { labelAr: 'حجوزاته (عدد)', value: num(money?.count) },
            { labelAr: 'مستحقات عليه', value: receivables, format: 'currency' },
          ],
        },
        {
          type: 'table', titleAr: 'الأنشطة التي لعب فيها',
          columns: [
            { key: 'activityName', labelAr: 'النشاط' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'games', labelAr: 'عدد ألعابه', format: 'number', align: 'center' },
          ],
          rows: playedActivities.map((a) => ({ ...a, activityName: a.activityName ?? '—' })),
          emptyAr: 'لم يلعب في أي نشاط',
        },
        {
          type: 'table', titleAr: 'سجل الحجوزات',
          columns: [
            { key: 'activityName', labelAr: 'النشاط' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'statusAr', labelAr: 'الحالة', format: 'badge' },
            { key: 'paidAmount', labelAr: 'المبلغ', format: 'currency' },
          ],
          rows: bookingRows.map((r) => ({
            activityName: r.activityName ?? '—', date: r.date,
            statusAr: r.isFree ? 'مجاني' : r.isPaid ? 'مدفوع' : 'غير مدفوع',
            paidAmount: r.paidAmount,
          })),
          totalsRow: { activityName: 'الإجمالي', paidAmount: paid },
          emptyAr: 'لا توجد حجوزات',
        },
        {
          type: 'table', titleAr: 'توزيع الأدوار',
          columns: [
            { key: 'role', labelAr: 'الدور' },
            { key: 'count', labelAr: 'مرّات', format: 'number', align: 'center' },
            { key: 'survived', labelAr: 'نجا حتى النهاية', format: 'number', align: 'center' },
          ],
          rows: roleRows,
          emptyAr: 'لا توجد مباريات',
        },
        {
          type: 'table', titleAr: 'المصاريف المرتبطة به',
          columns: [
            { key: 'item', labelAr: 'البند' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'paidBy', labelAr: 'دفعها' },
          ],
          rows: playerCostRows,
          totalsRow: { item: 'الإجمالي', amount: playerExpenses },
          emptyAr: 'لا توجد مصاريف مرتبطة',
        },
      ],
      totals: [
        { labelAr: 'إجمالي المدفوع', value: paid, format: 'currency', tone: 'green' },
        { labelAr: 'مصاريف مرتبطة به', value: playerExpenses, format: 'currency', tone: 'amber' },
        { labelAr: 'صافي المساهمة', value: netContribution, format: 'currency', tone: netContribution >= 0 ? 'green' : 'red' },
      ],
    };
  },
};
