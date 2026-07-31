'use client';

// ══════════════════════════════════════════════════════
// 🏷️ لوحة اللقب — مُصيّر واحد لكل الأشكال
//
// ⚠️ كان اللقب يُرسم بسطر واحد: صنف CSS يحمل اسم النمط. فالأشكال الثلاثة
//    هي كل ما يمكن بيعه، وأي شكل رابع يعني CSS جديداً ونشرة كاملة.
//
// 🔒 قاعدة هذا الملف: النمط المعروف (gold · blood · ghost) يُرجع **نفس
//    العنصر تماماً** — نفس الوسم، نفس الصنف، **وبلا أي كائن أنماط سطرية**
//    — فيُنتج الشكل من قواعد CSS التي لم تُمسّ. من اشترى لقباً ذهبياً
//    يراه اليوم كما رآه أمس، بكسلاً بكسل.
//
//    و`custom` وحده يُبنى من البيانات.
// ══════════════════════════════════════════════════════

import React, { useMemo } from 'react';

export const TITLE_ANIMS = ['none', 'pulse', 'breathe', 'shimmer', 'float'] as const;

export interface TitlePlaqueConfig {
  bg: { type: 'solid' | 'gradient'; color: string; color2: string; angle: number; blur: number };
  text: { color: string; size: number; weight: number; letterSpacing: number };
  border: { enabled: boolean; color: string; width: number; style: string; radius: number };
  glow: { enabled: boolean; color: string; size: number };
  shadow: { enabled: boolean; color: string; size: number };
  anim: { type: string; duration: number; intensity: number };
  layout: { paddingX: number; paddingY: number; marginTop: number; maxWidth: number };
}

export const TITLE_PLAQUE_DEFAULTS: TitlePlaqueConfig = {
  bg: { type: 'solid', color: 'rgba(69,26,3,0.8)', color2: 'rgba(120,53,15,0.8)', angle: 135, blur: 4 },
  text: { color: '#fcd34d', size: 10, weight: 900, letterSpacing: 0 },
  border: { enabled: true, color: 'rgba(245,158,11,0.6)', width: 1, style: 'solid', radius: 7 },
  glow: { enabled: true, color: 'rgba(245,158,11,0.5)', size: 8 },
  shadow: { enabled: false, color: 'rgba(0,0,0,0.4)', size: 4 },
  anim: { type: 'none', duration: 2, intensity: 0.5 },
  layout: { paddingX: 8, paddingY: 1, marginTop: 3, maxWidth: 92 },
};

const BG_TYPES = ['solid', 'gradient'];
const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double'];
const WEIGHTS = [400, 600, 700, 800, 900];

const clamp = (v: any, f: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : f;
};
const col = (v: any, f: string) =>
  typeof v === 'string' && v.trim() && v.length < 80 ? v.trim() : f;
const one = <T,>(v: any, allowed: readonly T[], f: T): T =>
  (allowed as readonly any[]).includes(v) ? v : f;

/**
 * يُطبّع أي مُدخل إلى لوحة كاملة. مرآة `normalizeTitlePlaque` في الخادم:
 * ذاك يمنع تخزين الفاسد، وهذا يحمي الرسم من صفوف خُزِّنت قبل وجوده.
 */
export function normalizeTitlePlaque(raw: any): TitlePlaqueConfig {
  const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = TITLE_PLAQUE_DEFAULTS;
  const g = (k: string) => (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) ? p[k] : {});
  const bg = g('bg'), text = g('text'), border = g('border');
  const glow = g('glow'), shadow = g('shadow'), anim = g('anim'), layout = g('layout');

  return {
    bg: {
      type: one(bg.type, BG_TYPES, d.bg.type) as any,
      color: col(bg.color, d.bg.color),
      color2: col(bg.color2, d.bg.color2),
      angle: Math.round(clamp(bg.angle, d.bg.angle, 0, 360)),
      blur: clamp(bg.blur, d.bg.blur, 0, 12),
    },
    text: {
      color: col(text.color, d.text.color),
      size: clamp(text.size, d.text.size, 8, 20),
      weight: one(Number(text.weight), WEIGHTS, d.text.weight),
      letterSpacing: clamp(text.letterSpacing, d.text.letterSpacing, -0.5, 4),
    },
    border: {
      enabled: typeof border.enabled === 'boolean' ? border.enabled : d.border.enabled,
      color: col(border.color, d.border.color),
      width: clamp(border.width, d.border.width, 0, 4),
      style: one(border.style, BORDER_STYLES, d.border.style),
      radius: clamp(border.radius, d.border.radius, 0, 20),
    },
    glow: {
      enabled: typeof glow.enabled === 'boolean' ? glow.enabled : d.glow.enabled,
      color: col(glow.color, d.glow.color),
      size: clamp(glow.size, d.glow.size, 0, 24),
    },
    shadow: {
      enabled: typeof shadow.enabled === 'boolean' ? shadow.enabled : d.shadow.enabled,
      color: col(shadow.color, d.shadow.color),
      size: clamp(shadow.size, d.shadow.size, 0, 30),
    },
    anim: {
      type: one(anim.type, TITLE_ANIMS, d.anim.type as any),
      duration: clamp(anim.duration, d.anim.duration, 0.4, 20),
      intensity: clamp(anim.intensity, d.anim.intensity, 0, 1),
    },
    layout: {
      paddingX: clamp(layout.paddingX, d.layout.paddingX, 0, 24),
      paddingY: clamp(layout.paddingY, d.layout.paddingY, 0, 12),
      marginTop: clamp(layout.marginTop, d.layout.marginTop, 0, 16),
      maxWidth: clamp(layout.maxWidth, d.layout.maxWidth, 40, 100),
    },
  };
}

/** يبني أنماط اللوحة المخصّصة — لا يقرأ DOM ولا يرمي */
export function plaqueStyle(p: TitlePlaqueConfig): React.CSSProperties {
  const shadows: string[] = [];
  if (p.glow.enabled && p.glow.size > 0) shadows.push(`0 0 ${p.glow.size}px ${p.glow.color}`);
  if (p.shadow.enabled && p.shadow.size > 0) shadows.push(`0 2px ${p.shadow.size}px ${p.shadow.color}`);

  const st: React.CSSProperties = {
    background: p.bg.type === 'gradient'
      ? `linear-gradient(${p.bg.angle}deg, ${p.bg.color}, ${p.bg.color2})`
      : p.bg.color,
    color: p.text.color,
    fontSize: `${p.text.size}px`,
    fontWeight: p.text.weight as any,
    letterSpacing: `${p.text.letterSpacing}px`,
    padding: `${p.layout.paddingY}px ${p.layout.paddingX}px`,
    marginTop: `${p.layout.marginTop}px`,
    maxWidth: `${p.layout.maxWidth}%`,
    borderRadius: `${p.border.radius}px`,
    // ⚠️ `backdrop-filter: blur(0px)` يُنشئ طبقة تركيب بلا فائدة على شاشة
    //    القاعة — تُحذف الخاصية كلياً حين لا ضبابية.
    ...(p.bg.blur > 0 ? { backdropFilter: `blur(${p.bg.blur}px)` } : {}),
    ...(p.border.enabled && p.border.width > 0
      ? { border: `${p.border.width}px ${p.border.style} ${p.border.color}` }
      : { border: 'none' }),
    ...(shadows.length ? { boxShadow: shadows.join(', ') } : {}),
  };

  if (p.anim.type !== 'none') {
    st.animation = `chips-plaque-${p.anim.type} ${p.anim.duration}s ease-in-out infinite`;
    // الشدّة تُمرَّر كمتغيّر CSS فتقرؤها الإطارات المفتاحية بلا صنف لكل قيمة
    (st as any)['--plaque-intensity'] = String(p.anim.intensity);
    (st as any)['--plaque-glow'] = p.glow.color;
  }

  return st;
}

export default function TitlePlaque({
  text, style, plaque, className = '',
}: {
  text: string;
  style?: string;
  plaque?: any;
  className?: string;
}) {
  const custom = style === 'custom';
  const p = useMemo(() => (custom ? normalizeTitlePlaque(plaque) : null), [custom, plaque]);

  if (!text) return null;

  // 🔒 المسار القديم حرفياً — بلا `style` سطري إطلاقاً
  if (!custom) {
    return (
      <div className={`chips-title-plaque chips-title-${style || 'gold'} ${className}`.trim()}>
        {text}
      </div>
    );
  }

  return (
    <div className={`chips-title-plaque ${className}`.trim()} style={plaqueStyle(p!)}>
      {text}
    </div>
  );
}
