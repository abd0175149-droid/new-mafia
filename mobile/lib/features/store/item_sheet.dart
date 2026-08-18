import 'dart:async';
import 'package:flutter/material.dart';

import '../../models/store.dart';
import '../../models/wallet.dart' show groupThousands;
import '../../core/api/game_config_service.dart';
import '../cosmetics/mafia_card_view.dart';
import '../profile/profile_palette.dart';
import 'store_widgets.dart';

// ══════════════════════════════════════════════════════
// 🎁 ورقة العنصر وأفعاله — §4.2(ج) في الملفّ 33
// ══════════════════════════════════════════════════════
// الويب يضع هذه المعلومات في عمودٍ بجانب المرآة. المرآة تنتظر كرت اللعب
// (الملفّ 22)، فالمعلومات والأفعال تُعرض في ورقة — نفس المحتوى ونفس
// الترتيب، وتنتقل إلى العمود حين تصل المرآة.

enum ItemAction { rent, trial, equip, unequip, needChips }

Future<ItemAction?> showItemSheet(
  BuildContext context, {
  required StoreItem item,
  required int balance,
  required bool equipped,
  required bool busy,
  String playerName = 'اسمك',
}) {
  return showModalBottomSheet<ItemAction>(
    context: context,
    // 🔴 مُلاحِح الجذر: ما يُفتح من داخل تبويبٍ في `StatefulShellRoute`
    //    يُرسم تحت شريط التنقّل السفليّ فيُقصّ من أسفله.
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xB3000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 448,
      maxHeight: MediaQuery.sizeOf(context).height * 0.80,
    ),
    builder: (_) => _ItemSheet(
        item: item, balance: balance, equipped: equipped, busy: busy,
        playerName: playerName),
  );
}

class _ItemSheet extends StatelessWidget {
  const _ItemSheet({
    required this.item,
    required this.balance,
    required this.equipped,
    required this.busy,
    required this.playerName,
  });

  final StoreItem item;
  final int balance;
  final bool equipped, busy;
  final String playerName;

  @override
  Widget build(BuildContext context) {
    final i = item;
    final short = i.priceChips - balance;

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1A1A1A), Color(0xFF0A0A0A)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: Color(0x33FBBF24))),
      ),
      padding: EdgeInsets.fromLTRB(
          24, 16, 24, 24 + MediaQuery.viewPaddingOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: const Color(0x33FFFFFF),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            Center(child: ItemThumb(item: i, size: 72, playerName: playerName)),
            const SizedBox(height: 12),

            // ① صفّ الندرة
            Row(children: [
              rarityDot(i.rarity),
              const SizedBox(width: 6),
              Text(
                '${i.owned ? 'تملكه' : i.isAchievement ? '👑 إنجاز' : 'تعاينه الآن'}'
                ' · ${rarityLabel(i.rarity)}',
                style: ar(10, color: Tw.gray500),
              ),
            ]),
            const SizedBox(height: 4),

            // ② الاسم
            Text(i.nameAr,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: 0)),

            // ③ جملة البيع — هنا لا في الشبكة: يقرؤها من اهتمّ فعلاً
            if (i.hookAr != null) ...[
              const SizedBox(height: 4),
              Text(i.hookAr!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: ar(10.5, color: Tw.gray400)),
            ],
            const SizedBox(height: 8),

            // ④ السطر الماليّ
            _money(i),
            const SizedBox(height: 12),

            // ⑤ الأفعال
            _actions(context, i, short),
          ],
        ),
      ),
    );
  }

  Widget _money(StoreItem i) {
    if (i.owned) {
      return Text('⏳ متبقٍ ${i.daysLeftText}',
          style: num_(11, color: const Color(0xFF34D399)));
    }
    if (i.isAchievement) {
      return Text.rich(TextSpan(children: [
        TextSpan(
            text: i.achievementAr == null
                ? 'إنجاز فقط'
                : 'يُنال بـ${i.achievementAr}',
            style: ar(10.5,
                color: const Color(0xFFCBD5E1), weight: FontWeight.bold)),
        if (i.holderName != null)
          TextSpan(
              text: ' · يحمله ${i.holderName}',
              style: ar(10.5, color: const Color(0xCCFBBF24))),
      ]));
    }
    return Text.rich(TextSpan(children: [
      TextSpan(text: '🪙 ${i.priceChips}', style: num_(11, color: Tw.amber400)),
      if (i.perDayText != null)
        TextSpan(
            text: ' · ${i.perDayText} يومياً',
            style: ar(11, color: Tw.gray500)),
    ]));
  }

  Widget _actions(BuildContext context, StoreItem i, int short) {
    final kind = StoreKind.of(i.kind);
    final buttons = <Widget>[];

    if (i.owned) {
      if (kind.wearable) {
        buttons.add(Expanded(
          child: _button(
            equipped ? 'إزالة من بطاقتي' : '🎽 جهّزه الآن',
            filled: !equipped,
            onTap: () => Navigator.of(context)
                .pop(equipped ? ItemAction.unequip : ItemAction.equip),
          ),
        ));
      }
      // «جدّد» يستدعي نفس مسار الاستئجار — عملية واحدة عند الخادم
      buttons.add(_button('🔄 جدّد',
          onTap: () => Navigator.of(context).pop(
              balance >= i.priceChips ? ItemAction.rent : ItemAction.needChips)));
    } else if (i.isPurchasable) {
      final enough = balance >= i.priceChips;
      buttons.add(Expanded(
        child: _button(
          busy
              ? '…'
              : enough
                  ? 'استأجر — 🪙${i.priceChips}'
                  : 'ينقصك ${groupThousands(short)} 🪙',
          filled: true,
          onTap: busy
              ? null
              : () => Navigator.of(context)
                  .pop(enough ? ItemAction.rent : ItemAction.needChips),
        ),
      ));
      if (i.trialEligible) {
        buttons.add(_button('🎁 ٣ أيام',
            color: const Color(0x332563EA),
            border: const Color(0x660EA5E9),
            text: const Color(0xFFBAE6FD),
            onTap: () => Navigator.of(context).pop(ItemAction.trial)));
      }
    }

    if (buttons.isEmpty) return const SizedBox.shrink();

    return Row(children: [
      for (var n = 0; n < buttons.length; n++) ...[
        if (n > 0) const SizedBox(width: 6),
        buttons[n],
      ],
    ]);
  }

  Widget _button(
    String label, {
    bool filled = false,
    Color? color,
    Color? border,
    Color? text,
    VoidCallback? onTap,
  }) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Opacity(
          opacity: onTap == null ? 0.5 : 1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: filled && color == null
                  ? const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFFBBF24), Color(0xFFD97706)])
                  : null,
              color: color ?? (filled ? null : const Color(0x0DFFFFFF)),
              border: Border.all(color: border ?? const Color(0x1AFFFFFF)),
            ),
            child: Center(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(12.5,
                      color: text ?? (filled ? Colors.black : Tw.gray300),
                      weight: FontWeight.bold)),
            ),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.6 لوحة نقص الرصيد
// ══════════════════════════════════════════════════════
Future<void> showNeedChips(
  BuildContext context, {
  required StoreItem item,
  required int balance,
  EarnRates? rates,
}) {
  final short = item.priceChips - balance;

  return showModalBottomSheet(
    context: context,
    // 🔴 مُلاحِح الجذر: ما يُفتح من داخل تبويبٍ في `StatefulShellRoute`
    //    يُرسم تحت شريط التنقّل السفليّ فيُقصّ من أسفله.
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xB3000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 448,
      maxHeight: MediaQuery.sizeOf(context).height * 0.80,
    ),
    builder: (ctx) => Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1A1A1A), Color(0xFF0A0A0A)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: Color(0x33FBBF24))),
      ),
      padding: EdgeInsets.fromLTRB(
          24, 16, 24, 40 + MediaQuery.viewPaddingOf(ctx).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: const Color(0x33FFFFFF),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            Text('ينقصك $short 🪙 لـ«${item.nameAr}»',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: 0)),
            const SizedBox(height: 16),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: SizedBox(
                height: 8,
                child: Stack(children: [
                  const ColoredBox(
                      color: Color(0x0DFFFFFF), child: SizedBox.expand()),
                  TweenAnimationBuilder<double>(
                    tween: Tween(
                        begin: 0,
                        end: item.priceChips == 0
                            ? 0
                            : (balance / item.priceChips).clamp(0, 1)),
                    duration: const Duration(milliseconds: 700),
                    curve: Curves.easeOut,
                    builder: (_, v, __) => FractionallySizedBox(
                      widthFactor: v,
                      heightFactor: 1,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                              colors: [Color(0xFFFBBF24), Color(0xFFD97706)]),
                        ),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: ltrText('${groupThousands(balance)} من ${groupThousands(item.priceChips)} 🪙',
                  num_(11, color: Tw.gray500, weight: FontWeight.w400)),
            ),

            // 🔴 الأرقام من `earnRates` وحدها. غيابها يُخفي القسم — رقمٌ
            //    مخمَّن عن رصيد اللاعب أسوأ من لا شيء.
            if (rates != null && rates.any) ...[
              const SizedBox(height: 20),
              Text('اكسبها باللعب',
                  style: ar(12, color: Tw.gray300, weight: FontWeight.w900)),
              const SizedBox(height: 6),
              if (rates.win > 0)
                Text(
                  '🏆 كل فوز +${rates.win} — أي ${(short / rates.win).ceil()} فوزاً',
                  style: ar(11.5, color: Tw.gray400),
                ),
              if (rates.top3 > 0)
                Text('🥉 ضمن أفضل ثلاثة +${rates.top3}',
                    style: ar(11.5, color: Tw.gray400)),
              if (rates.birthday > 0)
                Text('🎂 عيديّة النادي +${rates.birthday}',
                    style: ar(11.5, color: Tw.gray400)),
            ],

            const SizedBox(height: 20),
            // 🔴 بلا أي مبلغ بالدينار ولا قائمة باقات: لا شراء داخل
            //    التطبيق إطلاقاً، والشحن يقع في القاعة.
            Text('أو اشحن رصيدك من الإدارة',
                textAlign: TextAlign.center,
                style: ar(12, color: Tw.gray300, weight: FontWeight.bold)),
            const SizedBox(height: 2),
            Text('الشحن يتم في النادي عند الحضور — كلّم الإدارة.',
                textAlign: TextAlign.center, style: ar(11, color: Tw.gray500)),
            const SizedBox(height: 20),
            InkWell(
              onTap: () => Navigator.of(ctx).pop(),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0x0DFFFFFF),
                  border: Border.all(color: const Color(0x1AFFFFFF)),
                ),
                child: Center(
                    child: Text('تمام',
                        style: ar(14, weight: FontWeight.bold))),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

// ══════════════════════════════════════════════════════
// §4.7 احتفال الشراء — البطاقة الكبيرة وعليها ما اشتراه
// ══════════════════════════════════════════════════════
/// 🔴 التجديد ليس اقتناءً: «صار «كذا» لك» لمن يملكه أصلاً كذبةٌ صغيرة
///    تُربك — والمشتري يعرف أنه كان يملكه. النصّ ينقسم على `renewed`.
Future<void> showPurchaseCelebration(
  BuildContext context,
  StoreItem item, {
  bool renewed = false,
  String? remainingText,
  String playerName = 'اسمك',
  StoreData? data,
  /// 🔴 STORE-4: زرّ تجهيزٍ فوريّ حين يكون المشترى قابلاً للّبس وغير
  ///    مجهَّز. بدونه على المشتري أن يعيد لمس العنصر ثمّ «جهّزه الآن» —
  ///    خطوتان إضافيّتان، وقد لا يدرك أصلاً أن **الشراء لا يعني التجهيز**
  ///    فيظنّ أن ما دفع ثمنه لا يظهر.
  Future<void> Function()? onEquipNow,
}) {
  return showGeneralDialog(
    context: context,
    // 🔴 مُلاحِح الجذر: ما يُفتح من داخل تبويبٍ في `StatefulShellRoute`
    //    يُرسم تحت شريط التنقّل السفليّ فيُقصّ من أسفله.
    useRootNavigator: true,
    barrierDismissible: true,
    barrierLabel: 'إغلاق',
    barrierColor: const Color(0xD9000000),
    transitionDuration: const Duration(milliseconds: 320),
    // 🔴 `Material` ليس زينة هنا: `showGeneralDialog` يبني فوق الـOverlay
    //    مباشرةً بلا `Material` فوقه، فينزل على كل `Text` النمط الاحتياطيّ
    //    ذو `decoration: underline` بلونٍ أصفر مزدوج — خطٌّ تحت العنوان
    //    وتحت رمز المصغّر. الشفّاف يكفي.
    pageBuilder: (ctx, __, ___) => Material(
      type: MaterialType.transparency,
      child: GestureDetector(
        onTap: () => Navigator.of(ctx).pop(),
        behavior: HitTestBehavior.opaque,
        child: Stack(children: [
          // هالةٌ خلف البطاقة
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  colors: [Color(0x38F59E0B), Colors.transparent],
                  stops: [0, 0.6],
                ),
              ),
            ),
          ),
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // متنفَّسٌ للشعار الطافي فوق الحافّة
                  Padding(
                    padding: const EdgeInsets.only(top: 30),
                    child: MafiaCardView(
                      size: CardSize.lg,
                      playerName: playerName.isEmpty ? 'أنت' : playerName,
                      avatarUrl: data?.avatarUrl,
                      cosmetics:
                          (data?.cosmetics ?? const EquippedCosmetics())
                              .preview(item),
                      template: GameConfigService.instance.master,
                      rankFx: GameConfigService.instance
                          .effectsForTier(data?.rankTier ?? 'INFORMANT'),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                      renewed
                          ? 'مُدِّد «${item.nameAr}»'
                          : 'صار «${item.nameAr}» لك',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          fontFamily: 'Amiri',
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: Tw.amber400,
                          letterSpacing: 0)),
                  const SizedBox(height: 4),
                  Text(
                    renewed
                        ? '+${arabicDays(item.durationDays)}${remainingText == null ? '' : ' — المتبقّي الآن $remainingText'}'
                        : '${remainingText ?? arabicDays(item.durationDays)} — وسيراه كل من في القاعة على الشاشة',
                    textAlign: TextAlign.center,
                    style: ar(12, color: Tw.gray400),
                  ),
                  const SizedBox(height: 20),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    if (onEquipNow != null) ...[
                      InkWell(
                        onTap: () {
                          Navigator.of(ctx).pop();
                          unawaited(onEquipNow());
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 18, vertical: 10),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            color: const Color(0x33C5A059),
                            border: Border.all(color: const Color(0xFFC5A059)),
                          ),
                          child: Text('🎽 جهّزها الآن',
                              style: ar(12,
                                  color: const Color(0xFFC5A059),
                                  weight: FontWeight.w900)),
                        ),
                      ),
                      const SizedBox(width: 10),
                    ],
                    InkWell(
                      onTap: () => Navigator.of(ctx).pop(),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          color: const Color(0x1AFFFFFF),
                          border: Border.all(color: const Color(0x26FFFFFF)),
                        ),
                        child: Text('شوف باقي الخزنة',
                            style: ar(12,
                                color: Tw.gray300, weight: FontWeight.bold)),
                      ),
                    ),
                  ]),
                ],
              ),
            ),
          ),
        ]),
      ),
    ),
    transitionBuilder: (_, a, __, child) {
      final c = CurvedAnimation(parent: a, curve: Curves.easeOutBack);
      return FadeTransition(
        opacity: a,
        child: ScaleTransition(
            scale: Tween(begin: 0.85, end: 1.0).animate(c), child: child),
      );
    },
  );
}
