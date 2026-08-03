import 'package:flutter/material.dart';

import '../../models/card_fx.dart';
import '../../models/store.dart';
import '../cosmetics/card_fx_layer.dart' show FxClock;
import '../cosmetics/elimination_fx.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🎬 المسارح الزمنيّة فوق المرآة — §المعاينة في الملفّ 33
// ══════════════════════════════════════════════════════
// معاينة التشريفة والإقصاء والنغمة **زمنيّة لا ساكنة**، وتُشغَّل في موضع
// العنصر الحقيقيّ: الإقصاء يحرق بطاقتك، والنغمة تُعزف وأنت تنظر إليها،
// والتشريفة تملأ الشاشة.

/// إقصاءٌ أو نغمة — فوق البطاقة نفسها.
class MirrorStageView extends StatelessWidget {
  const MirrorStageView({super.key, required this.item});

  final StoreItem item;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: item.kind == 'elimination'
            ? EliminationFxView(config: item.config)
            : const _StingWave(),
      );
}

/// موجةٌ صوتية فوق البطاقة أثناء العزف — سبع أعمدة بتأخيرٍ متدرّج.
class _StingWave extends StatelessWidget {
  const _StingWave();

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: const Color(0x8C000000),
        child: FxClock(
          builder: (_, t) => Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              for (var i = 0; i < 7; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                Builder(builder: (_) {
                  final p = ((t - i * 0.07) / 0.5) % 1.0;
                  final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
                  final e = tri * tri * (3 - 2 * tri);
                  return Container(
                    width: 4,
                    height: (12 + ((i * 13) % 24)) * (0.5 + 0.8 * e),
                    decoration: BoxDecoration(
                      color: Tw.amber400,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  );
                }),
              ],
            ],
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🚪 مسرح التشريفات — بعرض المرآة
// ══════════════════════════════════════════════════════
// الأربعة الجاهزة مكتوبة لشاشة قاعة ١٢٨٠×٧٢٠، وتصغيرها إلى مربّع بطاقة
// يجعلها بقعةَ لونٍ لا تُقرأ. هذه محاكاةٌ أفقية بنفس الإيقاع والألوان:
// شريطٌ يعبر · شعارٌ يهبط · الاسم يستقرّ.

const _entranceTone =
    <String, ({String bg, Color fg, String ic, String label})>{
  'don': (bg: 'rgba(69,26,3,0.96)', fg: Color(0xFFFCD34D), ic: '👑', label: 'موكب العرّاب'),
  'seal': (bg: 'rgba(69,10,10,0.96)', fg: Color(0xFFFCA5A5), ic: '🩸', label: 'ختم العائلة'),
  'neon': (bg: 'rgba(8,51,68,0.96)', fg: Color(0xFF67E8F9), ic: '⚡', label: 'لافتة النيون'),
  'file': (bg: 'rgba(24,24,27,0.96)', fg: Color(0xFFD4D4D8), ic: '🗂️', label: 'الملف السري'),
};

class EntranceStageView extends StatefulWidget {
  const EntranceStageView({
    super.key,
    required this.item,
    required this.playerName,
  });

  final StoreItem item;
  final String playerName;

  @override
  State<EntranceStageView> createState() => _EntranceStageViewState();
}

class _EntranceStageViewState extends State<EntranceStageView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// `cubic-bezier(.16,1,.3,1)` — خروجٌ حادّ يستقرّ بسرعة.
  double _ease(double t) => t >= 1 ? 1 : 1 - _pow(1 - t, 3);
  double _pow(double b, int e) {
    var r = 1.0;
    for (var i = 0; i < e; i++) {
      r *= b;
    }
    return r;
  }

  /// طورُ عنصرٍ بتأخيرٍ ومدّة، بالثواني.
  double _at(double delay, double dur) {
    final t = _c.value * 1.1;
    return ((t - delay) / dur).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final design = '${widget.item.config?['design'] ?? 'don'}';
    final t = _entranceTone[design] ?? _entranceTone['don']!;
    // الختم يهبط بضربة؛ والبقيّة تدخل بانسياب
    final stamp = design == 'seal' || design == 'file';

    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final bar1 = _ease(_at(0, 0.5));
        final icon = _ease(_at(0.18, stamp ? 0.38 : 0.55));
        final name = _at(0.45, 0.4);
        final bar2 = _ease(_at(0.5, 0.5));
        final tag = _at(0.7, 0.3);

        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0, -0.1),
              radius: 0.9,
              colors: [parseCssColor(t.bg), Colors.black],
              stops: const [0, 0.78],
            ),
          ),
          child: LayoutBuilder(
            builder: (_, c) => Stack(children: [
              // شريطٌ علويّ يعبر
              Positioned(
                top: c.maxHeight * 0.22,
                left: 0,
                right: 0,
                child: Center(
                  child: Opacity(
                    opacity: bar1,
                    child: Container(
                      width: c.maxWidth * 0.72 * bar1,
                      height: 2,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [
                          Colors.transparent,
                          t.fg,
                          Colors.transparent,
                        ]),
                        boxShadow: [
                          BoxShadow(color: t.fg, blurRadius: 12),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Opacity(
                      opacity: icon,
                      child: Transform.rotate(
                        angle: stamp ? (-14 * (1 - icon)) * 3.14159 / 180 : 0,
                        child: Transform.scale(
                          scale: stamp
                              ? 2.6 - 1.6 * icon
                              : 0.6 + 0.4 * icon,
                          child: Text(t.ic,
                              style: const TextStyle(fontSize: 34, height: 1)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Opacity(
                      opacity: name,
                      child: Transform.translate(
                        offset: Offset(0, 10 * (1 - name)),
                        child: Text(
                          widget.playerName,
                          style: TextStyle(
                            fontFamily: 'Amiri',
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            height: 1,
                            letterSpacing: 0,
                            color: t.fg,
                            shadows: [
                              Shadow(
                                  color: t.fg.withValues(alpha: 0.4),
                                  blurRadius: 14),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                bottom: c.maxHeight * 0.24,
                left: 0,
                right: 0,
                child: Center(
                  child: Opacity(
                    opacity: bar2,
                    child: Container(
                      width: c.maxWidth * 0.56 * bar2,
                      height: 2,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [
                          Colors.transparent,
                          t.fg,
                          Colors.transparent,
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                bottom: c.maxHeight * 0.10,
                left: 0,
                right: 0,
                child: Center(
                  child: Opacity(
                    opacity: tag * 0.55,
                    child: Text('JOINED',
                        style: TextStyle(
                          fontFamily: 'JetBrainsMono',
                          fontSize: 9,
                          letterSpacing: 2.25,
                          color: t.fg,
                        )),
                  ),
                ),
              ),
            ]),
          ),
        );
      },
    );
  }
}
