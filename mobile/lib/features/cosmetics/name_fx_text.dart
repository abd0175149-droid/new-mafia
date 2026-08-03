import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../models/card_fx.dart';
import 'card_fx_layer.dart' show FxClock;

// ══════════════════════════════════════════════════════
// 🔤 اسمٌ بتأثيره — منقول عن `lib/name-fx.ts`
// ══════════════════════════════════════════════════════
// 📐 قاعدة المنتج الحاكمة: «يُقرأ من ثلاثة أمتار». كل تأثير يحافظ على
//    تباين الحروف؛ ما يُذيب الحدّ مقصوصٌ في العقد قبل أن يصل هنا.
//
// 🔒 `glow` هو المسار القديم حرفياً: نفس اللون ونفس ظلّين — قريبٍ كثيف
//    وبعيدٍ خفيف. من اشترى تأثيراً يراه كما رآه أمس.

class NameFxText extends StatelessWidget {
  const NameFxText({
    super.key,
    required this.text,
    required this.fx,
    required this.baseStyle,
    this.animate = true,
    this.textAlign,
  });

  final String text;
  final NameFx fx;
  final TextStyle baseStyle;
  final bool animate;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    if (!fx.enabled) return Text(text, style: baseStyle, textAlign: textAlign);
    if (!animate || fx.anim == NameFxAnim.none) return _paint(1, 0);
    return FxClock(
      builder: (_, t) {
        final p = ((t / fx.animDuration) % 1.0);
        return _paint(_amp(p), p);
      },
    );
  }

  /// شدّة النبض/الرفّة لكل حركة.
  double _amp(double p) => switch (fx.anim) {
        // نبضة ناعمة
        NameFxAnim.pulse => 0.55 + 0.45 * _pp(p),
        // رفّة نيون: قفزاتٌ حادّة لا تدرّج
        NameFxAnim.flicker =>
          (p < 0.44 || (p >= 0.46 && p < 0.48)) ? 1.0 : 0.4,
        _ => 1.0,
      };

  Widget _paint(double amp, double p) {
    final glow = _glowShadows(amp);

    switch (fx.style) {
      case NameFxStyle.gradient:
        // 🔴 الحروف تصير شفّافة والتدرّج يُقصّ عليها، فظلّ النصّ لا يُرسم
        //    إطلاقاً — التوهّج هنا مرشّحٌ لا ظلّ.
        final colors = [parseCssColor(fx.color), parseCssColor(fx.color2)];
        final a = fx.angle * math.pi / 180;
        // اللمعة تحتاج خلفيةً أعرض من النصّ كي تمرّ فوقه
        final sweeping = fx.anim == NameFxAnim.sweep;
        final shift = sweeping ? (p * 2.5 - 1.25) : 0.0;
        final begin = Alignment(math.cos(a) * -1 + shift, math.sin(a) * -1);
        final end = Alignment(math.cos(a) + shift, math.sin(a));

        Widget child = ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (r) => LinearGradient(
            begin: begin,
            end: end,
            colors: sweeping
                ? [colors[0], colors[1], colors[0]]
                : colors,
            tileMode: TileMode.mirror,
          ).createShader(r),
          child: Text(text,
              style: baseStyle.copyWith(color: Colors.white),
              textAlign: textAlign),
        );
        if (fx.glowSize > 0) {
          // `drop-shadow` على نصٍّ متدرّج: نسخةٌ مموّهة ملوّنة خلفه
          final blur = math.min(12.0, fx.glowSize);
          child = Stack(children: [
            ImageFiltered(
              imageFilter:
                  ui.ImageFilter.blur(sigmaX: blur / 2, sigmaY: blur / 2),
              child: Text(text,
                  textAlign: textAlign,
                  style: baseStyle.copyWith(
                      color: withAlpha(fx.glowColor, 0.5 * amp))),
            ),
            child,
          ]);
        }
        return _cycled(child, p);

      case NameFxStyle.outline:
        return _cycled(
          Stack(children: [
            // الحدّ خلف الحشو — `paint-order: stroke fill`
            Text(text,
                textAlign: textAlign,
                style: baseStyle.copyWith(
                  foreground: Paint()
                    ..style = PaintingStyle.stroke
                    ..strokeWidth = fx.outlineWidth * 2
                    ..color = parseCssColor(fx.outlineColor),
                  shadows: fx.glowSize > 0 ? glow : null,
                )),
            Text(text,
                textAlign: textAlign,
                style: baseStyle.copyWith(color: parseCssColor(fx.color))),
          ]),
          p,
        );

      case NameFxStyle.engraved:
        // نقش: ضوءٌ من فوق وظلٌّ من تحت — تقرأه العين حفراً في المعدن
        return _cycled(
          Text(text,
              textAlign: textAlign,
              style: baseStyle.copyWith(
                color: parseCssColor(fx.color),
                shadows: [
                  Shadow(
                      color: withAlpha(fx.glowColor, 0.55 * amp),
                      offset: const Offset(0, 1)),
                  const Shadow(
                      color: Color(0xA6000000),
                      offset: Offset(0, -1),
                      blurRadius: 1),
                  if (fx.glowSize > 0)
                    Shadow(
                        color: withAlpha(fx.glowColor, 0.3 * amp),
                        blurRadius: fx.glowSize),
                ],
              )),
          p,
        );

      case NameFxStyle.glow:
        return _cycled(
          Text(text,
              textAlign: textAlign,
              style: baseStyle.copyWith(
                  color: parseCssColor(fx.color), shadows: glow)),
          p,
        );
    }
  }

  /// ظلّان: قريبٌ كثيف وبعيدٌ خفيف — السلسلة نفسها التي كانت تُرسم.
  List<Shadow> _glowShadows(double amp) => [
        Shadow(
            color: withAlpha(fx.glowColor, 0.45 * amp), blurRadius: fx.glowSize),
        Shadow(
            color: withAlpha(fx.glowColor, 0.18 * amp),
            blurRadius: fx.glowSize * 2.5),
      ];

  /// `cycle`: اللون يتنقّل بين اللونين — يُطبَّق فوق أيّ نمط.
  Widget _cycled(Widget child, double p) {
    if (fx.anim != NameFxAnim.cycle) return child;
    final e = _pp(p);
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (r) => LinearGradient(colors: [
        Color.lerp(parseCssColor(fx.color), parseCssColor(fx.color2), e)!,
        Color.lerp(parseCssColor(fx.color), parseCssColor(fx.color2), e)!,
      ]).createShader(r),
      child: child,
    );
  }

  static double _pp(double x) {
    final p = x % 1.0;
    final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
    return tri * tri * (3 - 2 * tri);
  }
}
