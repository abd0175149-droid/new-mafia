import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// ══════════════════════════════════════════════════════
/// 🕵️ منع لقطة الشاشة/التسجيل — غلاف قناة mafia/secure_screen
/// ══════════════════════════════════════════════════════
/// أندرويد: enable() يضيف FLAG_SECURE فتخرج اللقطة والتسجيل **سوداءَ**
///   على مستوى النظام (منعٌ فعليّ). disable() يزيله خارج الشاشات السريّة.
/// iOS: enable() يضع طبقة الحقل الآمن (طريقة نتفليكس) فتُحذف الشاشة السريّة
///   من صورة الالتقاط؛ ويكشف iOS اللقطة/التسجيل ويُبلّغ Dart عبر
///   onNativeCall → نمرّرها للمُستمع (يبثّها للّيدر). راجع docs 98.
///
/// الجانب الأصليّ لـiOS يُبنى على الماك (الملفّ 98) — حتى ذلك الحين تظلّ
/// النداءات آمنةً بلا مفعول (القناة غير مُسجّلة → PlatformException تُبتلع).
class SecureScreen {
  SecureScreen._();
  static final SecureScreen instance = SecureScreen._();

  static const _ch = MethodChannel('mafia/secure_screen');
  bool _wired = false;
  int _refCount = 0; // شاشاتٌ سريّة متداخلة (بطاقة + معرض) — لا نطفئ إلا عند آخرها

  /// يُستدعى من الأصليّ (iOS) عند لقطةٍ أو تغيّر حالة التسجيل.
  void Function(String kind)? onCaptureDetected; // 'screenshot' | 'screen_recording'

  void _ensureWired() {
    if (_wired) return;
    _wired = true;
    _ch.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'onScreenshot':
          onCaptureDetected?.call('screenshot');
          break;
        case 'onScreenRecording':
          if (call.arguments == true) onCaptureDetected?.call('screen_recording');
          break;
      }
      return null;
    });
  }

  /// ادخل شاشةً سريّة: يفعّل الحماية (عدّاد مرجعيّ للشاشات المتداخلة).
  Future<void> enter() async {
    _ensureWired();
    _refCount++;
    if (_refCount == 1) {
      try { await _ch.invokeMethod('enable'); }
      catch (e) { if (kDebugMode) debugPrint('secure_screen enable: $e'); }
    }
  }

  /// غادر شاشةً سريّة: يطفئ الحماية عند آخر شاشة فقط.
  Future<void> leave() async {
    if (_refCount > 0) _refCount--;
    if (_refCount == 0) {
      try { await _ch.invokeMethod('disable'); }
      catch (e) { if (kDebugMode) debugPrint('secure_screen disable: $e'); }
    }
  }

  /// تصفيرٌ قسريّ (عند مغادرة اللعبة كلّيّاً) كي لا يعلق FLAG_SECURE.
  Future<void> reset() async {
    _refCount = 0;
    try { await _ch.invokeMethod('disable'); } catch (_) {}
  }
}
