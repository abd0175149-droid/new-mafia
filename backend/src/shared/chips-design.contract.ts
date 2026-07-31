// ══════════════════════════════════════════════════════
// 🎨 عقد تصاميم الخزنة — التطبيع على **جانب الكتابة**
//
// ⚠️ لماذا وُجد هذا الملف: `POST /api/chips/items` كان يقبل ثلاثة أنواع فقط
//    (لقب · تشريفة · تأثير اسم)، و`PUT /items/:id` كان يقبل **أي كائن** بلا
//    تحقّق إطلاقاً. والسبب الحقيقي لذلك المنع أن مُصيّر البطاقة كان يقرأ
//    `fx.border.enabled` وأخواتها بلا حماية، فإعداد ناقص مفتاحاً واحداً
//    يُسقط كل بطاقات شاشة القاعة دفعةً واحدة.
//
//    المُصيّر صار محصَّناً (frontend/src/lib/chips-fx.ts)، وهذا الملف يغلق
//    الطرف الآخر: **لا يُخزَّن إعداد غير صالح أصلاً**. الاثنان معاً حزام
//    وحمّالة — الأول يحمي من بيانات قديمة، والثاني يمنع دخول بيانات جديدة
//    فاسدة. أي تعديل هنا يجب أن يقابله تعديل هناك.
// ══════════════════════════════════════════════════════

// ── سجلّ التصاميم المتاحة ─────────────────────────────
// المصدر الحقيقي لكل قائمة هو مكوّن React الذي يرسمها. أي تصميم يُضاف هناك
// يجب أن يُضاف هنا، وإلا رفضه الخادم ولو كان مرسوماً — ولا العكس، وإلا
// خُزِّن معرّف لا يعرف المُصيّر رسمه.

/** أشكال الإطار الزخرفي — frontend/src/components/RankFrames.tsx */
export const FRAME_SVG_TYPES = ['none', 'simple', 'greek', 'islamic', 'deco', 'royal'] as const;

/** الشعارات المرسومة — frontend/src/components/ChipsEmblems.tsx */
export const EMBLEM_IDS = ['don', 'blood', 'neon', 'bullet', 'smoke', 'deal', 'crime', 'champ'] as const;

/** أنماط لوحة اللقب — أصناف CSS في RankEffects.css */
export const TITLE_STYLES = ['gold', 'blood', 'ghost'] as const;

/** تخطيطات تشريفة الدخول — frontend/src/components/EntranceOverlay.tsx */
export const ENTRANCE_DESIGNS = ['don', 'seal', 'neon', 'file'] as const;

/** أنماط أنيميشن الإقصاء — DisplayDayView.tsx */
export const ELIMINATION_DESIGNS = ['burn'] as const;

export const BORDER_STYLES = ['solid', 'gradient', 'traveling'] as const;
export const PARTICLE_ANIMS = ['orbit', 'burst'] as const;
export const FLOAT_ANIMS = ['float', 'bounce', 'spin'] as const;

/** المدّة القياسية لكل نوع (معزّز الخبرة هو الاستثناء المعتمد) */
export const DEFAULT_DAYS_BY_KIND: Record<string, number> = {
  frame: 30, title: 30, name_fx: 30, entrance: 30, elimination: 30, victory_sting: 30, xp_boost: 7,
};

/** بادئة مفتاح العنصر لكل نوع — تُولَّد فريدة ولا تتعارض مع المبذور */
export const KEY_PREFIX_BY_KIND: Record<string, string> = {
  frame: 'frame_', title: 'title_', name_fx: 'namefx_', entrance: 'entrance_',
  elimination: 'elim_', victory_sting: 'sting_', xp_boost: 'boost_',
};

// ── أدوات القصّ (مطابقة لنظيرتها في الواجهة) ──────────

const HEX = /^#[0-9a-fA-F]{6}$/;
function hex(v: any, fallback: string): string { return typeof v === 'string' && HEX.test(v) ? v : fallback; }
function cssColor(v: any, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 && v.length < 80 ? v.trim() : fallback;
}
function num(v: any, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function bool(v: any, fallback = false): boolean { return typeof v === 'boolean' ? v : fallback; }
function pick<T extends string>(v: any, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? v as T : fallback;
}
function str(v: any, fallback: string, max = 40): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}
function obj(src: any, k: string): any {
  const v = src?.[k];
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

// ── كائن التأثيرات (الإطارات) ─────────────────────────

export const FX_DEFAULTS = {
  border: { enabled: false, color: '#f59e0b', width: 2, inset: 0, style: 'solid', gradientColors: ['#f59e0b', '#f59e0b'], travelSpeed: 3 },
  glow: { enabled: false, color: '#f59e0b', size: 12, opacity: 0.4, pulseEnabled: false, pulseDuration: 2.5 },
  shimmer: { enabled: false, color: '#ffffff', opacity: 0.1, duration: 4 },
  particles: { enabled: false, count: 4, color: '#f59e0b', size: 3, orbitRadius: '90px', baseDuration: 5, originX: 50, originY: 50, animationType: 'orbit' },
  corners: { enabled: false, color: '#f59e0b', size: 12, width: 2, pulseEnabled: false },
  frame: { enabled: false, type: 'none', color: '#f59e0b', opacity: 0.7, strokeWidth: 1.5, animate: true },
  gradientOverlay: { enabled: false, color: '#f59e0b', opacity: 0.1, direction: 'to top' },
  floating: { enabled: false, content: '', position: 'top', size: 18, animation: 'float', glowColor: '#f59e0b' },
  badge: { enabled: false, emoji: '', label: '', bgColor: 'rgba(0,0,0,0.6)', textColor: '#fcd34d', borderColor: 'rgba(245,158,11,0.4)' },
  nameEffect: { enabled: false, color: '#ffffff', glowColor: '#f59e0b', glowSize: 8 },
} as const;

export const FX_CHANNELS = Object.keys(FX_DEFAULTS);

/** يحوّل أي مُدخل إلى كائن تأثيرات كامل وآمن — لا يرمي أبداً */
export function normalizeFx(input: unknown): any {
  const src: any = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const d: any = FX_DEFAULTS;

  const b = obj(src, 'border');
  const gl = obj(src, 'glow');
  const sh = obj(src, 'shimmer');
  const pa = obj(src, 'particles');
  const co = obj(src, 'corners');
  const fr = obj(src, 'frame');
  const go = obj(src, 'gradientOverlay');
  const fl = obj(src, 'floating');
  const bd = obj(src, 'badge');
  const ne = obj(src, 'nameEffect');

  const borderEnabled = bool(b.enabled, d.border.enabled);
  const borderColor = hex(b.color, d.border.color);
  const grads = Array.isArray(b.gradientColors)
    ? b.gradientColors.filter((c: any) => typeof c === 'string' && HEX.test(c)).slice(0, 8)
    : [];

  return {
    border: {
      enabled: borderEnabled,
      color: borderColor,
      width: num(b.width, d.border.width, 0.5, 6),
      inset: num(b.inset, d.border.inset, -10, 10),
      style: pick(b.style, BORDER_STYLES, d.border.style as any),
      // نقطتان على الأقل: `linear-gradient` بلون واحد غير صالح فتسقط الخاصية
      // كلها ويختفي الإطار بلا أثر.
      gradientColors: grads.length >= 2 ? grads : [grads[0] || borderColor, grads[0] || borderColor],
      travelSpeed: num(b.travelSpeed, d.border.travelSpeed, 0.5, 30),
    },
    glow: {
      // التوهّج يُرسم داخل كتلة الإطار حصراً — تفعيله والإطار مطفأ وعدٌ لا يتحقّق
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
      count: Math.trunc(num(pa.count, d.particles.count, 0, 12)),
      color: hex(pa.color, d.particles.color),
      size: num(pa.size, d.particles.size, 1, 12),
      orbitRadius: typeof pa.orbitRadius === 'string' && /^\d{1,3}px$/.test(pa.orbitRadius) ? pa.orbitRadius : d.particles.orbitRadius,
      baseDuration: num(pa.baseDuration, d.particles.baseDuration, 0.5, 30),
      originX: num(pa.originX, d.particles.originX, 0, 100),
      originY: num(pa.originY, d.particles.originY, 0, 100),
      animationType: pick(pa.animationType, PARTICLE_ANIMS, d.particles.animationType as any),
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
      type: pick(fr.type, FRAME_SVG_TYPES, d.frame.type as any),
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
      position: pick(fl.position, ['top', 'bottom'] as const, d.floating.position as any),
      size: num(fl.size, d.floating.size, 6, 80),
      animation: pick(fl.animation, FLOAT_ANIMS, d.floating.animation as any),
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
    },
  };
}

/** هل في كائن التأثيرات قناة مفعّلة واحدة على الأقل؟ */
export function hasAnyEnabled(fx: any): boolean {
  return FX_CHANNELS.some(k => fx?.[k]?.enabled === true);
}

// ── التطبيع لكل نوع ───────────────────────────────────

export interface NormalizeResult {
  ok: boolean;
  /** الإعداد بعد التطبيع — جاهز للتخزين */
  config?: any;
  /** رفض صريح: الحقل والسبب (يُعاد للمؤلّف بدل تصحيح صامت مضلِّل) */
  field?: string;
  message?: string;
  /** حقول عُدِّلت تلقائياً — تُسجَّل في سجلّ الموظفين كي لا يكون التصحيح خفيّاً */
  coerced?: string[];
}

function coercionsOf(before: any, after: any, path = ''): string[] {
  const out: string[] = [];
  if (!before || typeof before !== 'object' || Array.isArray(before)) return out;
  for (const k of Object.keys(after || {})) {
    const b = before[k], a = after[k];
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      out.push(...coercionsOf(b, a, path ? `${path}.${k}` : k));
    } else if (b !== undefined && JSON.stringify(b) !== JSON.stringify(a)) {
      out.push(path ? `${path}.${k}` : k);
    }
  }
  return out;
}

/**
 * يطبّع إعداد أي نوع.
 *
 * ⚠️ الرفض الصريح مقصود حيث يكون التصحيح الصامت مضلِّلاً: نمط اللقب المجهول
 *    كان يُبدَّل بصمت إلى «ذهبي»، فيختار المؤلّف نمطاً جديداً ويحصل على
 *    الذهبي ويستنتج أن الميزة معطّلة. الآن يُقال له ما المشكلة.
 */
export function normalizeItemConfig(kind: string, raw: any): NormalizeResult {
  const cfg: any = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  switch (kind) {
    case 'frame': {
      const config = normalizeFx(cfg);
      if (!hasAnyEnabled(config)) {
        return { ok: false, field: 'config', message: 'فعّل قناة تأثير واحدة على الأقل — إطار بلا أي تأثير لا يُرى' };
      }
      return { ok: true, config, coerced: coercionsOf(cfg, config) };
    }

    case 'title': {
      const text = String(cfg.text ?? '').trim();
      if (!text) return { ok: false, field: 'config.text', message: 'نص اللقب مطلوب' };
      if (cfg.style !== undefined && !(TITLE_STYLES as readonly string[]).includes(cfg.style)) {
        return { ok: false, field: 'config.style', message: `نمط غير معروف — المتاح: ${TITLE_STYLES.join(' · ')}` };
      }
      return { ok: true, config: { text: text.slice(0, 40), style: cfg.style ?? 'gold' } };
    }

    case 'name_fx': {
      const ne = obj(cfg, 'nameEffect');
      return {
        ok: true,
        config: {
          nameEffect: {
            enabled: true,
            color: hex(ne.color, '#fcd34d'),
            glowColor: hex(ne.glowColor, '#f59e0b'),
            glowSize: num(ne.glowSize, 10, 0, 30),
          },
        },
        coerced: coercionsOf(ne, { color: hex(ne.color, '#fcd34d'), glowColor: hex(ne.glowColor, '#f59e0b') }),
      };
    }

    case 'entrance': {
      if (!(ENTRANCE_DESIGNS as readonly string[]).includes(cfg.design)) {
        return { ok: false, field: 'config.design', message: `اختر شكل الدخول — المتاح: ${ENTRANCE_DESIGNS.join(' · ')}` };
      }
      // المدّة صارت محترمة فعلاً بدل أن تُهمَل وتُثبَّت على ٣٫٥ ثانية
      return { ok: true, config: { design: cfg.design, durationMs: Math.trunc(num(cfg.durationMs, 3500, 1200, 6000)) } };
    }

    case 'elimination': {
      if (!(ELIMINATION_DESIGNS as readonly string[]).includes(cfg.design)) {
        return { ok: false, field: 'config.design', message: `نمط إقصاء غير معروف — المتاح: ${ELIMINATION_DESIGNS.join(' · ')}` };
      }
      return { ok: true, config: { design: cfg.design, showInRecap: bool(cfg.showInRecap, false) } };
    }

    case 'victory_sting': {
      const soundKey = String(cfg.soundKey ?? '').trim();
      if (!/^[a-z0-9_]{3,40}$/.test(soundKey)) {
        return { ok: false, field: 'config.soundKey', message: 'مفتاح صوت غير صالح (حروف إنجليزية صغيرة وأرقام وشرطة سفلية)' };
      }
      return { ok: true, config: { soundKey } };
    }

    case 'xp_boost': {
      const multiplier = num(cfg.multiplier, 2, 1, 3);
      return { ok: true, config: { multiplier, applies: 'xp_only' } };
    }

    default:
      return { ok: false, field: 'kind', message: 'نوع عنصر غير معروف' };
  }
}

/** التحقّق من الشعار مقابل السجلّ — معرّف مجهول لا يرسمه المُصيّر */
export function normalizeEmblemId(v: any): string | null {
  return (EMBLEM_IDS as readonly string[]).includes(v) ? v : null;
}

/** السجلّ الذي تبني منه لوحة الإدارة منتقياتها — مصدر واحد للطرفين */
export function designRegistry() {
  return {
    frameSvgTypes: FRAME_SVG_TYPES,
    emblems: EMBLEM_IDS,
    titleStyles: TITLE_STYLES,
    entranceDesigns: ENTRANCE_DESIGNS,
    eliminationDesigns: ELIMINATION_DESIGNS,
    borderStyles: BORDER_STYLES,
    particleAnims: PARTICLE_ANIMS,
    floatAnims: FLOAT_ANIMS,
    fxDefaults: FX_DEFAULTS,
    defaultDaysByKind: DEFAULT_DAYS_BY_KIND,
  };
}
