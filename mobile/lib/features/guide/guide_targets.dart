import 'package:flutter/widgets.dart';

// ══════════════════════════════════════════════════════
// 🎯 نقاط الإضاءة لجولة «الليلة الأولى» — مقابل سِمات data-guide في الويب (2026-11-22)
//
// `GuideTarget(id: …)` يغلّف عنصراً حقيقيّاً فيسجّله باسمه ما دام مركّباً. طبقة الدون
// تسأل السجلّ: هل الهدف ظاهر؟ وأين مستطيله على الشاشة؟ — ولا تعرف شيئاً عن الشاشة نفسها.
// الغلاف لا يغيّر الرسم ولا اللمس: في اللعب العاديّ لا أثر له إطلاقاً.
// ══════════════════════════════════════════════════════

class GuideTarget extends StatefulWidget {
  const GuideTarget({super.key, required this.id, required this.child});
  final String id;
  final Widget child;
  @override
  State<GuideTarget> createState() => _GuideTargetState();
}

class _GuideTargetState extends State<GuideTarget> {
  @override
  void initState() { super.initState(); GuideTargets._add(widget.id, this); }

  @override
  void didUpdateWidget(covariant GuideTarget old) {
    super.didUpdateWidget(old);
    if (old.id != widget.id) { GuideTargets._remove(old.id, this); GuideTargets._add(widget.id, this); }
  }

  @override
  void dispose() { GuideTargets._remove(widget.id, this); super.dispose(); }

  /// المستطيل على الشاشة — null إن لم يُرسم أو كان في تبويبٍ مخفيّ
  Rect? get rect {
    if (!mounted) return null;
    // تبويبات الغلاف المخفيّة تبقى مركّبة لكنّ TickerMode فيها مطفأ
    if (!TickerMode.getValuesNotifier(context).value.enabled) return null;
    final ro = context.findRenderObject();
    if (ro is! RenderBox || !ro.attached || !ro.hasSize) return null;
    final o = ro.localToGlobal(Offset.zero);
    final r = o & ro.size;
    if (r.width <= 0 || r.height <= 0) return null;
    return r;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class GuideTargets {
  GuideTargets._();
  static final Map<String, List<_GuideTargetState>> _m = {};

  static void _add(String id, _GuideTargetState s) => (_m[id] ??= []).add(s);
  static void _remove(String id, _GuideTargetState s) { _m[id]?.remove(s); if (_m[id]?.isEmpty ?? false) _m.remove(id); }

  /// آخر المركّبين أوّلاً: الورقة الأحدث فوق ما تحتها
  static _GuideTargetState? _visible(String id) {
    final l = _m[id];
    if (l == null) return null;
    for (final s in l.reversed) { if (s.rect != null) return s; }
    return null;
  }

  static bool has(String id) => _visible(id) != null;
  static Rect? rectOf(String id) => _visible(id)?.rect;
  static BuildContext? contextOf(String id) { final s = _visible(id); return s != null && s.mounted ? s.context : null; }
}
