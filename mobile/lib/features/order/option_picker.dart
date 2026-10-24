import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';
import 'order_widgets.dart';

// ══════════════════════════════════════════════════════
// 🎁 مُركِّب العرض — خطوةٌ لكلّ قرار (تصميم «الرفّ»، مكبَّر 2026-10-24)
// ══════════════════════════════════════════════════════
// بدل ورقةٍ واحدةٍ طويلة تحوي ٢٥ مرشّحاً وثماني نكهاتٍ بشرائح صغيرة:
//   نكهة الأرجيلة ← اختر مشروبك ← نكهة المشروب (إن وُجدت) ← راجع وأضف.
// الخطوات تُعاد حسابها بعد كلّ اختيار: مرشّحٌ بلا خياراتٍ لا يُضيف خطوة.
// الاختيار يتقدّم وحده؛ «التالي» لمن يعيد النظر. بلاطاتٌ ≥ ٥٦.
// العنوان سؤال الخطوة («اختر مشروبك الخفيف») لا اسم العرض — والمرشّحون
// الكثر (٣٦ مشروباً في Best View) يُجمَعون بأقسامهم من المنيو.
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
            constraints: const BoxConstraints(minHeight: kTap),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0x0DFFFFFF),
              border: Border.all(color: const Color(0x1FFFFFFF)),
            ),
            child: Text(secondaryText, style: ar(15, color: kInkMid, weight: FontWeight.bold)),
          ),
        ),
      ],
    ]);

// ══════════════════════════════════════════════════════
// 🎁 المُركِّب المتدرّج
// ══════════════════════════════════════════════════════

/// [sectionOf] يعيد قسم صنفٍ في المنيو — به يُجمَع المرشّحون الكثر.
Future<FnbCartLine?> showBundleWizard(BuildContext context, FnbMenuItem item,
        {String Function(int menuItemId)? sectionOf}) =>
    _sheet<FnbCartLine>(context, (_) => _BundleWizard(item: item, sectionOf: sectionOf));

/// الاسم القديم يبقى للمستدعين.
Future<FnbCartLine?> showPackageSheet(BuildContext context, FnbMenuItem item) =>
    showBundleWizard(context, item);

/// من هذا العدد فصاعداً تُجمَع المرشّحات بأقسامها.
const _groupCandidatesFrom = 9;

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
  const _BundleWizard({required this.item, this.sectionOf});
  final FnbMenuItem item;
  final String Function(int menuItemId)? sectionOf;

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

  /// بلاطات مرشّحي خانةٍ — مجموعةً بأقسامها إن كثروا وتعدّدت أقسامهم.
  Widget _choiceTiles(FnbSlot slot, int? cur, ValueChanged<String> onPick) {
    ({String key, String name, String? sub}) tile(FnbSlotCandidate c) => (
          key: '${c.menuItemId}',
          name: c.name,
          sub: c.optionGroups.isEmpty
              ? null
              : FnbMenuItem(id: 0, name: '', optionGroups: c.optionGroups).optionValuesLine,
        );
    final selected = {if (cur != null) '$cur'};
    final sectionOf = widget.sectionOf;
    if (sectionOf == null || slot.from.length < _groupCandidatesFrom) {
      return OptionTiles(values: [for (final c in slot.from) tile(c)], selected: selected, onPick: onPick);
    }
    final groups = <String, List<FnbSlotCandidate>>{};
    for (final c in slot.from) {
      (groups[sectionOf(c.menuItemId)] ??= []).add(c);
    }
    if (groups.length < 2) {
      return OptionTiles(values: [for (final c in slot.from) tile(c)], selected: selected, onPick: onPick);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final e in groups.entries) ...[
        Text(e.key, style: ar(14, color: kGoldFg, weight: FontWeight.bold)),
        const SizedBox(height: 8),
        OptionTiles(values: [for (final c in e.value) tile(c)], selected: selected, onPick: onPick),
        const SizedBox(height: 16),
      ],
    ]);
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
            Text(slot.note, style: ar(13.5, color: kInkLow, height: 1.5)),
            const SizedBox(height: 10),
          ],
          _choiceTiles(
            slot,
            cur,
            (k) => setState(() {
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
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: kGoldBg,
            border: Border.all(color: kGoldBorder),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final s in widget.item.slots)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [
                  const Text('✓', style: TextStyle(color: Color(0xFFD9B563), fontSize: 15)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('${_nameOf(s)}${s.qty > 1 ? ' ×${s.qty}' : ''}',
                        style: ar(15, weight: FontWeight.bold)),
                  ),
                  Flexible(
                    child: Text(_valsOf(s).join(' · '),
                        textAlign: TextAlign.end, style: ar(13, color: const Color(0xFFD7BF86))),
                  ),
                ]),
              ),
            if (widget.item.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(widget.item.description, style: ar(13.5, color: kInkMid, height: 1.6)),
            ],
            if (_extra > 0) ...[
              const SizedBox(height: 6),
              Text('زيادة اختيارك المعلَنة: +${jod(_extra)}', style: ar(13.5, color: kAmberFg)),
            ],
          ]),
        );
    }

    return OrderSheetShell(
      title: stepTitle,
      subtitle: 'الخطوة ${i + 1} من ${steps.length} · ${jod(unitPrice)} · ${widget.item.name}',
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
            Text(item.description, style: ar(15, color: kInkMid, height: 1.75)),
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
