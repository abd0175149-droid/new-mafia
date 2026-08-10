import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// ⚙️ أوراق الاختيار — تُسأل قبل دخول الصنف السلّة
// ثلاث أوراق مطابقة سلوكيّاً لويب OrderPanel.tsx (نقل 2026-08-10):
//   OptionSheet  — صنفٌ مفرد بخياراته: الوصف كاملاً، الإلزاميّ أوّلاً،
//                  و«عادي» يُحدَّد مسبقاً في الإلزاميّة صفريّة الفرق.
//   PackageSheet — 🎁 مُهيّئ الباقة خانةً خانة (ثابتة · مقفلة · اختيار)،
//                  السعر ثابتٌ إلّا زيادةً معلَنة تُضرب في كمّية الخانة.
//   DetailSheet  — 📖 صنفٌ بلا خياراتٍ ووصفُه طويل: يُقرأ كاملاً ثمّ يُضاف.
// التحقّق هنا للراحة فقط — الخادم يعيد التحقّق والتسعير سيادياً.
// ══════════════════════════════════════════════════════

const _amber = Color(0xFFFCD34D);
const _amberBg = Color(0x33F59E0B);
const _amberBorder = Color(0x80F59E0B);
const _emeraldOn = Color(0x2E10B981);
const _emeraldOnBorder = Color(0x7310B981);

/// غلاف الورقة السفليّة الموحَّد: مقبضٌ، ترويسةٌ ثابتة، جسمٌ متمرّر، وذيلٌ ثابت.
Future<T?> _sheet<T>(BuildContext context, Widget Function(BuildContext) builder) =>
    showModalBottomSheet<T>(
      context: context,
      useRootNavigator: false,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xCC000000),
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxWidth: 512,
        maxHeight: MediaQuery.sizeOf(context).height * 0.88,
      ),
      builder: builder,
    );

class _SheetShell extends StatelessWidget {
  const _SheetShell({
    required this.title,
    required this.subtitle,
    required this.body,
    required this.footer,
    this.subtitleWarn = false,
  });

  final String title, subtitle;
  final bool subtitleWarn;
  final Widget body, footer;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: Color(0xFF0B0E0D),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: Color(0x1FFFFFFF))),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 44,
            height: 6,
            margin: const EdgeInsets.only(top: 12, bottom: 10),
            decoration: BoxDecoration(
              color: const Color(0x33FFFFFF),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: Row(children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(15, weight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: ar(10.5,
                            color: subtitleWarn ? _amber : Tw.gray500)),
                  ],
                ),
              ),
              InkWell(
                onTap: () => Navigator.of(context).pop(),
                borderRadius: BorderRadius.circular(999),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0x12FFFFFF),
                    border: Border.all(color: const Color(0x1FFFFFFF)),
                  ),
                  child: Center(child: Text('✕', style: ar(12, color: Tw.gray400))),
                ),
              ),
            ]),
          ),
          const Divider(height: 1, color: Color(0x12FFFFFF)),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
              child: body,
            ),
          ),
          const Divider(height: 1, color: Color(0x12FFFFFF)),
          Padding(
            padding: EdgeInsets.fromLTRB(
                20, 12, 20, 14 + MediaQuery.viewPaddingOf(context).bottom),
            child: footer,
          ),
        ]),
      );
}

/// زرّا الذيل المشتركان: تأكيدٌ متدرّجٌ زمرديّ + إلغاء.
Widget _footerRow(BuildContext context,
    {required String confirmText,
    required bool enabled,
    required VoidCallback onConfirm,
    String cancelText = 'إلغاء'}) {
  return Row(children: [
    Expanded(
      child: Opacity(
        opacity: enabled ? 1 : 0.4,
        child: InkWell(
          onTap: enabled ? onConfirm : null,
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
              child: Text(confirmText, style: ar(13.5, weight: FontWeight.bold)),
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
        child: Text(cancelText, style: ar(13.5, color: Tw.gray400)),
      ),
    ),
  ]);
}

/// شريحة قيمة خيار — كهرمانيّة عند الاختيار.
Widget _valueChip(FnbOptionValue v, bool on, VoidCallback onTap) => InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(9),
          color: on ? _amberBg : const Color(0x0AFFFFFF),
          border: Border.all(color: on ? _amberBorder : const Color(0x14FFFFFF)),
        ),
        child: Text(v.label, style: ar(11.5, color: on ? _amber : Tw.gray300)),
      ),
    );

/// بطاقة مجموعةٍ مرقّمة بحالة إنجاز — نمط «الخانات» الموحَّد مع الويب.
Widget _groupCard({
  required int index,
  required bool done,
  required Widget header,
  required Widget body,
}) =>
    Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: done ? const Color(0x0D10B981) : const Color(0x06FFFFFF),
        border: Border.all(
            color: done ? const Color(0x4D10B981) : const Color(0x47F59E0B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? const Color(0xFF34D399) : const Color(0x14FFFFFF),
              ),
              child: Center(
                child: Text(done ? '✓' : '$index',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: done ? Colors.black : Tw.gray400)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(child: header),
          ]),
          const SizedBox(height: 8),
          body,
        ],
      ),
    );

// ══════════════════════════════════════════════════════
// ⚙️ ورقة خيارات صنفٍ مفرد
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
  /// groupKey → قيمٌ مختارة.
  late final Map<String, List<String>> _sel = _preselect();

  /// الإلزاميّ أوّلاً — ما يمنع الإرسال يتصدّر.
  late final List<FnbOptionGroup> _groups = [...widget.item.optionGroups]
    ..sort((a, b) => (b.isRequired ? 1 : 0) - (a.isRequired ? 1 : 0));

  /// ✅ «عادي» يُحدَّد مسبقاً في الإلزاميّة الأحاديّة صفريّة الفرق (الدرجة على
  /// الساندويشات) — القاعدة تلتقط الاسم «عادي» حصراً فلا تُرسَل نكهةٌ لم تُقصَد.
  Map<String, List<String>> _preselect() {
    final out = <String, List<String>>{};
    for (final g in widget.item.optionGroups) {
      if (g.isRequired && !g.isMulti) {
        final normal = g.values
            .where((v) => v.name == 'عادي' && v.priceDelta == 0)
            .firstOrNull;
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
        next = (cur.isNotEmpty && cur.first == valueKey && !g.isRequired)
            ? const []
            : [valueKey];
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
    final missing = <String>[
      for (final g in _groups)
        if (g.isRequired && (_sel[g.key]?.isEmpty ?? true)) g.name,
    ];

    var delta = 0.0;
    final labels = <String>[];
    final options = <FnbSelection>[];
    for (final g in _groups) {
      for (final vk in (_sel[g.key] ?? const <String>[])) {
        final v = g.values.where((x) => x.key == vk).firstOrNull;
        if (v == null) continue;
        delta += v.priceDelta;
        labels.add('${g.name}: ${v.name}');
        options.add(FnbSelection(groupKey: g.key, valueKey: vk));
      }
    }
    final unitPrice = widget.item.priceValue + delta;

    return _SheetShell(
      title: widget.item.name,
      subtitle: _groups.length > 1
          ? '${_groups.length} اختيارات مطلوبة'
          : 'اختر ثمّ أضف للسلّة',
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 📖 الوصف كاملاً — البطاقة تبتره والقرار يحتاجه (مكوّنات البرغر)
          if (widget.item.description.isNotEmpty) ...[
            Text(widget.item.description,
                style: ar(11.5, color: Tw.gray400, height: 1.7)),
            const SizedBox(height: 10),
            const Divider(height: 1, color: Color(0x1AFFFFFF)),
            const SizedBox(height: 12),
          ],
          for (var gi = 0; gi < _groups.length; gi++)
            _groupCard(
              index: gi + 1,
              done: (_sel[_groups[gi].key]?.isNotEmpty ?? false),
              header: Row(children: [
                Expanded(
                  child: Text(_groups[gi].name,
                      style: ar(12, weight: FontWeight.bold)),
                ),
                Text(_groups[gi].isRequired ? 'إلزاميّ' : 'اختياريّ',
                    style: ar(9.5,
                        color: _groups[gi].isRequired
                            ? const Color(0xFFF87171)
                            : Tw.gray600)),
                if (_groups[gi].isMulti) ...[
                  const SizedBox(width: 6),
                  Text('حتى ${_groups[gi].maxSelect}',
                      style: ar(9, color: Tw.gray600)),
                ],
              ]),
              body: Wrap(spacing: 6, runSpacing: 6, children: [
                for (final v in _groups[gi].values)
                  _valueChip(v, (_sel[_groups[gi].key] ?? const []).contains(v.key),
                      () => _pick(_groups[gi], v.key)),
              ]),
            ),
          if (missing.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0x1AEF4444),
                border: Border.all(color: const Color(0x40EF4444)),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Text('يلزم اختيار: ${missing.join(' · ')}',
                  style: ar(11, color: const Color(0xFFFCA5A5))),
            ),
        ],
      ),
      footer: _footerRow(
        context,
        confirmText: missing.isNotEmpty
            ? 'اختر: ${missing.join(' · ')}'
            : 'أضف للسلّة • ${jod(unitPrice)}',
        enabled: missing.isEmpty,
        onConfirm: () => Navigator.of(context).pop(FnbCartLine(
          key: FnbCartLine.makeKey(widget.item.id, options, const []),
          itemId: widget.item.id,
          name: widget.item.name,
          quantity: 1,
          unitPrice: unitPrice,
          label: labels.join(' · '),
          options: options,
        )),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// 🎁 مُهيّئ الباقة — خانةٌ خانة
// ══════════════════════════════════════════════════════

Future<FnbCartLine?> showPackageSheet(BuildContext context, FnbMenuItem item) =>
    _sheet<FnbCartLine>(context, (_) => _PackageSheet(item: item));

class _PackageSheet extends StatefulWidget {
  const _PackageSheet({required this.item});
  final FnbMenuItem item;

  @override
  State<_PackageSheet> createState() => _PackageSheetState();
}

class _PackageSheetState extends State<_PackageSheet> {
  /// slot.i → معرّف الصنف المُنتقى (الثابتة تُملأ فوراً).
  late final Map<int, int?> _chosen = {
    for (final s in widget.item.slots) s.i: s.isChoice ? null : s.menuItemId,
  };

  /// slot.i → groupKey → valueKey (أحاديّ داخل الباقات).
  final Map<int, Map<String, String>> _opts = {};

  List<FnbOptionGroup> _groupsOf(FnbSlot s) {
    if (!s.isChoice) return s.optionGroups;
    final id = _chosen[s.i];
    return s.from.where((c) => c.menuItemId == id).firstOrNull?.optionGroups ??
        const [];
  }

  String _nameOf(FnbSlot s) {
    if (!s.isChoice) return s.name;
    final id = _chosen[s.i];
    return s.from.where((c) => c.menuItemId == id).firstOrNull?.name ?? '';
  }

  bool _slotDone(FnbSlot s) {
    if (_chosen[s.i] == null) return false;
    return _groupsOf(s)
        .where((g) => g.isRequired)
        .every((g) => _opts[s.i]?[g.key] != null);
  }

  @override
  Widget build(BuildContext context) {
    final slots = widget.item.slots;
    final done = slots.where(_slotDone).length;
    final ready = done == slots.length;

    // 💰 زيادةٌ معلَنة تمرّ فوق سعر الباقة — × كمّية الخانة كما في الخادم
    var extra = 0.0;
    for (final s in slots) {
      for (final g in _groupsOf(s)) {
        final vk = _opts[s.i]?[g.key];
        final v = g.values.where((x) => x.key == vk).firstOrNull;
        if (v != null) extra += v.priceDelta * s.qty;
      }
    }
    final base = widget.item.priceValue;
    final unitPrice = base + extra;

    return _SheetShell(
      title: '🎁 ${widget.item.name}',
      subtitle: extra > 0
          ? '${jod(base)} + ${jod(extra)} زيادة اختيارك = ${jod(unitPrice)} • اكتمل $done من ${slots.length}'
          : 'سعرٌ ثابت ${jod(base)} • اكتمل $done من ${slots.length}',
      subtitleWarn: extra > 0,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.item.description.isNotEmpty) ...[
            Text(widget.item.description,
                style: ar(11.5, color: Tw.gray400, height: 1.7)),
            const SizedBox(height: 12),
          ],
          for (var si = 0; si < slots.length; si++) _slotCard(slots[si], si),
          Center(
            child: Text('اختياراتك لا تغيّر السعر — إلّا ما عليه زيادةٌ معلَنة',
                style: ar(10, color: Tw.gray600)),
          ),
        ],
      ),
      footer: _footerRow(
        context,
        confirmText: ready
            ? 'أضف الباقة • ${jod(unitPrice)}'
            : 'أكمل ${slots.length - done} خانة',
        enabled: ready,
        onConfirm: () {
          final picks = <FnbSlotPick>[
            for (final s in slots)
              FnbSlotPick(
                i: s.i,
                menuItemId: s.isChoice ? _chosen[s.i] : null,
                options: [
                  for (final e in (_opts[s.i] ?? const <String, String>{}).entries)
                    FnbSelection(groupKey: e.key, valueKey: e.value),
                ],
              ),
          ];
          final label = slots.map((s) {
            final picked = <String>[
              ...s.lockedOptions.values,
              for (final e in (_opts[s.i] ?? const <String, String>{}).entries)
                _groupsOf(s)
                        .where((g) => g.key == e.key)
                        .firstOrNull
                        ?.values
                        .where((v) => v.key == e.value)
                        .firstOrNull
                        ?.name ??
                    '',
            ]..removeWhere((x) => x.isEmpty);
            return '${_nameOf(s)}${picked.isEmpty ? '' : ' (${picked.join(' · ')})'}';
          }).join(' + ');
          Navigator.of(context).pop(FnbCartLine(
            key: FnbCartLine.makeKey(widget.item.id, const [], picks),
            itemId: widget.item.id,
            name: widget.item.name,
            quantity: 1,
            unitPrice: unitPrice,
            label: label,
            isBundle: true,
            slots: picks,
          ));
        },
      ),
    );
  }

  Widget _slotCard(FnbSlot s, int si) {
    final groups = _groupsOf(s);
    return _groupCard(
      index: si + 1,
      done: _slotDone(s),
      header: Row(children: [
        Expanded(
          child: Text(
            s.isChoice ? s.label : (s.qty > 1 ? '${s.name} ×${s.qty}' : s.name),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ar(12, weight: FontWeight.bold),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            color: s.isChoice ? const Color(0x2410B981) : const Color(0x0FFFFFFF),
            border: s.isChoice
                ? Border.all(color: const Color(0x4D10B981))
                : null,
          ),
          child: Text(s.isChoice ? 'اختيارك' : 'ثابت',
              style: ar(9.5,
                  color: s.isChoice ? const Color(0xFF6EE7B7) : Tw.gray400)),
        ),
      ]),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (s.isChoice) ...[
            if (s.note.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(s.note, style: ar(10, color: Tw.gray500)),
              ),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final c in s.from) _candidateChip(s, c),
            ]),
          ],
          // 🔒 الخيار المقفل يُعرض للعلم ولا يُسأل — العرض حدّده وسعره محسوبٌ فيه
          for (final e in s.lockedOptions.entries) ...[
            const SizedBox(height: 8),
            Text(e.key, style: ar(10, color: _amber, weight: FontWeight.bold)),
            const SizedBox(height: 4),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                color: const Color(0x0AFFFFFF),
                border: Border.all(color: const Color(0x1FFFFFFF)),
              ),
              child: Text('🔒 ${e.value} — محدَّدٌ في العرض',
                  style: ar(10, color: Tw.gray400)),
            ),
          ],
          for (final g in groups) ...[
            const SizedBox(height: 8),
            Text(g.name, style: ar(10, color: _amber, weight: FontWeight.bold)),
            const SizedBox(height: 4),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final v in g.values)
                _valueChip(v, _opts[s.i]?[g.key] == v.key, () {
                  setState(() {
                    final m = _opts[s.i] ??= <String, String>{};
                    if (m[g.key] == v.key) {
                      m.remove(g.key);
                    } else {
                      m[g.key] = v.key;
                    }
                  });
                }),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _candidateChip(FnbSlot s, FnbSlotCandidate c) {
    final on = _chosen[s.i] == c.menuItemId;
    return InkWell(
      onTap: () => setState(() {
        // 🔴 مفاتيح خيارات المرشّح السابق كانت ستُفسَّر على مجموعات الجديد —
        //    تُمسح مع كلّ تبديل (نفس إصلاح الويب)
        _opts[s.i] = <String, String>{};
        _chosen[s.i] = on ? null : c.menuItemId;
      }),
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(9),
          color: on ? _emeraldOn : const Color(0x0AFFFFFF),
          border:
              Border.all(color: on ? _emeraldOnBorder : const Color(0x14FFFFFF)),
        ),
        child: Text(c.name,
            style: ar(11.5,
                color: on ? const Color(0xFF6EE7B7) : Tw.gray300)),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// 📖 ورقة تفصيل صنفٍ بلا خيارات — الوصف الطويل يُقرأ هنا كاملاً
// ══════════════════════════════════════════════════════

/// تعيد true إن ضغط اللاعب «أضف».
Future<bool?> showDetailSheet(BuildContext context, FnbMenuItem item) =>
    _sheet<bool>(
      context,
      (ctx) => _SheetShell(
        title: item.name,
        subtitle: item.priceText,
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            // الصورة قبل الوصف — كما في الويب: هي ما يبيع الطبق
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
          ctx,
          confirmText: 'أضف للسلّة • ${item.priceText}',
          enabled: true,
          onConfirm: () => Navigator.of(ctx).pop(true),
          cancelText: 'إغلاق',
        ),
      ),
    );

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
