import 'package:cached_network_image/cached_network_image.dart';
import 'package:dotted_border/dotted_border.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🍽️ قطع لوحة المنيو — «الرفّ» بالبلاطات المكبّرة (قرار 2026-10-24، مرآة OrderPanel.tsx)
// ══════════════════════════════════════════════════════
// لونٌ واحد بدل خمسة: **كهرمانيّ** التطبيق للفعل (أضف/اختر/السلّة)،
// **ذهبيّ** `#C5A059` للعروض والزرّ العائم، ودلاليّ للحالات فقط.
// السعر بلونٍ محايد — كان بلون الفعل فلا يتميّز الزرّ عن المعلومة.
// 📏 لا نصّ تحت 12.5 ولا هدف لمسٍ تحت 48 (معيار أندرويد).
// 🔢 أرقامٌ لاتينيّة في المنيو كلّه — لا «3» في الشريط و«٣ أصناف» في الدرج.

const kAmberFg = Color(0xFFFCD34D);
const kAmberBg = Color(0x21FBBF24);
const kAmberBorder = Color(0x75FBBF24);
const kGoldFg = Color(0xFFE7CF8D);
const kGoldBg = Color(0x1FC5A059);
const kGoldBorder = Color(0x75C5A059);
const kGoldSolid = Color(0xFFC5A059);
const kPanelBg = Color(0xFF050505);
const kHeaderBg = Color(0xFF0B0B0B);
const kSheetBg = Color(0xFF0B0B0B);

/// النصّ بثلاث درجاتٍ دافئة — أخفتها ≥ 4.5:1 على #050505.
const kInkHi = Color(0xFFF3EEE6);
const kInkMid = Color(0xFFC4BDB1);
const kInkLow = Color(0xFF958E83);

/// أهداف اللمس في المنيو.
const double kTap = 48;

/// أسماء قديمة تبقى للمستوردين — تشير الآن إلى لوحة الرفّ.
const kEmerald = kGoldSolid;
const kEmeraldText = kGoldFg;
const kBundleText = kGoldFg;

const _cardBg = Color(0x08FFFFFF);
const _cardBorder = Color(0x16FFFFFF);
const _ghostBg = Color(0x0DFFFFFF);
const _ghostBorder = Color(0x1FFFFFFF);

/// تدرّج الزرّ الذهبيّ الرئيس.
const kGoldGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFFD9B563), Color(0xFFA7833A)],
);
const kGoldOnText = Color(0xFF150F04);

/// تدرّج الفعل الكهرمانيّ (السلّة · أضف · أرسل).
const kAmberGradient = LinearGradient(
  colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
);
const kAmberOnText = Color(0xFF1A1003);

/// السعر بعملته: «4.75 د.أ» نصّاً واحداً (اختبار fnb_test يبحث عنه هكذا)
/// والعملة أصغر وأخفت — ولا ينكسر بينهما السطر.
Widget priceLine(double v, {double size = 15.5, Color color = kInkHi}) => Text.rich(
      TextSpan(children: [
        TextSpan(text: v.toStringAsFixed(2), style: ar(size, color: color, weight: FontWeight.w700)),
        TextSpan(text: ' د.أ', style: ar(12.5, color: kInkLow, weight: FontWeight.w500)),
      ]),
      softWrap: false,
    );

/// شارة «عرض» قبل اسم الباقة.
class BundleChip extends StatelessWidget {
  const BundleChip({super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          color: kGoldBg,
          border: Border.all(color: kGoldBorder),
        ),
        child: Text('عرض', style: ar(12.5, color: kGoldFg, weight: FontWeight.bold)),
      );
}

/// زرٌّ دائريّ في الترويسة (بحث · طلباتي · إغلاق) مع شارةٍ اختياريّة — 48.
class HeaderIconButton extends StatelessWidget {
  const HeaderIconButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.badge = 0,
    this.active = false,
    this.tooltip,
  });
  final IconData icon;
  final VoidCallback onTap;
  final int badge;
  final bool active;
  final String? tooltip;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: tooltip,
        child: Tooltip(
          message: tooltip ?? '',
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: Stack(clipBehavior: Clip.none, children: [
              Container(
                width: kTap,
                height: kTap,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: active ? kAmberBg : const Color(0x10FFFFFF),
                  border: Border.all(color: active ? kAmberBorder : _ghostBorder),
                ),
                child: Icon(icon, size: 20, color: active ? kAmberFg : kInkMid),
              ),
              if (badge > 0)
                Positioned(
                  top: -2,
                  left: -2,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 18),
                    height: 18,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: BoxDecoration(
                      color: Tw.amber400,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Center(
                      child: Text('$badge',
                          style: const TextStyle(
                              fontSize: 11, fontWeight: FontWeight.w900, color: Colors.black)),
                    ),
                  ),
                ),
            ]),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🪜 الرفّ — أسماء الأقسام وحدها عموديّاً على اليمين (بلا أيقوناتٍ مخمَّنة ولا أعداد)
// ══════════════════════════════════════════════════════
class ShelfSection {
  const ShelfSection({
    required this.key,
    required this.short,
    required this.title,
    required this.isPkg,
    required this.items,
    this.parent = '',
  });
  final String key, short, title;

  /// القسم الأب إن كان هذا قسماً فرعيّاً («المشروبات» لـ«قهوة ساخنة»).
  final String parent;
  final bool isPkg;
  final List<FnbMenuItem> items;
}

/// يبني الأقسام: العروض أوّلاً ثمّ ترتيب الخادم (قسم|فرعيّ).
List<ShelfSection> buildShelfSections(List<FnbMenuItem> menu) {
  final out = <ShelfSection>[];
  final packages = menu.where((m) => m.isBundle).toList();
  if (packages.isNotEmpty) {
    out.add(ShelfSection(
        key: '_pkg', short: 'العروض', title: 'العروض', isPkg: true, items: packages));
  }
  final idx = <String, List<FnbMenuItem>>{};
  final order = <String>[];
  for (final m in menu) {
    if (m.isBundle) continue;
    final k = '${m.category}|${m.subcategory}';
    if (!idx.containsKey(k)) {
      idx[k] = [];
      order.add(k);
    }
    idx[k]!.add(m);
  }
  for (final k in order) {
    final parts = k.split('|');
    final cat = parts[0], sub = parts.length > 1 ? parts[1] : '';
    out.add(ShelfSection(
      key: k,
      short: sub.isNotEmpty ? sub : (cat.isNotEmpty ? cat : kUncategorized),
      title: sub.isNotEmpty ? '$cat ← $sub' : (cat.isNotEmpty ? cat : kUncategorized),
      parent: sub.isNotEmpty ? cat : '',
      isPkg: false,
      items: idx[k]!,
    ));
  }
  return out;
}

class ShelfRail extends StatefulWidget {
  const ShelfRail({
    super.key,
    required this.sections,
    required this.activeKey,
    required this.onSelect,
  });
  final List<ShelfSection> sections;
  final String activeKey;
  final ValueChanged<String> onSelect;

  @override
  State<ShelfRail> createState() => _ShelfRailState();
}

class _ShelfRailState extends State<ShelfRail> {
  final _activeItem = GlobalKey();

  @override
  void didUpdateWidget(ShelfRail old) {
    super.didUpdateWidget(old);
    if (old.activeKey == widget.activeKey) return;
    // القسم المختار يبقى مرئيّاً في الرفّ حين يطول الرفّ عن الشاشة
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _activeItem.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 200));
      }
    });
  }

  @override
  Widget build(BuildContext context) => Container(
        width: 88,
        decoration: const BoxDecoration(
          color: Color(0xFF080808),
          border: Border(left: BorderSide(color: Color(0x12FFFFFF))),
        ),
        child: SingleChildScrollView(
          // 🚫 لا ارتداد: سحبةٌ لأسفل لا أثر لها (قرار المالك — كانت تكسر التركيب)
          physics: const ClampingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Column(children: [
            for (final s in widget.sections) _railItem(s, s.key == widget.activeKey),
          ]),
        ),
      );

  Widget _railItem(ShelfSection s, bool on) {
    final fg = on ? (s.isPkg ? kGoldFg : kAmberFg) : (s.isPkg ? kGoldFg : kInkLow);
    return Padding(
      key: on ? _activeItem : null,
      padding: const EdgeInsets.only(bottom: 2),
      child: Semantics(
        button: true,
        selected: on,
        child: InkWell(
          onTap: () => widget.onSelect(s.key),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: kTap),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: on ? (s.isPkg ? kGoldBg : kAmberBg) : Colors.transparent,
              border: Border.all(
                  color: on ? (s.isPkg ? kGoldBorder : kAmberBorder) : Colors.transparent),
            ),
            child: Text(s.short,
                textAlign: TextAlign.center,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: ar(13.5, color: fg, weight: FontWeight.bold, height: 1.25)),
          ),
        ),
      ),
    );
  }
}

/// عنوان القسم فوق البلاطات: «قهوة ساخنة  المشروبات».
class ShelfSectionHeader extends StatelessWidget {
  const ShelfSectionHeader({super.key, required this.section});
  final ShelfSection section;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 2, bottom: 10),
        child: Text.rich(TextSpan(children: [
          TextSpan(text: section.short, style: ar(16, color: kGoldFg, weight: FontWeight.w800)),
          if (section.parent.isNotEmpty)
            TextSpan(text: '  ${section.parent}', style: ar(13, color: kInkLow)),
        ])),
      );
}

// ══════════════════════════════════════════════════════
// 🧱 بلاطة صنف — اسم 15 · وصف 12.5 · سعر 15.5 ثمّ زرٌّ بعرضها (48)،
//    وتتّسع في مكانها لتُظهر خياراتها بعمودين.
// ══════════════════════════════════════════════════════
/// الاسم القديم `MenuItemRow` يبقى — الاختبارات والمستوردون يعرفونه.
class MenuItemRow extends StatelessWidget {
  const MenuItemRow({
    super.key,
    required this.item,
    required this.qty,
    required this.onAdd,
    this.inPackage = false,
    this.readOnly = false,
    this.expanded = false,
    this.selection = const {},
    this.onPick,
    this.onConfirm,
    this.onCollapse,
    this.onQty,
  });

  final FnbMenuItem item;
  final int qty;                       // مجموع كمّياته في السلّة بكلّ توليفاته
  final VoidCallback onAdd;            // «أضف» للبسيط · «اختر» لذي الخيارات · «التفاصيل» للوصف الطويل
  final bool inPackage;                // 🎁 صنفٌ تحويه باقة (لم يعد يُكتب تحته — يبقى للمستدعين)
  final bool readOnly;                 // وضع الاستعراض — بلا أزرار
  final bool expanded;                 // البلاطة مفتوحةٌ على خياراتها
  final Map<String, List<String>> selection;
  final void Function(FnbOptionGroup g, String valueKey)? onPick;
  final VoidCallback? onConfirm;       // أضف بالخيارات المختارة
  final VoidCallback? onCollapse;
  final ValueChanged<int>? onQty;      // ± للصنف البسيط في السلّة

  bool get _hasOpts => item.optionGroups.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final sub = item.subLine;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: qty > 0 ? const Color(0x0DFBBF24) : _cardBg,
        border: Border.all(color: qty > 0 || expanded ? kAmberBorder : _cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (item.imageUrl != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                height: 96,
                width: double.infinity,
                child: CachedNetworkImage(
                  imageUrl: ApiClient.instance.upload(item.imageUrl),
                  fit: BoxFit.cover,
                  memCacheWidth: 480,
                  errorWidget: (_, __, ___) => const SizedBox.shrink(),
                  placeholder: (_, __) => const SizedBox.shrink(),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
          Text(item.name,
              maxLines: expanded ? 4 : 2,
              overflow: TextOverflow.ellipsis,
              style: ar(15, color: qty > 0 ? kAmberFg : kInkHi, weight: FontWeight.bold, height: 1.35)),
          if (sub.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(sub,
                maxLines: expanded ? 4 : 2,
                overflow: TextOverflow.ellipsis,
                style: ar(12.5, color: kInkLow, height: 1.45)),
          ],
          if (expanded) ...[
            const SizedBox(height: 8),
            priceLine(item.priceValue),
            ..._groups(),
            const SizedBox(height: 12),
            _expandedFooter(),
          ] else ...[
            const Spacer(),
            const SizedBox(height: 6),
            priceLine(item.priceValue),
            if (!readOnly) ...[
              const SizedBox(height: 8),
              SizedBox(width: double.infinity, child: _action()),
            ],
          ],
        ],
      ),
    );
  }

  List<Widget> _groups() => [
        for (final g in item.optionGroups) ...[
          const SizedBox(height: 12),
          Text.rich(TextSpan(children: [
            TextSpan(text: g.name, style: ar(14.5, color: kGoldFg, weight: FontWeight.bold)),
            if (!g.isRequired) TextSpan(text: '  اختياريّ', style: ar(13, color: kInkLow)),
            if (g.isMulti) TextSpan(text: '  حتى ${g.maxSelect}', style: ar(13, color: kInkLow)),
          ])),
          const SizedBox(height: 8),
          // عمودان متساويان — لا صفوفٌ متعرّجة بعرض كلّ نكهة
          for (var i = 0; i < g.values.length; i += 2) ...[
            Row(children: [
              Expanded(child: _chip(g, g.values[i])),
              const SizedBox(width: 8),
              Expanded(
                  child: i + 1 < g.values.length ? _chip(g, g.values[i + 1]) : const SizedBox.shrink()),
            ]),
            if (i + 2 < g.values.length) const SizedBox(height: 8),
          ],
        ],
      ];

  Widget _chip(FnbOptionGroup g, FnbOptionValue v) {
    final on = (selection[g.key] ?? const []).contains(v.key);
    return Semantics(
      button: true,
      selected: on,
      child: InkWell(
        onTap: () => onPick?.call(g, v.key),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          constraints: const BoxConstraints(minHeight: kTap),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: on ? kAmberBg : const Color(0x0AFFFFFF),
            border: Border.all(color: on ? kAmberBorder : const Color(0x1CFFFFFF)),
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(v.name,
                textAlign: TextAlign.center,
                style: ar(14.5, color: on ? kAmberFg : kInkHi, weight: FontWeight.w700, height: 1.3)),
            if (v.priceDelta > 0)
              Text('+${v.priceDelta.toStringAsFixed(2)}', style: ar(12.5, color: on ? kAmberFg : kInkLow)),
          ]),
        ),
      ),
    );
  }

  Widget _expandedFooter() {
    final missing = item.optionGroups
        .where((g) => g.isRequired && (selection[g.key]?.isEmpty ?? true))
        .toList();
    var delta = 0.0;
    for (final g in item.optionGroups) {
      for (final vk in (selection[g.key] ?? const <String>[])) {
        for (final v in g.values) {
          if (v.key == vk) delta += v.priceDelta;
        }
      }
    }
    return Row(children: [
      _btn('إلغاء', onCollapse, primary: false),
      const SizedBox(width: 8),
      Expanded(
        child: _filled(
          missing.isEmpty ? 'أضف · ${jod(item.priceValue + delta)}' : 'اختر ${missing.first.name}',
          missing.isEmpty ? onConfirm : null,
        ),
      ),
    ]);
  }

  Widget _btn(String label, VoidCallback? onTap, {bool primary = true, Widget? trailing}) =>
      Opacity(
        opacity: onTap == null ? 0.45 : 1,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: kTap,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: primary ? Colors.transparent : _ghostBg,
              border: Border.all(color: primary ? kAmberBorder : _ghostBorder),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(label, style: ar(15, color: primary ? kAmberFg : kInkMid, weight: FontWeight.bold)),
              if (trailing != null) ...[const SizedBox(width: 6), trailing],
            ]),
          ),
        ),
      );

  Widget _filled(String label, VoidCallback? onTap) => Opacity(
        opacity: onTap == null ? 0.45 : 1,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: kTap,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: kAmberGradient),
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(15, color: kAmberOnText, weight: FontWeight.w800)),
          ),
        ),
      );

  Widget? get _qtyBadge => qty > 0 ? QtyBadge(qty) : null;

  Widget _action() {
    if (_hasOpts) return _btn('اختر', onAdd, trailing: _qtyBadge);
    if (item.hasLongDescription) return _btn('التفاصيل', onAdd, trailing: _qtyBadge);
    if (qty > 0 && onQty != null) {
      return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        stepButton('+', kAmberBg, kAmberBorder, kAmberFg, () => onQty!(1), label: 'واحد آخر من ${item.name}'),
        Text('$qty', style: ar(17, weight: FontWeight.w800)),
        stepButton('−', _ghostBg, _ghostBorder, Colors.white, () => onQty!(-1), label: 'واحد أقلّ من ${item.name}'),
      ]);
    }
    return Semantics(
      button: true,
      label: 'أضف ${item.name}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onAdd,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: kTap,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: kAmberBg,
            border: Border.all(color: kAmberBorder),
          ),
          // «+» عنصرٌ مستقلّ قبل الكلمة — يقع يمينها في RTL كما في الويب
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('+', style: ar(19, color: kAmberFg, weight: FontWeight.bold, height: 1)),
            const SizedBox(width: 6),
            Text('أضف', style: ar(15, color: kAmberFg, weight: FontWeight.bold)),
          ]),
        ),
      ),
    );
  }
}

/// عدد الصنف في السلّة بجانب «اختر».
class QtyBadge extends StatelessWidget {
  const QtyBadge(this.n, {super.key});
  final int n;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minWidth: 22),
        height: 22,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(color: Tw.amber400, borderRadius: BorderRadius.circular(11)),
        child: Center(
          child: Text('$n', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.black)),
        ),
      );
}

/// زرّ ±: مشتركٌ بين البلاطة وسطور السلّة — 48، ويسمّي الصنف لقارئ الشاشة.
Widget stepButton(String glyph, Color bg, Color border, Color fg, VoidCallback onTap, {String? label}) =>
    Semantics(
      button: true,
      label: label,
      excludeSemantics: label != null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: kTap,
          height: kTap,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: bg,
            border: Border.all(color: border),
          ),
          child: Center(child: Text(glyph, style: ar(20, color: fg, weight: FontWeight.bold))),
        ),
      ),
    );

// ══════════════════════════════════════════════════════
// 🎁 بطاقة عرضٍ — ذهبيّة، وتفتح المُركِّب المتدرّج
// ══════════════════════════════════════════════════════
class PackageCard extends StatelessWidget {
  const PackageCard({
    super.key,
    required this.item,
    required this.qty,
    required this.onTap,
    this.readOnly = false,
  });

  final FnbMenuItem item;
  final int qty;
  final VoidCallback onTap;
  final bool readOnly;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0x24C5A059), Color(0x05C5A059)],
          ),
          border: Border.all(color: kGoldBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Text(item.name, style: ar(16, weight: FontWeight.w800, height: 1.4)),
              ),
              const SizedBox(width: 10),
              priceLine(item.priceValue, size: 17, color: kGoldFg),
            ]),
            if (item.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(item.description, style: ar(13.5, color: kInkMid, height: 1.55)),
            ],
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final s in item.slots)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(9),
                    color: s.isChoice ? Colors.transparent : const Color(0x0DFFFFFF),
                    border: Border.all(color: s.isChoice ? kGoldBorder : const Color(0x14FFFFFF)),
                  ),
                  child: Text(
                    s.isChoice
                        ? '${s.label}: ${s.from.length} خيارات'
                        : '${s.qty > 1 ? '${s.name} ×${s.qty}' : s.name}'
                            '${s.lockedOptions.values.isNotEmpty ? ' ${s.lockedOptions.values.first}' : s.optionGroups.isNotEmpty ? ' · بنكهتك' : ''}',
                    style: ar(13, color: s.isChoice ? kGoldFg : kInkMid),
                  ),
                ),
            ]),
            if (!readOnly) ...[
              const SizedBox(height: 12),
              GoldButton(
                label: qty > 0 ? 'في السلّة ×$qty — ركّب توليفةً أخرى' : 'ركّب العرض',
                onTap: onTap,
                dense: true,
              ),
            ],
          ],
        ),
      );
}

/// زرٌّ ذهبيّ بعرضٍ كامل — 48.
class GoldButton extends StatelessWidget {
  const GoldButton({
    super.key,
    required this.label,
    required this.onTap,
    this.dense = false,
    this.enabled = true,
  });
  final String label;
  final VoidCallback? onTap;
  final bool dense, enabled;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: enabled ? 1 : 0.4,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: kTap),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: kGoldGradient,
            ),
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(15.5, color: kGoldOnText, weight: FontWeight.w800)),
          ),
        ),
      );
}

/// «5:30 م» بأرقامٍ لاتينيّة — كالويب، لا ساعةً بنظام 24.
String orderTime(DateTime t) {
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h:${t.minute.toString().padLeft(2, '0')} ${t.hour < 12 ? 'ص' : 'م'}';
}

// ══════════════════════════════════════════════════════
// 🧾 بطاقة طلب
// ══════════════════════════════════════════════════════
class MyOrderCard extends StatelessWidget {
  const MyOrderCard({super.key, required this.order, required this.onCancel});

  final FnbMyOrder order;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final m = order.meta;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: _cardBg,
        border: Border.all(color: m.color.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(shape: BoxShape.circle, color: m.color),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(m.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(14.5, color: m.color, weight: FontWeight.bold)),
            ),
            priceLine(parsePrice(order.total)),
          ]),
          const SizedBox(height: 6),
          Text(order.itemsSummary, style: ar(14, color: kInkMid, height: 1.5)),
          for (final line in order.items.where((i) => i.options.isNotEmpty))
            Text('${line.name}: ${line.options.map((o) => o.value).join(' · ')}',
                style: ar(13, color: const Color(0xFFD7BF86), height: 1.5)),
          for (final line in order.items.where((i) => i.isBundle))
            Text(line.componentsText,
                style: ar(13, color: const Color(0xFFD7BF86), height: 1.5)),
          if (order.note.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('ملاحظة: ${order.note}', style: ar(13, color: kInkLow)),
          ],
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '#${order.id}${order.createdAt == null ? '' : ' · ${orderTime(order.createdAt!)}'}',
                style: ar(12.5, color: kInkLow),
              ),
              if (order.isNew)
                InkWell(
                  onTap: onCancel,
                  child: Container(
                    constraints: const BoxConstraints(minHeight: kTap),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text('إلغاء الطلب',
                        style: ar(14, color: const Color(0xFFFB7185)).copyWith(
                          decoration: TextDecoration.underline,
                          decorationColor: const Color(0xFFFB7185),
                        )),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// ✅ لافتة «وصل طلبك» أعلى «طلباتي» — الإشعار العابر كان يظهر خلف الورقة فلا يُرى.
class OrderSentBanner extends StatelessWidget {
  const OrderSentBanner({super.key, required this.orderId});
  final int orderId;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: const Color(0x174ADE80),
          border: Border.all(color: const Color(0x524ADE80)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('وصل طلبك للمكان${orderId > 0 ? ' · #$orderId' : ''}',
              style: ar(15.5, color: const Color(0xFFBFE9CF), weight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text('يصلك إشعارٌ حين يبدأ تحضيره.', style: ar(13.5, color: kInkMid)),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// 🛒 سطر سلّة — توليفةٌ واحدة بكمّيتها
// ══════════════════════════════════════════════════════
class CartLineRow extends StatelessWidget {
  const CartLineRow({
    super.key,
    required this.line,
    required this.onQty,
    required this.onRemove,
  });

  final FnbCartLine line;
  final ValueChanged<int> onQty;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x12FFFFFF))),
        ),
        child: Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${line.isBundle ? 'عرض · ' : ''}${line.name}',
                    maxLines: 2, overflow: TextOverflow.ellipsis, style: ar(15, weight: FontWeight.w600)),
                if (line.label.isNotEmpty)
                  Text(line.label,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: ar(13, color: const Color(0xFFD7BF86), height: 1.4)),
                const SizedBox(height: 2),
                priceLine(line.unitPrice * line.quantity, size: 14.5),
              ],
            ),
          ),
          const SizedBox(width: 8),
          stepButton('+', kAmberBg, kAmberBorder, kAmberFg, () => onQty(1), label: 'واحد آخر من ${line.name}'),
          SizedBox(width: 28, child: Center(child: Text('${line.quantity}', style: ar(17, weight: FontWeight.w800)))),
          stepButton('−', _ghostBg, _ghostBorder, Colors.white, () => onQty(-1), label: 'واحد أقلّ من ${line.name}'),
          // الحذف بعيدٌ عن «−» بفاصلٍ واضح — كانا متلاصقين
          const SizedBox(width: 10),
          stepButton('✕', const Color(0x1AF43F5E), const Color(0x52F43F5E), const Color(0xFFFB7185), onRemove,
              label: 'احذف ${line.name}'),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// المنيو الفارغ · لافتة الخطأ
// ══════════════════════════════════════════════════════
class EmptyMenuCard extends StatelessWidget {
  const EmptyMenuCard({super.key});

  @override
  Widget build(BuildContext context) => DottedBorder(
        borderType: BorderType.RRect,
        radius: const Radius.circular(16),
        color: Tw.gray800,
        strokeWidth: 1,
        dashPattern: const [6, 4],
        child: SizedBox(
          width: double.infinity,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Center(
              child: Text('المكان لم يضف أصنافاً بعد', style: ar(15, color: kInkLow)),
            ),
          ),
        ),
      );
}

class OrderErrorBanner extends StatelessWidget {
  const OrderErrorBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x1AF43F5E),
          border: Border.all(color: const Color(0x40F43F5E)),
        ),
        child: Text(message, style: ar(13.5, color: Tw.rose400, height: 1.5)),
      );
}

// ══════════════════════════════════════════════════════
// 💨 بطاقة خدمة الأرجيلة — فحمٌ أو تزبيط، طلبٌ بلا سعر
// ══════════════════════════════════════════════════════
class ShishaServiceCard extends StatelessWidget {
  const ShishaServiceCard({
    super.key,
    required this.pending,
    required this.busy,
    required this.onAsk,
  });

  final bool pending, busy;
  final ValueChanged<String> onAsk;   // 'coal' | 'fix'

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: kGoldBg,
          border: Border.all(color: kGoldBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('أرجيلتك وصلت — تحتاج شيئاً؟', style: ar(15.5, weight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text('طلبٌ بلا سعر يصل مسؤول الأراجيل مباشرةً ولا يدخل فاتورتك.',
                style: ar(13.5, color: kInkMid, height: 1.45)),
            const SizedBox(height: 10),
            if (pending)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0x1A4ADE80),
                  border: Border.all(color: const Color(0x4D4ADE80)),
                ),
                child: Center(
                  child: Text('وصل طلبك — الموظّف في الطريق',
                      style: ar(14, color: const Color(0xFFBFE9CF))),
                ),
              )
            else
              Row(children: [
                Expanded(child: _svcBtn(Icons.local_fire_department_outlined, 'أحتاج فحماً', () => onAsk('coal'))),
                const SizedBox(width: 8),
                Expanded(child: _svcBtn(Icons.build_outlined, 'تزبيط الأرجيلة', () => onAsk('fix'))),
              ]),
          ],
        ),
      );

  Widget _svcBtn(IconData icon, String label, VoidCallback onTap) => Opacity(
        opacity: busy ? 0.45 : 1,
        child: InkWell(
          onTap: busy ? null : onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(minHeight: kTap),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: _ghostBg,
              border: Border.all(color: _ghostBorder),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, size: 17, color: Colors.white),
              const SizedBox(width: 6),
              Flexible(child: Text(label, style: ar(14.5, weight: FontWeight.bold))),
            ]),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 📄 قشرة الورقة السفليّة الموحَّدة: مقبضٌ، ترويسةٌ ثابتة، جسمٌ متمرّر، ذيلٌ ثابت
// الذيل يحسب حاشية لوحة المفاتيح (viewInsets) — فلا يختفي زرّ الإرسال خلفها.
// ══════════════════════════════════════════════════════
class OrderSheetShell extends StatelessWidget {
  const OrderSheetShell({
    super.key,
    required this.title,
    required this.subtitle,
    required this.body,
    this.footer,
    this.subtitleWarn = false,
    this.progress,   // (الخطوة الحاليّة، العدد)
  });

  final String title, subtitle;
  final bool subtitleWarn;
  final Widget body;
  final Widget? footer;
  final (int, int)? progress;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
          color: kSheetBg,
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
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: ar(18, weight: FontWeight.w800, height: 1.35)),
                      const SizedBox(height: 2),
                      Text(subtitle,
                          style: ar(13.5, color: subtitleWarn ? kAmberFg : kInkLow, height: 1.45)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                HeaderIconButton(
                    icon: Icons.close, onTap: () => Navigator.of(context).maybePop(), tooltip: 'إغلاق'),
              ]),
              if (progress != null) ...[
                const SizedBox(height: 12),
                Row(children: [
                  for (var k = 0; k < progress!.$2; k++)
                    Expanded(
                      child: Container(
                        height: 3,
                        margin: const EdgeInsets.symmetric(horizontal: 2),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(2),
                          color: k < progress!.$1
                              ? const Color(0xFFD9B563)
                              : k == progress!.$1
                                  ? const Color(0xFFF3DEA3)
                                  : const Color(0x1FFFFFFF),
                        ),
                      ),
                    ),
                ]),
              ],
            ]),
          ),
          const Divider(height: 1, color: Color(0x12FFFFFF)),
          Flexible(
            child: SingleChildScrollView(
              // 🚫 لا ارتداد ولا سحبٌ للتحديث داخل الأوراق
              physics: const ClampingScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: body,
            ),
          ),
          if (footer != null) ...[
            const Divider(height: 1, color: Color(0x12FFFFFF)),
            Padding(
              padding: EdgeInsets.fromLTRB(
                  16,
                  12,
                  16,
                  14 +
                      MediaQuery.viewPaddingOf(context).bottom +
                      MediaQuery.viewInsetsOf(context).bottom),
              child: footer,
            ),
          ],
        ]),
      );
}

/// بلاطات اختيارٍ كبيرة — ≥ 56، عمودان، والاسم يلتفّ على سطرين ولا يُقصّ.
class OptionTiles extends StatelessWidget {
  const OptionTiles({
    super.key,
    required this.values,
    required this.selected,
    required this.onPick,
  });
  final List<({String key, String name, String? sub})> values;
  final Set<String> selected;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < values.length; i += 2) ...[
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(child: _tile(values[i])),
              const SizedBox(width: 8),
              Expanded(child: i + 1 < values.length ? _tile(values[i + 1]) : const SizedBox.shrink()),
            ]),
          ),
          if (i + 2 < values.length) const SizedBox(height: 8),
        ],
      ]);

  Widget _tile(({String key, String name, String? sub}) v) {
    final on = selected.contains(v.key);
    return Semantics(
      button: true,
      selected: on,
      child: InkWell(
        onTap: () => onPick(v.key),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: on ? kGoldBg : const Color(0x0BFFFFFF),
            border: Border.all(color: on ? kGoldBorder : const Color(0x1AFFFFFF)),
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
            Text(v.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: ar(14.5, color: on ? const Color(0xFFF3DEA3) : kInkHi, weight: FontWeight.w700, height: 1.3)),
            if (v.sub != null && v.sub!.isNotEmpty)
              Text(v.sub!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: ar(12.5, color: on ? const Color(0xFFD7BF86) : kInkLow, height: 1.35)),
          ]),
        ),
      ),
    );
  }
}

/// إشعارٌ عابر أسفل اللوحة — لا يحجب اللمس.
class OrderToast extends StatelessWidget {
  const OrderToast({super.key, required this.text, this.error = false});
  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Semantics(
          liveRegion: true,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: error ? const Color(0xFF1C1210) : const Color(0xFF151006),
              border: Border.all(color: error ? const Color(0x80E06A5E) : kGoldBorder),
              boxShadow: const [BoxShadow(color: Color(0x80000000), blurRadius: 30, offset: Offset(0, 10))],
            ),
            child: Text(text,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: ar(14, color: error ? const Color(0xFFF7C9C4) : const Color(0xFFF3DEA3))),
          ),
        ),
      );
}

/// اسمٌ قديم يبقى للمستوردين.
class OrderSentToast extends StatelessWidget {
  const OrderSentToast({super.key});
  @override
  Widget build(BuildContext context) => const OrderToast(text: 'وصل طلبك للمكان');
}
