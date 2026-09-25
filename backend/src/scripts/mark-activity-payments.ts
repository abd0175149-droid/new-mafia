// ══════════════════════════════════════════════════════
// 💰 تعليمُ حجوزات فعاليّاتٍ مدفوعةً — تسويةٌ بأثرٍ رجعيّ
// ══════════════════════════════════════════════════════
// حين يُحصَّل المال في الليلة ولا يُسجَّل في اللوحة، تبقى الفعاليّة بإيرادٍ
// صفر وإن كان الصندوق ممتلئاً. هذا السكربت يسجّل ما حُصّل فعلاً.
//
//   npx tsx src/scripts/mark-activity-payments.ts --ids 212,213 --by omar
//   npx tsx src/scripts/mark-activity-payments.ts --ids 212,213 --by omar --apply
//
// الخيارات:
//   --ids    أرقامُ الفعاليّات (إلزاميّ) — صريحةٌ لا مدىً زمنيّ، فلا يُمسّ ما لم يُقصد
//   --by     اسمُ المُستلِم كما يُسجّله النظام (مثال: omar)
//   --amount مبلغُ الحجز الواحد — الافتراضيّ سعرُ الفعاليّة الأساسيّ
//   --apply  التنفيذ (بدونه عرضٌ فقط)
//
// 🔴 لا يُمسّ:
//   • حجزٌ مجّانيّ (`is_free`) — ليس إيراداً ولا يُحصَّل منه شيء.
//   • حجزٌ مدفوعٌ سلفاً — إعادةُ تعليمه تُغيّر مبلغاً سُجّل بعنايةٍ من قبل.
//   • `received_by` مكتوبٌ سلفاً على الحجز — من سجّل اسمَه أدرى.
// وتكرارُ التشغيل لا يغيّر شيئاً: الشرطُ `is_paid = false` يستنفد نفسه.

import { and, eq, isNull, inArray, sql } from 'drizzle-orm';
import { connectDB, getDB, disconnectDB } from '../config/db.js';
import { activities, bookings } from '../schemas/admin.schema.js';

function argOf(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : null;
}
const APPLY = process.argv.includes('--apply');
const IDS = (argOf('ids') || '').split(',').map(s => parseInt(s.trim())).filter(Number.isFinite);
const BY = (argOf('by') || '').trim();
const AMOUNT_OVERRIDE = argOf('amount') ? Number(argOf('amount')) : null;

const jod = (n: number) => `${n.toFixed(2)} د.أ`;

async function main() {
  if (!IDS.length) {
    console.error('❌ مرّر أرقام الفعاليّات: --ids 212,213');
    process.exit(1);
  }
  if (AMOUNT_OVERRIDE !== null && !(AMOUNT_OVERRIDE > 0)) {
    console.error('❌ --amount يجب أن يكون موجباً');
    process.exit(1);
  }

  await connectDB();
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  const acts = await db.select({
    id: activities.id, name: activities.name, date: activities.date,
    basePrice: activities.basePrice, receivedBy: activities.receivedBy,
  }).from(activities).where(and(inArray(activities.id, IDS), isNull(activities.deletedAt)));

  const missing = IDS.filter(id => !acts.find(a => a.id === id));
  if (missing.length) {
    console.error(`❌ فعاليّات غير موجودة أو محذوفة: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n💰 ${acts.length} فعاليّة · المُستلِم: ${BY || '— (لن يُكتب)'} · ${APPLY ? 'تنفيذ' : 'عرضٌ فقط'}\n`);

  let grand = 0, grandN = 0;
  const plan: Array<{ id: number; name: string; n: number; amount: number; total: number; setActReceiver: boolean }> = [];

  for (const a of acts) {
    const price = AMOUNT_OVERRIDE ?? Number(a.basePrice || 0);
    const rows = await db.select({ id: bookings.id, receivedBy: bookings.receivedBy })
      .from(bookings)
      .where(and(
        eq(bookings.activityId, a.id),
        isNull(bookings.deletedAt),
        eq(bookings.isPaid, false),
        eq(bookings.isFree, false),
      ));

    const total = rows.length * price;
    const day = new Date(a.date as any).toISOString().slice(0, 10);
    const warn = price <= 0 ? '  ⚠️ سعرُ الفعاليّة صفر — مرّر --amount' : '';
    console.log(`#${a.id}  ${day}  ${String(a.name).slice(0, 26).padEnd(26)}  ${String(rows.length).padStart(3)} حجزاً × ${jod(price)} = ${jod(total)}${warn}`);

    if (price > 0) { grand += total; grandN += rows.length; }
    plan.push({
      id: a.id, name: String(a.name), n: rows.length, amount: price, total,
      setActReceiver: !!BY && !String(a.receivedBy || '').trim(),
    });
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`المجموع: ${grandN} حجزاً · ${jod(grand)}`);

  if (!APPLY) {
    console.log('\n👁️  عرضٌ فقط. للتنفيذ أضف --apply\n');
    await disconnectDB();
    return;
  }
  if (plan.some(p => p.amount <= 0)) {
    console.error('\n❌ فيها فعاليّةٌ بسعرٍ صفر — مرّر --amount أو استبعدها. لم يُنفَّذ شيء.\n');
    await disconnectDB();
    process.exit(1);
  }

  let doneN = 0, doneAmt = 0;
  for (const p of plan) {
    const res: any = await db.update(bookings).set({
      isPaid: true,
      paidAmount: String(p.amount.toFixed(2)),
      // اسمُ المُستلِم يُكتب على الفارغ وحده — من سجّل اسمَه أدرى
      ...(BY ? { receivedBy: sql`CASE WHEN COALESCE(${bookings.receivedBy}, '') = '' THEN ${BY} ELSE ${bookings.receivedBy} END` } : {}),
    } as any).where(and(
      eq(bookings.activityId, p.id),
      isNull(bookings.deletedAt),
      eq(bookings.isPaid, false),
      eq(bookings.isFree, false),
    )).returning({ id: bookings.id });

    const n = (res as any[]).length;
    doneN += n; doneAmt += n * p.amount;

    if (p.setActReceiver) {
      await db.update(activities).set({ receivedBy: BY } as any).where(eq(activities.id, p.id));
    }
    console.log(`  ✅ #${p.id} — ${n} حجزاً · ${jod(n * p.amount)}${p.setActReceiver ? ' · ومُستلِمُ الفعاليّة' : ''}`);
  }

  console.log(`\n✅ سُجّل ${doneN} حجزاً بمجموع ${jod(doneAmt)}\n`);
  await disconnectDB();
}

main().catch(async (e) => {
  console.error('❌', e?.message || e);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
