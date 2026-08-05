import 'package:flutter/material.dart';

import '../../core/socket/socket_service.dart';
import '../../core/storage/session_store.dart';
import '../../core/ui/glass.dart';
import '../profile/profile_palette.dart' show ar;
import 'host_controller.dart';

// ══════════════════════════════════════════════════════
// 🌐 شاشة إنشاء غرفة عن بُعد — §4.1 في الملفّ 30
// ══════════════════════════════════════════════════════
// النصوص والحدود والقيم الافتراضية حرفيّة من المواصفة. كلّ حدٍّ هنا
// يقابله حدٌّ في الخادم (`clampCapacity`، `Math.max(5, Math.min(60,…))`)،
// فالتقييد هنا تجربةُ مستخدمٍ لا أمان — الخادم هو الحارس.

const _gold = Color(0xFFC5A059);
const _cardBg = Color(0xFF0A0A0A);
const _cardLine = Color(0xFF1A1A1A);
const _fieldBg = Color(0xFF050505);
const _fieldLine = Color(0xFF222222);

class HostCreateScreen extends StatefulWidget {
  const HostCreateScreen({super.key});

  @override
  State<HostCreateScreen> createState() => _HostCreateScreenState();
}

class _HostCreateScreenState extends State<HostCreateScreen> {
  final _c = HostController.instance;
  late final TextEditingController _name =
      TextEditingController(text: _c.config.gameName);

  @override
  void initState() {
    super.initState();
    _c.addListener(_onChange);
  }

  @override
  void dispose() {
    _c.removeListener(_onChange);
    _name.dispose();
    super.dispose();
  }

  void _onChange() => mounted ? setState(() {}) : null;

  void _set(HostRoomConfig next) {
    _c.config = next;
    _c.clearError();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final cfg = _c.config;
    final loggedIn = SessionStore.instance.player != null;

    return ValueListenableBuilder<bool>(
      valueListenable: SocketService.instance.connected,
      builder: (_, online, __) => ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
        children: [
          const Text('Remote Play · Host',
              style: TextStyle(
                  fontFamily: 'JetBrainsMono',
                  fontSize: 12,
                  letterSpacing: 2.4,
                  color: _gold)),
          const SizedBox(height: 8),
          Text('استضافة غرفة عن بُعد',
              style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 6),
          Text(
            'أنت المُوجِّه (لا لاعب) — تُدير اللعبة ويشترك أصدقاؤك من أجهزتهم.',
            style: ar(13, color: const Color(0xFF808080)),
          ),
          const SizedBox(height: 24),

          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: _cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _cardLine),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _label('اسم الغرفة'),
                const SizedBox(height: 6),
                TextField(
                  controller: _name,
                  onChanged: (v) => _set(cfg.copyWith(gameName: v)),
                  style: ar(14, color: Colors.white),
                  decoration: _fieldDeco(),
                ),
                const SizedBox(height: 16),

                _label('أقصى عدد لاعبين'),
                const SizedBox(height: 6),
                _Stepper(
                  value: cfg.maxPlayers,
                  min: 6,
                  max: 50,
                  onChanged: (v) => _set(cfg.copyWith(maxPlayers: v)),
                ),

                const SizedBox(height: 16),
                const Divider(color: _cardLine, height: 1),
                const SizedBox(height: 16),

                _eyebrow('🌙 وضع الليل'),
                const SizedBox(height: 4),
                Text(
                  'أوتوماتيكي (إلزاميّ عن بُعد — اللاعبون يُرسلون من أجهزتهم)',
                  style: ar(12, color: const Color(0xFFB3B3B3)),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: _label('مهلة كل خطوة:')),
                  Text('${cfg.autoNightTime}ث',
                      style: const TextStyle(
                          fontFamily: 'JetBrainsMono', fontSize: 13, color: _gold)),
                ]),
                Slider(
                  value: cfg.autoNightTime.toDouble(),
                  min: 5,
                  max: 60,
                  divisions: 11,
                  activeColor: _gold,
                  onChanged: (v) => _set(cfg.copyWith(autoNightTime: v.round())),
                ),

                const SizedBox(height: 8),
                _eyebrow('⏱️ مؤقّت اللعبة'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    for (final m in const [0, 30, 60, 90])
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: _Segment(
                            label: m == 0 ? 'مطفأ' : '$m د',
                            selected: cfg.gameTimerMinutes == m,
                            onTap: () => _set(cfg.copyWith(gameTimerMinutes: m)),
                          ),
                        ),
                      ),
                  ],
                ),

                const SizedBox(height: 16),
                _eyebrow('⚖️ نظام العقوبات'),
                const SizedBox(height: 8),
                Row(children: [
                  _label('أقصى عدد'),
                  const SizedBox(width: 10),
                  _Stepper(
                    value: cfg.maxPenalties,
                    min: 1,
                    max: 10,
                    compact: true,
                    onChanged: (v) => _set(cfg.copyWith(maxPenalties: v)),
                  ),
                  const Spacer(),
                  _Pill(
                    label: 'كامل الغرفة',
                    selected: cfg.penaltyScope == 'room',
                    onTap: () => _set(cfg.copyWith(penaltyScope: 'room')),
                  ),
                  const SizedBox(width: 6),
                  _Pill(
                    label: 'كل لعبة',
                    selected: cfg.penaltyScope == 'game',
                    onTap: () => _set(cfg.copyWith(penaltyScope: 'game')),
                  ),
                ]),

                const SizedBox(height: 16),
                _eyebrow('💣 قنبلة الأب الروحيّ'),
                const SizedBox(height: 8),
                _Pair(
                  onLabel: 'مفعّلة',
                  offLabel: 'معطّلة',
                  value: cfg.bombEnabled,
                  onColor: const Color(0xFFDC2626),
                  onChanged: (v) => _set(cfg.copyWith(bombEnabled: v)),
                ),

                const SizedBox(height: 16),
                _eyebrow('🗣️ غرفة تشاور المافيا السرّية'),
                const SizedBox(height: 8),
                _Pair(
                  onLabel: 'مفعّلة',
                  offLabel: 'معطّلة',
                  value: cfg.mafiaChatEnabled,
                  onColor: const Color(0xFF059669),
                  onChanged: (v) => _set(cfg.copyWith(mafiaChatEnabled: v)),
                ),

                const SizedBox(height: 16),
                _eyebrow('📨 دعوة اللاعبين لأصدقائهم'),
                const SizedBox(height: 8),
                _Pair(
                  onLabel: 'مسموح',
                  offLabel: 'للمضيف فقط',
                  value: cfg.allowPlayerInvites,
                  onColor: const Color(0xFF0284C7),
                  onChanged: (v) => _set(cfg.copyWith(allowPlayerInvites: v)),
                ),
                const SizedBox(height: 6),
                Text(
                  'عند التفعيل يظهر زرّ «إرسال دعوة» لكل لاعب في الغرفة، لا للمضيف وحده.',
                  style: ar(10, color: const Color(0xFF9A9A9A)),
                ),

                const SizedBox(height: 16),
                Row(children: [
                  const Text('🎙️ أقصى عدد تبريرات',
                      style: TextStyle(
                          fontFamily: 'JetBrainsMono', fontSize: 11, color: Color(0xFF9A9A9A))),
                  const Spacer(),
                  _Stepper(
                    value: cfg.maxJustifications,
                    min: 1,
                    max: 5,
                    compact: true,
                    onChanged: (v) => _set(cfg.copyWith(maxJustifications: v)),
                  ),
                ]),
              ],
            ),
          ),

          const SizedBox(height: 16),
          if (_c.error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0x4D7F1D1D),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFB91C1C)),
              ),
              child: Text(_c.error!, style: ar(13, color: const Color(0xFFFECACA))),
            ),
            const SizedBox(height: 12),
          ],

          _Cta(
            label: _c.busy
                ? 'جارٍ الإنشاء…'
                : (!online ? 'جارٍ الاتصال…' : '🌐 إنشاء الغرفة'),
            enabled: online && !_c.busy && loggedIn,
            onTap: _c.createRoom,
          ),

          if (!loggedIn) ...[
            const SizedBox(height: 10),
            Text('يجب تسجيل الدخول كلاعب أولاً.',
                style: ar(12, color: const Color(0xFFFACC15))),
          ],

          const SizedBox(height: 20),
          Text(
            'إنشاء الغرف مقصورٌ على الحسابات المصرّح لها. إن ظهر «غير مصرّح لك» '
            'فتواصل مع الإدارة لتفعيل الاستضافة لحسابك.',
            style: ar(12, color: const Color(0xFF9A9A9A)),
          ),
        ],
      ),
    );
  }

  Widget _label(String t) => Text(t, style: ar(13, color: const Color(0xFFB3B3B3)));

  Widget _eyebrow(String t) => Text(t,
      style: const TextStyle(
          fontFamily: 'JetBrainsMono', fontSize: 11, color: Color(0xFF9A9A9A)));

  InputDecoration _fieldDeco() => InputDecoration(
        filled: true,
        fillColor: _fieldBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: _fieldLine),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: _gold),
        ),
      );
}

/// stepper ‎−/+‎ — أهداف لمس 44×44 كما تنصّ §4.4.
class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.compact = false,
  });

  final int value, min, max;
  final ValueChanged<int> onChanged;
  final bool compact;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _btn('−', value > min ? () => onChanged(value - 1) : null),
          Container(
            width: compact ? 34 : 56,
            alignment: Alignment.center,
            child: Text('$value',
                style: const TextStyle(
                    fontFamily: 'JetBrainsMono', fontSize: 15, color: Colors.white)),
          ),
          _btn('+', value < max ? () => onChanged(value + 1) : null),
        ],
      );

  Widget _btn(String glyph, VoidCallback? onTap) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Text(glyph,
                style: TextStyle(
                    fontSize: 20,
                    color: onTap == null ? const Color(0xFF3A3A3A) : const Color(0xFF888888))),
          ),
        ),
      );
}

class _Segment extends StatelessWidget {
  const _Segment({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            color: selected ? const Color(0x33C5A059) : Colors.transparent,
            border: Border.all(color: selected ? _gold : _fieldLine),
          ),
          child: Text(label,
              style: ar(12,
                  color: selected ? _gold : const Color(0xFF888888),
                  weight: FontWeight.w700)),
        ),
      );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: selected ? const Color(0x33C5A059) : Colors.transparent,
            border: Border.all(color: selected ? _gold : _fieldLine),
          ),
          child: Text(label,
              style: ar(11,
                  color: selected ? _gold : const Color(0xFF888888),
                  weight: FontWeight.w700)),
        ),
      );
}

/// زرّان متقابلان — «مفعّلة/معطّلة» وأخواتهما.
class _Pair extends StatelessWidget {
  const _Pair({
    required this.onLabel,
    required this.offLabel,
    required this.value,
    required this.onColor,
    required this.onChanged,
  });

  final String onLabel, offLabel;
  final bool value;
  final Color onColor;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(
          child: _Segment(
            label: onLabel,
            selected: value,
            onTap: () => onChanged(true),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _Segment(
            label: offLabel,
            selected: !value,
            onTap: () => onChanged(false),
          ),
        ),
      ]);
}

class _Cta extends StatelessWidget {
  const _Cta({required this.label, required this.enabled, required this.onTap});
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: enabled ? 1 : 0.5,
        child: GestureDetector(
          onTap: enabled ? onTap : null,
          behavior: HitTestBehavior.opaque,
          child: GlassChip(
            radius: 14,
            padding: const EdgeInsets.symmetric(vertical: 15),
            tintColor: _gold,
            borderColor: const Color(0x8CC5A059),
            child: Center(
              child: Text(label,
                  style: ar(15, color: _gold, weight: FontWeight.w900)),
            ),
          ),
        ),
      );
}
