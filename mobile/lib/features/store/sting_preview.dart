import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

// ══════════════════════════════════════════════════════
// 🔊 معاينة نغمة النصر قبل الشراء — الملفّ 99 · STORE-1
// ══════════════════════════════════════════════════════
// كان قسم «نغمات» يبيع ملفّاتٍ صوتيّة والمعاينة **موجةٌ بصريّةٌ صامتة**:
// يدفع اللاعب ثمن صوتٍ لم يسمعه قطّ، بينما الويب يشغّله عند اللمس.
//
// 🔴 مشغّلٌ مستقلّ بسياقٍ صوتيٍّ خاصّ — لا `AudioPlayer.global`:
//    `TurnAlert` يضبط السياق **العامّ** على `playback` بـ
//    `respectSilence: false` كي يُسمَع تنبيه «دورك» والهاتف صامتٌ في
//    القاعة — وهو صحيحٌ هناك. لكنّ وراثته هنا تعني أن من يتصفّح المتجر
//    وهاتفه صامتٌ يُفاجأ بصوتٍ في مكانٍ هادئ. المعاينة **تحترم مفتاح
//    الصمت**، والفرق بينهما نيّة المستخدم لا قدرة الحزمة.
//
// 🔴 والإيقاف أهمّ من التشغيل: صوتٌ يستمرّ بعد إغلاق الورقة أو مغادرة
//    التطبيق عيبٌ يلاحظه المستخدم فوراً ويصعب تفسيره.
class StingPreview {
  StingPreview._();
  static final StingPreview instance = StingPreview._();

  AudioPlayer? _player;
  int? _playing;
  bool _contextSet = false;

  /// معرّف النغمة الجاري عزفها — تقرؤه الواجهة لتُظهر الموجة.
  int? get playingId => _playing;

  final _changes = StreamController<int?>.broadcast();
  Stream<int?> get changes => _changes.stream;

  @visibleForTesting
  static int played = 0;

  Future<AudioPlayer> _ensure() async {
    final p = _player ??= AudioPlayer();
    if (!_contextSet) {
      _contextSet = true;
      try {
        // 🔴 على النسخة لا على `global`: ضبطُ العامّ هنا يقلب سلوك
        //    `TurnAlert` فيُخرَس تنبيه «دورك» في القاعة الصامتة.
        await p.setAudioContext(
          AudioContextConfig(
            respectSilence: true,
            stayAwake: false,
            focus: AudioContextConfigFocus.mixWithOthers,
          ).build(),
        );
      } catch (e) {
        debugPrint('⚠️ سياق صوت المعاينة: $e');
      }
    }
    return p;
  }

  /// يعزف نغمةً ويوقف ما قبلها. يعيد `false` إن تعذّر — فتعرض الواجهة سبباً
  /// بدل صمتٍ غامض.
  Future<bool> play(int id, String? url) async {
    if (url == null || url.trim().isEmpty) return false;
    await stop();
    try {
      final p = await _ensure();
      _playing = id;
      _changes.add(id);
      played++;
      // الانتهاء الطبيعيّ يُنهي حالة العزف كما يفعل الإيقاف اليدويّ.
      p.onPlayerComplete.first.then((_) {
        if (_playing == id) {
          _playing = null;
          _changes.add(null);
        }
      });
      await p.play(UrlSource(url), volume: 0.85);
      return true;
    } catch (e) {
      debugPrint('⚠️ تعذّر عزف المعاينة: $e');
      _playing = null;
      _changes.add(null);
      return false;
    }
  }

  /// يوقف أيّ عزفٍ جارٍ. آمنٌ للاستدعاء المتكرّر وبلا عزف.
  Future<void> stop() async {
    if (_playing == null && _player == null) return;
    _playing = null;
    _changes.add(null);
    try {
      await _player?.stop();
    } catch (_) {
      // الإيقاف لا يُفشل شيئاً — الواجهة مضت بالفعل.
    }
  }

  /// يُستدعى عند التخلّص النهائيّ (لا يُستدعى في التشغيل العاديّ — مفردة).
  @visibleForTesting
  Future<void> disposeForTest() async {
    await stop();
    await _player?.dispose();
    _player = null;
    _contextSet = false;
    played = 0;
  }
}
