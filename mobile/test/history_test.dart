import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/match.dart';
import 'package:mafia_club/models/profile.dart';

// ══════════════════════════════════════════════════════
// 🧪 سجل المباريات — الملفّ 16
// ══════════════════════════════════════════════════════

void main() {
  MatchDetails m(Map<String, dynamic> j) => MatchDetails.fromJson(j);

  group('⚖️ المصدر واحد — البطاقة وتفصيلها وكل شاشة أخرى', () {
    /// نفس المباراة كما تصل من نقطتَي النهاية المختلفتين.
    (MatchDetails, MatchHistoryEntry) both(Map<String, dynamic> j) => (
          MatchDetails.fromJson(j),
          MatchHistoryEntry.fromJson(j),
        );

    test('حكم الخادم يسبق الاشتقاق من الدور', () {
      // الدور مدنيّ والفائز مافيا — الاشتقاق وحده يقول «خسارة»
      final x = m({
        'role': 'SHERIFF',
        'matchWinner': 'MAFIA',
        'breakdown': {'team': 'CITIZEN', 'won': true},
      });
      expect(x.won, isTrue, reason: 'breakdown.won هو المرجع');
    });

    test('🔴 الدور المحايد يُقرأ واحداً في كل مكان', () {
      final (detail, profileRow) = both({
        'role': 'JESTER',
        'matchWinner': 'MAFIA',
        'breakdown': {'team': 'NEUTRAL', 'won': true},
      });
      // كانت البطاقة تقول «خسارة» والتفصيل «فوز» عن المباراة نفسها
      expect(detail.won, isTrue);
      expect(profileRow.won, isTrue);
      expect(detail.won, profileRow.won);
      expect(detail.isNeutral, isTrue);
      expect(profileRow.isNeutral, isTrue);
    });

    test('الاتفاق يشمل الفريق لا النتيجة وحدها', () {
      for (final j in <Map<String, dynamic>>[
        {'role': 'GODFATHER', 'matchWinner': 'MAFIA'},
        {'role': 'DOCTOR', 'matchWinner': 'CITIZEN'},
        {'role': 'WITCH', 'matchWinner': 'CITIZEN'},
        {'role': 'ASSASSIN', 'matchWinner': 'MAFIA',
          'breakdown': {'team': 'NEUTRAL', 'won': false}},
        {'role': 'SHERIFF', 'matchWinner': 'MAFIA',
          'breakdown': {'team': 'CITIZEN', 'won': false}},
        {}, // كل شيء غائب
      ]) {
        final (d, p) = both(j);
        expect(d.won, p.won, reason: 'النتيجة اختلفت في $j');
        expect(d.isMafia, p.isMafia, reason: 'الفريق اختلف في $j');
        expect(d.isNeutral, p.isNeutral, reason: 'الحياد اختلف في $j');
      }
    });

    test('الاحتياطيّ يعمل للمباريات القديمة بلا breakdown', () {
      expect(m({'role': 'GODFATHER', 'matchWinner': 'MAFIA'}).won, isTrue);
      expect(m({'role': 'GODFATHER', 'matchWinner': 'CITIZEN'}).won, isFalse);
      expect(m({'role': 'DOCTOR', 'matchWinner': 'CITIZEN'}).won, isTrue);
      // «محايد» لا يُشتقّ من الدور — الخادم وحده يعرفه
      expect(m({'role': 'JESTER'}).isNeutral, isFalse);
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
