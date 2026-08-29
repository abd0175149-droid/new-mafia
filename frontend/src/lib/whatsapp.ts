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
