// ══════════════════════════════════════════════════════
// 📋 تقرير النشاط — Activity Summary
// دخل النشاط وتكاليفه، الحاجزون، من لعب فعلاً، الغرف والألعاب.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, sql, desc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { activities, locations, bookings, costs } from '../../schemas/admin.schema.js';
import { sessions, matches, matchPlayers } from '../../schemas/game.schema.js';
import { paidRevenue, unpaidReceivable, paidCount, unpaidCount, freeCount, num, pct } from '../helpers.js';

const SCOPE_AR: Record<string, string> = {
  general: 'عام', activity: 'نشاط', player: 'لاعب', equipment: 'معدات', other: 'أخرى',
};
const STATUS_AR: Record<string, string> = {
  planned: 'مخطّط', active: 'نشط', completed: 'مكتمل', cancelled: 'ملغى',
};

export const activitySummaryReport: ReportDefinition = {
  key: 'activity-summary',
  titleAr: 'تقرير النشاط',
  descriptionAr: 'دخل النشاط وتكاليفه، الحاجزون ومن لعب فعلاً، عدد الغرف والألعاب.',
  icon: '📋',
  category: 'operations',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'activityId', type: 'activity-picker', labelAr: 'النشاط', required: true, optionsSource: 'activities' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const id = params.activityId as number;

    // (1) رأس النشاط
    const [act] = await db.select({
      id: activities.id, name: activities.name, date: activities.date,
      status: activities.status, basePrice: activities.basePrice,
      maxCapacity: activities.maxCapacity, description: activities.description,
      locationName: locations.name,
    }).from(activities)
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
      .limit(1);

    if (!act) throw new Error('النشاط غير موجود');

    // (2) تجميع الحجوزات
    const [bk] = await db.select({
      income: paidRevenue(), receivables: unpaidReceivable(),
      paid: paidCount(), unpaid: unpaidCount(), free: freeCount(),
      total: sql<number>`COUNT(*)::int`,
      attendees: sql<number>`COALESCE(SUM(${bookings.count}), 0)::int`,
      checkedIn: sql<number>`COALESCE(SUM(CASE WHEN ${bookings.checkedIn} = true THEN 1 ELSE 0 END), 0)::int`,
    }).from(bookings).where(and(eq(bookings.activityId, id), isNull(bookings.deletedAt)));

    // (3) صفوف الحجوزات
    const bookingRows = await db.select({
      name: bookings.name, phone: bookings.phone, count: bookings.count,
      isPaid: bookings.isPaid, isFree: bookings.isFree, paidAmount: bookings.paidAmount,
      receivedBy: bookings.receivedBy, checkedIn: bookings.checkedIn,
    }).from(bookings)
      .where(and(eq(bookings.activityId, id), isNull(bookings.deletedAt)))
      .orderBy(desc(bookings.createdAt));

    // (4) التكاليف
    const [costAgg] = await db.select({
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    }).from(costs).where(and(eq(costs.activityId, id), isNull(costs.deletedAt)));

    const costRows = await db.select({
      item: costs.item, scope: costs.scope, amount: costs.amount, date: costs.date, paidBy: costs.paidBy,
    }).from(costs)
      .where(and(eq(costs.activityId, id), isNull(costs.deletedAt)))
      .orderBy(desc(costs.date));

    // (5) الغرف والألعاب ومن لعب — sessions → matches → match_players
    const [roomsAgg] = await db.select({
      rooms: sql<number>`COUNT(DISTINCT ${sessions.id})::int`,
    }).from(sessions).where(and(eq(sessions.activityId, id), isNull(sessions.deletedAt)));

    const [gamesAgg] = await db.select({
      games: sql<number>`COUNT(DISTINCT ${matches.id})::int`,
      players: sql<number>`COUNT(DISTINCT ${matchPlayers.playerId})::int`,
    }).from(matches)
      .innerJoin(sessions, eq(matches.sessionId, sessions.id))
      .leftJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
      .where(and(eq(sessions.activityId, id), isNull(matches.deletedAt)));

    // الألعاب لكل غرفة (تفصيل)
    const roomBreakdown = await db.select({
      roomCode: sessions.sessionCode, roomName: sessions.sessionName,
      games: sql<number>`COUNT(DISTINCT ${matches.id})::int`,
      players: sql<number>`COUNT(DISTINCT ${matchPlayers.playerId})::int`,
    }).from(sessions)
      .leftJoin(matches, and(eq(matches.sessionId, sessions.id), isNull(matches.deletedAt)))
      .leftJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
      .where(and(eq(sessions.activityId, id), isNull(sessions.deletedAt)))
      .groupBy(sessions.id, sessions.sessionCode, sessions.sessionName)
      .orderBy(sessions.sessionCode);

    const income = num(bk?.income);
    const receivables = num(bk?.receivables);
    const activityCost = num(costAgg?.total);
    const net = income - activityCost;
    const occupancy = pct(num(bk?.attendees), num(act.maxCapacity));

    return {
      header: {
        titleAr: `تقرير النشاط — ${act.name}`,
        subtitleAr: `${act.locationName ?? 'بلا موقع'} — ${act.date ? new Date(act.date).toLocaleDateString('ar-IQ') : ''} — ${STATUS_AR[act.status] ?? act.status}`,
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'IQD',
        filtersSummaryAr: [`النشاط: ${act.name}`],
      },
      sections: [
        {
          type: 'kpis',
          items: [
            { icon: '💰', labelAr: 'الإيرادات المحصّلة', value: income, format: 'currency', tone: 'green' },
            { icon: '⏳', labelAr: 'المستحقات المعلّقة', value: receivables, format: 'currency', tone: 'red' },
            { icon: '💸', labelAr: 'تكاليف النشاط', value: activityCost, format: 'currency', tone: 'amber' },
            { icon: '📈', labelAr: 'صافي الربح', value: net, format: 'currency', tone: net >= 0 ? 'green' : 'red' },
            { icon: '🎟️', labelAr: 'نسبة الإشغال', value: occupancy, format: 'percent', tone: 'blue' },
          ],
        },
        {
          type: 'keyvalue', titleAr: 'الحضور والغرف',
          items: [
            { labelAr: 'عدد الغرف', value: num(roomsAgg?.rooms) },
            { labelAr: 'عدد الألعاب', value: num(gamesAgg?.games) },
            { labelAr: 'لاعبون لعبوا فعلاً', value: num(gamesAgg?.players) },
            { labelAr: 'إجمالي الحاجزين (أشخاص)', value: num(bk?.attendees) },
            { labelAr: 'سجّلوا حضورهم', value: num(bk?.checkedIn) },
            { labelAr: 'السعة القصوى', value: num(act.maxCapacity) },
            { labelAr: 'حجوزات مدفوعة', value: num(bk?.paid) },
            { labelAr: 'حجوزات غير مدفوعة', value: num(bk?.unpaid) },
            { labelAr: 'حجوزات مجانية', value: num(bk?.free) },
          ],
        },
        {
          type: 'table', titleAr: 'الغرف والألعاب',
          columns: [
            { key: 'roomCode', labelAr: 'رمز الغرفة' },
            { key: 'roomName', labelAr: 'اسم الغرفة' },
            { key: 'games', labelAr: 'عدد الألعاب', format: 'number', align: 'center' },
            { key: 'players', labelAr: 'لاعبون', format: 'number', align: 'center' },
          ],
          rows: roomBreakdown,
          emptyAr: 'لا توجد غرف مرتبطة بهذا النشاط',
        },
        {
          type: 'table', titleAr: 'الحاجزون',
          columns: [
            { key: 'name', labelAr: 'الاسم' },
            { key: 'phone', labelAr: 'الهاتف' },
            { key: 'count', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'statusAr', labelAr: 'الحالة', format: 'badge' },
            { key: 'paidAmount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'receivedBy', labelAr: 'استلمها' },
            { key: 'checkedInAr', labelAr: 'حضور', format: 'badge' },
          ],
          rows: bookingRows.map((r) => ({
            ...r,
            statusAr: r.isFree ? 'مجاني' : r.isPaid ? 'مدفوع' : 'غير مدفوع',
            checkedInAr: r.checkedIn ? '✓' : '—',
          })),
          totalsRow: { name: 'الإجمالي', count: num(bk?.attendees), paidAmount: income },
          emptyAr: 'لا توجد حجوزات',
        },
        {
          type: 'table', titleAr: 'التكاليف',
          columns: [
            { key: 'item', labelAr: 'البند' },
            { key: 'scopeAr', labelAr: 'النطاق', format: 'badge' },
            { key: 'amount', labelAr: 'المبلغ', format: 'currency' },
            { key: 'date', labelAr: 'التاريخ', format: 'date' },
            { key: 'paidBy', labelAr: 'دفعها' },
          ],
          rows: costRows.map((r) => ({ ...r, scopeAr: SCOPE_AR[r.scope ?? 'general'] ?? r.scope })),
          totalsRow: { item: 'الإجمالي', amount: activityCost },
          emptyAr: 'لا توجد تكاليف مسجّلة',
        },
      ],
      totals: [
        { labelAr: 'الإيرادات المحصّلة', value: income, format: 'currency', tone: 'green' },
        { labelAr: 'المستحقات (خارج الصافي)', value: receivables, format: 'currency', tone: 'red' },
        { labelAr: 'صافي الربح', value: net, format: 'currency', tone: net >= 0 ? 'green' : 'red' },
      ],
    };
  },
};
