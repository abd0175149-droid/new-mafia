import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/ui/in_app_banner.dart';

// ══════════════════════════════════════════════════════
// 📣 ORDER-3 — بانر الإشعار الداخليّ
// ══════════════════════════════════════════════════════
// 🔴 لماذا يوجد هذا الملفّ: النسخة الأولى استعملت
//    `late final AnimationController _anim = AnimationController(...)`.
//    والبانر **لا يُبنى محتواه غالباً** (لا إشعار طوال الجلسة)، فتبقى
//    `late` غير مهيّأة، ثمّ يستدعيها `dispose` فتُنشأ **وقت التفكيك**
//    والشجرة تُهدَم:
//      «Looking up a deactivated widget's ancestor is unsafe»
//
//    وهي علّةٌ وقعت في هذا المشروع من قبل (متحكّم حركةٍ في شريط التنقّل)
//    وتكرّرت هنا — ولم يمسكها إلّا سيناريو الجهاز. هذا الحارس يمسكها في
//    ثوانٍ بدل بناءٍ ودورةِ تثبيتٍ على iPhone.

void main() {
  testWidgets('التركيب ثمّ التفكيك بلا أيّ إشعار لا يرمي', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Stack(children: [InAppBanner()]),
    ));
    await tester.pump();

    // 🔴 هذا هو المسار القاتل: لا إشعار ⇒ لا محتوى ⇒ `late` لم تُلمس.
    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull,
        reason: 'تهيئةُ متحكّمٍ وقت dispose تبحث عن سلفٍ مفكَّك');
  });

  testWidgets('تفكيكٌ متكرّر آمن', (tester) async {
    for (var i = 0; i < 3; i++) {
      await tester.pumpWidget(const MaterialApp(
        home: Stack(children: [InAppBanner()]),
      ));
      await tester.pump();
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'الدورة ${i + 1}');
    }
  });

  testWidgets('بلا إشعار لا يرسم شيئاً ولا يحجب اللمس', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Stack(children: [InAppBanner()]),
    ));
    await tester.pump();

    // 🔴 لا `Positioned` ولا سطحٌ يعترض اللمس: البانر يعلو كلّ الشاشة في
    //    الغلاف، فأيّ شيءٍ يرسمه وهو خاملٌ يبتلع لمسات المستخدم.
    expect(find.descendant(
      of: find.byType(InAppBanner),
      matching: find.byType(Positioned),
    ), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
