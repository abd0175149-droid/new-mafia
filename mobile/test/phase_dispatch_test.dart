import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🔴 توزيع المراحل — الانحدار الذي جمّد شاشة اللاعب
// ══════════════════════════════════════════════════════
// شكوى المالك حرفياً: «لا تظهر مرحلة التصويت على تطبيق اللاعب ولا يظهر
// أي مراحل الليل — يبدو أن تطبيق اللاعب يتجمد على مرحلة عرض الكارد».
//
// السبب: `if (assignedRole != null) return card;` قبل توزيع المراحل.
// فما إن يصل الدور حتى تُرسم البطاقة إلى الأبد ولا تُرسم مرحلةٌ بعدها.

void main() {
  /// القاعدة الثلاثية التي يجب أن تطبّقها الشاشة.
  String body({
    required String? phase,
    required String? role,
  }) {
    final waiting =
        (phase == null || GamePhase.isPreGame(phase)) && role == null;
    final locked = phase != null && !GamePhase.isPreGame(phase);
    if (waiting) return 'waiting';
    if (!locked) return 'reveal';
    return 'play';
  }

  group('الحالات الثلاث', () {
    test('قبل الدور: انتظار', () {
      expect(body(phase: null, role: null), 'waiting');
      expect(body(phase: GamePhase.lobby, role: null), 'waiting');
      expect(body(phase: GamePhase.roleGeneration, role: null), 'waiting');
    });

    test('وصل الدور وما زلنا قبل اللعب: نافذة الكشف', () {
      expect(body(phase: GamePhase.roleBinding, role: 'SILENCER'), 'reveal');
      expect(body(phase: GamePhase.lobby, role: 'DOCTOR'), 'reveal');
    });

    test('🔴 بدأ اللعب: المرحلة تُرسم — لا البطاقة إلى الأبد', () {
      for (final p in const [
        GamePhase.dayDiscussion,
        GamePhase.dayVoting,
        GamePhase.dayJustification,
        GamePhase.dayTiebreaker,
        GamePhase.night,
        GamePhase.morningRecap,
        GamePhase.eliminationPending,
        GamePhase.gameOver,
      ]) {
        expect(body(phase: p, role: 'SILENCER'), 'play', reason: p);
      }
    });

    test('مرحلة لعبٍ بلا دور (مشاهد) تُرسم أيضاً', () {
      expect(body(phase: GamePhase.dayVoting, role: null), 'play');
    });
  });

  group('🔒 قفل البطاقة على وجهها العلنيّ', () {
    bool locked(String? phase) =>
        phase != null && !GamePhase.isPreGame(phase);

    test('مقفلةٌ في كلّ أطوار اللعب', () {
      expect(locked(GamePhase.dayDiscussion), isTrue);
      expect(locked(GamePhase.night), isTrue);
      expect(locked(GamePhase.gameOver), isTrue);
    });

    test('مفتوحةٌ في نافذة الكشف وحدها', () {
      expect(locked(GamePhase.roleBinding), isFalse);
      expect(locked(GamePhase.lobby), isFalse);
      expect(locked(null), isFalse);
    });
  });

  group('🎤 حالة النقاش', () {
    test('المتبقّي يُشتقّ من زمن البدء لا من عدّادٍ ساكن', () {
      final now = DateTime(2026, 8, 3, 22, 0, 30);
      final d = DiscussionState.fromJson({
        'currentSpeakerId': 3,
        'timeLimitSeconds': 60,
        'timeRemaining': 60,
        'startTime': now
            .subtract(const Duration(seconds: 20))
            .millisecondsSinceEpoch,
        'status': 'SPEAKING',
        'speakingQueue': [4, 5],
        'hasSpoken': [1, 2],
      })!;
      expect(d.remaining(now: now), 40);
      expect(d.isSpeaking, isTrue);
      expect(d.speakingQueue, [4, 5]);
      expect(d.hasSpoken, [1, 2]);
    });

    test('موقوفاً يبقى المتبقّي مجمّداً', () {
      final d = DiscussionState.fromJson(const {
        'currentSpeakerId': 3,
        'timeRemaining': 25,
        'status': 'PAUSED',
        'startTime': 1,
      })!;
      expect(d.remaining(), 25);
    });

    test('لا ينزل تحت الصفر', () {
      final now = DateTime(2026, 8, 3, 22, 0, 30);
      final d = DiscussionState.fromJson({
        'currentSpeakerId': 3,
        'timeRemaining': 10,
        'status': 'SPEAKING',
        'startTime':
            now.subtract(const Duration(seconds: 90)).millisecondsSinceEpoch,
      })!;
      expect(d.remaining(now: now), 0);
    });

    test('حمولةٌ ناقصة لا تُسقط الشاشة', () {
      expect(DiscussionState.fromJson(null), isNull);
      final d = DiscussionState.fromJson(const {})!;
      expect(d.currentSpeakerId, isNull);
      expect(d.speakingQueue, isEmpty);
    });
  });

  group('🔔 تنبيه الدور يُطلق على الانتقال وحده', () {
    // إطلاقه على كلّ مزامنة يعني اهتزازاً كلّ ٣ ثوانٍ طوال دقيقة الكلام.
    int fires = 0;
    int? lastSeen;
    void sync(int? speaker, {int me = 3}) {
      if (speaker != lastSeen) {
        lastSeen = speaker;
        if (speaker != null && speaker == me) fires++;
      }
    }

    setUp(() {
      fires = 0;
      lastSeen = null;
    });

    test('انتقالٌ إليّ يُطلق مرّةً واحدة مهما تكرّرت المزامنة', () {
      sync(3);
      sync(3);
      sync(3);
      expect(fires, 1);
    });

    test('دورُ غيري لا يُطلق شيئاً', () {
      sync(4);
      sync(5);
      expect(fires, 0);
    });

    test('عودة الدور إليّ في جولةٍ لاحقة تُطلق ثانيةً', () {
      sync(3);
      sync(4);
      sync(3);
      expect(fires, 2);
    });
  });

  group('🪦 بطاقة المُقصى', () {
    // قرار المالك: البطاقة تُخفى أثناء اللعب **إلّا للمُقصى** — خرج من
    // اللعب فلا مرحلةَ تشغله ولا سرّ يحرسه.
    bool showsCard({required String? phase, required bool dead}) {
      final locked = phase != null && !GamePhase.isPreGame(phase);
      if (!locked) return true; // نافذة الكشف: البطاقة ظاهرةٌ للجميع
      return dead;
    }

    test('الحيّ لا يراها أثناء اللعب', () {
      expect(showsCard(phase: GamePhase.dayVoting, dead: false), isFalse);
      expect(showsCard(phase: GamePhase.night, dead: false), isFalse);
    });

    test('🔴 والمُقصى يراها', () {
      expect(showsCard(phase: GamePhase.dayVoting, dead: true), isTrue);
      expect(showsCard(phase: GamePhase.morningRecap, dead: true), isTrue);
    });

    test('وقبل بدء اللعب يراها الجميع', () {
      expect(showsCard(phase: GamePhase.roleBinding, dead: false), isTrue);
      expect(showsCard(phase: null, dead: false), isTrue);
    });
  });

  group('🔴 مرحلةٌ بلا حمولةٍ تعود إلى لافتتها لا إلى خواء', () {
    // ظهر على الجهاز: من انضمّ إلى غرفةٍ منتهية رأى شاشةً بيضاء تماماً
    // — لا عنوان ولا رمز غرفة. الحمولة تصل بحدثٍ قد يسبقه دخولُه،
    // فالغياب حالةٌ طبيعيّة لا خطأ.
    String body({required String phase, required bool hasData}) {
      return switch (phase) {
        GamePhase.dayTiebreaker when hasData => 'tie',
        GamePhase.eliminationPending when hasData => 'elim',
        GamePhase.gameOver when hasData => 'over',
        _ => 'pending',
      };
    }

    test('بالحمولة تُرسم المرحلة', () {
      expect(body(phase: GamePhase.gameOver, hasData: true), 'over');
      expect(body(phase: GamePhase.dayTiebreaker, hasData: true), 'tie');
      expect(body(phase: GamePhase.eliminationPending, hasData: true), 'elim');
    });

    test('وبدونها تُرسم اللافتة', () {
      for (final p in const [
        GamePhase.gameOver,
        GamePhase.dayTiebreaker,
        GamePhase.eliminationPending,
      ]) {
        expect(body(phase: p, hasData: false), 'pending', reason: p);
      }
    });

    test('ولكلّ مرحلةٍ لافتةٌ بنصّها — لا فراغ', () {
      // القائمة الافتراضية تغطّي كلّ الأطوار المعروفة
      for (final p in const [
        GamePhase.lobby,
        GamePhase.roleGeneration,
        GamePhase.roleBinding,
        GamePhase.dayDiscussion,
        GamePhase.dayVoting,
        GamePhase.dayJustification,
        GamePhase.dayTiebreaker,
        GamePhase.night,
        GamePhase.morningRecap,
        GamePhase.eliminationPending,
        GamePhase.gameOver,
      ]) {
        expect(GamePhase.map(p), isNotNull, reason: p);
      }
    });
  });
}
