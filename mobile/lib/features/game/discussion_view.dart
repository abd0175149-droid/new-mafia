import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../models/game.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 🎤 مرحلة النقاش — §4.2 في الملفّ ٢٥
// ══════════════════════════════════════════════════════

const _gold = Color(0xFFC5A059);

class DiscussionBody extends StatefulWidget {
  const DiscussionBody({super.key, required this.controller});
  final GameSessionController controller;

  @override
  State<DiscussionBody> createState() => _DiscussionBodyState();
}

class _DiscussionBodyState extends State<DiscussionBody> {
  /// العدّاد يُشتقّ من `startTime` لا من عدّادٍ محليّ — فلا ينحرف عن
  /// الليدر ولا يحتاج مزامنةً. النبضة لإعادة الرسم فقط.
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final d = c.discussion;

    if (d == null || d.currentSpeakerId == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(children: [
          const Text('🎤', style: TextStyle(fontSize: 28)),
          const SizedBox(height: 12),
          Text('بانتظار بدء النقاش...',
              style: mono(12, color: const Color(0xFF666666))),
        ]),
      );
    }

    final left = d.remaining();
    final mine = c.isMyTurnToSpeak;
    final over = left <= 0 && d.isSpeaking;

    return Column(children: [
      const Text('🎤', style: TextStyle(fontSize: 28)),
      const SizedBox(height: 4),
      const Text('مرحلة النقاش',
          style: TextStyle(
            fontFamily: 'Amiri',
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: _gold,
            letterSpacing: 0,
          )),
      const SizedBox(height: 16),
      if (mine) _MyTurnBanner(timeUp: over),
      if (mine) const SizedBox(height: 16),
      _speakerCard(c, d, mine, over),
      if (d.isSpeaking) ...[
        const SizedBox(height: 16),
        _Dial(left: left, total: d.timeLimitSeconds, muted: over),
      ],
      const SizedBox(height: 20),
      _order(c, d),
    ]);
  }

  Widget _speakerCard(
      GameSessionController c, DiscussionState d, bool mine, bool over) {
    final id = d.currentSpeakerId!;
    final name = c.roster
            .where((p) => p.physicalId == id)
            .map((p) => p.name)
            .firstOrNull ??
        '';
    return Container(
      key: ValueKey(id),
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: mine ? _gold : _gold.withValues(alpha: 0.3),
            width: mine ? 2 : 1),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            _gold.withValues(alpha: mine ? 0.18 : 0.06),
            _gold.withValues(alpha: 0.02),
          ],
        ),
        boxShadow: mine
            ? [BoxShadow(color: _gold.withValues(alpha: 0.3), blurRadius: 24)]
            : null,
      ),
      child: Row(children: [
        Container(
          width: 64,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0x33000000),
            border: Border.all(color: _gold.withValues(alpha: 0.5), width: 2),
          ),
          child: Text('$id',
              style: mono(24, color: _gold, weight: FontWeight.w900)),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name.isNotEmpty ? name : 'لاعب #$id',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(18, weight: FontWeight.bold)),
              const SizedBox(height: 2),
              Text(
                  over
                      ? 'انتهى الوقت'
                      : (d.isSpeaking ? 'يتحدث الآن' : 'بالانتظار'),
                  style: ar(12,
                      color: over
                          ? const Color(0xFFF87171)
                          : const Color(0xFF808080))),
            ],
          ),
        ),
      ]),
    );
  }

  Widget _order(GameSessionController c, DiscussionState d) {
    // الترتيب المعروض: المتحدّث ثمّ الطابور — ومن تكلّم يُشطب
    final ids = <int>[
      ...d.hasSpoken,
      if (d.currentSpeakerId != null) d.currentSpeakerId!,
      ...d.speakingQueue,
    ];
    if (ids.isEmpty) return const SizedBox.shrink();

    return Column(children: [
      Text('ترتيب النقاش',
          style: mono(10, color: const Color(0xFF666666))),
      const SizedBox(height: 8),
      for (var i = 0; i < ids.length; i++)
        _orderRow(c, d, ids[i], i + 1),
    ]);
  }

  Widget _orderRow(
      GameSessionController c, DiscussionState d, int id, int order) {
    final isCurrent = d.currentSpeakerId == id;
    final done = d.hasSpoken.contains(id) && !isCurrent;
    final me = id == c.physicalId;
    final name = c.roster
            .where((p) => p.physicalId == id)
            .map((p) => p.name)
            .firstOrNull ??
        '';

    final (bg, border, fg) = isCurrent
        ? (_gold.withValues(alpha: 0.15), _gold.withValues(alpha: 0.3),
            Colors.white)
        : done
            ? (const Color(0x0DFFFFFF), Colors.transparent,
                const Color(0xFF666666))
            : me
                ? (_gold.withValues(alpha: 0.1), _gold.withValues(alpha: 0.3),
                    _gold)
                : (const Color(0x0DFFFFFF), Colors.transparent,
                    const Color(0xFF999999));

    return Opacity(
      opacity: done ? 0.5 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: bg,
          border: Border.all(color: border),
        ),
        child: Row(children: [
          Text('$order',
              style: mono(11,
                  color: isCurrent ? _gold : const Color(0xFF555555))),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
                (name.isNotEmpty ? name : 'لاعب #$id') + (me ? ' (أنت)' : ''),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(13,
                        color: fg,
                        weight: (isCurrent || me)
                            ? FontWeight.bold
                            : FontWeight.w400)
                    .copyWith(
                  decoration: done ? TextDecoration.lineThrough : null,
                )),
          ),
          if (isCurrent)
            const _Blink(child: Text('●', style: TextStyle(color: _gold, fontSize: 12)))
          else if (done)
            const Text('✓',
                style: TextStyle(color: Color(0xFF4ADE80), fontSize: 12)),
        ]),
      ),
    );
  }
}

/// بانر «دورك» — الشيء الوحيد الذي يراه اللاعب وهو ينظر إلى الشاشة الكبرى.
class _MyTurnBanner extends StatelessWidget {
  const _MyTurnBanner({required this.timeUp});
  final bool timeUp;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _gold, width: 2),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              _gold.withValues(alpha: 0.25),
              _gold.withValues(alpha: 0.10),
            ],
          ),
          boxShadow: [
            BoxShadow(color: _gold.withValues(alpha: 0.3), blurRadius: 30),
          ],
        ),
        child: Row(children: [
          _Pulse(
            child: Text(timeUp ? '🔇' : '🎙️',
                style: const TextStyle(fontSize: 30)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(timeUp ? 'انتهى وقتك!' : 'دورك في النقاش!',
                    style: TextStyle(
                      fontFamily: 'Amiri',
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0,
                      color: timeUp ? const Color(0xFFF87171) : _gold,
                    )),
                const SizedBox(height: 2),
                Text(timeUp ? 'يُرجى التوقف عن الكلام' : 'تحدّث الآن أمام الجميع',
                    style: ar(13, color: const Color(0xFFBBBBBB))),
              ],
            ),
          ),
        ]),
      );
}

/// العدّاد الدائريّ — نفس كروم ليل الملفّ ٢٣.
class _Dial extends StatelessWidget {
  const _Dial(
      {required this.left, required this.total, required this.muted});
  final int left, total;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final color = left <= 5
        ? const Color(0xFFEF4444)
        : (left <= 10 ? const Color(0xFFF59E0B) : _gold);
    final frac = total <= 0 ? 0.0 : (left / total).clamp(0.0, 1.0);

    return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      Text(muted ? '🔇' : '🎙️', style: const TextStyle(fontSize: 24)),
      const SizedBox(width: 16),
      SizedBox(
        width: 64,
        height: 64,
        child: Stack(alignment: Alignment.center, children: [
          TweenAnimationBuilder<double>(
            tween: Tween(begin: frac, end: frac),
            duration: const Duration(milliseconds: 500),
            builder: (_, v, __) => CustomPaint(
              size: const Size.square(64),
              painter: _DialPainter(fraction: v, color: color),
            ),
          ),
          Text('$left',
              style: mono(18, color: color, weight: FontWeight.w900)),
        ]),
      ),
    ]);
  }
}

class _DialPainter extends CustomPainter {
  const _DialPainter({required this.fraction, required this.color});
  final double fraction;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * (3 / 36);
    final r = size.width * (15.5 / 36);
    final c = size.center(Offset.zero);
    canvas.drawCircle(
        c,
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..color = const Color(0xFF1A1A2E));
    if (fraction <= 0) return;
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      -math.pi / 2,
      2 * math.pi * fraction,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_DialPainter o) =>
      o.fraction != fraction || o.color != color;
}

class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});
  final Widget child;
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1500))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    return ScaleTransition(
      scale: Tween(begin: 1.0, end: 1.2)
          .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: widget.child,
    );
  }
}

class _Blink extends StatefulWidget {
  const _Blink({required this.child});
  final Widget child;
  @override
  State<_Blink> createState() => _BlinkState();
}

class _BlinkState extends State<_Blink> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0)
          .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: widget.child,
    );
  }
}
