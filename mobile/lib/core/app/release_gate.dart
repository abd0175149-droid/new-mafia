import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../api/api_client.dart';

// ══════════════════════════════════════════════════════
// 🚦 بوّابة الإصدار — هل هذه النسخة مدعومة؟
//
// الخادم يملك السياسة منذ أغسطس (`GET /api/app/release`) بمقارنة إصداراتٍ
// عدديّة وعلمَي blocked/updateAvailable — ولم يكن أحدٌ يستدعيه. هذا الملفّ
// هو الطرف الناقص.
//
// 🔴 السياسة في الخادم لا في التطبيق عمداً: تغييرها يحتاج تحديث خادمٍ لا
//    إصداراً جديداً على المتجر — وهو ما لا يمكن دفعه إلى من حُجب أصلاً.
//
// 🔴 وفشل النداء **لا يحجب**. شبكةٌ ضعيفة في القاعة يجب ألّا تُقفل التطبيق
//    على لاعبٍ جالسٍ على الطاولة. الحجب يحتاج جواباً صريحاً بـ`blocked: true`.
// ══════════════════════════════════════════════════════

class ReleaseStatus {
  const ReleaseStatus({
    this.blocked = false,
    this.updateAvailable = false,
    this.storeUrl = '',
    this.message = '',
    this.latest = '',
  });

  final bool blocked;
  final bool updateAvailable;
  final String storeUrl;
  final String message;
  final String latest;

  static const ok = ReleaseStatus();
}

class ReleaseGate {
  ReleaseGate._();
  static final ReleaseGate instance = ReleaseGate._();

  ReleaseStatus _status = ReleaseStatus.ok;
  ReleaseStatus get status => _status;

  String _version = '';
  String get version => _version;

  /// يُنادى مرّةً عند الإقلاع، وعند كلّ عودةٍ من الخلفيّة إن أردنا التشديد.
  Future<ReleaseStatus> check() async {
    try {
      final info = await PackageInfo.fromPlatform();
      _version = info.version;
      final platform = Platform.isIOS ? 'ios' : 'android';

      final r = await ApiClient.instance
          .get('/api/app/release', query: {'platform': platform, 'version': _version});

      if (r is! Map) return _status = ReleaseStatus.ok;

      _status = ReleaseStatus(
        blocked: r['blocked'] == true,
        updateAvailable: r['updateAvailable'] == true,
        storeUrl: '${r['storeUrl'] ?? ''}',
        message: '${r['message'] ?? ''}',
        latest: '${(platform == 'ios' ? r['latestIos'] : r['latestAndroid']) ?? ''}',
      );
      if (_status.blocked) debugPrint('🚦 نسخةٌ محجوبة: $_version');
      return _status;
    } catch (e) {
      // لا حجبَ عند الفشل — انظر رأس الملفّ
      debugPrint('⚠️ تعذّر فحص الإصدار: $e');
      return _status = ReleaseStatus.ok;
    }
  }
}
