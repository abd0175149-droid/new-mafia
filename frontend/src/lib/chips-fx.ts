// ══════════════════════════════════════════════════════
// 🎨 عقد تأثيرات البطاقة — المصدر الوحيد لشكل كائن التأثيرات
//
// كان هذا الشكل معرَّفاً **خمس مرات** في المشروع (محرّر الرتب، بذرة الكتالوج،
// الصفحة التجريبية، بذرة تأثيرات الرتب، وضمنياً في المُصيّر) ولا يُفرض ولا مرة.
// النتيجة: قنوات موجودة في التعريفات ولا تُرسم أبداً، وإعداد ناقص مفتاح واحد
// يُسقط كل بطاقات شاشة القاعة دفعةً واحدة.
//
// ⚠️ المرجع الحقيقي هو ما يرسمه DynamicMafiaCard — وهذا الملف يوثّقه ويفرضه.
//    أي قناة تُضاف هنا يجب أن يقابلها رسم فعلي، وإلا فهي وعد كاذب للمؤلّف.
// ══════════════════════════════════════════════════════

export type BorderStyle = 'solid' | 'gradient' | 'traveling';
export type FrameType = 'none' | 'simple' | 'greek' | 'islamic' | 'deco' | 'royal';
export type ParticleAnim = 'orbit' | 'burst';
export type FloatAnim = 'float' | 'bounce' | 'spin';

export interface FxChannels {
  border: { enabled: boolean; color: string; width: number; inset: number; style: BorderStyle; gradientColors: string[]; travelSpeed: number };
  glow: { enabled: boolean; color: string; size: number; opacity: number; pulseEnabled: boolean; pulseDuration: number };
  shimmer: { enabled: boolean; color: string; opacity: number; duration: number };
  particles: { enabled: boolean; count: number; color: string; size: number; orbitRadius: string; baseDuration: number; originX: number; originY: number; animationType: ParticleAnim };
  corners: { enabled: boolean; color: string; size: number; width: number; pulseEnabled: boolean };
  frame: { enabled: boolean; type: FrameType; color: string; opacity: number; strokeWidth: number; animate: boolean };
  gradientOverlay: { enabled: boolean; color: string; opacity: number; direction: string };
  floating: { enabled: boolean; content: string; position: 'top' | 'bottom'; size: number; animation: FloatAnim; glowColor: string; offsetX?: number; offsetY?: number; scale?: number };
  badge: { enabled: boolean; emoji: string; label: string; bgColor: string; textColor: string; borderColor: string; offsetX?: number; offsetY?: number; scale?: number };
  nameEffect: {
    enabled: boolean; color: string; glowColor: string; glowSize: number;
    style: string; color2: string; angle: number;
    outlineColor: string; outlineWidth: number;
    anim: string; animDuration: number; enter: string;
  };
}

/** كل القنوات مطفأة — الأساس الذي يُدمج فوقه أي إعداد جزئي */
export const FX_DEFAULTS: FxChannels = {
  border: { enabled: false, color: '#f59e0b', width: 2, inset: 0, style: 'solid', gradientColors: ['#f59e0b'], travelSpeed: 3 },
  glow: { enabled: false, color: '#f59e0b', size: 12, opacity: 0.4, pulseEnabled: false, pulseDuration: 2.5 },
  shimmer: { enabled: false, color: '#ffffff', opacity: 0.1, duration: 4 },
  particles: { enabled: false, count: 4, color: '#f59e0b', size: 3, orbitRadius: '90px', baseDuration: 5, originX: 50, originY: 50, animationType: 'orbit' },
  corners: { enabled: false, color: '#f59e0b', size: 12, width: 2, pulseEnabled: false },
  frame: { enabled: false, type: 'none', color: '#f59e0b', opacity: 0.7, strokeWidth: 1.5, animate: true },
  gradientOverlay: { enabled: false, color: '#f59e0b', opacity: 0.1, direction: 'to top' },
  floating: { enabled: false, content: '', position: 'top', size: 18, animation: 'float', glowColor: '#f59e0b' },
  badge: { enabled: false, emoji: '', label: '', bgColor: 'rgba(0,0,0,0.6)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.4)' },
  nameEffect: {
    enabled: false, color: '#ffffff', glowColor: '#f59e0b', glowSize: 8,
    style: 'glow', color2: '#f59e0b', angle: 90,
    outlineColor: '#000000', outlineWidth: 1,
    anim: 'none', animDuration: 2.5, enter: 'none',
  },
};

export const FX_CHANNELS = Object.keys(FX_DEFAULTS) as (keyof FxChannels)[];

// ── أدوات القصّ ───────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
/** لون سداسي صالح فقط — أي شيء آخر يعود للافتراضي بدل أن يُسقط المُصيّر */
function hex(v: any, fallback: string): string {
  return typeof v === 'string' && HEX.test(v) ? v : fallback;
}
/** لون CSS حرّ (يقبل rgba للشارات) — يُرفض غير النصّ فقط */
function cssColor(v: any, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 && v.length < 80 ? v.trim() : fallback;
}
function num(v: any, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function bool(v: any, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function pick<T extends string>(v: any, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v) ? v : fallback;
}
function str(v: any, fallback: string, max = 40): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}

/**
 * يحوّل أي مُدخل — ناقصاً أو مشوَّهاً أو مصفوفة أو null — إلى كائن كامل آمن.
 * بعد هذه الدالة يستطيع المُصيّر قراءة `fx.border.enabled` بلا حماية.
 */
export function normalizeFx(input: unknown): FxChannels {
  const src: any = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const d = FX_DEFAULTS;
  const g = (k: string) => (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) ? src[k] : {});

  const b = g('border');
  const gl = g('glow');
  const sh = g('shimmer');
  const pa = g('particles');
  const co = g('corners');
  const fr = g('frame');
  const go = g('gradientOverlay');
  const fl = g('floating');
  const bd = g('badge');
  const ne = g('nameEffect');

  const borderEnabled = bool(b.enabled, d.border.enabled);

  const gradientColors = Array.isArray(b.gradientColors)
    ? b.gradientColors.filter((c: any) => typeof c === 'string' && HEX.test(c)).slice(0, 8)
    : [];

  return {
    border: {
      enabled: borderEnabled,
      color: hex(b.color, d.border.color),
      width: num(b.width, d.border.width, 0.5, 6),
      inset: num(b.inset, d.border.inset, -10, 10),
      style: pick(b.style, ['solid', 'gradient', 'traveling'] as const, d.border.style),
      // ⚠️ لا تقلّ عن لونين: المُصيّر يبني `linear-gradient(135deg, …)` من هذه
      //    القائمة، و`linear-gradient` بلون واحد **غير صالح** في CSS فتسقط
      //    الخاصية كاملةً ويختفي الإطار المدفوع بلا أثر. نُكرّر اللون الواحد.
      gradientColors: gradientColors.length >= 2
        ? gradientColors
        : [gradientColors[0] || hex(b.color, d.border.color), gradientColors[0] || hex(b.color, d.border.color)],
      travelSpeed: num(b.travelSpeed, d.border.travelSpeed, 0.5, 30),
    },
    glow: {
      // ⚠️ التوهّج يُرسم داخل كتلة الإطار حصراً (قيد المُصيّر) — فتفعيله
      //    والإطار مطفأ وعدٌ لا يتحقّق. نُطفئه صراحةً كي لا يكذب المحرّر.
      enabled: borderEnabled && bool(gl.enabled, d.glow.enabled),
      color: hex(gl.color, d.glow.color),
      size: num(gl.size, d.glow.size, 0, 60),
      opacity: num(gl.opacity, d.glow.opacity, 0, 1),
      pulseEnabled: bool(gl.pulseEnabled, d.glow.pulseEnabled),
      pulseDuration: num(gl.pulseDuration, d.glow.pulseDuration, 0.4, 20),
    },
    shimmer: {
      enabled: bool(sh.enabled, d.shimmer.enabled),
      color: hex(sh.color, d.shimmer.color),
      opacity: num(sh.opacity, d.shimmer.opacity, 0, 1),
      duration: num(sh.duration, d.shimmer.duration, 0.5, 30),
    },
    particles: {
      enabled: bool(pa.enabled, d.particles.enabled),
      // سقف صارم: الحلقة تُنشئ عنصراً لكل جزيئة، وعدد غير محدود يُجمّد الشاشة
      count: Math.trunc(num(pa.count, d.particles.count, 0, 12)),
      color: hex(pa.color, d.particles.color),
      size: num(pa.size, d.particles.size, 1, 12),
      orbitRadius: typeof pa.orbitRadius === 'string' && /^\d{1,3}px$/.test(pa.orbitRadius) ? pa.orbitRadius : d.particles.orbitRadius,
      baseDuration: num(pa.baseDuration, d.particles.baseDuration, 0.5, 30),
      originX: num(pa.originX, d.particles.originX, 0, 100),
      originY: num(pa.originY, d.particles.originY, 0, 100),
      animationType: pick(pa.animationType, ['orbit', 'burst'] as const, d.particles.animationType),
    },
    corners: {
      enabled: bool(co.enabled, d.corners.enabled),
      color: hex(co.color, d.corners.color),
      size: num(co.size, d.corners.size, 4, 40),
      width: num(co.width, d.corners.width, 1, 6),
      pulseEnabled: bool(co.pulseEnabled, d.corners.pulseEnabled),
    },
    frame: {
      enabled: bool(fr.enabled, d.frame.enabled),
      type: pick(fr.type, ['none', 'simple', 'greek', 'islamic', 'deco', 'royal'] as const, d.frame.type),
      color: hex(fr.color, d.frame.color),
      opacity: num(fr.opacity, d.frame.opacity, 0, 1),
      strokeWidth: num(fr.strokeWidth, d.frame.strokeWidth, 0.5, 6),
      animate: bool(fr.animate, d.frame.animate),
    },
    gradientOverlay: {
      enabled: bool(go.enabled, d.gradientOverlay.enabled),
      color: hex(go.color, d.gradientOverlay.color),
      opacity: num(go.opacity, d.gradientOverlay.opacity, 0, 1),
      direction: str(go.direction, d.gradientOverlay.direction, 30),
    },
    floating: {
      enabled: bool(fl.enabled, d.floating.enabled),
      content: str(fl.content, d.floating.content, 8),
      position: pick(fl.position, ['top', 'bottom'] as const, d.floating.position),
      size: num(fl.size, d.floating.size, 6, 80),
      animation: pick(fl.animation, ['float', 'bounce', 'spin'] as const, d.floating.animation),
      glowColor: hex(fl.glowColor, d.floating.glowColor),
      ...(fl.offsetX !== undefined ? { offsetX: num(fl.offsetX, 0, -200, 200) } : {}),
      ...(fl.offsetY !== undefined ? { offsetY: num(fl.offsetY, 0, -200, 200) } : {}),
      ...(fl.scale !== undefined ? { scale: num(fl.scale, 1, 0.3, 4) } : {}),
    },
    badge: {
      enabled: bool(bd.enabled, d.badge.enabled),
      emoji: str(bd.emoji, d.badge.emoji, 8),
      label: str(bd.label, d.badge.label, 24),
      bgColor: cssColor(bd.bgColor, d.badge.bgColor),
      textColor: cssColor(bd.textColor, d.badge.textColor),
      borderColor: cssColor(bd.borderColor, d.badge.borderColor),
      ...(bd.offsetX !== undefined ? { offsetX: num(bd.offsetX, 0, -200, 200) } : {}),
      ...(bd.offsetY !== undefined ? { offsetY: num(bd.offsetY, 0, -200, 200) } : {}),
      ...(bd.scale !== undefined ? { scale: num(bd.scale, 1, 0.3, 4) } : {}),
    },
    nameEffect: {
      enabled: bool(ne.enabled, d.nameEffect.enabled),
      color: hex(ne.color, d.nameEffect.color),
      glowColor: hex(ne.glowColor, d.nameEffect.glowColor),
      glowSize: num(ne.glowSize, d.nameEffect.glowSize, 0, 30),
      // قنوات كتالوج التأثيرات — الافتراضي يُنتج السلوك القديم حرفياً
      style: pick(ne.style, ['glow', 'gradient', 'outline', 'engraved'] as const, d.nameEffect.style as any),
      color2: hex(ne.color2, d.nameEffect.color2),
      angle: Math.round(num(ne.angle, d.nameEffect.angle, 0, 360)),
      outlineColor: hex(ne.outlineColor, d.nameEffect.outlineColor),
      outlineWidth: num(ne.outlineWidth, d.nameEffect.outlineWidth, 0, 2),
      anim: pick(ne.anim, ['none', 'pulse', 'flicker', 'sweep', 'cycle'] as const, d.nameEffect.anim as any),
      animDuration: num(ne.animDuration, d.nameEffect.animDuration, 0.4, 20),
      enter: pick(ne.enter, ['none', 'fade', 'rise'] as const, d.nameEffect.enter as any),
    },
  };
}

/** هل في الكائن قناة مرئية واحدة على الأقل؟ */
export function hasAnyEnabled(fx: FxChannels | null | undefined): boolean {
  if (!fx) return false;
  return FX_CHANNELS.some(k => (fx as any)[k]?.enabled === true);
}

/**
 * قنوات تُرسم في **طبقة التأثيرات** فوق البطاقة.
 * `nameEffect` مستثنى لأنه يُطبَّق على عنصر الاسم مباشرةً لا على الطبقة،
 * و`glow` مستثنى لأنه يُرسم داخل كتلة الإطار ولا يُنشئ طبقة بذاته.
 */
const LAYER_CHANNELS: (keyof FxChannels)[] = [
  'border', 'shimmer', 'particles', 'corners', 'frame', 'gradientOverlay', 'floating', 'badge',
];

/** هل تستحق طبقة التأثيرات الرسم أصلاً؟ */
export function hasLayerVisuals(fx: FxChannels | null | undefined): boolean {
  if (!fx) return false;
  return LAYER_CHANNELS.some(k => (fx as any)[k]?.enabled === true);
}

/**
 * 🪙 دمج طبقيّ: المشترى يعلو، والمكتسَب بالرتبة يبقى — قرار المالك (١٥).
 *
 * كان الإطار المدفوع **يستبدل** تأثيرات الرتبة كلياً، فإطار بعشرين تشبس
 * يمحو حدود GODFATHER وشارته — أي أن الشراء يعاقب اللاعب الرفيع.
 * القاعدة الآن: أي قناة يُفعّلها المشترى تفوز بكاملها، وأي قناة لا يمسّها
 * تبقى كما منحتها الرتبة.
 */
export function mergeFx(rankFx: unknown, paidFx: unknown): FxChannels {
  const base = normalizeFx(rankFx);
  const paid = normalizeFx(paidFx);
  const out = {} as FxChannels;
  for (const k of FX_CHANNELS) {
    (out as any)[k] = (paid as any)[k]?.enabled ? (paid as any)[k] : (base as any)[k];
  }
  return out;
}
