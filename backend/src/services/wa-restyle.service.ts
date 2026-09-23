// ══════════════════════════════════════════════════════
// ✨ صياغة ردّ الموظّف بصوت الدون
// ══════════════════════════════════════════════════════
// العميل يجب أن يسمع صوتاً واحداً سواءٌ أجابه البوت أم إنسان. فكلّ نصٍّ
// يكتبه الموظّف يمرّ على النموذج ليعيد صياغته **بأسلوب الشخصيّة نفسها**
// قبل أن يذهب إلى واتساب.
//
// 🔴 ثلاثة قيود تجعل هذا آمناً — لا واحد:
//   ١. النداء **بلا أدوات وبلا قاعدة معرفة وبلا سجلّ محادثة**: الشخصيّة
//      والنصّ فقط. نداءٌ بلا أدوات لا يستطيع أن يحجز شيئاً، وبلا قاعدةِ
//      معرفةٍ لا يجد معلومةً يضيفها. وكلفته جزءٌ من أربعين من كلفة ردٍّ
//      عاديّ لأنّ ٩٨٫٨٪ من الكلفة توكنُ دخل.
//   ٢. **الحارس** (`guardRewrite`): قاعدةٌ حسابيّة لا رأي — كلّ رقمٍ ورابطٍ
//      في نصّ الموظّف يجب أن يبقى، وبلا رقمٍ جديد. النموذج يعيد الصياغة
//      جيّداً ويخطئ في التفصيل الصغير: «١٢ دينار» تصير «بسعرٍ رمزيّ»
//      و«٨:٣٠» تصير «بعد المغرب» — وهذه أخطاءُ وعدٍ للعميل لا أسلوب.
//   ٣. **لا تُحتجَز رسالة**: انقطاعٌ أو تجاوزٌ للمهلة ⇒ يُرسل نصّ الموظّف
//      حرفيّاً. الصياغة تحسينٌ لا بوّابة.

import { getDB } from '../config/db.js';
import { and, desc, eq } from 'drizzle-orm';
import { waMessages } from '../schemas/admin.schema.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface RestyleSettings {
  enabled: boolean;
  minWords: number;      // أقصر من ذلك يُرسل كما هو — «تمام ✅» لا تحتاج صياغة
  timeoutMs: number;     // بعدها نرسل نصّ الموظّف
  onGuardFail: 'review' | 'send_mine' | 'send_styled';
  signature: boolean;    // توقيعُ أوّل ردٍّ بشريّ في الجلسة
  signatureText: string; // {name} تُستبدل باسم الموظّف
  resignAfterMin: number; // صمتٌ أطول من ذلك ⇒ جلسةٌ جديدة فيعود التوقيع
}

export const RESTYLE_DEFAULTS: RestyleSettings = {
  enabled: false,
  minWords: 4,
  timeoutMs: 4000,
  onGuardFail: 'review',
  signature: true,
  signatureText: '— {name} من الإدارة',
  resignAfterMin: 30,
};

/** تنقيةُ الإعدادات القادمة من الواجهة وحدُّها — نظير `mergeFollowup` */
export function mergeRestyle(patch: any): RestyleSettings {
  const p = patch && typeof patch === 'object' ? patch : {};
  const num = (v: any, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : d;
  };
  const sig = String(p.signatureText ?? RESTYLE_DEFAULTS.signatureText).slice(0, 80).trim();
  return {
    enabled: p.enabled === true,
    minWords: num(p.minWords, RESTYLE_DEFAULTS.minWords, 0, 20),
    timeoutMs: num(p.timeoutMs, RESTYLE_DEFAULTS.timeoutMs, 1500, 15000),
    onGuardFail: ['review', 'send_mine', 'send_styled'].includes(p.onGuardFail) ? p.onGuardFail : 'review',
    signature: p.signature !== false,
    // توقيعٌ بلا {name} يجعل كلّ الموظّفين شخصاً واحداً — نردّه للافتراضيّ
    signatureText: sig.includes('{name}') ? sig : RESTYLE_DEFAULTS.signatureText,
    resignAfterMin: num(p.resignAfterMin, RESTYLE_DEFAULTS.resignAfterMin, 0, 1440),
  };
}

export function getRestyleSettings(botSettings: any): RestyleSettings {
  return mergeRestyle({ ...RESTYLE_DEFAULTS, ...(botSettings?.restyle || {}) });
}

// ══════════════════════════════════════════════════════
// 🔢 الحارس
// ══════════════════════════════════════════════════════
// الأرقام تُستخرج بعد توحيد الأرقام العربيّة إلى لاتينيّة، فـ«١٢» و«12»
// شيءٌ واحد ولا يُعدّ تحويلُ الخطّ تغييراً للرقم.
const AR_DIGITS = /[٠-٩۰-۹]/g;
export function latinDigits(s: string): string {
  return s.replace(AR_DIGITS, d => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}
const numsOf = (s: string): string[] => latinDigits(s).match(/\d+/g) || [];
const urlsOf = (s: string) => (s.match(/https?:\/\/\S+|www\.\S+/gi) || []).map(u => u.replace(/[.,،]$/, ''));

export interface GuardResult { ok: boolean; reason: string }

/** كلّ رقمٍ ورابطٍ في الأصل يبقى، وبلا جديدٍ لم يكتبه الموظّف */
export function guardRewrite(original: string, rewritten: string): GuardResult {
  if (!rewritten.trim()) return { ok: false, reason: 'الصياغة عادت فارغة' };

  const a = numsOf(original), b = numsOf(rewritten);
  const countIn = (arr: string[], v: string) => arr.filter(x => x === v).length;
  for (const n of new Set(a)) {
    if (countIn(b, n) < countIn(a, n)) return { ok: false, reason: `سقط الرقم ${n}` };
  }
  for (const n of new Set(b)) {
    if (!a.includes(n)) return { ok: false, reason: `ظهر رقمٌ جديد ${n}` };
  }

  for (const u of urlsOf(original)) {
    if (!rewritten.includes(u)) return { ok: false, reason: 'سقط رابط' };
  }
  for (const u of urlsOf(rewritten)) {
    if (!original.includes(u)) return { ok: false, reason: 'ظهر رابطٌ جديد' };
  }

  // طولٌ خارج المعقول = إضافةٌ أو حذفٌ لا إعادةُ صياغة
  const lo = original.length * 0.4, hi = original.length * 2.5 + 40;
  if (rewritten.length < lo) return { ok: false, reason: 'الصياغة أقصر من أن تحمل المعنى' };
  if (rewritten.length > hi) return { ok: false, reason: 'الصياغة أطول من نصّك بكثير — غالباً أضافت' };

  return { ok: true, reason: '' };
}

// ══════════════════════════════════════════════════════
// ✍️ النداء
// ══════════════════════════════════════════════════════
const RULES = `أعد صياغة نصّ الموظّف أدناه بصوتك أنت وأسلوبك، ثمّ أعد **النصّ المُعاد صياغته وحده** بلا مقدّمة ولا شرح ولا علامات اقتباس.

القيود — كلّها إلزاميّة:
• لا تُضف أيّ معلومة ليست في النصّ. لا سعراً، لا موعداً، لا مكاناً، لا وعداً، لا سؤالاً جديداً.
• لا تحذف أيّ معلومة موجودة فيه.
• انقل كلّ رقمٍ واسمٍ ورابطٍ وموعدٍ **كما هو حرفيّاً**، بالخطّ نفسه.
• إن كان النصّ رفضاً أو اعتذاراً فأبقِه رفضاً — لا تلطّفه حتّى يصير وعداً.
• إن كان النصّ حسناً كما هو فأعده كما هو.
• اكتب بالعربيّة الأردنيّة التي تتكلّمها، وبطول النصّ الأصليّ تقريباً.`;

export interface RestyleOutcome {
  text: string;            // ما يُرسل (أو المقترح عند المراجعة)
  original: string;
  styled: boolean;         // هل تغيّر النصّ فعلاً؟
  review: boolean;         // توقّف بانتظار الموظّف
  reason: string;          // سببُ التخطّي أو رفضِ الحارس
}

export async function restyleStaffText(
  raw: string,
  botSettings: any,
): Promise<RestyleOutcome> {
  const text = (raw || '').trim();
  const cfg = getRestyleSettings(botSettings);
  const skip = (reason: string): RestyleOutcome =>
    ({ text, original: text, styled: false, review: false, reason });

  if (!cfg.enabled) return skip('off');
  if (!botSettings?.geminiApiKey || !botSettings?.model) return skip('no-key');
  // نصٌّ بلا حروف (رابط، رمز تحقّق، رقم حوالة) — الحرفُ الواحد فيه مقدَّس
  if (!/\p{L}/u.test(text)) return skip('no-letters');
  if (text.split(/\s+/).filter(Boolean).length < cfg.minWords) return skip('too-short');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${botSettings.model}:generateContent?key=${encodeURIComponent(botSettings.geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          // الشخصيّة وحدها — بلا قاعدة المعرفة وبلا سجلّ المحادثة
          system_instruction: { parts: [{ text: `${botSettings.systemPrompt || ''}\n\n${RULES}` }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          // حرارةٌ منخفضة: المطلوب ثباتُ الأسلوب لا تنويعُه
          generationConfig: { temperature: 0.35, maxOutputTokens: 512 },
        }),
      },
    );
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);

    const out = String(
      (data?.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p?.text || '').join('').trim(),
    ).replace(/^["'«»]+|["'«»]+$/g, '').trim();

    if (!out) return skip('empty');
    if (out === text) return { text, original: text, styled: false, review: false, reason: 'unchanged' };

    const g = guardRewrite(text, out);
    if (!g.ok) {
      if (cfg.onGuardFail === 'send_mine') return skip(`guard:${g.reason}`);
      if (cfg.onGuardFail === 'send_styled') return { text: out, original: text, styled: true, review: false, reason: `guard-ignored:${g.reason}` };
      return { text: out, original: text, styled: true, review: true, reason: g.reason };
    }
    return { text: out, original: text, styled: true, review: false, reason: '' };
  } catch (e: any) {
    // المهلة أو انقطاع الشبكة: لا تُحتجَز رسالةُ موظّفٍ خلف نموذج
    return skip(e?.name === 'AbortError' ? 'timeout' : `error:${e?.message || 'unknown'}`);
  } finally {
    clearTimeout(timer);
  }
}

// ══════════════════════════════════════════════════════
// ✍️ توقيع التحويل
// ══════════════════════════════════════════════════════
// توقيعٌ في كلّ رسالة يكشف أنّ «الدون» عدّة أشخاص فيُفقده وحدته، وبلا توقيعٍ
// إطلاقاً لا يعرف العميل أنّ إنساناً استلم أمره. فمرّةً واحدة عند انتقال
// الجلسة من البوت إلى إنسان — ثمّ صمت.
//
// وتُعدّ الجلسةُ جديدةً في حالتين: صمتٌ بشريٌّ أطول من `resignAfterMin`،
// أو **موظّفٌ آخر** تولّى المحادثة (وهو انتقالٌ حقيقيّ يستحقّ تعريفاً).
export async function shouldSign(
  conversationId: number,
  staffId: number | null | undefined,
  cfg: RestyleSettings,
): Promise<boolean> {
  if (!cfg.signature) return false;
  const db = getDB();
  if (!db) return false;
  try {
    const [last] = await db
      .select({ staffId: waMessages.staffId, createdAt: waMessages.createdAt })
      .from(waMessages)
      .where(and(eq(waMessages.conversationId, conversationId), eq(waMessages.source, 'staff')))
      .orderBy(desc(waMessages.id))
      .limit(1);
    if (!last) return true;                                   // أوّل ردٍّ بشريّ إطلاقاً
    if ((last.staffId ?? null) !== (staffId ?? null)) return true; // تولّاها غيره
    const ageMin = (Date.now() - new Date(last.createdAt as any).getTime()) / 60000;
    return ageMin >= cfg.resignAfterMin;
  } catch {
    return false; // شكٌّ في السجلّ ⇒ لا توقيع. تكرارُه أسوأ من غيابه.
  }
}

export function applySignature(text: string, staffName: string, cfg: RestyleSettings): string {
  const name = (staffName || '').trim();
  if (!name) return text;
  const line = cfg.signatureText.replace('{name}', name);
  if (text.includes(line)) return text;
  return `${text}\n\n${line}`;
}
