import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/ui/glass_tier.dart';
import '../../core/ui/glass_tokens.dart';
import 'bottom_nav.dart' show NavTab, navTabs, kCenterTab;
import 'native_glass.dart';

// ══════════════════════════════════════════════════════
// 🫧 شريط التنقّل الزجاجيّ — المنصّتان معاً، والمادّة بالدرجة
// ══════════════════════════════════════════════════════
// كبسولة طافية بمادّة شبيهة بـLiquid Glass في iOS 26، تنكمش عند التمرير
// للأسفل وتعود عند الصعود. الهندسة والحركة واحدة على المنصّتين (تُقرأ من
// GlassTokens حصراً)، والمادّة تتدرّج (قرار المالك — 95 §3):
//
//   iOS            زجاج النظام الأصليّ إن توفّر (26+)، وإلا المحاكاة.
//   أندرويد أ/ب    المحاكاة: ضبابٌ خلفيّ + تدرّج شفّاف + حافّة لامعة.
//   أندرويد ج      تعبئة شفيفة بلا أيّ BackdropFilter — نفس الهندسة
//                  حرفياً؛ درجة تابلتات النادي الضعيفة (قيد 11 §13 يعيش
//                  هنا لا كحظرٍ على المنصّة).
//
// ⚠️ المحاكاة ليست مادّة أبل الأصليّة: `UIGlassEffect` تُطبَّق على عناصر
//    UIKit وFlutter لا يرثها؛ ولا شيء في Flutter 3.44 يوفّرها.
//    الضباب يعمل لأن `extendBody: true` مضبوطة أصلاً فيمرّ المحتوى
//    الملوّن (بطاقة الترحيب الذهبية، خلايا الإحصاءات) خلف الشريط فعلاً.
//
// ⚠️ كسرُ تكافؤ الويب الموثَّق في 11 §4.6 صار يشمل المنصّتين (95 §4-ق2).

// أسماء محليّة قصيرة لعقد المواصفة — القيم وتعليلاتها المقيسة في
// glass_tokens.dart، وميزانية الارتفاع (78 ≤ 80 التي تحجزها الشاشات)
// موثَّقة هناك. تغيير أيّ رقم يقع هناك لا هنا.
const double _kRadius = GlassTokens.navRadius;
const double _kExpanded = GlassTokens.navExpanded;
const double _kCollapsed = GlassTokens.navCollapsed;

/// قطر الزرّ المركزيّ وارتفاعه فوق الكبسولة.
/// الارتفاع ١٦: أقلّ منه يبتلع الاندماجُ الدائرةَ فتصير نتوءاً باهتاً،
/// وأكثر منه ينفصل الجسمان فيضيع تمازج `UIGlassContainerEffect` —
/// ويتجاوز ميزانية الارتفاع.
const double _kCenterSize = GlassTokens.centerSize;
const double _kCenterLift = GlassTokens.centerLift;

class LiquidGlassNav extends StatefulWidget {
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

  static const _active = GlassTokens.active;
  static const _idle = GlassTokens.idle;

  @override
  State<LiquidGlassNav> createState() => _LiquidGlassNavState();
}

class _LiquidGlassNavState extends State<LiquidGlassNav> {
  /// null = لم يُحسم بعد؛ حتى يُحسم تُستعمل المحاكاة فلا يومض شيء.
  bool _native = false;

  @override
  void initState() {
    super.initState();
    NativeGlass.isAvailable().then((v) {
      if (mounted && v != _native) setState(() => _native = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final index = widget.index;
    final onTap = widget.onTap;
    final t = 1 - widget.collapsed; // 1 ممتدّة → 0 منكمشة
    final barH = lerpDouble(_kCollapsed, _kExpanded, t)!;
    // الدرجة الخفيفة «ج»: نفس الهندسة والحركة، مادّةٌ صلبة شفيفة بلا
    // أيّ BackdropFilter — يحرسها اختبارٌ في liquid_glass_nav_test.dart.
    final solid = GlassQuality.tier == GlassTier.lite;

    return SafeArea(
      top: false,
      // heightFactor إلزاميّ للسبب نفسه المشروح في bottom_nav.dart:
      // الـScaffold يمرّر قيوداً فضفاضة بارتفاع الشاشة.
      child: Center(
        heightFactor: 1,
        child: ConstrainedBox(
          // العرض يضيق مع الانكماش أيضاً لا الارتفاع وحده: كبسولةٌ تفقد
          // ثلث ارتفاعها وتحتفظ بعرضها كاملاً تبدو مقصوصةً لا منكمشة.
          constraints: BoxConstraints(maxWidth: lerpDouble(452, 512, t)!),
          child: Padding(
            // هوامش جانبية تجعلها «طافية» لا ملتصقة بالحواف، وتتّسع عند
            // الانكماش فيضيق الشريط بنسبةٍ توازي نقصان ارتفاعه.
            padding: EdgeInsets.fromLTRB(
              lerpDouble(38, 16, t)!, 0, lerpDouble(38, 16, t)!, 8),
            child: SizedBox(
              // الزرّ المركزيّ يعلو الكبسولة، فيُحجز له ارتفاعه هنا
              // وإلا قُصّ — العطل نفسه الموثَّق في الشريط الكلاسيكيّ.
              //
              // 🔴 عقدٌ مع Swift: الجانب الأصليّ يشتقّ ارتفاع الكبسولة من
              //    هذا الإطار (bar = h - centerLift) لأن creationParams لا
              //    تتحدّث. تغييرُ هذه المعادلة هنا يفصل الزجاج عن محتواه
              //    صامتاً — ويحرسها اختبارٌ في liquid_glass_nav_test.dart.
              key: const ValueKey('nav-frame'),
              height: barH + _kCenterLift,
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.bottomCenter,
                children: [
                  // الزجاج الأصليّ يملأ الإطار كلّه (كبسولة + دائرة)،
                  // ويرسم Flutter أيقوناته فوقه.
                  if (_native)
                    Positioned.fill(
                      child: NativeGlassBackdrop(
                        barHeight: barH,
                        radius: _kRadius,
                        centerSize: _kCenterSize,
                        centerLift: _kCenterLift,
                        // بلا صبغة: صبغُ الزجاج بالذهب يعطي كتلةً موحلة
                        // تبتلع الأيقونة. أزرار أبل الزجاجية نفسها بلا
                        // صبغة ورمزُها وحده ملوّن. الذهب هنا حلقةٌ حادّة
                        // يرسمها Flutter فوق الدائرة.
                        centerTint: null,
                        // زجاجٌ أشفّ — يُظهر الانكسار على ثيمنا الداكن
                        clearStyle: true,
                      ),
                    ),
                  _GlassCapsule(
                    height: barH,
                    // مع الزجاج الأصليّ تصير كبسولة Flutter شفّافة تماماً:
                    // وظيفتها التخطيط وحده، والمادّة من النظام.
                    transparent: _native,
                    solid: solid,
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
                      transparent: _native,
                      solid: solid,
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
/// وبدرجة «ج» (solid): نفس الكبسولة بتعبئةٍ شفيفة — **بلا BackdropFilter**.
class _GlassCapsule extends StatelessWidget {
  const _GlassCapsule({
    required this.height,
    required this.child,
    this.transparent = false,
    this.solid = false,
  });

  final double height;
  final Widget child;

  /// مع الزجاج الأصليّ: تخطيطٌ بلا مادّة — أي ضبابٍ هنا يطمس زجاج النظام.
  final bool transparent;

  /// الدرجة الخفيفة: تعبئة شفيفة معتمة تحجب ما تحتها بنفسها (لا ضباب
  /// يفعل ذلك عنها)، والحافّة اللامعة نفسها تحفظ الهوية.
  final bool solid;

  @override
  Widget build(BuildContext context) {
    if (transparent) {
      return SizedBox(height: height, child: child);
    }
    if (solid) {
      return Container(
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(_kRadius),
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: GlassTokens.navSolidGradient,
          ),
          border: Border.all(color: GlassTokens.rimLight, width: 0.8),
          boxShadow: const [
            BoxShadow(color: Color(0x99000000), blurRadius: 24, offset: Offset(0, 8)),
          ],
        ),
        child: child,
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(_kRadius),
        boxShadow: const [
          BoxShadow(color: Color(0x99000000), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_kRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(
              sigmaX: GlassTokens.navBlurSigma, sigmaY: GlassTokens.navBlurSigma),
          child: Container(
            height: height,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_kRadius),
              // زجاجٌ فوق ثيمٍ داكن: بياضٌ خفيف أعلى يخفت أسفل.
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: GlassTokens.navGlassGradient,
              ),
              // الحافّة اللامعة — أوضح ما يميّز المادّة عن مجرّد ضباب.
              border: Border.all(color: GlassTokens.rimLight, width: 0.8),
            ),
            child: child,
          ),
        ),
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
    this.transparent = false,
    this.solid = false,
    required this.tab,
    required this.active,
    required this.labelT,
    required this.onTap,
  });

  final bool transparent;

  /// الدرجة الخفيفة: دائرة صلبة بتدرّجها الذهبيّ/الداكن — بلا BackdropFilter.
  final bool solid;
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
        // مع الزجاج الأصليّ يرسم النظامُ الدائرةَ وصبغتَها، فلا يبقى
        // لـFlutter إلا الأيقونة — أيّ ضبابٍ أو تعبئة هنا يطمسه.
        child: widget.transparent
            // النظام يرسم الدائرة الزجاجيّة؛ ولـFlutter الحلقةُ والرمز.
            // حلقةٌ رفيعة حادّة تحفظ الهوية الذهبية بلا أن تُوحل الزجاج،
            // وتغلظ وتلمع حين يكون التبويب نشطاً.
            ? Container(
                width: _kCenterSize,
                height: _kCenterSize,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: a ? const Color(0xFFFBBF24) : const Color(0x66FBBF24),
                    width: a ? 1.8 : 1.0,
                  ),
                  boxShadow: a
                      ? const [BoxShadow(color: Color(0x4DFBBF24), blurRadius: 14)]
                      : null,
                ),
                child: Icon(
                  a ? Icons.verified_user : Icons.verified_user_outlined,
                  size: 26,
                  color: const Color(0xFFFBBF24),
                ),
              )
            : widget.solid
                // الدرجة الخفيفة: تعبئة صلبة بنفس الهندسة والهوية —
                // ذهبٌ ممتلئ نشطاً، داكنٌ بحلقة ذهبية خاملاً. لا ضباب.
                ? Container(
                    width: _kCenterSize,
                    height: _kCenterSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: a
                            ? GlassTokens.centerSolidActive
                            : GlassTokens.centerSolidIdle,
                      ),
                      border: Border.all(
                        color: a ? const Color(0xCCFBBF24) : const Color(0x59FBBF24),
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: a ? const Color(0x66FBBF24) : const Color(0x1FFBBF24),
                          blurRadius: a ? 20 : 10,
                        ),
                        const BoxShadow(
                            color: Color(0x80000000), blurRadius: 12, offset: Offset(0, 4)),
                      ],
                    ),
                    child: Icon(
                      a ? Icons.verified_user : Icons.verified_user_outlined,
                      size: 26,
                      color: a ? const Color(0xFF1A1206) : const Color(0xFFFBBF24),
                    ),
                  )
                : Container(
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
          child: ClipOval(
            child: BackdropFilter(
              filter: ImageFilter.blur(
                  sigmaX: GlassTokens.centerBlurSigma,
                  sigmaY: GlassTokens.centerBlurSigma),
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  // الذهب يبقى — لكنه هنا صبغةٌ فوق الزجاج لا تعبئة صمّاء.
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: a
                        ? const [Color(0xCCFBBF24), Color(0x99B45309)]
                        : const [Color(0x2EFFFFFF), Color(0x14FFFFFF)],
                  ),
                  border: Border.all(
                    color: a ? const Color(0xCCFBBF24) : const Color(0x59FBBF24),
                    width: 1.2,
                  ),
                ),
                child: Icon(
                  a ? Icons.verified_user : Icons.verified_user_outlined,
                  size: 26,
                  color: a ? const Color(0xFF1A1206) : const Color(0xFFFBBF24),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
