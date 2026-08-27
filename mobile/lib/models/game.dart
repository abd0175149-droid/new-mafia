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
    this.avatarUrl,
  });

  final int physicalId;
  final String name;
  final bool isAlive;
  final int? playerId;
  final int penalties;
  final String? gender;

  /// الصورة عامّة — تظهر في اللوبي وعلى الطاولة. ليست تسريباً.
  final String? avatarUrl;

  bool get isFemale => gender == 'FEMALE';

  factory RosterPlayer.fromJson(Map<String, dynamic> j) => RosterPlayer(
        physicalId: _i(j['physicalId']),
        name: _s(j['name']),
        // 🔴 الغياب يعني حيّاً: لاعبٌ بلا الحقل يُرسم ميتاً بلا سبب
        isAlive: j['isAlive'] != false,
        playerId: j['playerId'] == null ? null : _i(j['playerId']),
        penalties: _i(j['penalties']),
        avatarUrl: j['avatarUrl'] == null ? null : _s(j['avatarUrl']),
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
    this.id,
    this.name = '',
    this.votes = 0,
    this.type,
    this.initiatorPhysicalId,
    this.avatarUrl,
  });

  final int targetPhysicalId;
  final String? id;
  final String name;
  final int votes;

  /// `DEAL` = صفقة إعدامٍ بين مبادرٍ وهدف. التمييز الوحيد المستعمل
  /// في العرض هو هذه القيمة نفسها.
  final String? type;
  final int? initiatorPhysicalId;
  final String? avatarUrl;

  bool get isDeal => type == 'DEAL';

  factory VoteCandidate.fromJson(Map<String, dynamic> j) => VoteCandidate(
        targetPhysicalId: _i(j['targetPhysicalId']),
        id: j['id'] == null ? null : '${j['id']}',
        name: _s(j['name']),
        votes: _i(j['votes']),
        type: j['type'] as String?,
        initiatorPhysicalId: j['initiatorPhysicalId'] == null
            ? null
            : _i(j['initiatorPhysicalId']),
        avatarUrl: (j['avatarUrl'] as String?)?.isEmpty ?? true
            ? null
            : j['avatarUrl'] as String,
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

  /// 🪪 `IDENTITY_REQUIRED`: الخادم رفض التعرّف على الجهاز بالمقعد وحده.
  ///
  /// 🔴 ليس رفضاً بمعنى «الجلسة انتهت»: المقعد قد يكون ما زال محجوزاً،
  ///    لكن بعد نقل المقاعد لم يعد رقمُه هويّة — وقد صار يدلّ على شخصٍ
  ///    آخر. التخمين هنا يسلّم للعائد دورَ غيره، فيُطلب منه أن يعرّف
  ///    نفسه بهاتفه أو حسابه.
  identityRequired,
}

// ══════════════════════════════════════════════════════
// 🎤 حالة النقاش — §4.2 في الملفّ ٢٥
// ══════════════════════════════════════════════════════

class DiscussionState {
  const DiscussionState({
    this.currentSpeakerId,
    this.timeLimitSeconds = 0,
    this.timeRemaining = 0,
    this.startTimeMs,
    this.status = 'WAITING',
    this.speakingQueue = const [],
    this.hasSpoken = const [],
    this.isFinished = false,
  });

  final int? currentSpeakerId;
  final int timeLimitSeconds, timeRemaining;
  final int? startTimeMs;

  /// `WAITING` انتظار إذن الليدر · `SPEAKING` الوقت يُحتسب · `PAUSED`.
  final String status;
  final List<int> speakingQueue, hasSpoken;
  final bool isFinished;

  bool get isSpeaking => status == 'SPEAKING';

  /// المتبقّي الحقيقيّ: `timeRemaining` يُجمَّد عند آخر إيقاف، فيُطرح منه
  /// ما مضى منذ `startTime` وإلّا بقي العدّاد ساكناً طوال الكلام.
  int remaining({DateTime? now}) {
    final st = startTimeMs;
    if (!isSpeaking || st == null) return timeRemaining;
    final elapsed = ((now ?? DateTime.now()).millisecondsSinceEpoch - st) ~/ 1000;
    final left = timeRemaining - elapsed;
    return left < 0 ? 0 : left;
  }

  static List<int> _ids(Object? v) => v is! List
      ? const []
      : v.whereType<num>().map((e) => e.toInt()).toList(growable: false);

  static DiscussionState? fromJson(Object? v) {
    if (v is! Map) return null;
    return DiscussionState(
      currentSpeakerId: (v['currentSpeakerId'] as num?)?.toInt(),
      timeLimitSeconds: _i(v['timeLimitSeconds']),
      timeRemaining: _i(v['timeRemaining']),
      startTimeMs: (v['startTime'] as num?)?.toInt(),
      status: '${v['status'] ?? 'WAITING'}',
      speakingQueue: _ids(v['speakingQueue']),
      hasSpoken: _ids(v['hasSpoken']),
      isFinished: v['isFinished'] == true,
    );
  }
}

/// اتفاقية ثنائية («ديل») — §4.2 في الملفّ ٢٥.
///
/// الشروط من `deal-engine.ts` حرفياً: من الجولة **الثانية** فصاعداً،
/// ثلاثٌ كحدٍّ أقصى للجولة، ولا يُستهدف لاعبٌ في اتفاقيتين، ومن سجّل في
/// جولةٍ لا يسجّل في التي تليها (`dealRegisteredRound`) — **حتى لو حذف**.
class Deal {
  const Deal({
    required this.id,
    required this.initiatorPhysicalId,
    required this.targetPhysicalId,
  });

  final String id;
  final int initiatorPhysicalId, targetPhysicalId;

  static Deal? fromJson(Object? v) {
    if (v is! Map) return null;
    final id = v['id'];
    if (id == null) return null;
    return Deal(
      id: '$id',
      initiatorPhysicalId: _i(v['initiatorPhysicalId']),
      targetPhysicalId: _i(v['targetPhysicalId']),
    );
  }

  static List<Deal> listOf(Object? v) => v is! List
      ? const []
      : v.map(Deal.fromJson).whereType<Deal>().toList(growable: false);
}

// ══════════════════════════════════════════════════════
// ⚖️ التبرير والانسحاب — §4.3 في الملفّ ٢٥
// ══════════════════════════════════════════════════════

class AccusedPlayer {
  const AccusedPlayer({
    required this.targetPhysicalId,
    this.name = '',
    this.avatarUrl,
    this.canJustify = false,
  });

  final int targetPhysicalId;
  final String name;
  final String? avatarUrl;
  final bool canJustify;

  static AccusedPlayer? fromJson(Object? v) {
    if (v is! Map) return null;
    final id = v['targetPhysicalId'];
    if (id is! num) return null;
    return AccusedPlayer(
      targetPhysicalId: id.toInt(),
      name: _s(v['name']),
      avatarUrl: (v['avatarUrl'] as String?)?.isEmpty ?? true
          ? null
          : v['avatarUrl'] as String,
      canJustify: v['canJustify'] == true,
    );
  }
}

class JustificationData {
  const JustificationData({
    this.accused = const [],
    this.topVotes = 0,
    this.votersForAccused = const [],
    this.timerFinished = false,
  });

  final List<AccusedPlayer> accused;
  final int topVotes;

  /// 🔴 من صوّت على المتهم — تُقارَن **نصّياً** في المصدر لتحمّل انزياح
  ///    الأنواع بين الخادم والعميل. نقرأها أرقاماً ونقارن أرقاماً.
  final List<int> votersForAccused;
  final bool timerFinished;

  bool didIVote(int myPhysicalId) => votersForAccused.contains(myPhysicalId);

  JustificationData copyWith({bool? timerFinished}) => JustificationData(
        accused: accused,
        topVotes: topVotes,
        votersForAccused: votersForAccused,
        timerFinished: timerFinished ?? this.timerFinished,
      );

  static JustificationData? fromJson(Object? v) {
    if (v is! Map) return null;
    return JustificationData(
      accused: (v['accused'] as List? ?? const [])
          .map(AccusedPlayer.fromJson)
          .whereType<AccusedPlayer>()
          .toList(growable: false),
      topVotes: _i(v['topVotes']),
      votersForAccused: (v['votersForAccused'] as List? ?? const [])
          .whereType<num>()
          .map((e) => e.toInt())
          .toList(growable: false),
    );
  }
}

class WithdrawalState {
  const WithdrawalState({
    this.active = false,
    this.count = 0,
    this.needed = 0,
    this.withdrawn = const [],
  });

  final bool active;
  final int count, needed;
  final List<int> withdrawn;

  bool didIWithdraw(int myPhysicalId) => withdrawn.contains(myPhysicalId);

  static WithdrawalState fromJson(Object? v, {bool active = true}) {
    if (v is! Map) return WithdrawalState(active: active);
    return WithdrawalState(
      active: active,
      count: _i(v['count']),
      needed: _i(v['needed']),
      withdrawn: (v['withdrawn'] as List? ?? const [])
          .whereType<num>()
          .map((e) => e.toInt())
          .toList(growable: false),
    );
  }
}

// ══════════════════════════════════════════════════════
// 🎩 العمدة — §4.7 في الملفّ ٢٥
// ══════════════════════════════════════════════════════

class MayorPrompt {
  const MayorPrompt({
    this.timeoutSeconds = 30,
    this.topVotes = 0,
    this.voteWeight = 2,
    this.winnerType,
    this.targetPhysicalId,
    this.targetName,
    this.initiatorPhysicalId,
  });

  final int timeoutSeconds, topVotes, voteWeight;
  final String? winnerType;
  final int? targetPhysicalId;
  final String? targetName;
  final int? initiatorPhysicalId;

  bool get isDeal => winnerType == 'DEAL';

  /// وصف من سيُعدَم — صفقةٌ أو لاعب.
  String get victimLine => isDeal
      ? 'صفقة #$initiatorPhysicalId ← #$targetPhysicalId'
      : '#$targetPhysicalId ${targetName ?? ''}'.trim();

  static MayorPrompt? fromJson(Object? v) {
    if (v is! Map) return null;
    final w = v['winner'];
    final win = w is Map ? w : const {};
    return MayorPrompt(
      timeoutSeconds: (v['timeoutSeconds'] as num?)?.toInt() ?? 30,
      topVotes: _i(v['topVotes']),
      voteWeight: (v['voteWeight'] as num?)?.toInt() ?? 2,
      winnerType: win['type'] as String?,
      targetPhysicalId: (win['targetPhysicalId'] as num?)?.toInt(),
      targetName: win['targetName'] as String?,
      initiatorPhysicalId: (win['initiatorPhysicalId'] as num?)?.toInt(),
    );
  }
}

class MayorReveal {
  const MayorReveal({
    required this.physicalId,
    this.name = '',
    this.decision = 'PASS',
    this.voteWeight = 2,
  });

  final int physicalId;
  final String name, decision;
  final int voteWeight;

  /// `PASS` لا يُنتج بانراً أصلاً (لم يكشف نفسه) — والنصّان للكشف وحده.
  String get decisionLine => decision == 'REVOTE'
      ? 'أُلغي الإعدام — تصويت جديد على الجميع'
      : 'أُلغي الإعدام — لا موت اليوم';

  static MayorReveal? fromJson(Object? v) {
    if (v is! Map) return null;
    final id = v['physicalId'];
    if (id is! num) return null;
    return MayorReveal(
      physicalId: id.toInt(),
      name: _s(v['name']),
      decision: '${v['decision'] ?? 'PASS'}',
      voteWeight: (v['voteWeight'] as num?)?.toInt() ?? 2,
    );
  }
}

// ══════════════════════════════════════════════════════
// ☀️ ملخّص الصباح الشخصيّ — §4.7 في الملفّ ٢٤
// ══════════════════════════════════════════════════════

class MorningEvent {
  const MorningEvent({
    required this.type,
    this.targetPhysicalId,
    this.targetName = '',
    this.extra = const {},
  });

  final String type;
  final int? targetPhysicalId;
  final String targetName;
  final Map<String, dynamic> extra;

  /// 🔴 أنواع الموت **الحقيقية** من `night-resolver.ts` نفسه.
  ///
  /// الويب يفحص `KILL`/`SNIPE` وهما لا يصلان أبداً — فبطاقة «لقد اُغتلت!»
  /// مسارٌ ميّت هناك. الخطة نبّهت على التعارض وأمرت بمطابقة الخادم.
  static const killTypes = {
    'ASSASSINATION', 'SNIPE_MAFIA', 'SNIPE_CITIZEN', 'ASSASSIN_KILL', 'SHERIFF_REVENGE',
    // 🔥 نارُ العنقاء ولعنةُ رمادِه — خروجٌ حقيقيّ كأيّ إقصاء
    'PHOENIX_BURN', 'PHOENIX_ASH',
  };

  bool get isKill => killTypes.contains(type);

  /// أيقونة الحدث ونصّه — الخريطة الحرفية.
  (String, String) get display => switch (type) {
        'ASSASSINATION' => ('💀', 'تم اغتيالك!'),
        'ASSASSINATION_BLOCKED' => ('🛡️', 'تم حمايتك من الاغتيال!'),
        'SNIPE_MAFIA' || 'SNIPE_CITIZEN' => ('🎯', 'تم قنصك!'),
        'SHERIFF_REVENGE' => ('🕵️', 'الشريف سأل عنك وقُتل في الليلة نفسها — خرجتَ معه.'),
        'PHOENIX_BURN' => ('🔥', 'مددتَ يدَك إلى العنقاء فاحترقتَ بناره.'),
        'PHOENIX_ASH' => ('🜂', 'لعنةُ الرماد: صوّتَّ على العنقاء فأخذك معه.'),
        'SILENCED' => ('🤫', 'تم إسكاتك! لا يمكنك التحدث هذه الجولة.'),
        'SHERIFF_RESULT' => (
            '🔍',
            'نتيجة التحقيق: ${extra['result'] == 'MAFIA' ? '🔴 مافيا' : '🟢 مواطن'}'
          ),
        'PROTECTION_FAILED' => ('❌', 'فشلت الحماية! الهدف اُغتيل.'),
        'POLICEWOMAN_REVEAL' => ('👮', 'الشرطية كشفت هويتك!'),
        _ => ('📋', type),
      };

  /// مفتاح منع التكرار — الليدر قد يعيد البثّ.
  String get key => '$targetPhysicalId|$type';

  static MorningEvent? fromJson(Object? v) {
    if (v is! Map) return null;
    final t = v['type'];
    if (t is! String || t.isEmpty) return null;
    return MorningEvent(
      type: t,
      targetPhysicalId: (v['targetPhysicalId'] as num?)?.toInt(),
      targetName: _s(v['targetName']),
      extra: v['extra'] is Map
          ? Map<String, dynamic>.from(v['extra'] as Map)
          : const {},
    );
  }
}

// ══════════════════════════════════════════════════════
// 🔢 صيغة العدد العربيّة
// ══════════════════════════════════════════════════════
// «(1 أصوات)» في نافذة العمدة كانت تُقرأ ركيكةً على الجهاز. العربية
// تميّز المفرد والمثنّى والجمع، والجمع نفسه ينقلب بعد العشرة إلى تمييزٍ
// مفرد منصوب («11 صوتاً»). هذه الدالّة تلزم القاعدة بلا حزمة تدويل.
String votesAr(int n) {
  if (n == 0) return 'بلا أصوات';
  if (n == 1) return 'صوت واحد';
  if (n == 2) return 'صوتان';
  if (n <= 10) return '$n أصوات';
  return '$n صوتاً';
}

// ══════════════════════════════════════════════════════
// 🏁 نهاية الجيم — §8 في الملفّ ٢٧
// ══════════════════════════════════════════════════════

enum WinnerType { mafia, citizen, assassin, jester }

WinnerType? winnerTypeOf(String? raw) => switch (raw) {
      'MAFIA' => WinnerType.mafia,
      'CITIZEN' => WinnerType.citizen,
      'ASSASSIN' => WinnerType.assassin,
      'JESTER' => WinnerType.jester,
      _ => null,
    };

class GameOverPlayer {
  const GameOverPlayer({
    required this.physicalId,
    this.name,
    this.role,
    this.isAlive = true,
  });

  final int physicalId;
  final String? name;

  /// مصدر شبكة الكشف وألوانها. الكشف هنا مسموحٌ لأنّ الجيم انتهى.
  final String? role;
  final bool isAlive;

  static GameOverPlayer fromJson(Map j) => GameOverPlayer(
        physicalId: _i(j['physicalId']),
        name: j['name'] == null ? null : _s(j['name']),
        role: j['role'] == null ? null : _s(j['role']),
        isAlive: j['isAlive'] != false,
      );
}

/// نتيجة دورٍ محايد — **شاشة العرض الكبيرة وحدها ترسمها**.
///
/// 🔴 تُنمذَج ولا تُرسَم (§12 في الملفّ ٢٧). حملُها في النموذج تكافؤٌ مع
///    الويب الذي يستقبلها ويهملها؛ ورسمُها في التطبيق تسريبٌ لشرط فوزٍ
///    لم يكن اللاعب ليعرفه.
class NeutralResult {
  const NeutralResult({
    required this.physicalId,
    required this.playerName,
    required this.roleId,
    required this.roleNameAr,
    required this.won,
    required this.conditionType,
    required this.conditionDescription,
  });

  final int physicalId;
  final String playerName;
  final String roleId;
  final String roleNameAr;
  final bool won;
  final String conditionType;
  final String conditionDescription;

  static NeutralResult fromJson(Map j) => NeutralResult(
        physicalId: _i(j['physicalId']),
        playerName: _s(j['playerName']),
        roleId: _s(j['roleId']),
        roleNameAr: _s(j['roleNameAr']),
        won: j['won'] == true,
        conditionType: _s(j['conditionType']),
        conditionDescription: _s(j['conditionDescription']),
      );
}

class GameOverReveal {
  const GameOverReveal({
    this.winner,
    this.matchId,
    this.players = const [],
    this.neutralResults = const [],
    this.reason,
  });

  final WinnerType? winner;

  /// الخادم يبعثه عدداً؛ نحفظه نصّاً لأنّه معرّفٌ لا كمّية.
  final String? matchId;
  final List<GameOverPlayer> players;
  final List<NeutralResult> neutralResults;

  /// `TIMEOUT` أو `AUTO_REVEAL_TIMEOUT` أو غياب.
  final String? reason;

  static GameOverReveal fromJson(Map j) => GameOverReveal(
        winner: winnerTypeOf(j['winner'] as String?),
        matchId: j['matchId'] == null ? null : _s(j['matchId']),
        players: (j['players'] as List? ?? j['allPlayers'] as List? ?? const [])
            .whereType<Map>()
            .map(GameOverPlayer.fromJson)
            .toList(growable: false),
        neutralResults: (j['neutralResults'] as List? ?? const [])
            .whereType<Map>()
            .map(NeutralResult.fromJson)
            .toList(growable: false),
        reason: j['reason'] == null ? null : _s(j['reason']),
      );
}

// ══════════════════════════════════════════════════════
// 🎁 سحب الهدايا — عقدٌ فقط، لا رسم
// ══════════════════════════════════════════════════════
// `luckyDraw` حدثُ لوبي لا حدثُ نهاية جيم (الخادم يقبله في LOBBY وحدها).
// الويب يستقبله ولا يرسمه، والتطبيق يطابقه: نُنمذجه كي لا تُخترع له واجهة.

class LuckyDrawEvent {
  const LuckyDrawEvent({
    this.winners = const [],
    this.pool = const [],
    this.spinMs = 4500,
  });

  final List<int> winners;
  final List<int> pool;
  final int spinMs;

  static LuckyDrawEvent fromJson(Map j) => LuckyDrawEvent(
        winners: (j['winners'] as List? ?? const []).map(_i).toList(),
        pool: (j['pool'] as List? ?? const []).map(_i).toList(),
        spinMs: _i(j['spinMs'], 4500),
      );
}

class LuckyDrawState {
  const LuckyDrawState({
    this.status = '',
    this.count = 0,
    this.winners = const [],
    this.pool = const [],
    this.revealedAt,
  });

  /// `drawn` لا يصل اللاعب أصلاً؛ `revealed` يصل ويُهمَل.
  final String status;
  final int count;
  final List<int> winners;
  final List<int> pool;
  final int? revealedAt;

  static LuckyDrawState fromJson(Map j) => LuckyDrawState(
        status: _s(j['status']),
        count: _i(j['count']),
        winners: (j['winners'] as List? ?? const []).map(_i).toList(),
        pool: (j['pool'] as List? ?? const []).map(_i).toList(),
        revealedAt:
            j['revealedAt'] == null ? null : _i(j['revealedAt']),
      );
}

// ══════════════════════════════════════════════════════
// 🎬 طاولة الحلقة — §8 في الملفّ ٢٧
// ══════════════════════════════════════════════════════

enum SpectatorMode { focus, overview }

/// مقعدٌ على الحلقة. الدور `null` لكلّ حيّ — الروستر يصل منقّى، والحقل
/// لا يُملأ إلا من مصادر الكشف الخمسة (§4.7).
class SpectatorSeat {
  const SpectatorSeat({
    required this.physicalId,
    this.name,
    this.avatarUrl,
    this.isFemale = false,
    this.role,
    this.isAlive = true,
  });

  final int physicalId;
  final String? name;
  final String? avatarUrl;
  final bool isFemale;
  final String? role;
  final bool isAlive;

  SpectatorSeat copyWith({String? role, bool? isAlive}) => SpectatorSeat(
        physicalId: physicalId,
        name: name,
        avatarUrl: avatarUrl,
        isFemale: isFemale,
        role: role ?? this.role,
        isAlive: isAlive ?? this.isAlive,
      );

  static SpectatorSeat fromRoster(RosterPlayer p) => SpectatorSeat(
        physicalId: p.physicalId,
        name: p.name.isEmpty ? null : p.name,
        avatarUrl: p.avatarUrl,
        isFemale: p.isFemale,
        // 🔒 لا `role` هنا عمداً — `RosterPlayer` لا يحمله أصلاً
        isAlive: p.isAlive,
      );
}

/// ساعة الجيم في شريط الرأس.
class GameTimerSnapshot {
  const GameTimerSnapshot({
    required this.totalSeconds,
    required this.startedAtMs,
    this.expired = false,
  });

  final int totalSeconds;
  final int startedAtMs;
  final bool expired;

  int remaining({DateTime? now}) {
    if (expired) return 0;
    final elapsed =
        ((now ?? DateTime.now()).millisecondsSinceEpoch - startedAtMs) ~/ 1000;
    final left = totalSeconds - elapsed;
    return left < 0 ? 0 : left;
  }

  static GameTimerSnapshot? fromJson(dynamic v) {
    if (v is! Map) return null;
    final total = _i(v['totalSeconds']);
    if (total <= 0) return null;
    return GameTimerSnapshot(
      totalSeconds: total,
      startedAtMs: _i(v['startedAt']),
      expired: v['expired'] == true,
    );
  }
}

/// بانر الصباح على الطاولة — الحماية وحدها، لا كشف أدوار.
class MorningBanner {
  const MorningBanner({required this.saved, this.name});

  /// `true` ⇒ 🛡️ «فشل الاغتيال»؛ `false` ⇒ ⚠️ «لم تنفع الحماية».
  final bool saved;
  final String? name;
}

/// تسميات الأطوار على شريط رأس الطاولة (§4.1).
const kTablePhaseLabels = <String, String>{
  'DAY_DISCUSSION': 'نقاش النهار',
  'DAY_JUSTIFICATION': 'مرحلة الدفاع',
  'DAY_ELIMINATION': 'كشف الإقصاء',
  'ELIMINATION_PENDING': 'كشف الإقصاء',
  'DAY_TIEBREAKER': 'كسر التعادل',
  'NIGHT': 'الليل',
  'MORNING_RECAP': 'أحداث الصباح',
  'LOBBY': 'غرفة الانتظار',
  'ROLE_GENERATION': 'تجهيز الأدوار',
  'ROLE_BINDING': 'توزيع الأدوار',
  'DAY_VOTING': 'التصويت',
};

/// أحداث صباحٍ **لا تُعرَض على الحلقة إطلاقاً** (§4.7 بند ٣).
///
/// 🔒 عرضُ أيّها يكشف دور من نجا أو تأثّر: «أُسكِت #4» تقول إنّ في اللعبة
///    قصّ مافيا وإنّه استهدف #4، و«نتيجة الشريف» تكشف الشريف نفسه.
const kNonDeathMorningTypes = <String>{
  'SILENCED', 'SILENCE', 'SHERIFF_RESULT', 'INVESTIGATION',
  'ABILITY_DISABLED', 'DISABLE_ABILITY', 'TRANSFORM', 'TWIN_TRANSFORM',
  'ASSASSINATION_ATTEMPT', 'ELIMINATE_ALL', 'SINGLE_WINNER', 'TIE',
  'ELIMINATION',
};

/// أنواع الحماية التي تُنتج بانر الصباح.
const kProtectionBlockedTypes = <String>{
  'ASSASSINATION_BLOCKED', 'PROTECTED', 'SAVED',
};
const kProtectionFailedTypes = <String>{
  'PROTECTION_FAILED', 'HEAL_FAILED',
};

/// عدّاد الفريقين يصل بأسماء مفاتيح متعدّدة (§6.4) — تحليلٌ متسامح.
({int? citizens, int? mafia, int? neutrals}) parseTeamCounts(dynamic v) {
  if (v is! Map) return (citizens: null, mafia: null, neutrals: null);
  int? pick(List<String> keys) {
    for (final k in keys) {
      final x = v[k];
      if (x is num) return x.toInt();
    }
    return null;
  }

  return (
    citizens: pick(const ['citizenAlive', 'citizens', 'citizen', 'town']),
    mafia: pick(const ['mafiaAlive', 'mafia', 'mafiaCount']),
    // 🎭 المستقلّون — كانوا مخبّأين داخل عدّاد المواطنين قبل أن يُفصَلوا
    neutrals: pick(const ['neutralAlive', 'neutrals', 'neutral']),
  );
}

// ══════════════════════════════════════════════════════
// ⚖️ تنبيه عقوبة — PEN-1 في الملفّ 99
// ══════════════════════════════════════════════════════
/// مخالفةٌ سُجّلت على اللاعب نفسه. `ejected` تعني أن العقوبة أقصته.
class PenaltyAlert {
  const PenaltyAlert({
    required this.penalties,
    required this.max,
    required this.message,
    required this.ejected,
  });

  final int penalties, max;
  final String message;
  final bool ejected;

  /// المتبقّي قبل الإقصاء — صفرٌ يعني أن هذه هي الأخيرة.
  int get remaining => (max - penalties).clamp(0, max);
}
