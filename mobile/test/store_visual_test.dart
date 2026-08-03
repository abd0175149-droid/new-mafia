import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/cosmetics/chips_emblems.dart';
import 'package:mafia_club/features/cosmetics/name_fx_text.dart';
import 'package:mafia_club/features/cosmetics/store_item_visual.dart';
import 'package:mafia_club/features/cosmetics/title_plaque_view.dart';
import 'package:mafia_club/models/store.dart';

// ══════════════════════════════════════════════════════
// 🧪 مصغّرات المتجر — الملفّ 33 §4.4
// ══════════════════════════════════════════════════════
// 🔴 كانت كل الأنواع تُرسم رمزاً عامّاً بلون الندرة، فبدت الإطارات
//    متطابقة ولم يميّز اللاعب ما يشتري. لكل نوعٍ تمثيلٌ يشبه ما سيراه.

StoreItem item(String kind, Map<String, dynamic> extra) =>
    StoreItem.fromJson({'id': 1, 'kind': kind, 'nameAr': 'س', ...extra});

Future<void> pump(WidgetTester t, Widget w) => t.pumpWidget(MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: w)),
      ),
    ));

void main() {
  testWidgets('الإطار ذو الشعار يرسم الشعار الحقيقيّ', (t) async {
    await pump(t, StoreItemVisual(item: item('frame', {'emblemId': 'don'})));
    expect(find.byType(ChipsEmblemView), findsOneWidget);
    expect(t.widget<ChipsEmblemView>(find.byType(ChipsEmblemView)).id,
        EmblemId.don);
    await t.pump(const Duration(milliseconds: 100));
  });

  testWidgets('إطارٌ بلا شعار يرسم ألوان إعداده لا رمزاً عامّاً', (t) async {
    await pump(
        t,
        StoreItemVisual(
          item: item('frame', {
            'config': {
              'border': {
                'enabled': true,
                'style': 'gradient',
                'gradientColors': ['#ff0000', '#00ff00'],
              }
            }
          }),
        ));
    expect(find.byType(ChipsEmblemView), findsNothing);
    // التدرّج المرسوم هو ألوان العنصر نفسه
    final grads = t
        .widgetList<Container>(find.byType(Container))
        .map((c) => (c.decoration as BoxDecoration?)?.gradient)
        .whereType<LinearGradient>()
        .expand((g) => g.colors)
        .toList();
    expect(grads, contains(const Color(0xFFFF0000)));
    expect(grads, contains(const Color(0xFF00FF00)));
  });

  testWidgets('اللقب يرسم اللوحة الحقيقية بنصّها', (t) async {
    await pump(
        t,
        StoreItemVisual(
          item: item('title', {
            'config': {'text': 'سفّاح الليل', 'style': 'gold'}
          }),
        ));
    expect(find.byType(TitlePlaqueView), findsOneWidget);
    expect(find.text('سفّاح الليل'), findsOneWidget);
  });

  // 🔴 معاينةٌ باسمٍ عامّ لا تُري اللاعب ما سيشتريه فعلاً
  testWidgets('تأثير الاسم يُعاين على اسم اللاعب نفسه', (t) async {
    await pump(
        t,
        StoreItemVisual(
          playerName: 'عبدالرزاق',
          item: item('name_fx', {
            'config': {
              'nameEffect': {'style': 'glow', 'color': '#fbbf24'}
            }
          }),
        ));
    expect(find.byType(NameFxText), findsOneWidget);
    expect(find.text('عبدالرزاق'), findsOneWidget);
    // مفعّلٌ دائماً في المعاينة ولو كان الإعداد المخزَّن مطفأً
    expect(t.widget<NameFxText>(find.byType(NameFxText)).fx.enabled, isTrue);
  });

  testWidgets('كل نوعٍ يُنتج تمثيلاً — ولا نوع يسقط', (t) async {
    for (final k in const [
      'frame', 'title', 'name_fx', 'entrance',
      'elimination', 'victory_sting', 'xp_boost', 'نوع_جديد',
    ]) {
      await pump(t, StoreItemVisual(item: item(k, const {})));
      expect(t.takeException(), isNull, reason: k);
      expect(find.byType(StoreItemVisual), findsOneWidget, reason: k);
    }
  });
}
