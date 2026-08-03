import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../models/profile.dart';
import '../../models/rank.dart';
import '../profile/profile_palette.dart';
import 'rank_widgets.dart';

// ══════════════════════════════════════════════════════
// 👤 ورقة بروفايل لاعب — §4.9 في الملفّ 15
// ══════════════════════════════════════════════════════
// تجلس **فوق شريط التنقّل** لا فوقه بالكامل: الويب يجعل الحاجز ينتهي
// عند `64px + safe-area` فيبقى الناف ظاهراً ويعرف اللاعب أنّه لم يغادر
// الشاشة. نُعيد ذلك بحشوةٍ سفلية على الورقة نفسها.

const double _navHeight = 64;

Future<void> showPlayerSheet(
  BuildContext context, {
  required ProfileResponse profile,
  bool? following,
  Future<void> Function()? onToggleFollow,
}) {
  final bottomInset = _navHeight + MediaQuery.viewPaddingOf(context).bottom;

  return showModalBottomSheet(
    context: context,
    // 🔴 مُلاحِح الجذر: ما يُفتح من داخل تبويبٍ في `StatefulShellRoute`
    //    يُرسم تحت شريط التنقّل السفليّ فيُقصّ من أسفله.
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xCC000000),
    isScrollControlled: true,
    constraints: BoxConstraints(
      maxWidth: 512,
      maxHeight: MediaQuery.sizeOf(context).height * 0.70,
    ),
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: _PlayerSheet(
        profile: profile,
        following: following,
        onToggleFollow: onToggleFollow,
      ),
    ),
  );
}

class _PlayerSheet extends StatefulWidget {
  const _PlayerSheet({required this.profile, this.following, this.onToggleFollow});

  final ProfileResponse profile;

  /// `null` = ليس من شاركتهم مباراةً ⇒ لا زرّ متابعة أصلاً.
  final bool? following;
  final Future<void> Function()? onToggleFollow;

  @override
  State<_PlayerSheet> createState() => _PlayerSheetState();
}

class _PlayerSheetState extends State<_PlayerSheet> {
  // 🔴 حالة محلّية إلزامية: الورقة مسارٌ مستقلّ، و`setState` في الشاشة
  //    الأمّ لا يعيد بناءها. زرٌّ يقرأ حالة الأمّ يبقى مجمَّداً بعد الضغط
  //    — يبدو كأن المتابعة لم تُسجَّل وهي مُسجَّلة.
  late bool _following = widget.following ?? false;
  bool _busy = false;

  ProfileResponse get profile => widget.profile;

  Future<void> _toggle() async {
    final cb = widget.onToggleFollow;
    if (cb == null || _busy) return;
    setState(() => _busy = true);
    await cb();
    if (mounted) setState(() { _following = !_following; _busy = false; });
  }

  @override
  Widget build(BuildContext context) {
    final p = profile.player;
    final tier = profile.progression.rankTier;
    final s = profile.stats;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A0A),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: const Color(0x1AFFFFFF)),
      ),
      padding: const EdgeInsets.all(20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Tw.gray700,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            Row(children: [
              RankAvatar(
                url: p.avatarUrl,
                size: 56,
                border: RankScale.color(tier),
                borderWidth: 2,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(p.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ar(15, weight: FontWeight.w700)),
                    Text('${RankScale.badge(tier)} ${RankScale.nameAr(tier)}',
                        style: ar(12, color: Tw.gray500)),
                  ],
                ),
              ),
              if (widget.following != null) ...[
                const SizedBox(width: 8),
                FollowButton(following: _following, busy: _busy, onTap: _toggle),
              ],
            ]),
            const SizedBox(height: 16),
            IntrinsicHeight(
              child: Row(children: [
                _stat('مباريات', '${s.totalMatches}'),
                const SizedBox(width: 8),
                _stat('فوز', '${s.winRate}%'),
                const SizedBox(width: 8),
                _stat('نجاة', '${s.survivalRate}%'),
              ]),
            ),
            const SizedBox(height: 16),
            for (final m in profile.matchHistory.take(5)) _matchLine(m),
          ],
        ),
      ),
    );
  }

  Widget _stat(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0x0DFFFFFF),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(value, style: ar(14, weight: FontWeight.w700)),
              Text(label, style: ar(10, color: Tw.gray500)),
            ],
          ),
        ),
      );

  Widget _matchLine(MatchHistoryEntry m) {
    // ⚖️ `m.won` — نفس المصدر الذي تقرأه بقيّة الشاشات. كان الويب يشتقّ
    //    هنا من الدور وحده، فتُعرض المباراة نفسها بنتيجتين مختلفتين في
    //    مكانين. المصدر واحد الآن (models/profile.dart → MatchOutcome).
    final won = m.won;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0x0DFFFFFF))),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Flexible(
          child: Text(
            '${won ? '🏆' : '💀'} ${roleNameAr(m.role)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ar(12, color: won ? Tw.green400 : Tw.red400),
          ),
        ),
        Text(
          m.matchDate == null ? '' : DateFormat('d MMM', 'ar').format(m.matchDate!),
          style: ar(12, color: Tw.gray600),
        ),
      ]),
    );
  }
}
