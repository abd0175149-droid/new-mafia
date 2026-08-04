import 'dart:ui';

import 'package:flutter/material.dart';

import 'bottom_nav.dart' show NavTab, navTabs, kCenterTab;
import 'glass_material.dart';

// ══════════════════════════════════════════════════════
// 🫧 شريط التنقّل الزجاجيّ — iOS وحده
// ══════════════════════════════════════════════════════
// كبسولة طافية بمادّة شبيهة بـLiquid Glass في iOS 26، تنكمش عند التمرير
// للأسفل وتعود عند الصعود. **الأندرويد لا يراها إطلاقاً** — يبقى على
// `MafiaBottomNav` حرفياً (اختيار المنصّة في shell_screen.dart).
//
// ⚠️ ليست مادّة أبل الأصليّة. `UIGlassEffect` تُطبَّق على عناصر UIKit،
//    وFlutter يرسم واجهته بنفسه فلا يرثها؛ ولا شيء في Flutter 3.44 يوفّرها.
//    هذه محاكاة: ضبابٌ خلفيّ + تدرّج شفّاف + حافّة لامعة.
//
// ⚠️ هذا يكسر عمداً تكافؤ الويب الموثَّق في 11-shell-navigation.md §4.6
//    (الذي ينصّ على «يُستغنى عن الـblur») — قرار المالك، وحُصر في iOS
//    لأن سبب الرفض هناك كان تابلتات الأندرويد الضعيفة في النادي (§13).
//    الضباب يعمل هنا لأن `extendBody: true` مضبوطة أصلاً فيمرّ المحتوى
//    الملوّن (بطاقة الترحيب الذهبية، خلايا الإحصاءات) خلف الشريط فعلاً.

/// نصف قطر الحوافّ — كبسولة كاملة الاستدارة.
const double _kRadius = 34;

/// ارتفاع محتوى الكبسولة: ممتدّة ← منكمشة.
const double _kExpanded = 60;
const double _kCollapsed = 48;

/// قطر الزرّ المركزيّ وارتفاعه فوق الكبسولة.
const double _kCenterSize = 56;
const double _kCenterLift = 18;

class LiquidGlassNav extends StatelessWidget {
  const LiquidGlassNav({
    super.key,
    required this.index,
    required this.onTap,
    required this.collapsed,
  });

  final int index;
  final void Function(int) onTap;

  /// 0 = ممتدّة بتسمياتها، 1 = منكمشة إلى أيقونات وحدها.
  final double collapsed;

  static const _active = Color(0xFFFBBF24);
  static const _idle = Color(0xFF9CA3AF);

  @override
  Widget build(BuildContext context) {
    final t = 1 - collapsed; // 1 ممتدّة → 0 منكمشة
    final barH = lerpDouble(_kCollapsed, _kExpanded, t)!;

    return SafeArea(
      top: false,
      // heightFactor إلزاميّ للسبب نفسه المشروح في bottom_nav.dart:
      // الـScaffold يمرّر قيوداً فضفاضة بارتفاع الشاشة.
      child: Center(
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 512),
          child: Padding(
            // هوامش جانبية تجعلها «طافية» لا ملتصقة بالحواف
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: SizedBox(
              // الزرّ المركزيّ يعلو الكبسولة، فيُحجز له ارتفاعه هنا
              // وإلا قُصّ — العطل نفسه الموثَّق في الشريط الكلاسيكيّ.
              height: barH + _kCenterLift,
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.bottomCenter,
                children: [
                  _GlassCapsule(
                    height: barH,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        for (var i = 0; i < navTabs.length; i++)
                          // الزرّ المركزيّ يطفو فوق الكبسولة، وتسميته
                          // تبقى داخلها في خانته كي تحاذي بقيّة التسميات.
                          i == kCenterTab
                              ? _GlassTab(
                                  tab: navTabs[i],
                                  active: index == i,
                                  labelT: t,
                                  onTap: () => onTap(i),
                                  iconInsteadPlaceholder: true,
                                )
                              : _GlassTab(
                                  tab: navTabs[i],
                                  active: index == i,
                                  labelT: t,
                                  onTap: () => onTap(i),
                                ),
                      ],
                    ),
                  ),
                  Positioned(
                    bottom: barH - _kCenterSize + _kCenterLift,
                    child: _GlassCenterTab(
                      tab: navTabs[kCenterTab],
                      active: index == kCenterTab,
                      labelT: t,
                      onTap: () => onTap(kCenterTab),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// المادّة الزجاجيّة: ضبابٌ لما خلفها، تدرّجٌ شفّاف، وحافّة لامعة.
class _GlassCapsule extends StatelessWidget {
  const _GlassCapsule({required this.height, required this.child});

  final double height;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(_kRadius),
        boxShadow: const [
          BoxShadow(color: Color(0x99000000), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      child: GlassSurface(
        borderRadius: BorderRadius.circular(_kRadius),
        // ضبابٌ أخفّ من الزجاج المُثلَج القديم — الانكسار هو البطل هنا.
        blurSigma: 10,
        refract: 26,
        rimWidth: 22,
        specular: 0.32,
        tint: 0.55,
        // تدرّجٌ خفيفٌ جداً: الشيدر يتكفّل بالكثافة، والإفراط هنا يطمس
        // الانكسار فيعود اللوح الشفّاف الذي نهرب منه.
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x14FFFFFF), Color(0x05FFFFFF)],
        ),
        child: SizedBox(height: height, child: child),
      ),
    );
  }
}

class _GlassTab extends StatelessWidget {
  const _GlassTab({
    required this.tab,
    required this.active,
    required this.labelT,
    required this.onTap,
    this.iconInsteadPlaceholder = false,
  });

  final NavTab tab;
  final bool active;
  final double labelT;
  final VoidCallback onTap;

  /// خانة الزرّ المركزيّ: تسميةٌ بلا أيقونة (الأيقونة في الزرّ الطافي).
  final bool iconInsteadPlaceholder;

  @override
  Widget build(BuildContext context) {
    final c = active ? LiquidGlassNav._active : LiquidGlassNav._idle;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 56,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            iconInsteadPlaceholder
                ? const SizedBox(height: 22) // مكان الأيقونة لتحاذي التسميات
                : Icon(tab.icon, size: 22, color: c),
            // Align بمعامل ارتفاع يطوي التسمية إلى صفر بلا overflow —
            // الطيّ بحذف الودجت يقفز، وبـheight ثابت يفيض.
            Align(
              alignment: Alignment.topCenter,
              heightFactor: labelT,
              child: Opacity(
                opacity: labelT,
                child: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(
                    tab.label,
                    style: TextStyle(
                      fontFamily: 'Tajawal',
                      fontSize: 10,
                      color: c,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// الزرّ المركزيّ «ادخل» — زجاجيّ بلمسة ذهبية تُبقيه العنصر الأبرز.
class _GlassCenterTab extends StatefulWidget {
  const _GlassCenterTab({
    required this.tab,
    required this.active,
    required this.labelT,
    required this.onTap,
  });

  final NavTab tab;
  final bool active;
  final double labelT;
  final VoidCallback onTap;

  @override
  State<_GlassCenterTab> createState() => _GlassCenterTabState();
}

class _GlassCenterTabState extends State<_GlassCenterTab> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final a = widget.active;
    return GestureDetector(
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _down ? 0.9 : 1,
        duration: const Duration(milliseconds: 100),
        child: Container(
          width: _kCenterSize,
          height: _kCenterSize,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: a ? const Color(0x66FBBF24) : const Color(0x1FFBBF24),
                blurRadius: a ? 20 : 10,
              ),
              const BoxShadow(color: Color(0x80000000), blurRadius: 12, offset: Offset(0, 4)),
            ],
          ),
          // دائرةٌ = مستطيلٌ نصف قطره نصف ضلعه، فيسري عليها الشيدر نفسه.
          // انكسارها أقوى نسبياً: الجسم الصغير المحدّب يحني أكثر.
          child: GlassSurface(
            borderRadius: BorderRadius.circular(_kCenterSize / 2),
            blurSigma: 8,
            refract: 18,
            rimWidth: 14,
            specular: a ? 0.20 : 0.38,
            tint: 0.35,
            borderColor: a ? const Color(0xCCFBBF24) : const Color(0x59FBBF24),
            // الذهب صبغةٌ فوق الزجاج لا تعبئة صمّاء.
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: a
                  ? const [Color(0xB8FBBF24), Color(0x8FB45309)]
                  : const [Color(0x1FFFFFFF), Color(0x0AFFFFFF)],
            ),
            child: Icon(
              a ? Icons.verified_user : Icons.verified_user_outlined,
              size: 26,
              color: a ? const Color(0xFF1A1206) : const Color(0xFFFBBF24),
            ),
          ),
        ),
      ),
    );
  }
}
