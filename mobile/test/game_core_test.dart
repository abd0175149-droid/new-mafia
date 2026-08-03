import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 نواة حالة اللعب — الملفّ 20
// ══════════════════════════════════════════════════════

void main() {
  group('🛡️ حارس المرحلة — §6.5', () {
    late PhaseGuard g;
    late DateTime clock;

    setUp(() {
      clock = DateTime(2026, 1, 1, 12);
      g = PhaseGuard()..now = () => clock;
    });

    test('بلا حارس: الاستطلاع يكتب ما يشاء', () {
      expect(g.allows(GamePhase.night), isTrue);
      expect(g.allows(null), isTrue);
    });

    // 🔴 هذا هو جوهر الحارس: استطلاعٌ قديم في الطريق كان يُرجع اللاعب
    //    من التصويت إلى النقاش بعد أن انتقل فعلاً
    test('حارسٌ حيّ يمنع استطلاعاً يخالفه', () {
      g.arm(GamePhase.dayVoting);
      clock = clock.add(const Duration(seconds: 2));
      expect(g.allows(GamePhase.dayDiscussion), isFalse);
      expect(g.isActive, isTrue);
    });

    test('واستطلاعٌ يوافقه يمرّ ويُنهي الحراسة', () {
      g.arm(GamePhase.dayVoting);
      clock = clock.add(const Duration(seconds: 1));
      expect(g.allows(GamePhase.dayVoting), isTrue);
      expect(g.isActive, isFalse);
    });

    // بعد المهلة يفوز الاستطلاع فيشفي جهازاً فاته حدث الانتقال
    test('بعد ستّ ثوانٍ يفوز الاستطلاع', () {
      g.arm(GamePhase.dayVoting);
      clock = clock.add(const Duration(milliseconds: 6001));
      expect(g.isActive, isFalse);
      expect(g.allows(GamePhase.night), isTrue);
    });

    test('عند الحدّ تماماً لا يزال حيّاً', () {
      g.arm(GamePhase.dayVoting);
      clock = clock.add(const Duration(milliseconds: 6000));
      expect(g.isActive, isTrue);
      expect(g.allows(GamePhase.night), isFalse);
    });

    test('حدثٌ جديد يجدّد المهلة', () {
      g.arm(GamePhase.dayVoting);
      clock = clock.add(const Duration(seconds: 5));
      g.arm(GamePhase.night);
      clock = clock.add(const Duration(seconds: 5));
      expect(g.isActive, isTrue);
      expect(g.allows(GamePhase.dayVoting), isFalse);
    });
  });

  group('المراحل', () {
    // 🔴 `DAY_ELIMINATION` سيرفريّة فقط — العميل يعرف `ELIMINATION_PENDING`
    test('الإقصاء يُترجَم إلى القيمة العميلة', () {
      expect(GamePhase.map('DAY_ELIMINATION'), GamePhase.eliminationPending);
      expect(GamePhase.map('NIGHT'), GamePhase.night);
      expect(GamePhase.map(null), isNull);
      expect(GamePhase.map(''), isNull);
    });

    test('مراحل ما قبل اللعب تُصفَّر عندها بيانات الجولة', () {
      for (final p in [GamePhase.lobby, GamePhase.roleGeneration, GamePhase.roleBinding]) {
        expect(GamePhase.isPreGame(p), isTrue, reason: p);
      }
      expect(GamePhase.isPreGame(GamePhase.night), isFalse);
      expect(GamePhase.isPreGame(null), isFalse);
    });

    test('التصويت يبقى في مرحلتين فقط', () {
      expect(GamePhase.keepsVoting(GamePhase.dayVoting), isTrue);
      expect(GamePhase.keepsVoting(GamePhase.dayJustification), isTrue);
      expect(GamePhase.keepsVoting(GamePhase.dayDiscussion), isFalse);
      expect(GamePhase.keepsVoting(GamePhase.eliminationPending), isFalse);
    });
  });

  group('الخطوات', () {
    test('done و rejoined كلتاهما داخل اللعبة', () {
      expect(Step.done.inGame, isTrue);
      expect(Step.rejoined.inGame, isTrue);
      for (final s in [Step.code, Step.phone, Step.login, Step.ticket]) {
        expect(s.inGame, isFalse, reason: '$s');
      }
    });
  });

  group('الروستر', () {
    // 🔴 لاعبٌ بلا الحقل كان يُرسم ميتاً بلا سبب
    test('غياب isAlive يعني حيّاً', () {
      expect(RosterPlayer.fromJson({'physicalId': 3}).isAlive, isTrue);
      expect(RosterPlayer.fromJson({'physicalId': 3, 'isAlive': false}).isAlive,
          isFalse);
    });
  });

  group('التصويت', () {
    test('أصوات اللاعبين تُقرأ بمفاتيح رقمية مهما وصلت نصّاً', () {
      final s = VotingState.fromJson({
        'playerVotes': {'3': 1, 7: 0},
      });
      expect(s.playerVotes[3], 1);
      expect(s.playerVotes[7], 0);
    });

    // العدّاد يُستعاد من زمن البدء لا يبدأ من الصفر بعد انقطاع
    test('المتبقّي يُحسب من زمن البدء ولا ينزل تحت الصفر', () {
      final started = DateTime.now().subtract(const Duration(seconds: 20));
      final s = VotingState.fromJson({
        'durationSeconds': 60,
        'votingStartTime': started.millisecondsSinceEpoch,
      });
      expect(s.remainingSeconds, closeTo(40, 2));

      final old = VotingState.fromJson({
        'durationSeconds': 10,
        'votingStartTime':
            DateTime.now().subtract(const Duration(minutes: 5)).millisecondsSinceEpoch,
      });
      expect(old.remainingSeconds, 0);
    });

    test('بلا مدّةٍ أو بدايةٍ لا عدّاد', () {
      expect(VotingState.fromJson({'durationSeconds': 60}).remainingSeconds, isNull);
      expect(const VotingState().remainingSeconds, isNull);
    });
  });

  group('الجلسة والمقعد المحجوز', () {
    test('جلسةٌ بلا roomId غير صالحة', () {
      expect(SavedGameSession.fromJson({'physicalId': 3}), isNull);
      expect(SavedGameSession.fromJson(null), isNull);
      expect(SavedGameSession.fromJson({'roomId': 'r1'})!.isUsable, isTrue);
    });

    test('المقعد المحجوز يعيش عشر دقائق', () {
      final fresh = HeldSeat(
          roomCode: 'AB12',
          roomId: 'r1',
          exitedAt: DateTime.now().subtract(const Duration(minutes: 9)));
      expect(fresh.isFresh, isTrue);

      final stale = HeldSeat(
          roomCode: 'AB12',
          roomId: 'r1',
          exitedAt: DateTime.now().subtract(const Duration(minutes: 11)));
      expect(stale.isFresh, isFalse);
    });

    test('الرحلة ذهاباً وإياباً تحفظ الحقول', () {
      const s = SavedGameSession(
          roomId: 'r1', physicalId: 4, roomCode: 'AB12', phone: '0790000000');
      final back = SavedGameSession.fromJson(s.toJson())!;
      expect(back.roomId, 'r1');
      expect(back.physicalId, 4);
      expect(back.roomCode, 'AB12');
      expect(back.phone, '0790000000');
    });
  });

  test('أنماط الاهتزاز محفوظة حرفياً — §6.9', () {
    expect(Buzz.role, [100, 50, 200, 50, 300]);
    expect(Buzz.seat, [200, 100, 200]);
    expect(Buzz.penaltySelf, [300, 100, 300, 100, 500]);
    expect(Buzz.penaltyEject, [500, 200, 500, 200, 500]);
    expect(Buzz.mayor, [120, 80, 120, 80, 240]);
  });
}
