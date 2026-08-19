import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/routing/destination.dart';

// ══════════════════════════════════════════════════════
// 📣 SOCIAL-1 — قنوات النادي
// ══════════════════════════════════════════════════════
// 🔴 لم يكن في التطبيق **أيّ طريقٍ لمراسلة النادي**: من واجه مشكلةً في
//    حجزٍ أو رصيد لا يجد إلى من يتوجّه.
//
// 🔴 والمحروس هنا ليس وجود الأزرار بل **أنها تفتح فعلاً**: رابطٌ يصنّفه
//    `Destination.classify` داخلياً يسقط في الراوتر ثمّ في التوجيه الصامت
//    فيبدو الزرّ ميّتاً — وهو عطلٌ لا يظهر إلّا بالضغط على جهازٍ حقيقيّ.

const _links = {
  'إنستغرام': 'https://www.instagram.com/mafia_club_jo/',
  'محادثة إنستغرام': 'https://ig.me/m/mafia_club_jo',
  'سناب شات': 'https://www.snapchat.com/add/mafia_club26',
  'مجموعة واتساب': 'https://chat.whatsapp.com/Bz1ipm8YxR31u5OEUOxeJZ',
};

void main() {
  group('كلّ قناةٍ تُفتح خارجياً', () {
    for (final e in _links.entries) {
      test(e.key, () {
        final d = Destination.classify(e.value);
        expect(d.kind, DestinationKind.external,
            reason: 'تصنيفٌ داخليّ يعني زرّاً يبدو حيّاً ولا يفعل شيئاً');
        expect(d.value, e.value, reason: 'الرابط يُمرَّر كما هو بلا تشويه');
      });
    }
  });

  group('حرّاس الانحدار', () {
    test('رابطٌ فارغ لا يُصنَّف وجهة', () {
      expect(Destination.classify('').kind, DestinationKind.none);
    });

    test('مضيفنا يبقى داخلياً — الروابط الاجتماعيّة لا تُغيّر القاعدة', () {
      final d = Destination.classify('https://club-mafia.grade.sbs/player/home');
      expect(d.kind, DestinationKind.internal,
          reason: 'خلطُ التصنيف يفتح شاشات التطبيق في المتصفّح');
    });
  });
}
