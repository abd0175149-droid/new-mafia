import 'package:flutter/widgets.dart';

import '../../models/store.dart';
import '../api/api_client.dart';
import '../socket/socket_service.dart';

// ══════════════════════════════════════════════════════
// 🪙 مزوّد المظهر — §6.1 في الملفّ 34
// ══════════════════════════════════════════════════════
// كل ما يشتريه اللاعب كان يظهر على شاشة القاعة فقط، وبطاقته في يده طوال
// السهرة تُرسم بلا إطار ولا لقب. **المظهر يجب أن يكون حاضراً في يد صاحبه.**
//
// 🔴 ثلاث قنوات تحديث كي لا يعتمد الظهور على واحدةٍ قد تنقطع:
//    ① جلبٌ أوّليّ  ② بثّ `chips:cosmetics-updated`  ③ إعادة جلبٍ عند العودة
//
// 🔴 مصيدة الغرفة: البثّ يصل على غرفة `player:{id}`، والانضمام إليها يقع
//    **عند المصافحة وحدها**. من اتّصل بلا رمزٍ ثمّ سجّل دخوله يبقى خارج
//    غرفته أبداً ولا يُصلحه أيّ جلب — العلاج `SocketService.reauth()`
//    وهو مستدعىً بعد الدخول في طبقة الجلسة.
//
// 📌 المظهر **زخرفة**: فشل جلبه لا يعطّل شاشةً ولا يرمي ولا يعرض خطأً.
//    البطاقة تُرسم بمظهر الرتبة وحده — وهذا سلوكٌ صحيح لا حالة عطل.

class CosmeticsService extends ChangeNotifier with WidgetsBindingObserver {
  CosmeticsService._();
  static final CosmeticsService instance = CosmeticsService._();

  EquippedCosmetics _cosmetics = const EquippedCosmetics();
  EquippedCosmetics get cosmetics => _cosmetics;

  String _rankTier = 'INFORMANT';
  String get rankTier => _rankTier;

  bool _started = false;

  /// هل على البطاقة ما يستحقّ عرضه؟ (§4.1: قسم الملفّ الشخصيّ مشروط)
  bool get hasAny =>
      _cosmetics.frame != null ||
      _cosmetics.title != null ||
      _cosmetics.nameFx != null;

  /// يُستدعى مرّةً بعد حسم الجلسة.
  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    SocketService.instance.on('chips:cosmetics-updated', _onBroadcast);
    load();
  }

  void stop() {
    if (!_started) return;
    _started = false;
    WidgetsBinding.instance.removeObserver(this);
    SocketService.instance.off('chips:cosmetics-updated', _onBroadcast);
    _cosmetics = const EquippedCosmetics();
    _rankTier = 'INFORMANT';
    notifyListeners();
  }

  /// ③ الهاتف ينام كثيراً — والبثّ الذي فات لا يُعوَّض.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) load();
  }

  /// ② بثٌّ لحظيّ: تجهيز عنصرٍ من الخزنة يغيّر البطاقة بلا إعادة تحميل.
  void _onBroadcast(dynamic p) {
    if (p is! Map || p['cosmetics'] is! Map) return;
    _apply(Map<String, dynamic>.from(p['cosmetics'] as Map));
  }

  /// ① جلبٌ أوّليّ — وعند كل عودة.
  Future<void> load() async {
    try {
      final r = await ApiClient.instance.get('/api/chips/store/cosmetics');
      if (r is! Map || r['success'] != true) return;
      final tier = r['rankTier'];
      if (tier is String && tier.isNotEmpty) _rankTier = tier;
      _apply(r['cosmetics'] is Map
          ? Map<String, dynamic>.from(r['cosmetics'] as Map)
          : const {});
    } catch (_) {
      // زخرفة — الصمت هو السلوك الصحيح
    }
  }

  void _apply(Map<String, dynamic> raw) {
    _cosmetics = EquippedCosmetics.fromJson(raw);
    notifyListeners();
  }

  /// تحديثٌ فوريّ من شاشةٍ جلبت المظهر ضمن استجابةٍ أوسع (الخزنة) —
  /// يوفّر نداءً ثانياً ويُبقي البطاقة في الملفّ متّسقة مع المتجر.
  void adopt(EquippedCosmetics c, String tier) {
    _cosmetics = c;
    if (tier.isNotEmpty) _rankTier = tier;
    notifyListeners();
  }
}
