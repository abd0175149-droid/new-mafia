import 'card_fx.dart';

// ══════════════════════════════════════════════════════
// 🏷️ لوحة اللقب — منقولة عن `components/TitlePlaque.tsx`
// ══════════════════════════════════════════════════════
// 🔒 قاعدة الملفّ: النمط المعروف (gold · blood · ghost) يُرسم من **ثوابته**
//    لا من هذا الكائن — من اشترى لقباً ذهبياً يراه كما رآه أمس. و`custom`
//    وحده يُبنى من البيانات.

enum PlaqueAnim { none, pulse, breathe, shimmer, float }

const _plaqueAnims = {
  'none': PlaqueAnim.none,
  'pulse': PlaqueAnim.pulse,
  'breathe': PlaqueAnim.breathe,
  'shimmer': PlaqueAnim.shimmer,
  'float': PlaqueAnim.float,
};

const _borderStyles = ['solid', 'dashed', 'dotted', 'double'];
const _weights = [400, 600, 700, 800, 900];

class PlaqueBg {
  const PlaqueBg({
    this.type = 'solid',
    this.color = 'rgba(69,26,3,0.8)',
    this.color2 = 'rgba(120,53,15,0.8)',
    this.angle = 135,
    this.blur = 4,
  });
  final String type, color, color2;
  final double angle, blur;
  bool get isGradient => type == 'gradient';
}

class PlaqueText {
  const PlaqueText({
    this.color = '#fcd34d',
    this.size = 10,
    this.weight = 900,
    this.letterSpacing = 0,
  });
  final String color;
  final double size, letterSpacing;
  final int weight;
}

class PlaqueBorder {
  const PlaqueBorder({
    this.enabled = true,
    this.color = 'rgba(245,158,11,0.6)',
    this.width = 1,
    this.style = 'solid',
    this.radius = 7,
  });
  final bool enabled;
  final String color, style;
  final double width, radius;
}

class PlaqueGlow {
  const PlaqueGlow({
    this.enabled = true,
    this.color = 'rgba(245,158,11,0.5)',
    this.size = 8,
  });
  final bool enabled;
  final String color;
  final double size;
}

class PlaqueShadow {
  const PlaqueShadow({
    this.enabled = false,
    this.color = 'rgba(0,0,0,0.4)',
    this.size = 4,
  });
  final bool enabled;
  final String color;
  final double size;
}

class PlaqueAnimCfg {
  const PlaqueAnimCfg({
    this.type = PlaqueAnim.none,
    this.duration = 2,
    this.intensity = 0.5,
  });
  final PlaqueAnim type;
  final double duration, intensity;
}

class PlaqueLayout {
  const PlaqueLayout({
    this.paddingX = 8,
    this.paddingY = 1,
    this.marginTop = 3,
    this.maxWidth = 92,
  });
  final double paddingX, paddingY, marginTop, maxWidth;
}

class TitlePlaqueConfig {
  const TitlePlaqueConfig({
    this.bg = const PlaqueBg(),
    this.text = const PlaqueText(),
    this.border = const PlaqueBorder(),
    this.glow = const PlaqueGlow(),
    this.shadow = const PlaqueShadow(),
    this.anim = const PlaqueAnimCfg(),
    this.layout = const PlaqueLayout(),
  });

  final PlaqueBg bg;
  final PlaqueText text;
  final PlaqueBorder border;
  final PlaqueGlow glow;
  final PlaqueShadow shadow;
  final PlaqueAnimCfg anim;
  final PlaqueLayout layout;
}

/// مرآة `normalizeTitlePlaque` في الخادم: ذاك يمنع تخزين الفاسد، وهذا يحمي
/// الرسم من صفوفٍ خُزِّنت قبل وجوده.
TitlePlaqueConfig normalizeTitlePlaque(dynamic raw) {
  final p = (raw is Map) ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
  Map<String, dynamic> g(String k) =>
      (p[k] is Map) ? Map<String, dynamic>.from(p[k] as Map) : <String, dynamic>{};

  final bg = g('bg'), text = g('text'), border = g('border');
  final glow = g('glow'), shadow = g('shadow'), anim = g('anim'), layout = g('layout');

  return TitlePlaqueConfig(
    bg: PlaqueBg(
      type: pickOr(bg['type'], const ['solid', 'gradient'], 'solid'),
      color: cssColorOr(bg['color'], 'rgba(69,26,3,0.8)'),
      color2: cssColorOr(bg['color2'], 'rgba(120,53,15,0.8)'),
      angle: numOr(bg['angle'], 135, 0, 360).roundToDouble(),
      blur: numOr(bg['blur'], 4, 0, 12),
    ),
    text: PlaqueText(
      color: cssColorOr(text['color'], '#fcd34d'),
      size: numOr(text['size'], 10, 8, 20),
      weight: pickOr((text['weight'] as num?)?.toInt(), _weights, 900),
      letterSpacing: numOr(text['letterSpacing'], 0, -0.5, 4),
    ),
    border: PlaqueBorder(
      enabled: boolOr(border['enabled'], true),
      color: cssColorOr(border['color'], 'rgba(245,158,11,0.6)'),
      width: numOr(border['width'], 1, 0, 4),
      style: pickOr(border['style'], _borderStyles, 'solid'),
      radius: numOr(border['radius'], 7, 0, 20),
    ),
    glow: PlaqueGlow(
      enabled: boolOr(glow['enabled'], true),
      color: cssColorOr(glow['color'], 'rgba(245,158,11,0.5)'),
      size: numOr(glow['size'], 8, 0, 24),
    ),
    shadow: PlaqueShadow(
      enabled: boolOr(shadow['enabled']),
      color: cssColorOr(shadow['color'], 'rgba(0,0,0,0.4)'),
      size: numOr(shadow['size'], 4, 0, 30),
    ),
    anim: PlaqueAnimCfg(
      type: _plaqueAnims[anim['type']] ?? PlaqueAnim.none,
      duration: numOr(anim['duration'], 2, 0.4, 20),
      intensity: numOr(anim['intensity'], 0.5, 0, 1),
    ),
    layout: PlaqueLayout(
      paddingX: numOr(layout['paddingX'], 8, 0, 24),
      paddingY: numOr(layout['paddingY'], 1, 0, 12),
      marginTop: numOr(layout['marginTop'], 3, 0, 16),
      maxWidth: numOr(layout['maxWidth'], 92, 40, 100),
    ),
  );
}

// ══════════════════════════════════════════════════════
// الأنماط الثلاثة الجاهزة
// ══════════════════════════════════════════════════════
// 🔴 **ليست حالاتٍ من `TitlePlaqueConfig`**: توهّج الذهبيّ ظلُّ **نصّ**
//    (`text-shadow`) بينما توهّج المخصّص ظلُّ **صندوق**، وحركتا الدمويّ
//    والشبحيّ (`chips-title-pulse` و`chips-title-fade`) لا مقابل لهما في
//    قنوات المخصّص. حشرُها في الكائن نفسه يجعل من اشترى لقباً ذهبياً يراه
//    مختلفاً — وهو ما تمنعه قاعدة الملفّ. فلها تمثيلها الخاصّ.

/// حركة النمط الجاهز — ثابتة المدّة والألوان كما في CSS.
enum PresetPlaqueAnim {
  none,

  /// `chips-title-pulse 1.6s`: ظلّ صندوق من ٤px بـ٠٫٣ إلى ١٤px بـ٠٫٧٥
  pulseBox,

  /// `chips-title-fade 3s`: شفافية ١ ⇄ ٠٫٤٢
  fade,
}

class PresetPlaqueSpec {
  const PresetPlaqueSpec({
    required this.bg,
    required this.textColor,
    required this.borderColor,
    this.textShadowColor,
    this.textShadowSize = 0,
    this.anim = PresetPlaqueAnim.none,
    this.animColor = 'rgba(220,38,38,1)',
    this.animSeconds = 1.6,
  });

  final String bg, textColor, borderColor;
  final String? textShadowColor;
  final double textShadowSize;
  final PresetPlaqueAnim anim;
  final String animColor;
  final double animSeconds;
}

/// مقاسات `.chips-title-plaque` الأساسية — مشتركة بين الجاهز والمخصّص.
const kPlaqueBaseFontSize = 10.0;
const kPlaqueBasePadX = 8.0;
const kPlaqueBasePadY = 1.0;
const kPlaqueBaseRadius = 7.0;
const kPlaqueBaseMarginTop = 3.0;
const kPlaqueBaseLineHeight = 1.4;
const kPlaqueBaseMaxWidthPct = 92.0;
const kPlaqueBaseBlur = 4.0;

const kPresetPlaques = <String, PresetPlaqueSpec>{
  'gold': PresetPlaqueSpec(
    bg: 'rgba(69,26,3,0.8)',
    textColor: '#fcd34d',
    borderColor: 'rgba(245,158,11,0.6)',
    textShadowColor: 'rgba(245,158,11,0.5)',
    textShadowSize: 8,
  ),
  'blood': PresetPlaqueSpec(
    bg: 'rgba(69,10,10,0.8)',
    textColor: '#fca5a5',
    borderColor: 'rgba(220,38,38,0.6)',
    anim: PresetPlaqueAnim.pulseBox,
    animColor: 'rgba(220,38,38,1)',
    animSeconds: 1.6,
  ),
  'ghost': PresetPlaqueSpec(
    bg: 'rgba(24,24,27,0.7)',
    textColor: '#d4d4d8',
    borderColor: 'rgba(161,161,170,0.5)',
    anim: PresetPlaqueAnim.fade,
    animSeconds: 3,
  ),
};

bool isCustomPlaque(String? style) => style == 'custom';

PresetPlaqueSpec presetPlaque(String? style) =>
    kPresetPlaques[style] ?? kPresetPlaques['gold']!;
