import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../core/api/loyalty_api.dart';
import '../../models/fnb.dart' show arDigits;
import '../../models/loyalty.dart';
import '../profile/profile_palette.dart';
import '../shell/chips_balance_pill.dart';
import 'loyalty_choose_sheet.dart';
import 'loyalty_widgets.dart';

// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء — `/player/loyalty`
// ══════════════════════════════════════════════════════
// شاشةٌ عليا فوق الغلاف كالمحفظة: ترويسةٌ ثابتة (رجوع · العنوان · حبّة
// الرصيد) ثمّ البطاقة والزيارات والمكافآت وكيفيّة الكسب.
//
// 🔴 المفتاح الرئيسيّ: إن عادت `/me` بـ`enabled:false` أو فشلت تخرج
//    الشاشة بنفسها إلى ما تحتها — رابطُ إشعارٍ قديم لا يُهبط اللاعب على
//    صفحةٍ فارغة تشرح ميزةً لا وجود لها.

class LoyaltyScreen extends StatefulWidget {
  const LoyaltyScreen({super.key});

  @override
  State<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends State<LoyaltyScreen> {
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final me = await LoyaltyApi.instance.refresh();
    if (!mounted) return;
    if (!me.enabled) {
      popOrHome(context);
      return;
    }
    setState(() => _loading = false);
  }

  Future<void> _choose(LoyaltyMe me, LoyaltyReward reward) async {
    final ok = await showLoyaltyChooseSheet(context, me: me, reward: reward);
    if (ok == true && mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => PopsToHome(
        child: Scaffold(
          backgroundColor: const Color(0xFF050505),
          body: SafeArea(
            bottom: false,
            child: Column(children: [
              _header(),
              Expanded(
                child: AnimatedBuilder(
                  animation: LoyaltyApi.instance,
                  builder: (context, _) {
                    final me = LoyaltyApi.instance.me;
                    if (_loading || me == null || !me.enabled) {
                      return const Center(
                        child: SizedBox(
                          width: 32,
                          height: 32,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Tw.amber500),
                        ),
                      );
                    }
                    return RefreshIndicator(
                      onRefresh: _load,
                      color: Tw.amber500,
                      backgroundColor: const Color(0xFF111111),
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                        children: [
                          _CardHero(me: me, onChoose: () => _choose(me, me.pendingChoice!)),
                          if (me.available.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            for (final r in me.available) ...[
                              _AvailableReward(reward: r, cfg: me.config),
                              const SizedBox(height: 8),
                            ],
                          ],
                          const SizedBox(height: 20),
                          _sectionTitle('زيارات ${me.monthName}'),
                          const SizedBox(height: 10),
                          if (me.visits.isEmpty)
                            _empty('لا زيارات هذا الشهر بعد — احجز من التطبيق والعب')
                          else
                            for (final v in me.visits) _VisitRow(visit: v),
                          const SizedBox(height: 20),
                          _sectionTitle('سجلّ المكافآت'),
                          const SizedBox(height: 10),
                          if (me.rewards.isEmpty)
                            _empty('لا مكافآت بعد — ${arDigits(me.config.stampsPerReward)} أختام تجلب الأولى')
                          else
                            for (final r in me.rewards) _RewardRow(reward: r, cfg: me.config),
                          const SizedBox(height: 20),
                          _HowTo(cfg: me.config),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ]),
          ),
        ),
      );

  Widget _header() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: const BoxDecoration(
          color: Color(0xD9050505),
          border: Border(bottom: BorderSide(color: Color(0x26F59E0B))),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            InkWell(
              onTap: () => popOrHome(context),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Text('← رجوع', style: ar(14, color: Tw.gray500)),
              ),
            ),
            const Text('🎟️ بطاقة الولاء',
                style: TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: Tw.amber400,
                    letterSpacing: 0)),
            const ChipsBalancePill(),
          ],
        ),
      );

  Widget _sectionTitle(String t) => Text(t,
      style: const TextStyle(
          fontFamily: 'Amiri',
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: Tw.gray300,
          letterSpacing: 0));

  Widget _empty(String t) => Container(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
        decoration: glassCard(),
        child: Center(
          child: Text(t, textAlign: TextAlign.center, style: ar(12, color: Tw.gray500)),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🃏 بطاقة الشهر
// ══════════════════════════════════════════════════════
class _CardHero extends StatelessWidget {
  const _CardHero({required this.me, required this.onChoose});
  final LoyaltyMe me;
  final VoidCallback onChoose;

  @override
  Widget build(BuildContext context) {
    final n = me.config.stampsPerReward;
    final card = me.card;
    final pending = me.pendingChoice;
    final filled = card.capReached ? n : card.inCard;

    final String sub;
    if (card.capReached) {
      sub = 'بلغت حدّ الشهر (${arDigits(me.config.maxRewardsPerMonth)} مكافآت) — بطاقة الشهر القادم تنتظرك';
    } else if (card.cardsCompleted > 0) {
      sub = 'اكتملت ${arDigits(card.cardsCompleted)} بطاقة هذا الشهر · الحدّ ${arDigits(me.config.maxRewardsPerMonth)} مكافآت';
    } else {
      sub = 'بقي ${arDigits(card.needed)} أختام للمكافأة · الحدّ ${arDigits(me.config.maxRewardsPerMonth)} مكافآت في الشهر';
    }

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0x2EF59E0B), Color(0xE6050505)],
        ),
        border: Border.all(color: const Color(0x59F59E0B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('بطاقة ${me.monthName}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: Tw.amber400,
                  letterSpacing: 0)),
          const SizedBox(height: 16),
          Center(
            child: StampRow(
              total: n,
              filled: filled,
              gift: pending != null,
              size: 52,
              gap: 10,
            ),
          ),
          const SizedBox(height: 14),
          Text('${arDigits(filled)} / ${arDigits(n)} أختام',
              textAlign: TextAlign.center,
              style: num_(20, color: Colors.white, weight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(sub,
              textAlign: TextAlign.center,
              style: ar(11, color: Tw.gray400, height: 1.5)),
          if (pending != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: const Color(0x1F22C55E),
                border: Border.all(color: const Color(0x5922C55E)),
              ),
              child: Row(children: [
                Expanded(
                  child: Text(
                    '🎁 مكافأة جاهزة — اختر قبل ${pending.chooseBy != null ? jordanDayMonth(pending.chooseBy!) : 'انتهاء المهلة'}',
                    style: ar(12, color: kLoyaltyGreenText, weight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 8),
                InkWell(
                  onTap: onChoose,
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      gradient: const LinearGradient(
                        colors: [Color(0xFF4ADE80), Color(0xFF22C55E)],
                      ),
                    ),
                    child: Text('اختر',
                        style: ar(12, color: Colors.black, weight: FontWeight.w700)),
                  ),
                ),
              ]),
            ),
          ],
        ],
      ),
    );
  }
}

/// مكافأةٌ جاهزة — زيارة أو مشروب (التشبس فوريّةٌ فلا تكون «جاهزة»).
class _AvailableReward extends StatelessWidget {
  const _AvailableReward({required this.reward, required this.cfg});
  final LoyaltyReward reward;
  final LoyaltyConfig cfg;

  @override
  Widget build(BuildContext context) {
    final r = reward;
    final String title, sub;
    if (r.isFreeVisit) {
      title = '🎟️ زيارة مجّانيّة';
      sub = 'تُطبَّق تلقائيّاً على حجزك القادم';
    } else if (r.isFreeDrink) {
      final cap = (r.value['capJod'] as num?)?.toDouble() ?? cfg.drinkCapJod;
      title = '☕ مشروب مجّاني حتى ${jodText(cap)}';
      sub = 'يُخصم من فاتورتك في المكان';
    } else {
      title = r.label(chips: cfg.chipsAmount);
      sub = 'جاهزة';
    }
    final exp = r.expiresAt;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0x2422C55E), Color(0x0A22C55E)],
        ),
        border: Border.all(color: const Color(0x4D22C55E)),
      ),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: ar(13, color: kLoyaltyGreenText, weight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text('$sub${exp != null ? ' · تنتهي ${jordanDayMonth(exp)}' : ''}',
                  style: ar(10.5, color: Tw.gray400)),
            ],
          ),
        ),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════
// 📅 صفّ زيارة
// ══════════════════════════════════════════════════════
class _VisitRow extends StatelessWidget {
  const _VisitRow({required this.visit});
  final LoyaltyVisit visit;

  @override
  Widget build(BuildContext context) {
    final v = visit;
    final parts = visitDayParts(v.date);
    final (fg, bg) = _pillColors(v.verdict);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: glassCard(radius: 14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        // سكّة التاريخ — على اليمين في RTL
        SizedBox(
          width: 40,
          child: Column(children: [
            Text(parts.day, style: num_(18, color: Tw.gray300, weight: FontWeight.w700)),
            Text(parts.weekday, style: ar(9, color: Tw.gray600)),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(v.activityName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(13, weight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(v.explanation, style: ar(10.5, color: Tw.gray500)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: bg,
          ),
          child: Text(v.verdictLabel, style: ar(10.5, color: fg, weight: FontWeight.w700)),
        ),
      ]),
    );
  }

  static (Color, Color) _pillColors(String verdict) => switch (verdict) {
        'stamped' => (kLoyaltyGreen, const Color(0x1F22C55E)),
        'late' || 'channel' || 'no_booking' => (kLoyaltyRose, const Color(0x1FF43F5E)),
        'no_show' => (Tw.amber400, const Color(0x1FF59E0B)),
        _ => (Tw.gray400, const Color(0x14FFFFFF)),
      };
}

// ══════════════════════════════════════════════════════
// 🎁 صفّ مكافأة في السجلّ
// ══════════════════════════════════════════════════════
class _RewardRow extends StatelessWidget {
  const _RewardRow({required this.reward, required this.cfg});
  final LoyaltyReward reward;
  final LoyaltyConfig cfg;

  @override
  Widget build(BuildContext context) {
    final r = reward;
    final Color fg = switch (r.status) {
      'pending_choice' => kLoyaltyGreen,
      'available' => kLoyaltyGreenText,
      'redeemed' => Tw.amber400,
      _ => Tw.gray500,
    };
    final when = r.redeemedAt ?? r.earnedAt;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: glassCard(radius: 14),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(r.label(chips: cfg.chipsAmount), style: ar(13, weight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(
                'بطاقة ${periodMonthName(r.period)}'
                '${when != null ? ' · ${jordanDayMonth(when)}' : ''}',
                style: ar(10.5, color: Tw.gray500),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(r.statusLabel, style: ar(11, color: fg, weight: FontWeight.w700)),
      ]),
    );
  }
}

// ══════════════════════════════════════════════════════
// ❓ كيف تكسب ختماً؟
// ══════════════════════════════════════════════════════
class _HowTo extends StatelessWidget {
  const _HowTo({required this.cfg});
  final LoyaltyConfig cfg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: solidCard(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            cardTitle('كيف تكسب ختماً؟'),
            const SizedBox(height: 10),
            _line('احجز من التطبيق قبل الفعاليّة بـ${arDigits(cfg.minLeadHours)} ساعات على الأقلّ'),
            _line('والعب مباراةً واحدة على الأقلّ في تلك الليلة'),
            _line('${arDigits(cfg.stampsPerReward)} أختام = مكافأة · البطاقة تُصفَّر أوّل كلّ شهر'),
          ],
        ),
      );

  Widget _line(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('✦ ', style: ar(12, color: Tw.amber400)),
          Expanded(child: Text(t, style: ar(12, color: Tw.gray400, height: 1.5))),
        ]),
      );
}
