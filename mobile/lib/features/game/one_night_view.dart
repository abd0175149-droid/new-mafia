import 'package:flutter/material.dart';

import '../../app/theme/dimens.dart';
import '../../models/night.dart';
import '../profile/profile_palette.dart';
import 'night_view.dart';

// ══════════════════════════════════════════════════════
// 🌙 شاشةُ الليلة الواحدة — اختيارٌ واحدٌ في الليلة كلِّها
//
// تحلّ محلّ ستِّ شاشاتٍ متتابعة كان يختار فيها اللاعبُ ستَّ مرّات، خمسٌ منها
// بلا معنى. الخادمُ يرسل لكلّ مقعدٍ فعلَه هو وقائمتَه هو.
//
// 🔒 الثابتُ الأمنيّ: لا شيءَ في هذا الملفّ يفحص «هل لي دورٌ حقيقيّ؟» — لا
//    لونٌ ولا حجمٌ ولا نصّ. الشاشةُ واحدةٌ عند صاحب الدور ومَن لا دورَ له،
//    والفرقُ الوحيد ما يأتي من الخادم: نصُّ السؤال وقائمةُ الأهداف.
//
// 🔴 وعناصرُ العرض مستعارةٌ من `night_view.dart` نفسِه (العدّاد وصفُّ الهدف
//    وطبقةُ الإرسال) لا مُعادةُ الكتابة: نسختان تتباعدان بأوّل تعديل، وفرقٌ
//    بصريٌّ بين شاشتَي الليل يُخبر المراقبَ أيَّ مسارٍ تسلكه الطاولة.
// ══════════════════════════════════════════════════════

const _gold = Color(0xFFC5A059);

class OneNightOverlay extends StatefulWidget {
  const OneNightOverlay({
    super.key,
    required this.ask,
    required this.countdown,
    required this.submitted,
    required this.onSubmit,
  });

  final OneNightAsk ask;
  final int countdown;
  final bool submitted;

  /// يُرسل الاختيارات كلَّها دفعةً واحدة — لا مهلتين ولا انتظارَ بينهما.
  final Future<void> Function(List<({String? abilityId, int? targetPhysicalId})> picks)
      onSubmit;

  @override
  State<OneNightOverlay> createState() => _OneNightOverlayState();
}

class _OneNightOverlayState extends State<OneNightOverlay> {
  int _idx = 0;
  final Map<String, int?> _picks = {};
  bool _busy = false;

  @override
  void didUpdateWidget(OneNightOverlay old) {
    super.didUpdateWidget(old);
    // 🔴 ليلةٌ جديدةٌ ⇒ اختياراتٌ جديدة. بقاءُ القديمة كان يُرسل هدفَ الأمس
    //    بلا أن يلمس اللاعبُ شيئاً.
    if (old.ask.signature != widget.ask.signature) {
      _picks.clear();
      _idx = 0;
      _busy = false;
    }
  }

  OneNightStep get _cur =>
      widget.ask.steps[_idx.clamp(0, widget.ask.steps.length - 1)];

  Future<void> _send(Map<String, int?> all) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.onSubmit([
        for (final s in widget.ask.steps)
          (abilityId: s.abilityId, targetPhysicalId: all[s.key]),
      ]);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = oneNightMetrics(context.sizeClass);
    final ask = widget.ask;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Material(
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF0A0812), Color(0xFF070510), Color(0xFF000000)],
              stops: [0, 0.5, 1],
            ),
          ),
          child: Stack(children: [
            SafeArea(
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: m.maxW),
                  child: ask.hasChoice ? _body(m) : _waiting(),
                ),
              ),
            ),
            if (widget.submitted) const OneNightSubmitted(),
          ]),
        ),
      ),
    );
  }

  /// شاشةُ الانتظار حين لا خطوةَ أصلاً (فُتح بابُ المراجعة عند الموجّه).
  Widget _waiting() => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('🌙', style: TextStyle(fontSize: 56)),
          const SizedBox(height: 14),
          Text('انتظرِ الصباح', style: ar(18, weight: FontWeight.w900, color: _gold)),
        ]),
      );

  Widget _body(({double dial, double avatar, double maxW}) m) {
    final ask = widget.ask;
    final cur = _cur;
    final chosen = _picks[cur.key];
    final last = _idx >= ask.steps.length - 1;

    return Column(children: [
      // ── الرأس ──
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 28, 16, 8),
        child: Column(children: [
          const NightBreathing(child: Text('🌙', style: TextStyle(fontSize: 34))),
          const SizedBox(height: 8),
          Text('مرحلة الليل',
              style: mono(9, color: const Color(0xFF666666))
                  .copyWith(letterSpacing: 1.8)),
          const SizedBox(height: 4),
          const Text('الليل',
              style: TextStyle(
                fontFamily: 'Amiri',
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: _gold,
                letterSpacing: 0,
              )),
          const SizedBox(height: 4),
          Text(cur.ask,
              textAlign: TextAlign.center,
              style: ar(12, color: const Color(0xFF888888))),
        ]),
      ),

      // ── شارتا الخطوتين — لحاملِ القدرتين وحده ──
      if (ask.two)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < ask.steps.length; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: i == _idx ? _gold : const Color(0xFF2B2621)),
                  color: i == _idx ? _gold.withValues(alpha: 0.1) : null,
                ),
                child: Text('${i + 1} · ${_chip(ask.steps[i].ask)}',
                    style: ar(10,
                        weight: FontWeight.bold,
                        color: i == _idx ? _gold : const Color(0xFF645C50))),
              ),
            ],
          ]),
        ),

      // ── العدّاد ──
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: NightDial(
          seconds: widget.countdown,
          total: _dialTotal,
          size: m.dial,
        ),
      ),

      // ── الأهداف ──
      Expanded(
        child: cur.targets.isEmpty
            ? Center(
                child: Text('لا هدفَ متاحاً الليلة.',
                    style: ar(13, color: const Color(0xFF645C50))))
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                itemCount: cur.targets.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final t = cur.targets[i];
                  return NightTargetRow(
                    target: t,
                    avatarSize: m.avatar,
                    selected: chosen == t.physicalId,
                    onTap: () => setState(() => _picks[cur.key] = t.physicalId),
                  );
                },
              ),
      ),

      // ── الأزرار ──
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
        child: Column(children: [
          SizedBox(
            width: double.infinity,
            child: _PrimaryButton(
              enabled: !_busy && (last ? (chosen != null || cur.canSkip) : chosen != null),
              label: !last
                  ? 'التالي ←'
                  : _busy
                      ? 'يُرسل…'
                      : ask.two
                          ? 'تأكيدُ الاختيارين'
                          : chosen != null
                              ? 'تأكيدُ الاختيار'
                              : cur.canSkip
                                  ? 'تخطٍّ — لا أحد'
                                  : 'اختر لاعباً',
              onTap: () {
                if (!last) {
                  setState(() => _idx++);
                } else {
                  _send(Map<String, int?>.from(_picks));
                }
              },
            ),
          ),
          if (ask.two && _idx > 0)
            TextButton(
              onPressed: () => setState(() => _idx--),
              child: Text('→ رجوعٌ إلى الخطوة السابقة',
                  style: ar(11, color: const Color(0xFF645C50))),
            ),
          if (!ask.two && cur.canSkip && chosen != null)
            TextButton(
              onPressed: () => _send({..._picks, cur.key: null}),
              child: Text('تخطٍّ بلا هدف',
                  style: ar(11, color: const Color(0xFF645C50))),
            ),
          const SizedBox(height: 2),
          Text('اختيارٌ واحدٌ في الليلة — ثمّ انتظرِ الصباح.',
              textAlign: TextAlign.center,
              style: ar(10, color: const Color(0xFF5C554A))),
        ]),
      ),
    ]);
  }

  /// كلّيّةُ القوس للعدّاد: أوّلُ قراءةٍ هي المرجع، فلا يمتلئ القوسُ ثمّ يفرغ
  /// عند كلّ استعادة. (المهلةُ في الخادم واحدةٌ للّيلة كلِّها.)
  int _dialTotal = 0;

  @override
  void initState() {
    super.initState();
    _dialTotal = widget.countdown > 0 ? widget.countdown : 60;
  }

  static String _chip(String ask) => ask
      .replaceFirst(RegExp(r'^(اختر هدفَ |مَن |اختر )'), '')
      .replaceFirst(RegExp(r'[؟.]$'), '');
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.enabled,
    required this.label,
    required this.onTap,
  });
  final bool enabled;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: enabled ? 1 : 0.45,
        child: Material(
          color: _gold,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: enabled ? onTap : null,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 13),
              alignment: Alignment.center,
              child: Text(label,
                  style: ar(13,
                      weight: FontWeight.w900, color: const Color(0xFF0A0A0B))),
            ),
          ),
        ),
      );
}
