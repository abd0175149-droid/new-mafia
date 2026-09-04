import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import 'role_generation.dart';

// ══════════════════════════════════════════════════════
// 🌐 كونسول المضيف عن بُعد — الشريحة الأولى (الملفّ 30)
// ══════════════════════════════════════════════════════
// المضيف **مُوجِّهٌ لا لاعب**: لا يأخذ دوراً ولا مقعداً، ويُدير الغرفة من
// جهازه بينما يشترك اللاعبون من أجهزتهم.
//
// 🔴 قاعدة صلبة من §1: هذه الشريحة **لا تُجري أيّ طلب HTTP إطلاقاً** —
//    كلّ التواصل Socket.IO بإشعارٍ راجع (ack-RPC). الصور وحدها GET.
//
// المنفَّذ هنا: الإنشاء واللوبي (§4.1 و§4.4). أطوار اللعب (§4.7–4.15)
// والصوت المباشر (الملفّ 31) شريحتان لاحقتان.

/// إعدادات الغرفة عند الإنشاء — الحدود من §4.1 حرفياً.
class HostRoomConfig {
  const HostRoomConfig({
    this.gameName = 'غرفة عن بُعد',
    this.maxPlayers = 12,
    this.autoNightTime = 15,
    this.gameTimerMinutes = 0,
    this.maxPenalties = 3,
    this.penaltyScope = 'room',
    this.bombEnabled = true,
    this.mafiaChatEnabled = false,
    this.allowPlayerInvites = false,
    this.maxJustifications = 2,
  });

  final String gameName;
  final int maxPlayers;        // 6–50
  final int autoNightTime;     // 5–60، خطوة 5
  final int gameTimerMinutes;  // 0 | 30 | 60 | 90
  final int maxPenalties;      // 1–10
  final String penaltyScope;   // 'room' | 'game'
  final bool bombEnabled;
  final bool mafiaChatEnabled;
  final bool allowPlayerInvites;
  final int maxJustifications; // 1–5

  HostRoomConfig copyWith({
    String? gameName,
    int? maxPlayers,
    int? autoNightTime,
    int? gameTimerMinutes,
    int? maxPenalties,
    String? penaltyScope,
    bool? bombEnabled,
    bool? mafiaChatEnabled,
    bool? allowPlayerInvites,
    int? maxJustifications,
  }) =>
      HostRoomConfig(
        gameName: gameName ?? this.gameName,
        maxPlayers: maxPlayers ?? this.maxPlayers,
        autoNightTime: autoNightTime ?? this.autoNightTime,
        gameTimerMinutes: gameTimerMinutes ?? this.gameTimerMinutes,
        maxPenalties: maxPenalties ?? this.maxPenalties,
        penaltyScope: penaltyScope ?? this.penaltyScope,
        bombEnabled: bombEnabled ?? this.bombEnabled,
        mafiaChatEnabled: mafiaChatEnabled ?? this.mafiaChatEnabled,
        allowPlayerInvites: allowPlayerInvites ?? this.allowPlayerInvites,
        maxJustifications: maxJustifications ?? this.maxJustifications,
      );

  Map<String, dynamic> toCreatePayload() => {
        'gameName': gameName.trim().isEmpty ? 'غرفة عن بُعد' : gameName.trim(),
        'maxPlayers': maxPlayers,
        'maxJustifications': maxJustifications,
        'maxPenalties': maxPenalties,
        'penaltyScope': penaltyScope,
        'autoNightTime': autoNightTime,
        'gameTimerMinutes': gameTimerMinutes,
        'bombEnabled': bombEnabled,
        'mafiaChatEnabled': mafiaChatEnabled,
        'allowPlayerInvites': allowPlayerInvites,
      };
}

/// لاعبٌ في roster اللوبي.
class HostRosterPlayer {
  const HostRosterPlayer({
    required this.physicalId,
    required this.name,
    this.avatarUrl,
    this.gender,
    this.isConnected = true,
    this.penalties = 0,
    this.seatHeld = false,
    this.role,
  });

  final int physicalId;
  final String name;
  final String? avatarUrl;
  final String? gender;
  final bool isConnected;
  final int penalties;
  final bool seatHeld;

  /// الدور المسنَد في طور الإسناد — `player.role` على الخادم.
  final String? role;

  factory HostRosterPlayer.fromJson(Map<String, dynamic> j) => HostRosterPlayer(
        physicalId: (j['physicalId'] as num?)?.toInt() ?? 0,
        name: (j['name'] ?? '').toString(),
        avatarUrl: j['avatarUrl'] as String?,
        gender: j['gender'] as String?,
        // 🔴 `!= false` لا `== true`: الخادم قد يُغفل الحقل للاعبٍ متّصل،
        //    و`== true` كانت ستُظهر الجميع منقطعين. §4.4 ينصّ عليها.
        isConnected: j['isConnected'] != false,
        penalties: (j['penalties'] as num?)?.toInt() ?? 0,
        seatHeld: j['seatHeld'] == true,
        role: j['role'] as String?,
      );
}


/// حالة جولة النقاش — `DiscussionState` على الخادم (state.ts §86).
class DiscussionState {
  const DiscussionState({
    this.currentSpeakerId,
    this.timeLimitSeconds = 30,
    this.timeRemaining = 0,
    this.startTime,
    this.status = 'WAITING',
    this.speakingQueue = const [],
    this.hasSpoken = const [],
    this.isFinished = false,
  });

  final int? currentSpeakerId;
  final int timeLimitSeconds;
  final int timeRemaining;
  final int? startTime;
  final String status; // WAITING | SPEAKING | PAUSED | …
  final List<int> speakingQueue;
  final List<int> hasSpoken;
  final bool isFinished;

  bool get isSpeaking => status == 'SPEAKING';

  static List<int> _ints(dynamic v) =>
      v is List ? v.map((e) => (e as num).toInt()).toList() : const [];

  factory DiscussionState.fromJson(Map<String, dynamic> j) => DiscussionState(
        currentSpeakerId: (j['currentSpeakerId'] as num?)?.toInt(),
        timeLimitSeconds: (j['timeLimitSeconds'] as num?)?.toInt() ?? 30,
        timeRemaining: (j['timeRemaining'] as num?)?.toInt() ?? 0,
        startTime: (j['startTime'] as num?)?.toInt(),
        status: (j['status'] ?? 'WAITING').toString(),
        speakingQueue: _ints(j['speakingQueue']),
        hasSpoken: _ints(j['hasSpoken']),
        isFinished: j['isFinished'] == true,
      );
}

/// أطوار الكونسول. ما بعد الإسناد يُسلَّم لشريحة أطوار اللعب.
enum HostStep { create, lobby, roleGeneration, roleBinding, inGame }

class HostController extends ChangeNotifier {
  HostController._();
  static final HostController instance = HostController._();

  HostStep _step = HostStep.create;
  HostStep get step => _step;

  HostRoomConfig config = const HostRoomConfig();

  String? _roomId;
  String? get roomId => _roomId;

  String _roomCode = '';
  String get roomCode => _roomCode;

  int _maxPlayers = 12;
  int get maxPlayers => _maxPlayers;

  List<HostRosterPlayer> _players = const [];
  /// المقاعد الفعلية (بلا المحجوزة) مرتّبةً بـphysicalId — §4.4.
  List<HostRosterPlayer> get players =>
      _players.where((p) => !p.seatHeld).toList()
        ..sort((a, b) => a.physicalId.compareTo(b.physicalId));

  /// المقاعد المحجوزة — تُعرض chips منفصلة.
  List<HostRosterPlayer> get heldSeats =>
      _players.where((p) => p.seatHeld).toList();

  bool _busy = false;
  bool get busy => _busy;

  String? _error;
  String? get error => _error;

  /// طور اللعبة كما يراه الخادم — يقرّر متى تنتهي الشريحة الأولى.
  String _phase = 'LOBBY';
  String get phase => _phase;

  Timer? _poll;

  /// تركيبة الأدوار المحلّية (§4.7).
  List<String> roles = const [];

  /// 🔴 توقيع آخر حزمةٍ وردت من الخادم. بدونه يعيد استطلاعُ الـ٢٫٥ ثانية
  ///    بناءَ التركيبة كلّ مرّة فيمحو تعديلات المضيف الجارية — العطل
  ///    الموصوف حرفياً في §4.8 («poolInitRef»).
  String? _poolSignature;

RoleTuning tuning = const RoleTuning();

  /// حالة النقاش الجارية — `null` قبل بدء الجولة.
  DiscussionState? discussion;

/// أقفال الإسناد — تُحترم عند التوزيع العشوائيّ (§4.8).
final Set<int> lockedPhysicalIds = <int>{};

/// هل أُرسلت الأدوار للاعبين؟ أيّ إسنادٍ يدويّ يصفّرها.
bool rolesConfirmed = false;

/// «المافيا تعرف بعضها» — الأوّليّة `!= false` كما ينصّ §4.8.
bool allowMafiaReveal = true;

/// الأدوار الخاصّة في التركيبة (كلّ ما ليس مواطناً عاديّاً).
List<String> get specialRoles =>
    roles.where((r) => r != 'CITIZEN').toList();

/// خريطة الدور ← اللاعب المسنَد إليه، من حالة الخادم.
Map<String, int> get assignments {
  final out = <String, int>{};
  for (final p in players) {
    final r = p.role;
    if (r != null && r.isNotEmpty) out[r] = p.physicalId;
  }
  return out;
}

int get assignedSpecialCount =>
    specialRoles.where((r) => assignments.containsKey(r)).length;

bool get allSpecialsAssigned =>
    specialRoles.isNotEmpty && assignedSpecialCount == specialRoles.length;

void toggleLock(int physicalId) {
  if (!lockedPhysicalIds.remove(physicalId)) lockedPhysicalIds.add(physicalId);
  notifyListeners();
}

/// تفاؤليّ + fire-and-forget كما ينصّ §4.8 (الأخطاء مبتلعة).
void setMafiaReveal(bool value) {
  allowMafiaReveal = value;
  notifyListeners();
  final id = _roomId;
  if (id == null) return;
  SocketService.instance
      .ask('room:update-mafia-reveal', {'roomId': id, 'allowMafiaReveal': value});
}

  bool get canStart => players.length >= 6;

  void clearError() {
    if (_error == null) return;
    _error = null;
    notifyListeners();
  }

  void _fail(String msg) {
    _error = msg;
    _busy = false;
    notifyListeners();
  }

  // ── الإنشاء (§4.1) ──

  Future<bool> createRoom() async {
    if (_busy) return false;
    if (SessionStore.instance.player == null) {
      _fail('يجب تسجيل الدخول كلاعب أولاً.');
      return false;
    }
    if (!SocketService.instance.connected.value) {
      _fail('جارٍ الاتصال…');
      return false;
    }
    _busy = true;
    _error = null;
    notifyListeners();

    final res = await SocketService.instance
        .ask('room:create-remote', config.toCreatePayload());

    // 🔴 `null` تعني مهلةً أو انقطاعاً لا رفضاً — ونصّها يختلف عن نصّ
    //    الخادم («غير مصرّح لك»)، فلا يُخلَط بينهما (عقد ask في 03).
    if (res == null) {
      _fail('تعذّر إنشاء الغرفة — تحقّق من اتصالك');
      return false;
    }
    if (res['success'] != true) {
      _fail((res['error'] ?? 'تعذّر إنشاء الغرفة').toString());
      return false;
    }

    _roomId = (res['roomId'] ?? '').toString();
    if (_roomId!.isEmpty) {
      _fail('تعذّر إنشاء الغرفة');
      return false;
    }
    _maxPlayers = config.maxPlayers;
    _step = HostStep.lobby;
    _busy = false;
    notifyListeners();

    await refreshState();
    _startPolling();
    return true;
  }

  // ── اللوبي (§4.4) ──

  /// استطلاعٌ كل ٢٫٥ ثانية — §7.2 (`game:get-state`).
  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(milliseconds: 2500), (_) {
      // يستمرّ عبر اللوبي والتوليد والإسناد — لا في اللوبي وحده:
      // انتقالُ الطور نفسه يصل عبر هذا الاستطلاع.
      if (_step != HostStep.create) refreshState();
    });
  }

  Future<void> refreshState() async {
    final id = _roomId;
    if (id == null) return;
    final res = await SocketService.instance.ask('game:get-state', {'roomId': id});
    if (res == null || res['success'] != true) return;
    final state = res['state'];
    if (state is! Map) return;
    _applyState(Map<String, dynamic>.from(state));
  }

void _applyState(Map<String, dynamic> s) {
  _phase = (s["phase"] ?? "LOBBY").toString();

  // 🔴 الطور يُشتقّ من الخادم لا من نقرة المضيف: الاستطلاع قد يكشف
  //    انتقالاً بدأه ليدرٌ آخر أو استعادةَ جلسةٍ بعد إعادة اتصال،
  //    والاعتماد على النقر وحده يترك الشاشة متأخّرةً عن الحقيقة.
  _step = switch (_phase) {
    "LOBBY" => HostStep.lobby,
    "ROLE_GENERATION" => HostStep.roleGeneration,
    "ROLE_BINDING" => HostStep.roleBinding,
    _ => HostStep.inGame,
  };

  final pool = s["rolesPool"];
  if (pool is List) {
    final next = pool.map((e) => e.toString()).toList();
    // التوقيع يمنع الاستطلاع من محو تعديلات المضيف الجارية (§4.8).
    final sig = next.join(",");
    if (sig != _poolSignature) {
      _poolSignature = sig;
      roles = next;
    }
  }

  _roomCode = (s["roomCode"] ?? s["code"] ?? _roomCode).toString();

  final cfg = s["config"];
  if (cfg is Map && cfg["maxPlayers"] is num) {
    _maxPlayers = (cfg["maxPlayers"] as num).toInt();
  }

  final list = s["players"];
  if (list is List) {
    _players = list
        .whereType<Map>()
        .map((e) => HostRosterPlayer.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  notifyListeners();
}

  Future<void> setMaxPlayers(int value) async {
    final id = _roomId;
    if (id == null || _busy) return;
    final v = value.clamp(6, 50);
    if (v == _maxPlayers) return;
    _busy = true;
    notifyListeners();
    await SocketService.instance
        .ask('room:update-max-players', {'roomId': id, 'maxPlayers': v});
    _maxPlayers = v;
    _busy = false;
    notifyListeners();
    await refreshState();
  }

  Future<void> kickPlayer(int physicalId) async {
    final id = _roomId;
    if (id == null || _busy) return;
    _busy = true;
    notifyListeners();
    await SocketService.instance
        .ask('room:kick-player', {'roomId': id, 'physicalId': physicalId});
    _busy = false;
    await refreshState();
  }

  Future<void> recordPenalty(int physicalId) async {
    final id = _roomId;
    if (id == null || _busy) return;
    _busy = true;
    notifyListeners();
    await SocketService.instance
        .ask('leader:record-penalty', {'roomId': id, 'targetPhysicalId': physicalId});
    _busy = false;
    await refreshState();
  }

  Future<void> releaseHeldSeat(int physicalId) async {
    final id = _roomId;
    if (id == null || _busy) return;
    _busy = true;
    notifyListeners();
    await SocketService.instance
        .ask('room:release-held-seat', {'roomId': id, 'physicalId': physicalId});
    _busy = false;
    await refreshState();
  }

  Future<bool> startGeneration() async {
    final id = _roomId;
    if (id == null || _busy || !canStart) return false;
    _busy = true;
    notifyListeners();
    var res = await SocketService.instance
        .ask('room:start-generation', {'roomId': id, 'supportsAbsentPrompt': true});
    // 🧹 مقاعدُ مغادرين: قياسُ الأدوار يعدّهم فيأخذ الغائب دوراً ويدخل معادلة
    //    الفوز. نُعيد الطلب بتحريرها — المضيفُ البعيد بلا حوارٍ منفصل هنا.
    if (res != null && res['code'] == 'ABSENT_PLAYERS') {
      res = await SocketService.instance
          .ask('room:start-generation', {'roomId': id, 'releaseAbsent': true});
    }
    _busy = false;
    notifyListeners();
    if (res == null || res['success'] != true) {
      _fail((res?['error'] ?? 'تعذّر بدء التوزيع').toString());
      return false;
    }
    await refreshState();
    return true;
  }

  /// إلغاء الغرفة وإخراج كلّ من انضمّ — يعود بالمضيف إلى شاشة الإنشاء.
  Future<void> closeRoom() async {
    final id = _roomId;
    if (id != null) {
      await SocketService.instance.ask('room:close-event', {'roomId': id});
    }
    reset();
  }


// ── التوليد والإسناد (§4.7 و§4.8) ──

/// يبني التركيبة الأولية من عدد الأحياء إن لم تصل من الخادم بعد.
void seedRoles() {
  if (roles.isNotEmpty) return;
  roles = generateRoles(players.length);
  notifyListeners();
}

void setRoleAt(int index, String role) {
  if (index < 0 || index >= roles.length) return;
  final next = [...roles];
  next[index] = role;
  roles = next;
  notifyListeners();
}

void applyRoles(List<String> next) {
  roles = next;
  notifyListeners();
}

void setTuning(RoleTuning t) {
  tuning = t;
  notifyListeners();
}

/// يؤكّد التركيبة ويرسلها — §4.7 CONFIRM.
Future<bool> confirmRoles() async {
  final id = _roomId;
  if (id == null || _busy) return false;
  _busy = true;
  _error = null;
  notifyListeners();
  final res = await SocketService.instance.ask('setup:roles-confirmed', {
    'roomId': id,
    'roles': roles,
    ...tuning.payloadFor(roles),
  });
  _busy = false;
  notifyListeners();
  if (res == null || res['success'] != true) {
    _fail((res?['error'] ?? 'تعذّر تأكيد التركيبة').toString());
    return false;
  }
  await refreshState();
  return true;
}

Future<void> bindRole(int physicalId, String role) async {
  final id = _roomId;
  if (id == null) return;
  await SocketService.instance.ask(
      'setup:bind-role', {'roomId': id, 'physicalId': physicalId, 'role': role});
  await refreshState();
}

Future<void> unbindRole(int physicalId) async {
  final id = _roomId;
  if (id == null) return;
  await SocketService.instance
      .ask('setup:unbind-role', {'roomId': id, 'physicalId': physicalId});
  await refreshState();
}

Future<void> randomAssign(List<int> lockedPhysicalIds) async {
  final id = _roomId;
  if (id == null || _busy) return;
  _busy = true;
  notifyListeners();
  await SocketService.instance.ask('setup:random-assign',
      {'roomId': id, 'lockedPhysicalIds': lockedPhysicalIds});
  _busy = false;
  await refreshState();
}

Future<bool> confirmBinding() async {
  final id = _roomId;
  if (id == null || _busy) return false;
  _busy = true;
  notifyListeners();
  final res =
      await SocketService.instance.ask('setup:confirm-roles', {'roomId': id});
  _busy = false;
  notifyListeners();
  if (res == null || res['success'] != true) {
    _fail((res?['error'] ?? 'تعذّر تأكيد الأدوار').toString());
    return false;
  }
  await refreshState();
  return true;
}

/// 🔒 قفل الهويّات وبدء اللعبة.
Future<bool> lockAndStart() async {
  final id = _roomId;
  if (id == null || _busy) return false;
  _busy = true;
  notifyListeners();
  final res =
      await SocketService.instance.ask('setup:binding-complete', {'roomId': id});
  _busy = false;
  notifyListeners();
  if (res == null || res['success'] != true) {
    _fail((res?['error'] ?? 'أكّد الأدوار أولاً').toString());
    return false;
  }
  await refreshState();
  return true;
}


// ── النقاش (§4.9) ──

Future<void> startDiscussion(int startPhysicalId, int seconds) async {
  final id = _roomId;
  if (id == null || _busy) return;
  _busy = true;
  notifyListeners();
  await SocketService.instance.ask('day:start-discussion', {
    'roomId': id,
    'startPhysicalId': startPhysicalId,
    'timeLimitSeconds': seconds,
  });
  _busy = false;
  await refreshState();
}

/// START | PAUSE | RESUME | RESET
Future<void> timerAction(String action) async {
  final id = _roomId;
  if (id == null) return;
  await SocketService.instance
      .ask('day:timer-action', {'roomId': id, 'action': action});
  await refreshState();
}

/// ±10 و±30 — §7.2.
Future<void> adjustTimer(int delta, {String phase = 'DISCUSSION'}) async {
  final id = _roomId;
  if (id == null) return;
  await SocketService.instance
      .ask('day:adjust-timer', {'roomId': id, 'phase': phase, 'delta': delta});
  await refreshState();
}

Future<void> prevSpeaker() async {
  final id = _roomId;
  if (id == null) return;
  await SocketService.instance.ask('day:prev-speaker', {'roomId': id});
  await refreshState();
}

Future<void> nextSpeaker() async {
  final id = _roomId;
  if (id == null) return;
  await SocketService.instance.ask('day:next-speaker', {'roomId': id});
  await refreshState();
}

/// `durationSeconds` غائبةً تعني تصويتاً بلا حدّ زمنيّ (§4.9).
Future<void> startVoting(int? durationSeconds) async {
  final id = _roomId;
  if (id == null || _busy) return;
  _busy = true;
  notifyListeners();
  await SocketService.instance.ask('day:start-voting', {
    'roomId': id,
    if (durationSeconds != null) 'durationSeconds': durationSeconds,
  });
  _busy = false;
  await refreshState();
}

  void reset() {
    _poll?.cancel();
    _poll = null;
    _roomId = null;
    _roomCode = '';
    _players = const [];
    _phase = 'LOBBY';
    _error = null;
    _busy = false;
    roles = const [];
    _poolSignature = null;
    lockedPhysicalIds.clear();
    rolesConfirmed = false;
    _step = HostStep.create;
    notifyListeners();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }
}
