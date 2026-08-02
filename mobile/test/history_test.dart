import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/match.dart';

// ══════════════════════════════════════════════════════
// 🧪 سجل المباريات — الملفّ 16
// ══════════════════════════════════════════════════════

void main() {
  MatchDetails m(Map<String, dynamic> j) => MatchDetails.fromJson(j);

  group('اشتقاق البطاقة — الدور وحده', () {
    test('لا ينظر إلى breakdown إطلاقاً', () {
      // الخادم يقول «فاز»، والدور مدنيّ والفائز مافيا ⇒ البطاقة «خسارة»
      final x = m({
        'role': 'SHERIFF',
        'matchWinner': 'MAFIA',
        'breakdown': {'team': 'CITIZEN', 'won': true},
      });
      expect(x.cardWon, isFalse);
      expect(x.detailWon, isTrue);
    });

    test('مافيا وفازت المافيا ⇒ فوز', () {
      expect(m({'role': 'GODFATHER', 'matchWinner': 'MAFIA'}).cardWon, isTrue);
      expect(m({'role': 'GODFATHER', 'matchWinner': 'CITIZEN'}).cardWon, isFalse);
    });
  });

  group('🔴 الدور المحايد يختلف بين البطاقة والتفصيل — مقصود', () {
    final jester = m({
      'role': 'JESTER',
      'matchWinner': 'MAFIA',
      'breakdown': {'team': 'NEUTRAL', 'won': true},
    });

    test('البطاقة تعامله مواطناً فتراه خاسراً', () {
      expect(jester.cardIsMafia, isFalse);
      expect(jester.cardWon, isFalse); // الفائز مافيا والدور «مواطن» بحسابها
    });

    test('التفصيل يقرأ حكم الخادم فيراه فائزاً محايداً', () {
      expect(jester.detailIsNeutral, isTrue);
      expect(jester.detailWon, isTrue);
    });

    test('بلا breakdown لا يظهر «محايد» أصلاً', () {
      final bare = m({'role': 'JESTER', 'matchWinner': 'MAFIA'});
      expect(bare.detailIsNeutral, isFalse);
      expect(bare.detailWon, bare.cardWon);
    });
  });

  group('نصوص العرض', () {
    test('المدّة m:ss، والصفر «—» لا «0:00»', () {
      expect(m({'durationSeconds': 425}).durationText, '7:05');
      expect(m({'durationSeconds': 1250}).durationText, '20:50');
      expect(m({'durationSeconds': 0}).durationText, '—');
      expect(m({}).durationText, '—');
    });

    test('التاريخ ميلاديّ بأرقام لاتينية — لا تقويم عربيّ هنا', () {
      final x = m({'matchDate': '2026-07-21T18:30:00.000Z'});
      // التحويل محلّي، فنقارن بالبِنية لا بيومٍ ثابت
      final d = x.matchDate!;
      expect(x.dateText, '${d.day}/${d.month}/${d.year}');
      expect(x.dateText, matches(RegExp(r'^\d{1,2}/\d{1,2}/\d{4}$')));
      expect(m({}).dateText, '—');
    });

    test('نصّ النجاة والإقصاء', () {
      expect(m({'survivedToEnd': true}).survivalText, 'نجا للنهاية');
      expect(m({'eliminatedDuring': 'NIGHT', 'eliminatedAtRound': 3}).survivalText,
          'أُقصي ليلاً (جولة 3)');
      expect(m({'eliminatedDuring': 'DAY'}).survivalText, 'أُقصي نهاراً (جولة ?)');
      // غياب اللحظة مع عدم النجاة ⇒ نهاراً
      expect(m({}).survivalText, 'أُقصي نهاراً (جولة ?)');
    });

    test('اسم اللعبة الفارغ يسقط إلى null فتُعرض «مباراة مافيا»', () {
      expect(m({'gameName': '   '}).gameName, isNull);
      expect(m({'gameName': 'ليلة القدر'}).gameName, 'ليلة القدر');
    });
  });

  group('حالات حدّية', () {
    test('استجابة فارغة لا تُسقط شيئاً', () {
      final x = m({});
      expect(x.matchId, 0);
      expect(x.xpEarned, 0);
      expect(x.rrChange, 0);
      expect(x.breakdown, isNull);
      expect(x.roundsSurvived, 0);
    });

    test('rrChange صفر يُعامَل موجباً (أخضر و«+0»)', () {
      expect(m({'rrChange': 0}).rrChange >= 0, isTrue);
    });
  });
}
