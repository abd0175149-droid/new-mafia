import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';

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
  });

  final int physicalId;
  final String name;
  final String? avatarUrl;
  final String? gender;
  final bool isConnected;
  final int penalties;
  final bool seatHeld;

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
      );
}

/// أطوار الشريحة الأولى. ما بعد اللوبي يُسلَّم للشريحة الثانية.
enum HostStep { create, lobby }

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
      if (_step == HostStep.lobby) refreshState();
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
    _phase = (s['phase'] ?? 'LOBBY').toString();
    _roomCode = (s['roomCode'] ?? s['code'] ?? _roomCode).toString();

    final cfg = s['config'];
    if (cfg is Map && cfg['maxPlayers'] is num) {
      _maxPlayers = (cfg['maxPlayers'] as num).toInt();
    }

    final list = s['players'];
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
    final res = await SocketService.instance
        .ask('room:start-generation', {'roomId': id});
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

  void reset() {
    _poll?.cancel();
    _poll = null;
    _roomId = null;
    _roomCode = '';
    _players = const [];
    _phase = 'LOBBY';
    _error = null;
    _busy = false;
    _step = HostStep.create;
    notifyListeners();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }
}
