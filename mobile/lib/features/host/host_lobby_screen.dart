import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/config.dart';
import '../../core/ui/glass.dart';
import '../profile/profile_palette.dart' show ar;
import 'host_controller.dart';

// ══════════════════════════════════════════════════════
// 🌐 لوبي المضيف — §4.3 و§4.4 في الملفّ 30
// ══════════════════════════════════════════════════════
// رمز الغرفة، السعة، roster حيّ بطرد وعقوبة، مقاعد محجوزة، وبدء التوزيع.

const _gold = Color(0xFFC5A059);

class HostLobbyScreen extends StatefulWidget {
  const HostLobbyScreen({super.key});

  @override
  State<HostLobbyScreen> createState() => _HostLobbyScreenState();
}

class _HostLobbyScreenState extends State<HostLobbyScreen> {
  final _c = HostController.instance;
  int? _expanded;

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
    final players = _c.players;
    final held = _c.heldSeats;

    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 120),
      children: [
        _RoomCodeCard(code: _c.roomCode),
        const SizedBox(height: 12),

        // صف السعة
        Row(children: [
          Expanded(
            child: RichText(
              text: TextSpan(children: [
                TextSpan(text: 'اللاعبون ', style: ar(14, color: const Color(0xFFB3B3B3))),
                TextSpan(
                    text: '${players.length}',
                    style: const TextStyle(
                        fontFamily: 'JetBrainsMono',
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: _gold)),
                TextSpan(text: ' / ${_c.maxPlayers}', style: ar(14, color: const Color(0xFF888888))),
              ]),
            ),
          ),
          _CapStepper(
            value: _c.maxPlayers,
            onChanged: _c.busy ? null : _c.setMaxPlayers,
          ),
        ]),
        const SizedBox(height: 12),

        if (players.isEmpty)
          _EmptyRoster()
        else
          for (final p in players)
            _PlayerRow(
              player: p,
              maxPenalties: _c.config.maxPenalties,
              expanded: _expanded == p.physicalId,
              onToggle: () => setState(
                  () => _expanded = _expanded == p.physicalId ? null : p.physicalId),
              onPenalty: () {
                _c.recordPenalty(p.physicalId);
                setState(() => _expanded = null);
              },
              onKick: () => _confirmKick(p),
            ),

        if (held.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('مقاعد محجوزة', style: ar(12, color: const Color(0xFF888888))),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final h in held)
                GestureDetector(
                  onTap: () => _c.releaseHeldSeat(h.physicalId),
                  child: GlassChip(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    child: Text('#${h.physicalId} ${h.name} ✕',
                        style: ar(11, color: const Color(0xFFB3B3B3))),
                  ),
                ),
            ],
          ),
        ],

        const SizedBox(height: 20),
        _StartButton(
          enabled: _c.canStart && !_c.busy,
          count: players.length,
          onTap: _c.startGeneration,
        ),

        const SizedBox(height: 16),
        GestureDetector(
          onTap: _confirmClose,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 13),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: const Color(0x338A0303),
              border: Border.all(color: const Color(0x80991B1B)),
            ),
            child: Text('🗑️ إلغاء الغرفة وإغلاقها',
                style: ar(13, color: const Color(0xFFFCA5A5), weight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }

  Future<void> _confirmKick(HostRosterPlayer p) async {
    final ok = await showDialog<bool>(
      context: context,
      barrierColor: const Color(0xCC000000),
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0A0A0A),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0x80991B1B)),
        ),
        title: Text('طرد ${p.name}؟', style: ar(16, color: Colors.white, weight: FontWeight.w900)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('إلغاء', style: ar(13, color: const Color(0xFF888888))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('تأكيد الطرد',
                style: ar(13, color: const Color(0xFFFCA5A5), weight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (ok == true) {
      await _c.kickPlayer(p.physicalId);
      if (mounted) setState(() => _expanded = null);
    }
  }

  Future<void> _confirmClose() async {
    final ok = await showDialog<bool>(
      context: context,
      barrierColor: const Color(0xCC000000),
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0A0A0A),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0x80991B1B)),
        ),
        title: Text('إلغاء الغرفة وإخراج كل من انضمّ؟',
            style: ar(15, color: Colors.white, weight: FontWeight.w900)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('تراجع', style: ar(13, color: const Color(0xFF888888))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('إلغاء الغرفة',
                style: ar(13, color: const Color(0xFFFCA5A5), weight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (ok == true) await _c.closeRoom();
  }
}

/// §4.3 — البطاقة كلّها زر، والكود LTR قسراً.
class _RoomCodeCard extends StatefulWidget {
  const _RoomCodeCard({required this.code});
  final String code;

  @override
  State<_RoomCodeCard> createState() => _RoomCodeCardState();
}

class _RoomCodeCardState extends State<_RoomCodeCard> {
  bool _copied = false;

  @override
  Widget build(BuildContext context) {
    if (widget.code.isEmpty) return const SizedBox.shrink();
    return GestureDetector(
      onTap: () async {
        await Clipboard.setData(ClipboardData(text: widget.code));
        await HapticFeedback.lightImpact();
        if (!mounted) return;
        setState(() => _copied = true);
        Future.delayed(const Duration(milliseconds: 2000), () {
          if (mounted) setState(() => _copied = false);
        });
      },
      behavior: HitTestBehavior.opaque,
      child: GlassChip(
        radius: 14,
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        tintColor: _gold,
        borderColor: const Color(0x66C5A059),
        child: Column(children: [
          Text(_copied ? '✓ تم النسخ' : 'رمز الغرفة — اضغط للنسخ',
              style: ar(11, color: const Color(0xFF9A9A9A))),
          const SizedBox(height: 8),
          // 🔴 LTR قسريّ: الرمز رقميّ ولا يُقلَب مع الفقرة العربية.
          Directionality(
            textDirection: TextDirection.ltr,
            child: Text(widget.code,
                style: const TextStyle(
                    fontFamily: 'JetBrainsMono',
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 9,
                    color: _gold)),
          ),
        ]),
      ),
    );
  }
}

class _EmptyRoster extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 30, horizontal: 16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF2A2A2A)),
        ),
        child: Column(children: [
          const Text('🎴', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 10),
          Text('بانتظار انضمام اللاعبين…',
              style: TextStyle(
                  fontFamily: 'Amiri', fontSize: 16, color: const Color(0xFFB3B3B3))),
          const SizedBox(height: 6),
          Text('شارك رمز الغرفة أو استخدم زر الدعوة…',
              textAlign: TextAlign.center,
              style: ar(11, color: const Color(0xFF6B7280))),
        ]),
      );
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({
    required this.player,
    required this.maxPenalties,
    required this.expanded,
    required this.onToggle,
    required this.onPenalty,
    required this.onKick,
  });

  final HostRosterPlayer player;
  final int maxPenalties;
  final bool expanded;
  final VoidCallback onToggle, onPenalty, onKick;

  @override
  Widget build(BuildContext context) {
    final off = !player.isConnected;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(children: [
        GestureDetector(
          onTap: onToggle,
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
            child: Row(children: [
              _Avatar(player: player),
              const SizedBox(width: 10),
              Text('#${player.physicalId}',
                  style: const TextStyle(
                      fontFamily: 'JetBrainsMono', fontSize: 12, color: _gold)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(player.name,
                    overflow: TextOverflow.ellipsis,
                    style: ar(14,
                        color: off ? const Color(0x66FFFFFF) : Colors.white)),
              ),
              if (player.penalties > 0) ...[
                for (var i = 0; i < maxPenalties; i++)
                  Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 1),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < player.penalties
                          ? const Color(0xFFEF4444)
                          : const Color(0xFF3A3A3A),
                    ),
                  ),
                const SizedBox(width: 8),
              ],
              Text(expanded ? '▴' : '▾',
                  style: const TextStyle(color: Color(0xFF888888))),
            ]),
          ),
        ),
        if (expanded)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(children: [
              Expanded(
                child: GestureDetector(
                  onTap: onPenalty,
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0x66F59E0B)),
                    ),
                    child: Text('⚠️ عقوبة',
                        style: ar(12, color: const Color(0xFFFBBF24), weight: FontWeight.w700)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: GestureDetector(
                  onTap: onKick,
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0x80991B1B)),
                    ),
                    child: Text('✕ طرد',
                        style: ar(12, color: const Color(0xFFFCA5A5), weight: FontWeight.w700)),
                  ),
                ),
              ),
            ]),
          ),
        const Divider(height: 1, color: Color(0xFF1A1A1A)),
      ]),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.player});
  final HostRosterPlayer player;

  @override
  Widget build(BuildContext context) {
    final url = player.avatarUrl;
    final fallback = player.gender == 'female' ? '👩' : '👨';
    return Stack(clipBehavior: Clip.none, children: [
      ClipOval(
        child: SizedBox(
          width: 36,
          height: 36,
          child: url == null || url.isEmpty
              ? Center(child: Text(fallback, style: const TextStyle(fontSize: 18)))
              : CachedNetworkImage(
                  imageUrl: AppConfig.prod.resolveUpload(url),
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) =>
                      Center(child: Text(fallback, style: const TextStyle(fontSize: 18))),
                ),
        ),
      ),
      // نقطة الاتصال — زمردية عند الاتصال، رمادية عند الانقطاع.
      PositionedDirectional(
        bottom: -1,
        end: -1,
        child: Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: player.isConnected ? const Color(0xFF10B981) : const Color(0xFF52525B),
            border: Border.all(color: const Color(0xFF050505), width: 2),
          ),
        ),
      ),
    ]);
  }
}

class _CapStepper extends StatelessWidget {
  const _CapStepper({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        _b('−', onChanged == null || value <= 6 ? null : () => onChanged!(value - 1)),
        _b('+', onChanged == null || value >= 50 ? null : () => onChanged!(value + 1)),
      ]);

  Widget _b(String g, VoidCallback? onTap) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        // 44×44 — هدف اللمس المنصوص عليه في §4.4
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Text(g,
                style: TextStyle(
                    fontSize: 20,
                    color: onTap == null ? const Color(0xFF3A3A3A) : const Color(0xFF888888))),
          ),
        ),
      );
}

class _StartButton extends StatelessWidget {
  const _StartButton({required this.enabled, required this.count, required this.onTap});
  final bool enabled;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: Opacity(
          opacity: enabled ? 1 : 0.55,
          child: GlassChip(
            radius: 14,
            padding: const EdgeInsets.symmetric(vertical: 15),
            tintColor: enabled ? _gold : null,
            borderColor: enabled ? const Color(0x8CC5A059) : const Color(0x1FFFFFFF),
            child: Center(
              child: Text(
                enabled ? '🎴 بدء توزيع الأدوار' : '🎴 بدء التوزيع — $count/6 لاعبين',
                style: ar(15,
                    color: enabled ? _gold : const Color(0xFF888888),
                    weight: FontWeight.w900),
              ),
            ),
          ),
        ),
      );
}
