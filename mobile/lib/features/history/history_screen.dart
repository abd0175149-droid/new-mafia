import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/session_store.dart';
import '../../models/match.dart';
import '../../models/profile.dart';
import '../profile/profile_palette.dart';
import 'match_detail_sheet.dart';

// ══════════════════════════════════════════════════════
// 📜 سجل المباريات — الملفّ 16
// ══════════════════════════════════════════════════════
// السجلّ كاملاً بنداءٍ واحد: لا ترقيم، لا تحميل تدريجيّ، لا polling،
// ولا إعادة جلب عند العودة للتطبيق (بخلاف شاشة الرتب — الفرق مقصود:
// السجلّ لا يتغيّر إلا بمباراةٍ جديدة، وهي تعني دخولاً جديداً للشاشة).

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<MatchDetails> _matches = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final id = SessionStore.instance.player?.id;
    if (id == null) {
      // بلا معرّف لا نداء شبكة أصلاً
      setState(() { _loading = false; _error = 'لم يتم العثور على الحساب'; });
      return;
    }
    setState(() { _loading = true; _error = null; });

    try {
      final r = await ApiClient.instance.get('/api/player-app/$id/matches');
      if (!mounted) return;
      if (r is! Map || r['success'] != true) {
        setState(() {
          _loading = false;
          _error = (r is Map ? r['error'] as String? : null) ?? 'فشل في جلب السجل';
        });
        return;
      }
      setState(() {
        _matches = (r['matches'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => MatchDetails.fromJson(Map<String, dynamic>.from(e)))
            .toList();
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.message; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'خطأ في الاتصال بالخادم'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _header(),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _header() => Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: Color(0xCC000000),
          border: Border(bottom: BorderSide(color: Color(0x1AFFFFFF))),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('📜 سجل المباريات',
                style: ar(20, color: Tw.amber400, weight: FontWeight.w900)),
            InkWell(
              onTap: () => Navigator.of(context).pop(),
              customBorder: const CircleBorder(),
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0x0DFFFFFF),
                  border: Border.all(color: const Color(0x1AFFFFFF)),
                ),
                child: Center(child: Text('✕', style: ar(14, color: Tw.gray400))),
              ),
            ),
          ],
        ),
      );

  Widget _body() {
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 48,
          height: 48,
          child: CircularProgressIndicator(strokeWidth: 4, color: Tw.amber500),
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: ar(20, color: Tw.amber400, weight: FontWeight.w700)),
              const SizedBox(height: 16),
              InkWell(
                onTap: () => Navigator.of(context).pop(),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  decoration: BoxDecoration(
                    color: Tw.gray900,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Tw.amber500.withValues(alpha: 0.3)),
                  ),
                  child: Text('العودة للبروفايل', style: ar(14, color: Tw.amber400)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_matches.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🎮', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 16),
            Text('لا يوجد مباريات مسجلة بعد!',
                style: ar(14, color: Tw.gray400, weight: FontWeight.w700)),
          ],
        ),
      );
    }

    final maxWidth = switch (context.sizeClass) {
      WindowSizeClass.compact => 512.0,
      WindowSizeClass.medium => 640.0,
      WindowSizeClass.expanded => 720.0,
    };

    return RefreshIndicator(
      onRefresh: _load,
      color: Tw.amber500,
      backgroundColor: Noir.charcoal,
      child: ListView.builder(
        padding: EdgeInsets.fromLTRB(context.pagePadding, 16, context.pagePadding, 80),
        itemCount: _matches.length,
        itemBuilder: (_, i) => Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _MatchCard(
                match: _matches[i],
                onTap: () => showMatchDetail(context, _matches[i]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════
// §4.5 بطاقة المباراة
// ══════════════════════════════════════════════════════
class _MatchCard extends StatelessWidget {
  const _MatchCard({required this.match, required this.onTap});

  final MatchDetails match;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final won = match.cardWon;
    final base = won ? Tw.emerald500 : Tw.rose500;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: base.withValues(alpha: 0.05),
          border: Border.all(color: base.withValues(alpha: 0.20)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            // توهّج زخرفيّ في الزاوية — تدرّج شعاعيّ بدل ضبابيّ حقيقيّ:
            // نفس الأثر البصريّ على خلفية سوداء وبكسرٍ من الكلفة.
            Positioned(
              top: -64,
              right: -64,
              child: Container(
                width: 128,
                height: 128,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [
                    base.withValues(alpha: 0.20),
                    base.withValues(alpha: 0),
                  ]),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(match.gameName ?? 'مباراة مافيا',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: ar(15, weight: FontWeight.w700)),
                            const SizedBox(height: 2),
                            Text(
                              '${ltrRun(match.dateText)} • ⏱️ ${ltrRun(match.durationText)}',
                              style: ar(12, color: Tw.gray500),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          color: base.withValues(alpha: 0.10),
                          border: Border.all(color: base.withValues(alpha: 0.20)),
                        ),
                        child: Text(won ? '🏆 فوز' : '💀 خسارة',
                            style: ar(12,
                                color: won ? Tw.emerald400 : Tw.rose400,
                                weight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Divider(height: 1, color: Color(0x0DFFFFFF)),
                  const SizedBox(height: 12),
                  Row(children: [
                    _teamChip(),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(roleNameAr(match.role),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ar(14, color: Tw.gray300, weight: FontWeight.w700)),
                    ),
                    const Spacer(),
                    ltrText('+${match.xpEarned} XP',
                        ar(14, color: Tw.amber400, weight: FontWeight.w700)),
                    const SizedBox(width: 12),
                    ltrText(
                      '${match.rrChange >= 0 ? '+' : ''}${match.rrChange} RR',
                      ar(14,
                          color: match.rrChange >= 0 ? Tw.green400 : Tw.red400,
                          weight: FontWeight.w700),
                    ),
                  ]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 🔴 البطاقة لا تعرف «محايد» — الدور المحايد يُصنَّف مواطناً هنا
  ///    ويُعرض «دور محايد» في التفصيل. مقصود (انظر models/match.dart).
  Widget _teamChip() {
    final mafia = match.cardIsMafia;
    final c = mafia ? Tw.red500 : Tw.cyan500;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(4),
        color: c.withValues(alpha: 0.10),
        border: Border.all(color: c.withValues(alpha: 0.20)),
      ),
      child: Text(mafia ? 'مافيا' : 'مواطن',
          style: ar(10, color: mafia ? Tw.red400 : Tw.cyan400)),
    );
  }
}
