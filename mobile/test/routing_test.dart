import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/routing/destination.dart';
import 'package:mafia_club/models/notification.dart';

// ══════════════════════════════════════════════════════
// 🧪 تصنيف الوجهة — الملفّ 08
// ══════════════════════════════════════════════════════
// وجهة الإشعار يكتبها موظّف في لوحة الإدارة. هذا المصنّف هو الفاصل بين
// «رابط في إشعار» و«فتحٌ داخل التطبيق» — وأخطاؤه أمنية لا تجميلية.

void main() {
  DestinationKind kind(String? s) => Destination.classify(s).kind;
  String value(String? s) => Destination.classify(s).value;

  group('🔴 حماية إعادة التوجيه المفتوح', () {
    test('مضيف غريب خارجيّ مهما شابه مسارُه مساراتنا', () {
      expect(kind('https://evil.com/player/home'), DestinationKind.external);
      expect(kind('https://evil.com/join/ABCD'), DestinationKind.external);
      // ومضيفٌ يبدأ باسمنا وليس هو
      expect(kind('https://club-mafia.grade.sbs.evil.com/player/home'),
          DestinationKind.external);
    });

    test('مضيفنا يُجرَّد إلى مسارٍ داخليّ', () {
      expect(kind('https://club-mafia.grade.sbs/player/home'), DestinationKind.internal);
      expect(value('https://club-mafia.grade.sbs/player/games?activityId=7'),
          '/player/games?activityId=7');
    });

    test('مخطّط غير http يذهب للنظام لا للراوتر', () {
      expect(kind('tel:+962790000000'), DestinationKind.external);
      expect(kind('whatsapp://send?text=hi'), DestinationKind.external);
    });
  });

  group('المسارات النسبية', () {
    test('ما يملكه التطبيق داخليّ', () {
      expect(kind('/player/home'), DestinationKind.internal);
      expect(kind('/player/join?code=AB12&invite=1'), DestinationKind.internal);
      expect(kind('/join/AB12'), DestinationKind.internal);
    });

    test('واجهاتنا الأخرى تُفتح في المتصفّح لا داخل التطبيق', () {
      // إشعار `new_order` يصل للموظّفين ووجهته لوحة المبيعات
      expect(kind('/venue/orders'), DestinationKind.ourWebOnly);
      expect(value('/venue/orders'), 'https://club-mafia.grade.sbs/venue/orders');
      expect(kind('/admin/reports'), DestinationKind.ourWebOnly);
      expect(kind('/leader'), DestinationKind.ourWebOnly);
    });

    test('الفراغ والنصّ غير المسار لا وجهة لهما', () {
      expect(kind(null), DestinationKind.none);
      expect(kind(''), DestinationKind.none);
      expect(kind('   '), DestinationKind.none);
      expect(kind('كلام'), DestinationKind.none);
    });
  });

  group('وجهات الإشعارات تمرّ بالمصنّف سليمة', () {
    test('كل نوع يُنتج مساراً داخلياً صالحاً', () {
      for (final t in [
        'activity_started', 'room_invite', 'new_activity', 'booking_confirmed',
        'game_ended', 'feedback_survey', 'order_status', 'custom', 'reminder',
        'level_up', 'نوع_لم_يوجد_بعد',
      ]) {
        final u = resolveNotificationUrl(t, const {});
        expect(u, isNotNull, reason: '$t بلا وجهة');
        expect(kind(u), DestinationKind.internal, reason: '$t ليس داخلياً');
      }
    });

    test('data.url خارجيّ يبقى خارجياً بعد الحلّ', () {
      final u = resolveNotificationUrl('custom', {'url': 'https://instagram.com/x'});
      expect(kind(u), DestinationKind.external);
    });

    test('data.url إلى واجهة موظّف يُفتح خارجياً', () {
      final u = resolveNotificationUrl('new_order', {'url': '/venue/orders'});
      expect(kind(u), DestinationKind.ourWebOnly);
    });
  });

  test('المضيف المستعمل في المصنّف هو مضيف الإنتاج', () {
    expect(appHost, 'club-mafia.grade.sbs');
  });
}
