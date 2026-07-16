// ══════════════════════════════════════════════════════
// 🖨️ كشف حجوزات فعاليّة — Reservation Roster
// كشف تشغيليّ يُطبع ليلة الفعاليّة: كلّ الحاجزين بترتيبٍ أبجديّ مع العدد
// والحالة (مثبّت/غير مثبّت) والحضور والملاحظات والربط بحساب لاعب.
// يُستدعى من صفحة متابعة الحجوزات مباشرةً (زرّ الطباعة) ومن صفحة التقارير.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, sql, asc } from 'drizzle-orm';
import type { ReportDefinition, ReportDocument } from '../types.js';
import { reservations, activities, locations } from '../../schemas/admin.schema.js';
import { players } from '../../schemas/player.schema.js';
import { num } from '../helpers.js';

// الحالة الثنائيّة كما في صفحة المتابعة: pending = غير مثبّت، وما عداها (confirmed + paid_all القديمة) = مثبّت
const isConfirmed = (status: string) => status !== 'pending';

export const reservationRosterReport: ReportDefinition = {
  key: 'reservation-roster',
  titleAr: 'كشف حجوزات فعاليّة',
  descriptionAr: 'كشف الحاجزين لفعاليّة محدّدة: العدد، الحالة، الحضور، الملاحظات — جاهز للطباعة ليلة الفعاليّة.',
  icon: '🖨️',
  category: 'operations',
  roles: ['admin', 'manager', 'accountant', 'leader'],
  formats: ['pdf', 'excel'],
  params: [
    { key: 'activityId', type: 'activity-picker', labelAr: 'الفعاليّة', required: true, optionsSource: 'activities' },
  ],
  async resolve({ db, params, user }): Promise<ReportDocument> {
    const actId = params.activityId as number;

    const [act] = await db.select({
      id: activities.id, name: activities.name, date: activities.date,
      locationName: locations.name, maxCapacity: activities.maxCapacity,
    }).from(activities)
      .leftJoin(locations, eq(activities.locationId, locations.id))
      .where(and(eq(activities.id, actId), isNull(activities.deletedAt)))
      .limit(1);
    if (!act) throw new Error('الفعاليّة غير موجودة');

    const rows = await db.select({
      contactName: reservations.contactName,
      phone: reservations.phone,
      peopleCount: reservations.peopleCount,
      status: reservations.status,
      attended: reservations.attended,
      notes: reservations.notes,
      createdBy: reservations.createdBy,
      appConfirmed: reservations.appConfirmed,
      linkedPlayerName: players.name,
    }).from(reservations)
      .leftJoin(players, eq(reservations.playerId, players.id))
      .where(and(eq(reservations.activityId, actId), isNull(reservations.deletedAt)))
      .orderBy(asc(reservations.contactName));

    const totalPeople = rows.reduce((s, r) => s + (r.peopleCount || 1), 0);
    const confirmedRows = rows.filter(r => isConfirmed(r.status));
    const confirmedPeople = confirmedRows.reduce((s, r) => s + (r.peopleCount || 1), 0);
    const attendedRows = rows.filter(r => r.attended === true);
    const attendedPeople = attendedRows.reduce((s, r) => s + (r.peopleCount || 1), 0);
    const noShowRows = rows.filter(r => r.attended === false);

    const dateAr = new Date(act.date).toLocaleDateString('ar-JO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return {
      header: {
        titleAr: `كشف حجوزات — ${act.name}`,
        subtitleAr: `${dateAr}${act.locationName ? ` • ${act.locationName}` : ''}`,
        generatedAt: new Date().toISOString(),
        generatedByAr: user.displayName,
        currency: 'IQD',
        filtersSummaryAr: [act.name],
      },
      sections: [
        {
          type: 'kpis', items: [
            { labelAr: 'حجوزات', value: rows.length, format: 'number', tone: 'blue' },
            { labelAr: 'أشخاص', value: totalPeople, format: 'number', tone: 'amber', sub: act.maxCapacity ? `السعة ${act.maxCapacity}` : undefined },
            { labelAr: 'مثبّت', value: `${confirmedRows.length} (${confirmedPeople} شخصاً)`, tone: 'green' },
            { labelAr: 'حضر', value: `${attendedRows.length} (${attendedPeople} شخصاً)`, tone: 'purple', sub: noShowRows.length ? `${noShowRows.length} لم يحضر` : undefined },
          ],
        },
        {
          type: 'table', titleAr: 'الحاجزون (أبجديّاً)',
          columns: [
            { key: 'serial', labelAr: '#', align: 'center' },
            { key: 'contactName', labelAr: 'الاسم' },
            { key: 'phone', labelAr: 'الهاتف' },
            { key: 'peopleCount', labelAr: 'العدد', format: 'number', align: 'center' },
            { key: 'statusAr', labelAr: 'الحالة', format: 'badge', align: 'center' },
            { key: 'attendedAr', labelAr: 'الحضور', format: 'badge', align: 'center' },
            { key: 'linkedAr', labelAr: 'حساب', align: 'center' },
            { key: 'notes', labelAr: 'ملاحظات' },
          ],
          rows: rows.map((r, i) => ({
            serial: i + 1,
            contactName: r.contactName,
            phone: r.phone || '—',
            peopleCount: num(r.peopleCount) || 1,
            statusAr: `${isConfirmed(r.status) ? 'مثبّت' : 'غير مثبّت'}${r.appConfirmed ? ' (تطبيق)' : ''}`,
            attendedAr: r.attended === true ? 'حضر' : r.attended === false ? 'لم يحضر' : '—',
            linkedAr: r.linkedPlayerName ? '✓ مرتبط' : '—',
            notes: r.notes || '',
          })),
          totalsRow: {
            serial: '', contactName: 'الإجماليّ', phone: `${rows.length} حجزاً`,
            peopleCount: totalPeople, statusAr: `${confirmedRows.length} مثبّت`,
            attendedAr: `${attendedRows.length} حضر`, linkedAr: '', notes: '',
          },
          emptyAr: 'لا حجوزات لهذه الفعاليّة بعد',
        },
      ],
      totals: [
        { labelAr: 'إجماليّ الأشخاص المتوقَّعين', value: totalPeople, tone: 'amber' },
        { labelAr: 'المثبّتون (أشخاصاً)', value: confirmedPeople, tone: 'green' },
      ],
    };
  },
};
