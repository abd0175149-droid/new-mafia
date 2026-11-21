// 🧪 خطّة توحيد الحجز — م٢-ب «سياسة الحجز» (2026-11-21) — قراءةٌ فقط، لا كتابة
// تشغيل: docker compose exec -T -w /app backend npx tsx src/scripts/test-booking-policy.ts
import { connectDB } from '../config/db.js';
import { normalizePolicy, bookingPolicyFresh, DEFAULT_BOOKING_POLICY, selfCancelOpen, bookingPolicy } from '../services/booking-policy.service.js';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${x ? ` — ${x}` : ''}`); } };

async function main() {
  await connectDB();
  ok('الافتراضيّ: ٣ للإلغاء و٣ للتعديل و٦ بعد البدء و٦ للغياب', JSON.stringify(normalizePolicy(null)) === JSON.stringify(DEFAULT_BOOKING_POLICY));
  ok('قيمٌ خارج الحدود تُقصّ', normalizePolicy({ selfCancelHours: 500, bookableGraceHours: -3 }).selfCancelHours === 72 && normalizePolicy({ bookableGraceHours: -3 }).bookableGraceHours === 0);
  ok('أنصاف الساعات مقبولة', normalizePolicy({ changeHours: 2.5 }).changeHours === 2.5);
  ok('نصٌّ غير رقميّ ⟵ الافتراضيّ', normalizePolicy({ lateCancelHours: 'abc' }).lateCancelHours === 6);
  const p = await bookingPolicyFresh();
  console.log('  ℹ️ السياسة الحاليّة على الخادم:', JSON.stringify(p));
  ok('القراءة المتزامنة تساوي الحديثة', JSON.stringify(bookingPolicy()) === JSON.stringify(p));
  const now = Date.now(), H = 3600e3;
  ok('قبل اللعبة بـ٤ ساعات ⟵ الإلغاء مفتوح', selfCancelOpen(now + 4 * H, now) === (p.selfCancelHours <= 4));
  ok('قبلها بساعتين ⟵ مغلق (عبر الإدارة)', selfCancelOpen(now + 2 * H, now) === (p.selfCancelHours <= 2));
  console.log(`\n${fail ? '❌' : '✅'} م٢-ب: ${pass} نجح، ${fail} فشل`);
  process.exit(fail ? 1 : 0);
}
main();
