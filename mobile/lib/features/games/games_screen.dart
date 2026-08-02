import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/router.dart';
import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';
import '../../models/activity.dart';
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
      api.get('/api/player-app/activities/upcoming', query: {'playerId': id})
          .catchError((_) => null),
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
      _loading = false;
    });

    unawaited(_loadBookers(acts, id));
  }

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
    );
    if (wantsBooking == true && mounted) _openBooking(a);
  }

  Future<void> _openBooking(Activity a) async {
    final offerIndex = await showBookingConfirm(context, activity: a);
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

      final code = r is Map ? r['code'] : null;
      final err = (r is Map ? r['error'] as String? : null);
      await _bookingError(code == 'PENDING_SURVEYS', err);
    } on ApiException catch (e) {
      // 🔴 الخادم يردّ 4xx مع `code`، وعميلنا يرميها استثناءً — فقراءة
      //    الرمز من الاستثناء لا من الجسم. بدونها يُقرأ رفضُ الاستبيانات
      //    خطأً عاماً ولا يُنقَل اللاعب إلى استبياناته.
      if (!mounted) return;
      await _bookingError(e.code == 'PENDING_SURVEYS', e.message);
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

  Future<void> _bookingError(bool pendingSurveys, String? message) async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Tw.gray900,
        content: Text(
          message ??
              (pendingSurveys
                  ? 'يجب إكمال استبيانات فعالياتك السابقة قبل الحجز'
                  : 'خطأ في الحجز'),
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
    // تحويل قسريّ: الحجز مقفول حتى تُكمَل الاستبيانات، فإبقاؤه هنا يعني
    // ضغطاً متكرّراً على زرٍّ لن يعمل.
    if (pendingSurveys && mounted) await navigateTo('/player/feedback');
  }

  // ══════════════════════════════════════════════════════
  // البناء
  // ══════════════════════════════════════════════════════
  List<Activity> get _visible {
    final d = _selectedDay;
    if (d == null) return _activities;
    return _activities.where((a) => DateUtils.isSameDay(a.date, d)).toList();
  }

  bool _hasActivitiesOn(DateTime d) =>
      _activities.any((a) => DateUtils.isSameDay(a.date, d));

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
                : 'لا توجد أنشطة قادمة حالياً',
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
              onEnterRoom: (code) => navigateTo('/join/$code'),
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
