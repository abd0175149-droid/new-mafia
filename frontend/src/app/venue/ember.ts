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

// ── 💰 إعادة البناء 2026-10-30 ──────────────────────────
/**
 * لونا «لك / للنادي» — اجتازا فحوص الألوان الستّة (dataviz validate_palette)
 * على أرضيّة البطاقة الداكنة: تمييزٌ لعمى الألوان ΔE≈22 وتباينٌ فوق 3:1.
 * القديم (#A9C4D4) رماديٌّ يفشل. الأرقام تبقى بلون النصّ؛ اللون للمربّع وحده.
 */
export const SHARE = { venue: '#CC7F22', club: '#5596CC' } as const;

/** درجات نصٍّ مقروءة على البطاقة (faint يفشل التباين تحت 24px — للزخرفة فقط) */
export const TX = { sub: '#B4C0B9', dim: '#9AA8A0', amber: '#F0C58C', amberHi: '#E9A24F', bad: '#F79A82', good: '#4FD3A3' } as const;

/** حبّة الحرارة على عمر المرحلة: خلفيّة · نصّ · حدّ — بدل شريط الحافّة الملوّن */
export function heatPill(sec: number): { bg: string; fg: string; line: string; late: boolean } {
  if (sec >= 600) return { bg: 'rgba(224,73,43,.18)', fg: '#F79A82', line: EM.hot, late: true };
  if (sec >= 420) return { bg: 'rgba(204,127,34,.18)', fg: '#F0B060', line: SHARE.venue, late: false };
  if (sec >= STALL_SEC) return { bg: 'rgba(201,185,143,.14)', fg: '#D9CBA4', line: EM.ember, late: false };
  return { bg: 'rgba(91,122,140,.16)', fg: '#A8C3D2', line: '#3E5664', late: false };
}

/** رقمٌ بخانتين عشريّتين — بلا وحدة (الوحدة تُكتب بخطٍّ أصغر بجانبه) */
export const f2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

/** العدد مع المعدود بالعربيّة: ١ مفرد · ٢ مثنّى · ٣–١٠ جمع · ١١+ تمييز مفرد منصوب */
export function plural(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
export const pPlayers = (n: number) => n === 0 ? 'لا أحد' : plural(n, 'لاعب واحد', 'لاعبان', 'لاعبين', 'لاعباً');
export const pItems = (n: number) => plural(n, 'صنف واحد', 'صنفان', 'أصناف', 'صنفاً');
export const pInvoices = (n: number) => plural(n, 'فاتورة واحدة', 'فاتورتان', 'فواتير', 'فاتورة');
export const pOrders = (n: number) => plural(n, 'طلب واحد', 'طلبان', 'طلبات', 'طلباً');

/** تاريخ عمّان القصير: «الخميس 29/10» */
export function nightLabel(d: string | Date): string {
  const t = new Date(d);
  const day = t.toLocaleDateString('ar-JO', { weekday: 'long', timeZone: 'UTC' });
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  return `${day} ${dd}/${mm}`;
}

/** وقت عمّان «21:15» بأرقامٍ لاتينيّة */
export function hhmm(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Amman' });
}

/** أنماط متكرّرة — تُستعمل كـ style لا كصنف Tailwind كي يبقى اللون من مصدرٍ واحد. */
export const S = {
  card: { background: EM.card, border: `1px solid ${EM.line}` },
  bar: { background: EM.ink2, borderBottom: `1px solid ${EM.line}` },
  mono: { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' as const },
} as const;
