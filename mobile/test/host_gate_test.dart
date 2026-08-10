import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/home.dart';

// ══════════════════════════════════════════════════════
// 🔒 بوّابة الاستضافة عن بُعد — `players.can_host_remote`
// ══════════════════════════════════════════════════════
// الاستضافة **ليست لكلّ لاعب**: قائمة سماحٍ يديرها الأدمن من واجهة
// الليدر. الخادم يفرضها عند `room:create-remote` («غير مصرّح لك بإنشاء
// غرف عن بُعد»)، والتطبيق يخفي البطاقة احتراماً للمنطق نفسه — لا
// حراسةً له.
//
// 🔴 الفرق مهمّ: إخفاء البطاقة **ليس أماناً**. من عدّل العميل يرى الشاشة
//    لكنّ الخادم يردّه. الاختبار هنا يحرس **أن يُقرأ العلم صحيحاً**، لا
//    أن يحلّ محلّ فرض الخادم.

void main() {
  HomeProfile parse(Object? flag) => HomeProfile.fromJson({
        'player': {
          'name': 'أحمد',
          if (flag != null) 'canHostRemote': flag,
        },
      });

  group('🔒 قراءة صلاحية الاستضافة', () {
    test('العلم المرفوع يُقرأ صحيحاً', () {
      expect(parse(true).canHostRemote, isTrue);
    });

    test('🔴 والغياب يعني «لا» لا «نعم»', () {
      // الافتراض المعكوس يعرض بابَ استضافةٍ لكلّ لاعبٍ في النادي
      expect(parse(null).canHostRemote, isFalse);
      expect(parse(false).canHostRemote, isFalse);
    });

    test('🔒 ولا شيء غير `true` الصريحة يفتحها', () {
      // الخادم يرسل boolean؛ أيّ قيمةٍ أخرى (نصّ «true» أو 1 أو خطأ
      // في التسلسل) لا تُعامَل موافقةً.
      for (final v in <Object>[1, 'true', 'yes', 'canHostRemote', 0]) {
        expect(parse(v).canHostRemote, isFalse, reason: '$v');
      }
    });

    test('وحمولةٌ بلا لاعبٍ إطلاقاً لا تُسقط الشاشة', () {
      final p = HomeProfile.fromJson(const {});
      expect(p.canHostRemote, isFalse);
      expect(p.name, 'لاعب');
    });
  });
}
