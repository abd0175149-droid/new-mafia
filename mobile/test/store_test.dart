import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/store/item_sheet.dart';
import 'package:mafia_club/models/store.dart';

// ══════════════════════════════════════════════════════
// 🧪 خزنة الدون — الملفّ 33
// ══════════════════════════════════════════════════════

StoreItem item(Map<String, dynamic> j) => StoreItem.fromJson({
      'id': 1,
      'kind': 'frame',
      'nameAr': 'إطار',
      'isPurchasable': true,
      ...j,
    });

StoreData data(List<Map<String, dynamic>> items, {int balance = 0}) =>
    StoreData.fromJson({'items': items, 'balance': balance});

void main() {
  group('العروض', () {
    test('«عروض» = ما يستحقّ الالتفات ولا يملكه', () {
      final d = data([
        {'id': 1, 'isHot': true, 'isPurchasable': true},
        {'id': 2, 'isNew': true, 'isPurchasable': true},
        {'id': 3, 'wasOwned': true, 'isPurchasable': true},
        {'id': 4, 'isPurchasable': true}, // بلا شارة
        {'id': 5, 'isHot': true, 'isPurchasable': true, 'owned': true},
        {'id': 6, 'isHot': true, 'isPurchasable': false}, // إنجاز
        {'id': 7, 'isHot': true, 'isPurchasable': true, 'closed': true},
      ]);
      expect(d.offers.map((o) => o.id), [1, 2, 3]);
    });

    test('مقصوصة عند ستّة', () {
      final d = data([
        for (var i = 1; i <= 9; i++)
          {'id': i, 'isNew': true, 'isPurchasable': true},
      ]);
      expect(d.offers.length, 6);
    });

    test('🔴 ما ظهر في «عروض» يُستبعد من تبويب نوعه — لا بطاقة مرّتين', () {
      final d = data([
        {'id': 1, 'kind': 'frame', 'isNew': true, 'isPurchasable': true},
        {'id': 2, 'kind': 'frame', 'isPurchasable': true},
      ]);
      expect(d.offers.map((o) => o.id), [1]);
      expect(d.ofKind('frame').map((o) => o.id), [2]);
    });

    test('المقفلة خارج التبويبات وفي الخزنة المقفلة', () {
      final d = data([
        {'id': 1, 'kind': 'frame', 'closed': true, 'isPurchasable': true},
        {'id': 2, 'kind': 'frame', 'isPurchasable': true},
      ]);
      expect(d.ofKind('frame').map((o) => o.id), [2]);
      expect(d.closedVault.map((o) => o.id), [1]);
    });
  });

  group('السعر والمدّة', () {
    test('أرخص متاحٍ يتجاهل المملوك والمقفل وغير القابل للشراء', () {
      final d = data([
        {'id': 1, 'kind': 'frame', 'priceChips': 90, 'isPurchasable': true},
        {'id': 2, 'kind': 'frame', 'priceChips': 20, 'isPurchasable': true, 'owned': true},
        {'id': 3, 'kind': 'frame', 'priceChips': 30, 'isPurchasable': true, 'closed': true},
        {'id': 4, 'kind': 'frame', 'priceChips': 10, 'isPurchasable': false},
        {'id': 5, 'kind': 'frame', 'priceChips': 40, 'isPurchasable': true},
      ]);
      expect(d.cheapestOf('frame'), 40);
      expect(d.cheapestOf('title'), isNull);
    });

    test('يومٌ ناقص لا يصير صفراً — التقريب لأعلى', () {
      final soon = DateTime.now().add(const Duration(hours: 5));
      expect(item({'expiresAt': soon.toUtc().toIso8601String()}).daysLeft, 1);
      expect(item({}).daysLeft, 0);
    });

    // 🔴 «90 أيام» خطأٌ نحويّ يقرؤه كلّ لاعب — التمييز يتغيّر بالعدد
    test('تمييز العدد: مفرد ومثنّى وجمع قلّة ومفردٌ منصوب', () {
      expect(arabicDays(1), 'يوم');
      expect(arabicDays(2), 'يومان');
      expect(arabicDays(3), '3 أيام');
      expect(arabicDays(10), '10 أيام');
      expect(arabicDays(11), '11 يوماً');
      expect(arabicDays(30), '30 يوماً');
      expect(arabicDays(90), '90 يوماً');
    });

    test('المتبقّي يمرّ عبر تمييز العدد', () {
      final d1 = DateTime.now().add(const Duration(hours: 5));
      final d3 = DateTime.now().add(const Duration(days: 2, hours: 5));
      final d30 = DateTime.now().add(const Duration(days: 29, hours: 5));
      expect(item({'expiresAt': d1.toUtc().toIso8601String()}).daysLeftText, 'يوم');
      expect(item({'expiresAt': d3.toUtc().toIso8601String()}).daysLeftText, '3 أيام');
      expect(item({'expiresAt': d30.toUtc().toIso8601String()}).daysLeftText, '30 يوماً');
    });

    test('السعر اليوميّ بمنزلة — والمقارنة ممكنة', () {
      expect(item({'priceChips': 35, 'durationDays': 30}).perDayText, '1.2');
      expect(item({'priceChips': 35}).perDayText, isNull);
      expect(item({'durationDays': 30}).perDayText, isNull);
    });
  });

  group('المُجهَّز', () {
    test('🔴 الخادم يردّ كائناً لكلّ خانة لا معرّفاً', () {
      final c = EquippedCosmetics.fromJson({
        'frame': {'itemId': 7, 'nameAr': 'إطار'},
        'title': null,
        'nameFx': {'itemId': 3},
      });
      expect(c.frameId, 7);
      expect(c.titleId, isNull);
      expect(c.nameFxId, 3);
      expect(c.isEquipped(item({'id': 7, 'kind': 'frame'})), isTrue);
      expect(c.isEquipped(item({'id': 3, 'kind': 'frame'})), isFalse);
    });

    test('خانةٌ بلا itemId تُقرأ فارغة لا صفراً', () {
      final c = EquippedCosmetics.fromJson({'frame': <String, dynamic>{}});
      expect(c.frameId, isNull);
    });
  });

  test('بثّ الرصيد يحدّث الرقم وحده', () {
    final d = data([
      {'id': 1, 'isNew': true, 'isPurchasable': true},
    ], balance: 10);
    final after = d.copyWithBalance(475);
    expect(after.balance, 475);
    expect(after.items.length, d.items.length);
    expect(after.offers.map((o) => o.id), d.offers.map((o) => o.id));
  });

  // ══════════════════════════════════════════════════════
  // 🔴 الانحدار: نصٌّ بلا `Material` فوقه يرث النمط الاحتياطيّ
  //    (`decoration: underline` بلونٍ أصفر مزدوج) فيظهر خطّ أصفر تحت
  //    العنوان وتحت رمز المصغّر. حدث فعلاً في احتفال الشراء.
  // ══════════════════════════════════════════════════════
  testWidgets('احتفال الشراء بلا خطٍّ أصفر تحت النصّ', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => TextButton(
          onPressed: () => showPurchaseCelebration(
              ctx, item({'nameAr': 'رصاص ونحاس', 'durationDays': 30})),
          child: const Text('افتح'),
        ),
      ),
    ));
    await t.tap(find.text('افتح'));
    await t.pumpAndSettle();

    expect(find.textContaining('صار «رصاص ونحاس» لك'), findsOneWidget);

    // النمط الفعّال بعد الدمج مع `DefaultTextStyle` — لا النمط المكتوب
    for (final r in t.widgetList<RichText>(find.byType(RichText))) {
      expect(r.text.style?.decoration ?? TextDecoration.none,
          TextDecoration.none,
          reason: 'نصٌّ ورث خطّ النمط الاحتياطيّ: «${r.text.toPlainText()}»');
    }
  });

  // 🔴 «صار «كذا» لك» لمن كان يملكه أصلاً — الرسالة الخطأ في التجديد
  testWidgets('التجديد يقول «مُدِّد» لا «صار لك»', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => TextButton(
          onPressed: () => showPurchaseCelebration(
              ctx, item({'nameAr': 'رصاص ونحاس', 'durationDays': 30}),
              renewed: true, remainingText: '60 يوماً'),
          child: const Text('افتح'),
        ),
      ),
    ));
    await t.tap(find.text('افتح'));
    await t.pumpAndSettle();

    expect(find.text('مُدِّد «رصاص ونحاس»'), findsOneWidget);
    expect(find.textContaining('صار'), findsNothing);
    expect(find.text('+30 يوماً — المتبقّي الآن 60 يوماً'), findsOneWidget);
  });
}
