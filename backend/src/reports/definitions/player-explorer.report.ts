// ══════════════════════════════════════════════════════
// 🔎 مستكشف اللاعبين — نسخة التصدير
// لا يحسب شيئاً بنفسه: يستدعي **نفس** خدمة explore() التي تُغذّي الشاشة الحيّة،
// ثمّ يصوغ الناتج مستنداً موحّداً. بهذا يستحيل أن يختلف رقمُ الملفّ عن رقم الشاشة،
// ويرث التصدير PDF/Excel من المُصدِّر القائم بلا مسارٍ ثانٍ.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument, ReportSection } from '../types.js';
import { explore, lensSummaryAr, type ExplorerPlayer } from '../../services/player-explorer.service.js';

const GENDER_AR: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى' };

export const playerExplorerReport: ReportDefinition = {
  key: 'player-explorer',
  titleAr: 'مستكشف اللاعبين',
  descriptionAr: 'فوجٌ من اللاعبين بأيّ نافذتَي تاريخ: حضورهم، وحجزُهم مقابل حضورهم، وما دفعوه، ورضاهم.',
  icon: '🔎',
  category: 'players',
  roles: ['admin', 'manager'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'signup', type: 'date-range', labelAr: 'نافذة إنشاء الحساب' },
    // 🔴 مقلوبٌ عمداً: coerceOne للـtoggle يُرجع false حين يغيب المعامل ولا يقرأ
    //    defaultValue — فلو سُمّي «قِس منذ التسجيل» لانقلب الافتراضيّ إلى عكس المقصود.
    { key: 'absoluteWindow', type: 'toggle', labelAr: 'نافذة قياس مطلقة',
      helpAr: 'بلا تفعيل: يُقاس كلُّ لاعبٍ منذ يوم تسجيله هو' },
    { key: 'window', type: 'date-range', labelAr: 'نافذة القياس (عند تفعيل ما سبق)' },
    { key: 'locationId', type: 'location-picker', labelAr: 'الموقع', optionsSource: 'locations' },
    { key: 'gender', type: 'select', labelAr: 'الجنس', options: [
      { value: '', labelAr: 'الكل' }, { value: 'MALE', labelAr: 'ذكر' }, { value: 'FEMALE', labelAr: 'أنثى' },
    ] },
    { key: 'minActivities', type: 'number', labelAr: 'فعاليّات من', min: 0, max: 999, helpAr: 'بلا حدّ' },
    { key: 'maxActivities', type: 'number', labelAr: 'إلى', min: 0, max: 999, helpAr: 'بلا حدّ' },
    { key: 'excludeTestAccounts', type: 'toggle', labelAr: 'استثنِ الحسابات التجريبيّة' },
    { key: 'includeTestLocations', type: 'toggle', labelAr: 'اشمل مواقع الاختبار' },
  ],

  async resolve({ db, params, user }): Promise<ReportDocument> {
    const abs = params.absoluteWindow === true;
    const result = await explore(db, {
      signupFrom: params.signup?.from,
      signupTo: params.signup?.to,
      windowFrom: abs ? params.window?.from : null,
      windowTo: abs ? params.window?.to : null,
      locationIds: params.locationId ? [params.locationId] : [],
      gender: params.gender || null,
      minActivities: params.minActivities,
      maxActivities: params.maxActivities,
      includeTestAccounts: params.excludeTestAccounts !== true,
      includeTestLocations: params.includeTestLocations === true,
    });

    const { totals: t, players } = result;

    // أسماء المواقع للملخّص العربيّ في الرأس
    let locNames: Map<number, string> | undefined;
    if (result.lens.locationIds.length) {
      const rows: any = await db.execute(sql`SELECT id, name FROM locations`);
      locNames = new Map(((rows.rows ?? rows) as any[]).map((r) => [Number(r.id), String(r.name)]));
    }

    const money = (n: number) => Math.round(n * 100) / 100;
    const revenue = money(t.paidTotal + t.fnbTotal);

    const sections: ReportSection[] = [
      {
        type: 'kpis', items: [
          { icon: '👥', labelAr: 'لاعبو الفوج', value: t.players, format: 'number', tone: 'blue' },
          { icon: '🎯', labelAr: 'حضروا فعاليّة', value: t.attended, format: 'number', tone: 'green',
            sub: `${t.players ? Math.round((t.attended / t.players) * 100) : 0}٪ من الفوج` },
          { icon: '🔁', labelAr: 'عادوا (فعاليّتان فأكثر)', value: t.returned, format: 'number', tone: 'amber',
            sub: `${t.returnRate}٪ ممّن حضروا` },
          { icon: '🚫', labelAr: 'لم يحضروا إطلاقاً', value: t.neverAttended, format: 'number', tone: 'red' },
          { icon: '📊', labelAr: 'متوسّط الفعاليّات لمن حضر', value: t.avgActivities, format: 'number', tone: 'purple' },
          { icon: '💰', labelAr: 'الإيراد المحصّل', value: revenue, format: 'currency', tone: 'green',
            sub: `حجوزات ${money(t.paidTotal)} · منيو ${money(t.fnbTotal)}` },
        ],
      },
      {
        type: 'keyvalue', titleAr: 'قمع التحويل',
        items: result.funnel.map((f) => ({ labelAr: f.labelAr, value: `${f.count} (${f.pct}٪)` })),
      },
      {
        type: 'keyvalue', titleAr: 'الحجز مقابل الحضور',
        items: [
          { labelAr: 'فعاليّات محجوزة', value: t.bookings, format: 'number' },
          { labelAr: 'حجوزات بلا حضور', value: `${t.noShows} (${t.noShowRate}٪)` },
          { labelAr: 'حضور بلا حجز', value: t.walkIns, format: 'number' },
          { labelAr: 'مستحقّات غير محصّلة', value: money(t.unpaidTotal), format: 'currency' },
        ],
      },
      {
        type: 'keyvalue', titleAr: 'الرضا والاتصال',
        items: [
          { labelAr: 'متوسّط التقييم العامّ (١–٥)', value: t.feedbackAvg ?? '—' },
          { labelAr: 'عدد التقييمات المُعبّأة', value: t.feedbackCount, format: 'number' },
          { labelAr: 'لديهم جهاز إشعارات', value: t.withPush, format: 'number' },
          // 🔴 التشبس ليس إيراداً: كلّ حركاته جوائزُ داخل اللعبة، وحقلُ الدينار
          //    مملوءٌ في صفٍّ واحدٍ على الإنتاج — يُعرض كتفاعلٍ لا كمال.
          { labelAr: 'تشبس مكتسب / مصروف (تفاعل لا إيراد)', value: `${t.chipsEarned} / ${t.chipsSpent}` },
        ],
      },
      {
        type: 'table', titleAr: 'توزيع اللاعبين حسب عدد الفعاليّات',
        columns: [
          { key: 'activities', labelAr: 'عدد الفعاليّات', align: 'center', format: 'number' },
          { key: 'players', labelAr: 'لاعبون', align: 'center', format: 'number' },
          { key: 'share', labelAr: 'الحصّة', align: 'center' },
        ],
        rows: result.distribution.map((d) => ({
          ...d, share: `${t.players ? Math.round((d.players / t.players) * 100) : 0}٪`,
        })),
        emptyAr: 'لا لاعبين في هذه العدسة',
      },
      {
        type: 'table', titleAr: `اللاعبون (${players.length})`,
        columns: [
          { key: 'name', labelAr: 'اللاعب' },
          { key: 'phone', labelAr: 'الهاتف' },
          { key: 'genderAr', labelAr: 'الجنس', align: 'center' },
          { key: 'createdAt', labelAr: 'التسجيل', format: 'date' },
          { key: 'activities', labelAr: 'فعاليّات', align: 'center', format: 'number' },
          { key: 'matches', labelAr: 'مباريات', align: 'center', format: 'number' },
          { key: 'winPct', labelAr: 'الفوز', align: 'center' },
          { key: 'bookedActivities', labelAr: 'حجز', align: 'center', format: 'number' },
          { key: 'noShows', labelAr: 'لم يحضر', align: 'center', format: 'number' },
          { key: 'spend', labelAr: 'أنفق', align: 'center', format: 'currency' },
          { key: 'feedbackAvg', labelAr: 'تقييمه', align: 'center' },
          { key: 'firstActivityAt', labelAr: 'أوّل حضور', format: 'date' },
          { key: 'lastActivityAt', labelAr: 'آخر حضور', format: 'date' },
        ],
        rows: players.map((p: ExplorerPlayer) => ({
          name: p.name, phone: p.phone,
          genderAr: GENDER_AR[p.gender || ''] || '—',
          createdAt: p.createdAt.slice(0, 10),
          activities: p.activities, matches: p.matches,
          winPct: p.matches ? `${Math.round((p.wins / p.matches) * 100)}٪` : '—',
          bookedActivities: p.bookedActivities, noShows: p.noShows,
          spend: money(p.paidTotal + p.fnbTotal),
          feedbackAvg: p.feedbackAvg ?? '—',
          firstActivityAt: p.firstActivityAt, lastActivityAt: p.lastActivityAt,
        })),
        totalsRow: {
          name: 'المجموع', activities: t.activities, matches: t.matches,
          winPct: `${t.winRate}٪`, bookedActivities: t.bookings, noShows: t.noShows, spend: revenue,
        },
        emptyAr: 'لا لاعبين مطابقين',
      },
    ];

    return {
      header: {
        titleAr: 'مستكشف اللاعبين',
        subtitleAr: `${t.players} لاعباً · ${t.attended} حضروا · ${t.returned} عادوا`,
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'JOD',
        filtersSummaryAr: lensSummaryAr(result.lens, locNames),
      },
      sections,
      totals: [
        { labelAr: 'الإيراد المحصّل', value: revenue, format: 'currency', tone: 'green' },
        { labelAr: 'نسبة العودة', value: `${t.returnRate}٪`, tone: 'amber' },
        { labelAr: 'نسبة عدم الحضور', value: `${t.noShowRate}٪`, tone: 'red' },
      ],
    };
  },
};
