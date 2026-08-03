import 'dart:ui' show Color;

// ══════════════════════════════════════════════════════
// 🎨 عقد تأثيرات البطاقة — منقول حرفياً عن `lib/chips-fx.ts`
// ══════════════════════════════════════════════════════
// 🔴 هذا الملفّ **مرآة** للعقد في الويب. كل قناة هنا يقابلها رسمٌ فعليّ في
//    `card_fx_layer.dart`؛ قناةٌ تُضاف بلا رسم وعدٌ كاذب لمؤلّف الكتالوج.
//
// 🔴 القصّ ليس تجميلاً: إعدادٌ مخزَّن بلونٍ فاسد أو رقمٍ خارج المدى كان
//    يُسقط بطاقات شاشة القاعة كلّها دفعةً واحدة. بعد `normalizeFx` يقرأ
//    الرسّام كل حقلٍ بلا حماية.

// ── أدوات القصّ (نفس دوال الويب) ──────────────────────

final _hexRe = RegExp(r'^#[0-9a-fA-F]{6}$');

bool isHex(dynamic v) => v is String && _hexRe.hasMatch(v);

/// لونٌ سداسيّ صالح فقط — وإلّا الافتراضيّ.
String hexOr(dynamic v, String fallback) => isHex(v) ? v as String : fallback;

/// لون CSS حرّ (يقبل `rgba(...)` للشارات واللوحات).
String cssColorOr(dynamic v, String fallback) =>
    (v is String && v.trim().isNotEmpty && v.length < 80) ? v.trim() : fallback;

double numOr(dynamic v, double fallback, double min, double max) {
  final n = v is num ? v.toDouble() : double.tryParse('$v');
  if (n == null || !n.isFinite) return fallback;
  return n < min ? min : (n > max ? max : n);
}

bool boolOr(dynamic v, [bool fallback = false]) => v is bool ? v : fallback;

T pickOr<T>(dynamic v, List<T> allowed, T fallback) =>
    allowed.contains(v) ? v as T : fallback;

String strOr(dynamic v, String fallback, [int max = 40]) =>
    v is String ? (v.length > max ? v.substring(0, max) : v) : fallback;

Map<String, dynamic> _group(Map src, String key) {
  final v = src[key];
  return (v is Map) ? Map<String, dynamic>.from(v) : <String, dynamic>{};
}

// ══════════════════════════════════════════════════════
// تحويل ألوان CSS → Color
// ══════════════════════════════════════════════════════

/// يقبل `#rrggbb` و`rgba(r,g,b,a)` و`rgb(r,g,b)`.
///
/// 🔴 ألوان الشارات واللوحات مخزَّنة `rgba(...)` في الكتالوج فعلاً، وقصرُ
///    المحلّل على السداسيّ يجعلها كلّها شفّافة.
Color parseCssColor(String s, [Color fallback = const Color(0xFFF59E0B)]) {
  final t = s.trim();
  if (_hexRe.hasMatch(t)) {
    return Color(0xFF000000 | int.parse(t.substring(1), radix: 16));
  }
  final m = RegExp(r'^rgba?\(([^)]+)\)$').firstMatch(t);
  if (m != null) {
    final parts = m.group(1)!.split(',').map((e) => e.trim()).toList();
    if (parts.length >= 3) {
      final r = int.tryParse(parts[0]) ?? 0;
      final g = int.tryParse(parts[1]) ?? 0;
      final b = int.tryParse(parts[2]) ?? 0;
      final a = parts.length > 3 ? (double.tryParse(parts[3]) ?? 1) : 1.0;
      return Color.fromRGBO(r, g, b, a.clamp(0.0, 1.0));
    }
  }
  return fallback;
}

/// `rgba(hex, alpha)` كما تبنيها دوالّ الويب.
Color withAlpha(String hexColor, double alpha) =>
    parseCssColor(hexColor).withValues(alpha: alpha.clamp(0.0, 1.0));

// ══════════════════════════════════════════════════════
// القنوات
// ══════════════════════════════════════════════════════

enum BorderStyleFx { solid, gradient, traveling }

enum FrameTypeFx { none, simple, greek, islamic, deco, royal }

enum ParticleAnim { orbit, burst }

enum FloatAnim { float, bounce, spin }

class FxBorder {
  const FxBorder({
    this.enabled = false,
    this.color = '#f59e0b',
    this.width = 2,
    this.inset = 0,
    this.style = BorderStyleFx.solid,
    this.gradientColors = const ['#f59e0b', '#f59e0b'],
    this.travelSpeed = 3,
  });

  final bool enabled;
  final String color;
  final double width, inset, travelSpeed;
  final BorderStyleFx style;
  final List<String> gradientColors;

  List<Color> get colors =>
      gradientColors.map((c) => parseCssColor(c)).toList(growable: false);
}

class FxGlow {
  const FxGlow({
    this.enabled = false,
    this.color = '#f59e0b',
    this.size = 12,
    this.opacity = 0.4,
    this.pulseEnabled = false,
    this.pulseDuration = 2.5,
  });

  final bool enabled;
  final String color;
  final double size, opacity, pulseDuration;
  final bool pulseEnabled;
}

class FxShimmer {
  const FxShimmer({
    this.enabled = false,
    this.color = '#ffffff',
    this.opacity = 0.1,
    this.duration = 4,
  });

  final bool enabled;
  final String color;
  final double opacity, duration;
}

class FxParticles {
  const FxParticles({
    this.enabled = false,
    this.count = 4,
    this.color = '#f59e0b',
    this.size = 3,
    this.orbitRadius = '90px',
    this.baseDuration = 5,
    this.originX = 50,
    this.originY = 50,
    this.animationType = ParticleAnim.orbit,
  });

  final bool enabled;
  final int count;
  final String color, orbitRadius;
  final double size, baseDuration, originX, originY;
  final ParticleAnim animationType;

  double get orbitPx =>
      double.tryParse(orbitRadius.replaceAll('px', '')) ?? 90;
}

class FxCorners {
  const FxCorners({
    this.enabled = false,
    this.color = '#f59e0b',
    this.size = 12,
    this.width = 2,
    this.pulseEnabled = false,
  });

  final bool enabled;
  final String color;
  final double size, width;
  final bool pulseEnabled;
}

class FxFrame {
  const FxFrame({
    this.enabled = false,
    this.type = FrameTypeFx.none,
    this.color = '#f59e0b',
    this.opacity = 0.7,
    this.strokeWidth = 1.5,
    this.animate = true,
  });

  final bool enabled;
  final FrameTypeFx type;
  final String color;
  final double opacity, strokeWidth;
  final bool animate;
}

class FxGradientOverlay {
  const FxGradientOverlay({
    this.enabled = false,
    this.color = '#f59e0b',
    this.opacity = 0.1,
    this.direction = 'to top',
  });

  final bool enabled;
  final String color, direction;
  final double opacity;
}

class FxFloating {
  const FxFloating({
    this.enabled = false,
    this.content = '',
    this.position = 'top',
    this.size = 18,
    this.animation = FloatAnim.float,
    this.glowColor = '#f59e0b',
    this.offsetX,
    this.offsetY,
    this.scale,
  });

  final bool enabled;
  final String content, position, glowColor;
  final double size;
  final FloatAnim animation;
  final double? offsetX, offsetY, scale;
}

class FxBadge {
  const FxBadge({
    this.enabled = false,
    this.emoji = '',
    this.label = '',
    this.bgColor = 'rgba(0,0,0,0.6)',
    this.textColor = '#fcd34d',
    this.borderColor = 'rgba(245,158,11,0.4)',
    this.offsetX,
    this.offsetY,
    this.scale,
  });

  final bool enabled;
  final String emoji, label, bgColor, textColor, borderColor;
  final double? offsetX, offsetY, scale;
}

class FxChannels {
  const FxChannels({
    this.border = const FxBorder(),
    this.glow = const FxGlow(),
    this.shimmer = const FxShimmer(),
    this.particles = const FxParticles(),
    this.corners = const FxCorners(),
    this.frame = const FxFrame(),
    this.gradientOverlay = const FxGradientOverlay(),
    this.floating = const FxFloating(),
    this.badge = const FxBadge(),
    this.nameEffect = const NameFx(),
  });

  final FxBorder border;
  final FxGlow glow;
  final FxShimmer shimmer;
  final FxParticles particles;
  final FxCorners corners;
  final FxFrame frame;
  final FxGradientOverlay gradientOverlay;
  final FxFloating floating;
  final FxBadge badge;
  final NameFx nameEffect;

  bool get anyEnabled =>
      border.enabled ||
      glow.enabled ||
      shimmer.enabled ||
      particles.enabled ||
      corners.enabled ||
      frame.enabled ||
      gradientOverlay.enabled ||
      floating.enabled ||
      badge.enabled ||
      nameEffect.enabled;

  /// قنوات **طبقة التأثيرات** وحدها: `nameEffect` يُطبَّق على عنصر الاسم،
  /// و`glow` يُرسم داخل كتلة الإطار ولا يُنشئ طبقةً بذاته.
  bool get hasLayerVisuals =>
      border.enabled ||
      shimmer.enabled ||
      particles.enabled ||
      corners.enabled ||
      frame.enabled ||
      gradientOverlay.enabled ||
      floating.enabled ||
      badge.enabled;

  FxChannels copyWith({FxFloating? floating}) => FxChannels(
        border: border,
        glow: glow,
        shimmer: shimmer,
        particles: particles,
        corners: corners,
        frame: frame,
        gradientOverlay: gradientOverlay,
        floating: floating ?? this.floating,
        badge: badge,
        nameEffect: nameEffect,
      );
}

// ══════════════════════════════════════════════════════
// تأثير الاسم — منقول عن `lib/name-fx.ts`
// ══════════════════════════════════════════════════════

enum NameFxStyle { glow, gradient, outline, engraved }

enum NameFxAnim { none, pulse, flicker, sweep, cycle }

enum NameFxEnter { none, fade, rise }

class NameFx {
  const NameFx({
    this.enabled = false,
    this.color = '#ffffff',
    this.glowColor = '#f59e0b',
    this.glowSize = 8,
    this.style = NameFxStyle.glow,
    this.color2 = '#f59e0b',
    this.angle = 90,
    this.outlineColor = '#000000',
    this.outlineWidth = 1,
    this.anim = NameFxAnim.none,
    this.animDuration = 2.5,
    this.enter = NameFxEnter.none,
  });

  final bool enabled;
  final String color, glowColor, color2, outlineColor;
  final double glowSize, angle, outlineWidth, animDuration;
  final NameFxStyle style;
  final NameFxAnim anim;
  final NameFxEnter enter;
}

const _nameFxStyles = {
  'glow': NameFxStyle.glow,
  'gradient': NameFxStyle.gradient,
  'outline': NameFxStyle.outline,
  'engraved': NameFxStyle.engraved,
};
const _nameFxAnims = {
  'none': NameFxAnim.none,
  'pulse': NameFxAnim.pulse,
  'flicker': NameFxAnim.flicker,
  'sweep': NameFxAnim.sweep,
  'cycle': NameFxAnim.cycle,
};
const _nameFxEnters = {
  'none': NameFxEnter.none,
  'fade': NameFxEnter.fade,
  'rise': NameFxEnter.rise,
};

NameFx normalizeNameFx(dynamic raw) {
  final n = (raw is Map) ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
  return NameFx(
    enabled: boolOr(n['enabled']),
    color: hexOr(n['color'], '#ffffff'),
    glowColor: hexOr(n['glowColor'], '#f59e0b'),
    glowSize: numOr(n['glowSize'], 8, 0, 30),
    style: _nameFxStyles[n['style']] ?? NameFxStyle.glow,
    color2: hexOr(n['color2'], '#f59e0b'),
    angle: numOr(n['angle'], 90, 0, 360).roundToDouble(),
    outlineColor: hexOr(n['outlineColor'], '#000000'),
    // فوق ٢ يبتلع الحدُّ الخطَّ العربيّ عند حجم البطاقة الصغير
    outlineWidth: numOr(n['outlineWidth'], 1, 0, 2),
    anim: _nameFxAnims[n['anim']] ?? NameFxAnim.none,
    animDuration: numOr(n['animDuration'], 2.5, 0.4, 20),
    enter: _nameFxEnters[n['enter']] ?? NameFxEnter.none,
  );
}

// ══════════════════════════════════════════════════════
// التطبيع
// ══════════════════════════════════════════════════════

const _borderStyles = {
  'solid': BorderStyleFx.solid,
  'gradient': BorderStyleFx.gradient,
  'traveling': BorderStyleFx.traveling,
};
const _frameTypes = {
  'none': FrameTypeFx.none,
  'simple': FrameTypeFx.simple,
  'greek': FrameTypeFx.greek,
  'islamic': FrameTypeFx.islamic,
  'deco': FrameTypeFx.deco,
  'royal': FrameTypeFx.royal,
};

/// يحوّل أيّ مُدخل — ناقصاً أو مشوَّهاً أو `null` — إلى قنوات كاملة آمنة.
FxChannels normalizeFx(dynamic input) {
  final src = (input is Map) ? Map<String, dynamic>.from(input) : <String, dynamic>{};

  final b = _group(src, 'border');
  final gl = _group(src, 'glow');
  final sh = _group(src, 'shimmer');
  final pa = _group(src, 'particles');
  final co = _group(src, 'corners');
  final fr = _group(src, 'frame');
  final go = _group(src, 'gradientOverlay');
  final fl = _group(src, 'floating');
  final bd = _group(src, 'badge');

  final borderEnabled = boolOr(b['enabled']);

  final raw = (b['gradientColors'] is List)
      ? (b['gradientColors'] as List).where(isHex).cast<String>().take(8).toList()
      : <String>[];
  // 🔴 لا يقلّ عن لونين: تدرّجٌ بلونٍ واحد **غير صالح** في CSS فتسقط
  //    الخاصية كاملةً ويختفي الإطار المدفوع بلا أثر. نكرّر الواحد.
  final fallbackColor = hexOr(b['color'], '#f59e0b');
  final gradientColors = raw.length >= 2
      ? raw
      : [raw.isEmpty ? fallbackColor : raw[0], raw.isEmpty ? fallbackColor : raw[0]];

  return FxChannels(
    border: FxBorder(
      enabled: borderEnabled,
      color: fallbackColor,
      width: numOr(b['width'], 2, 0.5, 6),
      inset: numOr(b['inset'], 0, -10, 10),
      style: _borderStyles[b['style']] ?? BorderStyleFx.solid,
      gradientColors: gradientColors,
      travelSpeed: numOr(b['travelSpeed'], 3, 0.5, 30),
    ),
    glow: FxGlow(
      // 🔴 التوهّج يُرسم داخل كتلة الإطار حصراً — تفعيله والإطار مطفأ وعدٌ
      //    لا يتحقّق. يُطفأ صراحةً كي لا يكذب المحرّر على مؤلّف الكتالوج.
      enabled: borderEnabled && boolOr(gl['enabled']),
      color: hexOr(gl['color'], '#f59e0b'),
      size: numOr(gl['size'], 12, 0, 60),
      opacity: numOr(gl['opacity'], 0.4, 0, 1),
      pulseEnabled: boolOr(gl['pulseEnabled']),
      pulseDuration: numOr(gl['pulseDuration'], 2.5, 0.4, 20),
    ),
    shimmer: FxShimmer(
      enabled: boolOr(sh['enabled']),
      color: hexOr(sh['color'], '#ffffff'),
      opacity: numOr(sh['opacity'], 0.1, 0, 1),
      duration: numOr(sh['duration'], 4, 0.5, 30),
    ),
    particles: FxParticles(
      enabled: boolOr(pa['enabled']),
      // سقفٌ صارم: عنصرٌ لكل جزيئة، وعددٌ غير محدود يُجمّد الشاشة
      count: numOr(pa['count'], 4, 0, 12).truncate(),
      color: hexOr(pa['color'], '#f59e0b'),
      size: numOr(pa['size'], 3, 1, 12),
      orbitRadius: (pa['orbitRadius'] is String &&
              RegExp(r'^\d{1,3}px$').hasMatch(pa['orbitRadius'] as String))
          ? pa['orbitRadius'] as String
          : '90px',
      baseDuration: numOr(pa['baseDuration'], 5, 0.5, 30),
      originX: numOr(pa['originX'], 50, 0, 100),
      originY: numOr(pa['originY'], 50, 0, 100),
      animationType: pa['animationType'] == 'burst'
          ? ParticleAnim.burst
          : ParticleAnim.orbit,
    ),
    corners: FxCorners(
      enabled: boolOr(co['enabled']),
      color: hexOr(co['color'], '#f59e0b'),
      size: numOr(co['size'], 12, 4, 40),
      width: numOr(co['width'], 2, 1, 6),
      pulseEnabled: boolOr(co['pulseEnabled']),
    ),
    frame: FxFrame(
      enabled: boolOr(fr['enabled']),
      type: _frameTypes[fr['type']] ?? FrameTypeFx.none,
      color: hexOr(fr['color'], '#f59e0b'),
      opacity: numOr(fr['opacity'], 0.7, 0, 1),
      strokeWidth: numOr(fr['strokeWidth'], 1.5, 0.5, 6),
      animate: boolOr(fr['animate'], true),
    ),
    gradientOverlay: FxGradientOverlay(
      enabled: boolOr(go['enabled']),
      color: hexOr(go['color'], '#f59e0b'),
      opacity: numOr(go['opacity'], 0.1, 0, 1),
      direction: strOr(go['direction'], 'to top', 30),
    ),
    floating: FxFloating(
      enabled: boolOr(fl['enabled']),
      content: strOr(fl['content'], '', 8),
      position: pickOr(fl['position'], const ['top', 'bottom'], 'top'),
      size: numOr(fl['size'], 18, 6, 80),
      animation: fl['animation'] == 'bounce'
          ? FloatAnim.bounce
          : (fl['animation'] == 'spin' ? FloatAnim.spin : FloatAnim.float),
      glowColor: hexOr(fl['glowColor'], '#f59e0b'),
      offsetX: fl['offsetX'] == null ? null : numOr(fl['offsetX'], 0, -200, 200),
      offsetY: fl['offsetY'] == null ? null : numOr(fl['offsetY'], 0, -200, 200),
      scale: fl['scale'] == null ? null : numOr(fl['scale'], 1, 0.3, 4),
    ),
    badge: FxBadge(
      enabled: boolOr(bd['enabled']),
      emoji: strOr(bd['emoji'], '', 8),
      label: strOr(bd['label'], '', 24),
      bgColor: cssColorOr(bd['bgColor'], 'rgba(0,0,0,0.6)'),
      textColor: cssColorOr(bd['textColor'], '#fcd34d'),
      borderColor: cssColorOr(bd['borderColor'], 'rgba(245,158,11,0.4)'),
      offsetX: bd['offsetX'] == null ? null : numOr(bd['offsetX'], 0, -200, 200),
      offsetY: bd['offsetY'] == null ? null : numOr(bd['offsetY'], 0, -200, 200),
      scale: bd['scale'] == null ? null : numOr(bd['scale'], 1, 0.3, 4),
    ),
    nameEffect: normalizeNameFx(src['nameEffect']),
  );
}

/// 🪙 دمجٌ طبقيّ: المشترى يعلو، والمكتسَب بالرتبة يبقى — قرار المالك (١٥).
///
/// 🔴 كان الإطار المدفوع **يستبدل** تأثيرات الرتبة كلّياً، فإطارٌ بعشرين
///    تشبس يمحو حدود GODFATHER وشارته — أي أن الشراء يعاقب اللاعب الرفيع.
///    القاعدة: أيّ قناة يُفعّلها المشترى تفوز بكاملها، وما لا يمسّه يبقى.
FxChannels mergeFx(dynamic rankFx, dynamic paidFx) {
  final base = normalizeFx(rankFx);
  final paid = normalizeFx(paidFx);
  return FxChannels(
    border: paid.border.enabled ? paid.border : base.border,
    glow: paid.glow.enabled ? paid.glow : base.glow,
    shimmer: paid.shimmer.enabled ? paid.shimmer : base.shimmer,
    particles: paid.particles.enabled ? paid.particles : base.particles,
    corners: paid.corners.enabled ? paid.corners : base.corners,
    frame: paid.frame.enabled ? paid.frame : base.frame,
    gradientOverlay:
        paid.gradientOverlay.enabled ? paid.gradientOverlay : base.gradientOverlay,
    floating: paid.floating.enabled ? paid.floating : base.floating,
    badge: paid.badge.enabled ? paid.badge : base.badge,
    nameEffect: paid.nameEffect.enabled ? paid.nameEffect : base.nameEffect,
  );
}
