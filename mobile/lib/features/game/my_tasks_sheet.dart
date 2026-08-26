import 'package:flutter/material.dart';

import '../../app/theme/colors.dart';
import '../../core/api/roles_guide_service.dart';
import '../../core/socket/socket_service.dart';

// ══════════════════════════════════════════════════════
// 📋 «مهامّي» — ماذا عليّ في كلّ مرحلة، ومتى يجيء دوري
//
// 🔴 بلا كارتٍ ولا زخرفة (قرارُ المالك): الكارتُ مكانُه دليلُ الأدوار.
//
// 🔴 والإذنُ من الخادم لا من هنا: المُقصى يُردّ من هناك، وكلُّ فتحةٍ تُنبّه
//    الموجّه. إخفاءُ زرٍّ ليس أماناً.
//
// 🔴 و«لك دور» من `actsIn` لا من وجود نصّ: للطبيب نصٌّ في النقاش وليس له فيه
//    فعل — ووسمٌ كاذب يجعل لاعباً ينتظر دوراً لا يجيء.
// ══════════════════════════════════════════════════════

Future<void> showMyTasks(
  BuildContext context, {
  required String? roleId,
  required String? roomId,
  String? gamePhase,
  bool isDead = false,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => MyTasksSheet(
        roleId: roleId, roomId: roomId, gamePhase: gamePhase, isDead: isDead),
    );

class MyTasksSheet extends StatefulWidget {
  const MyTasksSheet({
    super.key, required this.roleId, required this.roomId,
    this.gamePhase, this.isDead = false,
  });
  final String? roleId, roomId, gamePhase;
  final bool isDead;

  @override
  State<MyTasksSheet> createState() => _MyTasksSheetState();
}

class _MyTasksSheetState extends State<MyTasksSheet> {
  late Future<List<GuideRole>> _future;
  String? _blocked;
  bool _checking = true;
  late String _sel = phaseKeyOf(widget.gamePhase);

  @override
  void initState() {
    super.initState();
    _future = RolesGuideService.instance.load();
    _ask();
  }

  Future<void> _ask() async {
    final res = await SocketService.instance
        .ask('player:my-tasks-open', {'roomId': widget.roomId});
    if (!mounted) return;
    setState(() {
      // 🔴 انعدامُ الردّ (انقطاع/مهلة) لا يُقفل شاشةً على لاعبٍ حيّ —
      //    والحارسُ الحقيقيّ خادميّ لا واجهيّ.
      _blocked = (res != null && res['success'] != true)
          ? '${res['error'] ?? 'تعذّر الفتح'}'
          : null;
      _checking = false;
    });
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
        child: Column(children: [
          _head(),
          Expanded(child: _body()),
        ]),
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
          const Text('📋', style: TextStyle(fontSize: 16)),
          const SizedBox(width: 9),
          const Expanded(
            child: Text('مهامّي',
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w900, color: Noir.vintageGold)),
          ),
          InkWell(
            onTap: () => Navigator.of(context).maybePop(),
            child: Container(
              width: 32, height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF2B2621)),
                borderRadius: BorderRadius.circular(9),
              ),
              child: const Text('✕',
                  style: TextStyle(color: Color(0xFF7E7466), fontSize: 13)),
            ),
          ),
        ]),
      );

  Widget _body() {
    if (_checking) {
      return const Center(
          child: CircularProgressIndicator(color: Noir.vintageGold, strokeWidth: 3));
    }
    if (_blocked != null || widget.isDead) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('☠️', style: TextStyle(fontSize: 40)),
            const SizedBox(height: 12),
            Text(_blocked ?? 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, height: 1.7, color: Color(0xFFCDC3AF))),
            const SizedBox(height: 12),
            const Text('أُبلِغ الموجّه بمحاولة الفتح.',
                style: TextStyle(fontSize: 11, color: Color(0xFF645C50))),
          ]),
        ),
      );
    }

    return FutureBuilder<List<GuideRole>>(
      future: _future,
      builder: (_, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(
              child: CircularProgressIndicator(color: Noir.vintageGold, strokeWidth: 3));
        }
        final role = (snap.data ?? const <GuideRole>[])
            .where((r) => r.id == widget.roleId).firstOrNull;
        if (role == null) {
          return const Center(
              child: Text('لم تُوزَّع الأدوار بعد.',
                  style: TextStyle(color: Noir.textMuted, fontSize: 13)));
        }

        final c = switch (role.team) {
          'MAFIA' => const Color(0xFFD9636A),
          'NEUTRAL' => const Color(0xFFD7A73F),
          _ => const Color(0xFF5DB98C),
        };
        final teamAr = switch (role.team) {
          'MAFIA' => 'المافيا',
          'NEUTRAL' => 'المستقلّون',
          _ => 'المواطنون',
        };
        final cur = kTaskPhases.firstWhere((p) => p.k == _sel, orElse: () => kTaskPhases.first);
        final curTxt = role.phaseNotes[cur.k];
        final curActs = role.actsIn_(cur.k);

        return Column(children: [
          // شريطُ الهويّة — بلا كارت
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Color(0xFF221F1A)))),
            child: Row(children: [
              const Text('دورك',
                  style: TextStyle(
                      fontSize: 10.5, fontWeight: FontWeight.w800, color: Color(0xFF7E7466))),
              const SizedBox(width: 9),
              Expanded(
                child: Text(role.nameAr,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: c)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: c.withValues(alpha: 0.09),
                  border: Border.all(color: c.withValues(alpha: 0.33)),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text('فريق $teamAr',
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: c)),
              ),
            ]),
          ),

          // الآن
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Noir.vintageGold.withValues(alpha: 0.06),
              border: Border.all(color: Noir.vintageGold.withValues(alpha: 0.28)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${cur.ic} ${cur.ar} — الآن',
                  style: const TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w900,
                      letterSpacing: 1.2, color: Noir.vintageGold)),
              const SizedBox(height: 5),
              Text(
                curTxt ??
                    (curActs
                        ? 'لك دورٌ في هذه المرحلة.'
                        : 'لا فعلَ مطلوبٌ منك في هذه المرحلة — راقبْ وأنصت.'),
                style: const TextStyle(fontSize: 13.5, height: 1.8, color: Color(0xFFEFE9DC)),
              ),
            ]),
          ),

          // شريطُ المراحل
          SizedBox(
            height: 46,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              children: kTaskPhases.map((p) {
                final on = _sel == p.k;
                return Padding(
                  padding: const EdgeInsetsDirectional.only(end: 6),
                  child: InkWell(
                    onTap: () => setState(() => _sel = p.k),
                    child: Container(
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        color: on ? const Color(0xFFEFE9DC) : Colors.transparent,
                        border: Border.all(
                            color: on ? const Color(0xFFEFE9DC) : const Color(0xFF2B2621)),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Text('${p.ic} ${p.ar}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: on ? FontWeight.w900 : FontWeight.w500,
                            color: on ? const Color(0xFF0A0A0B) : const Color(0xFF8D8271),
                          )),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),

          // المهامُّ كلُّها
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
              children: [
                const Text('مهامُّك في كلّ مرحلة',
                    style: TextStyle(
                        fontSize: 10, fontWeight: FontWeight.w900,
                        letterSpacing: 1.2, color: Color(0xFF645C50))),
                const SizedBox(height: 9),
                ...kTaskPhases.map((p) {
                  final acts = role.actsIn_(p.k);
                  final txt = role.phaseNotes[p.k];
                  final on = _sel == p.k;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: on
                          ? Noir.vintageGold.withValues(alpha: 0.05)
                          : const Color(0xFF111010),
                      border: Border.all(
                          color: on
                              ? Noir.vintageGold.withValues(alpha: 0.4)
                              : const Color(0xFF1F1C18)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text(p.ic, style: const TextStyle(fontSize: 14)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(p.ar,
                              style: const TextStyle(
                                  fontSize: 13.5, fontWeight: FontWeight.w800,
                                  color: Color(0xFFEFE9DC))),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: acts
                                ? const Color(0xFF5DB98C).withValues(alpha: 0.14)
                                : const Color(0xFF191713),
                            border: Border.all(
                                color: acts
                                    ? const Color(0xFF5DB98C).withValues(alpha: 0.3)
                                    : const Color(0xFF2B2621)),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(acts ? 'لك دور' : 'بلا دور',
                              style: TextStyle(
                                fontSize: 9.5, fontWeight: FontWeight.w900,
                                color: acts ? const Color(0xFF5DB98C) : const Color(0xFF645C50),
                              )),
                        ),
                      ]),
                      const SizedBox(height: 5),
                      Text(
                        txt ??
                            (acts
                                ? 'لك دورٌ في هذه المرحلة.'
                                : 'لا فعلَ مطلوبٌ منك — راقبْ وأنصت.'),
                        style: const TextStyle(
                            fontSize: 12, height: 1.8, color: Color(0xFFB3A996)),
                      ),
                    ]),
                  );
                }),
                if (role.limits.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF111010),
                      border: Border.all(color: const Color(0xFF1F1C18)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('قيودُ قدرتك',
                          style: TextStyle(
                              fontSize: 10.5, fontWeight: FontWeight.w900,
                              letterSpacing: 1, color: Noir.vintageGold)),
                      const SizedBox(height: 6),
                      ...role.limits.map((l) => Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              const Text('— ',
                                  style: TextStyle(fontSize: 12, color: Noir.vintageGold)),
                              Expanded(
                                child: Text(l.text,
                                    style: const TextStyle(
                                        fontSize: 12, height: 1.75, color: Color(0xFFB3A996))),
                              ),
                            ]),
                          )),
                    ]),
                  ),
              ],
            ),
          ),
        ]);
      },
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
