import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/theme/colors.dart';
import '../../core/api/api_client.dart';
import '../../core/api/roles_guide_service.dart';

// ══════════════════════════════════════════════════════
// 🃏 دليلُ الأدوار — نظيرُ الويب (RolesDeck.tsx) بلغة شاشة اللاعب الجديدة (2026-11-27)
//
// 🔴 القراءةُ كانت الشكوى: النصّ الطويل كان ١٣٫٥–١٤ بلونٍ باهت، ورقائقُ القفز ١٠٫٥،
//    والنصّ محبوسٌ في قائمةٍ صغيرة داخل الكارت. الآن: تجوال ٥٠٠ بحجم ١٦ والعناوين أميري،
//    وتمريرٌ واحدٌ للصفحة كلّها، ولا نصّ تحت ١٢٫٥، وكلُّ زرٍّ ٤٨.
//
// 🔴 قراراتُ المالك المقفلة باقية: يُفتح على شيخ المافيا دائماً، ولا علامةَ لدور صاحب
//    الجهاز، وبعد البدء أدوارُ الطاولة وحدها (من الخادم)، والكارتُ الحقيقيّ مع شريط القفز.
// ══════════════════════════════════════════════════════

const _bg = Color(0xFF0A0A0A);
const _panel = Color(0xFF0C0C0C);
const _blk = Color(0xFF111010);
const _line = Color(0xFF2A2A2A);
const _ivory = Color(0xFFEFE9DC);
const _text = Color(0xFFE6DFD2);
const _muted = Color(0xFFA3A3A3);
const _dim = Color(0xFF8A8A8A);
const _gold = Noir.vintageGold;
const _tap = 48.0;

const _teamColor = <String, Color>{
  'MAFIA': Color(0xFFD9636A),
  'CITIZEN': Color(0xFF5DB98C),
  'NEUTRAL': Color(0xFFD7A73F),
};
const _teamAr = <String, String>{'MAFIA': 'المافيا', 'CITIZEN': 'المواطنون', 'NEUTRAL': 'المستقلّون'};
const _teamOne = <String, String>{'MAFIA': 'فريق المافيا', 'CITIZEN': 'فريق المواطنين', 'NEUTRAL': 'مستقلّ'};

/// نسبةُ وجه الكارت (٧٢٠×١٠٧٤) — كارتٌ طوليّ.
const _kFaceRatio = 720 / 1074;

/// متى يعمل الدور — من `actsIn` وحده.
const _actAr = <String, String>{'night': 'ليلاً', 'voting': 'في التصويت', 'justification': 'في التبرير', 'dead': 'بعد إقصائه'};
const _actIc = <String, IconData>{
  'night': Icons.nightlight_outlined,
  'voting': Icons.how_to_vote_outlined,
  'justification': Icons.forum_outlined,
  'dead': Icons.person_off_outlined,
};

const _fallbackIcon = <String, String>{
  'GODFATHER': '🎩', 'SILENCER': '🤫', 'CHAMELEON': '🦎', 'WITCH': '🧙',
  'OLDER_BROTHER': '👴', 'MAFIA_REGULAR': '🔪', 'SHERIFF': '🕵️', 'DOCTOR': '🩺',
  'NURSE': '💉', 'SNIPER': '🎯', 'POLICEWOMAN': '👮', 'MAYOR': '🏛️', 'PHOENIX': '🔥',
  'YOUNGER_BROTHER': '👦', 'CITIZEN': '👤', 'JESTER': '🃏', 'ASSASSIN': '🗡️',
};

/// أسماءُ الأدوار كما تُكتب في «يتقاطع مع» — تصير الإشارةُ رقاقةً تنقل إلى الدور.
/// 🔴 تُطابَق بعد نزع الحركات والشدّة، وبحدود كلمة («مواطناً» لا تطابق «مواطن صالح»).
const _alias = <String, List<String>>{
  'GODFATHER': ['شيخ المافيا', 'الشيخ'], 'SILENCER': ['قص المافيا', 'القص'],
  'CHAMELEON': ['حرباية المافيا', 'الحرباية', 'الحرباء'], 'WITCH': ['الساحرة'],
  'OLDER_BROTHER': ['الأخ الأكبر'], 'YOUNGER_BROTHER': ['الأخ الأصغر'], 'MAFIA_REGULAR': ['مافيا عادي'],
  'SHERIFF': ['الشريف'], 'DOCTOR': ['الطبيب'], 'NURSE': ['الممرضة'], 'SNIPER': ['القناص'],
  'POLICEWOMAN': ['الشرطية'], 'MAYOR': ['العمدة'], 'PHOENIX': ['العنقاء'], 'JESTER': ['المهرج'],
  'ASSASSIN': ['السفاح'], 'CITIZEN': ['مواطن صالح', 'المواطن الصالح'],
};
final _tashkeel = RegExp('[ً-ْـ]');
final _arLetter = RegExp('[ء-ي]');
bool _isAr(String s, int i) => i >= 0 && i < s.length && _arLetter.hasMatch(s[i]);

String? _firstMention(String text, String selfId) {
  final t = text.replaceAll(_tashkeel, '');
  String? best;
  var bestAt = 1 << 30;
  _alias.forEach((id, names) {
    if (id == selfId) return;
    for (final n in names) {
      var at = t.indexOf(n);
      while (at >= 0 && (_isAr(t, at - 1) || _isAr(t, at + n.length))) {
        at = t.indexOf(n, at + 1);
      }
      if (at >= 0 && at < bestAt) { bestAt = at; best = id; }
    }
  });
  return best;
}

TextStyle _body([Color c = _text]) =>
    TextStyle(fontFamily: 'Tajawal', fontSize: 16, height: 1.85, fontWeight: FontWeight.w500, color: c);

/// أيقونةٌ لا تنعكس في RTL — اتّجاهُ السهم معنى، لا زخرفة.
Widget _fixedIcon(IconData i, {double size = 20, Color color = _gold}) =>
    Directionality(textDirection: TextDirection.ltr, child: Icon(i, size: size, color: color));

String _img(String? rel) => ApiClient.instance.upload(rel);

Future<void> showRolesDeck(
  BuildContext context, {
  List<String>? roleIds,
}) =>
    showModalBottomSheet<void>(
      context: context,
      // 🔴 فوق شريط التنقّل: ذيلُ الورقة (الأسهم وشريط القفز) كان سيُرسم تحته من «ملفّي»
      useRootNavigator: true,
      routeSettings: const RouteSettings(name: 'room-roles'),
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.8),
      builder: (_) => RolesDeckSheet(roleIds: roleIds),
    );

class RolesDeckSheet extends StatefulWidget {
  const RolesDeckSheet({super.key, this.roleIds});
  final List<String>? roleIds;

  @override
  State<RolesDeckSheet> createState() => _RolesDeckSheetState();
}

class _RolesDeckSheetState extends State<RolesDeckSheet> {
  late Future<List<GuideRole>> _future;
  final _stripCtrl = ScrollController();
  final _chipKeys = <String, GlobalKey>{};
  PageController? _page;
  String _team = 'MAFIA';
  int _idx = 0;
  bool _opened = false;

  @override
  void initState() {
    super.initState();
    _future = RolesGuideService.instance.load();
  }

  @override
  void dispose() {
    _page?.dispose();
    _stripCtrl.dispose();
    super.dispose();
  }

  List<GuideRole> _pool(List<GuideRole> all) {
    final ids = widget.roleIds;
    final list = (ids != null && ids.isNotEmpty) ? all.where((r) => ids.contains(r.id)).toList() : [...all];
    return list..sort((a, b) => a.genPriority.compareTo(b.genPriority));
  }

  /// 🔴 يُفتح على **شيخ المافيا دائماً** — لا على دور صاحب الجهاز: نظرةٌ عابرة تكشفه،
  /// والدليلُ يُفتح في قاعة. البدائل: الشيخ ← أوّلُ مافيويّ ← أوّلُ ما في القائمة.
  void _openOnAnchor(List<GuideRole> pool) {
    if (_opened || pool.isEmpty) return;
    _opened = true;
    final anchor = pool.where((r) => r.id == 'GODFATHER').firstOrNull
        ?? pool.where((r) => r.team == 'MAFIA').firstOrNull
        ?? pool.first;
    _team = anchor.team;
    _idx = pool.where((r) => r.team == _team).toList().indexWhere((r) => r.id == anchor.id).clamp(0, 9999);
    _page = PageController(initialPage: _idx);
  }

  void _setIdx(int k, {bool animate = true}) {
    setState(() => _idx = k);
    if (animate) {
      _page?.animateToPage(k, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
    }
    _centerChip();
  }

  void _setTeam(String t, {int idx = 0}) {
    setState(() { _team = t; _idx = idx; });
    // 🔴 القفزُ بعد إعادة البناء: عددُ صفحات الفريق الجديد لم يصل الـPageView بعد
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_page?.hasClients ?? false) _page!.jumpToPage(idx);
    });
    _centerChip();
  }

  void _jumpTo(List<GuideRole> pool, String id) {
    final r = pool.where((x) => x.id == id).firstOrNull;
    if (r == null) return;
    final k = pool.where((x) => x.team == r.team).toList().indexWhere((x) => x.id == id);
    if (r.team == _team) { _setIdx(k); } else { _setTeam(r.team, idx: k); }
  }

  /// الرقاقةُ الجارية في وسط الشريط — بعد أن يُرسم الإطار.
  void _centerChip() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _chipKeys['$_team:$_idx']?.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 200));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Container(
        height: mq.size.height * 0.92,
        decoration: const BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: _line)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(children: [
          // خطٌّ ذهبيّ رفيع على حافّة الورقة — توقيعُ الشاشة الجديدة
          Positioned(
            top: 0, left: mq.size.width * 0.18, right: mq.size.width * 0.18,
            child: Container(height: 1, decoration: BoxDecoration(gradient: LinearGradient(colors: [
              Colors.transparent, _gold.withValues(alpha: 0.75), Colors.transparent,
            ]))),
          ),
          FutureBuilder<List<GuideRole>>(
            future: _future,
            builder: (_, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return Column(children: [
                  _grab(), _head(null, 0),
                  const Expanded(child: Center(child: CircularProgressIndicator(color: _gold, strokeWidth: 3))),
                ]);
              }
              final all = snap.data ?? const <GuideRole>[];
              final pool = _pool(all);
              if (pool.isEmpty) {
                return Column(children: [
                  _grab(), _head(null, 0),
                  Expanded(child: Center(child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Text('تعذّر تحميل الأدوار. تحقّق من الاتّصال وأعد فتح الدليل.',
                        textAlign: TextAlign.center, style: _body(_muted)),
                  ))),
                ]);
              }
              final teams = ['MAFIA', 'CITIZEN', 'NEUTRAL'].where((t) => pool.any((r) => r.team == t)).toList();
              _openOnAnchor(pool);
              if (!teams.contains(_team)) _team = teams.first;
              final list = pool.where((r) => r.team == _team).toList();
              if (_idx >= list.length) _idx = list.isEmpty ? 0 : list.length - 1;
              _page ??= PageController(initialPage: _idx);
              final byId = {for (final r in all) r.id: r};
              final inPool = {for (final r in pool) r.id};

              return Column(children: [
                _grab(),
                _head(list.isEmpty ? null : list[_idx], list.length),
                if (teams.length > 1) _teams(teams, pool),
                Expanded(
                  child: PageView.builder(
                    controller: _page,
                    itemCount: list.length,
                    onPageChanged: (i) { setState(() => _idx = i); _centerChip(); },
                    itemBuilder: (_, i) => _rolePage(list[i], pool, byId, inPool),
                  ),
                ),
                _footer(list, mq.padding.bottom),
              ]);
            },
          ),
        ]),
      ),
    );
  }

  Widget _grab() => Container(
        width: 40, height: 4, margin: const EdgeInsets.only(top: 8),
        decoration: BoxDecoration(color: const Color(0xFF2E2E2E), borderRadius: BorderRadius.circular(2)),
      );

  Widget _head(GuideRole? cur, int n) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
        child: Row(children: [
          const Icon(Icons.style_outlined, size: 24, color: _gold),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              const Text('دليل الأدوار',
                  style: TextStyle(fontFamily: 'Amiri', fontSize: 22, fontWeight: FontWeight.w700, color: _ivory, height: 1.2)),
              if (cur != null)
                Text('${_teamAr[_team]} · ${_idx + 1} من $n',
                    style: const TextStyle(fontFamily: 'Tajawal', fontSize: 13, color: _dim, height: 1.4)),
            ]),
          ),
          if (widget.roleIds?.isNotEmpty ?? false) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: _gold.withValues(alpha: 0.12),
                border: Border.all(color: _gold.withValues(alpha: 0.4)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('أدوار هذه الطاولة',
                  style: TextStyle(fontFamily: 'Tajawal', fontSize: 12.5, fontWeight: FontWeight.w700, color: _gold)),
            ),
            const SizedBox(width: 8),
          ],
          Semantics(
            button: true, label: 'إغلاق الدليل',
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.of(context).maybePop(),
              child: Container(
                width: _tap, height: _tap, alignment: Alignment.center,
                decoration: BoxDecoration(border: Border.all(color: _line), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.close, size: 20, color: _muted),
              ),
            ),
          ),
        ]),
      );

  Widget _teams(List<String> teams, List<GuideRole> pool) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 14),
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: _panel, border: Border.all(color: _line), borderRadius: BorderRadius.circular(14)),
        child: Row(
          children: [
            for (final t in teams)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => _setTeam(t),
                    child: Container(
                      height: _tap,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: _team == t ? const Color(0xFF17130D) : Colors.transparent,
                        border: Border.all(color: _team == t ? _gold.withValues(alpha: 0.5) : Colors.transparent),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Container(width: 8, height: 8, decoration: BoxDecoration(color: _teamColor[t], shape: BoxShape.circle)),
                          const SizedBox(width: 7),
                          Text(_teamAr[t]!, style: TextStyle(fontFamily: 'Tajawal', fontSize: 15, fontWeight: FontWeight.w700,
                              color: _team == t ? _ivory : _muted)),
                          const SizedBox(width: 6),
                          Text('${pool.where((r) => r.team == t).length}', style: TextStyle(fontFamily: 'JetBrainsMono',
                              fontSize: 13, color: _team == t ? _gold : _dim)),
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );

  Widget _rolePage(GuideRole r, List<GuideRole> pool, Map<String, GuideRole> byId, Set<String> inPool) {
    final c = _teamColor[r.team] ?? _gold;
    final acts = r.actsIn.where(_actAr.containsKey).toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
      children: [
        // ── رأسُ الدور: الكارتُ بجانب الاسم ──
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Semantics(
              button: true, label: 'تكبير كارت ${r.nameAr}',
              child: GestureDetector(
                onTap: r.faceUrl == null ? null : () => _zoom(context, r),
                child: Container(
                  width: 128,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0E0D0C),
                    border: Border.all(color: c.withValues(alpha: 0.4)),
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: const [BoxShadow(color: Color(0x99000000), blurRadius: 26, offset: Offset(0, 12))],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: AspectRatio(
                    aspectRatio: _kFaceRatio,
                    child: r.faceUrl == null
                        ? Center(child: Text(_fallbackIcon[r.id] ?? '🎭', style: const TextStyle(fontSize: 40)))
                        : Stack(fit: StackFit.expand, children: [
                            CachedNetworkImage(
                              imageUrl: _img(r.faceUrl),
                              fit: BoxFit.contain,
                              errorWidget: (_, __, ___) =>
                                  Center(child: Text(_fallbackIcon[r.id] ?? '🎭', style: const TextStyle(fontSize: 40))),
                              placeholder: (_, __) => const ColoredBox(color: Color(0xFF0E0D0C)),
                            ),
                            Positioned(
                              bottom: 6, left: 6,
                              child: Container(
                                width: 28, height: 28,
                                decoration: BoxDecoration(color: const Color(0xCC050505), borderRadius: BorderRadius.circular(8)),
                                child: const Icon(Icons.zoom_in, size: 16, color: _ivory),
                              ),
                            ),
                          ]),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                  decoration: BoxDecoration(
                    color: c.withValues(alpha: 0.08),
                    border: Border.all(color: c.withValues(alpha: 0.33)),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(width: 7, height: 7, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text(_teamOne[r.team] ?? '', style: TextStyle(fontFamily: 'Tajawal', fontSize: 13, fontWeight: FontWeight.w700, color: c)),
                  ]),
                ),
                const SizedBox(height: 8),
                Text(r.nameAr,
                    style: const TextStyle(fontFamily: 'Amiri', fontSize: 32, fontWeight: FontWeight.w700, color: _ivory, height: 1.15)),
                if (acts.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    for (final k in acts)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF151412),
                          border: Border.all(color: const Color(0xFF262320)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(_actIc[k], size: 15, color: _gold),
                          const SizedBox(width: 5),
                          Text(_actAr[k]!, style: const TextStyle(fontFamily: 'Tajawal', fontSize: 13, fontWeight: FontWeight.w700, color: _text)),
                        ]),
                      ),
                  ]),
                ],
              ]),
            ),
          ]),
        ),
        if (r.oneLiner != null) ...[
          const SizedBox(height: 10),
          Text(r.oneLiner!, style: _body(_ivory).copyWith(fontSize: 17, height: 1.8)),
        ],
        if (r.winLine != null) _block(Icons.emoji_events_outlined, 'شرط الفوز', Text(r.winLine!, style: _body(_ivory)), win: true),
        if (r.howItWorks != null) _block(Icons.info_outline, 'كيف يعمل', Text(r.howItWorks!, style: _body())),
        if (r.limits.isNotEmpty) _block(Icons.shield_outlined, 'القيود', _lines(r.limits.map((l) => l.text).toList())),
        if (r.interactsWith.isNotEmpty)
          _block(Icons.swap_horiz, 'يتقاطع مع', Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final tx in r.interactsWith) ...[
              Builder(builder: (_) {
                final mid = _firstMention(tx, r.id);
                final m = mid == null ? null : byId[mid];
                if (m == null) return const SizedBox.shrink();
                final ok = inPool.contains(m.id);
                return Padding(
                  padding: const EdgeInsets.only(top: 6, bottom: 2),
                  child: Opacity(
                    opacity: ok ? 1 : 0.5,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: ok ? () => _jumpTo(pool, m.id) : null,
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 40),
                        padding: const EdgeInsetsDirectional.fromSTEB(4, 3, 10, 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF171512),
                          border: Border.all(color: const Color(0xFF2C2822)),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          if (m.faceSmUrl != null)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(3),
                              child: CachedNetworkImage(imageUrl: _img(m.faceSmUrl), width: 20, height: 30, fit: BoxFit.cover,
                                  errorWidget: (_, __, ___) => const SizedBox(width: 20, height: 30)),
                            ),
                          const SizedBox(width: 7),
                          Text(m.nameAr, style: const TextStyle(fontFamily: 'Tajawal', fontSize: 14, fontWeight: FontWeight.w700, color: _ivory)),
                          if (ok) ...[const SizedBox(width: 6), _fixedIcon(Icons.chevron_left, size: 16)],
                        ]),
                      ),
                    ),
                  ),
                );
              }),
              Text(tx, style: _body()),
            ],
          ])),
        if (r.tips.isNotEmpty) _block(Icons.lightbulb_outline, 'نصائح', _lines(r.tips)),
      ],
    );
  }

  Widget _block(IconData ic, String title, Widget child, {bool win = false}) => Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: win ? null : _blk,
          gradient: win
              ? LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
                  colors: [_gold.withValues(alpha: 0.12), _gold.withValues(alpha: 0.04)])
              : null,
          border: Border.all(color: win ? _gold.withValues(alpha: 0.35) : const Color(0xFF1F1C18)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(ic, size: 17, color: _gold),
            const SizedBox(width: 7),
            Text(title, style: const TextStyle(fontFamily: 'Tajawal', fontSize: 14.5, fontWeight: FontWeight.w800, color: _gold)),
          ]),
          const SizedBox(height: 6),
          child,
        ]),
      );

  Widget _lines(List<String> items) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final s in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 6, height: 6, margin: const EdgeInsets.only(top: 12),
                  decoration: BoxDecoration(color: _gold.withValues(alpha: 0.8), shape: BoxShape.circle),
                ),
                const SizedBox(width: 9),
                Expanded(child: Text(s, style: _body())),
              ]),
            ),
        ],
      );

  Widget _footer(List<GuideRole> list, double bottomInset) => Container(
        padding: EdgeInsets.fromLTRB(10, 8, 10, bottomInset + 12),
        decoration: const BoxDecoration(color: _bg, border: Border(top: BorderSide(color: Color(0xFF1C1C1C)))),
        child: Row(children: [
          _arrow(Icons.chevron_right, 'الدور السابق', () => _setIdx((_idx - 1 + list.length) % list.length)),
          const SizedBox(width: 6),
          Expanded(
            child: SizedBox(
              height: _tap,
              child: ShaderMask(
                // تلاشٍ على الحافّتين: يقول إنّ الشريط يُمرَّر
                shaderCallback: (b) => const LinearGradient(
                  colors: [Colors.transparent, Colors.white, Colors.white, Colors.transparent],
                  stops: [0, 0.06, 0.94, 1],
                ).createShader(b),
                blendMode: BlendMode.dstIn,
                // 🔴 ListView لا builder: الرقائقُ كلُّها مبنيّة، فتوسيطُ البعيدة منها يجد سياقها
                child: ListView(
                  controller: _stripCtrl,
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  children: List.generate(list.length, (k) {
                    // 🔴 لا وسمَ لدورك هنا — الرقاقاتُ متساويةٌ كلُّها
                    final on = k == _idx;
                    final r = list[k];
                    final key = _chipKeys.putIfAbsent('$_team:$k', () => GlobalKey());
                    return Padding(
                      key: key,
                      padding: const EdgeInsetsDirectional.only(end: 6),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => _setIdx(k),
                        child: Container(
                          padding: const EdgeInsetsDirectional.fromSTEB(5, 4, 10, 4),
                          decoration: BoxDecoration(
                            color: on ? _gold.withValues(alpha: 0.12) : Colors.transparent,
                            border: Border.all(color: on ? _gold.withValues(alpha: 0.6) : const Color(0xFF262626)),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            if (r.faceSmUrl != null)
                              Opacity(
                                opacity: on ? 1 : 0.75,
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(4),
                                  child: CachedNetworkImage(imageUrl: _img(r.faceSmUrl), width: 22, height: 33, fit: BoxFit.cover,
                                      errorWidget: (_, __, ___) => const SizedBox(width: 22, height: 33)),
                                ),
                              ),
                            const SizedBox(width: 7),
                            Text(r.nameAr, style: TextStyle(fontFamily: 'Tajawal', fontSize: 14, fontWeight: FontWeight.w700,
                                color: on ? _ivory : _muted)),
                          ]),
                        ),
                      ),
                    );
                  }),
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          _arrow(Icons.chevron_left, 'الدور التالي', () => _setIdx((_idx + 1) % list.length)),
        ]),
      );

  Widget _arrow(IconData i, String label, VoidCallback onTap) => Semantics(
        button: true, label: label,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            width: _tap, height: _tap, alignment: Alignment.center,
            decoration: BoxDecoration(color: _panel, border: Border.all(color: _line), borderRadius: BorderRadius.circular(12)),
            child: _fixedIcon(i),
          ),
        ),
      );

  /// 🔍 تكبير: الأصلُ لا المصغَّر — ضغطةٌ صريحة على صورةٍ واحدة.
  void _zoom(BuildContext ctx, GuideRole r) {
    unawaited(showDialog<void>(
      context: ctx,
      barrierColor: Colors.black.withValues(alpha: 0.95),
      builder: (dctx) => GestureDetector(
        onTap: () => Navigator.of(dctx).pop(),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: InteractiveViewer(
            maxScale: 4,
            child: Center(
              child: CachedNetworkImage(
                imageUrl: _img(r.faceFullUrl ?? r.faceUrl),
                fit: BoxFit.contain,
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ),
        ),
      ),
    ));
  }
}

/// 🃏 زرُّ الدخول إلى الدليل — بطاقةٌ داكنةٌ بخطٍّ ذهبيّ ومروحةٌ من ثلاثة كروتٍ حقيقيّة
/// (الشيخ، الشريف، المهرّج — ثابتةٌ للجميع فلا تقول شيئاً عن أحد). نظيرُ `RolesGuideEntry` في الويب.
class RolesGuideEntry extends StatelessWidget {
  const RolesGuideEntry({super.key});

  @override
  Widget build(BuildContext context) => FutureBuilder<List<GuideRole>>(
        future: RolesGuideService.instance.load(),
        builder: (_, snap) {
          final all = snap.data ?? const <GuideRole>[];
          final fan = ['GODFATHER', 'SHERIFF', 'JESTER']
              .map((id) => all.where((r) => r.id == id && r.faceSmUrl != null).firstOrNull)
              .whereType<GuideRole>()
              .toList();
          return Directionality(
            textDirection: TextDirection.rtl,
            child: Semantics(
              button: true,
              child: InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () => unawaited(showRolesDeck(context)),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 96),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: _line),
                    gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
                        colors: [Color(0xFF100D09), Color(0xFF0A0A0A)], stops: [0, 0.75]),
                  ),
                  child: Row(children: [
                    SizedBox(
                      width: 74, height: 70,
                      child: Stack(children: [
                        for (var k = 0; k < fan.length; k++)
                          Positioned(
                            right: k * 17.0, top: k == 1 ? 0 : 4,
                            child: Transform.rotate(
                              angle: [0.157, 0.0, -0.157][k],
                              child: Container(
                                width: 40, height: 60,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(5),
                                  border: Border.all(color: _gold.withValues(alpha: 0.45)),
                                  boxShadow: const [BoxShadow(color: Color(0x99000000), blurRadius: 12, offset: Offset(0, 6))],
                                ),
                                clipBehavior: Clip.antiAlias,
                                child: CachedNetworkImage(imageUrl: _img(fan[k].faceSmUrl), fit: BoxFit.cover,
                                    errorWidget: (_, __, ___) => const ColoredBox(color: Color(0xFF14100A))),
                              ),
                            ),
                          ),
                      ]),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('دليل الأدوار',
                            style: TextStyle(fontFamily: 'Amiri', fontSize: 23, fontWeight: FontWeight.w700, color: _gold, height: 1.25)),
                        Text('${all.isNotEmpty ? '${all.length} دوراً: ' : ''}كيف يعمل كلٌّ منها، وقيوده، ومع من يتقاطع',
                            style: const TextStyle(fontFamily: 'Tajawal', fontSize: 14, fontWeight: FontWeight.w500, color: _muted, height: 1.55)),
                      ]),
                    ),
                    const SizedBox(width: 8),
                    _fixedIcon(Icons.chevron_left, size: 22),
                  ]),
                ),
              ),
            ),
          );
        },
      );
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
