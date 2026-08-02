import 'package:flutter/material.dart';

import 'home.dart' show RankInfo;

// ══════════════════════════════════════════════════════
// 👤 نماذج الملفّ الشخصيّ — §8 في الملفّ 13
// ══════════════════════════════════════════════════════
// مكتوبة يدوياً كبقيّة النماذج (السبب في models/player.dart).

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

int? _iOrNull(dynamic v) =>
    v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));

double _d(dynamic v, [double f = 0]) =>
    v is num ? v.toDouble() : double.tryParse('$v') ?? f;

DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

// ══════════════════════════════════════════════════════
// 🎖️ تكوين الرتب — §4.0
// ══════════════════════════════════════════════════════
// ⚠️ لوحة ألوان **خاصّة بهذه الشاشة**. شاشة الرتب (الملفّ 15) تستعمل
//    لوحة أخرى عمداً — توحيدهما يبدو تنظيفاً ويكسر هويّة إحداهما.
//
// الاسم العربيّ والأيقونة يأتيان من RankInfo — نفس القيم حرفياً، ومصدرٌ
// واحد أفضل من نصّين عربيّين متطابقين ينحرف أحدهما يوماً.

class RankConfig {
  const RankConfig(this.tier, this.color, {this.extraGlow = false});

  /// المفتاح الخام كما يصل من الخادم.
  final String tier;
  final Color color;

  /// توهّج أحمر إضافيّ — للأب الروحيّ وحده.
  final bool extraGlow;

  String get nameAr => RankInfo.of(tier).nameAr;
  String get icon => RankInfo.of(tier).badge;

  /// سلّم الترقّي بالترتيب.
  static const ladder = <RankConfig>[
    RankConfig('INFORMANT', Color(0xFFCD7F32)),
    RankConfig('SOLDIER', Color(0xFFC0C0C0)),
    RankConfig('CAPO', Color(0xFFFFD700)),
    RankConfig('UNDERBOSS', Color(0xFF00BFFF)),
    RankConfig('GODFATHER', Color(0xFFDC2626), extraGlow: true),
  ];

  /// رتبة مجهولة أو غائبة → مُخبر. لا شارة فارغة ولا مفتاح خام معروض.
  static RankConfig of(String? tier) =>
      ladder.firstWhere((r) => r.tier == tier, orElse: () => ladder.first);

  static int indexOf(String? tier) {
    final i = ladder.indexWhere((r) => r.tier == tier);
    return i < 0 ? 0 : i;
  }
}

// ══════════════════════════════════════════════════════
// 🎭 أسماء الأدوار — §4.0
// ══════════════════════════════════════════════════════
// مشتركة مع شاشة السجل (الملفّ 16).

const roleNamesAr = <String, String>{
  'GODFATHER': 'شيخ المافيا',
  'SILENCER': 'قص المافيا',
  'CHAMELEON': 'حرباية المافيا',
  'MAFIA_REGULAR': 'مافيا عادي',
  'SHERIFF': 'الشريف',
  'DOCTOR': 'الطبيب',
  'SNIPER': 'القناص',
  'POLICEWOMAN': 'الشرطية',
  'NURSE': 'الممرضة',
  'MAYOR': 'العمدة',
  'CITIZEN': 'مواطن صالح',
  'WITCH': 'الساحرة',
  'OLDER_BROTHER': 'الأخ الأكبر',
  'YOUNGER_BROTHER': 'الأخ الأصغر',
  'JESTER': 'المهرج',
  'ASSASSIN': 'السفّاح',
};

/// مفتاح غير معروف يُعرض خاماً؛ دورٌ غائب كلياً يُعرض «—».
String roleNameAr(String? key) =>
    (key == null || key.isEmpty) ? '—' : (roleNamesAr[key] ?? key);

/// لاشتقاق الفريق حين لا يصل `breakdown` (مباريات قديمة).
const mafiaRoles = <String>[
  'GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR',
];

// ══════════════════════════════════════════════════════
// النماذج
// ══════════════════════════════════════════════════════

class PlayerInfo {
  const PlayerInfo({
    required this.id,
    required this.name,
    this.email,
    this.phone = '',
    this.gender = 'MALE',
    this.createdAt,
    this.avatarUrl,
  });

  final int id;
  final String name;
  final String? email;
  final String phone;
  final String gender;
  final DateTime? createdAt;
  final String? avatarUrl;

  bool get isFemale => gender == 'FEMALE';

  factory PlayerInfo.fromJson(Map<String, dynamic> j) => PlayerInfo(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        email: (j['email'] as String?)?.trim().isEmpty ?? true ? null : j['email'] as String,
        phone: (j['phone'] ?? '').toString(),
        gender: (j['gender'] ?? 'MALE').toString(),
        createdAt: _date(j['createdAt']),
        avatarUrl: j['avatarUrl'] as String?,
      );

  PlayerInfo copyWith({String? name, Object? email = _keep, String? avatarUrl}) => PlayerInfo(
        id: id,
        name: name ?? this.name,
        // ⚠️ null معنًى صريح هنا (مسح الإيميل) — لذا حارس _keep بدل `??`
        email: identical(email, _keep) ? this.email : email as String?,
        phone: phone,
        gender: gender,
        createdAt: createdAt,
        avatarUrl: avatarUrl ?? this.avatarUrl,
      );

  static const _keep = Object();
}

class ProfileStats {
  const ProfileStats({
    this.totalMatches = 0,
    this.totalWins = 0,
    this.winRate = 0,
    this.survivalRate = 0,
    this.longestWinStreak = 0,
    this.favoriteRole,
    this.mafiaWinRate = 0,
    this.citizenWinRate = 0,
    this.mafiaGames = 0,
    this.citizenGames = 0,
    this.mafiaWins = 0,
    this.citizenWins = 0,
  });

  final int totalMatches, totalWins;
  final int winRate, survivalRate;
  final int longestWinStreak;
  final String? favoriteRole;
  final int mafiaWinRate, citizenWinRate;
  final int mafiaGames, citizenGames, mafiaWins, citizenWins;

  int get losses => totalMatches - totalWins;

  factory ProfileStats.fromJson(Map<String, dynamic> j) => ProfileStats(
        totalMatches: _i(j['totalMatches']),
        totalWins: _i(j['totalWins']),
        winRate: _i(j['winRate']),
        survivalRate: _i(j['survivalRate']),
        longestWinStreak: _i(j['longestWinStreak']),
        favoriteRole: (j['favoriteRole'] as String?)?.trim().isEmpty ?? true
            ? null
            : j['favoriteRole'] as String,
        mafiaWinRate: _i(j['mafiaWinRate']),
        citizenWinRate: _i(j['citizenWinRate']),
        mafiaGames: _i(j['mafiaGames']),
        citizenGames: _i(j['citizenGames']),
        mafiaWins: _i(j['mafiaWins']),
        citizenWins: _i(j['citizenWins']),
      );
}

/// كل الافتراضيات هنا منصوصة في §6.9 — `progression` قد تغيب كلياً.
class PlayerProgression {
  const PlayerProgression({
    this.rankTier = 'INFORMANT',
    this.level = 1,
    this.xp = 0,
    this.nextLevelXP = 500,
    this.xpProgress = 0,
    this.rankRR = 0,
    this.rrRequired = 100,
    this.successfulDeals = 0,
    this.totalDeals = 0,
    this.dealSuccessRate = 0,
  });

  final String rankTier;
  final int level, xp, nextLevelXP;
  final double xpProgress;
  final int rankRR, rrRequired;
  final int successfulDeals, totalDeals;
  final int dealSuccessRate;

  factory PlayerProgression.fromJson(Map<String, dynamic> j) => PlayerProgression(
        rankTier: (j['rankTier'] ?? 'INFORMANT').toString(),
        level: _i(j['level'], 1),
        xp: _i(j['xp']),
        nextLevelXP: _i(j['nextLevelXP'], 500),
        xpProgress: _d(j['xpProgress']).clamp(0, 100),
        rankRR: _i(j['rankRR']),
        // صفر يعني قسمةً على صفر في شريط الـRR — الافتراضيّ يحمي منها
        rrRequired: _i(j['rrRequired'], 100) == 0 ? 100 : _i(j['rrRequired'], 100),
        successfulDeals: _i(j['successfulDeals']),
        totalDeals: _i(j['totalDeals']),
        dealSuccessRate: _i(j['dealSuccessRate']),
      );
}

class PointLine {
  const PointLine({this.icon = '', this.label = '', this.value = 0});

  /// الأيقونة والتسمية يُعرضان **كما وصلا** من الخادم — لا ترجمة.
  final String icon, label;
  final int value;

  factory PointLine.fromJson(Map<String, dynamic> j) => PointLine(
        icon: (j['icon'] ?? '').toString(),
        label: (j['label'] ?? '').toString(),
        value: _i(j['value']),
      );
}

class MatchBreakdown {
  const MatchBreakdown({
    this.team = 'CITIZEN',
    this.won = false,
    this.xp = const [],
    this.rr = const [],
  });

  final String team;
  final bool won;
  final List<PointLine> xp, rr;

  static List<PointLine> _lines(dynamic v) => (v as List? ?? const [])
      .whereType<Map>()
      .map((e) => PointLine.fromJson(Map<String, dynamic>.from(e)))
      .toList();

  factory MatchBreakdown.fromJson(Map<String, dynamic> j) => MatchBreakdown(
        team: (j['team'] ?? 'CITIZEN').toString(),
        won: j['won'] == true,
        xp: _lines(j['xp']),
        rr: _lines(j['rr']),
      );
}

class MatchHistoryEntry {
  const MatchHistoryEntry({
    this.role,
    this.matchWinner,
    this.survived = false,
    this.xpEarned,
    this.rrChange,
    this.matchDuration,
    this.matchDate,
    this.matchPlayerCount,
    this.physicalId,
    this.dealInitiated = false,
    this.dealSuccess = false,
    this.breakdown,
  });

  final String? role, matchWinner;
  final bool survived;

  /// nullable عمداً: الغياب يُخفي الـchip، والصفر يعرضه بقيمة صفر.
  final int? xpEarned, rrChange, matchDuration, matchPlayerCount, physicalId;
  final DateTime? matchDate;
  final bool dealInitiated, dealSuccess;
  final MatchBreakdown? breakdown;

  bool get isNeutral => breakdown?.team == 'NEUTRAL';

  bool get isMafia => breakdown != null
      ? breakdown!.team == 'MAFIA'
      : mafiaRoles.contains(role);

  /// `breakdown` أوّلاً — هو حساب الخادم. الاشتقاق احتياطٌ للمباريات
  /// القديمة التي سبقت وجوده.
  bool get won => breakdown?.won ??
      ((isMafia && matchWinner == 'MAFIA') || (!isMafia && matchWinner == 'CITIZEN'));

  factory MatchHistoryEntry.fromJson(Map<String, dynamic> j) => MatchHistoryEntry(
        role: j['role'] as String?,
        matchWinner: j['matchWinner'] as String?,
        survived: j['survived'] == true,
        xpEarned: _iOrNull(j['xpEarned']),
        rrChange: _iOrNull(j['rrChange']),
        matchDuration: _iOrNull(j['matchDuration']),
        matchDate: _date(j['matchDate']),
        matchPlayerCount: _iOrNull(j['matchPlayerCount']),
        physicalId: _iOrNull(j['physicalId']),
        dealInitiated: j['dealInitiated'] == true,
        dealSuccess: j['dealSuccess'] == true,
        breakdown: j['breakdown'] is Map
            ? MatchBreakdown.fromJson(Map<String, dynamic>.from(j['breakdown'] as Map))
            : null,
      );
}

class LeaderboardEntry {
  const LeaderboardEntry({
    required this.id,
    required this.name,
    this.level = 1,
    this.rankRR = 0,
    this.rankTier = 'INFORMANT',
  });

  final int id;
  final String name;
  final int level, rankRR;
  final String rankTier;

  factory LeaderboardEntry.fromJson(Map<String, dynamic> j) => LeaderboardEntry(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        level: _i(j['level'], 1),
        rankRR: _i(j['rankRR']),
        rankTier: (j['rankTier'] ?? 'INFORMANT').toString(),
      );
}

class ProfileResponse {
  const ProfileResponse({
    required this.player,
    this.stats = const ProfileStats(),
    this.progression = const PlayerProgression(),
    this.matchHistory = const [],
  });

  final PlayerInfo player;
  final ProfileStats stats;
  final PlayerProgression progression;
  final List<MatchHistoryEntry> matchHistory;

  ProfileResponse copyWith({PlayerInfo? player}) => ProfileResponse(
        player: player ?? this.player,
        stats: stats,
        progression: progression,
        matchHistory: matchHistory,
      );

  factory ProfileResponse.fromJson(Map<String, dynamic> j) => ProfileResponse(
        player: PlayerInfo.fromJson(
            Map<String, dynamic>.from((j['player'] ?? const {}) as Map)),
        stats: ProfileStats.fromJson(
            Map<String, dynamic>.from((j['stats'] ?? const {}) as Map)),
        progression: PlayerProgression.fromJson(
            Map<String, dynamic>.from((j['progression'] ?? const {}) as Map)),
        matchHistory: (j['matchHistory'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => MatchHistoryEntry.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

// ══════════════════════════════════════════════════════
// 📸 ثوابت خطّ أنابيب الأفاتار — §8
// ══════════════════════════════════════════════════════
// العقد النهائيّ (512×512 JPEG q92) **لا يتغيّر مع حجم الشاشة**؛ الذي
// يتغيّر هو حجم المعاينة، ومعه `ratio` وحده.

abstract final class AvatarPipeline {
  static const int maxFileBytes = 10 * 1024 * 1024;
  static const int outputSize = 512;
  static const int jpegQuality = 92;
  static const double minScale = 0.1, maxScale = 5.0;
  static const double wheelStep = 0.05, buttonStep = 0.15;

  /// سقف فكّ الترميز: ملفّ ١٠ ميغا قد يكون ٤٠+ ميغابكسل، وفكّه كاملاً
  /// يلتهم مئات الميغابايت ويقتل العملية على أجهزة ضعيفة. أكبر بثمانية
  /// أضعاف من الناتج، فلا أثر بصريّ.
  static const int maxDecodeEdge = 4096;

  /// معامل التحويل من إحداثيات المعاينة إلى إحداثيات الناتج.
  /// **هو وحده ما يتغيّر مع حجم الشاشة** — العقد يبقى 512×512.
  static double ratioFor(double previewSize) => outputSize / previewSize;

  /// الملاءمة الابتدائية (cover): أصغر ضلع يملأ المعاينة، والصورة تُوسَّط.
  /// تُحسب ضدّ أبعاد الصورة **المفكوكة** لا الأصلية.
  static (double scale, Offset offset) initialFit(int w, int h, double preview) {
    final s = preview / (w < h ? w : h);
    return (s, Offset((preview - w * s) / 2, (preview - h * s) / 2));
  }
}

/// `079****4719` — الإخفاء عرضيّ فقط؛ الخادم يرسل الرقم كاملاً.
String maskPhone(String phone) => phone.replaceFirstMapped(
    RegExp(r'(\d{3})\d{4}(\d+)'), (m) => '${m[1]}****${m[2]}');

/// مدّة المباراة `m:ss` — الدقائق بلا حشو، الثواني بحشو صفرين.
/// غياب القيمة «—» لا «0:00»: صفرٌ يعني مباراةً بلا زمن، والغياب يعني
/// أنّنا لا نعرف.
String formatDuration(int? seconds) {
  if (seconds == null) return '—';
  return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
}

/// مصغّر WebP 192px — regex منقول حرفياً من `lib/avatar.ts`.
/// رابط غير مطابق يُعاد كما هو.
String? avatarThumb(String? url) {
  if (url == null || url.isEmpty) return url;
  final m = RegExp(r'^(.*\/avatars\/)([^/?#.]+)\.[a-zA-Z]+(?:[?#].*)?$').firstMatch(url);
  return m == null ? url : '${m.group(1)}thumbs/${m.group(2)}.webp';
}
