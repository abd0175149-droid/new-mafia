import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 ملخّص الصباح — §4.7 في الملفّ ٢٤
// ══════════════════════════════════════════════════════

void main() {
  _gameOverModelTests();
  group('🔴 أنواع الموت تطابق الخادم', () {
    // الويب يفحص `KILL`/`SNIPE` — وهما لا يصلان أبداً، فبطاقة «لقد
    // اُغتلت!» مسارٌ ميّت هناك. الخطة أمرت بمطابقة `night-resolver.ts`.
    test('الأنواع الأربعة الحقيقية تُعدّ موتاً', () {
      for (final t in const [
        'ASSASSINATION',
        'SNIPE_MAFIA',
        'SNIPE_CITIZEN',
        'ASSASSIN_KILL'
      ]) {
        expect(MorningEvent(type: t).isKill, isTrue, reason: t);
      }
    });

    test('الأنواع الوهمية في الويب ليست موتاً', () {
      expect(const MorningEvent(type: 'KILL').isKill, isFalse);
      expect(const MorningEvent(type: 'SNIPE').isKill, isFalse);
    });

    test('الحماية والإسكات ليسا موتاً', () {
      expect(const MorningEvent(type: 'ASSASSINATION_BLOCKED').isKill, isFalse);
      expect(const MorningEvent(type: 'SILENCED').isKill, isFalse);
    });
  });

  group('خريطة العرض', () {
    ({String icon, String text}) d(String type,
        [Map<String, dynamic> extra = const {}]) {
      final r = MorningEvent(type: type, extra: extra).display;
      return (icon: r.$1, text: r.$2);
    }

    test('النصوص الحرفية', () {
      expect(d('ASSASSINATION'), (icon: '💀', text: 'تم اغتيالك!'));
      expect(d('ASSASSINATION_BLOCKED'),
          (icon: '🛡️', text: 'تم حمايتك من الاغتيال!'));
      expect(d('SNIPE_MAFIA'), (icon: '🎯', text: 'تم قنصك!'));
      expect(d('SNIPE_CITIZEN'), (icon: '🎯', text: 'تم قنصك!'));
      expect(d('SILENCED'),
          (icon: '🤫', text: 'تم إسكاتك! لا يمكنك التحدث هذه الجولة.'));
      expect(d('PROTECTION_FAILED'),
          (icon: '❌', text: 'فشلت الحماية! الهدف اُغتيل.'));
      expect(
          d('POLICEWOMAN_REVEAL'), (icon: '👮', text: 'الشرطية كشفت هويتك!'));
    });

    test('نتيجة التحقيق تفترق على `extra.result`', () {
      expect(d('SHERIFF_RESULT', const {'result': 'MAFIA'}).text,
          'نتيجة التحقيق: 🔴 مافيا');
      expect(d('SHERIFF_RESULT', const {'result': 'CITIZEN'}).text,
          'نتيجة التحقيق: 🟢 مواطن');
      // غياب النتيجة يُعامَل مواطناً — لا يُخترع نصّ ثالث
      expect(d('SHERIFF_RESULT').text, 'نتيجة التحقيق: 🟢 مواطن');
    });

    test('المجهول يُعرض خاماً بأيقونةٍ محايدة — لا نصّ مخترَع', () {
      expect(d('TWIN_TRANSFORM'), (icon: '📋', text: 'TWIN_TRANSFORM'));
    });
  });

  group('الترشيح الشخصيّ', () {
    const events = [
      MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 3),
      MorningEvent(type: 'SHERIFF_RESULT', targetPhysicalId: 3),
      MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 7),
      MorningEvent(type: 'SILENCE', targetPhysicalId: 3),
      MorningEvent(type: 'PROTECTION', targetPhysicalId: 3),
    ];

    List<MorningEvent> mine(int me) => events
        .where((e) =>
            e.targetPhysicalId == me &&
            e.type != 'SILENCE' &&
            e.type != 'PROTECTION')
        .toList();

    test('🔒 ما استهدف غيري لا يصلني', () {
      expect(mine(3).length, 2);
      expect(mine(3).every((e) => e.targetPhysicalId == 3), isTrue);
    });

    test('SILENCE و PROTECTION يُستبعدان — لهما مساراهما', () {
      expect(mine(3).map((e) => e.type),
          containsAll(const ['ASSASSINATION', 'SHERIFF_RESULT']));
      expect(mine(3).map((e) => e.type).contains('SILENCE'), isFalse);
    });

    test('من لا حدث له يرى القائمة فارغة', () => expect(mine(9), isEmpty));
  });

  group('منع التكرار', () {
    test('المفتاح يجمع الهدف والنوع — الليدر قد يعيد البثّ', () {
      const a = MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 3);
      const b = MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 3);
      const c = MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 7);
      expect(a.key, b.key);
      expect(a.key, isNot(c.key));
    });
  });

  group('الحمولة', () {
    test('تُقرأ كاملةً', () {
      final e = MorningEvent.fromJson(const {
        'type': 'SHERIFF_RESULT',
        'targetPhysicalId': 3,
        'targetName': 'عبدالله',
        'extra': {'result': 'MAFIA'},
      })!;
      expect(e.targetPhysicalId, 3);
      expect(e.extra['result'], 'MAFIA');
    });

    test('حدثٌ بلا نوعٍ يُرفض', () {
      expect(MorningEvent.fromJson(const {'targetPhysicalId': 3}), isNull);
      expect(MorningEvent.fromJson(null), isNull);
    });
  });
}

// ══════════════════════════════════════════════════════
// 🏁 حمولة نهاية الجيم — §8 و§12 في الملفّ ٢٧
// ══════════════════════════════════════════════════════
void _gameOverModelTests() {
  const raw = {
    'winner': 'JESTER',
    'matchId': 565,
    'reason': 'AUTO_REVEAL_TIMEOUT',
    'players': [
      {'physicalId': 1, 'name': 'أحمد', 'role': 'MAYOR', 'isAlive': false},
      {'physicalId': 2, 'name': 'خالد', 'role': 'JESTER', 'isAlive': true},
    ],
    'neutralResults': [
      {
        'physicalId': 2,
        'playerName': 'خالد',
        'roleId': 'JESTER',
        'roleNameAr': 'المهرج',
        'won': true,
        'conditionType': 'LYNCHED',
        'conditionDescription': 'أُقصي بالتصويت',
      }
    ],
  };

  group('🏁 GameOverReveal', () {
    test('الفائز يُشتقّ من النصّ — والمجهول null لا تعطُّل', () {
      expect(GameOverReveal.fromJson(raw).winner, WinnerType.jester);
      expect(GameOverReveal.fromJson(const {'winner': 'SOMETHING'}).winner,
          isNull);
      expect(GameOverReveal.fromJson(const {}).winner, isNull);
    });

    test('matchId عددٌ من الخادم يُحفَظ نصّاً — فهو معرّف لا كمّية', () {
      expect(GameOverReveal.fromJson(raw).matchId, '565');
    });

    test('السبب يُنقَل كما هو', () {
      expect(GameOverReveal.fromJson(raw).reason, 'AUTO_REVEAL_TIMEOUT');
      expect(GameOverReveal.fromJson(const {'players': []}).reason, isNull);
    });

    test('allPlayers مقبولٌ بديلاً عن players', () {
      final g = GameOverReveal.fromJson(const {
        'allPlayers': [
          {'physicalId': 3, 'role': 'CITIZEN'}
        ]
      });
      expect(g.players.single.physicalId, 3);
      expect(g.players.single.isAlive, isTrue); // الغياب = حيّ
    });

    test('🔒 neutralResults تُنمذَج بكلّ حقولها السبعة', () {
      final n = GameOverReveal.fromJson(raw).neutralResults.single;
      expect(n.physicalId, 2);
      expect(n.roleNameAr, 'المهرج');
      expect(n.won, isTrue);
      expect(n.conditionDescription, 'أُقصي بالتصويت');
    });

    test('وغيابها لا يُسقط الحمولة', () {
      expect(GameOverReveal.fromJson(const {'winner': 'MAFIA'}).neutralResults,
          isEmpty);
    });
  });

  group('🎁 عقد سحب الهدايا — نمذجةٌ بلا رسم', () {
    test('spinMs الافتراضيّ 4500', () {
      expect(LuckyDrawEvent.fromJson(const {}).spinMs, 4500);
      expect(
          LuckyDrawEvent.fromJson(const {'spinMs': 3000}).spinMs, 3000);
    });

    test('الحالة تُقرأ بحقولها الخمسة', () {
      final s = LuckyDrawState.fromJson(const {
        'status': 'revealed',
        'count': 2,
        'winners': [4, 9],
        'pool': [4, 9, 11],
        'revealedAt': 1730000000000,
      });
      expect(s.status, 'revealed');
      expect(s.winners, [4, 9]);
      expect(s.pool.length, 3);
      expect(s.revealedAt, 1730000000000);
    });
  });
}
