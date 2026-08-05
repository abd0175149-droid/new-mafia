import 'dart:ui' as ui;

import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🫧 المادّة الزجاجيّة — انكسارٌ عدسيّ لا ضبابٌ وحده
// ══════════════════════════════════════════════════════
// الفرق بين «زجاجٍ» و«لوحٍ شفّاف مضبَّب» هو الانكسار عند الحافّة. الضباب
// وحده يعطي لوحاً؛ الانكسار يعطي جسماً له سُمك. الشيدر في
// shaders/liquid_glass.frag يفعل ذلك، وهذا الملفّ يحمّله ويطبّقه.
//
// السقوط الآمن مقصود: الشيدر يتطلّب Impeller، ويُحمَّل لا تزامنياً. حتى
// يجهز — أو إن لم يكن مدعوماً — تُستعمل مادّة الضباب وحدها. أي أن فشل
// الشيدر يعني مظهراً أبسط، لا شاشةً سوداء ولا انهياراً.

/// يحمّل برنامج الشيدر مرّة واحدة ويشاركه كلّ المستعملين.
class GlassShader {
  GlassShader._();

  static ui.FragmentProgram? _program;
  static Future<void>? _loading;
  static bool _failed = false;

  static bool get isReady => _program != null;
  static bool get isSupported =>
      ui.ImageFilter.isShaderFilterSupported && !_failed;

  /// يبدأ التحميل إن لم يكن بدأ. يُنادى من initState بلا await.
  static Future<void> ensureLoaded() {
    if (_program != null || _failed) return Future.value();
    return _loading ??= ui.FragmentProgram.fromAsset('shaders/liquid_glass.frag')
        .then<void>((p) => _program = p)
        .catchError((Object e) {
      // لا نُسقط الواجهة لأجل تأثير بصريّ.
      debugPrint('⚠️ تعذّر تحميل شيدر الزجاج: $e');
      _failed = true;
    });
  }

  /// مرشِّح الانكسار، أو null إن لم يكن جاهزاً/مدعوماً.
  static ui.ImageFilter? filter({
    required double radius,
    required double rimWidth,
    required double refract,
    required double specular,
    required double tint,
  }) {
    final p = _program;
    if (p == null || !isSupported) return null;
    final s = p.fragmentShader()
      // 0 و1 محجوزان لـuSize — يضبطهما المحرّك بحجم النسيج.
      ..setFloat(2, radius)
      ..setFloat(3, rimWidth)
      ..setFloat(4, refract)
      ..setFloat(5, specular)
      ..setFloat(6, tint);
    return ui.ImageFilter.shader(s);
  }
}

/// سطحٌ زجاجيّ: ضبابٌ خفيف ثمّ انكسارٌ عدسيّ عند الحافّة.
///
/// الضباب هنا **أخفّ** ممّا في زجاج iOS القديم المُثلَج: مادّة أبل الجديدة
/// شفّافةٌ أكثر ويغلب عليها الانكسار لا الطمس.
class GlassSurface extends StatefulWidget {
  const GlassSurface({
    super.key,
    required this.borderRadius,
    required this.child,
    this.blurSigma = 10,
    this.refract = 26,
    this.rimWidth = 22,
    this.specular = 0.30,
    this.tint = 0.5,
    this.borderColor = const Color(0x40FFFFFF),
    this.gradient,
  });

  final BorderRadius borderRadius;
  final Widget child;
  final double blurSigma;
  final double refract;
  final double rimWidth;
  final double specular;
  final double tint;
  final Color borderColor;
  final Gradient? gradient;

  @override
  State<GlassSurface> createState() => _GlassSurfaceState();
}

class _GlassSurfaceState extends State<GlassSurface> {
  @override
  void initState() {
    super.initState();
    // التحميل لا تزامنيّ: نُعيد البناء عند الجهوز كي يظهر الانكسار
    // بدل الضباب وحده. `mounted` واقٍ من الجهوز بعد التخلّص.
    if (!GlassShader.isReady && GlassShader.isSupported) {
      GlassShader.ensureLoaded().then((_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final blurSigma = widget.blurSigma;
    final borderRadius = widget.borderRadius;
    final blur = ui.ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma);
    // الشيدر يقيس بالبكسل الفيزيائيّ بينما القيم هنا منطقيّة.
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final lens = GlassShader.filter(
      radius: borderRadius.topLeft.x * dpr,
      rimWidth: widget.rimWidth * dpr,
      refract: widget.refract * dpr,
      specular: widget.specular,
      tint: widget.tint,
    );

    // الضباب أولاً ثمّ الانكسار: العدسة تحني صورةً مضبَّبة أصلاً،
    // وهو ترتيب الزجاج الحقيقيّ (السُّمك يشتّت ثمّ السطح يكسر).
    final filter = lens == null
        ? blur
        : ui.ImageFilter.compose(outer: lens, inner: blur);

    return ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: filter,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: borderRadius,
            gradient: widget.gradient,
            border: Border.all(color: widget.borderColor, width: 0.8),
          ),
          child: widget.child,
        ),
      ),
    );
  }
}

/// عنصرٌ زجاجيّ صغير: زرّ، جراب، شريحة، بطاقة.
///
/// إعداداته أخفّ من إعدادات الشريط السفليّ عمداً — الضباب الثقيل على
/// عنصرٍ بعرض ٤٠ نقطة يبتلعه، والانكسار القويّ يشوّه أيقونته. وهي **ودجت
/// Flutter عادية لا Platform View**: تُركَّب طبيعياً بلا شقّ للمشهد، فيجوز
/// تكرارها في القوائم — خلافاً لزجاج النظام الأصليّ في الشريط السفليّ.
class GlassChip extends StatelessWidget {
  const GlassChip({
    super.key,
    required this.child,
    this.radius = 999,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    this.borderColor = const Color(0x2EFFFFFF),
    this.tintColor,
    this.onTap,
  });

  final Widget child;
  final double radius;
  final EdgeInsets padding;
  final Color borderColor;

  /// صبغةٌ خفيفة تحفظ دلالة اللون (ذهبيّ للتشبس، أحمر للتنبيه…).
  final Color? tintColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final surface = GlassSurface(
      borderRadius: BorderRadius.circular(radius),
      blurSigma: 7,
      refract: 12,
      rimWidth: 10,
      specular: 0.26,
      tint: 0.38,
      borderColor: borderColor,
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: tintColor == null
            ? const [Color(0x1AFFFFFF), Color(0x08FFFFFF)]
            : [tintColor!.withValues(alpha: 0.20), tintColor!.withValues(alpha: 0.07)],
      ),
      child: Padding(padding: padding, child: child),
    );
    if (onTap == null) return surface;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: surface,
    );
  }
}
