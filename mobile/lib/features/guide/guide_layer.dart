import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../loyalty/don_seal.dart';
import '../profile/profile_palette.dart';
import 'guide_service.dart';
import 'guide_targets.dart';

// ══════════════════════════════════════════════════════
// 🕴️ طبقة الدون — الضوء والبطاقة والورقة (منقولةٌ من GuideLayer.tsx + guide.css)
//
// تُرسم فوق كلّ مسارات التطبيق (في builder التطبيق، تحت بوّاباته)، ولا تعرف شيئاً
// عن الخطوات: تأخذ «ما يُضاء» و«ما يُقال» وتتكفّل بالقياس والحجب.
//   • خطوةُ فعلٍ (wait): ما حول الهدف محجوب، والهدف وحده يُلمس.
//   • خطوةُ شرحٍ (نصّ + «التالي»): كلّ شيء محجوب حتى الهدف — إلّا مع open.
//   • dim=false: لا حجب إطلاقاً (اللاعب يتصرّف بحرّيّة: قائمة الليل، شبكة التصويت).
// ══════════════════════════════════════════════════════

const kGdGold = Color(0xFFC5A059);
const kGdGoldHi = Color(0xFFE2C57C);
const kGdInk = Color(0xFFF1EADB);
const kGdMuted = Color(0xFF9B9182);
const kGdPanel = Color(0xFF0D0A05);
const _blockC = Color(0xA3000000);

class GuideLayerView extends StatefulWidget {
  const GuideLayerView({super.key, required this.o});
  final GuideOverlay o;
  @override
  State<GuideLayerView> createState() => _GuideLayerViewState();
}

class _GuideLayerViewState extends State<GuideLayerView> {
  Timer? _t;
  Rect? _rect;
  DateTime _since = DateTime.now();
  bool _scrolled = false;

  LayerStep get s => widget.o.step;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(milliseconds: 140), (_) => _measure());
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  @override
  void didUpdateWidget(covariant GuideLayerView old) {
    super.didUpdateWidget(old);
    if (old.o.step != widget.o.step) { _rect = null; _since = DateTime.now(); _scrolled = false; _measure(); }
  }

  @override
  void dispose() { _t?.cancel(); super.dispose(); }

  void _measure() {
    if (!mounted) return;
    final id = s.target;
    final r = id == null ? null : GuideTargets.rectOf(id);
    if (r != null) {
      _since = DateTime.now();
      if (!_scrolled) {
        _scrolled = true;
        final ctx = GuideTargets.contextOf(id!);
        if (ctx != null && Scrollable.maybeOf(ctx) != null) {
          unawaited(Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 250)).catchError((_) {}));
        }
      }
    }
    final p = _rect;
    final same = r == null
        ? p == null
        : (p != null && (r.left - p.left).abs() < 1 && (r.top - p.top).abs() < 1 && (r.width - p.width).abs() < 1 && (r.height - p.height).abs() < 1);
    if (!same || (r == null && s.wait != null)) setState(() => _rect = r);
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final isAction = s.wait != null;
    final dim = s.dim && (s.target != null || !isAction);
    final holeOpen = isAction || s.open;
    final box = _rect;
    final hole = box == null
        ? null
        : Rect.fromLTRB(math.max(0, box.left - 6), math.max(0, box.top - 6), math.min(size.width, box.right + 6), math.min(size.height, box.bottom + 6));
    final pos = s.pos ?? (box != null ? (box.center.dy < size.height / 2 ? 'bottom' : 'top') : 'bottom');
    final stuck = isAction && s.target != null && box == null && DateTime.now().difference(_since).inMilliseconds > 3500;
    // فوق الشريط السفليّ: من مستطيله إن وُجد
    final nav = GuideTargets.rectOf('nav');
    final aboveNav = nav != null ? size.height - nav.top + 12 : 96 + pad.bottom;

    Widget block() => GestureDetector(behavior: HitTestBehavior.opaque, onTap: () {}, onPanStart: (_) {}, child: const ColoredBox(color: _blockC));

    final card = _CoachCard(o: widget.o, stuck: stuck);
    return Stack(children: [
      if (dim && hole == null) Positioned.fill(child: block()),
      if (dim && hole != null) ...[
        Positioned(left: 0, right: 0, top: 0, height: hole.top, child: block()),
        Positioned(left: 0, right: 0, top: hole.bottom, bottom: 0, child: block()),
        Positioned(left: 0, width: hole.left, top: hole.top, height: hole.height, child: block()),
        Positioned(left: hole.right, right: 0, top: hole.top, height: hole.height, child: block()),
        if (!holeOpen) Positioned.fromRect(rect: hole, child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: () {}, child: const SizedBox.expand())),
      ],
      if (hole != null) Positioned.fromRect(rect: hole, child: const IgnorePointer(child: _Ring())),
      if (!s.silent)
        switch (pos) {
          'top' => Positioned(left: 10, right: 10, top: pad.top + 10, child: Center(child: card)),
          'low' => Positioned(left: 10, right: 10, bottom: pad.bottom + 10, child: Center(child: card)),
          'mid' => Positioned(left: 10, right: 10, top: 0, bottom: 0, child: Center(child: card)),
          _ => Positioned(left: 10, right: 10, bottom: aboveNav, child: Center(child: card)),
        },
    ]);
  }
}

class _CoachCard extends StatelessWidget {
  const _CoachCard({required this.o, required this.stuck});
  final GuideOverlay o;
  final bool stuck;

  @override
  Widget build(BuildContext context) {
    final s = o.step;
    final isAction = s.wait != null;
    final slim = s.text.isEmpty;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 520),
      child: Material(
        color: Colors.transparent,
        child: CustomPaint(
          painter: s.whisper ? const _DashedBorder(color: kGdGold) : null,
          child: Container(
            padding: EdgeInsets.fromLTRB(12, slim ? 8 : 10, 12, slim ? 8 : 12),
            decoration: BoxDecoration(
              color: s.whisper ? const Color(0xFF0B0907) : kGdPanel,
              border: s.whisper ? null : Border.all(color: kGdGold),
              boxShadow: const [BoxShadow(color: Color(0xCC000000), blurRadius: 30, offset: Offset(0, 14))],
            ),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                if (!s.whisper) ...[const DonSeal(size: 30, tiltDeg: -6), const SizedBox(width: 8)],
                Flexible(
                  child: Text(s.whisper ? 'همسة تدريب — لا تظهر في اللعب الحقيقيّ' : 'الدون',
                      style: s.whisper
                          ? ar(12.5, color: kGdGoldHi, weight: FontWeight.w800)
                          : const TextStyle(fontFamily: 'Amiri', fontSize: 17, fontWeight: FontWeight.w700, color: kGdGold, height: 1)),
                ),
                const Spacer(),
                if (o.count != null) Text(o.count!, style: mono(11, color: const Color(0xFF7E7466))),
                if (o.onLater != null && !s.whisper)
                  TextButton(
                    onPressed: o.onLater,
                    style: TextButton.styleFrom(minimumSize: const Size(0, 32), padding: const EdgeInsets.symmetric(horizontal: 6)),
                    child: Text('لاحقاً', style: ar(12.5, color: kGdMuted).copyWith(decoration: TextDecoration.underline)),
                  ),
              ]),
              SizedBox(height: slim ? 2 : 6),
              for (var i = 0; i < s.text.length; i++)
                Padding(
                  padding: EdgeInsets.only(top: i == 0 ? 0 : 6),
                  child: Text(s.text[i].text, style: s.text[i].tip ? ar(13.5, color: kGdGoldHi, height: 1.6) : ar(14.5, color: kGdInk, height: 1.7)),
                ),
              SizedBox(height: slim ? 4 : 10),
              Row(children: isAction
                  ? [
                      const _Blink(),
                      const SizedBox(width: 8),
                      Expanded(child: Text(s.wait!, style: ar(13.5, color: kGdGoldHi, weight: FontWeight.w700, height: 1.5))),
                      if (stuck && o.onSkip != null)
                        OutlinedButton(
                          onPressed: o.onSkip,
                          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), side: const BorderSide(color: Color(0xFF2B2621)), shape: const RoundedRectangleBorder()),
                          child: Text('تخطَّ الخطوة', style: ar(12.5, color: kGdMuted, weight: FontWeight.w700)),
                        ),
                    ]
                  : [
                      Expanded(
                        child: SizedBox(
                          height: 44,
                          child: ElevatedButton(
                            onPressed: o.onNext,
                            style: ElevatedButton.styleFrom(backgroundColor: kGdGold, foregroundColor: const Color(0xFF120D04), shape: const RoundedRectangleBorder(), elevation: 0),
                            child: Text(s.nextLabel ?? 'التالي', style: ar(14, color: const Color(0xFF120D04), weight: FontWeight.w800)),
                          ),
                        ),
                      ),
                    ]),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Blink extends StatefulWidget {
  const _Blink();
  @override
  State<_Blink> createState() => _BlinkState();
}

class _BlinkState extends State<_Blink> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);
  @override
  void dispose() { _a.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween(begin: 1.0, end: 0.25).animate(_a),
        child: Container(width: 9, height: 9, decoration: const BoxDecoration(color: kGdGoldHi, shape: BoxShape.circle)),
      );
}

/// حلقة الهدف: إطارٌ ذهبيّ ونبضةٌ تتّسع وتخفت
class _Ring extends StatefulWidget {
  const _Ring();
  @override
  State<_Ring> createState() => _RingState();
}

class _RingState extends State<_Ring> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat();
  @override
  void dispose() { _a.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Stack(clipBehavior: Clip.none, children: [
        Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: kGdGold, width: 2)))),
        Positioned(
          left: -6, right: -6, top: -6, bottom: -6,
          child: AnimatedBuilder(
            animation: _a,
            builder: (_, __) => Opacity(
              opacity: 0.9 * (1 - _a.value),
              child: Transform.scale(
                scale: 1 + 0.08 * _a.value,
                child: DecoratedBox(decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xB3E2C57C), width: 2))),
              ),
            ),
          ),
        ),
      ]);
}

class _DashedBorder extends CustomPainter {
  const _DashedBorder({required this.color});
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = color..strokeWidth = 1..style = PaintingStyle.stroke;
    void line(Offset a, Offset b) {
      final d = b - a;
      final len = d.distance;
      final u = d / len;
      for (double x = 0; x < len; x += 9) { canvas.drawLine(a + u * x, a + u * math.min(x + 5, len), p); }
    }
    line(Offset.zero, Offset(size.width, 0));
    line(Offset(size.width, 0), Offset(size.width, size.height));
    line(Offset(size.width, size.height), Offset(0, size.height));
    line(Offset(0, size.height), Offset.zero);
  }
  @override
  bool shouldRepaint(covariant _DashedBorder old) => old.color != color;
}

// ══ ورقة الدون: الدعوة والختم واختيار الدور ══
class DonSheet extends StatelessWidget {
  const DonSheet({super.key, required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Positioned.fill(
        child: Material(
          color: const Color(0xD6000000),
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(14),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(18, 24, 18, 18),
                    decoration: BoxDecoration(color: kGdPanel, border: Border.all(color: kGdGold)),
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      const Center(child: _Stamp(child: DonSeal(size: 76, tiltDeg: -6))),
                      const SizedBox(height: 10),
                      Text(title, textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'Amiri', fontSize: 27, fontWeight: FontWeight.w700, color: kGdGold, height: 1.3)),
                      ...children,
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

class _Stamp extends StatelessWidget {
  const _Stamp({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeOutBack,
        builder: (_, t, c) => Opacity(opacity: t.clamp(0, 1), child: Transform.rotate(angle: (1 - t) * -0.24, child: Transform.scale(scale: 1.9 - 0.9 * t, child: c))),
        child: child,
      );
}

Widget donP(String t) => Padding(padding: const EdgeInsets.only(top: 8), child: Text(t, textAlign: TextAlign.center, style: ar(14.5, color: const Color(0xFFE6DFD2), height: 1.7)));

Widget donBullets(List<String> items) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final x in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Padding(padding: EdgeInsets.only(top: 6), child: Text('◆', style: TextStyle(color: kGdGold, fontSize: 9))),
              const SizedBox(width: 8),
              Expanded(child: Text(x, style: ar(13.5, color: const Color(0xFFCDC3AF)))),
            ]),
          ),
      ]),
    );

Widget donGo(String label, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(top: 16),
      child: SizedBox(
        height: 50,
        child: ElevatedButton(
          onPressed: onTap,
          style: ElevatedButton.styleFrom(backgroundColor: kGdGold, foregroundColor: const Color(0xFF120D04), shape: const RoundedRectangleBorder(), elevation: 0),
          child: Text(label, style: ar(16, color: const Color(0xFF120D04), weight: FontWeight.w900)),
        ),
      ),
    );

Widget donLater(String label, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(top: 4),
      child: SizedBox(height: 44, child: TextButton(onPressed: onTap, child: Text(label, style: ar(13.5, color: kGdMuted)))),
    );

/// همسةٌ داخل الشاشة نفسها (بين سؤال الليل وقائمته، فوق شبكة التصويت)
class InlineWhisper extends StatelessWidget {
  const InlineWhisper({super.key, this.label = 'همسة تدريب', required this.text, this.flow = false});
  final String label, text;
  final bool flow;
  @override
  Widget build(BuildContext context) => Padding(
        padding: flow ? EdgeInsets.zero : const EdgeInsets.fromLTRB(16, 6, 16, 0),
        child: CustomPaint(
          painter: const _DashedBorder(color: kGdGold),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            color: const Color(0xFF0B0907),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: ar(12, color: kGdGoldHi, weight: FontWeight.w800)),
              Text(text, style: ar(13.5, color: kGdInk, height: 1.6)),
            ]),
          ),
        ),
      );
}

class GuideToastView extends StatelessWidget {
  const GuideToastView({super.key, required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Positioned(
        left: 12, right: 12, top: MediaQuery.paddingOf(context).top + 12,
        child: IgnorePointer(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Material(
                color: Colors.transparent,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: const Color(0xFF1A1408), border: Border.all(color: kGdGold)),
                  child: Text(text, style: ar(13.5, color: kGdInk, height: 1.6)),
                ),
              ),
            ),
          ),
        ),
      );
}
