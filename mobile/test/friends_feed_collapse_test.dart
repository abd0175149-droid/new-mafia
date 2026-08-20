import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/home/home_screen.dart';
import 'package:mafia_club/models/home.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ══════════════════════════════════════════════════════
// 👥 طيّ قسم أخبار الأصدقاء — بطلب المالك
// ══════════════════════════════════════════════════════
// 🔴 المحروس **بقاءُ الاختيار** لا مجرّد الطيّ: قسمٌ طواه اللاعب ثمّ عاد
//    مفتوحاً في الزيارة التالية يصير إزعاجاً يتكرّر كلّ مرّة — وهو أسوأ
//    من غياب الطيّ أصلاً.
//
// 🔴 وأنّ المحتوى **لا يُرسم قبل قراءة التفضيل**: ظهورٌ ثمّ طيٌّ فوريّ يبدو
//    وميضاً في كلّ فتحةٍ للرئيسيّة.

const _kOpen = 'home_feed_open';

List<FriendSession> _items() => [
      FriendSession(
          playerId: 1, playerName: 'سامي', matchCount: 3, date: DateTime(2026, 8, 10)),
      FriendSession(
          playerId: 2, playerName: 'ليان', matchCount: 1, date: DateTime(2026, 8, 9)),
    ];

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // 🔴 `DateFormat('… ar_JO')` يحتاج بيانات اللغة — بلا تهيئتها ترمي
  //    الودجة عند البناء، والخطأ يبدو عطلاً في الطيّ وهو ليس منه.
  setUpAll(() => initializeDateFormatting('ar_JO'));

  testWidgets('يبدأ مفتوحاً بلا تفضيلٍ محفوظ', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(_wrap(FriendsFeedSection(items: _items())));
    await tester.pumpAndSettle();

    expect(find.text('سامي'), findsOneWidget);
  });

  testWidgets('الضغط على الترويسة يطوي ويفتح', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(_wrap(FriendsFeedSection(items: _items())));
    await tester.pumpAndSettle();

    await tester.tap(find.text('👥 أخبار أصدقائك'));
    await tester.pumpAndSettle();
    expect(find.text('سامي'), findsNothing, reason: 'الطيّ يُخفي المحتوى');

    await tester.tap(find.text('👥 أخبار أصدقائك'));
    await tester.pumpAndSettle();
    expect(find.text('سامي'), findsOneWidget, reason: 'والضغط ثانيةً يفتح');
  });

  testWidgets('التفضيل المحفوظ «مطويّ» يُحترم عند الفتح', (tester) async {
    // 🔴 جوهر الطلب: الاختيار يبقى.
    SharedPreferences.setMockInitialValues({_kOpen: false});
    await tester.pumpWidget(_wrap(FriendsFeedSection(items: _items())));
    await tester.pumpAndSettle();

    expect(find.text('سامي'), findsNothing,
        reason: 'قسمٌ طُوي يجب ألّا يعود مفتوحاً في الزيارة التالية');
    // الترويسة تبقى ظاهرةً كي يمكن فتحه.
    expect(find.text('👥 أخبار أصدقائك'), findsOneWidget);
  });

  testWidgets('الطيّ يُكتب في التخزين', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(_wrap(FriendsFeedSection(items: _items())));
    await tester.pumpAndSettle();

    await tester.tap(find.text('👥 أخبار أصدقائك'));
    await tester.pumpAndSettle();

    final p = await SharedPreferences.getInstance();
    expect(p.getBool(_kOpen), isFalse);
  });

  testWidgets('العدّاد يظهر مطويّاً ومفتوحاً — نظرةٌ بلا فتح', (tester) async {
    SharedPreferences.setMockInitialValues({_kOpen: false});
    await tester.pumpWidget(_wrap(FriendsFeedSection(items: _items())));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
  });
}
