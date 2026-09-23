import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../core/api/loyalty_api.dart';
import '../../models/fnb.dart' show arDigits;
import '../../models/loyalty.dart';
import '../profile/profile_palette.dart';
import 'don_seal.dart';

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
// ✦ خانات البطاقة
// ══════════════════════════════════════════════════════
/// المختومة ختمُ شمعٍ بالشعار، والفارغة حلقةٌ متقطّعة برقمها، والأخيرة
/// حلقةٌ صلبة: المكافأة على بعد ختمٍ واحد.

class StampSlot extends StatelessWidget {
  const StampSlot({
    super.key,
    required this.size,
    required this.label,
    this.last = false,
  });

  final double size;
  final String label;
  final bool last;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _SlotPainter(last: last),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontFamily: 'Tajawal',
                fontSize: math.max(9, size * 0.3),
                fontWeight: FontWeight.w600,
                color: last ? kSealBrassHi : const Color(0x5CC9A45C),
                letterSpacing: 0,
              ),
            ),
          ),
        ),
      );
}

class _SlotPainter extends CustomPainter {
  const _SlotPainter({required this.last});

  final bool last;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2 - 0.75;
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = last ? 1.2 : 1.0
      ..strokeCap = StrokeCap.round
      ..color = last ? const Color(0x99EBD6A4) : const Color(0x4DC9A45C);
    if (last) {
      canvas.drawCircle(c, r, p);
      return;
    }
    // حلقةٌ متقطّعة: عدد الشرطات يتبع المحيط كي تبقى كثافتها ثابتة
    final n = math.max(10, (size.width / 4).round());
    final step = 2 * math.pi / n;
    final rect = Rect.fromCircle(center: c, radius: r);
    for (var i = 0; i < n; i++) {
      canvas.drawArc(rect, i * step, step * 0.55, false, p);
    }
  }

  @override
  bool shouldRepaint(_SlotPainter old) => old.last != last;
}

/// صفّ الأختام: N خانة + 🎁 حين تكون مكافأةٌ معلّقةً أو جاهزة.
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
        alignment: WrapAlignment.center,
        children: [
          for (var i = 0; i < total; i++)
            if (i < filled)
              DonSeal(size: size, tiltDeg: sealTilt(i))
            else
              StampSlot(
                size: size,
                label: arDigits(i + 1),
                last: i == total - 1,
              ),
          if (gift)
            Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0x42000000),
                border: Border.all(color: const Color(0x99EBD6A4)),
              ),
              child: Center(
                child: Text('🎁', style: TextStyle(fontSize: size * 0.42)),
              ),
            ),
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
      statusColor = kSealBrassHi;
    } else if (card.capReached) {
      status = 'بلغت حدّ الشهر — بطاقة الشهر القادم تنتظرك';
      statusColor = kCardMuted;
    } else if (card.inCard == 0) {
      status = 'احجز مبكّراً والعب — ختمك الأوّل';
      statusColor = const Color(0xFFC4A9A2);
    } else {
      status = 'بقي ${arDigits(card.needed)} أختام للمكافأة';
      statusColor = const Color(0xFFC4A9A2);
    }

    return DonCard(
      mini: true,
      padding: const EdgeInsets.all(14),
      onTap: () => pushTo(Routes.loyalty),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('بطاقة ${me.monthName}',
                      style: const TextStyle(
                          fontFamily: 'Amiri',
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                          color: kCardCream,
                          letterSpacing: 0)),
                  const SizedBox(height: 2),
                  Text(status, style: ar(11.5, color: statusColor)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0x8CC9A45C)),
                gradient: const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [kSealBrassHi, kSealBrass, Color(0xFFA8823E)],
                  stops: [0.0, 0.55, 1.0],
                ),
              ),
              // «←» حرفيّ: يشير يساراً وهو اتجاه التقدّم في RTL
              child: Text(pending != null ? 'اختر ←' : 'افتح ←',
                  style: ar(11.5,
                      color: const Color(0xFF2A1208), weight: FontWeight.w900)),
            ),
          ]),
          const SizedBox(height: 12),
          Center(child: StampRow(total: n, filled: filled, gift: hasGift, size: 34, gap: 7)),
        ],
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
