// ══════════════════════════════════════════════════════
// 🎭 بيانات اللاعب
// ══════════════════════════════════════════════════════
// 📌 مكتوبة يدوياً لا بـfreezed — وهذا انحراف مقصود عن §3.1 في الخطة
//    الرئيسية، لا سهو:
//
//    freezed هو القرار الصحيح لطبقة النماذج الكاملة (GameState متداخلة
//    وكبيرة، وcopyWith عليها يدوياً عبث). لكن M1 يحتاج نموذجاً واحداً،
//    وإدخال build_runner لأجله يعني خطوة توليد في كل بناء مقابل لا شيء.
//
//    يُتبنّى freezed مع الملفّ 02 في M4 حين تهبط عشرون نموذجاً معاً،
//    ويُحوَّل هذا معها. الحقول أدناه مطابقة لما يعيده الخادم حرفياً.

class PlayerData {
  const PlayerData({
    required this.id,
    required this.name,
    required this.phone,
    this.avatarUrl,
    this.rankTier,
    this.rankRR = 0,
    this.level = 1,
    this.gender,
    this.mustChangePassword = false,
    this.linkedStaffId,
    this.dob,
  });

  final int id;
  final String name;
  final String phone;
  final String? avatarUrl;
  final String? rankTier;
  final int rankRR;
  final int level;
  final String? gender;
  final bool mustChangePassword;
  final int? linkedStaffId;

  /// تاريخ الميلاد `YYYY-MM-DD` — يخصّ عيديّة النادي السنويّة (BDAY-1).
  /// غيابُه يعني أن اللاعب لم يُسأل بعد، لا أنه رفض.
  final String? dob;

  /// 🔴 الفراغ كالغياب: الخادم قد يعيد `''` لحقلٍ لم يُملأ، وقبولُه يعني
  ///    بوّابةً لا تظهر أبداً للاعبٍ بلا تاريخ.
  bool get needsBirthday => (dob ?? '').trim().isEmpty;

  bool get isFemale => gender == 'FEMALE';

  /// لا يرمي على حقل ناقص — الخادم قد يضيف أو يُسقط حقلاً قبل التطبيق،
  /// وشاشة دخول تنهار بسبب حقل جديد أسوأ من حقل غائب.
  factory PlayerData.fromJson(Map<String, dynamic> j) => PlayerData(
        id: _int(j['id']),
        name: (j['name'] ?? '').toString(),
        phone: (j['phone'] ?? '').toString(),
        avatarUrl: j['avatarUrl'] as String?,
        rankTier: j['rankTier'] as String?,
        rankRR: _int(j['rankRR']),
        level: _int(j['level'], fallback: 1),
        gender: j['gender'] as String?,
        mustChangePassword: j['mustChangePassword'] == true,
        linkedStaffId: j['linkedStaffId'] == null ? null : _int(j['linkedStaffId']),
        dob: j['dob'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'phone': phone,
        'avatarUrl': avatarUrl,
        'rankTier': rankTier,
        'rankRR': rankRR,
        'level': level,
        'gender': gender,
        'mustChangePassword': mustChangePassword,
        'linkedStaffId': linkedStaffId,
        'dob': dob,
      };

  static int _int(dynamic v, {int fallback = 0}) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse('$v') ?? fallback;
  }

  @override
  String toString() => 'PlayerData(#$id $name)';
}
