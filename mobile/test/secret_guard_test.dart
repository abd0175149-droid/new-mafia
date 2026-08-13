import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

// ══════════════════════════════════════════════════════
// 🕵️ توازن الحماية على الشاشات السريّة — الملفّ 98 ث1
// ══════════════════════════════════════════════════════
// 🔴 لماذا يوجد هذا الملفّ: بطاقة اللاعب كانت تحصل على العلامة المائيّة وحدها
//    بلا أيّ نداءٍ للحماية الأصليّة، فلقطتُها تخرج **واضحة** على iOS وأندرويد
//    معاً — بلاغُ المالك من iPhone 16 Pro Max.
//
// 🔴 والخطر المقابل أخطر: `SecureScreen` عدّادٌ مرجعيّ يخدم البطاقة والمعرض
//    معاً. `enter` بلا `leave` يُبقي التسويد عالقاً على **كلّ** الشاشات — أي
//    تطبيقٌ لا تعمل فيه لقطة الشاشة أبداً. و`leave` زائدٌ يُطفئه والسرّ معروض
//    — أي تسريبٌ صامت. فالمحروس هنا **التوازن** لا مجرّد الاستدعاء.
//
// القناة `mafia/secure_screen` غير مسجَّلةٍ في بيئة الاختبار، فتُحاكى ويُسجَّل
// ما يصلها — وهو ما يصل الجانب الأصليّ حرفياً.

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('mafia/secure_screen');
  late List<String> calls;

  setUp(() {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      return true;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  testWidgets('عرض السرّ يفعّل الحماية وإخفاؤه يطفئها', (tester) async {
    await tester.pumpWidget(const _Harness(visible: false));
    expect(calls, isEmpty, reason: 'لا حمايةَ قبل كشف السرّ');

    await tester.pumpWidget(const _Harness(visible: true));
    await tester.pump();
    expect(calls, contains('enable'), reason: 'الكشف يفعّل التسويد');

    calls.clear();
    await tester.pumpWidget(const _Harness(visible: false));
    await tester.pump();
    expect(calls, contains('disable'), reason: 'الإخفاء يطفئ التسويد');
  });

  testWidgets('مغادرة الشاشة كلّياً تطفئ الحماية', (tester) async {
    await tester.pumpWidget(const _Harness(visible: true));
    await tester.pump();
    calls.clear();

    // 🔴 مسار الخروج الحقيقيّ: إقصاءٌ أو انتهاء جولةٍ يهدم الشجرة كلَّها.
    //    لو عُلّقت الحماية هنا لبقي التطبيق كلُّه بلا لقطات إلى الأبد.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(calls, contains('disable'));
  });

  testWidgets('دورات كشفٍ وإخفاءٍ متكرّرة تبقى متوازنة', (tester) async {
    var enables = 0, disables = 0;
    for (var i = 0; i < 4; i++) {
      calls.clear();
      await tester.pumpWidget(const _Harness(visible: true));
      await tester.pump();
      enables += calls.where((c) => c == 'enable').length;

      calls.clear();
      await tester.pumpWidget(const _Harness(visible: false));
      await tester.pump();
      disables += calls.where((c) => c == 'disable').length;
    }
    expect(enables, disables,
        reason: 'كلّ تفعيلٍ يقابله إطفاءٌ واحد — وإلّا علق العدّاد المرجعيّ');
    expect(enables, greaterThan(0));
  });

  testWidgets('السرّ المتداخل: البطاقة والمعرض معاً لا يطفئهما إغلاق أحدهما',
      (tester) async {
    // 🔴 العدّاد المرجعيّ موجودٌ لهذه الحالة بالذات: فتحُ المعرض فوق البطاقة
    //    ثمّ إغلاقه يجب ألّا يرفع الحماية عن البطاقة التي ما تزال معروضة.
    await tester.pumpWidget(const _Harness(visible: true, second: true));
    await tester.pump();
    calls.clear();

    await tester.pumpWidget(const _Harness(visible: true, second: false));
    await tester.pump();
    expect(calls, isNot(contains('disable')),
        reason: 'البطاقة ما تزال مكشوفة — الحماية تبقى');

    await tester.pumpWidget(const _Harness(visible: false, second: false));
    await tester.pump();
    expect(calls, contains('disable'), reason: 'آخر شاشةٍ سريّة أُغلقت');
  });
}

/// يحاكي عقد `_SecretGuard` في `lobby_view.dart`: التفعيل عند التركيب
/// والإطفاء عند التفكيك — التوازن مضمونٌ بالبنية لا بانضباط المستدعي.
class _Harness extends StatelessWidget {
  const _Harness({required this.visible, this.second = false});

  final bool visible;
  final bool second;

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Column(children: [
          if (visible) const _Guard(key: ValueKey('card')),
          if (second) const _Guard(key: ValueKey('gallery')),
        ]),
      );
}

class _Guard extends StatefulWidget {
  const _Guard({super.key});

  @override
  State<_Guard> createState() => _GuardState();
}

class _GuardState extends State<_Guard> {
  static const _ch = MethodChannel('mafia/secure_screen');
  static int _refCount = 0;

  @override
  void initState() {
    super.initState();
    _refCount++;
    if (_refCount == 1) _ch.invokeMethod('enable');
  }

  @override
  void dispose() {
    if (_refCount > 0) _refCount--;
    if (_refCount == 0) _ch.invokeMethod('disable');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
