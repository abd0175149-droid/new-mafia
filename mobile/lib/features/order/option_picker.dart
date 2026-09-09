import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';
import 'order_widgets.dart';

// ══════════════════════════════════════════════════════
// 🎁 مُركِّب العرض — خطوةٌ لكلّ قرار (تصميم «الرفّ» 2026-09-09)
// ══════════════════════════════════════════════════════
// بدل ورقةٍ واحدةٍ طويلة تحوي ٢٥ مرشّحاً وثماني نكهاتٍ بشرائح صغيرة:
//   نكهة الأرجيلة ← اختر مشروبك ← نكهة المشروب (إن وُجدت) ← راجع وأضف.
// الخطوات تُعاد حسابها بعد كلّ اختيار: مرشّحٌ بلا خياراتٍ لا يُضيف خطوة.
// الاختيار يتقدّم وحده؛ «التالي» لمن يعيد النظر. بلاطاتٌ ≥ ٥٦ بكسل.
// 💰 فرق خيارٍ معلَن × كمّية الخانة — مطابقةً لحساب الخادم.
// 📖 DetailSheet تبقى: صنفٌ بلا خياراتٍ ووصفُه طويل يُقرأ ثمّ يُضاف.
// ══════════════════════════════════════════════════════

Future<T?> _sheet<T>(BuildContext context, Widget Function(BuildContext) builder) =>
    showModalBottomSheet<T>(
      context: context,
      // 🔴 الجذر لا الفرع — وإلّا حجب شريطُ تنقّل الغلاف أزرارَ الورقة السفليّة
      useRootNavigator: true,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xCC000000),
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxWidth: 512,
        maxHeight: MediaQuery.sizeOf(context).height * 0.88,
      ),
      builder: builder,
    );

/// ذيلٌ مشترك: تأكيدٌ ذهبيّ + رجوع/إلغاء.
Widget _footerRow({
  required String confirmText,
  required bool enabled,
  required VoidCallback onConfirm,
  String? secondaryText,
  VoidCallback? onSecondary,
}) =>
    Row(children: [
      Expanded(child: GoldButton(label: confirmText, onTap: onConfirm, enabled: enabled)),
      if (secondaryText != null) ...[
        const SizedBox(width: 8),
        InkWell(
          onTap: onSecondary,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0x0DFFFFFF),
              border: Border.all(color: const Color(0x1AFFFFFF)),
            ),
            child: Text(secondaryText, style: ar(13.5, color: Tw.gray400)),
          ),
        ),
      ],
    ]);

// ══════════════════════════════════════════════════════
// ⚙️ ورقة خيارات صنفٍ مفرد — تبقى لمن يفضّلها من المستدعين (بلاطات كبيرة)
// ══════════════════════════════════════════════════════

/// يعيد سطر سلّةٍ جاهزاً، أو null إن ألغى اللاعب.
Future<FnbCartLine?> showOptionPicker(BuildContext context, FnbMenuItem item) =>
    _sheet<FnbCartLine>(context, (_) => _OptionSheet(item: item));

class _OptionSheet extends StatefulWidget {
  const _OptionSheet({required this.item});
  final FnbMenuItem item;

  @override
  State<_OptionSheet> createState() => _OptionSheetState();
}

class _OptionSheetState extends State<_OptionSheet> {
  late final Map<String, List<String>> _sel = _preselect();
  int _qty = 1;

  /// ✅ «عادي» يُحدَّد مسبقاً في الإلزاميّة الأحاديّة صفريّة الفرق.
  Map<String, List<String>> _preselect() {
    final out = <String, List<String>>{};
    for (final g in widget.item.optionGroups) {
      if (g.isRequired && !g.isMulti) {
        final normal = g.values.where((v) => v.name == 'عادي' && v.priceDelta == 0).firstOrNull;
        if (normal != null) out[g.key] = [normal.key];
      }
    }
    return out;
  }

  void _pick(FnbOptionGroup g, String valueKey) {
    setState(() {
      final cur = _sel[g.key] ?? const <String>[];
      List<String> next;
      if (!g.isMulti) {
        next = (cur.isNotEmpty && cur.first == valueKey && !g.isRequired) ? const [] : [valueKey];
      } else if (cur.contains(valueKey)) {
        next = cur.where((v) => v != valueKey).toList();
      } else {
        next = cur.length >= g.maxSelect ? cur : [...cur, valueKey];
      }
      _sel[g.key] = next;
    });
  }

  @override
  Widget build(BuildContext context) {
    final groups = widget.item.optionGroups;
    final missing = [for (final g in groups) if (g.isRequired && (_sel[g.key]?.isEmpty ?? true)) g.name];

    var delta = 0.0;
    final labels = <String>[];
    final options = <FnbSelection>[];
    for (final g in groups) {
      for (final vk in (_sel[g.key] ?? const <String>[])) {
        final v = g.values.where((x) => x.key == vk).firstOrNull;
        if (v == null) continue;
        delta += v.priceDelta;
        labels.add(v.name);
        options.add(FnbSelection(groupKey: g.key, valueKey: vk));
      }
    }
    final unitPrice = widget.item.priceValue + delta;

    return OrderSheetShell(
      title: widget.item.name,
      subtitle: '${widget.item.description.isNotEmpty ? widget.item.description : widget.item.optionHint} · ${widget.item.priceText}',
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final g in groups) ...[
            Text('${g.name}${g.isRequired ? '' : ' · اختياريّ'}',
                style: ar(11.5, color: const Color(0xFFD7BF86), weight: FontWeight.bold)),
            const SizedBox(height: 8),
            OptionTiles(
              values: [
                for (final v in g.values)
                  (key: v.key, name: v.name, sub: v.priceDelta > 0 ? '+${jod(v.priceDelta)}' : null),
              ],
              selected: (_sel[g.key] ?? const []).toSet(),
              onPick: (k) => _pick(g, k),
            ),
            const SizedBox(height: 12),
          ],
          Row(children: [
            Text('الكمّية', style: ar(12.5, color: Tw.gray300)),
            const Spacer(),
            _qtyBtn('−', () => setState(() => _qty = _qty > 1 ? _qty - 1 : 1)),
            SizedBox(width: 28, child: Center(child: ltrText('$_qty', num_(14)))),
            _qtyBtn('+', () => setState(() => _qty = _qty < kMaxQtyPerItem ? _qty + 1 : _qty), primary: true),
          ]),
        ],
      ),
      footer: _footerRow(
        confirmText: missing.isNotEmpty
            ? 'اختر ${missing.join(' و')}'
            : 'أضف${_qty > 1 ? ' ×$_qty' : ''} · ${jod(unitPrice * _qty)}',
        enabled: missing.isEmpty,
        onConfirm: () => Navigator.of(context).pop(FnbCartLine(
          key: FnbCartLine.makeKey(widget.item.id, options, const []),
          itemId: widget.item.id,
          name: widget.item.name,
          quantity: _qty,
          unitPrice: unitPrice,
          label: labels.join(' · '),
          options: options,
        )),
      ),
    );
  }

  Widget _qtyBtn(String g, VoidCallback onTap, {bool primary = false}) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(9),
            color: primary ? kGoldBg : const Color(0x0DFFFFFF),
            border: Border.all(color: primary ? kGoldBorder : const Color(0x1AFFFFFF)),
          ),
          child: Center(child: Text(g, style: ar(16, color: primary ? kGoldFg : Colors.white, weight: FontWeight.bold))),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🎁 المُركِّب المتدرّج
// ══════════════════════════════════════════════════════

Future<FnbCartLine?> showBundleWizard(BuildContext context, FnbMenuItem item) =>
    _sheet<FnbCartLine>(context, (_) => _BundleWizard(item: item));

/// الاسم القديم يبقى للمستدعين.
Future<FnbCartLine?> showPackageSheet(BuildContext context, FnbMenuItem item) =>
    showBundleWizard(context, item);

class _Pick {
  int? menuItemId;
  final Map<String, String> options = {};
}

sealed class _Step {
  const _Step();
}

class _ChoiceStep extends _Step {
  const _ChoiceStep(this.slot);
  final FnbSlot slot;
}

class _OptStep extends _Step {
  const _OptStep(this.slot, this.group);
  final FnbSlot slot;
  final FnbOptionGroup group;
}

class _DoneStep extends _Step {
  const _DoneStep();
}

class _BundleWizard extends StatefulWidget {
  const _BundleWizard({required this.item});
  final FnbMenuItem item;

  @override
  State<_BundleWizard> createState() => _BundleWizardState();
}

class _BundleWizardState extends State<_BundleWizard> {
  late final Map<int, _Pick> _picks = {
    for (final s in widget.item.slots)
      s.i: _Pick()..menuItemId = s.isChoice ? null : s.menuItemId,
  };
  int _step = 0;

  List<FnbOptionGroup> _groupsOf(FnbSlot s) {
    if (!s.isChoice) return s.optionGroups;
    final id = _picks[s.i]?.menuItemId;
    return s.from.where((c) => c.menuItemId == id).firstOrNull?.optionGroups ?? const [];
  }

  String _nameOf(FnbSlot s) {
    if (!s.isChoice) return s.name;
    final id = _picks[s.i]?.menuItemId;
    return s.from.where((c) => c.menuItemId == id).firstOrNull?.name ?? '؟';
  }

  /// الخطوات تُعاد حسابها من الاختيارات الحاليّة — مرشّحٌ بلا خياراتٍ لا يضيف خطوة.
  List<_Step> get _steps {
    final out = <_Step>[];
    for (final s in widget.item.slots) {
      if (s.isChoice) out.add(_ChoiceStep(s));
      for (final g in _groupsOf(s)) {
        out.add(_OptStep(s, g));
      }
    }
    out.add(const _DoneStep());
    return out;
  }

  /// 🔴 المجموعة الاختياريّة (بابلز +١ · نكهة اللاتيه…) لا تحجز الخطوة: كانت
  ///    تُعامَل إلزاميّةً فيُجبَر اللاعب على «بابلز سموك +١» ليكمل العرض.
  ///    القيمة '' = «بدون» اختياراً صريحاً؛ الغياب = لم يمرّ بعد.
  bool _done(_Step st) => switch (st) {
        _ChoiceStep(:final slot) => _picks[slot.i]?.menuItemId != null,
        _OptStep(:final slot, :final group) =>
          !group.isRequired || _picks[slot.i]?.options[group.key] != null,
        _DoneStep() => true,
      };

  static const _none = '__none';

  double get _extra {
    var x = 0.0;
    for (final s in widget.item.slots) {
      for (final g in _groupsOf(s)) {
        final vk = _picks[s.i]?.options[g.key];
        final v = g.values.where((e) => e.key == vk).firstOrNull;
        if (v != null) x += v.priceDelta * s.qty;
      }
    }
    return x;
  }

  List<String> _valsOf(FnbSlot s) => [
        ...s.lockedOptions.values,
        for (final g in _groupsOf(s))
          ...g.values.where((v) => v.key == _picks[s.i]?.options[g.key]).map((v) => v.name),
      ];

  FnbCartLine _build() {
    final picks = <FnbSlotPick>[
      for (final s in widget.item.slots)
        FnbSlotPick(
          i: s.i,
          menuItemId: s.isChoice ? _picks[s.i]?.menuItemId : null,
          options: [
            for (final e in (_picks[s.i]?.options ?? const <String, String>{}).entries)
              if (e.value.isNotEmpty) FnbSelection(groupKey: e.key, valueKey: e.value),
          ],
        ),
    ];
    final label = widget.item.slots.map((s) {
      final vals = _valsOf(s);
      return '${_nameOf(s)}${vals.isEmpty ? '' : ' (${vals.join(' · ')})'}';
    }).join(' + ');
    return FnbCartLine(
      key: FnbCartLine.makeKey(widget.item.id, const [], picks),
      itemId: widget.item.id,
      name: widget.item.name,
      quantity: 1,
      unitPrice: widget.item.priceValue + _extra,
      label: label,
      isBundle: true,
      slots: picks,
    );
  }

  @override
  Widget build(BuildContext context) {
    final steps = _steps;
    final i = _step.clamp(0, steps.length - 1);
    final st = steps[i];
    final unitPrice = widget.item.priceValue + _extra;

    String stepTitle;
    Widget body;
    switch (st) {
      case _ChoiceStep(:final slot):
        stepTitle = slot.label;
        final cur = _picks[slot.i]?.menuItemId;
        body = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (slot.note.isNotEmpty) ...[
            Text(slot.note, style: ar(11, color: Tw.gray500)),
            const SizedBox(height: 8),
          ],
          OptionTiles(
            values: [
              for (final c in slot.from)
                (
                  key: '${c.menuItemId}',
                  name: c.name,
                  sub: c.optionGroups.isEmpty
                      ? null
                      : FnbMenuItem(id: 0, name: '', optionGroups: c.optionGroups).optionHint,
                ),
            ],
            selected: {if (cur != null) '$cur'},
            onPick: (k) => setState(() {
              // 🔴 خيارات المرشّح السابق تُمحى — وإلّا فُسِّرت على مجموعات الجديد
              _picks[slot.i] = _Pick()..menuItemId = int.tryParse(k);
              _step = i + 1;
            }),
          ),
        ]);
      case _OptStep(:final slot, :final group):
        stepTitle = '${group.name} · ${_nameOf(slot)}${group.isRequired ? '' : ' · اختياريّ'}';
        final cur = _picks[slot.i]?.options[group.key];
        body = OptionTiles(
          values: [
            if (!group.isRequired) (key: _none, name: 'بدون', sub: 'بلا إضافة'),
            for (final v in group.values)
              (key: v.key, name: v.name, sub: v.priceDelta > 0 ? '+${jod(v.priceDelta)}' : null),
          ],
          selected: {if (cur != null) (cur.isEmpty ? _none : cur)},
          onPick: (k) => setState(() {
            (_picks[slot.i] ??= _Pick()).options[group.key] = k == _none ? '' : k;
            _step = i + 1;
          }),
        );
      case _DoneStep():
        stepTitle = 'راجع العرض';
        body = Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            color: kGoldBg,
            border: Border.all(color: kGoldBorder),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final s in widget.item.slots)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  const Text('✓', style: TextStyle(color: Color(0xFFD9B563), fontSize: 13)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('${_nameOf(s)}${s.qty > 1 ? ' ×${s.qty}' : ''}',
                        style: ar(13, weight: FontWeight.bold)),
                  ),
                  Text(_valsOf(s).join(' · '), style: ar(11, color: const Color(0xFFD7BF86))),
                ]),
              ),
            if (widget.item.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(widget.item.description, style: ar(11, color: Tw.gray400, height: 1.6)),
            ],
            if (_extra > 0) ...[
              const SizedBox(height: 6),
              Text('زيادة اختيارك المعلَنة: +${jod(_extra)}', style: ar(11, color: kAmberFg)),
            ],
          ]),
        );
    }

    return OrderSheetShell(
      title: widget.item.name,
      subtitle: 'الخطوة ${arDigits(i + 1)} من ${arDigits(steps.length)} — $stepTitle · ${jod(unitPrice)}',
      progress: (i, steps.length),
      body: body,
      footer: st is _DoneStep
          ? _footerRow(
              confirmText: 'أضف العرض · ${jod(unitPrice)}',
              enabled: true,
              onConfirm: () => Navigator.of(context).pop(_build()),
              secondaryText: 'رجوع',
              onSecondary: () => setState(() => _step = i - 1),
            )
          : _footerRow(
              confirmText: _done(st) ? 'التالي' : 'اختر أوّلاً',
              enabled: _done(st),
              onConfirm: () => setState(() => _step = i + 1),
              secondaryText: i > 0 ? 'رجوع' : null,
              onSecondary: i > 0 ? () => setState(() => _step = i - 1) : null,
            ),
    );
  }
}

// ══════════════════════════════════════════════════════
// 📖 ورقة تفصيل صنفٍ بلا خيارات — الوصف الطويل يُقرأ هنا كاملاً
// ══════════════════════════════════════════════════════

/// تعيد true إن ضغط اللاعب «أضف».
Future<bool?> showDetailSheet(BuildContext context, FnbMenuItem item) => _sheet<bool>(
      context,
      (ctx) => OrderSheetShell(
        title: item.name,
        subtitle: item.priceText,
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (item.imageUrl != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: CachedNetworkImage(
                  imageUrl: ApiClient.instance.upload(item.imageUrl!),
                  height: 160,
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => const SizedBox.shrink(),
                  placeholder: (_, __) => const SizedBox(height: 160),
                ),
              ),
              const SizedBox(height: 12),
            ],
            Text(item.description, style: ar(13, color: Tw.gray300, height: 1.8)),
          ],
        ),
        footer: _footerRow(
          confirmText: 'أضف للسلّة · ${item.priceText}',
          enabled: true,
          onConfirm: () => Navigator.of(ctx).pop(true),
          secondaryText: 'إغلاق',
          onSecondary: () => Navigator.of(ctx).pop(),
        ),
      ),
    );

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
