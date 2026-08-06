import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/host/role_generation.dart';

// ══════════════════════════════════════════════════════
// 🎴 توليد تركيبة الأدوار — §4.7
// ══════════════════════════════════════════════════════
// هذه الخوارزمية تقرّر توازن اللعبة: عددُ مافيا زائدٌ واحداً يقلب النتيجة.
// وهي منطقٌ خالص، فلا عذر في ألّا تُختبَر بالأرقام.

void main() {
  group('عدد المافيا = ceil(n/4)', () {
    for (final (n, expected) in const [(6, 2), (7, 2), (8, 2), (9, 3), (12, 3), (13, 4)]) {
      test('$n لاعباً ⇒ $expected مافيا', () {
        final roles = generateRoles(n);
        expect(roles.where(isMafiaRole).length, expected);
        expect(roles.length, n, reason: 'دورٌ لكلّ مقعد بالضبط');
      });
    }
  });

  group('المهرج من ثمانية فأكثر', () {
    test('سبعة لاعبين: بلا محايد', () {
      expect(generateRoles(7).contains('JESTER'), isFalse);
    });
    test('ثمانية لاعبين: مهرجٌ واحد', () {
      expect(generateRoles(8).where((r) => r == 'JESTER').length, 1);
    });
  });

  test('العمدة لا يدخل تلقائياً قبل ستّة مقاعد مواطنين', () {
    // 🔴 موضعه سادساً في الترتيب عمداً — دخولُه مبكراً يمنح المواطنين
    //    قدرةً قلبٍ للتصويت في لعبةٍ صغيرة.
    final small = generateRoles(8); // 2 مافيا + 5 مواطنين + مهرج
    expect(small.contains('MAYOR'), isFalse);

    final big = generateRoles(12); // 3 مافيا + 8 مواطنين + مهرج
    expect(big.contains('MAYOR'), isTrue);
  });

  test('الترتيب يُحترم: الأب الروحيّ أوّلاً والشريف أوّل المواطنين', () {
    final r = generateRoles(10);
    expect(r.first, 'GODFATHER');
    expect(r.firstWhere((x) => !isMafiaRole(x)), 'SHERIFF');
  });

  test('ما بعد آخر عنصر يتكرّر بالدور العاديّ لا يُسقط مقعداً', () {
    final r = generateRoles(40);
    expect(r.length, 40);
    expect(r.where((x) => x == 'MAFIA_REGULAR').length, greaterThan(0));
    expect(r.where((x) => x == 'CITIZEN').length, greaterThan(0));
  });

  group('التبديلات', () {
    test('المهرج ذهاباً وإياباً يعود إلى الأصل', () {
      final base = generateRoles(12);
      final off = toggleJester(base);
      expect(off.contains('JESTER'), isFalse);
      expect(toggleJester(off).where((r) => r == 'JESTER').length, 1);
    });

    test('السفّاح يحلّ محلّ مواطن لا يُضاف مقعداً', () {
      final base = generateRoles(12);
      final withA = toggleAssassin(base);
      expect(withA.length, base.length);
      expect(withA.contains('ASSASSIN'), isTrue);
    });

    test('التوأمان يُضافان معاً أو لا يُضافان', () {
      final base = generateRoles(12);
      final twins = toggleTwins(base);
      final hasOlder = twins.contains('OLDER_BROTHER');
      final hasYounger = twins.contains('YOUNGER_BROTHER');
      expect(hasOlder, hasYounger, reason: 'نصفُ توأمٍ دورٌ بلا معنى لعبيّ');
      expect(twins.length, base.length);
    });

    test('تركيبةٌ بلا مواطن لا تُغيَّر صامتاً', () {
      final none = <String>['GODFATHER', 'MAFIA_REGULAR'];
      expect(toggleAssassin(none), none);
      expect(toggleTwins(none), none);
    });
  });

  group('حمولة الإعدادات الرقمية', () {
    test('تُرسَل حقولُ الأدوار الحاضرة وحدها', () {
      const t = RoleTuning();
      final p = t.payloadFor(['GODFATHER', 'CITIZEN', 'JESTER']);
      expect(p.keys.toSet(), {'jesterSurviveRounds'});
      expect(p['jesterSurviveRounds'], 2);
    });

    test('تركيبةٌ كاملة ترسل الأربعة', () {
      const t = RoleTuning();
      final p = t.payloadFor(['WITCH', 'MAYOR', 'JESTER', 'ASSASSIN']);
      expect(p.keys.toSet(),
          {'witchDisableRounds', 'mayorVoteWeight', 'jesterSurviveRounds', 'assassinContractCount'});
    });
  });
}
