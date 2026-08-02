import 'package:flutter/foundation.dart';

import '../core/push/push_service.dart';
import '../core/storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 🧠 حالة التطبيق التي يقرأها الحارس — §6.1 في الملفّ 08
// ══════════════════════════════════════════════════════
// كل مدخلات القرار **متزامنة ورخيصة**: الحارس يعمل عند كل تنقّل، وقراءة
// غير متزامنة فيه تعني إعادة توجيهٍ يتأخّر إطاراً فيومض المستخدم على
// شاشةٍ ليست له.

enum SessionState { loading, unauthenticated, authenticated }

class AppState extends ChangeNotifier {
  AppState._();
  static final AppState instance = AppState._();

  SessionState _session = SessionState.loading;
  SessionState get session => _session;

  PushPermission _permission = PushPermission.prompt;
  PushPermission get permission => _permission;

  /// البوّابة تُعرض فوق المحتوى ولا تكون مساراً (§6.2) — فحالتها هنا
  /// لا في الراوتر.
  bool get gatePassed =>
      _permission == PushPermission.granted ||
      _permission == PushPermission.unsupported;

  // ══════════════════════════════════════════════════════
  // 📌 التنقّل المعلّق
  // ══════════════════════════════════════════════════════
  // إشعارٌ نُقر عليه قبل أن تُحسم الجلسة. يُحفظ في الذاكرة فقط:
  // `getInitialMessage` يغطّي الفتح البارد أصلاً، وسبب الكاش في الويب
  // (ضياع الرابط في PWA على iOS) لا وجود له هنا.
  String? _pending;
  String? get pending => _pending;

  /// الأخيرة تفوز — نقرتان قبل الحسم تعنيان الوجهة الأحدث.
  void setPending(String? route) {
    if (route == null || route.isEmpty) return;
    _pending = route;
    notifyListeners();
  }

  String? takePending() {
    final p = _pending;
    _pending = null;
    return p;
  }

  /// تُستدعى عند الإقلاع وبعد كل دخول/خروج/تغيّر إذن.
  Future<void> evaluate() async {
    if (!SessionStore.instance.isLoggedIn) {
      _session = SessionState.unauthenticated;
      notifyListeners();
      return;
    }
    _session = SessionState.authenticated;
    notifyListeners(); // لا ننتظر الإذن كي لا يعلق الحارس على شاشة تحميل

    final p = await PushService.instance.permission();
    if (p != _permission) {
      _permission = p;
      notifyListeners();
    }
  }

  /// بعد الخروج: الجلسة أوّلاً، والوجهة المعلّقة تُلغى — وجهةٌ محفوظة
  /// لحسابٍ خرج ستنفّذ في حساب من يدخل بعده.
  void onLoggedOut() {
    _session = SessionState.unauthenticated;
    _pending = null;
    notifyListeners();
  }
}
