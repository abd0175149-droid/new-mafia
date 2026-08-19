import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../models/entrance.dart';

// ══════════════════════════════════════════════════════
// 🎬 STORE-2 — مسرح التشريفة المؤلَّفة
// ══════════════════════════════════════════════════════
// نظيرُ `EntranceStage.tsx` في الويب: يرسم تشريفةً **من بياناتها** لا من
// قالبٍ جاهز. فما يعتمده المؤلّف هو ما يراه المشتري وما تراه القاعة.
//
// 🔴 قبله كان التطبيق يجهل `design == 'custom'` فيُسقطها إلى «موكب
//    العرّاب» — والمشتري يعاين منتجاً غير الذي يشتريه.
//
// 🔴 ساعةٌ واحدة لكلّ المسرح لا متحكّمٌ لكلّ عنصر: عشرة عناصر تعني عشرة
//    `AnimationController` وعشرة `Ticker` على شاشةٍ تعرض بطاقةً متحرّكة
//    أصلاً — والمتجر يعرض شبكةً كاملة خلفها.
class CustomEntranceStage extends StatefulWidget {
  const CustomEntranceStage({
    super.key,
    required this.elements,
    required this.playerName,
  });

  final List<EntranceElement> elements;
  final String playerName;

  @override
  State<CustomEntranceStage> createState() => _CustomEntranceStageState();
}

class _CustomEntranceStageState extends State<CustomEntranceStage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _clock;

  @override
  void initState() {
    super.initState();
    final total = EntranceElement.totalMs(widget.elements);
    _clock = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: total.clamp(600, 8500)),
    )..forward();
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.elements.isEmpty) return const SizedBox.shrink();

    // 🔴 «تقليل الحركة»: يقفز للمشهد النهائيّ بدل حذف المعاينة — من فعّلها
    //    يريد سكوناً لا حرماناً من رؤية ما يشتريه.
    final reduce = MediaQuery.disableAnimationsOf(context);

    return LayoutBuilder(
      builder: (_, box) => ClipRect(
        child: AnimatedBuilder(
          animation: _clock,
          builder: (_, __) {
            final tMs = reduce
                ? _clock.duration!.inMilliseconds
                : (_clock.value * _clock.duration!.inMilliseconds).round();
            return Stack(
              children: [
                for (final el in widget.elements)
                  _element(el, tMs, box.biggest),
              ],
            );
          },
        ),
      ),
    );
  }

  /// تقدّمُ عنصرٍ بعينه: صفرٌ قبل تأخيره، وواحدٌ بعد انتهاء مدّته.
  double _progress(EntranceElement el, int tMs) {
    final t = (tMs - el.delayMs) / el.durationMs;
    return t.clamp(0.0, 1.0);
  }

  Widget _element(EntranceElement el, int tMs, Size stage) {
    final raw = _progress(el, tMs);
    // الختم يحتاج تباطؤاً حادّاً كي يُقرأ ضربةً لا هبوطاً ناعماً — كما الويب.
    final p = (el.enterFx == 'stamp' ? Curves.easeOutQuint : Curves.easeOutCubic)
        .transform(raw);

    if (el.type == 'wash') {
      return Positioned.fill(
        child: Opacity(
          opacity: (p * el.opacity).clamp(0.0, 1.0),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -0.1),
                radius: 0.9,
                colors: [el.color, el.color2],
              ),
            ),
          ),
        ),
      );
    }

    // الجسيمات تنتشر بنفسها — لا تُغلَّف بحركةٍ ثانية تُلغي انتشارها.
    if (el.type == 'sparks') {
      return _positioned(el, stage, _sparks(el, raw));
    }

    return _positioned(el, stage, _animated(el, p, _body(el)));
  }

  /// الموضع نسبةً من مركز المسرح — نفس عقد الويب (`50 + x`٪).
  Widget _positioned(EntranceElement el, Size stage, Widget child) {
    final left = stage.width * (0.5 + el.x / 100);
    final top = stage.height * (0.5 + el.y / 100);
    return Positioned(
      left: left,
      top: top,
      child: FractionalTranslation(
        translation: const Offset(-0.5, -0.5),
        child: child,
      ),
    );
  }

  Widget _animated(EntranceElement el, double p, Widget child) {
    final o = (p * el.opacity).clamp(0.0, 1.0);
    switch (el.enterFx) {
      case 'slide':
        const dist = 60.0;
        final dx = el.from == 'left' ? -dist : (el.from == 'right' ? dist : 0.0);
        final dy = el.from == 'top' ? -dist : (el.from == 'bottom' ? dist : 0.0);
        return Opacity(
          opacity: o,
          child: Transform.translate(
            offset: Offset(dx * (1 - p), dy * (1 - p)),
            child: child,
          ),
        );
      case 'scale':
        return Opacity(
          opacity: o,
          child: Transform.scale(scale: 0.6 + 0.4 * p, child: child),
        );
      case 'stamp':
        return Opacity(
          opacity: o,
          child: Transform.rotate(
            angle: -0.21 * (1 - p),
            child: Transform.scale(scale: 2.4 - 1.4 * p, child: child),
          ),
        );
      case 'flip':
        return Opacity(
          opacity: o,
          child: Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0015)
              ..rotateY((math.pi / 2) * (1 - p)),
            child: child,
          ),
        );
      default:
        return Opacity(opacity: o, child: child);
    }
  }

  Widget _sparks(EntranceElement el, double p) {
    final r = el.size * 0.7 * p;
    return SizedBox(
      width: el.size,
      height: el.size,
      child: Stack(
        children: [
          for (var i = 0; i < 10; i++)
            Builder(builder: (_) {
              final a = math.pi * 2 * i / 10;
              return Positioned(
                left: el.size / 2 + math.cos(a) * r - 2.5,
                top: el.size / 2 + math.sin(a) * r - 2.5,
                child: Opacity(
                  opacity: ((1 - p) * el.opacity).clamp(0.0, 1.0),
                  child: Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: el.color,
                      boxShadow: [
                        BoxShadow(color: el.color, blurRadius: 8),
                      ],
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _body(EntranceElement el) {
    switch (el.type) {
      case 'bar':
        return Container(
          width: el.size,
          height: math.max(2, el.size / 60),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Colors.transparent, el.color, Colors.transparent],
            ),
            boxShadow: [BoxShadow(color: el.color, blurRadius: 18)],
          ),
        );

      case 'emblem':
        // 🔴 الشعارات مكوّناتٌ مرسومةٌ في الويب (ChipsEmblems) ولا مقابل
        //    لها هنا. رمزٌ نصّيّ أقرب من إسقاط العنصر كلّه — والمشتري يرى
        //    موضعه وحركته وحجمه، وهي جوهر التشريفة.
        return Text(
          _emblemGlyph(el.emblemId),
          style: TextStyle(fontSize: el.size * 0.8),
        );

      case 'seal':
        return Container(
          width: el.size,
          height: el.size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
                color: el.color, width: math.max(2, el.size / 25)),
            gradient: RadialGradient(
              colors: [el.color2, Colors.transparent],
              stops: const [0.0, 0.72],
            ),
            boxShadow: [
              BoxShadow(color: el.color.withValues(alpha: 0.53), blurRadius: 24),
            ],
          ),
          child: Text(
            el.text.isEmpty ? '★' : el.text,
            style: TextStyle(
              fontFamily: 'Amiri',
              fontWeight: FontWeight.w900,
              fontSize: math.max(10, el.size / 5),
              color: el.color,
            ),
          ),
        );

      case 'name':
      case 'text':
      default:
        return Text(
          el.type == 'name' ? widget.playerName : el.text,
          maxLines: 1,
          style: TextStyle(
            fontFamily: 'Amiri',
            fontWeight: FontWeight.w900,
            fontSize: el.size / 3,
            color: el.color,
            shadows: [
              Shadow(color: el.color2, blurRadius: math.max(6, el.size / 8)),
            ],
          ),
        );
    }
  }

  String _emblemGlyph(String id) => switch (id) {
        'don' => '🎩',
        'crown' => '👑',
        'skull' => '💀',
        'rose' => '🌹',
        'dagger' => '🗡️',
        'card' => '🃏',
        _ => '★',
      };
}
