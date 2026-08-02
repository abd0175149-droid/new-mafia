import 'package:flutter/material.dart';

import '../../models/match.dart';
import '../../models/profile.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 📊 تفصيل نقاط المباراة — §4.6 في الملفّ 16
// ══════════════════════════════════════════════════════
// ورقة سفلية على الهواتف، وحوارٌ مركزيّ عند العرض ≥ 640dp.
//
// ⚠️ العتبة **640 وليست 600**: هي نقطة كسر `sm` في Tailwind وهي ما
//    يبدّل الويب عندها، وتقع داخل فئة medium (600–840). تطبيقها على حدّ
//    الفئة يجعل تابلت 8 إنش يعرض حواراً حيث يعرض الويب ورقة.

Future<void> showMatchDetail(BuildContext context, MatchDetails m) {
  final wide = MediaQuery.sizeOf(context).width >= 640;
  final body = _DetailBody(match: m);

  if (wide) {
    return showDialog(
      context: context,
      barrierColor: const Color(0xE6000000),
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 448,
            maxHeight: MediaQuery.sizeOf(context).height * 0.90,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0x1AFFFFFF)),
                borderRadius: BorderRadius.circular(16),
              ),
              child: body,
            ),
          ),
        ),
      ),
    );
  }

  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xE6000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 448,
      maxHeight: MediaQuery.sizeOf(context).height * 0.90,
    ),
    builder: (_) => ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: body,
    ),
  );
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.match});

  final MatchDetails match;

  @override
  Widget build(BuildContext context) {
    final won = match.detailWon;
    final base = won ? Tw.emerald500 : Tw.rose500;

    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Tw.gray900, Color(0xFF000000)],
        ),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 48,
                height: 6,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: const Color(0x33FFFFFF),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('📊 تفصيل النقاط', style: ar(18, weight: FontWeight.w900)),
                InkWell(
                  onTap: () => Navigator.of(context).pop(),
                  customBorder: const CircleBorder(),
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0x0DFFFFFF),
                      border: Border.all(color: const Color(0x1AFFFFFF)),
                    ),
                    child: Center(child: Text('✕', style: ar(14, color: Tw.gray400))),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _infoCard(won, base),
            const SizedBox(height: 16),
            _pointsCard(
              title: '⭐ تفصيل نقاط الخبرة (XP)',
              titleColor: Tw.amber400,
              tint: Tw.amber500,
              lines: match.breakdown?.xp ?? const [],
              emptyText: 'لا نقاط خبرة',
              unit: 'XP',
              totalText: '+${match.xpEarned} XP',
              totalColor: Tw.amber400,
            ),
            const SizedBox(height: 16),
            _pointsCard(
              title: '🏆 تفصيل نقاط الرتبة (RR)',
              titleColor: Tw.purple400,
              tint: Tw.purple500,
              lines: match.breakdown?.rr ?? const [],
              emptyText: 'لا تغيّر في الرتبة',
              unit: 'RR',
              totalText: '${match.rrChange >= 0 ? '+' : ''}${match.rrChange} RR',
              totalColor: match.rrChange >= 0 ? Tw.green400 : Tw.red400,
            ),
            const SizedBox(height: 16),
            _totals(),
            if (match.dealInitiated) ...[
              const SizedBox(height: 16),
              _dealNote(),
            ],
            const SizedBox(height: 16),
            InkWell(
              onTap: () => Navigator.of(context).pop(),
              borderRadius: BorderRadius.circular(16),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: const Color(0x0DFFFFFF),
                  border: Border.all(color: const Color(0x0DFFFFFF)),
                ),
                child: Center(child: Text('إغلاق', style: ar(14, weight: FontWeight.w700))),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── (أ) معلومات المباراة ──
  Widget _infoCard(bool won, Color base) {
    final (teamLabel, teamFg, teamBg) = match.detailIsNeutral
        ? ('دور محايد', Tw.purple400, Tw.purple500)
        : match.detailIsMafia
            ? ('فريق المافيا', Tw.red400, Tw.red500)
            : ('فريق المواطنين', Tw.cyan400, Tw.cyan500);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: base.withValues(alpha: 0.05),
        border: Border.all(color: base.withValues(alpha: 0.15)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('الدور', style: ar(10, color: Tw.gray500)),
                  const SizedBox(height: 2),
                  Text(
                    // في التفصيل يُعرض المفتاح الخام لا «—» — الدعم
                    // يحتاج المفتاح حين يكون مجهولاً
                    match.role == null || match.role!.isEmpty
                        ? '—'
                        : (roleNamesAr[match.role] ?? match.role!),
                    style: ar(14, color: Tw.amber400, weight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(4),
                      color: teamBg.withValues(alpha: 0.10),
                    ),
                    child: Text(teamLabel, style: ar(9, color: teamFg)),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('النتيجة', style: ar(10, color: Tw.gray500)),
                const SizedBox(height: 2),
                Text(won ? '🏆 فوز' : '💀 خسارة',
                    style: ar(18,
                        color: won ? Tw.emerald400 : Tw.rose400,
                        weight: FontWeight.w900)),
              ],
            ),
          ],
        ),
        const SizedBox(height: 12),
        const Divider(height: 1, color: Color(0x0DFFFFFF)),
        const SizedBox(height: 8),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Flexible(
            child: Text('🛡️ ${match.survivalText}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(10, color: Tw.gray500)),
          ),
          Text('📊 ${match.roundsSurvived} جولات', style: ar(10, color: Tw.gray500)),
        ]),
      ]),
    );
  }

  // ── (ب)(ج) بطاقتا التفصيل ──
  Widget _pointsCard({
    required String title,
    required Color titleColor,
    required Color tint,
    required List<PointLine> lines,
    required String emptyText,
    required String unit,
    required String totalText,
    required Color totalColor,
  }) {
    // سطر بقيمة صفر يُخفى. البنود قد تحوي بند تسويةٍ من الخادم ليطابق
    // المجموعُ الإجماليَّ — تُعرض كما تصل.
    final shown = lines.where((l) => l.value != 0).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: tint.withValues(alpha: 0.03),
        border: Border.all(color: tint.withValues(alpha: 0.10)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: ar(14, color: titleColor, weight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (shown.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(child: Text(emptyText, style: ar(10, color: Tw.gray600))),
          )
        else
          for (var i = 0; i < shown.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: i == shown.length - 1
                  ? null
                  : const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Color(0x08FFFFFF)))),
              child: Row(children: [
                SizedBox(
                    width: 20,
                    child: Text(shown[i].icon,
                        textAlign: TextAlign.center, style: ar(14))),
                const SizedBox(width: 8),
                Expanded(child: Text(shown[i].label, style: ar(11, color: Tw.gray300))),
                ltrText(
                  '${shown[i].value > 0 ? '+' : ''}${shown[i].value} $unit',
                  mono(11,
                      color: shown[i].value > 0 ? Tw.green400 : Tw.red400,
                      weight: FontWeight.w700),
                ),
              ]),
            ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.only(top: 8),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: tint.withValues(alpha: 0.15))),
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('المجموع', style: ar(12, color: Tw.gray300, weight: FontWeight.w700)),
            ltrText(totalText, mono(18, color: totalColor, weight: FontWeight.w900)),
          ]),
        ),
      ]),
    );
  }

  // ── (د) المجموع الكلّي ──
  Widget _totals() => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.centerRight,
            end: Alignment.centerLeft,
            colors: [
              Tw.amber500.withValues(alpha: 0.10),
              Tw.amber500.withValues(alpha: 0.05),
              Tw.amber500.withValues(alpha: 0),
            ],
          ),
          border: Border.all(color: Tw.amber500.withValues(alpha: 0.20)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _totalColumn('TOTAL XP', '+${match.xpEarned}', Tw.amber400),
            Container(
              width: 1,
              height: 48,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Tw.amber500.withValues(alpha: 0),
                    Tw.amber500.withValues(alpha: 0.30),
                    Tw.amber500.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
            _totalColumn(
              'TOTAL RR',
              '${match.rrChange >= 0 ? '+' : ''}${match.rrChange}',
              match.rrChange >= 0 ? Tw.green400 : Tw.red400,
            ),
          ],
        ),
      );

  Widget _totalColumn(String label, String value, Color color) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // لاتينيّ + أحرف كبيرة ⇒ التباعد مسموح هنا وحده
          Text(label,
              style: const TextStyle(
                  fontFamily: 'Tajawal',
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: Color(0xB3F59E0B),
                  letterSpacing: 2)),
          const SizedBox(height: 4),
          ltrText(
            value,
            ar(30, color: color, weight: FontWeight.w900)
                .copyWith(shadows: const [Shadow(color: Color(0x80000000), blurRadius: 6)]),
          ),
        ],
      );

  // ── (هـ) ملاحظة الاتفاقية ──
  Widget _dealNote() {
    final ok = match.dealSuccess;
    final c = ok ? Tw.green500 : Tw.red500;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: c.withValues(alpha: 0.05),
        border: Border.all(color: c.withValues(alpha: 0.15)),
      ),
      child: Text(
        ok
            ? '✅ الاتفاقية ناجحة — صوّت عليها الأغلبية وكان الهدف مافيا'
            : '❌ الاتفاقية فاشلة — الهدف كان مواطناً (تمت معاقبة المبادر)',
        style: ar(10, color: ok ? Tw.green400 : Tw.red400),
      ),
    );
  }
}
