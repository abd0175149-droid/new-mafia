import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🎭 شريط الفرق — كم بقي من كلّ فريق
//
// يُعرض للحيّ وللمُقصى معاً: المُقصى يتابع اللعبة ويحتاج قراءتها، والشريط لا
// يكشف هويّة أحد — الأعداد نفسها على شاشة القاعة أمام الجميع.
//
// 🔴 خانة المستقلّين تظهر **فقط إن أرسل الخادم عدّاً لهم وكان أكبر من صفر**.
//    عرض «٠ مستقلّون» يقول بالنفي «لا مهرّج هنا» — معلومةٌ لا تُمنح مجّاناً.
// ══════════════════════════════════════════════════════

class TeamBar extends StatelessWidget {
  const TeamBar({super.key, this.mafia, this.citizens, this.neutrals});

  final int? mafia;
  final int? citizens;
  final int? neutrals;

  @override
  Widget build(BuildContext context) {
    final m = mafia ?? 0;
    final c = citizens ?? 0;
    final n = neutrals ?? 0;

    // قبل توزيع الأدوار كلّها أصفار — لا شريط
    if (m + c + n == 0) return const SizedBox.shrink();

    final cells = <_Cell>[
      const _Cell('🔪', 'مافيا', Color(0xFFEF4444)),
      const _Cell('🛡️', 'مواطنون', Color(0xFF60A5FA)),
      if (n > 0) const _Cell('🎭', 'مستقلّون', Color(0xFFA78BFA)),
    ];
    final values = <int>[m, c, if (n > 0) n];

    return Row(
      children: [
        for (var i = 0; i < cells.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(child: _Chip(cell: cells[i], value: values[i])),
        ],
      ],
    );
  }
}

class _Cell {
  const _Cell(this.icon, this.label, this.color);
  final String icon;
  final String label;
  final Color color;
}

class _Chip extends StatelessWidget {
  const _Chip({required this.cell, required this.value});

  final _Cell cell;
  final int value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 8),
        decoration: BoxDecoration(
          color: const Color(0x8C000000),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: cell.color.withValues(alpha: 0.27)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(cell.icon, style: const TextStyle(fontSize: 13)),
            const SizedBox(width: 7),
            Text(
              '$value',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w900,
                color: cell.color,
                height: 1,
                shadows: [BoxShadow(color: cell.color.withValues(alpha: 0.55), blurRadius: 10)],
              ),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                cell.label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF8B9490), height: 1),
              ),
            ),
          ],
        ),
      );
}
