import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/app/config.dart';
import 'package:mafia_club/core/api/api_client.dart';
import 'package:mafia_club/features/games/games_widgets.dart';
import 'package:mafia_club/features/profile/profile_palette.dart';
import 'package:mafia_club/models/activity.dart';

// ══════════════════════════════════════════════════════
// 🧪 أشرطة التقدّم تُرسم فعلاً
// ══════════════════════════════════════════════════════
// حارسٌ على علّة شحنتُها في أربعة أماكن ولم أرها: `DecoratedBox` بلا ابن
// داخل `FractionallySizedBox` داخل `Stack` يأخذ `constraints.smallest` —
// أي **ارتفاع صفر**. الشريط يُبنى ويُخطَّط ويُرسم، ولا يظهر منه شيء.
// لم ينكشف لأن كل قيمة صادفتها على الجهاز كانت 0٪: الخبرة صفر، وRR صفر.
// أوّل نشاطٍ فيه حجوزات كشفه.
//
// الاختبار يقيس **مستطيل التعبئة** لا وجودها.

void main() {
  setUpAll(() => ApiClient.instance.init(AppConfig.prod));

  Future<void> pump(WidgetTester t, Widget child) => t.pumpWidget(MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: Center(child: child)),
        ),
      ));

  /// أوّل `DecoratedBox` ذي تدرّج داخل الشجرة = التعبئة.
  Size fillSize(WidgetTester t) {
    final f = find.byWidgetPredicate((w) =>
        w is DecoratedBox &&
        w.decoration is BoxDecoration &&
        (w.decoration as BoxDecoration).gradient != null);
    expect(f, findsWidgets, reason: 'لا يوجد عنصر تعبئة أصلاً');
    return t.getSize(f.first);
  }

  testWidgets('شريط التقدّم يملأ ارتفاعه كاملاً', (t) async {
    await pump(t, const SizedBox(
      width: 200,
      child: ProgressBar(value: 0.5, color: Color(0xFFFBBF24), height: 10),
    ));
    await t.pumpAndSettle();

    final s = fillSize(t);
    expect(s.height, 10, reason: '🔴 ارتفاع صفر = شريط غير مرئيّ');
    expect(s.width, closeTo(100, 0.5), reason: 'نصف العرض عند 50٪');
  });

  testWidgets('صفر بالمئة لا يرسم عرضاً — وهي الحالة التي أخفت العلّة', (t) async {
    await pump(t, const SizedBox(
      width: 200,
      child: ProgressBar(value: 0, color: Color(0xFFFBBF24), height: 10),
    ));
    await t.pumpAndSettle();
    expect(fillSize(t).width, 0);
  });

  testWidgets('المئة بالمئة تملأ العرض', (t) async {
    await pump(t, const SizedBox(
      width: 200,
      child: ProgressBar(value: 1, color: Color(0xFFFBBF24), height: 10),
    ));
    await t.pumpAndSettle();
    expect(fillSize(t).width, closeTo(200, 0.5));
  });

  testWidgets('شريط سعة النشاط يملأ ارتفاعه', (t) async {
    await pump(
      t,
      ActivityCard(
        activity: Activity(
          id: 1,
          name: 'اختبار',
          date: DateTime(2026, 8, 5, 20),
          bookedCount: 6,
          maxPlayers: 12,
        ),
        booked: false,
        busy: false,
        bookersOpen: false,
        onOpen: () {},
        onBook: () {},
        onEnterRoom: (_) {},
        onToggleBookers: () {},
      ),
    );
    await t.pumpAndSettle();

    // أوّل تدرّج في البطاقة هو تعبئة شريط السعة (زرّ «احجز» يليه)
    final f = find.byWidgetPredicate((w) =>
        w is DecoratedBox &&
        w.decoration is BoxDecoration &&
        (w.decoration as BoxDecoration).gradient != null);
    final s = t.getSize(f.first);
    expect(s.height, 6, reason: '🔴 ارتفاع صفر = شريط سعة غير مرئيّ');
    expect(s.width, closeTo(70, 1), reason: 'نصف الـ140 عند 6/12');
  });
}
