import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/theme/dimens.dart';
import '../../core/api/api_client.dart';
import '../../models/night.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';
import 'one_night_view.dart';

// ══════════════════════════════════════════════════════
// 🌙 مرحلة الليل — §4.1 · §4.2 · §4.3 في الملفّ ٢٣
// ══════════════════════════════════════════════════════
// 🔒 شاشةُ المموِّه مطابقةٌ بكسلياً لشاشة صاحب الدور: نفس العنوان ونفس
//    العدّاد ونفس الألوان والأبعاد والحركة. الفروق المسموحة ثلاثة فقط:
//    التعليمة، وقائمة الأهداف، وإخفاء زرّ التخطّي. لذلك **لا شرط على
//    `isDecoy` في أيّ موضعٍ آخر** من هذا الملفّ.

const _gold = Color(0xFFC5A059);

/// أبعادٌ حسّاسة للتوقيت تتضاعف مع الشاشة — للاثنين معاً.
({double dial, double avatar, double maxW}) oneNightMetrics(WindowSizeClass c) =>
    switch (c) {
      WindowSizeClass.compact => (dial: 64, avatar: 44, maxW: double.infinity),
      WindowSizeClass.medium => (dial: 98, avatar: 56, maxW: 640),
      WindowSizeClass.expanded => (dial: 128, avatar: 64, maxW: 900),
    };

// ══════════════════════════════════════════════════════
// §4.1 الشاشة الليلية السلبية
// ══════════════════════════════════════════════════════
class PassiveNightBody extends StatelessWidget {
  const PassiveNightBody({super.key, this.stepRoleName = ''});

  /// يصل في النمط اليدوي وحده — في `auto` لا يُبثّ فيبقى الصندوق مخفياً.
  final String stepRoleName;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(children: [
          const NightBreathing(child: Text('🌙', style: TextStyle(fontSize: 60))),
          const SizedBox(height: 12),
          const Text('الليل يسدل ستاره',
              style: TextStyle(
                fontFamily: 'Amiri',
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF818CF8),
                letterSpacing: 0,
              )),
          const SizedBox(height: 12),
          Text('مرحلة الليل',
              style: ar(12,
                  color: const Color(0xFF9A9A9A), weight: FontWeight.bold)),
          if (stepRoleName.isNotEmpty) ...[
            const SizedBox(height: 24),
            _Pulsing(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF111111),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: _gold.withValues(alpha: 0.3)),
                ),
                child: Text('جارٍ اختيار الهدف من قبل $stepRoleName...',
                    style: const TextStyle(
                      fontFamily: 'Amiri',
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: _gold,
                      letterSpacing: 0,
                    )),
              ),
            ),
          ],
        ]),
      );
}

// ══════════════════════════════════════════════════════
// §4.2 شاشة الفعل الليليّ — استيلاءٌ كامل
// ══════════════════════════════════════════════════════
class NightActionOverlay extends StatelessWidget {
  const NightActionOverlay({
    super.key,
    required this.request,
    required this.countdown,
    required this.submitted,
    required this.onPick,
    required this.onSkip,
  });

  final NightActionRequest request;
  final int countdown;
  final bool submitted;
  final void Function(NightTarget) onPick;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final m = oneNightMetrics(context.sizeClass);
    final instruction = nightInstruction(request);

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
                  child: Column(children: [
                    // ── الرأس ──
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 32, 16, 12),
                      child: Column(children: [
                        const NightBreathing(
                            child: Text('🌙', style: TextStyle(fontSize: 34))),
                        const SizedBox(height: 8),
                        Text('مرحلة الليل',
                            style: mono(9, color: const Color(0xFF666666))
                                .copyWith(letterSpacing: 1.8)),
                        const SizedBox(height: 4),
                        Text(nightStepTitle(request.stepRole),
                            style: const TextStyle(
                              fontFamily: 'Amiri',
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: _gold,
                              letterSpacing: 0,
                            )),
                        // ⚠️ نوعٌ غير معروف ⇒ سطرٌ فارغ، لا نصّ مخترَع
                        if (instruction.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(instruction,
                              textAlign: TextAlign.center,
                              style: ar(12, color: const Color(0xFF888888))),
                        ],
                      ]),
                    ),
                    // ── العدّاد ──
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: NightDial(
                        seconds: countdown,
                        total: request.timeoutSeconds,
                        size: m.dial,
                      ),
                    ),
                    // ── الأهداف ──
                    Expanded(
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        itemCount: request.availableTargets.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => NightTargetRow(
                          target: request.availableTargets[i],
                          avatarSize: m.avatar,
                          onTap: () => onPick(request.availableTargets[i]),
                        ),
                      ),
                    ),
                    // ── التخطّي ──
                    if (request.showSkip)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                        child: SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: onSkip,
                            style: OutlinedButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 10),
                              side: const BorderSide(
                                  color: Color(0xFF1A1A1A)),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                            ),
                            child: Text('تخطي هذه الخطوة ←',
                                style: mono(12,
                                    color: const Color(0xFF666666))),
                          ),
                        ),
                      ),
                  ]),
                ),
              ),
            ),
            if (submitted) const OneNightSubmitted(),
          ]),
        ),
      ),
    );
  }
}

class NightTargetRow extends StatelessWidget {
  const NightTargetRow({
    super.key,
    required this.target,
    required this.avatarSize,
    required this.onTap,
    this.selected = false,
  });
  final NightTarget target;
  final double avatarSize;
  final VoidCallback onTap;

  /// للّيلة الواحدة وحدها: هناك يختار اللاعبُ ثمّ يؤكّد فيحتاج أن يرى ما
  /// اختار. وفي الطابور القديم اللمسةُ **هي** الإرسال فلا اختيارَ معلّق —
  /// والافتراضُ `false` يُبقي تلك الشاشة كما هي حرفاً بحرف.
  final bool selected;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          highlightColor: const Color(0x338A0303),
          splashColor: const Color(0x338A0303),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                  color: selected ? _gold : const Color(0xFF2A2A2A)),
              gradient: LinearGradient(
                begin: AlignmentDirectional.centerStart,
                end: AlignmentDirectional.centerEnd,
                colors: selected
                    ? [_gold.withValues(alpha: 0.14), _gold.withValues(alpha: 0.02)]
                    : const [Color(0x08FFFFFF), Color(0x00FFFFFF)],
              ),
            ),
            child: Row(children: [
              _avatar(),
              const SizedBox(width: 12),
              Expanded(
                child: Text(target.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(14, weight: FontWeight.bold)),
              ),
              if (selected)
                const Text('✓',
                    style: TextStyle(
                        color: _gold, fontSize: 16, fontWeight: FontWeight.w900)),
            ]),
          ),
        ),
      );

  Widget _avatar() {
    final url = target.avatarUrl;
    return Container(
      width: avatarSize,
      height: avatarSize,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: url == null ? _gold.withValues(alpha: 0.1) : null,
        border: Border.all(color: _gold.withValues(alpha: 0.3), width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: url == null
          ? Text('#${target.physicalId}',
              style: mono(14, color: _gold, weight: FontWeight.w900))
          : Stack(fit: StackFit.expand, children: [
              // رماديّةٌ مقصودة: الوجه لا يُزيّن قرار قتل
              ColorFiltered(
                colorFilter: const ColorFilter.matrix(<double>[
                  0.2126, 0.7152, 0.0722, 0, 0, //
                  0.2126, 0.7152, 0.0722, 0, 0, //
                  0.2126, 0.7152, 0.0722, 0, 0, //
                  0, 0, 0, 0.8, 0, //
                ]),
                child: CachedNetworkImage(
                  imageUrl: ApiClient.instance.upload(url),
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) =>
                      const ColoredBox(color: Color(0xFF111111)),
                  placeholder: (_, __) =>
                      const ColoredBox(color: Color(0xFF111111)),
                ),
              ),
              ColoredBox(
                color: const Color(0x80000000),
                child: Center(
                  child: Text('#${target.physicalId}',
                      style: mono(14, weight: FontWeight.w900)),
                ),
              ),
            ]),
    );
  }
}

/// العدّاد الدائريّ — ألوانه تنذر: ذهبيّ ← كهرمانيّ ≤10 ← أحمر ≤5.
class NightDial extends StatelessWidget {
  const NightDial(
      {super.key, required this.seconds, required this.total, required this.size});
  final int seconds, total;
  final double size;

  Color get _color => seconds <= 5
      ? const Color(0xFFEF4444)
      : (seconds <= 10 ? const Color(0xFFF59E0B) : _gold);

  Color get _textColor => seconds <= 5
      ? const Color(0xFFF87171)
      : (seconds <= 10 ? const Color(0xFFFBBF24) : Colors.white);

  @override
  Widget build(BuildContext context) {
    final t = total <= 0 ? 15 : total;
    final frac = (seconds / t).clamp(0.0, 1.0);
    final digits = Text('$seconds',
        style: mono(size * 0.28, color: _textColor, weight: FontWeight.w900));

    return SizedBox(
      width: size,
      height: size,
      child: Stack(alignment: Alignment.center, children: [
        TweenAnimationBuilder<double>(
          tween: Tween(begin: frac, end: frac),
          duration: const Duration(milliseconds: 500),
          builder: (_, v, __) => CustomPaint(
            size: Size.square(size),
            painter: NightDialPainter(fraction: v, color: _color),
          ),
        ),
        // النبض للخمس الأخيرة وحدها — تنبيهٌ لا زينة
        seconds <= 5 ? _Pulsing(child: digits) : digits,
      ]),
    );
  }
}

class NightDialPainter extends CustomPainter {
  const NightDialPainter({required this.fraction, required this.color});
  final double fraction;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * (3 / 36);
    final r = size.width * (15.5 / 36);
    final c = size.center(Offset.zero);

    canvas.drawCircle(
        c,
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..color = const Color(0xFF1A1A2E));

    if (fraction <= 0) return;
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      -math.pi / 2, // يبدأ من الأعلى
      2 * math.pi * fraction,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(NightDialPainter o) =>
      o.fraction != fraction || o.color != color;
}

class OneNightSubmitted extends StatelessWidget {
  const OneNightSubmitted({super.key});

  @override
  Widget build(BuildContext context) => Positioned.fill(
        child: ColoredBox(
          color: const Color(0xE6000000),
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const _Pulsing(
                  scale: 1.2,
                  ms: 1500,
                  child: Text('✅', style: TextStyle(fontSize: 60))),
              const SizedBox(height: 16),
              Text('تم الإرسال', style: ar(20, weight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text('WAITING FOR RESULTS...',
                  textDirection: TextDirection.ltr,
                  style: mono(12, color: const Color(0xFF666666))
                      .copyWith(letterSpacing: 2)),
            ]),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.3 مودال تفعيل الممرضة
// ══════════════════════════════════════════════════════
class NurseActivationModal extends StatelessWidget {
  const NurseActivationModal({super.key, required this.onRespond});
  final void Function(bool activate) onRespond;

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Material(
          color: const Color(0xF2000000),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: ConstrainedBox(
                // ثابتة في كل الفئات — مودال قرارٍ لا يتمدّد
                constraints: const BoxConstraints(maxWidth: 384),
                child: Container(
                  padding: const EdgeInsets.all(32),
                  decoration: BoxDecoration(
                    color: const Color(0xFF111111),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: _gold.withValues(alpha: 0.3)),
                    boxShadow: const [
                      BoxShadow(color: Color(0xCC000000), blurRadius: 40),
                    ],
                  ),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text('🏥', style: TextStyle(fontSize: 48)),
                    const SizedBox(height: 16),
                    const Text('الممرضة',
                        style: TextStyle(
                          fontFamily: 'Amiri',
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: _gold,
                          letterSpacing: 0,
                        )),
                    const SizedBox(height: 8),
                    Text('الطبيب غير متاح هذه الليلة.\nهل تريدين تفعيل صلاحية الحماية؟',
                        textAlign: TextAlign.center,
                        style: ar(14,
                            color: const Color(0xFFD1D5DB), height: 1.7)),
                    const SizedBox(height: 24),
                    Row(children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => onRespond(false),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            backgroundColor: const Color(0x99000000),
                            side: const BorderSide(color: Color(0xFF333333)),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          child: Text('لا، تخطي',
                              style: ar(14,
                                  color: const Color(0xFF888888),
                                  weight: FontWeight.bold)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => onRespond(true),
                          child: Container(
                            padding:
                                const EdgeInsets.symmetric(vertical: 12),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              gradient: const LinearGradient(
                                colors: [Color(0xFFC5A059), Color(0xFFB38B47)],
                              ),
                            ),
                            child: Text('نعم، أريد الحماية',
                                style: ar(14,
                                    color: Colors.black,
                                    weight: FontWeight.w900)),
                          ),
                        ),
                      ),
                    ]),
                  ]),
                ),
              ),
            ),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// 🫁 حركات مشتركة
// ══════════════════════════════════════════════════════

/// نبضٌ تنفّسيّ: `scale [1,1.1,1]` و`opacity [0.7,1,0.7]` كلّ ٣ ثوانٍ.
class NightBreathing extends StatefulWidget {
  const NightBreathing({super.key, required this.child});
  final Widget child;
  @override
  State<NightBreathing> createState() => _BreathingState();
}

class _BreathingState extends State<NightBreathing>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(seconds: 3))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    final curve = CurvedAnimation(parent: _c, curve: Curves.easeInOut);
    return FadeTransition(
      opacity: Tween(begin: 0.7, end: 1.0).animate(curve),
      child: ScaleTransition(
          scale: Tween(begin: 1.0, end: 1.1).animate(curve),
          child: widget.child),
    );
  }
}

/// نبضٌ بسيط — شفافيةٌ وحدها أو مع تكبير.
class _Pulsing extends StatefulWidget {
  const _Pulsing({required this.child, this.scale, this.ms = 1000});
  final Widget child;
  final double? scale;
  final int ms;
  @override
  State<_Pulsing> createState() => _PulsingState();
}

class _PulsingState extends State<_Pulsing>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: Duration(milliseconds: widget.ms))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    final curve = CurvedAnimation(parent: _c, curve: Curves.easeInOut);
    Widget out = FadeTransition(
        opacity: Tween(begin: 0.5, end: 1.0).animate(curve),
        child: widget.child);
    if (widget.scale != null) {
      out = ScaleTransition(
          scale: Tween(begin: 1.0, end: widget.scale!).animate(curve),
          child: out);
    }
    return out;
  }
}

// ══════════════════════════════════════════════════════
// 🔌 الطبقة المركّبة على شاشة اللعب
// ══════════════════════════════════════════════════════
class NightLayer extends StatelessWidget {
  const NightLayer({super.key, required this.controller});
  final GameSessionController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    // مودال الممرضة يعلو شاشة الفعل: قرارها يسبق دورها
    if (c.nursePending) {
      return NurseActivationModal(onRespond: c.respondNurse);
    }
    // 🌙 الليلةُ الواحدة تعلو الطابور القديم: طاولةٌ لا تسلك المسارين معاً،
    //    ووجودُ حمولةٍ جديدةٍ يعني أنّ القديمةَ بقيّةٌ من ليلةٍ مضت.
    final one = c.oneNight;
    if (one != null) {
      return OneNightOverlay(
        ask: one,
        countdown: c.oneNightCountdown,
        submitted: c.oneNightSent,
        onSubmit: (picks) => c.submitOneNight(picks),
      );
    }
    final r = c.nightAction;
    if (r == null) return const SizedBox.shrink();
    return NightActionOverlay(
      request: r,
      countdown: c.nightCountdown,
      submitted: c.nightSubmitted,
      onPick: (t) => unawaited(c.submitNightAction(t.physicalId)),
      onSkip: () => unawaited(c.submitNightAction(null)),
    );
  }
}
