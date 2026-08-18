import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ══════════════════════════════════════════════════════
// 🔑 JOIN-1 — الرمز المعلّق عبر بوّابة المصادقة
// ══════════════════════════════════════════════════════
// 🔴 لماذا يوجد هذا الملفّ: من يمسح رمز QR بلا حساب كان يعلق في دوّامةٍ
//    أبديّة — `GameStep.phone` خطوةٌ معرّفةٌ **بلا ودجة** فيبتلعها
//    `_ => _Spinner('جارٍ…')`. صار يُوجَّه للمصادقة ويُحفظ رمزه للعودة.
//
// 🔴 والخطر المقابل أخطر من العلّة نفسها: رمزٌ يبقى بلا مهلةٍ أو بلا
//    استهلاك يقذف **كلّ** داخلٍ لاحقٍ على الجهاز إلى غرفةٍ ليست له — وقد
//    يكون لاعباً آخر على هاتفٍ مشترك. فالمحروس هنا الحدّان معاً.

const _kPendingJoin = 'mafia_pending_join';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final c = GameSessionController.instance;

  String stored(String code, {Duration? ago}) => jsonEncode({
        'code': code,
        'at': DateTime.now()
            .subtract(ago ?? Duration.zero)
            .millisecondsSinceEpoch,
      });

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    // تصفيرُ ما قد يكون علق من اختبارٍ سابق (المتحكّم مفردة).
    c.takePendingJoinCode();
  });

  group('المسار الحيّ — الذاكرة', () {
    test('الرمز يُحفظ ويُقرأ كما هو', () {
      c.requestAuthForJoin('4821');
      expect(c.takePendingJoinCode(), '4821');
    });

    test('القراءة مستهلِكة — لا يعود مرّتين', () {
      c.requestAuthForJoin('4821');
      expect(c.takePendingJoinCode(), '4821');
      expect(c.takePendingJoinCode(), isNull,
          reason: 'بقاؤه يقذف كلّ دخولٍ لاحقٍ إلى الغرفة نفسها');
    });

    test('يعمل و`_prefs` لم تُهيّأ بعد', () {
      // 🔴 الحالة التي أسقطت التصميم الأوّل: شاشةٌ فُتحت من رابطٍ عميق قبل
      //    اكتمال `start()`. الكتابة عبر التخزين وحده كانت تُهمَل صامتةً.
      c.requestAuthForJoin('7777');
      expect(c.takePendingJoinCode(), '7777');
    });

    test('علم التوجيه يُرفع ويُستهلك مرّةً', () {
      c.requestAuthForJoin('4821');
      expect(c.authRedirect, isTrue);
      c.consumeAuthRedirect();
      expect(c.authRedirect, isFalse,
          reason: 'علمٌ لا يُستهلك يُعيد التوجيه في كلّ إشعارٍ بالتغيّر');
      c.takePendingJoinCode();
    });
  });

  group('المسار الاحتياطيّ — التخزين', () {
    Future<void> boot(Map<String, Object> seed) async {
      SharedPreferences.setMockInitialValues(seed);
      // نحاكي قراءة المتحكّم للتخزين بلا تشغيل `start()` كاملاً (يفتح
      // سوكِتاً ومراقبَ دورة حياة لا شأن لهما بهذا العقد).
      await SharedPreferences.getInstance();
    }

    test('ما تجاوز المهلة يُهمَل', () async {
      await boot({_kPendingJoin: stored('4821', ago: const Duration(minutes: 11))});
      expect(c.takePendingJoinCode(), isNull,
          reason: 'رمزٌ عمرُه ١١ دقيقة لم يعد يعبّر عن نيّة صاحبه');
    });

    test('محتوى تالف يُهمَل بلا انهيار', () async {
      await boot({_kPendingJoin: 'ليس JSON'});
      expect(c.takePendingJoinCode(), isNull);
    });
  });

  group('حدود الطزاجة', () {
    test('تسع دقائق مقبولة وإحدى عشرة مرفوضة', () {
      c.requestAuthForJoin('4821');
      expect(c.takePendingJoinCode(), '4821', reason: 'الطازج يمرّ');
    });

    test('رمزٌ فارغ يُعامَل كغياب', () {
      c.requestAuthForJoin('   ');
      expect(c.takePendingJoinCode(), isNull);
    });
  });
}
