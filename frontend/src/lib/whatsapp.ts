// ══════════════════════════════════════════════════════
// 💬 فتح محادثة واتساب برسالة جاهزة — النقطة الوحيدة لكلّ الصفحات
//
// 🔴 لا تستعمل wa.me مع نصّ — أبداً.
//    صفحة wa.me تُتلف كلّ محرفٍ يتجاوز بايتين في UTF-8: العربيّة (بايتان) تنجو،
//    و❤ (U+2764، ثلاث بايتات) و👋 (U+1F44B، أربع بايتات) يصلان `�`.
//
//    مُقاس على الجهاز مباشرةً (2026-08-30، ويندوز ١١ + تطبيق واتساب من المتجر
//    5319275A.WhatsAppDesktop 2.2632.100.0). نفس النصّ ونفس الترميز حرفيّاً:
//      · https://wa.me/<رقم>?text=…                → «تجربة � � � �»
//      · https://api.whatsapp.com/send?phone=…     → «تجربة ❤ 👋 🔥 ❤️‍🔥» ✅
//    والنسخ إلى الحافظة ثمّ اللصق وصل سليماً أيضاً — أي أنّ الخطّ والتطبيق
//    والنظام كلّها بريئة، والعطب في سكربت wa.me وحده.
//
//    ⚠️ التصحيح **نقطةُ نهايةٍ لا ترميز**: encodeURIComponent كان يُنتج
//    %E2%9D%A4 و%F0%9F%91%8B سليمَين في الحالتين، والذهاب والإياب مطابق.
//    فلا تحاول «إصلاحه» بترميزٍ آخر — غيّر نقطة النهاية فقط.
// ══════════════════════════════════════════════════════

const WA_COUNTRY = '962'; // الأردن

/** يحوّل رقماً محلّيّاً إلى الصيغة الدوليّة بلا «+» — أو null إن كان غير صالح. */
export function normalizePhoneIntl(raw: string): string | null {
  let p = String(raw || '').replace(/\D/g, '');
  if (!p || p.length < 6) return null;
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith(WA_COUNTRY)) return p;
  if (p.startsWith('0')) return WA_COUNTRY + p.slice(1);
  return WA_COUNTRY + p; // رقم محلّيّ بلا صفرٍ بادئ
}

/** رابط محادثةٍ برسالةٍ جاهزة. اقرأ التحذير أعلى الملفّ قبل تغيير النطاق. */
export function whatsappUrl(intlPhone: string, text?: string): string {
  const base = `https://api.whatsapp.com/send?phone=${intlPhone}`;
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}

/**
 * يفتح محادثة واتساب مع نصٍّ جاهز في تبويبٍ جديد.
 * يُرجع false إن كان الرقم غير صالح — فتُظهر الواجهة رسالتها بنفسها.
 */
export function openWhatsApp(rawPhone: string, text?: string): boolean {
  const intl = normalizePhoneIntl(rawPhone);
  if (!intl) return false;
  window.open(whatsappUrl(intl, text), '_blank');
  return true;
}

// ══════════════════════════════════════════════════════
// 🧩 محرّك القوالب — مشترك بين كلّ صفحةٍ تُرسل رسالةً قابلةً للتحرير
// ══════════════════════════════════════════════════════

export interface TemplateVar<T> {
  /** الرمز كما يُكتب في القالب، مثل `{الاسم}` */
  token: string;
  /** اسمه في أزرار الإدراج */
  label: string;
  /** استخراج قيمته من بيانات الصفّ */
  get: (data: T) => string;
  /**
   * 🔑 اختياريّ = قد لا تتوفّر قيمته أصلاً (رابط خريطة، موعد، مكان).
   * السطر الذي كلُّ متغيّراته اختياريّةٌ وفارغة **يسقط كاملاً**، وإلّا بقيت
   * لافتةٌ عارية مثل «🗺️ الموقع على الخريطة:» بلا رابط. أمّا `{الاسم}` فليس
   * اختياريّاً: سطرُ التحيّة يبقى ولو غاب الاسم، تماماً كسلوك الرسالة الثابتة قبله.
   */
  optional?: boolean;
}

/** يستبدل الرموز بقيمها، ويُسقط الأسطر الاختياريّة الفارغة (انظر `optional`). */
export function fillTemplate<T>(tpl: string, vars: TemplateVar<T>[], data: T): string {
  return String(tpl || '').split('\n').map((line) => {
    let filled = line, hasToken = false, hasValue = false, anyOptional = false;
    for (const v of vars) {
      if (!filled.includes(v.token)) continue;
      hasToken = true;
      if (v.optional) anyOptional = true;
      const value = String(v.get(data) ?? '').trim();
      if (value) hasValue = true;
      filled = filled.split(v.token).join(value);
    }
    return (hasToken && anyOptional && !hasValue) ? null : filled;
  }).filter((l): l is string => l !== null).join('\n');
}

/** يُكمل رابطاً بلا بروتوكول — وإلّا لم يصر قابلاً للنقر داخل واتساب. */
export function ensureHttp(raw?: string | null): string {
  const s = String(raw || '').trim();
  return s && !/^https?:\/\//i.test(s) ? `https://${s}` : s;
}
