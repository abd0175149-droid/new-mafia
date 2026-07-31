// ══════════════════════════════════════════════════════
// 🚪 تشريفة الدخول — مخطّط قابل للتأليف
//
// ⚠️ ما كان: أربعة تصاميم، كلٌّ منها **فرع JSX مكتوب بخطّ اليد** داخل
//    EntranceOverlay، بمواضع وتأخيرات مكتوبة كأرقام حرفية. تشريفة خامسة
//    تعني كتابة فرع خامس ونشرة كاملة — والمؤلّف لا يملك إلا الاختيار
//    من أربعة.
//
// 📐 الشكل الجديد: التشريفة **قائمة عناصر**، لكل عنصر نوعه وموضعه ولونه
//    وحركة دخوله بتأخيرها ومدّتها. الخطّ الزمني كلّه بيانات.
//
// 🔒 التوافق: التصاميم الأربعة تبقى فروعها كما هي بلا لمس. `custom` وحده
//    يمرّ من هنا. من اشترى «موكب العرّاب» يراه كما رآه أمس.
// ══════════════════════════════════════════════════════

export const ENTRANCE_ELEMENT_TYPES = ['text', 'name', 'emblem', 'bar', 'seal', 'wash', 'sparks'] as const;
export const ENTRANCE_ENTER_FX = ['fade', 'slide', 'scale', 'stamp', 'flip'] as const;
export const ENTRANCE_FROM = ['top', 'bottom', 'left', 'right', 'center'] as const;

export interface EntranceElement {
  id: string;
  type: string;
  /** الموضع بالنسبة المئوية من مركز المسرح — يبقى صحيحاً على أي مقاس شاشة */
  x: number;
  y: number;
  size: number;
  color: string;
  color2: string;
  text: string;
  emblemId: string;
  enterFx: string;
  from: string;
  delayMs: number;
  durationMs: number;
  opacity: number;
}

export const ELEMENT_DEFAULTS: EntranceElement = {
  id: '', type: 'text',
  x: 0, y: 0, size: 100,
  color: '#fcd34d', color2: '#f59e0b',
  text: '', emblemId: 'don',
  enterFx: 'fade', from: 'center',
  delayMs: 0, durationMs: 600,
  opacity: 1,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: any, f: string) => (typeof v === 'string' && HEX.test(v) ? v : f);
const num = (v: any, f: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : f;
};
const one = <T,>(v: any, allowed: readonly T[], f: T): T =>
  (allowed as readonly any[]).includes(v) ? v : f;

/** حدّ أعلى للعناصر — مسرح مزدحم لا يُقرأ من ثلاثة أمتار، ويُثقل جهاز العرض */
export const MAX_ELEMENTS = 10;

export function normalizeElement(raw: any, i = 0): EntranceElement {
  const e = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = ELEMENT_DEFAULTS;
  return {
    id: typeof e.id === 'string' && e.id ? e.id.slice(0, 24) : `el${i}`,
    type: one(e.type, ENTRANCE_ELEMENT_TYPES, d.type),
    x: num(e.x, d.x, -50, 50),
    y: num(e.y, d.y, -50, 50),
    size: num(e.size, d.size, 10, 400),
    color: hex(e.color, d.color),
    color2: hex(e.color2, d.color2),
    text: typeof e.text === 'string' ? e.text.slice(0, 40) : d.text,
    emblemId: typeof e.emblemId === 'string' ? e.emblemId.slice(0, 20) : d.emblemId,
    enterFx: one(e.enterFx, ENTRANCE_ENTER_FX, d.enterFx),
    from: one(e.from, ENTRANCE_FROM, d.from),
    // التأخير مقصوص دون المدّة الكلّية القصوى، وإلا وُضع عنصر لا يظهر أبداً
    delayMs: Math.trunc(num(e.delayMs, d.delayMs, 0, 5500)),
    durationMs: Math.trunc(num(e.durationMs, d.durationMs, 100, 3000)),
    opacity: num(e.opacity, d.opacity, 0, 1),
  };
}

export function normalizeElements(raw: any): EntranceElement[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, MAX_ELEMENTS).map((e, i) => normalizeElement(e, i));
}

/**
 * القوالب — التصاميم الأربعة معبَّراً عنها بالبيانات.
 * ليست بديلاً عن فروعها الحيّة (تلك تبقى للمشتَرى سابقاً)، بل نقطة
 * انطلاق للمؤلّف: «ابدأ من موكب العرّاب ثم غيّر».
 */
export const ENTRANCE_PRESETS: Record<string, EntranceElement[]> = {
  don: [
    { ...ELEMENT_DEFAULTS, id: 'wash', type: 'wash', color: '#451a03', color2: '#000000', opacity: 0.9, enterFx: 'fade', durationMs: 500 },
    { ...ELEMENT_DEFAULTS, id: 'bar1', type: 'bar', y: -22, size: 260, color: '#f59e0b', enterFx: 'slide', from: 'left', delayMs: 200, durationMs: 550 },
    { ...ELEMENT_DEFAULTS, id: 'crest', type: 'emblem', y: -6, size: 110, emblemId: 'don', enterFx: 'scale', delayMs: 500, durationMs: 700 },
    { ...ELEMENT_DEFAULTS, id: 'nm', type: 'name', y: 14, size: 150, color: '#fcd34d', enterFx: 'slide', from: 'bottom', delayMs: 800, durationMs: 600 },
    { ...ELEMENT_DEFAULTS, id: 'bar2', type: 'bar', y: 26, size: 260, color: '#f59e0b', enterFx: 'slide', from: 'right', delayMs: 900, durationMs: 550 },
  ],
  seal: [
    { ...ELEMENT_DEFAULTS, id: 'wash', type: 'wash', color: '#450a0a', color2: '#000000', opacity: 0.9, enterFx: 'fade', durationMs: 400 },
    { ...ELEMENT_DEFAULTS, id: 'stamp', type: 'seal', y: -8, size: 150, color: '#dc2626', color2: '#7f1d1d', enterFx: 'stamp', delayMs: 350, durationMs: 420 },
    { ...ELEMENT_DEFAULTS, id: 'nm', type: 'name', y: 18, size: 140, color: '#fca5a5', enterFx: 'fade', delayMs: 750, durationMs: 500 },
  ],
  neon: [
    { ...ELEMENT_DEFAULTS, id: 'wash', type: 'wash', color: '#083344', color2: '#000000', opacity: 0.88, enterFx: 'fade', durationMs: 350 },
    { ...ELEMENT_DEFAULTS, id: 'crest', type: 'emblem', y: -10, size: 100, emblemId: 'neon', enterFx: 'fade', delayMs: 300, durationMs: 400 },
    { ...ELEMENT_DEFAULTS, id: 'nm', type: 'name', y: 12, size: 150, color: '#67e8f9', enterFx: 'scale', delayMs: 600, durationMs: 450 },
    { ...ELEMENT_DEFAULTS, id: 'sp', type: 'sparks', y: 0, size: 120, color: '#22d3ee', enterFx: 'fade', delayMs: 700, durationMs: 800 },
  ],
  file: [
    { ...ELEMENT_DEFAULTS, id: 'wash', type: 'wash', color: '#18181b', color2: '#000000', opacity: 0.92, enterFx: 'fade', durationMs: 400 },
    { ...ELEMENT_DEFAULTS, id: 'ttl', type: 'text', y: -20, size: 90, text: 'ملف سرّي', color: '#a1a1aa', enterFx: 'slide', from: 'top', delayMs: 250, durationMs: 500 },
    { ...ELEMENT_DEFAULTS, id: 'nm', type: 'name', y: 4, size: 150, color: '#d4d4d8', enterFx: 'fade', delayMs: 600, durationMs: 500 },
    { ...ELEMENT_DEFAULTS, id: 'stamp', type: 'seal', y: 24, size: 90, color: '#dc2626', color2: '#450a0a', enterFx: 'stamp', delayMs: 1100, durationMs: 380 },
  ],
};

/** أطول لحظة على الخطّ الزمني — لضبط مدّة العرض تلقائياً */
export function timelineEndMs(elements: EntranceElement[]): number {
  return elements.reduce((m, e) => Math.max(m, e.delayMs + e.durationMs), 0);
}
