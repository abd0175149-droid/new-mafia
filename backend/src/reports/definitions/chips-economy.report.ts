// ══════════════════════════════════════════════════════
// 🪙 تقرير اقتصاد التشبس — Chips Economy
//
// الأرقام كلها مشتقّة من الدفتر (append-only)، ولا يوجد مُجمَّع مخزَّن
// يمكن أن ينحرف. القيمة النقدية تُقرأ من لقطة وقت الحركة (jod_amount)
// لا من أسعار الباقات اليوم — تغيير سعر باقة لا يُعيد كتابة الماضي.
//
// 🚫 حسابات الاختبار مستثناة من كل رقم: شحنُها ليس إيراداً ورصيدُها
//    ليس دَيناً على النادي.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { rangeDates, rangeLabel, num } from '../helpers.js';
import { CHIPS_PACKS, REASON_CATEGORY, CHIPS_REASON_CANON_SQL } from '../../schemas/chips.schema.js';

const REASON_AR: Record<string, string> = {
  admin_topup: 'شحن إداري', admin_adjust: 'تصحيح يدوي',
  drop_win: 'قطرة فوز', drop_top3: 'قطرة توب-3', drop_first_match: 'أول مباراة',
  reward_top3: 'مكافأة توب-3', reward_birthday: 'هديّة ميلاد',
  rent_item: 'استئجار عنصر', renew_item: 'تجديد إيجار',
  refund: 'استرجاع', gift_in: 'إهداء وارد', gift_out: 'إهداء صادر',
};

const CATEGORY_AR: Record<string, string> = {
  issuance: 'إصدار', sink: 'استهلاك', transfer: 'تحويل', other: 'أخرى',
};

function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

export const chipsEconomyReport: ReportDefinition = {
  key: 'chips-economy',
  titleAr: 'اقتصاد التشبس',
  descriptionAr: 'الإيراد المُسجَّل مقابل التشبس المجّاني، أين صُرف، وكم بقي دَيناً على النادي.',
  icon: '🪙',
  category: 'financial',
  roles: ['admin', 'manager', 'accountant'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'range', type: 'date-range', labelAr: 'الفترة الزمنية', required: false },
  ],

  async resolve({ db, params, user }): Promise<ReportDocument> {
    const { from, to } = rangeDates(params.range);
    const notTest = sql`NOT COALESCE(p.is_test_account, false)`;

    const byReason = rowsOf(await db.execute(sql`
      SELECT ${sql.raw(CHIPS_REASON_CANON_SQL)} AS reason,
             COUNT(*)::int AS moves,
             COALESCE(SUM(CASE WHEN l.amount > 0 THEN l.amount ELSE 0 END),0)::int AS credited,
             COALESCE(SUM(CASE WHEN l.amount < 0 THEN -l.amount ELSE 0 END),0)::int AS debited,
             COALESCE(SUM(l.jod_amount),0)::numeric AS jod
        FROM chips_ledger l
        JOIN players p ON p.id = l.player_id
       WHERE l.created_at >= ${from} AND l.created_at <= ${to} AND ${notTest}
       GROUP BY 1 ORDER BY 2 DESC
    `));

    const [rev] = rowsOf(await db.execute(sql`
      SELECT COALESCE(SUM(l.jod_amount),0)::numeric AS jod_recorded,
             COUNT(*) FILTER (WHERE l.jod_amount IS NULL)::int AS legacy_rows,
             COUNT(*) FILTER (WHERE l.jod_amount IS NOT NULL)::int AS recorded_rows
        FROM chips_ledger l
        JOIN players p ON p.id = l.player_id
       WHERE l.reason = 'admin_topup' AND l.created_at >= ${from} AND l.created_at <= ${to}
         AND ${notTest}
    `));

    const [liab] = rowsOf(await db.execute(sql`
      SELECT COALESCE(SUM(GREATEST(COALESCE(p.chips_balance,0),0)),0)::int AS circulating,
             COUNT(*) FILTER (WHERE COALESCE(p.chips_balance,0) > 0)::int AS holders
        FROM players p WHERE ${notTest}
    `));

    const [rentals] = rowsOf(await db.execute(sql`
      SELECT COUNT(*)::int AS active_rentals,
             COALESCE(SUM(r.price_paid_chips),0)::int AS paid_for_active
        FROM chips_rentals r JOIN players p ON p.id = r.player_id
       WHERE r.expires_at > NOW() AND ${notTest}
    `));

    // أكثر العناصر مبيعاً — يجيب «ما الذي يستحقّ إنتاج المزيد منه»
    const topItems = rowsOf(await db.execute(sql`
      SELECT i.name_ar, i.kind,
             COUNT(*)::int AS sales,
             COALESCE(SUM(-l.amount),0)::int AS chips
        FROM chips_ledger l
        JOIN players p ON p.id = l.player_id
        JOIN chips_items i ON i.id::text = l.ref_id
       WHERE l.reason IN ('rent_item','renew_item')
         AND l.created_at >= ${from} AND l.created_at <= ${to} AND ${notTest}
       GROUP BY i.name_ar, i.kind ORDER BY 3 DESC LIMIT 15
    `));

    const sum = (pred: (r: any) => boolean, f: 'credited' | 'debited') =>
      byReason.filter(pred).reduce((s: number, r: any) => s + num(r[f]), 0);

    const paidIssued = sum(r => r.reason === 'admin_topup', 'credited');
    const freeIssued = sum(r => String(r.reason).startsWith('drop_') || String(r.reason).startsWith('reward_'), 'credited');
    const issuedTotal = paidIssued + freeIssued
      + sum(r => r.reason === 'admin_adjust', 'credited') + sum(r => r.reason === 'refund', 'credited');
    const sunkStore = sum(r => ['rent_item', 'renew_item'].includes(r.reason), 'debited');
    const sunkTotal = sunkStore + sum(r => r.reason === 'admin_adjust', 'debited');

    const best = CHIPS_PACKS.reduce((a, b) => (a.chips / a.jod > b.chips / b.jod ? a : b));
    const jodPerChip = best.jod / best.chips;
    const circulating = num(liab?.circulating);

    const legacyRows = num(rev?.legacy_rows);

    return {
      header: {
        titleAr: 'اقتصاد التشبس',
        subtitleAr: rangeLabel(params.range),
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'IQD',
        filtersSummaryAr: [
          rangeLabel(params.range),
          'حسابات الاختبار مستثناة',
          legacyRows > 0
            ? `${legacyRows} عملية شحن أقدم من تسجيل القيمة — غير محتسبة`
            : 'كل عمليات الشحن في الفترة تحمل قيمتها',
        ],
      },
      sections: [
        {
          type: 'kpis',
          items: [
            { icon: '💰', labelAr: 'الإيراد المُسجَّل (د.أ)', value: Number(num(rev?.jod_recorded).toFixed(2)), format: 'number', tone: 'green',
              sub: `${num(rev?.recorded_rows)} عملية شحن موثّقة` },
            { icon: '🎁', labelAr: 'تشبس مجّاني صادر', value: freeIssued, format: 'number', tone: 'purple',
              sub: 'قطرات ومكافآت — تكلفة تسويق' },
            { icon: '🔥', labelAr: 'نسبة الاستهلاك', value: issuedTotal > 0 ? `${Math.round((sunkTotal / issuedTotal) * 100)}%` : '—', tone: 'amber',
              sub: `صُرف ${sunkTotal} من ${issuedTotal}` },
            { icon: '📉', labelAr: 'الالتزام (تشبس متداول)', value: circulating, format: 'number', tone: 'red',
              sub: `≈ ${(circulating * jodPerChip).toFixed(2)} د.أ · ${num(liab?.holders)} لاعباً` },
          ],
        },
        {
          type: 'keyvalue',
          titleAr: 'خلاصة الفترة',
          items: [
            { labelAr: 'تشبس صادر بمقابل نقدي', value: paidIssued, format: 'number' },
            { labelAr: 'نسبة المدفوع من الصادر', value: issuedTotal > 0 ? `${Math.round((paidIssued / issuedTotal) * 100)}%` : '—' },
            { labelAr: 'صُرف في الخزنة', value: sunkStore, format: 'number' },
            { labelAr: 'إيجارات فعّالة الآن', value: num(rentals?.active_rentals), format: 'number' },
            { labelAr: 'تشبس مدفوع في إيجارات فعّالة', value: num(rentals?.paid_for_active), format: 'number' },
            { labelAr: 'قيمة التشبس الواحد (أفضل باقة)', value: `${jodPerChip.toFixed(4)} د.أ` },
          ],
        },
        {
          type: 'table',
          titleAr: 'الحركات حسب النوع',
          columns: [
            { key: 'reasonAr', labelAr: 'الحركة' },
            { key: 'categoryAr', labelAr: 'التصنيف', format: 'badge' },
            { key: 'moves', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'credited', labelAr: 'وارد', format: 'number', align: 'center' },
            { key: 'debited', labelAr: 'صادر', format: 'number', align: 'center' },
            { key: 'jod', labelAr: 'دينار', format: 'number', align: 'center' },
          ],
          rows: byReason.map((r: any) => ({
            reasonAr: REASON_AR[r.reason] || r.reason,
            categoryAr: CATEGORY_AR[REASON_CATEGORY[r.reason] || 'other'],
            moves: num(r.moves), credited: num(r.credited), debited: num(r.debited),
            jod: Number(num(r.jod).toFixed(2)),
          })),
          totalsRow: {
            reasonAr: 'الإجمالي', categoryAr: '',
            moves: byReason.reduce((s: number, r: any) => s + num(r.moves), 0),
            credited: issuedTotal, debited: sunkTotal,
            jod: Number(num(rev?.jod_recorded).toFixed(2)),
          },
          emptyAr: 'لا حركات في هذه الفترة',
        },
        {
          type: 'table',
          titleAr: 'الأكثر مبيعاً في الخزنة',
          columns: [
            { key: 'name', labelAr: 'العنصر' },
            { key: 'kind', labelAr: 'النوع', format: 'badge' },
            { key: 'sales', labelAr: 'مرات الشراء', format: 'number', align: 'center' },
            { key: 'chips', labelAr: 'تشبس', format: 'number', align: 'center' },
          ],
          rows: topItems.map((r: any) => ({
            name: r.name_ar, kind: r.kind, sales: num(r.sales), chips: num(r.chips),
          })),
          emptyAr: 'لا مبيعات في هذه الفترة — التشبس يتراكم بلا مصرف',
        },
      ],
      totals: [
        { labelAr: 'الإيراد المُسجَّل', value: Number(num(rev?.jod_recorded).toFixed(2)), format: 'number', tone: 'green' },
        { labelAr: 'الالتزام المُقدَّر', value: Number((circulating * jodPerChip).toFixed(2)), format: 'number', tone: 'red' },
      ],
    };
  },
};
