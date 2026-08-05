import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/host/host_controller.dart';

// ══════════════════════════════════════════════════════
// 🌐 كونسول المضيف — عقد الإنشاء وroster اللوبي (الملفّ 30)
// ══════════════════════════════════════════════════════
// الشريحة كلّها Socket.IO بإشعارٍ راجع، فلا شيء منها يظهر في اختبار ودجت.
// ما يُختبَر هنا هو ما ينكسر صامتاً: شكلُ الحمولة على السلك ومفاتيحها،
// وقراءةُ roster — وكلاهما عقدٌ مع خادمٍ لا نملك تغييره.

void main() {
  group('حمولة room:create-remote', () {
    test('تحمل المفاتيح العشرة التي يقرؤها الخادم — لا أقلّ', () {
      final p = const HostRoomConfig().toCreatePayload();
      // الأسماء حرفيّة من lobby.socket.ts:3349 — أيّ خطأ إملائيّ هنا
      // يُهمله الخادم صامتاً فتضيع الإعدادات بلا رسالة خطأ.
      expect(
        p.keys.toSet(),
        {
          'gameName',
          'maxPlayers',
          'maxJustifications',
          'maxPenalties',
          'penaltyScope',
          'autoNightTime',
          'gameTimerMinutes',
          'bombEnabled',
          'mafiaChatEnabled',
          'allowPlayerInvites',
        },
      );
    });

    test('القيم الافتراضية مطابقة للمواصفة §4.1', () {
      final p = const HostRoomConfig().toCreatePayload();
      expect(p['gameName'], 'غرفة عن بُعد');
      expect(p['maxPlayers'], 12);
      expect(p['autoNightTime'], 15);
      expect(p['gameTimerMinutes'], 0);
      expect(p['maxPenalties'], 3);
      expect(p['penaltyScope'], 'room');
      expect(p['bombEnabled'], true);
      expect(p['mafiaChatEnabled'], false);
      expect(p['allowPlayerInvites'], false);
      expect(p['maxJustifications'], 2);
    });

    test('اسمٌ فارغ أو مسافات يعود إلى الافتراضيّ لا يُرسَل فارغاً', () {
      expect(const HostRoomConfig(gameName: '   ').toCreatePayload()['gameName'],
          'غرفة عن بُعد');
      expect(const HostRoomConfig(gameName: '  ليلة  ').toCreatePayload()['gameName'],
          'ليلة');
    });
  });

  group('قراءة roster', () {
    test('غياب isConnected يعني متّصلاً لا منقطعاً', () {
      // 🔴 الخادم يُغفل الحقل للاعبٍ متّصل. لو قُرئت بـ`== true` لظهر
      //    كلّ اللاعبين رماديّي النقطة — عطلٌ بصريّ لا يرميه أحد.
      final p = HostRosterPlayer.fromJson({'physicalId': 3, 'name': 'سالم'});
      expect(p.isConnected, isTrue);

      expect(
        HostRosterPlayer.fromJson(
            {'physicalId': 3, 'name': 'سالم', 'isConnected': false}).isConnected,
        isFalse,
      );
    });

    test('حقولٌ ناقصة لا تُسقط الصفّ', () {
      final p = HostRosterPlayer.fromJson({});
      expect(p.physicalId, 0);
      expect(p.name, '');
      expect(p.penalties, 0);
      expect(p.seatHeld, isFalse);
    });
  });

  group('حدود الإعدادات', () {
    test('copyWith يحفظ ما لم يُمرَّر', () {
      const base = HostRoomConfig(maxPlayers: 20, bombEnabled: false);
      final next = base.copyWith(autoNightTime: 40);
      expect(next.maxPlayers, 20);
      expect(next.bombEnabled, isFalse);
      expect(next.autoNightTime, 40);
    });
  });
}
