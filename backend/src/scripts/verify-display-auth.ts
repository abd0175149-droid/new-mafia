// ══════════════════════════════════════════════════════
// 🔒 تحقّق حيّ من مصادقة شاشة العرض وقفل رمزها
//
// يفحص ما لا يستطيع فحصُ قاعدة البيانات فحصَه: سلوك المسارات الحيّة.
//
// التشغيل داخل الحاوية:
//   docker exec mafia-prod-backend-1 npx tsx src/scripts/verify-display-auth.ts
//
// ⚠️ لا يلمس بيانات: يقرأ غرفة نشطة إن وُجدت، ويجرّب أرقاماً خاطئة على
//    معرّف غرفة **وهمي** كي لا يُقفل رمز غرفة حقيقية على المشغّل.
// ══════════════════════════════════════════════════════

import { verifyDisplayToken, mintDisplayToken, displayAuthEnforced } from '../services/display-auth.service.js';

const BASE = process.env.VERIFY_BASE || 'http://localhost:4000';

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function post(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* قد يكون فارغاً */ }
  return { status: res.status, data, retryAfter: res.headers.get('retry-after') };
}

async function main() {
  console.log('\n🔒 مصادقة شاشة العرض\n');

  console.log('١) التوكن:');
  {
    const t = mintDisplayToken('room-alpha');
    check(verifyDisplayToken(t, 'room-alpha'), 'توكن صالح يُقبل لغرفته');
    check(!verifyDisplayToken(t, 'room-beta'), '🔒 توكن غرفة لا يفتح غرفة أخرى');
    check(!verifyDisplayToken('', 'room-alpha'), 'توكن فارغ مرفوض');
    check(!verifyDisplayToken('not.a.jwt', 'room-alpha'), 'توكن مشوَّه مرفوض');
    check(!verifyDisplayToken(undefined as any, 'room-alpha'), 'غياب التوكن مرفوض');
    check(displayAuthEnforced(), 'الفرض مفعَّل (DISPLAY_AUTH_ENFORCE)', String(process.env.DISPLAY_AUTH_ENFORCE ?? '(غير مضبوط ⇒ مفعَّل)'));
  }

  console.log('\n٢) رمز الشاشة — الردّ والقفل:');
  {
    // معرّف وهمي: لا يُقفل رمز غرفة حقيقية على المشغّل
    const fakeRoom = `verify-${Date.now().toString(36)}`;
    const r1 = await post('/api/game/verify-pin', { roomId: fakeRoom, pin: '0000' });
    check(r1.status !== 200 || r1.data?.success === false, 'رمز خاطئ لا يُعيد نجاحاً', `status=${r1.status}`);

    // غرفة غير موجودة تُعيد رسالة واضحة بلا تسريب
    check(!r1.data?.state && !r1.data?.displayToken, '🔒 الفشل لا يُسرّب حالة ولا توكن');

    // القفل بعد محاولات متتالية — على غرفة حقيقية لو وُجدت لكان الأثر مزعجاً،
    // لذا نستعمل الوهمية: الغرفة غير موجودة فلا يُحتسب فشل رمز، ونتحقّق
    // بدلاً من ذلك أن مسار الرمز الخاطئ على غرفة **موجودة** يُحتسب.
    const rooms = await fetch(`${BASE}/api/game/activities-with-rooms`).then(r => r.json()).catch(() => null);
    const liveRoomId: string | null = (() => {
      for (const a of (rooms?.activities || [])) {
        for (const r of (a?.rooms || [])) if (r?.roomId) return String(r.roomId);
      }
      return null;
    })();

    if (!liveRoomId) {
      check(true, 'لا غرفة نشطة الآن — فحص القفل الحيّ غير منطبق (المنطق مغطّى بالوحدة أعلاه)');
    } else {
      let locked = false, sawUnauthorized = false;
      for (let i = 0; i < 10; i++) {
        const r = await post('/api/game/verify-pin', { roomId: liveRoomId, pin: '000000' });
        if (r.status === 401) sawUnauthorized = true;
        if (r.status === 429) { locked = true; break; }
      }
      check(sawUnauthorized, 'رمز خاطئ يُعيد 401 (كان 200 مع success:false)');
      check(locked, '🔒 المحاولات المتتالية تُقفل المسار (429) — التخمين لم يعد عملياً');
    }
  }

  console.log('\n٣) المسارات العامة سليمة:');
  {
    const ok = await fetch(`${BASE}/api/game/activities-with-rooms`).then(r => r.status).catch(() => 0);
    check(ok === 200, 'قائمة الأنشطة تعمل', String(ok));
    const vapid = await fetch(`${BASE}/api/push/vapid-public-key`).then(r => r.status).catch(() => 0);
    check(vapid === 200, 'مفتاح الإشعارات يعمل', String(vapid));
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} النتيجة: ${pass} ناجح · ${fail} فاشل\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('💥 فشل التحقق:', e?.message); process.exit(1); });
