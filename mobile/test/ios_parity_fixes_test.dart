import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/app/app_state.dart';
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
        // 🔴 هذا الاختبار كان يحرس الخطأ نفسه: أكّد أن الضغط يستدعي
        //    `onResolved` — وهي إعادةُ تقييمٍ للإذن الذي لم يتغيّر، فتعود
        //    البوّابة ويبقى المستخدم محبوساً. المخرج يحتاج `onSkip` صريحاً.
        var resolved = false;
        var skipped = false;
        await tester.pumpWidget(_wrap(NotificationGate(
          status: PushPermission.prompt,
          onResolved: () => resolved = true,
          onSkip: () => skipped = true,
        )));
        await tester.pump();

        expect(find.text('لاحقاً'), findsOneWidget);
        await tester.tap(find.text('لاحقاً'));
        await tester.pump();
        expect(skipped, isTrue, reason: 'الضغط يتخطّى البوّابة بلا تسجيل توكن');
        expect(resolved, isFalse,
            reason: 'إعادةُ التقييم وحدها لا تفتح البوّابة — كانت هي العلّة');
      });
    });

    testWidgets('iOS: الزرّ موجود في حالة denied أيضاً', (tester) async {
      await _onPlatform(TargetPlatform.iOS, () async {
        await tester.pumpWidget(_wrap(NotificationGate(
          status: PushPermission.denied,
          onResolved: () {},
          onSkip: () {},
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
          onSkip: () {},
        )));
        await tester.pump();

        // 🔴 الضمانة الأهمّ: تسرّبُ الزرّ إلى أندرويد يكسر بوابةً مقصودةً
        //    هناك (البوابة + رمز 1998)، ولا يظهر في أيّ لقطة على الماك.
        expect(find.text('لاحقاً'), findsNothing);
      });
    });
  });

  group('GATE-1 — التخطّي يفتح البوّابة فعلاً لا شكلاً', () {
    // 🔴 اختبار الودجة أعلاه يثبت أن الزرّ يُنادي `onSkip`، ولا يثبت أن
    //    البوّابة تُفتح. الفجوة بين النداء والأثر هي بالضبط ما أخفى العلّة
    //    الأصليّة عاماً: الزرّ كان يُنادي شيئاً، لكنّ `gatePassed` تبقى false.
    test('gatePassed تصير صحيحةً بعد skipGate ورغم بقاء الإذن مرفوضاً', () async {
      final app = AppState.instance;
      expect(app.gatePassed, isFalse,
          reason: 'الحالة الابتدائيّة prompt — البوّابة حاجبة');

      await app.skipGate();
      expect(app.gatePassed, isTrue,
          reason: 'التخطّي يفتح البوّابة وإن لم يتغيّر الإذن — جوهر الإصلاح');
    });

    test('الخروج يُلغي التخطّي — الحساب التالي يُسأل', () {
      final app = AppState.instance;
      app.onLoggedOut();
      expect(app.gatePassed, isFalse,
          reason: 'تخطٍّ يورَّث لحسابٍ آخر يعني بوّابةً لا تعمل أبداً');
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
