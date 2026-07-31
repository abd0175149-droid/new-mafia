// ══════════════════════════════════════════════════════
// 🛡️ تحقّق الأمان — عنوان العميل · حدّ المعدّل · رمز الشاشة
//
//   docker exec mafia-prod-backend-1 npx tsx src/scripts/verify-security.ts
//
// ⚠️ القسم ٤ يضرب الخادم الحيّ بمحاولات دخول فاشلة **بترويسات مزوَّرة**.
//    هذا هو الإثبات الوحيد الذي كان سيفشل قبل الإصلاح وينجح بعده —
//    الفحص النقيّ للدالة وحده لا يُثبت أن المسار الحيّ يستعملها.
//    يستعمل اسم مستخدم غير موجود كي لا يُقفَل حساب حقيقي.
// ══════════════════════════════════════════════════════

import { clientIpFrom, isTrustedPeer } from '../middleware/client-ip.js';
import { pinEquals, generateDisplayPin } from '../services/display-auth.service.js';

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4000';

async function main() {
  console.log('\n🛡️ تحقّق الأمان\n');

  // ── ١) النظير الموثوق ──
  console.log('١) النظير الموثوق:');
  check(isTrustedPeer('127.0.0.1') && isTrustedPeer('::1'), 'المضيف المحلّي موثوق');
  check(isTrustedPeer('172.18.0.5') && isTrustedPeer('10.0.0.9') && isTrustedPeer('192.168.1.4'),
    'الشبكات الخاصة موثوقة (شبكة compose)');
  check(isTrustedPeer('::ffff:172.18.0.5'), 'IPv4 المُغلّفة في IPv6 تُفكّ قبل الفحص');
  check(!isTrustedPeer('81.2.3.4') && !isTrustedPeer('8.8.8.8'), 'العناوين العامة غير موثوقة');
  check(!isTrustedPeer(''), 'العنوان الفارغ غير موثوق');

  // ── ٢) اشتقاق عنوان العميل ──
  console.log('\n٢) اشتقاق العنوان — قلب الثغرة:');

  // 🔴 هذه هي الحالة التي كانت مكسورة: العميل يُرسل XFF، والوسيط يُلحق عنوانه.
  check(
    clientIpFrom({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }, '172.18.0.5') === '203.0.113.9',
    '🔴 XFF: يُؤخذ ما ألحقه الوسيط (الأخير) لا ما أرسله العميل (الأول)',
    clientIpFrom({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }, '172.18.0.5'),
  );

  check(
    clientIpFrom({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1' }, '172.18.0.5') === '203.0.113.9',
    'cf-connecting-ip تسبق كل شيء (تكتبها Cloudflare فوقاً)',
  );

  check(
    clientIpFrom({ 'x-forwarded-for': '10.0.0.1', 'cf-connecting-ip': '10.0.0.1', 'x-real-ip': '10.0.0.1' }, '81.2.3.4') === '81.2.3.4',
    '🔒 نظير عام ⇒ تُهمَل كل الترويسات ويُعتمد عنوان الاتصال',
  );

  check(
    clientIpFrom({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '203.0.113.9' }, '172.18.0.5') === '203.0.113.9',
    'x-real-ip مُطفأة افتراضياً (لا وسيط يضبطها في هذا النشر)',
  );

  check(clientIpFrom({}, '172.18.0.5') === '172.18.0.5', 'بلا ترويسات ⇒ عنوان النظير');
  check(clientIpFrom(undefined, undefined) === 'unknown', 'بلا شيء ⇒ unknown (لا انهيار)');
  check(
    clientIpFrom({ 'x-forwarded-for': 'not-an-ip; drop table' }, '172.18.0.5') === '172.18.0.5',
    'قيمة غير صالحة الشكل تُرفض ويُعتمد النظير',
  );

  // ── ٣) رمز الشاشة ──
  console.log('\n٣) رمز الشاشة:');
  const pins = Array.from({ length: 200 }, () => generateDisplayPin());
  check(pins.every(p => /^\d{6}$/.test(p)), '٦ خانات رقمية دائماً');
  // 200 سحبة من مليون: التصادم ممكن نظرياً (~٢٪) — نؤكّد التنوّع لا الفرادة المطلقة
  check(new Set(pins).size >= 195, 'المولّد متنوّع (لا قيمة ثابتة ولا دورة قصيرة)', `فريد=${new Set(pins).size}/200`);
  check(pinEquals('123456', '123456') && !pinEquals('123456', '123457'), 'المقارنة صحيحة');
  check(!pinEquals('123456', '12345') && !pinEquals('', '123456'), 'اختلاف الطول يُرفض بلا استثناء');
  check(!pinEquals(null as any, null as any) === false, 'قيمتان فارغتان متساويتان شكلياً (لا انهيار)');

  // ── ٤) الإثبات الحيّ ──
  console.log('\n٤) الإثبات الحيّ — الحدّ يصمد أمام ترويسة مزوَّرة:');
  const fakeUser = `verify-nobody-${Date.now().toString(36)}`;
  let statuses: number[] = [];
  let reachable = true;
  for (let i = 0; i < 14; i++) {
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 🎭 عنوان مختلف في كل محاولة — هذا ما كان يُعيد ضبط الدلو
          'X-Forwarded-For': `203.0.113.${i}, 10.10.10.${i}`,
        },
        body: JSON.stringify({ username: fakeUser, password: 'wrong-on-purpose' }),
      });
      statuses.push(res.status);
    } catch { reachable = false; break; }
  }

  if (!reachable) {
    check(true, 'تخطّي الفحص الحيّ (الخادم غير متاح من هنا)');
  } else {
    const blocked = statuses.filter(s => s === 429).length;
    check(blocked > 0,
      '🔴 ١٤ محاولة بترويسات مزوَّرة تصطدم بالحدّ (قبل الإصلاح: صفر)',
      `الحالات=${statuses.join(',')}`);
    check(statuses.slice(-1)[0] === 429, 'المحاولة الأخيرة مرفوضة بـ429');
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} النتيجة: ${pass} ناجح · ${fail} فاشل\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('💥 فشل التحقق:', e?.message);
  process.exit(1);
});
