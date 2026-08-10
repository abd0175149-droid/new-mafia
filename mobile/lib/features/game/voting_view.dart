import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/game.dart';
import '../../models/profile.dart' show roleNameAr;
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 🗳️ الاقتراع — §4.4 · §4.5 · §4.6 في الملفّ ٢٥
// ══════════════════════════════════════════════════════

const _gold = Color(0xFFC5A059);
const _blood = Color(0xFF8A0303);

class VotingBallot extends StatefulWidget {
  const VotingBallot({super.key, required this.controller});
  final GameSessionController controller;

  @override
  State<VotingBallot> createState() => _VotingBallotState();
}

class _VotingBallotState extends State<VotingBallot> {
  /// نبضةٌ ثانويةٌ لعدّاد نافذة التغيير: مصدرها زمنٌ محليّ لا حدثُ خادم،
  /// فلا يُعيد المتحكّم بناءها من تلقائه.
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  GameSessionController get c => widget.controller;

  @override
  Widget build(BuildContext context) {
    final v = c.voting;
    if (v == null || v.candidates.isEmpty) return const _BallotLoading();

    return Column(children: [
      const SizedBox(height: 8),
      const Text('🗳️', style: TextStyle(fontSize: 30)),
      const SizedBox(height: 8),
      const Text('مرحلة التصويت',
          style: TextStyle(
            fontFamily: 'Amiri',
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: _gold,
            letterSpacing: 0,
          )),
      const SizedBox(height: 6),
      _status(),
      if ((c.votingCountdown ?? 0) > 0) ...[
        const SizedBox(height: 12),
        RepaintBoundary(
          child: Text('⏱ ${c.votingCountdown}ث',
              style: mono(30,
                  color: c.votingCountdown! <= 10
                      ? const Color(0xFFEF4444)
                      : _gold,
                  weight: FontWeight.w900)),
        ),
      ],
      const SizedBox(height: 16),
      _progress(v),
      const SizedBox(height: 16),
      // ≤27 مرشّحاً — قائمةٌ محصورة الارتفاع كما في المصدر
      ConstrainedBox(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.55),
        child: ListView.separated(
          shrinkWrap: true,
          padding: const EdgeInsets.only(bottom: 16),
          itemCount: v.candidates.length,
          separatorBuilder: (_, __) => const SizedBox(height: 16),
          itemBuilder: (_, i) => CandidateCard(
            candidate: v.candidates[i],
            index: i,
            selected: c.myVote == i,
            isSelf: v.candidates[i].targetPhysicalId == c.physicalId,
            disabled: c.isPlayerDead,
            voters: _votersOf(v, i),
            initiatorName: _nameOf(v, v.candidates[i].initiatorPhysicalId),
            // 🟢🟡🔴 من المفكرة المحلّية — لا يراه أحدٌ سواك
            suspicion: c.suspicionEmoji(v.candidates[i].targetPhysicalId),
            onTap: () => unawaited(c.castVote(i)),
          ),
        ),
      ),
    ]);
  }

  List<(int, String)> _votersOf(VotingState v, int index) {
    final out = <(int, String)>[];
    v.playerVotes.forEach((pid, idx) {
      if (idx == index) out.add((pid, _nameOf(v, pid) ?? ''));
    });
    out.sort((a, b) => a.$1.compareTo(b.$1));
    return out;
  }

  String? _nameOf(VotingState v, int? pid) {
    if (pid == null) return null;
    for (final p in v.playersInfo) {
      if (p.physicalId == pid) return p.name;
    }
    return null;
  }

  Widget _status() {
    if (c.isPlayerDead) {
      return Text('مشاهدة فقط — أنت مُقصى',
          style: mono(12, color: const Color(0xFF808080)));
    }
    if (c.myVote != null) {
      // المسار المُستعاد لا نافذة زمنية له — التغيير حرٌّ حتى الاكتمال
      if (c.step == GameStep.rejoined) {
        return Text('✅ تم التصويت — اضغط لاعب آخر للتغيير',
            style: mono(10, color: const Color(0xFF22C55E))
                .copyWith(letterSpacing: 1.5));
      }
      return c.voteWindowOpen
          ? Text('يمكنك تغيير تصويتك خلال ${c.voteWindowSecondsLeft} ثانية',
              style: mono(12,
                  color: const Color(0xFFF59E0B), weight: FontWeight.bold))
          : Text('✅ تم التصويت (مغلق)',
              style: mono(12,
                  color: const Color(0xFF22C55E), weight: FontWeight.bold));
    }
    if (c.votingCountdown == 0) {
      return Text('❌ لم تقم بالتصويت',
          style: mono(12, color: _blood, weight: FontWeight.bold));
    }
    return Text('صوّت ضد اللاعب المشتبه',
        style: mono(12, color: const Color(0xFF808080)));
  }

  Widget _progress(VotingState v) {
    final maxVotes = v.candidates.fold<int>(0, (m, e) => e.votes > m ? e.votes : m);
    final denom = v.candidates.isEmpty ? 1 : v.candidates.length;
    final frac = (v.totalVotesCast / denom).clamp(0.0, 1.0);

    return Column(children: [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('${v.totalVotesCast} صوت',
            style: mono(10, color: const Color(0xFF808080))),
        Text('$maxVotes أعلى', style: mono(10, color: const Color(0xFF808080))),
      ]),
      const SizedBox(height: 6),
      ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: Container(
          height: 6,
          color: const Color(0xFF1A1A1A),
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: frac, end: frac),
            duration: const Duration(milliseconds: 500),
            builder: (_, x, __) => FractionallySizedBox(
              alignment: AlignmentDirectional.centerStart,
              widthFactor: x,
              heightFactor: 1,
              child: const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                      colors: [Color(0xFFC5A059), Color(0xFFE8C97A)]),
                ),
              ),
            ),
          ),
        ),
      ),
      if (c.votingComplete) ...[
        const SizedBox(height: 8),
        Text('✓ اكتمل التصويت — بانتظار الليدر',
            style: mono(10, color: _gold)),
      ],
    ]);
  }
}

class _BallotLoading extends StatelessWidget {
  const _BallotLoading();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(children: [
          const Text('🗳️', style: TextStyle(fontSize: 30)),
          const SizedBox(height: 16),
          const SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(strokeWidth: 3, color: _gold),
          ),
          const SizedBox(height: 16),
          Text('جاري تحميل التصويت...', style: mono(14, color: _gold)),
        ]),
      );
}

class CandidateCard extends StatelessWidget {
  const CandidateCard({
    super.key,
    required this.candidate,
    required this.index,
    required this.selected,
    required this.onTap,
    this.isSelf = false,
    this.disabled = false,
    this.voters = const [],
    this.initiatorName,
    this.suspicion,
  });

  final VoteCandidate candidate;
  final int index;
  final bool selected, isSelf, disabled;
  final VoidCallback onTap;
  final List<(int, String)> voters;
  final String? initiatorName;

  /// 🟢/🟡/🔴 من المفكرة — يصل مع الملفّ ٢٦.
  final String? suspicion;

  String get _name => candidate.name.isNotEmpty
      ? candidate.name
      : 'لاعب ${candidate.targetPhysicalId}';

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: selected ? _gold : const Color(0xFF222222), width: 2),
        color: selected ? null : const Color(0xFF111111),
        gradient: selected
            ? LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  _gold.withValues(alpha: 0.15),
                  _gold.withValues(alpha: 0.05),
                ],
              )
            : null,
        boxShadow: selected
            ? [BoxShadow(color: _gold.withValues(alpha: 0.2), blurRadius: 20)]
            : null,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        _avatar(),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: const Color(0x66000000),
            border: Border.all(color: _gold.withValues(alpha: 0.2)),
          ),
          child: Text('مقعد #${candidate.targetPhysicalId}',
              style: mono(14, color: _gold).copyWith(letterSpacing: 2)),
        ),
        const SizedBox(height: 6),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Flexible(
            child: Text(_name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(20, weight: FontWeight.bold)),
          ),
          if (suspicion != null) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0x80000000),
                border: Border.all(color: const Color(0xFF333333)),
              ),
              child: Text(suspicion!, style: const TextStyle(fontSize: 11)),
            ),
          ],
        ]),
        if (candidate.isDeal) ...[
          const SizedBox(height: 6),
          _dealBadge(),
        ],
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: const Color(0x4D000000),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('${candidate.votes}',
                style: ar(14, color: _gold, weight: FontWeight.w900)),
            const SizedBox(width: 4),
            Text('صوت', style: ar(10, color: const Color(0xFF808080))),
          ]),
        ),
        if (voters.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.only(top: 8),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Color(0x80333333))),
            ),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 6,
              runSpacing: 6,
              children: [for (final v in voters) _voterChip(v.$1, v.$2)],
            ),
          ),
        ],
      ]),
    );

    return Stack(children: [
      Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: disabled ? null : onTap,
          borderRadius: BorderRadius.circular(16),
          child: card,
        ),
      ),
      if (isSelf)
        Positioned(
          top: 6,
          right: 6,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0xFF222222),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('أنت', style: mono(10, color: const Color(0xFF808080))),
          ),
        ),
    ]);
  }

  Widget _avatar() {
    final url = candidate.avatarUrl;
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(children: [
        Container(
          width: 72,
          height: 72,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFF1A1A1A),
            border: Border.all(color: const Color(0xFF333333), width: 2),
          ),
          clipBehavior: Clip.antiAlias,
          child: url == null
              ? Text('#${candidate.targetPhysicalId}',
                  style: mono(28, color: _gold, weight: FontWeight.w900))
              : CachedNetworkImage(
                  imageUrl: ApiClient.instance.upload(url),
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => Text(
                      '#${candidate.targetPhysicalId}',
                      style: mono(28, color: _gold, weight: FontWeight.w900)),
                  placeholder: (_, __) =>
                      const ColoredBox(color: Color(0xFF1A1A1A)),
                ),
        ),
        if (selected)
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _gold.withValues(alpha: 0.4),
              ),
              child: const Center(
                child: Text('✅', style: TextStyle(fontSize: 28)),
              ),
            ),
          ),
      ]),
    );
  }

  Widget _dealBadge() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          color: const Color(0xFFEF4444).withValues(alpha: 0.2),
          border: Border.all(
              color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text('🤝 ديل من:',
              style: ar(12,
                  color: const Color(0xFFEF4444), weight: FontWeight.bold)),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
                initiatorName?.isNotEmpty == true
                    ? initiatorName!
                    : 'لاعب ${candidate.initiatorPhysicalId}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: ar(12, weight: FontWeight.bold)),
          ),
          const SizedBox(width: 4),
          Text('#${candidate.initiatorPhysicalId}',
              style: mono(11, color: const Color(0xFFF87171))),
        ]),
      );

  Widget _voterChip(int pid, String name) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: _blood.withValues(alpha: 0.2),
          border: Border.all(color: _blood.withValues(alpha: 0.4)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text('$pid',
              style: mono(11,
                  color: const Color(0xFFFF4444), weight: FontWeight.w900)),
          if (name.isNotEmpty) ...[
            const SizedBox(width: 4),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 50),
              child: Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ar(11, color: const Color(0xFFD1D5DB))),
            ),
          ],
        ]),
      );
}

// ══════════════════════════════════════════════════════
// §4.5 التعادل
// ══════════════════════════════════════════════════════
class TiebreakerBody extends StatelessWidget {
  const TiebreakerBody({super.key, this.tied = const []});
  final List<VoteCandidate> tied;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(children: [
          const Text('⚖️', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 8),
          const Text('تعادل في الأصوات',
              style: TextStyle(
                fontFamily: 'Amiri',
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: Color(0xFFFACC15),
                letterSpacing: 0,
              )),
          const SizedBox(height: 16),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final t in tied)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: const Color(0xFFEAB308).withValues(alpha: 0.1),
                    border: Border.all(
                        color:
                            const Color(0xFFEAB308).withValues(alpha: 0.3)),
                  ),
                  child: Column(children: [
                    Text('#${t.targetPhysicalId}',
                        style: mono(18,
                            color: const Color(0xFFFACC15),
                            weight: FontWeight.w900)),
                    if (t.name.isNotEmpty)
                      Text(t.name, style: ar(12)),
                    Text(votesAr(t.votes),
                        style: ar(12,
                            color: const Color(0xFFFACC15),
                            weight: FontWeight.bold)),
                  ]),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text('بانتظار قرار الليدر...',
              style: ar(12,
                  color: const Color(0xFF9A9A9A), weight: FontWeight.bold)),
        ]),
      );
}

// ══════════════════════════════════════════════════════
// §4.6 الإقصاء وكشف الدور
// ══════════════════════════════════════════════════════
class EliminationBody extends StatelessWidget {
  const EliminationBody({
    super.key,
    this.eliminated = const [],
    this.names = const {},
    this.revealedRoles = const {},
    this.myPhysicalId = 0,
  });

  final List<int> eliminated;
  final Map<int, String> names;

  /// يُملأ بعد `day:elimination-revealed` وحده.
  final Map<int, String> revealedRoles;
  final int myPhysicalId;

  bool get _iAmOut => eliminated.contains(myPhysicalId);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(children: [
          const Text('💀', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 8),
          const Text('إقصاء',
              style: TextStyle(
                fontFamily: 'Amiri',
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: Color(0xFFF87171),
                letterSpacing: 0,
              )),
          const SizedBox(height: 16),
          for (final pid in eliminated) _card(pid),
          if (_iAmOut) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: const Color(0xFFEF4444).withValues(alpha: 0.2),
                border: Border.all(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.4)),
              ),
              child: Center(
                child: Text('❌ تم إقصاؤك!',
                    style: ar(18,
                        color: const Color(0xFFF87171),
                        weight: FontWeight.bold)),
              ),
            ),
          ],
        ]),
      );

  Widget _card(int pid) {
    final mine = pid == myPhysicalId;
    final role = revealedRoles[pid];
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: mine
            ? const Color(0xFFEF4444).withValues(alpha: 0.2)
            : const Color(0x0DFFFFFF),
        border: Border.all(
            color: mine
                ? const Color(0xFFEF4444).withValues(alpha: 0.5)
                : const Color(0x1AFFFFFF)),
      ),
      child: Column(children: [
        Container(
          width: 64,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFFEF4444).withValues(alpha: 0.2),
            border: Border.all(
                color: const Color(0xFFEF4444).withValues(alpha: 0.5),
                width: 2),
          ),
          child: Text('#$pid',
              style: mono(22,
                  color: const Color(0xFFF87171), weight: FontWeight.w900)),
        ),
        const SizedBox(height: 8),
        Text(names[pid]?.isNotEmpty == true ? names[pid]! : 'لاعب #$pid',
            style: ar(18, weight: FontWeight.bold)),
        // الدور لا يظهر قبل أن يكشفه الليدر — الظهور المبكّر يفسد الجولة
        if (role != null && role.isNotEmpty) ...[
          const SizedBox(height: 6),
          AnimatedOpacity(
            opacity: 1,
            duration: const Duration(milliseconds: 400),
            // 🔴 كان يُعرض المفتاح خاماً: «GODFATHER» أمام لاعبٍ عربيّ،
            //    بينما شاشة النهاية تعرّبه. نفس المعجم في الموضعين.
            child: Text(roleNameAr(role),
                style: ar(14, color: _gold, weight: FontWeight.bold)),
          ),
        ],
      ]),
    );
  }
}
