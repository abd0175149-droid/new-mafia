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

// ══════════════════════════════════════════════════════
// ⚙️ الخيارات — نكهة · حجم · إضافات
// المفاتيح يولّدها الخادم (g{id}/v{id} للمشتركة، c{i}/c{i}:{j} للخاصّة)
// ويُعيدها العميل كما هي — لا يحسبها بنفسه.
// ══════════════════════════════════════════════════════

class FnbOptionValue {
  const FnbOptionValue({required this.key, required this.name, this.priceDelta = 0});
  final String key, name;
  final double priceDelta;

  factory FnbOptionValue.fromJson(Map<String, dynamic> j) => FnbOptionValue(
        key: _s(j['key']),
        name: _s(j['name']),
        priceDelta: parsePrice('${j['priceDelta'] ?? 0}'),
      );

  /// «كبير +1.00» — الفرق يظهر فقط إن وُجد.
  String get label => priceDelta > 0 ? '$name +${jod(priceDelta)}' : name;
}

class FnbOptionGroup {
  const FnbOptionGroup({
    required this.key,
    required this.name,
    this.selectionType = 'single',
    this.isRequired = false,
    this.maxSelect = 1,
    this.values = const [],
  });

  final String key, name, selectionType;
  final bool isRequired;
  final int maxSelect;
  final List<FnbOptionValue> values;

  bool get isMulti => selectionType == 'multi';

  factory FnbOptionGroup.fromJson(Map<String, dynamic> j) => FnbOptionGroup(
        key: _s(j['key']),
        name: _s(j['name']),
        selectionType: _s(j['selectionType']) == 'multi' ? 'multi' : 'single',
        isRequired: j['isRequired'] == true,
        maxSelect: _i(j['maxSelect']) == 0 ? 1 : _i(j['maxSelect']),
        values: (j['values'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbOptionValue.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

/// خيارٌ مختار كما يعيده الخادم في لقطة الطلب.
class FnbChosenOption {
  const FnbChosenOption({required this.group, required this.value});
  final String group, value;

  factory FnbChosenOption.fromJson(Map<String, dynamic> j) =>
      FnbChosenOption(group: _s(j['group']), value: _s(j['value']));
}

/// «نكهة: تفاحتين · الحجم: كبير»
String chosenLine(List<FnbChosenOption> opts) =>
    opts.map((o) => '${o.group}: ${o.value}').join(' · ');

/// 🎁 مكوّن باقة — اسمٌ وكمّية للوحدة الواحدة. بلا سعرٍ مفرد: اللاعب يرى
/// «ماذا داخل العرض» لا تسعير المكوّنات (الخادم لا يرسله أصلاً).
class FnbComponent {
  const FnbComponent({
    required this.name,
    this.qty = 1,
    this.menuItemId,
    this.optionGroups = const [],
    this.options = const [],
  });
  final String name;
  final int qty;
  final int? menuItemId;
  final List<FnbOptionGroup> optionGroups;   // في المنيو: ما يجب سؤاله
  final List<FnbChosenOption> options;       // في الطلب: ما اختير فعلاً

  factory FnbComponent.fromJson(Map<String, dynamic> j) => FnbComponent(
        name: _s(j['name']),
        qty: _i(j['qty']) == 0 ? 1 : _i(j['qty']),
        menuItemId: j['menuItemId'] == null ? null : _i(j['menuItemId']),
        optionGroups: (j['optionGroups'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbOptionGroup.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        options: (j['options'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbChosenOption.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );

  /// «شاي ×2» — وتُسقَط الـ×1 اختصاراً، وخيارات المكوّن بين قوسين.
  String label([int multiplier = 1]) {
    final total = qty * multiplier;
    final base = total > 1 ? '$name ×$total' : name;
    if (options.isEmpty) return base;
    return '$base (${options.map((o) => o.value).join(' · ')})';
  }
}

/// يصوغ سطر المكوّنات: «أرجيلة + شاي ×2».
String componentsLine(List<FnbComponent> comps, [int multiplier = 1]) =>
    comps.map((c) => c.label(multiplier)).join(' + ');

/// 🎁 مرشّحٌ داخل خانة اختيار — صنفٌ حقيقيّ بمجموعات خياراته.
class FnbSlotCandidate {
  const FnbSlotCandidate({
    required this.menuItemId,
    required this.name,
    this.optionGroups = const [],
  });
  final int menuItemId;
  final String name;
  final List<FnbOptionGroup> optionGroups;

  factory FnbSlotCandidate.fromJson(Map<String, dynamic> j) => FnbSlotCandidate(
        menuItemId: _i(j['menuItemId']),
        name: _s(j['name']),
        optionGroups: (j['optionGroups'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbOptionGroup.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

/// 🎁 خانة باقة كما يبنيها الخادم (2026-08-08):
///   `fixed`  — صنفٌ محدَّد، وقد يحمل خياراتٍ مقفلة (تُعرض ولا تُسأل) وأخرى تُسأل.
///   `choice` — اختيارُ صنفٍ واحد من مرشّحين، ثمّ خياراتُ المُنتقى إن وُجدت.
/// 💰 فرق خيارٍ يختاره اللاعب يُضرب في كمّية الخانة — مطابقةً لحساب الخادم.
class FnbSlot {
  const FnbSlot({
    required this.i,
    required this.kind,
    this.menuItemId,
    this.name = '',
    this.qty = 1,
    this.lockedOptions = const {},
    this.optionGroups = const [],
    this.label = '',
    this.note = '',
    this.from = const [],
  });

  final int i;
  final String kind;                       // fixed | choice
  final int? menuItemId;                   // fixed
  final String name;                       // fixed
  final int qty;
  final Map<String, String> lockedOptions; // fixed — مجموعة ← قيمة محدَّدة في العرض
  final List<FnbOptionGroup> optionGroups; // fixed — ما يُسأل عنه
  final String label, note;                // choice
  final List<FnbSlotCandidate> from;       // choice

  bool get isChoice => kind == 'choice';

  factory FnbSlot.fromJson(Map<String, dynamic> j) => FnbSlot(
        i: _i(j['i']),
        kind: _s(j['kind']) == 'choice' ? 'choice' : 'fixed',
        menuItemId: j['menuItemId'] == null ? null : _i(j['menuItemId']),
        name: _s(j['name']),
        qty: _i(j['qty']) == 0 ? 1 : _i(j['qty']),
        lockedOptions: j['lockedOptions'] is Map
            ? Map<String, String>.from((j['lockedOptions'] as Map)
                .map((k, v) => MapEntry('$k', '$v')))
            : const {},
        optionGroups: (j['optionGroups'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbOptionGroup.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        label: _s(j['label']),
        note: _s(j['note']),
        from: (j['from'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbSlotCandidate.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );

  /// شريحة الملخّص على بطاقة العرض: «◇ شاي / قهوة / غازي» أو «أرجيلة 150غم».
  String get summary {
    if (isChoice) {
      final names = from.take(3).map((c) => c.name).join(' / ');
      return '◇ $names${from.length > 3 ? ' …' : ''}';
    }
    final lock = lockedOptions.values.isEmpty ? '' : ' ${lockedOptions.values.first}';
    return qty > 1 ? '$name ×$qty$lock' : '$name$lock';
  }
}

class FnbMenuItem {
  const FnbMenuItem({
    required this.id,
    required this.name,
    this.category = '',
    this.description = '',
    this.price = '0',
    this.imageUrl,
    this.isBundle = false,
    this.components = const [],
    this.subcategory = '',
    this.optionGroups = const [],
    this.slots = const [],
  });

  final int id;
  final String category, name, description, price;
  final String subcategory;               // 🗂️ القسم الفرعيّ داخل القسم (قد يكون فارغاً)
  final String? imageUrl;
  final bool isBundle;                    // 🎁 باقة مركَّبة (العرض الكامل)
  final List<FnbComponent> components;
  final List<FnbOptionGroup> optionGroups;
  final List<FnbSlot> slots;              // 🎁 خانات الباقة (المصدر منذ 2026-08-08)

  /// هل يحتاج سؤالاً قبل الإضافة؟ الباقة تفتح مُهيّئها دائماً، والصنف بخياراته.
  bool get needsPicking => isBundle || optionGroups.isNotEmpty;

  /// 📖 وصفٌ أطول من هذا لا يُقرأ في سطر البطاقة — يفتح ورقة تفصيل.
  bool get hasLongDescription =>
      !isBundle && optionGroups.isEmpty && description.length > 40;

  /// ملخّص ما سيُسأل عنه: مجموعةٌ واحدة ⇒ «7 النكهة» (العدد أنفع من الاسم).
  String get optionHint {
    if (optionGroups.isEmpty) return 'خيارات';
    if (optionGroups.length == 1) {
      final g = optionGroups.first;
      return '${g.values.length} ${g.name}';
    }
    if (optionGroups.length == 2) {
      return optionGroups.map((g) => g.name).join(' · ');
    }
    return '${optionGroups.first.name} +${optionGroups.length - 1}';
  }

  double get priceValue => parsePrice(price);
  String get priceText => jod(priceValue);

  /// السطر الثانويّ: خانات الباقة إن وُجدت، وإلا الوصف.
  String get subtitle => isBundle && slots.isNotEmpty
      ? slots.map((s) => s.summary).join(' + ')
      : description;

  factory FnbMenuItem.fromJson(Map<String, dynamic> j) => FnbMenuItem(
        id: _i(j['id']),
        category: _s(j['category']),
        name: _s(j['name']),
        description: _s(j['description']),
        price: _s(j['price']),
        imageUrl: (j['imageUrl'] is String && '${j['imageUrl']}'.isNotEmpty)
            ? j['imageUrl'] as String
            : null,
        isBundle: j['isBundle'] == true,
        subcategory: _s(j['subcategory']),
        components: (j['components'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbComponent.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        optionGroups: (j['optionGroups'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbOptionGroup.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        slots: (j['slots'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbSlot.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
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
  const FnbOrderLine({
    required this.name,
    this.unitPrice = '0',
    this.quantity = 0,
    this.components = const [],
    this.options = const [],
  });
  final String name, unitPrice;
  final int quantity;
  final List<FnbComponent> components;      // 🎁 لقطة مكوّنات الباقة وقت الطلب
  final List<FnbChosenOption> options;      // ⚙️ لقطة الخيارات المختارة

  bool get isBundle => components.isNotEmpty;

  /// «عرض السهرة: أرجيلة ×2 + شاي ×2» — الكمّيات مضروبة بعدد الباقات.
  String get componentsText => '$name: ${componentsLine(components, quantity)}';

  factory FnbOrderLine.fromJson(Map<String, dynamic> j) => FnbOrderLine(
        name: _s(j['name']),
        unitPrice: _s(j['unitPrice']),
        quantity: _i(j['quantity']),
        components: (j['components'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbComponent.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        options: (j['options'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FnbChosenOption.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
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

/// اختيارٌ واحد بمفاتيح الخادم.
class FnbSelection {
  const FnbSelection({required this.groupKey, required this.valueKey});
  final String groupKey, valueKey;
  Map<String, String> toJson() => {'group': groupKey, 'value': valueKey};
}

/// 🎁 اختيار خانةٍ واحدة كما يُرسَل للخادم: `{i, menuItemId?, options}`.
class FnbSlotPick {
  const FnbSlotPick({required this.i, this.menuItemId, this.options = const []});
  final int i;
  final int? menuItemId;                 // لخانة الاختيار فقط
  final List<FnbSelection> options;

  Map<String, dynamic> toJson() => {
        'i': i,
        if (menuItemId != null) 'menuItemId': menuItemId,
        'options': options.map((o) => o.toJson()).toList(),
      };

  String get signature =>
      '$i:${menuItemId ?? ''}:${(options.map((o) => '${o.groupKey}|${o.valueKey}').toList()..sort()).join(',')}';
}

/// 🛒 سطر سلّة = صنف + توليفة خيارات.
/// 🔴 توليفتان مختلفتان **سطران**: «أرجيلة/تفاحتين» و«أرجيلة/عنب» لا تندمجان،
///    وإلّا حُضّرت نكهةٌ واحدة مرّتين.
class FnbCartLine {
  const FnbCartLine({
    required this.key,
    required this.itemId,
    required this.name,
    required this.quantity,
    required this.unitPrice,
    this.label = '',
    this.isBundle = false,
    this.options = const [],
    this.slots = const [],
  });

  final String key;
  final int itemId, quantity;
  final String name;                   // لقطة الاسم — الدرج لا يبحث في المنيو
  final double unitPrice;              // للعرض فقط — الخادم يعيد التسعير
  final String label;                  // «نكهة: تفاحتين · الحجم: كبير»
  final bool isBundle;
  final List<FnbSelection> options;
  final List<FnbSlotPick> slots;       // 🎁 اختيارات خانات الباقة

  FnbCartLine copyWith({int? quantity}) => FnbCartLine(
        key: key, itemId: itemId, name: name,
        quantity: quantity ?? this.quantity,
        unitPrice: unitPrice, label: label, isBundle: isBundle,
        options: options, slots: slots,
      );

  Map<String, dynamic> toJson() => {
        'menuItemId': itemId,
        'quantity': quantity,
        'options': options.map((o) => o.toJson()).toList(),
        'slots': slots.map((s) => s.toJson()).toList(),
      };

  /// مفتاحٌ مستقرّ يميّز التوليفة — بصمة الخانات ضمنه كما في الخادم:
  /// باقتان بنكهتين مختلفتين سطران لا سطرٌ بكمّية ٢.
  static String makeKey(
      int itemId, List<FnbSelection> options, List<FnbSlotPick> slots) {
    final a = options.map((o) => '${o.groupKey}|${o.valueKey}').toList()..sort();
    final b = slots.map((s) => s.signature).toList();
    return '$itemId#${a.join(',')}#${b.join(';')}';
  }
}

class FnbCart {
  const FnbCart({this.lines = const []});

  final List<FnbCartLine> lines;

  int get count => lines.fold(0, (a, l) => a + l.quantity);

  bool get isEmpty => lines.isEmpty;

  /// كمّية الصنف بكلّ توليفاته — لعدّاد صفّ المنيو.
  int qtyOf(int itemId) =>
      lines.where((l) => l.itemId == itemId).fold(0, (a, l) => a + l.quantity);

  /// المجموع **للعرض فقط**: الخادم يعيد التسعير من قاعدته داخل معاملة
  /// ولا يثق بأيّ سعرٍ من العميل.
  double get total => lines.fold(0.0, (a, l) => a + l.unitPrice * l.quantity);

  /// يزيد سطراً قائماً أو يضيف الجديد — والسقف يُطبَّق في الحالتين.
  FnbCart add(FnbCartLine line) {
    final i = lines.indexWhere((l) => l.key == line.key);
    if (i == -1) {
      return FnbCart(lines: [
        ...lines,
        line.quantity > kMaxQtyPerItem
            ? line.copyWith(quantity: kMaxQtyPerItem)
            : line,
      ]);
    }
    final next = [...lines];
    final q = next[i].quantity + line.quantity;
    next[i] = next[i].copyWith(quantity: q > kMaxQtyPerItem ? kMaxQtyPerItem : q);
    return FnbCart(lines: next);
  }

  FnbCart changeQty(String key, int delta) {
    final next = <FnbCartLine>[];
    for (final l in lines) {
      if (l.key != key) { next.add(l); continue; }
      final q = l.quantity + delta;
      if (q <= 0) continue;                    // الصفر يحذف السطر
      next.add(l.copyWith(quantity: q > kMaxQtyPerItem ? kMaxQtyPerItem : q));
    }
    return FnbCart(lines: next);
  }

  List<Map<String, dynamic>> toPayload() => lines.map((l) => l.toJson()).toList();
}
