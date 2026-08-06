import 'package:flutter/material.dart';

import '../../core/api/game_config_service.dart';
import '../../core/ui/glass.dart';
import '../profile/profile_palette.dart' show ar;
import 'host_controller.dart';
import 'role_generation.dart';

// ══════════════════════════════════════════════════════
// 🎴 تدقيق وإعداد المهام السرية — §4.7 في الملفّ 30
// ══════════════════════════════════════════════════════
// ثلاثة أقسام: المافيا، المواطنون، المحايدون. كلّ خانة قابلة للتبديل،
// والأدوار ذات الإعدادات الرقمية تُظهر مِعدادها حين تحضر وحدها.

const _gold = Color(0xFFC5A059);
const _blood = Color(0xFF8A0303);

class HostRolesScreen extends StatefulWidget {
  const HostRolesScreen({super.key});

  @override
  State<HostRolesScreen> createState() => _HostRolesScreenState();
}

class _HostRolesScreenState extends State<HostRolesScreen> {
  final _c = HostController.instance;

  @override
  void initState() {
    super.initState();
    _c.addListener(_onChange);
    // التركيبة الأولية تُبنى محلّياً إن لم تصل من الخادم بعد.
    WidgetsBinding.instance.addPostFrameCallback((_) => _c.seedRoles());
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
    final roles = _c.roles;
    if (roles.isEmpty) {
      return Center(
        child: Text('INITIALIZING ROSTER...',
            style: TextStyle(
                fontFamily: 'JetBrainsMono',
                fontSize: 13,
                letterSpacing: 3,
                color: const Color(0xFF555555))),
      );
    }

    final mafia = <int>[], citizens = <int>[], neutral = <int>[];
    for (var i = 0; i < roles.length; i++) {
      if (isMafiaRole(roles[i])) {
        mafia.add(i);
      } else if (isNeutralRole(roles[i])) {
        neutral.add(i);
      } else {
        citizens.add(i);
      }
    }

    final playerCount = _c.players.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 130),
      children: [
        Text('تدقيق وإعداد المهام السرية',
            style: const TextStyle(
                fontFamily: 'Amiri',
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: Colors.white)),
        const SizedBox(height: 4),
        const Text('ROLE COMPOSITION MATRIX CONFIGURATION',
            style: TextStyle(
                fontFamily: 'JetBrainsMono',
                fontSize: 10,
                letterSpacing: 3,
                color: _gold)),
        const SizedBox(height: 18),

        _Section(
          title: 'SYNDICATE (المافيا)',
          color: _blood,
          count: mafia.length,
          children: [for (final i in mafia) _slot(i)],
        ),
        if (roles.contains('WITCH'))
          _Tuner(
            title: '🧙‍♀️ الساحرة',
            note: 'تعطّل قدرة لاعب من المواطنين أو المستقلين لعدة راوندات. '
                'لاعب مختلف كل مرة. تكشف الحرباية إذا معطّلة.',
            label: 'راوندات التعطيل:',
            value: _c.tuning.witchDisableRounds,
            min: 1,
            max: 6,
            onChanged: (v) => _c.setTuning(_c.tuning.copyWith(witchDisableRounds: v)),
          ),

        const SizedBox(height: 14),
        _Section(
          title: 'CITIZENS (المواطنون)',
          color: _gold,
          count: citizens.length,
          children: [for (final i in citizens) _slot(i)],
        ),
        if (roles.contains('MAYOR'))
          _Tuner(
            title: '🎩 العمدة',
            note: 'مرّة واحدة بعد فرز التصويت يكشف نفسه ويُلغي الإعدام — '
                'تصويت جديد على الجميع أو تأجيل بلا موت. بعد الكشف يُحسب صوته بالوزن المحدَّد هنا.',
            label: 'وزن صوته بعد الكشف:',
            value: _c.tuning.mayorVoteWeight,
            min: 1,
            max: 4,
            prefix: '×',
            onChanged: (v) => _c.setTuning(_c.tuning.copyWith(mayorVoteWeight: v)),
          ),

        const SizedBox(height: 14),
        _Section(
          title: '🤡 NEUTRAL (المحايدون)',
          color: const Color(0xFFF59E0B),
          count: neutral.length,
          children: [
            for (final i in neutral) _slot(i),
            if (neutral.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Text(
                  playerCount < 8
                      ? 'يتطلب 8 لاعبين على الأقل لتفعيل المحايدين'
                      : 'لا يوجد أدوار محايدة — اضغط "إضافة المهرج" لتفعيله',
                  textAlign: TextAlign.center,
                  style: ar(11, color: const Color(0xFF777777)),
                ),
              ),
          ],
        ),

        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _Toggle(
            label: roles.contains('JESTER') ? '🤡 إزالة المهرج' : '➕ إضافة المهرج',
            onTap: () => _c.applyRoles(toggleJester(roles)),
          ),
          if (playerCount >= 10)
            _Toggle(
              label: roles.contains('ASSASSIN') ? '🔪 إزالة السفّاح' : '➕ إضافة السفّاح',
              onTap: () => _c.applyRoles(toggleAssassin(roles)),
            ),
          if (playerCount >= 10)
            _Toggle(
              label: roles.contains('OLDER_BROTHER')
                  ? '👥 إزالة التوأمين'
                  : '➕ إضافة التوأمين',
              onTap: () => _c.applyRoles(toggleTwins(roles)),
            ),
        ]),

        if (roles.contains('JESTER'))
          _Tuner(
            title: '🤡 المهرج',
            note: 'يفوز إذا أقصته المدينة (تصويت / اتفاقية / قنص). يجب أن يبقى '
                'على قيد الحياة للمدة المحددة أدناه ليفوز عند إقصائه، وإلا يخسر مثل أي لاعب.',
            label: 'جولات النجاة المطلوبة:',
            value: _c.tuning.jesterSurviveRounds,
            min: 1,
            max: 6,
            onChanged: (v) => _c.setTuning(_c.tuning.copyWith(jesterSurviveRounds: v)),
          ),
        if (roles.contains('ASSASSIN'))
          _Tuner(
            title: '🔪 السفّاح',
            note: 'قاتل محترف بنظام عقود اغتيال ذكية. يقتل كل ليلة (ما عدا الأولى). '
                'إذا قتل نفس هدف المافيا لا يُحسب. يظهر كمواطن عند التحقيق.',
            label: 'عدد العقود المطلوبة:',
            value: _c.tuning.assassinContractCount,
            min: 2,
            max: 6,
            onChanged: (v) =>
                _c.setTuning(_c.tuning.copyWith(assassinContractCount: v)),
          ),

        if (_c.error != null) ...[
          const SizedBox(height: 14),
          Text(_c.error!, style: ar(12, color: const Color(0xFFFCA5A5))),
        ],

        const SizedBox(height: 20),
        GestureDetector(
          onTap: _c.busy ? null : _c.confirmRoles,
          behavior: HitTestBehavior.opaque,
          child: Opacity(
            opacity: _c.busy ? 0.5 : 1,
            child: GlassChip(
              radius: 14,
              padding: const EdgeInsets.symmetric(vertical: 15),
              tintColor: _gold,
              borderColor: const Color(0x8CC5A059),
              child: const Center(
                child: Text('CONFIRM OP_DISTRIBUTION',
                    style: TextStyle(
                        fontFamily: 'JetBrainsMono',
                        fontSize: 13,
                        letterSpacing: 3,
                        fontWeight: FontWeight.w900,
                        color: _gold)),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _slot(int index) {
    final role = _c.roles[index];
    return GestureDetector(
      onTap: () => _pickRole(index),
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: isMafiaRole(role)
                  ? const Color(0x338A0303)
                  : const Color(0xFF2A2A2A)),
        ),
        child: Row(children: [
          Expanded(
            child: Text(_nameOf(role),
                style: ar(13,
                    color: isMafiaRole(role) ? _gold : Colors.white,
                    weight: FontWeight.w700)),
          ),
          const Text('▾', style: TextStyle(color: Color(0xFF888888))),
        ]),
      ),
    );
  }

  /// ورقة اختيار بدل القائمة المنسدلة — أنسب للمس (ملاحظة §4.7).
  Future<void> _pickRole(int index) async {
    final all = GameConfigService.instance.allRoles;
    final ids = all.isEmpty
        ? <String>{...kMafiaOrder, ...kCitizenOrder, ...kNeutralRoles}.toList()
        : all.map((r) => r.id).toList();

    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF0A0A0A),
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final id in ids)
              ListTile(
                title: Text(_nameOf(id), style: ar(14, color: Colors.white)),
                trailing: isNeutralRole(id)
                    ? Text('محايد', style: ar(10, color: const Color(0xFFF59E0B)))
                    : null,
                onTap: () => Navigator.pop(context, id),
              ),
          ],
        ),
      ),
    );
    if (picked != null) _c.setRoleAt(index, picked);
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.color,
    required this.count,
    required this.children,
  });

  final String title;
  final Color color;
  final int count;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(
              child: Text(title,
                  style: TextStyle(
                      fontFamily: 'JetBrainsMono',
                      fontSize: 11,
                      letterSpacing: 1.5,
                      color: color)),
            ),
            Text('$count OP(s)',
                style: TextStyle(
                    fontFamily: 'JetBrainsMono', fontSize: 10, color: color)),
          ]),
          const SizedBox(height: 10),
          ...children,
        ]),
      );
}

class _Tuner extends StatelessWidget {
  const _Tuner({
    required this.title,
    required this.note,
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.prefix = '',
  });

  final String title, note, label, prefix;
  final int value, min, max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: const Color(0x0DFFFFFF),
          border: Border.all(color: const Color(0x1AFFFFFF)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: ar(13, color: Colors.white, weight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(note, style: ar(11, color: const Color(0xFF9A9A9A))),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: Text(label, style: ar(12, color: const Color(0xFFB3B3B3)))),
            _b('−', value > min ? () => onChanged(value - 1) : null),
            SizedBox(
              width: 44,
              child: Center(
                child: Text('$prefix$value',
                    style: const TextStyle(
                        fontFamily: 'JetBrainsMono', fontSize: 15, color: _gold)),
              ),
            ),
            _b('+', value < max ? () => onChanged(value + 1) : null),
          ]),
        ]),
      );

  Widget _b(String g, VoidCallback? onTap) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Text(g,
                style: TextStyle(
                    fontSize: 20,
                    color: onTap == null
                        ? const Color(0xFF3A3A3A)
                        : const Color(0xFF888888))),
          ),
        ),
      );
}

class _Toggle extends StatelessWidget {
  const _Toggle({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: GlassChip(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text(label, style: ar(12, color: Colors.white)),
        ),
      );
}
