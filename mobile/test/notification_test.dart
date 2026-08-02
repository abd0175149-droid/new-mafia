import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/notification.dart';

// ══════════════════════════════════════════════════════
// 🧪 صندوق الإشعارات — الملفّ 19
// ══════════════════════════════════════════════════════

void main() {
  NotificationRow n(Map<String, dynamic> j) => NotificationRow.fromJson(j);

  group('الصفّ', () {
    test('data غائبة أو null تُعامَل خريطةً فارغة', () {
      expect(n({}).data, isEmpty);
      expect(n({'data': null}).data, isEmpty);
      expect(n({'data': 'nonsense'}).data, isEmpty);
      expect(n({}).isRich, isFalse);
      expect(n({}).url, isNull);
    });

    test('السلاسل الفارغة تُعامَل غياباً — لا صورة بمسارٍ فارغ', () {
      final x = n({'data': {'imageUrl': '   ', 'url': ''}});
      expect(x.imageUrl, isNull);
      expect(x.url, isNull);
      expect(x.isRich, isFalse);
    });

    test('الفيديو وحده يكفي لجعل الصفّ غنيّاً', () {
      expect(n({'data': {'videoUrl': 'https://x/v.mp4'}}).isRich, isTrue);
      expect(n({'data': {'imageUrl': '/uploads/a.jpg'}}).isRich, isTrue);
    });
  });

  group('خرائط الأنواع', () {
    test('نوع معروف ونوع مجهول', () {
      expect(notificationIcon('level_up'), '🏆');
      expect(notificationColor('order_status'), const Color(0xFF10B981));
      expect(notificationIcon('من_المستقبل'), '🔔');
      expect(notificationColor('من_المستقبل'), const Color(0xFF666666));
    });
  });

  group('الوجهة', () {
    test('data.url يسبق كل شيء', () {
      expect(resolveNotificationUrl('game_ended', {'url': '/player/x'}), '/player/x');
    });

    test('غرفة نشطة بلا كود تذهب للرئيسية لا إلى العدم', () {
      expect(resolveNotificationUrl('activity_started', {'roomCode': 'AB12'}),
          '/player/join?code=AB12');
      expect(resolveNotificationUrl('activity_started', {}), '/player/home');
    });

    test('دعوة الغرفة تُرمّز اسم الداعي', () {
      final u = resolveNotificationUrl(
          'room_invite', {'roomCode': 'XY9', 'inviterName': 'أبو لين'});
      expect(u, startsWith('/player/join?code=XY9&invite=1&by='));
      expect(u, isNot(contains(' ')));
    });

    test('🔴 نوع مجهول يذهب للرئيسية لا null — الويب كان يُسقطه', () {
      expect(resolveNotificationUrl('نوع_جديد_تماماً', {}), '/player/home');
    });

    test('الخارجيّ يُميَّز عن الداخليّ', () {
      expect(isExternalUrl('https://instagram.com/x'), isTrue);
      expect(isExternalUrl('HTTP://x.com'), isTrue);
      expect(isExternalUrl('/player/home'), isFalse);
    });
  });

  group('الوقت النسبيّ', () {
    final now = DateTime.now();
    test('يقرأ بالعربية بلا أرقام سالبة', () {
      expect(formatTimeAgo(null), '');
      expect(formatTimeAgo(now), 'الآن');
      expect(formatTimeAgo(now.subtract(const Duration(minutes: 5))), 'قبل 5 دقيقة');
      expect(formatTimeAgo(now.subtract(const Duration(hours: 3))), 'قبل 3 ساعة');
      expect(formatTimeAgo(now.subtract(const Duration(days: 4))), 'قبل 4 يوم');
      expect(formatTimeAgo(now.subtract(const Duration(days: 70))), 'قبل 2 شهر');
    });

    test('ساعة الخادم المتقدّمة لا تُنتج «قبل -3 دقيقة»', () {
      expect(formatTimeAgo(now.add(const Duration(minutes: 3))), 'الآن');
    });
  });
}
