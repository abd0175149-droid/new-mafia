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

  Future<void> fire() async {
    fired++;
    unawaited(HapticsService.instance.myTurn());
    try {
      // `stop` أوّلاً: تنبيهان متتاليان يتداخلان صوتياً بلا إعادة تعيين
      await _player.stop();
      await _player.play(AssetSource('sounds/my_turn.wav'));
    } catch (_) {
      // جهازٌ بلا مخرجٍ صوتيّ أو إذنٌ مرفوض — الاهتزاز والبانر كافيان
    }
  }
}
