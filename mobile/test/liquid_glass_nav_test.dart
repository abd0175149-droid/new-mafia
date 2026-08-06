import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/ui/glass_tier.dart';
import 'package:mafia_club/features/shell/bottom_nav.dart';
import 'package:mafia_club/features/shell/liquid_glass_nav.dart';

// ══════════════════════════════════════════════════════
// 🫧 شريط التنقّل الزجاجيّ — المنصّتان بدرجات المادّة
// ══════════════════════════════════════════════════════
// الحارس تغيّر مع تعميم الكبسولة (95 §4): لم يعد «أندرويد بلا زجاج» بل
// **«الدرجة الخفيفة بلا أيّ BackdropFilter»** — هي درجة تابلتات النادي
// الضعيفة، وقيد 11 §13 يعيش فيها حرفياً. تسرّب ضبابٍ إليها يعني سقوط
// إطارات في يد كلّ لاعب على تلك الأجهزة — عطلٌ لا تُظهره لقطة شاشة.
// والهندسة نفسها (الكبسولة والانكماش) صارت ثابت الهوية على المنصّتين.

/// غلافٌ يحاكي ما يفعله ShellScreen: كبسولة سفلية تستمع لتمرير الجسم.
class _Harness extends StatefulWidget {
  const _Harness();

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
          body: NotificationListener<UserScrollNotification>(
              onNotification: _onScroll, child: body),
          bottomNavigationBar: AnimatedBuilder(
            animation: _c,
            builder: (_, __) =>
                LiquidGlassNav(index: 0, onTap: (_) {}, collapsed: _c.value),
          ),
        ),
      ),
    );
  }
}

void main() {
  tearDown(() {
    GlassQuality.overrideForTest(null);
  });

  testWidgets('الدرجة الخفيفة «ج»: الكبسولة حاضرة وصفر BackdropFilter — حارس التابلتات',
      (tester) async {
    GlassQuality.overrideForTest(GlassTier.lite);
    await tester.pumpWidget(const _Harness());
    await tester.pumpAndSettle();

    // الهندسة موحّدة: الكبسولة نفسها لا شريطَ بديلاً.
    expect(find.byType(LiquidGlassNav), findsOneWidget);
    // الضمانة الفعليّة: لا ضباب حيّ في الشجرة كلّها (قيد 11 §13).
    expect(find.byType(BackdropFilter), findsNothing);
  });

  testWidgets('درجة «ب» على أندرويد: الكبسولة بمادّة الضباب', (tester) async {
    GlassQuality.overrideForTest(GlassTier.mid);
    await tester.pumpWidget(const _Harness());
    await tester.pumpAndSettle();

    expect(find.byType(LiquidGlassNav), findsOneWidget);
    expect(find.byType(BackdropFilter), findsWidgets);
  });

  testWidgets('iOS: الكبسولة بمادّتها الكاملة', (tester) async {
    GlassQuality.overrideForTest(GlassTier.full);
    await tester.pumpWidget(const _Harness());
    await tester.pumpAndSettle();

    expect(find.byType(LiquidGlassNav), findsOneWidget);
    expect(find.byType(BackdropFilter), findsWidgets);
  });

  testWidgets('التبويبات الخمسة وتسمياتها حاضرة ممتدّةً — على الدرجتين',
      (tester) async {
    for (final tier in [GlassTier.full, GlassTier.lite]) {
      GlassQuality.overrideForTest(tier);
      await tester.pumpWidget(const _Harness());
      await tester.pumpAndSettle();

      for (final t in navTabs) {
        expect(find.text(t.label), findsOneWidget,
            reason: 'التسمية ${t.label} غائبة على درجة $tier');
      }
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('التمرير للأسفل يطوي الشريط، والصعود يعيده', (tester) async {
    GlassQuality.overrideForTest(GlassTier.full);
    await tester.pumpWidget(const _Harness());
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

  testWidgets('سلوك الانكماش نفسه على الدرجة الخفيفة — الحركة ثابت هوية',
      (tester) async {
    GlassQuality.overrideForTest(GlassTier.lite);
    await tester.pumpWidget(const _Harness());
    await tester.pumpAndSettle();

    double navHeight() => tester.getSize(find.byType(LiquidGlassNav)).height;
    final expanded = navHeight();
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(navHeight(), lessThan(expanded));
  });

  _contractTests();

  testWidgets('لا فيضان تخطيط في أيّ من الحالتين', (tester) async {
    GlassQuality.overrideForTest(GlassTier.full);
    await tester.pumpWidget(const _Harness());
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
// فتُثبَّت هنا. (قيم الهندسة نفسها صارت في glass_tokens.dart — عقد
// المواصفة المشترك بين المنصّتين.)
void _contractTests() {
  testWidgets('إطار الشريط = ارتفاع الكبسولة + ارتفاع الزرّ، ويتقلّص بالانكماش',
      (tester) async {
    GlassQuality.overrideForTest(GlassTier.full);
    await tester.pumpWidget(const _Harness());
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
    // القيمة مقيَّدة بميزانية الارتفاع في glass_tokens.dart: مجموع
    // الشريط يجب أن يبقى دون الـ80 التي تحجزها الشاشات.
    expect(expanded - collapsed, closeTo(14, 0.5),
        reason: 'Swift يعتمد أن الفارق كلَّه من الكبسولة لا من الزرّ');
    expect(collapsed, lessThan(expanded));
  });
}
