import 'package:flutter/material.dart';

import '../../core/api/game_config_service.dart';
import '../../core/ui/glass.dart';
import '../profile/profile_palette.dart' show ar;
import 'host_controller.dart';
import 'role_generation.dart';

// ══════════════════════════════════════════════════════
// 🔗 إسناد الأدوار الخاصّة — §4.8 في الملفّ 30
// ══════════════════════════════════════════════════════
// المواطنون يُوزَّعون تلقائياً على الباقين؛ المضيف يسند الخاصّة وحدها.
// تدفّق الإسناد تفاؤليّ: تعيينٌ محلّيّ ثم unbind (إن كان استبدالاً) ثم bind،
// والخطأ يُرجع الخانة إلى قيمتها السابقة.

const _gold = Color(0xFFC5A059);

class HostBindingScreen extends StatefulWidget {
  const HostBindingScreen({super.key});

  @override
  State<HostBindingScreen> createState() => _HostBindingScreenState();
}

class _HostBindingScreenState extends State<HostBindingScreen> {
  final _c = HostController.instance;

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

  String _nameOf(String role) =>
      GameConfigService.instance.role(role)?.nameAr ?? role;

  @override
  Widget build(BuildContext context) {
    final specials = _c.specialRoles;
    final assigned = _c.assignments;
    final citizens = _c.roles.where((r) => r == 'CITIZEN').length;
    final remaining = specials.length - _c.assignedSpecialCount;

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 130),
      children: [
        // ── شريط الملخّص ──
        Row(children: [
          _stat('إجمالي الأدوار', '${_c.roles.length}', Colors.white),
          _stat('الخاصّة المسندة', '${_c.assignedSpecialCount}/${specials.length}',
              const Color(0xFF34D399)),
          _stat('المواطنون', '$citizens', _gold),
        ]),
        const SizedBox(height: 18),

        Text('الأدوار الخاصّة — وزّعها كلها',
            style: ar(14, color: Colors.white, weight: FontWeight.w900)),
        const SizedBox(height: 10),

        for (final role in specials)
          _RoleRow(
            role: role,
            label: _nameOf(role),
            assignedTo: assigned[role],
            players: _c.players,
            takenBy: assigned,
            locked: assigned[role] != null &&
                _c.lockedPhysicalIds.contains(assigned[role]),
            onPick: (pid) => _assign(role, pid),
            onToggleLock: () {
              final pid = assigned[role];
              if (pid != null) _c.toggleLock(pid);
            },
          ),

        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0x33C5A059)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('👤 المواطنون ($citizens) — يُوزَّعون تلقائياً على الباقين',
                style: ar(12, color: _gold)),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final p in _c.players.where(
                  (p) => p.role == null || p.role == 'CITIZEN'))
                GlassChip(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  child: Text(p.name.isEmpty ? '—' : p.name,
                      style: ar(11, color: const Color(0xFFB3B3B3))),
                ),
            ]),
          ]),
        ),

        const SizedBox(height: 14),
        // ── «المافيا تعرف بعضها» ──
        Row(children: [
          Expanded(
            child: Text('🎭 المافيا تعرف بعضها',
                style: ar(13, color: Colors.white, weight: FontWeight.w700)),
          ),
          _Pill(value: _c.allowMafiaReveal, onChanged: _c.setMafiaReveal),
        ]),

        if (remaining > 0) ...[
          const SizedBox(height: 12),
          Text('تبقّى $remaining دور خاصّ بلا توزيع',
              style: const TextStyle(
                  fontFamily: 'JetBrainsMono',
                  fontSize: 11,
                  color: Color(0xFFFBBF24))),
        ],

        if (_c.error != null) ...[
          const SizedBox(height: 10),
          Text(_c.error!, style: ar(12, color: const Color(0xFFFCA5A5))),
        ],

        const SizedBox(height: 18),
        _Btn(
          label: '🎲 توزيع عشوائيّ للباقي',
          enabled: !_c.busy,
          onTap: () => _c.randomAssign(_c.lockedPhysicalIds.toList()),
        ),
        const SizedBox(height: 10),
        _Btn(
          label: _c.rolesConfirmed
              ? '✅ تمّ التأكيد والإرسال للاعبين'
              : '📨 تأكيد الأدوار وإرسالها',
          enabled: !_c.busy && _c.allSpecialsAssigned && !_c.rolesConfirmed,
          tint: _c.rolesConfirmed ? const Color(0xFF34D399) : null,
          onTap: _c.confirmBinding,
        ),
        const SizedBox(height: 10),
        _Btn(
          label: '🔒 قفل الهويّات وبدء اللعبة',
          enabled: !_c.busy && _c.rolesConfirmed,
          tint: _gold,
          onTap: _c.lockAndStart,
        ),
      ],
    );
  }

  Widget _stat(String label, String value, Color color) => Expanded(
        child: Column(children: [
          Text(value,
              style: TextStyle(
                  fontFamily: 'JetBrainsMono',
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  color: color)),
          const SizedBox(height: 2),
          Text(label,
              textAlign: TextAlign.center,
              style: ar(10, color: const Color(0xFF888888))),
        ]),
      );

  Future<void> _assign(String role, int physicalId) async {
    final previous = _c.assignments[role];
    if (previous == physicalId) return;
    // استبدالٌ: يُفكّ القديم أوّلاً كما ينصّ §4.8.
    if (previous != null) await _c.unbindRole(previous);
    await _c.bindRole(physicalId, role);
  }
}

class _RoleRow extends StatelessWidget {
  const _RoleRow({
    required this.role,
    required this.label,
    required this.assignedTo,
    required this.players,
    required this.takenBy,
    required this.locked,
    required this.onPick,
    required this.onToggleLock,
  });

  final String role, label;
  final int? assignedTo;
  final List<HostRosterPlayer> players;
  final Map<String, int> takenBy;
  final bool locked;
  final ValueChanged<int> onPick;
  final VoidCallback onToggleLock;

  @override
  Widget build(BuildContext context) {
    final mafia = isMafiaRole(role);
    final on = assignedTo != null;
    final name = on
        ? players
            .firstWhere((p) => p.physicalId == assignedTo,
                orElse: () => const HostRosterPlayer(physicalId: 0, name: '—'))
            .name
        : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: !on
            ? null
            : (mafia ? const Color(0x0D8A0303) : const Color(0xFF0D1A0D)),
        border: Border.all(
          color: !on
              ? const Color(0xFF2A2A2A)
              : (mafia ? const Color(0x4D8A0303) : const Color(0x4D265E33)),
        ),
      ),
      child: Row(children: [
        SizedBox(
          width: 108,
          child: Text(label,
              style: ar(12,
                  color: mafia ? const Color(0xFFE08A8A) : const Color(0xFF8FC3EA),
                  weight: FontWeight.w700)),
        ),
        Expanded(
          child: GestureDetector(
            onTap: () => _pick(context),
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF222222)),
              ),
              child: Text(name ?? '— اختر لاعب —',
                  overflow: TextOverflow.ellipsis,
                  style: ar(12,
                      color: on ? Colors.white : const Color(0xFF777777))),
            ),
          ),
        ),
        if (on)
          GestureDetector(
            onTap: onToggleLock,
            behavior: HitTestBehavior.opaque,
            child: SizedBox(
              width: 40,
              height: 40,
              child: Center(
                child: Text(locked ? '🔒' : '🔓',
                    style: TextStyle(
                        fontSize: 16,
                        color: locked ? _gold : const Color(0xFF666666))),
              ),
            ),
          ),
      ]),
    );
  }

  Future<void> _pick(BuildContext context) async {
    // المتاحون: غير المسندين، ومَن هو مسندٌ لهذه الخانة نفسها (§4.8).
    final mine = takenBy[role];
    final taken = takenBy.values.toSet()..remove(mine);
    final avail = players.where((p) => !taken.contains(p.physicalId)).toList();

    final picked = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: const Color(0xFF0A0A0A),
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final p in avail)
              ListTile(
                leading: Text('#${p.physicalId}',
                    style: const TextStyle(
                        fontFamily: 'JetBrainsMono', color: _gold, fontSize: 12)),
                title: Text(p.name, style: ar(14, color: Colors.white)),
                onTap: () => Navigator.pop(context, p.physicalId),
              ),
          ],
        ),
      ),
    );
    if (picked != null) onPick(picked);
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => onChanged(!value),
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: 48,
          height: 28,
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: value ? const Color(0x59C5A059) : const Color(0x14FFFFFF),
            border: Border.all(
                color: value ? _gold : const Color(0x1FFFFFFF)),
          ),
          // 🔴 المقبض ينزلق start↔end لا left↔right: في RTL ينعكس المعنى.
          child: Align(
            alignment:
                value ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
            child: Container(
              width: 20,
              height: 20,
              decoration: const BoxDecoration(
                  shape: BoxShape.circle, color: Colors.white),
            ),
          ),
        ),
      );
}

class _Btn extends StatelessWidget {
  const _Btn({
    required this.label,
    required this.enabled,
    required this.onTap,
    this.tint,
  });

  final String label;
  final bool enabled;
  final VoidCallback onTap;
  final Color? tint;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: GlassChip(
            radius: 12,
            padding: const EdgeInsets.symmetric(vertical: 13),
            tintColor: tint,
            borderColor: tint == null
                ? const Color(0x1FFFFFFF)
                : tint!.withValues(alpha: 0.55),
            child: Center(
              child: Text(label,
                  style: ar(13,
                      color: tint ?? Colors.white, weight: FontWeight.w700)),
            ),
          ),
        ),
      );
}
