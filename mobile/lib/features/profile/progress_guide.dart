import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/profile.dart';
import '../../models/rank.dart' show ProgressionConfig, RankScale;
import 'profile_palette.dart';

// ══════════════════════════════════════════════════════
// 📖 مودال دليل التقدّم — §4.5 في الملفّ 13
// ══════════════════════════════════════════════════════
// الأرقام تُجلب حيّةً من `/api/progression-settings/public` — نفس مصدر
// شاشة الرتب — فلا يكذب الدليل حين يعدّل الأدمن الإعدادات. الحرفيّات
// أدناه **احتياط عرضٍ فقط**: تُعرض ريثما تصل الاستجابة أو إن فشلت،
// وهي مرآة افتراضيات الخادم لا مصدر حقيقة.

Future<void> showProgressGuide(BuildContext context, String currentTier) {
  return showDialog(
    context: context,
    barrierColor: const Color(0xCC000000),
    builder: (_) => _GuideDialog(currentTier: currentTier),
  );
}

class _GuideDialog extends StatefulWidget {
  const _GuideDialog({required this.currentTier});
  final String currentTier;

  @override
  State<_GuideDialog> createState() => _GuideDialogState();
}

class _GuideDialogState extends State<_GuideDialog> {
  /// null ريثما تصل الإعدادات — الافتراضيات تُعرض ثم تُستبدل بصمت.
  ProgressionConfig? _cfg;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    // نفس نمط شاشة الرتب: فشل الجلب يتدهور بصمت إلى الافتراضيات
    final r = await ApiClient.instance
        .get('/api/progression-settings/public')
        .catchError((_) => null);
    if (!mounted || r is! Map || r['config'] is! Map) return;
    setState(() => _cfg = ProgressionConfig.fromJson(
        Map<String, dynamic>.from(r['config'] as Map)));
  }

  // ── القيم: الإعدادات أوّلاً والحرفيّ احتياط ──
  int _xp(String key, int fallback) => _cfg?.xpOf(key) ?? fallback;
  int _rr(String key, int fallback) => _cfg?.rrOf(key) ?? fallback;

  String _signed(int v, String unit) => '${v > 0 ? '+' : ''}$v $unit';

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 448,
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: Tw.gray900,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0x33F59E0B)),
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('📖 نظام التقدم',
                      style: ar(18, color: Tw.amber400, weight: FontWeight.w900)),
                  InkWell(
                    onTap: () => Navigator.of(context).pop(),
                    child: Text('✕', style: ar(20, color: Tw.gray500)),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _xpBox(),
                      const SizedBox(height: 16),
                      _levelBox(),
                      const SizedBox(height: 16),
                      _rrBox(),
                      const SizedBox(height: 16),
                      _ranksBox(),
                      const SizedBox(height: 16),
                      _dealBox(),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              InkWell(
                onTap: () => Navigator.of(context).pop(),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: const Color(0x1AF59E0B),
                    border: Border.all(color: const Color(0x33F59E0B)),
                  ),
                  child: Center(
                    child: Text('فهمت! 👍',
                        style: ar(14, color: Tw.amber400, weight: FontWeight.w700)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── صناديق ملوّنة: كلٌّ خلفية 5% وحد 10% من لونه ──
  Widget _box(Color c, List<Widget> children, {double radius = 12}) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: c.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(color: c.withValues(alpha: 0.10)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );

  Widget _row(String label, String value, Color valueColor) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(child: Text(label, style: ar(10, color: Tw.gray300))),
            const SizedBox(width: 8),
            // «+20 XP» بلا لفٍّ تُعرض «XP 20+» — القيمة صحيحة وقراءتها مقلوبة
            ltrText(value, mono(10, color: valueColor, weight: FontWeight.w700)),
          ],
        ),
      );

  Widget _xpBox() => _box(Tw.amber500, [
        Text('⭐ نقاط الخبرة (XP)',
            style: ar(14, color: Tw.amber400, weight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('تتراكم بعد كل مباراة لرفع مستواك:', style: ar(11, color: Tw.gray400)),
        _row('المشاركة في مباراة', _signed(_xp('participation', 20), 'XP'), Tw.amber400),
        _row('فوز الفريق', _signed(_xp('teamWin', 50), 'XP'), Tw.amber400),
        _row('النجاة كل جولة', _signed(_xp('survivalPerRound', 5), 'XP'), Tw.amber400),
        _row('استخدام القدرة بشكل صحيح', _signed(_xp('abilityCorrect', 10), 'XP'), Tw.amber400),
        _row('اتفاقية ناجحة (هدف مافيا)', _signed(_xp('citizenDealOnMafia', 50), 'XP'), Tw.amber400),
        _row('إقصاء خصم (فريقي)', _signed(_xp('teamEliminationBonus', 15), 'XP'), Tw.amber400),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Tw.red500.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Tw.red500.withValues(alpha: 0.10)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('⬇ عقوبات XP:', style: ar(10, color: Tw.red400, weight: FontWeight.w700)),
            _row('قدرة خاصة خاطئة', _signed(_xp('abilityIncorrect', -5), 'XP'), Tw.red400),
            _row('اتفاقية فاشلة (هدف مواطن)', _signed(_xp('failedDeal', -10), 'XP'), Tw.red400),
          ]),
        ),
      ]);

  Widget _levelBox() => _box(Tw.cyan500, [
        Text('🆙 المستوى (Level)', style: ar(14, color: Tw.cyan400, weight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('عند جمع XP كافي ترتفع مستوى تلقائياً. كل مستوى يحتاج XP أكثر من السابق.',
            style: ar(11, color: Tw.gray400)),
      ]);

  Widget _rrBox() => _box(Tw.purple500, [
        Text('🏆 تقييم الرتبة (RR)',
            style: ar(14, color: Tw.purple400, weight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('يحدد رتبتك ومكانتك التنافسية:', style: ar(11, color: Tw.gray400)),
        const SizedBox(height: 8),
        Text('⬆ مصادر الزيادة:', style: ar(10, color: Tw.green400, weight: FontWeight.w700)),
        _row('فوز الفريق', _signed(_rr('teamWin', 20), 'RR'), Tw.green400),
        _row('اتفاقية ناجحة (هدف مافيا)', _signed(_rr('citizenDealOnMafia', 20), 'RR'), Tw.green400),
        _row('النجاة حتى النهاية', _signed(_rr('survivedToEnd', 5), 'RR'), Tw.green400),
        _row('قدرة خاصة صحيحة', _signed(_rr('abilityCorrect', 5), 'RR'), Tw.green400),
        const SizedBox(height: 8),
        Text('⬇ مصادر النقصان:', style: ar(10, color: Tw.red400, weight: FontWeight.w700)),
        _row('خسارة الفريق', _signed(_rr('teamLoss', -20), 'RR'), Tw.red400),
        _row('اتفاقية فاشلة (هدف مواطن)', _signed(_rr('failedDeal', -30), 'RR'), Tw.red400),
        _row('قدرة خاصة خاطئة', _signed(_rr('abilityIncorrect', -5), 'RR'), Tw.red400),
      ]);

  Widget _ranksBox() {
    // العتبات من الإعدادات — الثابت المحلّي احتياطٌ أخير (RankScale)
    final promo = <String, String>{
      for (final t in const ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS'])
        t: '${ltrRun('${RankScale.rrRequiredFrom(t, config: _cfg)} RR')} للترقية',
    };

    return _box(Tw.red500, [
      Text('🎖️ الرتب', style: ar(14, color: Tw.red400, weight: FontWeight.w700)),
      const SizedBox(height: 4),
      Text('عند اكتمال RR المطلوب تترقى للرتبة التالية:', style: ar(11, color: Tw.gray400)),
      const SizedBox(height: 8),
      for (final r in RankConfig.ladder)
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: r.tier == widget.currentTier
              ? BoxDecoration(
                  color: const Color(0x0DFFFFFF),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0x1AFFFFFF)),
                )
              : null,
          child: Row(children: [
            Text(r.icon, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 8),
            Expanded(child: Text(r.nameAr, style: ar(11, color: Tw.gray300))),
            if (r.tier == widget.currentTier)
              Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Text('أنت هنا', style: ar(9, color: Tw.amber400)),
              ),
            if (promo[r.tier] != null)
              Text(promo[r.tier]!, style: ar(10, color: Tw.gray500)),
          ]),
        ),
    ]);
  }

  Widget _dealBox() => _box(Tw.orange500, [
        Text('🤝 متى تنجح الاتفاقية؟',
            style: ar(14, color: Tw.orange400, weight: FontWeight.w700)),
        const SizedBox(height: 8),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('✅', style: TextStyle(fontSize: 11)),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: 'ناجحة: ', style: ar(11, color: Tw.green400, weight: FontWeight.w700)),
              TextSpan(text: 'صوّت عليها الأغلبية ', style: ar(11, color: Tw.gray300)),
              TextSpan(text: 'و', style: ar(11, color: Tw.gray300, weight: FontWeight.w700)),
              TextSpan(text: ' كان الهدف مافيا فعلاً', style: ar(11, color: Tw.gray300)),
            ])),
          ),
        ]),
        const SizedBox(height: 6),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('❌', style: TextStyle(fontSize: 11)),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: 'فاشلة: ', style: ar(11, color: Tw.red400, weight: FontWeight.w700)),
              TextSpan(text: 'الهدف كان مواطناً — المبادر يُعاقب بـ ', style: ar(11, color: Tw.gray300)),
              TextSpan(
                  text: ltrRun(_signed(_rr('failedDeal', -30), 'RR')),
                  style: ar(11, color: Tw.red400, weight: FontWeight.w700)),
              TextSpan(text: ' و ', style: ar(11, color: Tw.gray300)),
              TextSpan(
                  text: ltrRun(_signed(_xp('failedDeal', -10), 'XP')),
                  style: ar(11, color: Tw.red400, weight: FontWeight.w700)),
              TextSpan(text: ' ويُقصى هو أيضاً!', style: ar(11, color: Tw.gray300)),
            ])),
          ),
        ]),
      ]);
}
