import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/home.dart';

// ══════════════════════════════════════════════════════
// 👥 FEED-1 — تجميع أخبار الأصدقاء
// ══════════════════════════════════════════════════════
// 🔴 الخادم يعيد صفّاً لكلّ **مباراة**، والتجميع في العميل. بلا تجميعٍ
//    صحيح تغرق الرئيسيّة بخمسة أخبارٍ متطابقة عن ليلةٍ واحدة.
//
// 🔴 والصياغة العربيّة محروسةٌ عمداً: الويب يكتب «2 ألعاب» و«11 ألعاب»
//    بقاعدةٍ ثنائيّة (واحد/غيره) — والعربيّة تميّز المثنّى وجمع القلّة
//    والكثرة. هذا نصٌّ يقرؤه اللاعب على شاشته الأولى.

Map<String, dynamic> row(int pid, String day, {String name = 'سامي'}) => {
      'playerId': pid,
      'matchDate': '${day}T20:00:00.000Z',
      'playerInfo': {'name': name, 'avatarUrl': null},
    };

void main() {
  group('التجميع بمفتاح (لاعب + يوم)', () {
    test('ثلاث مبارياتٍ في ليلةٍ واحدة ⇒ خبرٌ واحد', () {
      final out = FriendSession.group([
        row(5, '2026-08-10'),
        row(5, '2026-08-10'),
        row(5, '2026-08-10'),
      ]);
      expect(out.length, 1);
      expect(out.first.matchCount, 3);
    });

    test('لاعبان في اليوم نفسه ⇒ خبران', () {
      final out = FriendSession.group([
        row(5, '2026-08-10'),
        row(9, '2026-08-10', name: 'ليان'),
      ]);
      expect(out.length, 2);
    });

    test('اللاعب نفسه في يومين ⇒ خبران', () {
      final out = FriendSession.group([
        row(5, '2026-08-10'),
        row(5, '2026-08-11'),
      ]);
      expect(out.length, 2);
    });

    test('الأحدث أوّلاً', () {
      final out = FriendSession.group([
        row(5, '2026-08-09'),
        row(5, '2026-08-12'),
      ]);
      expect(out.first.date!.day, 12,
          reason: 'الخادم يرتّب المباريات لا الجلسات المجمَّعة');
    });
  });

  group('الصياغة العربيّة للعدد', () {
    ({int n, String want}) c(int n, String want) => (n: n, want: want);
    for (final t in [
      c(1, 'لعبة واحدة'),
      c(2, 'لعبتان'),
      c(3, '3 ألعاب'),
      c(10, '10 ألعاب'),
      c(11, '11 لعبة'),
      c(25, '25 لعبة'),
    ]) {
      test('${t.n} ⇒ ${t.want}', () {
        final s = FriendSession(
            playerId: 1, playerName: 'س', matchCount: t.n, date: null);
        expect(s.matchesAr, t.want);
      });
    }
  });

  group('صلابة التحليل', () {
    test('صفٌّ بلا playerId يُتخطّى', () {
      final out = FriendSession.group([
        {'matchDate': '2026-08-10T20:00:00.000Z'},
        row(5, '2026-08-10'),
      ]);
      expect(out.length, 1);
    });

    test('تاريخٌ تالف لا يُسقط شيئاً', () {
      final out = FriendSession.group([
        {'playerId': 5, 'matchDate': 'ليس تاريخاً', 'playerInfo': null},
      ]);
      expect(out.length, 1);
      expect(out.first.date, isNull);
    });

    test('قائمةٌ فارغة تعطي فارغة', () {
      expect(FriendSession.group(const []), isEmpty);
    });

    test('اسمٌ من playerName حين يغيب playerInfo', () {
      final out = FriendSession.group([
        {'playerId': 5, 'matchDate': null, 'playerName': 'رامي'},
      ]);
      expect(out.first.playerName, 'رامي');
    });
  });
}
