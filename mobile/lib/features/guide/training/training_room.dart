import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../app/router.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/roles_guide_service.dart';
import '../../../core/storage/session_store.dart';
import '../../../models/game.dart';
import '../../../models/night.dart';
import '../../../models/profile.dart' show roleNameAr;
import '../../game/game_screen.dart' show GameShellFrame, GameSpinner;
import '../../game/game_session_controller.dart';
import '../../game/mafia_gallery.dart';
import '../../game/photo_consent_view.dart';
import '../../game/room_v2/hold_reveal.dart';
import '../../game/room_v2/player_room.dart';
import '../../game/room_v2/room_bus.dart';
import '../../game/seat_choice_view.dart';
import '../../profile/profile_palette.dart';
import '../guide_layer.dart';
import '../guide_service.dart';
import '../guide_targets.dart';
import 'script.dart';

// ══════════════════════════════════════════════════════
// 🕴️ غرفة التدريب — «ليلة تجريبيّة» (منقولةٌ من TrainingRoom.tsx، 2026-11-22)
//
// واجهة الغرفة الحقيقيّة (PlayerRoomV2 وما تحته) مغذّاةً بسيناريو مكتوب عبر جلسةٍ
// معزولة (SimSession) بدل المقبس. لا غرفة في الخادم ولا لاعبين: لا رتبة، لا إحصاءات،
// لا ختم ولاء، لا خصم غياب، لا تنبيه لموجّه، لا تقرير.
//
// «الدقّات» هي خطوات الجولة داخل الغرفة: كلّ دقّة تضبط المشهد عند دخولها، وتقول ما
// يُضاء وما يقوله الدون، ومتى تنتهي (فعلٌ من اللاعب يُرصد من الحالة أو من الشاشة).
// ما تضيفه الجولة فوق الواجهة الحقيقيّة: نافذة القاعة، وهمسات التدريب، وبطاقة الدون.
// ══════════════════════════════════════════════════════

/// يعرض غرفة التدريب في تبويب «ادخل» ما دامت الجولة في الغرفة — والشاشة الحقيقيّة
/// تبقى مركّبةً تحتها مخفيّة. الخروج من التبويب وسط الجولة يوقفها (تبقى «تابع» في الرئيسيّة).
class GuideRoomGate extends StatefulWidget {
  const GuideRoomGate({super.key, required this.child});
  final Widget child;
  @override
  State<GuideRoomGate> createState() => _GuideRoomGateState();
}

class _GuideRoomGateState extends State<GuideRoomGate> {
  final g = GuideService.instance;
  final c = GameSessionController.instance;
  Timer? _t;
  bool _wasIn = false;

  @override
  void initState() {
    super.initState();
    g.addListener(_on);
    c.addListener(_on);
    _t = Timer.periodic(const Duration(milliseconds: 300), (_) => _watch());
  }

  @override
  void dispose() { _t?.cancel(); g.removeListener(_on); c.removeListener(_on); super.dispose(); }

  void _on() { if (mounted) setState(() {}); }

  bool get _training => g.enabled && g.run?.stage == GuideStage.room && !c.step.inGame;

  void _watch() {
    if (g.run?.stage != GuideStage.room) { _wasIn = false; return; }
    if (currentPath() == Routes.join) { _wasIn = true; return; }
    if (_wasIn) { _wasIn = false; g.pauseRoom(); }
  }

  @override
  Widget build(BuildContext context) {
    final t = _training;
    return Stack(children: [
      Offstage(offstage: t, child: TickerMode(enabled: !t, child: widget.child)),
      if (t) const Positioned.fill(child: TrainingRoomScreen()),
    ]);
  }
}

class _Beat {
  const _Beat(this.id, {this.enter, required this.layer, this.until, this.back, this.onNext});
  final String id;
  final VoidCallback? enter;
  final LayerStep? Function() layer;
  /// تنتهي الدقّة حين يصير صحيحاً (يُفحص كلّ ١٥٠ مث)
  final bool Function()? until;
  /// عُد دقّةً إن صار صحيحاً (أغلق اللاعب ورقةً قبل أن يُتمّ)
  final bool Function()? back;
  final VoidCallback? onNext;
}

class _Sim {
  String phase = 'LOBBY';
  bool assigned = false;
  List<int> dead = [];
  bool meDead = false;
  bool nightOn = false;
  DateTime? nightDeadline;
  bool oneNightSent = false;
  /// kNoPick = لم يختر بعد · null = تخطّى
  int? pick = kNoPick;
  int? vote;
  int? votingCountdown;
  String? hall;
  int? speaker;
  int speakerAt = 0;
  bool speaking = true;
  List<Map<String, dynamic>> conf = [];
  int? confTarget;
  int? incomingFrom;
  String? incomingAns;
  String? pulse;
  (int, int)? bots;
  ({bool ended, int startedAt})? just;
  bool withdrawn = false;
  bool revealed = false;
  bool over = false;
  bool rolesOpen = false;
}

const _roomRoutes = {kHubRoute, kTasksRoute, kGalleryRoute, kPrivatePanelRoute, kRolesRoute};
List<Gp> _p(List<String?> ps) => [for (final x in ps) if (x != null && x.isNotEmpty) Gp(x)];

class TrainingRoomScreen extends StatefulWidget {
  const TrainingRoomScreen({super.key});
  /// 🧪 للاختبار وحده: الدقّة الجارية (أو مرحلة ما قبل الغرفة)
  @visibleForTesting
  static final ValueNotifier<String?> debugBeat = ValueNotifier(null);
  @override
  State<TrainingRoomScreen> createState() => _TrainingRoomScreenState();
}

class _TrainingRoomScreenState extends State<TrainingRoomScreen> {
  final g = GuideService.instance;
  final sim = SimSession();
  String _pre = 'joining';
  int _bi = 0;
  _Sim s = _Sim();
  bool _grad = false, _pickRole = false;
  bool _teamSeen = false;
  Timer? _beatT, _clock, _joinT;
  List<GuideRole> _roles = RolesGuideService.instance.cached ?? const [];
  String? _overlaySig;
  String? _lastRole;

  String get R => g.role;
  String get myName { final n = (SessionStore.instance.player?.name ?? '').trim(); return n.isEmpty ? 'أنت' : n; }
  bool get inRoom => _pre == 'room';

  @override
  void initState() {
    super.initState();
    unawaited(RolesGuideService.instance.load().then((r) { if (mounted) setState(() => _roles = r); }));
    sim.onVote = (index) async {
      final b = _ballot;
      if (index < 0 || index >= b.cands.length) return null;
      final target = b.cands[index];
      if (target == kMe) return 'لا يمكنك التصويت لنفسك';
      s.vote = target;
      _push();
      return null;
    };
    sim.onOneNight = (picks) async { s.pick = picks.isEmpty ? null : picks.first.targetPhysicalId; s.oneNightSent = true; _push(); return true; };
    sim.onTasksOpen = () async => s.meDead ? 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء.' : null;
    sim.onRequestConfrontation = (target) async {
      final now = DateTime.now().millisecondsSinceEpoch;
      s.confTarget = target;
      s.conf = [...s.conf.where((x) => x['id'] != 'c-me'), _conf('c-me', kMe, target, 'PENDING', respondBy: now + 20000)];
      _push();
      Timer(const Duration(milliseconds: 2600), () {
        if (!mounted) return;
        s.conf = [for (final x in s.conf) x['id'] == 'c-me' && x['status'] == 'PENDING' ? {...x, 'status': 'ACCEPTED', 'acceptedBy': 'TARGET'} : x];
        _push();
      });
      return true;
    };
    sim.onRespondConfrontation = (id, ok) async {
      s.incomingAns = ok ? 'yes' : 'no';
      s.conf = [for (final x in s.conf) x['id'] == id ? {...x, 'status': ok ? 'ACCEPTED' : 'DECLINED', if (ok) 'acceptedBy': 'TARGET' else 'declinedBy': 'TARGET'} : x];
      _push();
      return true;
    };
    sim.onPulse = (id, side) async { s.pulse = side == 'TGT' ? 'TGT' : 'REQ'; _push(); return true; };
    sim.onWithdraw = () async { s.withdrawn = true; _push(); return true; };
    sim.onLeave = g.defer;
    sim.onRolesInPlay = () { s.rolesOpen = true; _push(); return rolesInPlay(R); };

    // «جاري تخصيص مقعدك…» ثمّ الخطوات التي تسبق الغرفة
    _joinT = Timer(const Duration(milliseconds: 1700), () { if (mounted) setState(() { _pre = 'photo'; _syncOverlay(); }); });
    _beatT = Timer.periodic(const Duration(milliseconds: 150), (_) => _checkBeat());
    _clock = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    // بعد أوّل رسم: ضبطُ المشهد يُخطر ودجاتٍ أخرى (طبقة الدون) ولا يجوز ذلك أثناء البناء
    WidgetsBinding.instance.addPostFrameCallback((_) => _push());
  }

  @override
  void dispose() {
    _beatT?.cancel();
    _clock?.cancel();
    _joinT?.cancel();
    if (_overlaySig != null) g.overlay.value = null;
    g.sheet.value = null;
    sim.dispose();
    super.dispose();
  }

  // ── مشتقّات السيناريو ──
  Map<int, String> get _table => tableOf(R);
  NightResult get _night => resolveNight(R, s.pick);
  Ballot get _ballot => ballotOf(_night, s.vote);
  int get _acc => _ballot.acc;
  int get _defConf => defaultConfTarget(R, _night);
  GuideRole? get _info => _roles.where((x) => x.id == R).firstOrNull;
  String _roleName(String id) => _roles.where((x) => x.id == id).firstOrNull?.nameAr ?? roleNameAr(id);
  String get _rn => _roleName(R);
  String _nameOf(int seat) => seat == kMe ? myName : (kBotNames[seat] ?? 'لاعب #$seat');
  bool _alive(int seat) => !s.dead.contains(seat);
  String? _face(String roleId) { final u = _roles.where((x) => x.id == roleId).firstOrNull?.faceUrl; return u == null ? null : ApiClient.instance.upload(u); }

  List<int> get _votersForAccused {
    final all = <int, int>{..._ballot.bot, if (s.vote != null) kMe: s.vote!};
    return [for (final e in all.entries) if (e.value == _acc) e.key];
  }

  Map<String, dynamic> _conf(String id, int req, int tgt, String status, {int? respondBy, int? stageAt}) => {
        'id': id, 'round': 1, 'requesterPhysicalId': req, 'targetPhysicalId': tgt, 'status': status,
        'respondBy': respondBy ?? DateTime.now().millisecondsSinceEpoch, 'stageSeconds': 60, if (stageAt != null) 'stageStartedAt': stageAt,
      };

  void _tick() {
    if (!mounted || !inRoom) return;
    var changed = false;
    if (s.phase == GamePhase.dayVoting && (s.votingCountdown ?? 0) > 0) { s.votingCountdown = s.votingCountdown! - 1; changed = true; }
    if (s.phase == GamePhase.dayJustification && s.just != null && !s.just!.ended) changed = true;
    if (changed) _push();
  }

  // ══ المشهد ← الجلسة المعزولة ══
  void _push() {
    if (!mounted) return;
    final t = _table, n = _night, b = _ballot;
    final role = s.assigned ? R : null;
    sim.simIdentity(seat: kMe, name: myName, code: kRoomCode, game: kGameName);
    sim.simPhase = s.phase;
    sim.simRound = s.phase == GamePhase.lobby ? 0 : 1;
    if (_lastRole != role) { _lastRole = role; sim.simRole = role; }
    sim.simDead = s.meDead;
    final roster = [for (final x in kSeats) RosterPlayer(physicalId: x, name: _nameOf(x), isAlive: !s.dead.contains(x))];
    sim.simRoster = roster;
    if (s.phase == GamePhase.lobby) { sim.simTeams(null, null, null); } else { final k = teamCounts(R, s.dead); sim.simTeams(k.mafia, k.citizen, k.neutral); }
    sim.simMafiaTeam = role != null && isMafia(role) ? [for (final x in matesOf(role)) MafiaMate(physicalId: x, name: _nameOf(x), role: t[x]!)] : const [];
    sim.simSibling = role == 'OLDER_BROTHER' ? SiblingInfo(physicalId: 8, name: _nameOf(8), role: 'YOUNGER_BROTHER') : null;
    final afterNight = !const [GamePhase.lobby, GamePhase.roleBinding, GamePhase.night].contains(s.phase) || s.meDead;
    final done = afterNight && n.contract ? 1 : 0;
    sim.simContracts = role == 'ASSASSIN'
        ? AssassinContracts(
            contracts: [for (final (i, d) in const ['🔪 اغتل الشريف', '🔪 اغتل الطبيب', '🔪 اغتل شيخ المافيا'].indexed) AssassinContract(id: i + 1, descriptionAr: d, description: d, completed: i < done)],
            completedCount: done, totalRequired: 3, currentIndex: done)
        : null;
    sim.simSheriff = role == 'SHERIFF' && s.phase != GamePhase.night && s.phase != GamePhase.roleBinding && n.pick != null
        ? [SheriffResult(round: 1, isMafia: n.sheriffMafia, targetPhysicalId: n.pick!, targetName: _nameOf(n.pick!))]
        : const [];
    sim.simOneNight(
      s.nightOn
          ? OneNightAsk(deadline: s.nightDeadline, steps: [
              OneNightStep(abilityId: hasNightAbility(R) ? 'TRAINING' : null, ask: '-', canSkip: R == 'SNIPER',
                  targets: [for (final x in allowedTargets(R)) NightTarget(physicalId: x, name: _nameOf(x))]),
            ])
          : null,
      sent: s.oneNightSent,
    );
    // التصويت: القاعة تميل مع صوت المتدرّب
    final votes = <int, int>{if (s.vote != null) ...b.bot, if (s.vote != null) kMe: s.vote!};
    final cands = [for (final (i, x) in b.cands.indexed) VoteCandidate(targetPhysicalId: x, id: 'c$i', name: _nameOf(x), type: 'NORMAL', votes: votes.values.where((v) => v == x).length)];
    final pv = <int, int>{for (final e in votes.entries) if (b.cands.contains(e.value)) e.key: b.cands.indexOf(e.value)};
    final myIdx = s.vote != null ? b.cands.indexOf(s.vote!) : -1;
    sim.simVoting(s.phase == GamePhase.dayVoting ? VotingState(candidates: cands, playerVotes: pv, playersInfo: roster) : null,
        myVote: myIdx >= 0 ? myIdx : null, countdown: s.votingCountdown);
    sim.simDiscussion = s.phase == GamePhase.dayDiscussion && s.speaker != null
        ? DiscussionState(currentSpeakerId: s.speaker, timeLimitSeconds: 60, timeRemaining: 60, startTimeMs: s.speakerAt, status: s.speaking ? 'SPEAKING' : 'WAITING',
            speakingQueue: [for (final x in kSeats) if (!s.dead.contains(x)) x])
        : null;
    final used = s.conf.any((x) => x['id'] == 'c-me' && const ['ACCEPTED', 'LIVE', 'DONE'].contains(x['status'])) ? {'$kMe': 1} : <String, int>{};
    sim.simConfrontation(
      s.phase == GamePhase.dayDiscussion
          ? ConfrontationState.fromJson({'enabled': true, 'perPlayer': 1, 'maxPerRound': 2, 'round': 1, 'used': used, 'pulseEnabled': true, 'confrontations': s.conf})
          : null,
      myPulse: s.pulse != null ? {'c-bots': s.pulse!} : const {},
    );
    final voters = _votersForAccused;
    final needed = (voters.length + 1) ~/ 2;
    final j = s.just;
    if (s.phase == GamePhase.dayJustification && j != null) {
      final left = j.ended ? null : (30 - (DateTime.now().millisecondsSinceEpoch - j.startedAt) ~/ 1000).clamp(0, 30);
      sim.simJustification(
        JustificationData(
          accused: [AccusedPlayer(targetPhysicalId: _acc, name: _nameOf(_acc), canJustify: true)],
          topVotes: voters.length, votersForAccused: voters, timerFinished: j.ended,
          withdrawalTotal: voters.length, withdrawalNeeded: needed,
        ),
        timer: left,
      );
    } else {
      sim.simJustification(null);
    }
    sim.simWithdrawal = s.withdrawn ? WithdrawalState(active: true, count: 1, needed: needed, total: voters.length, withdrawn: const [kMe]) : const WithdrawalState();
    if (s.phase == GamePhase.eliminationPending && s.revealed) { sim.simElimination([_acc], {_acc: t[_acc]!}); } else { sim.simElimination(const [], const {}); }
    if (s.over) {
      final gone = {...s.dead, for (final x in kSeats) if (x != kMe && isMafia(t[x]!)) x};
      sim.simGameOver = {'winner': 'CITIZEN', 'allPlayers': [for (final x in kSeats) {'physicalId': x, 'name': _nameOf(x), 'role': t[x], 'isAlive': !gone.contains(x)}]};
    } else {
      sim.simGameOver = null;
    }
    sim.commit();
    _syncOverlay();
    setState(() {});
  }

  void _patch(void Function() f) { f(); _push(); }

  // ══ الدقّات ══
  void _next() { if (!mounted) return; setState(() => _bi = (_bi + 1).clamp(0, _beats.length - 1)); _enterBeat(); }
  void _ensureHub() { if (!GuideTargets.has('room-hub')) RoomBus.requestHub(); }
  void _closeSheets() {
    bool keep(Route<dynamic> r) => !_roomRoutes.contains(r.settings.name);
    try { Navigator.of(context).popUntil(keep); } catch (_) {}
    try { rootNavigatorKey.currentState?.popUntil(keep); } catch (_) {}
  }

  List<_Beat> get _beats => [
        // ── الغرفة ──
        _Beat('lobby', enter: () => _patch(() { s.phase = GamePhase.lobby; s.assigned = false; s.hall = null; }),
            layer: () => LayerStep(target: 'room-top', text: _p(['أنت في الغرفة. في الأعلى رقم مقعدك، والمرحلة الجارية، واسم الغرفة. هذا الشريط لا يغيب طوال اللعبة.']))),
        _Beat('hall', enter: () => _patch(() => s.hall = 'seats'),
            layer: () => LayerStep(target: 'hall', text: _p(['في النادي شاشةٌ كبيرة تعرض ما يخصّ الجميع: من جلس، ومن خرج، ومن يتكلّم. في التدريب أضعها لك هنا.', 'القاعدة: ما للجميع على الشاشة، وما لك وحدك في هاتفك.']))),
        // ── الدور ──
        _Beat('card', enter: () => _patch(() { s.phase = GamePhase.roleBinding; s.assigned = true; s.hall = null; }),
            layer: () => const LayerStep(target: 'room-card', pos: 'top', wait: 'غطِّ الشاشة بكفّك، واضغط البطاقة مطوّلاً'),
            until: () => GuideTargets.has('room-card-open')),
        _Beat('card-open',
            layer: () => LayerStep(target: 'room-card', pos: 'top', whisper: true, text: _p(['أنت $_rn. ${_info?.oneLiner ?? ''}']), wait: 'المس البطاقة مرّةً لتعيدها'),
            until: () => !GuideTargets.has('room-card-open')),
        _Beat('card-done', layer: () => LayerStep(pos: 'top', text: _p(['هكذا تراجع دورك قبل بدء اللعب. البطاقة تعود وحدها بعد خمس عشرة ثانية، وإن خرجتَ من التطبيق.']))),
        _Beat('hub', layer: () => const LayerStep(target: 'nav-game', pos: 'mid', wait: 'الزرّ الذهبيّ صار «اللعبة» — المسه'), until: () => GuideTargets.has('room-hub')),
        _Beat('hub-open', enter: _ensureHub,
            layer: () => LayerStep(target: 'room-hub', pos: 'top', text: _p(['أدواتك الستّ: الفريق، مهامّي، المفكّرة لتدوين شكوكك، المنيو لتطلب وأنت في مقعدك، دليل الأدوار، والخروج.']))),
        _Beat('tasks-tile', enter: _ensureHub, layer: () => const LayerStep(target: 'hub-tasks', pos: 'top', wait: 'افتح «مهامّي»'), until: () => GuideTargets.has('tasks-hold')),
        _Beat('tasks-hold',
            layer: () => LayerStep(target: 'tasks-hold', pos: 'top', text: _p(['هنا دورك وما تفعله في كلّ مرحلة. تُفتح في أعلى الشاشة وتُغلق بزرّ «إخفاء».']), wait: 'اضغط مطوّلاً على البطاقة'),
            until: () => GuideTargets.has('private-panel'),
            back: () => !GuideTargets.has('tasks-hold') && !GuideTargets.has('private-panel')),
        _Beat('tasks-peek', layer: () => null, until: () => !GuideTargets.has('private-panel')),
        _Beat('tasks-done', enter: _closeSheets,
            layer: () => LayerStep(pos: 'mid', text: _p(['في اللعب الحقيقيّ كلّ فتحٍ لـ«مهامّي» ينبّه الموجّه، فلا تفتحها بلا حاجة. في التدريب افتحها ما شئت.']))),
        _Beat('team-tile', enter: () { _teamSeen = false; _ensureHub(); },
            layer: () => const LayerStep(target: 'hub-team', pos: 'top', wait: 'افتح «الفريق»'), until: () => GuideTargets.has('team-gallery')),
        _Beat('team-press',
            layer: () => const LayerStep(target: 'team-btn', pos: 'top', wait: 'اضغط الزرّ الأحمر مع الاستمرار، ثمّ ارفع إصبعك'),
            until: () { if (GuideTargets.has('team-on')) { _teamSeen = true; return false; } return _teamSeen; },
            back: () => !GuideTargets.has('team-gallery')),
        _Beat('team-done',
            layer: () => LayerStep(pos: 'top', text: _p([isMafia(R)
                ? 'هؤلاء شركاؤك، ولا يظهرون إلّا وإصبعك على الزرّ. جارك المواطن يفتح الشاشة نفسها ويرى «ملفٌّ مغلق».'
                : 'لستَ من المافيا، فالملفّات مغلقة. لكنّ عدد الخانات وشكل الشاشة واحدٌ عند الجميع — فلا يعرف جارك من أنت.']))),
        _Beat('roles-tile', enter: () { _closeSheets(); Timer(const Duration(milliseconds: 260), () { if (mounted) _ensureHub(); }); },
            layer: () => const LayerStep(target: 'hub-roles', pos: 'top', wait: 'افتح «الأدوار»'), until: () => s.rolesOpen),
        _Beat('roles',
            layer: () => LayerStep(dim: false, pos: 'top', text: _p(['كروت الأدوار الموجودة على هذه الطاولة. قبل بدء اللعبة ترى الأدوار كلّها، وبعده أدوار طاولتك فقط.'])),
            onNext: () { _closeSheets(); s.rolesOpen = false; _next(); }),

        // ── الليل ──
        _Beat('night-intro', enter: () { _closeSheets(); _patch(() { s.phase = GamePhase.night; s.hall = 'night'; s.rolesOpen = false; s.nightOn = false; s.oneNightSent = false; s.pick = kNoPick; }); },
            layer: () => LayerStep(pos: 'bottom', text: _p(['في الليل يُسأل الجميع السؤال نفسه في اللحظة نفسها، ويختار الجميع: من له قدرة ومن ليس له.', 'هكذا لا يعرف جارك هل اختيارك حقيقيّ أم تمويه.']))),
        _Beat('night-ask', enter: () => _patch(() { s.hall = null; s.oneNightSent = false; s.nightOn = true; s.nightDeadline = DateTime.now().add(const Duration(minutes: 2)); }),
            layer: () => null, until: () => s.oneNightSent),
        _Beat('night-sent', layer: () => LayerStep(dim: false, pos: 'top', text: _p(['انتهى دورك الليلة. الليل ينتهي للجميع معاً، فلا يُعرف من تأخّر.']))),

        // ── الصباح ──
        _Beat('morning', enter: () => _patch(() { final n = _night; s.phase = GamePhase.morningRecap; s.nightOn = false; s.dead = [...n.dead]; s.hall = 'morning'; }),
            layer: () => LayerStep(target: 'night-msg', pos: 'low', text: _p(['ما جرى في الليل يُعلن للجميع على شاشة القاعة. وهاتفك يحمل «رسالة الليل»: تصل كلّ الهواتف معاً.']), wait: 'اضغط عليها مطوّلاً'),
            until: () => GuideTargets.has('private-panel')),
        _Beat('morning-peek', layer: () => null, until: () => !GuideTargets.has('private-panel')),
        _Beat('morning-done',
            layer: () => LayerStep(pos: 'low', whisper: true, text: R == 'SHERIFF'
                ? _p(['نتيجة تحقيقك لك وحدك: جارك فتح الإطار نفسه ووجد «لا جديد». وتبقى محفوظةً في «مهامّي».'])
                : _p(['كلّ الهواتف فتحت الإطار نفسه؛ من له نتيجةٌ وجدها، والباقون وجدوا «لا جديد».', nightOutcomeText(R, _night, _nameOf)]))),

        // ── النهار ──
        _Beat('disc', enter: () => _patch(() { s.phase = GamePhase.dayDiscussion; s.hall = null; s.speaker = _alive(3) ? 3 : 7; s.speakerAt = DateTime.now().millisecondsSinceEpoch; s.speaking = true; }),
            layer: () => LayerStep(target: 'disc-speaker', pos: 'bottom', text: [
                  const Gp('النقاش: يتكلّم اللاعبون بالدور والموجّه يضبط الوقت. الحلقة حول الرقم ما بقي من وقت المتحدّث.'),
                  if (R == 'SILENCER' && _night.pick != null) Gp('${_nameOf(_night.pick!)} لن يُعطى الكلمة اليوم — أسكتَّه أنت.', tip: true),
                ])),
        _Beat('disc-me', enter: () => _patch(() { s.speaker = kMe; s.speakerAt = DateTime.now().millisecondsSinceEpoch; s.speaking = true; }),
            layer: () => LayerStep(target: 'my-turn', pos: 'low', whisper: true, text: [
                  const Gp('حين يصل الدور إليك يضيء هاتفك بهذا التنبيه، وتتكلّم حتى ينتهي وقتك.'),
                  if ((_info?.phaseNotes['discussion'] ?? '').isNotEmpty) Gp('نصيحة لدورك: ${_info!.phaseNotes['discussion']}', tip: true),
                ])),
        // ⚔️ المواجهة
        _Beat('conf-btn', enter: () => _patch(() { s.speaker = _alive(6) ? 6 : 8; s.speakerAt = DateTime.now().millisecondsSinceEpoch; s.speaking = true; }),
            layer: () => LayerStep(target: 'conf-request', pos: 'top', text: _p(['المواجهة: تتّهم لاعباً وجهاً لوجه أمام القاعة. تطلبها من هاتفك أثناء النقاش، ورصيدك مواجهةٌ واحدة في اللعبة.']), wait: 'اضغط «اطلب مواجهة»'),
            until: () => GuideTargets.has('conf-sheet') || s.conf.any((x) => x['id'] == 'c-me')),
        _Beat('conf-sheet',
            layer: () => LayerStep(dim: false, pos: 'top', whisper: true, wait: 'اختر خصمك ثمّ أرسل الطلب',
                text: _p([isMafia(R)
                    ? 'لا تواجه شريكك: إن خرج بالتصويت خُصم منك. واجه مواطناً؛ مواجهة المافيا لمواطن لا تكسب ولا تخسر.'
                    : 'واجه ${_nameOf(_defConf)} #$_defConf ثمّ صوّت عليه. إن خرج بالتصويت وكان مافيا رأيتَ مكافأتك آخر النهار.'])),
            until: () => s.conf.any((x) => x['id'] == 'c-me'),
            back: () => !GuideTargets.has('conf-sheet') && !s.conf.any((x) => x['id'] == 'c-me')),
        _Beat('conf-wait', layer: () => const LayerStep(target: 'conf-box', pos: 'top', wait: 'أمامه عشرون ثانية ليقبل أو يرفض'),
            until: () => s.conf.any((x) => x['id'] == 'c-me' && x['status'] == 'ACCEPTED')),
        _Beat('conf-accepted',
            layer: () => LayerStep(target: 'conf-box', pos: 'top', text: _p(['قبِل. تُنفَّذ المواجهة بعد آخر متحدّث وقبل التصويت، والموجّه يبدؤها.', 'لو رفض لأُعلن رفضه على شاشة القاعة، ولبقي رصيدك لك.']))),
        _Beat('conf-incoming',
            enter: () => _patch(() {
              final q = const [10, 2, 1, 4, 8].where(_alive).firstOrNull ?? 10;
              s.incomingAns = null;
              s.incomingFrom = q;
              s.conf = [...s.conf.where((x) => x['id'] != 'c-in'), _conf('c-in', q, kMe, 'PENDING', respondBy: DateTime.now().millisecondsSinceEpoch + 20000)];
            }),
            layer: () => LayerStep(target: 'conf-box', pos: 'top', text: _p(['وقد يطلب غيرُك مواجهتك. أمامك عشرون ثانية؛ وإن انقضت بلا جواب صار القرار للموجّه.']), wait: 'اختر: أقبل أو أرفض'),
            until: () => s.incomingAns != null),
        _Beat('conf-incoming-done', enter: () { if (s.incomingAns == 'no') _patch(() => s.hall = 'declined'); },
            layer: () => s.incomingAns == 'no'
                ? LayerStep(target: 'hall', pos: 'bottom', text: _p(['رفضتَ، فأُعلن رفضك على شاشة القاعة أمام الجميع، والقاعة تفسّره كما تشاء. رصيد صاحب الطلب لا يُستهلك.']))
                : LayerStep(target: 'conf-box', pos: 'top', text: _p(['قبلتَ: تتواجهان بعد آخر متحدّث وتتكلّمان معاً بمؤقّتٍ واحد. هذه حالةٌ للتجربة فقط، فلن تُنفَّذ في جولتنا.']))),
        _Beat('deals', enter: () => _patch(() { s.hall = null; s.conf = s.conf.where((x) => x['id'] != 'c-in').toList(); }),
            layer: () => LayerStep(target: 'deals-btn', pos: 'top', text: _p(['الاتفاقيّة رهانٌ تعقده في النقاش على لاعبٍ تظنّه مافيا، فيظهر رهانك مرشّحاً في التصويت. تُفتح من الجولة الثانية، وشروط ربحها وخسارتها في «حسابي».']))),
        _Beat('conf-live',
            enter: () => _patch(() {
              final t = s.confTarget ?? defaultConfTarget(R, resolveNight(R, s.pick));
              final now = DateTime.now().millisecondsSinceEpoch;
              final mine = s.conf.where((x) => x['id'] == 'c-me').firstOrNull ?? _conf('c-me', kMe, t, 'ACCEPTED');
              s.confTarget = t;
              s.speaking = false;
              s.hall = 'conf-me';
              s.conf = [...s.conf.where((x) => x['id'] != 'c-me'), {...mine, 'status': 'LIVE', 'stageStartedAt': now, 'stageSeconds': 60}];
            }),
            layer: () => LayerStep(target: 'conf-box', pos: 'low', text: _p(['بعد آخر متحدّث يبدأ الموجّه مواجهتك: تتكلّمان معاً بمؤقّتٍ واحد، والقاعة تصوّت من هواتفها لمن أقنعها. الأصوات سرّيّة، وتظهر نسبتها على الشاشة فقط.']))),
        _Beat('conf-pulse',
            enter: () => _patch(() {
              bool live(int x) => !s.dead.contains(x);
              final a = const [4, 1, 10, 8, 2].where(live).firstOrNull ?? 4;
              final b = const [3, 7, 9, 6, 2, 8].where((x) => live(x) && x != a && x != s.confTarget).firstOrNull ?? 3;
              s.pulse = null;
              s.bots = (a, b);
              s.hall = 'conf-bots';
              s.conf = [
                for (final x in s.conf.where((x) => x['id'] != 'c-bots')) x['id'] == 'c-me' ? {...x, 'status': 'DONE', 'timeUp': true} : x,
                _conf('c-bots', a, b, 'LIVE', stageAt: DateTime.now().millisecondsSinceEpoch),
              ];
            }),
            layer: () => LayerStep(target: 'conf-box', pos: 'low', text: _p(['وحين يتواجه غيرُك فأنت من القاعة: هاتفك يسألك من أقنعك أكثر.']), wait: 'اختر أحد الطرفين'),
            until: () => s.pulse != null),
        _Beat('conf-pulse-done',
            layer: () => LayerStep(target: 'conf-box', pos: 'low', open: true, text: _p(['صوتك سرّيّ، وتغيّره حتى يُغلق الموجّه المواجهة. على الشاشة يظهر مجموع القاعة فقط. والحدّ مواجهتان مقبولتان في الجولة.']))),
        // 🗳️ التصويت
        _Beat('vote',
            enter: () => _patch(() {
              s.phase = GamePhase.dayVoting; s.hall = null; s.speaker = null; s.vote = null; s.votingCountdown = 60;
              s.conf = [for (final x in s.conf) x['status'] == 'LIVE' ? {...x, 'status': 'DONE'} : x];
            }),
            layer: () => null, until: () => s.vote != null),
        _Beat('vote-done',
            layer: () => LayerStep(dim: false, pos: 'top', text: [
                  const Gp('وصل صوتك، وتغييره مسموحٌ حتى يُغلق الموجّه التصويت. الأرقام الصغيرة تحت كلّ مرشّح مقاعد من صوّتوا عليه.'),
                  if ((_info?.phaseNotes['voting'] ?? '').isNotEmpty) Gp('نصيحة لدورك: ${_info!.phaseNotes['voting']}', tip: true),
                ])),
        // ⚖️ التبرير وسحب الصوت
        _Beat('just', enter: () => _patch(() { s.phase = GamePhase.dayJustification; s.votingCountdown = null; s.withdrawn = false; s.just = (ended: false, startedAt: DateTime.now().millisecondsSinceEpoch); }),
            layer: () => LayerStep(target: 'accused', pos: 'low', text: [
                  const Gp('صاحب أعلى الأصوات يبرّر، وترى من صوّت عليه بالاسم. زرّ سحب الصوت يظهر حين ينتهي وقت التبرير.'),
                  if ((_info?.phaseNotes['justification'] ?? '').isNotEmpty) Gp('نصيحة لدورك: ${_info!.phaseNotes['justification']}', tip: true),
                ]),
            onNext: () { final j = s.just; if (j != null) s.just = (ended: true, startedAt: j.startedAt); _push(); _next(); }),
        _Beat('withdraw',
            layer: () => LayerStep(target: 'withdraw', open: true, text: s.withdrawn
                ? _p(['سُحب صوتك وشُطب اسمك من قائمة المصوّتين أمام الجميع. إن بلغ السحب نصف الأصوات أُعيد التصويت، وإلّا نُفّذ القرار.'])
                : const [Gp('انتهى التبرير، فظهر زرّ «سحب صوتي» — لمن صوّت على المتّهم فقط. إن سُحب نصف الأصوات أو أكثر أُعيد التصويت.'), Gp('جرّبه، أو اثبت على صوتك واضغط «التالي».', tip: true)])),
        // 💀 الإقصاء
        _Beat('pending', enter: () => _patch(() { s.phase = GamePhase.eliminationPending; s.revealed = false; s.hall = 'flip'; }),
            layer: () => LayerStep(target: 'hall', pos: 'bottom', text: [
                  const Gp('هاتفك لا يعرف من خرج قبل أن تُقلب بطاقته على شاشة القاعة. هكذا تبقى العيون على الشاشة لا على الهواتف.'),
                  if (R == 'MAYOR') const Gp('لحظة العمدة هنا: تطلب من الموجّه وقف الإعدام بصوتك. هاتفك لا يعرض خياراً — وعند الجميع «القرار عند الموجّه».', tip: true),
                ])),
        _Beat('elim', enter: () => _patch(() { final a = _acc; s.revealed = true; s.hall = null; s.dead = {...s.dead, a}.toList(); }),
            layer: () => LayerStep(target: 'room-teams', pos: 'low', text: _p(['خرج ${_nameOf(_acc)} وكان ${_roleName(_table[_acc]!)}. عدّاد الفرق في الأعلى نقص واحداً.']))),
        _Beat('elim-conf',
            layer: () => LayerStep(dim: false, pos: 'low', whisper: true, text: _p([confOutcomeText(R, s.confTarget ?? _defConf, _acc), 'ثمّ ليلٌ جديد ونهارٌ جديد، حتى يحسم فريق.']))),
        // ── الختام ──
        _Beat('dead', enter: () => _patch(() { s.phase = GamePhase.night; s.meDead = true; s.nightOn = false; s.hall = null; }),
            layer: () => LayerStep(dim: false, pos: 'bottom', text: [
                  const Gp('ولو خرجتَ أنت؟ تبقى في مقعدك وتتابع بصمت. «مهامّي» و«الفريق» يُقفلان، والتصويت يصير مشاهدةً فقط.'),
                  if ((_info?.phaseNotes['dead'] ?? '').isNotEmpty) Gp('دورك بعد الخروج: ${_info!.phaseNotes['dead']}', tip: true),
                ])),
        _Beat('over', enter: () => _patch(() { s.phase = GamePhase.gameOver; s.meDead = false; s.over = true; }),
            layer: () => LayerStep(dim: false, pos: 'low', nextLabel: 'أنهِ الجولة', text: _p([
                  'في النهاية تُكشف أدوار الجميع. ${teamOf(R) == 'CITIZEN' ? 'فريقك ربح هذه المرّة.' : 'فريق المواطنين ربح هذه المرّة، وهكذا تبدو النهاية حين لا تكون منهم.'}',
                  'في اللعب الحقيقيّ تُضاف نقاطك إلى خبرتك ورتبتك. التدريب لا يُحتسب.',
                ])),
            onNext: () { g.finish(); setState(() => _grad = true); _syncOverlay(); _showGrad(); }),
      ];

  _Beat get _beat { final b = _beats; return b[_bi.clamp(0, b.length - 1)]; }

  void _enterBeat() {
    if (!inRoom) return;
    _beat.enter?.call();
    _push();
  }

  void _checkBeat() {
    if (!mounted || !inRoom || _grad) return;
    final b = _beat;
    if (b.until?.call() ?? false) { _next(); return; }
    if (b.back?.call() ?? false) { setState(() => _bi = (_bi - 1).clamp(0, _beats.length - 1)); _syncOverlay(); }
  }

  void _onNext() { final b = _beat; if (b.onNext != null) { b.onNext!(); } else { _next(); } }

  // ── ما ترسمه طبقة الدون (فوق كلّ المسارات، في GuideHost) ──
  void _syncOverlay() {
    TrainingRoomScreen.debugBeat.value = inRoom ? (_grad ? 'grad' : _beat.id) : _pre;
    LayerStep? layer;
    String? count;
    if (_pre == 'photo') {
      layer = const LayerStep(dim: false, pos: 'top', wait: 'يُسأل في ليالي التصوير — لك أن ترفض بلا حرج. اختر جواباً ثمّ تابع');
    } else if (_pre == 'seat') {
      layer = const LayerStep(dim: false, pos: 'top', wait: 'رقم مقعدك اسمك في اللعبة. بقي مقعدٌ واحد: اختره واجلس');
    } else if (inRoom && !_grad) {
      layer = _beat.layer();
      count = '${arNum(_bi + 1)}/${arNum(_beats.length)}';
    }
    final sig = layer == null ? null : '$_pre|$_bi|${layer.target}|${layer.wait}|${layer.text.map((e) => e.text).join('¦')}|${layer.dim}|${layer.open}';
    if (sig == _overlaySig) return;
    _overlaySig = sig;
    g.overlay.value = layer == null
        ? null
        : GuideOverlay(step: layer, count: count, onNext: _onNext, onLater: g.defer, onSkip: () { setState(() => _bi = (_bi + 1).clamp(0, _beats.length - 1)); _enterBeat(); });
  }

  // ── إعادة الغرفة بدورٍ آخر ──
  void _restartWith(String role) {
    g.setRole(role);
    _closeSheets();
    s = _Sim();
    _lastRole = '';
    _grad = false;
    _pickRole = false;
    g.sheet.value = null;
    _bi = _beats.indexWhere((b) => b.id == 'card');
    _overlaySig = null;
    _enterBeat();
  }

  void _showGrad() {
    g.sheet.value = (_) => _pickRole
        ? DonSheet(title: 'أيّ دورٍ تجرّب؟', children: [
            donP('الشاشة العامّة واحدةٌ لكلّ الأدوار. ما يتبدّل بطاقتك، ومحتوى «مهامّي»، ومعنى اختيارك في الليل.'),
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Wrap(spacing: 6, runSpacing: 6, alignment: WrapAlignment.center, children: [
                for (final r in kPlayableRoles)
                  OutlinedButton(
                    onPressed: () => _restartWith(r),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 40), shape: const RoundedRectangleBorder(),
                      backgroundColor: r == R ? const Color(0x1AC5A059) : const Color(0xFF0A0A0A),
                      side: BorderSide(color: r == R ? kGdGold : const Color(0xFF3A3326)),
                    ),
                    child: Text(_roleName(r), style: ar(13.5, color: r == R ? kGdGoldHi : const Color(0xFFEFE9DC), weight: FontWeight.w700)),
                  ),
              ]),
            ),
            donLater('رجوع', () { _pickRole = false; _showGrad(); }),
          ])
        : DonSheet(title: 'أتممتَ ليلتك الأولى', children: [
            donP('عرفتَ الباب والحجز والمقعد، ولعبتَ ليلةً ونهاراً بدور $_rn. الطاولة الحقيقيّة بانتظارك.'),
            donGo('احجز ليلتك الحقيقيّة', g.leaveRoom),
            donLater('جرّب دوراً آخر', () { _pickRole = true; _showGrad(); }),
          ]);
  }

  void _openGallery() {
    if (s.meDead) { g.say('انتهت جولتُك — الفريق يُقفل بعد الإقصاء.'); return; }
    final team = sim.galleryTeam;
    sim.enterSecretScreen();
    unawaited(showMafiaGallery(
      context,
      team: team,
      self: team.isEmpty ? null : MafiaMate(physicalId: kMe, name: myName, role: sim.assignedRole ?? ''),
      mafiaAlive: sim.teamMafia,
      sibling: sim.gallerySibling,
      isAssassin: sim.isAssassin,
      contracts: sim.assassinContracts,
      watermark: sim.secretWatermarkLabel,
      onRevealStart: sim.announceGalleryOpen,
    ).whenComplete(sim.leaveSecretScreen));
  }

  // ══ نافذة القاعة — في التدريب وحده، لأنّ المتدرّب بلا شاشة قاعة ══
  Widget? _hall() {
    final h = s.hall;
    if (h == null) return null;
    final t = _table;
    Widget title(String x) => Text(x, textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'Amiri', fontSize: 19, fontWeight: FontWeight.w700, color: kGdGold, height: 1.3));
    Widget sub(String x) => Padding(padding: const EdgeInsets.only(top: 2), child: Text(x, textAlign: TextAlign.center, style: ar(12.5, color: kGdMuted)));
    Widget vs(String a, String b) => Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Flexible(child: Text(a, style: ar(14, color: const Color(0xFFEFE9DC), weight: FontWeight.w800))),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('✕', style: TextStyle(color: Color(0xFFD9636A)))),
            Flexible(child: Text(b, style: ar(14, color: const Color(0xFFEFE9DC), weight: FontWeight.w800))),
          ]),
        );
    Widget bar(int pct) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: FractionallySizedBox(
            widthFactor: 0.8,
            child: ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: pct / 100, minHeight: 6, backgroundColor: const Color(0xFF3A0A0A), valueColor: const AlwaysStoppedAnimation(kGdGold))),
          ),
        );
    Widget? face(String role, {double w = 26}) {
      final u = _face(role);
      return u == null ? null : Container(width: w, height: w * 1.5, decoration: BoxDecoration(border: Border.all(color: const Color(0x80C5A059))), child: CachedNetworkImage(imageUrl: u, fit: BoxFit.cover, errorWidget: (_, __, ___) => const SizedBox.shrink()));
    }

    var night = false;
    final Widget body;
    switch (h) {
      case 'seats':
        body = Column(mainAxisSize: MainAxisSize.min, children: [
          title('اكتملت الطاولة'),
          const SizedBox(height: 6),
          Wrap(spacing: 5, runSpacing: 5, alignment: WrapAlignment.center, children: [
            for (final x in kSeats)
              Container(
                width: 24, height: 24, alignment: Alignment.center,
                decoration: BoxDecoration(color: kGdGold, shape: BoxShape.circle, border: x == kMe ? Border.all(color: Colors.white, width: 2) : null),
                child: Text('$x', style: mono(10, color: const Color(0xFF120D04)).copyWith(fontWeight: FontWeight.w800)),
              ),
          ]),
          sub('١٠ من ١٠ في مقاعدهم'),
        ]);
      case 'night':
        night = true;
        body = Column(mainAxisSize: MainAxisSize.min, children: [title('المدينة نائمة'), sub('ضربةٌ لكلّ دور بجدولٍ ثابت — لا يُعرف من اختار ولا متى.')]);
      case 'morning':
        final dead = _night.dead;
        body = Column(mainAxisSize: MainAxisSize.min, children: [
          title('تقرير الصباح'),
          if (dead.isEmpty) sub('ليلةٌ بلا ضحايا — الجميع على الطاولة.'),
          for (final x in dead)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (face(t[x]!) != null) ...[face(t[x]!)!, const SizedBox(width: 8)],
                Flexible(child: Text('خرج #$x ${_nameOf(x)} — ${_roleName(t[x]!)}', style: ar(13.5, color: const Color(0xFFEFE9DC)))),
              ]),
            ),
        ]);
      case 'conf-me':
        final tg = s.confTarget ?? _defConf;
        body = Column(mainAxisSize: MainAxisSize.min, children: [title('⚔️ مواجهة'), vs('$myName #$kMe', '${_nameOf(tg)} #$tg'), bar(62), sub('نبض القاعة: ٦٢٪ لك')]);
      case 'conf-bots':
        final bt = s.bots;
        final pct = s.pulse == 'REQ' ? 64 : s.pulse == 'TGT' ? 52 : 58;
        body = bt == null
            ? const SizedBox.shrink()
            : Column(mainAxisSize: MainAxisSize.min, children: [title('⚔️ مواجهة'), vs('${_nameOf(bt.$1)} #${bt.$1}', '${_nameOf(bt.$2)} #${bt.$2}'), bar(pct), sub('نبض القاعة: ${arNum(pct)}٪ لـ${_nameOf(bt.$1)}')]);
      case 'declined':
        final f = s.incomingFrom;
        body = Column(mainAxisSize: MainAxisSize.min, children: [title('🚫 رُفضت المواجهة'), sub('$myName #$kMe رفض مواجهة ${f != null ? '${_nameOf(f)} #$f' : 'لاعب'}')]);
      case 'flip':
        body = Column(mainAxisSize: MainAxisSize.min, children: [_FlipCard(seat: _acc, faceUrl: _face(t[_acc]!)), sub('تُقلب البطاقة على الشاشة أوّلاً')]);
      default:
        body = const SizedBox.shrink();
    }
    return GuideTarget(
      id: 'hall',
      child: Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(color: Colors.black, border: Border.all(color: const Color(0xFF3A3326))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 5),
            child: Row(children: [
              Flexible(child: Text('شاشة القاعة', maxLines: 1, overflow: TextOverflow.ellipsis, style: ar(11.5, color: kGdGold))),
              const SizedBox(width: 8),
              Expanded(child: Text('في النادي تراها على الحائط', maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.end, style: ar(11.5, color: const Color(0xFF6F675B)))),
            ]),
          ),
          Container(
            constraints: const BoxConstraints(minHeight: 96),
            alignment: Alignment.center,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFF1C1A16)),
              gradient: night
                  ? const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF0B0A18), Color(0xFF04040A)])
                  : const RadialGradient(center: Alignment.topCenter, radius: 1.2, colors: [Color(0xFF17120B), Color(0xFF060606)]),
            ),
            child: body,
          ),
        ]),
      ),
    );
  }

  // ══ الرسم ══
  @override
  Widget build(BuildContext context) {
    if (!inRoom) {
      return GameShellFrame(
        child: switch (_pre) {
          'photo' => PhotoConsentQuestion(ask: const PhotoConsentAsk(), onContinue: (_) => setState(() { _pre = 'seat'; _syncOverlay(); })),
          'seat' => SeatChoiceQuestion(
              ask: const SeatChoiceAsk(maxPlayers: 10, freeSeats: [kMe]),
              onSubmit: (v) {
                if (v.trim() != '$kMe') { g.say('بقي مقعدٌ واحد على هذه الطاولة: ٥'); return; }
                setState(() { _pre = 'room'; _bi = 0; });
                _enterBeat();
              },
              onBack: g.defer,
            ),
          _ => const GameSpinner(label: 'جاري تخصيص مقعدك...', sub: 'يتم اختيار أفضل مقعد لك'),
        },
      );
    }
    final beatId = _beat.id;
    return Stack(children: [
      GameShellFrame(
        child: PlayerRoomV2(
          controller: sim,
          openGallery: _openGallery,
          openOrder: () => g.say('المنيو يفتح في اللعب الحقيقيّ: تطلب وأنت في مقعدك ويصلك الطلب.'),
          openNotes: () => g.say('المفكّرة تعمل في اللعب الحقيقيّ: تدوّن فيها شكوكك عن كلّ مقعد.'),
          topSlot: _hall(),
          voteHint: beatId == 'vote'
              ? const InlineWhisper(label: 'الدون', flow: true, text: 'المس مرشّحاً واحداً. صوتك يظهر للجميع برقم مقعدك. وفي التدريب تميل القاعة مع صوتك لترى ما يترتّب عليه.')
              : null,
        ),
      ),
      Positioned.fill(
        child: NightAskV2(
          controller: sim,
          openTasks: () => unawaited(openTasksV2(context, sim)),
          hint: beatId == 'night-ask' ? InlineWhisper(text: nightHint(R).text) : null,
        ),
      ),
    ]);
  }
}

/// بطاقة الإقصاء على شاشة القاعة: الرقم ثمّ وجه الدور (تنقلب بعد ٢٫٢ ث)
class _FlipCard extends StatelessWidget {
  const _FlipCard({required this.seat, this.faceUrl});
  final int seat;
  final String? faceUrl;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 3300),
        builder: (_, v, __) {
          final t = ((v * 3300 - 2200) / 1100).clamp(0.0, 1.0);
          final showFace = t > 0.5 && faceUrl != null;
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()..setEntry(3, 2, 0.002)..rotateY((showFace ? t - 1 : t) * 3.14159),
            child: Container(
              width: 54, height: 80, margin: const EdgeInsets.only(bottom: 4),
              decoration: BoxDecoration(color: const Color(0xFF14100A), border: Border.all(color: const Color(0x99C5A059)), borderRadius: BorderRadius.circular(4)),
              clipBehavior: Clip.antiAlias,
              alignment: Alignment.center,
              child: showFace
                  ? CachedNetworkImage(imageUrl: faceUrl!, fit: BoxFit.cover, width: 54, height: 80, errorWidget: (_, __, ___) => const SizedBox.shrink())
                  : Text('$seat', style: mono(16, color: kGdGold).copyWith(fontWeight: FontWeight.w800)),
            ),
          );
        },
      );
}
