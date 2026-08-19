import 'package:flutter/material.dart';

// ══════════════════════════════════════════════════════
// 🎬 STORE-2 — عناصر التشريفة المؤلَّفة
// ══════════════════════════════════════════════════════
// 🔴 لماذا: التطبيق لم يكن يعرف `design == 'custom'` فيُسقط التشريفة
//    المؤلَّفة إلى قالب «موكب العرّاب» الجاهز — **فيعاين المشتري منتجاً
//    غير الذي سيشتريه**، وهو أسوأ من غياب المعاينة.
//
// 🔴 والحدود منقولةٌ من `frontend/src/lib/entrance-schema.ts` حرفياً:
//    نفس المدى ونفس الافتراضيّات ونفس القصّ. اختلافُ حدٍّ واحد يعني
//    تشريفةً تظهر هنا غير ما تظهر على شاشة القاعة — والمؤلّف يضبطها هناك.

const kEntranceTypes = {
  'wash', 'bar', 'emblem', 'seal', 'sparks', 'name', 'text'
};
const kEntranceEnterFx = {'fade', 'slide', 'scale', 'stamp', 'flip'};
const kEntranceFrom = {'top', 'bottom', 'left', 'right', 'center'};

/// حدّ أعلى للعناصر — مسرحٌ مزدحم لا يُقرأ من ثلاثة أمتار.
const kMaxEntranceElements = 10;

class EntranceElement {
  const EntranceElement({
    required this.id,
    required this.type,
    required this.x,
    required this.y,
    required this.size,
    required this.color,
    required this.color2,
    required this.text,
    required this.emblemId,
    required this.enterFx,
    required this.from,
    required this.delayMs,
    required this.durationMs,
    required this.opacity,
  });

  final String id, type, text, emblemId, enterFx, from;

  /// الموضع **نسبةً مئويّة من المركز** — يبقى صحيحاً على أيّ مقاس.
  final double x, y, size, opacity;
  final Color color, color2;
  final int delayMs, durationMs;

  static const _defaultColor = Color(0xFFFCD34D);
  static const _defaultColor2 = Color(0xFFF59E0B);

  static double _num(dynamic v, double f, double lo, double hi) {
    final n = v is num ? v.toDouble() : double.tryParse('$v');
    if (n == null || !n.isFinite) return f;
    return n.clamp(lo, hi).toDouble();
  }

  static String _one(dynamic v, Set<String> allowed, String f) =>
      (v is String && allowed.contains(v)) ? v : f;

  /// `#RRGGBB` وحدها — أيّ صيغةٍ أخرى تسقط على الافتراضيّ.
  static Color _hex(dynamic v, Color f) {
    if (v is! String || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(v)) return f;
    return Color(int.parse('FF${v.substring(1)}', radix: 16));
  }

  factory EntranceElement.fromJson(Map raw, int i) => EntranceElement(
        id: (raw['id'] is String && '${raw['id']}'.isNotEmpty)
            ? '${raw['id']}'.substring(0, '${raw['id']}'.length.clamp(0, 24))
            : 'el$i',
        type: _one(raw['type'], kEntranceTypes, 'text'),
        x: _num(raw['x'], 0, -50, 50),
        y: _num(raw['y'], 0, -50, 50),
        size: _num(raw['size'], 100, 10, 400),
        color: _hex(raw['color'], _defaultColor),
        color2: _hex(raw['color2'], _defaultColor2),
        text: raw['text'] is String
            ? '${raw['text']}'.substring(0, '${raw['text']}'.length.clamp(0, 40))
            : '',
        emblemId: raw['emblemId'] is String ? '${raw['emblemId']}' : 'don',
        enterFx: _one(raw['enterFx'], kEntranceEnterFx, 'fade'),
        from: _one(raw['from'], kEntranceFrom, 'center'),
        // 🔴 التأخير مقصوصٌ دون المدّة القصوى، وإلّا وُضع عنصرٌ لا يظهر أبداً.
        delayMs: _num(raw['delayMs'], 0, 0, 5500).truncate(),
        durationMs: _num(raw['durationMs'], 600, 100, 3000).truncate(),
        opacity: _num(raw['opacity'], 1, 0, 1),
      );

  /// يقرأ قائمة العناصر من `config` أيّاً كان شكلها، بحدّ أقصى عشرة.
  static List<EntranceElement> parse(dynamic raw) {
    final list = raw is Map ? raw['elements'] : raw;
    if (list is! List) return const [];
    final out = <EntranceElement>[];
    for (var i = 0; i < list.length && out.length < kMaxEntranceElements; i++) {
      final e = list[i];
      if (e is Map) out.add(EntranceElement.fromJson(e, i));
    }
    return out;
  }

  /// آخر لحظةٍ ينتهي عندها شيء — تُحدِّد طول المعاينة.
  static int totalMs(List<EntranceElement> els) => els.isEmpty
      ? 0
      : els
          .map((e) => e.delayMs + e.durationMs)
          .reduce((a, b) => a > b ? a : b);
}
