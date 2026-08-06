import 'package:flutter/material.dart';

import '../../models/fnb.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// ⚙️ ورقة اختيار الخيارات — تُسأل قبل دخول الصنف السلّة
// تشمل خيارات الصنف نفسه **وخيارات مكوّنات الباقة** (قرار المالك: يُسأل
// اللاعب عند طلب باقةٍ أحد مكوّناتها يحتاج نكهةً أو حجماً).
// التحقّق هنا للراحة فقط — الخادم يعيد التحقّق والتسعير سيادياً.
// مطابقةٌ سلوكيّاً لورقة الويب في components/OrderPanel.tsx.
// ══════════════════════════════════════════════════════

const _amber = Color(0xFFFCD34D);
const _amberBg = Color(0x33F59E0B);
const _amberBorder = Color(0x80F59E0B);

/// يعيد سطر سلّةٍ جاهزاً، أو null إن ألغى اللاعب.
Future<FnbCartLine?> showOptionPicker(BuildContext context, FnbMenuItem item) =>
    showModalBottomSheet<FnbCartLine>(
      context: context,
      useRootNavigator: false,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xCC000000),
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxWidth: 512,
        maxHeight: MediaQuery.sizeOf(context).height * 0.85,
      ),
      builder: (_) => _OptionSheet(item: item),
    );

/// مجموعةٌ مع «مالكها»: '' للصنف نفسه، أو معرّف مكوّن الباقة.
class _Owned {
  const _Owned(this.owner, this.title, this.groups);
  final String owner, title;
  final List<FnbOptionGroup> groups;
}

class _OptionSheet extends StatefulWidget {
  const _OptionSheet({required this.item});
  final FnbMenuItem item;

  @override
  State<_OptionSheet> createState() => _OptionSheetState();
}

class _OptionSheetState extends State<_OptionSheet> {
  /// owner → groupKey → قيمٌ مختارة
  final Map<String, Map<String, List<String>>> _sel = {};

  List<_Owned> get _owned => [
        _Owned('', '', widget.item.optionGroups),
        for (final c in widget.item.components)
          if (c.optionGroups.isNotEmpty && c.menuItemId != null)
            _Owned('${c.menuItemId}', c.name, c.optionGroups),
      ].where((o) => o.groups.isNotEmpty).toList();

  void _pick(String owner, FnbOptionGroup g, String valueKey) {
    setState(() {
      final byGroup = _sel[owner] ??= <String, List<String>>{};
      final cur = byGroup[g.key] ?? const <String>[];
      List<String> next;
      if (!g.isMulti) {
        // إعادة الضغط تلغي الاختيار — إلّا في المجموعة الإلزاميّة
        next = (cur.isNotEmpty && cur.first == valueKey && !g.isRequired)
            ? const []
            : [valueKey];
      } else if (cur.contains(valueKey)) {
        next = cur.where((v) => v != valueKey).toList();
      } else {
        next = cur.length >= g.maxSelect ? cur : [...cur, valueKey];
      }
      byGroup[g.key] = next;
    });
  }

  @override
  Widget build(BuildContext context) {
    final owned = _owned;

    // كلّ مجموعةٍ إلزاميّة يجب أن تحمل اختياراً — وإلّا رفض الخادم الطلب
    final missing = <String>[
      for (final o in owned)
        for (final g in o.groups)
          if (g.isRequired && (_sel[o.owner]?[g.key]?.isEmpty ?? true))
            o.title.isEmpty ? g.name : '${g.name} (${o.title})',
    ];

    var delta = 0.0;
    final labels = <String>[];
    final options = <FnbSelection>[];
    final compOptions = <int, List<FnbSelection>>{};
    for (final o in owned) {
      for (final g in o.groups) {
        for (final vk in (_sel[o.owner]?[g.key] ?? const <String>[])) {
          final v = g.values.where((x) => x.key == vk).firstOrNull;
          if (v == null) continue;
          delta += v.priceDelta;
          labels.add(o.title.isEmpty ? '${g.name}: ${v.name}' : '${o.title}: ${v.name}');
          final s = FnbSelection(groupKey: g.key, valueKey: vk);
          if (o.owner.isEmpty) {
            options.add(s);
          } else {
            (compOptions[int.parse(o.owner)] ??= []).add(s);
          }
        }
      }
    }
    final unitPrice = widget.item.priceValue + delta;

    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF131008), Color(0xFF050505)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: _amberBorder)),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 48,
          height: 6,
          margin: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0x33FFFFFF),
            borderRadius: BorderRadius.circular(999),
          ),
        ),
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(widget.item.name, style: ar(16, weight: FontWeight.bold)),
                const SizedBox(height: 2),
                Text('اختر ما يناسبك ثمّ أضفه للسلّة',
                    style: ar(11, color: Tw.gray500)),
                const SizedBox(height: 16),
                for (final o in owned) ...[
                  if (o.title.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text('🎁 خيارات ${o.title}',
                          style: ar(10,
                              color: const Color(0xCCC4B5FD),
                              weight: FontWeight.bold)),
                    ),
                  for (final g in o.groups) _group(o.owner, g),
                ],
                if (missing.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0x1AEF4444),
                      border: Border.all(color: const Color(0x40EF4444)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('يلزم اختيار: ${missing.join(' · ')}',
                        style: ar(11, color: const Color(0xFFFCA5A5))),
                  ),
              ],
            ),
          ),
        ),
        // الأزرار خارج التمرير — تبقى في المتناول مهما طالت الخيارات
        Padding(
          padding: EdgeInsets.fromLTRB(
              20, 8, 20, 16 + MediaQuery.viewPaddingOf(context).bottom),
          child: Row(children: [
            Expanded(
              child: Opacity(
                opacity: missing.isEmpty ? 1 : 0.4,
                child: InkWell(
                  onTap: missing.isEmpty
                      ? () => Navigator.of(context).pop(FnbCartLine(
                            key: FnbCartLine.makeKey(widget.item.id, options, compOptions),
                            itemId: widget.item.id,
                            quantity: 1,
                            unitPrice: unitPrice,
                            label: labels.join(' · '),
                            options: options,
                            componentOptions: compOptions,
                          ))
                      : null,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF10B981), Color(0xFF0D9488)],
                      ),
                    ),
                    child: Center(
                      child: Text('أضف للسلّة • ${jod(unitPrice)}',
                          style: ar(14, weight: FontWeight.bold)),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            InkWell(
              onTap: () => Navigator.of(context).pop(),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0x0DFFFFFF),
                  border: Border.all(color: const Color(0x1AFFFFFF)),
                ),
                child: Text('إلغاء', style: ar(14, color: Tw.gray400)),
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _group(String owner, FnbOptionGroup g) {
    final cur = _sel[owner]?[g.key] ?? const <String>[];
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [
            Text(g.name, style: ar(12, color: _amber, weight: FontWeight.bold)),
            const SizedBox(width: 8),
            Text(g.isRequired ? 'إلزاميّ' : 'اختياريّ',
                style: ar(9,
                    color: g.isRequired ? const Color(0xFFF87171) : Tw.gray600)),
            if (g.isMulti) ...[
              const SizedBox(width: 8),
              Text('حتى ${g.maxSelect}', style: ar(9, color: Tw.gray600)),
            ],
          ]),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final v in g.values)
                _chip(v, cur.contains(v.key), () => _pick(owner, g, v.key)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chip(FnbOptionValue v, bool on, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: on ? _amberBg : const Color(0x0AFFFFFF),
            border: Border.all(color: on ? _amberBorder : const Color(0x14FFFFFF)),
          ),
          child: Text(v.label,
              style: ar(12, color: on ? _amber : Tw.gray300)),
        ),
      );
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
