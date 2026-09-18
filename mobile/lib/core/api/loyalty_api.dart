import 'package:flutter/foundation.dart';

import '../../models/loyalty.dart';
import '../storage/session_store.dart';
import 'api_client.dart';

// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء — النداءات والذاكرة
// ══════════════════════════════════════════════════════
// حمولة `/me` الأخيرة تُحفظ في الذاكرة للجلسة: اللافتة في الرئيسيّة
// وورقة تأكيد الحجز وشاشة البطاقة كلّها تقرأ النسخة نفسها، وتُعاد
// الجلبة عند فتح الشاشة وبعد اختيار مكافأة.
//
// 🔴 المفتاح الرئيسيّ: `enabled` تُعيد `false` عند التعطيل **وعند الفشل**
//    وقبل أوّل جلبة. فكلّ ودجت ولاء تسأل هذه الخاصّية وحدها ولا تفترض.
//
// `ChangeNotifier` لا Riverpod: التطبيق يعتمد المفردات (`AppState`،
// `InboxService`، `GameConfigService`) مع `AnimatedBuilder` في الودجات.

class LoyaltyApi extends ChangeNotifier {
  LoyaltyApi._();
  static final LoyaltyApi instance = LoyaltyApi._();

  LoyaltyMe? _me;
  Future<LoyaltyMe>? _inflight;

  /// آخر حمولة — `null` قبل أوّل جلبة أو بعد فشلها.
  LoyaltyMe? get me => _me;

  bool get enabled => _me?.enabled == true;

  /// جلبٌ طازج. الفشل يعني تعطيلاً ظاهرياً (لا شيء يُعرض) لا شاشة خطأ:
  /// الميزة تكميليّة، وإخفاؤها لانقطاعٍ لحظيّ أهون من خطأٍ يعلو الرئيسيّة.
  ///
  /// 🔴 نداءان متزامنان من شاشتين لا يعنيان جلبين: الطلب الجاري يُشارَك.
  Future<LoyaltyMe> refresh() {
    return _inflight ??= _fetch().whenComplete(() => _inflight = null);
  }

  Future<LoyaltyMe> _fetch() async {
    if (!SessionStore.instance.isLoggedIn) {
      _set(null);
      return LoyaltyMe.disabled;
    }
    try {
      final r = await ApiClient.instance.get('/api/loyalty/me');
      final me = r is Map
          ? LoyaltyMe.fromJson(Map<String, dynamic>.from(r))
          : LoyaltyMe.disabled;
      _set(me);
      return me;
    } catch (_) {
      _set(null);
      return LoyaltyMe.disabled;
    }
  }

  /// اختيار المكافأة — نهائيّ. يُعيد الحمولة الطازجة التي يرسلها الخادم
  /// مع الاستجابة فلا حاجة لجولةٍ ثانية. يرمي `ApiException` بالرسالة
  /// العربيّة كما هي (400 عند نوعٍ غير مفعَّل أو مكافأةٍ لم تعد معلّقة).
  Future<LoyaltyMe> choose(int rewardId, String kind) async {
    final r = await ApiClient.instance
        .post('/api/loyalty/me/rewards/$rewardId/choose', body: {'kind': kind});
    if (r is Map && r['me'] is Map) {
      final me = LoyaltyMe.fromJson(Map<String, dynamic>.from(r['me'] as Map));
      _set(me);
      return me;
    }
    return refresh();
  }

  void _set(LoyaltyMe? me) {
    _me = me;
    notifyListeners();
  }

  /// بعد الخروج: حمولةُ حسابٍ خرج لا تُعرض لمن يدخل بعده.
  void clear() => _set(null);
}
