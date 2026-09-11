import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/game.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// ⚔️ مواجهة النهار الوجاهيّة — جانب اللاعب
// ══════════════════════════════════════════════════════
// زرّ «اطلب مواجهة» فوق الاتفاقيات (يختفي إن كانت الميزة مطفأة)، ورقةُ اختيار
// المستهدَف، بطاقةُ الردّ للمستهدَف (٢٠ث)، وبطاقة «كلمتك الآن» أثناء التنفيذ.
// القواعد من `confrontation-engine.ts` ويفرضها الخادم؛ الواجهة تعرضها مسبقاً.

const _gold = Color(0xFFC5A059);
const _blood = Color(0xFF8A0303);
const _rose = Color(0xFFFFCCD5);

/// اللوحة كاملةً — تُركَّب في مرحلة النقاش للأحياء.
class ConfrontationPanel extends StatefulWidget {
  const ConfrontationPanel({super.key, required this.controller});
  final GameSessionController controller;

  @override
  State<ConfrontationPanel> createState() => _ConfrontationPanelState();
}

class _ConfrontationPanelState extends State<ConfrontationPanel> {
  /// العدّادات تُشتقّ من مهل الخادم — النبضة لإعادة الرسم فقط.
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final s = c.confrontation;
    if (s == null || !s.enabled || c.isPlayerDead) return const SizedBox.shrink();

    final incoming = c.incomingConfrontation;
    final mine = c.myLiveConfrontation;
    final active = s.active;
    final declined = c.myDeclinedConfrontation;
    final blocked = c.confrontationBlockReason;

    return Column(children: [
      if (incoming != null) ...[
        _IncomingCard(controller: c, conf: incoming),
        const SizedBox(height: 10),
      ] else if (mine != null && mine.isPending) ...[
        _info(
          '⚔️ طلبت مواجهة ${_name(c, mine.targetPhysicalId)}',
          mine.timedOut
              ? 'انقضت مهلة الردّ — القرار لليدر'
              : 'بانتظار ردّه — ${mine.respondLeft()}ث',
          border: _gold.withValues(alpha: 0.4),
          fill: _gold.withValues(alpha: 0.05),
          titleColor: _gold,
        ),
        const SizedBox(height: 10),
      ] else if (mine != null && mine.isAccepted && active == null) ...[
        _info(
          '✓ المواجهة مقبولة',
          mine.requesterPhysicalId == c.physicalId
              ? 'ستواجه ${_name(c, mine.targetPhysicalId)} بعد آخر متحدّث — الليدر يبدؤها'
              : 'سيواجهك ${_name(c, mine.requesterPhysicalId)} بعد آخر متحدّث — الليدر يبدؤها',
          border: const Color(0xFF22C55E).withValues(alpha: 0.4),
          fill: const Color(0xFF22C55E).withValues(alpha: 0.06),
          titleColor: const Color(0xFF4ADE80),
        ),
        const SizedBox(height: 10),
      ],
      if (active != null) ...[
        _ActiveCard(controller: c, conf: active),
        const SizedBox(height: 10),
      ],
      if (declined != null && mine == null && incoming == null) ...[
        _info(
          '🚫 ${declined.declinedBy == 'LEADER' ? 'رفض الليدر' : 'رفض ${_name(c, declined.targetPhysicalId)}'} مواجهتك',
          'لم يُستهلك رصيدك — يمكنك الطلب من جديد',
          border: const Color(0xFFEF4444).withValues(alpha: 0.25),
          fill: const Color(0xFFEF4444).withValues(alpha: 0.05),
          titleColor: const Color(0xFFF87171),
        ),
        const SizedBox(height: 10),
      ],
      if (mine == null && incoming == null) ...[
        _RequestButton(controller: c, enabled: blocked == null),
        if (blocked != null) ...[
          const SizedBox(height: 4),
          Text('🔒 $blocked',
              textAlign: TextAlign.center,
              style: ar(11, color: const Color(0xFF666666))),
        ],
        const SizedBox(height: 12),
      ],
      if (c.confrontationError != null) ...[
        _error(c.confrontationError!),
        const SizedBox(height: 10),
      ],
    ]);
  }

  Widget _info(String title, String sub,
          {required Color border, required Color fill, required Color titleColor}) =>
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: fill,
          border: Border.all(color: border),
        ),
        child: Column(children: [
          Text(title, textAlign: TextAlign.center, style: ar(14, color: titleColor, weight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(sub, textAlign: TextAlign.center, style: ar(11, color: const Color(0xFF999999), height: 1.5)),
        ]),
      );
}

String _name(GameSessionController c, int pid) {
  final n = c.roster.where((p) => p.physicalId == pid).map((p) => p.name).firstOrNull ?? '';
  return n.isNotEmpty ? n : 'لاعب #$pid';
}

Widget _error(String msg) => Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: const Color(0xFFEF4444).withValues(alpha: 0.1),
        border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
      ),
      child: Text('❌ $msg', textAlign: TextAlign.center, style: ar(12, color: const Color(0xFFF87171))),
    );

/// زرّ الطلب — يفتح ورقة اختيار المستهدَف.
class _RequestButton extends StatelessWidget {
  const _RequestButton({required this.controller, required this.enabled});
  final GameSessionController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final s = controller.confrontation!;
    final budget = s.budgetOf(controller.physicalId);
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: enabled ? () => showConfrontationSheet(context, controller) : null,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: enabled ? _blood.withValues(alpha: 0.1) : const Color(0x0DFFFFFF),
              border: Border.all(
                  color: enabled ? _blood.withValues(alpha: 0.6) : const Color(0xFF2A2A2A)),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('⚔️ اطلب مواجهة',
                  style: ar(14, color: enabled ? _rose : const Color(0xFF555555), weight: FontWeight.bold)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: const Color(0x4D000000),
                  border: Border.all(color: const Color(0x1AFFFFFF)),
                ),
                child: Text('$budget/${s.perPlayer}',
                    style: mono(10, color: enabled ? _rose : const Color(0xFF555555))),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// بطاقة الردّ للمستهدَف — ٢٠ث ثمّ القرار لليدر.
class _IncomingCard extends StatelessWidget {
  const _IncomingCard({required this.controller, required this.conf});
  final GameSessionController controller;
  final Confrontation conf;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final left = conf.respondLeft();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
        border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.6), width: 2),
        boxShadow: [BoxShadow(color: const Color(0xFFF59E0B).withValues(alpha: 0.25), blurRadius: 20)],
      ),
      child: Column(children: [
        Text('⚔️ ${_name(c, conf.requesterPhysicalId)} يطلب مواجهتك',
            textAlign: TextAlign.center,
            style: ar(15, color: const Color(0xFFFCD34D), weight: FontWeight.w900)),
        const SizedBox(height: 4),
        Text('تُنفَّذ بعد آخر متحدّث: كلمته 30ث ثمّ ردّك 30ث — هل تقبل؟',
            textAlign: TextAlign.center,
            style: ar(11, color: const Color(0xFFBBBBBB), height: 1.5)),
        const SizedBox(height: 8),
        Text(conf.timedOut ? 'بانتظار الليدر' : '$leftث',
            style: mono(26, color: Colors.white, weight: FontWeight.w900)),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: _btn(
              label: '✓ أقبل',
              color: const Color(0xFF4ADE80),
              fill: const Color(0xFF22C55E).withValues(alpha: 0.2),
              border: const Color(0xFF22C55E).withValues(alpha: 0.6),
              busy: c.confrontationBusy,
              onTap: () => c.respondConfrontation(conf.id, accept: true),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _btn(
              label: '✕ أرفض',
              color: const Color(0xFFF87171),
              fill: const Color(0xFFEF4444).withValues(alpha: 0.1),
              border: const Color(0xFFEF4444).withValues(alpha: 0.4),
              busy: c.confrontationBusy,
              onTap: () => c.respondConfrontation(conf.id, accept: false),
            ),
          ),
        ]),
        const SizedBox(height: 6),
        Text('الرفض يُعلَن على الشاشة', style: ar(10, color: const Color(0xFF888888))),
      ]),
    );
  }

  Widget _btn({
    required String label,
    required Color color,
    required Color fill,
    required Color border,
    required bool busy,
    required VoidCallback onTap,
  }) =>
      Opacity(
        opacity: busy ? 0.5 : 1,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: busy ? null : onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: fill,
                border: Border.all(color: border),
              ),
              child: Text(label, style: ar(14, color: color, weight: FontWeight.bold)),
            ),
          ),
        ),
      );
}

/// المواجهة الجارية — «كلمتك الآن» لطرفيها، وسطرٌ مختصر للبقيّة.
class _ActiveCard extends StatelessWidget {
  const _ActiveCard({required this.controller, required this.conf});
  final GameSessionController controller;
  final Confrontation conf;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final me = c.physicalId;
    final meReq = conf.requesterPhysicalId == me;
    final meTgt = conf.targetPhysicalId == me;
    final opening = conf.status == 'OPENING';
    final left = conf.stageLeft();

    if (!meReq && !meTgt) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0x0DFFFFFF),
          border: Border.all(color: const Color(0xFF2A2A2A)),
        ),
        child: Text.rich(
          TextSpan(children: [
            const TextSpan(text: '⚔️ مواجهة جارية: '),
            TextSpan(text: _name(c, conf.requesterPhysicalId), style: ar(12, weight: FontWeight.bold)),
            const TextSpan(text: ' ضدّ '),
            TextSpan(text: _name(c, conf.targetPhysicalId), style: ar(12, weight: FontWeight.bold)),
            TextSpan(text: ' — ${opening ? 'كلمة الطالب' : 'الردّ'} ($leftث)'),
          ]),
          textAlign: TextAlign.center,
          style: ar(12, color: const Color(0xFF999999)),
        ),
      );
    }

    final myTurn = (meReq && opening) || (meTgt && !opening);
    final other = _name(c, meReq ? conf.targetPhysicalId : conf.requesterPhysicalId);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: myTurn ? _gold.withValues(alpha: 0.15) : const Color(0x0DFFFFFF),
        border: Border.all(color: myTurn ? _gold : const Color(0xFF2A2A2A), width: 2),
        boxShadow: myTurn ? [BoxShadow(color: _gold.withValues(alpha: 0.3), blurRadius: 24)] : null,
      ),
      child: Column(children: [
        Text(myTurn ? '🎙️ كلمتك الآن' : '🎧 ${opening ? 'كلمة' : 'ردّ'} $other',
            style: ar(15, color: myTurn ? _gold : const Color(0xFF999999), weight: FontWeight.w900)),
        const SizedBox(height: 4),
        Text('$left',
            style: mono(36,
                color: (left <= 10 && myTurn) ? const Color(0xFFF87171) : Colors.white,
                weight: FontWeight.w900)),
        Text('${opening ? 'كلمة الطالب' : 'ردّ المستهدَف'} — ${conf.stageSeconds} ثانية',
            style: ar(10, color: const Color(0xFF888888))),
      ]),
    );
  }
}

/// ورقة اختيار المستهدَف.
Future<void> showConfrontationSheet(BuildContext context, GameSessionController c) =>
    showModalBottomSheet<void>(
      context: context,
      // 🔴 مُلاحِح **الجذر** — شاشة اللعب داخل StatefulShellRoute (انظر deals_sheet)
      useRootNavigator: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      barrierColor: const Color(0xB3000000),
      builder: (_) => _ConfrontationSheet(controller: c),
    );

class _ConfrontationSheet extends StatefulWidget {
  const _ConfrontationSheet({required this.controller});
  final GameSessionController controller;

  @override
  State<_ConfrontationSheet> createState() => _ConfrontationSheetState();
}

class _ConfrontationSheetState extends State<_ConfrontationSheet> {
  int? _picked;
  late int _remapSeen;
  GameSessionController get c => widget.controller;

  @override
  void initState() {
    super.initState();
    _remapSeen = c.seatsRemapTicket;
    c.addListener(_sync);
  }

  @override
  void dispose() {
    c.removeListener(_sync);
    super.dispose();
  }

  void _sync() {
    if (!mounted) return;
    // 🪑 أُعيد ترقيم المقاعد: المُختار رقمٌ لا شخص — نُسقطه ليعيد الاختيار بوعي
    if (c.seatsRemapTicket != _remapSeen) {
      _remapSeen = c.seatsRemapTicket;
      _picked = null;
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = c.confrontation;
    final budget = s?.budgetOf(c.physicalId) ?? 0;
    final others = c.roster
        .where((p) => p.physicalId != c.physicalId && p.isAlive)
        .toList()
      ..sort((a, b) => a.physicalId.compareTo(b.physicalId));
    final blocked = c.confrontationBlockReason;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.82),
        decoration: const BoxDecoration(
          color: Color(0xFF0C0B09),
          border: Border(top: BorderSide(color: Color(0xFF1F1A12))),
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        padding: EdgeInsets.only(
          left: 16, right: 16, top: 16,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              Expanded(
                child: Text('⚔️ طلب مواجهة (رصيدك $budget/${s?.perPlayer ?? 1})',
                    style: const TextStyle(
                      fontFamily: 'Amiri', fontSize: 18, fontWeight: FontWeight.bold,
                      color: _rose, letterSpacing: 0,
                    )),
              ),
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.close, color: Color(0xFF808080)),
              ),
            ]),
            const SizedBox(height: 8),
            Text(
              'تُنفَّذ بعد آخر متحدّث وقبل التصويت: كلمتك 30ث ثمّ ردّه 30ث. '
              'إن أُقصي هدفك بتصويت هذه الجولة وكان مافيا كُوفئت، وإن كان مواطناً خُصم منك. '
              'رفضه يُعلَن على الشاشة ولا يُستهلك رصيدك.',
              style: ar(11, color: const Color(0xFF9A9A9A), height: 1.6),
            ),
            const SizedBox(height: 12),
            if (blocked != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: _gold.withValues(alpha: 0.05),
                  border: Border.all(color: _gold.withValues(alpha: 0.12)),
                ),
                child: Text('🔒 $blocked', textAlign: TextAlign.center, style: ar(12, color: _gold)),
              )
            else ...[
              for (final p in others) _option(p, s),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: Opacity(
                  opacity: (_picked == null || c.confrontationBusy) ? 0.4 : 1,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: (_picked == null || c.confrontationBusy)
                        ? null
                        : () async {
                            final ok = await c.requestConfrontation(_picked!);
                            if (ok && context.mounted) Navigator.of(context).maybePop();
                          },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        gradient: const LinearGradient(colors: [_blood, Color(0xFF5C0202)]),
                      ),
                      child: c.confrontationBusy
                          ? const SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : Text('⚔️ إرسال طلب المواجهة',
                              style: ar(14, color: Colors.white, weight: FontWeight.w900)),
                    ),
                  ),
                ),
              ),
            ],
            if (c.confrontationError != null) ...[
              const SizedBox(height: 10),
              _error(c.confrontationError!),
            ],
            const SizedBox(height: 8),
          ]),
        ),
      ),
    );
  }

  Widget _option(RosterPlayer p, ConfrontationState? s) {
    // مستهدَفٌ في مواجهةٍ قائمة: يبقى مرئيّاً معطَّلاً بلاحقةٍ صريحة (كالاتفاقيّات)
    final taken = s?.isTargeted(p.physicalId) ?? false;
    final on = _picked == p.physicalId;
    return Opacity(
      opacity: taken ? 0.45 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: taken ? null : () => setState(() => _picked = on ? null : p.physicalId),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: on ? _blood.withValues(alpha: 0.15) : const Color(0x0DFFFFFF),
                border: Border.all(color: on ? _blood : const Color(0xFFFFFFFF).withValues(alpha: 0.1)),
              ),
              child: Row(children: [
                Text('#${p.physicalId}', style: mono(13, color: on ? _rose : const Color(0xFF888888))),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(p.name.isNotEmpty ? p.name : 'لاعب #${p.physicalId}',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: ar(13, weight: on ? FontWeight.bold : FontWeight.w400)),
                ),
                if (taken)
                  Text('مستهدَف 🔒', style: ar(11, color: const Color(0xFF888888)))
                else if (on)
                  const Icon(Icons.check_circle, size: 18, color: _rose),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
