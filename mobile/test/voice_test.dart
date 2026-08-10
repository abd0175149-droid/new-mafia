import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/voice/voice_service.dart';
import 'package:mafia_club/models/voice.dart';

// ══════════════════════════════════════════════════════
// 🎙️ الصوت المباشر والمواجهة — §6 و§12 في الملفّ ٣١
// ══════════════════════════════════════════════════════
// «المايك السياديّ» هو القاعدة التي تجعل اللعبة ممكنةً عن بُعد: من ليس
// دورَه لا يُسمَع. خللٌ فيها = طاولةٌ تتكلّم كلّها معاً.

/// محرّكٌ بديل يسجّل ما طُلب منه بلا أن يمسّ جهازاً.
class _FakeEngine implements VoiceEngine {
  final calls = <String>[];
  VoiceEngineSnapshot snap = const VoiceEngineSnapshot();
  bool failMute = false;

  @override
  set onChanged(void Function()? cb) {}

  @override
  Future<void> init({
    required String authToken,
    required bool enableAudio,
    required String displayName,
  }) async =>
      calls.add('init(audio=$enableAudio)');

  @override
  Future<void> join() async => calls.add('join');

  @override
  Future<void> leave() async => calls.add('leave');

  @override
  Future<void> enableSelfAudio() async => calls.add('mic:on');

  @override
  Future<void> disableSelfAudio() async => calls.add('mic:off');

  @override
  Future<void> enableSelfVideo() async => calls.add('cam:on');

  @override
  Future<void> disableSelfVideo() async => calls.add('cam:off');

  @override
  Future<void> muteParticipant(int physicalId) async {
    if (failMute) throw Exception('boom');
    calls.add('mute:$physicalId');
  }

  @override
  VoiceEngineSnapshot read() => snap;
}

final v = VoiceService.instance;

void main() {
  late _FakeEngine engine;

  setUp(() {
    v.resetForTest();
    engine = _FakeEngine();
  });

  group('🔴 §6.ب القفل السياديّ — اللاعب', () {
    Future<void> run({
      required String phase,
      int? speaker,
      String discussion = 'SPEAKING',
      bool selfAudioOn = false,
      bool dead = false,
      int selfPid = 3,
    }) async {
      v.primeForTest(
        engine: engine,
        isHost: false,
        selfPid: selfPid,
        dead: dead,
        snapshot: VoiceSnapshot(connected: true, selfAudioOn: selfAudioOn),
        speaker: ActiveSpeakerState(
          phase: phase,
          speakerId: speaker,
          discussionStatus: discussion,
        ),
      );
      await v.enforceForTest();
    }

    test('🔴 دورُه ⇒ يُفتح مايكه تلقائياً', () async {
      await run(phase: 'DAY_DISCUSSION', speaker: 3);
      expect(engine.calls, contains('mic:on'));
    });

    test('🔴 وليس دورَه ⇒ يُغلق تلقائياً', () async {
      await run(phase: 'DAY_DISCUSSION', speaker: 7, selfAudioOn: true);
      expect(engine.calls, contains('mic:off'));
    });

    test('🔒 وميّتٌ في دوره لا يُفتح مايكه', () async {
      // الميت خارج اللعبة؛ فتحُ مايكه يعني كلامه على الأحياء
      await run(phase: 'DAY_DISCUSSION', speaker: 3, dead: true);
      expect(engine.calls, isNot(contains('mic:on')));
    });

    test('والليل لا يُفتح فيه مايك أحد', () async {
      await run(phase: 'NIGHT', speaker: 3, selfAudioOn: true);
      expect(engine.calls, contains('mic:off'));
    });

    test('والتصويت كذلك', () async {
      await run(phase: 'DAY_VOTING', speaker: 3, selfAudioOn: true);
      expect(engine.calls, contains('mic:off'));
    });

    test('🔴 والنقاش الموقوف (PAUSED) لا يفتح مايك المتحدّث', () async {
      await run(
          phase: 'DAY_DISCUSSION', speaker: 3, discussion: 'PAUSED');
      expect(engine.calls, isNot(contains('mic:on')));
    });

    test('🔒 وأطوار المايك الحرّ لا تفرض شيئاً', () async {
      for (final p in const [
        'LOBBY',
        'ROLE_GENERATION',
        'ROLE_BINDING',
        'GAME_OVER',
      ]) {
        engine.calls.clear();
        await run(phase: p, selfAudioOn: true);
        expect(engine.calls, isEmpty, reason: p);
      }
    });
  });

  group('🔴 §6.ب فرض المضيف للكتم', () {
    Future<void> run({
      required String phase,
      int? speaker,
      required Map<int, bool> audio,
      bool canMute = true,
    }) async {
      v.primeForTest(
        engine: engine,
        isHost: true,
        snapshot: VoiceSnapshot(
            connected: true, canMute: canMute, audioByPid: audio),
        speaker: ActiveSpeakerState(
          phase: phase,
          speakerId: speaker,
          discussionStatus: 'SPEAKING',
        ),
      );
      await v.enforceForTest();
    }

    test('🔴 كلّ متحدّثٍ بلا إذنٍ يُكتَم', () async {
      await run(
        phase: 'DAY_DISCUSSION',
        speaker: 2,
        audio: const {2: true, 5: true, 8: true},
      );
      expect(engine.calls, contains('mute:5'));
      expect(engine.calls, contains('mute:8'));
      // وصاحب الدور لا يُكتَم
      expect(engine.calls, isNot(contains('mute:2')));
    });

    test('🔒 والمضيف نفسه (-1) لا يُكتَم أبداً', () async {
      await run(
        phase: 'DAY_VOTING',
        audio: const {kVoiceHostPid: true, 4: true},
      );
      expect(engine.calls, isNot(contains('mute:-1')));
      expect(engine.calls, contains('mute:4'));
    });

    test('ومن مايكه مغلقٌ أصلاً لا يُكتَم', () async {
      await run(phase: 'NIGHT', audio: const {4: false});
      expect(engine.calls, isEmpty);
    });

    test('🔴 وبلا صلاحية كتمٍ لا يُحاوَل — وإلّا امتلأ السجلّ بالفشل', () async {
      await run(phase: 'NIGHT', audio: const {4: true}, canMute: false);
      expect(engine.calls, isEmpty);
    });

    test('وأطوار المايك الحرّ بلا فرض', () async {
      await run(phase: 'LOBBY', audio: const {4: true, 9: true});
      expect(engine.calls, isEmpty);
    });
  });

  group('🔒 §6.ب الكاميرا مقفولةٌ ليلاً', () {
    test('🔴 تُطفأ قسراً في الليل — مكافحة غشّ', () async {
      v.primeForTest(
        engine: engine,
        isHost: false,
        selfPid: 3,
        snapshot: const VoiceSnapshot(connected: true, selfVideoOn: true),
        speaker: const ActiveSpeakerState(phase: 'NIGHT'),
      );
      await v.enforceForTest();
      expect(engine.calls, contains('cam:off'));
    });

    test('وفي النهار تبقى', () async {
      v.primeForTest(
        engine: engine,
        isHost: false,
        selfPid: 3,
        snapshot: const VoiceSnapshot(connected: true, selfVideoOn: true),
        speaker: const ActiveSpeakerState(phase: 'DAY_DISCUSSION'),
      );
      await v.enforceForTest();
      expect(engine.calls, isNot(contains('cam:off')));
    });

    test('🔒 وزرّ الكاميرا لا يفعل شيئاً ليلاً', () async {
      v.primeForTest(
        engine: engine,
        snapshot: const VoiceSnapshot(connected: true),
        speaker: const ActiveSpeakerState(phase: 'NIGHT'),
      );
      await v.toggleSelfVideo();
      expect(engine.calls, isEmpty);
    });
  });

  group('🔒 زرّ المايك خامل خارج المايك الحرّ', () {
    test('🔴 اللاعب لا يستطيع فتح مايكه بنفسه أثناء اللعب', () async {
      v.primeForTest(
        engine: engine,
        isHost: false,
        selfPid: 3,
        snapshot: const VoiceSnapshot(connected: true),
        speaker: const ActiveSpeakerState(phase: 'DAY_VOTING'),
      );
      await v.toggleSelfAudio();
      expect(engine.calls, isEmpty);
    });

    test('لكنّه يستطيع في اللوبي', () async {
      v.primeForTest(
        engine: engine,
        isHost: false,
        selfPid: 3,
        snapshot: const VoiceSnapshot(connected: true),
        speaker: const ActiveSpeakerState(phase: 'LOBBY'),
      );
      await v.toggleSelfAudio();
      expect(engine.calls, contains('mic:on'));
    });

    test('والمضيف يستطيع في كلّ طور', () async {
      v.primeForTest(
        engine: engine,
        isHost: true,
        snapshot: const VoiceSnapshot(connected: true, selfAudioOn: true),
        speaker: const ActiveSpeakerState(phase: 'NIGHT'),
      );
      await v.toggleSelfAudio();
      expect(engine.calls, contains('mic:off'));
    });
  });

  group('🔊 أسبقيّة `allowedPids` (§6.ب)', () {
    test('🔴 المواجهة النشطة تتجاوز كلّ شيء', () {
      const s = ActiveSpeakerState(
        phase: 'DAY_DISCUSSION',
        speakerId: 9,
        discussionStatus: 'SPEAKING',
        confrontation: ConfrontationState(
          status: ConfrontationStatus.active,
          requesterId: 2,
          targetId: 5,
        ),
      );
      expect(s.allowedPids, [2, 5]);
    });

    test('ومواجهةٌ معلّقة لا تتجاوز شيئاً', () {
      const s = ActiveSpeakerState(
        phase: 'DAY_DISCUSSION',
        speakerId: 9,
        discussionStatus: 'SPEAKING',
        confrontation: ConfrontationState(
          status: ConfrontationStatus.pendingTarget,
          requesterId: 2,
          targetId: 5,
        ),
      );
      expect(s.allowedPids, [9]);
    });

    test('والدفاع يفتح للمدافع وحده', () {
      const s = ActiveSpeakerState(
          phase: 'DAY_JUSTIFICATION', defenderId: 4, speakerId: 9);
      expect(s.allowedPids, [4]);
    });

    test('🔴 وغير ذلك: لا أحد', () {
      for (final p in const ['NIGHT', 'DAY_VOTING', 'MORNING_RECAP']) {
        expect(ActiveSpeakerState(phase: p, speakerId: 3).allowedPids, isEmpty,
            reason: p);
      }
    });
  });

  group('🔄 انتقال الطور يمسح ما لا يخصّه', () {
    test('🔴 مغادرة النقاش تمسح المتحدّث والمواجهة معاً', () {
      const s = ActiveSpeakerState(
        phase: 'DAY_DISCUSSION',
        speakerId: 3,
        discussionStatus: 'SPEAKING',
        confrontation: ConfrontationState(
          status: ConfrontationStatus.active,
          requesterId: 1,
          targetId: 2,
        ),
      );
      final next = s.onPhase('NIGHT');
      expect(next.speakerId, isNull);
      expect(next.confrontation, isNull);
      expect(next.allowedPids, isEmpty);
    });

    test('ومغادرة الدفاع تمسح المدافع', () {
      const s = ActiveSpeakerState(phase: 'DAY_JUSTIFICATION', defenderId: 4);
      expect(s.onPhase('DAY_ELIMINATION').defenderId, isNull);
    });

    test('والبقاء في النقاش لا يمسح شيئاً', () {
      const s = ActiveSpeakerState(
          phase: 'DAY_DISCUSSION', speakerId: 3, discussionStatus: 'SPEAKING');
      expect(s.onPhase('DAY_DISCUSSION').speakerId, 3);
    });
  });

  group('🆔 هويّة المشارك', () {
    test('`host` مقعدٌ افتراضيّ سالب', () {
      expect(physicalIdFromCustom('host'), kVoiceHostPid);
    });

    test('و`p{N}` يُقرأ رقماً', () {
      expect(physicalIdFromCustom('p7'), 7);
      expect(physicalIdFromCustom('p12'), 12);
    });

    test('🔒 وأيّ شيءٍ آخر يُتجاهَل — `null` لا صفر', () {
      // صفرٌ مقعدٌ صالحٌ نظرياً؛ خلطُه بالمجهول يضع غريباً في الخريطة
      for (final s in const ['', 'x1', 'player3', 'pXY', 'HOST']) {
        expect(physicalIdFromCustom(s), isNull, reason: s);
      }
      expect(physicalIdFromCustom(null), isNull);
    });
  });

  group('⚔️ المواجهة', () {
    test('العدّاد مُشتقٌّ من زمن الخادم', () {
      final now = DateTime.now();
      final cf = ConfrontationState(
        status: ConfrontationStatus.active,
        requesterId: 1,
        targetId: 2,
        startedAtMs: now.millisecondsSinceEpoch - 12000,
      );
      expect(cf.remaining(now: now), 18);
    });

    test('ولا ينزل تحت الصفر', () {
      final now = DateTime.now();
      final cf = ConfrontationState(
        status: ConfrontationStatus.active,
        requesterId: 1,
        targetId: 2,
        startedAtMs: now.millisecondsSinceEpoch - 90000,
      );
      expect(cf.remaining(now: now), 0);
    });

    test('وبلا بدايةٍ يعرض المدّة كاملة', () {
      expect(
          const ConfrontationState(
                  status: ConfrontationStatus.pendingTarget,
                  requesterId: 1,
                  targetId: 2)
              .remaining(),
          30);
    });

    test('🔴 بثّ PENDING_LEADER بلا أسماء — تُشتقّ محلّياً', () {
      final cf = ConfrontationState.fromPending(const {
        'status': 'PENDING_LEADER',
        'requesterId': 3,
        'targetId': 6,
      });
      expect(cf!.requesterName, isNull);
      expect(cf.targetName, isNull);
      expect(cf.requesterId, 3);
    });

    test('وبثّ PENDING_TARGET يحمل الأسماء', () {
      final cf = ConfrontationState.fromPending(const {
        'status': 'PENDING_TARGET',
        'requesterId': 3,
        'requesterName': 'أحمد',
        'targetId': 6,
        'targetName': 'خالد',
      });
      expect(cf!.requesterName, 'أحمد');
    });

    test('وحالةٌ مجهولة تُرفض بلا تعطّل', () {
      expect(ConfrontationState.fromPending(const {'status': 'NOPE'}), isNull);
      expect(ConfrontationState.fromPending(null), isNull);
    });

    test('و`involves` تعرف الطرفين', () {
      const cf = ConfrontationState(
          status: ConfrontationStatus.active, requesterId: 3, targetId: 6);
      expect(cf.involves(3), isTrue);
      expect(cf.involves(6), isTrue);
      expect(cf.involves(9), isFalse);
      expect(cf.involves(null), isFalse);
    });
  });

  group('❌ رسائل الخطأ العربية الستّ', () {
    test('كلّ رمزٍ بنصّه', () {
      const map = {
        'max_reached': 'استُنفد حدّ المواجهات لهذه الجولة (3)',
        'confrontation_in_progress': 'هناك مواجهة جارية',
        'discussion_only': 'المواجهة أثناء النقاش فقط',
        'must_be_alive': 'كلا الطرفين يجب أن يكونا أحياء',
        'not_target': 'لست الطرف المستهدَف',
        'only_leader': 'المُوجِّه فقط',
      };
      for (final e in map.entries) {
        expect(mapConfrontationError(e.key), e.value, reason: e.key);
      }
    });

    test('🔴 ورمزٌ مجهول يُعرض خاماً لا يُبتلَع', () {
      expect(mapConfrontationError('brand_new_code'), 'brand_new_code');
    });

    test('والفراغ يعطي «تعذّر»', () {
      expect(mapConfrontationError(null), 'تعذّر');
      expect(mapConfrontationError(''), 'تعذّر');
    });
  });

  group('📋 السجلّ التشخيصيّ', () {
    test('🔴 آخر أربعة عشر سطراً لا أكثر — سجلٌّ لا أرشيف', () async {
      v.primeForTest(engine: engine, snapshot: const VoiceSnapshot());
      for (var i = 0; i < 20; i++) {
        await v.muteByPid(i); // كلّ نداءٍ يكتب «غير موجود في الصوت»
      }
      expect(v.snapshot.log.length, 14);
    });

    test('وكتمُ غير الموجود يُسجَّل ولا يرمي', () async {
      v.primeForTest(engine: engine, snapshot: const VoiceSnapshot());
      await v.muteByPid(9, 'خالد');
      expect(v.snapshot.log.last, contains('⚠️ خالد غير موجود في الصوت'));
    });

    test('ومن مايكه مغلقٌ أصلاً له سطرُه', () async {
      v.primeForTest(
          engine: engine,
          snapshot: const VoiceSnapshot(audioByPid: {9: false}));
      await v.muteByPid(9, 'خالد');
      expect(v.snapshot.log.last, contains('خالد مايكه مغلق أصلاً'));
    });

    test('والكتم الناجح يُسجَّل', () async {
      v.primeForTest(
          engine: engine,
          snapshot: const VoiceSnapshot(audioByPid: {9: true}));
      await v.muteByPid(9, 'خالد');
      expect(v.snapshot.log.last, contains('🔇 كتمتَ خالد'));
    });

    test('والفشل يُسجَّل بسببه', () async {
      engine.failMute = true;
      v.primeForTest(
          engine: engine,
          snapshot: const VoiceSnapshot(audioByPid: {9: true}));
      await v.muteByPid(9);
      expect(v.snapshot.log.last, contains('❌ فشل كتم #9'));
    });
  });

  group('🗣️ من يتكلّم الآن', () {
    test('🔴 بلا المضيف وبلا الذات — وإلّا كتم المضيف نفسه', () {
      const s = VoiceSnapshot(audioByPid: {
        kVoiceHostPid: true,
        3: true,
        5: false,
        8: true,
      });
      expect(s.talkingPids(selfPid: 3), [8]);
      expect(s.talkingPids(), [3, 8]);
    });
  });
}
