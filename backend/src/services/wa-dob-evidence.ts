// ══════════════════════════════════════════════════════
// 🎂 هل كتب العميل تاريخ ميلاده فعلاً؟ — دليلٌ من رسائله قبل إنشاء الحساب
// ══════════════════════════════════════════════════════
// ليث #529 (2026-10-01): بعد إعادة تشغيل التسجيل استدعى النموذج start_registration بتاريخ
// 1995-01-01 لم يكتبه ليث قطّ — وسأله عن تاريخه في الرسالة نفسها! ضغط «أنشئ حسابي» فحُفظ
// الحساب بتاريخٍ مخترع (والتاريخ يقود هديّة الميلاد وحدّ العمر). الأداة كانت تفحص الصيغة وحدها.
//
// الآن: يُقبل التاريخ فقط إن وُجدت أجزاؤه الثلاثة (يوم/شهر/سنة) في رسالةٍ من العميل — أو في
// رسالتين متتاليتين («1994» ثمّ «7 كانون التاني»). الأرقام العربيّة والفارسيّة وأسماء الأشهر
// (الشاميّة والمصريّة والإنجليزيّة) تُفهم، والسنة بخانتين تُقبل في صيغة يوم/شهر/سنة فقط.
// ══════════════════════════════════════════════════════

const MONTHS: Array<[RegExp, number]> = [
  [/كانون\s*(ال)?(ثاني|تاني)|يناير|jan(uary)?/i, 1],
  [/شباط|فبراير|feb(ruary)?/i, 2],
  [/آذار|اذار|مارس|mar(ch)?/i, 3],
  [/نيسان|أبريل|ابريل|إبريل|apr(il)?/i, 4],
  [/أيار|ايار|مايو|may/i, 5],
  [/حزيران|يونيو|يونيه|jun(e)?/i, 6],
  [/تموز|يوليو|يوليه|jul(y)?/i, 7],
  [/(^|\s)آب|(^|\s)اب(\s|$)|أغسطس|اغسطس|aug(ust)?/i, 8],
  [/أيلول|ايلول|سبتمبر|sep(t(ember)?)?/i, 9],
  [/تشرين\s*(ال)?(أول|اول)|أكتوبر|اكتوبر|oct(ober)?/i, 10],
  [/تشرين\s*(ال)?(ثاني|تاني)|نوفمبر|nov(ember)?/i, 11],
  [/كانون\s*(ال)?(أول|اول)|ديسمبر|dec(ember)?/i, 12],
];

export function normalizeDigits(s: string): string {
  return String(s || '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

/** الأعداد المذكورة في النصّ + أرقام الأشهر المذكورة بأسمائها */
function numbersIn(text: string): { nums: number[]; twoDigitYearDates: number[] } {
  const t = normalizeDigits(text);
  const nums = [...t.matchAll(/\d+/g)].map(m => Number(m[0]));
  // «كانون الأول» تحوي «أول» — نفحص الأطول أوّلاً عبر ترتيب القائمة (الثاني قبل الأول لا يهمّ: كلٌّ نمطه)
  for (const [re, n] of MONTHS) if (re.test(t)) nums.push(n);
  const twoDigitYearDates = [...t.matchAll(/\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*(\d{2})\b/g)].map(m => Number(m[1]));
  return { nums, twoDigitYearDates };
}

function hasParts(text: string, y: number, m: number, d: number): boolean {
  const { nums, twoDigitYearDates } = numbersIn(text);
  const yearOk = nums.includes(y) || twoDigitYearDates.includes(y % 100);
  if (!yearOk) return false;
  if (m === d) return nums.filter(n => n === m).length >= 2 || (nums.includes(m) && twoDigitYearDates.length > 0);
  return nums.includes(m) && nums.includes(d);
}

/**
 * هل أجزاء `dob` (YYYY-MM-DD) مكتوبةٌ في رسائل العميل؟
 * `texts`: نصوص رسائله الواردة، من الأحدث إلى الأقدم أو العكس — يُفحص كلٌّ وحده وكلُّ متتاليتين.
 */
export function dobInCustomerText(dob: string, texts: string[]): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const list = texts.map(t => String(t || '')).filter(Boolean);
  for (let i = 0; i < list.length; i++) {
    if (hasParts(list[i], y, mo, d)) return true;
    if (i + 1 < list.length && hasParts(`${list[i]}\n${list[i + 1]}`, y, mo, d)) return true;
  }
  return false;
}
