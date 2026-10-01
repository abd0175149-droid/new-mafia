// ══════════════════════════════════════════════════════
// 🔁 صمود نداء Gemini — إعادة المحاولة والنموذج الاحتياطيّ
// ══════════════════════════════════════════════════════
// كان رفضٌ واحد من جوجل («This model is currently experiencing high demand») يصير فوراً
// «خلل تقني» + تحويلاً للإدارة + إيقاف البوت ساعة + تنبيهَي أدمن. (2026-10-01 ٩:٣٤–٩:٣٩م:
// خمسة رفوض في خمس دقائق على أربع محادثات، وبينها ثمانية ردود ناجحة — ضغطٌ عابر.)
//
// الآن: الرفض العابر (503/429/5xx/مهلة/«high demand») يُعاد:
//   • في أوّل نداءٍ من الدور (السجلّ نصٌّ فقط): الأساسيّ ⟵ الاحتياطيّ بعد 1.5ث ⟵ الأساسيّ بعد 4ث.
//     الاحتياطيّ نموذجٌ شقيق على سعةٍ أخرى — الضغط يكون على نموذجٍ بعينه.
//   • بعد استدعاء أداة: الأساسيّ وحده ثلاثاً (2ث، 5ث) — تواقيع الأفكار (thoughtSignature)
//     في أجزاء الأدوات تخصّ النموذج الذي أنتجها، ونقلها لنموذجٍ آخر قد يُرفض.
// الخطأ غير العابر (400 مفتاح/طلب) يُرمى فوراً كما كان. وبعد استنفاد المحاولات يُرمى
// موسوماً `transient` ليقرّر المتّصل (تأجيلٌ دقيقة بدل التحويل — whatsapp-bot.service).
// ══════════════════════════════════════════════════════

export const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
// gemini-2.5-flash-lite «no longer available to new users» (فُحص 2026-10-02) — البديل الثاني هو الأساسيّ الحاليّ
export const GEMINI_FALLBACK_MODEL_ALT = 'gemini-3.5-flash-lite';

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_MSG = /high demand|overloaded|unavailable|try again later|resource.?exhausted|rate.?limit|quota|deadline|internal error|timed? ?out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i;

/** رفضٌ عابر يستحقّ إعادة المحاولة؟ */
export function isTransientGeminiError(e: any): boolean {
  if (!e) return false;
  if (e.name === 'AbortError') return true;                       // مهلة النداء
  if (typeof e.status === 'number' && TRANSIENT_STATUS.has(e.status)) return true;
  return TRANSIENT_MSG.test(String(e.message || ''));
}

export function fallbackFor(primary: string): string {
  return primary === GEMINI_FALLBACK_MODEL ? GEMINI_FALLBACK_MODEL_ALT : GEMINI_FALLBACK_MODEL;
}

export interface ResilienceStep { model: string; waitMs: number; timeoutMs: number }

export function resiliencePlan(primary: string, allowFallback: boolean): ResilienceStep[] {
  return allowFallback
    ? [{ model: primary, waitMs: 0, timeoutMs: 25000 }, { model: fallbackFor(primary), waitMs: 1500, timeoutMs: 20000 }, { model: primary, waitMs: 4000, timeoutMs: 20000 }]
    : [{ model: primary, waitMs: 0, timeoutMs: 25000 }, { model: primary, waitMs: 2000, timeoutMs: 20000 }, { model: primary, waitMs: 5000, timeoutMs: 20000 }];
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * ينفّذ `call` بحسب الخطّة. يُرجع النتيجة مع النموذج الذي خدم وعدد المحاولات.
 * غير العابر يُرمى فوراً؛ العابر بعد آخر محاولة يُرمى بـ`transient = true` و`attempts`.
 */
export async function withGeminiResilience<T>(opts: {
  primary: string;
  allowFallback: boolean;
  call: (model: string, timeoutMs: number) => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ result: T; model: string; attempts: number }> {
  const plan = resiliencePlan(opts.primary, opts.allowFallback);
  const sleep = opts.sleep || realSleep;
  let lastErr: any = null;
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    if (step.waitMs) await sleep(step.waitMs);
    try {
      const result = await opts.call(step.model, step.timeoutMs);
      return { result, model: step.model, attempts: i + 1 };
    } catch (e: any) {
      lastErr = e;
      if (!isTransientGeminiError(e)) throw e;
    }
  }
  const err: any = lastErr instanceof Error ? lastErr : new Error(String(lastErr?.message || lastErr || 'Gemini failed'));
  err.transient = true;
  err.attempts = plan.length;
  throw err;
}
