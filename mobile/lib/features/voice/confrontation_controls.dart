import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/voice.dart';
import '../profile/profile_palette.dart';
import 'voice_service.dart';

// ══════════════════════════════════════════════════════
// ⚔️ ConfrontationControls — §4.ج في الملفّ ٣١
// ══════════════════════════════════════════════════════
// ستّ حالاتٍ متبادلة الحصر مرتّبةٍ بالأسبقية: أوّل شرطٍ يصدق يُرسَم،
// وإلّا لا شيء. الحالة كلّها من الخادم — العميل يرسم البثوث فقط.

const _gold = Color(0xFFC5A059);
const _emerald = Color(0xFF10B981);
const _danger = Color(0xFFEF4444);
const _line = Color(0xFF2A2A2A);
const _dim = Color(0xFF808080);

class ConfrontationControls extends StatefulWidget {
  const ConfrontationControls({
    super.key,
    required this.service,
    required this.isHost,
    this.myPid,
    this.gamePhase,
    this.players = const [],
  });

  final VoiceService service;
  final bool isHost;
  final int? myPid;
  final String? gamePhase;

  /// `(physicalId, name, isAlive)` — أهداف الطلب.
  final List<({int physicalId, String name, bool isAlive})> players;

  @override
  State<ConfrontationControls> createState() => _ConfrontationControlsState();
}

class _ConfrontationControlsState extends State<ConfrontationControls> {
  bool _picking = false;
  bool _busy = false;
  String? _err;
  Timer? _tick;

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  /// العدّاد كلّ نصف ثانية — **أثناء النشاط فقط** كي لا يدور مؤقّتٌ عبثاً.
  void _syncTicker(bool active) {
    if (active && _tick == null) {
      _tick = Timer.periodic(const Duration(milliseconds: 500), (_) {
        if (mounted) setState(() {});
      });
    } else if (!active && _tick != null) {
      _tick?.cancel();
      _tick = null;
    }
  }

  String _nameOf(int pid) {
    for (final p in widget.players) {
      if (p.physicalId == pid) return p.name;
    }
    return '#$pid';
  }

  Future<void> _send(Future<String?> Function() fn) async {
    setState(() {
      _busy = true;
      _err = null;
    });
    final err = await fn();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _err = err;
      if (err == null) _picking = false;
    });
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: widget.service,
        builder: (context, _) {
          final cf = widget.service.confrontation;
          _syncTicker(cf?.status == ConfrontationStatus.active);

          // ① المواجهة النشطة يراها الجميع
          if (cf?.status == ConfrontationStatus.active) return _active(cf!);

          // ② موافقة الطرف المستهدَف
          if (cf?.status == ConfrontationStatus.pendingTarget &&
              cf!.targetId == widget.myPid &&
              !widget.isHost) {
            return _goldPanel(
              title: '⚔️ ${cf.requesterName ?? _nameOf(cf.requesterId)} '
                  'يطلب مواجهتك',
              primary: 'قبول',
              secondary: 'رفض',
              onPrimary: () =>
                  _send(() => widget.service.respondConfrontation(true)),
              onSecondary: () =>
                  _send(() => widget.service.respondConfrontation(false)),
            );
          }

          // ③ اعتماد المُوجِّه
          if (cf?.status == ConfrontationStatus.pendingLeader &&
              widget.isHost) {
            return _goldPanel(
              title: '⚔️ طلب مواجهة: ${_nameOf(cf!.requesterId)} × '
                  '${_nameOf(cf.targetId)} (وافقا)',
              primary: 'اعتمِد (30ث)',
              secondary: 'ارفض',
              onPrimary: () =>
                  _send(() => widget.service.approveConfrontation(true)),
              onSecondary: () =>
                  _send(() => widget.service.approveConfrontation(false)),
            );
          }

          // ④ انتظار الطالِب
          if (cf?.status == ConfrontationStatus.pendingTarget &&
              cf!.requesterId == widget.myPid) {
            return _waitBar(
                '⚔️ بانتظار موافقة ${cf.targetName ?? _nameOf(cf.targetId)}…');
          }

          // ⑤ انتظار موافقة المُوجِّه
          if (cf?.status == ConfrontationStatus.pendingLeader &&
              !widget.isHost) {
            return _waitBar('⚔️ بانتظار موافقة المُوجِّه…');
          }

          // ⑥ زرّ الطلب — للاعبٍ حيٍّ أثناء النقاش وحده
          if (cf == null &&
              !widget.isHost &&
              widget.gamePhase == 'DAY_DISCUSSION' &&
              widget.myPid != null) {
            return _picking ? _picker() : _requestButton();
          }

          return const SizedBox.shrink();
        },
      );

  Widget _active(ConfrontationState cf) {
    final remaining = cf.remaining();
    final mine = cf.involves(widget.myPid);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _danger.withValues(alpha: 0.4)),
        gradient: LinearGradient(
          colors: [
            const Color(0xFF450A0A).withValues(alpha: 0.4),
            Colors.black,
          ],
        ),
      ),
      child: Column(children: [
        Row(children: [
          Expanded(
            child: Text('#${cf.requesterId} ${_nameOf(cf.requesterId)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFFFCA5A5),
                    letterSpacing: 0)),
          ),
          const Text('⚔️ ×', style: TextStyle(fontSize: 13)),
          Expanded(
            child: Text('#${cf.targetId} ${_nameOf(cf.targetId)}',
                textAlign: TextAlign.end,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontFamily: 'Amiri',
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFFFCA5A5),
                    letterSpacing: 0)),
          ),
        ]),
        const SizedBox(height: 4),
        Text('${remaining}s',
            style: mono(22,
                color: remaining <= 10
                    ? const Color(0xFFF87171)
                    : Colors.white,
                weight: FontWeight.w900)),
        if (mine)
          Text('مايكك مفتوح — تكلّم الآن',
              style: ar(11, color: const Color(0xCCFCA5A5))),
      ]),
    );
  }

  Widget _goldPanel({
    required String title,
    required String primary,
    required String secondary,
    required VoidCallback onPrimary,
    required VoidCallback onSecondary,
  }) =>
      Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: _gold.withValues(alpha: 0.1),
          border: Border.all(color: _gold.withValues(alpha: 0.5)),
        ),
        child: Column(children: [
          Text(title,
              textAlign: TextAlign.center,
              style: ar(13, color: _gold, weight: FontWeight.bold)),
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            _action(primary, _emerald, _busy ? null : onPrimary),
            const SizedBox(width: 8),
            _action(secondary, _danger, _busy ? null : onSecondary),
          ]),
          if (_err != null) ...[
            const SizedBox(height: 4),
            Text(_err!, style: ar(10, color: const Color(0xCCF87171))),
          ],
        ]),
      );

  Widget _action(String label, Color color, VoidCallback? onTap) =>
      Opacity(
        opacity: onTap == null ? 0.4 : 1,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: color.withValues(alpha: 0.15),
              border: Border.all(color: color.withValues(alpha: 0.5)),
            ),
            child: Text(label,
                style: ar(13, color: color, weight: FontWeight.bold)),
          ),
        ),
      );

  Widget _waitBar(String text) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: Colors.black.withValues(alpha: 0.4),
          border: Border.all(color: _line),
        ),
        child: Text(text,
            textAlign: TextAlign.center, style: mono(11, color: _dim)),
      );

  Widget _requestButton() => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: GestureDetector(
          onTap: () => setState(() {
            _picking = true;
            _err = null;
          }),
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 44),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: _danger.withValues(alpha: 0.1),
              border: Border.all(color: _danger.withValues(alpha: 0.4)),
            ),
            child: Text('⚔️ اطلب مواجهة لاعب',
                style: ar(13,
                    color: const Color(0xFFFCA5A5),
                    weight: FontWeight.bold)),
          ),
        ),
      );

  Widget _picker() {
    final targets = widget.players
        .where((p) => p.isAlive && p.physicalId != widget.myPid)
        .toList();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Colors.black.withValues(alpha: 0.5),
        border: Border.all(color: _danger.withValues(alpha: 0.4)),
      ),
      child: Column(children: [
        Row(children: [
          Expanded(
            child: Text('اختر خصمك للمواجهة',
                style: ar(12,
                    color: const Color(0xFFFCA5A5),
                    weight: FontWeight.bold)),
          ),
          GestureDetector(
            onTap: () => setState(() => _picking = false),
            child: SizedBox(
              width: 36,
              height: 36,
              child: Center(child: Text('✕', style: ar(15, color: _dim))),
            ),
          ),
        ]),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 192),
          child: GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 3.2,
            children: [
              for (final p in targets)
                Opacity(
                  opacity: _busy ? 0.4 : 1,
                  child: GestureDetector(
                    onTap: _busy
                        ? null
                        : () => _send(() => widget.service
                            .requestConfrontation(p.physicalId)),
                    child: Container(
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        color: const Color(0xFF0A0A0A),
                        border: Border.all(color: _line),
                      ),
                      child: Text.rich(
                        TextSpan(children: [
                          TextSpan(
                              text: '#${p.physicalId} ',
                              style: mono(11, color: _gold)),
                          TextSpan(text: p.name),
                        ]),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(12, weight: FontWeight.bold),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (_err != null) ...[
          const SizedBox(height: 4),
          Text(_err!,
              textAlign: TextAlign.center,
              style: ar(10, color: const Color(0xCCF87171))),
        ],
      ]),
    );
  }
}
