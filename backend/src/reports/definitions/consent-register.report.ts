// ══════════════════════════════════════════════════════
// ⚖️ سجلّ الموافقات — نسخة التصدير
// يستدعي **نفس** خدمة consentRegister التي تُغذّي الشاشة، فيستحيل أن يختلف
// رقمُ الملفّ عن رقم الشاشة. وهذا ملفٌّ قد يُقدَّم لجهةٍ رقابيّة أو لمحامٍ،
// فاختلافُ رقمَين بين شاشةٍ وملفٍّ ليس تفاوتاً بل تناقضُ إفادة.
// ══════════════════════════════════════════════════════

import type { ReportDefinition, ReportDocument, ReportSection } from '../types.js';
import { consentRegister, STATUS_LABELS, type ConsentPlayer } from '../../services/consent-register.service.js';

const KIND_AR: Record<string, string> = { privacy: 'سياسة الخصوصيّة', terms: 'شروط الاستخدام' };

export const consentRegisterReport: ReportDefinition = {
  key: 'consent-register',
  titleAr: 'سجلّ الموافقات',
  descriptionAr: 'حالةُ الموافقة على الخصوصيّة والشروط لكلّ لاعب وسجلُّها — سنداً لقانون ٢٤ لسنة ٢٠٢٣.',
  icon: '⚖️',
  category: 'players',
  // 🔒 المدير وحده (قرار المالك): الملفّ يجمع أسماءً وهواتفَ وأعماراً وسجلَّ موافقات.
  roles: ['admin'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'status', type: 'select', labelAr: 'الحالة', options: [
      { value: 'all', labelAr: 'الكل' },
      { value: 'complete', labelAr: 'مكتملة' },
      { value: 'partial', labelAr: 'ناقصة' },
      { value: 'withdrawn', labelAr: 'مسحوبة' },
      { value: 'played_no_consent', labelAr: 'لعب بلا موافقة' },
      { value: 'never_asked', labelAr: 'لم يُسأل بعد' },
    ] },
    { key: 'flag', type: 'select', labelAr: 'وسم', options: [
      { value: 'all', labelAr: 'بلا وسم' },
      { value: 'minor', labelAr: 'قاصرون' },
      { value: 'ageUnknown', labelAr: 'مجهولو السنّ' },
      { value: 'guardianMissing', labelAr: 'وليّ أمرٍ ناقص' },
      { value: 'deletion', labelAr: 'لديهم طلب حذف' },
    ] },
  ],

  async resolve({ db, params, user }): Promise<ReportDocument> {
    const r = await consentRegister(db, { status: params.status, flag: params.flag });
    const t = r.totals;

    const filters: string[] = [];
    filters.push(params.status && params.status !== 'all'
      ? `الحالة: ${STATUS_LABELS[params.status as keyof typeof STATUS_LABELS] ?? params.status}` : 'كلّ الحالات');
    if (params.flag && params.flag !== 'all') filters.push(`وسم: ${params.flag}`);

    const sections: ReportSection[] = [
      {
        type: 'kpis', items: [
          { icon: '👥', labelAr: 'لاعبون', value: t.players, format: 'number', tone: 'blue' },
          { icon: '✅', labelAr: 'موافقة مكتملة', value: t.complete, format: 'number', tone: 'green',
            sub: `${t.completeRate}٪` },
          { icon: '⚠️', labelAr: 'لعبوا بلا موافقة', value: t.playedNoConsent, format: 'number', tone: 'red' },
          { icon: '💤', labelAr: 'لم يُسألوا بعد', value: t.neverAsked, format: 'number', tone: 'gray' },
          { icon: '🧒', labelAr: 'قاصرون', value: t.minors, format: 'number', tone: 'amber',
            sub: `وليّ ناقص: ${t.guardianMissing}` },
          { icon: '❓', labelAr: 'مجهولو السنّ', value: t.ageUnknown, format: 'number', tone: 'amber' },
        ],
      },
      {
        type: 'table', titleAr: 'النسخ المنشورة',
        columns: [
          { key: 'kindAr', labelAr: 'الوثيقة' },
          { key: 'version', labelAr: 'النسخة', align: 'center' },
          { key: 'publishedAt', labelAr: 'نُشرت', format: 'date' },
          { key: 'grantedCount', labelAr: 'وافق عليها', align: 'center', format: 'number' },
          { key: 'reconsentAr', labelAr: 'تُلزم بإعادة الموافقة', align: 'center' },
        ],
        rows: r.published.map((d) => ({
          kindAr: KIND_AR[d.kind] || d.kind, version: d.version,
          publishedAt: d.publishedAt?.slice(0, 10) ?? '—',
          grantedCount: d.grantedCount, reconsentAr: d.requiresReconsent ? 'نعم' : '—',
        })),
        emptyAr: 'لا نسخة منشورة',
      },
      {
        type: 'keyvalue', titleAr: 'ملخّص الحالة',
        items: [
          { labelAr: 'مكتملة', value: t.complete, format: 'number' },
          { labelAr: 'ناقصة', value: t.partial, format: 'number' },
          { labelAr: 'مسحوبة', value: t.withdrawn, format: 'number' },
          { labelAr: 'لعب بلا موافقة', value: t.playedNoConsent, format: 'number' },
          { labelAr: 'لم يُسأل بعد', value: t.neverAsked, format: 'number' },
          { labelAr: 'صفوف السجلّ', value: t.trailRows, format: 'number' },
          { labelAr: 'لديهم طلب حذف', value: t.withDeletionRequest, format: 'number' },
        ],
      },
      {
        type: 'table', titleAr: `اللاعبون (${r.players.length})`,
        columns: [
          { key: 'name', labelAr: 'اللاعب' },
          { key: 'phone', labelAr: 'الهاتف' },
          { key: 'ageAr', labelAr: 'السنّ', align: 'center' },
          { key: 'privacyAr', labelAr: 'الخصوصيّة' },
          { key: 'termsAr', labelAr: 'الشروط' },
          { key: 'guardianAr', labelAr: 'وليّ الأمر' },
          { key: 'matches', labelAr: 'مباريات', align: 'center', format: 'number' },
          { key: 'statusAr', labelAr: 'الحالة', format: 'badge' },
        ],
        rows: r.players.map((p: ConsentPlayer) => ({
          name: p.name, phone: p.phone,
          ageAr: p.ageKnown ? `${p.age}${p.isMinor ? ' (قاصر)' : ''}` : 'مجهول',
          privacyAr: p.privacyAt ? `${p.privacyVersion} · ${p.privacyAt.slice(0, 10)} · ${p.privacyPlatform ?? ''}`.trim() : '—',
          termsAr: p.termsAt ? `${p.termsVersion} · ${p.termsAt.slice(0, 10)}` : '—',
          guardianAr: p.guardianMissing ? 'ناقص' : (p.guardianPhone ? `${p.guardianName ?? ''} ${p.guardianPhone}`.trim() : '—'),
          matches: p.matches,
          statusAr: STATUS_LABELS[p.status],
        })),
        totalsRow: { name: 'المجموع', matches: r.players.reduce((s, p) => s + p.matches, 0) },
        emptyAr: 'لا لاعبين مطابقين',
      },
    ];

    return {
      header: {
        titleAr: 'سجلّ الموافقات',
        subtitleAr: `${t.players} لاعباً · ${t.complete} بموافقة مكتملة · ${t.playedNoConsent} لعبوا بلا موافقة`,
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'JOD',
        filtersSummaryAr: [
          ...filters,
          'سنداً لقانون حماية البيانات الشخصيّة الأردنيّ رقم ٢٤ لسنة ٢٠٢٣',
          'السجلّ يُضاف إليه ولا يُعدَّل — الموافقة والسحب صفّان مستقلّان',
        ],
      },
      sections,
      totals: [
        { labelAr: 'نسبة الموافقة المكتملة', value: `${t.completeRate}٪`, tone: 'green' },
        { labelAr: 'لعبوا بلا موافقة', value: t.playedNoConsent, format: 'number', tone: 'red' },
        { labelAr: 'قاصرون', value: t.minors, format: 'number', tone: 'amber' },
      ],
    };
  },
};
