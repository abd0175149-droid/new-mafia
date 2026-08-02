// ══════════════════════════════════════════════════════
// 🏠 نماذج الشاشة الرئيسية — §8 في الملفّ 12
// ══════════════════════════════════════════════════════
// مكتوبة يدوياً كنموذج اللاعب، ولنفس السبب (انظر models/player.dart).

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

double _d(dynamic v, [double f = 0]) =>
    v is num ? v.toDouble() : double.tryParse('$v') ?? f;

/// إحصاءات اللاعب — كل قيمة احتياطيها صفر.
class PlayerStats {
  const PlayerStats({
    this.totalMatches = 0,
    this.winRate = 0,
    this.survivalRate = 0,
    this.longestWinStreak = 0,
  });

  final int totalMatches;
  final int winRate;
  final int survivalRate;
  final int longestWinStreak;

  factory PlayerStats.fromJson(Map<String, dynamic> j) => PlayerStats(
        totalMatches: _i(j['totalMatches']),
        winRate: _i(j['winRate']),
        survivalRate: _i(j['survivalRate']),
        longestWinStreak: _i(j['longestWinStreak']),
      );
}

/// التقدّم — الرتبة والمستوى وشريط الخبرة.
class Progression {
  const Progression({
    this.rankTier = 'INFORMANT',
    this.level = 1,
    this.xp = 0,
    this.nextLevelXP = 500,   // احتياطيّ مذكور صراحةً في المواصفة
    this.xpProgress = 0,
  });

  final String rankTier;
  final int level;
  final int xp;
  final int nextLevelXP;
  final double xpProgress;

  factory Progression.fromJson(Map<String, dynamic> j) => Progression(
        rankTier: (j['rankTier'] ?? 'INFORMANT').toString(),
        level: _i(j['level'], 1),
        xp: _i(j['xp']),
        nextLevelXP: _i(j['nextLevelXP'], 500),
        xpProgress: _d(j['xpProgress']).clamp(0, 100),
      );
}

class HomeProfile {
  const HomeProfile({
    this.name = 'لاعب',
    this.avatarUrl,
    this.canHostRemote = false,
    this.stats = const PlayerStats(),
    this.progression = const Progression(),
  });

  final String name;
  final String? avatarUrl;
  final bool canHostRemote;
  final PlayerStats stats;
  final Progression progression;

  factory HomeProfile.fromJson(Map<String, dynamic> j) {
    final p = (j['player'] ?? const {}) as Map? ;
    return HomeProfile(
      name: ((p?['name'] ?? '').toString().trim().isEmpty)
          ? 'لاعب'                       // الاحتياطيّ المذكور في المواصفة
          : p!['name'].toString(),
      avatarUrl: p?['avatarUrl'] as String?,
      canHostRemote: p?['canHostRemote'] == true,
      stats: PlayerStats.fromJson(Map<String, dynamic>.from((j['stats'] ?? const {}) as Map)),
      progression: Progression.fromJson(Map<String, dynamic>.from((j['progression'] ?? const {}) as Map)),
    );
  }
}

/// نشاط قادم.
class UpcomingActivity {
  const UpcomingActivity({
    required this.id,
    required this.name,
    required this.date,
    this.difficulty = 'medium',
    this.locationName,
    this.bookedCount = 0,
    this.maxPlayers = 20,          // احتياطيّ مذكور صراحةً
  });

  final int id;
  final String name;
  final DateTime date;
  final String difficulty;
  final String? locationName;
  final int bookedCount;
  final int maxPlayers;

  factory UpcomingActivity.fromJson(Map<String, dynamic> j) => UpcomingActivity(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        date: DateTime.tryParse('${j['date']}') ?? DateTime.now(),
        // قيمة غير معروفة تسقط إلى medium — لا تُعرض صعوبة مخترعة
        difficulty: const ['easy', 'medium', 'hard', 'expert'].contains(j['difficulty'])
            ? j['difficulty'].toString()
            : 'medium',
        locationName: j['locationName'] as String?,
        bookedCount: _i(j['bookedCount']),
        maxPlayers: _i(j['maxPlayers'], 20),
      );
}

/// جدول الرتب — منقول من `lib/ranks.ts`.
class RankInfo {
  const RankInfo(this.badge, this.nameAr);
  final String badge;
  final String nameAr;

  static const _map = <String, RankInfo>{
    'INFORMANT': RankInfo('🕵️', 'مُخبر'),
    'SOLDIER': RankInfo('⚔️', 'جندي'),
    'CAPO': RankInfo('🎖️', 'كابو'),
    'UNDERBOSS': RankInfo('💎', 'أندربوس'),
    'GODFATHER': RankInfo('👑', 'الأب الروحي'),
  };

  /// رتبة مجهولة تسقط إلى «مُخبر» — لا شارة فارغة ولا نصّ خام.
  static RankInfo of(String? tier) => _map[tier] ?? _map['INFORMANT']!;
}
