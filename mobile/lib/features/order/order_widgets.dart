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
          // ⚙️ ما اختاره فعلاً — ليتأكّد أنّ طلبه وصل كما أراد
          for (final line in order.items.where((i) => i.options.isNotEmpty))
            Text('⚙️ ${line.name}: ${chosenLine(line.options)}',
                style: ar(10, color: const Color(0xCCFCD34D), height: 1.5)),
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
    required this.onAdd,
    this.inPackage = false,
  });

  final FnbMenuItem item;
  final int qty;          // مجموع كمّياته في السلّة بكلّ توليفاته
  final VoidCallback onAdd;

  /// 🎁 صنفٌ تحويه باقة — يعرف اللاعب أنّ عرضاً يضمّه بسعرٍ أفضل
  final bool inPackage;

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
                Row(mainAxisSize: MainAxisSize.min, children: [
                  ltrText(item.priceText,
                      num_(11, color: kEmeraldText, weight: FontWeight.bold)),
                  if (item.optionGroups.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    // «7 النكهة» أنفع من «خيارات» على بطاقةِ عائلةٍ تخفي نكهاتها
                    Flexible(
                      child: Text('⚙️ ${item.optionHint}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ar(9, color: const Color(0xE6FBBF24))),
                    ),
                  ],
                  if (inPackage) ...[
                    const SizedBox(width: 8),
                    Text('🎁 ضمن عرض', style: ar(9, color: kBundleText)),
                  ],
                ]),
              ],
            ),
          ),
          const SizedBox(width: 12),
          _addButton(),
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

  /// زرٌّ واحد: «أضف» للصنف العاديّ و«اختر» لذي الخيارات، ويحمل العدّاد
  /// إن كان الصنف في السلّة (بكلّ توليفاته). التحكّم بالكمّيات صار في سطور السلّة.
  Widget _addButton() => InkWell(
        onTap: onAdd,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: const Color(0x2610B981),
            border: Border.all(color: _borderPicked),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (qty > 0) ...[
              ltrText('$qty', num_(12, weight: FontWeight.bold)),
              const SizedBox(width: 6),
            ],
            Text(
                item.needsPicking
                    ? 'اختر'
                    : item.hasLongDescription
                        ? 'التفاصيل'
                        : '+ أضف',
                style: ar(12, color: kEmeraldText, weight: FontWeight.bold)),
          ]),
        ),
      );

}

/// زرّ ±: مشتركٌ بين سطور السلّة.
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
            child: Text(glyph, style: ar(14, color: fg, weight: FontWeight.bold))),
      ),
    );

// ══════════════════════════════════════════════════════
// 🛒 سطر سلّة — توليفةٌ واحدة بكمّيتها
// الخيارات المختارة تظهر تحت الاسم: بلا ذلك لا يميّز اللاعب سطرَي
// «أرجيلة/تفاحتين» و«أرجيلة/عنب» عن بعضهما.
// ══════════════════════════════════════════════════════
class CartLineRow extends StatelessWidget {
  const CartLineRow({
    super.key,
    required this.line,
    required this.onQty,
    required this.onRemove,
  });

  final FnbCartLine line;
  final ValueChanged<int> onQty;   // ‎+1 أو ‎−1
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x0F10B981),
          border: Border.all(color: const Color(0x3310B981)),
        ),
        child: Row(children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${line.isBundle ? '🎁 ' : ''}${line.name}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(12)),
                if (line.label.isNotEmpty)
                  Text(line.label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: ar(10, color: const Color(0xE6FCD34D), height: 1.4)),
                const SizedBox(height: 2),
                ltrText(jod(line.unitPrice * line.quantity),
                    num_(10, color: kEmeraldText, weight: FontWeight.bold)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          _stepBtn('🗑', const Color(0x1FF43F5E), const Color(0x4DF43F5E),
              const Color(0xFFFB7185), onRemove),
          const SizedBox(width: 8),
          _stepBtn('−', const Color(0x0DFFFFFF), const Color(0x1AFFFFFF),
              Colors.white, () => onQty(-1)),
          const SizedBox(width: 8),
          SizedBox(width: 20, child: Center(child: ltrText('${line.quantity}', num_(14)))),
          const SizedBox(width: 8),
          // السقف صامت: لا رسالة ولا اهتزاز عند بلوغ 20
          _stepBtn('+', const Color(0x3310B981), const Color(0x6610B981),
              kEmeraldText, () => onQty(1)),
        ]),
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
// 🎁 بطاقة عرضٍ (باقة) — بنفسجيّة بعرضٍ كامل، تختلف شكلاً لا لوناً فقط
// ══════════════════════════════════════════════════════
class PackageCard extends StatelessWidget {
  const PackageCard({
    super.key,
    required this.item,
    required this.qty,
    required this.onTap,
  });

  final FnbMenuItem item;
  final int qty;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [Color(0x218B5CF6), Color(0x05FFFFFF)],
            ),
            border: Border.all(color: _bundleBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(children: [
                const BundleChip(),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(item.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(13.5, weight: FontWeight.bold)),
                ),
                ltrText(item.priceText,
                    num_(15, color: kBundleText, weight: FontWeight.w900)),
              ]),
              const SizedBox(height: 8),
              Wrap(spacing: 5, runSpacing: 5, children: [
                for (final s in item.slots)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      color: s.isChoice
                          ? const Color(0x1410B981)
                          : const Color(0x0DFFFFFF),
                      border: Border.all(
                          color: s.isChoice
                              ? const Color(0x5934D399)
                              : const Color(0x14FFFFFF)),
                    ),
                    child: Text(s.summary,
                        style: ar(10,
                            color: s.isChoice
                                ? const Color(0xFF6EE7B7)
                                : Tw.gray300)),
                  ),
              ]),
              const SizedBox(height: 8),
              Text(
                qty > 0
                    ? '✓ في السلّة ×$qty — اضغط لإضافة توليفةٍ أخرى'
                    : 'اضغط لاختيار مكوّناتك',
                style: ar(10,
                    color: qty > 0 ? const Color(0xFF6EE7B7) : Tw.gray500),
              ),
            ],
          ),
        ),
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
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0x24E0492B), Color(0x05FFFFFF)],
          ),
          border: Border.all(color: const Color(0x52E0492B)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [
              const Text('💨', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Expanded(
                child: Text('أرجيلتك وصلت — تحتاج شيئاً؟',
                    style: ar(13, weight: FontWeight.bold)),
              ),
            ]),
            const SizedBox(height: 6),
            Text('طلبٌ بلا سعر، يصل مسؤول الأراجيل مباشرةً ولا يدخل فاتورتك.',
                style: ar(10.5, color: Tw.gray400)),
            const SizedBox(height: 10),
            if (pending)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0x1A10B981),
                  border: Border.all(color: const Color(0x4710B981)),
                ),
                child: Center(
                  child: Text('✅ وصل طلبك — الموظّف في الطريق',
                      style: ar(11, color: const Color(0xFF6EE7B7))),
                ),
              )
            else
              Row(children: [
                Expanded(child: _svcBtn('🔥 أحتاج فحماً', () => onAsk('coal'))),
                const SizedBox(width: 8),
                Expanded(
                    child: _svcBtn('🔧 تزبيط الأرجيلة', () => onAsk('fix'))),
              ]),
          ],
        ),
      );

  Widget _svcBtn(String label, VoidCallback onTap) => Opacity(
        opacity: busy ? 0.45 : 1,
        child: InkWell(
          onTap: busy ? null : onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0x29E0492B),
              border: Border.all(color: const Color(0x66E0492B)),
            ),
            child: Center(
              child: Text(label,
                  style: ar(12,
                      color: const Color(0xFFF8A08C),
                      weight: FontWeight.bold)),
            ),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🛒 درج السلّة — التعديل والحذف والملاحظة والإرسال في مكانٍ واحد
// ترويسةٌ وذيلٌ ثابتان وجسمٌ متمرّر — لا يغيب زرّ الإرسال مهما طالت السلّة.
// ══════════════════════════════════════════════════════
class CartDrawer extends StatelessWidget {
  const CartDrawer({
    super.key,
    required this.cart,
    required this.noteCtrl,
    required this.sending,
    required this.onQty,
    required this.onRemove,
    required this.onSend,
    this.error = '',
  });

  final FnbCart cart;
  final TextEditingController noteCtrl;
  final bool sending;

  /// رفض الخادم يظهر **داخل** الدرج — لافتة الشاشة الخلفيّة محجوبةٌ بالحاجز
  final String error;
  final void Function(String key, int delta) onQty;
  final ValueChanged<String> onRemove;
  final VoidCallback onSend;

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
                    Text('🛒 سلّتك', style: ar(15, weight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text('لم تُرسَل بعد — راجعها ثمّ اضغط زرّ الإرسال بالأسفل',
                        style: ar(10.5, color: const Color(0xFFFCD34D))),
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
                  child:
                      Center(child: Text('✕', style: ar(12, color: Tw.gray400))),
                ),
              ),
            ]),
          ),
          const Divider(height: 1, color: Color(0x12FFFFFF)),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (error.isNotEmpty) ...[
                    OrderErrorBanner(message: error),
                    const SizedBox(height: 10),
                  ],
                  for (final l in cart.lines) ...[
                    CartLineRow(
                      line: l,
                      onQty: (d) => onQty(l.key, d),
                      onRemove: () => onRemove(l.key),
                    ),
                    const SizedBox(height: 8),
                  ],
                  const SizedBox(height: 4),
                  TextField(
                    controller: noteCtrl,
                    maxLength: kMaxNoteLength,
                    style: ar(12),
                    cursorColor: kEmeraldText,
                    decoration: InputDecoration(
                      counterText: '',
                      isDense: true,
                      hintText: 'ملاحظة للمكان (اختياريّ)…',
                      hintStyle: ar(12, color: Tw.gray600),
                      filled: true,
                      fillColor: const Color(0x0DFFFFFF),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide:
                            const BorderSide(color: Color(0x1AFFFFFF)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide:
                            const BorderSide(color: Color(0x6610B981)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Divider(height: 1, color: Color(0x12FFFFFF)),
          Padding(
            padding: EdgeInsets.fromLTRB(20, 12, 20,
                14 + MediaQuery.viewPaddingOf(context).bottom +
                    MediaQuery.viewInsetsOf(context).bottom),
            child: Row(children: [
              Expanded(
                child: Opacity(
                  opacity: sending ? 0.5 : 1,
                  child: InkWell(
                    onTap: sending ? null : onSend,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF10B981), Color(0xFF0D9488)],
                        ),
                      ),
                      child: Center(
                        child: sending
                            ? Text('⏳ يُرسل…',
                                style: ar(13.5, weight: FontWeight.bold))
                            : Text.rich(
                                TextSpan(children: [
                                  const TextSpan(text: 'إرسال الطلب • '),
                                  TextSpan(text: ltrRun(jod(cart.total))),
                                ]),
                                style: ar(13.5, weight: FontWeight.bold),
                              ),
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
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: const Color(0x0DFFFFFF),
                    border: Border.all(color: const Color(0x1AFFFFFF)),
                  ),
                  child: Text('متابعة', style: ar(13.5, color: Tw.gray400)),
                ),
              ),
            ]),
          ),
        ]),
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
