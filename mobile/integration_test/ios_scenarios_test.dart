import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mafia_club/app/config.dart';
import 'package:mafia_club/main.dart' as app;

// ══════════════════════════════════════════════════════
// 🍎 سيناريوهات تحقّق iOS على جهازٍ حقيقيّ — الملفّ 97 §5
// ══════════════════════════════════════════════════════
// يقود الواجهة **ويقف عند كلّ محطّة** كي تُلتقط لقطةُ نظامٍ من الخارج:
// الكبسولة الزجاجيّة عرضٌ أصليّ (UIKit) لا يظهر في لقطات محرّك Flutter،
// فالتحقّق البصريّ يحتاج لقطة النظام لا لقطة الإطار.
//
// 🔴 بلا `traceAction`: يحتاج خدمة VM التي لا تتوفّر عبر `flutter test`،
//    وسقوطُه كان يُفشل الاختبار كلَّه بعد نجاح مراحله. القياس الزمنيّ
//    يحتاج `flutter drive --no-dds` — شأنٌ منفصل عن هذه السيناريوهات.

const _phone = '0789154719';
const _pass = '9154719';

/// وقفةٌ تكفي لالتقاط لقطةٍ من الخارج.
const _pose = Duration(seconds: 6);

Future<void> _wait(WidgetTester t, Duration d) async {
  final end = DateTime.now().add(d);
  while (DateTime.now().isBefore(end)) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('ج1/ج3/ج10 — الكبسولة والأوراق واللقطات', (tester) async {
    app.bootstrap(AppConfig.dev);
    await _wait(tester, const Duration(seconds: 10));

    // ── تسجيل الدخول إن كانت الجلسة غائبة ──
    final loginEntry = find.text('تسجيل الدخول');
    if (loginEntry.evaluate().isNotEmpty) {
      await tester.tap(loginEntry.first, warnIfMissed: false);
      await _wait(tester, const Duration(seconds: 2));

      final fields = find.byType(TextField);
      if (fields.evaluate().length >= 2) {
        await tester.enterText(fields.at(0), _phone);
        await _wait(tester, const Duration(seconds: 1));
        await tester.enterText(fields.at(1), _pass);
        await _wait(tester, const Duration(seconds: 1));

        final go = find.text('دخول');
        if (go.evaluate().isNotEmpty) {
          await tester.tap(go.first, warnIfMissed: false);
        }
        // الدخول يمرّ بالشبكة — مهلةٌ سخيّة قبل الحكم.
        await _wait(tester, const Duration(seconds: 12));
      }
    }

    debugPrint('📸 محطّة ١ — الرئيسيّة بالكبسولة (ج1 + ج10-أ)');
    await _wait(tester, _pose);

    // ── ج1: الانكماش والعودة ──
    final scroll = find.byType(Scrollable);
    if (scroll.evaluate().isNotEmpty) {
      await tester.drag(scroll.first, const Offset(0, -320));
      await _wait(tester, const Duration(seconds: 2));
      debugPrint('📸 محطّة ٢ — الكبسولة منكمشة (ج1)');
      await _wait(tester, _pose);

      await tester.drag(scroll.first, const Offset(0, 320));
      await _wait(tester, const Duration(seconds: 2));
      debugPrint('📸 محطّة ٣ — الكبسولة عادت ممتدّة (ج1)');
      await _wait(tester, _pose);
    }

    // ── ج3: ورقةٌ فوق الكبسولة (جرس الإشعارات) ──
    final bell = find.text('🔔');
    if (bell.evaluate().isNotEmpty) {
      await tester.tap(bell.first, warnIfMissed: false);
      await _wait(tester, const Duration(seconds: 3));
      debugPrint('📸 محطّة ٤ — ورقة سفليّة فوق الكبسولة (ج3 — نزيف الطبقات)');
      await _wait(tester, const Duration(seconds: 8));

      final sheets = find.byType(Scrollable);
      if (sheets.evaluate().isNotEmpty) {
        await tester.drag(sheets.last, const Offset(0, 420));
        await _wait(tester, const Duration(seconds: 2));
      }
    } else {
      debugPrint('⚠️ الجرس غير موجود — تُخطّى ج3');
    }

    // ── ج3: المنيو من الشريط السفليّ (الطلبات) ──
    final order = find.text('الألعاب');
    if (order.evaluate().isNotEmpty) {
      await tester.tap(order.first, warnIfMissed: false);
      await _wait(tester, const Duration(seconds: 4));
      debugPrint('📸 محطّة ٥ — تبويب الألعاب (ج10-ب)');
      await _wait(tester, _pose);
    }

    debugPrint('✅ انتهت المحطّات');
    expect(tester.takeException(), isNull);
  });
}
