import 'dart:async';
import '../../core/ui/glass.dart';

import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/api/game_config_service.dart';
import '../../core/cities/city_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/profile.dart';
import '../../models/rank.dart';
import '../profile/profile_palette.dart';
import 'player_sheet.dart';
import 'rank_widgets.dart';

// ══════════════════════════════════════════════════════
// 🏆 التصنيف والرتب — الملفّ 15
// ══════════════════════════════════════════════════════
// REST بالكامل، **بلا سوكِت**. النضارة عبر إعادة الجلب عند العودة
// للتبويب أو استئناف التطبيق — وهي حيويّة: اللاعب يخرج من مباراة
// ويريد أن يرى RR الجديد فوراً.
//
// 🏙️ التصنيف بحسب (الموسم، المدينة): مفتاح «وجاهيّ | أونلاين» القديم
//    صار «عمّان | الزرقاء | أونلاين» — نفس المكوّن ونفس السلوك (تبديل
//    الوضع يعيد ضبط الموسم المختار). الافتراضيّ مدينةُ اللاعب الأساسيّة،
//    ولون المدينة يسري على الشريحة وبطاقة «رتبتي» والصفّ المتوهّج وأرقام RR.
//
// 📌 خارج هذه الشاشة عمداً: إطارات الرتب وتأثيراتها البصرية (§4.10+)
//    تُركَّب على **كرت اللعب** لا هنا، ومكانها طبقة اللعب في M4/M5.

/// وضع العرض — مدينةٌ واحدة (وجاهيّ) أو الأونلاين.
///
/// `cityId == null` مع `online == false` = خادمٌ قديم بلا مدن: وضعٌ وجاهيّ
/// واحد يسلك سلوك اليوم تماماً.
class RankMode {
  const RankMode.city(this.cityId, this.cityName) : online = false;
  const RankMode.online()
      : cityId = null,
        cityName = 'أونلاين',
        online = true;

  final int? cityId;
  final String cityName;
  final bool online;

  bool get isCity => !online;

  String get _key => online ? 'online' : 'city:$cityId';

  @override
  bool operator ==(Object other) => other is RankMode && other._key == _key;

  @override
  int get hashCode => _key.hashCode;
}

enum RankTab { leaderboard, coplayers, howto }

class RankScreen extends StatefulWidget {
  const RankScreen({super.key, this.initialCityId});

  /// من `?city=` — إشعار ترقيةٍ بمدينتها يفتح اللوحة عليها.
  final int? initialCityId;

  @override
  State<RankScreen> createState() => RankScreenState();
}

class RankScreenState extends State<RankScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  RankTab _tab = RankTab.leaderboard;

  /// قبل أوّل جلبٍ: وضعٌ مؤقّت بالمدينة المطلوبة (إن وُجدت) بلا اسم.
  late RankMode _mode = RankMode.city(widget.initialCityId, '');
  List<RankMode> _modes = const [];
  bool _modeResolved = false;

  /// مدينةٌ طُلبت (رابط/إشعار) ولم تُطبَّق بعد.
  late int? _pendingCityId = widget.initialCityId;

  bool _loading = true;
  bool _seasonLoading = false;
  bool _liveLoading = false;

  /// اللوحة الحيّة **لكلّ مدينة** — التبديل بين المدن لا يعيد الجلب.
  final Map<int?, List<LeaderboardRow>> _liveByCity = {};
  List<LeaderboardRow>? _seasonBoard;
  List<CoPlayer> _coPlayers = const [];
  ProgressionConfig? _config;
  ProfileResponse? _profile;
  PlayerProgression? _prog;
  ProfileStats? _myStats;

  List<City> _cities = const [];
  List<Season> _seasons = const [];
  List<Season> _onlineSeasons = const [];
  int? _activeSeasonId;
  int? _activeOnlineSeasonId;
  int? _selectedSeasonId;
  String _activeSeasonName = '';

  int? _followBusy;

  /// رمز الطلب الجاري للوحة موسم — استجابة طلبٍ قديم تُهمَل.
  int _seasonRequest = 0;
  int _liveRequest = 0;

  late final AnimationController _glow = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  Timer? _glowStop;
  Timer? _scrollTimer;
  final _myRowKey = GlobalKey();
  final _scroll = ScrollController();

  int get _myId => SessionStore.instance.player?.id ?? 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didUpdateWidget(RankScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // الفرع محفوظ الحالة: `?city=` جديدة تصل هنا لا في initState
    final c = widget.initialCityId;
    if (c != null && c != oldWidget.initialCityId) selectCity(c);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _glowStop?.cancel();
    _scrollTimer?.cancel();
    _glow.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) reload();
  }

  /// يُستدعى من الشل عند العودة لهذا التبويب.
  void reload() {
    if (!_loading) _load();
  }

  /// يفتح اللوحة على مدينةٍ بعينها — من رابطٍ أو إشعار. مدينةٌ مجهولة
  /// تُحفَظ حتى يصل الجلب التالي بقائمة المدن.
  void selectCity(int cityId) {
    if (_loading) {
      _pendingCityId = cityId;
      return;
    }
    final m = _modes.where((m) => m.isCity && m.cityId == cityId).firstOrNull;
    if (m == null) {
      _pendingCityId = cityId;
      return;
    }
    _pendingCityId = null;
    if (m != _mode) _switchMode(m);
  }

  // ══════════════════════════════════════════════════════
  // الجلب
  // ══════════════════════════════════════════════════════
  Future<void> _load() async {
    final id = _myId;
    if (id == 0) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);

    final api = ApiClient.instance;

    // 🔴 المدينة المطلوبة صراحةً (رابط) أو المعروضة حالياً؛ وبلا أيّهما
    //    يختار الخادم مدينة اللاعب الأساسيّة ويخبرنا بها في الاستجابة.
    final wantCity = _pendingCityId ?? (_mode.isCity ? _mode.cityId : null);

    // 🔴 الاختياريّة تتدهور بصمت: غياب إعدادات التقدّم يُفرغ تبويب
    //    «النقاط» وحده، ولا يُسقط اللوحة. تجميعها في نداءٍ واحد يجعل
    //    أضعفها يُسقط أقواها — نفس قاعدة الرئيسية.
    final results = await Future.wait([
      api.get('/api/player-app/leaderboard', query: {
        'playerId': id,
        if (wantCity != null) 'cityId': wantCity,
      }).catchError((_) => null),
      api.get('/api/player-app/$id/co-players').catchError((_) => null),
      api.get('/api/player/$id/profile').catchError((_) => null),
      api.get('/api/progression-settings/public').catchError((_) => null),
      api.get('/api/seasons/public/active').catchError((_) => null),
      api.get('/api/seasons/public/list').catchError((_) => null),
      api.get('/api/seasons/public/online-list').catchError((_) => null),
    ]);

    if (!mounted) return;

    final lb = (results[0] is Map && results[0]['success'] == true)
        ? LeaderboardResponse.fromJson(Map<String, dynamic>.from(results[0] as Map))
        : const LeaderboardResponse();

    final co = (results[1] is Map && results[1]['success'] == true)
        ? ((results[1]['coPlayers'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => CoPlayer.fromJson(Map<String, dynamic>.from(e)))
            .toList())
        : <CoPlayer>[];

    ProfileResponse? profile;
    if (results[2] is Map && results[2]['success'] == true) {
      profile = ProfileResponse.fromJson(Map<String, dynamic>.from(results[2] as Map));
    }

    final cfg = (results[3] is Map && results[3]['config'] is Map)
        ? ProgressionConfig.fromJson(Map<String, dynamic>.from(results[3]['config'] as Map))
        : null;

    int? activeId;
    String activeName = '';
    var cities = <City>[];
    if (results[4] is Map && results[4]['season'] is Map) {
      final s = Season.fromJson(Map<String, dynamic>.from(results[4]['season'] as Map));
      activeId = s.id;
      activeName = s.name;
      cities = s.cities;
    }
    // 🏙️ المدن: من الموسم النشط، وإلا من استجابة اللوحة، وإلا القائمة العامّة
    if (cities.isEmpty) cities = lb.cities;
    if (cities.isEmpty) cities = await CityService.instance.cities();
    if (!mounted) return;
    CityService.instance.prime(cities);

    final seasons =
        results[5] is Map ? Season.listFrom(results[5]['seasons']) : <Season>[];
    final onlineSeasons =
        results[6] is Map ? Season.listFrom(results[6]['seasons']) : <Season>[];
    final activeOnline = results[6] is Map && results[6]['activeOnlineSeasonId'] is num
        ? (results[6]['activeOnlineSeasonId'] as num).toInt()
        : null;

    // الأوضاع: مدينةٌ لكلّ مدينة (أو وضعٌ وجاهيّ واحد بلا مدن) + أونلاين
    final modes = <RankMode>[
      if (cities.isEmpty)
        const RankMode.city(null, '')
      else
        for (final c in cities) RankMode.city(c.id, c.name),
      if (onlineSeasons.isNotEmpty) const RankMode.online(),
    ];

    setState(() {
      _liveByCity[lb.cityId] = lb.leaderboard;
      _coPlayers = co;
      _profile = profile;
      _prog = profile?.progression;
      _myStats = profile?.stats;
      _config = cfg;
      _cities = cities;
      _activeSeasonId = activeId;
      _activeSeasonName = activeName;
      _seasons = seasons;
      _onlineSeasons = onlineSeasons;
      _activeOnlineSeasonId = activeOnline;
      _modes = modes;
      _resolveMode(modes, lb, profile);
      // لا يدوس اختيار المستخدم
      _selectedSeasonId ??= _mode.online ? _activeOnlineSeasonId : activeId;
      _loading = false;
    });

    // مدينةٌ مطلوبة لم تصل لوحتها بعد (الجلب الأوّل كان لغيرها)
    if (_viewingActive && !_liveByCity.containsKey(_mode.cityId)) {
      unawaited(_loadLiveBoard(_mode.cityId));
    } else {
      _restartGlow();
    }
  }

  /// يحسم الوضع المعروض بعد الجلب. داخل `setState`.
  void _resolveMode(List<RankMode> modes, LeaderboardResponse lb, ProfileResponse? p) {
    RankMode? cityMode(int? id) =>
        modes.where((m) => m.isCity && m.cityId == id).firstOrNull;

    // ١) مدينةٌ مطلوبة صراحةً (رابط/إشعار)
    final pending = _pendingCityId;
    if (pending != null) {
      final m = cityMode(pending);
      if (m != null) {
        _pendingCityId = null;
        if (m != _mode) {
          _mode = m;
          _selectedSeasonId = _activeSeasonId;
        }
        _modeResolved = true;
        return;
      }
    }

    // ٢) أوّل جلب: الأساسيّة، وإلا ما اختاره الخادم، وإلا الأولى
    if (!_modeResolved) {
      _mode = cityMode(p?.homeCityId) ??
          cityMode(lb.cityId) ??
          modes.where((m) => m.isCity).firstOrNull ??
          modes.first;
      _modeResolved = true;
      return;
    }

    // ٣) جلبٌ لاحق: نبقي الوضع الحاليّ إن بقي موجوداً (وننعش اسمه)
    final same = modes.where((m) => m == _mode).firstOrNull;
    if (same != null) {
      _mode = same;
    } else {
      _mode = cityMode(p?.homeCityId) ?? modes.first;
      _selectedSeasonId = _mode.online ? _activeOnlineSeasonId : _activeSeasonId;
    }
  }

  /// اللوحة الحيّة لمدينةٍ بعينها — تُجلَب عند أوّل تبديلٍ إليها.
  Future<void> _loadLiveBoard(int? cityId) async {
    final token = ++_liveRequest;
    setState(() => _liveLoading = true);
    try {
      final r = await ApiClient.instance.get('/api/player-app/leaderboard', query: {
        'playerId': _myId,
        if (cityId != null) 'cityId': cityId,
      });
      if (!mounted || token != _liveRequest) return;
      final lb = (r is Map && r['success'] == true)
          ? LeaderboardResponse.fromJson(Map<String, dynamic>.from(r))
          : const LeaderboardResponse();
      setState(() {
        _liveByCity[cityId] = lb.leaderboard;
        _liveLoading = false;
      });
    } catch (_) {
      if (!mounted || token != _liveRequest) return;
      setState(() {
        _liveByCity[cityId] = const [];
        _liveLoading = false;
      });
    }
    _restartGlow();
  }

  Future<void> _loadSeasonBoard() async {
    final sel = _selectedSeasonId;
    if (sel == null || (_mode.isCity && sel == _activeSeasonId)) {
      setState(() => _seasonBoard = null);
      return;
    }
    final token = ++_seasonRequest;
    setState(() => _seasonLoading = true);
    try {
      // 🏙️ الموسم العاديّ السابق يتطلّب المدينة؛ الأونلاين بلا مدينة
      final cityId = _mode.isCity ? _mode.cityId : null;
      final r = await ApiClient.instance.get(
        '/api/seasons/public/$sel/leaderboard',
        query: cityId == null ? null : {'cityId': cityId},
      );
      if (!mounted || token != _seasonRequest) return;
      setState(() {
        _seasonBoard = (r is Map && r['success'] == true)
            ? LeaderboardResponse.rowsFrom(r['leaderboard'])
            : <LeaderboardRow>[];
        _seasonLoading = false;
      });
    } catch (_) {
      if (!mounted || token != _seasonRequest) return;
      setState(() { _seasonBoard = const []; _seasonLoading = false; });
    }
  }

  // ══════════════════════════════════════════════════════
  // المشتقّات
  // ══════════════════════════════════════════════════════
  bool get _viewingActive =>
      _mode.isCity &&
      (_selectedSeasonId == null || _selectedSeasonId == _activeSeasonId);

  List<LeaderboardRow> get _board => _viewingActive
      ? (_liveByCity[_mode.cityId] ?? const [])
      : (_seasonBoard ?? const []);

  List<Season> get _currentSeasons => _mode.online ? _onlineSeasons : _seasons;

  String get _selectedSeasonName {
    for (final s in _currentSeasons) {
      if (s.id == _selectedSeasonId) return s.name;
    }
    return _activeSeasonName;
  }

  int get _myRank {
    final i = _board.indexWhere((p) => p.id == _myId);
    return i + 1;
  }

  LeaderboardRow? get _myRow {
    for (final p in _board) {
      if (p.id == _myId) return p;
    }
    return null;
  }

  // ── 🎨 لون الوضع المعروض ──
  Color get _accent => _mode.online
      ? CityService.onlineAccent
      : CityService.instance.accentFor(_mode.cityId);

  Color get _accentText => _mode.online
      ? CityService.onlineText
      : CityService.instance.textFor(_mode.cityId);

  Color get _chipBg => _mode.online
      ? CityService.onlineChipBg
      : CityService.instance.chipBgFor(_mode.cityId);

  Color get _chipBorder => _mode.online
      ? CityService.onlineChipBorder
      : CityService.instance.chipBorderFor(_mode.cityId);

  int? get _homeCityId => _profile?.homeCityId;

  /// صفّي في المدينة المعروضة — `null` إن لم ألعب فيها (أو خادمٌ قديم).
  Standing? get _standing => _mode.isCity ? _profile?.standingFor(_mode.cityId) : null;

  /// هل نسقط على `progression`/`stats` القديمين (= المدينة الأساسيّة)؟
  bool get _useLegacyProgression =>
      _mode.isCity &&
      (_mode.cityId == null ||
          (_profile?.standings.isEmpty ?? true) ||
          _mode.cityId == _homeCityId);

  // ══════════════════════════════════════════════════════
  // الأفعال
  // ══════════════════════════════════════════════════════
  void _switchMode(RankMode m) {
    setState(() {
      _mode = m;
      _selectedSeasonId = m.online ? _activeOnlineSeasonId : _activeSeasonId;
    });
    if (m.isCity && !_liveByCity.containsKey(m.cityId)) {
      unawaited(_loadLiveBoard(m.cityId));
    } else {
      _restartGlow();
    }
    _loadSeasonBoard();
  }

  void _selectSeason(int? id) {
    setState(() => _selectedSeasonId = id);
    _loadSeasonBoard();
  }

  /// توهّج صفّي + تمرير إليه. يتوقّف بعد خمس ثوانٍ — إشارةٌ لا زينة دائمة.
  void _restartGlow() {
    _glowStop?.cancel();
    _scrollTimer?.cancel();
    _glow.repeat(reverse: true);
    _glowStop = Timer(const Duration(milliseconds: 5000), () {
      if (mounted) _glow.stop();
    });
    _scrollTimer = Timer(const Duration(milliseconds: 300), () {
      final ctx = _myRowKey.currentContext;
      if (ctx == null || !mounted) return;
      Scrollable.ensureVisible(ctx,
          alignment: 0.5,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeInOut);
    });
  }

  /// 🔴 يُقرأ الحال من `_coPlayers` بالمعرّف لا من كائنٍ مُلتقَط: ورقة
  ///    البروفايل تُبنى مرّة، وكائنها يتجمّد. طيّها مرّتين بكائنٍ قديم
  ///    يرسل نفس الطلب مرّتين.
  /// يعيد ما إذا نجحت العمليّة — ورقة اللاعب تقرؤه فلا تقلب زرّها كذباً.
  Future<bool> _toggleFollow(int id) async {
    if (_followBusy != null || id == _myId) return false;
    final c = _coPlayers.where((x) => x.id == id).firstOrNull;
    if (c == null) return false;

    setState(() => _followBusy = c.id);
    final path = '/api/player-app/$_myId/follow/${c.id}';
    try {
      if (c.isFollowing) {
        // الاستجابة تُتجاهل كلياً — سلوك الويب
        await ApiClient.instance.delete(path);
      } else {
        await ApiClient.instance.post(path);
      }
      if (!mounted) return true;
      setState(() => _coPlayers = _coPlayers
          .map((x) => x.id == c.id ? x.copyWith(isFollowing: !c.isFollowing) : x)
          .toList());
      return true;
    } catch (_) {
      // لا توست في هذه الشاشة — لكنّ الفشل يُبلَّغ للمستدعي كي لا يكذب زرّه
      return false;
    } finally {
      if (mounted) setState(() => _followBusy = null);
    }
  }

  Future<void> _viewProfile(int id) async {
    if (id == _myId) return;
    try {
      // 🔴 المنفذُ العامُّ لا `/profile`: الشرطُ أعلاه يعني أنّ هذه الدالّة لا
      //    تُنادى إلّا على **لاعبٍ آخر**، و`/profile` صار محروساً بـstaffOrSelf
      //    فيردّ 403 لكلّ نداءٍ منها — وفشلُها صامتٌ فلا يُفتح المودالُ ولا
      //    تظهر رسالة. والنظيرُ الويبيُّ رُحِّل ونُسي هذا.
      final r = await ApiClient.instance.get('/api/player/$id/public');
      if (!mounted || r is! Map || r['success'] != true) return;
      final p = ProfileResponse.fromJson(Map<String, dynamic>.from(r));
      final co = _coPlayers.where((c) => c.id == id).firstOrNull;
      if (!mounted) return;
      await showPlayerSheet(
        context,
        profile: p,
        // زرّ المتابعة يظهر فقط لمن شاركته مباراة — الخادم يرفض غيره
        following: co?.isFollowing,
        onToggleFollow: co == null ? null : () => _toggleFollow(co.id),
      );
    } catch (_) {
      // فشل صامت — لا يُفتح المودال
    }
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 40,
          height: 40,
          child: CircularProgressIndicator(strokeWidth: 2, color: Tw.amber500),
        ),
      );
    }

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: _load,
        color: Tw.amber500,
        backgroundColor: Noir.charcoal,
        child: SingleChildScrollView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                  maxWidth: context.sizeClass == WindowSizeClass.compact ? 512 : 640),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _header(),
                  const SizedBox(height: 16),
                  if (!_viewingActive) _pastSeasonCard() else _currentSeasonCard(),
                  const SizedBox(height: 16),
                  _tabBar(),
                  const SizedBox(height: 16),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: KeyedSubtree(
                        key: ValueKey('${_tab.name}|${_mode._key}'), child: _tabBody()),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── §4.2 الرأس ──
  // العنوان ومنتقي الموسم في سطر، ومفتاح الوضع في سطرٍ يمرَّر أفقياً:
  // ثلاث شرائح فأكثر مع منتقي الموسم لا تتّسع لسطرٍ واحد على الهواتف.
  Widget _header() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text('🏆 التصنيف والرتب',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(18, weight: FontWeight.w700)),
              ),
              const SizedBox(width: 6),
              _seasonPicker(),
            ],
          ),
          if (_modes.length > 1) ...[
            const SizedBox(height: 10),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: _modeSwitch(),
              ),
            ),
          ],
        ],
      );

  Widget _modeSwitch() => Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: const Color(0x66000000),
          border: Border.all(color: const Color(0xFF2A2A2A)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          for (final m in _modes) _modeChip(m),
        ]),
      );

  Widget _modeChip(RankMode m) {
    final on = _mode == m;
    final svc = CityService.instance;
    final label = m.online
        ? '🌐 أونلاين'
        : m.cityName.isEmpty
            ? 'وجاهيّ'
            : (m.cityId == _homeCityId ? '🏙️ ${m.cityName}' : m.cityName);
    // 🎨 لون الوضع: عنبريّ لعمّان، أزرق لغيرها، سماويّ للأونلاين
    final bg = m.online ? const Color(0x400EA5E9) : svc.chipBorderFor(m.cityId);
    final fg = m.online
        ? const Color(0xFFBAE6FD)
        : (m.cityId == null || m.cityId == CityService.amberCityId
            ? Tw.amber200
            : CityService.blueText);
    return InkWell(
      onTap: () => _switchMode(m),
      borderRadius: BorderRadius.circular(999),
      // زجاجٌ للشريحة النشطة وحدها: زجاجُ الخاملة يساوي ضجيجاً بلا دلالة.
      child: on
          ? GlassChip(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              tintColor: bg,
              borderColor: bg,
              child: Text(label, style: ar(11, color: fg, weight: FontWeight.w700)),
            )
          : Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              child: Text(label,
                  style: ar(11,
                      color: const Color(0xFF888888), weight: FontWeight.w700)),
            ),
    );
  }

  Widget _seasonPicker() {
    final online = _mode.online;
    final list = _currentSeasons;

    if (list.isEmpty) {
      if (online) {
        return _staticPill('🌐 لا مواسم أونلاين بعد', const Color(0x1A0EA5E9),
            const Color(0xB37DD3FC), const Color(0x330EA5E9));
      }
      if (_activeSeasonName.isEmpty) return const SizedBox.shrink();
      return _staticPill('🗓️ موسم: $_activeSeasonName', _chipBg, _accentText, _chipBorder);
    }

    final activeForMode = online ? _activeOnlineSeasonId : _activeSeasonId;
    final bg = _chipBg;
    final fg = _accentText;
    final border = _chipBorder;

    return ConstrainedBox(
      // سقف ٥٢٪ من عرض الشاشة يمنع اسم موسمٍ طويل من كسر الصفّ
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.52),
      child: GlassChip(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        tintColor: bg,
        borderColor: border,
        child: DropdownButtonHideUnderline(
          child: DropdownButton<int>(
            value: list.any((s) => s.id == _selectedSeasonId) ? _selectedSeasonId : null,
            isDense: true,
            isExpanded: true,
            dropdownColor: Tw.gray900,
            iconEnabledColor: fg,
            style: ar(12, color: fg, weight: FontWeight.w700),
            items: [
              for (final s in list)
                DropdownMenuItem(
                  value: s.id,
                  child: Text(
                    '🗓️ ${s.name}${s.id == activeForMode ? ' • الحالي' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(12, color: fg, weight: FontWeight.w700),
                  ),
                ),
            ],
            onChanged: _selectSeason,
          ),
        ),
      ),
    );
  }

  Widget _staticPill(String text, Color bg, Color fg, Color border) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: bg,
          border: Border.all(color: border),
        ),
        child: Text(text,
            maxLines: 1, style: ar(11, color: fg, weight: FontWeight.w700)),
      );

  // ── §4.3 بطاقة موسم سابق / أونلاين ──
  Widget _pastSeasonCard() {
    final row = _myRow;
    final cityTail = _mode.isCity && _mode.cityName.isNotEmpty ? ' • ${_mode.cityName}' : '';

    return _rankCardShell(
      _accent,
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('🗓️ موسم: $_selectedSeasonName$cityTail', style: ar(10, color: Tw.gray500)),
        const SizedBox(height: 4),
        if (_seasonLoading)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Center(child: Text('جارٍ التحميل…', style: ar(12, color: Tw.gray500))),
          )
        else if (row == null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Center(
                child: Text('لم تلعب في هذا الموسم', style: ar(12, color: Tw.gray500))),
          )
        else ...[
          _rankHeadline(row.rankTier, row.rankRR, null, _accentText),
          const SizedBox(height: 12),
          _statBoxes([
            ('مباراة', '${row.totalMatches}', Colors.white),
            ('فوز', '${row.totalWins}', Tw.green400),
            ('المستوى', '${row.level}', _accentText),
          ]),
        ],
      ]),
    );
  }

  // ── §4.4 بطاقة الموسم الحاليّ ──
  // 🏙️ صفّ **المدينة المعروضة**: من `standings` حين تصل، وإلا
  //    `progression`/`stats` القديمان (= الأساسيّة). مدينةٌ لم ألعب فيها
  //    بعد تعرض حالة فراغٍ خاصّة لا أصفاراً موهمة.
  Widget _currentSeasonCard() {
    final s = _standing;
    PlayerProgression? prog;
    int? matches, wins, winRate;
    if (s != null) {
      prog = s.toProgression();
      matches = s.totalMatches;
      wins = s.totalWins;
      winRate = s.winRate;
    } else if (_useLegacyProgression && _prog != null) {
      prog = _prog;
      matches = _myStats?.totalMatches;
      wins = _myStats?.totalWins;
      winRate = _myStats?.winRate;
    }

    if (prog == null || (s == null && !_useLegacyProgression)) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _emptyCityCard(),
        ..._otherStandings(),
      ]);
    }

    final color = _accentText;
    // العتبة من الإعدادات أوّلاً، ثم rrRequired من البروفايل، ثم الثابت
    final required = RankScale.rrRequiredFrom(prog.rankTier,
        config: _config, profile: prog.rrRequired);

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _rankCardShell(
        _accent,
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_mode.cityName.isNotEmpty) ...[
            Text('🏙️ ${_mode.cityName}', style: ar(10, color: Tw.gray500)),
            const SizedBox(height: 4),
          ],
          _rankHeadline(prog.rankTier, prog.rankRR, required, color),
          if (matches != null) ...[
            const SizedBox(height: 12),
            _statBoxes([
              ('مباراة', '$matches', Colors.white),
              ('فوز', '${wins ?? 0}', Tw.green400),
              ('نسبة فوز', '${winRate ?? 0}%', color),
              // الـenum الخام مقصود — يطابق الويب ويكشف المفتاح للدعم
              ('الرانك', prog.rankTier, const Color(0xFF60A5FA)),
            ]),
          ],
          const SizedBox(height: 12),
          ProgressBar(
            value: required == 0 ? 0 : prog.rankRR / required,
            color: _accent,
            height: 6,
            track: const Color(0x0DFFFFFF),
          ),
        ]),
      ),
      ..._otherStandings(),
    ]);
  }

  /// مدينةٌ بلا مبارياتٍ بعد — تطمينٌ لا أصفار.
  Widget _emptyCityCard() => _rankCardShell(
        _accent,
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_mode.cityName.isNotEmpty)
            Text('🏙️ ${_mode.cityName}', style: ar(10, color: Tw.gray500)),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Center(
              child: Text(
                _mode.cityName.isEmpty
                    ? 'لا مباريات بعد — أوّل ليلة قريبًا'
                    : 'لا مباريات في ${_mode.cityName} بعد — أوّل ليلة قريبًا',
                textAlign: TextAlign.center,
                style: ar(12, color: Tw.gray400),
              ),
            ),
          ),
          if (_homeCityId != null && _mode.cityId != _homeCityId)
            Center(
              child: Text('🏆 مبارياتك هنا تُحتسب لرتبتك في ${_mode.cityName} وحدها',
                  textAlign: TextAlign.center, style: ar(10, color: _accentText)),
            ),
        ]),
      );

  /// «رتبتك في {مدينة أخرى}: {الرتبة} {RR} RR» — تحت بطاقة الموسم الحاليّ.
  List<Widget> _otherStandings() {
    final all = _profile?.standings ?? const <Standing>[];
    final others = all.where((s) => s.cityId != _mode.cityId).toList();
    if (others.isEmpty) return const [];
    final svc = CityService.instance;
    return [
      const SizedBox(height: 8),
      for (final s in others)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: InkWell(
            onTap: () => selectCity(s.cityId),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: svc.accentFor(s.cityId).withValues(alpha: 0.06),
                border: Border.all(color: svc.accentFor(s.cityId).withValues(alpha: 0.2)),
              ),
              child: Row(children: [
                Expanded(
                  child: Text('رتبتك في ${s.cityName}:',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(11, color: Tw.gray400)),
                ),
                Text('${RankScale.badge(s.rankTier)} ${RankScale.nameAr(s.rankTier)}',
                    style: ar(11, color: Tw.gray300, weight: FontWeight.w700)),
                const SizedBox(width: 8),
                ltrText('${s.rankRR} RR',
                    num_(11, color: svc.textFor(s.cityId), weight: FontWeight.w700)),
              ]),
            ),
          ),
        ),
    ];
  }

  Widget _rankCardShell(Color color, Widget child) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
            colors: [color.withValues(alpha: 0.08), const Color(0xE6050505)],
          ),
          border: Border.all(color: color.withValues(alpha: 0.19)),
        ),
        child: child,
      );

  Widget _rankHeadline(String tier, int rr, int? required, Color color) => Row(
        children: [
          Text(RankScale.badge(tier), style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 8),
          Flexible(
            child: Text(RankScale.nameAr(tier),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(14, weight: FontWeight.w700)),
          ),
          if (_myRank > 0) ...[
            const SizedBox(width: 8),
            ltrText('#$_myRank', ar(12, color: Tw.gray500)),
          ],
          const Spacer(),
          Text('RR', style: ar(12, color: Tw.gray400)),
          const SizedBox(width: 4),
          // 🔴 القيمة والمقام في **مقطع واحد**: بفصلهما يقع «/100» يسار
          //    «0» فتُقرأ العينُ «1000». مقطعٌ واحد يُبقيها «0/100».
          Directionality(
            textDirection: TextDirection.ltr,
            child: Text.rich(TextSpan(children: [
              TextSpan(text: '$rr', style: num_(18, color: color, weight: FontWeight.w700)),
              if (required != null)
                TextSpan(text: '/$required', style: ar(10, color: Tw.gray600)),
            ])),
          ),
        ],
      );

  Widget _statBoxes(List<(String, String, Color)> cells) => IntrinsicHeight(
        child: Row(
          children: [
            for (var i = 0; i < cells.length; i++) ...[
              if (i > 0) const SizedBox(width: 12),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0x0DFFFFFF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(cells[i].$2,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ar(14, color: cells[i].$3, weight: FontWeight.w700)),
                      Text(cells[i].$1, style: ar(9, color: Tw.gray500)),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      );

  // ── §4.5 شريط التبويبات ──
  Widget _tabBar() => Row(
        children: [
          for (final t in RankTab.values) ...[
            if (t != RankTab.values.first) const SizedBox(width: 8),
            Expanded(child: _tabChip(t)),
          ],
        ],
      );

  Widget _tabChip(RankTab t) {
    final on = _tab == t;
    final label = switch (t) {
      RankTab.leaderboard => '🏅 الترتيب',
      RankTab.coplayers => '👥 لعبت معهم',
      RankTab.howto => '📖 النقاط',
    };
    return InkWell(
      onTap: () {
        setState(() => _tab = t);
        // العودة إلى «الترتيب» تعيد تشغيل التوهّج ومؤقّتاته
        if (t == RankTab.leaderboard) _restartGlow();
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: on ? const Color(0x26F59E0B) : const Color(0x0DFFFFFF),
          border: Border.all(
              color: on ? const Color(0x4DF59E0B) : const Color(0x0DFFFFFF)),
        ),
        child: Center(
          child: Text(label,
              style: ar(12,
                  color: on ? Tw.amber400 : Tw.gray500, weight: FontWeight.w500)),
        ),
      ),
    );
  }

  Widget _tabBody() => switch (_tab) {
        RankTab.leaderboard => _leaderboardTab(),
        RankTab.coplayers => _coPlayersTab(),
        RankTab.howto => _howToTab(),
      };

  // ── §4.6 الترتيب ──
  Widget _leaderboardTab() {
    final board = _board;
    // 🔴 كان هنا تكافؤ مع علّة الويب: الصفوف دائماً `slice(3)` والمنصّة
    //    تتطلّب ثلاثة، فلوحةٌ بلاعبٍ أو لاعبَين كانت تعرض **رؤوس الأعمدة
    //    وحدها**. أقلّ من ثلاثة ⇒ قائمة عادية بلا منصّة، والترقيم من ١.
    final hasPodium = board.length >= 3;
    final rest = hasPodium ? board.sublist(3) : board;
    final accent = _accentText;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (hasPodium)
          Podium(top3: board.take(3).toList(), myId: _myId, onTap: _viewProfile),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(children: [
            const SizedBox(width: 24),
            const SizedBox(width: 12),
            const SizedBox(width: 32),
            const SizedBox(width: 12),
            Expanded(child: Text('اللاعب', style: ar(9, color: Tw.gray600))),
            SizedBox(
                width: 64,
                child: Text('الرتبة',
                    textAlign: TextAlign.center, style: ar(9, color: Tw.gray600))),
            const SizedBox(width: 12),
            SizedBox(
                width: 40,
                child: Text('RR',
                    textAlign: TextAlign.center, style: ar(9, color: Tw.gray600))),
          ]),
        ),
        for (var i = 0; i < rest.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Builder(builder: (_) {
              final r = rest[i];
              final me = r.id == _myId;
              final co = _coPlayers.where((c) => c.id == r.id).firstOrNull;
              return LeaderboardRowTile(
                key: me ? _myRowKey : null,
                row: r,
                rank: i + (hasPodium ? 4 : 1),
                isMe: me,
                glow: me ? _glow : null,
                accent: accent,
                onTap: () => _viewProfile(r.id),
                follow: (!me && co != null)
                    ? FollowButton(
                        compact: true,
                        following: co.isFollowing,
                        busy: _followBusy == r.id,
                        onTap: () => _toggleFollow(co.id))
                    : null,
              );
            }),
          ),
        // 🆕 موسم بدأ للتوّ / مدينةٌ بلا مبارياتٍ بعد — لا لاعب سجّل مباراة
        if (board.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                _viewingActive && _liveLoading
                    ? 'جارٍ التحميل…'
                    : _viewingActive
                        ? (_mode.cityName.isNotEmpty
                            ? 'لا مباريات في ${_mode.cityName} بعد — أوّل ليلة قريبًا'
                            : 'الموسم بدأ للتوّ — لا نتائج بعد. العب أول مباراة وكن المتصدّر!')
                        : 'لا نتائج في هذا الموسم',
                textAlign: TextAlign.center,
                style: ar(13, color: Tw.gray600),
              ),
            ),
          ),
      ],
    );
  }

  // ── §4.7 لعبت معهم ──
  Widget _coPlayersTab() {
    if (_coPlayers.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
            child: Text('العب مباراة أولاً لتعرف لاعبين!',
                style: ar(14, color: Tw.gray600))),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final c in _coPlayers)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: () => _viewProfile(c.id),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0x08FFFFFF),
                  border: Border.all(color: const Color(0x0FFFFFFF)),
                ),
                child: Row(children: [
                  RankAvatar(url: c.avatarUrl, size: 36),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(c.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: ar(12, weight: FontWeight.w500)),
                        Text(
                          '${RankScale.badge(c.rankTier)} ${RankScale.nameAr(c.rankTier)}'
                          ' • ${c.matchCount} مباراة مشتركة',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ar(10, color: Tw.gray500),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  FollowButton(
                    following: c.isFollowing,
                    busy: _followBusy == c.id,
                    onTap: () => _toggleFollow(c.id),
                  ),
                ]),
              ),
            ),
          ),
      ],
    );
  }

  // ── §4.8 النقاط ──
  Widget _howToTab() {
    final cfg = _config;
    if (cfg == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
            child: Text('جاري تحميل البيانات...', style: ar(14, color: Tw.gray600))),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: const Color(0x80111827),
            border: Border.all(color: const Color(0x801F2937)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('نظام التقدم مقسوم إلى قسمين:', style: ar(12, color: Tw.gray300)),
            const SizedBox(height: 6),
            _bullet('نقاط الخبرة (XP):', Tw.amber400,
                ' ترفع مستواك (Level)، ولا يمكن أن تقل عن الصفر.'),
            _bullet('نقاط الرانك (RR):', const Color(0xFF60A5FA),
                ' تحدد رتبتك التنافسية، يمكن أن تكون بالسالب في حال الخسارة أو العقوبات'
                ' (مثل ديل مافيا على مافيا).'),
            if (_cities.length > 1) ...[
              const SizedBox(height: 6),
              _bullet('المدن:', CityService.blueText,
                  ' لكلّ مدينةٍ رتبةٌ وترتيبٌ مستقلّان — مباراتك تُحتسب في مدينة مكانها.'),
            ],
          ]),
        ),
        const SizedBox(height: 16),
        for (final (title, actions) in scoringCategories) ...[
          _categoryCard(title, actions, cfg),
          const SizedBox(height: 16),
        ],
        if (cfg.roleAbilities.isNotEmpty) ...[
          _roleAbilitiesCard(cfg),
          const SizedBox(height: 16),
        ],
        _ranksCard(cfg),
      ],
    );
  }

  Widget _bullet(String head, Color headColor, String rest) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text.rich(TextSpan(children: [
          const TextSpan(text: '• '),
          TextSpan(text: head, style: ar(10, color: headColor, weight: FontWeight.w700)),
          TextSpan(text: rest, style: ar(10, color: Tw.gray500)),
        ]), style: ar(10, color: Tw.gray500)),
      );

  Widget _categoryCard(String title, List<ScoringAction> actions, ProgressionConfig cfg) {
    // فعلٌ غير معرَّف في الإعدادات يختفي صفّه — لا صفر مخترع
    final rows = actions
        .where((a) => cfg.xpOf(a.key) != null || cfg.rrOf(a.key) != null)
        .toList();
    if (rows.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: const Color(0x08FFFFFF),
        border: Border.all(color: const Color(0x0FFFFFFF)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(
            color: Color(0x0DFFFFFF),
            border: Border(bottom: BorderSide(color: Color(0x0DFFFFFF))),
          ),
          child: Text(title,
              style: ar(12, color: const Color(0xFFE5E7EB), weight: FontWeight.w700)),
        ),
        for (var i = 0; i < rows.length; i++)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: i == 0
                ? null
                : const BoxDecoration(
                    border: Border(top: BorderSide(color: Color(0x0DFFFFFF)))),
            child: Row(children: [
              Text(rows[i].icon, style: const TextStyle(fontSize: 14)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(rows[i].label,
                        style: ar(11, color: Tw.gray300, weight: FontWeight.w700)),
                    Text(rows[i].desc, style: ar(9, color: Tw.gray500)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if ((cfg.xpOf(rows[i].key) ?? 0) != 0)
                    _valueChip(cfg.xpOf(rows[i].key)!, 'XP', Tw.amber400,
                        const Color(0x1AF59E0B)),
                  if ((cfg.rrOf(rows[i].key) ?? 0) != 0)
                    _valueChip(cfg.rrOf(rows[i].key)!, 'RR', const Color(0xFF60A5FA),
                        const Color(0x1A3B82F6)),
                ],
              ),
            ]),
          ),
      ]),
    );
  }

  Widget _valueChip(int v, String unit, Color posFg, Color posBg) {
    final positive = v > 0;
    // الصفر رماديّ محايد — لا يصل إلا من بطاقة تجاوزات الأدوار (حياد
    // الشريف)؛ بقيّة المواضع تُخفي الأصفار قبل النداء.
    final zero = v == 0;
    return Container(
      margin: const EdgeInsets.only(top: 2),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(4),
        color: zero
            ? const Color(0x0DFFFFFF)
            : (positive ? posBg : const Color(0x1AF43F5E)),
      ),
      child: ltrText(
          '${positive ? '+' : ''}$v $unit',
          ar(10,
              color: zero ? Tw.gray500 : (positive ? posFg : Tw.rose400),
              weight: FontWeight.w700)),
    );
  }

  // ── تجاوزات القدرات لكل دور — `config.roleAbilities` ──
  // 🔴 الأصفار هنا **تُعرض** بعكس القائمة العامة التي تُخفيها: صفر
  //    الشريف عند سؤاله عن مواطنٍ صالح حيادٌ مقصود لا صفٌّ غائب.
  /// 🔴 تعريبٌ بمصدرين: معجم التطبيق أوّلاً، ثمّ **كتالوج الخادم** —
  ///    `roleNameAr` يسقط على المفتاح الخام، فدورٌ جديد كان سيظهر
  ///    «CHAMELEON» بالإنجليزيّة وسط شاشةٍ عربيّة.
  String _abilityRoleLabel(String key) {
    final local = roleNamesAr[key];
    if (local != null) return local;
    return GameConfigService.instance.role(key)?.nameAr ?? key;
  }

  Widget _roleAbilitiesCard(ProgressionConfig cfg) {
    final roles = orderedAbilityRoles(cfg.roleAbilities.keys);
    if (roles.isEmpty) return const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: const Color(0x08FFFFFF),
        border: Border.all(color: const Color(0x0FFFFFFF)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(
            color: Color(0x0DFFFFFF),
            border: Border(bottom: BorderSide(color: Color(0x0DFFFFFF))),
          ),
          child: Text('🎭 قدرات الأدوار — تفصيل كل دور',
              style: ar(12, color: const Color(0xFFE5E7EB), weight: FontWeight.w700)),
        ),
        for (var i = 0; i < roles.length; i++)
          Builder(builder: (_) {
            final a = cfg.roleAbilities[roles[i]]!;
            return Container(
              padding: const EdgeInsets.all(12),
              decoration: i == 0
                  ? null
                  : const BoxDecoration(
                      border: Border(top: BorderSide(color: Color(0x0DFFFFFF)))),
              child: Row(children: [
                Expanded(
                  child: Text(_abilityRoleLabel(roles[i]),
                      style: ar(11, color: Tw.gray300, weight: FontWeight.w700)),
                ),
                const SizedBox(width: 8),
                _abilityCell('✅', a.correctXp, a.correctRr),
                const SizedBox(width: 12),
                _abilityCell('❌', a.wrongXp, a.wrongRr),
              ]),
            );
          }),
      ]),
    );
  }

  /// خلية «صحيحة/خاطئة» لدورٍ واحد — رقاقتا XP وRR فوق بعض.
  Widget _abilityCell(String icon, int xp, int rr) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(icon, style: const TextStyle(fontSize: 10)),
          const SizedBox(width: 4),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              _valueChip(xp, 'XP', Tw.amber400, const Color(0x1AF59E0B)),
              _valueChip(rr, 'RR', const Color(0xFF60A5FA), const Color(0x1A3B82F6)),
            ],
          ),
        ],
      );

  Widget _ranksCard(ProgressionConfig cfg) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x0DA855F7),
          border: Border.all(color: const Color(0x26A855F7)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('👑 الرتب — RR المطلوب للترقية',
              style: ar(12, color: Tw.purple400, weight: FontWeight.w700)),
          const SizedBox(height: 8),
          for (var i = 0; i < RankScale.tiers.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: i == RankScale.tiers.length - 1
                  ? null
                  : const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Color(0x0DFFFFFF)))),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(
                  '${RankScale.howToBadges[RankScale.tiers[i]]} '
                  '${RankScale.howToNames[RankScale.tiers[i]]}',
                  style: ar(11, color: Tw.gray300),
                ),
                ltrText(
                  // رتبة غائبة من الإعدادات تسقط على الثابت — لا «?»
                  '${RankScale.rrRequiredFrom(RankScale.tiers[i], config: cfg)} RR',
                  ar(12, color: Tw.purple400, weight: FontWeight.w700),
                ),
              ]),
            ),
        ]),
      );
}
