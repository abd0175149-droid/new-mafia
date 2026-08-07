// ══════════════════════════════════════════════════════
// 🔥 نظام «الجمرة» — هويّة كونسول المكان
// الاستعارة من المكان نفسه: فحمة الأرجيلة. الطلب يصل بارداً ويسخن كلّما تُرك،
// فتُقرأ حالة الطابور بالشكل قبل الرقم — والموظّف خلف البار ينظر ثانيتين
// بين تحضيرٍ وآخر في إضاءةٍ خافتة.
//
// ⚠️ مصدرٌ واحد للألوان: أيّ لونٍ يُكتب مباشرةً في صفحةٍ يكسر النظام.
// ولا نمط فاتح عمداً — الشاشة تعمل ليلاً، والفاتح يبهر العين ويكسر تكيّفها.
// ══════════════════════════════════════════════════════

export const EM = {
  ink: '#0B0D0C',        // فحم الليل — أرضيّة الكونسول
  ink2: '#121614',       // الترويسة والأشرطة
  card: '#161B18',
  line: '#232B27',
  line2: '#2E3833',
  text: '#E8EFEA',
  dim: '#8B9A92',
  faint: '#5A6862',

  cool: '#5B7A8C',       // سُلّم الجمرة
  ember: '#8A7F63',
  warm: '#D98A2B',
  hot: '#E0492B',

  go: '#25C08A',         // الأخضر يُصرف مرّةً واحدة: «سُلّم»
  bundle: '#9B7BD4',     // الباقات
  opt: '#E8B84B',        // الخيارات — إغفالها يعني تحضيراً خاطئاً
} as const;

/** خطّ أحاديّ المسافة للأرقام: تصطفّ رأسيّاً فتُمسح بالعين دفعةً واحدة. */
export const MONO = '"Cascadia Mono",Consolas,"SF Mono",ui-monospace,monospace';

/** عتبة التأخّر — مطابقة لعتبة الخادم في fnb-reminder.service. */
export const STALL_SEC = 300;

/**
 * لون الحرارة من عمر المرحلة بالثواني.
 * نفس السُّلّم يحكم شريط الحافّة ولون العدّاد وحدّ البطاقة — إشارةٌ واحدة
 * مكرّرة ثلاث مرّات تُدرَك بلا تركيز.
 */
export function heat(sec: number): { color: string; hot: boolean } {
  if (sec < STALL_SEC) return { color: EM.cool, hot: false };
  if (sec < 420) return { color: EM.ember, hot: false };
  if (sec < 600) return { color: EM.warm, hot: false };
  return { color: EM.hot, hot: true };
}

/** «الآن» ثمّ «٣ د» — الدقائق تكفي، والثواني ضجيج. */
export function ageText(sec: number): string {
  if (sec < 60) return 'الآن';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} د`;
  return `${Math.floor(m / 60)} س ${m % 60} د`;
}

export const jod = (n: number) => `${n.toFixed(2)} د.أ`;

/** أنماط متكرّرة — تُستعمل كـ style لا كصنف Tailwind كي يبقى اللون من مصدرٍ واحد. */
export const S = {
  card: { background: EM.card, border: `1px solid ${EM.line}` },
  bar: { background: EM.ink2, borderBottom: `1px solid ${EM.line}` },
  mono: { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' as const },
} as const;
