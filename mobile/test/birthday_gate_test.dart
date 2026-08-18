import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/player.dart';

// ══════════════════════════════════════════════════════
// 🎂 BDAY-1 — بوّابة تاريخ الميلاد
// ══════════════════════════════════════════════════════
// 🔴 لاعب التطبيق **لم يكن يُسأل عن ميلاده إطلاقاً** بينما الويب يحجبه
//    بمودالٍ إلزاميّ — فمن سجّل من التطبيق لا يستلم عيديّة النادي أبداً،
//    رغم أن شاشة المحفظة نفسها تعرض بند «🎂 عيد ميلادك — عيديّة من النادي».
//
// 🔴 والخطر المقابل: بوّابةٌ تظهر لمن أجاب أصلاً — حجبٌ متكرّر بلا سبب.

PlayerData p({String? dob}) =>
    PlayerData(id: 1, name: 'لاعب', phone: '0790000000', dob: dob);

void main() {
  group('متى تُعرض البوّابة', () {
    test('لا تاريخ ⇒ تُعرض', () {
      expect(p().needsBirthday, isTrue);
    });

    test('تاريخٌ موجود ⇒ لا تُعرض', () {
      expect(p(dob: '1998-04-12').needsBirthday, isFalse);
    });

    test('نصٌّ فارغ يُعامَل كغياب', () {
      // 🔴 الخادم قد يعيد '' لحقلٍ لم يُملأ؛ قبولُه يعني بوّابةً لا تظهر
      //    أبداً للاعبٍ بلا تاريخ — وهي بالضبط العلّة التي نُصلحها.
      expect(p(dob: '').needsBirthday, isTrue);
    });

    test('فراغاتٌ فقط تُعامَل كغياب', () {
      expect(p(dob: '   ').needsBirthday, isTrue);
    });
  });

  group('بقاء الحقل عبر التخزين', () {
    test('يُكتب ويُقرأ في JSON — الجلسة تُحفظ محلّياً', () {
      final before = p(dob: '1998-04-12');
      final after = PlayerData.fromJson(before.toJson());
      expect(after.dob, '1998-04-12',
          reason: 'ضياعه في التخزين يعني بوّابةً تعود مع كلّ إقلاع');
      expect(after.needsBirthday, isFalse);
    });

    test('غيابه من ردّ الخادم لا يُسقط التحليل', () {
      // النموذج لا يرمي على حقلٍ ناقص — عقدٌ قائمٌ في الملفّ نفسه.
      final d = PlayerData.fromJson({'id': 5, 'name': 'س', 'phone': '079'});
      expect(d.dob, isNull);
      expect(d.needsBirthday, isTrue);
    });
  });
}
