import 'package:cached_network_image/cached_network_image.dart';
import 'package:dotted_border/dotted_border.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🍽️ قطع لوحة المنيو — تصميم «الرفّ» (2026-09-09، مرآة OrderPanel.tsx)
// ══════════════════════════════════════════════════════
// لونٌ واحد بدل خمسة: **كهرمانيّ** التطبيق للفعل (أضف/اختر/السلّة)،
// **ذهبيّ** `#C5A059` للعروض والترويسة والزرّ العائم، ودلاليّ للحالات فقط
// (أزرق بانتظار المكان، كهرمانيّ قيد التحضير، أخضر تمّ التسليم).
// الزمرّديّ والبنفسجيّ أُزيلا — كان المنيو يبدو منتجاً غريباً داخل التطبيق.

const kAmberFg = Color(0xFFFCD34D);
const kAmberBg = Color(0x24FBBF24);
const kAmberBorder = Color(0x73FBBF24);
const kGoldFg = Color(0xFFE7CF8D);
const kGoldBg = Color(0x1FC5A059);
const kGoldBorder = Color(0x73C5A059);
const kGoldSolid = Color(0xFFC5A059);
const kPanelBg = Color(0xFF050505);
const kHeaderBg = Color(0xFF0B0B0B);
const kSheetBg = Color(0xFF0B0B0B);

/// أسماء قديمة تبقى للمستوردين — تشير الآن إلى لوحة الرفّ.
const kEmerald = kGoldSolid;
const kEmeraldText = kGoldFg;
const kBundleText = kGoldFg;

const _cardBg = Color(0x09FFFFFF);
const _cardBorder = Color(0x12FFFFFF);

/// تدرّج الزرّ الذهبيّ الرئيس.
const kGoldGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFFD9B563), Color(0xFFA7833A)],
);
const kGoldOnText = Color(0xFF150F04);

/// تدرّج شريط السلّة (كهرمانيّ — «لم يُرسَل بعد»).
const kAmberGradient = LinearGradient(
  colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
);

// ══════════════════════════════════════════════════════
// 🧭 أيقونات الأقسام — تُخمَّن من اسم القسم (المنيو يُكتب بحرّيّة في الداشبورد)
// ══════════════════════════════════════════════════════
IconData sectionIcon(String title, {bool isPkg = false}) {
  if (isPkg) return Icons.card_giftcard_outlined;
  final t = title;
  if (RegExp('رجيل|شيش|أراجيل').hasMatch(t)) return Icons.smoking_rooms_outlined;
  if (RegExp('بارد|آيس|ايس|مثلّج|مثلج').hasMatch(t)) return Icons.ac_unit_outlined;
  if (RegExp('عصير|عصائر|شيك|مخفوق|سموذي').hasMatch(t)) return Icons.local_drink_outlined;
  if (RegExp('معلّب|معلب|طاقة|غازيّ|غازي').hasMatch(t)) return Icons.local_cafe_outlined;
  if (RegExp('سناك|بوظة|حلو|مكسّرات|مكسرات|بزر|فشار').hasMatch(t)) return Icons.icecream_outlined;
  if (RegExp('ساخن|قهوة|شاي|كوفي|مشروب').hasMatch(t)) return Icons.coffee_outlined;
  return Icons.restaurant_outlined;
}

/// شارة «عرض» قبل اسم الباقة.
class BundleChip extends StatelessWidget {
  const BundleChip({super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          color: kGoldBg,
          border: Border.all(color: kGoldBorder),
        ),
        child: Text('عرض', style: ar(9, color: kGoldFg, weight: FontWeight.bold)),
      );
}

/// زرٌّ دائريّ صغير في الترويسة (بحث · طلباتي · إغلاق) مع شارةٍ اختياريّة.
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
  Widget build(BuildContext context) => Tooltip(
        message: tooltip ?? '',
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Stack(clipBehavior: Clip.none, children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? kAmberBg : const Color(0x12FFFFFF),
                border: Border.all(color: active ? kAmberBorder : const Color(0x1FFFFFFF)),
              ),
              child: Icon(icon, size: 16, color: active ? kAmberFg : Tw.gray300),
            ),
            if (badge > 0)
              Positioned(
                top: -4,
                left: -4,
                child: Container(
                  constraints: const BoxConstraints(minWidth: 16),
                  height: 16,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: Tw.amber400,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(
                    child: Text('$badge',
                        style: const TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w900,
                            color: Colors.black)),
                  ),
                ),
              ),
          ]),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🪜 الرفّ — الأقسام كلّها عموديّاً على اليمين، مرئيّةٌ دائماً
// ══════════════════════════════════════════════════════
class ShelfSection {
  const ShelfSection({
    required this.key,
    required this.short,
    required this.title,
    required this.isPkg,
    required this.items,
  });
  final String key, short, title;
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
      isPkg: false,
      items: idx[k]!,
    ));
  }
  return out;
}

class ShelfRail extends StatelessWidget {
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
  Widget build(BuildContext context) => Container(
        width: 78,
        decoration: const BoxDecoration(
          color: Color(0xFF080808),
          border: Border(left: BorderSide(color: Color(0x12FFFFFF))),
        ),
        child: ListView(
          // 🚫 لا ارتداد: سحبةٌ لأسفل لا أثر لها (قرار المالك — كانت تكسر التركيب)
          physics: const ClampingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          children: [
            for (final s in sections) _railItem(s, s.key == activeKey),
          ],
        ),
      );

  Widget _railItem(ShelfSection s, bool on) {
    final fg = on ? (s.isPkg ? kGoldFg : kAmberFg) : Tw.gray400;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: InkWell(
        onTap: () => onSelect(s.key),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(2, 8, 2, 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: on ? (s.isPkg ? kGoldBg : kAmberBg) : Colors.transparent,
            border: Border.all(
                color: on ? (s.isPkg ? kGoldBorder : kAmberBorder) : Colors.transparent),
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(sectionIcon(s.title, isPkg: s.isPkg), size: 18, color: fg),
            const SizedBox(height: 4),
            Text(s.short,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: ar(10.5, color: fg, weight: FontWeight.bold, height: 1.2)),
            const SizedBox(height: 2),
            Text(arDigits(s.items.length),
                style: ar(9, color: fg.withValues(alpha: 0.7))),
          ]),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// 🧱 بلاطة صنف — تتّسع في مكانها لتُظهر خياراتها (أزرار ≥ ٤٠ بكسل)
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
  final VoidCallback onAdd;            // «+» للبسيط · «اختر» لذي الخيارات · «التفاصيل» للوصف الطويل
  final bool inPackage;                // 🎁 صنفٌ تحويه باقة
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
    final sub = item.description.isNotEmpty
        ? item.description
        : _hasOpts
            ? item.optionHint
            : inPackage
                ? 'ضمن عرض'
                : '';
    final subGold = inPackage && item.description.isEmpty && !_hasOpts;
    return Container(
      constraints: const BoxConstraints(minHeight: 96),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: qty > 0 ? const Color(0x0FFBBF24) : _cardBg,
        border: Border.all(color: qty > 0 ? kAmberBorder : _cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (item.imageUrl != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                height: 80,
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
            const SizedBox(height: 6),
          ],
          Text(item.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: ar(13, weight: FontWeight.bold, height: 1.3)),
          if (sub.isNotEmpty)
            Text(sub,
                maxLines: expanded ? 3 : 1,
                overflow: TextOverflow.ellipsis,
                style: ar(10, color: subGold ? const Color(0xFFD7BF86) : Tw.gray500, height: 1.3)),
          if (expanded) ..._groups(),
          const Spacer(),
          const SizedBox(height: 6),
          Row(children: [
            ltrText(item.priceText, num_(14, color: kAmberFg)),
            const Spacer(),
            if (!readOnly) _action(),
          ]),
        ],
      ),
    );
  }

  List<Widget> _groups() => [
        for (final g in item.optionGroups) ...[
          const SizedBox(height: 6),
          Row(children: [
            Text(g.name, style: ar(10.5, color: const Color(0xFFD7BF86), weight: FontWeight.bold)),
            if (!g.isRequired) ...[
              const SizedBox(width: 6),
              Text('اختياريّ', style: ar(9.5, color: Tw.gray600)),
            ],
            if (g.isMulti) ...[
              const SizedBox(width: 6),
              Text('حتى ${arDigits(g.maxSelect)}', style: ar(9.5, color: Tw.gray600)),
            ],
          ]),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final v in g.values)
              _chip(v, (selection[g.key] ?? const []).contains(v.key),
                  () => onPick?.call(g, v.key)),
          ]),
        ],
      ];

  Widget _chip(FnbOptionValue v, bool on, VoidCallback onTap) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            color: on ? kAmberBg : const Color(0x0DFFFFFF),
            border: Border.all(color: on ? kAmberBorder : const Color(0x1AFFFFFF)),
          ),
          child: Text(v.label,
              style: ar(12.5, color: on ? kAmberFg : Tw.gray300, weight: FontWeight.w700)),
        ),
      );

  Widget _btn(String label, VoidCallback? onTap, {bool primary = true, double? width}) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Opacity(
          opacity: onTap == null ? 0.45 : 1,
          child: Container(
            height: 34,
            width: width,
            padding: EdgeInsets.symmetric(horizontal: width == null ? 12 : 0),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              color: primary ? kAmberBg : const Color(0x0DFFFFFF),
              border: Border.all(color: primary ? kAmberBorder : const Color(0x1AFFFFFF)),
            ),
            child: Text(label,
                style: ar(12, color: primary ? kAmberFg : Tw.gray400, weight: FontWeight.bold)),
          ),
        ),
      );

  Widget _action() {
    if (_hasOpts) {
      if (expanded) {
        final missing = item.optionGroups
            .where((g) => g.isRequired && (selection[g.key]?.isEmpty ?? true))
            .toList();
        return Row(mainAxisSize: MainAxisSize.min, children: [
          _btn('إلغاء', onCollapse, primary: false),
          const SizedBox(width: 6),
          _btn(missing.isEmpty ? 'أضف' : 'اختر ${missing.first.name}',
              missing.isEmpty ? onConfirm : null),
        ]);
      }
      return _btn(qty > 0 ? '×$qty +' : 'اختر', onAdd);
    }
    if (item.hasLongDescription) {
      return _btn(qty > 0 ? '×$qty +' : 'التفاصيل', onAdd);
    }
    if (qty > 0 && onQty != null) {
      return Row(mainAxisSize: MainAxisSize.min, children: [
        _stepBtn('−', const Color(0x0DFFFFFF), const Color(0x1AFFFFFF), Colors.white,
            () => onQty!(-1)),
        SizedBox(width: 22, child: Center(child: ltrText('$qty', num_(13)))),
        _stepBtn('+', kAmberBg, kAmberBorder, kAmberFg, () => onQty!(1)),
      ]);
    }
    return InkWell(
      onTap: onAdd,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: kAmberBg,
          border: Border.all(color: kAmberBorder),
        ),
        child: Center(child: Text('+', style: ar(18, color: kAmberFg, weight: FontWeight.w900))),
      ),
    );
  }
}

/// زرّ ±: مشتركٌ بين البلاطة وسطور السلّة.
Widget _stepBtn(String glyph, Color bg, Color border, Color fg, VoidCallback onTap) =>
    InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: bg,
          border: Border.all(color: border),
        ),
        child: Center(child: Text(glyph, style: ar(15, color: fg, weight: FontWeight.bold))),
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
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0x21C5A059), Color(0x05FFFFFF)],
          ),
          border: Border.all(color: kGoldBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [
              Expanded(
                child: Text(item.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: ar(13.5, weight: FontWeight.bold)),
              ),
              const SizedBox(width: 8),
              ltrText(item.priceText, num_(15, color: kGoldFg)),
            ]),
            if (item.description.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(item.description, style: ar(10.5, color: Tw.gray400, height: 1.5)),
            ],
            const SizedBox(height: 8),
            Wrap(spacing: 5, runSpacing: 5, children: [
              for (final s in item.slots)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: s.isChoice ? Colors.transparent : const Color(0x0DFFFFFF),
                    border: Border.all(color: s.isChoice ? kGoldBorder : const Color(0x14FFFFFF)),
                  ),
                  child: Text(
                    s.isChoice
                        ? '${s.label}: ${arDigits(s.from.length)} خيارات'
                        : '${s.qty > 1 ? '${s.name} ×${s.qty}' : s.name}'
                            '${s.lockedOptions.values.isNotEmpty ? ' ${s.lockedOptions.values.first}' : s.optionGroups.isNotEmpty ? ' · بنكهتك' : ''}',
                    style: ar(10.5, color: s.isChoice ? kGoldFg : Tw.gray300),
                  ),
                ),
            ]),
            if (!readOnly) ...[
              const SizedBox(height: 10),
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

/// زرٌّ ذهبيّ بعرضٍ كامل.
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
            padding: EdgeInsets.symmetric(vertical: dense ? 10 : 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: kGoldGradient,
            ),
            child: Center(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(dense ? 12.5 : 13.5, color: kGoldOnText, weight: FontWeight.w800)),
            ),
          ),
        ),
      );
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: _cardBg,
        border: Border.all(color: m.color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: m.color,
                boxShadow: [BoxShadow(color: m.color, blurRadius: 8)],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(m.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(12, color: m.color, weight: FontWeight.bold)),
            ),
            ltrText(order.totalText, num_(12)),
          ]),
          const SizedBox(height: 6),
          Text(order.itemsSummary, style: ar(11.5, color: Tw.gray300, height: 1.5)),
          for (final line in order.items.where((i) => i.options.isNotEmpty))
            Text('${line.name}: ${line.options.map((o) => o.value).join(' · ')}',
                style: ar(10.5, color: const Color(0xFFD7BF86), height: 1.5)),
          for (final line in order.items.where((i) => i.isBundle))
            Text(line.componentsText,
                style: ar(10.5, color: const Color(0xFFD7BF86), height: 1.5)),
          if (order.note.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('ملاحظة: ${order.note}', style: ar(10, color: Tw.gray600)),
          ],
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '#${order.id}'
                '${order.createdAt == null ? '' : ' · ${DateFormat('HH:mm', 'ar').format(order.createdAt!)}'}',
                style: ar(9.5, color: Tw.gray600),
              ),
              if (order.isNew)
                InkWell(
                  onTap: onCancel,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
                    child: Text('إلغاء الطلب',
                        style: ar(10.5, color: const Color(0xCCFB7185)).copyWith(
                          decoration: TextDecoration.underline,
                          decorationColor: const Color(0xCCFB7185),
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
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: _cardBg,
          border: Border.all(color: _cardBorder),
        ),
        child: Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${line.isBundle ? 'عرض · ' : ''}${line.name}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(12.5, weight: FontWeight.w600)),
                if (line.label.isNotEmpty)
                  Text(line.label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: ar(10, color: const Color(0xFFD7BF86), height: 1.4)),
                const SizedBox(height: 2),
                ltrText(jod(line.unitPrice * line.quantity), num_(11, color: kAmberFg)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          _stepBtn('✕', const Color(0x1FF43F5E), const Color(0x4DF43F5E),
              const Color(0xFFFB7185), onRemove),
          const SizedBox(width: 6),
          _stepBtn('−', const Color(0x0DFFFFFF), const Color(0x1AFFFFFF), Colors.white,
              () => onQty(-1)),
          SizedBox(width: 24, child: Center(child: ltrText('${line.quantity}', num_(14)))),
          _stepBtn('+', kAmberBg, kAmberBorder, kAmberFg, () => onQty(1)),
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
              child: Text('المكان لم يضف أصنافاً بعد', style: ar(14, color: Tw.gray500)),
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
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: const Color(0x1AF43F5E),
          border: Border.all(color: const Color(0x40F43F5E)),
        ),
        child: Text(message, style: ar(12, color: Tw.rose400, height: 1.5)),
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
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: kGoldBg,
          border: Border.all(color: kGoldBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('أرجيلتك وصلت — تحتاج شيئاً؟', style: ar(13, weight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text('طلبٌ بلا سعر يصل مسؤول الأراجيل مباشرةً ولا يدخل فاتورتك.',
                style: ar(10.5, color: Tw.gray400)),
            const SizedBox(height: 10),
            if (pending)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0x1A4ADE80),
                  border: Border.all(color: const Color(0x4D4ADE80)),
                ),
                child: Center(
                  child: Text('وصل طلبك — الموظّف في الطريق',
                      style: ar(11.5, color: const Color(0xFFBFE9CF))),
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
            constraints: const BoxConstraints(minHeight: 44),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0x0DFFFFFF),
              border: Border.all(color: const Color(0x1FFFFFFF)),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, size: 15, color: Colors.white),
              const SizedBox(width: 6),
              Text(label, style: ar(12.5, weight: FontWeight.bold)),
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
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Column(children: [
              Row(children: [
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
                          style: ar(10.5, color: subtitleWarn ? kAmberFg : Tw.gray500)),
                    ],
                  ),
                ),
                HeaderIconButton(
                    icon: Icons.close, onTap: () => Navigator.of(context).pop(), tooltip: 'إغلاق'),
              ]),
              if (progress != null) ...[
                const SizedBox(height: 10),
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

/// بلاطات اختيارٍ كبيرة — هدف لمسٍ ≥ ٥٠ بكسل، عمودان.
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
  Widget build(BuildContext context) => GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          mainAxisExtent: 56,
        ),
        itemCount: values.length,
        itemBuilder: (_, i) {
          final v = values[i];
          final on = selected.contains(v.key);
          return InkWell(
            onTap: () => onPick(v.key),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: on ? kGoldBg : const Color(0x0BFFFFFF),
                border: Border.all(color: on ? kGoldBorder : const Color(0x17FFFFFF)),
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(v.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: ar(13.5, color: on ? const Color(0xFFF3DEA3) : Tw.gray300, weight: FontWeight.w700)),
                if (v.sub != null && v.sub!.isNotEmpty)
                  Text(v.sub!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(10, color: on ? const Color(0xFFD7BF86) : Tw.gray500)),
              ]),
            ),
          );
        },
      );
}

/// إشعارٌ عابر أسفل اللوحة — لا يحجب اللمس.
class OrderToast extends StatelessWidget {
  const OrderToast({super.key, required this.text, this.error = false});
  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: error ? const Color(0xFF1C1210) : const Color(0xFF151006),
            border: Border.all(color: error ? const Color(0x80E06A5E) : kGoldBorder),
            boxShadow: const [BoxShadow(color: Color(0x80000000), blurRadius: 30, offset: Offset(0, 10))],
          ),
          child: Text(text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: ar(12.5, color: error ? const Color(0xFFF7C9C4) : const Color(0xFFF3DEA3))),
        ),
      );
}

/// اسمٌ قديم يبقى للمستوردين.
class OrderSentToast extends StatelessWidget {
  const OrderSentToast({super.key});
  @override
  Widget build(BuildContext context) => const OrderToast(text: 'وصل طلبك للمكان');
}
