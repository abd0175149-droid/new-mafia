import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';

// ══════════════════════════════════════════════════════
// 📉 STORE-6 — قياس قُمع المتجر
// ══════════════════════════════════════════════════════
// 🔴 لماذا: سلوك مستخدمي iOS الشرائيّ كان **غير مرئيّ للإدارة** إطلاقاً —
//    الويب يقيس والتطبيق لا، فأيّ قرارٍ يُبنى على القياس يمثّل نصف
//    الجمهور. ولوحة `/admin/store-funnel` تقرأ المصدر نفسه.
//
// القيود الثلاثة منقولةٌ من `frontend/src/lib/store-funnel.ts`:
//
// ① **لا طلب لكلّ حدث**: تمريرةٌ واحدة تُنتج عشرين ظهوراً؛ عشرون طلباً
//    تُبطئ الشاشة التي جاء القياس ليحسّنها. دفعةٌ كلّ ثانيتين.
//
// ② **لا يُفقد ما قبل الإغلاق**: اللاعب يفتح المتجر ثمّ يخرج — وهي بالضبط
//    اللحظة التي نريد قياسها. تُدفع الدفعة عند مغادرة الشاشة وعند مغادرة
//    التطبيق. (ولا حاجة لحيلة `sendBeacon`: الطلب هنا لا يُلغى بتفريغ
//    صفحة، فالتطبيق أصليّ.)
//
// ③ **الفشل صامتٌ تماماً**: خطأٌ في التحليلات لا يظهر للاعب ولا يُلوّث
//    الطرفيّة — القياس خادمٌ للبيع لا العكس.

enum FunnelEvent { open, impression, tryOn, shortfall }

extension _Wire on FunnelEvent {
  /// أسماء الأحداث كما يقرؤها الخادم — لا تُترجَم ولا تُختصر.
  String get wire => switch (this) {
        FunnelEvent.open => 'open',
        FunnelEvent.impression => 'impression',
        FunnelEvent.tryOn => 'try_on',
        FunnelEvent.shortfall => 'shortfall',
      };
}

class StoreFunnel {
  StoreFunnel._();
  static final StoreFunnel instance = StoreFunnel._();

  static const _endpoint = '/api/chips/store/events';
  static const _batchWindow = Duration(seconds: 2);
  static const _maxQueue = 40;

  final List<Map<String, dynamic>> _queue = [];
  Timer? _timer;

  /// الظهور يُرسل مرّةً واحدة لكلّ عنصرٍ في الجلسة — والخادم يُقيّده يومياً.
  final Set<int> _seen = {};

  @visibleForTesting
  int flushed = 0;

  void track(FunnelEvent event, {int? itemId}) {
    if (event == FunnelEvent.impression) {
      if (itemId == null || !_seen.add(itemId)) return;
    }
    _queue.add({
      'event': event.wire,
      if (itemId != null) 'itemId': itemId,
    });

    if (_queue.length >= _maxQueue) {
      unawaited(flush());
      return;
    }
    _timer ??= Timer(_batchWindow, () => unawaited(flush()));
  }

  /// يُستدعى عند مغادرة الشاشة أو التطبيق، وعند امتلاء الطابور.
  Future<void> flush() async {
    _timer?.cancel();
    _timer = null;
    if (_queue.isEmpty) return;

    // 🔴 تُنتزع قبل الإرسال: فشلُ الطلب يجب ألّا يعيد إرسال الأحداث نفسها
    //    في الدفعة التالية فيضاعف الأرقام — بيانات قياسٍ مضاعفة أسوأ من
    //    ناقصة، لأنها تبدو صحيحة.
    final batch = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();
    flushed += batch.length;

    // بلا جلسة لا مُرسَل إليه — تُسقَط بعد انتزاعها لا قبله، وإلّا صار
    // العدّاد يقيس الشبكة بدل منطق الطابور.
    if (!SessionStore.instance.isLoggedIn) return;

    try {
      await ApiClient.instance.post(_endpoint, body: {'events': batch});
    } catch (_) {
      // صامتٌ عمداً — القياس لا يقاطع اللاعب ولا يلوّث السجلّ.
    }
  }

  /// تصفيرٌ بين الجلسات — يُستدعى عند فتح المتجر.
  void reset() {
    _timer?.cancel();
    _timer = null;
    _queue.clear();
    _seen.clear();
  }
}
