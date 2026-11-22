import 'package:flutter/material.dart';

import '../loyalty/don_seal.dart';
import '../profile/profile_palette.dart';
import 'guide_service.dart';
import 'guide_targets.dart';
import 'page_steps.dart' show chapterStart;
import 'training/script.dart' show arNum;

// ══════════════════════════════════════════════════════
// 🕴️ مداخل الجولة (منقولةٌ من TrainingCard.tsx وGuideEntries.tsx، 2026-11-22)
//   • بطاقة «ليلة تجريبيّة» أوّلَ «الألعاب» لصاحب الجولة وحده — حجزها محلّيّ كلّه:
//     لا صفّ في الحجوزات، لا ختم ولاء، لا خصم غياب، لا تقرير.
//   • لافتة الرئيسيّة: لمن أجّل الجولة أو توقّف في منتصفها.
//   • سطر «حسابي»: «أعد جولة الليلة الأولى» ما دام المفتاح يعمل (ومنه يدخلها الموظّفون).
// ══════════════════════════════════════════════════════

const _amber = Color(0xFFFBBF24);
const _green = Color(0xFF22C55E);
const _monthsAr = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيّار', 'حزيران', 'تمّوز', 'آب', 'أيلول', 'تشرين الأوّل', 'تشرين الثاني', 'كانون الأوّل'];
const _daysAr = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

class TrainingCard extends StatelessWidget {
  const TrainingCard({super.key});

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: GuideService.instance,
        builder: (context, _) {
          final g = GuideService.instance;
          if (!g.showTraining) return const SizedBox.shrink();
          final now = DateTime.now();
          final booked = g.booked;
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GuideTarget(
              id: 'training-card',
              child: Stack(clipBehavior: Clip.none, children: [
                Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    gradient: const LinearGradient(begin: Alignment.topRight, end: Alignment.bottomLeft, stops: [0, 0.58],
                        colors: [Color(0x21F59E0B), Color(0x00050505)]),
                    color: const Color(0x08FFFFFF),
                    border: Border.all(color: booked ? const Color(0x4D22C55E) : const Color(0x12FFFFFF)),
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Container(
                        padding: const EdgeInsets.only(left: 14),
                        decoration: const BoxDecoration(border: Border(left: BorderSide(color: Color(0x1AFFFFFF)))),
                        child: Column(children: [
                          Text(arNum(now.day), style: ar(34, color: _amber, weight: FontWeight.w900, height: 1)),
                          const SizedBox(height: 4),
                          Text(_monthsAr[now.month - 1], style: ar(13, color: const Color(0xFFD1D5DB), weight: FontWeight.bold, height: 1)),
                          const SizedBox(height: 8),
                          Text('الآن', style: ar(16, color: _amber, weight: FontWeight.w900, height: 1)),
                        ]),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('قاعة التدريب', maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(15, color: Colors.white, weight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text('ليلة تجريبيّة', style: ar(13, color: const Color(0xFFD1D5DB), weight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text('📍 داخل التطبيق · مع الدون', style: ar(11, color: const Color(0xFF6B7280))),
                          const SizedBox(height: 6),
                          Row(children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: const Color(0x1822C55E), borderRadius: BorderRadius.circular(99)),
                              child: Text('🟢 سهل', style: ar(9, color: _green)),
                            ),
                            const SizedBox(width: 6),
                            Text('مجّاناً', style: ar(10, color: const Color(0xFF6B7280))),
                          ]),
                        ]),
                      ),
                    ]),
                    const SizedBox(height: 14),
                    Container(height: 1, color: const Color(0x0FFFFFFF)),
                    const SizedBox(height: 14),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('9', style: ar(30, color: _amber, weight: FontWeight.w900, height: 1)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('قادماً', style: ar(11.5, color: const Color(0xFFE5E7EB), weight: FontWeight.bold, height: 1)),
                          const SizedBox(height: 4),
                          Text('مقعدٌ واحد بانتظارك', style: ar(9.5, color: _green, height: 1)),
                        ]),
                      ),
                      if (booked)
                        InkWell(
                          onTap: () => g.setBooked(false),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(color: const Color(0x1A22C55E), border: Border.all(color: const Color(0x3322C55E)), borderRadius: BorderRadius.circular(8)),
                            child: Text('✅ محجوز', style: ar(12, color: const Color(0xFF4ADE80))),
                          ),
                        )
                      else
                        GuideTarget(
                          id: 'training-book',
                          child: InkWell(
                            onTap: () => _openSheet(context),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), gradient: const LinearGradient(colors: [_amber, Color(0xFFF59E0B)])),
                              child: Text('احجز', style: ar(12, color: Colors.black, weight: FontWeight.bold)),
                            ),
                          ),
                        ),
                    ]),
                    if (booked) ...[
                      const SizedBox(height: 12),
                      Container(height: 1, color: const Color(0x0DFFFFFF)),
                      const SizedBox(height: 12),
                      Text('🎮 الغرف المتاحة حالياً:', style: ar(12, color: _amber, weight: FontWeight.w500)),
                      const SizedBox(height: 8),
                      GuideTarget(
                        id: 'training-enter',
                        child: InkWell(
                          onTap: g.enterRoom,
                          borderRadius: BorderRadius.circular(12),
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(color: const Color(0x1AF59E0B), border: Border.all(color: const Color(0x33F59E0B)), borderRadius: BorderRadius.circular(12)),
                            child: Row(children: [
                              Expanded(child: Text('غرفة التدريب', style: ar(14, color: Colors.white, weight: FontWeight.bold))),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(color: const Color(0xFFF59E0B), borderRadius: BorderRadius.circular(8)),
                                child: Text('دخول ←', style: ar(12, color: Colors.black, weight: FontWeight.bold)),
                              ),
                            ]),
                          ),
                        ),
                      ),
                    ],
                  ]),
                ),
                Positioned(
                  top: -1, left: 14,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(color: const Color(0xFF8A0303), border: Border.all(color: const Color(0xFF450A0A))),
                    child: Text('تدريب · لك وحدك', style: ar(11, color: Colors.white, weight: FontWeight.w800)),
                  ),
                ),
              ]),
            ),
          );
        },
      );

  /// ورقة «تأكيد الحجز» — بشكل الورقة الحقيقيّة
  Future<void> _openSheet(BuildContext context) {
    final now = DateTime.now();
    return showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0xE6000000),
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: GuideTarget(
          id: 'training-sheet',
          child: Container(
            padding: EdgeInsets.fromLTRB(24, 16, 24, 24 + MediaQuery.viewPaddingOf(ctx).bottom),
            decoration: const BoxDecoration(
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF111827), Colors.black]),
              border: Border(top: BorderSide(color: Color(0x1AFFFFFF))),
            ),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(child: Container(width: 48, height: 6, decoration: BoxDecoration(color: const Color(0x33FFFFFF), borderRadius: BorderRadius.circular(99)))),
              const SizedBox(height: 16),
              Text('تأكيد الحجز', textAlign: TextAlign.center, style: ar(18, color: Colors.white, weight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text('ليلة تجريبيّة', textAlign: TextAlign.center, style: ar(14, color: const Color(0xFF9CA3AF))),
              const SizedBox(height: 16),
              for (final l in [
                '📅 ${_daysAr[now.weekday - 1]} ${arNum(now.day)} ${_monthsAr[now.month - 1]} — الآن',
                '📍 قاعة التدريب · داخل التطبيق',
                '👥 9/10 لاعب',
                '💰 مجّاناً',
              ])
                Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(l, style: ar(14, color: const Color(0xFFD1D5DB)))),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: InkWell(
                    onTap: () => Navigator.of(ctx).pop(),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(color: const Color(0x0DFFFFFF), border: Border.all(color: const Color(0x14FFFFFF)), borderRadius: BorderRadius.circular(12)),
                      child: Text('إلغاء', textAlign: TextAlign.center, style: ar(14, color: const Color(0xFF9CA3AF))),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: GuideTarget(
                    id: 'training-confirm',
                    child: InkWell(
                      onTap: () { GuideService.instance.setBooked(true); Navigator.of(ctx).pop(); },
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: const LinearGradient(colors: [_amber, Color(0xFFF59E0B)])),
                        child: Text('✅ تأكيد الحجز', textAlign: TextAlign.center, style: ar(14, color: Colors.black, weight: FontWeight.w500)),
                      ),
                    ),
                  ),
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

/// لافتة الرئيسيّة: لمن أجّل الجولة أو توقّف في منتصفها — «لاحقاً» تؤجّل ولا تلغي
class GuideHomeBanner extends StatelessWidget {
  const GuideHomeBanner({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: GuideService.instance,
        builder: (_, __) {
          final g = GuideService.instance;
          final m = g.me;
          if (m == null || !m.enabled || !m.required || g.run != null || (m.status != 'deferred' && m.status != 'started')) return const SizedBox.shrink();
          final started = m.status == 'started';
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: InkWell(
              onTap: () => g.begin(from: chapterStart(m.step)),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: const Color(0xFF0D0A05), border: Border.all(color: const Color(0x8CC5A059))),
                child: Row(children: [
                  const DonSeal(size: 40, tiltDeg: -6),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('جولة الليلة الأولى بانتظارك', style: TextStyle(fontFamily: 'Amiri', fontSize: 17, fontWeight: FontWeight.w700, color: Color(0xFFC5A059), height: 1.3)),
                      const SizedBox(height: 2),
                      Text(started ? 'تابع من حيث توقّفت' : 'ليلةٌ تجريبيّة مع الدون قبل ليلتك الحقيقيّة', style: ar(12.5, color: const Color(0xFFA8A091))),
                    ]),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    color: const Color(0xFFC5A059),
                    child: Text(started ? 'تابع' : 'ابدأ', style: ar(14, color: const Color(0xFF120D04), weight: FontWeight.w900)),
                  ),
                ]),
              ),
            ),
          );
        },
      );
}

/// سطر «حسابي»: يظهر ما دام مفتاح الجولة يعمل
class GuideProfileRow extends StatelessWidget {
  const GuideProfileRow({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: GuideService.instance,
        builder: (_, __) {
          final g = GuideService.instance;
          final m = g.me;
          if (m == null || !m.enabled) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(top: 16),
            child: GuideTarget(
              id: 'guide-replay',
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () { if (g.run == null) g.begin(replay: m.status == 'done' || !m.required); },
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: const Color(0x12C5A059), border: Border.all(color: const Color(0x59C5A059)), borderRadius: BorderRadius.circular(16)),
                  child: Row(children: [
                    const DonSeal(size: 34, tiltDeg: -6),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(m.status == 'done' ? 'أعد جولة الليلة الأولى' : 'جولة الليلة الأولى', style: ar(14, color: Colors.white, weight: FontWeight.bold)),
                        const SizedBox(height: 2),
                        Text('ثماني دقائق مع الدون: الحجز والدخول ولعبةٌ تجريبيّة كاملة', style: ar(11, color: const Color(0xFF6B7280))),
                      ]),
                    ),
                    const Text('←', style: TextStyle(color: Color(0xFFC5A059), fontSize: 14)),
                  ]),
                ),
              ),
            ),
          );
        },
      );
}
