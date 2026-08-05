import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../app/theme/colors.dart';

// ══════════════════════════════════════════════════════
// 🌫️ طبقات الأجواء — §4.4
// ══════════════════════════════════════════════════════
// كلّها لا تستقبل لمساً (IgnorePointer) وتوضع في Stack فوق المحتوى
// أو تحته. هي ما يجعل الشاشة «نوار» بدل داكنة فحسب.

/// طبقة الضجيج — **فوق كل شيء دائماً** (مكافئ z-9999 في الويب).
///
/// الويب يرسمها بـSVG `feTurbulence`. هنا تُرسم **مرّة واحدة** في صورة
/// مبلّطة داخل RepaintBoundary — لا CustomPainter لكل إطار: هذه طبقة
/// تغطّي الشاشة كاملةً، وإعادة رسمها ٦٠ مرّة في الثانية تكلفة دائمة
/// مقابل صفر فائدة (الضجيج ساكن).
class NoiseOverlay extends StatelessWidget {
  const NoiseOverlay({super.key, this.opacity = 0.04});

  final double opacity;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: RepaintBoundary(
          child: Opacity(
            opacity: opacity,
            child: CustomPaint(size: Size.infinite, painter: _NoisePainter()),
          ),
        ),
      );
}

class _NoisePainter extends CustomPainter {
  // بذرة ثابتة: الضجيج نفسه في كل رسمة، فلا يهتزّ بين الإطارات
  static final _rnd = math.Random(20260801);
  static final List<Offset> _dots = List.generate(
    2400,
    (_) => Offset(_rnd.nextDouble(), _rnd.nextDouble()),
  );

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = const Color(0xFFFFFFFF);
    for (final d in _dots) {
      canvas.drawRect(
        Rect.fromLTWH(d.dx * size.width, d.dy * size.height, 1.2, 1.2),
        p,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _NoisePainter oldDelegate) => false;
}

/// فينييت الدم — أربع زوايا حمراء + تعتيم مركزيّ.
/// تُستعمل في تدفّق اللاعب الحضوريّ وصفحة الدخول.
class BloodVignette extends StatelessWidget {
  const BloodVignette({super.key});

  static const _corners = <(Alignment, double)>[
    (Alignment.topLeft, 0.30),
    (Alignment.topRight, 0.25),
    (Alignment.bottomLeft, 0.15),
    (Alignment.bottomRight, 0.25),
  ];

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Stack(
          fit: StackFit.expand,
          children: [
            for (final (align, alpha) in _corners)
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: align,
                    radius: 0.9,
                    colors: [
                      Noir.bloodRed.withValues(alpha: alpha),
                      Noir.bloodRed.withValues(alpha: 0),
                    ],
                    stops: const [0.0, 0.5],
                  ),
                ),
              ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.center,
                  radius: 1.0,
                  colors: [Color(0x00000000), Color(0x66000000)],
                  stops: [0.4, 1.0],
                ),
              ),
            ),
          ],
        ),
      );
}

/// ضوء مسلَّط على متحدّث — يدخل بتلاشٍ خلال ثانية.
class SpotlightVignette extends StatelessWidget {
  const SpotlightVignette({super.key});

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(seconds: 1),
          curve: Curves.easeOut,
          builder: (_, v, child) => Opacity(opacity: v, child: child),
          child: const DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                colors: [Color(0x00000000), Color(0x99000000), Color(0xD9000000)],
                stops: [0.25, 0.70, 1.0],
              ),
            ),
          ),
        ),
      );
}

/// كشف هويّة — أحمر يزحف من الأطراف، أبطأ (ثانية ونصف).
class RevealedVignette extends StatelessWidget {
  const RevealedVignette({super.key});

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 1500),
          curve: Curves.easeOut,
          builder: (_, v, child) => Opacity(opacity: v, child: child),
          child: const DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                colors: [Color(0x00000000), Color(0x4D8A0303), Color(0xB38A0303)],
                stops: [0.30, 0.60, 1.0],
              ),
            ),
          ),
        ),
      );
}

/// خلفية الصفحات العامّة — سواد بقلب أفتح قليلاً في الأعلى.
class DisplayBg extends StatelessWidget {
  const DisplayBg({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final base = DecoratedBox(
      decoration: const BoxDecoration(
        color: Noir.pitchBlack,
        gradient: RadialGradient(
          center: Alignment(0, -1),
          radius: 1.1,
          colors: [Noir.charcoal, Noir.pitchBlack],
          stops: [0.0, 0.7],
        ),
      ),
      child: child,
    );

    // الأندرويد والويب على السواد كما هو — تكافؤ 11 §4.6 محفوظ.
    if (defaultTargetPlatform != TargetPlatform.iOS) return base;

    // على iOS وحده: وهجٌ سفليّ خافت خلف الشريط الزجاجيّ.
    //
    // السبب قياسٌ لا ذوق: عدسة الزجاج تحني ما خلفها، وخلفها `#050505`
    // أسودُ صرف — فحنيُ الأسود إلى أسود لا يُنتج شيئاً تراه العين. قِسنا
    // ذلك على المحاكي: الانكسار ظهر حيث مرّ محتوى ساطع واختفى حيث لم يمرّ.
    // هذا الوهج يمنح العدسة ما تكسره في كلّ الشاشات لا في الملوّنة وحدها.
    //
    // ⚠️ يكسر تكافؤ الويب عمداً (قرار المالك) — ومحصورٌ في iOS.
    // خافتٌ جداً بقصد: الهوية نوار، والمطلوب مادّةٌ تكسر لا خلفيةٌ تلفت.
    return Stack(
      fit: StackFit.expand,
      children: [
        base,
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          height: 260,
          child: const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [Color(0x2EFBBF24), Color(0x0F7C3AED), Color(0x00000000)],
                  stops: [0.0, 0.45, 1.0],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
