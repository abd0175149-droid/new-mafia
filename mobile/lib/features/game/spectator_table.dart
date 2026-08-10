import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/theme/dimens.dart';
import '../../core/api/api_client.dart';
import '../../models/card_fx.dart' show parseCssColor;
import '../../models/card_template.dart';
import '../../models/game.dart';
import '../../models/profile.dart' show roleNameAr;
import '../profile/profile_palette.dart';
import '../../core/api/game_config_service.dart';
import 'game_session_controller.dart';
import 'mafia_gallery.dart' show roleIcon;

// ══════════════════════════════════════════════════════
// 🎬 طاولة الحلقة — `PhoneSpectatorView` (الملفّ ٢٧ §4.1–§4.11)
// ══════════════════════════════════════════════════════
// حلقةٌ ثلاثية الأبعاد ترى منها الطاولة كلّها: وضع **focus** عجلةٌ
// تُسحب بالإصبع، ووضع **overview** حلقةٌ بيضاوية مسطّحة من رموز المقاعد.
//
// 🔒 الطاولة ويدجت خالصة: لا سوكِت ولا HTTP ولا emits. كلّ ما تعرضه يصل
//    خصائصَ من `GameSessionController`. ولهذا سببان: تركيبها في شاشتين
//    (اللاعب والمضيف) لا يُضاعف المستمعات، وحدود ما تعرفه تصير حدود ما
//    يمكن أن تُسرّبه.
//
// 🔒 الأدوار الحيّة لا تُرسَم أبداً. `SpectatorSeat.role` يبقى `null` لكلّ
//    حيٍّ إلا من مصادر الكشف الخمسة (§4.7).

const _gold = Color(0xFFC5A059);
const _goldSoft = Color(0xFFD6AE61);
const _surface = Color(0xFF070707);
const _bar = Color(0xFF0A0A0A);
const _line = Color(0xFF1A1A1A);
const _citizen = Color(0xFF7FB4E6);
const _mafia = Color(0xFFE07070);
const _talk = Color(0xFF34D399);
const _danger = Color(0xFFEF4444);
const _muted = Color(0xFF8A8578);

// ── ثوابت الهندسة (compact = خطّ الأساس؛ تُضرب في gameScale) ──
const _kCardW = 140.0;
const _kCardH = 196.0;
const _kStageH = 410.0;
const _kStepX = 150.0; // إزاحة أفقية لكلّ بطاقة
const _kStepZ = 205.0; // عمق لكلّ بطاقة
const _kRxCap = 168.0;
const _kRy = 147.0;
const _kTavW = 72.0;
const _kTavH = 88.0;
const _kAvatar = 56.0;

// ── مدد نُقلت بالضبط (§6.6) ──
const _dReveal = Duration(milliseconds: 650);
const _dHold = Duration(milliseconds: 2600);
const _dGap = Duration(milliseconds: 350);
const _dFlipAll = Duration(milliseconds: 550);
const _dBanner = Duration(milliseconds: 4500);
const _dTapSuppress = Duration(milliseconds: 60);
const _dSpin = Duration(milliseconds: 550);
const _dFlip = Duration(milliseconds: 700);

class PhoneSpectatorView extends StatefulWidget {
  const PhoneSpectatorView({
    super.key,
    required this.seats,
    required this.phase,
    this.myPhysicalId,
    this.maxPlayers,
    this.discussion,
    this.justificationPid,
    this.justificationRemaining,
    this.gameTimer,
    this.silencedPids = const {},
    this.revealedRoles = const {},
    this.teamCitizens,
    this.teamMafia,
    this.banner,
    this.onBannerDismissed,
    this.winnerReveal,
    this.revealTicket = 0,
    this.hostView = false,
    this.revealRoles = false,
    this.collapsed = false,
    this.templateFor,
  });

  /// الروستر المنقّى، مرتّباً بالمقعد.
  final List<SpectatorSeat> seats;
  final String? phase;
  final int? myPhysicalId;
  final int? maxPlayers;

  final DiscussionState? discussion;

  /// المدافع في `DAY_JUSTIFICATION` وثوانيه المتبقّية.
  final int? justificationPid;
  final int? justificationRemaining;

  final GameTimerSnapshot? gameTimer;
  final Set<int> silencedPids;

  /// المصدر (أ) و(ج) و(هـ) للكشف — تبقى مقلوبةً للأبد.
  final Map<int, String> revealedRoles;

  final int? teamCitizens, teamMafia;
  final MorningBanner? banner;
  final VoidCallback? onBannerDismissed;

  /// المصدر (د): نهاية الجيم. وجودُه مع طور `GAME_OVER` يُشعل اللافتة.
  final GameOverReveal? winnerReveal;

  /// يتزايد مع كلّ بثّ كشفٍ — يُشعل السلسلة السينمائية مرّةً واحدة.
  final int revealTicket;

  /// وضع المضيف: تُخفى chip «أنت»، ويُسمح بكشف كلّ الأدوار.
  final bool hostView;
  final bool revealRoles;

  /// أثناء التصويت تُطوى — **بلا تفكيك** كي تُحفظ الحالة (§4.11).
  final bool collapsed;

  /// مُحلِّل قالب الدور — دالّةٌ لا خريطة: القوالب تُحمَّل كسولاً من
  /// `GameConfigService` ولا داعي لبناء خريطةٍ كاملة في كلّ إطار.
  final CardTemplate? Function(String role)? templateFor;

  @override
  State<PhoneSpectatorView> createState() => _PhoneSpectatorViewState();
}

class _PhoneSpectatorViewState extends State<PhoneSpectatorView> {
  SpectatorMode _mode = SpectatorMode.focus;

  /// موضع العجلة بوحدة «بطاقة» — كسريٌّ أثناء السحب.
  double _rotation = 0;

  double? _dragStartX;
  double _dragStartRot = 0;
  double _dragVelocity = 0;
  bool _dragMoved = false;
  DateTime? _lastDragEnd;

  Timer? _tick;
  Timer? _bannerTimer;
  Timer? _gameOverTimer;

  /// أثناء السلسلة يتوقّف التركيز التلقائيّ (§6.3).
  bool _revealing = false;
  int _seenTicket = 0;
  int? _flippingPid;

  bool _gameOverFlipped = false;
  bool _autoFocusedOnce = false;

  double _stageW = 360;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    _seenTicket = widget.revealTicket;
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncFocus());
    _scheduleBanner();
    _scheduleGameOver();
  }

  @override
  void didUpdateWidget(PhoneSpectatorView old) {
    super.didUpdateWidget(old);
    if (widget.banner != old.banner) _scheduleBanner();
    if (_isGameOver != (old.winnerReveal != null && old.phase == 'GAME_OVER')) {
      _scheduleGameOver();
    }
    if (widget.revealTicket != _seenTicket) {
      _seenTicket = widget.revealTicket;
      unawaited(_runRevealSequence());
    } else {
      _syncFocus();
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    _bannerTimer?.cancel();
    _gameOverTimer?.cancel();
    super.dispose();
  }

  // ══════════════════════════════════════════════════════
  // المشتقّات
  // ══════════════════════════════════════════════════════

  List<SpectatorSeat> get _seats => widget.seats;
  int get _n => _seats.length;
  bool get _isLobby =>
      widget.phase == 'LOBBY' ||
      widget.phase == 'ROLE_GENERATION' ||
      widget.phase == 'ROLE_BINDING';
  bool get _isGameOver =>
      widget.phase == 'GAME_OVER' && widget.winnerReveal != null;

  /// الدور النشط: المدافع في الدفاع، والمتحدّث في النقاش، ولا أحد سواهما.
  int? get _activePid => widget.phase == 'DAY_JUSTIFICATION'
      ? widget.justificationPid
      : (widget.phase == 'DAY_DISCUSSION'
          ? widget.discussion?.currentSpeakerId
          : null);

  int? get _activeRemaining => widget.phase == 'DAY_JUSTIFICATION'
      ? widget.justificationRemaining
      : (widget.discussion?.isSpeaking == true
          ? widget.discussion?.remaining()
          : widget.discussion?.timeRemaining);

  /// خريطة أدوار نهاية الجيم — المصدر (د).
  Map<int, String> get _gameOverRoles {
    final w = widget.winnerReveal;
    if (w == null) return const {};
    return {
      for (final p in w.players)
        if (p.role != null && p.role!.isNotEmpty) p.physicalId: p.role!,
    };
  }

  /// الدور الذي يجوز رسمه لهذا المقعد — وإلّا `null`.
  ///
  /// 🔒 هنا يتركّز كلّ منطق منع التسريب: خمسة مصادر لا سادس لها.
  String? _revealableRole(SpectatorSeat s) {
    if (_isGameOver) return _gameOverRoles[s.physicalId]; // (د)
    if (widget.hostView && widget.revealRoles) return s.role; // (هـ)
    final fromEvent = widget.revealedRoles[s.physicalId]; // (أ) و(ب)
    if (fromEvent != null && fromEvent.isNotEmpty) return fromEvent;
    if (!s.isAlive && s.role != null && s.role!.isNotEmpty) return s.role; // (ج)
    return null;
  }

  bool _isFlipped(SpectatorSeat s) {
    if (_isGameOver) return _gameOverFlipped;
    if (_flippingPid == s.physicalId) return true;
    return _revealableRole(s) != null && !s.isAlive;
  }

  // ══════════════════════════════════════════════════════
  // التركيز والسلسلة
  // ══════════════════════════════════════════════════════

  int _indexOf(int pid) => _seats.indexWhere((s) => s.physicalId == pid);

  /// أقصر مسارٍ دائريّ من الدوران الحاليّ إلى الفهرس المطلوب.
  double _shortest(int target) {
    if (_n == 0) return 0;
    final cur = _rotation;
    var best = target.toDouble();
    for (var k = -2; k <= 2; k++) {
      final cand = target + k * _n.toDouble();
      if ((cand - cur).abs() < (best - cur).abs()) best = cand;
    }
    return best;
  }

  void _focusIndex(int i, {bool switchMode = true}) {
    if (i < 0 || _n == 0) return;
    setState(() {
      if (switchMode) _mode = SpectatorMode.focus;
      _rotation = _shortest(i);
    });
  }

  /// المتحدّث السيرفريّ يفوز دائماً — إلّا أثناء السلسلة (§6.3).
  void _syncFocus() {
    if (_revealing || !mounted) return;
    final pid = _activePid;
    if (pid != null) {
      final i = _indexOf(pid);
      if (i >= 0 && _rotation.round() % (_n == 0 ? 1 : _n) != i) {
        _focusIndex(i);
      }
      return;
    }
    if (!_autoFocusedOnce && _n > 0) {
      _autoFocusedOnce = true;
      final mine = widget.hostView ? 0 : _indexOf(widget.myPhysicalId ?? -1);
      _focusIndex(mine < 0 ? 0 : mine, switchMode: false);
    }
  }

  /// §4.8 — سينمائيّة متسلسلة: دوران ٦٥٠ ← قلب وثبات ٢٦٠٠ ← فجوة ٣٥٠.
  Future<void> _runRevealSequence() async {
    final pids = widget.revealedRoles.keys.toList();
    if (pids.isEmpty || !mounted) return;
    setState(() {
      _revealing = true;
      _mode = SpectatorMode.focus;
    });
    for (final pid in pids) {
      final i = _indexOf(pid);
      if (i < 0) continue;
      _focusIndex(i);
      await Future<void>.delayed(_dReveal);
      if (!mounted) return;
      setState(() => _flippingPid = pid);
      await Future<void>.delayed(_dHold);
      if (!mounted) return;
      // تُمسح راية القلب — والبطاقة تبقى مقلوبةً عبر `revealedRoles`
      setState(() => _flippingPid = null);
      await Future<void>.delayed(_dGap);
      if (!mounted) return;
    }
    if (!mounted) return;
    setState(() => _revealing = false);
    _syncFocus();
  }

  void _scheduleBanner() {
    _bannerTimer?.cancel();
    if (widget.banner == null) return;
    _bannerTimer = Timer(_dBanner, () {
      if (mounted) widget.onBannerDismissed?.call();
    });
  }

  void _scheduleGameOver() {
    _gameOverTimer?.cancel();
    if (!_isGameOver) {
      _gameOverFlipped = false;
      return;
    }
    // تُركَّب غير مقلوبة ثمّ تُقلَب جميعاً — دورانٌ عامّ→سرّيّ لا ولادةٌ مقلوبة
    _gameOverFlipped = false;
    _mode = SpectatorMode.overview;
    _gameOverTimer = Timer(_dFlipAll, () {
      if (mounted) setState(() => _gameOverFlipped = true);
    });
  }

  // ══════════════════════════════════════════════════════
  // السحب
  // ══════════════════════════════════════════════════════

  bool get _dragEnabled =>
      _mode == SpectatorMode.focus &&
      !widget.collapsed &&
      !_revealing &&
      _n >= 2;

  void _onDragStart(DragStartDetails d) {
    if (!_dragEnabled) return;
    _dragStartX = d.localPosition.dx;
    _dragStartRot = _rotation;
    _dragMoved = false;
    _dragVelocity = 0;
  }

  void _onDragUpdate(DragUpdateDetails d) {
    final start = _dragStartX;
    if (start == null) return;
    final dx = d.localPosition.dx - start;
    if (dx.abs() > 6) _dragMoved = true;
    setState(() => _rotation = _dragStartRot - dx / _kStepX);
  }

  void _onDragEnd(DragEndDetails d) {
    if (_dragStartX == null) return;
    _dragStartX = null;
    // زخمٌ مقيَّد ببطاقتين من الحاليّة، ثمّ snap لأقرب صحيح
    _dragVelocity = -d.velocity.pixelsPerSecond.dx / 1000 * 5;
    final momentum = _dragVelocity.clamp(-2.0, 2.0);
    final target = (_rotation + momentum).round();
    _lastDragEnd = DateTime.now();
    setState(() => _rotation = target.toDouble());
  }

  /// النقر يُتجاهَل إن حصل سحبٌ لتوّه (كبت ٦٠ms).
  bool get _tapSuppressed {
    if (_dragMoved) return true;
    final t = _lastDragEnd;
    return t != null && DateTime.now().difference(t) < _dTapSuppress;
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════

  @override
  Widget build(BuildContext context) {
    final scale = context.gameScale;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _line),
      ),
      clipBehavior: Clip.antiAlias,
      child: _seats.isEmpty
          ? _loading()
          : Column(children: [
              _header(),
              // 🔴 الطيّ يخفي ولا يفكّك: التفكيك يفقد الدوران والوضع
              //    ويعيد الطاولة إلى أوّلها بعد كلّ تصويت.
              AnimatedSize(
                duration: const Duration(milliseconds: 450),
                curve: Curves.easeOut,
                child: widget.collapsed
                    ? const SizedBox(width: double.infinity, height: 0)
                    : Column(children: [
                        _speakerBar(),
                        _stage(scale),
                        _hint(),
                        _controls(),
                      ]),
              ),
            ]),
    );
  }

  Widget _loading() => const SizedBox(
        height: 180,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: _gold),
            ),
            SizedBox(height: 10),
            Text('جاري تحميل الطاولة…',
                style: TextStyle(
                    fontFamily: 'JetBrainsMono',
                    fontSize: 11,
                    color: Color(0xFF808080))),
          ]),
        ),
      );

  // ── §4.1 شريط الرأس ──
  Widget _header() {
    final label = kTablePhaseLabels[widget.phase ?? ''] ?? (widget.phase ?? '');
    final alive = _seats.where((s) => s.isAlive).length;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: _line)),
      ),
      child: Row(children: [
        Expanded(
          child: Text(label,
              style: ar(13, color: _gold, weight: FontWeight.w900)),
        ),
        if (_isLobby)
          _seatCounter()
        else ...[
          if (widget.teamCitizens != null)
            _stat('🛡️ ${widget.teamCitizens}', _citizen),
          if (widget.teamMafia != null) _stat('🔪 ${widget.teamMafia}', _mafia),
          _stat('أحياء $alive', const Color(0xFF9A9A9A)),
          if (widget.gameTimer != null) _clock(widget.gameTimer!),
        ],
      ]),
    );
  }

  Widget _stat(String t, Color c) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: Text(t, style: mono(11, color: c)),
      );

  Widget _clock(GameTimerSnapshot t) {
    final r = t.remaining();
    final txt = '${r ~/ 60}:${(r % 60).toString().padLeft(2, '0')}';
    return Container(
      padding: const EdgeInsets.only(right: 8),
      margin: const EdgeInsets.only(left: 8),
      decoration: const BoxDecoration(
        border: Border(right: BorderSide(color: _line)),
      ),
      child: Text('⏱ $txt',
          style: mono(11).copyWith(fontFeatures: const [
            FontFeature.tabularFigures(),
          ])),
    );
  }

  /// جزيرة LTR الوحيدة في الطاولة — العدّاد `N/max` يُقرأ يساراً ليمين.
  Widget _seatCounter() => Row(mainAxisSize: MainAxisSize.min, children: [
        Text('مقاعد ', style: mono(11, color: const Color(0xFF808080))),
        Directionality(
          textDirection: TextDirection.ltr,
          child: Text.rich(TextSpan(children: [
            TextSpan(text: '$_n', style: mono(11, color: _gold)),
            TextSpan(
                text: '/${widget.maxPlayers ?? _n}',
                style: mono(11, color: const Color(0xFF5A5A5A))),
          ])),
        ),
      ]);

  // ── §4.2 شريط المتحدّث ──
  Widget _speakerBar() {
    final pid = _activePid;
    final silenced = pid != null && widget.silencedPids.contains(pid);
    final seat = pid == null ? null : _seatOf(pid);

    Widget child;
    if (_isLobby) {
      final generating = widget.phase != 'LOBBY';
      child = Text(
        generating
            ? 'جارٍ توزيع الأدوار… بطاقتك ستصلك خلال لحظات'
            : 'الطاولة تكتمل — بانتظار المضيف لبدء الجولة',
        style: ar(11, color: _muted),
        textAlign: TextAlign.center,
      );
    } else if (pid != null && seat != null && silenced) {
      child = _pill(
        '🔇 #$pid ${seat.name ?? ''} — مُسكَت، لا يمكنه الكلام',
        bg: _danger.withValues(alpha: 0.15),
        border: _danger.withValues(alpha: 0.4),
        color: const Color(0xFFF87171),
      );
    } else if (pid != null && seat != null) {
      final r = _activeRemaining;
      final defending = widget.phase == 'DAY_JUSTIFICATION';
      child = _pill(
        '${defending ? '🎙️ يُدافع الآن:' : '🎙️ يتحدّث الآن:'} '
        '#$pid ${seat.name ?? ''}${r == null ? '' : ' · ${r}s'}',
        bg: _gold.withValues(alpha: 0.15),
        border: _gold.withValues(alpha: 0.4),
        color: r != null && r <= 10 ? const Color(0xFFF87171) : _goldSoft,
      );
    } else if (_isGameOver) {
      child = const SizedBox.shrink();
    } else {
      child = Text('— بانتظار المتحدّث التالي —',
          style: mono(11, color: const Color(0xFF7A7466)));
    }

    // ارتفاعٌ أدنى ثابت كي لا يقفز التخطيط بين الأدوار
    return Container(
      constraints: const BoxConstraints(minHeight: 38),
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: child,
    );
  }

  Widget _pill(String text,
          {required Color bg, required Color border, required Color color}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Text(text,
            textAlign: TextAlign.center,
            style: ar(12, color: color, weight: FontWeight.bold)),
      );

  SpectatorSeat? _seatOf(int pid) {
    for (final s in _seats) {
      if (s.physicalId == pid) return s;
    }
    return null;
  }

  // ── §4.3 المسرح ──
  Widget _stage(double scale) {
    final h = _kStageH * scale;
    return LayoutBuilder(builder: (ctx, box) {
      _stageW = box.maxWidth;
      final focus = _mode == SpectatorMode.focus;
      return SizedBox(
        height: h,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          // عموديّاً لا نلتقط شيئاً — التمرير يمرّ للأب (`pan-y`)
          onHorizontalDragStart: _onDragStart,
          onHorizontalDragUpdate: _onDragUpdate,
          onHorizontalDragEnd: _onDragEnd,
          child: Stack(children: [
            _felt(h),
            _glow(focus),
            if (focus) ..._wheel(scale, h) else ..._ring(scale, h),
            if (_isLobby && !focus) _lobbyBanner(),
            if (_isGameOver && !focus) _winnerBanner(),
            if (widget.banner != null) _morningBanner(widget.banner!),
          ]),
        ),
      );
    });
  }

  /// بساط البوكر — بيضاويّ مائل خلف الحلقة.
  Widget _felt(double h) => Positioned.fill(
        child: IgnorePointer(
          child: Center(
            child: Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..translateByDouble(0.0, h * 0.07, 0.0, 1.0)
                ..rotateX(72 * math.pi / 180),
              child: Container(
                width: _stageW * 1.5,
                height: h * 0.82,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [
                    const Color(0xFF2E5C31).withValues(alpha: 0.30),
                    const Color(0xFF0B140C).withValues(alpha: 0.0),
                  ]),
                ),
              ),
            ),
          ),
        ),
      );

  /// 🔴 `Positioned` لا بدّ أن يكون ابناً مباشراً لـ`Stack`؛ لفُّه بـ
  ///    `AnimatedOpacity` من الخارج يرمي `Incorrect use of
  ///    ParentDataWidget`. التلاشي يعيش **داخله**.
  Widget _glow(bool focus) => Positioned.fill(
        child: IgnorePointer(
          child: AnimatedOpacity(
            opacity: focus ? 1 : 0,
            duration: const Duration(milliseconds: 500),
            child: Center(
            child: Container(
              width: 270,
              height: 350,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [
                  _gold.withValues(alpha: 0.18),
                  _gold.withValues(alpha: 0.0),
                ]),
              ),
            ),
            ),
          ),
        ),
      );

  // ── §4.3 وضع FOCUS: عجلة ثلاثية الأبعاد ──
  List<Widget> _wheel(double scale, double h) {
    final out = <Widget>[];
    for (var i = 0; i < _n; i++) {
      // الإزاحة بأقصر مسارٍ دائريّ كي تلتفّ العجلة بلا قفزة
      var off = i - _rotation;
      while (off > _n / 2) {
        off -= _n;
      }
      while (off < -_n / 2) {
        off += _n;
      }
      final a = off.abs();
      if (a > 2.6) continue; // خلف المشهد — لا تُرسم ولا تلتقط لمساً

      final cardScale = math.max(0.72, 1 - a * 0.3);
      final opacity = a < 0.5 ? 1.0 : (a < 2.6 ? 0.5 : 0.0);

      final m = Matrix4.identity()
        ..setEntry(3, 2, 0.001) // perspective 1000px
        ..translateByDouble(off * _kStepX * scale, 0.0, -a * _kStepZ * scale, 1.0)
        ..rotateY(-off * 45 * math.pi / 180)
        ..rotateZ(off * 3 * math.pi / 180)
        ..scaleByDouble(cardScale, cardScale, 1.0, 1.0);

      out.add(Positioned.fill(
        child: Center(
          child: Transform(
            alignment: Alignment.center,
            transform: m,
            child: Opacity(
              opacity: opacity,
              child: IgnorePointer(
                ignoring: a > 2.0,
                child: GestureDetector(
                  onTap: () {
                    if (_tapSuppressed || a < 0.5) return;
                    _focusIndex(i);
                  },
                  child: _card(_seats[i], scale, front: a < 0.5),
                ),
              ),
            ),
          ),
        ),
      ));
    }
    // البطاقة الأمامية آخِراً كي تعلو ما حولها (بديل zIndex)
    out.sort((a, b) => 0);
    return out;
  }

  // ── §4.3 وضع OVERVIEW: حلقة بيضاوية من رموز المقاعد ──
  List<Widget> _ring(double scale, double h) {
    final empty = _isLobby && widget.maxPlayers != null
        ? math.max(0, widget.maxPlayers! - _n)
        : 0;
    final denom = _isLobby ? math.max(widget.maxPlayers ?? _n, _n) : _n;
    final rx = math.min(_stageW / 2 - 44 * scale, _kRxCap * scale);
    final ry = _kRy * scale;

    Widget place(int i, Widget child) {
      final ang = (i / (denom == 0 ? 1 : denom)) * 2 * math.pi - math.pi / 2;
      return Positioned.fill(
        child: Center(
          child: Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.001)
              ..rotateX(8 * math.pi / 180)
              ..translateByDouble(math.cos(ang) * rx, math.sin(ang) * ry + 4, 0.0, 1.0),
            child: child,
          ),
        ),
      );
    }

    return [
      for (var i = 0; i < _n; i++)
        place(
          i,
          GestureDetector(
            onTap: () {
              if (_tapSuppressed) return;
              _focusIndex(i);
            },
            child: _seatToken(_seats[i], scale),
          ),
        ),
      for (var k = 0; k < empty; k++) place(_n + k, _emptySeat(scale)),
    ];
  }

  // ── §4.4 و§4.5 البطاقة بوجهيها ──
  Widget _card(SpectatorSeat s, double scale, {required bool front}) {
    final w = _kCardW * scale;
    final h = _kCardH * scale;
    final flipped = _isFlipped(s);
    final dead = !s.isAlive;

    return AnimatedContainer(
      duration: _dSpin,
      curve: const Cubic(.15, .5, .3, .95),
      width: w,
      height: h,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        boxShadow: front && !dead
            ? [BoxShadow(color: _gold.withValues(alpha: 0.35), blurRadius: 22)]
            : const [],
        border: Border.all(
            color: dead ? const Color(0xFF5A1A1A) : _line, width: 1.5),
      ),
      clipBehavior: Clip.antiAlias,
      child: _Flip(
        flipped: flipped,
        front: _cardFront(s, w, h, scale),
        back: _cardBack(s, w, h),
      ),
    );
  }

  Widget _cardFront(SpectatorSeat s, double w, double h, double scale) {
    final dead = !s.isAlive;
    final silenced = widget.silencedPids.contains(s.physicalId);
    final speaking = _activePid == s.physicalId && !dead && !silenced;
    final mine = !widget.hostView && s.physicalId == widget.myPhysicalId;
    final r = speaking ? _activeRemaining : null;

    Widget face = Column(children: [
      Expanded(
        flex: 66,
        child: Stack(fit: StackFit.expand, children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: s.isFemale
                    ? const [Color(0xFF5B4A67), Color(0xFF1E1725)]
                    : const [Color(0xFF6A5A34), Color(0xFF1C1811)],
              ),
            ),
          ),
          if (s.avatarUrl != null && s.avatarUrl!.isNotEmpty)
            CachedNetworkImage(
              imageUrl: ApiClient.instance.upload(s.avatarUrl),
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => const SizedBox.shrink(),
              placeholder: (_, __) => const SizedBox.shrink(),
            ),
          if (dead)
            ColoredBox(
              color: Colors.black.withValues(alpha: 0.5),
              child: Center(
                  child: Text('💀',
                      style: TextStyle(fontSize: 30 * scale))),
            ),
          // شارة الرقم
          Positioned(
            top: 4,
            right: 4,
            child: _chip(
              '${s.physicalId}',
              color: s.isFemale
                  ? const Color(0xFFE9D5FF)
                  : const Color(0xFFF0D9A0),
              size: 16 * scale,
            ),
          ),
          if (mine)
            Positioned(
              top: 4,
              left: 4,
              child: _chip('أنت', color: _gold, size: 10 * scale, arabic: true),
            ),
          if (speaking)
            Positioned(
              bottom: 4,
              left: 4,
              child: _disc('🎙️', _gold, 22 * scale),
            ),
          if (silenced)
            Positioned(
              bottom: 4,
              left: 4,
              child: _disc('🔇', _danger, 22 * scale),
            ),
          if (r != null && !silenced)
            Positioned(
              top: 24 * scale,
              right: 4,
              child: _chip('${r}s',
                  color: r <= 10 ? const Color(0xFFF87171) : _goldSoft,
                  size: 11 * scale),
            ),
        ]),
      ),
      Expanded(
        flex: 34,
        child: Container(
          width: double.infinity,
          color: Colors.black,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // شريط دور المضيف — فوق الاسم، ولا يظهر إلّا في وضع المضيف
              if (widget.hostView && widget.revealRoles && s.role != null)
                Text(
                  '${roleIcon(s.role)} ${roleNameAr(s.role)}',
                  style: ar(9,
                      color: kMafiaRoleIds.contains(s.role) ? _mafia : _citizen,
                      weight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              Text(
                s.name ?? '#${s.physicalId}',
                style: TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 16 * scale,
                  color: dead ? const Color(0xFF8A8A8A) : Colors.white,
                  letterSpacing: 0,
                  decoration: dead ? TextDecoration.lineThrough : null,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    ]);

    if (dead) {
      face = Opacity(
        opacity: 0.62,
        child: ColorFiltered(
          colorFilter: const ColorFilter.matrix(<double>[
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0, 0, 0, 1, 0,
          ]),
          child: face,
        ),
      );
    }
    return face;
  }

  Widget _cardBack(SpectatorSeat s, double w, double h) {
    final role = _revealableRole(s);
    if (role == null) return const ColoredBox(color: Color(0xFF0B0B0B));

    final tpl = widget.templateFor?.call(role);
    final isMafia = kMafiaRoleIds.contains(role);
    final textColor = tpl == null
        ? (isMafia ? const Color(0xFFD13636) : const Color(0xFF3F83C4))
        : parseCssColor(tpl.textColor,
            isMafia ? const Color(0xFFD13636) : const Color(0xFF3F83C4));

    final custom = tpl?.secretImageUrl;
    if (custom != null && custom.isNotEmpty) {
      return CachedNetworkImage(
        imageUrl: ApiClient.instance.upload(custom),
        width: w,
        height: h,
        fit: BoxFit.cover,
        errorWidget: (_, __, ___) => _generatedBack(s, role, tpl, textColor),
        placeholder: (_, __) => const ColoredBox(color: Color(0xFF0B0B0B)),
      );
    }
    return _generatedBack(s, role, tpl, textColor);
  }

  Widget _generatedBack(
      SpectatorSeat s, String role, CardTemplate? tpl, Color textColor) {
    return Container(
      decoration: BoxDecoration(
        gradient: tpl?.bodyGradient ??
            const RadialGradient(
                colors: [Color(0xFF2A2A30), Color(0xFF0B0B0F)]),
        border: Border.all(color: tpl?.border ?? _gold, width: 1.5),
      ),
      alignment: Alignment.center,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(roleIcon(role), style: const TextStyle(fontSize: 34)),
        const SizedBox(height: 6),
        Text(roleNameAr(role),
            style: TextStyle(
              fontFamily: 'Amiri',
              fontSize: 18,
              color: textColor,
              letterSpacing: 0,
            )),
        const SizedBox(height: 2),
        Text('#${s.physicalId} · ${s.name ?? ''}',
            style: mono(11, color: const Color(0xFF9A9A9A)),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
      ]),
    );
  }

  // ── §4.6 رمز المقعد ──
  Widget _seatToken(SpectatorSeat s, double scale) {
    final dead = !s.isAlive;
    final silenced = widget.silencedPids.contains(s.physicalId);
    final speaking = _activePid == s.physicalId && !dead && !silenced;
    final mine = !widget.hostView && s.physicalId == widget.myPhysicalId;
    final role = _isGameOver ? _gameOverRoles[s.physicalId] : null;

    // الحلقة المعدنية: ذهبيّة، بنفسجية للأنثى، وبلون الفريق عند النهاية
    final ring = role != null
        ? (kMafiaRoleIds.contains(role)
            ? const Color(0xFFF0A5A0)
            : const Color(0xFFA8CDF0))
        : (s.isFemale ? const Color(0xFFD8B4FE) : const Color(0xFFE8CF8F));

    Widget disc = Container(
      width: _kAvatar * scale,
      height: _kAvatar * scale,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF0D0D0D),
        border: Border.all(color: ring, width: 2),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.6),
              blurRadius: 14,
              offset: const Offset(0, 5)),
          if (speaking) BoxShadow(color: _gold.withValues(alpha: 0.5), blurRadius: 12),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: (s.avatarUrl == null || s.avatarUrl!.isEmpty)
          ? Center(
              child: Text(role == null ? '👤' : roleIcon(role),
                  style: TextStyle(fontSize: _kAvatar * scale * 0.42)))
          : CachedNetworkImage(
              imageUrl: ApiClient.instance.upload(s.avatarUrl),
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => Center(
                  child: Text('👤',
                      style: TextStyle(fontSize: _kAvatar * scale * 0.42))),
              placeholder: (_, __) =>
                  const ColoredBox(color: Color(0xFF0D0D0D)),
            ),
    );

    if (dead) {
      disc = Opacity(
        opacity: 0.55,
        child: ColorFiltered(
          colorFilter: const ColorFilter.matrix(<double>[
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0.2126, 0.7152, 0.0722, 0, 0, //
            0, 0, 0, 1, 0,
          ]),
          child: disc,
        ),
      );
    }

    return SizedBox(
      width: _kTavW * scale,
      height: _kTavH * scale,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Stack(clipBehavior: Clip.none, children: [
          disc,
          Positioned(
            top: -2,
            right: -2,
            child: _chip('${s.physicalId}',
                color: s.isFemale
                    ? const Color(0xFFE9D5FF)
                    : const Color(0xFFF0D9A0),
                size: 11 * scale),
          ),
          if (mine)
            Positioned(
                bottom: -2,
                left: -2,
                child: _chip('أنت',
                    color: _gold, size: 9 * scale, arabic: true)),
          if (dead)
            Positioned(
                bottom: -2, right: -2, child: Text('💀', style: TextStyle(fontSize: 11 * scale))),
          if (!dead && silenced)
            Positioned(
                bottom: -2, right: -2, child: Text('🔇', style: TextStyle(fontSize: 11 * scale))),
          if (speaking) Positioned(bottom: -2, right: -2, child: _talkDot(scale)),
        ]),
        const SizedBox(height: 3),
        Flexible(
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: 5 * scale, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.75),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: _gold.withValues(alpha: 0.4)),
            ),
            // عند النهاية يحمل الشريط اسم **الدور** لا اسم اللاعب
            child: Text(
              role != null ? roleNameAr(role) : (s.name ?? '#${s.physicalId}'),
              style: TextStyle(
                fontFamily: 'Amiri',
                fontSize: 11.5 * scale,
                letterSpacing: 0,
                color: dead ? const Color(0xFF8A8A8A) : Colors.white,
                decoration: dead ? TextDecoration.lineThrough : null,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ]),
    );
  }

  Widget _talkDot(double scale) => Container(
        width: 11 * scale,
        height: 11 * scale,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: _talk,
          boxShadow: [BoxShadow(color: _talk, blurRadius: 9)],
        ),
      );

  Widget _emptySeat(double scale) => SizedBox(
        width: _kTavW * scale,
        height: _kTavH * scale,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: _kAvatar * scale,
            height: _kAvatar * scale,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF3A3A3A)),
            ),
            child: Text('؟',
                style: ar(18, color: const Color(0xFF5A5A5A))),
          ),
          const SizedBox(height: 4),
          Text('شاغر', style: ar(10, color: const Color(0xFF5A5A5A))),
        ]),
      );

  // ── §4.9 البانرات ──
  Widget _morningBanner(MorningBanner b) => Positioned(
        top: 8,
        left: 0,
        right: 0,
        child: IgnorePointer(
          child: Center(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: (b.saved ? _citizen : const Color(0xFFF59E0B))
                        .withValues(alpha: 0.5)),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(b.saved ? '🛡️ فشل الاغتيال' : '⚠️ لم تنفع الحماية',
                    style: ar(15,
                        color: b.saved ? _citizen : const Color(0xFFF59E0B),
                        weight: FontWeight.w900)),
                if (b.name != null && b.name!.isNotEmpty)
                  Text(
                      b.saved
                          ? 'نجت الحماية · ${b.name}'
                          : '${b.name}',
                      style: ar(11, color: const Color(0xFF9A9A9A))),
              ]),
            ),
          ),
        ),
      );

  Widget _lobbyBanner() => Center(
        child: IgnorePointer(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
                widget.phase == 'LOBBY'
                    ? 'الطاولة تكتمل'
                    : 'جارٍ توزيع الأدوار…',
                style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 19,
                    color: _gold,
                    letterSpacing: 0)),
            const SizedBox(height: 4),
            Text(
                widget.phase == 'LOBBY'
                    ? 'بانتظار المضيف لبدء الجولة'
                    : 'بطاقتك ستصلك خلال لحظات',
                style: mono(11, color: _muted)),
          ]),
        ),
      );

  // ── §4.10 لافتة الفائز ──
  Widget _winnerBanner() {
    final (icon, title) = switch (widget.winnerReveal?.winner) {
      WinnerType.mafia => ('🩸', 'انتصار المافيا'),
      WinnerType.assassin => ('🔪', 'انتصار السفّاح'),
      WinnerType.jester => ('🤡', 'فوز المهرج'),
      _ => ('⚖️', 'تطهير المدينة'),
    };
    return Center(
      child: IgnorePointer(
        child: AnimatedScale(
          scale: _gameOverFlipped ? 0.92 : 0.7,
          duration: const Duration(milliseconds: 600),
          curve: Curves.easeOut,
          child: AnimatedOpacity(
            opacity: _gameOverFlipped ? 1 : 0,
            duration: const Duration(milliseconds: 600),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(icon,
                  style: TextStyle(
                    fontSize: 38,
                    shadows: [
                      Shadow(
                          color: _gold.withValues(alpha: 0.55),
                          blurRadius: 20),
                    ],
                  )),
              const SizedBox(height: 6),
              Text(title,
                  style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: _gold,
                    letterSpacing: 0,
                    shadows: [
                      Shadow(color: Colors.black, blurRadius: 14, offset: Offset(0, 2)),
                    ],
                  )),
            ]),
          ),
        ),
      ),
    );
  }

  // ── §4.11 التلميح وشريط التحكم ──
  Widget _hint() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Text(
          _mode == SpectatorMode.focus
              ? 'اسحب لتدوير الحلقة · اضغط كارداً جانبياً للانتقال'
              : 'اضغط أي مقعد لتكبيره فوراً',
          style: mono(11, color: _muted),
          textAlign: TextAlign.center,
        ),
      );

  Widget _controls() {
    final focus = _mode == SpectatorMode.focus;
    final activePid = _activePid;
    final centered = _n == 0 ? -1 : _rotation.round() % _n;
    final showReturn = focus &&
        activePid != null &&
        centered >= 0 &&
        centered < _n &&
        _seats[centered].physicalId != activePid;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: const BoxDecoration(
        color: _bar,
        border: Border(top: BorderSide(color: _line)),
      ),
      child: Row(children: [
        Expanded(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 240, minHeight: 44),
            child: _ctrlButton(
              focus ? '◱ تصغير — عرض الحلقة كاملة' : '⊡ تكبير كاردي',
              color: _goldSoft,
              onTap: () => setState(() => _mode =
                  focus ? SpectatorMode.overview : SpectatorMode.focus),
            ),
          ),
        ),
        if (showReturn) ...[
          const SizedBox(width: 8),
          _ctrlButton('↺ للمتحدّث',
              color: const Color(0xFF3F83C4),
              onTap: () => _focusIndex(_indexOf(activePid))),
        ],
      ]),
    );
  }

  Widget _ctrlButton(String label,
          {required Color color, required VoidCallback onTap}) =>
      Material(
        color: const Color(0xFF111111),
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: color.withValues(alpha: 0.4)),
            ),
            child: Text(label,
                style: mono(11.5, color: color),
                textAlign: TextAlign.center),
          ),
        ),
      );

  Widget _chip(String t,
          {required Color color, required double size, bool arabic = false}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(t,
            style: arabic
                ? ar(size, color: color, weight: FontWeight.bold)
                : mono(size, color: color, weight: FontWeight.w700)),
      );

  Widget _disc(String emoji, Color color, double size) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withValues(alpha: 0.25),
          border: Border.all(color: color.withValues(alpha: 0.6)),
        ),
        child: Text(emoji, style: TextStyle(fontSize: size * 0.5)),
      );
}

// ══════════════════════════════════════════════════════
// 🔄 قلبٌ ثلاثيّ الأبعاد — `.7s cubic-bezier(.5,.05,.2,1)`
// ══════════════════════════════════════════════════════
class _Flip extends StatelessWidget {
  const _Flip({
    required this.flipped,
    required this.front,
    required this.back,
  });

  final bool flipped;
  final Widget front, back;

  @override
  Widget build(BuildContext context) {
    // «تقليل الحركة» يُلغي القلب لا الكشف — المضمون يصل بلا دوران
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return flipped ? back : front;
    }
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: flipped ? 1 : 0),
      duration: _dFlip,
      curve: const Cubic(.5, .05, .2, 1),
      builder: (_, t, __) {
        final angle = t * math.pi;
        final showBack = t > 0.5;
        return Transform(
          alignment: Alignment.center,
          transform: Matrix4.identity()
            ..setEntry(3, 2, 0.001)
            ..rotateY(angle),
          child: showBack
              ? Transform(
                  alignment: Alignment.center,
                  transform: Matrix4.identity()..rotateY(math.pi),
                  child: back,
                )
              : front,
        );
      },
    );
  }
}

// ══════════════════════════════════════════════════════
// 🔌 الموصِّل — الطاولة كما يراها اللاعب عن بُعد (§6.1)
// ══════════════════════════════════════════════════════
// 🔒 حارسٌ واحد لا يُتجاوَز: **لا طاولة في الألعاب الوجاهية إطلاقاً**.
//    اللاعب في القاعة يرى الطاولة الحقيقية أمامه؛ ورسمُ حلقةٍ رقمية له
//    يعني وضع أفاتارات ونقاط تكلّمٍ أمام من يستطيع رفع رأسه ورؤيتها —
//    ويفتح باباً لكشفٍ لا يحتاجه أحد.
class RemoteSpectatorTable extends StatelessWidget {
  const RemoteSpectatorTable({
    super.key,
    required this.controller,
    this.hostView = false,
    this.revealRoles = false,
  });

  final GameSessionController controller;
  final bool hostView, revealRoles;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    if (!c.isRemote) return const SizedBox.shrink();

    final accused = c.justification?.accused;
    return PhoneSpectatorView(
      seats: [for (final p in c.roster) SpectatorSeat.fromRoster(p)],
      phase: c.gamePhase,
      myPhysicalId: c.physicalId,
      maxPlayers: c.maxPlayers,
      discussion: c.discussion,
      justificationPid:
          (accused == null || accused.isEmpty) ? null : accused.first.targetPhysicalId,
      justificationRemaining: c.justTimer,
      gameTimer: c.gameTimer,
      silencedPids: c.silencedPids,
      revealedRoles: c.revealedRoles,
      teamCitizens: c.teamCitizens,
      teamMafia: c.teamMafia,
      banner: c.tableBanner,
      onBannerDismissed: c.dismissTableBanner,
      winnerReveal: c.gameOver,
      revealTicket: c.revealTicket,
      hostView: hostView,
      revealRoles: revealRoles,
      // الطيّ أثناء التصويت: البطاقات تحتاج كلّ البكسلات
      collapsed: c.gamePhase == GamePhase.dayVoting,
      templateFor: GameConfigService.instance.cardForRole,
    );
  }
}
