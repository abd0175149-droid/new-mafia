import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🔔 نماذج صندوق الإشعارات — الملفّ 19
// ══════════════════════════════════════════════════════

class NotificationRow {
  const NotificationRow({
    required this.id,
    this.title = '',
    this.body = '',
    this.type = '',
    this.data = const {},
    this.isRead = false,
    this.createdAt,
  });

  final int id;
  final String title, body, type;

  /// قد تصل فارغة أو null — تُعامَل خريطةً فارغة دائماً.
  final Map<String, dynamic> data;
  final bool isRead;
  final DateTime? createdAt;

  String? get imageUrl => _str('imageUrl');
  String? get videoUrl => _str('videoUrl');
  String? get richBody => _str('richBody');
  String? get url => _str('url');

  /// صفٌّ «غنيّ» يفتح مودال التفاصيل بدل التنقّل.
  bool get isRich => imageUrl != null || videoUrl != null;

  String? _str(String k) {
    final v = data[k];
    return (v is String && v.trim().isNotEmpty) ? v : null;
  }

  NotificationRow copyWith({bool? isRead}) => NotificationRow(
        id: id, title: title, body: body, type: type, data: data,
        isRead: isRead ?? this.isRead, createdAt: createdAt,
      );

  factory NotificationRow.fromJson(Map<String, dynamic> j) => NotificationRow(
        id: j['id'] is num ? (j['id'] as num).toInt() : 0,
        title: (j['title'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        type: (j['type'] ?? '').toString(),
        data: j['data'] is Map ? Map<String, dynamic>.from(j['data'] as Map) : const {},
        isRead: j['isRead'] == true,
        createdAt: j['createdAt'] == null
            ? null
            : DateTime.tryParse('${j['createdAt']}')?.toLocal(),
      );
}

// ══════════════════════════════════════════════════════
// 🎨 خرائط الأنواع — §4.11 (منقولة حرفياً)
// ══════════════════════════════════════════════════════

const _typeIcons = <String, String>{
  'new_activity': '📅',
  'game_ended': '🎮',
  'custom': '📢',
  'reminder': '⏰',
  'friend_booked': '👥',
  'level_up': '🏆',
  'booking_confirmed': '✅',
  'comeback': '🔥',
  'feedback_survey': '📋',
  'order_status': '🍽️',
  'rank_bonus': '🎁',
};

const _typeColors = <String, Color>{
  'new_activity': Color(0xFFF59E0B),
  'game_ended': Color(0xFFEF4444),
  'custom': Color(0xFF8B5CF6),
  'reminder': Color(0xFF3B82F6),
  'friend_booked': Color(0xFF22C55E),
  'level_up': Color(0xFFF59E0B),
  'booking_confirmed': Color(0xFF22C55E),
  'comeback': Color(0xFFEF4444),
  'feedback_survey': Color(0xFF8B5CF6),
  'order_status': Color(0xFF10B981),
  'rank_bonus': Color(0xFFF59E0B),
};

String notificationIcon(String type) => _typeIcons[type] ?? '🔔';
Color notificationColor(String type) => _typeColors[type] ?? const Color(0xFF666666);

// ══════════════════════════════════════════════════════
// 🧭 وجهة الإشعار
// ══════════════════════════════════════════════════════
// 🔴 نسختان في الويب: واحدة في جرس الواجهة وأخرى أشمل في service worker.
//    الأضيق تعيد `null` لأنواع يعرفها الـSW — فالإشعار نفسه ينقل اللاعب
//    حين يصله من النظام ولا ينقله حين يفتحه من الصندوق. تناقضٌ لا ميزة.
//    نعتمد الأشمل. أثرها الظاهر: سهم «◀» يظهر على صفوفٍ أكثر.

String? resolveNotificationUrl(String type, Map<String, dynamic> data) {
  String? s(String k) {
    final v = data[k];
    return (v is String && v.trim().isNotEmpty) ? v : null;
  }

  final explicit = s('url');
  if (explicit != null) return explicit;

  switch (type) {
    case 'activity_started':
      final code = s('roomCode');
      return code != null ? '/player/join?code=$code' : '/player/home';

    case 'room_invite':
      final code = s('roomCode');
      if (code == null) return '/player/home';
      final by = s('inviterName');
      return '/player/join?code=$code&invite=1'
          '${by != null ? '&by=${Uri.encodeComponent(by)}' : ''}';

    case 'new_activity':
      final id = data['activityId'];
      return id == null ? '/player/games' : '/player/games?activityId=$id';

    case 'feedback_survey':
      final sid = data['sessionId'];
      return sid == null ? '/player/feedback' : '/player/feedback?sessionId=$sid';

    case 'order_status':
      return '/player/order';

    case 'rank_bonus':
      return '/player/rank';

    case 'booking_confirmed':
    case 'game_ended':
    default:
      return '/player/home';
  }
}

bool isExternalUrl(String url) => RegExp(r'^https?://', caseSensitive: false).hasMatch(url);

// ══════════════════════════════════════════════════════
// ⏱️ الوقت النسبيّ
// ══════════════════════════════════════════════════════

String formatTimeAgo(DateTime? t) {
  if (t == null) return '';
  final diff = DateTime.now().difference(t);
  if (diff.isNegative) return 'الآن';

  final m = diff.inMinutes;
  if (m < 1) return 'الآن';
  if (m < 60) return 'قبل $m دقيقة';

  final h = diff.inHours;
  if (h < 24) return 'قبل $h ساعة';

  final d = diff.inDays;
  if (d < 30) return 'قبل $d يوم';

  final months = d ~/ 30;
  if (months < 12) return 'قبل $months شهر';
  return 'قبل ${d ~/ 365} سنة';
}
