import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:vibration/vibration.dart';

// ══════════════════════════════════════════════════════
// 📳 أنماط الاهتزاز — §الملفّ ٢٠
// ══════════════════════════════════════════════════════
// الأنماط محفوظةٌ حرفياً: طولُ النمط نفسه رسالة. «عقوبةٌ عليك» و«طُردت»
// يتمايزان بالإيقاع وحده حين يكون الهاتف في الجيب.
//
// ⚠️ iOS لا يدعم أنماط الاهتزاز — يهبط إلى نبضةٍ مفردة. فلا تُبنَ أيّ
//    دلالةٍ على تمييز الأنماط هناك؛ النصّ على الشاشة هو المرجع.

class HapticsService {
  HapticsService._();
  static final HapticsService instance = HapticsService._();

  /// خطّافُ اختبارٍ يلتقط النمط بدل هزّ جهازٍ غير موجود.
  @visibleForTesting
  static void Function(List<int> pattern)? probe;

  bool? _has;

  Future<bool> get _canPattern async {
    if (kIsWeb) return false;
    if (!Platform.isAndroid) return false;
    return _has ??= (await Vibration.hasVibrator()) == true;
  }

  Future<void> _fire(List<int> pattern) async {
    probe?.call(pattern);
    try {
      if (await _canPattern) {
        // الصيغة `[تأخير, اهتزاز, تأخير, …]` — أوّلها انتظارٌ لا اهتزاز
        await Vibration.vibrate(pattern: [0, ...pattern]);
        return;
      }
      // هبوطٌ لنبضةٍ مفردة: شدّتها من طول النمط لا من عدده
      final longest = pattern.isEmpty
          ? 0
          : pattern.reduce((a, b) => a > b ? a : b);
      if (longest >= 300) {
        await HapticFeedback.heavyImpact();
      } else if (longest >= 150) {
        await HapticFeedback.mediumImpact();
      } else {
        await HapticFeedback.lightImpact();
      }
    } catch (_) {
      // جهازٌ بلا هزّاز أو إذنٌ مرفوض — لا شيء يُبلَّغ عنه للاعب
    }
  }

  Future<void> roleAssigned() => _fire(const [100, 50, 200, 50, 300]);
  Future<void> seatChanged() => _fire(const [200, 100, 200]);
  Future<void> penaltySelf() => _fire(const [300, 100, 300, 100, 500]);
  Future<void> penaltyEject() => _fire(const [500, 200, 500, 200, 500]);
  Future<void> mayorPrompt() => _fire(const [120, 80, 120, 80, 240]);
  Future<void> voteStart() => _fire(const [100, 200]);
  Future<void> gameStart() => _fire(const [200]);
  Future<void> warn() => _fire(const [100, 100]);
  Future<void> voteCast() => _fire(const [100]);
  Future<void> eliminated() => _fire(const [200, 100, 200]);
  Future<void> myTurn() => _fire(const [200, 100, 200, 100, 300]);
}
