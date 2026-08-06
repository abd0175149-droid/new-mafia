import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/activity.dart';
import '../../models/profile.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🎮 قطع شاشة الألعاب — §4.1 في الملفّ 14
// ══════════════════════════════════════════════════════

/// شريط أربعة عشر يوماً + رقاقة «الكل».
class CalendarStrip extends StatelessWidget {
  const CalendarStrip({
    super.key,
    required this.today,
    required this.selected,
    required this.hasActivities,
    required this.onSelect,
  });

  final DateTime today;
  final DateTime? selected;
  final bool Function(DateTime) hasActivities;
  final void Function(DateTime?) onSelect;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 64,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            _allChip(),
            for (var i = 0; i < 14; i++) ...[
              const SizedBox(width: 6),
              _dayChip(DateUtils.addDaysToDate(today, i)),
            ],
          ],
        ),
      );

  Widget _allChip() {
    final on = selected == null;
    return _chip(
      onTap: () => onSelect(null),
      selected: on,
      enabled: true,
      top: Text('الكل',
          style: ar(9, color: on ? Tw.amber400 : Tw.gray600)),
      bottom: Text('📋',
          style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: on ? Tw.amber400 : Tw.gray500)),
      dot: null,
    );
  }

  Widget _dayChip(DateTime d) {
    final on = selected != null && DateUtils.isSameDay(selected, d);
    final isToday = DateUtils.isSameDay(d, today);
    final has = hasActivities(d);

    // 🔴 يومٌ بلا أنشطة **معطّل تماماً**: اختياره يعرض «لا توجد أنشطة في
    //    هذا اليوم» وهو ما يعرفه اللاعب قبل أن يضغط — نقطة المؤشّر تقوله.
    return _chip(
      onTap: has ? () => onSelect(d) : null,
      selected: on,
      enabled: has || isToday,
      top: Text(dayNameOf(d),
          style: ar(9,
              color: on
                  ? Tw.amber400
                  : has
                      ? Tw.gray500
                      : Tw.gray700)),
      bottom: Text('${d.day}',
          style: ar(14,
              weight: FontWeight.bold,
              color: on
                  ? Tw.amber400
                  : isToday
                      ? Colors.white
                      : has
                          ? Tw.gray400
                          : Tw.gray700)),
      dot: has ? (on ? Tw.amber400 : const Color(0xFF22C55E)) : null,
    );
  }

  Widget _chip({
    required VoidCallback? onTap,
    required bool selected,
    required bool enabled,
    required Widget top,
    required Widget bottom,
    required Color? dot,
  }) {
    final content = Container(
      width: 48,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: selected
            ? const Color(0x33F59E0B)
            : enabled
                ? const Color(0x0DFFFFFF)
                : const Color(0x03FFFFFF),
        border: Border.all(
          color: selected
              ? const Color(0x66F59E0B)
              : enabled
                  ? const Color(0x0DFFFFFF)
                  : const Color(0x08FFFFFF),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          top,
          bottom,
          const SizedBox(height: 2),
          SizedBox(
            height: 6,
            child: dot == null
                ? null
                : Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: dot),
                  ),
          ),
        ],
      ),
    );

    final faded = enabled ? content : Opacity(opacity: 0.4, child: content);
    return onTap == null
        ? faded
        : InkWell(onTap: onTap, borderRadius: BorderRadius.circular(12), child: faded);
  }
}

/// رقاقة الصعوبة — نصّها `{icon} {label}` بلون الصعوبة.
class DifficultyPill extends StatelessWidget {
  const DifficultyPill({super.key, required this.difficulty, this.size = 8});
  final String difficulty;
  final double size;

  @override
  Widget build(BuildContext context) {
    final d = Difficulty.of(difficulty);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: d.color.withValues(alpha: 0.08),
      ),
      child: Text('${d.icon} ${d.label}', style: ar(size, color: d.color)),
    );
  }
}

/// بطاقة نشاط.
class ActivityCard extends StatelessWidget {
  const ActivityCard({
    super.key,
    required this.activity,
    required this.booked,
    required this.busy,
    required this.onOpen,
    required this.onBook,
    required this.onEnterRoom,
    required this.bookersOpen,
    required this.onToggleBookers,
    this.bookers,
    this.rooms,
  });

  final Activity activity;
  final bool booked, busy, bookersOpen;
  final VoidCallback onOpen, onBook, onToggleBookers;
  final void Function(String sessionCode) onEnterRoom;
  final List<FollowingBooker>? bookers;
  final List<ActiveRoom>? rooms;

  @override
  Widget build(BuildContext context) {
    final a = activity;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0x08FFFFFF),
        border: Border.all(
            color: booked ? const Color(0x4D22C55E) : const Color(0x0FFFFFFF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: InkWell(
                onTap: onOpen,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(children: [
                      Flexible(
                        child: Text(a.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: ar(14, weight: FontWeight.w500)),
                      ),
                      const SizedBox(width: 6),
                      DifficultyPill(difficulty: a.difficulty),
                    ]),
                    const SizedBox(height: 4),
                    Text(_dateLine(a.date), style: ar(10, color: Tw.gray500)),
                    if (a.locationName != null) ...[
                      const SizedBox(height: 2),
                      Text('📍 ${a.locationName}', style: ar(10, color: Tw.gray600)),
                    ],
                    const SizedBox(height: 2),
                    Text(
                      '👥 ${a.bookedCount}/${a.maxPlayers} لاعب'
                      '${a.isFree ? '' : ' • 💰 ${a.basePrice} د.أ'}',
                      style: ar(10, color: Tw.gray600),
                    ),
                    const SizedBox(height: 6),
                    _capacityBar(a),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            _action(),
          ]),
          if (bookers != null && bookers!.isNotEmpty) _bookersBadge(),
          if (rooms != null && rooms!.isNotEmpty) _activeRooms(),
        ],
      ),
    );
  }

  Widget _capacityBar(Activity a) => ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: SizedBox(
          width: 140,
          height: 6,
          child: Stack(children: [
            const ColoredBox(color: Tw.gray800, child: SizedBox.expand()),
            AnimatedFractionallySizedBox(
              duration: const Duration(milliseconds: 150),
              widthFactor: a.fillRatio,
              heightFactor: 1,   // بدونها ارتفاع التعبئة صفر — انظر ProgressBar
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: a.isFull
                        ? const [Color(0xFFEF4444), Color(0xFFDC2626)]
                        : const [Color(0xFFFBBF24), Color(0xFFF59E0B)],
                  ),
                ),
              ),
            ),
          ]),
        ),
      );

  Widget _action() {
    if (booked) {
      return _pill('✅ محجوز', const Color(0xFF4ADE80), const Color(0x1A22C55E));
    }
    if (activity.isFull) {
      // مكتمل: بلا تفاعل — زرٌّ يُضغط ولا يحجز أسوأ من زرٍّ غائب
      return _pill('🚫 مكتمل', const Color(0xFFF87171), const Color(0x1AEF4444));
    }
    return InkWell(
      onTap: busy ? null : onBook,
      borderRadius: BorderRadius.circular(8),
      child: Opacity(
        opacity: busy ? 0.5 : 1,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
            ),
          ),
          child: Text(busy ? '...' : 'احجز',
              style: ar(12, color: Colors.black, weight: FontWeight.w500)),
        ),
      ),
    );
  }

  Widget _pill(String text, Color fg, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), color: bg),
        child: Text(text, style: ar(12, color: fg)),
      );

  Widget _bookersBadge() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),
          InkWell(
            onTap: onToggleBookers,
            child: Text('👥 ${bookers!.length} لاعب حجزوا',
                style: ar(11, color: const Color(0xCCFBBF24))),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 6),
                for (final b in bookers!)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(children: [
                      _avatar(b.avatarUrl),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(b.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: ar(11, color: Tw.gray400)),
                      ),
                      const SizedBox(width: 8),
                      Directionality(
                        textDirection: TextDirection.ltr,
                        child: Text('Lv.${b.level}', style: ar(11, color: Tw.gray600)),
                      ),
                      const SizedBox(width: 8),
                      Text(b.isFollowing ? '⭐' : '👤',
                          style: TextStyle(
                              fontSize: 9,
                              color: b.isFollowing ? Tw.amber400 : Tw.gray600)),
                    ]),
                  ),
              ],
            ),
            crossFadeState:
                bookersOpen ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 300),
            sizeCurve: Curves.easeOut,
          ),
        ],
      );

  Widget _avatar(String? url) {
    final abs = ApiClient.instance.upload(url);
    return Container(
      width: 20,
      height: 20,
      decoration: const BoxDecoration(
          shape: BoxShape.circle, color: Color(0x0DFFFFFF)),
      clipBehavior: Clip.antiAlias,
      child: abs.isEmpty
          ? const Center(child: Text('🎭', style: TextStyle(fontSize: 10)))
          : CachedNetworkImage(
              imageUrl: abs,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) =>
                  const Center(child: Text('🎭', style: TextStyle(fontSize: 10))),
            ),
    );
  }

  Widget _activeRooms() => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.only(top: 12),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Color(0x0DFFFFFF))),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('🎮 الغرف المتاحة حالياً:',
              style: ar(12, color: Tw.amber400, weight: FontWeight.w500)),
          const SizedBox(height: 8),
          for (var i = 0; i < rooms!.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                onTap: () => onEnterRoom(rooms![i].sessionCode),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: const Color(0x1AF59E0B),
                    border: Border.all(color: const Color(0x33F59E0B)),
                  ),
                  child: Row(children: [
                    Expanded(
                      child: Text(rooms![i].nameAt(i),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ar(14, weight: FontWeight.bold)),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        color: Tw.amber500,
                      ),
                      // «←» حرفيّ: يشير يساراً وهو اتجاه التقدّم في RTL
                      child: Text('دخول ←',
                          style: ar(12, color: Colors.black, weight: FontWeight.bold)),
                    ),
                  ]),
                ),
              ),
            ),
        ]),
      );

  static String _dateLine(DateTime d) =>
      '${dayNameOf(d)} ${d.day} ${monthNameOf(d)} • '
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// صفّ مباراة في تبويب التاريخ.
class MatchRow extends StatelessWidget {
  const MatchRow({super.key, required this.match});
  final MatchHistoryEntry match;

  @override
  Widget build(BuildContext context) {
    // ⚖️ `MatchOutcome` — نفس المصدر الذي تقرأه بقيّة الشاشات
    final won = match.won;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: const Color(0x08FFFFFF),
        border: Border.all(
            color: won ? const Color(0x2622C55E) : const Color(0x26EF4444)),
      ),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(children: [
                Text(won ? '🏆 فوز' : '💀 خسارة',
                    style: ar(12,
                        color: won ? const Color(0xFF4ADE80) : const Color(0xFFF87171),
                        weight: FontWeight.w500)),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(roleNameAr(match.role),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ar(10, color: Tw.gray600)),
                ),
              ]),
              const SizedBox(height: 2),
              Text(_meta(), style: ar(10, color: Tw.gray500)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(match.survived ? '🛡️ نجا' : '☠️ أُقصي',
            style: ar(12,
                color: match.survived ? const Color(0xFF22D3EE) : Tw.gray600)),
      ]),
    );
  }

  String _meta() {
    final d = match.matchDate;
    final date = d == null ? '' : '${d.day} ${monthNameOf(d)}';
    final count = match.matchPlayerCount;
    if (count == null) return date;
    return date.isEmpty ? '$count لاعب' : '$date • $count لاعب';
  }
}
