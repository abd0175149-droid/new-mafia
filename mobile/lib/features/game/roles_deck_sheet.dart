import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/theme/colors.dart';
import '../../core/api/api_client.dart';
import '../../core/api/roles_guide_service.dart';

// ══════════════════════════════════════════════════════
// 🃏 دليلُ الأدوار — كارتٌ بملء الشاشة (نظيرُ الويب)
//
// 🔴 وجهُ الكارت هو الملفّ نفسه الذي يراه اللاعب حين يقلب بطاقته، والوجهُ
//    السرّيُّ صورةٌ خالصةٌ بلا اسمٍ ولا رقم — فيصلح للعرض كما هو.
//
// 🔴 وشريطُ القفز يعالج عيبَ الكروت الوحيد: بلاه يحتاج الوصولُ إلى دورٍ بعينه
//    ستَّ إيماءات. وPageView هنا يتكفّل بالسحب الأفقيّ بلا عملٍ إضافيّ.
//
// 🔴 وبعد بدء اللعبة تُعرض أدوارُ هذه الطاولة وحدها — القائمةُ تأتي من الخادم
//    لا من حالةٍ محلّيّة.
// ══════════════════════════════════════════════════════

const _teamColor = <String, Color>{
  'MAFIA': Color(0xFFD9636A),
  'CITIZEN': Color(0xFF5DB98C),
  'NEUTRAL': Color(0xFFD7A73F),
};
const _teamAr = <String, String>{
  'MAFIA': 'المافيا',
  'CITIZEN': 'المواطنون',
  'NEUTRAL': 'المستقلّون',
};
/// نسبةُ وجه الكارت (٧٢٠×١٠٧٣) — كارتٌ طوليّ لا لوحةٌ عرضيّة.
const _kFaceRatio = 720 / 1073;

const _fallbackIcon = <String, String>{
  'GODFATHER': '🎩', 'SILENCER': '🤫', 'CHAMELEON': '🦎', 'WITCH': '🧙',
  'OLDER_BROTHER': '👴', 'MAFIA_REGULAR': '🔪', 'SHERIFF': '🕵️', 'DOCTOR': '🩺',
  'NURSE': '💉', 'SNIPER': '🎯', 'POLICEWOMAN': '👮', 'MAYOR': '🏛️',
  'YOUNGER_BROTHER': '👦', 'CITIZEN': '👤', 'JESTER': '🃏', 'ASSASSIN': '🗡️',
};

Future<void> showRolesDeck(
  BuildContext context, {
  List<String>? roleIds,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
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
  final _jumpCtrl = ScrollController();
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
    _jumpCtrl.dispose();
    super.dispose();
  }

  List<GuideRole> _pool(List<GuideRole> all) {
    final ids = widget.roleIds;
    final list = (ids != null && ids.isNotEmpty)
        ? all.where((r) => ids.contains(r.id)).toList()
        : all;
    return list..sort((a, b) => a.genPriority.compareTo(b.genPriority));
  }

  /// 🔴 يُفتح على **شيخ المافيا دائماً** — لا على دور صاحب الجهاز.
  ///
  /// كان يُفتح على دورك بحجّة أنّ مَن يفتح الدليل يبحث عن نفسه. وهي حجّةٌ خاطئة:
  /// نظرةٌ عابرة على الشاشة تكشف دورَ صاحبها فوراً، والدليلُ يُفتح في قاعةٍ لا
  /// في خلوة. ونقطةُ الفتح ثابتةٌ للجميع فلا تقول شيئاً عن أحد.
  ///
  /// ولا يُشترط وجودُ الشيخ: بعد بدء اللعبة تُعرض أدوارُ الطاولة وحدها وقد لا
  /// يكون فيها. البدائلُ بالترتيب: الشيخ ← أوّلُ مافيويّ ← أوّلُ ما في القائمة.
  void _openOnAnchor(List<GuideRole> pool) {
    if (_opened || pool.isEmpty) return;
    _opened = true;
    final anchor = pool.where((r) => r.id == 'GODFATHER').firstOrNull
        ?? pool.where((r) => r.team == 'MAFIA').firstOrNull
        ?? pool.first;
    _team = anchor.team;
    final within = pool.where((r) => r.team == _team).toList();
    _idx = within.indexWhere((r) => r.id == anchor.id).clamp(0, 9999);
    _page = PageController(initialPage: _idx);
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Container(
        height: h * 0.92,
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A0B),
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
          border: Border(top: BorderSide(color: Color(0xFF2B2621))),
        ),
        clipBehavior: Clip.antiAlias,
        child: FutureBuilder<List<GuideRole>>(
          future: _future,
          builder: (_, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(
                child: CircularProgressIndicator(color: Noir.vintageGold, strokeWidth: 3));
            }
            final all = snap.data ?? const <GuideRole>[];
            final pool = _pool(all);
            if (pool.isEmpty) {
              return const Center(
                child: Text('تعذّر تحميل الأدوار — تحقّق من الاتّصال.',
                    style: TextStyle(color: Noir.textMuted, fontSize: 13)));
            }
            final teams = ['MAFIA', 'CITIZEN', 'NEUTRAL']
                .where((t) => pool.any((r) => r.team == t)).toList();
            _openOnAnchor(pool);
            if (!teams.contains(_team)) _team = teams.first;

            final list = pool.where((r) => r.team == _team).toList();
            if (_idx >= list.length) _idx = list.isEmpty ? 0 : list.length - 1;
            _page ??= PageController(initialPage: _idx);

            return Column(children: [
              _head(),
              if (teams.length > 1) _teamChips(teams, pool),
              Expanded(
                child: PageView.builder(
                  controller: _page,
                  itemCount: list.length,
                  onPageChanged: (i) => setState(() => _idx = i),
                  itemBuilder: (_, i) => _card(list[i]),
                ),
              ),
              _counter(list.length),
              _jumpStrip(list),
            ]);
          },
        ),
      ),
    );
  }

  Widget _head() => Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 11),
        decoration: const BoxDecoration(
          color: Color(0xFF0D0C0B),
          border: Border(bottom: BorderSide(color: Color(0xFF221F1A))),
        ),
        child: Row(children: [
          const Text('🃏', style: TextStyle(fontSize: 16)),
          const SizedBox(width: 9),
          const Expanded(
            child: Text('الأدوار',
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w900, color: Noir.vintageGold)),
          ),
          if (widget.roleIds?.isNotEmpty ?? false)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF2B2621)),
                borderRadius: BorderRadius.circular(7),
              ),
              child: const Text('أدوارُ هذه الطاولة',
                  style: TextStyle(fontSize: 10, color: Color(0xFF8D8271))),
            ),
          const SizedBox(width: 8),
          InkWell(
            onTap: () => Navigator.of(context).maybePop(),
            child: Container(
              width: 32, height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF2B2621)),
                borderRadius: BorderRadius.circular(9),
              ),
              child: const Text('✕', style: TextStyle(color: Color(0xFF7E7466), fontSize: 13)),
            ),
          ),
        ]),
      );

  Widget _teamChips(List<String> teams, List<GuideRole> pool) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Row(
          children: teams.map((t) {
            final on = _team == t;
            final c = _teamColor[t]!;
            return Padding(
              padding: const EdgeInsetsDirectional.only(end: 6),
              child: InkWell(
                onTap: () => setState(() {
                  _team = t;
                  _idx = 0;
                  _page?.jumpToPage(0);
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: on ? c : Colors.transparent,
                    border: Border.all(color: on ? c : const Color(0xFF2B2621)),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${_teamAr[t]} ${pool.where((r) => r.team == t).length}',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      color: on ? const Color(0xFF0A0A0B) : const Color(0xFF8D8271),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      );

  Widget _card(GuideRole r) {
    final c = _teamColor[r.team] ?? Noir.vintageGold;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFF2B2621)),
          gradient: const LinearGradient(
            begin: Alignment.topRight, end: Alignment.bottomLeft,
            colors: [Color(0xFF16130F), Color(0xFF0C0B0A)],
          ),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // ══════════════════════════════════════════
          // وجهُ الكارت الحقيقيّ — كاملاً بلا قصّ
          // 🔴 كان صندوقاً عرضيّاً (ارتفاعُه ١٦٨ وعرضُه عرضُ اللوحة) بـcover،
          //    والصورةُ كارتٌ **طوليّ** ٧٢٠×١٠٧٣ — فتُقَصّ نحو ثلثَي الطول.
          //    الصندوقُ صار يتبع نسبةَ الكارت، وBoxFit.contain يمنع القصّ
          //    لأيّ صورةٍ تُرفع بنسبةٍ أخرى غداً.
          // ══════════════════════════════════════════
          SizedBox(
            height: _artHeight(context),
            child: Center(
              child: AspectRatio(
                aspectRatio: _kFaceRatio,
                child: GestureDetector(
                  onTap: r.faceUrl == null ? null : () => _zoom(context, r),
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF0E0D0C),
                      border: Border.all(color: c.withValues(alpha: 0.27)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: r.faceUrl == null
                        ? Center(
                            child: Text(_fallbackIcon[r.id] ?? '🎭',
                                style: const TextStyle(fontSize: 40)))
                        : CachedNetworkImage(
                            imageUrl: ApiClient.instance.upload(r.faceUrl),
                            fit: BoxFit.contain,
                            errorWidget: (_, __, ___) => Center(
                                child: Text(_fallbackIcon[r.id] ?? '🎭',
                                    style: const TextStyle(fontSize: 40))),
                            placeholder: (_, __) =>
                                const ColoredBox(color: Color(0xFF0E0D0C)),
                          ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(r.nameAr,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900, color: c, height: 1.25)),
          Text(r.nameEn,
              textAlign: TextAlign.center,
              textDirection: TextDirection.ltr,
              style: const TextStyle(fontSize: 10, letterSpacing: 2.2, color: Color(0xFF645C50))),
          if (r.oneLiner != null) ...[
            const SizedBox(height: 8),
            Text(r.oneLiner!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, height: 1.8, color: Color(0xFFCDC3AF))),
          ],
          const SizedBox(height: 12),
          const Divider(height: 1, color: Color(0xFF221F1A)),
          Expanded(
            child: ListView(padding: const EdgeInsets.only(top: 12), children: [
              if (r.howItWorks != null)
                _block('كيف يعمل',
                    Text(r.howItWorks!,
                        style: const TextStyle(
                            fontSize: 12.5, height: 1.85, color: Color(0xFFB3A996)))),
              if (r.limits.isNotEmpty)
                _block('القيود', _lines(r.limits.map((l) => l.text).toList())),
              if (r.interactsWith.isNotEmpty) _block('يتقاطع مع', _lines(r.interactsWith)),
              if (r.tips.isNotEmpty) _block('نصائح', _lines(r.tips)),
              if (r.winLine != null)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  decoration: BoxDecoration(
                    color: Noir.vintageGold.withValues(alpha: 0.07),
                    border: Border.all(color: Noir.vintageGold.withValues(alpha: 0.2)),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text('🏆 ${r.winLine}',
                      style: const TextStyle(
                          fontSize: 11.5, height: 1.7, color: Noir.vintageGold)),
                ),
            ]),
          ),
        ]),
      ),
    );
  }

  /// ارتفاعُ الفنّ — أصغرُ ٢٠٪ ممّا كان (٠٫٣٤ ⇐ ٠٫٢٧٢ و٣٢٠ ⇐ ٢٥٦).
  /// 🔴 الفارقُ يذهب كلُّه إلى النصّ تحته: يظهر منه أكثرُ قبل الحاجة للتمرير.
  double _artHeight(BuildContext ctx) {
    final h = MediaQuery.of(ctx).size.height;
    return (h * 0.272).clamp(120.0, 256.0);
  }

  /// 🔍 تكبير: الكارتُ في الدليل صغير، ومَن أراد التفاصيل يضغطه.
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
                imageUrl: ApiClient.instance.upload(r.faceFullUrl ?? r.faceUrl),
                fit: BoxFit.contain,
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ),
        ),
      ),
    ));
  }

  Widget _block(String title, Widget child) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 10.5, fontWeight: FontWeight.w900,
                  letterSpacing: 1, color: Noir.vintageGold)),
          const SizedBox(height: 5),
          child,
        ]),
      );

  Widget _lines(List<String> items) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: items
            .map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('— ',
                        style: TextStyle(fontSize: 12, color: Noir.vintageGold)),
                    Expanded(
                      child: Text(s,
                          style: const TextStyle(
                              fontSize: 12, height: 1.75, color: Color(0xFFB3A996))),
                    ),
                  ]),
                ))
            .toList(),
      );

  Widget _counter(int n) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Text('${_idx + 1} / $n',
            textAlign: TextAlign.center,
            textDirection: TextDirection.ltr,
            style: const TextStyle(fontSize: 11, color: Color(0xFF645C50))),
      );

  Widget _jumpStrip(List<GuideRole> list) => Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: ListView.builder(
          controller: _jumpCtrl,
          scrollDirection: Axis.horizontal,
          itemCount: list.length,
          itemBuilder: (_, k) {
            // 🔴 ولا وسمَ لدورك هنا: النجمةُ كانت تُعلّمه في الشريط — وهو
            //    التسريبُ نفسُه في موضعٍ أصغر. الرقاقاتُ متساويةٌ كلُّها.
            final on = k == _idx;
            return Padding(
              padding: const EdgeInsetsDirectional.only(end: 6),
              child: InkWell(
                onTap: () {
                  setState(() => _idx = k);
                  _page?.animateToPage(k,
                      duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
                },
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: on ? const Color(0xFFEFE9DC) : Colors.transparent,
                    border: Border.all(
                        color: on ? const Color(0xFFEFE9DC) : const Color(0xFF2B2621)),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(list[k].nameAr,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: on ? FontWeight.w900 : FontWeight.w500,
                        color: on ? const Color(0xFF0A0A0B) : const Color(0xFF8D8271),
                      )),
                ),
              ),
            );
          },
        ),
      );
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
