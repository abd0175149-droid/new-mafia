import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🍽️ نماذج طلبات المطعم — §8 في الملفّ 17
// ══════════════════════════════════════════════════════
// 🔴 `clubShare` (حصّة النادي لكل صنف) **لا يصل اللاعب إطلاقاً** — الخادم
//    لا يكشفه في `/api/fnb/menu` عمداً. لا يُنمذج هنا ولا يُطلَب.

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

String _s(dynamic v) => v == null ? '' : '$v'.trim();

DateTime? _date(dynamic v) =>
    v == null ? null : DateTime.tryParse('$v')?.toLocal();

/// السعر يصل **سلسلة عشرية** من Postgres numeric (مثل `"3.50"`) ويُحفظ
/// كما وصل: تحويله رقماً عند الاستقبال يفقد المنازل عند إعادة العرض.
double parsePrice(String s) => double.tryParse(s) ?? 0;

/// «{قيمة بمنزلتين} د.أ» — الصيغة الوحيدة للعملة في الشريحة كلّها.
String jod(double v) => '${v.toStringAsFixed(2)} د.أ';

// ══════════════════════════════════════════════════════
// السياق
// ══════════════════════════════════════════════════════

class FnbContext {
  const FnbContext({
    required this.activityId,
    required this.activityName,
    required this.locationName,
    required this.source,
    this.activityDate,
    this.locationId = 0,
    this.bookingId = 0,
    this.sessionId,
    this.physicalId,
  });

  final int activityId, locationId, bookingId;
  final String activityName, locationName;
  final DateTime? activityDate;
  final int? sessionId, physicalId;

  /// `'live'` (داخل غرفة) أو `'booking'` (حجز مؤكّد).
  final String source;

  bool get isLive => source == 'live';

  /// السطر الفرعيّ في الترويسة.
  String get subtitle => isLive
      ? '$activityName • 🎮 أنت داخل اللعبة'
      : '$activityName • 🎟️ حجزك مؤكّد للطلب';

  factory FnbContext.fromJson(Map<String, dynamic> j) => FnbContext(
        activityId: _i(j['activityId']),
        activityName: _s(j['activityName']),
        locationId: _i(j['locationId']),
        locationName: _s(j['locationName']),
        bookingId: _i(j['bookingId']),
        sessionId: j['sessionId'] == null ? null : _i(j['sessionId']),
        physicalId: j['physicalId'] == null ? null : _i(j['physicalId']),
        activityDate: _date(j['activityDate']),
        source: _s(j['source']),
      );
}

/// غلاف استجابة `/context`: السياق قد يكون فارغاً ومعه سببٌ نصّيّ.
class FnbContextResult {
  const FnbContextResult({this.context, this.reason});
  final FnbContext? context;
  final String? reason;

  static const noContextDefault =
      'الطلب من المكان يفتح للحاجزين قبل ساعةٍ من موعد الفعاليّة وأثناءها.';

  /// نصّ الخادم إن وُجد، وإلّا النصّ الافتراضيّ.
  String get reasonText {
    final r = reason?.trim();
    return (r == null || r.isEmpty) ? noContextDefault : r;
  }

  factory FnbContextResult.fromJson(Map<String, dynamic> j) {
    final c = j['context'];
    return FnbContextResult(
      context: c is Map
          ? FnbContext.fromJson(Map<String, dynamic>.from(c))
          : null,
      reason: j['reason'] as String?,
    );
  }
}

// ══════════════════════════════════════════════════════
// المنيو
// ══════════════════════════════════════════════════════

class FnbMenuItem {
  const FnbMenuItem({
    required this.id,
    required this.name,
    this.category = '',
    this.description = '',
    this.price = '0',
    this.imageUrl,
  });

  final int id;
  final String category, name, description, price;
  final String? imageUrl;

  double get priceValue => parsePrice(price);
  String get priceText => jod(priceValue);

  factory FnbMenuItem.fromJson(Map<String, dynamic> j) => FnbMenuItem(
        id: _i(j['id']),
        category: _s(j['category']),
        name: _s(j['name']),
        description: _s(j['description']),
        price: _s(j['price']),
        imageUrl: (j['imageUrl'] is String && '${j['imageUrl']}'.isNotEmpty)
            ? j['imageUrl'] as String
            : null,
      );
}

/// الفئة الفارغة تُعرض بعنوان «المنيو».
const kUncategorized = 'المنيو';

/// 🔴 التجميع يحفظ **ترتيب الخادم** (category ↗ ثمّ sortOrder ثمّ id).
///    فرزٌ أبجديّ هنا يقلب منيو المكان الذي رتّبه بيده.
Map<String, List<FnbMenuItem>> groupByCategory(List<FnbMenuItem> items) {
  final out = <String, List<FnbMenuItem>>{};
  for (final i in items) {
    (out[i.category.isEmpty ? kUncategorized : i.category] ??= []).add(i);
  }
  return out;
}

// ══════════════════════════════════════════════════════
// الطلبات
// ══════════════════════════════════════════════════════

class FnbOrderLine {
  const FnbOrderLine({required this.name, this.unitPrice = '0', this.quantity = 0});
  final String name, unitPrice;
  final int quantity;

  factory FnbOrderLine.fromJson(Map<String, dynamic> j) => FnbOrderLine(
        name: _s(j['name']),
        unitPrice: _s(j['unitPrice']),
        quantity: _i(j['quantity']),
      );
}

class FnbOrderStatusMeta {
  const FnbOrderStatusMeta(this.label, this.color, this.icon);
  final String label, icon;
  final Color color;
}

const _statusMeta = <String, FnbOrderStatusMeta>{
  'new': FnbOrderStatusMeta('جديد — بانتظار المكان', Color(0xFF3B82F6), '🕐'),
  'preparing': FnbOrderStatusMeta('قيد التحضير', Color(0xFFF59E0B), '👨‍🍳'),
  'delivered': FnbOrderStatusMeta('تمّ التسليم', Color(0xFF22C55E), '✅'),
  'cancelled': FnbOrderStatusMeta('ملغى', Color(0xFF6B7280), '✖️'),
};

/// حالةٌ مجهولة (يسبق الخادمُ التطبيقَ) تسقط على meta الـ`new` كاملةً.
FnbOrderStatusMeta orderStatusMeta(String status) =>
    _statusMeta[status] ?? _statusMeta['new']!;

class FnbMyOrder {
  const FnbMyOrder({
    required this.id,
    this.status = 'new',
    this.total = '0',
    this.note = '',
    this.createdAt,
    this.items = const [],
  });

  final int id;
  final String status, total, note;
  final DateTime? createdAt;
  final List<FnbOrderLine> items;

  bool get isNew => status == 'new';
  bool get isCancelled => status == 'cancelled';

  FnbOrderStatusMeta get meta => orderStatusMeta(status);
  String get totalText => jod(parsePrice(total));

  /// «{الاسم} ×{الكمّية}» موصولةً بـ« • ».
  String get itemsSummary =>
      items.map((i) => '${i.name} ×${i.quantity}').join(' • ');

  factory FnbMyOrder.fromJson(Map<String, dynamic> j) => FnbMyOrder(
        id: _i(j['id']),
        status: _s(j['status']),
        total: _s(j['total']),
        note: _s(j['note']),
        createdAt: _date(j['createdAt']),
        items: (j['items'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbOrderLine.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

/// 🔴 العدّاد يستثني الملغاة **والقائمة تعرضها**. التفاوت مقصود ومنقول
///    كما هو من الويب: «طلباتي (2)» فوق ثلاث بطاقات إحداها ملغاة.
int openOrdersCount(List<FnbMyOrder> orders) =>
    orders.where((o) => !o.isCancelled).length;

// ══════════════════════════════════════════════════════
// السلّة — ذاكريّة فقط، تضيع بإغلاق الشاشة (قرار مقفول)
// ══════════════════════════════════════════════════════

/// سقف الكمّية للصنف الواحد — **صامت**: لا رسالة ولا اهتزاز عند بلوغه.
const kMaxQtyPerItem = 20;

/// حدّ الملاحظة حرفاً؛ الخادم يقصّ إلى العدد نفسه بعد trim.
const kMaxNoteLength = 300;

class FnbCart {
  const FnbCart({this.qtyByItemId = const {}});

  final Map<int, int> qtyByItemId;

  int qtyOf(int itemId) => qtyByItemId[itemId] ?? 0;

  int get count => qtyByItemId.values.fold(0, (a, b) => a + b);

  bool get isEmpty => qtyByItemId.isEmpty;

  /// المجموع **للعرض فقط**: الخادم يعيد التسعير من قاعدته داخل معاملة
  /// ولا يثق بأيّ سعرٍ من العميل. صنفٌ اختفى من المنيو يساهم بصفر.
  double totalFor(List<FnbMenuItem> menu) {
    var sum = 0.0;
    for (final m in menu) {
      final q = qtyByItemId[m.id];
      if (q != null) sum += m.priceValue * q;
    }
    return sum;
  }

  FnbCart setQty(int itemId, int qty) {
    final next = Map<int, int>.from(qtyByItemId);
    if (qty <= 0) {
      next.remove(itemId);
    } else {
      next[itemId] = qty > kMaxQtyPerItem ? kMaxQtyPerItem : qty;
    }
    return FnbCart(qtyByItemId: next);
  }

  /// حمولة الإرسال — الترتيب لا يهمّ والخادم يدمج المكرّر (ولا مكرّر
  /// أصلاً: المفتاح `menuItemId`).
  List<Map<String, int>> toPayload() => [
        for (final e in qtyByItemId.entries)
          {'menuItemId': e.key, 'quantity': e.value},
      ];
}
