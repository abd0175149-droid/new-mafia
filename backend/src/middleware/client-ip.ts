// ══════════════════════════════════════════════════════
// 🕵️ عنوان العميل الحقيقي — Trusted client IP
//
// ⚠️ لماذا وُجد هذا الملف: كل حدود المعدّل في المشروع كانت تُبنى على
//    `x-forwarded-for.split(',')[0]` — وهذا **العنصر الذي أرسله العميل**.
//    السبب أن nginx يضبط `$proxy_add_x_forwarded_for` وهي تتوسّع إلى
//    «قيمة العميل، ثم عنوانه الحقيقي» — فالأول قيمةٌ يختارها المهاجم.
//    فترويسة عشوائية مع كل طلب تعطي دلواً جديداً في كل مرة، وتُبطل:
//    دخول الموظفين والليدر واللاعب، والاستئجار والشحن والتصحيح
//    والاسترجاع، **وقفل رمز الشاشة** الذي بُني على النمط نفسه.
//
// 📐 القاعدة هنا: الثقة تبدأ من النظير لا من الترويسة.
//    إن لم يكن النظير عنواناً خاصاً فالطلب لم يمرّ عبر مسارنا إطلاقاً،
//    فتُهمَل كل الترويسات ويُعتمد عنوان النظير.
//
// 🗺️ المسار الفعلي في الإنتاج (مُتحقَّق منه على الخادم، ويخالف ما يوحي به
//    المستودع): المتصفّح → Cloudflare → cloudflared على 127.0.0.1 →
//    **خادم Next المخصّص على 3010** → يُمرِّر `...req.headers` كما هي →
//    الخادم الخلفي. **لا يوجد nginx في هذا المسار إطلاقاً**؛ ملف
//    `nginx/nginx.conf` في المستودع لا يعمل هنا (لا خدمة له في compose).
//
//    ولذلك: `x-real-ip` **لا يضبطها أحد في هذا النشر**، فتصل كما أرسلها
//    العميل — وتفضيلها كان سيُبقي الثغرة مفتوحة بشكل آخر.
//    المصدر الموثوق هو `cf-connecting-ip`: تكتبها Cloudflare فوق أي قيمة
//    واردة ولا يستطيع العميل تزويرها. ثم آخر عنصر في XFF (ما ألحقته
//    Cloudflare). و`x-real-ip` لا تُقرأ إلا بتفعيل صريح، لمن يضع وسيطاً
//    يضبطها لاحقاً.
// ══════════════════════════════════════════════════════

import type { Request } from 'express';

/** يُقرأ في كل نداء لا عند التحميل — التراجع إعادة تشغيل لا نشرة */
function mode(): 'proxy' | 'raw' {
  return String(process.env.CLIENT_IP_MODE || 'proxy').toLowerCase() === 'raw' ? 'raw' : 'proxy';
}

/** كم وسيطاً بيننا وبين العميل (nginx وحده = 1) */
function trustedHops(): number {
  const n = parseInt(String(process.env.TRUST_PROXY_HOPS || '1'), 10);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
}

/** يُزيل بادئة IPv4 المُغلّفة في IPv6 (`::ffff:10.0.0.1`) */
function unmap(addr: string): string {
  const a = String(addr || '').trim();
  return a.startsWith('::ffff:') ? a.slice(7) : a;
}

/**
 * هل هذا النظير داخل شبكتنا؟ لو لا، فالطلب وصل مباشرةً لا عبر nginx،
 * وكل ترويسة فيه من صنع المُرسِل — فلا يجوز تصديق أيٍّ منها.
 */
export function isTrustedPeer(addr: string | undefined): boolean {
  const a = unmap(addr || '');
  if (!a) return false;
  if (a === '127.0.0.1' || a === '::1' || a === 'localhost') return true;
  if (a.startsWith('10.')) return true;
  if (a.startsWith('192.168.')) return true;
  if (a.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(a)) return true;   // fc00::/7 — عناوين محلية فريدة
  return false;
}

const IP_SHAPE = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * العنوان الذي يُبنى عليه أي حدّ أو قفل.
 * تُصدَّر منفصلةً عن `req` كي تُختبَر بلا خادم.
 */
export function clientIpFrom(
  headers: Record<string, any> | undefined,
  remoteAddress: string | undefined,
): string {
  const peer = unmap(remoteAddress || '');

  // الوضع الخام: لا ترويسات إطلاقاً (مخرج طوارئ بإعادة تشغيل)
  if (mode() === 'raw') return peer || 'unknown';

  // نظير غير موثوق ⇒ الطلب لم يمرّ عبر وسيطنا ⇒ كل ترويسة مشبوهة
  if (!isTrustedPeer(peer)) return peer || 'unknown';

  const h = headers || {};

  // 1) Cloudflare تكتب هذه فوق أي قيمة واردة — لا يستطيع العميل تزويرها
  const cf = unmap(String(h['cf-connecting-ip'] || '').trim());
  if (cf && IP_SHAPE.test(cf)) return cf;

  // 2) XFF: يُؤخذ العنصر الذي ألحقه **وسيطنا**، أي من آخر القائمة لا أوّلها.
  //    ما قبله قد يكون من صنع العميل، وهو بالضبط ما كان يُقرأ سابقاً.
  const xff = String(h['x-forwarded-for'] || '');
  if (xff) {
    const parts = xff.split(',').map(s => unmap(s.trim())).filter(Boolean);
    if (parts.length) {
      const idx = Math.max(0, parts.length - trustedHops());
      const picked = parts[idx];
      if (picked && IP_SHAPE.test(picked)) return picked;
    }
  }

  // 3) x-real-ip: **مُطفأة افتراضياً**. لا وسيط في هذا النشر يضبطها،
  //    فتصل كما أرسلها العميل. تُفعَّل فقط عند إدخال وسيط يكتبها فوقاً.
  if (String(process.env.TRUST_X_REAL_IP || '0') === '1') {
    const real = unmap(String(h['x-real-ip'] || '').trim());
    if (real && IP_SHAPE.test(real)) return real;
  }

  return peer || 'unknown';
}

/** غلاف لطلب Express */
export function clientIp(req: Request | any): string {
  return clientIpFrom(req?.headers, req?.socket?.remoteAddress || req?.connection?.remoteAddress);
}

/** غلاف لاتصال Socket.IO — مصافحة السوكِت تحمل الترويسات نفسها */
export function socketClientIp(socket: any): string {
  return clientIpFrom(socket?.handshake?.headers, socket?.handshake?.address || socket?.conn?.remoteAddress);
}
