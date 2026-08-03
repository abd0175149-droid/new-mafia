import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api/game_config_service.dart';
import '../../core/cosmetics/cosmetics_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/game.dart';
import '../cosmetics/mafia_card_view.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';
import 'night_view.dart';
import 'roles_info_modal.dart';

// ══════════════════════════════════════════════════════
// 🕰️ شاشة انتظار اللوبي — §4.11 · §4.12 · §4.13 · §4.14 في الملفّ 21
// ══════════════════════════════════════════════════════
// الشرط: مرحلةٌ قبل اللعب **و**`assignedRole == null`. بمجرّد وصول الدور
// تنتقل الواجهة إلى بطاقة الدور القابلة للقلب (الملفّ ٢٢).

const _gold = Color(0xFFC5A059);
const _line = Color(0xFF2A2A2A);

class LobbyView extends StatelessWidget {
  const LobbyView({super.key, required this.controller});

  final GameSessionController controller;

  bool get _waiting =>
      (controller.gamePhase == null ||
          GamePhase.isPreGame(controller.gamePhase)) &&
      controller.assignedRole == null;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final me = c.roster.where((p) => p.physicalId == c.physicalId).firstOrNull;

    return Column(mainAxisSize: MainAxisSize.min, children: [
      _Toolbar(controller: c),
      const SizedBox(height: 12),

      // بانر العقوبات — يظهر عند أوّل مخالفة
      if ((me?.penalties ?? 0) > 0) ...[
        _PenaltyBanner(penalties: me!.penalties, max: 3),
        const SizedBox(height: 12),
      ],

      // 🪑 بانر المقعد — الرقم هو أهمّ ما يحتاجه اللاعب في القاعة
      if (!c.isRemote && c.physicalId > 0) ...[
        _SeatBanner(seat: c.physicalId),
        const SizedBox(height: 12),
      ],

      if (_waiting) _waitingBody(c) else _roleBody(c),

      const SizedBox(height: 12),
      RoomCodeCard(code: c.roomCode),
      const SizedBox(height: 8),
      _SeatsProgress(joined: c.roster.length, max: c.maxPlayers),
    ]);
  }

  Widget _waitingBody(GameSessionController c) => Column(children: [
        const _PulsingShield(),
        const SizedBox(height: 20),
        Text('اكتمل التشفير',
            style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: _gold,
                letterSpacing: 0)),
        const SizedBox(height: 20),
        // 🔒 بطاقة **غطاء غير قابلة للقلب** — لا تكشف شيئاً قبل توزيع الأدوار
        Padding(
          padding: const EdgeInsets.only(top: 22),
          child: MafiaCardView(
            size: CardSize.md,
            playerNumber: c.physicalId,
            playerName: c.displayName.isEmpty ? 'أنت' : c.displayName,
            avatarUrl: SessionStore.instance.player?.avatarUrl,
            cosmetics: CosmeticsService.instance.cosmetics,
            template: GameConfigService.instance.master,
            rankFx: GameConfigService.instance
                .effectsForTier(CosmeticsService.instance.rankTier),
          ),
        ),
        const SizedBox(height: 24),
        Container(width: 64, height: 1, color: _line),
        const SizedBox(height: 20),
        // 🔴 سطرٌ لاتينيّ محض داخل شجرةٍ عربية: النقطة الختامية محايدة
        //    فتأخذ اتجاه الفقرة وتقفز إلى يسار السطر — «.SECURE YOUR DEVICE».
        //    يُلفّ باتجاهه.
        ltrText(
            'SECURE YOUR DEVICE.\nDIRECT ATTENTION TO PRIMARY MONITOR.',
            mono(11, color: _gold).copyWith(letterSpacing: 2, height: 1.7),
            align: TextAlign.center),
        const SizedBox(height: 8),
        ltrText(
            'STATUS ACTIVE. INTERFACE LOCKED.',
            mono(9, color: const Color(0xFF555555)).copyWith(letterSpacing: 2),
            align: TextAlign.center),
      ]);

  /// 🎭 وصل الدور — البطاقة تصير قابلةً للقلب.
  ///
  /// 🔴 القلب هنا **أحاديّ الاتجاه لاصق**: ضغطةٌ تكشف ولا تُخفي. من كشف
  ///    دورَه لا يستطيع إخفاءه بضغطةٍ ثانية — والغرض أن جاره لا يستطيع
  ///    قلبها ذهاباً وإياباً ليرى.
  Widget _roleBody(GameSessionController c) {
    if (c.assignedRole == null) return _phaseBody(c);
    final me = c.roster.where((p) => p.physicalId == c.physicalId).firstOrNull;
    final alive = !c.isPlayerDead && (me?.isAlive ?? true);

    return Column(children: [
      Text(c.isPlayerDead ? 'تم إقصاؤك' : 'تم تعيين مهمتك',
          style: TextStyle(
              fontFamily: 'Amiri',
              fontSize: 24,
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
              color: c.isPlayerDead ? const Color(0xFFF87171) : _gold)),
      const SizedBox(height: 6),
      Text(c.cardFlipped ? _phaseLabel(c.gamePhase) : 'اضغط البطاقة لكشف دورك',
          style: ar(12, color: const Color(0xFF808080))),
      const SizedBox(height: 18),
      Padding(
        padding: const EdgeInsets.only(top: 22),
        child: MafiaCardView(
          // §4.13: بطاقة اللوبي واللعب مقاس `md` — قاعدة معايرة القوالب
          size: CardSize.md,
          role: c.assignedRole,
          flippable: true,
          isFlipped: c.cardFlipped,
          // كشفٌ لاصق: يُضبط ولا يُعكَس
          onFlip: () => c.cardFlipped = true,
          flipDurationMs: 1100,
          isAlive: alive,
          playerNumber: c.physicalId,
          playerName: c.displayName.isEmpty ? 'أنت' : c.displayName,
          avatarUrl: SessionStore.instance.player?.avatarUrl,
          cosmetics: CosmeticsService.instance.cosmetics,
          template: GameConfigService.instance.master,
          rankFx: GameConfigService.instance
              .effectsForTier(CosmeticsService.instance.rankTier),
        ),
      ),
      const SizedBox(height: 20),
    ]);
  }

  /// المراحل بعد اللوبي تصل مع ملفّاتها (٢٣ ← ٢٧). حتى ذلك الحين تُعرض
  /// المرحلة باسمها بدل شاشةٍ فارغة تُوهم اللاعب بعطل.
  Widget _phaseBody(GameSessionController c) => c.gamePhase == GamePhase.night
      ? PassiveNightBody(stepRoleName: c.nightStepRoleName)
      : Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(children: [
          Text(_phaseLabel(c.gamePhase),
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: _gold,
                  letterSpacing: 0)),
          const SizedBox(height: 8),
          Text('انظر إلى الشاشة الرئيسية',
              style: ar(12, color: const Color(0xFF808080))),
        ]),
      );

  static String _phaseLabel(String? p) => switch (p) {
        GamePhase.roleGeneration => 'يجري توزيع الأدوار…',
        GamePhase.roleBinding => 'تثبيت الأدوار…',
        GamePhase.dayDiscussion => 'النقاش',
        GamePhase.dayVoting => 'التصويت',
        GamePhase.dayJustification => 'الدفاع',
        GamePhase.dayTiebreaker => 'كسر التعادل',
        GamePhase.night => 'الليل',
        GamePhase.morningRecap => 'الصباح',
        GamePhase.eliminationPending => 'الإقصاء',
        GamePhase.gameOver => 'انتهت اللعبة',
        _ => 'في الغرفة',
      };
}

// ══════════════════════════════════════════════════════
// §4.12 شريط الأدوات
// ══════════════════════════════════════════════════════
class _Toolbar extends StatelessWidget {
  const _Toolbar({required this.controller});
  final GameSessionController controller;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Builder(
            builder: (ctx) => _chip('🃏 الأدوار', _gold,
                const Color(0xFF2A2A2A), () => unawaited(showRolesInfo(ctx))),
          ),
          if (controller.isRemote && controller.physicalId > 0)
            Text.rich(TextSpan(children: [
              const TextSpan(text: 'مقعدك '),
              TextSpan(
                  text: '#${controller.physicalId}',
                  style: mono(13, color: _gold, weight: FontWeight.w900)),
            ]), style: mono(11, color: const Color(0xFF808080))),
          _chip('🚪 خروج', const Color(0xFFF87171), const Color(0x40EF4444),
              () => unawaited(controller.logout())),
        ],
      );

  Widget _chip(String label, Color fg, Color border, VoidCallback onTap) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: const Color(0x66000000),
            border: Border.all(color: border),
          ),
          child: Text(label, style: ar(11, color: fg, weight: FontWeight.bold)),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.11 بانر المقعد
// ══════════════════════════════════════════════════════
class _SeatBanner extends StatelessWidget {
  const _SeatBanner({required this.seat});
  final int seat;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [Color(0x26C5A059), Color(0x08C5A059)],
          ),
          border: Border.all(color: const Color(0x66C5A059), width: 2),
          boxShadow: const [BoxShadow(color: Color(0x1AC5A059), blurRadius: 30)],
        ),
        child: Column(children: [
          Text('🪑 مقعدك رقم',
              style: ar(12, color: const Color(0xFF808080))),
          Text('$seat',
              style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 46,
                fontWeight: FontWeight.w900,
                color: _gold,
                height: 1.1,
                letterSpacing: 0,
                shadows: [Shadow(color: Color(0x66C5A059), blurRadius: 20)],
              )),
          Text('يرجى الجلوس في مقعدك',
              style: ar(12, color: const Color(0xB3C5A059))),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// §4.13 بانر العقوبات
// ══════════════════════════════════════════════════════
class _PenaltyBanner extends StatelessWidget {
  const _PenaltyBanner({required this.penalties, this.max = 3});
  final int penalties, max;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x33450A0A),
          border: Border.all(color: const Color(0x4D7F1D1D)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('ACTIVE RULE VIOLATIONS',
              style: mono(10, color: const Color(0xFFF87171))
                  .copyWith(letterSpacing: 2)),
          const SizedBox(height: 8),
          Row(children: [
            for (var i = 0; i < max; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < penalties
                      ? const Color(0xFFDC2626)
                      : const Color(0xFF262626),
                  border: i < penalties
                      ? null
                      : Border.all(color: const Color(0xFF404040)),
                  boxShadow: i < penalties
                      ? const [BoxShadow(color: Color(0xFFDC2626), blurRadius: 8)]
                      : null,
                ),
              ),
            ],
          ]),
          const SizedBox(height: 8),
          Text('تحذير: ($penalties/$max) عقوبات. سيتم طردك عند تجاوز الحد.',
              style: ar(10, color: const Color(0xB3FCA5A5))),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// §4.14 بطاقة رمز الغرفة
// ══════════════════════════════════════════════════════
class RoomCodeCard extends StatefulWidget {
  const RoomCodeCard({super.key, required this.code});
  final String code;

  @override
  State<RoomCodeCard> createState() => _RoomCodeCardState();
}

class _RoomCodeCardState extends State<RoomCodeCard> {
  bool _copied = false;
  Timer? _t;

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  void _copy() {
    Clipboard.setData(ClipboardData(text: widget.code));
    setState(() => _copied = true);
    _t?.cancel();
    _t = Timer(const Duration(seconds: 2),
        () => mounted ? setState(() => _copied = false) : null);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.code.isEmpty) return const SizedBox.shrink();
    return InkWell(
      onTap: _copy,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x0DC5A059),
          border: Border.all(color: const Color(0x66C5A059)),
        ),
        child: Column(children: [
          Text(_copied ? '✓ تم النسخ' : 'رمز الغرفة — اضغط للنسخ',
              style: ar(10, color: const Color(0xFF9A9A9A))),
          // 🔴 جزيرة LTR: الرمز أرقامٌ لاتينية لا تُقلَب مع الفقرة العربية
          Directionality(
            textDirection: TextDirection.ltr,
            child: Text(widget.code,
                style: mono(28, color: _gold, weight: FontWeight.w900)
                    .copyWith(letterSpacing: 8)),
          ),
        ]),
      ),
    );
  }
}

class _SeatsProgress extends StatelessWidget {
  const _SeatsProgress({required this.joined, required this.max});
  final int joined, max;

  @override
  Widget build(BuildContext context) {
    final total = max > 0 ? max : (joined > 0 ? joined : 1);
    final f = (joined / total).clamp(0.0, 1.0);
    return Column(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: SizedBox(
          height: 6,
          child: Stack(children: [
            const Positioned.fill(child: ColoredBox(color: Color(0xFF1A1A1A))),
            // ⚠️ `heightFactor: 1` إلزاميّ — بلا طفلٍ ذي ارتفاع يصير صفراً
            FractionallySizedBox(
              alignment: AlignmentDirectional.centerStart,
              widthFactor: f,
              heightFactor: 1,
              child: const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                      colors: [Color(0xFFC5A059), Color(0xFFE8C97A)]),
                ),
              ),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 6),
      Text('انضمّ $joined من $max',
          style: mono(10, color: const Color(0xFF808080))),
    ]);
  }
}

/// درعٌ ينبض — شفافية ٠٫٥⇄١ بمدّة ٣ث بلا نهاية.
class _PulsingShield extends StatefulWidget {
  const _PulsingShield();

  @override
  State<_PulsingShield> createState() => _PulsingShieldState();
}

class _PulsingShieldState extends State<_PulsingShield>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 3),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _c.stop();
      _c.value = 1;
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, __) {
          final p = _c.value;
          final tri = p < 0.5 ? p * 2 : (1 - p) * 2;
          return Opacity(
            opacity: 0.5 + 0.5 * tri,
            child: const Icon(Icons.verified_user_outlined,
                size: 56, color: _gold),
          );
        },
      );
}
