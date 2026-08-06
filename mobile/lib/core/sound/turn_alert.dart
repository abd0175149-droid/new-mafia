import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

import '../haptics/haptics_service.dart';

// ══════════════════════════════════════════════════════
// 🔔 تنبيه «دورك» — §4.2 في الملفّ ٢٥
// ══════════════════════════════════════════════════════
// اللاعب ينظر إلى الشاشة الكبيرة لا إلى جهازه، فبانرٌ صامت لا يصله.
// التنبيه اهتزازٌ **و**صوت معاً: الاهتزاز يصل والجهاز في الجيب، والصوت
// يصل والجهاز على الطاولة.

class TurnAlert {
  TurnAlert._();
  static final TurnAlert instance = TurnAlert._();

  final _player = AudioPlayer();

  @visibleForTesting
  static int fired = 0;

  bool _sessionSet = false;

  /// 🔴 فئة الجلسة تُضبط صراحةً لا تُترك لافتراض الحزمة.
  ///
  /// هاتف اللاعب في القاعة صامتٌ غالباً، والفئة الافتراضية تحترم مفتاح
  /// الصمت — أي أن «دورك» يُخرَس في الحالة التي صُنع لها بالضبط. الفئة
  /// المطلوبة `playback` (07 §6.8): تتجاهل المفتاح، وهي أيضاً ما يبرّر
  /// `UIBackgroundModes: audio` حين تصل مرحلة الصوت عن بُعد.
  Future<void> _ensureSession() async {
    if (_sessionSet) return;
    _sessionSet = true;
    try {
      await AudioPlayer.global.setAudioContext(
        AudioContextConfig(
          respectSilence: false, // ← iOS: playback لا ambient
          stayAwake: false,
          focus: AudioContextConfigFocus.mixWithOthers,
        ).build(),
      );
    } catch (e) {
      debugPrint('⚠️ تعذّر ضبط جلسة الصوت: $e');
    }
  }

  Future<void> fire() async {
    fired++;
    unawaited(HapticsService.instance.myTurn());
    try {
      await _ensureSession();
      // `stop` أوّلاً: تنبيهان متتاليان يتداخلان صوتياً بلا إعادة تعيين
      await _player.stop();
      await _player.play(AssetSource('sounds/my_turn.wav'));
    } catch (_) {
      // جهازٌ بلا مخرجٍ صوتيّ أو إذنٌ مرفوض — الاهتزاز والبانر كافيان
    }
  }
}
