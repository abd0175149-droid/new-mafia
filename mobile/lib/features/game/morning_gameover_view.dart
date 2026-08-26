import 'package:flutter/material.dart';

import '../../models/card_template.dart' show kMafiaRoleIds;
import '../../models/profile.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// ☀️ ملخّص الصباح الشخصيّ — §4.7 في الملفّ ٢٤
// 🏁 نهاية الجيم — §4.12 في الملفّ ٢٧
// ══════════════════════════════════════════════════════
// السينمائيات الثمانية عشر تخصّ **شاشة العرض** لا هاتف اللاعب. ما يراه
// اللاعب هو ما استهدفه هو وحده.

const _gold = Color(0xFFC5A059);

class MorningBody extends StatelessWidget {
  const MorningBody({super.key, required this.controller});
  final GameSessionController controller;

  @override
  // 🔴 لا حدثَ ليليٍّ يصل جهازَ اللاعب. كان الخادم يبثّ `display:morning-event`
  //    للغرفة كلِّها فيصل كلَّ جهاز، والترشيحُ يجري في العميل — فيُقرأ من الحمولة
  //    ما لا يُعرَض، وفيها دورُ المغتال.
  // 🔴 وحتّى المعروضُ كان تسريباً: «تمّ حمايتك» تُخبر اللاعبَ أنّ المافيا استهدفته،
  //    و«تمّ قنصك» تُخبر مَن خرج أنّ في الطاولة قنّاصاً. مَن خرج يعرف أنّه خرج
  //    (من حالته في الطاولة)، ولا يعرف كيف.
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(children: [
        const _DropIn(child: Text('☀️', style: TextStyle(fontSize: 44))),
        const SizedBox(height: 8),
        const Text('الصباح يطل',
            style: TextStyle(
              fontFamily: 'Amiri',
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: Color(0xFFFCD34D),
              letterSpacing: 0,
            )),
        const SizedBox(height: 20),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 36),
          child: Text('تُكشف أحداثُ الليلة على شاشة القاعة — تابِعْ معها.',
              textAlign: TextAlign.center,
              style: ar(13, color: const Color(0xFF808080))),
        ),
      ]),
    );
  }


}

class _DropIn extends StatefulWidget {
  const _DropIn({required this.child});
  final Widget child;
  @override
  State<_DropIn> createState() => _DropInState();
}

class _DropInState extends State<_DropIn>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 500))
    ..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    final curve = CurvedAnimation(parent: _c, curve: Curves.easeOutBack);
    return SlideTransition(
      position:
          Tween(begin: const Offset(0, -0.4), end: Offset.zero).animate(curve),
      child: FadeTransition(opacity: _c, child: widget.child),
    );
  }
}

// ══════════════════════════════════════════════════════
// 🏁 نهاية الجيم
// ══════════════════════════════════════════════════════
class GameOverBody extends StatelessWidget {
  const GameOverBody({super.key, required this.controller});
  final GameSessionController controller;

  /// 🔴 النصوص حرفيّة — وتختلف عمداً عن لافتة الطاولة (علامة التعجّب
  ///    وشدّة «السفّاح»). لا تُوحَّد.
  static (String, String, String) _winner(String? w) => switch (w) {
        'MAFIA' => ('🩸', 'انتصار المافيا', 'سيطرة مطلقة'),
        'ASSASSIN' => ('🔪', 'انتصار السفاح!', 'تم إنجاز العقود بنجاح'),
        'JESTER' => ('🤡', 'فوز المهرج!', 'نجح المهرج في الانتحار'),
        _ => ('⚖️', 'تطهير المدينة', 'العدالة انتصرت'),
      };

  @override
  Widget build(BuildContext context) {
    final data = controller.gameOverData;
    if (data == null) return const SizedBox.shrink();

    final (icon, title, sub) = _winner(data['winner'] as String?);
    final players = (data['players'] as List? ??
            data['allPlayers'] as List? ??
            const [])
        .whereType<Map>()
        .toList();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(children: [
        _Pulse(child: Text(icon, style: const TextStyle(fontSize: 56))),
        const SizedBox(height: 12),
        Text(title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Amiri',
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: 0,
            )),
        const SizedBox(height: 4),
        Text(sub,
            style: ar(12,
                color: const Color(0xFF9A9A9A), weight: FontWeight.bold)),
        if (players.isNotEmpty) ...[
          const SizedBox(height: 20),
          // 🔴 الكشف الوحيد المسموح هنا: `players` من حمولة نهاية الجيم
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            itemCount: players.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              mainAxisExtent: 84,
            ),
            itemBuilder: (_, i) => _cell(
                Map<String, dynamic>.from(players[i]), controller.physicalId),
          ),
        ],
      ]),
    );
  }

  Widget _cell(Map<String, dynamic> p, int me) {
    final pid = (p['physicalId'] as num?)?.toInt() ?? 0;
    final role = p['role'] as String?;
    final dead = p['isAlive'] == false;
    final mine = pid == me;
    final isMafia = role != null && kMafiaRoleIds.contains(role);

    final (bg, border) = mine
        ? (_gold.withValues(alpha: 0.15), _gold.withValues(alpha: 0.4))
        : dead
            ? (
                const Color(0xFFEF4444).withValues(alpha: 0.1),
                const Color(0xFFEF4444).withValues(alpha: 0.2)
              )
            : (const Color(0x0DFFFFFF), const Color(0x1AFFFFFF));

    return Opacity(
      opacity: dead && !mine ? 0.6 : 1,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: bg,
          border: Border.all(color: border),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('#$pid',
              style: ar(12, weight: FontWeight.bold)),
          Text('${p['name'] ?? ''}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ar(11, color: const Color(0xFFB3B3B3))),
          Text(role == null ? '?' : roleNameAr(role),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ar(10,
                  color: isMafia
                      ? const Color(0xFFF87171)
                      : const Color(0xFF4ADE80))),
          if (dead)
            const Text('💀',
                style: TextStyle(fontSize: 10, color: Color(0xFFF87171))),
        ]),
      ),
    );
  }
}

class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});
  final Widget child;
  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
      vsync: this, duration: const Duration(seconds: 2))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      return widget.child;
    }
    return ScaleTransition(
      scale: Tween(begin: 1.0, end: 1.2)
          .animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: widget.child,
    );
  }
}
