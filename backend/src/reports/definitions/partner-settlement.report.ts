// ══════════════════════════════════════════════════════
// 🤝 تقرير تسوية الشركاء — Partner Settlement
// ربح كل شريك: إيراد حسب من أنشأ الحجز − مصاريف حسب من دفعها.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { staff, bookings, costs } from '../../schemas/admin.schema.js';
import { paidRevenue, num } from '../helpers.js';

export const partnerSettlementReport: ReportDefinition = {
  key: 'partner-settlement',
  titleAr: 'تسوية الشركاء',
  descriptionAr: 'ربح كل شريك: الإيرادات المحصّلة حسب مُنشئ الحجز مقابل المصاريف حسب مَن دفعها.',
  icon: '🤝',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [],
  async resolve({ db, user }): Promise<ReportDocument> {
    const partners = await db.select({
      id: staff.id, name: staff.displayName, role: staff.role, isActive: staff.isActive,
    }).from(staff).where(and(eq(staff.isPartner, true), isNull(staff.deletedAt)));

    const revByCreator = await db.select({
      createdBy: bookings.createdBy, revenue: paidRevenue(),
      bookingCount: sql<number>`COUNT(*)::int`,
    }).from(bookings).where(isNull(bookings.deletedAt)).groupBy(bookings.createdBy);

    const costByPayer = await db.select({
      paidBy: costs.paidBy, total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs).where(isNull(costs.deletedAt)).groupBy(costs.paidBy);

    const revMap = new Map(revByCreator.map((r) => [r.createdBy, { revenue: num(r.revenue), bookings: r.bookingCount }]));
    const costMap = new Map(costByPayer.map((c) => [c.paidBy, num(c.total)]));

    const rows = partners.map((p) => {
      const rev = revMap.get(p.name) ?? { revenue: 0, bookings: 0 };
      const cost = costMap.get(p.name) ?? 0;
      return {
        name: p.name, role: p.role,
        revenue: rev.revenue, bookings: rev.bookings, costs: cost,
        profit: rev.revenue - cost,
        activeAr: p.isActive ? 'نشط' : 'موقوف',
      };
    });

    const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
    const totalCost = rows.reduce((s, r) => s + r.costs, 0);

    return {
      header: {
        titleAr: 'تسوية الشركاء',
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '🤝', labelAr: 'عدد الشركاء', value: partners.length, format: 'number', tone: 'blue' },
            { icon: '💰', labelAr: 'إجمالي الإيرادات', value: totalRev, format: 'currency', tone: 'green' },
            { icon: '💸', labelAr: 'إجمالي المصاريف', value: totalCost, format: 'currency', tone: 'red' },
          ],
        },
        {
          type: 'table', titleAr: 'الشركاء',
          columns: [
            { key: 'name', labelAr: 'الشريك' },
            { key: 'role', labelAr: 'الدور', format: 'badge' },
            { key: 'revenue', labelAr: 'الإيرادات', format: 'currency' },
            { key: 'bookings', labelAr: 'حجوزات', format: 'number', align: 'center' },
            { key: 'costs', labelAr: 'المصاريف', format: 'currency' },
            { key: 'profit', labelAr: 'الربح', format: 'currency' },
            { key: 'activeAr', labelAr: 'الحالة', format: 'badge' },
          ],
          rows,
          totalsRow: { name: 'الإجمالي', revenue: totalRev, costs: totalCost, profit: totalRev - totalCost },
          emptyAr: 'لا يوجد شركاء مسجّلون',
        },
      ],
      totals: [
        { labelAr: 'إجمالي الإيرادات', value: totalRev, format: 'currency', tone: 'green' },
        { labelAr: 'إجمالي المصاريف', value: totalCost, format: 'currency', tone: 'red' },
      ],
    };
  },
};
