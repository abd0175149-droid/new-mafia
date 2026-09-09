import 'dart:async';
import '../../core/ui/glass.dart';

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/cities/city_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/activity.dart';
import '../../models/city.dart';
import '../../models/profile.dart';
import '../profile/profile_palette.dart';
import 'activity_sheets.dart';
import 'games_widgets.dart';

// ══════════════════════════════════════════════════════
// 🎮 الألعاب والحجوزات — الملفّ 14
// ══════════════════════════════════════════════════════
// **بلا سوكِت**. خمسة نداءات متوازية عند الدخول، والحجز نداءٌ سادس.
//
// 📌 خارج هذه الشاشة عمداً: مودال دعوة اللاعبين (§4.2) يُفتح من شاشات
//    اللعب عن بُعد (تدفّق اللاعب داخل الغرفة، ولوبي المضيف) وكلاهما في
//    طبقة اللعب — بناؤه الآن يعني مكوّناً لا يستدعيه أحد.

class GamesScreen extends StatefulWidget {
  const GamesScreen({super.key, this.focusActivityId});

  /// من `?activityId=` — إشعار «نشاط جديد» يفتح ورقة النشاط مباشرة.
  final int? focusActivityId;

  @override
  State<GamesScreen> createState() => GamesScreenState();
}

class GamesScreenState extends State<GamesScreen> {
  List<Activity> _activities = const [];
  Set<int> _bookedIds = {};
  Map<int, List<ActiveRoom>> _rooms = {};
  Map<int, List<FollowingBooker>> _bookers = {};
  List<MatchHistoryEntry> _matches = const [];

  bool _loading = true;
  bool _upcomingTab = true;
  DateTime? _selectedDay;
  int? _expandedBookers;
  int? _booking;

  // ── 🏙️ المدينة ──
  // 🔴 نجلب `cityId=all` ونرشّح محلياً لا على الخادم: شرائح المدن تعرض
  //    **عدد** فعاليّات كلّ مدينة، والعدّ يحتاج القائمة كلّها. والتبديل
  //    بين المدن فوريّ بلا نداء.
  List<City> _cities = const [];
  int? _homeCityId;
  String? _homeCityName;

  /// `null` = الكلّ. الافتراضيّ مدينة اللاعب حين تُعرف.
  int? _cityFilter;
  bool _cityChosen = false;

  // ── 🗺️ «أنت في مدينةٍ أخرى» ──
  // 🔴 عرضٌ لا تبديل: اللاعبُ في الزرقاء ومدينتُه عمّان يرى دعوةً لفعاليّات
  //    الزرقاء ويضغطها إن شاء. التبديلُ الصامت يسرق منه سياقَه بلا سبب.
  // 🔴 ولا يُلحّ: يُخفى بضغطة «لاحقًا» فلا يعود في هذه الجلسة.
  CitySuggestion? _awaySuggestion;
  bool _awayDismissed = false;

  int? get _myId => SessionStore.instance.player?.id;

  @override
  void initState() {
    super.initState();
    _load().then((_) => _openFocused());
  }

  void reload() {
    if (!_loading) _load();
  }

  Future<void> _load() async {
    final id = _myId;
    if (id == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    final api = ApiClient.instance;

    // كل نداء يتدهور وحده: غياب الحجوزات لا يُخفي الأنشطة، وغياب الغرف
    // لا يمنع الحجز. تجميعها في نداءٍ واحد يجعل أضعفها يُسقط أقواها.
    final r = await Future.wait([
      api.get('/api/player-app/activities/upcoming',
          query: {'playerId': id, 'cityId': 'all'}).catchError((_) => null),
      api.get('/api/player-app/$id/bookings').catchError((_) => null),
      api.get('/api/player/$id/profile').catchError((_) => null),
      api.get('/api/player-app/my-active-rooms').catchError((_) => null),
    ]);
    if (!mounted) return;

    final acts = (r[0] is Map && r[0]['success'] == true)
        ? ((r[0]['activities'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => Activity.fromJson(Map<String, dynamic>.from(e)))
            .toList())
        : <Activity>[];

    // 🏙️ المدن والمدينة الأساسيّة — من استجابة الفعاليّات، والبروفايل
    //    يكمل الاسم. خادمٌ قديم لا يرسلها فتسقط الشرائح بصمت.
    var cities = r[0] is Map ? City.listFrom(r[0]['cities']) : <City>[];
    if (cities.isEmpty) {
      // احتياط: نستنتجها من الفعاليّات نفسها
      final seen = <int, City>{};
      for (final a in acts) {
        if (a.cityId != null && a.cityName != null) {
          seen[a.cityId!] = City(id: a.cityId!, name: a.cityName!);
        }
      }
      cities = seen.values.toList();
    }
    CityService.instance.prime(cities);

    int? homeId = (r[0] is Map && r[0]['homeCityId'] is num)
        ? (r[0]['homeCityId'] as num).toInt()
        : null;
    String? homeName;
    if (r[2] is Map && r[2]['success'] == true) {
      final p = ProfileResponse.fromJson(Map<String, dynamic>.from(r[2] as Map));
      homeId ??= p.homeCityId;
      homeName = p.homeCityName;
    }
    homeName ??= CityService.instance.nameOf(homeId);

    final booked = <int>{};
    if (r[1] is Map && r[1]['success'] == true) {
      for (final b in (r[1]['bookings'] as List? ?? const [])) {
        if (b is Map && b['activityId'] is num) {
          booked.add((b['activityId'] as num).toInt());
        }
      }
    }

    final matches = (r[2] is Map && r[2]['success'] == true)
        ? ((r[2]['matchHistory'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => MatchHistoryEntry.fromJson(Map<String, dynamic>.from(e)))
            .toList())
        : <MatchHistoryEntry>[];

    final rooms = <int, List<ActiveRoom>>{};
    if (r[3] is Map && r[3]['success'] == true) {
      for (final g in (r[3]['rooms'] as List? ?? const [])) {
        if (g is! Map || g['activityId'] is! num) continue;
        rooms[(g['activityId'] as num).toInt()] = (g['rooms'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => ActiveRoom.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
    }

    setState(() {
      _activities = acts;
      _bookedIds = booked;
      _matches = matches;
      _rooms = rooms;
      _cities = cities;
      _homeCityId = homeId;
      _homeCityName = homeName;
      // الافتراضيّ مدينة اللاعب — مرّةً واحدة، ولا يدوس اختياره بعدها
      if (!_cityChosen) {
        _cityFilter = cities.any((c) => c.id == homeId) ? homeId : null;
        _cityChosen = true;
      } else if (_cityFilter != null && !cities.any((c) => c.id == _cityFilter)) {
        _cityFilter = null;
      }
      _loading = false;
    });

    unawaited(_loadBookers(acts, id));
    unawaited(_checkAway());
  }

  /// 🗺️ هل اللاعبُ داخل مدينةٍ غير مدينته، ولها فعاليّاتٌ قادمة؟
  /// لا يطلب إذنَ موقعٍ ولا يُخزّن شيئاً — يقرأ ما هو محفوظٌ من بوّابةٍ سابقة.
  Future<void> _checkAway() async {
    if (_awayDismissed || _cities.length < 2) return;
    final s = await CityService.instance.suggestFromLocation();
    if (!mounted) return;
    // شرطُ العرض: داخل مدينةٍ غير مدينته، وليست هي المعروضةَ أصلاً، ولها فعاليّات
    final worth = s != null && s.awayFromHome && s.cityId != _cityFilter && _countIn(s.cityId) > 0;
    setState(() => _awaySuggestion = worth ? s : null);
  }

  /// فعاليّات المدينة المختارة (أو الكلّ) قبل ترشيح اليوم.
  List<Activity> get _cityActivities => _cityFilter == null
      ? _activities
      : _activities.where((a) => a.cityId == _cityFilter).toList();

  int _countIn(int cityId) => _activities.where((a) => a.cityId == cityId).length;

  String? get _cityFilterName =>
      _cityFilter == null ? null : CityService.instance.nameOf(_cityFilter);

  /// نداءٌ لكل نشاط — يصل متأخّراً ويظهر شارته حين يصل.
  Future<void> _loadBookers(List<Activity> acts, int myId) async {
    for (final a in acts) {
      try {
        final r = await ApiClient.instance.get(
            '/api/player-app/activities/${a.id}/following-bookers',
            query: {'playerId': myId});
        if (!mounted) return;
        if (r is! Map || r['success'] != true) continue;
        final list = (r['bookers'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => FollowingBooker.fromJson(Map<String, dynamic>.from(e)))
            .toList();
        if (list.isEmpty) continue;
        setState(() => _bookers = {..._bookers, a.id: list});
      } catch (_) {
        // شارةٌ غائبة لا تعطّل بطاقة
      }
    }
  }

  void _openFocused() {
    final id = widget.focusActivityId;
    if (id == null || !mounted) return;
    for (final a in _activities) {
      if (a.id == id) {
        _openDetails(a);
        return;
      }
    }
  }

  // ══════════════════════════════════════════════════════
  // الحجز
  // ══════════════════════════════════════════════════════
  Future<void> _openDetails(Activity a) async {
    final wantsBooking = await showActivityDetails(
      context,
      activity: a,
      booked: _bookedIds.contains(a.id),
      homeCityId: _homeCityId,
      homeCityName: _homeCityName,
    );
    if (wantsBooking == true && mounted) _openBooking(a);
  }

  Future<void> _openBooking(Activity a) async {
    final offerIndex = await showBookingConfirm(
      context,
      activity: a,
      homeCityId: _homeCityId,
      homeCityName: _homeCityName,
    );
    if (offerIndex == null || !mounted) return;
    await _book(a, offerIndex < 0 ? null : offerIndex);
  }

  Future<void> _book(Activity a, int? offerId) async {
    setState(() => _booking = a.id);
    try {
      final r = await ApiClient.instance.post('/api/player-app/book', body: {
        'activityId': a.id,
        if (offerId != null) 'offerId': offerId,
      });
      if (!mounted) return;

      if (r is Map && r['success'] == true) {
        setState(() => _bookedIds = {..._bookedIds, a.id});
        _load();
        return;
      }

      await _bookingError(r is Map ? r['error'] as String? : null);
    } on ApiException catch (e) {
      if (!mounted) return;
      await _bookingError(e.message);
    } catch (_) {
      // الويب يبتلع فشل الشبكة صامتاً — انحراف مقصود: صمتٌ هنا يعني
      // لاعباً يضغط «تأكيد» ولا يحدث شيء ولا يعرف لماذا.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذّر الاتصال بالخادم')),
        );
      }
    } finally {
      if (mounted) setState(() => _booking = null);
    }
  }

  // 🔴 أُلغي حجبُ الاستبيان، فسقط معه فرعُ PENDING_SURVEYS والتحويلُ القسريّ.
  Future<void> _bookingError(String? message) async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tw.gray900,
        content: Text(
          message ?? 'خطأ في الحجز',
          style: ar(14, color: Tw.gray300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('حسناً', style: ar(14, color: Tw.amber400)),
          ),
        ],
      ),
    );
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  List<Activity> get _visible {
    final d = _selectedDay;
    final list = _cityActivities;
    if (d == null) return list;
    return list.where((a) => DateUtils.isSameDay(a.date, d)).toList();
  }

  bool _hasActivitiesOn(DateTime d) =>
      _cityActivities.any((a) => DateUtils.isSameDay(a.date, d));

  void _selectCity(int? id) => setState(() {
        _cityFilter = id;
        _cityChosen = true;
        // يومٌ مختار قد لا يوجد في المدينة الجديدة — نعيده إلى الكلّ
        if (_selectedDay != null && !_hasActivitiesOn(_selectedDay!)) _selectedDay = null;
      });

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

    final now = DateTime.now();

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: _load,
        color: Tw.amber500,
        backgroundColor: Noir.charcoal,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(context.pagePadding, 24, context.pagePadding, 96),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                    maxWidth: context.sizeClass == WindowSizeClass.compact ? 512 : 640),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _header(now),
                    const SizedBox(height: 12),
                    // 🏙️ شرائح المدينة — فوق شريط الأيّام، وبمدينتين فأكثر فقط
                    if (_cities.length > 1) ...[
                      CityChipRow(
                        cities: _cities,
                        homeCityId: _homeCityId,
                        selected: _cityFilter,
                        countOf: _countIn,
                        onSelect: _selectCity,
                      ),
                      const SizedBox(height: 10),
                    ],
                    // 🗺️ «أنت في مدينةٍ أخرى» — دعوةٌ تُضغط، لا تبديلٌ صامت
                    if (_awaySuggestion != null) ...[
                      _awayBanner(_awaySuggestion!),
                      const SizedBox(height: 10),
                    ],
                    CalendarStrip(
                      today: now,
                      selected: _selectedDay,
                      hasActivities: _hasActivitiesOn,
                      onSelect: (d) => setState(() => _selectedDay = d),
                    ),
                    if (_selectedDay != null) _filterLine(),
                    const SizedBox(height: 16),
                    _tabs(),
                    const SizedBox(height: 16),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      child: KeyedSubtree(
                        key: ValueKey(_upcomingTab),
                        child: _upcomingTab ? _activitiesList() : _historyList(),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _header(DateTime now) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('🎮 الألعاب والحجوزات', style: ar(18, weight: FontWeight.w700)),
          Text('${monthNameOf(now)} ${now.year}', style: ar(12, color: Tw.gray500)),
        ],
      );

  /// 🗺️ شريطُ «أنت في مدينةٍ أخرى» — زرُّ عرضٍ وزرُّ إخفاء، بلا تبديلٍ صامت.
  Widget _awayBanner(CitySuggestion s) {
    final svc = CityService.instance;
    final n = _countIn(s.cityId);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: svc.chipBgFor(s.cityId),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: svc.chipBorderFor(s.cityId)),
      ),
      child: Row(children: [
        Text('📍', style: ar(16)),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('يبدو أنّك في ${s.cityName}',
                  style: ar(12, color: svc.textFor(s.cityId), weight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text('عندنا $n ${n == 1 ? 'ليلة' : 'ليالٍ'} هنا — رتبتك في مدينتك لا تتأثّر',
                  style: ar(10, color: Tw.gray400)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        InkWell(
          onTap: () { _selectCity(s.cityId); setState(() => _awaySuggestion = null); },
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: svc.accentFor(s.cityId).withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text('اعرضها', style: ar(11, color: svc.textFor(s.cityId), weight: FontWeight.w700)),
          ),
        ),
        const SizedBox(width: 4),
        InkWell(
          onTap: () => setState(() { _awayDismissed = true; _awaySuggestion = null; }),
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Text('✕', style: ar(12, color: Tw.gray500)),
          ),
        ),
      ]),
    );
  }

  Widget _filterLine() {
    final d = _selectedDay!;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Center(
        child: Text.rich(
          TextSpan(children: [
            TextSpan(
              text: 'عرض أنشطة يوم ${dayNameOf(d)} ${d.day} ${monthNameOf(d)}  ',
              style: ar(10, color: const Color(0x99F59E0B)),
            ),
            WidgetSpan(
              child: GestureDetector(
                onTap: () => setState(() => _selectedDay = null),
                child: Text('عرض الكل',
                    style: ar(10, color: Tw.amber400).copyWith(
                        decoration: TextDecoration.underline,
                        decorationColor: Tw.amber400)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _tabs() => Row(children: [
        Expanded(child: _tab('📅 أنشطة قادمة', true)),
        const SizedBox(width: 8),
        Expanded(child: _tab('📊 تاريخ مبارياتي', false)),
      ]);

  Widget _tab(String label, bool upcoming) {
    final on = _upcomingTab == upcoming;
    return InkWell(
      onTap: () => setState(() => _upcomingTab = upcoming),
      borderRadius: BorderRadius.circular(12),
      // تبويبا «قادمة/سابقة» زجاجيّان — النشط بصبغةٍ ذهبية.
      child: GlassChip(
        radius: 12,
        padding: const EdgeInsets.symmetric(vertical: 10),
        tintColor: on ? const Color(0xFFF59E0B) : null,
        borderColor: on ? const Color(0x4DF59E0B) : const Color(0x1FFFFFFF),
        child: Center(
          child: Text(label,
              style: ar(14,
                  color: on ? Tw.amber400 : Tw.gray500, weight: FontWeight.w500)),
        ),
      ),
    );
  }

  Widget _activitiesList() {
    final list = _visible;
    if (list.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(
          child: Text(
            _selectedDay != null
                ? 'لا توجد أنشطة في هذا اليوم'
                : _cityFilterName != null
                    ? 'لا توجد أنشطة قادمة في $_cityFilterName حالياً'
                    : 'لا توجد أنشطة قادمة حالياً',
            textAlign: TextAlign.center,
            style: ar(14, color: Tw.gray600),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final a in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ActivityCard(
              activity: a,
              booked: _bookedIds.contains(a.id),
              busy: _booking == a.id,
              bookers: _bookers[a.id],
              rooms: _bookedIds.contains(a.id) ? _rooms[a.id] : null,
              bookersOpen: _expandedBookers == a.id,
              onToggleBookers: () => setState(
                  () => _expandedBookers = _expandedBookers == a.id ? null : a.id),
              onOpen: () => _openDetails(a),
              onBook: () => _openBooking(a),
              homeCityId: _homeCityId,
              homeCityName: _homeCityName,
              // `pushTo` لا `navigateTo`: الغرفة تُفتح من داخل التطبيق فيبقى
              // الغلاف تحتها ويعود إليه زرّ الرجوع
              onEnterRoom: (code) => pushTo('/join/$code'),
            ),
          ),
      ],
    );
  }

  Widget _historyList() {
    if (_matches.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(child: Text('لم تلعب أي مباراة بعد', style: ar(14, color: Tw.gray600))),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // عشرون فقط، بلا ترقيم — قرار مقصود في المواصفة
        for (final m in _matches.take(20))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: MatchRow(match: m),
          ),
      ],
    );
  }
}
