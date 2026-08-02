import 'profile.dart' show MatchBreakdown, mafiaRoles;

// ══════════════════════════════════════════════════════
// 📜 نموذج مباراة في السجل الكامل — §8 في الملفّ 16
// ══════════════════════════════════════════════════════
// ⚠️ ليس نفس `MatchHistoryEntry` (نموذج البروفايل) رغم التشابه: نقطتا
//    النهاية تختلفان في أسماء الحقول (`durationSeconds` هنا مقابل
//    `matchDuration` هناك)، وهذه تحمل حقولاً لا تصل تلك (اسم اللعبة،
//    جولات النجاة، لحظة الإقصاء). التفصيل (`MatchBreakdown`) مشترك.

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

int? _iOrNull(dynamic v) =>
    v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));

class MatchDetails {
  const MatchDetails({
    this.matchId = 0,
    this.gameName,
    this.matchDate,
    this.matchWinner,
    this.durationSeconds,
    this.role,
    this.survivedToEnd = false,
    this.eliminatedDuring,
    this.eliminatedAtRound,
    this.roundsSurvived = 0,
    this.dealInitiated = false,
    this.dealSuccess = false,
    this.xpEarned = 0,
    this.rrChange = 0,
    this.breakdown,
  });

  final int matchId;
  final String? gameName;
  final DateTime? matchDate;
  final String? matchWinner;
  final int? durationSeconds;
  final String? role;
  final bool survivedToEnd;
  final String? eliminatedDuring;
  final int? eliminatedAtRound;
  final int roundsSurvived;
  final bool dealInitiated, dealSuccess;
  final int xpEarned, rrChange;
  final MatchBreakdown? breakdown;

  // ══════════════════════════════════════════════════════
  // 🔴 اشتقاقان مختلفان عمداً — لا توحّدهما
  // ══════════════════════════════════════════════════════
  // البطاقة تنظر إلى **الدور وحده**؛ التفصيل يفضّل `breakdown` ثمّ يسقط
  // إلى الدور. النتيجة أنّ دوراً محايداً (المهرّج، السفّاح) قد يُعرض
  // «خسارة» على البطاقة و«فوز» في تفصيله. هذا سلوك المصدر: البطاقة
  // تصنيفٌ سريع بالفريق، والتفصيل حكم الخادم. توحيدهما يبدو إصلاحاً
  // ويغيّر معنى الشاشتين.

  /// اشتقاق **البطاقة**: من الدور فقط.
  bool get cardIsMafia => mafiaRoles.contains(role);

  bool get cardWon =>
      (cardIsMafia && matchWinner == 'MAFIA') ||
      (!cardIsMafia && matchWinner == 'CITIZEN');

  /// اشتقاق **التفصيل**: `breakdown` أوّلاً.
  bool get detailIsNeutral => breakdown?.team == 'NEUTRAL';

  bool get detailIsMafia =>
      breakdown != null ? breakdown!.team == 'MAFIA' : cardIsMafia;

  bool get detailWon => breakdown?.won ?? cardWon;

  /// «نجا للنهاية» أو «أُقصي ليلاً (جولة ٣)».
  String get survivalText {
    if (survivedToEnd) return 'نجا للنهاية';
    final when = eliminatedDuring == 'NIGHT' ? 'ليلاً' : 'نهاراً';
    return 'أُقصي $when (جولة ${eliminatedAtRound ?? '?'})';
  }

  /// `7:05`. صفرٌ أو غياب ⇒ «—» (بخلاف البروفايل حيث الصفر يُعرض:
  /// هذه الشاشة تعتبر مباراةً بلا زمن مباراةً بلا زمنٍ معروف).
  String get durationText {
    final s = durationSeconds;
    if (s == null || s == 0) return '—';
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  /// 🔴 ميلاديّ بأرقام **لاتينية** خام — لا `intl` ولا تقويم عربيّ.
  /// (ورقة بروفايل الرتب تستعمل `ar` مختصراً؛ هنا التطابق مع الويب
  /// يقتضي `d/m/y` صريحاً.)
  String get dateText {
    final d = matchDate;
    return d == null ? '—' : '${d.day}/${d.month}/${d.year}';
  }

  factory MatchDetails.fromJson(Map<String, dynamic> j) => MatchDetails(
        matchId: _i(j['matchId']),
        gameName: (j['gameName'] as String?)?.trim().isEmpty ?? true
            ? null
            : j['gameName'] as String,
        matchDate: j['matchDate'] == null
            ? null
            : DateTime.tryParse('${j['matchDate']}')?.toLocal(),
        matchWinner: j['matchWinner'] as String?,
        durationSeconds: _iOrNull(j['durationSeconds']),
        role: j['role'] as String?,
        survivedToEnd: j['survivedToEnd'] == true,
        eliminatedDuring: j['eliminatedDuring'] as String?,
        eliminatedAtRound: _iOrNull(j['eliminatedAtRound']),
        roundsSurvived: _i(j['roundsSurvived']),
        dealInitiated: j['dealInitiated'] == true,
        dealSuccess: j['dealSuccess'] == true,
        xpEarned: _i(j['xpEarned']),
        rrChange: _i(j['rrChange']),
        breakdown: j['breakdown'] is Map
            ? MatchBreakdown.fromJson(Map<String, dynamic>.from(j['breakdown'] as Map))
            : null,
      );
}
