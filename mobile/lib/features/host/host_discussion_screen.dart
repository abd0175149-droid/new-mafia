import 'package:flutter/material.dart';

import '../../core/ui/glass.dart';
import '../profile/profile_palette.dart' show ar;
import 'host_controller.dart';

// ══════════════════════════════════════════════════════
// 🗣️ رصيف النقاش — §4.9 في الملفّ 30
// ══════════════════════════════════════════════════════
// ثلاث حالات: إعدادٌ قبل البدء، ولوحةٌ حيّة أثناء الدوران، وبطاقةُ انتهاء
// تنقل إلى التصويت.

const _gold = Color(0xFFC5A059);

class HostDiscussionScreen extends StatefulWidget {
  const HostDiscussionScreen({super.key});

  @override
  State<HostDiscussionScreen> createState() => _HostDiscussionScreenState();
}

class _HostDiscussionScreenState extends State<HostDiscussionScreen> {
  final _c = HostController.instance;

  int? _startId;
  int _seconds = 30;
  int? _votingDur; // null = بلا حدّ
  bool _tuner = false;

  @override
  void initState() {
    super.initState();
    _c.addListener(_onChange);
  }

  @override
  void dispose() {
    _c.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() => mounted ? setState(() {}) : null;

  @override
  Widget build(BuildContext context) {
    final d = _c.discussion;
    if (d == null) return _setup();
    if (d.isFinished) return _finished();
    return _live(d);
  }

  // ── إعداد الجولة ──
  Widget _setup() {
    final alive = _c.players;
    // الافتراضيّ أوّل حيّ — §4.9.
    final selected = _startId ?? (alive.isEmpty ? null : alive.first.physicalId);

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 130),
      children: [
        Text('بدء جولة النقاش',
            style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: _gold)),
        const SizedBox(height: 16),
        Text('من يبدأ؟', style: ar(13, color: const Color(0xFFB3B3B3))),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final p in alive)
            _Chip(
              label: '#${p.physicalId} ${p.name}',
              selected: selected == p.physicalId,
              onTap: () => setState(() => _startId = p.physicalId),
            ),
        ]),
        const SizedBox(height: 18),
        Text('الوقت لكل لاعب', style: ar(13, color: const Color(0xFFB3B3B3))),
        const SizedBox(height: 8),
        Wrap(spacing: 6, children: [
          for (final s in const [15, 30, 45, 60, 90])
            _Chip(
              label: '$sث',
              selected: _seconds == s,
              onTap: () => setState(() => _seconds = s),
            ),
        ]),
        const SizedBox(height: 22),
        _Cta(
          label: '▶ ابدأ الدوران',
          enabled: selected != null && !_c.busy,
          onTap: () => _c.startDiscussion(selected!, _seconds),
        ),
        if (selected == null) ...[
          const SizedBox(height: 8),
          Text('اختر لاعب البداية',
              style: ar(12, color: const Color(0xFFFCA5A5))),
        ],
      ],
    );
  }

  // ── الجولة الحيّة ──
  Widget _live(DiscussionState d) {
    final speaker = _c.players.where((p) => p.physicalId == d.currentSpeakerId);
    final name = speaker.isEmpty ? '' : speaker.first.name;

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 130),
      children: [
        Row(children: [
          Expanded(
            child: Text('الدور: #${d.currentSpeakerId ?? '—'} $name',
                style: ar(15, color: Colors.white, weight: FontWeight.w900)),
          ),
          Text('طابور ${d.speakingQueue.length} · تكلّم ${d.hasSpoken.length}',
              style: const TextStyle(
                  fontFamily: 'JetBrainsMono',
                  fontSize: 11,
                  color: Color(0xFF888888))),
        ]),
        const SizedBox(height: 6),
        Text('${d.timeRemaining}ث / ${d.timeLimitSeconds}ث',
            style: const TextStyle(
                fontFamily: 'JetBrainsMono', fontSize: 26, color: _gold)),

        const SizedBox(height: 18),
        Row(children: [
          // 🔴 الأيقونتان معكوستان عمداً لأجل RTL: ⏭ = السابق و⏮ = التالي.
          //    «تصحيحُها» يقلب اتّجاه إدارة الجولة على المضيف — §4.9.
          _Ctrl(
            glyph: '⏭',
            label: 'السابق',
            enabled: d.hasSpoken.isNotEmpty,
            onTap: _c.prevSpeaker,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _Cta(
              label: d.isSpeaking
                  ? '⏸ إيقاف'
                  : (d.status == 'WAITING' ? '▶ ابدأ' : '▶ استئناف'),
              enabled: true,
              onTap: () => _c.timerAction(d.isSpeaking
                  ? 'PAUSE'
                  : (d.status == 'WAITING' ? 'START' : 'RESUME')),
            ),
          ),
          const SizedBox(width: 8),
          _Ctrl(glyph: '⏮', label: 'التالي', enabled: true, onTap: _c.nextSpeaker),
          const SizedBox(width: 8),
          _Ctrl(
            glyph: '⏱',
            label: '',
            enabled: true,
            active: _tuner,
            onTap: () => setState(() => _tuner = !_tuner),
          ),
        ]),

        if (_tuner) ...[
          const SizedBox(height: 14),
          Row(children: [
            for (final delta in const [30, 10, -10, -30])
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: _Chip(
                    label: delta > 0 ? '+$delta' : '$delta',
                    selected: false,
                    tint: delta > 0 ? _gold : const Color(0xFFEF4444),
                    onTap: () => _c.adjustTimer(delta),
                  ),
                ),
              ),
          ]),
          const SizedBox(height: 8),
          _Chip(
            label: '🔄 إعادة الوقت من البداية',
            selected: false,
            onTap: () => _c.timerAction('RESET'),
          ),
        ],
      ],
    );
  }

  // ── انتهاء النقاش ──
  Widget _finished() => ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 130),
        children: [
          Text('انتهت جولة النقاش',
              style: const TextStyle(
                  fontFamily: 'Amiri',
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: _gold)),
          const SizedBox(height: 6),
          const Text('الصفقات تُؤخذ تلقائياً ممّا سجّله اللاعبون',
              style: TextStyle(
                  fontFamily: 'JetBrainsMono',
                  fontSize: 10,
                  color: Color(0xFF888888))),
          const SizedBox(height: 20),
          Text('مدّة التصويت', style: ar(13, color: const Color(0xFFB3B3B3))),
          const SizedBox(height: 8),
          Wrap(spacing: 6, children: [
            _Chip(
              label: 'بدون',
              selected: _votingDur == null,
              onTap: () => setState(() => _votingDur = null),
            ),
            for (final s in const [10, 20, 30])
              _Chip(
                label: '$sث',
                selected: _votingDur == s,
                onTap: () => setState(() => _votingDur = s),
              ),
          ]),
          const SizedBox(height: 22),
          _Cta(
            label: '🗳️ بدء التصويت',
            enabled: !_c.busy,
            onTap: () => _c.startVoting(_votingDur),
          ),
        ],
      );
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.tint,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final c = tint ?? _gold;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: selected ? c : Colors.transparent,
          border: Border.all(color: selected ? c : const Color(0xFF2A2A2A)),
        ),
        child: Text(label,
            style: ar(12,
                color: selected ? Colors.black : c, weight: FontWeight.w700)),
      ),
    );
  }
}

class _Ctrl extends StatelessWidget {
  const _Ctrl({
    required this.glyph,
    required this.label,
    required this.enabled,
    required this.onTap,
    this.active = false,
  });

  final String glyph, label;
  final bool enabled, active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: Opacity(
          opacity: enabled ? 1 : 0.35,
          child: Container(
            width: 52,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color: active ? _gold : const Color(0xFF2A2A2A)),
            ),
            child: Text(glyph,
                style: TextStyle(
                    fontSize: 18, color: active ? _gold : Colors.white)),
          ),
        ),
      );
}

class _Cta extends StatelessWidget {
  const _Cta({required this.label, required this.enabled, required this.onTap});
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: Opacity(
          opacity: enabled ? 1 : 0.5,
          child: GlassChip(
            radius: 12,
            padding: const EdgeInsets.symmetric(vertical: 14),
            tintColor: _gold,
            borderColor: const Color(0x8CC5A059),
            child: Center(
              child: Text(label,
                  style: ar(14, color: _gold, weight: FontWeight.w900)),
            ),
          ),
        ),
      );
}
