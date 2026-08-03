import 'package:flutter/foundation.dart';

// ══════════════════════════════════════════════════════
// 🎮 نماذج حالة اللعب — §8 في الملفّ 20
// ══════════════════════════════════════════════════════
// المصدر `PlayerFlow.tsx` (٣٩٦٧ سطراً) — مكوّنٌ أحاديّ يملك السوكِت
// والاستطلاع وآلتَي الحالة والصمود. هنا يُقسَم: نماذج + متحكّم + شاشات.

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

String _s(dynamic v) => v == null ? '' : '$v';

// ══════════════════════════════════════════════════════
// آلة الخطوات
// ══════════════════════════════════════════════════════

/// 🔴 تُنفَّذ **شاشةً واحدة** بـ`AnimatedSwitcher` لا بـ`Navigator`:
///    مستمعات السوكِت يجب أن تبقى حيّةً عبر كل الخطوات.
enum GameStep {
  code,
  phone,
  login,
  register,
  changePassword,
  ticket,
  autoJoining,

  /// انضمامٌ جديد هذه الجلسة.
  done,

  /// استعادة جلسةٍ قائمة.
  rejoined;

  /// كلتاهما تعرضان شاشة اللعب، ومعظم المؤثّرات مقيّدة بهما.
  bool get inGame => this == GameStep.done || this == GameStep.rejoined;
}

// ══════════════════════════════════════════════════════
// المراحل
// ══════════════════════════════════════════════════════

/// 🔴 `DAY_ELIMINATION` **ليست** مرحلةً عميلة: الخادم يبثّها، والعميل
///    يحوّلها إلى `ELIMINATION_PENDING` — قيمةٌ عميلةٌ محضة.
abstract final class GamePhase {
  static const lobby = 'LOBBY';
  static const roleGeneration = 'ROLE_GENERATION';
  static const roleBinding = 'ROLE_BINDING';
  static const dayDiscussion = 'DAY_DISCUSSION';
  static const dayVoting = 'DAY_VOTING';
  static const dayJustification = 'DAY_JUSTIFICATION';
  static const dayTiebreaker = 'DAY_TIEBREAKER';
  static const night = 'NIGHT';
  static const morningRecap = 'MORNING_RECAP';
  static const gameOver = 'GAME_OVER';

  /// عميلةٌ فقط — مقابل `DAY_ELIMINATION` السيرفريّة.
  static const eliminationPending = 'ELIMINATION_PENDING';

  static const _serverElimination = 'DAY_ELIMINATION';

  /// تحويل ما يصل من الخادم إلى القيمة العميلة.
  static String? map(dynamic raw) {
    if (raw == null) return null;
    final p = '$raw';
    if (p.isEmpty) return null;
    return p == _serverElimination ? eliminationPending : p;
  }

  /// مراحل تُصفَّر عندها بيانات الجولة (الفريق والتوأم والدور والملاحظات).
  static bool isPreGame(String? p) =>
      p == lobby || p == roleGeneration || p == roleBinding;

  /// خارجها تُمسح حالة التصويت كاملةً.
  static bool keepsVoting(String? p) =>
      p == dayVoting || p == dayJustification;
}

// ══════════════════════════════════════════════════════
// اللاعبون
// ══════════════════════════════════════════════════════

class RosterPlayer {
  const RosterPlayer({
    required this.physicalId,
    this.name = '',
    this.isAlive = true,
    this.playerId,
    this.penalties = 0,
    this.gender,
  });

  final int physicalId;
  final String name;
  final bool isAlive;
  final int? playerId;
  final int penalties;
  final String? gender;

  bool get isFemale => gender == 'FEMALE';

  factory RosterPlayer.fromJson(Map<String, dynamic> j) => RosterPlayer(
        physicalId: _i(j['physicalId']),
        name: _s(j['name']),
        // 🔴 الغياب يعني حيّاً: لاعبٌ بلا الحقل يُرسم ميتاً بلا سبب
        isAlive: j['isAlive'] != false,
        playerId: j['playerId'] == null ? null : _i(j['playerId']),
        penalties: _i(j['penalties']),
        gender: j['gender'] as String?,
      );
}

/// زميلٌ في فريق المافيا كما يرسله الخادم.
///
/// 🔴 الخادم يرسل **كائناً** لا رقماً: `{physicalId, name, role, avatarUrl}`.
///    اختزاله إلى رقمٍ يفقد كلّ ما يعرضه المعرض — الاسم والدور والصورة —
///    فتظهر شبكة الشركاء أرقاماً عارية.
class MafiaMate {
  const MafiaMate({
    required this.physicalId,
    this.name = '',
    this.role = '',
    this.avatarUrl,
  });

  final int physicalId;
  final String name;
  final String role;
  final String? avatarUrl;

  factory MafiaMate.fromJson(Map<String, dynamic> j) => MafiaMate(
        physicalId: _i(j['physicalId']),
        name: _s(j['name']),
        role: _s(j['role']),
        avatarUrl: (j['avatarUrl'] as String?)?.isEmpty ?? true
            ? null
            : j['avatarUrl'] as String,
      );

  static List<MafiaMate> listOf(Object? v) => v is! List
      ? const []
      : v
          .whereType<Map>()
          .map((e) => MafiaMate.fromJson(Map<String, dynamic>.from(e)))
          .toList(growable: false);
}

/// الأخ في «رابط الدم» — قناةٌ مستقلّة عن فريق المافيا.
///
/// التعارف **أحاديّ الاتجاه**: الأكبر (مافيا) يرى الأصغر، والأصغر يلعب
/// أعمى. لذا `recipientIsMafia` هو true عملياً دائماً، لكنّ النصّ المعروض
/// يفترق على قيمته فنقرؤها ولا نفترضها.
class SiblingInfo {
  const SiblingInfo({
    required this.physicalId,
    this.name = '',
    this.role = '',
    this.avatarUrl,
    this.isAlive = true,
    this.recipientIsMafia = true,
  });

  final int physicalId;
  final String name;
  final String role;
  final String? avatarUrl;
  final bool isAlive;
  final bool recipientIsMafia;

  factory SiblingInfo.fromJson(Map<String, dynamic> j) => SiblingInfo(
        physicalId: _i(j['physicalId']),
        name: _s(j['name']),
        role: _s(j['role']),
        avatarUrl: (j['avatarUrl'] as String?)?.isEmpty ?? true
            ? null
            : j['avatarUrl'] as String,
        isAlive: j['isAlive'] != false,
        recipientIsMafia: j['recipientIsMafia'] != false,
      );
}

/// عقد اغتيالٍ واحد للسفّاح.
class AssassinContract {
  const AssassinContract({
    required this.id,
    this.targetRole = '',
    this.description = '',
    this.descriptionAr,
    this.completed = false,
    this.completedAtRound,
  });

  final int id;
  final String targetRole;
  final String description;
  final String? descriptionAr;
  final bool completed;
  final int? completedAtRound;

  /// العربية أوّلاً — والإنجليزية احتياطاً لعقدٍ قديمٍ بلا ترجمة.
  String get text =>
      (descriptionAr?.isNotEmpty ?? false) ? descriptionAr! : description;

  factory AssassinContract.fromJson(Map<String, dynamic> j) => AssassinContract(
        id: _i(j['id']),
        targetRole: _s(j['targetRole']),
        description: _s(j['description']),
        descriptionAr: j['descriptionAr'] as String?,
        completed: j['completed'] == true,
        completedAtRound: j['completedAtRound'] == null
            ? null
            : _i(j['completedAtRound']),
      );
}

/// حالة عقود السفّاح كاملةً.
class AssassinContracts {
  const AssassinContracts({
    this.contracts = const [],
    this.currentIndex = 0,
    this.completedCount = 0,
    this.totalRequired = 0,
  });

  final List<AssassinContract> contracts;
  final int currentIndex;
  final int completedCount;
  final int totalRequired;

  /// نسبة الإنجاز في [0,1] — القسمة على صفرٍ تُعطي NaN فتنهار الرسمة.
  double get progress =>
      totalRequired <= 0 ? 0 : (completedCount / totalRequired).clamp(0.0, 1.0);

  static AssassinContracts? fromJson(Object? v) {
    if (v is! Map) return null;
    final j = Map<String, dynamic>.from(v);
    return AssassinContracts(
      contracts: j['contracts'] is! List
          ? const []
          : (j['contracts'] as List)
              .whereType<Map>()
              .map((e) => AssassinContract.fromJson(Map<String, dynamic>.from(e)))
              .toList(growable: false),
      currentIndex: _i(j['currentIndex']),
      completedCount: _i(j['completedCount']),
      totalRequired: _i(j['totalRequired']),
    );
  }
}

/// مرشّح في اقتراع النهار.
class VoteCandidate {
  const VoteCandidate({
    required this.targetPhysicalId,
    this.name = '',
    this.votes = 0,
  });

  final int targetPhysicalId;
  final String name;
  final int votes;

  factory VoteCandidate.fromJson(Map<String, dynamic> j) => VoteCandidate(
        targetPhysicalId: _i(j['targetPhysicalId']),
        name: _s(j['name']),
        votes: _i(j['votes']),
      );
}

class VotingState {
  const VotingState({
    this.candidates = const [],
    this.totalVotesCast = 0,
    this.playerVotes = const {},
    this.playersInfo = const [],
    this.durationSeconds,
    this.votingStartTime,
  });

  final List<VoteCandidate> candidates;
  final int totalVotesCast;

  /// `physicalId` → فهرس المرشّح الذي صوّت له.
  final Map<int, int> playerVotes;
  final List<RosterPlayer> playersInfo;
  final int? durationSeconds;
  final DateTime? votingStartTime;

  /// ما تبقّى من العدّاد — يُستعاد بعد انقطاعٍ بدل أن يبدأ من الصفر.
  int? get remainingSeconds {
    final d = durationSeconds, s = votingStartTime;
    if (d == null || s == null) return null;
    final left = d - DateTime.now().difference(s).inSeconds;
    return left < 0 ? 0 : left;
  }

  static Map<int, int> _votes(dynamic raw) {
    if (raw is! Map) return const {};
    final out = <int, int>{};
    raw.forEach((k, v) {
      final id = int.tryParse('$k');
      if (id != null && v != null) out[id] = _i(v);
    });
    return out;
  }

  factory VotingState.fromJson(Map<String, dynamic> j) => VotingState(
        candidates: (j['candidates'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => VoteCandidate.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        totalVotesCast: _i(j['totalVotesCast']),
        playerVotes: _votes(j['playerVotes']),
        playersInfo: (j['playersInfo'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => RosterPlayer.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
        durationSeconds:
            j['durationSeconds'] == null ? null : _i(j['durationSeconds']),
        votingStartTime: j['votingStartTime'] == null
            ? null
            : DateTime.tryParse('${j['votingStartTime']}')?.toLocal() ??
                DateTime.fromMillisecondsSinceEpoch(_i(j['votingStartTime'])),
      );
}

// ══════════════════════════════════════════════════════
// الجلسة المحفوظة
// ══════════════════════════════════════════════════════

/// ما يُحفَظ ليُستعاد بعد إغلاق التطبيق — مقابل `mafia_session`.
class SavedGameSession {
  const SavedGameSession({
    required this.roomId,
    required this.physicalId,
    this.roomCode = '',
    this.gameName = '',
    this.phone,
    this.playerId,
  });

  final String roomId, roomCode, gameName;
  final int physicalId;
  final String? phone;
  final int? playerId;

  bool get isUsable => roomId.isNotEmpty;

  Map<String, dynamic> toJson() => {
        'roomId': roomId,
        'roomCode': roomCode,
        'gameName': gameName,
        'physicalId': physicalId,
        if (phone != null) 'phone': phone,
        if (playerId != null) 'playerId': playerId,
      };

  static SavedGameSession? fromJson(Map<String, dynamic>? j) {
    if (j == null) return null;
    final roomId = _s(j['roomId']);
    if (roomId.isEmpty) return null;
    return SavedGameSession(
      roomId: roomId,
      roomCode: _s(j['roomCode']),
      gameName: _s(j['gameName']),
      physicalId: _i(j['physicalId']),
      phone: j['phone'] as String?,
      playerId: j['playerId'] == null ? null : _i(j['playerId']),
    );
  }
}

/// مقعدٌ محجوز بعد الخروج — يعود صاحبه إليه خلال عشر دقائق.
class HeldSeat {
  const HeldSeat({
    required this.roomCode,
    required this.roomId,
    required this.exitedAt,
    this.phone,
    this.playerId,
    this.displayName = '',
  });

  static const ttl = Duration(minutes: 10);

  final String roomCode, roomId, displayName;
  final DateTime exitedAt;
  final String? phone;
  final int? playerId;

  bool get isFresh => DateTime.now().difference(exitedAt) < ttl;

  Map<String, dynamic> toJson() => {
        'roomCode': roomCode,
        'roomId': roomId,
        'exitedAt': exitedAt.millisecondsSinceEpoch,
        if (phone != null) 'phone': phone,
        if (playerId != null) 'playerId': playerId,
        'displayName': displayName,
      };

  static HeldSeat? fromJson(Map<String, dynamic>? j) {
    if (j == null) return null;
    final code = _s(j['roomCode']);
    if (code.isEmpty) return null;
    return HeldSeat(
      roomCode: code,
      roomId: _s(j['roomId']),
      exitedAt: DateTime.fromMillisecondsSinceEpoch(_i(j['exitedAt'])),
      phone: j['phone'] as String?,
      playerId: j['playerId'] == null ? null : _i(j['playerId']),
      displayName: _s(j['displayName']),
    );
  }
}

// ══════════════════════════════════════════════════════
// أنماط الاهتزاز — تُحفَظ حرفياً (§6.9)
// ══════════════════════════════════════════════════════

abstract final class Buzz {
  static const role = [100, 50, 200, 50, 300];
  static const seat = [200, 100, 200];
  static const penaltySelf = [300, 100, 300, 100, 500];
  static const penaltyEject = [500, 200, 500, 200, 500];
  static const mayor = [120, 80, 120, 80, 240];
  static const voteStart = [100, 200];
  static const gameStart = [200];
  static const warn = [100, 100];
  static const voteSuccess = [100];
}

// ══════════════════════════════════════════════════════
// 🛡️ حارس المرحلة — §6.5 في الملفّ 20
// ══════════════════════════════════════════════════════
// 🔴 حدثُ السوكِت يفوز على الاستطلاع **ستّ ثوانٍ**، ثمّ يفوز الاستطلاع
//    فيشفي جهازاً فاتَه حدثُ الانتقال. بدون هذا الحارس تومض المراحل
//    وترتدّ: استطلاعٌ قديمٌ في الطريق يُرجع اللاعب من التصويت إلى النقاش
//    بعد أن انتقل فعلاً.
class PhaseGuard {
  PhaseGuard({this.ttl = const Duration(milliseconds: 6000)});

  final Duration ttl;
  String? _phase;
  DateTime? _at;

  /// للاختبار: ساعةٌ قابلة للحقن بدل `DateTime.now()`.
  @visibleForTesting
  DateTime Function() now = DateTime.now;

  /// انتقالٌ مدفوعٌ بحدث — يُثبَّت ويُحمى.
  void arm(String? phase) {
    _phase = phase;
    _at = now();
  }

  bool get isActive {
    final at = _at;
    return at != null && now().difference(at) <= ttl;
  }

  /// هل يُسمح للاستطلاع بكتابة هذه المرحلة؟
  ///
  /// نعم إن: لا حارس · أو انتهت مهلته · أو جاء بالمرحلة نفسها.
  /// ولا إن: حارسٌ حيٌّ يخالفها — وحينها تُتجاهَل القيمة القادمة.
  bool allows(String? incoming) {
    final at = _at;
    if (at == null) return true;
    if (now().difference(at) > ttl) {
      clear();
      return true;
    }
    if (_phase == incoming) {
      clear();
      return true;
    }
    return false;
  }

  void clear() {
    _phase = null;
    _at = null;
  }
}

/// مودال تبديل الغرفة — §4.10 في الملفّ 21.
///
/// 🔴 لا انضمام صامتٌ إلى غرفةٍ أخرى: اللاعب قد يكون جالساً على طاولةٍ
///    الآن، ونقلُه بلا سؤالٍ يفقده مقعده ودورَه.
class SwitchConfirm {
  const SwitchConfirm({
    required this.currentRoomId,
    required this.currentRoomName,
    required this.targetRoomId,
  });

  final String currentRoomId, currentRoomName, targetRoomId;
}


/// نتيجة محاولة استعادة الالتحاق.
///
/// 🔴 التفريق بين الاثنين ليس تجميلاً: معاملةُ التعذّر معاملةَ الرفض
///    تمسح جلسة لاعبٍ ما زال مقعده محجوزاً على الطاولة.
enum RejoinResult {
  /// التحق فعلاً.
  ok,

  /// الخادم ردّ صراحةً بأن لا التحاق — الجلسة لم تعد قائمة.
  rejected,

  /// لا ردّ: شبكة أو سوكِت غير متّصل. يُعاد لاحقاً.
  unreachable,
}
