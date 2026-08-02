import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/profile/profile_sections.dart';
import 'package:mafia_club/models/profile.dart';

// ══════════════════════════════════════════════════════
// 🧪 الأقسام داخل ارتفاع غير محدود
// ══════════════════════════════════════════════════════
// حارسٌ على علّة كلّفتني ساعة على الجهاز: `Row(crossAxisAlignment:
// stretch)` يعني «خذ كامل الارتفاع المتاح»، وداخل شاشة تمرير المتاح
// **لانهائيّ**. النتيجة لم تكن استثناءً أحمر ولا شريط تجاوز — بل شاشة
// سوداء تماماً: البناء يعمل، والتخطيط يبدأ ولا ينتهي، فلا يُرسم شيء
// **ولا يُطبع خطأ**. عينٌ بشرية لا تجد هذا؛ اختبارٌ يجده فوراً.
//
// أي قسم جديد يُضاف إلى الشاشة يُضاف هنا.

void main() {
  Future<void> pumpInScroll(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: SingleChildScrollView(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 640),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [child],
                ),
              ),
            ),
          ),
        ),
      ),
    ));
    await tester.pump(const Duration(seconds: 2)); // أشرطة التقدّم
  }

  const stats = ProfileStats(
    totalMatches: 44, totalWins: 23, winRate: 52, survivalRate: 61,
    longestWinStreak: 7, favoriteRole: 'SNIPER',
    mafiaWinRate: 79, citizenWinRate: 40,
    mafiaGames: 14, citizenGames: 30, mafiaWins: 11, citizenWins: 12,
  );
  const progression = PlayerProgression();

  testWidgets('بطاقة تقدّم الرتبة ترتفع بارتفاع محدود', (t) async {
    await pumpInScroll(t, const RankProgressCard(progression: progression));
    expect(laidOutFinite(t, RankProgressCard), isTrue);
    expect(find.text('مُخبر'), findsWidgets);
  });

  testWidgets('الأداء العام', (t) async {
    await pumpInScroll(t, const PerformanceCard(stats: stats));
    expect(laidOutFinite(t, PerformanceCard), isTrue);
    expect(find.text('44'), findsOneWidget);
    expect(find.text('23'), findsOneWidget);
    expect(find.text('21'), findsOneWidget); // خسارة = 44 − 23
  });

  testWidgets('شبكة الإحصاءات الإضافية — كانت هي العلّة', (t) async {
    await pumpInScroll(
        t, const ExtraStatsGrid(stats: stats, progression: progression));
    expect(laidOutFinite(t, ExtraStatsGrid), isTrue);
    expect(find.text('61%'), findsOneWidget);
  });

  testWidgets('تحليل الأداء — العلّة نفسها في صفّ البطاقتين', (t) async {
    await pumpInScroll(t, const AnalysisCard(stats: stats, progression: progression));
    expect(laidOutFinite(t, AnalysisCard), isTrue);
    expect(find.text('القناص'), findsOneWidget);
  });

  testWidgets('بلا مباريات مافيا يبقى الشريط منصّفاً ولا يقسم على صفر', (t) async {
    await pumpInScroll(
        t,
        const AnalysisCard(
          stats: ProfileStats(mafiaGames: 0, citizenGames: 0),
          progression: progression,
        ));
    expect(laidOutFinite(t, AnalysisCard), isTrue);
  });

  testWidgets('لوحة المتصدرين', (t) async {
    await pumpInScroll(
        t,
        const LeaderboardCard(
          rows: [
            LeaderboardEntry(id: 1, name: 'الطيار', level: 6, rankRR: 155, rankTier: 'GODFATHER'),
            LeaderboardEntry(id: 8, name: 'أنا', level: 1, rankRR: 0),
          ],
          myId: 8,
        ));
    expect(laidOutFinite(t, LeaderboardCard), isTrue);
    expect(find.text('🥇'), findsOneWidget);
  });

  testWidgets('سجل المباريات وتوسيع صفّ', (t) async {
    final matches = [
      MatchHistoryEntry.fromJson(const {
        'role': 'SNIPER', 'matchWinner': 'CITIZEN', 'survived': true,
        'xpEarned': 120, 'rrChange': 30, 'matchDuration': 425,
        'breakdown': {
          'team': 'CITIZEN', 'won': true,
          'xp': [
            {'icon': '🎮', 'label': 'مشاركة', 'value': 20},
            {'icon': '⚖️', 'label': 'تسوية', 'value': 0},  // يُخفى
          ],
          'rr': [],
        },
      }),
    ];
    await pumpInScroll(t, MatchHistoryCard(matches: matches));
    expect(laidOutFinite(t, MatchHistoryCard), isTrue);
    expect(find.text('القناص'), findsOneWidget);

    await t.tap(find.text('القناص'));
    await t.pumpAndSettle();
    expect(find.text('مشاركة'), findsOneWidget);
    expect(find.text('تسوية'), findsNothing);          // سطر بقيمة صفر مخفيّ
    expect(find.text('لا تغيّر في الرتبة'), findsOneWidget);
  });

  testWidgets('السجلّ يُقَصّ إلى ثمانية صفوف', (t) async {
    final many = List.generate(
        20, (i) => MatchHistoryEntry.fromJson({'role': 'CITIZEN', 'matchWinner': 'CITIZEN'}));
    await pumpInScroll(t, MatchHistoryCard(matches: many));
    expect(find.text('مواطن صالح'), findsNWidgets(8));
  });
}

/// ارتفاعٌ محدود = التخطيط اكتمل. لانهائيّ أو غائب = العلّة عادت.
bool laidOutFinite(WidgetTester tester, Type type) {
  final size = tester.getSize(find.byType(type));
  return size.height.isFinite && size.height > 0 && size.width.isFinite;
}
