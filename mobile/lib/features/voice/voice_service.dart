import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

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
  String _displayName = 'مشارك';

  /// اتصالٌ جارٍ الآن — راجع الحارس في `connect`.
  bool _connecting = false;

  /// مقعدٌ وصل أثناء اتصالٍ جارٍ، يُطبَّق فور انتهائه.
  int? _pendingSelfPid;

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
  ///
  /// 🪑 **استثناءٌ واحد للارتداد المبكّر: المقعد.** كان الارتداد يبتلع
  ///    مقعداً جديداً فيبقى `_selfPid` على القديم — فيُفتح مايك الجهاز في
  ///    دور من صار في مقعده القديم ويُغلق في دوره هو. والمقعد ليس رقماً
  ///    محلّياً أصلاً: هويّة المشارك في الاجتماع (`p{N}`) تُصدَر داخل
  ///    التوكن من `socket.data.physicalId` عند الخادم، فتغيّره يوجب
  ///    إعادة إصداره — وهذا ما يفعله `updateSelfSeat`.
  Future<void> connect({
    required String roomId,
    required bool isHost,
    int? selfPhysicalId,
    String displayName = 'مشارك',
  }) async {
    // 🔴 حارسُ تسابق: `connect` غير متزامنة (توكن ثمّ صلاحية ميكروفون)،
    //    والشاشة تناديها مع كلّ إشعارِ حالة. بلا الحارس تتوازى محاولتان
    //    — لأنّ `_engine` يبقى فارغاً طوال الانتظار — فينشأ محرّكان
    //    ويلتحق الجهاز بالاجتماع مرّتين.
    if (_connecting) {
      if (selfPhysicalId != null) _pendingSelfPid = selfPhysicalId;
      return;
    }
    if (_engine != null && _roomId == roomId && _isHost == isHost) {
      if (selfPhysicalId != null && selfPhysicalId != _selfPid) {
        await updateSelfSeat(selfPhysicalId, displayName: displayName);
      }
      return;
    }

    _connecting = true;
    try {
      await _openSession(
        roomId: roomId,
        isHost: isHost,
        selfPhysicalId: selfPhysicalId,
        displayName: displayName,
      );
    } finally {
      _connecting = false;
    }

    // مقعدٌ وصل أثناء الاتصال — يُطبَّق الآن كي لا يضيع بلا إشعارٍ يعيده
    final pending = _pendingSelfPid;
    _pendingSelfPid = null;
    if (pending != null && pending != _selfPid) {
      await updateSelfSeat(pending, displayName: displayName);
    }
  }

  /// 🪑 اعتمادُ مقعدٍ جديد للذات بعد نقل الليدر للمقاعد.
  ///
  /// 🔴 تحديث الرقم محلّياً **لا يكفي**: التوكن يحمل `p{المقعد القديم}`،
  ///    فيظلّ الجهاز يظهر للمضيف باسم مقعدٍ صار لغيره — يُكتَم بدلاً منه
  ///    ويُفتح مايكه في دوره. لذلك يُعاد إصدار التوكن كاملاً.
  Future<void> updateSelfSeat(int physicalId, {String? displayName}) async {
    if (_selfPid == physicalId) return;
    _selfPid = physicalId;
    if (displayName != null && displayName.isNotEmpty) {
      _displayName = displayName;
    }
    notifyListeners();

    final room = _roomId;
    // لا جلسة قائمة ⇒ الرقم وحده يكفي، و`connect` القادم يحمله في توكنه
    if (room == null || _engine == null) {
      unawaited(_enforceRules());
      return;
    }

    final host = _isHost;
    final name = _displayName;
    await disconnect();
    await connect(
      roomId: room,
      isHost: host,
      selfPhysicalId: physicalId,
      displayName: name,
    );
  }

  Future<void> _openSession({
    required String roomId,
    required bool isHost,
    int? selfPhysicalId,
    required String displayName,
  }) async {
    await disconnect();

    _roomId = roomId;
    _isHost = isHost;
    _selfPid = selfPhysicalId;
    _displayName = displayName;
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
    _displayName = 'مشارك';
    _connecting = false;
    _pendingSelfPid = null;
    _dead = false;
    _snap = const VoiceSnapshot();
    _speaker = const ActiveSpeakerState();
  }
}

// ══════════════════════════════════════════════════════
// 🔌 الربط بالـSDK الأصليّ — **مستبعَدٌ مؤقّتاً**
// ══════════════════════════════════════════════════════
// 🔴 لماذا لا يوجد محرّكٌ حقيقيّ هنا:
//
// `realtimekit_core_ios` يعلن في `Package.swift` اعتماديّةً على
//     https://gitlab.cfdata.org/cloudflare/rt/mobile/spm/core-bridge.git
// وهو GitLab **الداخليّ** لـCloudflare: يستجيب لـDNS ثم ينقطع على 443،
// بينما المضيفات العامّة تردّ من الجهاز نفسه. ومسار CocoaPods لا ينقذ:
// الـpodspec لا يذكر المضيف، لكن مصادره تستورد `RealtimeKitFlutterCoreKMM`
// وهي الوحدة التي يوفّرها ذلك المستودع — فيفشل عند الترجمة بدل الجلب.
//
// النتيجة أن **بناء iOS كلّه** كان يسقط عند حلّ الاعتماديّات، لا الصوت
// وحده. فاستُبعدت الحزمة بقرار المالك (12 آب) كي يمرّ البناء.
//
// ⚠️ الواجهة `VoiceEngine` باقيةٌ كما هي ومعها منطق القواعد والاختبارات
//    الأربعة والأربعون — المستبعَد هو التطبيق الأصليّ وحده. لإعادته:
//    ① أعد `realtimekit_core` و`realtimekit_core_platform_interface`
//       إلى pubspec، ② أعد صنف `_RealtimeKitEngine` من تاريخ هذا الملفّ
//       قبل هذا الكوميت، ③ أعِد `_defaultEngine()` إليه.
//
// ولا يُستبدَل بمحرّكٍ صامتٍ يتظاهر بالنجاح: ذلك يُظهر واجهة صوتٍ تعمل
// وهي لا تعمل. يرمي صراحةً، وتقرؤه الواجهة عبر `VoiceService.isSupported`.

/// محرّكٌ يعلن أن الصوت غير متاحٍ في هذا البناء.
class UnavailableVoiceEngine implements VoiceEngine {
  static const reason =
      'الصوت المباشر غير متاحٍ في هذا البناء — حزمة RealtimeKit مستبعَدة.';

  @override
  set onChanged(VoidCallback? cb) {}

  Never _unavailable() => throw UnsupportedError(reason);

  @override
  Future<void> init({
    required String authToken,
    required bool enableAudio,
    required String displayName,
  }) async =>
      _unavailable();

  @override
  Future<void> join() async => _unavailable();

  @override
  Future<void> leave() async {
    // المغادرة تُقبل صامتةً: تُنادى في مسارات التنظيف، ورميُها هناك
    // يُسقط شاشةً تُغادر غرفةً لم تدخلها أصلاً.
  }

  @override
  Future<void> enableSelfAudio() async => _unavailable();

  @override
  Future<void> disableSelfAudio() async => _unavailable();

  @override
  Future<void> enableSelfVideo() async => _unavailable();

  @override
  Future<void> disableSelfVideo() async => _unavailable();

  @override
  Future<void> muteParticipant(int physicalId) async => _unavailable();

  @override
  VoiceEngineSnapshot read() => const VoiceEngineSnapshot();
}

VoiceEngine _defaultEngine() => UnavailableVoiceEngine();
