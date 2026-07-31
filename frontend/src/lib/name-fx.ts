// ══════════════════════════════════════════════════════
// 🔤 تأثير الاسم — كتالوج التأثيرات وبناء الأنماط
//
// ⚠️ ما كان: ثلاث قيم فقط (لون · لون توهّج · حجم توهّج) وبلا أي حركة.
//    وهو النوع الأوسع سطحاً في اللعبة — الاسم يظهر على وجهَي البطاقة وعلى
//    شاشة القاعة وفي كل مشهد — ومع ذلك كان أفقره تصميماً.
//
// 📐 قاعدة المنتج الحاكمة: «يُقرأ من ثلاثة أمتار». كل تأثير هنا يحافظ على
//    تباين الحروف؛ ما يُذيب الحدّ (تدرّج شاحب، توهّج يبتلع الحرف) مقصوص
//    بحدود لا تسمح به.
//
// 🔒 التوافق: `style` الافتراضي هو `glow`، وهو المسار القديم حرفياً —
//    نفس `color` ونفس سلسلة `textShadow` بطبقتيها. صفٌّ مخزَّن بلا `style`
//    يُرسم كما رُسم أمس تماماً.
// ══════════════════════════════════════════════════════

import type { CSSProperties } from 'react';

export const NAME_FX_STYLES = ['glow', 'gradient', 'outline', 'engraved'] as const;
export const NAME_FX_ANIMS = ['none', 'pulse', 'flicker', 'sweep', 'cycle'] as const;
export const NAME_FX_ENTERS = ['none', 'fade', 'rise'] as const;

export interface NameFx {
  enabled: boolean;
  color: string;
  glowColor: string;
  glowSize: number;
  /** ↓ قنوات جديدة — كلها اختيارية وذات افتراضي يُنتج السلوك القديم */
  style: string;
  color2: string;
  angle: number;
  outlineColor: string;
  outlineWidth: number;
  anim: string;
  animDuration: number;
  enter: string;
}

export const NAME_FX_DEFAULTS: NameFx = {
  enabled: false,
  color: '#ffffff',
  glowColor: '#f59e0b',
  glowSize: 8,
  style: 'glow',
  color2: '#f59e0b',
  angle: 90,
  outlineColor: '#000000',
  outlineWidth: 1,
  anim: 'none',
  animDuration: 2.5,
  enter: 'none',
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: any, f: string) => (typeof v === 'string' && HEX.test(v) ? v : f);
const num = (v: any, f: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : f;
};
const one = <T,>(v: any, allowed: readonly T[], f: T): T =>
  (allowed as readonly any[]).includes(v) ? v : f;

/** يحوّل أي مُدخل إلى تأثير اسم كامل — لا يرمي، ولا يُسقط قناة */
export function normalizeNameFx(raw: any): NameFx {
  const n = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = NAME_FX_DEFAULTS;
  return {
    enabled: typeof n.enabled === 'boolean' ? n.enabled : d.enabled,
    color: hex(n.color, d.color),
    glowColor: hex(n.glowColor, d.glowColor),
    glowSize: num(n.glowSize, d.glowSize, 0, 30),
    style: one(n.style, NAME_FX_STYLES, d.style),
    color2: hex(n.color2, d.color2),
    angle: Math.round(num(n.angle, d.angle, 0, 360)),
    outlineColor: hex(n.outlineColor, d.outlineColor),
    // فوق ٢px يبتلع الخطّ العربي نفسه عند حجم البطاقة الصغير
    outlineWidth: num(n.outlineWidth, d.outlineWidth, 0, 2),
    anim: one(n.anim, NAME_FX_ANIMS, d.anim),
    animDuration: num(n.animDuration, d.animDuration, 0.4, 20),
    enter: one(n.enter, NAME_FX_ENTERS, d.enter),
  };
}

function rgba(hexColor: string, alpha: number): string {
  const h = typeof hexColor === 'string' && HEX.test(hexColor) ? hexColor : '#f59e0b';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * يبني نمط الاسم. يُعيد أيضاً صنفاً حين يحتاج التأثير طبقة أو إطارات
 * مفتاحية — فالمُستدعي يضعه على العنصر نفسه.
 */
export function buildNameFxStyle(raw: any): { style: CSSProperties; className: string } {
  const n = normalizeNameFx(raw);
  if (!n.enabled) return { style: {}, className: '' };

  const st: CSSProperties = {};
  const classes: string[] = [];

  // التوهّج بطبقتين — قريبة كثيفة وبعيدة خفيفة. هذه السلسلة بعينها هي
  // ما كان يُرسم قبل هذا الملف، ويجب ألّا تتغيّر لمن اشترى.
  const glowShadow =
    `0 0 ${n.glowSize}px ${rgba(n.glowColor, 0.45)}, 0 0 ${n.glowSize * 2.5}px ${rgba(n.glowColor, 0.18)}`;

  switch (n.style) {
    case 'gradient': {
      // ⚠️ الحروف تصير شفّافة والخلفية تُقصّ عليها، فـ`text-shadow` لا يُرسم
      //    إطلاقاً — التوهّج هنا يجب أن يكون مرشّحاً لا ظلّ نصّ.
      st.backgroundImage = `linear-gradient(${n.angle}deg, ${n.color}, ${n.color2})`;
      st.backgroundClip = 'text';
      (st as any).WebkitBackgroundClip = 'text';
      (st as any).WebkitTextFillColor = 'transparent';
      st.color = 'transparent';
      if (n.glowSize > 0) st.filter = `drop-shadow(0 0 ${Math.min(12, n.glowSize)}px ${rgba(n.glowColor, 0.5)})`;
      // اللمعة تحتاج خلفية أعرض من النص كي تمرّ فوقه
      if (n.anim === 'sweep') { st.backgroundSize = '250% 100%'; classes.push('namefx-sweep'); }
      break;
    }
    case 'outline': {
      st.color = n.color;
      (st as any).WebkitTextStrokeWidth = `${n.outlineWidth}px`;
      (st as any).WebkitTextStrokeColor = n.outlineColor;
      st.paintOrder = 'stroke fill';
      if (n.glowSize > 0) st.textShadow = glowShadow;
      break;
    }
    case 'engraved': {
      // نقش: ضوء من فوق وظلّ من تحت — يقرأه العين كحفر في المعدن
      st.color = n.color;
      st.textShadow =
        `0 1px 0 ${rgba(n.glowColor, 0.55)}, 0 -1px 1px rgba(0,0,0,0.65)` +
        (n.glowSize > 0 ? `, 0 0 ${n.glowSize}px ${rgba(n.glowColor, 0.3)}` : '');
      break;
    }
    case 'glow':
    default: {
      // ✅ المسار القديم بالضبط
      st.color = n.color;
      st.textShadow = glowShadow;
      break;
    }
  }

  if (n.anim !== 'none' && !(n.style === 'gradient' && n.anim === 'sweep')) {
    classes.push(`namefx-${n.anim}`);
  }
  if (n.anim !== 'none') {
    (st as any)['--namefx-dur'] = `${n.animDuration}s`;
    (st as any)['--namefx-glow'] = rgba(n.glowColor, 0.55);
    (st as any)['--namefx-color'] = n.color;
    (st as any)['--namefx-color2'] = n.color2;
  }
  if (n.enter !== 'none') classes.push(`namefx-enter-${n.enter}`);

  return { style: st, className: classes.join(' ') };
}
