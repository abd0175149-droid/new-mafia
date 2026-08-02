import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🎨 لوحة شاشة الملفّ الشخصيّ — §4.0 في الملفّ 13
// ══════════════════════════════════════════════════════
// درجات Tailwind التي تستعملها الصفحة بأسمائها الأصلية، لا بأسماء
// مخترعة: حين تُقارَن الشاشة بالويب يكون الاسم هو الجسر.

abstract final class Tw {
  static const amber200 = Color(0xFFFDE68A);
  static const amber400 = Color(0xFFFBBF24);
  static const amber500 = Color(0xFFF59E0B);
  static const gray300 = Color(0xFFD1D5DB);
  static const gray400 = Color(0xFF9CA3AF);
  static const gray500 = Color(0xFF6B7280);
  static const gray600 = Color(0xFF4B5563);
  static const gray700 = Color(0xFF374151);
  static const gray800 = Color(0xFF1F2937);
  static const gray900 = Color(0xFF111827);
  static const emerald400 = Color(0xFF34D399);
  static const emerald500 = Color(0xFF10B981);
  static const rose400 = Color(0xFFFB7185);
  static const rose500 = Color(0xFFF43F5E);
  static const cyan400 = Color(0xFF22D3EE);
  static const cyan500 = Color(0xFF06B6D4);
  static const cyan600 = Color(0xFF0891B2);
  static const red400 = Color(0xFFF87171);
  static const red500 = Color(0xFFEF4444);
  static const red600 = Color(0xFFDC2626);
  static const green400 = Color(0xFF4ADE80);
  static const green500 = Color(0xFF22C55E);
  static const purple400 = Color(0xFFC084FC);
  static const purple500 = Color(0xFFA855F7);
  static const orange400 = Color(0xFFFB923C);
  static const orange500 = Color(0xFFF97316);
}

/// نصّ عربيّ — `letterSpacing: 0` إلزاميّ (يكسر الوصلات).
TextStyle ar(
  double size, {
  Color color = Colors.white,
  FontWeight weight = FontWeight.w400,
  double? height,
}) =>
    TextStyle(
      fontFamily: 'Tajawal',
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: height,
      letterSpacing: 0,
    );

/// أرقام جدولية — الإحصاءات لا ترقص حين تتغيّر قيمتها.
TextStyle num_(
  double size, {
  Color color = Colors.white,
  FontWeight weight = FontWeight.w900,
}) =>
    ar(size, color: color, weight: weight)
        .copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

TextStyle mono(double size, {Color color = Colors.white, FontWeight weight = FontWeight.w400}) =>
    TextStyle(
      fontFamily: 'JetBrainsMono',
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: 0,
    );

/// بطاقة معتمة بتدرّج `#111111 → #0a0a0a`.
BoxDecoration solidCard({Color border = const Color(0x26FBBF24), double radius = 16}) =>
    BoxDecoration(
      borderRadius: BorderRadius.circular(radius),
      gradient: const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF111111), Color(0xFF0A0A0A)],
      ),
      border: Border.all(color: border),
    );

/// بطاقة زجاجية. **بلا `BackdropFilter`**: الخلفية شبه سوداء أصلاً
/// فالنتيجة متطابقة بصرياً وأرخص بمراحل (§13).
BoxDecoration glassCard({double radius = 16}) => BoxDecoration(
      borderRadius: BorderRadius.circular(radius),
      color: const Color(0x08FFFFFF),
      border: Border.all(color: const Color(0x0FFFFFFF)),
    );

/// عنوان بطاقة.
Widget cardTitle(String text) => Text(text, style: ar(14, color: Tw.gray300, weight: FontWeight.w700));

// ══════════════════════════════════════════════════════
// ↔️ الاتجاه داخل النصّ
// ══════════════════════════════════════════════════════
// خوارزمية bidi تعيد ترتيب المقاطع اللاتينية داخل فقرة عربية. رأيت
// ذلك على الجهاز: «0 / 100 RR» تُعرض «RR 100 / 0»، و«+120XP» تصير
// «120XP+». الرقم يبقى صحيحاً لكن قراءته تنقلب.

/// نصّ لاتينيّ **محض** — يُلفّ باتجاهه.
Widget ltrText(String text, TextStyle style, {TextAlign? align}) => Directionality(
      textDirection: TextDirection.ltr,
      child: Text(text, style: style, textAlign: align),
    );

/// مقطع لاتينيّ **داخل جملة عربية** — يُغلَّف بمحارف التضمين
/// (LRE…PDF) فيبقى النصّ واحداً والمقطع بترتيبه.
String ltrRun(String s) =>
    String.fromCharCode(0x202A) + s + String.fromCharCode(0x202C);

/// شريط تقدّم يتحرّك من صفر — القيمة تُقرأ لا تَقفز.
class ProgressBar extends StatelessWidget {
  const ProgressBar({
    super.key,
    required this.value,
    required this.color,
    this.height = 10,
    this.track = Tw.gray800,
  });

  /// 0..1
  final double value;
  final Color color;
  final double height;
  final Color track;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: SizedBox(
          height: height,
          child: Stack(children: [
            ColoredBox(color: track, child: const SizedBox.expand()),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: value.clamp(0, 1)),
              duration: const Duration(milliseconds: 1000),
              curve: Curves.easeOut,
              builder: (_, v, __) => FractionallySizedBox(
                widthFactor: v,
                // 🔴 heightFactor إلزاميّ: المكدّس يمرّر قيوداً فضفاضة،
                //    و`DecoratedBox` بلا ابن يأخذ `constraints.smallest`
                //    أي ارتفاع **صفر** — فالتعبئة تُرسم ولا تُرى.
                heightFactor: 1,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [color, color.withValues(alpha: 0.53)],
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ),
      );
}

/// حلقة نسبة — تبدأ من الأعلى وتدور مع عقارب الساعة.
class DonutRing extends StatelessWidget {
  const DonutRing({
    super.key,
    required this.percent,
    required this.size,
    required this.color,
    required this.child,
    this.stroke = 3.5,
    this.track = const Color(0xFF1A1A2E),
    this.glow = false,
  });

  final int percent;
  final double size, stroke;
  final Color color, track;
  final Widget child;
  final bool glow;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: Stack(alignment: Alignment.center, children: [
          CustomPaint(
            size: Size(size, size),
            painter: _DonutPainter(
                percent: percent, color: color, track: track, stroke: stroke, glow: glow),
          ),
          child,
        ]),
      );
}

class _DonutPainter extends CustomPainter {
  _DonutPainter({
    required this.percent,
    required this.color,
    required this.track,
    required this.stroke,
    required this.glow,
  });

  final int percent;
  final Color color, track;
  final double stroke;
  final bool glow;

  @override
  void paint(Canvas canvas, Size size) {
    final r = (size.width - stroke) / 2;
    final c = Offset(size.width / 2, size.height / 2);
    final rect = Rect.fromCircle(center: c, radius: r);

    canvas.drawCircle(
        c,
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..color = track);

    final sweep = (percent.clamp(0, 100) / 100) * 2 * 3.141592653589793;
    if (sweep <= 0) return;

    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = color;

    if (glow) {
      canvas.drawArc(rect, -1.5707963267948966, sweep, false,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = stroke
            ..strokeCap = StrokeCap.round
            ..color = color.withValues(alpha: 0.25)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4));
    }
    // −90° = تبدأ من أعلى الدائرة
    canvas.drawArc(rect, -1.5707963267948966, sweep, false, p);
  }

  @override
  bool shouldRepaint(_DonutPainter o) =>
      o.percent != percent || o.color != color || o.stroke != stroke;
}
