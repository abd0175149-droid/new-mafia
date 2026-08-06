import 'package:app_badge_plus/app_badge_plus.dart';
import 'package:flutter/widgets.dart';

// ══════════════════════════════════════════════════════
// 🔢 تصفير شارة الأيقونة — 91 §12 و06 §6.5
// ══════════════════════════════════════════════════════
// الخادم يرسل `badge: 1` **ثابتة** مع كلّ إشعار (ليست عدّاداً) ولا يمسحها
// أحد — فالرقم يبقى على الأيقونة إلى الأبد ولو قرأ اللاعب كلّ شيء.
// المسح مسؤولية العميل: عند الإقلاع وعند كلّ عودة إلى المقدّمة.
//
// 🔴 لا مسح عند `paused`: القيمة تأتي من الخادم، ومسحُها عند المغادرة
//    يمحو إشعاراً وصل بعد لحظات من التصغير.
class BadgeService with WidgetsBindingObserver {
  BadgeService._();
  static final BadgeService instance = BadgeService._();

  bool _started = false;

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    clear();
  }

  void stop() {
    if (!_started) return;
    _started = false;
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) clear();
  }

  /// صامتةٌ عمداً: بعض مشغّلات أندرويد بلا دعم شارات ترمي، وليست الشارة
  /// سبباً كافياً لإسقاط إقلاعٍ أو استئناف.
  Future<void> clear() async {
    try {
      await AppBadgePlus.updateBadge(0);
    } catch (e) {
      debugPrint('⚠️ تعذّر تصفير الشارة: $e');
    }
  }
}
