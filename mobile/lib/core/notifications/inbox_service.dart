import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../models/notification.dart';
import '../api/api_client.dart';
import '../storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 🔔 صندوق الإشعارات — طبقة البيانات (§6 في الملفّ 19)
// ══════════════════════════════════════════════════════
// **نسخة واحدة** يستمع إليها الجرس والصندوق معاً. الويب يحمل حارساً
// ثلاثياً (`autoRegisterInFlight`/`autoRegisteredForToken`) لأن الهوك
// يُركَّب في أماكن متعدّدة فيتسابق على تسجيل التوكن؛ بنسخةٍ واحدة لا
// معنى للحارس — حُذف.
//
// صفر سوكِت: التحديث بجلبٍ دوريّ كل دقيقة، وعند رسالة FCM في المقدّمة،
// وعند عودة التطبيق من الخلفية.

class InboxService extends ChangeNotifier with WidgetsBindingObserver {
  InboxService._();
  static final InboxService instance = InboxService._();

  List<NotificationRow> _items = const [];
  Timer? _poll;
  bool _started = false;

  List<NotificationRow> get items => _items;

  /// يُحسب محلياً بعد كل جلب — لا نداء منفصل (مطابق للويب).
  int get unreadCount => _items.where((n) => !n.isRead).length;

  String get badgeText => unreadCount > 99 ? '99+' : '$unreadCount';

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    unawaited(refresh());
    _poll = Timer.periodic(const Duration(seconds: 60), (_) => refresh());
  }

  void stop() {
    _poll?.cancel();
    _poll = null;
    if (_started) WidgetsBinding.instance.removeObserver(this);
    _started = false;
    _items = const [];
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // مرآة `visibilitychange` في الويب — العودة من إشعارٍ نُقر عليه
    // يجب أن تُظهره مقروءاً
    if (state == AppLifecycleState.resumed) unawaited(refresh());
  }

  Future<void> refresh() async {
    if (!SessionStore.instance.isLoggedIn) return;
    try {
      final r = await ApiClient.instance.get('/api/player-notifications');
      if (r is! Map || r['success'] != true) return; // 503 وغيره: نُبقي القائمة
      _items = (r['notifications'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => NotificationRow.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      notifyListeners();
    } catch (_) {
      // الجلب الدوريّ لا يصرخ — القائمة الحالية تبقى
    }
  }

  /// تفاؤليّ: الصفّ يصير مقروءاً فوراً، والطلب يلحق.
  Future<void> markAsRead(int id) async {
    final before = _items;
    _items = _items.map((n) => n.id == id ? n.copyWith(isRead: true) : n).toList();
    notifyListeners();
    try {
      await ApiClient.instance.put('/api/player-notifications/$id/read');
    } catch (_) {
      // الويب يبتلع الفشل ويترك الصفّ مقروءاً كذباً. نتراجع بهدوء:
      // شارةٌ ترجع رقماً أصدق من صفٍّ يدّعي أنه قُرئ.
      _items = before;
      notifyListeners();
    }
  }

  Future<void> markAllAsRead() async {
    final before = _items;
    _items = _items.map((n) => n.copyWith(isRead: true)).toList();
    notifyListeners();
    try {
      await ApiClient.instance.put('/api/player-notifications/read-all');
    } catch (_) {
      _items = before;
      notifyListeners();
    }
  }
}
