// ══════════════════════════════════════════════════════
// 🪞 ردم: حجوزات البوت القائمة → صفوف تفاصيل النشاط (bookings)
// ══════════════════════════════════════════════════════
// قرار المالك 2026-07-30: كل حجز سجّله البوت يجب أن يكون محجوزاً فعلياً في
// صفحة تفاصيل النشاط، بنفس قاعدة المرآة الجديدة:
//   • مربوط بحساب لاعب ⟵ صفّ bookings واحد count=1 + وسم appConfirmed
//   • غير مربوط        ⟵ لا يُسجَّل (يبقى في متابعة الحجوزات وحده)
//
// التشغيل (داخل حاوية الخادم):
//   npx tsx src/scripts/backfill-bot-booking-mirror.ts           ← معاينة فقط
//   npx tsx src/scripts/backfill-bot-booking-mirror.ts --apply   ← تنفيذ
// خُذ نسخة احتياطية قبل --apply.

import { and, eq, isNull, or, sql, ilike } from 'drizzle-orm';
import { getDB, connectDB } from '../config/db.js';
import { reservations, bookings, activities } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  await connectDB();
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  // حجوزات البوت المؤكَّدة غير المحذوفة (قائمة الانتظار ليست مقعداً)
  const rows = await db
    .select({
      id: reservations.id, activityId: reservations.activityId, playerId: reservations.playerId,
      phone: reservations.phone, contactName: reservations.contactName, people: reservations.peopleCount,
      appConfirmed: reservations.appConfirmed, createdBy: reservations.createdBy,
      actName: activities.name,
    })
    .from(reservations)
    .innerJoin(activities, eq(reservations.activityId, activities.id))
    .where(and(
      isNull(reservations.deletedAt),
      sql`${reservations.status} <> 'waitlist'`,
      or(
        ilike(reservations.createdBy, '%بوت واتساب%'),
        ilike(reservations.contactMethod, '%بوت واتساب%'),
        ilike(reservations.contactMethod, '%إضافة أدمن%'),
      ),
    ));

  console.log(`حجوزات البوت المؤكَّدة: ${rows.length}`);

  let willInsert = 0, willTagOnly = 0, skippedUnlinked = 0, alreadyOk = 0;
  const plan: string[] = [];

  for (const r of rows) {
    if (!r.playerId) { skippedUnlinked++; continue; }             // غير مربوط ⟵ لا تسجيل

    const [pl] = await db.select({ id: players.id, name: players.name, phone: players.phone, isFree: players.isFreeAccount })
      .from(players).where(eq(players.id, r.playerId)).limit(1);
    if (!pl) { skippedUnlinked++; continue; }

    const [dup] = await db.select({ id: bookings.id }).from(bookings).where(and(
      eq(bookings.activityId, r.activityId),
      isNull(bookings.deletedAt),
      or(eq(bookings.playerId, pl.id), pl.phone ? eq(bookings.phone, pl.phone) : sql`false`),
    )).limit(1);

    if (dup && r.appConfirmed) { alreadyOk++; continue; }         // سليم أصلاً

    if (!dup) {
      willInsert++;
      plan.push(`  + صفّ جديد: ${pl.name} (${pl.phone}) → ${r.actName} [حجز #${r.id}, ${r.people} أشخاص]`);
      if (APPLY) {
        await db.insert(bookings).values({
          activityId: r.activityId,
          name: pl.name || r.contactName || '',
          phone: pl.phone || r.phone || '',
          count: 1,
          isPaid: !!pl.isFree,
          paidAmount: '0',
          isFree: !!pl.isFree,
          playerId: pl.id,
          createdBy: r.createdBy || '🤖 بوت واتساب',
          notes: 'ردم مرآة حجوزات البوت 2026-07-30',
        } as any);
      }
    } else {
      willTagOnly++;
      plan.push(`  ~ وسم فقط (له صفّ): ${pl.name} → ${r.actName} [حجز #${r.id}]`);
    }

    if (APPLY && !r.appConfirmed) {
      await db.update(reservations)
        .set({ appConfirmed: true, appConfirmedAt: new Date() } as any)
        .where(eq(reservations.id, r.id));
    }
  }

  console.log(plan.slice(0, 40).join('\n'));
  if (plan.length > 40) console.log(`  … و${plan.length - 40} أخرى`);
  console.log('\n── الخلاصة ──');
  console.log(`  صفوف ستُضاف لتفاصيل النشاط : ${willInsert}`);
  console.log(`  وسم appConfirmed فقط        : ${willTagOnly}`);
  console.log(`  سليمة أصلاً                 : ${alreadyOk}`);
  console.log(`  متجاوَزة (غير مربوطة بحساب) : ${skippedUnlinked}`);
  console.log(APPLY ? '\n✅ طُبِّق.' : '\n⏸️ معاينة فقط — أعد التشغيل مع --apply للتنفيذ.');
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
