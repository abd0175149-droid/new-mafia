import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/shell/bottom_nav.dart';
import 'package:mafia_club/features/shell/liquid_glass_nav.dart';

// ══════════════════════════════════════════════════════
// 🫧 شريط التنقّل الزجاجيّ — iOS وحده
// ══════════════════════════════════════════════════════
// الضمانة الأهمّ ليست شكل الزجاج بل **أن الأندرويد لم يتغيّر**: الشريط
// الزجاجيّ يحمل BackdropFilter، والملفّ 11 §13 رفض الـblur صراحةً لأن
// تابلتات النادي ضعيفة. تسرّبه إلى الأندرويد يعني سقوط إطاراتٍ في يد
// كلّ لاعب — عطلٌ لا يظهر في أيّ لقطة شاشة على الماك.

/// غلافٌ يحاكي ما يفعله ShellScreen: شريطٌ سفليّ يستمع لتمرير الجسم.
class _Harness extends StatefulWidget {
  const _Harness({required this.platform});
  final TargetPlatform platform;

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  }

  bool get _glass => widget.platform == TargetPlatform.iOS;

  bool _onScroll(UserScrollNotification n) {
    if (n.metrics.axis != Axis.vertical) return false;
    if (n.direction == ScrollDirection.reverse) {
      _c.forward();
    } else if (n.direction == ScrollDirection.forward) {
      _c.reverse();
    }
    return false;
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final body = ListView.builder(
      itemCount: 60,
      itemBuilder: (_, i) => SizedBox(height: 60, child: Text('صف $i')),
    );
    return MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          extendBody: true,
          body: _glass
              ? NotificationListener<UserScrollNotification>(
                  onNotification: _onScroll, child: body)
              : body,
          bottomNavigationBar: _glass
              ? AnimatedBuilder(
                  animation: _c,
                  builder: (_, __) =>
                      LiquidGlassNav(index: 0, onTap: (_) {}, collapsed: _c.value),
                )
              : MafiaBottomNav(index: 0, onTap: (_) {}),
        ),
      ),
    );
  }
}

void main() {
  testWidgets('الأندرويد لا يرى الشريط الزجاجيّ ولا أيّ BackdropFilter',
      (tester) async {
    await tester.pumpWidget(const _Harness(platform: TargetPlatform.android));
    await tester.pumpAndSettle();

    expect(find.byType(MafiaBottomNav), findsOneWidget);
    expect(find.byType(LiquidGlassNav), findsNothing);
    // الضمانة الفعليّة: لا ضباب حيّ في الشجرة كلّها.
    expect(find.byType(BackdropFilter), findsNothing);
  });

  testWidgets('iOS يرى الشريط الزجاجيّ ولا يرى الكلاسيكيّ', (tester) async {
    await tester.pumpWidget(const _Harness(platform: TargetPlatform.iOS));
    await tester.pumpAndSettle();

    expect(find.byType(LiquidGlassNav), findsOneWidget);
    expect(find.byType(MafiaBottomNav), findsNothing);
    expect(find.byType(BackdropFilter), findsWidgets);
  });

  testWidgets('التبويبات الخمسة وتسمياتها حاضرة ممتدّةً', (tester) async {
    await tester.pumpWidget(const _Harness(platform: TargetPlatform.iOS));
    await tester.pumpAndSettle();

    for (final t in navTabs) {
      expect(find.text(t.label), findsOneWidget);
    }
  });

  testWidgets('التمرير للأسفل يطوي الشريط، والصعود يعيده', (tester) async {
    await tester.pumpWidget(const _Harness(platform: TargetPlatform.iOS));
    await tester.pumpAndSettle();

    double navHeight() => tester.getSize(find.byType(LiquidGlassNav)).height;
    final expanded = navHeight();

    // تمرير لأسفل (المحتوى يصعد) ⇒ انكماش
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    final collapsed = navHeight();
    expect(collapsed, lessThan(expanded),
        reason: 'الشريط يجب أن ينكمش عند التمرير للأسفل');

    // التسميات تختفي بصرياً وإن بقيت في الشجرة (طيٌّ بـheightFactor لا حذف)
    final opacity = tester.widget<Opacity>(
      find.ancestor(of: find.text(navTabs.first.label), matching: find.byType(Opacity)).first,
    );
    expect(opacity.opacity, lessThan(0.05));

    // والصعود يعيده
    await tester.drag(find.byType(ListView), const Offset(0, 300));
    await tester.pumpAndSettle();
    expect(navHeight(), greaterThan(collapsed));
  });

  _contractTests();

  testWidgets('لا فيضان تخطيط في أيّ من الحالتين', (tester) async {
    await tester.pumpWidget(const _Harness(platform: TargetPlatform.iOS));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await tester.pumpAndSettle();
    // العطل التاريخيّ في الشريط الكلاسيكيّ: الزرّ المركزيّ المرتفع
    // يطالب بارتفاعٍ لا يملكه الشريط ⇒ BOTTOM OVERFLOWED.
    expect(tester.takeException(), isNull);
  });
}

// ══════════════════════════════════════════════════════
// 🔗 العقد بين Flutter وSwift
// ══════════════════════════════════════════════════════
// الجانب الأصليّ (LiquidGlassPlatformView.swift) يشتقّ ارتفاع الكبسولة
// من إطار العرض: `bar = bounds.height - centerLift`. اضطُرّ إلى ذلك لأن
// `creationParams` تُقرأ مرّة واحدة عند الإنشاء ولا تتحدّث مع إعادة بناء
// الودجت — فبقيت 60 بينما ينكمش الإطار، فانزلقت الكبسولة وانفصل الزجاج
// عن محتواه (رآه المالك على المحاكي).
//
// أي أن معادلة ارتفاع الإطار هنا صارت **واجهةً برمجية** لكودٍ أصليّ لا
// تراه اختبارات Flutter. تغييرها يكسر الزجاج صامتاً على الجهاز وحده،
// فتُثبَّت هنا.
void _contractTests() {
  testWidgets('إطار الشريط = ارتفاع الكبسولة + ارتفاع الزرّ، ويتقلّص بالانكماش',
      (tester) async {
    await tester.pumpWidget(const _Harness(platform: TargetPlatform.iOS));
    await tester.pumpAndSettle();

    final frame = find.byKey(const ValueKey('nav-frame'));
    expect(frame, findsOneWidget);
    final expanded = tester.getSize(frame).height;

    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    final collapsed = tester.getSize(frame).height;

    // الفارق هو فارق ارتفاعَي الكبسولة بالضبط (56 ← 42)، لأن ارتفاع
    // الزرّ ثابت. إن اختلّ هذا اختلّت هندسة الزجاج الأصليّ معه.
    //
    // القيمة مقيَّدة بميزانية الارتفاع في liquid_glass_nav.dart: مجموع
    // الشريط يجب أن يبقى دون الـ80 التي تحجزها الشاشات.
    expect(expanded - collapsed, closeTo(14, 0.5),
        reason: 'Swift يعتمد أن الفارق كلَّه من الكبسولة لا من الزرّ');
    expect(collapsed, lessThan(expanded));
  });
}
