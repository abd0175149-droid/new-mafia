// ══════════════════════════════════════════════════════
// 💼 تقرير الموازنة — Partner Balance
// صافي الفترة (دخل − مصاريف) مقسوماً على الشركاء بالتساوي،
// ثم تسوية كل شريك: + مصاريف دفعها  − مبالغ استلمها.
// النتيجة: كم يجب أن يكون صافي حساب كل شريك.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { activities, bookings, costs, staff } from '../../schemas/admin.schema.js';
import { paidRevenue, effectiveReceiver, num, rangeDates, rangeLabel, notTestActivity, notTestCost } from '../helpers.js';

export const partnerBalanceReport: ReportDefinition = {
  key: 'partner-balance',
  titleAr: 'تقرير الموازنة',
  descriptionAr: 'صافي الفترة مقسوماً على الشركاء بالتساوي، مع تسوية كل شريك: تُضاف المصاريف التي دفعها وتُخصم المبالغ التي استلمها — لبيان كم يجب أن يكون صافي حساب كل شريك.',
  icon: '💼',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);

    const actDateCond = and(
      isNull(activities.deletedAt),
      gte(activities.date, from),
      lte(activities.date, to),
      notTestActivity,
    );

    // ── مجموع الدخل خلال الفترة (أساس تاريخ النشاط، نقدي فقط — كالميزان المحاسبي) ──
    const [inc] = await db.select({ income: paidRevenue() })
      .from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .where(actDateCond);
    const income = num(inc?.income);

    // ── مجموع المصاريف التشغيلية خلال الفترة، مجمّعة حسب من دفعها (التأسيسية لها تقريرها المستقل) ──
    const costRows = await db.select({
      paidBy: costs.paidBy,
      total: sql<number>`COALESCE(SUM(${costs.amount}::numeric), 0)`,
    }).from(costs)
      .where(and(isNull(costs.deletedAt), gte(costs.date, from), lte(costs.date, to), notTestCost))
      .groupBy(costs.paidBy);
    const totalExpenses = costRows.reduce((s, c) => s + num(c.total), 0);

    // ── المبالغ المستلمة حسب الشخص (مستلم الفعالية يطغى على مستلم الحجز) ──
    const receiverRows = await db.select({ receiver: effectiveReceiver, received: paidRevenue() })
      .from(activities)
      .leftJoin(bookings, and(eq(bookings.activityId, activities.id), isNull(bookings.deletedAt)))
      .where(actDateCond)
      .groupBy(effectiveReceiver);

    const paidMap = new Map<string, number>();
    for (const c of costRows) {
      const k = (c.paidBy || '').trim() || 'غير محدد';
      paidMap.set(k, (paidMap.get(k) ?? 0) + num(c.total));
    }
    const receivedMap = new Map<string, number>();
    for (const r of receiverRows) {
      const k = (r.receiver || '').trim() || 'غير محدد';
      receivedMap.set(k, (receivedMap.get(k) ?? 0) + num(r.received));
    }

    // ── الشركاء وقسمة الصافي بالتساوي ──
    const partners = await db.select({ id: staff.id, name: staff.displayName })
      .from(staff).where(and(eq(staff.isPartner, true), isNull(staff.deletedAt)));
    const partnerCount = partners.length;
    const net = income - totalExpenses;
    const share = partnerCount > 0 ? net / partnerCount : 0;

    const rows = partners.map((p) => {
      const paid = paidMap.get(p.name) ?? 0;
      const received = receivedMap.get(p.name) ?? 0;
      const finalBalance = share + paid - received;
      return {
        name: p.name, share, paid, received, finalBalance,
        statusAr: finalBalance > 0.005 ? 'له' : finalBalance < -0.005 ? 'عليه' : 'متوازن',
      };
    }).sort((a, b) => b.finalBalance - a.finalBalance);

    const partnersPaid = rows.reduce((s, r) => s + r.paid, 0);
    const partnersReceived = rows.reduce((s, r) => s + r.received, 0);
    const partnersFinal = rows.reduce((s, r) => s + r.finalBalance, 0);

    // ── مبالغ بيد غير الشركاء (لا تدخل التسوية — للمراجعة والمتابعة) ──
    const partnerNames = new Set(partners.map((p) => p.name));
    const nonPartnerRows = Array.from(new Set([...paidMap.keys(), ...receivedMap.keys()]))
      .filter((n) => !partnerNames.has(n))
      .map((name) => {
        const received = receivedMap.get(name) ?? 0;
        const paid = paidMap.get(name) ?? 0;
        return { name, received, paid, held: received - paid };
      })
      .filter((r) => r.received !== 0 || r.paid !== 0)
      .sort((a, b) => b.held - a.held);

    return {
      header: {
        titleAr: 'تقرير الموازنة',
        subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis',
          items: [
            { icon: '💰', labelAr: 'مجموع الدخل', value: income, format: 'currency', tone: 'green' },
            { icon: '💸', labelAr: 'مجموع المصاريف', value: totalExpenses, format: 'currency', tone: 'amber' },
            { icon: '📈', labelAr: 'الصافي', value: net, format: 'currency', tone: net >= 0 ? 'green' : 'red' },
            { icon: '🤝', labelAr: 'عدد الشركاء', value: partnerCount, format: 'number', tone: 'blue' },
            { icon: '➗', labelAr: 'نصيب كل شريك', value: share, format: 'currency', tone: 'purple' },
          ],
        },
        {
          type: 'table', titleAr: 'موازنة الشركاء — كم يجب أن يكون صافي حساب كل شريك',
          columns: [
            { key: 'name', labelAr: 'الشريك' },
            { key: 'share', labelAr: 'نصيبه من الصافي', format: 'currency' },
            { key: 'paid', labelAr: 'مصاريف دفعها (+)', format: 'currency' },
            { key: 'received', labelAr: 'مبالغ استلمها (−)', format: 'currency' },
            { key: 'finalBalance', labelAr: 'صافي حسابه', format: 'currency' },
            { key: 'statusAr', labelAr: 'الحالة', format: 'badge', align: 'center' },
          ],
          rows,
          totalsRow: {
            name: 'الإجمالي',
            share: share * partnerCount,
            paid: partnersPaid,
            received: partnersReceived,
            finalBalance: partnersFinal,
          },
          emptyAr: 'لا يوجد شركاء مسجّلون (فعّل «شريك» من صفحة الموظفين)',
        },
        {
          type: 'table', titleAr: 'مبالغ بيد غير الشركاء (خارج التسوية)',
          columns: [
            { key: 'name', labelAr: 'الاسم' },
            { key: 'received', labelAr: 'استلم', format: 'currency' },
            { key: 'paid', labelAr: 'دفع مصاريف', format: 'currency' },
            { key: 'held', labelAr: 'معه حالياً', format: 'currency' },
          ],
          rows: nonPartnerRows,
          emptyAr: 'لا توجد مبالغ بيد غير الشركاء',
        },
      ],
      totals: [
        { labelAr: 'الصافي', value: net, format: 'currency', tone: net >= 0 ? 'green' : 'red' },
        { labelAr: 'نصيب كل شريك', value: share, format: 'currency', tone: 'purple' },
      ],
    };
  },
};
