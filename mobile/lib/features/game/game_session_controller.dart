import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api/api_client.dart';
import '../../core/haptics/haptics_service.dart';
import '../../core/security/secure_screen.dart';
import '../../core/socket/socket_service.dart';
import '../../core/sound/turn_alert.dart';
import '../../models/card_template.dart' show kMafiaRoleIds;
import '../../models/game.dart';
import '../../models/night.dart';
import '../../models/notepad.dart';

// ══════════════════════════════════════════════════════
// 🎮 متحكّم جلسة اللعب — الملفّ 20
// ══════════════════════════════════════════════════════
// العمود الفقريّ لتجربة اللعب: يملك الاشتراك المركزيّ في أحداث الحالة،
// وبروتوكول الاستعادة، وحلقة الاستطلاع، وحارس المرحلة، وكل منطق الصمود.
//
// 🔴 لا يُنقل المصدر كـwidget واحد: `PlayerFlow.tsx` ٣٩٦٧ سطراً تجمع
//    المنطق والرسم. هنا **متحكّم** تقرؤه شاشات المراحل ولا تملكه.
//
// 🔒 ثابتٌ أمنيّ: اللاعب **لا يستقبل أبداً أدوار الآخرين**. الروستر
//    منقّى، والاستعادة والاستطلاع يعيدان دورَه هو وحده.

class GameSessionController extends ChangeNotifier with WidgetsBindingObserver {
  GameSessionController._();
  static final GameSessionController instance = GameSessionController._();

  // ── مفاتيح التخزين ──
  static const _kSession = 'mafia_session';
  static const _kHeldSeat = 'mafia_held_seat';
  static const _kUserExited = 'mafia_user_exited';

  /// حدثٌ من السوكِت يفوز على الاستطلاع لهذه المدّة، ثمّ يفوز الاستطلاع
  /// (فيشفي جهازاً فاته حدث الانتقال). بدونه ترتدّ المراحل وتومض.
  static const _pollEvery = Duration(seconds: 3);

  // ══════════════════════════════════════════════════════
  // الحالة
  // ══════════════════════════════════════════════════════
  GameStep _step = GameStep.code;
  GameStep get step => _step;

  String _roomId = '';
  String _roomCode = '';
  String _gameName = '';
  String get roomId => _roomId;
  String get roomCode => _roomCode;
  String get gameName => _gameName;

  int _physicalId = 0;
  String _displayName = '';
  int? _playerId;
  String? _phone;
  int get physicalId => _physicalId;
  String get displayName => _displayName;

  String? _gamePhase;
  String? get gamePhase => _gamePhase;

  String? _assignedRole;
  String? get assignedRole => _assignedRole;

  bool _isPlayerDead = false;
  bool get isPlayerDead => _isPlayerDead;

  bool _cardFlipped = false;
  bool get cardFlipped => _cardFlipped;

  /// 🔒 البطاقة قابلةٌ للقلب في نافذة كشف الدور وحدها — أي قبل بدء اللعب.
  ///    بعدها تُقفل على وجهها العلنيّ.
  bool get cardLocked =>
      _gamePhase != null && !GamePhase.isPreGame(_gamePhase);
  set cardFlipped(bool v) {
    if (_cardFlipped == v) return;
    _cardFlipped = v;
    notifyListeners();
  }

  bool _roleAlert = false;
  bool get roleAlert => _roleAlert;
  void dismissRoleAlert() {
    if (!_roleAlert) return;
    _roleAlert = false;
    notifyListeners();
  }

  List<MafiaMate> _mafiaTeam = const [];
  List<MafiaMate> get mafiaTeam => _mafiaTeam;

  SiblingInfo? _sibling;
  SiblingInfo? get sibling => _sibling;

  /// 🔒 بوابة §4.6: الفريق والأخ يُصفَّران ما لم يكن الدور الحاليّ مافياوياً
  ///    — يمنع تسرّب فريقٍ محفوظٍ من جيمٍ سابق إلى مواطنٍ في الجيم الحالي.
  ///    (بعد تحوّل الأخ الأصغر يصير دوره مافياوياً فتظهر القائمة طبيعياً.)
  bool get _mafiaGate =>
      _assignedRole != null && kMafiaRoleIds.contains(_assignedRole);

  List<MafiaMate> get galleryTeam => _mafiaGate ? _mafiaTeam : const [];
  SiblingInfo? get gallerySibling => _mafiaGate ? _sibling : null;
  bool get isAssassin => _assignedRole == 'ASSASSIN';

  bool _mafiaChatEnabled = false;
  bool get mafiaChatEnabled => _mafiaChatEnabled;

  List<RosterPlayer> _roster = const [];
  List<RosterPlayer> get roster => _roster;

  // ══════════════════════════════════════════════════════
  // 🌙 حالة الليل — §6.1 في الملفّ ٢٣
  // ══════════════════════════════════════════════════════
  NightActionRequest? _night;
  NightActionRequest? get nightAction => _night;

  int _nightCountdown = 0;
  int get nightCountdown => _nightCountdown;

  bool _nightSubmitted = false;
  bool get nightSubmitted => _nightSubmitted;

  bool _nursePending = false;
  bool get nursePending => _nursePending;

  /// «جارٍ اختيار الهدف من قبل …» — يصل في النمط اليدوي وحده.
  String _nightStepRoleName = '';
  String get nightStepRoleName => _nightStepRoleName;

  Timer? _nightTicker;
  Timer? _nightClose;

  // ══════════════════════════════════════════════════════
  // 🎤 النقاش — §4.2 في الملفّ ٢٥
  // ══════════════════════════════════════════════════════
  DiscussionState? _discussion;
  DiscussionState? get discussion => _discussion;

  bool get isMyTurnToSpeak =>
      _discussion?.currentSpeakerId != null &&
      _discussion!.currentSpeakerId == _physicalId;

  /// آخر متحدّثٍ عُولج — لإطلاق التنبيه على **الانتقال** لا على كلّ مزامنة.
  int? _lastSpeakerSeen;

  // ══════════════════════════════════════════════════════
  // 🤝 الاتفاقيات — §4.2 في الملفّ ٢٥
  // ══════════════════════════════════════════════════════
  List<Deal> _deals = const [];
  List<Deal> get deals => _deals;

  /// من سجّل اتفاقيةً هذه الجولة أو التي قبلها — يصل من الخادم جاهزاً.
  List<int> _dealLocked = const [];
  List<int> get dealLockedPlayers => _dealLocked;

  int _round = 1;
  int get round => _round;

  Deal? get myDeal => _deals
      .where((d) => d.initiatorPhysicalId == _physicalId)
      .firstOrNull;

  /// الأسباب مرتّبةٌ كما يفحصها المحرّك — أوّل مانعٍ هو المعروض.
  String? get dealBlockReason {
    if (_isPlayerDead) return 'المُقصى لا يُبرم اتفاقيات';
    if (_round <= 1) {
      return 'الاتفاقيات غير متاحة في الجولة الأولى.\n'
          'سيبدأ تفعيل ميزة الديل تلقائياً بدءاً من الجولة الثانية.';
    }
    if (_dealLocked.contains(_physicalId)) {
      return 'سجّلت اتفاقيةً في جولةٍ قريبة — لا تسجيل في جولتين متتاليتين.';
    }
    if (_deals.length >= 3) {
      return 'تم الوصول للحد الأقصى للاتفاقيات في هذه الجولة (3/3)\n'
          'لا يمكن إرسال اتفاقيات جديدة حالياً';
    }
    return null;
  }

  /// مستهدفٌ في اتفاقيةٍ قائمة ⇒ لا يُختار (القبول للأسرع).
  bool isDealTargeted(int physicalId) =>
      _deals.any((d) => d.targetPhysicalId == physicalId);

  String? _dealError;
  String? get dealError => _dealError;

  bool _dealBusy = false;
  bool get dealBusy => _dealBusy;

  // ══════════════════════════════════════════════════════
  // ⚖️ التبرير والانسحاب — §4.3 في الملفّ ٢٥
  // ══════════════════════════════════════════════════════
  JustificationData? _justification;
  JustificationData? get justification => _justification;

  int? _justTimer;
  int? get justTimer => _justTimer;
  Timer? _justTicker;
  DateTime? _justDeadline;

  WithdrawalState _withdrawal = const WithdrawalState();
  WithdrawalState get withdrawal => _withdrawal;

  bool _withdrawBusy = false;
  bool get withdrawBusy => _withdrawBusy;

  bool get iWithdrew => _withdrawal.didIWithdraw(_physicalId);

  /// بطاقة السحب تظهر متى **فُتحت النافذة أو انتهى وقت الدفاع**، ولمن
  /// صوّت على المتهم وحده وهو حيّ. من لم يصوّت ليس له ما يسحبه.
  bool get canShowWithdrawal {
    final j = _justification;
    if (j == null || _isPlayerDead) return false;
    if (!j.didIVote(_physicalId)) return false;
    return _withdrawal.active || _justTimer == 0 || j.timerFinished;
  }

  /// النِّصاب: ما يرسله الخادم، وإلّا نصف المصوّتين مجبوراً لأعلى.
  int get withdrawalNeeded => _withdrawal.needed > 0
      ? _withdrawal.needed
      : ((_justification?.votersForAccused.length ?? 0) + 1) ~/ 2;

  // ══════════════════════════════════════════════════════
  // 🎩 العمدة — §4.7 في الملفّ ٢٥
  // ══════════════════════════════════════════════════════
  MayorPrompt? _mayorPrompt;
  MayorPrompt? get mayorPrompt => _mayorPrompt;

  int _mayorPromptLeft = 0;
  int get mayorPromptLeft => _mayorPromptLeft;
  Timer? _mayorTicker;

  bool _mayorSending = false;
  bool get mayorSending => _mayorSending;

  MayorReveal? _mayorBanner;
  MayorReveal? get mayorBanner => _mayorBanner;
  Timer? _mayorBannerTimer;

  int? _mayorRevealedId;
  int? get mayorRevealedId => _mayorRevealedId;

  int _mayorWeight = 2;
  int get mayorWeight => _mayorWeight;

  // ══════════════════════════════════════════════════════
  // 📝 المفكرة ودردشة المافيا — الملفّ ٢٦
  // ══════════════════════════════════════════════════════
  Notepad _notepad = const Notepad();
  Notepad get notepad => _notepad;

  String get _notesKey => 'mafia_notes_${_roomId}_$_physicalId';

  /// إيموجي الاشتباه لبطاقة الاقتراع — مصدره المفكرة المحلّية وحدها.
  String? suspicionEmoji(int physicalId) =>
      _notepad.noteOf(physicalId).suspicion.emoji;

  void saveNote(int physicalId, PlayerNote note) {
    _notepad = _notepad.withNote(physicalId, note);
    _persistNotes();
    notifyListeners();
  }

  void deleteNote(int physicalId) {
    _notepad = _notepad.without(physicalId);
    _persistNotes();
    notifyListeners();
  }

  void clearAllNotes() {
    _notepad = const Notepad();
    _persistNotes();
    notifyListeners();
  }

  void _persistNotes() {
    if (_roomId.isEmpty) return;
    unawaited(_prefs?.setString(_notesKey, _notepad.encode()) ?? Future.value());
  }

  void _loadNotes() {
    if (_roomId.isEmpty) return;
    _notepad = Notepad.decode(_prefs?.getString(_notesKey));
  }

  List<MafiaChatMessage> _chat = const [];
  List<MafiaChatMessage> get chat => _chat;

  bool _chatUnread = false;
  bool get chatUnread => _chatUnread;

  bool _chatSending = false;
  bool get chatSending => _chatSending;

  /// 🔒 شرط ظهور تبويب التشاور — منقولٌ حرفياً.
  ///
  /// الشرط الأخير (`|| mafiaTeam.isNotEmpty`) ليس تراخياً: الأخ الأصغر
  /// بعد تحوّله يصير دورُه مافياوياً ويصله الفريق، وقد يسبق وصولُ الفريق
  /// تحديثَ دوره المحليّ. والخادم يتحقّق من كلّ رسالةٍ على حدة، فالواجهة
  /// المتساهلة هنا لا تفتح ثغرة.
  bool get chatVisible =>
      _mafiaChatEnabled &&
      !_isPlayerDead &&
      (kMafiaRoleIds.contains(_assignedRole ?? '') || _mafiaTeam.isNotEmpty);

  void markChatRead() {
    if (!_chatUnread) return;
    _chatUnread = false;
    notifyListeners();
  }

  Future<void> loadChatHistory() async {
    if (!chatVisible || _roomId.isEmpty) return;
    final res = await SocketService.instance
        .ask('mafia:chat-history', {'roomId': _roomId});
    if (res?['success'] != true) return;
    _chat = MafiaChatMessage.listOf(res!['messages']);
    notifyListeners();
  }

  Future<bool> sendChat(String text) async {
    final t = text.trim();
    if (t.isEmpty || _chatSending || !chatVisible) return false;
    _chatSending = true;
    notifyListeners();
    try {
      final res = await SocketService.instance.ask('mafia:chat-send', {
        'roomId': _roomId,
        // السقف على العميل أيضاً — الخادم يقصّ، والقصّ الصامت يُربك
        'text': t.length > kChatMaxLen ? t.substring(0, kChatMaxLen) : t,
      });
      return res?['success'] == true;
    } finally {
      _chatSending = false;
      notifyListeners();
    }
  }

  // ══════════════════════════════════════════════════════
  // ☀️ أحداث الصباح الشخصية — §4.7 في الملفّ ٢٤
  // ══════════════════════════════════════════════════════
  List<MorningEvent> _morning = const [];

  /// 🔒 **الشخصية وحدها**: ما استهدفني أنا. والإسكات والحماية يُستبعدان
  ///    من القائمة (لهما مساراهما) — كما يفعل المصدر حرفياً.
  List<MorningEvent> get myMorningEvents => _morning
      .where((e) =>
          e.targetPhysicalId == _physicalId &&
          e.type != 'SILENCE' &&
          e.type != 'PROTECTION')
      .toList(growable: false);

  bool get amIKilled => myMorningEvents.any((e) => e.isKill);

  VotingState? _voting;
  VotingState? get voting => _voting;

  int? _myVote;
  int? get myVote => _myVote;

  bool _votingComplete = false;
  bool get votingComplete => _votingComplete;

  int? _votingCountdown;
  int? get votingCountdown => _votingCountdown;

  DateTime? _lastVoteAt;
  bool _voteSubmitting = false;

  /// 🔴 نافذة تغيير الصوت **عشر ثوانٍ** — في مسار `done` وحده.
  ///    من عاد بعد انقطاع (`rejoined`) يغيّر بحريّة حتى اكتمال الاقتراع:
  ///    لأنّه لم يشهد بدء النافذة أصلاً، فحصرُه بها يحرمه صوتاً لم يملك
  ///    فرصة إعطائه. الفرق سلوكيٌّ مقصود في المصدر — يُنقل كما هو.
  static const _voteWindow = Duration(seconds: 10);

  bool get voteWindowOpen {
    final t = _lastVoteAt;
    return t != null && DateTime.now().difference(t) < _voteWindow;
  }

  int get voteWindowSecondsLeft {
    final t = _lastVoteAt;
    if (t == null) return 0;
    final left = 10 - DateTime.now().difference(t).inSeconds;
    return left < 0 ? 0 : left;
  }

  bool get canVote => _step == GameStep.rejoined
      ? !_votingComplete
      : (_myVote == null || voteWindowOpen) &&
          (_votingCountdown == null || _votingCountdown! > 0);

  Map<String, dynamic>? _gameOverData;
  Map<String, dynamic>? get gameOverData => _gameOverData;

  // ══════════════════════════════════════════════════════
  // 🎬 حالة طاولة الحلقة — §7.2 في الملفّ ٢٧
  // ══════════════════════════════════════════════════════
  // الطاولة **لا تُصدر emits ولا تشترك بالسوكِت بنفسها**: المتحكّم يملك
  // القناة الوحيدة، والطاولة ويدجت خالصة تُغذّى بالخصائص. هذا يمنع
  // ازدواج المستمعات عند تركيبها في شاشتين (اللاعب والمضيف).

  Set<int> _silencedPids = const {};
  Set<int> get silencedPids => _silencedPids;

  GameTimerSnapshot? _gameTimer;
  GameTimerSnapshot? get gameTimer => _gameTimer;

  int? _teamCitizens, _teamMafia;
  int? get teamCitizens => _teamCitizens;
  int? get teamMafia => _teamMafia;

  /// عدّادٌ يتزايد مع كلّ `day:elimination-revealed` — الطاولة تراقبه
  /// لتشغيل سلسلة الكشف مرّةً واحدة لكلّ بثّ.
  int _revealTicket = 0;
  int get revealTicket => _revealTicket;

  /// بانر الصباح المشتقّ من أحداث الحماية وحدها (§4.9).
  MorningBanner? _tableBanner;
  MorningBanner? get tableBanner => _tableBanner;
  void dismissTableBanner() {
    if (_tableBanner == null) return;
    _tableBanner = null;
    notifyListeners();
  }

  void _readTeamCounts(dynamic v) {
    final t = parseTeamCounts(v);
    if (t.citizens != null) _teamCitizens = t.citizens;
    if (t.mafia != null) _teamMafia = t.mafia;
  }

  /// النسخة المُنمذَجة من نفس الحمولة (§8 في الملفّ ٢٧).
  ///
  /// 🔒 `neutralResults` تعيش هنا ولا تُرسَم في أيّ ويدجت — شاشة العرض
  ///    الكبيرة وحدها تعرضها. نمذجتها تمنع اختراع واجهةٍ لها لاحقاً.
  GameOverReveal? _gameOver;
  GameOverReveal? get gameOver => _gameOver;

  AssassinContracts? _assassinContracts;
  AssassinContracts? get assassinContracts => _assassinContracts;

  bool _isRemote = false;
  bool _allowPlayerInvites = false;
  bool get isRemote => _isRemote;
  bool get allowPlayerInvites => _allowPlayerInvites;

  /// بيانات المراحل التي ترسمها ملفّات أخرى (٢٤ · ٢٥ · ٢٧).
  Map<String, dynamic> _phaseData = const {};
  Map<String, dynamic> get phaseData => _phaseData;

  List<VoteCandidate> _tied = const [];
  List<VoteCandidate> get tiedCandidates => _tied;

  List<int> _eliminated = const [];
  List<int> get eliminated => _eliminated;

  /// 🔴 يبقى فارغاً حتى يكشف الليدر — ظهورُ الدور قبل أمره يفسد الجولة.
  Map<int, String> _revealedRoles = const {};
  Map<int, String> get revealedRoles => _revealedRoles;

  // ── طبقات على مستوى الجلسة ──
  bool _restoring = false;
  bool get restoring => _restoring;

  String? _seatChangeAlert;
  String? get seatChangeAlert => _seatChangeAlert;

  /// 🪑 عدّادُ إعادة ترتيب المقاعد. الأوراق المفتوحة (المفكرة) تراقبه
  ///    لتُسقط أيّ **اختيارٍ معلّقٍ مفهرسٍ بمقعد** — فالمقعد الذي اختاره
  ///    اللاعب قبل لحظةٍ صار يدلّ على شخصٍ آخر.
  int _seatsRemapTicket = 0;
  int get seatsRemapTicket => _seatsRemapTicket;

  /// رسالة آخر رفضِ هويّةٍ من الخادم — تُعرض على شاشة الدخول كما هي.
  String? _rejoinError;
  String? get rejoinError => _rejoinError;

  bool _isExpelled = false;
  String? _expulsionReason;
  bool get isExpelled => _isExpelled;
  String? get expulsionReason => _expulsionReason;

  String? _apiError;
  String? get apiError => _apiError;
  void clearApiError() {
    if (_apiError == null) return;
    _apiError = null;
    notifyListeners();
  }

  // ── داخليّ ──
  final _guard = PhaseGuard();
  Timer? _poll;
  Timer? _voteTicker;
  Timer? _seatAlertTimer;
  Timer? _safetyNet;
  final _subs = <String, void Function(dynamic)>{};
  bool _started = false;
  SharedPreferences? _prefs;

  /// يُشغَّل حين يصير `physicalId` معروفاً — تستعمله شاشات المراحل.
  int get mySeat => _physicalId;

  // ══════════════════════════════════════════════════════
  // مدخلات الدخول وحالته — يقودها تدفّق الملفّ 21
  // ══════════════════════════════════════════════════════
  String roomCodeInput = '';
  String ticketInput = '';

  bool _busy = false;
  bool get busy => _busy;
  void setBusy(bool v) {
    if (_busy == v) return;
    _busy = v;
    notifyListeners();
  }

  int _maxPlayers = 10;
  bool _requireTicket = false;
  int get maxPlayers => _maxPlayers;
  bool get requireTicket => _requireTicket;

  SwitchConfirm? _switchConfirm;
  SwitchConfirm? get switchConfirm => _switchConfirm;

  String? _joinConfirmation;
  String? get joinConfirmation => _joinConfirmation;

  /// يُرفَع حين يمنع الخادم الانضمام لاستبياناتٍ معلّقة — الشاشة تحوّل.
  bool _feedbackRedirect = false;
  bool get feedbackRedirect => _feedbackRedirect;
  void requestFeedbackRedirect() {
    _feedbackRedirect = true;
    notifyListeners();
  }

  void consumeFeedbackRedirect() => _feedbackRedirect = false;

  void setStep(GameStep s) {
    if (_step == s) return;
    _step = s;
    notifyListeners();
  }

  void setApiError(String? e) {
    _apiError = e;
    notifyListeners();
  }

  void applyFoundRoom({
    required String roomId,
    required String roomCode,
    required String gameName,
    required int maxPlayers,
    required bool requireTicket,
  }) {
    _roomId = roomId;
    _roomCode = roomCode;
    _gameName = gameName;
    _maxPlayers = maxPlayers;
    _requireTicket = requireTicket;
    notifyListeners();
  }

  void openJoinConfirmation(String message) {
    _joinConfirmation = message;
    notifyListeners();
  }

  void closeJoinConfirmation() {
    _joinConfirmation = null;
    notifyListeners();
  }

  void openSwitchConfirm({
    required String currentRoomId,
    required String currentRoomName,
    required String targetRoomId,
  }) {
    _switchConfirm = SwitchConfirm(
      currentRoomId: currentRoomId,
      currentRoomName: currentRoomName,
      targetRoomId: targetRoomId,
    );
    notifyListeners();
  }

  void closeSwitchConfirm() {
    _switchConfirm = null;
    notifyListeners();
  }

  /// قبل الانتقال إلى غرفةٍ أخرى: تُمسح الجلسة وتُصفَّر حالة الجولة كي لا
  /// يحمل اللاعب دورَه القديم إلى الطاولة الجديدة.
  Future<void> prepareSwitchTo(String targetRoomId) async {
    await _clearSession();
    _resetGameState();
    _roomId = targetRoomId;
    _physicalId = 0;
    _switchConfirm = null;
    notifyListeners();
  }

  /// بعد نجاح `room:auto-join`.
  Future<void> applyJoined({
    required String roomId,
    required int seat,
    required String name,
    required String phone,
    int? playerId,
    bool isRemote = false,
    String gameName = '',
  }) async {
    _roomId = roomId;
    _physicalId = seat;
    _displayName = name;
    _phone = phone;
    _playerId = playerId;
    _isRemote = isRemote;
    if (gameName.isNotEmpty) _gameName = gameName;
    _joinConfirmation = null;

    await _saveSession();
    await _prefs?.remove(_kUserExited);
    await _prefs?.remove(_kHeldSeat);

    _step = GameStep.done;
    notifyListeners();
    _startPolling();
  }

  /// غرفةٌ نشطة من `/api/player-auth/me` — المرحلة الثانية من الاستعادة.
  Future<Map<String, dynamic>?> fetchActiveGame() async {
    try {
      final r = await ApiClient.instance.get('/api/player-auth/me');
      if (r is! Map || r['success'] != true) return null;
      final g = r['activeGame'];
      return g is Map ? Map<String, dynamic>.from(g) : null;
    } catch (_) {
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // الإقلاع والإيقاف
  // ══════════════════════════════════════════════════════
  Future<void> start() async {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    _wireCaptureDetection();
    _prefs = await SharedPreferences.getInstance();
    _listen();
    await _bootRejoin();
  }

  @override
  void dispose() {
    _teardown();
    super.dispose();
  }

  /// 🔴 كل اشتراكٍ يُلغى هنا. المصدر يسجّل مستمعَي الليل بلا تنظيف
  ///    فيتسرّبان عند إعادة التركيب — عيبٌ لا يُنقل.
  void _teardown() {
    if (!_started) return;
    _started = false;
    WidgetsBinding.instance.removeObserver(this);
    for (final e in _subs.entries) {
      SocketService.instance.off(e.key, e.value);
    }
    _subs.clear();
    _poll?.cancel();
    _voteTicker?.cancel();
    _seatAlertTimer?.cancel();
    _safetyNet?.cancel();
    _nightTicker?.cancel();
    _nightClose?.cancel();
    _justTicker?.cancel();
    _mayorTicker?.cancel();
    _mayorBannerTimer?.cancel();
  }

  void _on(String event, void Function(dynamic) handler) {
    _subs[event] = handler;
    SocketService.instance.on(event, handler);
  }

  // ══════════════════════════════════════════════════════
  // 6.5 حارس المرحلة
  // ══════════════════════════════════════════════════════
  void _setPhase(String? phase, {required bool fromSocket}) {
    if (fromSocket) {
      _guard.arm(phase);
      _applyPhase(phase);
      return;
    }
    // من الاستطلاع: يُكتب فقط إن سمح الحارس
    if (_guard.allows(phase)) _applyPhase(phase);
  }

  bool get _overrideActive => _guard.isActive;

  void _applyPhase(String? phase) {
    if (_gamePhase == phase) return;
    final was = _gamePhase;
    _gamePhase = phase;

    // ── نظافة المرحلة ──
    //
    // 🔴 تُطبَّق على **بدء جولةٍ جديدة** فقط: أي رجوعٍ من طورِ لعبٍ إلى
    //    ما قبله. الويب يمسح داخل مستمع `game:phase-changed` وحده، فلا
    //    يمسّ استعادةَ جلسةٍ أبداً.
    //
    //    الشرط `was != null` هو الجوهر: على الإقلاع تكون المرحلة مجهولة،
    //    فالانتقال `null → ROLE_BINDING` ليس «جولةً جديدة» بل «عرفتُ
    //    المرحلة الحالية». بدونه كانت الاستعادة تكتب الفريق والدور من
    //    ردّ الخادم ثمّ تمسحهما في السطر التالي من نفس الردّ — فيرى
    //    المافيويّ الواجهةَ التمويهية بدل شركائه. حدث فعلاً على الطاولة.
    //
    //    والشرط `!isPreGame(was)` يمنع مسحاً بلا داعٍ في
    //    `ROLE_GENERATION → ROLE_BINDING` (لا شيء قديمٌ يُسرَّب بينهما).
    if (GamePhase.isPreGame(phase) &&
        was != null &&
        !GamePhase.isPreGame(was)) {
      _mafiaTeam = const [];
      _sibling = null;
      _assignedRole = null;
      _gameOverData = null; _gameOver = null;
      _mayorRevealedId = null;
      _mayorBanner = null;
      _justification = null;
      _withdrawal = const WithdrawalState();
      // 🔒 ملاحظات جيمٍ سابق عن لاعبين بأدوارٍ أخرى تضلّل لا تفيد
      _notepad = const Notepad();
      _persistNotes();
      _chat = const [];
      _chatUnread = false;
      _morning = const [];
      // 🔒 الثابت السادس (٢٧ §4.7): كشوفُ الإقصاء تُمسح مع الجيم الجديد.
      //    بقاؤها يعرض أدوار جيمٍ مضى على لاعبين يحملون أدواراً أخرى
      //    الآن — تسريبٌ وتضليلٌ معاً.
      _revealedRoles = const {};
      _eliminated = const [];
      // الثابت السادس يشمل حالة الطاولة كذلك (٢٧ §4.7 بند ٦)
      _silencedPids = const {};
      _tableBanner = null;
      _gameTimer = null;
      _teamCitizens = null;
      _teamMafia = null;
    }

    // 🔇 الإسكات يدوم يوماً واحداً: يُمسَح ببدء الليل (٢٧ §4.7 بند ٥).
    //    إبقاؤه يجعل شارة «مُسكَت» تلاحق اللاعب جولاتٍ بعد انقضائها.
    if (phase == GamePhase.night && was != phase) {
      _silencedPids = const {};
      _tableBanner = null;
    }

    // 🔒 ببدء اللعب تعود البطاقة إلى **وجهها العلنيّ** (الاسم والصورة
    //    والرقم) وتُقفل. إبقاؤها مكشوفةً على وجه الدور طوال الجولة يعرض
    //    دورَ اللاعب لكلّ من جلس بجانبه — والكشف كان لثانيةٍ ليعرف دوره
    //    لا ليبقى معروضاً. القفل في `cardLocked`.
    if (!GamePhase.isPreGame(phase) && phase != null) _cardFlipped = false;
    if (!GamePhase.keepsVoting(phase)) _clearVoting();
    notifyListeners();
  }

  void _clearVoting() {
    _voteTicker?.cancel();
    _voteTicker = null;
    _voting = null;
    _myVote = null;
    _lastVoteAt = null;
    _votingComplete = false;
    _votingCountdown = null;
    _tied = const [];
  }

  // ══════════════════════════════════════════════════════
  // 6.3 بروتوكول الاستعادة
  // ══════════════════════════════════════════════════════
  Future<void> _bootRejoin() async {
    // خرج بإرادته ⇒ لا استعادة
    if (_prefs?.getString(_kUserExited) == 'true') return;

    final saved = _readSession();
    if (saved == null || !saved.isUsable) return;

    _restoring = true;
    notifyListeners();

    // 🔴 الاستعادة **تنتظر اتصال السوكِت**. على بدءٍ بارد يُنشأ الاتصال
    //    غير متزامن، ونداءٌ قبله يعود فارغاً فوراً — فتُقرأ الجلسة فاسدةً
    //    وتُمسح، ويخرج اللاعب من غرفته لأن هاتفه أقلع فحسب.
    final connected = await _awaitSocket();

    if (connected) {
      final r = await rejoinDetailed(
        roomId: saved.roomId,
        physicalId: saved.physicalId,
        phone: saved.phone,
        playerId: saved.playerId,
      );
      // 🔒 لا تُمسح الجلسة إلّا حين **يقول الخادم صراحةً** إنها لم تعد
      //    قائمة. تعذُّر الوصول ليس رفضاً.
      if (r == RejoinResult.rejected) await _clearSession();
      // 🪪 والمقعد المحفوظ لم يعد يعرّفني ⇒ إلى شاشة الدخول برسالة الخادم
      if (r == RejoinResult.identityRequired) await identityRequired();
    }

    _restoring = false;
    notifyListeners();
  }

  /// ينتظر اتصال السوكِت بمهلةٍ — ولا يعلّق الشاشة إن لم يأتِ.
  Future<bool> _awaitSocket(
      [Duration timeout = const Duration(seconds: 8)]) async {
    final sig = SocketService.instance.connected;
    if (sig.value) return true;
    final c = Completer<bool>();
    void listener() {
      if (sig.value && !c.isCompleted) c.complete(true);
    }

    sig.addListener(listener);
    final t = Timer(timeout, () {
      if (!c.isCompleted) c.complete(false);
    });
    final ok = await c.future;
    t.cancel();
    sig.removeListener(listener);
    return ok;
  }

  /// (أ) الإقلاع · (ب) إعادة الاتصال · (ج) «ابقَ هنا» عند تبديل الغرفة.
  ///
  /// 🔴 `physicalId: 0` يعني **بحثاً بالهاتف** عند الخادم.
  Future<bool> rejoin({
    required String roomId,
    required int physicalId,
    String? phone,
    int? playerId,
  }) async =>
      await rejoinDetailed(
          roomId: roomId,
          physicalId: physicalId,
          phone: phone,
          playerId: playerId) ==
      RejoinResult.ok;

  /// 🔒 يفرّق **الرفض** (الخادم ردّ `success:false` ⇒ الجلسة لم تعد قائمة)
  ///    عن **التعذّر** (لا ردّ ⇒ شبكة أو انقطاع). الأوّل وحده يُبرّر مسح
  ///    الجلسة؛ والثاني يُعاد بعده لا يُعاقَب عليه اللاعب.
  Future<RejoinResult> rejoinDetailed({
    required String roomId,
    required int physicalId,
    String? phone,
    int? playerId,
  }) async {
    // 🪪 الحساب أقوى من الهاتف وأقوى من المقعد — يرسله كلّ جهازٍ مسجَّل،
    //    والخادم يرتّب: حساب ← هاتف ← مقعد (بشروط صارمة).
    final pid = playerId ?? _playerId;
    final res = await SocketService.instance.ask('room:rejoin-player', {
      'roomId': roomId,
      'physicalId': physicalId,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      if (pid != null && pid > 0) 'playerId': pid,
    });
    if (res == null) return RejoinResult.unreachable;
    if (res['success'] != true) {
      // ⛔ لم تُحسم الهويّة: المقعد بعد النقل لم يعد يعرّف صاحبه
      if (res['code'] == 'IDENTITY_REQUIRED') {
        _rejoinError = '${res['error'] ?? ''}';
        return RejoinResult.identityRequired;
      }
      return RejoinResult.rejected;
    }
    _rejoinError = null;

    _roomId = roomId;
    _gameName = '${res['gameName'] ?? _gameName}';

    final p = res['player'];
    if (p is Map) {
      final pl = Map<String, dynamic>.from(p);
      _physicalId = (pl['physicalId'] as num?)?.toInt() ?? _physicalId;
      _displayName = '${pl['name'] ?? _displayName}';
      _playerId = (pl['playerId'] as num?)?.toInt() ?? _playerId;
      if (pl['role'] != null) _assignedRole = '${pl['role']}';
      // ميتٌ ⇒ بطاقته مكشوفة
      if (pl['isAlive'] == false) {
        _isPlayerDead = true;
        _cardFlipped = true;
      }
    }
    _phone = phone ?? _phone;

    // 🔒 الفريق والتوأم يُكتبان فقط إن أرسلهما الخادم — الغياب ليس فراغاً
    if (res.containsKey('mafiaTeam')) {
      _mafiaTeam = MafiaMate.listOf(res['mafiaTeam']);
    }
    if (res.containsKey('sibling')) {
      _sibling = res['sibling'] is Map
          ? SiblingInfo.fromJson(Map<String, dynamic>.from(res['sibling'] as Map))
          : null;
    }
    if (res['assassinContracts'] != null) {
      _assassinContracts = AssassinContracts.fromJson(res['assassinContracts']);
    }
    if (res['mafiaChatEnabled'] is bool) {
      _mafiaChatEnabled = res['mafiaChatEnabled'] as bool;
    }

    if (res['phase'] != null) _setPhase(GamePhase.map(res['phase']), fromSocket: false);

    final vs = res['votingState'];
    if (vs is Map && _gamePhase == GamePhase.dayVoting) {
      _restoreVoting(Map<String, dynamic>.from(vs));
    }

    await _saveSession();
    await _prefs?.remove(_kUserExited);

    _loadNotes();
    _step = GameStep.rejoined;
    notifyListeners();
    _startPolling();
    _armSafetyNet();
    return RejoinResult.ok;
  }

  /// 6.6 شبكة أمانٍ بعد الاستعادة — استطلاعٌ واحد بعد ٥٠٠ms.
  void _armSafetyNet() {
    _safetyNet?.cancel();
    _safetyNet = Timer(const Duration(milliseconds: 500), _pollOnce);
  }

  // ══════════════════════════════════════════════════════
  // 6.4 الاستطلاع
  // ══════════════════════════════════════════════════════
  void _startPolling() {
    _poll?.cancel();
    if (!_step.inGame || _roomId.isEmpty) return;
    _pollOnce();
    _poll = Timer.periodic(_pollEvery, (_) => _pollOnce());
  }

  // ══ 🕵️ مكافحة الغش — تتبّع السلوك ═══════════════════════
  bool _secretOpen = false;          // شاشةٌ سريّة مفتوحة الآن (معرض/بطاقة)
  DateTime? _bgAt;                   // لحظة مغادرة التطبيق
  bool _bgSecretOpen = false;        // هل كان السرّ مفتوحاً وقت المغادرة

  String get _platform =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  /// وسمُ العلامة المائيّة: يفضح مسرّب أيّ لقطة.
  String get secretWatermarkLabel {
    final code = _roomCode.isNotEmpty ? _roomCode : '···';
    final t = DateTime.now();
    final hh = t.hour.toString().padLeft(2, '0');
    final mm = t.minute.toString().padLeft(2, '0');
    return '$_displayName · مقعد $_physicalId · $code · $hh:$mm';
  }

  /// تُستدعى عند فتح شاشةٍ سريّة (المعرض/البطاقة): تفعّل الحماية الأصليّة.
  void enterSecretScreen() {
    _secretOpen = true;
    SecureScreen.instance.enter();
  }

  /// تُستدعى عند إغلاقها.
  void leaveSecretScreen() {
    _secretOpen = false;
    SecureScreen.instance.leave();
  }

  /// يربط كشف اللقطة/التسجيل الأصليّ (iOS) ببثٍّ للّيدر. يُستدعى مرّةً في التهيئة.
  void _wireCaptureDetection() {
    SecureScreen.instance.onCaptureDetected = (kind) {
      if (!_step.inGame || _roomId.isEmpty) return;
      if (kind == 'screenshot') {
        SocketService.instance.emit('cheat:screenshot', {'platform': _platform});
      } else {
        SocketService.instance.emit('cheat:screen-recording', {'active': true, 'platform': _platform});
      }
    };
  }

  /// 📌 يتوقّف في الخلفية توفيراً للبطارية، ويُستأنف بنداءٍ فوريّ.
  /// 🕵️ ويرصد مغادرة التطبيق أثناء المباراة (نمط تهريب محتمل).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_step.inGame && _roomId.isNotEmpty) {
        // بثّ مغادرةٍ إن كانت ذات دلالة (غاب مطوّلاً أو والسرّ مفتوح)
        if (_bgAt != null) {
          final durMs = DateTime.now().difference(_bgAt!).inMilliseconds;
          // ⏱️ العتبة ١.٥ث لا ٤ث: إرسال اسمٍ يستغرق ثلاثاً، فكانت القديمة تُسقط
          //    أسرع تسريبٍ وأنظفه. و١٥٠٠ هي أرضية محرّك الارتباط نفسها.
          if (_bgSecretOpen || durMs > 1500) {
            SocketService.instance.emit('cheat:app-departure', {
              'durationMs': durMs,
              'secretOpen': _bgSecretOpen,
              'platform': _platform,
            });
          }
        }
        _bgAt = null;
        _startPolling();
      }
    } else {
      // مغادرةٌ للخلفيّة أثناء اللعب: نلتقط اللحظة وحالة السرّ
      if (_step.inGame && _roomId.isNotEmpty) {
        _bgAt = DateTime.now();
        _bgSecretOpen = _secretOpen;
      }
      _poll?.cancel();
      _poll = null;
    }
  }

  Future<void> _pollOnce() async {
    if (!_step.inGame || _roomId.isEmpty) return;
    final res = await SocketService.instance.ask('room:get-my-state', {
      'roomId': _roomId,
      if (_playerId != null) 'playerId': _playerId,
      if (_phone != null && _phone!.isNotEmpty) 'phone': _phone,
    });
    // أخطاء الاستطلاع تُبتلع — دورةٌ فائتة تُعوَّض بالتالية
    if (res == null || res['success'] != true) return;
    _syncFromState(res);
    _syncNightFromState(res);
  }

  /// 🔴 **الحلّ الجذريّ لضياع شاشة الليل.**
  ///
  /// العرض كان مربوطاً بحدثٍ يُبثّ مرّة واحدة، فمن فاته الحدث بقي على
  /// الشاشة السلبية بينما تنتظره الطاولة — ولا مخرج إلّا تحديث الصفحة.
  /// هنا العرض مشتقٌّ من **حالة الخادم**: كلّ دورة استطلاع (٣ ثوانٍ)
  /// تفتح الشاشة إن كانت ثمّة خطوةٌ حيّة لم يُرسل فيها اللاعب.
  ///
  /// لا يُصفَّر عدّادٌ جارٍ: الشرط `_night != null` يخرج مبكراً، فالدالة
  /// لا تعمل إلّا حين لا تكون هناك شاشةٌ أصلاً.
  void _syncNightFromState(Map<String, dynamic> res) {
    if (GamePhase.map(res['phase']) != GamePhase.night) {
      _nightDoneKey = null;
      return;
    }
    if (_night != null || _nightSubmitted) return;

    final r = nightFromResume(res['nightState'], _physicalId);
    if (r == null) return;

    // خطوةٌ أرسلتُ فيها فعلي وأُغلقت شاشتها: لا تُفتح ثانيةً ولو تأخّر
    // الخادم في تسجيل الإرسال — وإلّا ظهرت القائمة من جديد بعد اختيارٍ
    // صحيح فظنّ اللاعب أنّ اختياره ضاع.
    final key = _stepKey(r);
    if (key == _nightDoneKey) return;

    _openNight(r, math.max(3, r.remainingSeconds()));
  }

  String _stepKey(NightActionRequest r) =>
      '${r.stepRole}|${r.deadline?.millisecondsSinceEpoch ?? 0}';

  String? _nightDoneKey;

  /// مزامنةٌ **ذاتية الشفاء**: المقعد والاسم والدور والحياة والمرحلة.
  void _syncFromState(Map<String, dynamic> res) {
    var changed = false;

    if (res['mafiaChatEnabled'] is bool) {
      final v = res['mafiaChatEnabled'] as bool;
      if (v != _mafiaChatEnabled) {
        _mafiaChatEnabled = v;
        changed = true;
      }
    }

    final p = res['player'];
    if (p is Map) {
      final pl = Map<String, dynamic>.from(p);

      final seat = (pl['physicalId'] as num?)?.toInt();
      if (seat != null && seat != _physicalId) {
        final hadSeat = _physicalId != 0;
        _physicalId = seat;
        unawaited(_saveSession());
        if (hadSeat) _flashSeatChange();
        changed = true;
      }

      final name = pl['name'];
      if (name is String && name.isNotEmpty && name != _displayName) {
        _displayName = name;
        changed = true;
      }

      // 🔒 أوّل وصولٍ للدور فقط — لا يُعاد التنبيه في كل دورة
      final role = pl['role'];
      if (role != null && _assignedRole == null) {
        _assignedRole = '$role';
        _cardFlipped = false;
        _roleAlert = true;
        changed = true;
      }

      // الحياة بالاتجاهين — الإحياء يعني لعبةً جديدة
      final alive = pl['isAlive'];
      if (alive == false && !_isPlayerDead) {
        _isPlayerDead = true;
        _cardFlipped = true;
        changed = true;
      } else if (alive == true && _isPlayerDead) {
        _isPlayerDead = false;
        changed = true;
      }
    }

    if (res['rosterInfo'] is List) {
      _roster = _players(res['rosterInfo']);
      changed = true;
    }

    _setPhase(GamePhase.map(res['phase']), fromSocket: false);

    // التصويت — محروسٌ بالحارس نفسه
    if (!_overrideActive) {
      final vs = res['votingState'];
      if (vs is Map && res['phase'] == GamePhase.dayVoting) {
        _restoreVoting(Map<String, dynamic>.from(vs));
        changed = true;
      } else if (res['phase'] != GamePhase.dayVoting && _voting != null) {
        _clearVoting();
        changed = true;
      }
    }

    if (res['assassinContracts'] != null) {
      _assassinContracts = AssassinContracts.fromJson(res['assassinContracts']);
    }
    // سعة الغرفة — على مسار الاستعادة لا يمرّ العميل بـ`room:find-by-code`
    // فيبقى على الافتراضي (١٠) لغرفةٍ تتسع ٣٢
    final cap = (res['maxPlayers'] as num?)?.toInt();
    if (cap != null && cap > 0 && cap != _maxPlayers) {
      _maxPlayers = cap;
      changed = true;
    }
    if (res['isRemote'] is bool) _isRemote = res['isRemote'] as bool;
    if (res['allowPlayerInvites'] is bool) {
      _allowPlayerInvites = res['allowPlayerInvites'] as bool;
    }

    // 🔴 نفس علّة الليل: `day:discussion-updated` يُبثّ مرّة. من فاته لا
    //    يعلم أنّ الدور صار له — فيصمت الجميع ينتظرونه. الاستطلاع يشفيه.
    if (res['discussionState'] != null) {
      _applyDiscussion(DiscussionState.fromJson(res['discussionState']));
      // الخادم يدمج الاتفاقيات داخل حالة النقاش في هذا الردّ
      final ds = res['discussionState'];
      if (ds is Map) {
        if (ds.containsKey('deals')) _deals = Deal.listOf(ds['deals']);
        if (ds['dealLockedPlayers'] is List) {
          _dealLocked = (ds['dealLockedPlayers'] as List)
              .whereType<num>()
              .map((e) => e.toInt())
              .toList(growable: false);
        }
      }
    }
    // 🔴 الجولة تحكم قفل الجولة الأولى — بدونها تُعرض الاتفاقيات فيها
    final rd = (res['round'] as num?)?.toInt();
    if (rd != null && rd > 0) _round = rd;

    // التبرير والانسحاب — نفس علّة الليل: أحداثهما تُبثّ مرّةً واحدة
    if (res['justificationData'] != null) {
      final j = JustificationData.fromJson(res['justificationData']);
      // لا يُمسح `timerFinished` الذي بلغه العدّاد محلياً
      _justification = j?.copyWith(
          timerFinished: _justification?.timerFinished ?? false);
    }
    if (res['withdrawalState'] != null) {
      _withdrawal = WithdrawalState.fromJson(res['withdrawalState'],
          active: _withdrawal.active);
    }

    _phaseData = {
      for (final k in const [
        'justificationData', 'withdrawalState', 'discussionState',
        'winner', 'allPlayers', 'pendingResolution', 'nightState',
      ])
        if (res[k] != null) k: res[k],
      'round': (res['round'] as num?)?.toInt() ?? 1,
    };

    if (changed) notifyListeners();
  }

  void _restoreVoting(Map<String, dynamic> vs) {
    final s = VotingState.fromJson(vs);
    _voting = s;
    _votingComplete = false;
    // صوتي أنا — يُقرأ من الخريطة لا يُخمَّن
    _myVote ??= s.playerVotes[_physicalId];
    // العدّاد يُستعاد من زمن البدء بدل أن يبدأ من الصفر بعد انقطاع
    if (_votingCountdown == null) {
      final left = s.remainingSeconds;
      if (left != null) _startVoteTicker(left);
    }
  }

  void _startVoteTicker(int seconds) {
    _voteTicker?.cancel();
    _votingCountdown = seconds;
    if (seconds <= 0) {
      _autoVoteIfNeeded();
      return;
    }
    _voteTicker = Timer.periodic(const Duration(seconds: 1), (t) {
      final c = (_votingCountdown ?? 0) - 1;
      _votingCountdown = c < 0 ? 0 : c;
      notifyListeners();
      if (_votingCountdown == 0) {
        t.cancel();
        _autoVoteIfNeeded();
      }
    });
  }

  /// 6.8 تصويتٌ تلقائيّ عند الصفر — **بدونه تعلّق الجولة**.
  Future<void> _autoVoteIfNeeded() async {
    if (_myVote != null || _isPlayerDead) return;
    if (_roomId.isEmpty || _gamePhase != GamePhase.dayVoting) return;
    final cands = _voting?.candidates ?? const <VoteCandidate>[];
    if (cands.isEmpty) return;

    var idx = cands.indexWhere((c) => c.targetPhysicalId == _physicalId);
    // لستُ مرشّحاً (حصرُ تصويتٍ أو صفقة) ⇒ الأوّل، كي لا تتعلّق الجولة
    if (idx < 0) idx = 0;

    final res = await SocketService.instance.ask('player:cast-vote', {
      'roomId': _roomId,
      'physicalId': _physicalId,
      'candidateIndex': idx,
      'autoVote': true,
    });
    if (res?['success'] == true) {
      _myVote = idx;
      _lastVoteAt = DateTime.now();
      notifyListeners();
    }
  }

  /// تصويتٌ يدويّ. **بلا تحديثٍ تفاؤليّ**: `myVote` لا يتغيّر إلّا على
  /// إشعار الخادم — إظهارُ اختيارٍ رفضه الخادم يكذب على اللاعب في أخطر
  /// لحظات الجولة.
  ///
  /// يعيد `true` إن سُجِّل الصوت.
  Future<bool> castVote(int index) async {
    final v = _voting;
    if (v == null || index < 0 || index >= v.candidates.length) return false;
    if (_isPlayerDead || _voteSubmitting || _myVote == index) return false;
    if (!canVote) return false;
    // التصويت للنفس مرفوضٌ صامتاً — لا رسالة، كما في المصدر
    if (v.candidates[index].targetPhysicalId == _physicalId) return false;

    _voteSubmitting = true;
    notifyListeners();
    try {
      final res = await SocketService.instance.ask('player:cast-vote', {
        'roomId': _roomId,
        'physicalId': _physicalId,
        'candidateIndex': index,
      });
      if (res?['success'] != true) return false;
      _myVote = index;
      // كلّ تصويتٍ يفتح نافذةً جديدة في مسار `done` وحده
      if (_step != GameStep.rejoined) _lastVoteAt = DateTime.now();
      unawaited(HapticsService.instance.voteCast());
      return true;
    } finally {
      _voteSubmitting = false;
      notifyListeners();
    }
  }

  /// إبرام اتفاقية. الرسالة الراجعة من الخادم تُعرض كما هي: قواعد المنع
  /// خمسٌ ونصوصها عربيةٌ دقيقة، وإعادةُ صياغتها هنا تُخفي السبب الحقيقيّ.
  Future<bool> createDeal(int targetPhysicalId) async {
    if (_dealBusy) return false;
    _dealBusy = true;
    _dealError = null;
    notifyListeners();
    try {
      final res = await SocketService.instance.ask('day:create-deal', {
        'roomId': _roomId,
        'initiatorPhysicalId': _physicalId,
        'targetPhysicalId': targetPhysicalId,
      });
      if (res == null) {
        _dealError = 'تعذّر الاتصال — حاول ثانية';
        return false;
      }
      if (res['success'] != true) {
        _dealError = '${res['error'] ?? 'تعذّر إبرام الاتفاقية'}';
        return false;
      }
      if (res.containsKey('deals')) _deals = Deal.listOf(res['deals']);
      if (res['dealLockedPlayers'] is List) {
        _dealLocked = (res['dealLockedPlayers'] as List)
            .whereType<num>()
            .map((e) => e.toInt())
            .toList(growable: false);
      }
      return true;
    } finally {
      _dealBusy = false;
      notifyListeners();
    }
  }

  Future<bool> removeDeal(String dealId) async {
    if (_dealBusy) return false;
    _dealBusy = true;
    _dealError = null;
    notifyListeners();
    try {
      final res = await SocketService.instance
          .ask('day:remove-deal', {'roomId': _roomId, 'dealId': dealId});
      if (res == null) {
        _dealError = 'تعذّر الاتصال — حاول ثانية';
        return false;
      }
      if (res['success'] != true) {
        _dealError = '${res['error'] ?? 'تعذّر إلغاء الاتفاقية'}';
        return false;
      }
      if (res.containsKey('deals')) _deals = Deal.listOf(res['deals']);
      return true;
    } finally {
      _dealBusy = false;
      notifyListeners();
    }
  }

  void clearDealError() {
    if (_dealError == null) return;
    _dealError = null;
    notifyListeners();
  }

  void _startJustTicker() {
    _justTicker?.cancel();
    void tick() {
      final dl = _justDeadline;
      if (dl == null) return;
      final left = dl.difference(DateTime.now()).inSeconds;
      _justTimer = left < 0 ? 0 : left;
      if (_justTimer == 0) {
        _justTicker?.cancel();
        _justification = _justification?.copyWith(timerFinished: true);
      }
      notifyListeners();
    }

    tick();
    _justTicker = Timer.periodic(const Duration(seconds: 1), (_) => tick());
  }

  /// سحب الصوت — **أحاديّ**: من سحب لا يسحب ثانيةً.
  Future<bool> withdrawVote() async {
    if (_withdrawBusy || iWithdrew || _isPlayerDead) return false;
    _withdrawBusy = true;
    notifyListeners();
    try {
      final res = await SocketService.instance
          .ask('player:withdraw-vote', {'physicalId': _physicalId});
      if (res?['success'] != true) return false;
      _withdrawal = WithdrawalState(
        active: _withdrawal.active,
        count: _asInt(res!['count']) > 0
            ? _asInt(res['count'])
            : _withdrawal.count + 1,
        needed: _asInt(res['needed']) > 0
            ? _asInt(res['needed'])
            : _withdrawal.needed,
        withdrawn: {..._withdrawal.withdrawn, _physicalId}.toList(),
      );
      return true;
    } finally {
      _withdrawBusy = false;
      notifyListeners();
    }
  }

  void _startMayorTicker(int from) {
    _mayorTicker?.cancel();
    _mayorPromptLeft = from;
    // 🔴 عدّادٌ **إرشاديّ**: انتهاؤه لا يقرّر شيئاً ولا يغلق المودال —
    //    الليدر خطّ الرجعة. إغلاقه ذاتياً يسلب العمدة قراره بلا سبب.
    _mayorTicker = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_mayorPromptLeft <= 0) {
        t.cancel();
        return;
      }
      _mayorPromptLeft--;
      notifyListeners();
    });
  }

  void _closeMayorPrompt() {
    _mayorTicker?.cancel();
    if (_mayorPrompt == null) return;
    _mayorPrompt = null;
    notifyListeners();
  }

  /// قرار العمدة — الأخطاء تُبتلع: الليدر ينفّذ يدوياً إن لم يصل.
  Future<void> sendMayorDecision(String decision) async {
    if (_mayorSending) return;
    _mayorSending = true;
    notifyListeners();
    try {
      await SocketService.instance
          .ask('day:mayor-decision', {'roomId': _roomId, 'decision': decision});
    } catch (_) {
    } finally {
      _mayorSending = false;
      _closeMayorPrompt();
      _mayorPrompt = null;
      notifyListeners();
    }
  }

  static int _asInt(Object? v) => v is num ? v.toInt() : 0;

  /// 🪑 مقعدي أنا تبدّل — يصل قبل البثّ العامّ (`room:seats-remapped`).
  void _applySeatChanged(int newSeat) {
    if (newSeat == _physicalId) return;
    _physicalId = newSeat;
    unawaited(_saveSession());
    _flashSeatChange();
    notifyListeners();
  }

  void _flashSeatChange() => _flashSeatAlert('تغيّر مقعدك إلى رقم $_physicalId');

  /// إشعارٌ محايدٌ لكلّ من في الغرفة بعد إعادة الترتيب — بلا أرقام:
  /// من تحرّك تصله رسالته الخاصّة وهي الأدقّ، وتصل **قبل** هذه
  /// (`player:seat-changed` يسبق `room:seats-remapped`) فلا تُدهَس.
  void _flashSeatsRemapped() {
    if (_seatChangeAlert != null) return;
    _flashSeatAlert('أُعيد ترتيب المقاعد');
  }

  void _flashSeatAlert(String message) {
    _seatAlertTimer?.cancel();
    _seatChangeAlert = message;
    _seatAlertTimer = Timer(const Duration(seconds: 5), () {
      _seatChangeAlert = null;
      notifyListeners();
    });
  }

  // ══════════════════════════════════════════════════════
  // 🪑 عقد المصالحة بعد نقل المقاعد — `room:seats-remapped`
  // ══════════════════════════════════════════════════════

  /// 🔒 **الترتيب لا يُبدَّل**: امسح ← رحّل ← اسأل ← أعد الاشتقاق.
  ///
  /// ① **امسح** كلّ ذاكرةٍ مفهرسةٍ بالمقعد: الرقم صار يدلّ على شخصٍ آخر،
  ///    فخريطة الأدوار المكشوفة والمُقصون والمُسكتون وأحداث الصباح
  ///    والاقتراع ونوافذ الليل والعمدة كلّها تكذب الآن. و**لا تُصحَّح
  ///    بالحساب**: الجهاز لا يملك الحالة كاملةً ليعيد ترقيمها بنفسه،
  ///    ومحاولةُ ذلك تُنتج نصف خريطةٍ صحيحة — وهي أسوأ من لا خريطة.
  /// ② **رحّل** ما يملكه الجهاز وحده: المفكرة. لا تُجلَب من الخادم، فلو
  ///    مُسحت مع البقية ضاع عمل اللاعب كلّه.
  /// ③ **اسأل** الخادم فوراً (`room:get-my-state`) — يحلّ الهويّة بالحساب
  ///    أو الهاتف لا بالمقعد. وانتظار دورة الاستطلاع يعني ثلاث ثوانٍ من
  ///    شاشةٍ خرساء في أحرج لحظة.
  /// ④ **أعد الاشتقاق**: شاشة الليل تُبنى من الحالة الجديدة (٦.٤)،
  ///    والصوت يتبنّى المقعد الجديد عبر `_syncVoice` في الشاشة — وهويّة
  ///    المشارك في الاجتماع مشتقّةٌ من المقعد فتُعاد إصدارُها هناك.
  ///
  /// 🔴 يُنفَّذ عند **الجميع** لا عند المنقولَين وحدهما: خرائط من لم
  ///    يتحرّك مفهرسةٌ بالمقاعد أيضاً.
  void _applySeatsRemap(Map<int, int> map) {
    // مقعدي القديم — `player:seat-changed` سبق هذا الحدث فحدّث الرقم،
    // فيُقرأ بعكس الخريطة لا بحفظ حالةٍ إضافية. ومن لم يتحرّك: `null`.
    final oldSelf = <int, int>{
      for (final e in map.entries) e.value: e.key,
    }[_physicalId];

    // ── ① المسح ──
    _morning = const [];
    _revealedRoles = const {};
    _eliminated = const [];
    _silencedPids = const {};
    _tableBanner = null;
    _clearVoting();
    // خطوة الليل المفتوحة تعرض أهدافاً بأرقامٍ قديمة؛ ووسمُ الإنجاز
    // يُصفَّر كي يُعاد فتحها من الحالة الجديدة إن كانت ما تزال حيّة.
    _closeNight();
    _nightDoneKey = null;
    _nightStepRoleName = '';
    _closeMayorPrompt();
    _mayorRevealedId = null;
    _mayorBannerTimer?.cancel();
    _mayorBanner = null;
    _seatsRemapTicket++;

    // ── ② الترحيل ──
    unawaited(_migrateNotes(map, oldSelf));

    // ── ③ السؤال ──
    unawaited(_pollOnce());
    unawaited(loadChatHistory());

    // ── ④ الإشعار ──
    _flashSeatsRemapped();
    notifyListeners();
  }

  /// ② ترحيل المفكرة — الترحيل الوحيد المسموح، ومصدره **خريطة الخادم**
  /// لا حسابٌ محلّيّ: دلو الملاحظات ينتقل إلى مفتاح مقعدي الجديد،
  /// ومفاتيحها عن الآخرين تُعاد كتابتها بالأرقام الجديدة.
  Future<void> _migrateNotes(Map<int, int> map, int? oldSelf) async {
    if (_roomId.isEmpty) return;
    final p = _prefs;

    // (أ) الدلو باسم مقعدي القديم — يُقرأ ثمّ يُزال كي لا يبقى أثرُ
    //     ملاحظاتي تحت مفتاح مقعدٍ صار لغيري.
    if (p != null && oldSelf != null && oldSelf != _physicalId) {
      final oldKey = 'mafia_notes_${_roomId}_$oldSelf';
      final raw = p.getString(oldKey);
      if (raw != null) {
        _notepad = Notepad.decode(raw);
        await p.remove(oldKey);
      }
    }

    // (ب) المفاتيح عن الآخرين. المفتاح صفر هو الملاحظة العامّة ولا مقعد
    //     له، ومن ليس في الخريطة يبقى على رقمه.
    if (map.isNotEmpty && _notepad.notes.isNotEmpty) {
      final moved = <int, PlayerNote>{};
      _notepad.notes.forEach((pid, note) {
        moved[pid == Notepad.generalKey ? pid : (map[pid] ?? pid)] = note;
      });
      _notepad = Notepad(notes: moved);
    }

    _persistNotes();
    notifyListeners();
  }

  // ══════════════════════════════════════════════════════
  // 7.3 المستمعات
  // ══════════════════════════════════════════════════════
  void _listen() {
    // 🔴 إعادة الاتصال تعطي مُعرّفاً جديداً وتُخرج من غرف الخادم — بلا
    //    إعادة التحاق **لا يصل أيّ بثّ بعد أوّل انقطاع**.
    _on('connect', (_) {
      if (!_step.inGame || _roomId.isEmpty) return;
      unawaited(rejoinDetailed(
              roomId: _roomId, physicalId: _physicalId, phone: _phone)
          .then((r) {
        // 🪪 عدتُ فوجدتُ مقعدي يعرّف غيري (نُقل إليه لاعبٌ أثناء انقطاعي)
        if (r == RejoinResult.identityRequired) unawaited(identityRequired());
      }));
    });

    _on('player:seat-changed', (d) {
      if (d is! Map) return;
      final to = (d['newPhysicalId'] as num?)?.toInt();
      if (to == null) return;
      _applySeatChanged(to);
    });

    // 🪑 إعادة ترتيب المقاعد — يصل **الغرفة كلّها** لا المنقولَين وحدهما.
    //    الخريطة `{مقعدٌ قديم: مقعدٌ جديد}` مفاتيحها نصّية في JSON.
    _on('room:seats-remapped', (d) {
      if (d is! Map) return;
      final map = <int, int>{};
      final raw = d['map'];
      if (raw is Map) {
        raw.forEach((k, v) {
          final from = int.tryParse('$k');
          final to = v is num ? v.toInt() : int.tryParse('$v');
          if (from != null && to != null) map[from] = to;
        });
      }
      _applySeatsRemap(map);
    });

    // 🌙 الخادم يطلب إعادة اشتقاق خطوة الليل بعد النقل. لا خطر تكرار:
    //    `nightFromResume` تردّ فارغاً لمن أرسل فعله (`playerSubmitted`).
    _on('night:refresh-required', (_) {
      _closeNight();
      _nightDoneKey = null;
      unawaited(_pollOnce());
    });

    _on('player:role-assigned', (d) {
      if (d is! Map) return;
      final role = '${d['role']}';
      // 🔴 يصل أيضاً **إعادةَ دفعٍ بعد نقل المقعد** بنفس الدور، لا بدايةَ
      //    جولة. حينها لا تنبيهَ ولا قلبَ بطاقة ولا إحياءَ لمُقصى: إحياؤه
      //    يفتح له معرض المافيا وتبويب التشاور حتى تصحّحه أوّل مزامنة.
      //    ولا خطر على بدايةٍ حقيقية: نظافةُ المرحلة تُصفّر الدور قبلها.
      final fresh = role != _assignedRole;
      _assignedRole = role;
      if (fresh) {
        _cardFlipped = false;
        _roleAlert = true;
        _isPlayerDead = false;
      }
      // 🔒 دائماً — الغياب يعني فراغاً هنا لا إبقاءً على القديم
      _mafiaTeam = MafiaMate.listOf(d['mafiaTeam']);
      _sibling = d['sibling'] is Map
          ? SiblingInfo.fromJson(Map<String, dynamic>.from(d['sibling'] as Map))
          : null;
      notifyListeners();
    });

    _on('mafia:team-updated', (d) {
      if (d is! Map) return;
      _mafiaTeam = MafiaMate.listOf(d['mafiaTeam']);
      notifyListeners();
    });

    _on('assassin:contracts-update', (d) {
      _assassinContracts = AssassinContracts.fromJson(d);
      notifyListeners();
    });

    // إعادة الجولة الكاملة — الـreset الوحيد الشامل
    _on('game:started', (_) {
      _isPlayerDead = false;
      _clearVoting();
      _assassinContracts = null;
      notifyListeners();
    });

    _on('game:state-sync', (d) {
      if (d is! Map) return;
      if (d['players'] is List) _roster = _players(d['players']);
      final cfg = d['config'];
      if (cfg is Map) {
        if (cfg['isRemote'] is bool) _isRemote = cfg['isRemote'] as bool;
        if (cfg['allowPlayerInvites'] is bool) {
          _allowPlayerInvites = cfg['allowPlayerInvites'] as bool;
        }
      }
      notifyListeners();
    });

    _on('room:config-updated', (d) {
      if (d is! Map || d['mafiaChatEnabled'] is! bool) return;
      _mafiaChatEnabled = d['mafiaChatEnabled'] as bool;
      notifyListeners();
    });

    // ── المراحل ──
    _on('game:phase-changed', (d) {
      if (d is! Map) return;
      final cfg = d['state'] is Map ? (d['state'] as Map)['config'] : null;
      if (cfg is Map) {
        if (cfg['isRemote'] is bool) _isRemote = cfg['isRemote'] as bool;
        if (cfg['allowPlayerInvites'] is bool) {
          _allowPlayerInvites = cfg['allowPlayerInvites'] as bool;
        }
      }
      _readTeamCounts(d['teamCounts']);
      _setPhase(GamePhase.map(d['phase']), fromSocket: true);
    });

    // ── §6.2 وصول الخطوة: يصل لكلّ حيٍّ — صاحب الدور والمموِّه معاً ──
    _on('night:action-required', (d) {
      final r = NightActionRequest.fromJson(d);
      if (r == null) return;
      // ليلٌ جديد ⇒ ملخّص صباح الأمس لم يعد يخصّني
      _morning = const [];
      _openNight(r, r.timeoutSeconds);
    });

    _on('nurse:activation-request', (_) {
      // نصّ الرسالة القادمة لا يُعرَض — الواجهة ثابتة
      _nursePending = true;
      notifyListeners();
    });

    _on('night:step-info', (d) {
      _nightStepRoleName = d is Map ? '${d['roleName'] ?? ''}' : '';
      notifyListeners();
    });

    void applyDeals(dynamic d) {
      if (d is! Map) return;
      if (d.containsKey('deals')) _deals = Deal.listOf(d['deals']);
      if (d['dealLockedPlayers'] is List) {
        _dealLocked = (d['dealLockedPlayers'] as List)
            .whereType<num>()
            .map((e) => e.toInt())
            .toList(growable: false);
      }
      notifyListeners();
    }

    _on('mafia:chat-message', (d) {
      final m = MafiaChatMessage.fromJson(d);
      if (m == null) return;
      _chat = [..._chat, m];
      // رسالتي أنا ليست «غير مقروءة»
      if (m.physicalId != _physicalId) _chatUnread = true;
      notifyListeners();
    });

    _on('day:deal-created', applyDeals);
    _on('day:deal-removed', applyDeals);

    _on('day:discussion-updated', (d) {
      if (d is! Map) return;
      _applyDiscussion(DiscussionState.fromJson(d['discussionState']));
      notifyListeners();
    });

    _on('day:voting-started', (d) {
      if (d is! Map) return;
      _setPhase(GamePhase.dayVoting, fromSocket: true);
      final s = VotingState.fromJson(Map<String, dynamic>.from(d));
      _voting = s;
      _votingComplete = false;
      _myVote = s.playerVotes[_physicalId];
      _startVoteTicker(s.durationSeconds ?? 0);
      notifyListeners();
    });

    _on('day:vote-update', (d) {
      if (d is! Map || _voting == null) return;
      final s = VotingState.fromJson({
        ...Map<String, dynamic>.from(d),
        'playersInfo': [for (final p in _voting!.playersInfo) {'physicalId': p.physicalId, 'name': p.name}],
      });
      _voting = s;
      // دعم تغيير الصوت — يُقرأ من الخادم لا يُفترض
      if (s.playerVotes.containsKey(_physicalId)) {
        _myVote = s.playerVotes[_physicalId];
      }
      notifyListeners();
    });

    _on('day:voting-complete', (_) {
      _votingComplete = true;
      notifyListeners();
    });

    _on('day:justification-started', (d) {
      _setPhase(GamePhase.dayJustification, fromSocket: true);
      if (d is Map && d['playerVotes'] != null && _voting != null) {
        _voting = VotingState.fromJson({
          'candidates': [
            for (final c in _voting!.candidates)
              {'targetPhysicalId': c.targetPhysicalId, 'name': c.name, 'votes': c.votes}
          ],
          'playerVotes': d['playerVotes'],
        });
      }
      notifyListeners();
    });

    // ── التبرير ──
    _on('day:justification-started', (d) {
      _justification = JustificationData.fromJson(d);
      _withdrawal = const WithdrawalState();
      _justTicker?.cancel();
      _justTimer = null;
      _setPhase(GamePhase.dayJustification, fromSocket: true);
      notifyListeners();
      // شبكة أمان: بقيّة الحمولة (المصوّتون والنصاب) تصل مع الحالة
      unawaited(_pollOnce());
    });

    _on('day:justification-timer-started', (d) {
      if (d is! Map) return;
      final total = (d['timeLimitSeconds'] as num?)?.toInt() ??
          (d['duration'] as num?)?.toInt() ??
          0;
      final startMs = (d['startTime'] as num?)?.toInt();
      // 🔴 مصحّحُ الانحراف: الموعد يُحسب مرّةً من زمن الخادم، والعدّاد
      //    يُشتقّ منه في كلّ تكّة. عدّادٌ ينقص محلياً ينحرف عن الليدر
      //    بثوانٍ في دقيقةٍ واحدة.
      final start = startMs != null
          ? DateTime.fromMillisecondsSinceEpoch(startMs)
          : DateTime.now();
      _justDeadline = start.add(Duration(seconds: total));
      _startJustTicker();
    });

    _on('day:justification-timer-stopped', (_) {
      _justTicker?.cancel();
      _justTimer = null;
      _justDeadline = null;
      _justification = _justification?.copyWith(timerFinished: true);
      notifyListeners();
    });

    // ── الانسحاب ──
    _on('day:withdrawal-period', (d) {
      _withdrawal = WithdrawalState(
        active: true,
        needed: d is Map ? _asInt(d['needed']) : 0,
      );
      notifyListeners();
    });

    _on('day:withdrawal-update', (d) {
      _withdrawal = WithdrawalState.fromJson(d, active: _withdrawal.active);
      notifyListeners();
    });

    _on('day:withdrawal-result', (_) {
      _withdrawal = WithdrawalState(
        count: _withdrawal.count,
        needed: _withdrawal.needed,
        withdrawn: _withdrawal.withdrawn,
      );
      notifyListeners();
    });

    // ── العمدة ──
    _on('day:mayor-window', (d) {
      // 🔒 البثّ العامّ للّيدر والعرض يصل الجميع؛ المودال للعمدة وحده.
      //    فتحُه لغيره يكشف أنّ العمدة ليس هو — ويمنحه قراراً لا يملكه.
      if (d is! Map || d['forMayor'] != true) return;
      final p = MayorPrompt.fromJson(d);
      if (p == null) return;
      _mayorPrompt = p;
      _mayorWeight = p.voteWeight;
      _startMayorTicker(p.timeoutSeconds);
      unawaited(HapticsService.instance.mayorPrompt());
      notifyListeners();
    });

    _on('day:mayor-window-closed', (_) => _closeMayorPrompt());

    _on('day:mayor-revealed', (d) {
      final r = MayorReveal.fromJson(d);
      _closeMayorPrompt();
      if (r == null) return;
      _mayorRevealedId = r.physicalId;
      _mayorWeight = r.voteWeight;
      _mayorBanner = r;
      _mayorBannerTimer?.cancel();
      _mayorBannerTimer = Timer(const Duration(seconds: 8), () {
        _mayorBanner = null;
        notifyListeners();
      });
      notifyListeners();
    });

    _on('display:morning-event', (d) {
      final e = MorningEvent.fromJson(d is Map ? (d['event'] ?? d) : d);
      if (e == null) return;
      // منع التكرار: الليدر قد يعيد البثّ لنفس الحدث
      if (_morning.any((x) => x.key == e.key)) return;
      _morning = [..._morning, e];
      // 🔒 بانر الطاولة من أحداث الحماية وحدها؛ قائمة NON_DEATH لا تُعرَض
      //    إطلاقاً لأنّها تكشف دور من نجا أو من أثّر فيه.
      if (!kNonDeathMorningTypes.contains(e.type)) {
        if (kProtectionBlockedTypes.contains(e.type)) {
          _tableBanner = MorningBanner(saved: true, name: e.targetName);
        } else if (kProtectionFailedTypes.contains(e.type)) {
          _tableBanner = MorningBanner(saved: false, name: e.targetName);
        }
      }
      notifyListeners();
    });

    _on('day:show-silenced', (d) {
      final pid = d is Map ? (d['physicalId'] as num?)?.toInt() : null;
      if (pid == null) return;
      _silencedPids = {..._silencedPids, pid};
      notifyListeners();
    });

    _on('game:timer-adjusted', (d) {
      final t = GameTimerSnapshot.fromJson(d is Map ? d['gameTimer'] : null);
      if (t == null) return;
      _gameTimer = t;
      notifyListeners();
    });

    _on('day:tie', (d) {
      if (d is! Map) return;
      _tied = (d['tiedCandidates'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => VoteCandidate.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      notifyListeners();
    });

    _on('day:elimination-revealed', (d) {
      if (d is! Map) return;
      final out = <int, String>{};
      for (final e in (d['revealedRoles'] as List? ?? const []).whereType<Map>()) {
        final pid = (e['physicalId'] as num?)?.toInt();
        if (pid != null) out[pid] = '${e['role'] ?? ''}';
      }
      _revealedRoles = out;
      _readTeamCounts(d['teamCounts']);
      if (out.isNotEmpty) _revealTicket++;
      if (_eliminated.contains(_physicalId)) {
        unawaited(HapticsService.instance.eliminated());
      }
      notifyListeners();
    });

    _on('day:elimination-pending', (d) {
      if (d is Map && d['eliminated'] is List) {
        _eliminated = (d['eliminated'] as List)
            .whereType<num>()
            .map((e) => e.toInt())
            .toList();
        _revealedRoles = const {};
      }
      _setPhase(GamePhase.eliminationPending, fromSocket: true);
      _clearVoting();
      notifyListeners();
    });

    _on('game:over', (d) {
      if (d is Map && d['players'] is List) {
        _gameOverData = Map<String, dynamic>.from(d);
        _gameOver = GameOverReveal.fromJson(d);
      }
      _setPhase(GamePhase.gameOver, fromSocket: true);
      _clearVoting();
      _mafiaTeam = const [];
      _sibling = null;
      // 🔒 يبقى الدور وحالة الموت — اللاعب لا بدّ أن يراهما
      notifyListeners();
    });

    // ── الإنهاء ──
    _on('game:closed', (_) => unawaited(_softClose()));
    _on('game:room-deleted', (_) => unawaited(leaveAndReset('تم إغلاق الغرفة', wipeRoom: true)));
    _on('game:kicked', (d) => unawaited(leaveAndReset(
        d is Map ? d['reason'] as String? : null)));
    _on('event:closed', (d) => unawaited(leaveAndReset(d is Map
        ? (d['reason'] ?? d['message']) as String?
        : null)));

    _on('player:kicked-self', (d) => unawaited(_kickedSelf(
        d is Map ? d['reason'] as String? : null)));
  }

  // ══════════════════════════════════════════════════════
  // 6.7 الإنهاء
  // ══════════════════════════════════════════════════════

  /// طردٌ ذاتيّ: بسببٍ ⇒ شاشة الطرد، وبلا سبب ⇒ عودةٌ للدخول برسالة.
  Future<void> _kickedSelf(String? reason) async {
    await _clearSession();
    await _prefs?.setString(_kUserExited, 'true');
    _resetGameState();
    _roomId = '';
    _physicalId = 0;
    if (reason != null && reason.isNotEmpty) {
      _isExpelled = true;
      _expulsionReason = reason;
    } else {
      _step = GameStep.code;
      _apiError = 'تم إزالتك من اللعبة من قبل الليدر';
    }
    notifyListeners();
  }

  Future<void> leaveAndReset(String? reason, {bool wipeRoom = false}) async {
    await _clearSession();
    _resetGameState();
    if (wipeRoom) {
      _roomId = '';
      _roomCode = '';
    }
    _step = GameStep.code;
    _apiError = reason ?? 'تم إنهاء الفعالية وإغلاق الغرفة';
    notifyListeners();
  }

  /// 🪪 ردّ الخادم `IDENTITY_REQUIRED`: العودة إلى شاشة الدخول برسالته
  /// حرفيّةً. **لا تخمين ولا إعادة محاولةٍ بالمقعد**: الرقم قد صار يدلّ
  /// على شخصٍ آخر بعد النقل، والتعريف بالهاتف أو الحساب هو المخرج.
  Future<void> identityRequired() async {
    _physicalId = 0;
    await leaveAndReset(_rejoinError != null && _rejoinError!.isNotEmpty
        ? _rejoinError
        : 'تعذّر التعرّف عليك — أعد الدخول برقم هاتفك أو من حسابك');
    _rejoinError = null;
  }

  /// 🔴 `game:closed` **يُبقي اللاعب على الشاشة**: لا تغيير خطوة، ولا
  ///    رسالة، ولا مسح للغرفة — فقط تصفير حالة اللعب.
  Future<void> _softClose() async {
    await _clearSession();
    _resetGameState();
    notifyListeners();
  }

  void _resetGameState() {
    _poll?.cancel();
    _poll = null;
    _clearVoting();
    _gamePhase = null;
    _assignedRole = null;
    _isPlayerDead = false;
    _mafiaTeam = const [];
    _sibling = null;
    _cardFlipped = false;
    _roleAlert = false;
    _gameOverData = null; _gameOver = null;
    _assassinContracts = null;
    _guard.clear();
  }

  /// خروجٌ بإرادة اللاعب: يُحجز مقعده عشر دقائق ويُعلَم الخادم.
  Future<void> logout() async {
    if (_roomCode.isNotEmpty) {
      await _prefs?.setString(
        _kHeldSeat,
        jsonEncode(HeldSeat(
          roomCode: _roomCode,
          roomId: _roomId,
          exitedAt: DateTime.now(),
          phone: _phone,
          playerId: _playerId,
          displayName: _displayName,
        ).toJson()),
      );
    }
    // إعلامٌ بلا انتظار — الخروج لا ينتظر الشبكة
    SocketService.instance.emit('room:player-exit', {
      'roomId': _roomId,
      'phone': _phone ?? '',
      if (_playerId != null) 'playerId': _playerId,
    });
    await _clearSession();
    await _prefs?.setString(_kUserExited, 'true');
    _resetGameState();
    _roomId = '';
    _roomCode = '';
    _physicalId = 0;
    _step = GameStep.code;
    notifyListeners();
  }

  /// مقعدٌ محجوزٌ لم تنتهِ مهلته — تستعمله شاشة إدخال الرمز (٢١).
  HeldSeat? readHeldSeat() {
    final raw = _prefs?.getString(_kHeldSeat);
    if (raw == null) return null;
    try {
      final seat = HeldSeat.fromJson(
          Map<String, dynamic>.from(jsonDecode(raw) as Map));
      if (seat == null || !seat.isFresh) {
        unawaited(_prefs?.remove(_kHeldSeat) ?? Future.value());
        return null;
      }
      return seat;
    } catch (_) {
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // التخزين
  // ══════════════════════════════════════════════════════
  SavedGameSession? _readSession() {
    final raw = _prefs?.getString(_kSession);
    if (raw == null) return null;
    try {
      return SavedGameSession.fromJson(
          Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveSession() async {
    if (_roomId.isEmpty) return;
    await _prefs?.setString(
      _kSession,
      jsonEncode(SavedGameSession(
        roomId: _roomId,
        roomCode: _roomCode,
        gameName: _gameName,
        physicalId: _physicalId,
        phone: _phone,
        playerId: _playerId,
      ).toJson()),
    );
  }

  /// 🔔 تنبيه «دورك في النقاش» — يُطلق على **انتقال** الدور إليّ فقط.
  ///
  /// إطلاقه على كل مزامنةٍ يعني اهتزازاً كل ٣ ثوانٍ طوال دقيقة كلامي.
  /// ولذلك يُحفظ آخر متحدّثٍ رُئي، ويُصفَّر عند نهاية النقاش كي يعمل
  /// التنبيه ثانيةً في الجولة القادمة إن عاد الدور إليّ.
  void _applyDiscussion(DiscussionState? d) {
    _discussion = d;
    final now = d?.currentSpeakerId;
    if (now != _lastSpeakerSeen) {
      _lastSpeakerSeen = now;
      if (now != null && now == _physicalId && !_isPlayerDead) {
        unawaited(TurnAlert.instance.fire());
      }
    }
    if (d == null || d.isFinished) _lastSpeakerSeen = null;
  }

  // ══════════════════════════════════════════════════════
  // 🌙 منطق الليل — §6.2 · §6.3
  // ══════════════════════════════════════════════════════

  void _openNight(NightActionRequest r, int from) {
    // خطوةٌ جديدة ⇒ وسم الإنجاز القديم لم يعد يخصّها
    if (_stepKey(r) != _nightDoneKey) _nightDoneKey = null;
    _nightTicker?.cancel();
    _nightClose?.cancel();
    _night = r;
    _nightSubmitted = false;
    _nightCountdown = from;
    notifyListeners();

    _nightTicker = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_nightCountdown <= 1) {
        t.cancel();
        _nightCountdown = 0;
        // 🔴 عند الصفر **لا يُرسل العميل شيئاً**: الخادم يختار عشوائياً
        //    بنفسه. إرسالٌ من هنا يزاحم اختياره ويُدخل سباقاً.
        //    ما يُعرَض «تم الإرسال» تجميليٌّ محض.
        _nightDoneKey = _stepKey(r);
        _nightClose = Timer(const Duration(milliseconds: 2000), () {
          _nightSubmitted = true;
          notifyListeners();
          _nightClose = Timer(const Duration(milliseconds: 1500), _closeNight);
        });
        notifyListeners();
        return;
      }
      _nightCountdown--;
      notifyListeners();
    });
  }

  void _closeNight() {
    _nightTicker?.cancel();
    _nightClose?.cancel();
    _night = null;
    _nightSubmitted = false;
    _nightCountdown = 0;
    notifyListeners();
  }

  /// إرسال فعل الليل — `null` تخطٍّ.
  ///
  /// الترتيب: العلامة **قبل** الانتظار. ضبطها بعده يفتح نافذةً للمس ثانٍ
  /// يرسل فعلين لنفس الخطوة.
  Future<void> submitNightAction(int? targetPhysicalId) async {
    final r = _night;
    if (r == null || _nightSubmitted) return;
    _nightSubmitted = true;
    _nightDoneKey = _stepKey(r);
    _nightTicker?.cancel();
    notifyListeners();

    // الخطأ يُبتلع عمداً: لا رسالة خطأ في المصدر، والخادم يعوّض بعشوائيّه
    try {
      await SocketService.instance.ask('player:night-action', {
        'roomId': _roomId,
        'actionType': r.actionType,
        'targetPhysicalId': targetPhysicalId,
      });
    } catch (_) {}

    _nightClose?.cancel();
    _nightClose = Timer(const Duration(milliseconds: 1500), _closeNight);
  }

  /// جواب مودال الممرضة — يُغلق فوراً بلا انتظار ack.
  void respondNurse(bool activate) {
    _nursePending = false;
    notifyListeners();
    if (_roomId.isEmpty) return;
    SocketService.instance
        .emit('nurse:activation-response', {'roomId': _roomId, 'activate': activate});
  }

  /// فتحُ خطوةِ ليلٍ مباشرةً — للاختبار فقط.
  @visibleForTesting
  void openNightForTest(NightActionRequest r, {int? from}) =>
      _openNight(r, from ?? r.timeoutSeconds);

  /// بذرةٌ للاختبار فقط — المتحكّم مفردٌ ببانٍ خاصّ، ولا سبيل لفحص
  /// بوابة التسريب وترتيب الإنذار دون ضبط حالته مباشرةً.
  @visibleForTesting
  void primeForTest({
    String? roomId,
    int? physicalId,
    String? name,
    String? role,
    String? phase,
    bool? dead,
    List<MafiaMate>? team,
    SiblingInfo? sibling,
    List<RosterPlayer>? roster,
    DiscussionState? discussion,
    JustificationData? justification,
    WithdrawalState? withdrawal,
    int? justTimer,
    MayorPrompt? mayorPrompt,
    MayorReveal? mayorBanner,
    int? mayorRevealedId,
    List<Deal>? deals,
    List<int>? dealLocked,
    int? round,
    Notepad? notepad,
    List<MafiaChatMessage>? chat,
    bool? chatEnabled,
    List<MorningEvent>? morning,
    Map<String, dynamic>? gameOver,
    VotingState? voting,
    int? myVote,
    GameStep? step,
  }) {
    if (roomId != null) _roomId = roomId;
    if (physicalId != null) _physicalId = physicalId;
    if (name != null) _displayName = name;
    if (role != null) _assignedRole = role.isEmpty ? null : role;
    if (phase != null) _gamePhase = phase.isEmpty ? null : phase;
    if (dead != null) _isPlayerDead = dead;
    if (team != null) _mafiaTeam = team;
    _sibling = sibling;
    if (roster != null) _roster = roster;
    if (discussion != null) _discussion = discussion;
    if (justification != null) _justification = justification;
    if (withdrawal != null) _withdrawal = withdrawal;
    if (justTimer != null) _justTimer = justTimer;
    _mayorPrompt = mayorPrompt;
    _mayorBanner = mayorBanner;
    if (mayorRevealedId != null) _mayorRevealedId = mayorRevealedId;
    if (deals != null) _deals = deals;
    if (dealLocked != null) _dealLocked = dealLocked;
    if (round != null) _round = round;
    if (notepad != null) _notepad = notepad;
    if (chat != null) _chat = chat;
    if (chatEnabled != null) _mafiaChatEnabled = chatEnabled;
    if (morning != null) _morning = morning;
    if (gameOver != null) {
      _gameOverData = gameOver;
      _gameOver = GameOverReveal.fromJson(gameOver);
    }
    if (voting != null) _voting = voting;
    if (myVote != null) _myVote = myVote;
    if (step != null) _step = step;
  }

  /// انتقالُ مرحلةٍ حقيقيّ عبر `_applyPhase` — لفحص قواعد التنظيف نفسها
  /// لا نسخةٍ منها في الاختبار.
  @visibleForTesting
  void setPhaseForTest(String? phase) => _applyPhase(phase);

  /// تشغيل عقد المصالحة نفسه الذي يشغّله `room:seats-remapped` — لا نسخةٍ
  /// منه: ترتيب المسح والترحيل والسؤال هو ما يُفحَص.
  @visibleForTesting
  void applySeatsRemapForTest(Map<int, int> map) => _applySeatsRemap(map);

  /// وصولُ `player:seat-changed` — يسبق البثّ العامّ عند المنقول.
  @visibleForTesting
  void applySeatChangedForTest(int newSeat) => _applySeatChanged(newSeat);

  @visibleForTesting
  void applyEliminationForTest({
    required List<int> eliminated,
    Map<int, String> revealed = const {},
  }) {
    _eliminated = eliminated;
    _revealedRoles = revealed;
  }

  /// يعيد المتحكّم المفرد إلى حالته الأولى — يُنادى بين الاختبارات.
  @visibleForTesting
  void resetForTest() {
    _seatAlertTimer?.cancel();
    _seatChangeAlert = null;
    _seatsRemapTicket = 0;
    _silencedPids = const {};
    _roomId = '';
    _physicalId = 0;
    _displayName = '';
    _assignedRole = null;
    _gamePhase = null;
    _isPlayerDead = false;
    _mafiaTeam = const [];
    _sibling = null;
    _roster = const [];
    _discussion = null;
    _lastSpeakerSeen = null;
    _justification = null;
    _withdrawal = const WithdrawalState();
    _justTimer = null;
    _mayorPrompt = null;
    _mayorBanner = null;
    _mayorRevealedId = null;
    _deals = const [];
    _dealLocked = const [];
    _round = 1;
    _notepad = const Notepad();
    _chat = const [];
    _chatUnread = false;
    _mafiaChatEnabled = false;
    _morning = const [];
    _gameOverData = null; _gameOver = null;
    _voting = null;
    _myVote = null;
    _step = GameStep.code;
    _eliminated = const [];
    _revealedRoles = const {};
    _tied = const [];
  }

  /// 🔒 إعلانُ فتح معرض المافيا — **الترتيب لا يُبدَّل**:
  ///
  ///   ① أرسل الحدث دائماً، **قبل** أيّ فحص. غاية الحدث إنذارُ الليدر،
  ///      ومحاولةُ لاعبٍ مُقصى هي بالضبط ما يريد الليدر أن يعرفه — فتقديمُ
  ///      الفحص عليه يُسكت الإنذار عن الحالة الوحيدة التي تستحقّه.
  ///   ② المُقصى لا يُفتح له المعرض.
  ///
  /// الإرسال «أطلق وانسَ»: انتظار ackٍ يؤخّر فتح المودال على شبكةٍ بطيئة،
  /// وفشلُ الإنذار لا يمنع اللاعب الحيّ من رؤية فريقه.
  bool announceGalleryOpen() {
    if (_roomId.isNotEmpty) {
      SocketService.instance.emit('player:mafia-gallery-open', {
        'roomId': _roomId,
      });
    }
    return !_isPlayerDead;
  }

  Future<void> _clearSession() async => _prefs?.remove(_kSession);

  // ── أدوات ──
  static List<RosterPlayer> _players(dynamic v) => v is List
      ? v
          .whereType<Map>()
          .map((e) => RosterPlayer.fromJson(Map<String, dynamic>.from(e)))
          .toList()
      : const <RosterPlayer>[];
}
