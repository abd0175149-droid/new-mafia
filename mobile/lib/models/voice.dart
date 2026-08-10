// ══════════════════════════════════════════════════════
// 🎙️ نماذج الصوت المباشر والمواجهة — §8 في الملفّ ٣١
// ══════════════════════════════════════════════════════
// 🔒 هذه الطبقة **لا تُرسم إلّا عند `config.isRemote == true`**. الخادم
//    نفسه يرفض توكن الصوت للغرف الوجاهية بخطأ `voice_remote_only`،
//    فالحارس هنا تكرارٌ مقصود لا زائد.

/// معرّف المضيف في خرائط الصوت — ليس مقعداً حقيقياً.
const kVoiceHostPid = -1;

/// أطوارٌ يملك فيها الجميع مايكاً حرّاً يدوياً (§6.ب).
const kFreeMicPhases = <String>{
  'LOBBY',
  'ROLE_GENERATION',
  'ROLE_BINDING',
  'GAME_OVER',
};

bool isFreeMicPhase(String? phase) => kFreeMicPhases.contains(phase);

/// `'host' → -1` · `'p{N}' → N` · غيرهما يُتجاهَل.
///
/// 🔴 الإرجاع `null` لا صفر: صفرٌ مقعدٌ صالحٌ نظرياً، وخلطُه بالمجهول
///    يضع مشاركاً غريباً في خريطة الأصوات.
int? physicalIdFromCustom(String? customId) {
  if (customId == null || customId.isEmpty) return null;
  if (customId == 'host') return kVoiceHostPid;
  if (customId.startsWith('p')) {
    final n = int.tryParse(customId.substring(1));
    if (n != null) return n;
  }
  return null;
}

// ══════════════════════════════════════════════════════
// ⚔️ المواجهة
// ══════════════════════════════════════════════════════

enum ConfrontationStatus { pendingTarget, pendingLeader, active }

ConfrontationStatus? confrontationStatusOf(String? raw) => switch (raw) {
      'PENDING_TARGET' => ConfrontationStatus.pendingTarget,
      'PENDING_LEADER' => ConfrontationStatus.pendingLeader,
      'ACTIVE' => ConfrontationStatus.active,
      _ => null,
    };

class ConfrontationState {
  const ConfrontationState({
    required this.status,
    required this.requesterId,
    required this.targetId,
    this.requesterName,
    this.targetName,
    this.durationSeconds = 30,
    this.startedAtMs,
  });

  final ConfrontationStatus status;
  final int requesterId, targetId;

  /// 🔴 بثّ `PENDING_LEADER` **بلا أسماء** — تُشتقّ من الروستر المحلّي.
  final String? requesterName, targetName;

  final int durationSeconds;
  final int? startedAtMs;

  bool involves(int? pid) => pid != null && (pid == requesterId || pid == targetId);

  /// المتبقّي مُشتقٌّ من زمن الخادم لا بعدٍّ محلّيٍّ يتراكم انزياحه.
  int remaining({DateTime? now}) {
    final st = startedAtMs;
    if (st == null) return durationSeconds;
    final elapsed =
        ((now ?? DateTime.now()).millisecondsSinceEpoch - st) / 1000;
    final left = (durationSeconds - elapsed).round();
    return left < 0 ? 0 : left;
  }

  static ConfrontationState? fromPending(dynamic d) {
    if (d is! Map) return null;
    final st = confrontationStatusOf(d['status'] as String?);
    if (st == null) return null;
    return ConfrontationState(
      status: st,
      requesterId: (d['requesterId'] as num?)?.toInt() ?? -1,
      targetId: (d['targetId'] as num?)?.toInt() ?? -1,
      requesterName: d['requesterName'] as String?,
      targetName: d['targetName'] as String?,
    );
  }

  static ConfrontationState? fromStarted(dynamic d) {
    if (d is! Map) return null;
    return ConfrontationState(
      status: ConfrontationStatus.active,
      requesterId: (d['requesterId'] as num?)?.toInt() ?? -1,
      targetId: (d['targetId'] as num?)?.toInt() ?? -1,
      durationSeconds: (d['durationSeconds'] as num?)?.toInt() ?? 30,
      startedAtMs: (d['startedAt'] as num?)?.toInt(),
    );
  }
}

/// رسائل خطأ المواجهة — تُعرض حرفيّاً.
String mapConfrontationError(Object? codeOrError) {
  final code = codeOrError is Map
      ? '${codeOrError['error'] ?? codeOrError['code'] ?? ''}'
      : '$codeOrError';
  return switch (code) {
    'max_reached' => 'استُنفد حدّ المواجهات لهذه الجولة (3)',
    'confrontation_in_progress' => 'هناك مواجهة جارية',
    'discussion_only' => 'المواجهة أثناء النقاش فقط',
    'must_be_alive' => 'كلا الطرفين يجب أن يكونا أحياء',
    'not_target' => 'لست الطرف المستهدَف',
    'only_leader' => 'المُوجِّه فقط',
    '' || 'null' => 'تعذّر',
    _ => code,
  };
}

// ══════════════════════════════════════════════════════
// 🔊 مُصغِّر «من يُسمح له بالكلام الآن»
// ══════════════════════════════════════════════════════
// 🔴 المصدر **الوحيد** لقاعدة فتح المايك وكتمه. تعدّد المصادر يعني
//    لاعبَين يتكلّمان معاً أو صمتاً كاملاً في دور أحدهم.

class ActiveSpeakerState {
  const ActiveSpeakerState({
    this.phase,
    this.speakerId,
    this.discussionStatus,
    this.defenderId,
    this.confrontation,
  });

  final String? phase;
  final int? speakerId;
  final String? discussionStatus;
  final int? defenderId;
  final ConfrontationState? confrontation;

  /// الأسبقيّة: المواجهة النشطة تتجاوز كلّ شيء، ثمّ النقاش، ثمّ الدفاع.
  List<int> get allowedPids {
    final cf = confrontation;
    if (cf != null && cf.status == ConfrontationStatus.active) {
      return [cf.requesterId, cf.targetId];
    }
    if (phase == 'DAY_DISCUSSION' &&
        discussionStatus == 'SPEAKING' &&
        speakerId != null) {
      return [speakerId!];
    }
    if (phase == 'DAY_JUSTIFICATION' && defenderId != null) {
      return [defenderId!];
    }
    // ليلٌ أو تصويتٌ أو ما بين الأدوار: لا أحد
    return const [];
  }

  ActiveSpeakerState copyWith({
    String? phase,
    int? speakerId,
    String? discussionStatus,
    int? defenderId,
    ConfrontationState? confrontation,
    bool clearSpeaker = false,
    bool clearDefender = false,
    bool clearConfrontation = false,
  }) =>
      ActiveSpeakerState(
        phase: phase ?? this.phase,
        speakerId: clearSpeaker ? null : (speakerId ?? this.speakerId),
        discussionStatus: clearSpeaker
            ? null
            : (discussionStatus ?? this.discussionStatus),
        defenderId: clearDefender ? null : (defenderId ?? this.defenderId),
        confrontation: clearConfrontation
            ? null
            : (confrontation ?? this.confrontation),
      );

  /// انتقال الطور يمسح ما لا يخصّه — وإلّا بقي متحدّثٌ «نشط» في الليل.
  ActiveSpeakerState onPhase(String? next) {
    var s = copyWith(phase: next);
    if (next != 'DAY_DISCUSSION') {
      s = s.copyWith(clearSpeaker: true, clearConfrontation: true);
    }
    if (next != 'DAY_JUSTIFICATION') s = s.copyWith(clearDefender: true);
    return s;
  }

  ActiveSpeakerState onDiscussion(dynamic d) {
    final ds = d is Map ? d['discussionState'] : null;
    if (ds is! Map) return this;
    return ActiveSpeakerState(
      phase: phase,
      speakerId: (ds['currentSpeakerId'] as num?)?.toInt(),
      discussionStatus: '${ds['status'] ?? ''}',
      defenderId: defenderId,
      confrontation: confrontation,
    );
  }
}

/// لقطة حالة الصوت كما ترسمها الواجهة.
class VoiceSnapshot {
  const VoiceSnapshot({
    this.connecting = false,
    this.connected = false,
    this.error,
    this.selfAudioOn = false,
    this.selfVideoOn = false,
    this.canMute = false,
    this.participantCount = 0,
    this.audioByPid = const {},
    this.videoByPid = const {},
    this.speakerMode = true,
    this.log = const [],
  });

  final bool connecting, connected;
  final String? error;
  final bool selfAudioOn, selfVideoOn, canMute;
  final int participantCount;

  /// من مايكه مفتوح ومن كاميرته مفتوحة — مفهرسةً بالمقعد.
  final Map<int, bool> audioByPid, videoByPid;

  /// الافتراضيّ السمّاعة الخارجية: اللعبة تُلعَب والهاتف على الطاولة.
  final bool speakerMode;

  /// آخر أربعة عشر سطراً — سجلٌّ تشخيصيّ للمضيف.
  final List<String> log;

  VoiceSnapshot copyWith({
    bool? connecting,
    bool? connected,
    String? error,
    bool clearError = false,
    bool? selfAudioOn,
    bool? selfVideoOn,
    bool? canMute,
    int? participantCount,
    Map<int, bool>? audioByPid,
    Map<int, bool>? videoByPid,
    bool? speakerMode,
    List<String>? log,
  }) =>
      VoiceSnapshot(
        connecting: connecting ?? this.connecting,
        connected: connected ?? this.connected,
        error: clearError ? null : (error ?? this.error),
        selfAudioOn: selfAudioOn ?? this.selfAudioOn,
        selfVideoOn: selfVideoOn ?? this.selfVideoOn,
        canMute: canMute ?? this.canMute,
        participantCount: participantCount ?? this.participantCount,
        audioByPid: audioByPid ?? this.audioByPid,
        videoByPid: videoByPid ?? this.videoByPid,
        speakerMode: speakerMode ?? this.speakerMode,
        log: log ?? this.log,
      );

  /// من يتكلّم الآن فعلاً — بلا المضيف وبلا الذات.
  List<int> talkingPids({int? selfPid}) => [
        for (final e in audioByPid.entries)
          if (e.value && e.key != kVoiceHostPid && e.key != selfPid) e.key,
      ]..sort();
}
