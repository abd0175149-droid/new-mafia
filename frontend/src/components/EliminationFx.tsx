'use client';

// ══════════════════════════════════════════════════════
// 🔥 أنيميشن الإقصاء — مكوّن واحد، تصاميم متعدّدة، وقابل للضبط
//
// ⚠️ ما كان: تصميم واحد اسمه `burn`، مرسوم **سطرياً داخل شاشة النهار**
//    بأعداد ألسنة ونثار مخبوزة في JSX، وبلا أي معامل. المؤلّف لا يملك
//    شيئاً يضبطه، ولا يمكن إضافة تصميم ثانٍ بلا تعديل مشهد اللعب نفسه.
//
// 🔒 فخّ يجب ألّا يُكسر: البوّابة الحيّة كانت `design === 'burn'` — مساواة
//    لا صدق قيمة. أي استخراج يُبدّلها إلى `!!design` يجعل **كل** تصميم
//    قادم يرسم ناراً. لذلك التوزيع هنا `switch` صريح، وما لا يُعرف
//    لا يُرسم شيئاً.
// ══════════════════════════════════════════════════════

import React from 'react';
import './RankEffects.css';

export const ELIMINATION_DESIGNS = ['burn', 'ash', 'drain', 'shatter', 'static'] as const;

export interface ElimFx {
  design: string;
  showInRecap: boolean;
  particles: number;
  color: string;
  color2: string;
  speed: number;
  intensity: number;
}

export const ELIM_DEFAULTS: ElimFx = {
  design: 'burn',
  showInRecap: false,
  particles: 7,
  color: '#f97316',
  color2: '#dc2626',
  speed: 1,
  intensity: 0.85,
};

/** افتراضات تُعيد شكل كل تصميم إلى أفضل صورته حين لا يضبط المؤلّف شيئاً */
const DESIGN_DEFAULTS: Record<string, Partial<ElimFx>> = {
  burn: { particles: 7, color: '#f97316', color2: '#dc2626' },
  ash: { particles: 12, color: '#a8a29e', color2: '#57534e' },
  drain: { particles: 0, color: '#b91c1c', color2: '#450a0a' },
  shatter: { particles: 8, color: '#e0f2fe', color2: '#0ea5e9' },
  static: { particles: 0, color: '#e5e7eb', color2: '#111827' },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: any, f: string) => (typeof v === 'string' && HEX.test(v) ? v : f);
const num = (v: any, f: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : f;
};

export function normalizeElimFx(raw: any): ElimFx {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const design = (ELIMINATION_DESIGNS as readonly string[]).includes(c.design)
    ? c.design : ELIM_DEFAULTS.design;
  const d = { ...ELIM_DEFAULTS, ...(DESIGN_DEFAULTS[design] || {}) };
  return {
    design,
    showInRecap: typeof c.showInRecap === 'boolean' ? c.showInRecap : d.showInRecap!,
    // ⚠️ السقف ١٦: هذه تُرسم لكل لاعب مُقصى على شاشة قاعة واحدة —
    //    عشرة لاعبين × ٦٠ جسيماً يُسقط معدّل الإطارات على جهاز العرض.
    particles: Math.trunc(num(c.particles, d.particles!, 0, 16)),
    color: hex(c.color, d.color!),
    color2: hex(c.color2, d.color2!),
    speed: num(c.speed, d.speed!, 0.25, 3),
    intensity: num(c.intensity, d.intensity!, 0, 1),
  };
}

/**
 * يُرسم فوق بطاقة اللاعب المُقصى. يحلّ محلّ «التعتيم الرمادي» المجاني وحده.
 * يُستدعى من مشهد النهار، ومن المشهد الليلي، ومن ضحايا القنبلة.
 */
export default function EliminationFx({ config, className = '' }: {
  config: any;
  className?: string;
}) {
  const fx = React.useMemo(() => normalizeElimFx(config), [config]);

  // بلا إعداد ⇒ لا شيء (التعتيم المجاني يبقى كما هو)
  if (!config?.design) return null;

  // ⚠️ المدّة تُمرَّر **مضاعِفاً بلا وحدة** لا زمناً: كل تصميم له إيقاعه
  //    الخاص (اللهب ٠٫٥٥ث، النثار ١٫٦ث)، فالضرب يحفظ التناسب بينها.
  //    تمرير زمن واحد كان سيجعل السرعة تسحق إيقاع التصميم.
  const vars = {
    '--elim-c1': fx.color,
    '--elim-c2': fx.color2,
    '--elim-dur-mul': String((1 / fx.speed).toFixed(3)),
    '--elim-alpha': String(fx.intensity),
  } as React.CSSProperties;

  const wrap = `absolute inset-0 z-20 rounded-2xl overflow-hidden pointer-events-none ${className}`;

  switch (fx.design) {
    case 'burn':
      return (
        <div className={wrap} style={vars}>
          <div className="elim-burn-char" />
          {Array.from({ length: fx.particles }).map((_, i) => (
            <div key={i} className="elim-burn-flame"
              style={{
                left: `${(i + 0.5) * (100 / Math.max(1, fx.particles))}%`,
                animationDelay: `${i * 0.18}s`,
                height: `${34 + (i % 3) * 14}%`,
              }} />
          ))}
          {Array.from({ length: Math.min(10, fx.particles + 3) }).map((_, i) => (
            <div key={`e${i}`} className="elim-burn-ember"
              style={{ left: `${8 + i * 9}%`, animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      );

    case 'ash':
      // تفكّك إلى رماد يتصاعد — الوجه يبهت والجسيمات تعلو
      return (
        <div className={wrap} style={vars}>
          <div className="elim-ash-veil" />
          {Array.from({ length: fx.particles }).map((_, i) => (
            <div key={i} className="elim-ash-fleck"
              style={{
                left: `${(i * 97) % 96}%`,
                animationDelay: `${(i % 6) * 0.28}s`,
                width: `${2 + (i % 3)}px`,
                height: `${2 + (i % 3)}px`,
              }} />
          ))}
        </div>
      );

    case 'drain':
      // نزف: موجة تنزل من أعلى وتُفرغ اللون
      return (
        <div className={wrap} style={vars}>
          <div className="elim-drain-wave" />
          <div className="elim-drain-pool" />
        </div>
      );

    case 'shatter':
      // تحطّم زجاجي — شظايا تتباعد من المركز
      return (
        <div className={wrap} style={vars}>
          <div className="elim-shatter-flash" />
          {Array.from({ length: fx.particles }).map((_, i) => {
            const a = (360 / Math.max(1, fx.particles)) * i;
            return (
              <div key={i} className="elim-shatter-shard"
                style={{
                  ['--shard-angle' as any]: `${a}deg`,
                  animationDelay: `${(i % 4) * 0.06}s`,
                }} />
            );
          })}
          <div className="elim-shatter-veil" />
        </div>
      );

    case 'static':
      // تشويش: البطاقة تفقد الإشارة
      return (
        <div className={wrap} style={vars}>
          <div className="elim-static-noise" />
          <div className="elim-static-bar" />
          <div className="elim-static-veil" />
        </div>
      );

    default:
      // 🔒 تصميم لا نعرفه لا يرسم شيئاً — ولا يرسم ناراً بالخطأ
      return null;
  }
}
