import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🎮 نماذج شاشة الألعاب والحجوزات — الملفّ 14
// ══════════════════════════════════════════════════════

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

/// 📅 أسماء الأيام والشهور — **ليست `intl`**.
/// منقولة حرفياً من الويب: تغييرها إلى تقويم النظام يجعل الشهر في
/// التطبيق يخالف الشهر في نفس الصفحة على المتصفّح.
const dayNames = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const monthNames = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/// `DateTime.weekday` يبدأ من الاثنين=1 والأحد=7؛ والمصفوفة الأحد=0.
String dayNameOf(DateTime d) => dayNames[d.weekday % 7];
String monthNameOf(DateTime d) => monthNames[d.month - 1];

class Difficulty {
  const Difficulty(this.label, this.color, this.icon);
  final String label;
  final Color color;
  final String icon;

  static const _map = <String, Difficulty>{
    'easy': Difficulty('سهل', Color(0xFF22C55E), '🟢'),
    'medium': Difficulty('متوسط', Color(0xFFF59E0B), '🟡'),
    'hard': Difficulty('صعب', Color(0xFFEF4444), '🔴'),
    'expert': Difficulty('خبير', Color(0xFFA855F7), '🟣'),
  };

  /// مجهول يسقط إلى «متوسط» — لا صعوبة مخترعة ولا رقاقة فارغة.
  static Difficulty of(String? k) => _map[k] ?? _map['medium']!;
}

class LocationOffer {
  const LocationOffer({this.name, this.title, this.price, this.description});

  final String? name, title, price, description;

  /// سلسلة الاحتياطيّ الحرفية: `name ← title ← «عرض {i+1}»`
  String labelAt(int i) {
    final n = name?.trim();
    if (n != null && n.isNotEmpty) return n;
    final t = title?.trim();
    if (t != null && t.isNotEmpty) return t;
    return 'عرض ${i + 1}';
  }

  static String? _s(dynamic v) =>
      (v is String && v.trim().isNotEmpty) ? v.trim() : (v is num ? '$v' : null);

  factory LocationOffer.fromJson(Map<String, dynamic> j) => LocationOffer(
        name: _s(j['name']),
        title: _s(j['title']),
        price: _s(j['price']),
        description: _s(j['description']),
      );
}

class Activity {
  const Activity({
    required this.id,
    required this.name,
    required this.date,
    this.description,
    this.difficulty = 'medium',
    this.locationName,
    this.locationMapUrl,
    this.bookedCount = 0,
    this.maxPlayers = 20,
    this.basePrice,
    this.offers = const [],
    this.locationId,
    this.hasMenu = false,
  });

  final int id;
  final String name;
  final DateTime date;
  final String? description, locationName, locationMapUrl;

  /// 🍽️ للاستعراض قبل الحجز: مكان الفعاليّة ولديه منيو متاح (توحيد 2026-08-06).
  final int? locationId;
  final bool hasMenu;
  final String difficulty;
  final int bookedCount, maxPlayers;

  /// 🔴 نصّ لا رقم: المقارنة بالمجّانيّ في الويب نصّية (`!== '0'`)،
  /// و`0.00` القادمة من عمود decimal ليست `'0'` فتُعرض. تحويلها إلى
  /// رقم هنا يُخفي سعراً يظهر على الويب.
  final String? basePrice;

  final List<LocationOffer> offers;

  bool get isFree => basePrice == null || basePrice == '0';
  bool get isFull => bookedCount >= maxPlayers;
  double get fillRatio => maxPlayers == 0 ? 0 : (bookedCount / maxPlayers).clamp(0, 1);

  factory Activity.fromJson(Map<String, dynamic> j) => Activity(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        date: DateTime.tryParse('${j['date']}')?.toLocal() ?? DateTime.now(),
        description: LocationOffer._s(j['description']),
        difficulty: (j['difficulty'] ?? 'medium').toString(),
        locationName: LocationOffer._s(j['locationName']),
        locationMapUrl: LocationOffer._s(j['locationMapUrl']),
        bookedCount: _i(j['bookedCount']),
        maxPlayers: _i(j['maxPlayers'], 20) == 0 ? 20 : _i(j['maxPlayers'], 20),
        basePrice: LocationOffer._s(j['basePrice']),
        offers: (j['locationOffers'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => LocationOffer.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        locationId: j['locationId'] == null ? null : _i(j['locationId']),
        hasMenu: j['hasMenu'] == true,
      );
}

/// لاعب متابَع حجز هذا النشاط.
class FollowingBooker {
  const FollowingBooker({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.level = 1,
    this.isFollowing = false,
  });

  final int id;
  final String name;
  final String? avatarUrl;
  final int level;
  final bool isFollowing;

  factory FollowingBooker.fromJson(Map<String, dynamic> j) => FollowingBooker(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        avatarUrl: j['avatarUrl'] as String?,
        level: _i(j['level'], 1),
        isFollowing: j['isFollowing'] == true,
      );
}

/// غرفة نشطة لنشاطٍ محجوز.
class ActiveRoom {
  const ActiveRoom({required this.sessionCode, this.sessionName});
  final String sessionCode;
  final String? sessionName;

  String nameAt(int i) => sessionName?.trim().isNotEmpty == true
      ? sessionName!.trim()
      : 'غرفة ${i + 1}';

  factory ActiveRoom.fromJson(Map<String, dynamic> j) => ActiveRoom(
        sessionCode: (j['sessionCode'] ?? '').toString(),
        sessionName: j['sessionName'] as String?,
      );
}
