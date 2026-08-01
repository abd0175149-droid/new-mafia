import 'package:flutter/widgets.dart';

// ══════════════════════════════════════════════════════
// 📐 التكيّف مع الشاشات 6→11 إنش — §5.1
// ══════════════════════════════════════════════════════
// المرجع المعياريّ لكل ملفات الخطة. القيم **ملزمة**، والاجتهاد
// في شاشة واحدة يفصلها بصرياً عن باقي التطبيق.

enum WindowSizeClass { compact, medium, expanded }

WindowSizeClass sizeClassOf(double widthDp) => widthDp < 600
    ? WindowSizeClass.compact
    : (widthDp < 840 ? WindowSizeClass.medium : WindowSizeClass.expanded);

extension WindowSizeClassX on BuildContext {
  WindowSizeClass get sizeClass => sizeClassOf(MediaQuery.sizeOf(this).width);

  /// حواف الصفحة
  double get pagePadding => switch (sizeClass) {
        WindowSizeClass.compact => 16,
        WindowSizeClass.medium => 24,
        WindowSizeClass.expanded => 32,
      };

  /// المسافة بين الأقسام
  double get sectionGap => switch (sizeClass) {
        WindowSizeClass.compact => 16,
        WindowSizeClass.medium => 20,
        WindowSizeClass.expanded => 24,
      };

  /// سقف عرض النصّ والنماذج والقوائم — `infinity` يعني عرضاً كاملاً
  double get contentMaxWidth => switch (sizeClass) {
        WindowSizeClass.compact => double.infinity,
        WindowSizeClass.medium => 640,
        WindowSizeClass.expanded => 720,
      };

  /// سقف الصفحة كلّها — ما بعده هوامش سوداء متمركزة
  double get pageMaxWidth => switch (sizeClass) {
        WindowSizeClass.compact => double.infinity,
        WindowSizeClass.medium => 840,
        WindowSizeClass.expanded => 960,
      };

  /// 🎴 معامل عناصر اللعب الحسّاسة: البطاقة، المؤقّت الدائريّ، رقم
  /// المقعد، أزرار الليل والتصويت. **تُكبَّر ولا تُمطَّط** — تظلّ مقروءة
  /// عبر الطاولة.
  double get gameScale => switch (sizeClass) {
        WindowSizeClass.compact => 1.0,
        WindowSizeClass.medium => 1.25,
        WindowSizeClass.expanded => 1.5,
      };

  /// أدنى عرض لبلاطة لاعب/مقعد — تُستعمل مع maxCrossAxisExtent
  double get gridTileMinWidth => switch (sizeClass) {
        WindowSizeClass.compact => 100,
        WindowSizeClass.medium => 110,
        WindowSizeClass.expanded => 120,
      };

  /// الحوارات لا تتمدّد لعرض التابلت أبداً
  double get dialogMaxWidth => sizeClass == WindowSizeClass.expanded ? 512 : 448;

  double get bottomSheetMaxWidth =>
      sizeClass == WindowSizeClass.compact ? double.infinity : 640;

  /// تكبير خطّ النظام مقيَّد — بلا قيد يتجاوز اللقب حدود البطاقة
  /// ويلتفّ نصّ الأزرار سطرين.
  double get clampedTextScale =>
      MediaQuery.textScalerOf(this).scale(14) / 14 > 1.3 ? 1.3 : MediaQuery.textScalerOf(this).scale(14) / 14;
}

/// يقيّد عرض المحتوى ويمركزه — يلفّ جسم كل شاشة نصّية أو قوائمية.
class ContentConstraint extends StatelessWidget {
  const ContentConstraint({super.key, required this.child, this.maxWidth});

  final Widget child;
  final double? maxWidth;

  @override
  Widget build(BuildContext context) {
    final w = maxWidth ?? context.contentMaxWidth;
    if (w == double.infinity) return child;
    return Center(
      child: ConstrainedBox(constraints: BoxConstraints(maxWidth: w), child: child),
    );
  }
}

/// شبكة تكيّفية: الأعمدة ترتفع تلقائياً مع العرض بدل عدد ثابت.
///
/// القاعدة الذهبية: **الشبكات تتوسّع بالأعمدة لا بحجم الخلية** — خليّة
/// ممطوطة على تابلت تبدو خطأً، وثلاث خلايا بحجمها الطبيعيّ تبدو تصميماً.
class AdaptiveGrid extends StatelessWidget {
  const AdaptiveGrid({
    super.key,
    required this.children,
    this.spacing = 8,
    this.childAspectRatio = 1,
    this.tileWidthFactor = 1.3,
  });

  final List<Widget> children;
  final double spacing;
  final double childAspectRatio;
  final double tileWidthFactor;

  @override
  Widget build(BuildContext context) => GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: context.gridTileMinWidth * tileWidthFactor,
          mainAxisSpacing: spacing,
          crossAxisSpacing: spacing,
          childAspectRatio: childAspectRatio,
        ),
        itemCount: children.length,
        itemBuilder: (_, i) => children[i],
      );
}
