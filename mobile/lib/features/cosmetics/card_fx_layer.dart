import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../models/card_fx.dart';
import 'rank_frames.dart';

// ══════════════════════════════════════════════════════
// ✨ طبقة تأثيرات البطاقة — منقولة عن طبقة `DynamicMafiaCard`
// ══════════════════════════════════════════════════════
// ترتيب الطبقات بأرقام `zIndex` في المصدر:
//   49 تدرّج · 50 الحدّ · 51 الزوايا والإطار · 52 اللمعة · 53 الجزيئات
//   55 الشارة والعائم
//
// 🔴 كل الحركات تُشتقّ من ساعةٍ واحدة: `AnimationController` واحد يدور
//    بلا نهاية، وكل عنصر يحسب طوره من مدّته وتأخيره. مؤقّتٌ لكل عنصر على
//    شبكةٍ فيها عشرون بطاقة يعني عشرات المؤقّتات في إطارٍ واحد.

/// نصف قطر البطاقة — `rounded-2xl` أي `1rem`.
const kCardRadius = 16.0;

/// ساعةٌ واحدة تُغذّي كل التأثيرات.
class FxClock extends StatefulWidget {
  const FxClock({super.key, required this.builder, this.enabled = true});

  final Widget Function(BuildContext, double seconds) builder;
  final bool enabled;

  @override
  State<FxClock> createState() => _FxClockState();
}

class _FxClockState extends State<FxClock> with SingleTickerProviderStateMixin {
  // دورة طويلة: كل المدد المسموحة (≤٣٠ث) تقسمها بلا قفزةٍ عند الالتفاف
  static const _period = Duration(seconds: 120);
  late final AnimationController _c =
      AnimationController(vsync: this, duration: _period);

  @override
  void initState() {
    super.initState();
    if (widget.enabled) _c.repeat();
  }

  @override
  void didUpdateWidget(FxClock old) {
    super.didUpdateWidget(old);
    if (widget.enabled && !_c.isAnimating) {
      _c.repeat();
    } else if (!widget.enabled && _c.isAnimating) {
      _c.stop();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (ctx, _) =>
            widget.builder(ctx, _c.value * _period.inSeconds.toDouble()),
      );
}

/// طورٌ من ٠ إلى ١ لمدّةٍ وتأخير.
double _phase(double time, double duration, [double delay = 0]) {
  if (duration <= 0) return 0;
  final p = ((time - delay) / duration) % 1.0;
  return p < 0 ? p + 1 : p;
}

/// مثلّثٌ ناعم ٠→١→٠ بمنحنى `ease-in-out` — أساس كل نبضة.
double _pingPong(double p) {
  final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
  return tri * tri * (3 - 2 * tri);
}

// ══════════════════════════════════════════════════════
// الطبقة
// ══════════════════════════════════════════════════════

class CardFxLayer extends StatelessWidget {
  const CardFxLayer({
    super.key,
    required this.fx,
    this.radius = kCardRadius,
    this.animate = true,
  });

  final FxChannels fx;
  final double radius;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    if (!fx.hasLayerVisuals) return const SizedBox.shrink();
    return IgnorePointer(
      child: FxClock(
        enabled: animate,
        builder: (_, t) => Stack(
          clipBehavior: Clip.none,
          children: [
            if (fx.gradientOverlay.enabled) _gradientOverlay(),
            if (fx.border.enabled) _border(t),
            if (fx.corners.enabled) ..._corners(t),
            if (fx.frame.enabled && fx.frame.type != FrameTypeFx.none)
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(radius),
                  child: CustomPaint(
                    painter: RankFramePainter(
                      type: fx.frame.type,
                      color: fx.frame.color,
                      opacity: fx.frame.opacity,
                      strokeWidth: fx.frame.strokeWidth,
                      animate: fx.frame.animate && animate,
                      time: t,
                    ),
                  ),
                ),
              ),
            if (fx.shimmer.enabled) _shimmer(t),
            if (fx.particles.enabled) ..._particles(t),
            if (fx.badge.enabled) _badge(),
            if (fx.floating.enabled) _floating(t),
          ],
        ),
      ),
    );
  }

  // ── تدرّج فوق البطاقة (z 49) ──
  Widget _gradientOverlay() {
    final g = fx.gradientOverlay;
    // اتجاهات CSS المستعملة في الكتالوج
    final (begin, end) = switch (g.direction) {
      'to bottom' => (Alignment.topCenter, Alignment.bottomCenter),
      'to left' => (Alignment.centerRight, Alignment.centerLeft),
      'to right' => (Alignment.centerLeft, Alignment.centerRight),
      _ => (Alignment.bottomCenter, Alignment.topCenter), // 'to top'
    };
    return Positioned.fill(
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          gradient: LinearGradient(
            begin: begin,
            end: end,
            colors: [withAlpha(g.color, g.opacity), Colors.transparent],
            // `transparent 50%` — الشفافية تكتمل عند المنتصف
            stops: const [0, 0.5],
          ),
        ),
      ),
    );
  }

  // ── الحدّ (z 50) ──
  Widget _border(double t) {
    final b = fx.border;
    final gl = fx.glow;

    // نبضة التوهّج `rank-pulse`: من التوهّج العاديّ إلى القويّ (١٫٦× حجماً
    // و١٫٥× شفافيةً بسقف ١)
    var glowSize = gl.size;
    var glowOpacity = gl.opacity;
    if (gl.enabled && gl.pulseEnabled && animate) {
      final e = _pingPong(_phase(t, gl.pulseDuration));
      glowSize = gl.size + (gl.size * 1.6 - gl.size) * e;
      glowOpacity = gl.opacity +
          (math.min(1.0, gl.opacity * 1.5) - gl.opacity) * e;
    }
    // 🔴 التوهّج **خارجيّ فقط**. `box-shadow` في CSS يُقصّ ما تحت العنصر،
    //    أمّا `BoxShadow` في Flutter فيرسم شكلاً مموّهاً كاملاً لا يُقصّ —
    //    وطبقة الحدّ بلا حشوٍ يغطّيه، فيسيل ٢٦px كهرمانيّة بشفافية ٠٫٥٥
    //    على البطاقة كلّها. تلك كانت «الطبقة الكاملة بلون».
    final glowLayer = gl.enabled
        ? Positioned(
            left: b.inset,
            top: b.inset,
            right: b.inset,
            bottom: b.inset,
            child: CustomPaint(
              painter: _OuterGlowPainter(
                color: withAlpha(gl.color, glowOpacity),
                blur: glowSize,
                radius: radius,
              ),
            ),
          )
        : null;

    final inset = b.inset;

    if (b.style == BorderStyleFx.solid) {
      return Stack(children: [
        if (glowLayer != null) glowLayer,
        Positioned(
          left: inset,
          top: inset,
          right: inset,
          bottom: inset,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              // 🔴 الشفافية ٠٫٥ مكتوبة في المصدر ولا تأتي من الإعداد
              border:
                  Border.all(color: withAlpha(b.color, 0.5), width: b.width),
            ),
          ),
        ),
      ]);
    }

    // حلقةٌ متدرّجة بسُمك `width` — قناع CSS `xor` يقابله رسمُ حلقةٍ
    final travel = (b.style == BorderStyleFx.traveling && animate)
        ? _phase(t, b.travelSpeed)
        : 0.0;

    return Stack(children: [
      if (glowLayer != null) glowLayer,
      Positioned(
        left: inset,
        top: inset,
        right: inset,
        bottom: inset,
        child: CustomPaint(
          painter: _GradientRingPainter(
            colors: b.colors,
            width: b.width,
            radius: radius,
            travel: travel,
          ),
        ),
      ),
    ]);
  }

  // ── الزوايا (z 51) ──
  List<Widget> _corners(double t) {
    final co = fx.corners;
    // `corner-pulse 2.5s`: شفافية ٠٫٤ ⇄ ٠٫٨
    final op = (co.pulseEnabled && animate)
        ? 0.4 + 0.4 * _pingPong(_phase(t, 2.5))
        : 1.0;
    final c = withAlpha(co.color, 0.75).withValues(alpha: 0.75 * op);

    Widget corner({required bool top, required bool left}) => Positioned(
          top: top ? 2 : null,
          bottom: top ? null : 2,
          left: left ? 2 : null,
          right: left ? null : 2,
          child: CustomPaint(
            size: Size(co.size, co.size),
            painter: _CornerPainter(
                color: c, width: co.width, top: top, left: left),
          ),
        );

    return [
      corner(top: true, left: true),
      corner(top: true, left: false),
      corner(top: false, left: true),
      corner(top: false, left: false),
    ];
  }

  // ── اللمعة (z 52) ──
  Widget _shimmer(double t) {
    final sh = fx.shimmer;
    // `rank-shimmer`: translateX(-100% → 200%) على شريطٍ عرضه ٤٠٪ مائلٍ ٢٥°
    final p = animate ? _phase(t, sh.duration) : 0.0;
    return Positioned.fill(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: LayoutBuilder(
          builder: (_, c) {
            final w = c.maxWidth * 0.4;
            final travel = -w + (c.maxWidth * 3) * p;
            return Stack(clipBehavior: Clip.none, children: [
              Positioned(
                left: -c.maxWidth * 0.5 + travel,
                top: -c.maxHeight * 0.5,
                width: w,
                height: c.maxHeight * 2,
                child: Transform.rotate(
                  angle: 25 * math.pi / 180,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: [
                          Colors.transparent,
                          withAlpha(sh.color, sh.opacity),
                          const Color(0xFFFFFFFF).withValues(alpha: 0.04),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ]);
          },
        ),
      ),
    );
  }

  // ── الجزيئات (z 53) ──
  List<Widget> _particles(double t) {
    final pa = fx.particles;
    final out = <Widget>[];
    for (var i = 0; i < pa.count; i++) {
      out.add(Positioned.fill(
        child: CustomPaint(
          painter: _ParticlePainter(
            index: i,
            cfg: pa,
            time: animate ? t : 0,
            animate: animate,
          ),
        ),
      ));
    }
    return out;
  }

  // ── الشارة (z 55) ──
  Widget _badge() {
    final bd = fx.badge;
    // 🔴 `left` فيزيائيّ لا منطقيّ: المصدر يثبّتها أعلى **اليسار** في صفحةٍ
    //    عربية، فاستعمال `start` هنا يقلبها إلى اليمين ويخالف ما اشتراه.
    return Positioned(
      top: 4 + (bd.offsetY ?? 0),
      left: 4 + (bd.offsetX ?? 0),
      child: Transform.scale(
        scale: bd.scale ?? 1,
        alignment: Alignment.topLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            color: parseCssColor(bd.bgColor, const Color(0x99000000)),
            border: Border.all(
                color: parseCssColor(
                    bd.borderColor, const Color(0x66F59E0B))),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (bd.emoji.isNotEmpty)
              Text(bd.emoji, style: const TextStyle(fontSize: 10)),
            if (bd.emoji.isNotEmpty && bd.label.isNotEmpty)
              const SizedBox(width: 2),
            if (bd.label.isNotEmpty)
              Text(
                bd.label,
                style: TextStyle(
                  fontFamily: 'Tajawal',
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: parseCssColor(bd.textColor, const Color(0xFFFCD34D)),
                ),
              ),
          ]),
        ),
      ),
    );
  }

  // ── العنصر العائم (z 55) ──
  Widget _floating(double t) {
    final fl = fx.floating;
    if (fl.content.isEmpty) return const SizedBox.shrink();

    var dy = 0.0;
    var rot = 0.0;
    if (animate) {
      switch (fl.animation) {
        case FloatAnim.float:
          // `crown-float 2.5s`: translateY 0 ⇄ -3
          dy = -3 * _pingPong(_phase(t, 2.5));
        case FloatAnim.bounce:
          dy = -3 * _pingPong(_phase(t, 1.5));
        case FloatAnim.spin:
          // 📌 المصدر يستعمل `particle-orbit` هنا وهي تعتمد متغيّراً غير
          //    معرَّف في هذا السياق، فلا يدور شيء في الويب بل يومض. نرسمه
          //    دوراناً — وهو المقصود الظاهر — ويُسجَّل الفرق في التكافؤ.
          rot = _phase(t, 4) * 2 * math.pi;
      }
    }

    final top = fl.offsetY ?? (fl.position == 'top' ? -14.0 : null);
    final bottom =
        (fl.offsetY == null && fl.position == 'bottom') ? -14.0 : null;

    return Positioned(
      top: top,
      bottom: bottom,
      left: 0,
      right: 0,
      child: Transform.translate(
        offset: Offset(fl.offsetX ?? 0, dy),
        child: Center(
          child: Transform.rotate(
            angle: rot,
            child: Transform.scale(
              scale: fl.scale ?? 1,
              child: _glowText(fl.content, fl.size, fl.glowColor),
            ),
          ),
        ),
      ),
    );
  }

  Widget _glowText(String content, double size, String glowColor) => Text(
        content,
        style: TextStyle(
          fontSize: size,
          height: 1,
          shadows: [
            Shadow(color: withAlpha(glowColor, 0.6), blurRadius: 6),
          ],
        ),
      );
}

// ══════════════════════════════════════════════════════
// الرسّامون
// ══════════════════════════════════════════════════════

/// حلقةٌ متدرّجة بسُمك ثابت — مقابل قناع CSS `xor` على حشوةٍ متدرّجة.
class _GradientRingPainter extends CustomPainter {
  _GradientRingPainter({
    required this.colors,
    required this.width,
    required this.radius,
    required this.travel,
  });

  final List<Color> colors;
  final double width, radius, travel;

  @override
  void paint(Canvas canvas, Size size) {
    if (colors.isEmpty || width <= 0) return;
    final rect = Rect.fromLTWH(
        width / 2, width / 2, size.width - width, size.height - width);
    if (rect.width <= 0 || rect.height <= 0) return;

    // `backgroundSize: 200% 200%` مع `border-travel` ⇒ التدرّج يعبر مرّتين
    // عرضَ العنصر. نحاكيه بإزاحة نقطتَي البداية والنهاية.
    final shift = travel * 2;
    final begin = Alignment(-1 + shift * 2, -1 + shift * 2);
    final end = Alignment(1 + shift * 2, 1 + shift * 2);

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..isAntiAlias = true
      ..shader = ui.Gradient.linear(
        begin.withinRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        end.withinRect(Rect.fromLTWH(0, 0, size.width, size.height)),
        colors,
        _stops(colors.length),
        TileMode.mirror,
      );

    canvas.drawRRect(
        RRect.fromRectAndRadius(rect, Radius.circular(radius - width / 2)),
        paint);
  }

  static List<double> _stops(int n) =>
      List.generate(n, (i) => n == 1 ? 0.0 : i / (n - 1));

  @override
  bool shouldRepaint(_GradientRingPainter old) =>
      old.travel != travel || old.width != width || old.colors != colors;
}

/// زاويةٌ زخرفية: ضلعان فقط بنصف قطرٍ على الركن الخارجيّ.
class _CornerPainter extends CustomPainter {
  _CornerPainter({
    required this.color,
    required this.width,
    required this.top,
    required this.left,
  });

  final Color color;
  final double width;
  final bool top, left;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..color = color
      ..isAntiAlias = true;

    const r = 4.0;
    final h = width / 2;
    final path = Path();

    // يُرسم من طرف الضلع الأفقيّ إلى الركن ثمّ إلى طرف الرأسيّ
    if (top && left) {
      path
        ..moveTo(size.width, h)
        ..lineTo(r + h, h)
        ..arcToPoint(Offset(h, r + h), radius: const Radius.circular(r), clockwise: false)
        ..lineTo(h, size.height);
    } else if (top && !left) {
      path
        ..moveTo(0, h)
        ..lineTo(size.width - r - h, h)
        ..arcToPoint(Offset(size.width - h, r + h), radius: const Radius.circular(r))
        ..lineTo(size.width - h, size.height);
    } else if (!top && left) {
      path
        ..moveTo(h, 0)
        ..lineTo(h, size.height - r - h)
        ..arcToPoint(Offset(r + h, size.height - h), radius: const Radius.circular(r))
        ..lineTo(size.width, size.height - h);
    } else {
      path
        ..moveTo(size.width - h, 0)
        ..lineTo(size.width - h, size.height - r - h)
        ..arcToPoint(Offset(size.width - r - h, size.height - h),
            radius: const Radius.circular(r), clockwise: false)
        ..lineTo(0, size.height - h);
    }
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(_CornerPainter old) =>
      old.color != color || old.width != width;
}

/// جزيئةٌ واحدة — مدارٌ أو انفجار.
class _ParticlePainter extends CustomPainter {
  _ParticlePainter({
    required this.index,
    required this.cfg,
    required this.time,
    required this.animate,
  });

  final int index;
  final FxParticles cfg;
  final double time;
  final bool animate;

  /// إزاحات `particle-burst-{i}` الثمانية الجاهزة في CSS.
  static const _burst = <Offset>[
    Offset(96, -72), Offset(-84, -60), Offset(72, 84), Offset(-96, 48),
    Offset(24, -96), Offset(-36, 90), Offset(90, 36), Offset(-60, -84),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final origin = Offset(
        size.width * cfg.originX / 100, size.height * cfg.originY / 100);
    final r = cfg.size / 2;

    double p;
    Offset pos;
    double opacity;

    if (cfg.animationType == ParticleAnim.burst) {
      final dur = cfg.baseDuration + index * 0.3;
      final delay = index * (cfg.baseDuration / math.max(1, cfg.count));
      p = animate ? _phase(time, dur, delay) : 0;
      final target = _burst[index % 8];
      // ٠→١٠٪ ثبات · حتى ٨٠٪ يبلغ الهدف · ثمّ ١٫٢× ويتلاشى
      final k = p < 0.1 ? 0.0 : (p < 0.8 ? (p - 0.1) / 0.7 : 1 + (p - 0.8) / 0.2 * 0.2);
      pos = origin + target * k;
      opacity = p < 0.1 ? p / 0.1 : (p < 0.8 ? 1 - (p - 0.1) / 0.7 * 0.4 : 0.6 * (1 - (p - 0.8) / 0.2));
    } else {
      final dur = cfg.baseDuration + index * 0.8;
      final delay = index * 0.7;
      p = animate ? _phase(time, dur, delay) : 0;
      final a = p * 2 * math.pi;
      pos = origin + Offset(math.cos(a), math.sin(a)) * cfg.orbitPx;
      // شفافية `particle-orbit`: ٠ → ١ عند ٢٠٪ → ١ حتى ٨٠٪ → ٠
      opacity = p < 0.2 ? p / 0.2 : (p < 0.8 ? 1 : (1 - p) / 0.2);
    }

    if (opacity <= 0) return;
    final c = withAlpha(cfg.color, 0.8).withValues(alpha: 0.8 * opacity);

    // هالةٌ بقدر ضعف الحجم — `boxShadow 0 0 size*2`
    canvas.drawCircle(
        pos,
        r,
        Paint()
          ..color = withAlpha(cfg.color, 0.4).withValues(alpha: 0.4 * opacity)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, cfg.size));
    canvas.drawCircle(pos, r, Paint()..color = c);
  }

  @override
  bool shouldRepaint(_ParticlePainter old) => old.time != time;
}

/// توهّجٌ **خارجيّ فقط** — مقابل `box-shadow` في CSS.
///
/// 🔴 `BoxShadow` في Flutter يرسم شكلاً مموّهاً كاملاً لا يُقصّ ما تحته،
///    فتوهّجٌ بحجم ٢٦ وشفافية ٠٫٥٥ فوق طبقةٍ بلا حشو يسيل على البطاقة
///    كلّها ويطليها بلون الإطار. CSS تقصّ داخل الصندوق؛ وهذا يقصّه مثلها.
class _OuterGlowPainter extends CustomPainter {
  _OuterGlowPainter({
    required this.color,
    required this.blur,
    required this.radius,
  });

  final Color color;
  final double blur, radius;

  @override
  void paint(Canvas canvas, Size size) {
    if (blur <= 0 || color.a == 0) return;
    final rrect = RRect.fromRectAndRadius(
        Offset.zero & size, Radius.circular(radius));
    final pad = blur * 3;
    final outer = Path()
      ..addRect(Rect.fromLTRB(
          -pad, -pad, size.width + pad, size.height + pad));
    final inner = Path()..addRRect(rrect);

    canvas.save();
    canvas.clipPath(Path.combine(PathOperation.difference, outer, inner));
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = color
        // نصف قطر التمويه في CSS ≈ ضِعف الانحراف المعياريّ
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, blur / 2),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_OuterGlowPainter old) =>
      old.color != color || old.blur != blur || old.radius != radius;
}
