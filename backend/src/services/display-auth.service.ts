// ══════════════════════════════════════════════════════
// 📺 مصادقة شاشة العرض
//
// ⚠️ الثغرة التي يغلقها هذا الملف: `display:join-room` كان بلا أي حارس —
//    يُدخل أي ساكت للغرفة، **ويمنحه دور `display` بنفسه**، ويُعيد حالة اللعبة
//    كاملةً بما فيها دور كل لاعب. وذلك الدور تحديداً هو ما يقرؤه `isTrusted`
//    ليقرّر إرسال الحالة بلا تنقية في الغرف البعيدة. وقائمة الأنشطة العامة
//    تسلّم معرّفات الغرف بلا رمز — فأي لاعب بأدوات المطوّر يقرأ توزيع الأدوار
//    كاملاً، ورمز الشاشة يصير حارساً بلا أثر.
//
// الحلّ: رمز الشاشة يُتحقَّق منه مرة عبر REST (كما هو اليوم)، وعند النجاح
// يُمنح **توكن موقَّع مربوط بالغرفة** يُشترط في الانضمام. لا يُغيّر تجربة
// المشغّل: يُدخل الرقم مرة واحدة كما اعتاد.
//
// قرار المالك (١٣): المدّة قابلة للضبط، افتراضياً ١٢ ساعة، وتتجدّد عند كل
// انضمام ناجح، وتُخزَّن محلياً — فتحديث الصفحة لا يُقفل شاشة القاعة خارج
// النظام في منتصف السهرة.
// ══════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/** سرّ مشتقّ — لا يُقبل توكن شاشة مكان توكن موظف ولا العكس */
const DISPLAY_SECRET = env.JWT_SECRET + '_DISPLAY';

function hours(): number {
  const h = Number(process.env.DISPLAY_TOKEN_HOURS || 12);
  return Number.isFinite(h) && h > 0 && h <= 720 ? h : 12;
}

/**
 * هل يُفرض الحارس؟ يُقرأ **عند كل طلب** لا عند تحميل الوحدة، كي يكون
 * التراجع إعادةَ تشغيل واحدة لا نشرةَ كود تحت الضغط.
 */
export function displayAuthEnforced(): boolean {
  return String(process.env.DISPLAY_AUTH_ENFORCE ?? '1') !== '0';
}

export function mintDisplayToken(roomId: string): string {
  return jwt.sign({ roomId, kind: 'display' }, DISPLAY_SECRET, { expiresIn: `${hours()}h` });
}

/** يتحقّق أن التوكن صالح **ولهذه الغرفة تحديداً** */
export function verifyDisplayToken(token: unknown, roomId: string): boolean {
  if (typeof token !== 'string' || !token) return false;
  try {
    const dec: any = jwt.verify(token, DISPLAY_SECRET);
    return dec?.kind === 'display' && String(dec?.roomId) === String(roomId);
  } catch {
    return false;
  }
}

// ── قفل المحاولات على رمز الشاشة ───────────────────────
//
// ⚠️ الرمز من ٤–٦ أرقام والمسار غير مصادَق ولا محدود، وردّه عند النجاح
//    يحمل أدوار كل اللاعبين — أي أن فضاء المفاتيح كله قابل للمسح في ثوانٍ.
//    عدّاد بسيط لكل (عنوان + غرفة) يجعل التخمين غير عملي بلا إزعاج المشغّل
//    الذي يخطئ مرة أو مرتين.

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60_000;   // نافذة العدّ
const LOCK_MS = 15 * 60_000;     // مدّة القفل بعد تجاوز الحدّ

interface Attempt { count: number; first: number; lockedUntil: number }
const attempts = new Map<string, Attempt>();

/** تنظيف كسول — لا مؤقّت دوري، الخريطة صغيرة بطبيعتها */
function sweep(now: number) {
  if (attempts.size < 500) return;
  for (const [k, a] of attempts) {
    if (now > a.lockedUntil && now - a.first > WINDOW_MS) attempts.delete(k);
  }
}

export function pinLockState(key: string): { locked: boolean; retryAfterSec: number } {
  const a = attempts.get(key);
  const now = Date.now();
  if (a && now < a.lockedUntil) {
    return { locked: true, retryAfterSec: Math.ceil((a.lockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function recordPinFailure(key: string): { locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const a = attempts.get(key);
  if (!a || now - a.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now, lockedUntil: 0 });
    return { locked: false, retryAfterSec: 0 };
  }
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = now + LOCK_MS;
    a.count = 0;
    a.first = now;
    return { locked: true, retryAfterSec: Math.ceil(LOCK_MS / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function clearPinFailures(key: string) {
  attempts.delete(key);
}

/** مفتاح العدّ: العنوان + الغرفة — فقفل غرفة لا يُعطّل غرفة أخرى */
export function pinAttemptKey(req: any, roomId: string): string {
  const ip = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    || req?.socket?.remoteAddress || 'unknown';
  return `${ip}::${roomId}`;
}
