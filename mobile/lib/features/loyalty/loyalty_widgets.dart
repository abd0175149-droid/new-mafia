import 'dart:async';

import 'package:dotted_border/dotted_border.dart';
import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../core/api/loyalty_api.dart';
import '../../models/fnb.dart' show arDigits;
import '../../models/loyalty.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🎟️ قطع بطاقة الولاء المشتركة — الرئيسيّة والألعاب والبطاقة
// ══════════════════════════════════════════════════════
// 🔴 كلّ ودجت هنا تُقفل على `LoyaltyApi.instance.enabled` أو على حقلٍ
//    لا يرسله الخادم إلّا والميزة مفعّلة (`loyaltyCutoffAt`). المعطَّل
//    يعني `SizedBox.shrink()` لا لافتةً فارغة.

const kLoyaltyGreen = Color(0xFF4ADE80);
const kLoyaltyGreenText = Color(0xFF9BE0B6);
const kLoyaltyRose = Color(0xFFFB7185);

// ══════════════════════════════════════════════════════
// ✦ دائرة الختم
// ══════════════════════════════════════════════════════
/// مملوءةٌ عنبريّةً بـ✦ للختم المكتسب، ومتقطّعةٌ للباقي، وخضراء بـ🎁
/// حين تُلحق مكافأةً جاهزة.
class StampCircle extends StatelessWidget {
  const StampCircle({
    super.key,
    required this.size,
    this.filled = false,
    this.gift = false,
  });

  final double size;
  final bool filled, gift;

  @override
  Widget build(BuildContext context) {
    if (gift) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0x2622C55E),
          border: Border.all(color: const Color(0x8022C55E)),
        ),
        child: Center(child: Text('🎁', style: TextStyle(fontSize: size * 0.46))),
      );
    }
    if (filled) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
          ),
          boxShadow: [
            BoxShadow(
                color: const Color(0x66F59E0B),
                blurRadius: size * 0.3,
                spreadRadius: 0),
          ],
        ),
        child: Center(
          child: Text('✦',
              style: TextStyle(
                  fontSize: size * 0.5,
                  color: Colors.black,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0)),
        ),
      );
    }
    return DottedBorder(
      color: const Color(0x66FBBF24),
      borderType: BorderType.Circle,
      dashPattern: const [4, 3],
      strokeWidth: 1.2,
      padding: EdgeInsets.zero,
      child: SizedBox(
        width: size,
        height: size,
        child: Center(
          child: Text('✦',
              style: TextStyle(
                  fontSize: size * 0.4,
                  color: const Color(0x33FBBF24),
                  letterSpacing: 0)),
        ),
      ),
    );
  }
}

/// صفّ الأختام: N دوائر + 🎁 حين تكون مكافأةٌ معلّقةً أو جاهزة.
class StampRow extends StatelessWidget {
  const StampRow({
    super.key,
    required this.total,
    required this.filled,
    this.gift = false,
    this.size = 26,
    this.gap = 6,
  });

  final int total, filled;
  final bool gift;
  final double size, gap;

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: gap,
        runSpacing: gap,
        children: [
          for (var i = 0; i < total; i++)
            StampCircle(size: size, filled: i < filled),
          if (gift) StampCircle(size: size, gift: true),
        ],
      );
}

// ══════════════════════════════════════════════════════
// 🏠 لافتة الرئيسيّة
// ══════════════════════════════════════════════════════
/// بأسلوب لافتة «خزنة الدون» — عنبريّةٌ لا ذهبيّة: العنبريّ لون التشبس
/// والمكافآت في التطبيق كلّه. تختفي كلّياً حين تكون الميزة معطّلة.
class LoyaltyHomeBanner extends StatelessWidget {
  const LoyaltyHomeBanner({super.key, this.topGap = 20});

  /// فراغٌ يسبق اللافتة — داخلها كي يزول معها حين تُخفى.
  final double topGap;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: LoyaltyApi.instance,
        builder: (context, _) {
          final me = LoyaltyApi.instance.me;
          if (me == null || !me.enabled) return const SizedBox.shrink();
          return Padding(
            padding: EdgeInsets.only(top: topGap),
            child: _Banner(me: me),
          );
        },
      );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.me});
  final LoyaltyMe me;

  @override
  Widget build(BuildContext context) {
    final n = me.config.stampsPerReward;
    final card = me.card;
    final pending = me.pendingChoice;
    final hasGift = pending != null || me.available.isNotEmpty;
    // بطاقةٌ كاملة عند بلوغ الحدّ: الشهر انتهى ولاءً، لا بطاقة فارغة
    final filled = card.capReached ? n : card.inCard;

    final String status;
    final Color statusColor;
    if (pending != null) {
      status = 'اكتملت! مكافأتك بانتظار اختيارك';
      statusColor = kLoyaltyGreen;
    } else if (card.capReached) {
      status = 'بلغت حدّ الشهر — بطاقة الشهر القادم تنتظرك';
      statusColor = const Color(0xFF9A8F7E);
    } else {
      status = 'بقي ${arDigits(card.needed)} أختام للمكافأة';
      statusColor = const Color(0xFFD6B77A);
    }

    return GestureDetector(
      onTap: () => pushTo(Routes.loyalty),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0x26F59E0B), Color(0x0DF59E0B)],
          ),
          border: Border.all(color: const Color(0x40F59E0B)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('🎟️', style: TextStyle(fontSize: 24)),
              const SizedBox(width: 10),
              Expanded(
                child: Text('بطاقة الولاء — ${me.monthName}',
                    style: const TextStyle(
                        fontFamily: 'Amiri',
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        color: Tw.amber400,
                        letterSpacing: 0)),
              ),
              const Icon(Icons.arrow_back_ios_new, size: 14, color: Tw.amber400),
            ]),
            const SizedBox(height: 10),
            StampRow(total: n, filled: filled, gift: hasGift, size: 24),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: Text(status,
                    style: ar(11, color: statusColor, weight: FontWeight.w600)),
              ),
              if (pending != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF4ADE80), Color(0xFF22C55E)],
                    ),
                  ),
                  // «←» حرفيّ: يشير يساراً وهو اتجاه التقدّم في RTL
                  child: Text('اختر ←',
                      style: ar(11, color: Colors.black, weight: FontWeight.w700)),
                ),
              ],
            ]),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// ⏳ سطر القطع على بطاقة الفعاليّة
// ══════════════════════════════════════════════════════
/// قبل القطع: أخضر مع عدٍّ تنازليّ حيّ (كلّ ٣٠ ثانية تكفي — الدقّة
/// بالدقائق). بعده: ورديّ خافت بساعة القطع بتوقيت الأردن.
///
/// 🔴 لا يُعرض إلّا حين يرسل الخادم `loyaltyCutoffAt` — وهو `null` والميزة
///    معطّلة، فالسطر مقفلٌ على المفتاح الرئيسيّ من مصدره.
class LoyaltyCutoffLine extends StatefulWidget {
  const LoyaltyCutoffLine({super.key, required this.cutoffAt, this.size = 10.5});

  final DateTime cutoffAt;
  final double size;

  @override
  State<LoyaltyCutoffLine> createState() => _LoyaltyCutoffLineState();
}

class _LoyaltyCutoffLineState extends State<LoyaltyCutoffLine> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = loyaltyVerdictNow(widget.cutoffAt);
    return Text(
      v.before
          ? '✦ الحجز الآن يُحتسب ختماً · ⏳ باقي ${v.remaining}'
          : 'فات وقت الختم — كان القطع ${jordanHHMM(widget.cutoffAt)}',
      style: ar(widget.size,
          color: v.before ? kLoyaltyGreen : const Color(0xB3FB7185),
          weight: v.before ? FontWeight.w600 : FontWeight.w400),
    );
  }
}

/// حكم اللحظة على القطع: هل ما زال الحجز يُحتسب؟ وكم بقي؟
({bool before, String remaining}) loyaltyVerdictNow(DateTime cutoffAt) {
  final diff = cutoffAt.difference(DateTime.now());
  if (diff.isNegative || diff.inSeconds <= 0) return (before: false, remaining: '');
  final h = diff.inHours;
  final m = diff.inMinutes % 60;
  final String rem;
  if (h >= 48) {
    rem = '${arDigits(diff.inDays)} يوم';
  } else if (h > 0) {
    rem = '${arDigits(h)} س ${arDigits(m)} د';
  } else {
    rem = '${arDigits(m == 0 ? 1 : m)} د';
  }
  return (before: true, remaining: rem);
}

/// صندوق الحكم في ورقة تأكيد الحجز — أخضر أو ورديّ مع الشرط.
class LoyaltyVerdictBox extends StatelessWidget {
  const LoyaltyVerdictBox({super.key, required this.cutoffAt});
  final DateTime cutoffAt;

  @override
  Widget build(BuildContext context) {
    final v = loyaltyVerdictNow(cutoffAt);
    final tint = v.before ? const Color(0xFF22C55E) : const Color(0xFFF43F5E);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: tint.withValues(alpha: 0.10),
        border: Border.all(color: tint.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            v.before
                ? '✦ هذا الحجز يُحتسب ختماً · ⏳ باقي ${v.remaining}'
                : 'فات وقت الختم — كان القطع ${jordanHHMM(cutoffAt)}',
            style: ar(12.5,
                color: v.before ? kLoyaltyGreen : kLoyaltyRose,
                weight: FontWeight.w700),
          ),
          if (v.before) ...[
            const SizedBox(height: 4),
            Text(
              'بشرط أن تلعب مباراةً واحدة الليلة. لو ألغيت الحجز وأعدته بعد الموعد يسقط الختم.',
              style: ar(10.5, color: Tw.gray400, height: 1.5),
            ),
          ],
        ],
      ),
    );
  }
}
