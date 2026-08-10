import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:realtimekit_core/realtimekit_core.dart';
import 'package:realtimekit_core_platform_interface/realtimekit_core_platform_interface.dart'
    show RtkError;

import '../../core/socket/socket_service.dart';
import '../../models/voice.dart';

// ══════════════════════════════════════════════════════
// 🎙️ VoiceService — §6.أ في الملفّ ٣١
// ══════════════════════════════════════════════════════
// 🔴 **خدمة مفردة فوق كلّ ويدجت طور.** ربطُ دورة حياتها بويدجتِ طورٍ
//    يعني إعادة اتصالٍ كاملة مع كلّ انتقال — ينقطع الصوت في منتصف
//    الجملة. الويب حلّها بمفتاحٍ ثابت؛ نحن نحلّها بخدمةٍ مفردة.
//
// المفتاح الوحيد لإعادة التهيئة: (الغرفة، هل أنا مضيف). لا الطور.

/// واجهةٌ رفيعة فوق الـSDK — تعزل المنطق عن المكتبة الأصليّة كي يبقى
/// كلّ ما في هذا الملفّ قابلاً للاختبار بلا جهاز.
abstract class VoiceEngine {
  Future<void> init({
    required String authToken,
    required bool enableAudio,
    required String displayName,
  });
  Future<void> join();
  Future<void> leave();
  Future<void> enableSelfAudio();
  Future<void> disableSelfAudio();
  Future<void> enableSelfVideo();
  Future<void> disableSelfVideo();
  Future<void> muteParticipant(int physicalId);

  /// لقطةٌ خامّ من الـSDK: الذات والمشاركون.
  VoiceEngineSnapshot read();

  /// يُستدعى كلّما تغيّرت حالة الـSDK.
  set onChanged(VoidCallback? cb);
}

class VoiceEngineSnapshot {
  const VoiceEngineSnapshot({
    this.selfAudioOn = false,
    this.selfVideoOn = false,
    this.canMute = false,
    this.audioByPid = const {},
    this.videoByPid = const {},
    this.participantCount = 0,
  });

  final bool selfAudioOn, selfVideoOn, canMute;
  final Map<int, bool> audioByPid, videoByPid;
  final int participantCount;
}

class VoiceService extends ChangeNotifier {
  VoiceService._();
  static final VoiceService instance = VoiceService._();

  /// يُحقَن في الاختبارات ببديلٍ لا يمسّ الجهاز.
  @visibleForTesting
  static VoiceEngine Function()? engineFactory;

  VoiceEngine? _engine;
  String? _roomId;
  bool _isHost = false;
  int? _selfPid;

  VoiceSnapshot _snap = const VoiceSnapshot();
  VoiceSnapshot get snapshot => _snap;

  ActiveSpeakerState _speaker = const ActiveSpeakerState();
  ActiveSpeakerState get speaker => _speaker;

  bool get isHost => _isHost;
  int? get selfPid => _selfPid;

  /// أطوارُ المايك الحرّ تُقرأ من حالة المتحدّث النشط.
  bool get freeMic => isFreeMicPhase(_speaker.phase);

  bool _dead = false;
  bool get isPlayerDead => _dead;

  final _handlers = <String, void Function(dynamic)>{};

  // ══════════════════════════════════════════════════════
  // الدورة
  // ══════════════════════════════════════════════════════

  /// 🔴 يُستدعى مرّةً لكلّ غرفة. تكرارُه بنفس المفتاح لا يفعل شيئاً —
  ///    وهذا هو ما يمنع انقطاع الصوت عند تبدّل الأطوار.
  Future<void> connect({
    required String roomId,
    required bool isHost,
    int? selfPhysicalId,
    String displayName = 'مشارك',
  }) async {
    if (_engine != null && _roomId == roomId && _isHost == isHost) return;
    await disconnect();

    _roomId = roomId;
    _isHost = isHost;
    _selfPid = selfPhysicalId;
    _set(_snap.copyWith(connecting: true, clearError: true));
    _wireSocket();

    final r = await SocketService.instance
        .ask('voice:get-token', {'roomId': roomId});
    if (r?['success'] != true || r?['authToken'] == null) {
      _log('❌ تعذّر توكن الصوت: ${r?['error'] ?? 'خطأ'}');
      _set(_snap.copyWith(
          connecting: false, connected: false, error: '${r?['error'] ?? 'voice_token_failed'}'));
      return;
    }

    // الصلاحية قبل الانضمام — الرفض حالةُ خطأٍ لا تعطّل
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      _log('❌ فشل الاتصال بالصوت: صلاحية الميكروفون مرفوضة');
      _set(_snap.copyWith(
          connecting: false, connected: false, error: 'mic_permission_denied'));
      return;
    }

    try {
      final engine = (engineFactory ?? _defaultEngine)();
      _engine = engine;
      engine.onChanged = _rebuild;
      await engine.init(
        authToken: '${r!['authToken']}',
        // 🔴 المضيف ينضمّ ومايكه مفتوح، واللاعب مكتوم، والكاميرا مغلقة
        //    للجميع. عكسُها يعني طاولةً تتكلّم كلّها في اللحظة الأولى.
        enableAudio: isHost,
        displayName: displayName,
      );
      await engine.join();
      _log(isHost ? '✅ متّصل بالصوت (مضيف)' : '✅ متّصل بالصوت (لاعب)');
      _set(_snap.copyWith(connecting: false, connected: true, clearError: true));
      _rebuild();
    } catch (e) {
      _log('❌ فشل الاتصال بالصوت: $e');
      _set(_snap.copyWith(
          connecting: false, connected: false, error: '$e'));
    }
  }

  Future<void> disconnect() async {
    _unwireSocket();
    final e = _engine;
    _engine = null;
    _roomId = null;
    if (e != null) {
      e.onChanged = null;
      try {
        await e.leave();
      } catch (_) {}
    }
    _set(const VoiceSnapshot());
  }

  void _rebuild() {
    final e = _engine;
    if (e == null) return;
    final s = e.read();
    _set(_snap.copyWith(
      selfAudioOn: s.selfAudioOn,
      selfVideoOn: s.selfVideoOn,
      canMute: s.canMute,
      audioByPid: s.audioByPid,
      videoByPid: s.videoByPid,
      participantCount: s.participantCount,
    ));
    unawaited(_enforceRules());
  }

  // ══════════════════════════════════════════════════════
  // §6.ب قواعد المايك — ثلاثُ قواعد لا رابع لها
  // ══════════════════════════════════════════════════════

  /// يُستدعى بعد كلّ تغيّرٍ في الطور أو في الأصوات.
  Future<void> _enforceRules() async {
    final e = _engine;
    if (e == null || !_snap.connected) return;

    // ③ الكاميرا مقفولةٌ ليلاً — مكافحة غشّ: لا كروت أدوار على الكاميرا
    if (_speaker.phase == 'NIGHT' && _snap.selfVideoOn) {
      await e.disableSelfVideo();
    }

    if (freeMic) return;

    if (!_isHost) {
      // ① القفل السياديّ: مايك اللاعب يُفتح في دوره ويُغلق بعده — تلقائياً
      final should = shouldOpenMic;
      if (should && !_snap.selfAudioOn) {
        await e.enableSelfAudio();
      } else if (!should && _snap.selfAudioOn) {
        await e.disableSelfAudio();
      }
      return;
    }

    // ② فرض المضيف: كلّ متحدّثٍ بلا إذنٍ يُكتَم فوراً
    if (!_snap.canMute) return;
    final allowed = _speaker.allowedPids;
    for (final entry in _snap.audioByPid.entries) {
      if (!entry.value) continue;
      if (entry.key == kVoiceHostPid) continue;
      if (allowed.contains(entry.key)) continue;
      await e.muteParticipant(entry.key);
    }
  }

  /// اللاعب الحيّ في دوره وحده يُفتح مايكه.
  bool get shouldOpenMic =>
      _selfPid != null && _speaker.allowedPids.contains(_selfPid) && !_dead;

  /// يُحدَّث من `GameSessionController`/`HostGameController` مع كلّ حالة.
  void updateContext({String? phase, bool? isPlayerDead}) {
    var changed = false;
    if (isPlayerDead != null && isPlayerDead != _dead) {
      _dead = isPlayerDead;
      changed = true;
    }
    if (phase != null && phase != _speaker.phase) {
      _speaker = _speaker.onPhase(phase);
      changed = true;
    }
    if (changed) {
      notifyListeners();
      unawaited(_enforceRules());
    }
  }

  /// بذرةُ حالة النقاش من الاستطلاع — لاستعادة الحالة بعد إعادة الاتصال.
  void seedDiscussion(dynamic discussionState) {
    _speaker = _speaker.onDiscussion({'discussionState': discussionState});
    notifyListeners();
    unawaited(_enforceRules());
  }

  // ══════════════════════════════════════════════════════
  // أفعال المستخدم
  // ══════════════════════════════════════════════════════

  /// 🔒 خارج أطوار المايك الحرّ الزرّ **خاملٌ تماماً** — لا يفعل شيئاً.
  Future<void> toggleSelfAudio() async {
    final e = _engine;
    if (e == null || !_snap.connected) return;
    if (!freeMic && !_isHost) return;
    if (_snap.selfAudioOn) {
      await e.disableSelfAudio();
    } else {
      await e.enableSelfAudio();
    }
  }

  Future<void> toggleSelfVideo() async {
    final e = _engine;
    if (e == null || !_snap.connected) return;
    if (_speaker.phase == 'NIGHT') return;
    if (_snap.selfVideoOn) {
      await e.disableSelfVideo();
    } else {
      await e.enableSelfVideo();
      // ركلةُ إعادة بناء: المسار الأصليّ يقرأ الحالة بعد ١٢٠ms لأنّ
      // مسار الفيديو لا يصير جاهزاً في نفس التكّة
      Future.delayed(const Duration(milliseconds: 120), _rebuild);
    }
  }

  void toggleSpeakerMode() =>
      _set(_snap.copyWith(speakerMode: !_snap.speakerMode));

  Future<void> muteByPid(int pid, [String? name]) async {
    final e = _engine;
    if (e == null) return;
    final label = name?.isNotEmpty == true ? name! : '#$pid';
    if (_snap.audioByPid[pid] == null) {
      _log('⚠️ $label غير موجود في الصوت');
      return;
    }
    if (_snap.audioByPid[pid] == false) {
      _log('$label مايكه مغلق أصلاً');
      return;
    }
    try {
      await e.muteParticipant(pid);
      _log('🔇 كتمتَ $label');
    } catch (err) {
      _log('❌ فشل كتم $label: $err');
    }
  }

  // ══════════════════════════════════════════════════════
  // ⚔️ المواجهة
  // ══════════════════════════════════════════════════════

  ConfrontationState? get confrontation => _speaker.confrontation;

  Future<String?> requestConfrontation(int targetPhysicalId) =>
      _confront('player:request-confrontation',
          {'targetPhysicalId': targetPhysicalId});

  Future<String?> respondConfrontation(bool accept) =>
      _confront('player:respond-confrontation', {'accept': accept});

  Future<String?> approveConfrontation(bool approve) =>
      _confront('leader:approve-confrontation', {'approve': approve});

  /// يُرجع `null` عند النجاح ورسالةً عربيّة عند الفشل.
  Future<String?> _confront(String event, Map<String, dynamic> data) async {
    final id = _roomId;
    if (id == null) return 'تعذّر';
    try {
      final r =
          await SocketService.instance.ask(event, {'roomId': id, ...data});
      if (r?['success'] == true) return null;
      return mapConfrontationError(r?['error'] ?? r?['code']);
    } catch (e) {
      return '$e';
    }
  }

  // ══════════════════════════════════════════════════════
  // مستمعات السوكِت
  // ══════════════════════════════════════════════════════

  void _on(String event, void Function(dynamic) fn) {
    _handlers[event] = fn;
    SocketService.instance.on(event, fn);
  }

  void _wireSocket() {
    if (_handlers.isNotEmpty) return;

    _on('confrontation:pending', (d) {
      final cf = ConfrontationState.fromPending(d);
      if (cf == null) return;
      _speaker = _speaker.copyWith(confrontation: cf);
      notifyListeners();
    });

    _on('confrontation:started', (d) {
      final cf = ConfrontationState.fromStarted(d);
      if (cf == null) return;
      _speaker = _speaker.copyWith(confrontation: cf);
      notifyListeners();
      unawaited(_enforceRules());
    });

    _on('confrontation:ended', (_) {
      _speaker = _speaker.copyWith(clearConfrontation: true);
      notifyListeners();
      unawaited(_enforceRules());
    });

    _on('day:discussion-updated', (d) {
      _speaker = _speaker.onDiscussion(d);
      notifyListeners();
      unawaited(_enforceRules());
    });

    _on('day:justification-timer-started', (d) {
      final pid = d is Map ? (d['physicalId'] as num?)?.toInt() : null;
      _speaker = _speaker.copyWith(defenderId: pid);
      notifyListeners();
      unawaited(_enforceRules());
    });

    _on('day:justification-timer-stopped', (_) {
      _speaker = _speaker.copyWith(clearDefender: true);
      notifyListeners();
      unawaited(_enforceRules());
    });

    _on('game:phase-changed', (d) {
      final phase = d is Map ? d['phase'] as String? : null;
      _speaker = _speaker.onPhase(phase);
      notifyListeners();
      unawaited(_enforceRules());
    });
  }

  void _unwireSocket() {
    for (final e in _handlers.entries) {
      SocketService.instance.off(e.key, e.value);
    }
    _handlers.clear();
  }

  // ══════════════════════════════════════════════════════
  // السجلّ
  // ══════════════════════════════════════════════════════

  void _log(String line) {
    final now = DateTime.now();
    String two(int n) => n.toString().padLeft(2, '0');
    final stamp = '${two(now.hour)}:${two(now.minute)}:${two(now.second)}';
    // آخر أربعة عشر سطراً فقط — سجلٌّ لا أرشيف
    final next = [..._snap.log, '$stamp · $line'];
    _set(_snap.copyWith(
        log: next.length > 14 ? next.sublist(next.length - 14) : next));
  }

  void _set(VoiceSnapshot s) {
    _snap = s;
    notifyListeners();
  }

  @visibleForTesting
  void primeForTest({
    VoiceSnapshot? snapshot,
    ActiveSpeakerState? speaker,
    bool? isHost,
    int? selfPid,
    bool? dead,
    VoiceEngine? engine,
    String? roomId,
  }) {
    if (snapshot != null) _snap = snapshot;
    if (speaker != null) _speaker = speaker;
    if (isHost != null) _isHost = isHost;
    if (selfPid != null) _selfPid = selfPid;
    if (dead != null) _dead = dead;
    if (engine != null) _engine = engine;
    if (roomId != null) _roomId = roomId;
    notifyListeners();
  }

  @visibleForTesting
  Future<void> enforceForTest() => _enforceRules();

  @visibleForTesting
  void resetForTest() {
    _unwireSocket();
    _engine = null;
    _roomId = null;
    _isHost = false;
    _selfPid = null;
    _dead = false;
    _snap = const VoiceSnapshot();
    _speaker = const ActiveSpeakerState();
  }
}

// ══════════════════════════════════════════════════════
// 🔌 الربط بالـSDK الأصليّ
// ══════════════════════════════════════════════════════

VoiceEngine _defaultEngine() => _RealtimeKitEngine();

class _RealtimeKitEngine implements VoiceEngine {
  final _client = RealtimekitClient();
  VoidCallback? _onChanged;

  @override
  set onChanged(VoidCallback? cb) => _onChanged = cb;

  @override
  Future<void> init({
    required String authToken,
    required bool enableAudio,
    required String displayName,
  }) async {
    final done = Completer<void>();
    _client.init(
      RtkMeetingInfo(
        authToken: authToken,
        enableAudio: enableAudio,
        enableVideo: false,
        displayName: displayName,
      ),
      onSuccess: () => done.complete(),
      onError: (e) => done.completeError(Exception('$e')),
    );
    await done.future.timeout(const Duration(seconds: 20));
  }

  @override
  Future<void> join() async {
    final done = Completer<void>();
    _client.joinRoom(
      onSuccess: () => done.complete(),
      onError: (e) => done.completeError(Exception('$e')),
    );
    await done.future.timeout(const Duration(seconds: 20));
    _onChanged?.call();
  }

  @override
  Future<void> leave() async {
    _client.leaveRoom();
  }

  // 🔴 استدعاءات الـSDK **متزامنة تُرجع `void`** وتردّ عبر `onResult`.
  //    كنتُ أنتظرها بـ`await` فبدت ناجحةً قبل أن تُنفَّذ فعلاً.
  @override
  Future<void> enableSelfAudio() => _act(
      (r) => _client.localUser.enableAudio(onResult: r));

  @override
  Future<void> disableSelfAudio() => _act(
      (r) => _client.localUser.disableAudio(onResult: r));

  @override
  Future<void> enableSelfVideo() => _act(
      (r) => _client.localUser.enableVideo(onResult: r));

  @override
  Future<void> disableSelfVideo() => _act(
      (r) => _client.localUser.disableVideo(onResult: r));

  @override
  Future<void> muteParticipant(int physicalId) {
    final target = _client.participants.joined
        .where((p) =>
            physicalIdFromCustom(p.customParticipantId) == physicalId)
        .firstOrNull;
    if (target == null) {
      return Future.error(Exception('participant not found'));
    }
    return _act((r) => target.disableAudio(onResult: r));
  }

  /// يحوّل نمط `onResult` إلى `Future` — بمهلةٍ كي لا تعلق الواجهة.
  Future<void> _act(void Function(void Function(RtkError?)) call) {
    final done = Completer<void>();
    call((error) {
      if (done.isCompleted) return;
      if (error == null) {
        done.complete();
      } else {
        done.completeError(Exception('$error'));
      }
    });
    return done.future
        .timeout(const Duration(seconds: 8))
        .whenComplete(() => _onChanged?.call());
  }

  @override
  VoiceEngineSnapshot read() {
    final self = _client.localUser;
    final joined = _client.participants.joined;
    final audio = <int, bool>{};
    final video = <int, bool>{};

    for (final p in joined) {
      final pid = physicalIdFromCustom(p.customParticipantId);
      // 🔒 مشاركٌ بمعرّفٍ لا نفهمه يُتجاهَل — لا يدخل الخرائط أصلاً
      if (pid == null) continue;
      audio[pid] = p.audioEnabled;
      video[pid] = p.videoEnabled;
    }

    return VoiceEngineSnapshot(
      selfAudioOn: self.audioEnabled,
      selfVideoOn: self.videoEnabled,
      canMute: _client.permissions.host.canMuteAudio,
      audioByPid: audio,
      videoByPid: video,
      participantCount: joined.length,
    );
  }
}
