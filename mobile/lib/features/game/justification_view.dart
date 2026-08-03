import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../models/game.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// ⚖️ التبرير وسحب الصوت — §4.3 في الملفّ ٢٥
// ══════════════════════════════════════════════════════
// المتّهم يدافع عن نفسه، ومن صوّت عليه يستطيع سحب صوته بعد أن يسمعه.
// إن سحب أكثر من النصف أُعيد الاقتراع — فالسحب ليس تراجعاً شخصياً بل
// آليّة نقضٍ جماعية.

const _gold = Color(0xFFC5A059);

class JustificationBody extends StatefulWidget {
  const JustificationBody({super.key, required this.controller});
  final GameSessionController controller;

  @override
  State<JustificationBody> createState() => _JustificationBodyState();
}

class _JustificationBodyState extends State<JustificationBody> {
  GameSessionController get c => widget.controller;

  @override
  Widget build(BuildContext context) {
    final j = c.justification;
    if (j == null || j.accused.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(children: [
          const Text('⚖️', style: TextStyle(fontSize: 28)),
          const SizedBox(height: 12),
          Text('بانتظار بدء التبرير...',
              style: mono(12, color: const Color(0xFF666666))),
        ]),
      );
    }

    return Column(children: [
      const Text('⚖️', style: TextStyle(fontSize: 28)),
      const SizedBox(height: 4),
      const Text('مرحلة التبرير',
          style: TextStyle(
            fontFamily: 'Amiri',
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: _gold,
            letterSpacing: 0,
          )),
      const SizedBox(height: 16),
      for (final a in j.accused) _accusedCard(a, j.topVotes),
      if ((c.justTimer ?? 0) > 0) ...[
        const SizedBox(height: 8),
        _timerPill(c.justTimer!),
      ],
      if (c.canShowWithdrawal) ...[
        const SizedBox(height: 16),
        _WithdrawCard(controller: c),
      ],
    ]);
  }

  Widget _accusedCard(AccusedPlayer a, int topVotes) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
              color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              const Color(0xFFEF4444).withValues(alpha: 0.15),
              const Color(0xFF7F1D1D).withValues(alpha: 0.10),
            ],
          ),
        ),
        child: Row(children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0x33000000),
              border: Border.all(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.5),
                  width: 2),
            ),
            clipBehavior: Clip.antiAlias,
            child: a.avatarUrl == null
                ? Text('#${a.targetPhysicalId}',
                    style: mono(20,
                        color: const Color(0xFFF87171),
                        weight: FontWeight.w900))
                : CachedNetworkImage(
                    imageUrl: ApiClient.instance.upload(a.avatarUrl),
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => Text('#${a.targetPhysicalId}',
                        style: mono(20,
                            color: const Color(0xFFF87171),
                            weight: FontWeight.w900)),
                    placeholder: (_, __) =>
                        const ColoredBox(color: Color(0xFF1A1A1A)),
                  ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    a.name.isNotEmpty
                        ? a.name
                        : 'لاعب #${a.targetPhysicalId}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ar(17, weight: FontWeight.bold)),
                const SizedBox(height: 2),
                Text('$topVotes صوت ضده',
                    style: ar(12,
                        color: const Color(0xFFF87171),
                        weight: FontWeight.bold)),
                if (a.canJustify) ...[
                  const SizedBox(height: 2),
                  Text('🎙️ يبرر الآن...',
                      style: ar(12, color: const Color(0xFFEAB308))),
                ],
              ],
            ),
          ),
        ]),
      );

  Widget _timerPill(int seconds) {
    final hot = seconds <= 10;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: const Color(0x66000000),
        border: Border.all(color: _gold.withValues(alpha: 0.2)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Text('⏱', style: TextStyle(fontSize: 16)),
        const SizedBox(width: 8),
        Text('${seconds}s',
            style: mono(24,
                color: hot ? const Color(0xFFEF4444) : Colors.white,
                weight: FontWeight.w900)),
      ]),
    );
  }
}

class _WithdrawCard extends StatelessWidget {
  const _WithdrawCard({required this.controller});
  final GameSessionController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final done = c.iWithdrew;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border:
            Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.3)),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            const Color(0xFF3B82F6).withValues(alpha: 0.15),
            const Color(0xFF1E3A8A).withValues(alpha: 0.10),
          ],
        ),
      ),
      child: Column(children: [
        Text('أنت صوّت على هذا اللاعب',
            style: ar(15,
                color: const Color(0xFF93C5FD), weight: FontWeight.bold)),
        const SizedBox(height: 6),
        Text('هل تريد سحب صوتك؟ إذا سحب أكثر من النصف تُعاد عملية التصويت',
            textAlign: TextAlign.center,
            style: ar(12, color: const Color(0xFF888888), height: 1.6)),
        const SizedBox(height: 10),
        Text('${c.withdrawal.count}/${c.withdrawalNeeded} سحبوا أصواتهم',
            style: mono(13, color: const Color(0xFFBBBBBB))),
        const SizedBox(height: 12),
        if (done)
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0xFF22C55E).withValues(alpha: 0.12),
              border: Border.all(
                  color: const Color(0xFF22C55E).withValues(alpha: 0.3)),
            ),
            child: Text('✓ تم سحب صوتك',
                style: mono(13, color: const Color(0xFF4ADE80))),
          )
        else
          Opacity(
            opacity: c.withdrawBusy ? 0.4 : 1,
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: c.withdrawBusy
                  ? null
                  : () => unawaited(c.withdrawVote()),
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 32, vertical: 12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                  border: Border.all(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.4)),
                ),
                child: Text('🗳️ سحب صوتي',
                    style: ar(14,
                        color: const Color(0xFF93C5FD),
                        weight: FontWeight.bold)),
              ),
            ),
          ),
      ]),
    );
  }
}
