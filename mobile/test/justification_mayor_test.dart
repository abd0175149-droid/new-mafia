import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 التبرير والانسحاب والعمدة — §4.3 · §4.7 في الملفّ ٢٥
// ══════════════════════════════════════════════════════

void main() {
  group('⚖️ بيانات التبرير', () {
    final j = JustificationData.fromJson(const {
      'accused': [
        {'targetPhysicalId': 7, 'name': 'خالد', 'canJustify': true},
        {'targetPhysicalId': 9},
      ],
      'topVotes': 4,
      'votersForAccused': [1, 3, 5, 6],
    })!;

    test('المتّهمون يُقرأون بأسمائهم وحقّ دفاعهم', () {
      expect(j.accused.length, 2);
      expect(j.accused.first.name, 'خالد');
      expect(j.accused.first.canJustify, isTrue);
      expect(j.accused.last.canJustify, isFalse);
      expect(j.topVotes, 4);
    });

    test('🔴 من صوّت على المتّهم يُعرَف — وهو وحده يسحب', () {
      expect(j.didIVote(3), isTrue);
      expect(j.didIVote(4), isFalse);
    });

    test('متّهمٌ بلا معرّف يُسقَط ولا يُسقِط البقية', () {
      final k = JustificationData.fromJson(const {
        'accused': [
          {'name': 'بلا رقم'},
          {'targetPhysicalId': 2},
        ],
      })!;
      expect(k.accused.length, 1);
      expect(k.accused.single.targetPhysicalId, 2);
    });

    test('حمولةٌ ناقصة لا تُسقط الشاشة', () {
      expect(JustificationData.fromJson(null), isNull);
      expect(JustificationData.fromJson(const {})!.accused, isEmpty);
    });
  });

  group('🗳️ شرط ظهور بطاقة السحب', () {
    /// نظير `canShowWithdrawal` في المتحكّم.
    bool show({
      required JustificationData? j,
      required bool active,
      required int? timer,
      int me = 3,
      bool dead = false,
    }) {
      if (j == null || dead) return false;
      if (!j.didIVote(me)) return false;
      return active || timer == 0 || j.timerFinished;
    }

    final voted = JustificationData.fromJson(const {
      'accused': [
        {'targetPhysicalId': 7}
      ],
      'votersForAccused': [3, 5],
    })!;

    test('من لم يصوّت لا يرى البطاقة — لا شيء لديه ليسحبه', () {
      expect(show(j: voted, active: true, timer: 0, me: 9), isFalse);
    });

    test('تظهر بفتح النافذة', () {
      expect(show(j: voted, active: true, timer: 30), isTrue);
    });

    test('وتظهر بانتهاء وقت الدفاع ولو لم تُفتح نافذةٌ صراحةً', () {
      expect(show(j: voted, active: false, timer: 0), isTrue);
      expect(show(j: voted.copyWith(timerFinished: true), active: false, timer: null),
          isTrue);
    });

    test('لا تظهر أثناء الدفاع', () {
      expect(show(j: voted, active: false, timer: 22), isFalse);
    });

    test('المُقصى لا يسحب', () {
      expect(show(j: voted, active: true, timer: 0, dead: true), isFalse);
    });
  });

  group('النِّصاب', () {
    /// نظير `withdrawalNeeded`: ما يرسله الخادم، وإلّا نصف المصوّتين
    /// مجبوراً لأعلى.
    int needed(WithdrawalState w, JustificationData? j) => w.needed > 0
        ? w.needed
        : ((j?.votersForAccused.length ?? 0) + 1) ~/ 2;

    final j4 = JustificationData.fromJson(const {
      'votersForAccused': [1, 2, 3, 4]
    })!;
    final j5 = JustificationData.fromJson(const {
      'votersForAccused': [1, 2, 3, 4, 5]
    })!;

    test('ما يرسله الخادم يفوز', () {
      expect(needed(const WithdrawalState(needed: 7), j4), 7);
    });

    test('وإلّا نصفٌ مجبورٌ لأعلى', () {
      expect(needed(const WithdrawalState(), j4), 2);
      expect(needed(const WithdrawalState(), j5), 3);
    });

    test('بلا مصوّتين لا يقسم على صفر', () {
      expect(needed(const WithdrawalState(), null), 0);
    });

    test('من سحب يُعرَف من القائمة', () {
      const w = WithdrawalState(count: 2, needed: 3, withdrawn: [3, 5]);
      expect(w.didIWithdraw(3), isTrue);
      expect(w.didIWithdraw(4), isFalse);
    });
  });

  group('🎩 مودال العمدة', () {
    test('سطر الضحية للاعبٍ عاديّ', () {
      final p = MayorPrompt.fromJson(const {
        'timeoutSeconds': 30,
        'topVotes': 5,
        'voteWeight': 2,
        'winner': {'targetPhysicalId': 7, 'targetName': 'خالد'},
      })!;
      expect(p.isDeal, isFalse);
      expect(p.victimLine, '#7 خالد');
      expect(p.topVotes, 5);
    });

    test('وللصفقة يُذكر طرفاها', () {
      final p = MayorPrompt.fromJson(const {
        'winner': {
          'type': 'DEAL',
          'targetPhysicalId': 7,
          'initiatorPhysicalId': 3,
        },
      })!;
      expect(p.isDeal, isTrue);
      expect(p.victimLine, 'صفقة #3 ← #7');
    });

    test('الوزن الافتراضيّ ٢ والمهلة ٣٠', () {
      final p = MayorPrompt.fromJson(const {'winner': {}})!;
      expect(p.voteWeight, 2);
      expect(p.timeoutSeconds, 30);
    });
  });

  group('🔒 المودال للعمدة وحده', () {
    /// البثّ العامّ يصل الجميع — وفتحُه لغير العمدة يكشف أنّه ليس هو.
    bool opens(Object? payload) =>
        payload is Map && payload['forMayor'] == true;

    test('يُفتح على forMayor فقط', () {
      expect(opens(const {'forMayor': true, 'winner': {}}), isTrue);
      expect(opens(const {'forMayor': false, 'winner': {}}), isFalse);
      expect(opens(const {'winner': {}}), isFalse);
    });
  });

  group('بانر الكشف', () {
    test('نصّ القرار يفترق بين إعادة التصويت والتأجيل', () {
      final revote = MayorReveal.fromJson(
          const {'physicalId': 4, 'name': 'سامي', 'decision': 'REVOTE'})!;
      expect(revote.decisionLine, 'أُلغي الإعدام — تصويت جديد على الجميع');

      final postpone = MayorReveal.fromJson(
          const {'physicalId': 4, 'decision': 'POSTPONE'})!;
      expect(postpone.decisionLine, 'أُلغي الإعدام — لا موت اليوم');
    });

    test('حمولةٌ بلا رقمٍ تُرفض', () {
      expect(MayorReveal.fromJson(const {'decision': 'PASS'}), isNull);
      expect(MayorReveal.fromJson(null), isNull);
    });
  });
}
