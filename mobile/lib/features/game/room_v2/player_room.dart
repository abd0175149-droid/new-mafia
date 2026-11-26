import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/api/game_config_service.dart';
import '../../../core/api/roles_guide_service.dart';
import '../../../core/cosmetics/cosmetics_service.dart';
import '../../../core/security/secret_watermark.dart';
import '../../../core/storage/session_store.dart';
import '../../../models/game.dart';
import '../../cosmetics/mafia_card_view.dart';
import '../../profile/profile_palette.dart';
import '../confrontation_view.dart';
import '../deals_sheet.dart';
import 'prophecy_tasks.dart';
import '../discussion_view.dart';
import '../game_session_controller.dart';
import '../justification_view.dart';
import '../morning_gameover_view.dart';
import '../my_tasks_sheet.dart' show showMyTasks;
import '../notepad_sheet.dart';
import '../roles_deck_sheet.dart';
import '../voting_view.dart';
import '../../guide/guide_targets.dart';
import 'hold_reveal.dart';
import 'room_bus.dart';

// ══════════════════════════════════════════════════════
// 📱 شاشة اللاعب الجديدة داخل الغرفة — مطابقةٌ لـ PlayerRoom.tsx في الويب (2026-11-22)
//   • كلّ شاشةٍ متطابقة لكلّ الأدوار — ما يخصّ الدور لا يُبنى إلّا تحت الضغط المطوّل.
//   • شريطٌ سفليّ واحد: زرّ المنتصف «اللعبة» يفتح الأدوات (RoomBus).
//   • الليل: قائمة الأرقام كلّها للجميع وأنت بينهم؛ لمسُ غير المسموح لا يفعل شيئاً،
//     و«تخطٍّ — لا أحد» ظاهرٌ للجميع ويعمل للقنّاص وحده.
//   • الصباح: «رسالة الليل» للجميع — الشريف يجد نتيجته داخلها.
//   • لا شيء عن الإسكات ولا خيار العمدة على الهاتف، ولا تصويت تلقائيّ.
// ══════════════════════════════════════════════════════

const _gold = Color(0xFFC5A059);
const _ink2 = Color(0xFFCDC3AF);
const _muted = Color(0xFF8D8271);
const _panel = Color(0xFF0C0C0C);

const _phaseT = <String, String>{
  'LOBBY': 'بانتظار اللعبة', 'ROLE_GENERATION': 'تجهيز الأدوار', 'ROLE_BINDING': 'كشف الدور', 'NIGHT': 'الليل', 'MORNING_RECAP': 'الصباح',
  'DAY_DISCUSSION': 'النقاش', 'DAY_VOTING': 'التصويت', 'DAY_JUSTIFICATION': 'التبرير', 'DAY_TIEBREAKER': 'تعادل',
  'ELIMINATION_PENDING': 'قرار الموجّه', 'DAY_ELIMINATION': 'قرار الموجّه', 'GAME_OVER': 'انتهت اللعبة',
};
const _teamAr = <String, String>{'MAFIA': 'فريق المافيا', 'CITIZEN': 'فريق المواطنين', 'NEUTRAL': 'مستقلّ'};
const _teamC = <String, Color>{'MAFIA': Color(0xFFD9636A), 'CITIZEN': Color(0xFF5DB98C), 'NEUTRAL': Color(0xFFD7A73F)};
const _phaseNoteKey = <String, String>{'NIGHT': 'night', 'MORNING_RECAP': 'discussion', 'DAY_DISCUSSION': 'discussion', 'DAY_VOTING': 'voting', 'DAY_TIEBREAKER': 'voting', 'DAY_JUSTIFICATION': 'justification'};
const _phaseNoteAr = <String, String>{'night': '🌙 الليل', 'discussion': '💬 النقاش', 'voting': '🗳️ التصويت', 'justification': '⚖️ التبرير'};

String mmss(int s) { if (s < 0) s = 0; return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}'; }

/// الواجهة الجديدة مفعّلةٌ لهذه الغرفة؟ (المفتاح + حضوريّ + داخل الغرفة)
bool roomV2Active(GameSessionController c) =>
    PlayerUiFlag.enabled.value && !c.isRemote && (c.step == GameStep.done || c.step == GameStep.rejoined);

String _watermark(GameSessionController c) {
  final now = TimeOfDay.now();
  return '${c.displayName.isEmpty ? 'لاعب' : c.displayName} · مقعد ${c.physicalId} · ${c.roomCode} · ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
}

class PlayerRoomV2 extends StatefulWidget {
  const PlayerRoomV2({super.key, required this.controller, required this.openGallery, required this.openOrder, this.cartCount = 0, this.topSlot, this.openNotes, this.voteHint});
  final GameSessionController controller;
  final VoidCallback openGallery;
  final VoidCallback openOrder;
  final int cartCount;
  /// 🕴️ غرفة التدريب وحدها: نافذة القاعة تحت الشريط العلويّ، وبديل المفكّرة، وهمسة التصويت
  final Widget? topSlot;
  final VoidCallback? openNotes;
  final Widget? voteHint;
  @override
  State<PlayerRoomV2> createState() => _PlayerRoomV2State();
}

class _PlayerRoomV2State extends State<PlayerRoomV2> {
  Timer? _tick;
  String? _timingKey;
  DateTime? _endsAt;
  int _total = 0;
  GameSessionController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    c.uiV2 = true;
    RoomBus.setHubOpener(() => openRoomHub(context, c, openGallery: widget.openGallery, openOrder: widget.openOrder, cartCount: widget.cartCount, openNotes: widget.openNotes));
    _tick = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted) { _syncBus(); setState(() {}); } });
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncBus());
  }

  @override
  void didUpdateWidget(covariant PlayerRoomV2 old) {
    super.didUpdateWidget(old);
    RoomBus.setHubOpener(() => openRoomHub(context, c, openGallery: widget.openGallery, openOrder: widget.openOrder, cartCount: widget.cartCount, openNotes: widget.openNotes));
  }

  @override
  void dispose() {
    _tick?.cancel();
    c.uiV2 = false;
    RoomBus.clear();
    super.dispose();
  }

  /// وقت المرحلة للحلقة حول زرّ «اللعبة»: التصويت والليل — كالويب
  ({String k, int secs})? _timing() {
    final ph = c.gamePhase;
    if (ph == GamePhase.dayVoting && c.votingCountdown != null) return (k: 'vote', secs: c.votingCountdown!);
    final one = c.oneNight;
    if (ph == GamePhase.night && one != null && one.hasChoice && one.deadline != null) return (k: 'one:${one.deadline!.millisecondsSinceEpoch}', secs: one.remainingSeconds());
    if (ph == GamePhase.night && c.nightAction != null) return (k: 'auto:${c.nightAction!.actionType}', secs: c.nightCountdown);
    return null;
  }

  void _syncBus() {
    final t = _timing();
    if (t == null) { _timingKey = null; _endsAt = null; RoomBus.set(RoomBusState(active: true, cart: widget.cartCount)); return; }
    if (_timingKey != t.k) { _timingKey = t.k; _endsAt = DateTime.now().add(Duration(seconds: t.secs)); _total = t.secs < 1 ? 1 : t.secs; }
    RoomBus.set(RoomBusState(active: true, endsAt: _endsAt, totalSec: _total, cart: widget.cartCount));
  }

  @override
  Widget build(BuildContext context) {
    final ph = c.gamePhase ?? GamePhase.lobby;
    final t = _timing();
    final meta = [
      if (c.round > 0 && ph != GamePhase.lobby) 'الجولة ${c.round}',
      if (c.gameName.isNotEmpty) c.gameName,
      if (c.roomCode.isNotEmpty) 'غرفة ${c.roomCode}',
    ].join(' · ');
    final mafia = c.teamMafia, cit = c.teamCitizens, neu = c.teamNeutrals;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        // ── الشريط العلويّ: المقعد، المرحلة، الوقت ──
        GuideTarget(id: 'room-top', child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: const BoxDecoration(color: _panel, border: Border(bottom: BorderSide(color: Color(0x33C5A059)))),
          child: Row(children: [
            Container(
              width: 52, padding: const EdgeInsets.symmetric(vertical: 4),
              decoration: BoxDecoration(border: Border.all(color: const Color(0x80C5A059)), borderRadius: BorderRadius.circular(3)),
              child: Column(children: [
                Text('مقعد', style: ar(10, color: _muted)),
                Text('${c.physicalId}', style: mono(20, color: _gold).copyWith(fontWeight: FontWeight.w900)),
              ]),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_phaseT[ph] ?? 'اللعبة', style: const TextStyle(fontFamily: 'Amiri', fontSize: 19, fontWeight: FontWeight.w700, color: Colors.white)),
                if (meta.isNotEmpty) Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(11, color: _muted)),
              ]),
            ),
            if (t != null)
              Text(mmss(t.secs), style: mono(18, color: t.secs <= 10 ? const Color(0xFFEF4444) : _gold).copyWith(fontWeight: FontWeight.w900)),
          ]),
        )),
        const SizedBox(height: 10),
        if (widget.topSlot != null) ...[widget.topSlot!, const SizedBox(height: 10)],
        // ── الأحياء بالفرق ──
        if (ph != GamePhase.lobby && ((mafia ?? 0) + (cit ?? 0)) > 0)
          GuideTarget(id: 'room-teams', child: Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _teamPill(const Color(0xFFEF4444), mafia ?? 0, 'مافيا'),
              const SizedBox(width: 14),
              _teamPill(const Color(0xFF60A5FA), cit ?? 0, 'مواطنون'),
              if ((neu ?? 0) > 0) ...[const SizedBox(width: 14), _teamPill(const Color(0xFFA78BFA), neu!, 'مستقلّ')],
            ]),
          )),
        if (c.isPlayerDead && ph != GamePhase.gameOver)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: const Color(0x1A8A0303), border: Border.all(color: const Color(0x668A0303)), borderRadius: BorderRadius.circular(3)),
            child: Text('أنت خارج اللعبة — تابع بصمت، ولا تكشف شيئاً لمن بقي.', textAlign: TextAlign.center, style: ar(13, color: const Color(0xFFF1B5B5))),
          ),
        _body(ph),
      ]),
    );
  }

  Widget _teamPill(Color col, int n, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: col, shape: BoxShape.circle)),
        const SizedBox(width: 5),
        Text('$n', style: mono(14, color: Colors.white).copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(width: 4),
        Text(label, style: ar(12, color: _ink2)),
      ]);

  Widget _hero({required IconData icon, required String title, required String text, Widget? child}) => Container(
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 22),
        decoration: BoxDecoration(color: _panel, border: Border.all(color: const Color(0x33C5A059)), borderRadius: BorderRadius.circular(4)),
        child: Column(children: [
          Icon(icon, size: 34, color: _gold),
          const SizedBox(height: 10),
          Text(title, textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'Amiri', fontSize: 24, fontWeight: FontWeight.w700, color: _gold)),
          const SizedBox(height: 6),
          Text(text, textAlign: TextAlign.center, style: ar(13.5, color: _ink2)),
          if (child != null) ...[const SizedBox(height: 16), child],
        ]),
      );

  Widget _body(String ph) {
    final alive = !c.isPlayerDead;
    switch (ph) {
      case GamePhase.lobby:
      case GamePhase.roleGeneration:
      case GamePhase.roleBinding:
        final has = c.assignedRole != null;
        return _hero(
          icon: has ? Icons.style_outlined : Icons.shield_outlined,
          title: has ? 'تم تعيين مهمّتك' : ph == GamePhase.roleGeneration ? 'جاري تجهيز الأدوار' : 'اكتمل التشفير',
          text: has ? 'غطِّ الشاشة بكفّك واضغط البطاقة مطوّلاً فتنقلب — والمسها مرّةً لتعيدها.' : 'ضع هاتفك أمامك وتابع شاشة القاعة — يوزّع الليدر الأدوار بعد قليل.',
          child: GuideTarget(id: 'room-card', child: PeekCardV2(controller: c)),
        );
      case GamePhase.night:
        return _hero(icon: Icons.nightlight_outlined, title: 'الليل يسدل ستاره',
            text: alive ? 'أغمض عينيك عن غيرك — اختيارك يظهر على الشاشة.' : 'تابع بصمت — لا تكشف شيئاً لمن بقي.');
      case GamePhase.morningRecap:
        final res = c.sheriffResults;
        final last = res.isEmpty ? null : res.last;
        final mine = last != null && (c.round <= 0 || last.round >= c.round - 1) ? last : null;
        return _hero(
          icon: Icons.wb_sunny_outlined, title: 'الصباح يطلّ', text: 'تُكشف أحداث الليلة على شاشة القاعة — تابِعْ معها.',
          child: HoldRevealButton(
            title: '📨 رسالة الليل', hint: 'وصلت كلَّ الهواتف معاً — اضغط مطوّلاً وغطِّ بكفّك', panelTitle: '📨 رسالة الليل', watermark: _watermark(c), guideId: 'night-msg',
            onShow: c.enterSecretScreen, onHide: c.leaveSecretScreen,
            builder: (_) => mine != null
                ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('نتيجة تحقيقك', style: ar(12, color: _muted)),
                    const SizedBox(height: 6),
                    Text('#${mine.targetPhysicalId} ${mine.targetName}', style: ar(17, color: Colors.white, weight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(mine.isMafia ? 'مافيا 🔴' : 'ليس مافيا 🔵', style: ar(20, color: mine.isMafia ? const Color(0xFFF87171) : const Color(0xFF4ADE80), weight: FontWeight.bold)),
                  ])
                : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('رسالة الليل', style: ar(12, color: _muted)),
                    const SizedBox(height: 6),
                    Text('لا جديد لك هذا الصباح.', style: ar(15, color: _ink2)),
                  ]),
          ),
        );
      case GamePhase.dayVoting:
        return VoteGridV2(controller: c, hint: widget.voteHint);
      case GamePhase.dayDiscussion:
        return Column(children: [
          DiscussionBody(controller: c, v2: true),
          if (alive) ...[const SizedBox(height: 20), ConfrontationPanel(controller: c), GuideTarget(id: 'deals-btn', child: DealsButton(controller: c))],
        ]);
      case GamePhase.dayJustification:
        return JustificationBody(controller: c);
      case GamePhase.dayTiebreaker:
        return c.tiedCandidates.isNotEmpty ? TiebreakerBody(tied: c.tiedCandidates) : _pending(ph);
      case GamePhase.eliminationPending:
        return c.eliminated.isNotEmpty
            ? EliminationBody(eliminated: c.eliminated, revealedRoles: c.revealedRoles, myPhysicalId: c.physicalId, names: {for (final p in c.roster) p.physicalId: p.name}, showFace: true)
            : _pending(ph);
      case GamePhase.gameOver:
        return c.gameOverData != null ? GameOverBody(controller: c) : _pending(ph);
      default:
        return _pending(ph);
    }
  }

  Widget _pending(String ph) => _hero(icon: Icons.hourglass_empty, title: _phaseT[ph] ?? 'اللعبة', text: 'انظر إلى الشاشة الرئيسية');
}

// ══ 🎴 الكرت بالضغط المطوّل — يُقلب ويبقى، ولمسةٌ تعيده، ويعود وحده بعد ١٥ ثانية ══
class PeekCardV2 extends StatefulWidget {
  const PeekCardV2({super.key, required this.controller});
  final GameSessionController controller;
  @override
  State<PeekCardV2> createState() => _PeekCardV2State();
}

class _PeekCardV2State extends State<PeekCardV2> with WidgetsBindingObserver {
  bool _open = false;
  Timer? _auto;
  GameSessionController get c => widget.controller;

  @override
  void initState() { super.initState(); WidgetsBinding.instance.addObserver(this); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) { if (s != AppLifecycleState.resumed) _close(); }
  @override
  void dispose() { _auto?.cancel(); if (_open) c.leaveSecretScreen(); WidgetsBinding.instance.removeObserver(this); super.dispose(); }

  void _openCard() {
    if (_open || c.assignedRole == null) return;
    c.enterSecretScreen();
    if (!c.cardFlipped) c.cardFlipped = true;   // الليدر يعرف من كشف دوره
    setState(() => _open = true);
    _auto?.cancel();
    _auto = Timer(const Duration(seconds: 15), _close);
  }
  void _close() {
    _auto?.cancel();
    if (!_open) return;
    c.leaveSecretScreen();
    if (mounted) setState(() => _open = false);
  }

  @override
  Widget build(BuildContext context) {
    final peekable = c.assignedRole != null;
    final card = MafiaCardView(
      size: CardSize.md,
      // الدور لا يُمرَّر للكرت إلّا وهو مقلوب — لا دور في الشجرة قبل الضغط
      role: _open ? c.assignedRole : null,
      flippable: false,
      isFlipped: peekable && _open,
      flipDurationMs: 550,
      playerNumber: c.physicalId,
      playerName: c.displayName.isEmpty ? 'أنت' : c.displayName,
      avatarUrl: SessionStore.instance.player?.avatarUrl,
      cosmetics: CosmeticsService.instance.cosmetics,
      template: GameConfigService.instance.master,
      rankFx: GameConfigService.instance.effectsForTier(CosmeticsService.instance.rankTier),
    );
    if (!peekable) return card;
    return _open
        ? GuideTarget(id: 'room-card-open', child: GestureDetector(onTap: _close, child: SecretWatermark(label: _watermark(c), opacity: 0.08, child: card)))
        : LongHold(onOpen: _openCard, child: card);
  }
}

// ══ 🌙 الليل — شاشةٌ واحدة للجميع (طبقةٌ فوق الغرفة) ══
class NightAskV2 extends StatefulWidget {
  const NightAskV2({super.key, required this.controller, required this.openTasks, this.hint});
  final GameSessionController controller;
  final VoidCallback openTasks;
  /// 🕴️ همسة التدريب بين السؤال والقائمة — في غرفة التدريب وحدها
  final Widget? hint;
  @override
  State<NightAskV2> createState() => _NightAskV2State();
}

class _NightAskV2State extends State<NightAskV2> {
  int _stepI = 0;
  final List<int?> _picks = [];
  int? _pick;
  bool _busy = false;
  String? _key;
  Timer? _tick;
  GameSessionController get c => widget.controller;

  @override
  void initState() { super.initState(); _tick = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted) setState(() {}); }); }
  @override
  void dispose() { _tick?.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    if (c.gamePhase != GamePhase.night || c.isPlayerDead) return const SizedBox.shrink();
    final one = c.oneNight;
    final mode = one != null && one.hasChoice ? 'one' : c.nightAction != null ? 'auto' : null;
    if (mode == null) return const SizedBox.shrink();
    final key = mode == 'one' ? 'one:${one!.signature}' : 'auto:${c.nightAction!.actionType}:${c.nightAction!.timeoutSeconds}';
    if (key != _key) { _key = key; _stepI = 0; _picks.clear(); _pick = null; _busy = false; }
    final sent = mode == 'one' ? c.oneNightSent : c.nightSubmitted;
    final secs = mode == 'one' ? one!.remainingSeconds() : c.nightCountdown;
    final step = mode == 'one' ? one!.steps[_stepI.clamp(0, one.steps.length - 1)] : null;
    final seat = c.physicalId;
    // ما يُفعَّل: قائمة الخادم لقدرتك وحدها — وهي التي تقرّر هل نفسُك هدفٌ مسموح
    final allowed = <int>{for (final t in (mode == 'one' ? step!.targets : c.nightAction!.availableTargets)) t.physicalId};
    if (mode == 'auto' && c.nightAction!.isDecoy) allowed.remove(seat);
    // القائمة نفسها للجميع: كلّ الأحياء وأنت بينهم
    final listed = <({int pid, String name, String? av})>[
      for (final p in c.roster.where((p) => p.isAlive)) (pid: p.physicalId, name: p.name, av: p.avatarUrl),
    ];
    if (seat > 0 && !listed.any((p) => p.pid == seat)) listed.add((pid: seat, name: c.displayName, av: SessionStore.instance.player?.avatarUrl));
    listed.sort((a, b) => a.pid.compareTo(b.pid));
    final canSkip = c.assignedRole == 'SNIPER' && (mode == 'one' ? step!.canSkip : (c.nightAction!.canSkip && !c.nightAction!.isDecoy));

    Future<void> confirm(int? target) async {
      if (_busy) return;
      if (mode == 'auto') { await c.submitNightAction(target); return; }
      final steps = one!.steps;
      while (_picks.length <= _stepI) { _picks.add(null); }
      _picks[_stepI] = target;
      if (_stepI < steps.length - 1) { setState(() { _stepI++; _pick = null; }); return; }
      setState(() => _busy = true);
      final ok = await c.submitOneNight([for (var i = 0; i < steps.length; i++) (abilityId: steps[i].abilityId, targetPhysicalId: i < _picks.length ? _picks[i] : null)]);
      if (!ok && mounted) setState(() => _busy = false);
    }

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Material(
        color: const Color(0xF2050505),
        child: SafeArea(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: Row(children: [
                const Text('🌙', style: TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(child: Text('الليل${c.round > 0 ? ' · الجولة ${c.round}' : ''}', style: ar(15, color: _gold, weight: FontWeight.bold))),
                Text(mmss(secs), style: mono(16, color: secs <= 10 ? const Color(0xFFEF4444) : _gold).copyWith(fontWeight: FontWeight.w900)),
              ]),
            ),
            Expanded(
              child: sent
                  ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Text('🌙', style: TextStyle(fontSize: 56)),
                      const SizedBox(height: 10),
                      Text('وصل اختيارُك', style: ar(20, color: Colors.white, weight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text('انتظرِ الصباح — لا شيءَ عليك الآن.', style: ar(13, color: _muted)),
                    ])
                  : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('اختيارُك الليلة', style: const TextStyle(fontFamily: 'Amiri', fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white)),
                          Text('اختر لاعباً ثمّ أكّد. ما يعنيه اختيارك يعرفه دورك وحدك — راجعه في «📋 مهامّي».', style: ar(12.5, color: _muted)),
                        ]),
                      ),
                      if (widget.hint != null) widget.hint!,
                      const SizedBox(height: 10),
                      Expanded(
                        child: ListView(padding: const EdgeInsets.symmetric(horizontal: 14), children: [
                          for (final p in listed)
                            GestureDetector(
                              onTap: () { if (allowed.contains(p.pid)) setState(() => _pick = p.pid); },
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 6),
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                decoration: BoxDecoration(
                                  color: _pick == p.pid ? const Color(0x268A0303) : _panel,
                                  border: Border.all(color: _pick == p.pid ? const Color(0xFFC5A059) : const Color(0x26FFFFFF)),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: Row(children: [
                                  _Avatar(pid: p.pid, url: p.av),
                                  const SizedBox(width: 10),
                                  Expanded(child: Text('${p.name}${p.pid == seat ? ' · أنت' : ''}', style: ar(15, color: Colors.white))),
                                  Text('#${p.pid}', style: mono(13, color: _muted)),
                                  SizedBox(width: 22, child: Text(_pick == p.pid ? '✓' : '', textAlign: TextAlign.center, style: ar(16, color: _gold, weight: FontWeight.bold))),
                                ]),
                              ),
                            ),
                        ]),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 8, 14, 6),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          SizedBox(
                            height: 52,
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF8A0303), disabledBackgroundColor: const Color(0xFF2A1A1A),
                                  foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3))),
                              onPressed: _pick == null || _busy ? null : () => confirm(_pick),
                              child: Text(_pick == null ? 'اختر لاعباً' : 'تأكيدُ الاختيار', style: ar(16, color: Colors.white, weight: FontWeight.bold)),
                            ),
                          ),
                          // ظاهرٌ للجميع، ويعمل للقنّاص وحده — إظهارُه له وحده يكشفه لجاره
                          TextButton(onPressed: () { if (canSkip) confirm(null); }, child: Text('تخطٍّ — لا أحد', style: ar(14, color: _ink2))),
                          Text('اختيارٌ واحدٌ في الليلة — ثمّ انتظرِ الصباح.', textAlign: TextAlign.center, style: ar(11.5, color: _muted)),
                        ]),
                      ),
                    ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
              child: Row(children: [
                Expanded(child: OutlinedButton(style: _outline(), onPressed: () => _openRolesInPlay(context, c), child: Text('🃏 الأدوار', style: ar(13, color: _gold)))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton(style: _outline(), onPressed: widget.openTasks, child: Text('📋 مهامّي', style: ar(13, color: _gold)))),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

ButtonStyle _outline() => OutlinedButton.styleFrom(side: const BorderSide(color: Color(0x80C5A059)), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)), padding: const EdgeInsets.symmetric(vertical: 12));

class _Avatar extends StatelessWidget {
  const _Avatar({required this.pid, this.url, this.size = 40});
  final int pid;
  final String? url;
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: size, height: size,
        child: Stack(children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: Container(
              width: size, height: size, color: const Color(0xFF1A1A1A), alignment: Alignment.center,
              child: url != null && url!.isNotEmpty
                  ? Image.network(url!, width: size, height: size, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Text('#$pid', style: ar(12, color: _gold, weight: FontWeight.w900)))
                  : Text('#$pid', style: ar(12, color: _gold, weight: FontWeight.w900)),
            ),
          ),
          Positioned(
            left: 0, bottom: 0,
            child: Container(padding: const EdgeInsets.symmetric(horizontal: 3), color: Colors.black, child: Text('$pid', style: mono(10, color: _gold))),
          ),
        ]),
      );
}

Future<void> _openRolesInPlay(BuildContext ctx, GameSessionController c) async {
  final ids = await c.rolesInPlayIds();
  if (!ctx.mounted) return;
  await showRolesDeck(ctx, roleIds: ids);
}

// ══ 🗳️ التصويت — شبكةٌ من عمودين، اللمسة تصوّت والتغيير حتّى الإغلاق ══
class VoteGridV2 extends StatefulWidget {
  const VoteGridV2({super.key, required this.controller, this.hint});
  final GameSessionController controller;
  final Widget? hint;
  @override
  State<VoteGridV2> createState() => _VoteGridV2State();
}

class _VoteGridV2State extends State<VoteGridV2> {
  String? _err;
  int? _sending;
  GameSessionController get c => widget.controller;

  Future<void> _vote(int i, int? myVote) async {
    if (c.isPlayerDead || _sending != null || myVote == i) return;
    setState(() { _err = null; _sending = i; });
    final r = await c.castVoteV2(i);
    if (mounted) setState(() { _sending = null; _err = r; });
  }

  @override
  Widget build(BuildContext context) {
    final v = c.voting;
    final cands = v?.candidates ?? const <VoteCandidate>[];
    final seat = c.physicalId;
    // الصوت المعتمد هو ما يحمله الخادم — المحلّيّ يُفقد بعد إعادة الاتصال
    final srv = v?.playerVotes[seat];
    final myVote = srv ?? c.myVote;
    final cd = c.votingCountdown;
    final timeUp = cd != null && cd <= 0;
    var top = 1;
    for (final x in cands) { if (x.votes > top) top = x.votes; }
    final status = c.isPlayerDead ? 'مشاهدة فقط — أنت مُقصى'
        : _sending != null ? 'يُرسَل صوتك…'
        : timeUp ? (myVote != null ? 'انتهى الوقت — صوتك محسوب' : 'انتهى الوقت — صوّت الآن قبل أن يحسم الليدر')
        : myVote != null ? 'صوتك مُرسَل · تغيّره حتّى يُغلق التصويت' : 'المس من تشكّ فيه — والتغيير مسموح حتّى الإغلاق';
    RosterPlayer? info(int pid) => (v?.playersInfo ?? const <RosterPlayer>[]).where((p) => p.physicalId == pid).firstOrNull ?? c.roster.where((p) => p.physicalId == pid).firstOrNull;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: _panel, border: Border.all(color: const Color(0x33C5A059)), borderRadius: BorderRadius.circular(4)),
        child: Column(children: [
          const Icon(Icons.how_to_vote_outlined, size: 32, color: _gold),
          const SizedBox(height: 6),
          const Text('من تُقصي؟', style: TextStyle(fontFamily: 'Amiri', fontSize: 24, fontWeight: FontWeight.w700, color: _gold)),
          Text(status, textAlign: TextAlign.center, style: ar(13, color: _ink2)),
          if (cd != null && !timeUp) Text(mmss(cd), style: mono(18, color: cd <= 10 ? const Color(0xFFEF4444) : _gold).copyWith(fontWeight: FontWeight.w900)),
          if (_err != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('⚠️ $_err', style: ar(13, color: const Color(0xFFF87171)))),
        ]),
      ),
      const SizedBox(height: 10),
      if (widget.hint != null) ...[widget.hint!, const SizedBox(height: 10)],
      // عمودان والخليّة تطول مع محتواها (كشبكة الويب) — بارتفاعٍ ثابت كانت أرقام
      // المصوّتين تفيض حين يجتمعون على مرشّحٍ واحد
      _TwoCols(
        children: [
          for (var i = 0; i < cands.length; i++) () {
            final x = cands[i];
            final pid = x.targetPhysicalId;
            final p = info(pid);
            final self = pid == seat;
            final voters = [for (final e in (v?.playerVotes.entries ?? const <MapEntry<int, int>>[])) if (e.value == i) e.key]..sort();
            final mine = myVote == i;
            return GestureDetector(
              onTap: () { if (self) { setState(() => _err = 'لا يمكنك التصويت لنفسك'); return; } if (!c.voteSubmitting) _vote(i, myVote); },
              child: Opacity(
                opacity: c.isPlayerDead || self ? 0.55 : 1,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: mine ? const Color(0x268A0303) : _panel,
                    border: Border.all(color: mine ? _gold : const Color(0x26FFFFFF), width: mine ? 1.5 : 1),
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Column(children: [
                    _Avatar(pid: pid, url: p?.avatarUrl ?? x.avatarUrl, size: 54),
                    const SizedBox(height: 6),
                    Text(p?.name ?? (x.name.isNotEmpty ? x.name : 'لاعب #$pid'), maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(14, color: Colors.white, weight: FontWeight.bold)),
                    if (x.type == 'DEAL') Text((x.id ?? '').startsWith('prophecy-') ? '📜 صفقة النبوءة' : '🤝 ديل من #${x.initiatorPhysicalId ?? ''}', style: ar(11, color: const Color(0xFFD9C79A))),
                    const SizedBox(height: 4),
                    ClipRRect(borderRadius: BorderRadius.circular(2), child: LinearProgressIndicator(value: x.votes / top, minHeight: 4, backgroundColor: const Color(0xFF1F1C18), valueColor: const AlwaysStoppedAnimation(Color(0xFF8A0303)))),
                    const SizedBox(height: 3),
                    Text('${x.votes} صوت', style: ar(11.5, color: _ink2)),
                    if (voters.isNotEmpty)
                      Wrap(spacing: 3, runSpacing: 3, alignment: WrapAlignment.center, children: [
                        for (final vv in voters) Container(padding: const EdgeInsets.symmetric(horizontal: 4), decoration: BoxDecoration(border: Border.all(color: const Color(0x55C5A059)), borderRadius: BorderRadius.circular(2)), child: Text('$vv', style: mono(10, color: _gold))),
                      ]),
                    if (self) Text('أنت', style: ar(11, color: _muted)),
                  ]),
                ),
              ),
            );
          }(),
        ],
      ),
    ]);
  }
}

class _TwoCols extends StatelessWidget {
  const _TwoCols({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < children.length; i += 2)
          Padding(
            padding: EdgeInsets.only(bottom: i + 2 < children.length ? 8 : 0),
            child: IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Expanded(child: children[i]),
                const SizedBox(width: 8),
                Expanded(child: i + 1 < children.length ? children[i + 1] : const SizedBox.shrink()),
              ]),
            ),
          ),
      ]);
}

// ══ 🧰 أدوات اللعبة (زرّ «اللعبة» في منتصف الشريط) ══
Future<void> openRoomHub(BuildContext context, GameSessionController c, {required VoidCallback openGallery, required VoidCallback openOrder, int cartCount = 0, VoidCallback? openNotes}) {
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    routeSettings: const RouteSettings(name: kHubRoute),
    backgroundColor: Colors.transparent,
    builder: (ctx) => Directionality(
      textDirection: TextDirection.rtl,
      child: GuideTarget(id: 'room-hub', child: Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 16 + MediaQuery.viewPaddingOf(ctx).bottom),
        decoration: const BoxDecoration(color: Color(0xFF0C0C0C), border: Border(top: BorderSide(color: Color(0x80C5A059)))),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Expanded(child: Text('أدوات اللعبة', style: ar(16, color: _gold, weight: FontWeight.bold))),
            IconButton(onPressed: () => Navigator.of(ctx).pop(), icon: const Icon(Icons.close, color: _muted)),
          ]),
          GridView.count(
            crossAxisCount: 3, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 1.25,
            children: [
              GuideTarget(id: 'hub-team', child: _hubTile(Icons.groups_outlined, 'الفريق', () { Navigator.of(ctx).pop(); openGallery(); }, red: true)),
              GuideTarget(id: 'hub-tasks', child: _hubTile(Icons.assignment_outlined, 'مهامّي', () { Navigator.of(ctx).pop(); unawaited(openTasksV2(context, c)); })),
              _hubTile(Icons.edit_note, 'المفكّرة', () { Navigator.of(ctx).pop(); if (openNotes != null) { openNotes(); } else { unawaited(showNotepad(context, c)); } }),
              _hubTile(Icons.restaurant_outlined, 'المنيو', () { Navigator.of(ctx).pop(); openOrder(); }, badge: cartCount),
              GuideTarget(id: 'hub-roles', child: _hubTile(Icons.style_outlined, 'الأدوار', () { Navigator.of(ctx).pop(); unawaited(_openRolesInPlay(context, c)); })),
              _hubTile(Icons.logout, 'خروج', () { Navigator.of(ctx).pop(); unawaited(_leaveSheet(context, c)); }, red: true),
            ],
          ),
        ]),
      )),
    ),
  );
}

Widget _hubTile(IconData icon, String label, VoidCallback onTap, {bool red = false, int badge = 0}) => InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(color: const Color(0xFF111111), border: Border.all(color: red ? const Color(0x668A0303) : const Color(0x40C5A059)), borderRadius: BorderRadius.circular(3)),
        child: Stack(alignment: Alignment.center, children: [
          Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, color: red ? const Color(0xFFE07A7A) : _gold, size: 26),
            const SizedBox(height: 6),
            Text(label, style: ar(13, color: Colors.white, weight: FontWeight.bold)),
          ]),
          if (badge > 0)
            Positioned(top: 6, left: 6, child: Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1), decoration: BoxDecoration(color: const Color(0xFF8A0303), borderRadius: BorderRadius.circular(99)), child: Text('$badge', style: mono(10, color: Colors.white)))),
        ]),
      ),
    );

/// 📋 مهامّي: الخادم يقرّر الفتح، ثمّ الظرف بالضغط المطوّل — الشكل واحدٌ لكلّ الأدوار
Future<void> openTasksV2(BuildContext context, GameSessionController c) async {
  final blocked = c.isPlayerDead ? 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء.' : await c.requestTasksOpen();
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    routeSettings: const RouteSettings(name: kTasksRoute),
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Directionality(
      textDirection: TextDirection.rtl,
      child: Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 20 + MediaQuery.viewPaddingOf(ctx).bottom),
        decoration: const BoxDecoration(color: Color(0xFF0C0C0C), border: Border(top: BorderSide(color: Color(0x80C5A059)))),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Expanded(child: Text('📋 مهامّي', style: ar(16, color: _gold, weight: FontWeight.bold))),
            IconButton(onPressed: () => Navigator.of(ctx).pop(), icon: const Icon(Icons.close, color: _muted)),
          ]),
          if (blocked != null)
            Padding(padding: const EdgeInsets.symmetric(vertical: 28), child: Column(children: [
              const Text('☠️', style: TextStyle(fontSize: 36)),
              const SizedBox(height: 10),
              Text(blocked, textAlign: TextAlign.center, style: ar(14, color: _ink2)),
            ]))
          else ...[
            HoldRevealButton(
              title: 'دورك ومهامّك', panelTitle: '📋 مهامّي', watermark: _watermark(c), guideId: 'tasks-hold',
              onShow: c.enterSecretScreen, onHide: c.leaveSecretScreen,
              builder: (_) => _TasksBody(controller: c),
            ),
            const SizedBox(height: 8),
            Text('الشكل واحدٌ لكلّ الأدوار — تُفتح في أعلى الشاشة وتُغلق بـ«إخفاء»', textAlign: TextAlign.center, style: ar(11.5, color: _muted)),
          ],
        ]),
      ),
    ),
  );
}

class _TasksBody extends StatelessWidget {
  const _TasksBody({required this.controller});
  final GameSessionController controller;
  @override
  Widget build(BuildContext context) => FutureBuilder<List<GuideRole>>(
        future: RolesGuideService.instance.load(room: controller.roomId),
        builder: (_, snap) {
          final c = controller;
          final r = (snap.data ?? const <GuideRole>[]).where((x) => x.id == c.assignedRole).firstOrNull;
          if (snap.connectionState != ConnectionState.done && r == null) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
          if (r == null) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text('لم تُوزَّع الأدوار بعد.', style: ar(13, color: _muted)), ProphecyTasksV2(controller: c)]);
          final k = _phaseNoteKey[c.gamePhase ?? ''] ?? 'night';
          final col = _teamC[r.team] ?? _gold;
          final ac = c.assassinContracts;
          Widget blk(String h, List<Widget> kids) => Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: const Color(0xFF111111), border: Border.all(color: const Color(0x26FFFFFF)), borderRadius: BorderRadius.circular(3)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(h, style: ar(12.5, color: _gold, weight: FontWeight.bold)), const SizedBox(height: 4), ...kids]),
              );
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('دورك', style: ar(11.5, color: _muted)),
            Text(r.nameAr, style: TextStyle(fontFamily: 'Amiri', fontSize: 26, fontWeight: FontWeight.w700, color: col)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: col.withValues(alpha: 0.1), border: Border.all(color: col.withValues(alpha: 0.33)), borderRadius: BorderRadius.circular(4)),
              child: Text(_teamAr[r.team] ?? r.team, style: ar(11, color: col, weight: FontWeight.bold)),
            ),
            if ((r.oneLiner ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(r.oneLiner!, style: ar(14, color: _ink2))),
            blk('${_phaseNoteAr[k]} — الآن', [Text(r.phaseNotes[k] ?? (r.actsIn.contains(k) ? 'لك دورٌ في هذه المرحلة.' : 'لا فعلَ مطلوبٌ منك — راقبْ وأنصت.'), style: ar(13.5, color: _ink2))]),
            if (k == 'night' && r.actsIn.contains('night'))
              blk('التخطّي', [Text(r.id == 'SNIPER' ? '«تخطٍّ — لا أحد» تحفظ طلقتك لليلةٍ أخرى.' : 'لا تخطّي لدورك — اختر لاعباً قبل انتهاء الوقت.', style: ar(13.5, color: _ink2))]),
            if (r.id == 'ASSASSIN' && ac != null && ac.contracts.isNotEmpty)
              blk('عقود الاغتيال · ${ac.completedCount}/${ac.totalRequired} مُنجزة', [
                ClipRRect(borderRadius: BorderRadius.circular(2), child: LinearProgressIndicator(value: ac.totalRequired > 0 ? ac.completedCount / ac.totalRequired : 0, minHeight: 5, backgroundColor: const Color(0xFF1F1C18), valueColor: const AlwaysStoppedAnimation(Color(0xFF8A0303)))),
                const SizedBox(height: 6),
                for (var i = 0; i < ac.contracts.length; i++)
                  Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('${ac.contracts[i].completed ? '✓' : '${i + 1}'}  ${ac.contracts[i].descriptionAr ?? ac.contracts[i].description}',
                      style: ar(13, color: ac.contracts[i].completed ? const Color(0xFF4ADE80) : _ink2))),
                Text('إن مات هدفُ عقدٍ بغير يدك يُستبدل العقد بصمت.', style: ar(12, color: _muted)),
              ]),
            if (r.id == 'SHERIFF' && c.sheriffResults.isNotEmpty)
              blk('نتائج تحقيقك', [for (final s in c.sheriffResults) Text('الليلة ${s.round}: #${s.targetPhysicalId} ${s.targetName} — ${s.isMafia ? 'مافيا 🔴' : 'ليس مافيا 🔵'}', style: ar(13.5, color: _ink2))]),
            if (c.gallerySibling != null) blk('أخوك', [Text('#${c.gallerySibling!.physicalId} ${c.gallerySibling!.name}', style: ar(13.5, color: _ink2))]),
            // 🔮 كروت موسم النبوءة — داخل الظرف وحده
            ProphecyTasksV2(controller: c),
          ]);
        },
      );
}

// ══ 🚪 مغادرة الغرفة — ضغطٌ مطوّل (٩٠٠ مث) كالويب ══
Future<void> _leaveSheet(BuildContext context, GameSessionController c) => showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Directionality(textDirection: TextDirection.rtl, child: _LeaveBody(controller: c)),
    );

class _LeaveBody extends StatefulWidget {
  const _LeaveBody({required this.controller});
  final GameSessionController controller;
  @override
  State<_LeaveBody> createState() => _LeaveBodyState();
}

class _LeaveBodyState extends State<_LeaveBody> with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        Navigator.of(context).pop();
        unawaited(widget.controller.logout());
      }
    });
  @override
  void dispose() { _a.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 20 + MediaQuery.viewPaddingOf(context).bottom),
        decoration: const BoxDecoration(color: Color(0xFF0C0C0C), border: Border(top: BorderSide(color: Color(0x80C5A059)))),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('🚪 مغادرة الغرفة؟', style: ar(16, color: _gold, weight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('يُفرَّغ مقعدك ${widget.controller.physicalId} وتخرج من اللعبة الجارية. حسابك يبقى.', style: const TextStyle(fontFamily: 'Amiri', fontSize: 15, color: Color(0xFFD8D0C2))),
          const SizedBox(height: 14),
          Listener(
            onPointerDown: (_) => _a.forward(from: 0),
            onPointerUp: (_) { if (!_a.isCompleted) _a.reset(); },
            onPointerCancel: (_) { if (!_a.isCompleted) _a.reset(); },
            child: Container(
              height: 54,
              decoration: BoxDecoration(color: const Color(0xFF2A0A0A), border: Border.all(color: const Color(0xFF8A0303)), borderRadius: BorderRadius.circular(3)),
              child: Stack(children: [
                AnimatedBuilder(animation: _a, builder: (_, __) => FractionallySizedBox(widthFactor: _a.value, child: Container(color: const Color(0xFF8A0303)))),
                Center(child: Text('اضغط مطوّلاً: غادر', style: ar(15, color: Colors.white, weight: FontWeight.bold))),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton(style: _outline(), onPressed: () => Navigator.of(context).pop(), child: Text('ابقَ في اللعبة', style: ar(14, color: _gold))),
        ]),
      );
}

/// للوصول من اختبارٍ أو ملفٍّ آخر دون إظهار الدالّة الخاصّة
Future<void> showMyTasksLegacy(BuildContext context, GameSessionController c) =>
    showMyTasks(context, roleId: c.assignedRole, roomId: c.roomId, gamePhase: c.gamePhase, isDead: c.isPlayerDead);
