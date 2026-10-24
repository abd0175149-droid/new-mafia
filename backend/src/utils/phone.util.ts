// ══════════════════════════════════════════════════════
// 📞 توحيد أرقام الهواتف — Phone Normalization
// ══════════════════════════════════════════════════════
// النظام يخزّن الأرقام محلياً بصيغة 07XXXXXXXX (players/bookings)،
// بينما WhatsApp Cloud API يرسل ويستقبل بصيغة دولية 9627XXXXXXXX.
// هذا الملف هو المصدر الوحيد للتحويل بين الصيغتين — يُستخدم في كل
// نقطة دخول/خروج (webhook، الإرسال، مطابقة اللاعبين).

// أرقام عربية-هندية (٠١٢...) وفارسية (۰۱۲...) → لاتينية
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) return String(a);
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) return String(p);
    return ch;
  });
}

/** إزالة كل ما ليس رقماً (مسافات، شرطات، أقواس، +، إلخ) */
function digitsOnly(input: string): string {
  return toLatinDigits(String(input || '')).replace(/\D/g, '');
}

/**
 * توحيد أي صيغة لرقم أردني موبايل إلى الصيغة المحلية 07XXXXXXXX (10 خانات).
 * يقبل: 07XXXXXXXX · 7XXXXXXXX · 9627XXXXXXXX · +9627XXXXXXXX · 009627XXXXXXXX
 * ويعيد null إذا لم يكن رقم موبايل أردني صالح.
 */
export function normalizeLocalPhone(input: string | null | undefined): string | null {
  let d = digitsOnly(input || '');
  if (!d) return null;

  if (d.startsWith('00962')) d = d.slice(5);
  else if (d.startsWith('962')) d = d.slice(3);

  // بعد إزالة كود الدولة: إمّا 7XXXXXXXX (9 خانات) أو 07XXXXXXXX (10 خانات)
  if (d.startsWith('07') && d.length === 10) {
    // تحقق أن الخانة الثالثة 7/8/9 (شبكات الأردن)
    return /^07[789]\d{7}$/.test(d) ? d : null;
  }
  if (d.startsWith('7') && d.length === 9) {
    const local = '0' + d;
    return /^07[789]\d{7}$/.test(local) ? local : null;
  }
  return null;
}

/**
 * تحويل أي صيغة إلى صيغة واتساب الدولية 9627XXXXXXXX (بدون +).
 * يعيد null إذا لم يكن رقماً أردنياً صالحاً.
 */
export function toWaPhone(input: string | null | undefined): string | null {
  const local = normalizeLocalPhone(input);
  if (!local) return null;
  return '962' + local.slice(1);
}

/** هل الرقمان نفس الهاتف بعد التوحيد؟ */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeLocalPhone(a);
  const nb = normalizeLocalPhone(b);
  return !!na && !!nb && na === nb;
}

/**
 * توحيد أي رقم وارد من واتساب — أردنياً كان أم أجنبياً.
 *
 * الأردني يُعامل تماماً كما كان (07XXXXXXXX محلياً / 962… للإرسال) حتى لا يتغيّر
 * أي سلوك قائم أو صف مخزَّن. أما غير الأردني فيُخزَّن بصيغته الدولية كما وصلت
 * من واتساب (أرقام فقط) بدل أن تُرمى الرسالة.
 *
 * لا يمكن أن يتصادم الشكلان: المحلي يبدأ بـ0 دائماً، والدولي (E.164) لا يبدأ بـ0 أبداً.
 *
 * السبب: getOrCreateConversation كان يرمي استثناءً لأي رقم غير أردني، ومعالج
 * الويبهوك يبتلع الاستثناء — فتختفي رسالة كل زائر خليجي أو سائح أو مسافر
 * بشريحة أجنبية بلا أثر. (اكتُشف 2026-07-29)
 */
export function normalizeAnyPhone(input: string | null | undefined):
  { local: string; wa: string; isJordanian: boolean } | null {
  const local = normalizeLocalPhone(input);
  if (local) return { local, wa: '962' + local.slice(1), isJordanian: true };

  const d = digitsOnly(input || '');
  // E.164: من 8 إلى 15 خانة ولا تبدأ بصفر. أقصر من ذلك ليس رقماً دولياً حقيقياً.
  if (d.length < 8 || d.length > 15 || d.startsWith('0')) return null;
  return { local: d, wa: d, isJordanian: false };
}

/** «اسمٌ» ليس اسماً: فارغ، أو رقمٌ منسّق (+962 7…) كما يعيده واتساب عنواناً لجهةٍ غير محفوظة —
 *  بعلامات الاتّجاه والمسافات غير الكاسرة التي يضعها واتساب حول الأرقام */
export function isMissingName(s: string | null | undefined): boolean {
  const t = String(s || '').trim();
  if (!t || /^[\s\d+()\-.\u00a0\u200e\u200f\u202a-\u202e\u2066-\u2069]+$/.test(t)) return true;
  // «MC +962 7 8070 2381»: اختصارٌ حفظه الموظّفون على هاتف الأعمال + الرقم — ليس اسماً (≤٣ أحرف حول ٧ أرقام فأكثر)
  const digits = (t.match(/\d/g) || []).length;
  const letters = t.replace(/[\s\d+()\-.\u00a0\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  if (digits >= 7 && letters.length <= 3) return true;
  // رموزٌ أو إيموجي بلا حرفٍ واحد ليست اسماً يُعرض
  return !/\p{L}/u.test(t);
}

/** تطبيع اسمٍ للمقارنة: حروفٌ صغيرة، بلا تشكيل/تطويل، ألِفات وتاء مربوطة وياء موحّدة، مسافاتٌ مفردة */
export function nameKey(s: string | null | undefined): string {
  return String(s || '').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
/** أوّل اسمٍ حقيقيّ من مرشّحين (الاسم المحفوظ على هاتف الأعمال، ثمّ اسم الملفّ الشخصيّ) */
export function firstRealName(...cands: Array<string | null | undefined>): string {
  for (const c of cands) if (!isMissingName(c)) return String(c).trim().slice(0, 150);
  return '';
}

/** هل هذا الرقم المخزَّن محلي أردني؟ (للعرض والمنطق المرتبط باللاعبين) */
export function isJordanianPhone(stored: string | null | undefined): boolean {
  return /^07[789]\d{7}$/.test(String(stored || ''));
}
