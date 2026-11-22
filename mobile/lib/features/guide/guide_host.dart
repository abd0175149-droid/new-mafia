import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';
import '../game/game_session_controller.dart';
import 'guide_layer.dart';
import 'guide_service.dart';
import 'guide_targets.dart';
import 'page_steps.dart';
import 'training/script.dart' show arNum;

// ══════════════════════════════════════════════════════
// 🕴️ مضيف الجولة — فوق كلّ مسارات التطبيق، تحت بوّاباته (2026-11-22)
//
// يقود خطوات الصفحات (كمحرّك GuideProvider في الويب)، ويعرض دعوة الدون مرّةً على
// الرئيسيّة بعد أن تخلو الشاشة، ويرسم ما تطلبه غرفة التدريب (الطبقة، الورقة، التنبيه).
// مطفأةً من الداشبورد لا يُرسم منه شيء.
// ══════════════════════════════════════════════════════

class GuideHost extends StatefulWidget {
  const GuideHost({super.key, required this.blocked});
  /// بوّابةٌ من بوّابات التطبيق مفتوحة — الجولة تنتظر حتى تُغلق كلّها
  final bool blocked;
  @override
  State<GuideHost> createState() => _GuideHostState();
}

class _GuideHostState extends State<GuideHost> {
  final g = GuideService.instance;
  Timer? _tick, _inv;
  String? _stepKey;
  bool _ownsOverlay = false;
  int _missing = 0;
  int _inviteTries = 0;

  @override
  void initState() {
    super.initState();
    g.addListener(_onChange);
    g.overlay.addListener(_onChange);
    g.sheet.addListener(_onChange);
    g.toast.addListener(_onChange);
    _tick = Timer.periodic(const Duration(milliseconds: 150), (_) => _pages());
    _inv = Timer.periodic(const Duration(milliseconds: 700), (_) => _invite());
  }

  @override
  void dispose() {
    _tick?.cancel();
    _inv?.cancel();
    g.removeListener(_onChange);
    g.overlay.removeListener(_onChange);
    g.sheet.removeListener(_onChange);
    g.toast.removeListener(_onChange);
    super.dispose();
  }

  /// 🔴 قد يصل الإخطار أثناء البناء أو التفكيك (غرفة التدريب تُطفئ طبقتها حين تُزال) —
  ///    فيُؤجَّل إلى ما بعد الإطار بدل أن يرمي «setState أثناء البناء».
  void _onChange() {
    if (!mounted) return;
    final ph = SchedulerBinding.instance.schedulerPhase;
    if (ph == SchedulerPhase.persistentCallbacks || ph == SchedulerPhase.midFrameMicrotasks) {
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) setState(() {}); });
    } else {
      setState(() {});
    }
  }

  // ══ محرّك خطوات الصفحات ══
  void _pages() {
    if (!mounted) return;
    final s = g.pageStep;
    if (s == null || !g.enabled) {
      if (_ownsOverlay) { _ownsOverlay = false; g.overlay.value = null; }
      _stepKey = null;
      return;
    }
    final i = g.run!.i;
    final path = currentPath();
    if (_stepKey == null || !_stepKey!.startsWith('${s.id}|')) {
      _missing = 0;
      // الخطوة تُعرض على صفحتها: إن لم يكن اللاعب فيها يُنقل إليها
      if (s.path != null && path != s.path) goPath(s.path!);
      g.noteChapter(s.ch);
    }
    // متى تنتهي خطوة الفعل؟
    if (s.skipIfBooked && g.booked) { g.advance(); return; }
    if (s.untilPath != null && path == s.untilPath) { g.advance(); return; }
    if (s.untilExists != null && GuideTargets.has(s.untilExists!)) { g.advance(); return; }
    if (s.back != null && s.target != null) {
      if (GuideTargets.has(s.target!)) { _missing = 0; } else if ((_missing += 150) > 900) { g.goto(s.back!); return; }
    }
    final onPage = s.path == null || path == s.path;
    final key = '${s.id}|$onPage';
    if (key == _stepKey) return;
    _stepKey = key;
    _ownsOverlay = true;
    g.overlay.value = onPage
        ? GuideOverlay(
            step: LayerStep(target: s.target, text: s.text, wait: s.wait, pos: s.pos),
            count: '${arNum(i + 1)}/${arNum(kPageSteps.length)}',
            onNext: g.advance, onLater: g.defer, onSkip: g.advance,
          )
        : null;
  }

  // ══ الدعوة: مرّةً، على الرئيسيّة، بعد أن تخلو الشاشة من البوّابات ══
  void _invite() {
    if (!mounted) return;
    g.syncSession();
    final me = g.me;
    if (me == null || !me.enabled || !me.required || me.status != 'new' || g.run != null || g.invite || g.inviteAsked) return;
    if (widget.blocked || currentPath() != Routes.home) { _inviteTries = 0; return; }
    // ورقةٌ أو شاشةٌ مدفوعة فوق الغلاف ⇒ ليست «شاشةً خالية»
    if (rootNavigatorKey.currentState?.canPop() ?? true) return;
    if (++_inviteTries < 2) return;
    g.inviteAsked = true;
    // 🔴 لا دعوة فوق لاعبٍ غرفتُه الحقيقيّة مفتوحة الآن — الجولة لا تحجب لعبةً حقيقيّة
    if (GameSessionController.instance.step.inGame) return;
    unawaited(ApiClient.instance.get('/api/player-app/my-active-rooms').then((d) {
      final rooms = d is Map ? d['rooms'] : null;
      if (mounted && !(rooms is List && rooms.isNotEmpty) && g.run == null) { g.invite = true; _onChange(); }
    }, onError: (_) { if (mounted && g.run == null) { g.invite = true; _onChange(); } }));
  }

  Widget _inviteSheet(GuideMe me) {
    final first = (SessionStore.instance.player?.name ?? '').trim().split(RegExp(r'\s+')).first;
    final ya = first.isNotEmpty ? ' يا $first' : '';
    return DonSheet(
      title: me.returning ? 'رجعتَ$ya، والنادي تغيّر' : 'أهلاً بك في العائلة$ya',
      children: [
        donP(me.returning
            ? 'شاشة الغرفة صارت جديدة منذ آخر زيارة. جرّبها معي على طاولةٍ تجريبيّة قبل أن تجلس بين الناس.'
            : 'قبل ليلتك الحقيقيّة، العب معي ليلةً تجريبيّة: طاولةٌ جاهزة، ولا أحد يراك تخطئ.'),
        donBullets(me.returning
            ? const ['بطاقة الدور تُكشف بالضغط المطوّل', 'زرّ «اللعبة» يجمع أدواتك كلّها', 'ليلٌ بشاشةٍ واحدة للجميع، و«رسالة الليل» صباحاً']
            : const ['تتعرّف على أبواب التطبيق', 'تحجز وتدخل غرفةً من الباب إلى المقعد', 'تلعب ليلةً ونهاراً كاملَين بدورٍ حقيقيّ']),
        donGo('ابدأ الجولة · ثماني دقائق', () => g.begin()),
        donLater('لاحقاً', g.defer),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!g.enabled) return const SizedBox.shrink();
    final o = g.overlay.value;
    final sh = g.sheet.value;
    final t = g.toast.value;
    final me = g.me!;
    return Stack(children: [
      if (!widget.blocked && o != null) Positioned.fill(child: GuideLayerView(o: o)),
      if (!widget.blocked && g.invite && g.run == null) _inviteSheet(me),
      if (!widget.blocked && sh != null) Builder(builder: sh),
      if (t != null) GuideToastView(text: t),
    ]);
  }
}
