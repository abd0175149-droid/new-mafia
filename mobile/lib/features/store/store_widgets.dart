import 'package:flutter/material.dart';

import '../../models/store.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🏦 قطع الخزنة — §4.4 و§4.5 و§4.8 في الملفّ 33
// ══════════════════════════════════════════════════════
// 📌 المصغّرات الحقيقية (إطار مرسوم، لقب منسّق، تأثير اسم) تأتي مع طبقة
//    المظهر (الملفّ 34). حتى ذلك الحين يقوم مقامها **رمز النوع** بلون
//    ندرته — إشارةٌ صادقة لا رسمٌ مخترع يشتري اللاعب على أساسه.

const _kindGlyph = <String, String>{
  'frame': '🃏', 'title': '🏷️', 'name_fx': '✨', 'entrance': '🚪',
  'elimination': '🔥', 'victory_sting': '🔊', 'xp_boost': '⚡',
};

class ItemThumb extends StatelessWidget {
  const ItemThumb({super.key, required this.item, required this.size});

  final StoreItem item;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = rarityColor(item.rarity);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.22),
        color: c.withValues(alpha: 0.10),
        border: Border.all(color: c.withValues(alpha: 0.35)),
      ),
      child: Center(
        child: Text(_kindGlyph[item.kind] ?? '🎁',
            style: TextStyle(fontSize: size * 0.45)),
      ),
    );
  }
}

Widget rarityDot(String rarity, {double size = 6}) => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: rarityColor(rarity)),
    );

/// السطر الماليّ المشترك بين البطاقة والصفّ.
Widget priceLine(StoreItem i, {double size = 10.5}) {
  if (i.owned) {
    return Text('⏳ ${i.daysLeftText}',
        style: num_(size, color: const Color(0xFF6EE7B7)));
  }
  if (i.isAchievement) {
    return Text('👑 إنجاز', style: num_(size, color: const Color(0xFFCBD5E1)));
  }
  return ltrText('🪙 ${i.priceChips}', num_(size, color: Tw.amber400));
}

// ══════════════════════════════════════════════════════
// §4.4 بطاقة الشبكة — بلا أزرار وبلا جملة بيع
// ══════════════════════════════════════════════════════
class StoreGridItem extends StatelessWidget {
  const StoreGridItem({
    super.key,
    required this.item,
    required this.equipped,
    required this.onTap,
  });

  final StoreItem item;
  final bool equipped;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final badge = item.owned
        ? null
        : item.isHot
            ? '🔥'
            : item.isNew
                ? '✦ جديد'
                : item.wasOwned
                    ? '↩︎ كان لك'
                    : null;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x08FFFFFF),
          border: Border.all(color: const Color(0x14FFFFFF)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 78,
              child: Stack(children: [
                const Positioned.fill(child: ColoredBox(color: Color(0x40000000))),
                Center(child: ItemThumb(item: item, size: 54)),
                PositionedDirectional(
                  top: 6, start: 6, child: rarityDot(item.rarity)),
                if (equipped)
                  PositionedDirectional(
                    top: 4,
                    end: 4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(4),
                        color: const Color(0x3310B981),
                        border: Border.all(color: const Color(0x7310B981)),
                      ),
                      child: Text('مُجهَّز',
                          style: ar(8,
                              color: const Color(0xFF6EE7B7),
                              weight: FontWeight.w900)),
                    ),
                  ),
                if (badge != null)
                  PositionedDirectional(
                    bottom: 4,
                    start: 4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(4),
                        color: const Color(0xB3000000),
                      ),
                      child: Text(badge,
                          style: ar(8, weight: FontWeight.w900)),
                    ),
                  ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ⚠️ ارتفاع أدنى 28: بلا سقفٍ للاسم تختلف أطوال البطاقات
                  //    فتتكسّر الشبكة عمودياً.
                  ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 28),
                    child: Text(item.nameAr,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontFamily: 'Amiri',
                            fontSize: 11.5,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFFF3F4F6),
                            letterSpacing: 0)),
                  ),
                  const SizedBox(height: 2),
                  priceLine(item),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// §4.5 صفّ — ما يُعرَض ويُسمَع
// ══════════════════════════════════════════════════════
class StoreRowItem extends StatelessWidget {
  const StoreRowItem({super.key, required this.item, required this.onTap});

  final StoreItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: const Color(0x08FFFFFF),
            border: Border.all(color: const Color(0x14FFFFFF)),
          ),
          child: Row(children: [
            ItemThumb(item: item, size: 44),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(children: [
                    rarityDot(item.rarity),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(item.nameAr,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontFamily: 'Amiri',
                              fontSize: 12.5,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: 0)),
                    ),
                  ]),
                  if (item.hookAr != null) ...[
                    const SizedBox(height: 2),
                    Text(item.hookAr!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(10, color: Tw.gray400)),
                  ],
                  const SizedBox(height: 2),
                  priceLine(item),
                ],
              ),
            ),
          ]),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.8 الخزنة المقفلة
// ══════════════════════════════════════════════════════
class ClosedVault extends StatelessWidget {
  const ClosedVault({super.key, required this.items});
  final List<StoreItem> items;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 32),
        child: Opacity(
          opacity: 0.7,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('🔒 خزنة مقفلة — لا تعود',
                  style: ar(13, color: Tw.gray400, weight: FontWeight.w900)),
              const SizedBox(height: 2),
              Text('أُغلقت نهائياً. من اقتناها احتفظ بشيء لن يُطرح ثانيةً.',
                  style: ar(10.5, color: Tw.gray600)),
              const SizedBox(height: 8),
              for (final i in items)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Color(0x0DFFFFFF))),
                  ),
                  child: Row(children: [
                    ItemThumb(item: i, size: 32),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(i.nameAr,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ar(12, color: Tw.gray300)),
                    ),
                    if (i.owners > 0)
                      Text('${i.owners} يملكونها',
                          style: ar(10, color: Tw.gray600)),
                  ]),
                ),
            ],
          ),
        ),
      );
}
