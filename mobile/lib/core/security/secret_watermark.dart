import 'package:flutter/material.dart';

/// ══════════════════════════════════════════════════════
/// 💧 علامةٌ مائيّة تُغطّي الشاشة السريّة — تجعل أيّ لقطةٍ تفضح صاحبها
/// ══════════════════════════════════════════════════════
/// نصٌّ شفّافٌ مائلٌ مكرّرٌ: اسم اللاعب + رقم المقعد + رمز الغرفة + الوقت.
/// لأنّ المكان يعرف الجميع، أيّ لقطةٍ مسرَّبة تُعلن مسرّبها فوراً → حظر.
/// تعمل حتى حين يستحيل منع اللقطة (iOS، وأيّ التقاطٍ بهاتفٍ ثانٍ).
class SecretWatermark extends StatelessWidget {
  const SecretWatermark({
    super.key,
    required this.child,
    required this.label,
    this.opacity = 0.10,
  });

  /// المحتوى السريّ الذي تُغطّيه العلامة.
  final Widget child;

  /// نصّ الوسم — عادةً «الاسم · مقعد N · رمز · HH:mm».
  final String label;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        Positioned.fill(
          child: IgnorePointer(
            child: ClipRect(
              child: CustomPaint(
                painter: _TiledWatermarkPainter(
                  text: label,
                  color: Colors.white.withValues(alpha: opacity),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TiledWatermarkPainter extends CustomPainter {
  _TiledWatermarkPainter({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5),
      ),
      textDirection: TextDirection.rtl,
    )..layout();

    canvas.save();
    // ميلٌ قُطريّ + تبليطٌ متداخل كي يظهر الوسم في أيّ قصٍّ للقطة
    canvas.rotate(-0.5);
    const stepX = 220.0, stepY = 90.0;
    for (double y = -size.height; y < size.height * 2; y += stepY) {
      for (double x = -size.width; x < size.width * 2; x += stepX) {
        tp.paint(canvas, Offset(x, y));
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _TiledWatermarkPainter old) =>
      old.text != text || old.color != color;
}
