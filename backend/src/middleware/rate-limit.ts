// ══════════════════════════════════════════════════════
// 🛡️ تحديد معدّل الطلبات — Simple in-memory rate limiter
// بلا تبعيات خارجية. يكفي لكبح القوة الغاشمة على تسجيل الدخول.
// ملاحظة: ذاكرة لكل عملية (process) — كافٍ لنشر بحاوية واحدة.
//
// ⚠️ ثلاثة أعطال أُصلحت هنا معاً، وفصلها يترك الحدّ بلا أثر:
//
//  ١) المفتاح كان `x-forwarded-for[0]` أي **قيمة يختارها العميل**، فترويسة
//     عشوائية مع كل طلب تعطي دلواً جديداً. صار عبر `clientIp()`.
//
//  ٢) المخزن كان خاصاً بكل نداء لـ rateLimit()، فـ`staff-login` (١٠)
//     و`leader-login` (١٥) دلوان منفصلان **لنفس صفّ الموظف** = ٢٥ محاولة.
//     صار المخزن مشتركاً حسب البادئة.
//
//  ٣) الحدّ على العنوان وحده: قاعة كاملة خلف NAT واحد تتقاسم دلواً،
//     ومهاجم يبدّل عناوينه بلا حدّ على الحساب. صار هناك دلوان —
//     دلو للعنوان يحمي البنية، ودلو **للهوية** يحمي الحساب —
//     ويكفي تجاوز أحدهما للرفض.
//
// 📌 لماذا تُشتقّ الهوية هنا لا من `req.user`: هذا الوسيط يعمل **قبل**
//    المصادقة (مثال: chips-store.routes.ts يضع rateLimit فوق
//    authenticatePlayer)، فانتظار المصادقة يعني السقوط إلى العنوان
//    بصمت للأبد. لذا يستخرجها المُستدعي من الجسم أو الرمز.
// ══════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { clientIp } from './client-ip.js';

interface Bucket { count: number; resetAt: number; }

/** مخزن واحد لكل بادئة — يشترك فيه كل مَن يستعمل البادئة نفسها */
const STORES = new Map<string, Map<string, Bucket>>();

function storeFor(prefix: string): Map<string, Bucket> {
  let s = STORES.get(prefix);
  if (!s) { s = new Map(); STORES.set(prefix, s); }
  return s;
}

/** يزيد العدّاد ويُعيد الثواني المتبقية إن تجاوز، وإلا 0 */
function bump(store: Map<string, Bucket>, key: string, windowMs: number, max: number): number {
  const now = Date.now();
  let b = store.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  b.count++;
  if (b.count > max) return Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  return 0;
}

// تنظيف دوري واحد لكل المخازن (منع تضخّم الذاكرة)
const sweep = setInterval(() => {
  const now = Date.now();
  for (const store of STORES.values()) {
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }
}, 60_000);
if (typeof sweep.unref === 'function') sweep.unref();

export interface RateLimitOpts {
  windowMs: number;
  /** حدّ العنوان — واسع عمداً: قاعة كاملة قد تشترك في عنوان واحد */
  max: number;
  keyPrefix?: string;
  message?: string;
  /**
   * مستخرج الهوية من الطلب (اسم مستخدم · هاتف · معرّف لاعب).
   * يُعيد null إن تعذّر — فيُكتفى بحدّ العنوان.
   */
  identity?: (req: Request) => string | null | undefined;
  /** حدّ الهوية — ضيّق: هذا ما يحمي الحساب فعلاً */
  identityMax?: number;
}

export function rateLimit(opts: RateLimitOpts) {
  const {
    windowMs, max, keyPrefix = 'rl',
    message = 'محاولات كثيرة جداً — يرجى المحاولة لاحقاً',
    identity, identityMax,
  } = opts;

  const store = storeFor(keyPrefix);

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = clientIp(req);
    const retryIp = bump(store, `ip:${ip}`, windowMs, max);

    let retryId = 0;
    if (identity) {
      let who: string | null | undefined = null;
      try { who = identity(req); } catch { who = null; }
      if (who) {
        const norm = String(who).trim().toLowerCase().slice(0, 80);
        if (norm) retryId = bump(store, `id:${norm}`, windowMs, identityMax ?? max);
      }
    }

    const retry = Math.max(retryIp, retryId);
    if (retry > 0) {
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({ error: message, retryAfter: retry });
      return;
    }
    next();
  };
}

/** للاختبار: تصفير كل الدلاء (لا يُستدعى في مسار إنتاج) */
export function __resetRateLimits() { STORES.clear(); }
