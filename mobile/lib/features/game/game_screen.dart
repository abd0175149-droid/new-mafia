import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/router.dart';
import '../../core/api/api_client.dart';
import '../../core/api/game_config_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/game.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';
import 'mafia_gallery.dart';
import 'mayor_layers.dart';
import 'night_view.dart';
import 'notepad_sheet.dart';
import '../order/order_screen.dart' show showOrderSheet;
import 'join_flow.dart';
import '../voice/remote_voice.dart';
import '../voice/voice_service.dart';
import 'lobby_view.dart';

// ══════════════════════════════════════════════════════
// 🎬 شاشة اللعب — §4 في الملفّ 21
// ══════════════════════════════════════════════════════
// 🔴 **شاشةٌ واحدة بـ`AnimatedSwitcher` لا `Navigator`**: مستمعات السوكِت
//    يجب أن تبقى حيّةً عبر كل الخطوات. دفعُ كل خطوةٍ كمسارٍ يفكّ الشجرة
//    فتُفقَد الاشتراكات وينقطع البثّ.

/// ذهبيّ الهوية وأحمرها — ألوان قشرة الدخول.
const _gold = Color(0xFFC5A059);
const _blood = Color(0xFF8A0303);
const _line = Color(0xFF2A2A2A);

class GameScreen extends StatefulWidget {
  const GameScreen({
    super.key,
    this.initialRoomCode,
    this.invite = false,
    this.inviterName,
  });

  /// من رمز QR أو رابطٍ عميق.
  final String? initialRoomCode;

  /// 🔴 INV-1: `invite=1&by=…` من إشعار دعوة. كان الراوتر يقرأ `code` وحده
  ///    ويُسقطهما، فتُدخل نقرةُ الإشعار اللاعبَ الغرفةَ **صامتاً** بلا سؤالٍ
  ///    ولا ذكرِ من دعاه — بينما الويب يؤكّد أوّلاً.
  final bool invite;
  final String? inviterName;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  final _c = GameSessionController.instance;
  final _code = TextEditingController();
  final _ticket = TextEditingController();
  bool _booted = false;
  /// 🍽️ هل للاعب سياق طلبٍ الآن؟ الخادم وحده يقرّر (حجزٌ + نافذة الفعاليّة).
  bool _fnbReady = false;
  bool _fnbAsked = false;

  /// رمزُ دعوةٍ ينتظر تأكيد اللاعب (INV-1).
  String? _pendingInvite;

  @override
  void initState() {
    super.initState();
    _c.addListener(_onChange);
    unawaited(_boot());
  }

  @override
  void dispose() {
    _c.removeListener(_onChange);
    unawaited(VoiceService.instance.disconnect());
    _code.dispose();
    _ticket.dispose();
    super.dispose();
  }

  /// 🔒 الصوت للغرف البعيدة وحدها. الخدمة مفردة، و`connect` بنفس المفتاح
  ///    لا يعيد الاتصال — فاستدعاؤه مع كلّ تغيّرٍ آمن.
  ///
  /// 🪑 وهو أيضاً **مسار اعتماد المقعد الجديد**: تغيّرُ `physicalId` (نقلٌ
  ///    من الليدر أو مزامنةٌ من الاستطلاع) يصل هنا مع أوّل إشعار، فتتبنّاه
  ///    `connect` بإعادة إصدار توكن الصوت — هويّة المشارك في الاجتماع
  ///    مشتقّةٌ من المقعد لا من الجهاز.
  void _syncVoice() {
    if (!_c.isRemote || _c.roomId.isEmpty) {
      unawaited(VoiceService.instance.disconnect());
      return;
    }
    unawaited(VoiceService.instance.connect(
      roomId: _c.roomId,
      isHost: false,
      selfPhysicalId: _c.physicalId,
      displayName: _c.displayName,
    ));
    VoiceService.instance.updateContext(
      phase: _c.gamePhase,
      isPlayerDead: _c.isPlayerDead,
    );
    VoiceService.instance.seedDiscussion(_c.discussion);
  }

  /// يُسأل الخادم مرّةً واحدة عند استقرار الدخول — فشلُه يُخفي الزرّ بلا رسالة
  /// خطأ تقاطع اللاعب أثناء اللعب.
  Future<void> _checkFnb() async {
    if (_fnbAsked) return;
    _fnbAsked = true;
    try {
      final d = await ApiClient.instance.get('/api/fnb/context');
      if (mounted && d is Map && d['context'] != null) {
        setState(() => _fnbReady = true);
      }
    } catch (_) { /* بلا زرّ — لا إزعاج */ }
  }

  void _onChange() {
    if (!mounted) return;
    _syncVoice();
    if (_c.step == GameStep.done || _c.step == GameStep.rejoined) {
      unawaited(_checkFnb());
    }
    // 🔑 JOIN-1: غير مسجّلٍ قصد غرفةً — إلى المصادقة، والرمز محفوظٌ للعودة.
    //    فوريّ بلا مهلة: لا رسالةَ يقرؤها، والانتظار يبدو تعليقاً.
    if (_c.authRedirect) {
      _c.consumeAuthRedirect();
      navigateTo(Routes.login);
      return;
    }
    // استبياناتٌ معلّقة تمنع الانضمام — تحويلٌ بعد أن يقرأ اللاعب السبب
    if (_c.feedbackRedirect) {
      _c.consumeFeedbackRedirect();
      Timer(const Duration(milliseconds: 1500), () {
        if (mounted) navigateTo(Routes.feedback);
      });
    }
    setState(() {});
  }

  Future<void> _boot() async {
    // 🔴 كتالوج اللعبة **قبل** أيّ رسمٍ للبطاقة: بدونه لا قالب دورٍ ولا
    //    اسمٌ عربيّ ولا إزاحة رقم — فتُرسم البطاقة بقيمٍ افتراضية لا
    //    وجود لها على شاشة القاعة.
    unawaited(GameConfigService.instance
        .ensureLoaded()
        .then((_) => mounted ? setState(() {}) : null));
    await _c.start();
    if (!mounted) return;
    _booted = true;

    final qr = widget.initialRoomCode?.trim();
    if (qr != null && qr.isNotEmpty && !_c.step.inGame) {
      _code.text = qr;
      _c.roomCodeInput = qr;
      // 🔴 INV-1: الدعوة تُؤكَّد قبل أيّ انضمامٍ صامت. رمز QR لا يحتاج سؤالاً
      //    (اللاعب مسحه بنفسه قاصداً)، أمّا نقرةُ إشعارٍ فقد تقع بالخطأ —
      //    وانضمامٌ لم يُقصد يشغل مقعداً ويُربك الليدر.
      if (widget.invite) {
        setState(() => _pendingInvite = qr);
        return;
      }
      // 📌 الرمز مُمرَّر ⇒ لا تتقدّم إلى الهاتف تلقائياً
      await _c.findRoom(qr);
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (!_booted) {
      return const _Shell(child: _Spinner(label: 'جارٍ الاتصال…'));
    }
    if (_c.restoring) {
      return const _Shell(child: _Spinner(label: 'RESTORING SESSION...'));
    }
    if (_c.isExpelled) return _Shell(child: _expelled());

    return PopsToHome(
      child: Stack(children: [
        _Shell(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            child: KeyedSubtree(
              key: ValueKey(_c.step),
              child: switch (_c.step) {
                GameStep.code => _codeStep(),
                GameStep.autoJoining => const _Spinner(
                    label: 'جاري تخصيص مقعدك...',
                    sub: 'يتم اختيار أفضل مقعد لك'),
                GameStep.ticket => _ticketStep(),
                GameStep.done || GameStep.rejoined => LobbyView(controller: _c),
                // خطوات المصادقة تصل مع الملفّ ٠٥ — الحساب هنا مسجَّلٌ أصلاً
                _ => const _Spinner(label: 'جارٍ…'),
              },
            ),
          ),
        ),
        if (_pendingInvite != null)
          Positioned.fill(
            child: _InviteConfirmModal(
              code: _pendingInvite!,
              inviterName: widget.inviterName,
              onAccept: () {
                final code = _pendingInvite!;
                setState(() => _pendingInvite = null);
                unawaited(_c.findRoom(code));
              },
              onDecline: () {
                setState(() => _pendingInvite = null);
                navigateTo(Routes.home);
              },
            ),
          ),
        if (_c.switchConfirm != null) _switchModal(),
        if (_c.joinConfirmation != null) _joinModal(),
        if (_showGalleryFab) _galleryFab(),
        if (_c.step == GameStep.done || _c.step == GameStep.rejoined)
          _notepadFab(),
        if (_fnbReady &&
            (_c.step == GameStep.done || _c.step == GameStep.rejoined))
          _orderFab(),
        // 🌙 طبقة الليل تعلو كلّ شيء عدا مودال تبديل الغرفة
        Positioned.fill(child: NightLayer(controller: _c)),
        // 🎩 طبقات العمدة — المودال والبانر والشارة
        Positioned.fill(child: MayorLayer(controller: _c)),
        // ⚖️ PEN-1: تنبيه المخالفة يعلو كلّ شيء — قرارٌ يخصّ اللاعب وحده
        //    ولا يُفهم متأخّراً: من أُقصي بالعقوبات كان يكتشف موته بلا سبب.
        if (_c.penaltyAlert != null)
          Positioned.fill(
            child: _PenaltyAlertModal(
              alert: _c.penaltyAlert!,
              onClose: _c.dismissPenaltyAlert,
            ),
          ),
        // 🪑 إشعار المقعد — **فوق طبقتَي الليل والعمدة**: النقل يقع في أيّ
        //    مرحلة، وطبقة الليل تملأ الشاشة فتبتلع أيّ إشعارٍ تحتها.
        if (_c.seatChangeAlert != null) _seatToast(_c.seatChangeAlert!),
        // 🎙️ شريط الصوت — **عن بُعد وحده**، ثابتٌ أسفل الشاشة فوق كلّ طور
        if (_c.isRemote)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: RemoteVoiceBar(
              enabled: _c.gamePhase != null,
              service: VoiceService.instance,
              gamePhase: _c.gamePhase,
            ),
          ),
      ]),
    );
  }

  // ── الخطوات ──
  Widget _codeStep() {
    // 🪑 SEAT-1: مقعدٌ محجوزٌ لم تنتهِ مهلته — عودةٌ بضغطةٍ بدل إعادة إدخال
    //    الرمز. الدالّة `readHeldSeat` كانت **موثّقةً بأن «تستعملها شاشة
    //    إدخال الرمز»** ولا أحد يستدعيها؛ فمن خرج بالخطأ كان يبدأ من الصفر.
    final held = _c.readHeldSeat();

    return Column(mainAxisSize: MainAxisSize.min, children: [
        const _StepHead(
            title: 'الانضمام للعملية',
            sub: 'INPUT SECURE OPERATION CODE',
            icon: Icons.lock_outline),

        if (held != null) ...[
          _HeldSeatCard(
            seat: held,
            onTap: () {
              _code.text = held.roomCode;
              _c.roomCodeInput = held.roomCode;
              unawaited(_c.findRoom(held.roomCode));
            },
          ),
          const SizedBox(height: 16),
        ],
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 4,
          autofocus: true,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(4),
          ],
          onChanged: (v) {
            setState(() => _c.roomCodeInput = v);
            // 🔴 الكود أربع خاناتٍ بالضبط: عند اكتمالها لا حاجة للوحة،
            //    فتُغلق تلقائياً ويظهر زرّ الاتّصال. هذا هو المخرج الطبيعيّ
            //    على iOS حيث لا زرّ Return في لوحة الأرقام.
            if (v.length == 4) FocusScope.of(context).unfocus();
          },
          style: mono(34, color: Colors.white, weight: FontWeight.w900)
              .copyWith(letterSpacing: 14),
          decoration: InputDecoration(
            counterText: '',
            hintText: '----',
            hintStyle: mono(34, color: const Color(0xFF222222))
                .copyWith(letterSpacing: 14),
            filled: true,
            fillColor: const Color(0x66000000),
            contentPadding: const EdgeInsets.symmetric(vertical: 16),
            enabledBorder: _border(_line),
            focusedBorder: _border(_gold),
          ),
        ),
        const SizedBox(height: 24),
        if (_c.apiError != null) _errorBar(_c.apiError!),
        _PremiumButton(
          label: _c.busy ? 'CONNECTING...' : 'ESTABLISH LINK',
          enabled: _c.roomCodeInput.length == 4 && !_c.busy,
          onTap: () => _c.findRoom(),
        ),
      ]);
  }

  Widget _ticketStep() {
    final name = SessionStore.instance.player?.name ?? '';
    return Column(mainAxisSize: MainAxisSize.min, children: [
      _StepHead(
          title: 'مرحباً $name',
          sub: 'أدخل رقم التذكرة للدخول',
          icon: Icons.confirmation_number_outlined,
          subArabic: true),
      // 🔴 جزيرة LTR: رقم التذكرة لاتينيّ ولا يُقلَب مع الفقرة العربية
      Directionality(
        textDirection: TextDirection.ltr,
        child: TextField(
          controller: _ticket,
          textAlign: TextAlign.center,
          autofocus: true,
          onChanged: (v) => setState(() => _c.ticketInput = v),
          style: mono(22, color: Colors.white).copyWith(letterSpacing: 6),
          decoration: InputDecoration(
            hintText: 'رقم التذكرة',
            hintStyle: mono(16, color: const Color(0xFF333333)),
            filled: true,
            fillColor: const Color(0x66000000),
            contentPadding:
                const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
            enabledBorder: _border(_line, 14),
            focusedBorder: _border(const Color(0x80C5A059), 14),
          ),
        ),
      ),
      const SizedBox(height: 20),
      if (_c.apiError != null) _errorBar(_c.apiError!),
      _TicketButton(
        enabled: _c.ticketInput.trim().isNotEmpty && !_c.busy,
        busy: _c.busy,
        onTap: () => _c.autoJoin(ticket: _c.ticketInput),
      ),
    ]);
  }

  Widget _expelled() => Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('🚫', style: TextStyle(fontSize: 56)),
        const SizedBox(height: 12),
        Text('أُخرجت من الغرفة',
            style: ar(20, color: _blood, weight: FontWeight.w900)),
        const SizedBox(height: 8),
        Text(_c.expulsionReason ?? '',
            textAlign: TextAlign.center, style: ar(13, color: Tw.gray400)),
        const SizedBox(height: 24),
        _PremiumButton(
            label: 'الرئيسيّة',
            enabled: true,
            onTap: () => navigateTo(Routes.home)),
      ]);

  // ── المودالات ──
  // ── §4.6 زرّ «التعرّف على المافيا» ──
  //
  /// يُعرَض لكلّ من لديه دورٌ — **لا للمافيا وحدهم**. لو ظهر للمافيا فقط
  /// لكشفَ وجودُه هويّةَ صاحبه لأيّ جارٍ يسترق النظر، ولانهار السرّ من
  /// الزرّ نفسه قبل أن يُفتح. المواطن يفتحه فيرى «ملفاً استخباراتياً».
  bool get _showGalleryFab =>
      _c.assignedRole != null &&
      _c.gamePhase != GamePhase.gameOver &&
      (_c.step == GameStep.done || _c.step == GameStep.rejoined);

  Widget _galleryFab() => Positioned(
        bottom: 110,
        left: 16,
        child: SafeArea(
          child: Material(
            color: const Color(0xE68A0303),
            shape: CircleBorder(
                side: BorderSide(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.5))),
            elevation: 6,
            shadowColor: const Color(0x808A0303),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _openGallery,
              child: const SizedBox(
                width: 48,
                height: 48,
                child: Icon(Icons.groups, size: 24, color: Colors.white),
              ),
            ),
          ),
        ),
      );

  /// 🍽️ الطلب من المكان — داخل الغرفة حيث يطلب اللاعب فعلاً.
  /// يظهر فقط إذا أعاد الخادم سياق طلبٍ (حجزٌ إلزاميّ + نافذة الفعاليّة)،
  /// فلا يزحم شاشة اللعب في غرفةٍ بلا منيو.
  Widget _orderFab() => Positioned(
        bottom: 152,
        right: 16,
        child: SafeArea(
          child: Material(
            color: const Color(0xFF0D1F18),
            shape: const CircleBorder(
                side: BorderSide(color: Color(0xB310B981), width: 2)),
            elevation: 6,
            shadowColor: const Color(0x5910B981),
            child: InkWell(
              customBorder: const CircleBorder(),
              // 🔴 ORDER-2: السياق يُسأل مرّةً عند دخول اللعبة، فمن انتهت
              //    نافذته يبقى الزرّ ظاهراً ويفتح ورقةً فارغة. الورقة تبلّغ
              //    فيختفي الزرّ — كما يفعل الويب.
              onTap: () => unawaited(showOrderSheet(
                context,
                onEmptyContext: () {
                  if (mounted) setState(() => _fnbReady = false);
                },
              )),
              child: const SizedBox(
                width: 48,
                height: 48,
                child: Center(child: Text('🍽️', style: TextStyle(fontSize: 20))),
              ),
            ),
          ),
        ),
      );

  /// 📝 المفكرة — تظهر لكلّ من دخل الغرفة، بدورٍ أو بلا دور. ظهورها
  /// المشروط كان سيكشف شيئاً عن صاحبها؛ وهي غطاءُ دردشة المافيا.
  Widget _notepadFab() => Positioned(
        bottom: 88,
        right: 16,
        child: SafeArea(
          child: Material(
            color: const Color(0xFF111111),
            shape: const CircleBorder(
                side: BorderSide(color: Color(0xFFC5A059), width: 2)),
            elevation: 6,
            shadowColor: const Color(0x4DC5A059),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => unawaited(showNotepad(context, _c)),
              child: Stack(clipBehavior: Clip.none, children: [
                const SizedBox(
                  width: 48,
                  height: 48,
                  child: Center(child: Text('📝', style: TextStyle(fontSize: 20))),
                ),
                if (_c.chatUnread)
                  Positioned(
                    top: 4,
                    left: 4,
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0xFFEF4444),
                      ),
                    ),
                  ),
              ]),
            ),
          ),
        ),
      );

  void _openGallery() {
    // ① الإعلان أوّلاً ② المُقصى لا يرى — التفاصيل في المتحكّم
    if (!_c.announceGalleryOpen()) return;
    // 🕵️ شاشةٌ سريّة: تفعيل الحماية الأصليّة + علامةٌ مائيّة، والإطفاء عند الإغلاق
    _c.enterSecretScreen();
    unawaited(showMafiaGallery(
      context,
      team: _c.galleryTeam,
      sibling: _c.gallerySibling,
      isAssassin: _c.isAssassin,
      contracts: _c.assassinContracts,
      watermark: _c.secretWatermarkLabel,
    ).whenComplete(_c.leaveSecretScreen));
  }

  /// 🪑 شريطٌ علويّ يدوم خمس ثوانٍ — نصّه من المتحكّم: «تغيّر مقعدك…»
  /// لمن نُقل، و«أُعيد ترتيب المقاعد» لبقيّة الغرفة.
  ///
  /// 🔴 `IgnorePointer`: يمرّ فوق المرحلة، فالتقاطُه للمسات يعطّل زرّاً
  ///    تحته في أوّل خمس ثوانٍ من أحرج اللحظات.
  Widget _seatToast(String message) => Positioned(
        top: 12,
        left: 16,
        right: 16,
        child: IgnorePointer(
          child: Center(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xF0140F06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _gold.withValues(alpha: 0.5)),
                boxShadow: const [
                  BoxShadow(color: Color(0xCC000000), blurRadius: 24),
                ],
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.event_seat, size: 16, color: _gold),
                const SizedBox(width: 8),
                Text(message, style: ar(13, color: Colors.white)),
              ]),
            ),
          ),
        ),
      );

  Widget _switchModal() {
    final s = _c.switchConfirm!;
    return _Modal(
      title: 'أنت في غرفةٍ أخرى',
      body: 'أنت الآن في «${s.currentRoomName}». '
          'الانتقال يُجمّد مقعدك هناك — يبقى محجوزاً إن عدت.',
      primary: 'انتقل',
      secondary: 'ابقَ هنا',
      busy: _c.busy,
      onPrimary: _c.switchRoom,
      onSecondary: _c.stayInCurrentRoom,
    );
  }

  Widget _joinModal() => _Modal(
        title: 'تأكيد الانضمام',
        body: _c.joinConfirmation!,
        primary: 'تابع',
        secondary: 'إلغاء',
        busy: _c.busy,
        onPrimary: () {
          _c.closeJoinConfirmation();
          return _c.autoJoin(forceJoin: true);
        },
        onSecondary: () async => _c.closeJoinConfirmation(),
      );

  static OutlineInputBorder _border(Color c, [double r = 8]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(r),
        borderSide: BorderSide(color: c),
      );

  static Widget _errorBar(String msg) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: const Color(0x1A8A0303),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(msg,
            textAlign: TextAlign.center, style: mono(11, color: _blood)),
      );
}

// ══════════════════════════════════════════════════════
// القشرة — §4.0
// ══════════════════════════════════════════════════════
class _Shell extends StatelessWidget {
  const _Shell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Scaffold(
        // 🔴 شفّاف لا `#050505` صمّاء: هذه الشاشة تعيش داخل غلافٍ يرسم
        //    خلفيّته (`DisplayBg`) ويمدّ المحتوى خلف الشريط السفليّ
        //    (`extendBody`). خلفيةٌ معتمة هنا تُغطّي ذلك كلَّه فيصير الشريط
        //    كأنه جالسٌ على لوحٍ أسود مستقلّ عن الصفحة — وهو ما رآه المالك.
        backgroundColor: Colors.transparent,
        // 🔴 لمسةٌ في أيّ فراغٍ تُغلق لوحة المفاتيح: على iOS لوحة الأرقام
        //    (`TextInputType.number`) **بلا زرّ Return**، وحقل الكود
        //    `autofocus` — فبلا هذا المخرج تبقى اللوحة عالقةً بلا طريقة
        //    لإخفائها. على أندرويد يغلقها زرّ الرجوع، فالعلّة iOS وحدها.
        // 🔴 `translucent` لا `opaque`: الأبناء (الحقول والأزرار) يظلّون
        //    يلتقطون لمساتهم أوّلاً، وهذا يلتقط ما يسقط في الفراغ فقط.
        body: GestureDetector(
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          behavior: HitTestBehavior.translucent,
          child: SafeArea(
          bottom: false,
          child: Center(
            child: SingleChildScrollView(
              // الحشوة السفلية تُبقي آخر المحتوى قابلاً للوصول بالتمرير
              // رغم مروره خلف الشريط.
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 104),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 448),
                child: Column(children: [
                  const _Brand(),
                  const SizedBox(height: 32),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(28),
                    decoration: BoxDecoration(
                      color: const Color(0x80000000),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _line),
                      boxShadow: const [
                        BoxShadow(color: Color(0xCC000000), blurRadius: 40),
                      ],
                    ),
                    child: child,
                  ),
                ]),
              ),
            ),
          ),
          ),
        ),
      );
}

class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) => Column(children: [
        Text('MAFIA',
            style: const TextStyle(
              fontFamily: 'Amiri',
              fontSize: 40,
              fontWeight: FontWeight.w900,
              color: _gold,
              letterSpacing: 0,
              shadows: [Shadow(color: Color(0x668A0303), blurRadius: 30)],
            )),
        // 🔴 أحرف CLUB مفروقةٌ على العرض — تُقسَّم فرادى لا بتباعد حروف
        Directionality(
          textDirection: TextDirection.ltr,
          child: SizedBox(
            width: 150,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final ch in 'CLUB'.split(''))
                  Text(ch,
                      style: const TextStyle(
                        fontFamily: 'Amiri',
                        fontSize: 20,
                        fontWeight: FontWeight.w300,
                        color: _blood,
                        shadows: [
                          Shadow(color: Color(0x4D8A0303), blurRadius: 20)
                        ],
                      )),
              ],
            ),
          ),
        ),
      ]);
}

// ══════════════════════════════════════════════════════
// ✉️ INV-1 — تأكيد الدعوة قبل الانضمام
// ══════════════════════════════════════════════════════
// نقرةُ إشعارٍ قد تقع بالخطأ، وانضمامٌ لم يُقصد يشغل مقعداً ويُربك الليدر.
// واسمُ الداعي جزءٌ من القرار: «دعاك فلان» تُقبَل، و«دعوة» المجهولة تُرفض.
class _InviteConfirmModal extends StatelessWidget {
  const _InviteConfirmModal({
    required this.code,
    required this.inviterName,
    required this.onAccept,
    required this.onDecline,
  });

  final String code;
  final String? inviterName;
  final VoidCallback onAccept, onDecline;

  @override
  Widget build(BuildContext context) {
    final who = (inviterName ?? '').trim();
    return ColoredBox(
      color: const Color(0xE0000000),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Container(
            padding: const EdgeInsets.fromLTRB(22, 24, 22, 18),
            decoration: BoxDecoration(
              color: const Color(0xFF0D0B08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0x59C5A059)),
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('✉️', style: TextStyle(fontSize: 38)),
              const SizedBox(height: 10),
              Text('دعوةٌ إلى غرفة',
                  style: const TextStyle(
                      fontFamily: 'Amiri',
                      fontSize: 21,
                      fontWeight: FontWeight.w900,
                      color: _gold)),
              if (who.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('دعاك $who',
                    style: ar(13, color: const Color(0xFFD8CFC0))),
              ],
              const SizedBox(height: 14),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  color: const Color(0x14C5A059),
                  border: Border.all(color: const Color(0x33C5A059)),
                ),
                child: Text(code,
                    style: mono(22, color: _gold, weight: FontWeight.w900)
                        .copyWith(letterSpacing: 6)),
              ),
              const SizedBox(height: 20),
              Row(children: [
                Expanded(
                  child: GestureDetector(
                    onTap: onDecline,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(11),
                        border: Border.all(color: _line),
                      ),
                      child: Text('ليس الآن',
                          style: ar(13.5, color: const Color(0xFF9A8F7E))),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: GestureDetector(
                    onTap: onAccept,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(11),
                        color: const Color(0x26C5A059),
                        border: Border.all(color: _gold),
                      ),
                      child: Text('انضمّ',
                          style:
                              ar(13.5, color: _gold, weight: FontWeight.w900)),
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

// ══════════════════════════════════════════════════════
// ⚖️ PEN-1 — مودال تنبيه المخالفة
// ══════════════════════════════════════════════════════
// 🔴 لا يُغلق بالنقر على الحاجب: قرارُ عقوبةٍ يجب أن يُقرأ لا أن يُزاح
//    بلمسةٍ عابرة — خصوصاً حين تكون الأخيرة قبل الإقصاء.
class _PenaltyAlertModal extends StatelessWidget {
  const _PenaltyAlertModal({required this.alert, required this.onClose});

  final PenaltyAlert alert;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final ejected = alert.ejected;
    final tint = ejected ? const Color(0xFFF87171) : const Color(0xFFFBBF24);

    return ColoredBox(
      color: const Color(0xE0000000),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Container(
            padding: const EdgeInsets.fromLTRB(22, 24, 22, 18),
            decoration: BoxDecoration(
              color: const Color(0xFF120A0A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: tint.withValues(alpha: 0.55)),
              boxShadow: [
                BoxShadow(
                    color: tint.withValues(alpha: 0.18), blurRadius: 40),
              ],
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(ejected ? '⛔' : '⚠️', style: const TextStyle(fontSize: 40)),
              const SizedBox(height: 10),
              Text(
                ejected ? 'أُقصيت من اللعبة' : 'تنبيه مخالفة القوانين!',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                    color: tint),
              ),
              const SizedBox(height: 10),
              Text(alert.message,
                  textAlign: TextAlign.center,
                  style: ar(13.5, color: const Color(0xFFD8CFC0))),
              const SizedBox(height: 14),

              // عدّاد المخالفات — الرقم أوضح من الجملة وقت الغضب.
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  color: tint.withValues(alpha: 0.12),
                  border: Border.all(color: tint.withValues(alpha: 0.35)),
                ),
                child: Text('${alert.penalties} من ${alert.max}',
                    style: mono(16, color: tint, weight: FontWeight.w900)),
              ),

              // 🔴 المتبقّي يُقال صراحةً وهو أهمّ ما في الشاشة: «واحدةٌ
              //    أخرى وتخرج» يغيّر سلوك اللاعب، والرقم وحده لا يفعل.
              if (!ejected) ...[
                const SizedBox(height: 8),
                Text(
                  alert.remaining <= 1
                      ? 'مخالفةٌ أخرى وتخرج من اللعبة'
                      : 'يتبقّى لك ${alert.remaining} قبل الإقصاء',
                  style: ar(11.5, color: const Color(0xFF9A8F7E)),
                ),
              ],

              const SizedBox(height: 18),
              GestureDetector(
                onTap: onClose,
                behavior: HitTestBehavior.opaque,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(11),
                    color: tint.withValues(alpha: 0.14),
                    border: Border.all(color: tint.withValues(alpha: 0.45)),
                  ),
                  child: Text('فهمت',
                      style: ar(14, color: tint, weight: FontWeight.w900)),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// 🪑 SEAT-1 — بطاقة العودة إلى مقعدٍ محجوز
// ══════════════════════════════════════════════════════
// المقعد يُحجز عشر دقائق بعد الخروج (`HeldSeat.ttl`). من خرج بالخطأ — أو
// أُغلق تطبيقه — يعود بضغطةٍ بدل أن يتذكّر رمز الغرفة ويكتبه.
class _HeldSeatCard extends StatelessWidget {
  const _HeldSeatCard({required this.seat, required this.onTap});

  final HeldSeat seat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // المتبقّي بالدقائق — صفرٌ يعني ثوانيَ أخيرة، فيُعرض «أقلّ من دقيقة».
    final left = HeldSeat.ttl - DateTime.now().difference(seat.exitedAt);
    final mins = left.inMinutes;
    final leftAr = mins <= 0 ? 'أقلّ من دقيقة' : '$mins دقيقة';

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(top: 16),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x14C5A059),
          border: Border.all(color: const Color(0x59C5A059)),
        ),
        child: Row(children: [
          const Text('🪑', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('مقعدك محفوظٌ في غرفة ${seat.roomCode}',
                    style: ar(13, color: _gold, weight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text('يُحرَّر بعد $leftAr — اضغط للعودة',
                    style: ar(11, color: const Color(0xFF9A8F7E))),
              ],
            ),
          ),
          const Icon(Icons.arrow_back_ios_new, size: 14, color: _gold),
        ]),
      ),
    );
  }
}

class _StepHead extends StatelessWidget {
  const _StepHead({
    required this.title,
    required this.sub,
    required this.icon,
    this.subArabic = false,
  });

  final String title, sub;
  final IconData icon;
  final bool subArabic;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 32),
        padding: const EdgeInsets.only(bottom: 24),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x662A2A2A))),
        ),
        child: Column(children: [
          Icon(icon, size: 40, color: _gold.withValues(alpha: 0.8)),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: 0)),
          const SizedBox(height: 6),
          subArabic
              ? Text(sub, style: ar(13, color: const Color(0xFF808080)))
              // لاتينيّ محض — يُلفّ باتجاهه كي لا تنقلب علاماته
              : ltrText(
                  sub,
                  mono(10, color: const Color(0xFF808080))
                      .copyWith(letterSpacing: 2),
                  align: TextAlign.center),
        ]),
      );
}

class _Spinner extends StatelessWidget {
  const _Spinner({required this.label, this.sub});
  final String label;
  final String? sub;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(children: [
          const SizedBox(
            width: 64,
            height: 64,
            child: CircularProgressIndicator(strokeWidth: 3, color: _gold),
          ),
          const SizedBox(height: 20),
          Text(label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: 0)),
          if (sub != null) ...[
            const SizedBox(height: 6),
            Text(sub!, style: ar(13, color: const Color(0xFF808080))),
          ],
        ]),
      );
}

class _PremiumButton extends StatelessWidget {
  const _PremiumButton({
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: enabled ? 1 : 0.5,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              gradient: const LinearGradient(
                colors: [Color(0xFF1A1208), Color(0xFF0C0C0C)],
              ),
              border: Border.all(color: _gold.withValues(alpha: 0.45)),
              boxShadow: [
                BoxShadow(color: _blood.withValues(alpha: 0.18), blurRadius: 18),
              ],
            ),
            child: Center(
              child: ltrText(
                  label,
                  mono(13, color: _gold, weight: FontWeight.bold)
                      .copyWith(letterSpacing: 3)),
            ),
          ),
        ),
      );
}

class _TicketButton extends StatelessWidget {
  const _TicketButton({
    required this.enabled,
    required this.busy,
    required this.onTap,
  });

  final bool enabled, busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: enabled ? null : const Color(0xFF222222),
            gradient: enabled
                ? const LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [Color(0xFF166534), Color(0xFF15803D)])
                : null,
            border: Border.all(
                color: enabled ? const Color(0xFF22C55E) : const Color(0xFF333333),
                width: 2),
            boxShadow: enabled
                ? [
                    const BoxShadow(color: Color(0x6622C55E), blurRadius: 25),
                    const BoxShadow(color: Color(0x2622C55E), blurRadius: 50),
                  ]
                : null,
          ),
          child: Center(
            child: Text(busy ? 'جارٍ التحقق...' : '🎫 تحقق وادخل',
                style: TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                  color: enabled ? Colors.white : const Color(0xFF666666),
                )),
          ),
        ),
      );
}

class _Modal extends StatelessWidget {
  const _Modal({
    required this.title,
    required this.body,
    required this.primary,
    required this.secondary,
    required this.busy,
    required this.onPrimary,
    required this.onSecondary,
  });

  final String title, body, primary, secondary;
  final bool busy;
  final Future<void> Function() onPrimary, onSecondary;

  @override
  Widget build(BuildContext context) => Positioned.fill(
        child: ColoredBox(
          color: const Color(0xCC000000),
          child: Center(
            child: Container(
              margin: const EdgeInsets.all(24),
              padding: const EdgeInsets.all(24),
              constraints: const BoxConstraints(maxWidth: 400),
              decoration: BoxDecoration(
                color: const Color(0xFF0C0C0C),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _gold.withValues(alpha: 0.35)),
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(title,
                    style: const TextStyle(
                        fontFamily: 'Amiri',
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: _gold,
                        letterSpacing: 0)),
                const SizedBox(height: 10),
                Text(body,
                    textAlign: TextAlign.center,
                    style: ar(13, color: Tw.gray300, height: 1.6)),
                const SizedBox(height: 20),
                Row(children: [
                  Expanded(
                    child: _PremiumButton(
                        label: primary,
                        enabled: !busy,
                        onTap: () => unawaited(onPrimary())),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: InkWell(
                      onTap: busy ? null : () => unawaited(onSecondary()),
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          color: const Color(0x0FFFFFFF),
                          border: Border.all(color: const Color(0x1FFFFFFF)),
                        ),
                        child: Center(
                          child: Text(secondary,
                              style: ar(12,
                                  color: Tw.gray400, weight: FontWeight.bold)),
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
