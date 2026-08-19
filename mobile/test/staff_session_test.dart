import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/routing/destination.dart';
import 'package:mafia_club/models/player.dart';

// ══════════════════════════════════════════════════════
// 🧑‍💼 AUTH-2 وSTAFF-1 — جلسة الموظّف ولوحته
// ══════════════════════════════════════════════════════
// 🔴 كان `/me` يعيد `staffInfo` و`staffToken` **ويُهمَلان كلّياً**، فالموظّف
//    على iOS يعود للمتصفّح لكلّ مهمّةٍ إداريّة.
//
// 🔴 والمحروس هنا **الصلاحيّات** لا الشكل: صفٌّ يظهر لمن لا يملكه يعني
//    زرّاً يقود إلى شاشةٍ ترفضه — أو أسوأ، تقبله.

StaffInfo s(String role) =>
    StaffInfo(staffId: 1, username: 'u', displayName: 'فلان', role: role);

void main() {
  group('من يملك غرفة العمليّات', () {
    for (final r in ['admin', 'manager', 'leader']) {
      test('$r ⇒ نعم', () => expect(s(r).canLead, isTrue));
    }
    for (final r in ['staff', 'cashier', '', 'LEADER']) {
      test('«$r» ⇒ لا', () {
        expect(s(r).canLead, isFalse,
            reason: 'المطابقة حسّاسةٌ لحالة الأحرف كما الويب — لا تخمين');
      });
    }
  });

  group('من يملك لوحة الإدارة', () {
    test('admin وmanager فقط', () {
      expect(s('admin').canAdmin, isTrue);
      expect(s('manager').canAdmin, isTrue);
      expect(s('leader').canAdmin, isFalse,
          reason: 'القائد يشغّل الألعاب ولا يرى المالية');
    });
  });

  group('وجهات اللوحة تُفتح في المتصفّح', () {
    // 🔴 هذه واجهاتُ ويبٍ لا شاشات تطبيق. تصنيفٌ داخليّ يُسقطها في
    //    التوجيه الصامت فتصير أزراراً ميّتة.
    for (final p in ['/admin', '/leader', '/display']) {
      test(p, () {
        final d = Destination.classify(p);
        expect(d.kind, DestinationKind.ourWebOnly);
        expect(d.value, startsWith('https://'),
            reason: 'رابطٌ مطلق على مضيفنا — لا مسارٌ نسبيّ');
      });
    }
  });

  group('التحليل المتسامح', () {
    test('حقولٌ ناقصة لا تُسقط الإقلاع', () {
      final x = StaffInfo.fromJson({'role': 'leader'});
      expect(x.staffId, 0);
      expect(x.displayName, '');
      expect(x.canLead, isTrue);
    });

    test('الدور يُعرَّب', () {
      expect(s('admin').roleAr, 'مدير');
      expect(s('leader').roleAr, 'قائد');
      expect(s('anything').roleAr, 'موظّف');
    });

    test('يبقى عبر التخزين', () {
      final before = s('manager');
      final after = StaffInfo.fromJson(before.toJson());
      expect(after.role, 'manager');
      expect(after.canAdmin, isTrue);
    });
  });
}
