import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/order/order_widgets.dart';
import 'package:mafia_club/models/fnb.dart';

// ══════════════════════════════════════════════════════
// 🧪 طلبات المطعم — الملفّ 17
// ══════════════════════════════════════════════════════

FnbMenuItem m(int id, String price, {String category = 'مشروبات'}) =>
    FnbMenuItem.fromJson({
      'id': id,
      'name': 'صنف $id',
      'category': category,
      'price': price,
    });

void main() {
  group('العملة', () {
    test('منزلتان دائماً و«د.أ» لاحقةً', () {
      expect(jod(3.5), '3.50 د.أ');
      expect(jod(0), '0.00 د.أ');
      expect(jod(12.345), '12.35 د.أ');
    });

    test('السعر يبقى سلسلةً كما وصل ويُحوَّل عند العرض', () {
      final item = m(1, '3.50');
      expect(item.price, '3.50');
      expect(item.priceValue, 3.5);
      expect(item.priceText, '3.50 د.أ');
    });

    test('سعرٌ فاسد لا يُسقط الشاشة', () {
      expect(m(1, 'x').priceValue, 0);
      expect(m(1, '').priceText, '0.00 د.أ');
    });
  });

  group('السياق', () {
    test('السطر الفرعيّ يفرّق الغرفة الحيّة عن الحجز', () {
      final live = FnbContext.fromJson(
          {'activityName': 'ليلة المافيا', 'source': 'live'});
      final booking = FnbContext.fromJson(
          {'activityName': 'ليلة المافيا', 'source': 'booking'});
      expect(live.subtitle, 'ليلة المافيا • 🎮 أنت داخل اللعبة');
      expect(booking.subtitle, 'ليلة المافيا • 🎟️ حجزك مؤكّد للطلب');
    });

    test('🔴 سبب الخادم يُعرض حرفياً، وغيابه يعطي النصّ الافتراضيّ', () {
      const serverReason =
          'الطلب متاح للحاجزين فقط — لا يوجد حجز باسمك لهذه الفعاليّة';
      expect(
        FnbContextResult.fromJson({'context': null, 'reason': serverReason})
            .reasonText,
        serverReason,
      );
      expect(FnbContextResult.fromJson({'context': null}).reasonText,
          FnbContextResult.noContextDefault);
      expect(FnbContextResult.fromJson({'context': null, 'reason': '  '})
          .reasonText, FnbContextResult.noContextDefault);
    });
  });

  group('المنيو', () {
    // 🔴 المكان رتّب منيوه بيده — فرزٌ أبجديّ هنا يقلبه
    test('التجميع يحفظ ترتيب الخادم لا الأبجديّة', () {
      final g = groupByCategory([
        m(1, '1', category: 'وجبات'),
        m(2, '1', category: 'أطباق'),
        m(3, '1', category: 'وجبات'),
      ]);
      expect(g.keys.toList(), ['وجبات', 'أطباق']);
      expect(g['وجبات']!.map((i) => i.id), [1, 3]);
    });

    test('الفئة الفارغة تُعرض تحت «المنيو»', () {
      final g = groupByCategory([m(1, '1', category: '')]);
      expect(g.keys.single, kUncategorized);
      expect(kUncategorized, 'المنيو');
    });
  });

  group('السلّة', () {
    /// سطرٌ بلا خيارات — الشكل الشائع.
    FnbCartLine line(int id, {int qty = 1, double price = 1, List<FnbSelection> opts = const []}) =>
        FnbCartLine(
          key: FnbCartLine.makeKey(id, opts, const {}),
          itemId: id, quantity: qty, unitPrice: price, options: opts,
        );

    test('«+ أضف» يضيف سطراً والنزول لصفرٍ يحذفه', () {
      var c = const FnbCart().add(line(7));
      expect(c.qtyOf(7), 1);
      c = c.changeQty(c.lines.first.key, -1);
      expect(c.isEmpty, isTrue);
    });

    test('🔴 سقف العشرين صامت — يُقصّ بلا رسالة', () {
      final c = const FnbCart().add(line(1, qty: 99));
      expect(c.qtyOf(1), kMaxQtyPerItem);
      expect(kMaxQtyPerItem, 20);
    });

    test('العدّاد مجموع الكمّيات لا عدد السطور', () {
      final c = const FnbCart().add(line(1, qty: 3)).add(line(2, qty: 2));
      expect(c.count, 5);
    });

    test('المجموع من أسعار السطور — للعرض فقط', () {
      final c = const FnbCart().add(line(1, qty: 2, price: 3.50)).add(line(2, price: 1.25));
      expect(c.total, closeTo(8.25, 0.001));
    });

    test('🔴 توليفتا خياراتٍ مختلفتان = سطران لا سطرٌ بكمّية 2', () {
      const apple = FnbSelection(groupKey: 'g1', valueKey: 'v1');
      const grape = FnbSelection(groupKey: 'g1', valueKey: 'v2');
      final c = const FnbCart()
          .add(line(5, opts: const [apple]))
          .add(line(5, opts: const [grape]));
      expect(c.lines.length, 2, reason: 'لولا ذلك حُضّرت نكهةٌ واحدة مرّتين');
      expect(c.qtyOf(5), 2);
    });

    test('نفس التوليفة تُدمج في سطرٍ واحد', () {
      const apple = FnbSelection(groupKey: 'g1', valueKey: 'v1');
      final c = const FnbCart()
          .add(line(5, opts: const [apple]))
          .add(line(5, opts: const [apple]));
      expect(c.lines.length, 1);
      expect(c.lines.first.quantity, 2);
    });

    test('🔴 ترتيب الاختيارات لا يغيّر المفتاح — وإلّا انقسم السطر بلا سبب', () {
      const a = FnbSelection(groupKey: 'g1', valueKey: 'v1');
      const b = FnbSelection(groupKey: 'g2', valueKey: 'v9');
      expect(FnbCartLine.makeKey(3, const [a, b], const {}),
          FnbCartLine.makeKey(3, const [b, a], const {}));
    });

    test('الحمولة تحمل الخيارات وخيارات مكوّنات الباقة', () {
      final l = FnbCartLine(
        key: 'k', itemId: 4, quantity: 2, unitPrice: 5,
        options: const [FnbSelection(groupKey: 'g1', valueKey: 'v1')],
        componentOptions: const {9: [FnbSelection(groupKey: 'g2', valueKey: 'v7')]},
      );
      expect(const FnbCart().add(l).toPayload(), [
        {
          'menuItemId': 4,
          'quantity': 2,
          'options': [{'group': 'g1', 'value': 'v1'}],
          'componentOptions': [
            {'menuItemId': 9, 'options': [{'group': 'g2', 'value': 'v7'}]}
          ],
        }
      ]);
    });
  });

  group('الطلبات', () {
    FnbMyOrder o(String status, {String total = '5.00', String note = ''}) =>
        FnbMyOrder.fromJson({
          'id': 1,
          'status': status,
          'total': total,
          'note': note,
          'items': [
            {'name': 'شاي', 'quantity': 2, 'unitPrice': '1.50'},
            {'name': 'قهوة', 'quantity': 1, 'unitPrice': '2.00'},
          ],
        });

    test('خريطة الحالات حرفيّة', () {
      expect(orderStatusMeta('new').label, 'جديد — بانتظار المكان');
      expect(orderStatusMeta('preparing').label, 'قيد التحضير');
      expect(orderStatusMeta('delivered').label, 'تمّ التسليم');
      expect(orderStatusMeta('cancelled').label, 'ملغى');
    });

    test('🔴 حالةٌ مجهولة تسقط على meta الـnew كاملةً', () {
      final unknown = orderStatusMeta('refunded_v2');
      final asNew = orderStatusMeta('new');
      expect(unknown.label, asNew.label);
      expect(unknown.color, asNew.color);
      expect(unknown.icon, asNew.icon);
    });

    test('ملخّص البنود «الاسم ×الكمّية» موصولاً بـ« • »', () {
      expect(o('new').itemsSummary, 'شاي ×2 • قهوة ×1');
    });

    // 🔴 التفاوت مقصود ومنقول: «طلباتي (2)» فوق ثلاث بطاقات
    test('🔴 العدّاد يستثني الملغاة والقائمة تعرضها', () {
      final list = [o('new'), o('cancelled'), o('delivered')];
      expect(openOrdersCount(list), 2);
      expect(list.length, 3);
    });

    test('زرّ الإلغاء لحالة new وحدها', () {
      expect(o('new').isNew, isTrue);
      expect(o('preparing').isNew, isFalse);
      expect(o('cancelled').isNew, isFalse);
    });

    test('الإجمالي بصيغة العملة نفسها', () {
      expect(o('new', total: '8.5').totalText, '8.50 د.أ');
    });
  });

  // ══════════════════════════════════════════════════════
  // 🔴 الانحدار: عمودان بارتفاعٍ ثابت قصّا سطر السعر — أهمّ ما في الصفّ.
  //    صنفٌ بوصفٍ أطول من صنفٍ بلاه، والارتفاع الثابت يخدم الأقصر.
  // ══════════════════════════════════════════════════════
  testWidgets('صفّا المنيو المتجاوران لا يفيضان ولا يقصّان السعر', (t) async {
    final withDesc = FnbMenuItem.fromJson({
      'id': 1,
      'name': 'صحن مقبّلات',
      'description': 'حمّص · متبّل · مكدوس',
      'price': '4.75',
    });
    final without = FnbMenuItem.fromJson({
      'id': 2,
      'name': 'ماء',
      'description': '',
      'price': '0.50',
    });

    await t.pumpWidget(MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: Center(
            child: SizedBox(
              width: 640,
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                        child: MenuItemRow(
                            item: withDesc, qty: 0, onAdd: () {})),
                    const SizedBox(width: 8),
                    Expanded(
                        child: MenuItemRow(
                            item: without, qty: 1, onAdd: () {})),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ));

    expect(t.takeException(), isNull);
    // السعران مرئيّان: القصّ كان يخفي سعر الصنف ذي الوصف وحده
    expect(find.text('4.75 د.أ'), findsOneWidget);
    expect(find.text('0.50 د.أ'), findsOneWidget);
    // والبطاقتان متساويتا الارتفاع
    final a = t.getSize(find.byType(MenuItemRow).first);
    final b = t.getSize(find.byType(MenuItemRow).last);
    expect(a.height, b.height);
  });
}
