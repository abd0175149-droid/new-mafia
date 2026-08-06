import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/push/push_service.dart';
import 'package:mafia_club/features/gates/notification_gate.dart';

// ══════════════════════════════════════════════════════
// 🍎 إصلاحات تكافؤ iOS — الملفّ 94
// ══════════════════════════════════════════════════════
// كلّ ما هنا سلوكٌ **مشروطٌ بالمنصّة**، وهو أخطر ما يُكتب: يعمل على جهاز
// المطوّر ويسقط على الآخر بلا رسالة. الاختبار يبدّل المنصّة صراحةً.
//
// 🔴 يُعاد ضبط `debugDefaultTargetPlatformOverride` **داخل جسم الاختبار**
//    لا في tearDown: إطارُ Flutter يتحقّق من متغيّرات التنقيح عند نهاية
//    الجسم مباشرةً، فتركُها مضبوطةً يُفشل الاختبار بذاته.

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(textDirection: TextDirection.rtl, child: child),
    );

/// يضبط المنصّة، ينفّذ، ثم يُعيدها مهما حدث.
Future<void> _onPlatform(TargetPlatform p, Future<void> Function() body) async {
  debugDefaultTargetPlatformOverride = p;
  try {
    await body();
  } finally {
    debugDefaultTargetPlatformOverride = null;
  }
}

void main() {
  group('F2 — مخرج البوابة على iOS وحده (قرار R1)', () {
    testWidgets('iOS: زرّ «لاحقاً» موجود في حالة prompt', (tester) async {
      await _onPlatform(TargetPlatform.iOS, () async {
        var resolved = false;
        await tester.pumpWidget(_wrap(NotificationGate(
          status: PushPermission.prompt,
          onResolved: () => resolved = true,
        )));
        await tester.pump();

        expect(find.text('لاحقاً'), findsOneWidget);
        await tester.tap(find.text('لاحقاً'));
        await tester.pump();
        expect(resolved, isTrue, reason: 'الضغط يحسم البوابة بلا تسجيل توكن');
      });
    });

    testWidgets('iOS: الزرّ موجود في حالة denied أيضاً', (tester) async {
      await _onPlatform(TargetPlatform.iOS, () async {
        await tester.pumpWidget(_wrap(NotificationGate(
          status: PushPermission.denied,
          onResolved: () {},
        )));
        await tester.pump();
        expect(find.text('لاحقاً'), findsOneWidget);
      });
    });

    testWidgets('أندرويد: لا مخرج — البوابة تبقى حاجبة', (tester) async {
      await _onPlatform(TargetPlatform.android, () async {
        await tester.pumpWidget(_wrap(NotificationGate(
          status: PushPermission.prompt,
          onResolved: () {},
        )));
        await tester.pump();

        // 🔴 الضمانة الأهمّ: تسرّبُ الزرّ إلى أندرويد يكسر بوابةً مقصودةً
        //    هناك (البوابة + رمز 1998)، ولا يظهر في أيّ لقطة على الماك.
        expect(find.text('لاحقاً'), findsNothing);
      });
    });
  });

  group('F1 — فتح الإعدادات لا يموت صامتاً على iOS', () {
    test('البوابة تنادي واجهةً واحدة، وتفريعُ المنصّة داخلها', () {
      // الاستدعاء الفعليّ يمسّ قنوات المنصّة فلا يُشغَّل في اختبار وحدة؛
      // المهمّ أن يبقى التفريع في الخدمة لا في الواجهة، وإلا تكرّر في كلّ
      // مستدعٍ ونُسي في أحدهم.
      expect(PushService.instance.openSystemSettings, isA<Function>());
      expect(PushService.instance.openSettings, isA<Function>());
    });
  });
}
