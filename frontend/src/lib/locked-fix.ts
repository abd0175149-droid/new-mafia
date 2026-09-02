// ══════════════════════════════════════════════════════
// 📍 نقطةُ الجهاز عند محاولةِ دخولٍ على حسابٍ مقفول
//
// 🔴 لا تُطلب صلاحيّةُ الموقع هنا أبداً. شاشةُ الدخول تسبق الموافقةَ على
//    السياسة، وطلبُ إذنٍ فيها معالجةٌ قبل الإذن (قانون ٢٤/٢٠٢٣) — ولأنّها
//    تُطلب من كلّ داخلٍ لأجل قلّةٍ مقفولة، وهذا غيرُ متناسب.
//    فنقرأ **إن كان الإذنُ ممنوحاً سلفاً** فقط، وإلّا نصمت.
//
// 🔴 ولا تُنادى إلّا بعد أن يردّ الخادمُ ACCOUNT_LOCKED: فلا يُنقل موقعُ
//    صاحبِ حسابٍ سليمٍ ولا مرّة.
//
// 🔴 ولا تُبطئ الشاشة ولا تُظهر خطأً: تفشل صامتةً بمهلةٍ قصيرة — الغرضُ
//    أثرٌ للإدارة لا حاجزٌ أمام المستعمل.
// ══════════════════════════════════════════════════════

const TIMEOUT_MS = 6_000;

/** هل مُنح إذنُ الموقع سلفاً؟ يُرجع false عند أدنى شكّ — لا يسأل أبداً. */
async function alreadyGranted(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
    // بعضُ المتصفّحات لا تدعم permissions.query لـgeolocation — عندها لا نقرأ
    const q = (navigator as any).permissions?.query;
    if (typeof q !== 'function') return false;
    const st = await (navigator as any).permissions.query({ name: 'geolocation' });
    return st?.state === 'granted';
  } catch { return false; }
}

/** نفسُ شكل GeoFix في الخادم — فتُقرأ بمنطق صفحة مواقع اللاعبين نفسِه. */
function readFix(): Promise<any | null> {
  return new Promise(resolve => {
    let done = false;
    const finish = (v: any) => { if (!done) { done = true; resolve(v); } };
    const t = setTimeout(() => finish(null), TIMEOUT_MS);
    try {
      navigator.geolocation.getCurrentPosition(
        pos => {
          clearTimeout(t);
          finish({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
            capturedAt: pos.timestamp || Date.now(),
            isMocked: false,          // الويب لا واجهةَ لديه لكشفه — كما في بقيّة النظام
            source: 'web',
          });
        },
        () => { clearTimeout(t); finish(null); },
        { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 60_000 },
      );
    } catch { clearTimeout(t); finish(null); }
  });
}

/** يُبلّغ الخادمَ بنقطة المحاولة إن أمكن. لا يرمي أبداً ولا يُعيد شيئاً. */
export async function reportLockedFix(phone: string): Promise<void> {
  try {
    if (!(await alreadyGranted())) return;
    const fix = await readFix();
    if (!fix) return;
    await fetch('/api/player-auth/locked-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, fix }),
      keepalive: true,
    });
  } catch { /* أثرٌ للإدارة لا حاجزٌ أمام المستعمل */ }
}
