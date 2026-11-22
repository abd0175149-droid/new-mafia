part of 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 🕴️ جلسةٌ معزولة لغرفة التدريب «ليلة تجريبيّة» (2026-11-22)
//
// نسخةٌ مستقلّة من المتحكّم — **ليست** `GameSessionController.instance` — تُغذّي
// واجهة الغرفة الحقيقيّة (PlayerRoomV2 وما تحته) بمشهدٍ مكتوب بدل المقبس، كما يفعل
// الويب بـ RoomHost مكتوب. لا تبدأ أبداً (`start` لا يُستدعى)، فلا مستمعين ولا مقبس.
//
// لماذا جزءٌ من مكتبة المتحكّم؟ لتضبط حالته الداخليّة مباشرة، فتعمل حساباتُ الواجهة
// كلّها كما هي (مانع المواجهة، ظهور زرّ السحب، فريق المافيا خلف البوّابة…) بدل
// نسخها. ما يذهب للخادم وحده يُستبدل: كلّ فعلٍ يُسلَّم لمدير المشهد.
//
// ضمانة العزل: `_roomId` فارغ، وكلّ إرسالٍ في المتحكّم مشروطٌ بغرفة — وما ليس
// مشروطاً مُستبدَلٌ هنا. لا رتبة، لا إحصاءات، لا تنبيه لموجّه، لا تقرير.
// ══════════════════════════════════════════════════════

typedef SimPicks = List<({String? abilityId, int? targetPhysicalId})>;

class SimSession extends GameSessionController {
  SimSession() : super._() {
    _step = GameStep.done;
    _roomId = '';
  }

  // ── أفعال اللاعب تُسلَّم لمن يدير المشهد ──
  Future<String?> Function(int index)? onVote;
  Future<bool> Function(SimPicks picks)? onOneNight;
  Future<String?> Function()? onTasksOpen;
  Future<bool> Function(int target)? onRequestConfrontation;
  Future<bool> Function(String id, bool accept)? onRespondConfrontation;
  Future<bool> Function(String id, String side)? onPulse;
  Future<bool> Function()? onWithdraw;
  VoidCallback? onLeave;
  List<String>? Function()? onRolesInPlay;

  bool _simDisposed = false;

  // ── ضبط المشهد (ثمّ `commit`) ──
  void simIdentity({required int seat, required String name, required String code, required String game}) {
    _physicalId = seat;
    _displayName = name;
    _roomCode = code;
    _gameName = game;
  }

  set simPhase(String? v) => _gamePhase = v;
  set simRound(int v) => _round = v;
  set simRole(String? v) { _assignedRole = v; _cardFlipped = false; }
  set simDead(bool v) => _isPlayerDead = v;
  set simRoster(List<RosterPlayer> v) => _roster = v;
  void simTeams(int? mafia, int? citizens, int? neutrals) { _teamMafia = mafia; _teamCitizens = citizens; _teamNeutrals = neutrals; }
  set simMafiaTeam(List<MafiaMate> v) => _mafiaTeam = v;
  set simSibling(SiblingInfo? v) => _sibling = v;
  set simContracts(AssassinContracts? v) => _assassinContracts = v;
  set simSheriff(List<SheriffResult> v) => _sheriffResults = v;
  void simOneNight(OneNightAsk? ask, {bool sent = false}) { _oneNight = ask; _oneNightSent = sent; }
  void simVoting(VotingState? v, {int? myVote, int? countdown}) { _voting = v; _myVote = myVote; _votingCountdown = countdown; }
  set simDiscussion(DiscussionState? v) => _discussion = v;
  void simConfrontation(ConfrontationState? v, {Map<String, String>? myPulse}) {
    _confrontation = v;
    if (myPulse != null) _myPulseVotes = myPulse;
  }
  void simJustification(JustificationData? v, {int? timer}) { _justification = v; _justTimer = timer; }
  set simWithdrawal(WithdrawalState v) => _withdrawal = v;
  void simElimination(List<int> eliminated, Map<int, String> revealed) { _eliminated = eliminated; _revealedRoles = revealed; }
  set simGameOver(Map<String, dynamic>? v) => _gameOverData = v;

  /// يُخطر الواجهة بعد دفعة ضبط
  void commit() { if (!_simDisposed) notifyListeners(); }

  // ── ما يذهب للخادم في اللعب الحقيقيّ ──
  @override
  Future<String?> castVoteV2(int index) async {
    final f = onVote;
    if (f == null) return null;
    _voteSubmitting = true;
    commit();
    try { return await f(index); } finally { _voteSubmitting = false; commit(); }
  }

  @override
  Future<bool> submitOneNight(List<({String? abilityId, int? targetPhysicalId})> picks) async {
    if (_oneNight == null || _oneNightSent) return false;
    return await onOneNight?.call(picks) ?? false;
  }

  @override
  Future<void> submitNightAction(int? targetPhysicalId) async {}

  @override
  Future<String?> requestTasksOpen() async => onTasksOpen == null ? null : await onTasksOpen!();

  @override
  Future<bool> requestConfrontation(int targetPhysicalId) async => await onRequestConfrontation?.call(targetPhysicalId) ?? false;

  @override
  Future<bool> respondConfrontation(String id, {required bool accept}) async => await onRespondConfrontation?.call(id, accept) ?? false;

  @override
  Future<bool> castPulse(String id, String side) async => await onPulse?.call(id, side) ?? false;

  @override
  Future<bool> withdrawVote() async {
    if (iWithdrew || _isPlayerDead) return false;
    return await onWithdraw?.call() ?? false;
  }

  @override
  Future<bool> createDeal(int targetPhysicalId) async {
    _dealError = 'الاتفاقيّات تُفتح من الجولة الثانية';
    commit();
    return false;
  }

  @override
  Future<bool> removeDeal(String dealId) async => false;

  @override
  Future<void> logout() async => onLeave?.call();

  @override
  bool announceGalleryOpen() => !_isPlayerDead;

  @override
  Future<void> loadChatHistory() async {}

  @override
  Future<void> loadVoteHistory() async {}

  @override
  Future<List<String>?> rolesInPlayIds() async => onRolesInPlay?.call();

  @override
  void dispose() {
    _simDisposed = true;
    super.dispose();
  }
}
