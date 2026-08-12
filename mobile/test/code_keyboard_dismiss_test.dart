import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

// ══════════════════════════════════════════════════════
// ⌨️ إغلاق لوحة الأرقام في شاشة كود الغرفة
// ══════════════════════════════════════════════════════
// 🔴 لماذا يوجد هذا الملفّ: على iOS لوحة `TextInputType.number` **بلا زرّ
//    Return**، وحقل الكود `autofocus`. فبلا مخرجٍ صريح تبقى اللوحة عالقةً
//    ولا سبيل لإخفائها — بلاغُ المالك من الجهاز الحقيقيّ (12 آب).
//    على أندرويد يغلقها زرّ الرجوع، فالعلّة تخصّ iOS وحده لكنّ العلاج مشترك.
//
// المخرجان المزروعان في `game_screen.dart`:
//   ① لمسةٌ في أيّ فراغٍ خارج الحقل → `unfocus`
//   ② اكتمال الخانات الأربع → `unfocus` تلقائيّ
//
// الشاشة الحقيقيّة تحتاج جلسةً ومتحكّماً وشبكة، فيُعاد بناء **العقد
// السلوكيّة** نفسها هنا: المحرس على المنطق لا على البكسل.

/// نسخةٌ مصغّرة تحاكي عقدَي `_Shell` و`_codeStep`.
class _CodeHarness extends StatefulWidget {
  const _CodeHarness();

  @override
  State<_CodeHarness> createState() => _CodeHarnessState();
}

class _CodeHarnessState extends State<_CodeHarness> {
  final _code = TextEditingController();
  String value = '';

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        // العقد ①
        body: GestureDetector(
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          behavior: HitTestBehavior.translucent,
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 104),
                child: Column(children: [
                  const SizedBox(height: 200),
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    autofocus: true,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(4),
                    ],
                    // العقد ②
                    onChanged: (v) {
                      setState(() => value = v);
                      if (v.length == 4) FocusScope.of(context).unfocus();
                    },
                  ),
                ]),
              ),
            ),
          ),
        ),
      );
}

void main() {
  testWidgets('لمسةٌ خارج الحقل تُغلق لوحة المفاتيح', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: _CodeHarness()));
    await tester.pumpAndSettle();

    final field = find.byType(TextField);
    expect(tester.testTextInput.isVisible, isTrue,
        reason: 'autofocus يفتح اللوحة عند الدخول');

    // 🔴 `tapAt` لا `tap(byKey)`: الفراغ ليس ودجةً تلتقط اللمس — والمقصود
    //    بالضبط أن تسقط اللمسة في اللاشيء فيلتقطها الأب `translucent`.
    //    الضغط على ودجةٍ وسيطة كان ينجح مصادفةً ويُخفي ما نختبره.
    await tester.tapAt(const Offset(400, 60));
    await tester.pumpAndSettle();

    expect(tester.testTextInput.isVisible, isFalse,
        reason: 'المخرج الوحيد على iOS — لوحة الأرقام بلا زرّ Return');
    // الحقل نفسه ما يزال موجوداً ولم يُفقَد المكتوب.
    expect(field, findsOneWidget);
  });

  testWidgets('اكتمال أربع خاناتٍ يُغلق اللوحة تلقائياً', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: _CodeHarness()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '123');
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isTrue,
        reason: 'ثلاث خاناتٍ ناقصة — اللوحة تبقى');

    await tester.enterText(find.byType(TextField), '1234');
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse,
        reason: 'الكود أربع خاناتٍ بالضبط: اكتماله يُنهي الحاجة للوحة');

    final state = tester.state<_CodeHarnessState>(find.byType(_CodeHarness));
    expect(state.value, '1234', reason: 'الإغلاق لا يبتلع آخر خانة');
  });

  testWidgets('اللمس داخل الحقل لا يُغلق اللوحة', (tester) async {
    // 🔴 حارسُ الانحدار المقابل: لو صار `behavior` مُبهماً (`opaque`) أو
    //    التقط الأب لمسةَ الحقل، لصار إدخال الكود مستحيلاً — علاجٌ أسوأ
    //    من العلّة.
    await tester.pumpWidget(const MaterialApp(home: _CodeHarness()));
    await tester.pumpAndSettle();

    // 🔴 `tapAt` لا `tap(byKey)`: الفراغ ليس ودجةً تلتقط اللمس — والمقصود
    //    بالضبط أن تسقط اللمسة في اللاشيء فيلتقطها الأب `translucent`.
    //    الضغط على ودجةٍ وسيطة كان ينجح مصادفةً ويُخفي ما نختبره.
    await tester.tapAt(const Offset(400, 60));
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse);

    await tester.tap(find.byType(TextField));
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isTrue,
        reason: 'الحقل يستعيد التركيز — الأب لا يبتلع لمساته');
  });
}
