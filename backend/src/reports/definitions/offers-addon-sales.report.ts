// ══════════════════════════════════════════════════════
// 🍔 تقرير مبيعات العروض (الإضافات) — Offers / Add-on Sales
// من bookings.offer_items مقابل كتالوج العروض في locations.offers.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, gte, lte, sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { bookings, activities, locations } from '../../schemas/admin.schema.js';
import { num, rangeDates, rangeLabel } from '../helpers.js';

interface OfferDef { id: unknown; name?: string; price?: unknown; }

export const offersAddonSalesReport: ReportDefinition = {
  key: 'offers-addon-sales',
  titleAr: 'مبيعات العروض (الإضافات)',
  descriptionAr: 'أكثر العروض مبيعاً ودخلها التقديري خلال فترة (أساس تاريخ النشاط).',
  icon: '🍔',
  category: 'operations',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
    { key: 'locationId', type: 'location-picker', labelAr: 'الموقع (اختياري)', required: false, optionsSource: 'locations' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const locId = params.locationId as number | undefined;

    // كتالوج العروض لكل موقع: key = `${locationId}:${offerId}`
    const locRows = await db.select({ id: locations.id, offers: locations.offers }).from(locations).where(isNull(locations.deletedAt));
    const catalog = new Map<string, { name: string; price: number }>();
    for (const l of locRows) {
      for (const o of (l.offers as OfferDef[] | null) ?? []) {
        catalog.set(`${l.id}:${String(o.id)}`, { name: o.name ?? String(o.id), price: num(o.price) });
      }
    }

    // الحجوزات ذات العروض ضمن الفترة
    const rows = await db.select({
      offerItems: bookings.offerItems, locationId: activities.locationId,
    }).from(bookings)
      .innerJoin(activities, eq(bookings.activityId, activities.id))
      .where(and(
        isNull(bookings.deletedAt), isNull(activities.deletedAt),
        gte(activities.date, from), lte(activities.date, to),
        locId ? eq(activities.locationId, locId) : undefined,
        sql`${bookings.offerItems} IS NOT NULL AND jsonb_array_length(${bookings.offerItems}) > 0`,
      ));

    // تجميع حسب العرض
    const agg = new Map<string, { name: string; count: number; revenue: number }>();
    for (const r of rows) {
      for (const oid of (r.offerItems as unknown[]) ?? []) {
        const key = `${r.locationId}:${String(oid)}`;
        const def = catalog.get(key);
        const name = def?.name ?? `عرض #${String(oid)}`;
        const price = def?.price ?? 0;
        const cur = agg.get(key) ?? { name, count: 0, revenue: 0 };
        cur.count += 1; cur.revenue += price;
        agg.set(key, cur);
      }
    }

    const list = Array.from(agg.values()).sort((a, b) => b.count - a.count);
    const totalCount = list.reduce((s, r) => s + r.count, 0);
    const totalRevenue = list.reduce((s, r) => s + r.revenue, 0);

    return {
      header: {
        titleAr: 'مبيعات العروض (الإضافات)', subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(), generatedByAr: user.displayName, currency: 'IQD',
        filtersSummaryAr: [rangeLabel(params.range)],
      },
      sections: [
        {
          type: 'kpis', items: [
            { icon: '🍔', labelAr: 'إجمالي العروض المباعة', value: totalCount, format: 'number', tone: 'blue' },
            { icon: '💰', labelAr: 'الدخل التقديري للعروض', value: totalRevenue, format: 'currency', tone: 'green' },
            { icon: '🗂️', labelAr: 'أنواع العروض', value: list.length, format: 'number', tone: 'amber' },
          ],
        },
        {
          type: 'table', titleAr: 'العروض',
          columns: [
            { key: 'name', labelAr: 'العرض' },
            { key: 'count', labelAr: 'مرّات البيع', format: 'number', align: 'center' },
            { key: 'revenue', labelAr: 'الدخل التقديري', format: 'currency' },
          ],
          rows: list,
          totalsRow: { name: 'الإجمالي', count: totalCount, revenue: totalRevenue },
          emptyAr: 'لا توجد مبيعات عروض في هذه الفترة',
        },
      ],
      totals: [{ labelAr: 'الدخل التقديري للعروض', value: totalRevenue, format: 'currency', tone: 'green' }],
    };
  },
};
