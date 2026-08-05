import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mafia_club/app/config.dart';
import 'package:mafia_club/main.dart' as app;

// ══════════════════════════════════════════════════════
// 📱 اختبار الشريط الزجاجيّ على جهازٍ حقيقيّ
// ══════════════════════════════════════════════════════
// اختبارات الودجت تعمى عن الزجاج الأصليّ: هو عرض UIKit يُركَّب خارج مشهد
// Flutter، فلا يظهر في شجرة الودجت ولا في لقطات محرّك Flutter. لذلك يقود
// هذا الاختبار الواجهة **ويقف عند كل حالة ثوانيَ** كي تُلتقط لقطةُ نظامٍ
// حقيقية من الخارج (pymobiledevice3) تُظهر ما يراه المستخدم فعلاً.
//
// والأهمّ أنه يقيس زمن الإطارات على العتاد الحقيقيّ: كلفةُ Platform View
// تظهر على خيط الرسم (raster) لا على خيط الواجهة، ولا تُقاس على المحاكي.

/// مهلة وقوفٍ تكفي لالتقاط لقطةٍ من الخارج.
const _pose = Duration(seconds: 6);

Future<void> _settle(WidgetTester t, {Duration d = const Duration(seconds: 2)}) async {
  final end = DateTime.now().add(d);
  while (DateTime.now().isBefore(end)) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('الشريط الزجاجيّ: حالات وأداء على الجهاز', (tester) async {
    app.bootstrap(AppConfig.dev);
    await _settle(tester, d: const Duration(seconds: 8));

    // ── ① الحالة الممتدّة ──
    debugPrint('🟢 المرحلة ١: ممتدّ — التقط الآن');
    await _settle(tester, d: _pose);

    // ── ② التمرير حتى الانكماش ──
    final scrollable = find.byType(Scrollable);
    if (scrollable.evaluate().isNotEmpty) {
      await tester.drag(scrollable.first, const Offset(0, -400));
      await _settle(tester);
      debugPrint('🟢 المرحلة ٢: منكمش — التقط الآن');
      await _settle(tester, d: _pose);

      // ── ③ العودة إلى الممتدّ ──
      await tester.drag(scrollable.first, const Offset(0, 400));
      await _settle(tester);
      debugPrint('🟢 المرحلة ٣: عاد ممتدّاً — التقط الآن');
      await _settle(tester, d: _pose);
    } else {
      debugPrint('⚠️ لا عنصر قابل للتمرير — تُخطّى مراحل الانكماش');
    }

    // ── ④ نزيف الطبقات: ورقة سفلية فوق الشريط ──
    // نبحث عن أيّ زرّ أيقونة في الترويسة (الجرس) ونفتح صندوق الوارد.
    final bell = find.byIcon(Icons.notifications_outlined);
    final anyIconBtn = find.byType(IconButton);
    final target = bell.evaluate().isNotEmpty
        ? bell
        : (anyIconBtn.evaluate().isNotEmpty ? anyIconBtn.first : null);

    if (target != null) {
      await tester.tap(target, warnIfMissed: false);
      await _settle(tester);
      debugPrint('🔴 المرحلة ٤: ورقة سفلية مفتوحة — التقط الآن (اختبار النزيف)');
      await _settle(tester, d: const Duration(seconds: 8));
      // إغلاقها بسحبها لأسفل
      await tester.drag(find.byType(Scrollable).last, const Offset(0, 500));
      await _settle(tester);
    } else {
      debugPrint('⚠️ لم يُعثر على زرّ يفتح ورقة — يُختبر النزيف يدوياً');
    }

    // ── ⑤ قياس الأداء أثناء تمريرٍ متتابع ──
    if (scrollable.evaluate().isNotEmpty) {
      await binding.traceAction(
        () async {
          for (var i = 0; i < 6; i++) {
            await tester.fling(scrollable.first, const Offset(0, -350), 3000);
            await _settle(tester, d: const Duration(milliseconds: 900));
            await tester.fling(scrollable.first, const Offset(0, 350), 3000);
            await _settle(tester, d: const Duration(milliseconds: 900));
          }
        },
        reportKey: 'scroll_timeline',
      );
      debugPrint('📊 قياس الأداء اكتمل');
    }

    expect(tester.takeException(), isNull);
  });
}
