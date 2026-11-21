// ══════════════════════════════════════════════════════
// 🧪 خطّة توحيد الحجز — م١ب «المال في المتابعة» (2026-11-21) — قراءةٌ فقط، لا كتابة
// يقارن رأس المتابعة رقماً برقم مع حساب صفحة الفعاليّة (من صفوف الحجز وأسعارها المقفولة،
// كما يعيدها GET /api/bookings) على أحدث خمس فعاليّاتٍ فيها سعرٌ مبكّر أو مجموعة عرض،
// ويتأكّد أنّ كلّ صفّ متابعة فيها يحمل حقل المال بلا خطأ.
// تشغيل: docker compose exec -T -w /app backend npx tsx src/scripts/e2e-followup-money.ts
// ══════════════════════════════════════════════════════
import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { lockedPricesFor } from '../services/early-price.service.js';
import { activityMoney, attachMoney } from '../services/followup-money.service.js';

let pass = 0, fail = 0; const failures: string[] = [];
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; failures.push(`${n}${x ? ` — ${x}` : ''}`); console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };
const r2 = (x: number) => Math.round(x * 100) / 100;

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];
  const acts = await q(sql`
    SELECT a.id, a.name, a.base_price FROM activities a
     WHERE a.deleted_at IS NULL AND a.id IN (
       SELECT activity_id FROM reservations WHERE unit_price IS NOT NULL AND deleted_at IS NULL
       UNION SELECT activity_id FROM booking_groups)
     ORDER BY a.date DESC LIMIT 5`);
  ok('وُجدت فعاليّاتٌ فيها سعرٌ مبكّر أو مجموعة', acts.length > 0, String(acts.length));
  for (const a of acts) {
    console.log(`\n«${a.name}» #${a.id}`);
    // حساب صفحة الفعاليّة حرفيّاً (activities/[id]/page.tsx): غير المدفوع × (المقفول ?? سعر الفعاليّة)
    const bks = await q(sql`SELECT id, count, is_paid, is_free, paid_amount FROM bookings WHERE activity_id = ${a.id} AND deleted_at IS NULL`);
    const locks = await lockedPricesFor(bks.map((b) => Number(b.id)));
    const base = Number(a.base_price) || 0;
    const pageExpected = r2(bks.filter((b) => !b.is_paid && !b.is_free).reduce((s, b) => s + (locks.get(Number(b.id))?.price ?? base) * (Number(b.count) || 1), 0));
    const pageRevenue = r2(bks.reduce((s, b) => s + (b.is_paid ? Number(b.paid_amount || 0) : 0), 0));
    const pageFree = bks.filter((b) => b.is_free).reduce((s, b) => s + (Number(b.count) || 1), 0);
    const m = await activityMoney(Number(a.id));
    ok('المتوقَّع يطابق صفحة الفعاليّة', m?.expected === pageExpected, `${m?.expected} ≠ ${pageExpected}`);
    // المحصَّل: الصفحة تجمع المدفوع كلّه، والمجّانيّ مدفوعٌ بصفر — فلا فرق
    ok('المحصَّل يطابق', m?.collected === pageRevenue, `${m?.collected} ≠ ${pageRevenue}`);
    ok('المجّانيّ يطابق', m?.free === pageFree, `${m?.free} ≠ ${pageFree}`);
    const rows = await q(sql`SELECT id, activity_id AS "activityId", player_id AS "playerId", phone, people_count AS "peopleCount",
      unit_price AS "unitPrice", promo_seats AS "promoSeats", price_promo_id AS "pricePromoId", created_by AS "createdBy"
      FROM reservations WHERE activity_id = ${a.id} AND deleted_at IS NULL`);
    await attachMoney(rows);
    ok(`كلّ صفوف المتابعة (${rows.length}) تحمل المال`, rows.every((r) => r.money && Number.isFinite(r.money.total)));
    const early = rows.filter((r) => r.unitPrice != null);
    if (early.length) ok(`صفوف السعر المبكّر (${early.length}) موسومة «مبكّر»`, early.every((r) => r.money.offers.some((o: any) => o.k === 'early')));
    const paidRows = rows.filter((r) => r.money.pay === 'paid');
    console.log(`  ℹ️ مدفوع ${paidRows.length} · غير مدفوع ${rows.filter((r) => r.money.pay === 'unpaid').length} · مجّانيّ ${rows.filter((r) => r.money.pay === 'free').length} · بلا صفّ مال ${rows.filter((r) => r.money.pay === 'none').length} · مرافقون ${m?.companionsDue} د.أ`);
  }
  console.log(`\n${fail ? '❌' : '✅'} م١ب: ${pass} نجح، ${fail} فشل`);
  if (failures.length) console.log(failures.map((f) => ' • ' + f).join('\n'));
  process.exit(fail ? 1 : 0);
}
main();
