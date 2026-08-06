import 'package:cached_network_image/cached_network_image.dart';
import 'package:dotted_border/dotted_border.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/api/api_client.dart';
import '../../models/fnb.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🍽️ قطع شاشة الطلب — §4.3 في الملفّ 17
// ══════════════════════════════════════════════════════
// لون الشريحة كلّها زمرديّ `#10b981`.

const kEmerald = Tw.emerald500;
const kEmeraldText = Tw.emerald400;

/// حدّ البطاقة العاديّ مقابل حدّ «في السلّة» — التمييز الوحيد للاختيار.
const _borderIdle = Color(0x0FFFFFFF);
const _borderPicked = Color(0x5910B981);
const _cardBg = Color(0x08FFFFFF);

/// 🎁 الباقات (العروض) بنفسجيّة — تمييزٌ عن الزمرديّ حتى لا تُقرأ كصنفٍ مفرد.
/// مطابقٌ لويب `/player/order` (‎#c4b5fd على خلفيّة ‎rgba(139,92,246,.15)).
const kBundleText = Color(0xFFC4B5FD);
const _bundleBg = Color(0x268B5CF6);
const _bundleBorder = Color(0x4D8B5CF6);

/// شارة «عرض» قبل اسم الباقة.
class BundleChip extends StatelessWidget {
  const BundleChip({super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          color: _bundleBg,
          border: Border.all(color: _bundleBorder),
        ),
        child: Text('🎁 عرض',
            style: ar(9, color: kBundleText, weight: FontWeight.bold)),
      );
}

// ══════════════════════════════════════════════════════
// §4.3.1 بطاقة الترويسة
// ══════════════════════════════════════════════════════
class OrderHeaderCard extends StatelessWidget {
  const OrderHeaderCard({super.key, required this.ctx});
  final FnbContext ctx;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0x1F10B981), Color(0xE6050505)],
          ),
          border: Border.all(color: const Color(0x4010B981)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('🍽️', style: TextStyle(fontSize: 30)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('اطلب من ${ctx.locationName}',
                      style: ar(16, weight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text(ctx.subtitle, style: ar(11, color: Tw.gray500)),
                ],
              ),
            ),
          ],
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.3.2 بطاقة طلب
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
        borderRadius: BorderRadius.circular(12),
        color: _cardBg,
        border: Border.all(color: m.color.withValues(alpha: 0.145)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text('${m.icon} ${m.label}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(11, color: m.color, weight: FontWeight.w500)),
              ),
              const SizedBox(width: 8),
              ltrText(order.totalText, num_(12)),
            ],
          ),
          const SizedBox(height: 6),
          Text(order.itemsSummary, style: ar(11, color: Tw.gray400, height: 1.5)),
          // 🎁 تفصيل الباقات: ما يُحضَّر فعليّاً تحت سطر الملخّص
          for (final line in order.items.where((i) => i.isBundle))
            Text('🎁 ${line.componentsText}',
                style: ar(10, color: kBundleText, height: 1.5)),
          if (order.note.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('📝 ${order.note}', style: ar(10, color: Tw.gray600)),
          ],
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                order.createdAt == null
                    ? ''
                    : DateFormat('HH:mm', 'ar').format(order.createdAt!),
                style: ar(9, color: Tw.gray600),
              ),
              // بلا حوار تأكيد — تكافؤ مع الويب
              if (order.isNew)
                InkWell(
                  onTap: onCancel,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
                    child: Text('إلغاء الطلب',
                        style: ar(10, color: const Color(0xCCFB7185)).copyWith(
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
// §4.3.3 صفّ الصنف
// ══════════════════════════════════════════════════════
class MenuItemRow extends StatelessWidget {
  const MenuItemRow({
    super.key,
    required this.item,
    required this.qty,
    required this.onQty,
  });

  final FnbMenuItem item;
  final int qty;
  final ValueChanged<int> onQty;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: _cardBg,
          border: Border.all(color: qty > 0 ? _borderPicked : _borderIdle),
        ),
        child: Row(children: [
          _thumb(),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  if (item.isBundle) ...[const BundleChip(), const SizedBox(width: 6)],
                  Flexible(
                    child: Text(item.name,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(14)),
                  ),
                ]),
                // مكوّنات الباقة تحلّ محلّ الوصف — اللاعب يعرف محتوى العرض قبل الطلب
                if (item.subtitle.isNotEmpty)
                  Text(item.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(10,
                          color: item.isBundle ? kBundleText : Tw.gray600)),
                const SizedBox(height: 2),
                ltrText(item.priceText,
                    num_(11, color: kEmeraldText, weight: FontWeight.bold)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          qty == 0 ? _addButton() : _stepper(),
        ]),
      );

  Widget _thumb() {
    const size = 48.0;
    const fallback = Center(child: Text('🍴', style: TextStyle(fontSize: 18)));
    final url = item.imageUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: size,
        height: size,
        color: Tw.gray800,
        child: url == null
            ? fallback
            : CachedNetworkImage(
                imageUrl: ApiClient.instance.upload(url),
                fit: BoxFit.cover,
                // عرضٌ 48dp فقط — فكّ ترميز صورةٍ كاملة هدرُ ذاكرة
                memCacheWidth: 144,
                errorWidget: (_, __, ___) => fallback,
                placeholder: (_, __) => const SizedBox.shrink(),
              ),
      ),
    );
  }

  Widget _addButton() => InkWell(
        onTap: () => onQty(1),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: const Color(0x2610B981),
            border: Border.all(color: _borderPicked),
          ),
          child: Text('+ أضف',
              style: ar(12, color: kEmeraldText, weight: FontWeight.bold)),
        ),
      );

  Widget _stepper() => Row(mainAxisSize: MainAxisSize.min, children: [
        _stepBtn('−', const Color(0x0DFFFFFF), const Color(0x1AFFFFFF),
            Colors.white, () => onQty(qty - 1)),
        const SizedBox(width: 8),
        SizedBox(
          width: 20,
          child: Center(child: ltrText('$qty', num_(14))),
        ),
        const SizedBox(width: 8),
        // السقف صامت: لا رسالة ولا اهتزاز عند بلوغ 20
        _stepBtn('+', const Color(0x3310B981), const Color(0x6610B981),
            kEmeraldText, () => onQty(qty + 1)),
      ]);

  Widget _stepBtn(String glyph, Color bg, Color border, Color fg, VoidCallback onTap) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: bg,
            border: Border.all(color: border),
          ),
          child: Center(
              child: Text(glyph,
                  style: ar(14, color: fg, weight: FontWeight.bold))),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.3.3 رأس الفئة و§4.3.3 المنيو الفارغ
// ══════════════════════════════════════════════════════
class CategoryHeader extends StatelessWidget {
  const CategoryHeader({super.key, required this.name});
  final String name;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Text(name,
              style: ar(12,
                  color: const Color(0xCC34D399), weight: FontWeight.bold)),
          const SizedBox(width: 8),
          const Expanded(
            child: SizedBox(
              height: 1,
              child: ColoredBox(color: Color(0x1A10B981)),
            ),
          ),
        ]),
      );
}

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
              child: Text('المكان لم يضف أصنافاً بعد',
                  style: ar(14, color: Tw.gray500)),
            ),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.3.4 لافتة الخطأ
// ══════════════════════════════════════════════════════
class OrderErrorBanner extends StatelessWidget {
  const OrderErrorBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: const Color(0x1AF43F5E),
          border: Border.all(color: const Color(0x33F43F5E)),
        ),
        child: Text(message, style: ar(12, color: Tw.rose400)),
      );
}

// ══════════════════════════════════════════════════════
// §4.3.6 توست النجاح — لا يحجب اللمس
// ══════════════════════════════════════════════════════
class OrderSentToast extends StatelessWidget {
  const OrderSentToast({super.key});

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              color: const Color(0xF7061410),
              border: Border.all(color: const Color(0x8010B981)),
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('✅', style: TextStyle(fontSize: 36)),
              const SizedBox(height: 8),
              Text('وصل طلبك للمكان!',
                  style: ar(14, weight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text('تابع حالته في «طلباتي» أعلى الصفحة',
                  style: ar(11, color: Tw.gray500)),
            ]),
          ),
        ),
      );
}
