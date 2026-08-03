import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../models/card_fx.dart';
import '../../models/title_plaque.dart';
import 'card_fx_layer.dart' show FxClock;

// ══════════════════════════════════════════════════════
// 🏷️ لوحة اللقب — منقولة عن `components/TitlePlaque.tsx`
// ══════════════════════════════════════════════════════
// مساران منفصلان بالتصميم: الجاهز من ثوابت CSS، والمخصّص من بياناته.
// دمجهما يغيّر شكل ما اشتراه من اقتنى لقباً ذهبياً.

class TitlePlaqueView extends StatelessWidget {
  const TitlePlaqueView({
    super.key,
    required this.text,
    this.style,
    this.plaque,
    this.animate = true,
    this.scale = 1,
  });

  final String text;
  final String? style;
  final dynamic plaque;
  final bool animate;

  /// تكبيرٌ متناسب حين تُعرض اللوحة على بطاقةٍ مصغَّرة أو مكبَّرة.
  final double scale;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) return const SizedBox.shrink();
    return isCustomPlaque(style)
        ? _CustomPlaque(
            text: text,
            cfg: normalizeTitlePlaque(plaque),
            animate: animate,
            scale: scale)
        : _PresetPlaque(
            text: text, spec: presetPlaque(style), animate: animate, scale: scale);
  }
}

double _pp(double x) {
  final p = x % 1.0;
  final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
  return tri * tri * (3 - 2 * tri);
}

Widget _shell({
  required Widget child,
  required Color bg,
  required Color border,
  required double borderWidth,
  required double radius,
  required double padX,
  required double padY,
  required double blur,
  List<BoxShadow> shadows = const [],
}) {
  Widget box = Container(
    padding: EdgeInsets.symmetric(horizontal: padX, vertical: padY),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(radius),
      border: borderWidth > 0
          ? Border.all(color: border, width: borderWidth)
          : null,
      boxShadow: shadows.isEmpty ? null : shadows,
    ),
    child: child,
  );
  if (blur > 0) {
    box = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: blur / 2, sigmaY: blur / 2),
        child: box,
      ),
    );
  }
  return box;
}

// ══════════════════════════════════════════════════════
// الجاهز — gold · blood · ghost
// ══════════════════════════════════════════════════════
class _PresetPlaque extends StatelessWidget {
  const _PresetPlaque({
    required this.text,
    required this.spec,
    required this.animate,
    required this.scale,
  });

  final String text;
  final PresetPlaqueSpec spec;
  final bool animate;
  final double scale;

  @override
  Widget build(BuildContext context) {
    if (!animate || spec.anim == PresetPlaqueAnim.none) return _body(1, 0);
    return FxClock(
      builder: (_, t) {
        final e = _pp(t / spec.animSeconds);
        return spec.anim == PresetPlaqueAnim.fade
            // `chips-title-fade`: شفافية ١ ⇄ ٠٫٤٢
            ? _body(1 - 0.58 * e, 0)
            // `chips-title-pulse`: ظلٌّ من ٤px بـ٠٫٣ إلى ١٤px بـ٠٫٧٥
            : _body(1, e);
      },
    );
  }

  Widget _body(double opacity, double pulse) {
    final shadows = pulse > 0
        ? [
            BoxShadow(
              color: parseCssColor(spec.animColor)
                  .withValues(alpha: 0.3 + 0.45 * pulse),
              blurRadius: 4 + 10 * pulse,
            ),
          ]
        : const <BoxShadow>[];

    return Opacity(
      opacity: opacity,
      child: _shell(
        bg: parseCssColor(spec.bg),
        border: parseCssColor(spec.borderColor),
        borderWidth: 1 * scale,
        radius: kPlaqueBaseRadius * scale,
        padX: kPlaqueBasePadX * scale,
        padY: kPlaqueBasePadY * scale,
        blur: kPlaqueBaseBlur,
        shadows: shadows,
        child: Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontFamily: 'Tajawal',
            fontSize: kPlaqueBaseFontSize * scale,
            fontWeight: FontWeight.w900,
            height: kPlaqueBaseLineHeight,
            letterSpacing: 0,
            color: parseCssColor(spec.textColor),
            shadows: spec.textShadowColor == null
                ? null
                : [
                    Shadow(
                      color: parseCssColor(spec.textShadowColor!),
                      blurRadius: spec.textShadowSize * scale,
                    ),
                  ],
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// المخصّص — يُبنى من البيانات
// ══════════════════════════════════════════════════════
class _CustomPlaque extends StatelessWidget {
  const _CustomPlaque({
    required this.text,
    required this.cfg,
    required this.animate,
    required this.scale,
  });

  final String text;
  final TitlePlaqueConfig cfg;
  final bool animate;
  final double scale;

  @override
  Widget build(BuildContext context) {
    if (!animate || cfg.anim.type == PlaqueAnim.none) return _body(1, 1, 0, 0);
    return FxClock(
      builder: (_, t) {
        final e = _pp(t / cfg.anim.duration);
        final k = cfg.anim.intensity;
        return switch (cfg.anim.type) {
          // شفافية ١ ⇄ ١−٠٫٦×الشدّة
          PlaqueAnim.breathe => _body(1 - 0.6 * k * e, 1, 0, 0),
          // ظلٌّ من ٤px إلى ٦+١٦×الشدّة
          PlaqueAnim.pulse => _body(1, 1, 4 + (2 + 16 * k) * e, 0),
          // ارتفاع ٠ ⇄ −(٢+٣×الشدّة)
          PlaqueAnim.float => _body(1, 1, 0, -(2 + 3 * k) * e),
          // لمعةٌ تعبر: تُمرَّر كطورٍ للطبقة
          PlaqueAnim.shimmer => _body(1, 1, 0, 0, sweep: t / cfg.anim.duration),
          PlaqueAnim.none => _body(1, 1, 0, 0),
        };
      },
    );
  }

  Widget _body(double opacity, double _, double glowBlur, double dy,
      {double? sweep}) {
    final shadows = <BoxShadow>[];
    if (glowBlur > 0) {
      shadows.add(BoxShadow(
          color: parseCssColor(cfg.glow.color), blurRadius: glowBlur * scale));
    } else if (cfg.glow.enabled && cfg.glow.size > 0) {
      shadows.add(BoxShadow(
          color: parseCssColor(cfg.glow.color),
          blurRadius: cfg.glow.size * scale));
    }
    if (cfg.shadow.enabled && cfg.shadow.size > 0) {
      shadows.add(BoxShadow(
        color: parseCssColor(cfg.shadow.color),
        blurRadius: cfg.shadow.size * scale,
        offset: Offset(0, 2 * scale),
      ));
    }

    final bg = cfg.bg.isGradient ? null : parseCssColor(cfg.bg.color);
    final a = cfg.bg.angle * math.pi / 180;

    Widget content = Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontFamily: 'Tajawal',
        fontSize: cfg.text.size * scale,
        fontWeight: FontWeight.values[(cfg.text.weight ~/ 100) - 1],
        height: kPlaqueBaseLineHeight,
        letterSpacing: cfg.text.letterSpacing * scale,
        color: parseCssColor(cfg.text.color),
      ),
    );

    Widget box = Container(
      padding: EdgeInsets.symmetric(
          horizontal: cfg.layout.paddingX * scale,
          vertical: cfg.layout.paddingY * scale),
      decoration: BoxDecoration(
        color: bg,
        gradient: cfg.bg.isGradient
            ? LinearGradient(
                begin: Alignment(-math.cos(a), -math.sin(a)),
                end: Alignment(math.cos(a), math.sin(a)),
                colors: [
                  parseCssColor(cfg.bg.color),
                  parseCssColor(cfg.bg.color2),
                ],
              )
            : null,
        borderRadius: BorderRadius.circular(cfg.border.radius * scale),
        border: cfg.border.enabled && cfg.border.width > 0
            ? Border.all(
                color: parseCssColor(cfg.border.color),
                width: cfg.border.width * scale)
            : null,
        boxShadow: shadows.isEmpty ? null : shadows,
      ),
      child: content,
    );

    if (sweep != null) {
      // لمعةٌ تعبر فوق اللوحة بلا تغيير التخطيط — `::after` في المصدر
      box = ClipRRect(
        borderRadius: BorderRadius.circular(cfg.border.radius * scale),
        child: Stack(children: [
          box,
          Positioned.fill(
            child: FractionallySizedBox(
              alignment: Alignment(-1.2 + 2.4 * (sweep % 1.0), 0),
              widthFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [
                    Colors.transparent,
                    Colors.white
                        .withValues(alpha: 0.25 * cfg.anim.intensity),
                    Colors.transparent,
                  ]),
                ),
              ),
            ),
          ),
        ]),
      );
    }

    if (cfg.bg.blur > 0) {
      box = ClipRRect(
        borderRadius: BorderRadius.circular(cfg.border.radius * scale),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(
              sigmaX: cfg.bg.blur / 2, sigmaY: cfg.bg.blur / 2),
          child: box,
        ),
      );
    }

    return Opacity(
      opacity: opacity,
      child: Transform.translate(offset: Offset(0, dy * scale), child: box),
    );
  }
}
