import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/notifications/inbox_service.dart';
import '../../core/storage/session_store.dart';
import '../../models/home.dart';
import '../notifications/inbox_sheet.dart';
import '../shell/chips_balance_pill.dart';

// ══════════════════════════════════════════════════════
// 🏠 الرئيسية — الملفّ 12
// ══════════════════════════════════════════════════════
// مبنيّ منها في هذه الدفعة: صف الرأس · بطاقة البروفايل بشريط الخبرة ·
// شبكة الإحصاءات · الأنشطة القادمة · زرّ التواصل.
//
// 📌 مؤجَّل بوعي إلى دفعات M3 التالية، لا منسيّ:
//    لوحة الموظّف (§4.6) وبطاقة اللعبة النشطة (§4.8) وغرف الحجوزات
//    (§4.9) وطلب المطعم (§4.11) والاستضافة عن بُعد (§4.12) وخلاصة
//    الأصدقاء (§4.15). أوّلها يحتاج تنقّلاً إلى واجهات ويب، وثانيها
//    طبقة اللعب في M4.

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  HomeProfile? _profile;
  List<UpcomingActivity> _upcoming = const [];
  bool _loading = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final id = SessionStore.instance.player?.id;
    if (id == null) return;
    setState(() { _loading = true; _failed = false; });

    // النداءان مستقلّان: فشل الأنشطة لا يُفرغ البطاقة، وفشل الملفّ لا
    // يُخفي الأنشطة. تجميعهما في Future.wait يجعل أضعفهما يُسقط الاثنين.
    final profile = ApiClient.instance
        .get('/api/player/$id/profile')
        .then((r) => r is Map ? HomeProfile.fromJson(Map<String, dynamic>.from(r)) : null)
        .catchError((_) => null);

    final acts = ApiClient.instance
        .get('/api/player-app/activities/upcoming', query: {'playerId': id})
        .then((r) {
          final list = (r is Map ? r['activities'] : null) as List? ?? const [];
          return list
              .take(3)   // حدّ أقصى ثلاثة — المواصفة
              .map((e) => UpcomingActivity.fromJson(Map<String, dynamic>.from(e as Map)))
              .toList();
        })
        .catchError((_) => <UpcomingActivity>[]);

    final p = await profile;
    final a = await acts;
    if (!mounted) return;
    setState(() {
      _profile = p;
      _upcoming = a;
      _loading = false;
      _failed = p == null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        onRefresh: _load,
        color: const Color(0xFFF59E0B),
        backgroundColor: Noir.charcoal,
        child: ListView(
          padding: EdgeInsets.fromLTRB(
              context.pagePadding, 12, context.pagePadding, 96),
          children: [
            _header(),
            const SizedBox(height: 12),
            if (_loading) const _Loading()
            else if (_failed) _error()
            else ...[
              _ProfileCard(profile: _profile!),
              const SizedBox(height: 16),
              _StatsGrid(stats: _profile!.stats),
              if (_upcoming.isNotEmpty) ...[
                const SizedBox(height: 20),
                _UpcomingSection(items: _upcoming),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _header() => const Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          ChipsBalancePill(),
          _BellButton(),
        ],
      );

  Widget _error() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 48),
        child: Column(children: [
          Text('تعذّر تحميل بياناتك', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          FilledButton(onPressed: _load, child: const Text('أعد المحاولة')),
        ]),
      );
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 64),
        child: Center(
          child: SizedBox(
            width: 32, height: 32,
            child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFF59E0B)),
          ),
        ),
      );
}

/// جرس الإشعارات وشارته — الملفّ 19.
class _BellButton extends StatelessWidget {
  const _BellButton();

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        // نسخة واحدة يستمع إليها الجرس والصندوق — العدّ لا يفترقان فيه
        animation: InboxService.instance,
        builder: (_, __) {
          final unread = InboxService.instance.unreadCount;
          return InkWell(
            onTap: () => showInbox(context),
            borderRadius: NoirRadius.soft,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(
                    color: const Color(0x14FFFFFF),
                    borderRadius: NoirRadius.soft,
                    border: Border.all(color: const Color(0x1FFFFFFF)),
                  ),
                  child: const Center(child: Text('🔔', style: TextStyle(fontSize: 20))),
                ),
                if (unread > 0)
                  // 🔴 `Positioned` لا `PositionedDirectional`: الشارة عنصر
                  //    بصريّ لا نصّيّ، وموضعها أعلى-يمين الأيقونة في كل اتجاه.
                  Positioned(
                    top: -4,
                    right: -4,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 20),
                      height: 20,
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Center(
                        child: Text(InboxService.instance.badgeText,
                            style: const TextStyle(
                                fontFamily: 'Tajawal',
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                                letterSpacing: 0)),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      );
}

// ══════════════════════════════════════════════════════
// §4.5 بطاقة البروفايل
// ══════════════════════════════════════════════════════
class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.profile});
  final HomeProfile profile;

  @override
  Widget build(BuildContext context) {
    final r = RankInfo.of(profile.progression.rankTier);
    final pr = profile.progression;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0x14FBBF24), Color(0xE6050505)],
        ),
        border: Border.all(color: const Color(0x26FBBF24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            _Avatar(url: profile.avatarUrl),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('أهلاً ${profile.name} 👋',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontFamily: 'Tajawal', fontSize: 18,
                          fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0)),
                  const SizedBox(height: 2),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0x26FBBF24),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('${r.badge} ${r.nameAr} • Lv.${pr.level}',
                        style: const TextStyle(
                            fontFamily: 'Tajawal', fontSize: 12,
                            color: Color(0xFFFBBF24), letterSpacing: 0)),
                  ),
                ],
              ),
            ),
          ]),
          const SizedBox(height: 16),
          // شريط الخبرة
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('XP ${pr.xp}', style: _xpLabel),
            Text('${pr.nextLevelXP}', style: _xpLabel),
          ]),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 6,
              child: Stack(children: [
                const ColoredBox(color: Color(0x0DFFFFFF), child: SizedBox.expand()),
                // يتحرّك من صفر عند الدخول — القيمة تُقرأ لا تُقفز
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: pr.xpProgress / 100),
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOut,
                  builder: (_, v, __) => FractionallySizedBox(
                    widthFactor: v.clamp(0, 1),
                    heightFactor: 1,   // بدونها ارتفاع التعبئة صفر — انظر ProgressBar
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [Color(0xFFFBBF24), Color(0xFFEF4444)]),
                      ),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  static const _xpLabel = TextStyle(
      fontFamily: 'Tajawal', fontSize: 10, color: Color(0xFF6B7280), letterSpacing: 0);
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.url});
  final String? url;

  @override
  Widget build(BuildContext context) {
    // 🖼️ المسار قد يصل نسبياً (`/uploads/…`) — يُحلّ عبر البوّابة الوحيدة
    final abs = ApiClient.instance.upload(url);
    return Container(
      width: 64, height: 64,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0x66FBBF24), width: 3),
        gradient: const LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF1A1A1A), Color(0xFF2A2A2A)],
        ),
        boxShadow: const [BoxShadow(color: Color(0x1AFBBF24), blurRadius: 12)],
      ),
      clipBehavior: Clip.antiAlias,
      child: abs.isEmpty
          ? const Center(child: Text('🎭', style: TextStyle(fontSize: 30)))
          : CachedNetworkImage(
              imageUrl: abs,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) =>
                  const Center(child: Text('🎭', style: TextStyle(fontSize: 30))),
            ),
    );
  }
}

// ══════════════════════════════════════════════════════
// §4.7 شبكة الإحصاءات
// ══════════════════════════════════════════════════════
class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.stats});
  final PlayerStats stats;

  @override
  Widget build(BuildContext context) {
    // الترتيب في RTL يبدأ من اليمين تلقائياً — لا تعكس المصفوفة
    final cells = <(String, String, Color)>[
      ('مباريات', '${stats.totalMatches}', const Color(0xFFFBBF24)),
      ('فوز', '${stats.winRate}%', const Color(0xFF22C55E)),
      ('نجاة', '${stats.survivalRate}%', const Color(0xFF3B82F6)),
      ('سلسلة', '${stats.longestWinStreak}', const Color(0xFFF97316)),
    ];

    return Row(
      children: [
        for (var i = 0; i < cells.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(child: _StatCell(label: cells[i].$1, value: cells[i].$2, color: cells[i].$3)),
        ],
      ],
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0x08FFFFFF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0x0FFFFFFF)),
        ),
        child: Column(children: [
          Text(value,
              style: TextStyle(
                  fontFamily: 'Tajawal', fontSize: 18, fontWeight: FontWeight.bold,
                  color: color, letterSpacing: 0)),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(
                  fontFamily: 'Tajawal', fontSize: 10, color: Color(0xFF6B7280), letterSpacing: 0)),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// §4.13 الأنشطة القادمة
// ══════════════════════════════════════════════════════
class _UpcomingSection extends StatelessWidget {
  const _UpcomingSection({required this.items});
  final List<UpcomingActivity> items;

  static const _difficulty = <String, (String, Color)>{
    'easy': ('🟢 سهل', Color(0xFF22C55E)),
    'medium': ('🟡 متوسط', Color(0xFFF59E0B)),
    'hard': ('🔴 صعب', Color(0xFFEF4444)),
    'expert': ('🟣 خبير', Color(0xFFA855F7)),
  };

  @override
  Widget build(BuildContext context) {
    // التاريخ بتقويم عربيّ أردنيّ — «الجمعة، ٢٤ تموز»
    final fmt = DateFormat('EEEE، d MMMM', 'ar_JO');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('📅 أنشطة قادمة',
                style: TextStyle(
                    fontFamily: 'Tajawal', fontSize: 14,
                    fontWeight: FontWeight.w600, color: Colors.white, letterSpacing: 0)),
            Text('عرض الكل ←',
                style: TextStyle(
                    fontFamily: 'Tajawal', fontSize: 10,
                    color: Color(0x99F59E0B), letterSpacing: 0)),
          ],
        ),
        const SizedBox(height: 12),
        for (final a in items) ...[
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0x08FFFFFF),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0x0FFFFFFF)),
            ),
            child: Row(children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Flexible(
                        child: Text(a.name,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontFamily: 'Tajawal', fontSize: 14,
                                color: Colors.white, letterSpacing: 0)),
                      ),
                      const SizedBox(width: 8),
                      _difficultyPill(a.difficulty),
                    ]),
                    const SizedBox(height: 2),
                    Text(
                      '${fmt.format(a.date)}${a.locationName != null ? ' • 📍 ${a.locationName}' : ''}',
                      style: const TextStyle(
                          fontFamily: 'Tajawal', fontSize: 10,
                          color: Color(0xFF6B7280), letterSpacing: 0),
                    ),
                    const SizedBox(height: 2),
                    Text('👥 ${a.bookedCount}/${a.maxPlayers} لاعب',
                        style: const TextStyle(
                            fontFamily: 'Tajawal', fontSize: 10,
                            color: Color(0xFF4B5563), letterSpacing: 0)),
                  ],
                ),
              ),
              const Text('🎟️', style: TextStyle(fontSize: 12)),
            ]),
          ),
        ],
      ],
    );
  }

  Widget _difficultyPill(String d) {
    final (label, color) = _difficulty[d] ?? _difficulty['medium']!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label,
          style: TextStyle(fontFamily: 'Tajawal', fontSize: 8, color: color, letterSpacing: 0)),
    );
  }
}
