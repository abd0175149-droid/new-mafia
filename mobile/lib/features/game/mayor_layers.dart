import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/game.dart';
import '../profile/profile_palette.dart';
import 'game_session_controller.dart';

// ══════════════════════════════════════════════════════
// 🎩 العمدة — §4.7 في الملفّ ٢٥
// ══════════════════════════════════════════════════════
// ثلاث طبقات في جذر شاشة اللعب: مودال القرار (على هاتف العمدة وحده)،
// وبانر الكشف (للجميع، ٨ ثوانٍ)، والشارة الدائمة أثناء التصويت.
//
// 🔒 المودال لا يُفتح إلّا على `forMayor: true`. البثّ العامّ يصل الجميع،
//    وفتحُه لغير العمدة يكشف أنّ العمدة ليس هو.

const _gold = Color(0xFFC5A059);

class MayorLayer extends StatelessWidget {
  const MayorLayer({super.key, required this.controller});
  final GameSessionController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return Stack(children: [
      if (c.mayorPrompt != null) _MayorPromptModal(controller: c),
      if (c.mayorBanner != null)
        _MayorBanner(reveal: c.mayorBanner!)
      else if (c.gamePhase == GamePhase.dayVoting && c.mayorRevealedId != null)
        _MayorBadge(
          revealedId: c.mayorRevealedId!,
          weight: c.mayorWeight,
          isMe: c.mayorRevealedId == c.physicalId,
        ),
    ]);
  }
}

// ══════════════════════════════════════════════════════
// §4.7.1 مودال القرار
// ══════════════════════════════════════════════════════
class _MayorPromptModal extends StatelessWidget {
  const _MayorPromptModal({required this.controller});
  final GameSessionController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final p = c.mayorPrompt!;

    return Positioned.fill(
      child: Material(
        color: const Color(0xE6000000),
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 384),
                child: Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: _gold, width: 2),
                    gradient: const LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xFF1D160C), Color(0xFF0F0B06)],
                    ),
                    boxShadow: [
                      BoxShadow(
                          color: _gold.withValues(alpha: 0.3), blurRadius: 40),
                    ],
                  ),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text('🎩', style: TextStyle(fontSize: 34)),
                    const SizedBox(height: 8),
                    Text('أنت العمدة — لحظة القرار',
                        textAlign: TextAlign.center,
                        style: ar(18, color: _gold, weight: FontWeight.w900)),
                    const SizedBox(height: 10),
                    Text.rich(
                      TextSpan(children: [
                        const TextSpan(text: 'نتيجة التصويت: إعدام '),
                        TextSpan(
                          text: p.victimLine,
                          style: ar(11,
                              color: const Color(0xFFFF6B64),
                              weight: FontWeight.bold),
                        ),
                        TextSpan(text: ' (${p.topVotes} أصوات)'),
                      ]),
                      textAlign: TextAlign.center,
                      style: ar(11, color: const Color(0xFF9A8F7D)),
                    ),
                    const SizedBox(height: 6),
                    // ⏳ إرشاديّ: انتهاؤه لا يقرّر شيئاً — الليدر خطّ الرجعة
                    Text('⏳ ${c.mayorPromptLeft} ثانية — وبعدها يحسم الموجّه',
                        style: ar(10, color: const Color(0xFF655C4E))),
                    const SizedBox(height: 16),
                    _button(
                      c,
                      label: '🔄 أكشف نفسي — إلغاء الإعدام وتصويت جديد على الجميع',
                      colors: const [Color(0xFF3B6FD4), Color(0xFF2B4F9E)],
                      border: const Color(0xFF4F8EF7),
                      decision: 'REVOTE',
                    ),
                    const SizedBox(height: 8),
                    _button(
                      c,
                      label: '🌙 أكشف نفسي — تأجيل: لا موت اليوم',
                      colors: const [Color(0xFF7A4B8F), Color(0xFF5B3570)],
                      border: const Color(0xFF9B6DD6),
                      decision: 'POSTPONE',
                    ),
                    const SizedBox(height: 8),
                    _passButton(c),
                    const SizedBox(height: 12),
                    Text(
                        'الكشف دائم للجميع + صوتك ×${p.voteWeight} فوراً '
                        '+ القدرة تُستهلك (مرّة واحدة)',
                        textAlign: TextAlign.center,
                        style: ar(10,
                            color: const Color(0xFF9A9A9A), height: 1.6)),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _button(
    GameSessionController c, {
    required String label,
    required List<Color> colors,
    required Color border,
    required String decision,
  }) =>
      Opacity(
        opacity: c.mayorSending ? 0.5 : 1,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: c.mayorSending
              ? null
              : () => unawaited(c.sendMayorDecision(decision)),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: colors),
              border: Border.all(color: border),
            ),
            child: Text(label,
                textAlign: TextAlign.center,
                style: ar(13, weight: FontWeight.bold, height: 1.4)),
          ),
        ),
      );

  Widget _passButton(GameSessionController c) => Opacity(
        opacity: c.mayorSending ? 0.5 : 1,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap:
              c.mayorSending ? null : () => unawaited(c.sendMayorDecision('PASS')),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 10),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF4A3F31)),
            ),
            child: Text('🤐 أبقى مخفيّاً — نفّذوا الإعدام',
                textAlign: TextAlign.center,
                style: ar(13, color: const Color(0xFF9A8F7D))),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.7.2 بانر الكشف — ٨ ثوانٍ
// ══════════════════════════════════════════════════════
class _MayorBanner extends StatelessWidget {
  const _MayorBanner({required this.reveal});
  final MayorReveal reveal;

  @override
  Widget build(BuildContext context) => Positioned(
        top: 16,
        left: 16,
        right: 16,
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 384),
              child: Material(
                color: Colors.transparent,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: _gold),
                    gradient: const LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xFF1D160C), Color(0xFF0F0B06)],
                    ),
                    boxShadow: [
                      BoxShadow(
                          color: _gold.withValues(alpha: 0.25), blurRadius: 30),
                    ],
                  ),
                  child: Directionality(
                    textDirection: TextDirection.rtl,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            '🎩 العمدة يكشف نفسه: #${reveal.physicalId} '
                            '${reveal.name}',
                            style: ar(14,
                                color: _gold, weight: FontWeight.w900)),
                        const SizedBox(height: 2),
                        Text(
                            '${reveal.decisionLine} • صوته يُحسب '
                            '⚖️×${reveal.voteWeight}',
                            style: ar(11, color: const Color(0xFF9A8F7D))),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════
// §4.7.3 الشارة الدائمة أثناء التصويت
// ══════════════════════════════════════════════════════
class _MayorBadge extends StatelessWidget {
  const _MayorBadge({
    required this.revealedId,
    required this.weight,
    required this.isMe,
  });
  final int revealedId, weight;
  final bool isMe;

  @override
  Widget build(BuildContext context) => Positioned(
        top: 12,
        left: 0,
        right: 0,
        child: SafeArea(
          child: Center(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                color: const Color(0xE6151007),
                border: Border.all(color: _gold.withValues(alpha: 0.6)),
              ),
              child: Text(
                  isMe
                      ? '⚖️ أنت العمدة — صوتك يُحسب ×$weight'
                      : '🎩 العمدة #$revealedId — صوته ×$weight',
                  style: ar(10, color: _gold)),
            ),
          ),
        ),
      );
}
