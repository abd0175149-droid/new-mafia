import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🏦 نماذج خزنة الدون — §8 في الملفّ 33
// ══════════════════════════════════════════════════════

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

String? _s(dynamic v) =>
    (v is String && v.trim().isNotEmpty) ? v.trim() : null;

// ── الندرة ──
const _rarityColor = <String, Color>{
  'common': Color(0xFF9CA3AF),
  'rare': Color(0xFF38BDF8),
  'epic': Color(0xFFC084FC),
  'myth': Color(0xFFF59E0B),
  'achievement': Color(0xFFE2E8F0),
};

const _rarityLabel = <String, String>{
  'common': 'شائع', 'rare': 'نادر', 'epic': 'ملحمي',
  'myth': 'أسطوري', 'achievement': 'إنجاز',
};

Color rarityColor(String r) => _rarityColor[r] ?? _rarityColor['common']!;
String rarityLabel(String r) => _rarityLabel[r] ?? r;

/// تمييز العدد في العربية: مفردٌ عند الواحد، مثنّى عند الاثنين، جمع قلّة
/// من ثلاثة إلى عشرة، ثمّ **مفردٌ منصوب** من أحد عشر فصاعداً.
///
/// 🔴 «90 أيام» خطأٌ نحويّ صريح يقرؤه كلّ لاعب. الصواب «90 يوماً».
String arabicDays(int n) => switch (n) {
      1 => 'يوم',
      2 => 'يومان',
      >= 3 && <= 10 => '$n أيام',
      _ => '$n يوماً',
    };

// ── الأنواع ──
class StoreKind {
  const StoreKind(this.key, this.label, this.icon, {this.wearable = true, this.timed = false});
  final String key, label, icon;

  /// يُلبَس على البطاقة (إطار/لقب/تأثير اسم) ⇒ شبكة وأزرار تجهيز.
  final bool wearable;

  /// معاينته **زمنيّة** (تشريفة، إقصاء، نغمة) ⇒ صفوف وزرّ تشغيل.
  final bool timed;

  static const all = <StoreKind>[
    StoreKind('frame', 'إطارات', '🃏'),
    StoreKind('title', 'ألقاب', '🏷️'),
    StoreKind('name_fx', 'الاسم', '✨'),
    StoreKind('entrance', 'تشريفات', '🚪', wearable: false, timed: true),
    StoreKind('elimination', 'إقصاء', '🔥', wearable: false, timed: true),
    StoreKind('victory_sting', 'نغمات', '🔊', wearable: false, timed: true),
    StoreKind('xp_boost', 'معزّزات', '⚡', wearable: false),
  ];

  static StoreKind of(String key) =>
      all.firstWhere((k) => k.key == key, orElse: () => all.first);
}

class StoreItem {
  const StoreItem({
    required this.id,
    required this.kind,
    required this.nameAr,
    this.itemKey = '',
    this.hookAr,
    this.rarity = 'common',
    this.priceChips = 0,
    this.durationDays = 0,
    this.soundUrl,
    this.isPurchasable = false,
    this.closed = false,
    this.owned = false,
    this.expiresAt,
    this.owners = 0,
    this.isHot = false,
    this.isNew = false,
    this.wasOwned = false,
    this.trialEligible = false,
    this.achievementAr,
    this.holderName,
    this.config,
    this.emblemId,
  });

  final int id;
  final String kind, nameAr, itemKey;
  final String? hookAr, soundUrl, achievementAr, holderName;
  final String rarity;
  final int priceChips, durationDays, owners;
  final bool isPurchasable, closed, owned, isHot, isNew, wasOwned, trialEligible;
  final DateTime? expiresAt;

  /// 🔴 تصميم العنصر — هو **المنتَج نفسه**. المتجر يبيع مظهراً، وإهمال هذا
  ///    الحقل يجعل كل الإطارات تبدو متطابقة فلا يُميّز اللاعب ما يشتري.
  final Map<String, dynamic>? config;

  /// شعار SVG يعلو البطاقة — للإطارات التي تحمل شعاراً.
  final String? emblemId;

  bool get isAchievement => rarity == 'achievement' || !isPurchasable;

  /// الأيام المتبقّية — يُقرَّب لأعلى فيومٌ ناقص لا يصير صفراً.
  int get daysLeft {
    final e = expiresAt;
    if (e == null) return 0;
    final ms = e.difference(DateTime.now()).inMilliseconds;
    if (ms <= 0) return 0;
    return (ms / 86400000).ceil();
  }

  String get daysLeftText => arabicDays(daysLeft);

  /// السعر اليوميّ بمنزلة واحدة — يجعل المقارنة بين مدّتين ممكنة.
  String? get perDayText {
    if (durationDays <= 0 || priceChips <= 0) return null;
    return (priceChips / durationDays).toStringAsFixed(1);
  }

  factory StoreItem.fromJson(Map<String, dynamic> j) => StoreItem(
        id: _i(j['id']),
        kind: (j['kind'] ?? '').toString(),
        nameAr: (j['nameAr'] ?? '').toString(),
        itemKey: (j['itemKey'] ?? '').toString(),
        hookAr: _s(j['hookAr']),
        rarity: (j['rarity'] ?? 'common').toString(),
        priceChips: _i(j['priceChips']),
        durationDays: _i(j['durationDays']),
        soundUrl: _s(j['soundUrl']),
        isPurchasable: j['isPurchasable'] == true,
        closed: j['closed'] == true,
        owned: j['owned'] == true,
        expiresAt: j['expiresAt'] == null
            ? null
            : DateTime.tryParse('${j['expiresAt']}')?.toLocal(),
        owners: _i(j['owners']),
        isHot: j['isHot'] == true,
        isNew: j['isNew'] == true,
        wasOwned: j['wasOwned'] == true,
        trialEligible: j['trialEligible'] == true,
        achievementAr: _s(j['achievementAr']),
        holderName: _s(j['holderName']),
        config: j['config'] is Map
            ? Map<String, dynamic>.from(j['config'] as Map)
            : null,
        emblemId: _s(j['emblemId']),
      );
}

/// ما يرتديه اللاعب الآن.
///
/// 🔴 الخادم يردّ **كائناً لكل خانة** لا معرّفاً: `{frame, title, nameFx}`
///    وكلٌّ منها `{itemId, nameAr, rarity, …}` أو `null`. والأهمّ أنه يعيد
///    `null` للخانة إن انتهى إيجارها **ولو بقي المعرّف في عمود اللاعب** —
///    فهو المرجع الوحيد لما يُلبَس فعلاً، لا أعمدة `players`.
/// خانةٌ مُجهَّزة — المعرّف **وتصميمها**، فالمرآة ترسم ما يُلبَس فعلاً.
class CosmeticSlot {
  const CosmeticSlot({this.itemId, this.config, this.emblemId, this.nameAr});

  final int? itemId;
  final Map<String, dynamic>? config;
  final String? emblemId, nameAr;

  static CosmeticSlot? fromJson(dynamic slot) {
    if (slot is! Map || slot['itemId'] == null) return null;
    return CosmeticSlot(
      itemId: _i(slot['itemId']),
      config: slot['config'] is Map
          ? Map<String, dynamic>.from(slot['config'] as Map)
          : null,
      emblemId: _s(slot['emblemId']),
      nameAr: _s(slot['nameAr']),
    );
  }
}

class EquippedCosmetics {
  const EquippedCosmetics({this.frame, this.title, this.nameFx});

  final CosmeticSlot? frame, title, nameFx;

  int? get frameId => frame?.itemId;
  int? get titleId => title?.itemId;
  int? get nameFxId => nameFx?.itemId;

  int? forKind(String kind) => switch (kind) {
        'frame' => frameId,
        'title' => titleId,
        'name_fx' => nameFxId,
        _ => null,
      };

  bool isEquipped(StoreItem i) => forKind(i.kind) == i.id;

  /// 🪙 المعاينة: العنصر الملموس يحلّ محلّ خانته وحدها، وما عداها يبقى —
  ///    فيرى اللاعب الإطار الجديد **فوق لقبه الحاليّ** لا بديلاً عنه.
  EquippedCosmetics preview(StoreItem? item) {
    if (item == null) return this;
    final slot = CosmeticSlot(
      itemId: item.id, config: item.config, emblemId: item.emblemId,
      nameAr: item.nameAr,
    );
    return switch (item.kind) {
      'frame' => EquippedCosmetics(frame: slot, title: title, nameFx: nameFx),
      'title' => EquippedCosmetics(frame: frame, title: slot, nameFx: nameFx),
      'name_fx' => EquippedCosmetics(frame: frame, title: title, nameFx: slot),
      _ => this,
    };
  }

  /// 🔴 الخادم يردّ **كائناً لكل خانة** لا معرّفاً، ويعيد `null` للخانة إن
  ///    انتهى إيجارها ولو بقي المعرّف في عمود اللاعب — فهو المرجع الوحيد
  ///    لما يُلبَس فعلاً، لا أعمدة `players`.
  factory EquippedCosmetics.fromJson(Map<String, dynamic> j) => EquippedCosmetics(
        frame: CosmeticSlot.fromJson(j['frame']),
        title: CosmeticSlot.fromJson(j['title']),
        nameFx: CosmeticSlot.fromJson(j['nameFx']),
      );
}

/// جوائز الكسب — **مصدر الأرقام الوحيد**. بدونها لا تُعرض أرقام مخمَّنة.
class EarnRates {
  const EarnRates({this.win = 0, this.top3 = 0, this.firstMatch = 0, this.birthday = 0});
  final int win, top3, firstMatch, birthday;

  bool get any => win > 0 || top3 > 0 || birthday > 0;

  factory EarnRates.fromJson(Map<String, dynamic> j) => EarnRates(
        win: _i(j['win']),
        top3: _i(j['top3']),
        firstMatch: _i(j['firstMatch']),
        birthday: _i(j['birthday']),
      );
}

class StoreData {
  const StoreData({
    this.items = const [],
    this.balance = 0,
    this.cosmetics = const EquippedCosmetics(),
    this.earnRates,
    this.name = '',
    this.avatarUrl,
    this.rankTier = 'INFORMANT',
  });

  final List<StoreItem> items;
  final int balance;
  final EquippedCosmetics cosmetics;
  final EarnRates? earnRates;

  /// من `me` — سياق اللاعب لا يحمل الصورة ولا الرتبة، والمعاينة يجب أن
  /// تقع على صورته الحقيقية.
  final String name;
  final String? avatarUrl;
  final String rankTier;

  /// بثّ الرصيد يحدّث الرقم وحده — لا يُعاد بناء الشبكة تحت إصبع اللاعب.
  StoreData copyWithBalance(int b) => StoreData(
        items: items, balance: b, cosmetics: cosmetics, earnRates: earnRates,
        name: name, avatarUrl: avatarUrl, rankTier: rankTier,
      );

  /// 🔒 «عروض» = ما يستحقّ الالتفات ولا يملكه. مقصوصة عند ستّة.
  List<StoreItem> get offers => items
      .where((i) =>
          (i.isHot || i.isNew || i.wasOwned) &&
          !i.owned &&
          i.isPurchasable &&
          !i.closed)
      .take(6)
      .toList();

  /// 🔒 وكل ما ظهر في «عروض» **يُستبعد من تبويب نوعه** — البطاقة نفسها
  ///    ثلاث مرّات بثلاثة أزرار شراء تبدو خللاً لا وفرة.
  List<StoreItem> ofKind(String kind) {
    final shown = offers.map((o) => o.id).toSet();
    return items
        .where((i) => i.kind == kind && !i.closed && !shown.contains(i.id))
        .toList();
  }

  List<StoreItem> get mine => items.where((i) => i.owned).toList();

  List<StoreItem> get closedVault => items.where((i) => i.closed).toList();

  /// أرخص سعرٍ متاح لنوع — لرقاقة «الخانة فاضية».
  int? cheapestOf(String kind) {
    final prices = items
        .where((i) => i.kind == kind && i.isPurchasable && !i.closed && !i.owned)
        .map((i) => i.priceChips)
        .where((p) => p > 0);
    if (prices.isEmpty) return null;
    return prices.reduce((a, b) => a < b ? a : b);
  }

  factory StoreData.fromJson(Map<String, dynamic> j) {
    final me = (j['me'] ?? const {}) as Map?;
    return StoreData(
      items: (j['items'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => StoreItem.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      balance: _i(j['balance']),
      cosmetics: j['cosmetics'] is Map
          ? EquippedCosmetics.fromJson(Map<String, dynamic>.from(j['cosmetics'] as Map))
          : const EquippedCosmetics(),
      earnRates: j['earnRates'] is Map
          ? EarnRates.fromJson(Map<String, dynamic>.from(j['earnRates'] as Map))
          : null,
      name: (me?['name'] ?? '').toString(),
      avatarUrl: me?['avatarUrl'] as String?,
      rankTier: (me?['rankTier'] ?? 'INFORMANT').toString(),
    );
  }
}
