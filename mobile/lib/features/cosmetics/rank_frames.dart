import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../models/card_fx.dart';

// ══════════════════════════════════════════════════════
// 🖼️ الإطارات الخمسة — منقولة عن `components/RankFrames.tsx`
// ══════════════════════════════════════════════════════
// 🔴 نفس المسارات ونفس الأرقام حرفياً. الإطار **هو البضاعة**، وأيّ انحراف
//    في هامشٍ أو سُمك يعني أن اللاعب اشترى شيئاً ورأى شيئاً آخر.
//
// الحركات في الويب CSS keyframes، وهنا تُشتقّ من ساعةٍ واحدة (`time`
// بالثواني) — أرخص من مؤقّتٍ لكل عنصر، ونفس الطور.

/// `hexToRgba(color, opacity)` في المصدر.
Color _c(String hex, double opacity) => withAlpha(hex, opacity);

/// نبضة `deco-pulse`: شفافية ٠٫٧⇄١ ومقياس ١⇄١٫٠٥، `ease-in-out`.
({double opacity, double scale}) _decoPulse(
    double time, double duration, double delay) {
  final p = ((time - delay) / duration) % 1.0;
  final t = p < 0 ? p + 1 : p;
  // ease-in-out على نصفَي الدورة — 0→1→0
  final tri = t < 0.5 ? t * 2 : (1 - t) * 2;
  final e = tri * tri * (3 - 2 * tri);
  return (opacity: 0.7 + 0.3 * e, scale: 1 + 0.05 * e);
}

class RankFramePainter extends CustomPainter {
  RankFramePainter({
    required this.type,
    required this.color,
    required this.opacity,
    required this.strokeWidth,
    required this.animate,
    required this.time,
  });

  final FrameTypeFx type;
  final String color;
  final double opacity, strokeWidth, time;
  final bool animate;

  @override
  void paint(Canvas canvas, Size size) {
    switch (type) {
      case FrameTypeFx.none:
        return;
      case FrameTypeFx.simple:
        _simple(canvas, size);
      case FrameTypeFx.greek:
        _greek(canvas, size);
      case FrameTypeFx.islamic:
        _islamic(canvas, size);
      case FrameTypeFx.deco:
        _deco(canvas, size);
      case FrameTypeFx.royal:
        _royal(canvas, size);
    }
  }

  Paint _stroke(Color c, double w, {StrokeCap cap = StrokeCap.butt}) => Paint()
    ..style = PaintingStyle.stroke
    ..color = c
    ..strokeWidth = w
    ..strokeCap = cap
    ..strokeJoin = StrokeJoin.round
    ..isAntiAlias = true;

  Paint _fill(Color c) => Paint()
    ..style = PaintingStyle.fill
    ..color = c
    ..isAntiAlias = true;

  /// حدٌّ بمسافة `inset` من كل الجهات وزوايا `r` — يقابل `inset:m; border:…`
  void _rrectBorder(Canvas canvas, Size size, double inset, double r,
      Color c, double w) {
    if (w <= 0) return;
    final rect = Rect.fromLTWH(
        inset + w / 2, inset + w / 2,
        size.width - inset * 2 - w, size.height - inset * 2 - w);
    if (rect.width <= 0 || rect.height <= 0) return;
    canvas.drawRRect(
        RRect.fromRectAndRadius(rect, Radius.circular(r)), _stroke(c, w));
  }

  /// حدٌّ متقطّع — CSS `dashed` ≈ شرطةٌ بطول ٣×السُمك وفجوةٌ مثلها.
  void _dashedRRect(Canvas canvas, Size size, double inset, double r,
      Color c, double w) {
    if (w <= 0) return;
    final rect = Rect.fromLTWH(inset + w / 2, inset + w / 2,
        size.width - inset * 2 - w, size.height - inset * 2 - w);
    if (rect.width <= 0 || rect.height <= 0) return;
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(rect, Radius.circular(r)));
    _dashPath(canvas, path, c, w, w * 3, w * 3);
  }

  void _dashPath(Canvas canvas, Path path, Color c, double w, double dash,
      double gap) {
    final p = _stroke(c, w);
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        final end = math.min(d + dash, metric.length);
        canvas.drawPath(metric.extractPath(d, end), p);
        d = end + gap;
      }
    }
  }

  void _dashedLine(Canvas canvas, Offset a, Offset b, Color c, double w) {
    final path = Path()..moveTo(a.dx, a.dy)..lineTo(b.dx, b.dy);
    _dashPath(canvas, path, c, w, w * 3, w * 3);
  }

  // ═══════════════════════════════════════════════════
  // ١. بسيط — أقواس زوايا داخلية
  // ═══════════════════════════════════════════════════
  void _simple(Canvas canvas, Size size) {
    final c = _c(color, opacity);
    final w = math.max(1.0, strokeWidth);
    const sz = 18.0, g = 6.0;
    final p = _stroke(c, w, cap: StrokeCap.round);

    for (final isT in [true, false]) {
      for (final isL in [true, false]) {
        final x = isL ? g : size.width - g - sz;
        final y = isT ? g : size.height - g - sz;
        final path = Path();
        if (isT && isL) {
          path..moveTo(x, y + sz)..lineTo(x, y)..lineTo(x + sz, y);
        } else if (isT && !isL) {
          path..moveTo(x, y)..lineTo(x + sz, y)..lineTo(x + sz, y + sz);
        } else if (!isT && isL) {
          path..moveTo(x, y)..lineTo(x, y + sz)..lineTo(x + sz, y + sz);
        } else {
          path..moveTo(x, y + sz)..lineTo(x + sz, y + sz)..lineTo(x + sz, y);
        }
        canvas.drawPath(path, p);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // ٢. يونانيّ — شريط المياندر
  // ═══════════════════════════════════════════════════
  void _greek(Canvas canvas, Size size) {
    final c = _c(color, opacity);
    final sw = math.max(0.8, strokeWidth * 0.7);
    const m = 5.0, u = 8.0;

    _rrectBorder(canvas, size, m, 8, c, sw * 0.5);

    // شريط علويّ متحرّك: `greek-scroll 6s linear` ⇒ إزاحة ٠→١٠ بكسل
    final shift = animate ? ((time / 6) % 1.0) * 10 : 0.0;
    _meanderBand(canvas,
        Rect.fromLTRB(m + 14, m - 1, size.width - m - 14, m - 1 + u * 1.2),
        c, sw, u, shift, flipY: false);
    // السفليّ مقلوبٌ رأسياً وغير متحرّك — كما في المصدر تماماً
    _meanderBand(
        canvas,
        Rect.fromLTRB(m + 14, size.height - m + 1 - u * 1.2,
            size.width - m - 14, size.height - m + 1),
        c, sw, u, 0, flipY: true);

    // زخارف الزوايا ١٤×١٤
    final inner = _fill(_c(color, opacity * 0.1));
    for (final isT in [true, false]) {
      for (final isL in [true, false]) {
        final x = isL ? m - 1 : size.width - (m - 1) - 14;
        final y = isT ? m - 1 : size.height - (m - 1) - 14;
        canvas.save();
        canvas.translate(x, y);
        canvas.drawRRect(
            RRect.fromRectAndRadius(
                const Rect.fromLTWH(1, 1, 12, 12), const Radius.circular(1)),
            _stroke(c, sw * 1.2));
        final small = RRect.fromRectAndRadius(
            const Rect.fromLTWH(4, 4, 6, 6), const Radius.circular(0.5));
        canvas.drawRRect(small, inner);
        canvas.drawRRect(small, _stroke(c, sw * 0.6));
        canvas.restore();
      }
    }
  }

  void _meanderBand(Canvas canvas, Rect band, Color c, double sw, double u,
      double shift, {required bool flipY}) {
    if (band.width <= 0 || band.height <= 0) return;
    canvas.save();
    canvas.clipRect(band);
    canvas.translate(band.left, band.top);
    if (flipY) {
      canvas.translate(0, band.height);
      canvas.scale(1, -1);
    }
    final p = _stroke(c, sw);
    // البلاطة عرضها ٢u وتُكرَّر أفقياً؛ نبدأ قبل الحافّة بدورةٍ لأجل الإزاحة
    for (var x = -u * 2 + shift; x < band.width + u * 2; x += u * 2) {
      final path = Path()
        ..moveTo(x, u)
        ..lineTo(x, 0)
        ..lineTo(x + u * 2, 0)
        ..lineTo(x + u * 2, u * 0.5)
        ..lineTo(x + u * 0.5, u * 0.5)
        ..lineTo(x + u, u * 0.5)
        ..lineTo(x + u, u);
      canvas.drawPath(path, p);
    }
    canvas.restore();
  }

  // ═══════════════════════════════════════════════════
  // ٣. إسلاميّ — نجوم ثمانية
  // ═══════════════════════════════════════════════════
  Path _star8(double cx, double cy, double r) {
    final path = Path();
    for (var i = 0; i < 16; i++) {
      final angle = (i * math.pi / 8) - math.pi / 16;
      final rad = i.isEven ? r : r * 0.38;
      final x = cx + rad * math.cos(angle);
      final y = cy + rad * math.sin(angle);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    return path..close();
  }

  void _islamic(Canvas canvas, Size size) {
    final c = _c(color, opacity);
    final c2 = _c(color, opacity * 0.15);
    final sw = math.max(0.6, strokeWidth * 0.6);
    const m = 4.0, starR = 8.0, smallR = 4.0;

    _dashedRRect(canvas, size, m, 10, c, sw);

    // نجوم الزوايا تدور: `frame-spin 20s linear`
    final spin = animate ? ((time / 20) % 1.0) * 2 * math.pi : 0.0;
    const box = starR * 2 + 4;
    for (final isT in [true, false]) {
      for (final isL in [true, false]) {
        final x = isL ? m : size.width - m - box;
        final y = isT ? m : size.height - m - box;
        canvas.save();
        canvas.translate(x + box / 2, y + box / 2);
        canvas.rotate(spin);
        canvas.translate(-box / 2, -box / 2);
        final star = _star8(starR + 2, starR + 2, starR);
        canvas.drawPath(star, _fill(c2));
        canvas.drawPath(star, _stroke(c, sw));
        canvas.drawCircle(const Offset(starR + 2, starR + 2), 1.5, _fill(c));
        canvas.restore();
      }
    }

    // نجوم منتصف الحواف
    const sbox = smallR * 2 + 4;
    final centers = <Offset>[
      Offset(size.width / 2 - sbox / 2, m),
      Offset(size.width / 2 - sbox / 2, size.height - m - sbox),
      Offset(m, size.height / 2 - sbox / 2),
      Offset(size.width - m - sbox, size.height / 2 - sbox / 2),
    ];
    for (final o in centers) {
      canvas.save();
      canvas.translate(o.dx, o.dy);
      final star = _star8(smallR + 2, smallR + 2, smallR);
      canvas.drawPath(star, _fill(c2));
      canvas.drawPath(star, _stroke(c, sw * 0.8));
      canvas.restore();
    }

    // خطوط الوصل بين النجوم
    final link = _stroke(_c(color, opacity * 0.3), sw * 0.5);
    final lx1 = m + starR * 2 + 4, lx2 = size.width - m - starR * 2 - 4;
    canvas.drawLine(Offset(lx1, m + starR + 1), Offset(lx2, m + starR + 1), link);
    canvas.drawLine(Offset(lx1, size.height - m - starR - 1),
        Offset(lx2, size.height - m - starR - 1), link);
  }

  // ═══════════════════════════════════════════════════
  // ٤. آرت ديكو — زوايا مدرّجة ومراوح
  // ═══════════════════════════════════════════════════
  void _deco(Canvas canvas, Size size) {
    final c = _c(color, opacity);
    final c2 = _c(color, opacity * 0.25);
    final sw = math.max(0.6, strokeWidth * 0.6);
    const m = 3.0;

    _rrectBorder(canvas, size, m, 10, c, sw);
    _rrectBorder(canvas, size, m + 3, 8, c2, sw * 0.4);

    // المروحتان تنبضان بفارق ١٫٥ ثانية
    _fan(canvas, size, c, sw, top: true, delay: 0);
    _fan(canvas, size, c, sw, top: false, delay: 1.5);

    // زوايا مدرّجة ١٦×١٦
    for (final isT in [true, false]) {
      for (final isL in [true, false]) {
        final x = isL ? m : size.width - m - 16;
        final y = isT ? m : size.height - m - 16;
        canvas.save();
        canvas.translate(x + 8, y + 8);
        canvas.scale(isL ? 1 : -1, isT ? 1 : -1);
        canvas.translate(-8, -8);
        final step = Path()
          ..moveTo(0, 16)
          ..lineTo(0, 8)
          ..lineTo(4, 8)
          ..lineTo(4, 4)
          ..lineTo(8, 4)
          ..lineTo(8, 0)
          ..lineTo(16, 0);
        canvas.drawPath(step, _stroke(c, sw * 1.2, cap: StrokeCap.round));
        const sq = Rect.fromLTWH(0, 0, 4, 4);
        canvas.drawRect(sq, _fill(c2));
        canvas.drawRect(sq, _stroke(c, sw * 0.6));
        canvas.restore();
      }
    }

    // نقطتا الجانبين
    for (final dx in [m + 1 + 1.5, size.width - m - 1 - 1.5]) {
      canvas.drawCircle(Offset(dx, size.height / 2), 1.5, _fill(c));
    }
  }

  void _fan(Canvas canvas, Size size, Color c, double sw,
      {required bool top, required double delay}) {
    final pulse = animate ? _decoPulse(time, 3, delay) : (opacity: 1.0, scale: 1.0);
    canvas.save();
    canvas.translate(size.width / 2, top ? 3.0 : size.height - 3.0);
    if (!top) canvas.scale(1, -1);
    canvas.scale(pulse.scale);
    canvas.translate(-16, 0);
    final p = _stroke(c.withValues(alpha: c.a * pulse.opacity), sw,
        cap: StrokeCap.round);
    for (var i = 0; i < 5; i++) {
      final a = (-50 + i * 25) * math.pi / 180;
      canvas.drawLine(const Offset(16, 14),
          Offset(16 + 12 * math.sin(a), 14 - 12 * math.cos(a)), p);
    }
    canvas.drawCircle(const Offset(16, 14), 2,
        _fill(c.withValues(alpha: c.a * pulse.opacity)));
    canvas.restore();
  }

  // ═══════════════════════════════════════════════════
  // ٥. ملكيّ — حدّ مزدوج وزخرفة
  // ═══════════════════════════════════════════════════
  void _royal(Canvas canvas, Size size) {
    final c = _c(color, opacity);
    final c2 = _c(color, opacity * 0.2);
    final sw = math.max(0.6, strokeWidth * 0.5);
    const m = 3.0;

    _rrectBorder(canvas, size, m, 12, c, sw * 1.2);
    _rrectBorder(canvas, size, m + 4, 9, c2, sw * 0.5);

    _fleur(canvas, size, c, c2, sw, top: true, delay: 0);
    _fleur(canvas, size, c, c2, sw, top: false, delay: 2);

    // ميداليات الزوايا ١٠×١٠
    for (final isT in [true, false]) {
      for (final isL in [true, false]) {
        final x = isL ? m + 1 : size.width - m - 1 - 10;
        final y = isT ? m + 1 : size.height - m - 1 - 10;
        final center = Offset(x + 5, y + 5);
        canvas.drawCircle(center, 4, _fill(c2));
        canvas.drawCircle(center, 4, _stroke(c, sw));
        canvas.drawCircle(center, 1.5, _fill(c));
      }
    }

    // شرطات الجوانب
    final dash = _c(color, opacity * 0.3);
    final dw = sw * 0.6;
    _dashedLine(canvas, Offset(m + 18, m), Offset(size.width - m - 18, m), dash, dw);
    _dashedLine(canvas, Offset(m + 18, size.height - m),
        Offset(size.width - m - 18, size.height - m), dash, dw);
    _dashedLine(canvas, Offset(m, m + 18), Offset(m, size.height - m - 18), dash, dw);
    _dashedLine(canvas, Offset(size.width - m, m + 18),
        Offset(size.width - m, size.height - m - 18), dash, dw);
  }

  void _fleur(Canvas canvas, Size size, Color c, Color c2, double sw,
      {required bool top, required double delay}) {
    final pulse = animate ? _decoPulse(time, 4, delay) : (opacity: 1.0, scale: 1.0);
    canvas.save();
    canvas.translate(size.width / 2, top ? 2.0 : size.height - 2.0);
    if (!top) canvas.scale(1, -1);
    canvas.scale(pulse.scale);
    canvas.translate(-12, 0);

    final fc = c.withValues(alpha: c.a * pulse.opacity);
    final path = Path()
      ..moveTo(12, 13)
      ..cubicTo(12, 6, 10, 3, 7, 1)
      ..cubicTo(10, 3, 12, 1, 12, 1)
      ..cubicTo(12, 1, 14, 3, 17, 1)
      ..cubicTo(14, 3, 12, 6, 12, 13)
      ..close();
    canvas.drawPath(path, _fill(c2));
    canvas.drawPath(path, _stroke(fc, sw));
    canvas.drawCircle(const Offset(12, 1), 1.2, _fill(fc));

    // اللفّتان الجانبيتان في الأعلى وحده — كما في المصدر
    if (top) {
      final l = Path()..moveTo(5, 8)..quadraticBezierTo(3, 5, 6, 2);
      final r = Path()..moveTo(19, 8)..quadraticBezierTo(21, 5, 18, 2);
      final p = _stroke(fc, sw * 0.7, cap: StrokeCap.round);
      canvas.drawPath(l, p);
      canvas.drawPath(r, p);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(RankFramePainter old) =>
      old.time != time ||
      old.type != type ||
      old.color != color ||
      old.opacity != opacity ||
      old.strokeWidth != strokeWidth ||
      old.animate != animate;
}
