// ══════════════════════════════════════════════════════
// 🏙️ المدينة — التصنيف بحسب (الموسم، المدينة)
// ══════════════════════════════════════════════════════
// الأسماء تصل من الخادم دائماً (`/api/cities/public`) — لا «عمّان/الزرقاء»
// مكتوبةً في المنطق. المعرّف ١ وحده له معنًى ثابت: لونه العنبريّ القائم.

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

class City {
  const City({required this.id, required this.name});

  final int id;
  final String name;

  factory City.fromJson(Map<String, dynamic> j) =>
      City(id: _i(j['id']), name: (j['name'] ?? '').toString());

  /// قائمة من أيّ استجابة تحمل `cities` — العناصر الزائدة (players،
  /// matches، slug…) تُهمَل بصمت.
  static List<City> listFrom(dynamic v) => (v as List? ?? const [])
      .whereType<Map>()
      .map((e) => City.fromJson(Map<String, dynamic>.from(e)))
      .where((c) => c.id > 0)
      .toList();

  @override
  bool operator ==(Object other) => other is City && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
