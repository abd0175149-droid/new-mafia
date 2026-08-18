import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/rank.dart';

// ══════════════════════════════════════════════════════
// 🏆 RANK-1 — تجاوزات قدرات الأدوار
// ══════════════════════════════════════════════════════
// 🔴 كانت `abilityRoleOrder` **قائمةً بيضاء تُرشِّح ما يُعرض**: أيّ دورٍ
//    يعرّف له الأدمن تجاوزاً وليس فيها (دورٌ جديد، حرباء، أخٌ أكبر) يختفي
//    من التطبيق ويظهر في الويب — واللاعب يبني قراره على نقاطٍ لا يراها.
//
// صارت **ترتيباً لا ترشيحاً**. والمحروس هنا أن شيئاً لا يسقط.

void main() {
  group('لا دورَ يسقط', () {
    test('دورٌ خارج القائمة المعروفة يظهر', () {
      final out = orderedAbilityRoles(['SHERIFF', 'CHAMELEON']);
      expect(out, contains('CHAMELEON'),
          reason: 'هذا بالضبط ما كان يختفي — والأدمن عرّف له نقاطاً');
      expect(out.length, 2);
    });

    test('كلّ المفاتيح تُعاد مهما كانت', () {
      final keys = ['ZZZ_NEW', 'WITCH', 'AAA_NEW', 'DOCTOR'];
      final out = orderedAbilityRoles(keys);
      expect(out.toSet(), keys.toSet());
    });
  });

  group('الترتيب', () {
    test('المعروف أوّلاً بترتيبه المقصود', () {
      final out = orderedAbilityRoles(['WITCH', 'SHERIFF', 'DOCTOR']);
      expect(out, ['SHERIFF', 'DOCTOR', 'WITCH'],
          reason: 'ترتيب abilityRoleOrder لا ترتيب المُدخَل');
    });

    test('المجهول بعد المعروف وأبجدياً بينه', () {
      final out = orderedAbilityRoles(['ZED', 'SHERIFF', 'ALPHA']);
      expect(out, ['SHERIFF', 'ALPHA', 'ZED'],
          reason: 'ترتيبٌ ثابت — ترتيب Map غير مضمون فتقفز الصفوف بين فتحتين');
    });

    test('لا تكرار حتى لو تكرّر المُدخَل', () {
      final out = orderedAbilityRoles(['SHERIFF', 'SHERIFF', 'WITCH']);
      expect(out.length, 2);
    });
  });

  group('حالات الحدّ', () {
    test('مُدخَلٌ فارغ يعطي قائمةً فارغة', () {
      expect(orderedAbilityRoles(const []), isEmpty);
    });

    test('مجهولٌ فقط بلا معروف', () {
      expect(orderedAbilityRoles(['NEW_ROLE']), ['NEW_ROLE']);
    });
  });
}
