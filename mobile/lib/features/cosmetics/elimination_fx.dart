import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../models/card_fx.dart';
import 'card_fx_layer.dart' show FxClock, kCardRadius;

// ══════════════════════════════════════════════════════
// 🔥 أنيميشن الإقصاء — منقول عن `components/EliminationFx.tsx`
// ══════════════════════════════════════════════════════
// خمسة تصاميم: احتراق · رماد · نزف · تحطّم · تشويش. لكلٍّ إيقاعه ولونه.
//
// 🔒 فخٌّ لا يُكسر: البوّابة في المصدر `design === 'burn'` — **صدقُ قيمة
//    لا مجرّد وجودها**. تبديلها بـ`config != null` يجعل كل تصميمٍ قادم
//    يرسم ناراً. التوزيع هنا `switch` صريح، وما لا يُعرف لا يُرسم.
//
// ⚠️ السرعة **مضاعِفٌ بلا وحدة** لا زمن: لكل تصميم إيقاعه (اللهب ٠٫٥٥ث،
//    النثار ١٫٦ث)، والضرب يحفظ التناسب بينها. تمرير زمنٍ واحد يسحق
//    إيقاع التصميم.

const _designs = {'burn', 'ash', 'drain', 'shatter', 'static'};

const _designDefaults = <String, ({int particles, String c1, String c2})>{
  'burn': (particles: 7, c1: '#f97316', c2: '#dc2626'),
  'ash': (particles: 12, c1: '#a8a29e', c2: '#57534e'),
  'drain': (particles: 0, c1: '#b91c1c', c2: '#450a0a'),
  'shatter': (particles: 8, c1: '#e0f2fe', c2: '#0ea5e9'),
  'static': (particles: 0, c1: '#e5e7eb', c2: '#111827'),
};

class ElimFx {
  const ElimFx({
    required this.design,
    required this.particles,
    required this.color,
    required this.color2,
    required this.speed,
    required this.intensity,
  });

  final String design, color, color2;
  final int particles;
  final double speed, intensity;

  Color get c1 => parseCssColor(color, const Color(0xFFF97316));
  Color get c2 => parseCssColor(color2, const Color(0xFFDC2626));

  /// مضاعِف المدّة — أبطأ كلّما قلّت السرعة.
  double get durMul => 1 / speed;
}

ElimFx normalizeElimFx(dynamic raw) {
  final c = (raw is Map) ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
  final design = _designs.contains(c['design']) ? '${c['design']}' : 'burn';
  final d = _designDefaults[design]!;
  return ElimFx(
    design: design,
    // ⚠️ السقف ١٦: تُرسم لكل لاعبٍ مُقصى على شاشة قاعةٍ واحدة — عشرة
    //    لاعبين × ٦٠ جسيماً يُسقط معدّل الإطارات على جهاز العرض.
    particles: numOr(c['particles'], d.particles.toDouble(), 0, 16).truncate(),
    color: hexOr(c['color'], d.c1),
    color2: hexOr(c['color2'], d.c2),
    speed: numOr(c['speed'], 1, 0.25, 3),
    intensity: numOr(c['intensity'], 0.85, 0, 1),
  );
}

/// 🔒 بلا `design` ⇒ لا شيء. التعتيم المجانيّ يبقى كما هو.
bool hasElimDesign(dynamic config) =>
    config is Map && _designs.contains(config['design']);

class EliminationFxView extends StatelessWidget {
  const EliminationFxView({
    super.key,
    this.config,
    this.animate = true,
    this.radius = kCardRadius,
  });

  final Map<String, dynamic>? config;
  final bool animate;
  final double radius;

  @override
  Widget build(BuildContext context) {
    if (!hasElimDesign(config)) return const SizedBox.shrink();
    final fx = normalizeElimFx(config);

    return IgnorePointer(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: animate
            ? FxClock(builder: (_, t) => _paint(fx, t))
            : _paint(fx, 0),
      ),
    );
  }

  Widget _paint(ElimFx fx, double t) => CustomPaint(
        painter: _ElimPainter(fx: fx, time: t),
        child: const SizedBox.expand(),
      );
}

double _loop(double t, double dur) {
  if (dur <= 0) return 0;
  final p = (t / dur) % 1.0;
  return p < 0 ? p + 1 : p;
}

/// حركةٌ تنتهي وتثبت (`forwards`) — لا تعود للبداية.
double _once(double t, double dur) => dur <= 0 ? 1 : (t / dur).clamp(0.0, 1.0);

class _ElimPainter extends CustomPainter {
  _ElimPainter({required this.fx, required this.time});

  final ElimFx fx;
  final double time;

  @override
  void paint(Canvas canvas, Size size) {
    switch (fx.design) {
      case 'burn':
        _burn(canvas, size);
      case 'ash':
        _ash(canvas, size);
      case 'drain':
        _drain(canvas, size);
      case 'shatter':
        _shatter(canvas, size);
      case 'static':
        _static(canvas, size);
    }
  }

  Rect _all(Size s) => Offset.zero & s;

  // ── 🔥 احتراق: تفحّمٌ وألسنةٌ ونثار ──
  void _burn(Canvas canvas, Size size) {
    // التفحّم يظهر تدريجياً ويثبت عند ٠٫٨٥
    final charOp = _once(time, 1.8) * 0.85;
    canvas.drawRect(
      _all(size),
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, size.height),
          Offset.zero,
          [
            const Color(0xFF000000).withValues(alpha: 0.95 * charOp),
            const Color(0xFF140A05).withValues(alpha: 0.55 * charOp),
            Colors.transparent,
          ],
          const [0, 0.55, 1],
        ),
    );

    // الألسنة: عرض ١٥٪ من القاعدة، تتمدّد وتنكمش
    final n = math.max(1, fx.particles);
    for (var i = 0; i < fx.particles; i++) {
      final p = _loop(time - i * 0.18, 0.55 * fx.durMul);
      final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
      final e = tri * tri * (3 - 2 * tri);
      final sy = 0.75 + 0.4 * e;
      final sx = 0.95 + 0.1 * e;

      final w = size.width * 0.15 * sx;
      final h = size.height * ((34 + (i % 3) * 14) / 100) * sy;
      final cx = size.width * ((i + 0.5) / n);
      final rect = Rect.fromLTWH(cx - w / 2, size.height - h, w, h);

      canvas.drawRRect(
        RRect.fromRectAndCorners(rect,
            topLeft: Radius.elliptical(w / 2, h / 2),
            topRight: Radius.elliptical(w / 2, h / 2),
            bottomLeft: Radius.circular(w * 0.2),
            bottomRight: Radius.circular(w * 0.2)),
        Paint()
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3)
          ..shader = ui.Gradient.radial(
            Offset(rect.center.dx, rect.bottom),
            math.max(w, h),
            [
              const Color(0xFFFEF08A).withValues(alpha: 0.95 * fx.intensity),
              fx.c1.withValues(alpha: fx.intensity),
              fx.c2.withValues(alpha: fx.intensity),
              Colors.transparent,
            ],
            const [0, 0.35, 0.65, 0.82],
          ),
      );
    }

    // النثار يتصاعد ويتلاشى
    final embers = math.min(10, fx.particles + 3);
    for (var i = 0; i < embers; i++) {
      final p = _loop(time - i * 0.3, 1.6 * fx.durMul);
      final op = p < 0.15 ? p / 0.15 : (1 - p) / 0.85;
      if (op <= 0) continue;
      final x = size.width * (0.08 + i * 0.09);
      final y = size.height * 0.88 - size.height * 1.35 * p;
      final r = 2.5 * (1 - 0.7 * p);
      canvas.drawCircle(
          Offset(x, y),
          r * 2.4,
          Paint()
            ..color = fx.c1.withValues(alpha: 0.5 * op)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3));
      canvas.drawCircle(
          Offset(x, y), r, Paint()..color = fx.c1.withValues(alpha: op));
    }
  }

  // ── 🌫️ رماد: الوجه يبهت وجسيماتٌ تتصاعد ──
  void _ash(Canvas canvas, Size size) {
    final veil = _once(time, 2.2 * fx.durMul) * fx.intensity;
    canvas.drawRect(
      _all(size),
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, size.height),
          Offset.zero,
          [fx.c2.withValues(alpha: veil), Colors.transparent],
          const [0, 0.7],
        ),
    );

    for (var i = 0; i < fx.particles; i++) {
      final p = _loop(time - (i % 6) * 0.28, 2.6 * fx.durMul);
      final op = p < 0.2 ? p / 0.2 : (1 - p) / 0.8;
      if (op <= 0) continue;
      final s = 2.0 + (i % 3);
      final x = size.width * ((i * 97) % 96) / 100 + 14 * p;
      final y = size.height * 0.82 - size.height * 1.0 * p;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(x, y, s, s), const Radius.circular(1)),
        Paint()..color = fx.c1.withValues(alpha: op),
      );
    }
  }

  // ── 🩸 نزف: موجةٌ تنزل ثمّ تتجمّع أسفل البطاقة ──
  void _drain(Canvas canvas, Size size) {
    final wave = _once(time, 1.9 * fx.durMul);
    // `cubic-bezier(0.4,0,0.2,1)` ≈ تسارعٌ ثمّ تباطؤ
    final e = wave < 0.5
        ? 2 * wave * wave
        : 1 - math.pow(-2 * wave + 2, 2) / 2;
    final dy = -size.height * (1 - e);

    canvas.save();
    canvas.translate(0, dy);
    canvas.drawRect(
      _all(size),
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, size.height),
          [
            Colors.transparent,
            fx.c1.withValues(alpha: fx.intensity),
            fx.c2.withValues(alpha: fx.intensity),
          ],
          const [0, 0.6, 1],
        ),
    );
    canvas.restore();

    final pool = _once(time, 2.4 * fx.durMul);
    final ph = size.height * 0.26 * pool;
    if (ph > 0) {
      canvas.drawRect(
        Rect.fromLTWH(0, size.height - ph, size.width, ph),
        Paint()
          ..shader = ui.Gradient.linear(
            Offset(0, size.height),
            Offset(0, size.height - ph),
            [fx.c2.withValues(alpha: pool), Colors.transparent],
          ),
      );
    }
  }

  // ── 💠 تحطّم: ومضةٌ ثمّ شظايا تتباعد من المركز ──
  void _shatter(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);

    final flash = _once(time, 0.8 * fx.durMul);
    final fop = flash < 0.12 ? flash / 0.12 * 0.9 : 0.9 * (1 - flash) / 0.88;
    if (fop > 0) {
      canvas.drawRect(
        _all(size),
        Paint()
          ..shader = ui.Gradient.radial(center, size.longestSide * 0.5, [
            fx.c1.withValues(alpha: fop),
            Colors.transparent,
          ], const [0, 0.65]),
      );
    }

    final veil = _once(time, 1.6 * fx.durMul) * fx.intensity;
    canvas.drawRect(_all(size),
        Paint()..color = const Color(0xFF08141E).withValues(alpha: 0.75 * veil));

    final n = math.max(1, fx.particles);
    for (var i = 0; i < fx.particles; i++) {
      final p = _loop(time - (i % 4) * 0.06, 1.1 * fx.durMul);
      final op = p < 0.15 ? p / 0.15 : (1 - p) / 0.85;
      if (op <= 0) continue;
      final angle = (360 / n) * i * math.pi / 180;
      final scale = 1 - 0.6 * p;

      canvas.save();
      canvas.translate(center.dx, center.dy);
      canvas.rotate(angle);
      canvas.translate(0, -70 * p);
      canvas.scale(scale);
      // شظيّةٌ مثلّثة ١٠×٢٦ مركزها أسفلها
      final path = Path()
        ..moveTo(0, -13)
        ..lineTo(5, 13)
        ..lineTo(-5, 13)
        ..close();
      canvas.drawPath(
        path,
        Paint()
          ..shader = ui.Gradient.linear(
            const Offset(0, -13),
            const Offset(0, 13),
            [
              fx.c1.withValues(alpha: op),
              fx.c2.withValues(alpha: op),
            ],
          ),
      );
      canvas.restore();
    }
  }

  // ── 📺 تشويش: البطاقة تفقد الإشارة ──
  void _static(Canvas canvas, Size size) {
    // `steps(4)` — القيمة تقفز أربع قفزات لا تتدرّج
    final step = (_loop(time, 0.35 * fx.durMul) * 4).floor();
    final (op, dx) = switch (step) {
      0 => (0.18, 0.0),
      1 => (0.34, -2.0),
      2 => (0.12, 3.0),
      _ => (0.40, -1.0),
    };

    canvas.save();
    canvas.translate(dx, 0);
    final p = Paint()..color = fx.c1.withValues(alpha: op);
    // خطوطٌ أفقية بسُمك ١ كل ٣ بكسل
    for (var y = 0.0; y < size.height; y += 3) {
      canvas.drawRect(Rect.fromLTWH(-4, y, size.width + 8, 1), p);
    }
    canvas.restore();

    canvas.drawRect(_all(size),
        Paint()..color = fx.c2.withValues(alpha: 0.55 * fx.intensity));
  }

  @override
  bool shouldRepaint(_ElimPainter old) =>
      old.time != time || old.fx.design != fx.design;
}
