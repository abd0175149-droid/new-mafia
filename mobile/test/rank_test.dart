import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/app/config.dart';
import 'package:mafia_club/core/api/api_client.dart';
import 'package:mafia_club/features/rank/rank_widgets.dart';
import 'package:mafia_club/models/profile.dart';
import 'package:mafia_club/models/rank.dart';

// ══════════════════════════════════════════════════════
// 🧪 شاشة الرتب — الملفّ 15
// ══════════════════════════════════════════════════════

void main() {
  // الصور تمرّ ببوّابة حلّ الروابط، وهي تحتاج الإعداد
  setUpAll(() => ApiClient.instance.init(AppConfig.prod));

  group('لوحة ألوان الرتب — خاصّة بهذه الشاشة', () {
    test('القيم حرفية', () {
      expect(RankScale.color('INFORMANT'), const Color(0xFF6B7280));
      expect(RankScale.color('SOLDIER'), const Color(0xFF3B82F6));
      expect(RankScale.color('CAPO'), const Color(0xFFA855F7));
      expect(RankScale.color('UNDERBOSS'), const Color(0xFFF59E0B));
      expect(RankScale.color('GODFATHER'), const Color(0xFFEF4444));
    });

    test('🔴 لا تساوي لوحة الملفّ الشخصيّ — الفصل مقصود', () {
      for (final t in RankScale.tiers) {
        expect(RankScale.color(t), isNot(RankConfig.of(t).color),
            reason: 'لوحتا $t تطابقتا — إحداهما نُسخت فوق الأخرى');
      }
    });

    test('رتبة مجهولة تسقط إلى رماديّ المُخبر', () {
      expect(RankScale.color(null), const Color(0xFF6B7280));
      expect(RankScale.color('KING'), const Color(0xFF6B7280));
      expect(RankScale.rrRequired('KING'), 100);
    });

    test('الأسماء والشارات مشتركة مع بقيّة التطبيق', () {
      expect(RankScale.nameAr('CAPO'), 'كابو');
      expect(RankScale.badge('GODFATHER'), '👑');
    });

    test('شارات تبويب «النقاط» مختلفة عمداً عن شارات الصفوف', () {
      expect(RankScale.howToBadges['CAPO'], '🌟');
      expect(RankScale.badge('CAPO'), '🎖️');
      expect(RankScale.howToNames['CAPO'], 'الكابو'); // بأل التعريف
      expect(RankScale.nameAr('CAPO'), 'كابو');
    });

    test('سقف RR للأب الروحيّ 9999 — لا ترقية بعده (الخريطة الاحتياطية)', () {
      expect(RankScale.rrRequired('GODFATHER'), 9999);
      expect(RankScale.rrRequired('INFORMANT'), 100);
    });

    test('العتبة الموحّدة: الإعدادات أوّلاً، ثم البروفايل، ثم الثابت', () {
      final c = ProgressionConfig.fromJson(const {
        'ranks': {
          'SOLDIER': {'rrRequired': 250},
        },
      });
      // قيمة الإعدادات تغلب البروفايل والثابت معاً
      expect(RankScale.rrRequiredFrom('SOLDIER', config: c, profile: 111), 250);
      // رتبة غائبة من الإعدادات ⇒ قيمة البروفايل
      expect(RankScale.rrRequiredFrom('CAPO', config: c, profile: 111), 111);
      // لا إعدادات ولا بروفايل ⇒ الخريطة الاحتياطية
      expect(RankScale.rrRequiredFrom('CAPO'), 300);
      expect(RankScale.rrRequiredFrom('KING'), 100);
    });
  });

  group('قصّ الأسماء', () {
    test('يقصّ بعدّ الأحرف لا بالعرض', () {
      expect(clipName('عبدالرزاق الخطيب', 8), 'عبدالرزا…');
      expect(clipName('قصير', 8), 'قصير');
      expect(clipName('12345678', 8), '12345678'); // بالضبط ⇒ بلا قصّ
    });
  });

  group('إعدادات التقدّم', () {
    test('تُقرأ الأرقام فقط، والرتب من rrRequired', () {
      final c = ProgressionConfig.fromJson(const {
        'xp': {'participation': 20, 'teamWin': 50, 'bad': 'x'},
        'rr': {'teamLoss': -20},
        'ranks': {
          'INFORMANT': {'rrRequired': 100},
          'SOLDIER': {'other': 1},
        },
      });
      expect(c.xpOf('participation'), 20);
      expect(c.xpOf('bad'), isNull);
      expect(c.rrOf('teamLoss'), -20);
      expect(c.ranks['INFORMANT'], 100);
      expect(c.ranks['SOLDIER'], isNull);
    });

    test('فعلٌ غائب يبقى null — الصفّ يختفي بدل عرض صفر مخترع', () {
      const c = ProgressionConfig();
      expect(c.xpOf('participation'), isNull);
      expect(c.rrOf('participation'), isNull);
    });

    test('roleAbilities تُقرأ كاملة — صفر الشريف قيمةٌ لا غياب', () {
      final c = ProgressionConfig.fromJson(const {
        'roleAbilities': {
          'SHERIFF': {'correctXp': 10, 'correctRr': 5, 'wrongXp': 0, 'wrongRr': 0},
          'SNIPER': {'correctXp': 12, 'correctRr': 6, 'wrongXp': -5, 'wrongRr': -5},
        },
      });
      expect(c.roleAbilities['SHERIFF']!.wrongXp, 0);
      expect(c.roleAbilities['SHERIFF']!.wrongRr, 0);
      expect(c.roleAbilities['SNIPER']!.correctXp, 12);
      expect(c.roleAbilities['SNIPER']!.wrongRr, -5);
      // دور غائب ⇒ لا صفّ له — يسقط على القيم العامة في الشاشة
      expect(c.roleAbilities['DOCTOR'], isNull);
    });
  });

  group('النماذج', () {
    test('صفّ لوحة بحقول ناقصة لا يُسقط الشاشة', () {
      final r = LeaderboardRow.fromJson(const {'id': 3});
      expect(r.rankTier, 'INFORMANT');
      expect(r.level, 1);
      expect(r.rankRR, 0);
    });

    test('قلب المتابعة لا يمسّ بقيّة الحقول', () {
      const c = CoPlayer(id: 5, name: 'س', matchCount: 4, rankTier: 'CAPO');
      final f = c.copyWith(isFollowing: true);
      expect(f.isFollowing, isTrue);
      expect(f.matchCount, 4);
      expect(f.rankTier, 'CAPO');
    });
  });

  group('التخطيط داخل ارتفاع غير محدود', () {
    Future<void> pump(WidgetTester t, Widget child) async {
      await t.pumpWidget(MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [child],
              ),
            ),
          ),
        ),
      ));
      await t.pump(const Duration(seconds: 1));
    }

    const rows = [
      LeaderboardRow(id: 1, name: 'الطيار', rankTier: 'GODFATHER', rankRR: 155, totalMatches: 30),
      LeaderboardRow(id: 2, name: 'Hamza', rankTier: 'UNDERBOSS', rankRR: 350),
      LeaderboardRow(id: 3, name: 'Lames Alhmadi', rankTier: 'CAPO', rankRR: 225),
    ];

    testWidgets('منصّة التتويج', (t) async {
      await pump(t, Podium(top3: rows, myId: 9, onTap: (_) {}));
      final size = t.getSize(find.byType(Podium));
      expect(size.height.isFinite && size.height > 0, isTrue);
      expect(find.text('🥇'), findsOneWidget);
      expect(find.text('🥈'), findsOneWidget);
      expect(find.text('🥉'), findsOneWidget);
    });

    testWidgets('صفّ لاعب، ومنه صفّي', (t) async {
      await pump(
          t,
          Column(children: [
            LeaderboardRowTile(row: rows[0], rank: 4, isMe: false, glow: null, onTap: () {}),
            LeaderboardRowTile(row: rows[1], rank: 5, isMe: true, glow: null, onTap: () {}),
          ]));
      final size = t.getSize(find.byType(LeaderboardRowTile).first);
      expect(size.height.isFinite && size.height > 0, isTrue);
      expect(find.text('Hamza (أنت)'), findsOneWidget);
      expect(find.textContaining('👑'), findsWidgets);
      // المستوى مفتاح الترتيب الثالث في الخادم — يظهر في سطر الصفّ
      expect(find.textContaining('مستوى'), findsNWidgets(2));
    });
  });
}
