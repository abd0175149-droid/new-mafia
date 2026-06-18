// ══════════════════════════════════════════════════════
// 🛡️ تحديد معدّل الطلبات — Simple in-memory rate limiter
// بلا تبعيات خارجية. يكفي لكبح القوة الغاشمة على تسجيل الدخول.
// ملاحظة: ذاكرة لكل عملية (process) — كافٍ لنشر بحاوية واحدة.
// ══════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';

interface Bucket { count: number; resetAt: number; }

export function rateLimit(opts: { windowMs: number; max: number; keyPrefix?: string; message?: string }) {
  const { windowMs, max, keyPrefix = 'rl', message = 'محاولات كثيرة جداً — يرجى المحاولة لاحقاً' } = opts;
  const store = new Map<string, Bucket>();

  // تنظيف دوري للمفاتيح المنتهية (منع تضخّم الذاكرة)
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }, windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let b = store.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      store.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      const retrySec = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retrySec));
      res.status(429).json({ error: message, retryAfter: retrySec });
      return;
    }
    next();
  };
}
