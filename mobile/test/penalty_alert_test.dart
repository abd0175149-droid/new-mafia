import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// ⚖️ PEN-1 — تنبيه العقوبات
// ══════════════════════════════════════════════════════
// 🔴 كان الحدثان `game:penalty-recorded` و`player:penalty-ejected` غير
//    مستمَعٍ لهما إطلاقاً: يرى اللاعب نقاطاً سالبة تتحدّث في الروستر خلال
//    دورة استطلاع، **ويكتشف موته بالعقوبات بلا سببٍ معروض**.
//
// 🔴 والحدّ كان مثبَّتاً على 3 في البانر بينما الويب يقرأه من إعدادات
//    الخادم — فبانرٌ يكذب على اللاعب حين يغيّره الأدمن، وهو يقرّر سلوكه
//    بناءً عليه.

void main() {
  group('المتبقّي قبل الإقصاء', () {
    test('يُحسب من الحدّ القادم من الخادم لا من ثابت', () {
      const a = PenaltyAlert(
          penalties: 2, max: 5, message: 'مخالفة', ejected: false);
      expect(a.remaining, 3, reason: 'حدُّ الخادم 5 لا الثابت 3');
    });

    test('لا يهبط تحت الصفر عند تجاوز الحدّ', () {
      // الخادم قد يسجّل مخالفةً تتجاوز الحدّ قبل أن يصل حدث الإقصاء.
      const a = PenaltyAlert(
          penalties: 7, max: 3, message: 'مخالفة', ejected: true);
      expect(a.remaining, 0, reason: 'رقمٌ سالب على الشاشة عيبٌ ظاهر');
    });

    test('المخالفة الأخيرة تعطي صفراً — نصّها يتغيّر', () {
      const a = PenaltyAlert(
          penalties: 3, max: 3, message: 'مخالفة', ejected: false);
      expect(a.remaining, 0);
    });

    test('واحدةٌ متبقّية — عتبة تغيّر الرسالة', () {
      const a = PenaltyAlert(
          penalties: 2, max: 3, message: 'مخالفة', ejected: false);
      expect(a.remaining, 1,
          reason: '«مخالفةٌ أخرى وتخرج» يغيّر سلوك اللاعب، والرقم وحده لا يفعل');
    });
  });

  group('التمييز بين المخالفة والإقصاء', () {
    test('العلم ejected يفصل الحالتين', () {
      const warn = PenaltyAlert(
          penalties: 1, max: 3, message: 'تأخّر', ejected: false);
      const out = PenaltyAlert(
          penalties: 3, max: 3, message: 'تجاوز الحدّ', ejected: true);
      expect(warn.ejected, isFalse);
      expect(out.ejected, isTrue,
          reason: 'المودال يقلب لونه ونصّه وأيقونته على هذا العلم');
    });

    test('الرسالة تُحفظ كما أرسلها الخادم', () {
      const a = PenaltyAlert(
          penalties: 1, max: 3, message: 'استعمال الهاتف', ejected: false);
      expect(a.message, 'استعمال الهاتف',
          reason: 'سببُ العقوبة هو ما يمنع تكرارها — لا يُستبدل بنصٍّ عامّ');
    });
  });
}
