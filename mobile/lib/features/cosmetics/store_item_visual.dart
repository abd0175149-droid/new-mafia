import 'package:flutter/material.dart';

import '../../models/card_fx.dart';
import '../../models/store.dart';
import 'chips_emblems.dart';
import 'name_fx_text.dart';
import 'title_plaque_view.dart';

// ══════════════════════════════════════════════════════
// 🖼️ صورة العنصر في المتجر — منقولة عن `StoreItemVisual.tsx`
// ══════════════════════════════════════════════════════
// 🔴 كان المتجر يرسم صورةً للإطارات وحدها، فثلاثة عشر عنصراً من واحدٍ
//    وعشرين تُعرض نصّاً خالصاً. **متجرٌ ثلثا بضاعته غير مرئية لا يبيع.**
//    لكل نوعٍ هنا تمثيلٌ يشبه ما سيراه اللاعب فعلاً، لا أيقونةٌ عامّة.

const _entranceTone = <String, ({Color bg, Color bd, Color fg, String label})>{
  'don': (
    bg: Color(0xE6451A03), bd: Color(0x8CF59E0B), fg: Color(0xFFFCD34D),
    label: 'موكب'
  ),
  'seal': (
    bg: Color(0xE6450A0A), bd: Color(0x8CDC2626), fg: Color(0xFFFCA5A5),
    label: 'ختم'
  ),
  'neon': (
    bg: Color(0xE6083344), bd: Color(0x8C22D3EE), fg: Color(0xFF67E8F9),
    label: 'نيون'
  ),
  'file': (
    bg: Color(0xE618181B), bd: Color(0x80A1A1AA), fg: Color(0xFFD4D4D8),
    label: 'ملف'
  ),
};

class StoreItemVisual extends StatelessWidget {
  const StoreItemVisual({
    super.key,
    required this.item,
    this.playerName = 'اسمك',
    this.size = 56,
    this.animate = true,
  });

  final StoreItem item;

  /// اسم اللاعب — يجعل تأثير الاسم معاينةً شخصية لا عيّنةً عامّة.
  final String playerName;
  final double size;
  final bool animate;

  BoxDecoration _box({Color? bg, Color? border}) => BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: bg ?? const Color(0x73000000),
        border: Border.all(color: border ?? const Color(0x14FFFFFF)),
      );

  @override
  Widget build(BuildContext context) => switch (item.kind) {
        'frame' => _frame(),
        'title' => _title(),
        'name_fx' => _nameFx(),
        'entrance' => _entrance(),
        'elimination' => _elimination(),
        'victory_sting' => _sting(),
        'xp_boost' => _boost(),
        _ => _fallback(),
      };

  // ── الإطار: الشعار إن وُجد، وإلّا مصغّرةٌ حيّة من ألوان الإعداد نفسه ──
  Widget _frame() {
    final emb = emblemIdOf(item.emblemId);
    if (emb != null) {
      return Container(
        width: size,
        height: size,
        decoration: _box(),
        clipBehavior: Clip.antiAlias,
        child: Center(
          child: ChipsEmblemView(
              id: emb, size: (size * 0.72).roundToDouble(), animate: animate),
        ),
      );
    }

    final fx = normalizeFx(item.config);
    final colors = (fx.border.style != BorderStyleFx.solid &&
            fx.border.gradientColors.length >= 2)
        ? fx.border.colors
        : [parseCssColor(fx.border.color), parseCssColor(fx.border.color)];

    return Container(
      width: size,
      height: size,
      decoration: _box(),
      child: Center(
        child: Container(
          width: size - 16,
          height: size - 16,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: colors,
            ),
            boxShadow: fx.glow.enabled
                ? [
                    BoxShadow(
                      color: parseCssColor(fx.glow.color),
                      blurRadius: fx.glow.size < 14 ? fx.glow.size : 14,
                    ),
                  ]
                : null,
          ),
          // الحشوة تكشف الوسط فتصير الحلقة حدّاً — مقابل قناع CSS
          child: Padding(
            padding: EdgeInsets.all(
                fx.border.width < 2 ? 2 : fx.border.width),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0xFF000000),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
  }

  // ── اللقب: اللوحة الحقيقية لا نسخةً يدوية ──
  Widget _title() => Container(
        constraints: BoxConstraints(minWidth: size, minHeight: size),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: _box(),
        child: Center(
          child: TitlePlaqueView(
            text: (item.config?['text'] as String?) ?? 'لقب',
            style: item.config?['style'] as String?,
            plaque: item.config?['plaque'],
            animate: animate,
          ),
        ),
      );

  // ── تأثير الاسم: اسم اللاعب نفسه بالتأثير المعروض للبيع ──
  Widget _nameFx() {
    // نفس باني الأنماط الذي تستعمله البطاقة — فلا تعرض المعاينة غير ما يُرسم
    final raw = Map<String, dynamic>.from(
        (item.config?['nameEffect'] as Map?) ?? const {});
    raw['enabled'] = true;
    return Container(
      constraints: BoxConstraints(minWidth: size, minHeight: size),
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: _box(),
      child: Center(
        child: NameFxText(
          text: playerName,
          fx: normalizeNameFx(raw),
          animate: animate,
          baseStyle: const TextStyle(
            fontFamily: 'Amiri',
            fontWeight: FontWeight.w900,
            fontSize: 15,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }

  // ── التشريفة: ملصقٌ بلون تخطيطها ──
  Widget _entrance() {
    final t = _entranceTone[item.config?['design']] ?? _entranceTone['file']!;
    return Container(
      width: size,
      height: size,
      decoration: _box(bg: t.bg, border: t.bd),
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('🚪', style: TextStyle(fontSize: 14, height: 1.1)),
          Text(t.label,
              style: TextStyle(
                fontFamily: 'Tajawal',
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.4,
                height: 1.1,
                color: t.fg,
              )),
        ]),
      ),
    );
  }

  // ── الإقصاء: لهبٌ حيّ بأصناف الحرق نفسها ──
  Widget _elimination() => Container(
        width: size,
        height: size,
        decoration: _box(
            bg: const Color(0xEB141216), border: const Color(0x59787882)),
        clipBehavior: Clip.antiAlias,
        child: Stack(alignment: Alignment.center, children: [
          Positioned.fill(
            child: EliminationFxView(config: item.config, animate: animate),
          ),
          const Text('☠︎',
              style: TextStyle(fontSize: 15, color: Color(0x8CFFFFFF))),
        ]),
      );

  // ── النغمة: مُعادِلٌ صوتيّ ساكن ──
  Widget _sting() => Container(
        width: size,
        height: size,
        decoration: _box(
            bg: const Color(0xE6061E18), border: const Color(0x6634D399)),
        child: Center(
          child: SizedBox(
            height: size * 0.46,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final h in const [0.5, 0.9, 0.65, 1.0, 0.75]) ...[
                  FractionallySizedBox(
                    heightFactor: h,
                    child: Container(
                      width: 3,
                      decoration: BoxDecoration(
                        color: const Color(0xFF34D399)
                            .withValues(alpha: 0.55 + h * 0.4),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(width: 2),
                ],
              ],
            ),
          ),
        ),
      );

  // ── المعزّز: هادئٌ عمداً — لا يُسوَّق كقوّة ──
  Widget _boost() => Container(
        width: size,
        height: size,
        decoration: _box(bg: const Color(0xE618181B)),
        child: Center(
          child: Text('×${item.config?['multiplier'] ?? 2}',
              style: const TextStyle(
                fontFamily: 'Tajawal',
                fontSize: 11,
                fontWeight: FontWeight.w900,
                letterSpacing: 0,
                color: Color(0xFFA1A1AA),
              )),
        ),
      );

  Widget _fallback() => Container(
        width: size,
        height: size,
        decoration: _box(),
        child: const Center(
          child: Text('🪙', style: TextStyle(fontSize: 18, color: Color(0x80FFFFFF))),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🔥 لهب الإقصاء — مبسَّطٌ إلى ثلاث ألسنة تتراقص
// ══════════════════════════════════════════════════════
class EliminationFxView extends StatelessWidget {
  const EliminationFxView({super.key, this.config, this.animate = true});

  final Map<String, dynamic>? config;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final c = parseCssColor(
        (config?['color'] as String?) ?? '#f97316', const Color(0xFFF97316));
    return IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
            colors: [
              c.withValues(alpha: 0.55),
              c.withValues(alpha: 0.12),
              Colors.transparent,
            ],
          ),
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}
