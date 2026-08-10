import 'dart:ui';

import 'package:flutter/material.dart';

import '../../models/voice.dart';
import '../profile/profile_palette.dart';
import 'voice_service.dart';

// ══════════════════════════════════════════════════════
// 🎙️ RemoteVoice — §4.أ و§4.ب في الملفّ ٣١
// ══════════════════════════════════════════════════════
// 🔒 لا تُرسَم إلّا في اللعب عن بُعد. الحارس عند المستدعي، وهنا حارسٌ
//    ثانٍ: `enabled == false` ⇒ لا شيء إطلاقاً.

const _gold = Color(0xFFC5A059);
const _emerald = Color(0xFF10B981);
const _sky = Color(0xFF38BDF8);
const _amber = Color(0xFFF59E0B);
const _danger = Color(0xFFEF4444);
const _line = Color(0xFF2A2A2A);
const _dim = Color(0xFF808080);

/// شريط اللاعب — ثابتٌ أسفل الشاشة.
class RemoteVoiceBar extends StatelessWidget {
  const RemoteVoiceBar({
    super.key,
    required this.enabled,
    required this.service,
    this.gamePhase,
  });

  final bool enabled;
  final VoiceService service;
  final String? gamePhase;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return const SizedBox.shrink();

    return AnimatedBuilder(
      animation: service,
      builder: (context, _) {
        final s = service.snapshot;
        final freeMic = service.freeMic;
        // القفل السياديّ: مقفولٌ يعني «ليس دورك» لا «معطّل»
        final micLocked = !freeMic && !s.selfAudioOn;
        final night = gamePhase == 'NIGHT';

        return ClipRRect(
          borderRadius:
              const BorderRadius.vertical(top: Radius.circular(16)),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              padding: EdgeInsets.fromLTRB(
                  16, 8, 16, 8 + MediaQuery.paddingOf(context).bottom),
              decoration: const BoxDecoration(
                color: Color(0xCC0A0A0A),
                border: Border(
                  top: BorderSide(color: Color(0xFF1F1C17)),
                  left: BorderSide(color: Color(0xFF1F1C17)),
                  right: BorderSide(color: Color(0xFF1F1C17)),
                ),
              ),
              child: Row(children: [
                _status(s),
                const Spacer(),
                _micButton(s, freeMic, micLocked),
                const SizedBox(width: 8),
                _camButton(s, night),
                const SizedBox(width: 8),
                _speakerButton(s),
              ]),
            ),
          ),
        );
      },
    );
  }

  Widget _status(VoiceSnapshot s) {
    final (color, label) = s.error != null
        ? (_danger, 'غير متاح')
        : (s.connected ? (_emerald, 'متصل') : (_amber, 'يتصل…'));
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      ),
      const SizedBox(width: 5),
      Text(label, style: mono(10, color: const Color(0xFF9A9A9A))),
    ]);
  }

  Widget _micButton(VoiceSnapshot s, bool freeMic, bool locked) {
    final on = s.selfAudioOn;
    final tip = freeMic
        ? (on ? 'اضغط لكتم مايكك' : 'اضغط لفتح مايكك (لوبي)')
        : (on ? 'دورك — مايكك مفتوح' : 'مايكك مقفول — يُفتح في دورك');

    return Tooltip(
      message: tip,
      child: Stack(clipBehavior: Clip.none, children: [
        _circle(
          on: on,
          onColor: _emerald,
          glyph: on ? '🎤' : '🔇',
          // 🔒 خارج المايك الحرّ الزرّ خاملٌ عمداً — القاعدة تفتحه وتغلقه
          onTap: freeMic && s.connected ? service.toggleSelfAudio : null,
        ),
        if (locked) ...[
          PositionedDirectional(
            top: -4,
            start: -4,
            child: Container(
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF1A1610),
                border: Border.all(color: _gold.withValues(alpha: 0.5)),
              ),
              child: const Text('🔒', style: TextStyle(fontSize: 9)),
            ),
          ),
          PositionedDirectional(
            bottom: -14,
            start: 0,
            end: 0,
            child: Text('يُفتح في دورك',
                textAlign: TextAlign.center,
                style: ar(8.5, color: const Color(0xFF9A9A9A))),
          ),
        ],
      ]),
    );
  }

  Widget _camButton(VoiceSnapshot s, bool night) => Tooltip(
        // 🔒 الكاميرا مقفولةٌ ليلاً — مكافحة غشّ: لا كروت على الكاميرا
        message: night ? 'الكاميرا معطّلة ليلاً' : 'الكاميرا',
        child: Opacity(
          opacity: (!s.connected || night) ? 0.4 : 1,
          child: _circle(
            on: s.selfVideoOn,
            onColor: _sky,
            glyph: '📷',
            onTap: (!s.connected || night) ? null : service.toggleSelfVideo,
          ),
        ),
      );

  Widget _speakerButton(VoiceSnapshot s) => Tooltip(
        message: s.speakerMode
            ? 'الصوت من السمّاعة الخارجية (اضغط للأذن)'
            : 'الصوت من سمّاعة الأذن (اضغط للسبيكر)',
        child: _circle(
          on: s.speakerMode,
          onColor: _amber,
          glyph: s.speakerMode ? '🔊' : '🎧',
          onTap: service.toggleSpeakerMode,
        ),
      );

  Widget _circle({
    required bool on,
    required Color onColor,
    required String glyph,
    VoidCallback? onTap,
  }) =>
      GestureDetector(
        onTap: onTap,
        child: Container(
          width: 48,
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: on
                ? onColor.withValues(alpha: 0.25)
                : Colors.black.withValues(alpha: 0.65),
            border: Border.all(
                color: on ? onColor.withValues(alpha: 0.6) : _line),
            boxShadow: on
                ? [BoxShadow(color: onColor.withValues(alpha: 0.45), blurRadius: 16)]
                : null,
          ),
          child: Text(glyph, style: const TextStyle(fontSize: 18)),
        ),
      );
}

/// بطاقة المضيف — علويّة inline بسجلٍّ تشخيصيّ.
class HostVoiceCard extends StatefulWidget {
  const HostVoiceCard({
    super.key,
    required this.enabled,
    required this.service,
    this.nameByPid = const {},
  });

  final bool enabled;
  final VoiceService service;
  final Map<int, String> nameByPid;

  @override
  State<HostVoiceCard> createState() => _HostVoiceCardState();
}

class _HostVoiceCardState extends State<HostVoiceCard> {
  bool _showLog = false;

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) return const SizedBox.shrink();

    return AnimatedBuilder(
      animation: widget.service,
      builder: (context, _) {
        final s = widget.service.snapshot;
        final talking = s.talkingPids(selfPid: widget.service.selfPid);

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: const Color(0xFF0A0A0A),
            border: Border.all(color: const Color(0xFF1A1A1A)),
          ),
          child: Column(children: [
            Row(children: [
              _status(s),
              const Spacer(),
              _pill(
                label: s.speakerMode ? '🔊' : '🎧',
                active: s.speakerMode,
                color: _amber,
                onTap: widget.service.toggleSpeakerMode,
              ),
              const SizedBox(width: 6),
              _pill(
                label: '📋',
                active: _showLog,
                color: _amber,
                onTap: () => setState(() => _showLog = !_showLog),
              ),
              const SizedBox(width: 6),
              Opacity(
                opacity: s.connected ? 1 : 0.4,
                child: _pill(
                  label: s.selfAudioOn ? '🎤 مايكك مفتوح' : '🔇 مايكك مغلق',
                  active: s.selfAudioOn,
                  color: _emerald,
                  onTap: s.connected ? widget.service.toggleSelfAudio : null,
                ),
              ),
            ]),
            if (s.canMute && talking.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: [
                for (final pid in talking)
                  GestureDetector(
                    onTap: () => widget.service
                        .muteByPid(pid, widget.nameByPid[pid]),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        color: _danger.withValues(alpha: 0.1),
                        border:
                            Border.all(color: _danger.withValues(alpha: 0.4)),
                      ),
                      child: Text(
                          '🔇 كتم ${widget.nameByPid[pid] ?? '#$pid'}',
                          style: ar(10,
                              color: const Color(0xFFFCA5A5),
                              weight: FontWeight.bold)),
                    ),
                  ),
              ]),
            ],
            if (_showLog) _logPanel(s),
          ]),
        );
      },
    );
  }

  Widget _status(VoiceSnapshot s) {
    final (color, label) = s.error != null
        ? (_danger, 'صوت غير متاح')
        : (s.connected
            ? (_emerald, 'صوت · ${s.participantCount + 1}')
            : (_amber, 'جارٍ الاتصال…'));
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      ),
      const SizedBox(width: 5),
      Text(label, style: mono(11, color: const Color(0xFFC9C3B5))),
    ]);
  }

  Widget _pill({
    required String label,
    required bool active,
    required Color color,
    VoidCallback? onTap,
  }) =>
      GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: active
                ? color.withValues(alpha: 0.1)
                : Colors.black.withValues(alpha: 0.4),
            border:
                Border.all(color: active ? color.withValues(alpha: 0.5) : _line),
          ),
          child: Text(label,
              style: ar(11,
                  color: active ? color : _dim, weight: FontWeight.bold)),
        ),
      );

  Widget _logPanel(VoiceSnapshot s) => Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: Colors.black.withValues(alpha: 0.5),
          border: Border.all(color: const Color(0xFF1A1A1A)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Text('📋 سجلّ الصوت',
                  style: ar(10,
                      color: const Color(0xFFC9C3B5),
                      weight: FontWeight.bold)),
              const SizedBox(width: 6),
              Expanded(
                child: Text('اللاعب يفتح مايكه بنفسه؛ تقدر تكتمه من هنا',
                    style: ar(9, color: const Color(0xFF666666))),
              ),
            ]),
            const SizedBox(height: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 112),
              child: SingleChildScrollView(
                child: s.log.isEmpty
                    ? Text('لا أحداث بعد…',
                        style: mono(10, color: const Color(0xFF555555)))
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final line in s.log)
                            Text(line,
                                style: mono(10,
                                    color: const Color(0xFF9A9A9A))),
                        ],
                      ),
              ),
            ),
          ],
        ),
      );
}
