import 'dart:async';

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

  /// 🔴 تخطٍّ للجلسة الحاليّة — في الذاكرة عمداً لا في التخزين.
  ///
  /// قرار R1 (91 §6.7) يمنح مستخدم iOS مخرجاً من البوّابة الحاجبة لأن
  /// Apple ترفض اشتراط الإشعارات (Guideline 4.5.4). لكنّ زرّ «لاحقاً» كان
  /// يستدعي `evaluate` وحدها، وهي تعيد قراءة الإذن الذي لم يتغيّر — فتعود
  /// البوّابة ويبقى المستخدم محبوساً رغم زرٍّ يعده بالدخول.
  ///
  /// الحفظ في الذاكرة يجعل التخطّي يدوم للجلسة ويعود السؤال في الإقلاع
  /// التالي: إزعاجٌ خفيفٌ مقابل ألّا يُحبَس المستخدم — وهو نصّ R1 حرفياً.
  /// وحفظه في التخزين كان سيُسكت البوّابة إلى الأبد بضغطةٍ واحدة.
  bool _gateSkipped = false;

  /// البوّابة تُعرض فوق المحتوى ولا تكون مساراً (§6.2) — فحالتها هنا
  /// لا في الراوتر.
  bool get gatePassed =>
      _permission == PushPermission.granted ||
      _permission == PushPermission.unsupported ||
      _gateSkipped;

  /// يستدعيه زرّ «لاحقاً» على iOS. يُعيد التقييم بعده كي يلتقط إذناً
  /// مُنح في الأثناء (المستخدم قد يعود من الإعدادات ثمّ يضغط «لاحقاً»).
  Future<void> skipGate() async {
    _gateSkipped = true;
    notifyListeners();
    await evaluate();
  }

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

    // 🔴 يربط التوكن بالحساب الحاليّ عند كلّ جلسةٍ مصادَقة. بدونه يبقى
    //    مربوطاً بالحساب السابق على الجهاز نفسه — انظر التعليق في
    //    `registerIfAlreadyGranted`. لا يُنتظر: الإقلاع لا يعلّق عليه.
    if (p == PushPermission.granted) {
      unawaited(PushService.instance.registerIfAlreadyGranted());
    }
  }

  /// بعد الخروج: الجلسة أوّلاً، والوجهة المعلّقة تُلغى — وجهةٌ محفوظة
  /// لحسابٍ خرج ستنفّذ في حساب من يدخل بعده.
  void onLoggedOut() {
    _session = SessionState.unauthenticated;
    _pending = null;
    // 🔴 التخطّي يخصّ من ضغطه: حسابٌ يدخل بعده يستحقّ أن يُسأل.
    _gateSkipped = false;
    notifyListeners();
  }
}
