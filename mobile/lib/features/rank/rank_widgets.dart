import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/rank.dart';
import '../profile/profile_palette.dart';

// ══════════════════════════════════════════════════════
// 🏆 قطع مشتركة في شاشة الرتب — الملفّ 15
// ══════════════════════════════════════════════════════

/// صورة لاعب دائرية. الاحتياطيّ 🎭 — نفس الويب.
class RankAvatar extends StatelessWidget {
  const RankAvatar({
    super.key,
    required this.url,
    required this.size,
    this.border,
    this.borderWidth = 0,
    this.background = const Color(0x0DFFFFFF),
  });

  final String? url;
  final double size, borderWidth;
  final Color? border;
  final Color background;

  @override
  Widget build(BuildContext context) {
    // المسار قد يصل نسبياً — البوّابة الوحيدة تحلّه
    final abs = ApiClient.instance.upload(url);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: background,
        border: border == null ? null : Border.all(color: border!, width: borderWidth),
      ),
      clipBehavior: Clip.antiAlias,
      child: abs.isEmpty
          ? Center(child: Text('🎭', style: TextStyle(fontSize: size * 0.42)))
          : CachedNetworkImage(
              imageUrl: abs,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) =>
                  Center(child: Text('🎭', style: TextStyle(fontSize: size * 0.42))),
            ),
    );
  }
}

/// زرّ المتابعة. لا يظهر إلا لمن شاركته مباراةً — الخادم يفرض ذلك أيضاً.
class FollowButton extends StatelessWidget {
  const FollowButton({
    super.key,
    required this.following,
    required this.busy,
    required this.onTap,
    this.compact = false,
  });

  final bool following, busy, compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = busy
        ? '...'
        : compact
            ? (following ? '⭐' : '☆')
            : (following ? '⭐ متابع' : '☆ تابع');

    return InkWell(
      onTap: busy ? null : onTap,
      borderRadius: BorderRadius.circular(compact ? 8 : 10),
      child: Container(
        padding: compact
            ? const EdgeInsets.symmetric(horizontal: 8, vertical: 4)
            : const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(compact ? 8 : 10),
          color: following ? const Color(0x33F59E0B) : const Color(0x0DFFFFFF),
          border: compact
              ? null
              : Border.all(
                  color: following ? const Color(0x4DF59E0B) : const Color(0x1AFFFFFF)),
        ),
        child: Text(label,
            style: ar(compact ? 10 : 12,
                color: following ? Tw.amber400 : Tw.gray500)),
      ),
    );
  }
}

/// صفّ لاعب في اللوحة — من المركز الرابع فصاعداً.
class LeaderboardRowTile extends StatelessWidget {
  const LeaderboardRowTile({
    super.key,
    required this.row,
    required this.rank,
    required this.isMe,
    required this.glow,
    required this.onTap,
    this.follow,
  });

  final LeaderboardRow row;
  final int rank;
  final bool isMe;

  /// توهّج نابض لصفّي — يتوقّف بعد خمس ثوانٍ (§6.5)
  final Animation<double>? glow;
  final VoidCallback onTap;
  final Widget? follow;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: isMe ? const Color(0x14FBBF24) : const Color(0x08FFFFFF),
        border: Border.all(
          color: isMe ? const Color(0x4DFBBF24) : const Color(0x0FFFFFFF),
          width: isMe ? 2 : 1,
        ),
      ),
      child: Row(children: [
        SizedBox(
          width: 24,
          child: Text('$rank',
              textAlign: TextAlign.center,
              style: ar(14,
                  color: isMe ? Tw.amber400 : Tw.gray600, weight: FontWeight.w700)),
        ),
        const SizedBox(width: 12),
        RankAvatar(url: row.avatarUrl, size: 32),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                clipName(row.name, 16) + (isMe ? ' (أنت)' : ''),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(12,
                    color: isMe ? Tw.amber400 : Colors.white, weight: FontWeight.w500),
              ),
              // المستوى ظاهر لأنّه مفتاح الترتيب الثالث في الخادم
              // (الرتبة ← RR ← المستوى) — بدونه يبدو تعادل RR اعتباطاً.
              Text('${row.totalMatches} مباراة • ${row.totalWins} فوز • مستوى ${row.level}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(10, color: Tw.gray500)),
            ],
          ),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 64,
          child: Text('${RankScale.badge(row.rankTier)} ${RankScale.nameAr(row.rankTier)}',
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ar(10, color: Tw.gray300)),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 40,
          child: ltrText('${row.rankRR}',
              num_(12, color: Tw.amber400, weight: FontWeight.w700),
              align: TextAlign.center),
        ),
        if (follow != null) ...[const SizedBox(width: 8), follow!],
      ]),
    );

    if (!isMe) {
      return InkWell(onTap: onTap, borderRadius: BorderRadius.circular(12), child: content);
    }
    if (glow == null) return content;

    // صفّي **غير قابل للنقر** — لا بروفايل لنفسي من هنا
    return AnimatedBuilder(
      animation: glow!,
      builder: (_, child) {
        final t = glow!.value; // 0..1
        return DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                  color: Tw.amber400.withValues(alpha: 0.4 + 0.2 * t),
                  blurRadius: 15 + 10 * t),
              BoxShadow(
                  color: Tw.amber400.withValues(alpha: 0.2 + 0.1 * t),
                  blurRadius: 30 + 20 * t),
              BoxShadow(
                  color: Tw.amber400.withValues(alpha: 0.1 * t), blurRadius: 70 * t),
            ],
          ),
          child: child,
        );
      },
      child: content,
    );
  }
}

/// منصّة التتويج — تُرسم فقط بثلاثة لاعبين فأكثر.
class Podium extends StatelessWidget {
  const Podium({super.key, required this.top3, required this.myId, required this.onTap});

  final List<LeaderboardRow> top3;
  final int myId;
  final void Function(int id) onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // ترتيب الويب: ٢ ثمّ ١ ثمّ ٣ — وRTL يقلبه فيصير ٣ يمين و٢ يسار.
            // لا تعكس المصفوفة: الويب RTL أيضاً والنتيجة واحدة.
            _step(top3[1], 2),
            const SizedBox(width: 12),
            _step(top3[0], 1),
            const SizedBox(width: 12),
            _step(top3[2], 3),
          ],
        ),
      );

  Widget _step(LeaderboardRow r, int place) {
    final first = place == 1;
    final me = r.id == myId;
    final (medal, border, bw) = switch (place) {
      1 => ('🥇', const Color(0x99FBBF24), 3.0),
      2 => ('🥈', const Color(0x669CA3AF), 2.0),
      _ => ('🥉', const Color(0x66B45309), 2.0),
    };

    final col = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          margin: EdgeInsets.only(top: first ? 0 : 16, bottom: 4),
          decoration: first
              ? const BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Color(0x33F59E0B), blurRadius: 16)],
                )
              : null,
          child: RankAvatar(
            url: r.avatarUrl,
            size: first ? 72 : 56,
            border: border,
            borderWidth: bw,
            background: first ? const Color(0x14FBBF24) : const Color(0x0DFFFFFF),
          ),
        ),
        Text(medal, style: TextStyle(fontSize: first ? 18 : 12)),
        SizedBox(
          width: first ? 80 : 70,
          child: Text(
            clipName(r.name, first ? 10 : 8),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ar(first ? 12 : 10,
                color: first ? Tw.amber400 : Colors.white,
                weight: first ? FontWeight.w700 : FontWeight.w500),
          ),
        ),
        SizedBox(
          width: first ? 80 : 70,
          // «225 RR» بلا تغليف تُعرض «RR 225» — انظر ltrRun
          child: Text('${r.totalMatches} مباراة • ${ltrRun('${r.rankRR} RR')}',
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: ar(9, color: first ? Tw.gray400 : Tw.gray500)),
        ),
      ],
    );

    return me ? col : InkWell(onTap: () => onTap(r.id), child: col);
  }
}
