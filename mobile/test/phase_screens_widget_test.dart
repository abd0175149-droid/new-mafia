import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/discussion_view.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/features/game/justification_view.dart';
import 'package:mafia_club/features/game/mayor_layers.dart';
import 'package:mafia_club/features/game/morning_gameover_view.dart';
import 'package:mafia_club/features/game/voting_view.dart';
import 'package:mafia_club/models/game.dart';
import 'package:mafia_club/models/notepad.dart';

// ══════════════════════════════════════════════════════
// 🧪 رسمُ شاشات المراحل — الملفّات ٢٤ · ٢٥ · ٢٧
// ══════════════════════════════════════════════════════
// الجولة السابقة اختبرت المنطق ولم تختبر الرسم. هذه تُثبت أنّ ما يراه
// اللاعب على الشاشة هو ما تقوله القواعد — لا ما يُفترض أنّها تقوله.

final c = GameSessionController.instance;

const _roster = [
  RosterPlayer(physicalId: 1, name: 'أحمد'),
  RosterPlayer(physicalId: 3, name: 'عبدالله'),
  RosterPlayer(physicalId: 5, name: 'سامي'),
  RosterPlayer(physicalId: 7, name: 'خالد'),
];

Widget _wrap(Widget child, {Size size = const Size(500, 1000)}) => MediaQuery(
      data: MediaQueryData(size: size),
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            backgroundColor: const Color(0xFF050505),
            body: SingleChildScrollView(child: child),
          ),
        ),
      ),
    );

/// ⚠️ `MayorLayer` طبقةٌ ملء الشاشة: أطفالها `Positioned` فتحتاج قيوداً
///    محدودة. شاشةُ اللعب تلفّها في `Positioned.fill` داخل `Stack`، فهذا
///    الغلاف يحاكي ذلك — لا مُمرِّراً غير محدود.
Widget _wrapFull(Widget child, {Size size = const Size(500, 1000)}) =>
    MediaQuery(
      data: MediaQueryData(size: size),
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            backgroundColor: const Color(0xFF050505),
            body: Stack(children: [Positioned.fill(child: child)]),
          ),
        ),
      ),
    );

void main() {
  setUp(() {
    c.resetForTest();
    c.primeForTest(roomId: '99', physicalId: 3, name: 'عبدالله', roster: _roster);
  });
  tearDownAll(c.resetForTest);

  // ══════════════════════════════════════════════════════
  group('🎤 النقاش', () {
    DiscussionState ds({
      required int? speaker,
      String status = 'SPEAKING',
      int remaining = 40,
      List<int> queue = const [5, 7],
      List<int> spoken = const [1],
    }) =>
        DiscussionState(
          currentSpeakerId: speaker,
          timeLimitSeconds: 60,
          timeRemaining: remaining,
          status: status,
          speakingQueue: queue,
          hasSpoken: spoken,
        );

    testWidgets('بلا متحدّثٍ تُعرض حالة الانتظار لا شاشةٌ فارغة', (t) async {
      c.primeForTest(discussion: ds(speaker: null));
      await t.pumpWidget(_wrap(DiscussionBody(controller: c)));
      expect(find.text('بانتظار بدء النقاش...'), findsOneWidget);
      expect(find.text('دورك في النقاش!'), findsNothing);
    });

    testWidgets('🔴 دوري ⇒ البانر يظهر بنصّه', (t) async {
      c.primeForTest(discussion: ds(speaker: 3));
      await t.pumpWidget(_wrap(DiscussionBody(controller: c)));
      expect(find.text('دورك في النقاش!'), findsOneWidget);
      expect(find.text('تحدّث الآن أمام الجميع'), findsOneWidget);
      expect(find.text('يتحدث الآن'), findsOneWidget);
    });

    testWidgets('🔒 دورُ غيري ⇒ لا بانر — واسمه هو الظاهر', (t) async {
      c.primeForTest(discussion: ds(speaker: 7));
      await t.pumpWidget(_wrap(DiscussionBody(controller: c)));
      expect(find.text('دورك في النقاش!'), findsNothing);
      expect(find.text('خالد'), findsWidgets);
    });

    testWidgets('انتهاء وقتي يقلب البانر إلى تحذير', (t) async {
      c.primeForTest(discussion: ds(speaker: 3, remaining: 0));
      await t.pumpWidget(_wrap(DiscussionBody(controller: c)));
      expect(find.text('انتهى وقتك!'), findsOneWidget);
      expect(find.text('يُرجى التوقف عن الكلام'), findsOneWidget);
      expect(find.text('انتهى الوقت'), findsOneWidget);
    });

    testWidgets('العدّاد يظهر أثناء الكلام ويختفي عند الانتظار', (t) async {
      c.primeForTest(discussion: ds(speaker: 3, remaining: 40));
      await t.pumpWidget(_wrap(DiscussionBody(controller: c)));
      expect(find.text('40'), findsOneWidget);

      c.primeForTest(discussion: ds(speaker: 3, status: 'WAITING'));
      await t.pumpWidget(_wrap(DiscussionBody(controller: c)));
      expect(find.text('بالانتظار'), findsOneWidget);
      expect(find.text('40'), findsNothing);
    });

    testWidgets('قائمة الترتيب: من تكلّم يُشطب ويُعلَّم', (t) async {
      c.primeForTest(discussion: ds(speaker: 3));
      await t.pumpWidget(_wrap(DiscussionBody(controller: c)));
      expect(find.text('ترتيب النقاش'), findsOneWidget);
      expect(find.text('✓'), findsOneWidget); // أحمد تكلّم
      expect(find.text('عبدالله (أنت)'), findsOneWidget);
      expect(find.text('سامي'), findsOneWidget);
    });
  });

  // ══════════════════════════════════════════════════════
  group('⚖️ التبرير وسحب الصوت', () {
    JustificationData jd({List<int> voters = const [3, 5], bool done = false}) =>
        JustificationData(
          accused: const [AccusedPlayer(targetPhysicalId: 7, name: 'خالد')],
          topVotes: 4,
          votersForAccused: voters,
          timerFinished: done,
        );

    testWidgets('بلا متّهمٍ تُعرض حالة الانتظار', (t) async {
      await t.pumpWidget(_wrap(JustificationBody(controller: c)));
      expect(find.text('بانتظار بدء التبرير...'), findsOneWidget);
    });

    testWidgets('بطاقة المتّهم بأصواته', (t) async {
      c.primeForTest(justification: jd(), justTimer: 22);
      await t.pumpWidget(_wrap(JustificationBody(controller: c)));
      expect(find.text('خالد'), findsOneWidget);
      expect(find.text('4 صوت ضده'), findsOneWidget);
      expect(find.text('22s'), findsOneWidget);
    });

    testWidgets('🔒 من لم يصوّت لا يرى بطاقة السحب', (t) async {
      c.primeForTest(
          justification: jd(voters: const [1, 5]),
          withdrawal: const WithdrawalState(active: true));
      await t.pumpWidget(_wrap(JustificationBody(controller: c)));
      expect(find.text('🗳️ سحب صوتي'), findsNothing);
    });

    testWidgets('🔴 من صوّت يراها مع النِّصاب', (t) async {
      c.primeForTest(
          justification: jd(),
          withdrawal: const WithdrawalState(active: true, count: 1, needed: 2));
      await t.pumpWidget(_wrap(JustificationBody(controller: c)));
      expect(find.text('أنت صوّت على هذا اللاعب'), findsOneWidget);
      expect(find.text('1/2 سحبوا أصواتهم'), findsOneWidget);
      expect(find.text('🗳️ سحب صوتي'), findsOneWidget);
    });

    testWidgets('انتهاء وقت الدفاع يفتحها ولو لم تُفتح نافذةٌ صراحةً',
        (t) async {
      c.primeForTest(justification: jd(done: true));
      await t.pumpWidget(_wrap(JustificationBody(controller: c)));
      expect(find.text('🗳️ سحب صوتي'), findsOneWidget);
    });

    testWidgets('من سحب يرى تأكيداً لا زرّاً — فلا يسحب مرّتين', (t) async {
      c.primeForTest(
          justification: jd(),
          withdrawal: const WithdrawalState(
              active: true, count: 1, needed: 2, withdrawn: [3]));
      await t.pumpWidget(_wrap(JustificationBody(controller: c)));
      expect(find.text('✓ تم سحب صوتك'), findsOneWidget);
      expect(find.text('🗳️ سحب صوتي'), findsNothing);
    });

    testWidgets('المُقصى لا يسحب', (t) async {
      c.primeForTest(
          dead: true,
          justification: jd(),
          withdrawal: const WithdrawalState(active: true));
      await t.pumpWidget(_wrap(JustificationBody(controller: c)));
      expect(find.text('🗳️ سحب صوتي'), findsNothing);
    });
  });

  // ══════════════════════════════════════════════════════
  group('🎩 طبقات العمدة', () {
    const prompt = MayorPrompt(
      timeoutSeconds: 30,
      topVotes: 5,
      voteWeight: 2,
      targetPhysicalId: 7,
      targetName: 'خالد',
    );

    testWidgets('المودال يعرض الأزرار الثلاثة ونتيجة التصويت', (t) async {
      c.primeForTest(mayorPrompt: prompt);
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.text('أنت العمدة — لحظة القرار'), findsOneWidget);
      expect(find.textContaining('#7 خالد'), findsOneWidget);
      expect(
          find.text('🔄 أكشف نفسي — إلغاء الإعدام وتصويت جديد على الجميع'),
          findsOneWidget);
      expect(find.text('🌙 أكشف نفسي — تأجيل: لا موت اليوم'), findsOneWidget);
      expect(find.text('🤐 أبقى مخفيّاً — نفّذوا الإعدام'), findsOneWidget);
    });

    testWidgets('🔒 بلا نافذةٍ لا يظهر شيء — الطبقة صامتة', (t) async {
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.text('أنت العمدة — لحظة القرار'), findsNothing);
      expect(find.textContaining('العمدة يكشف نفسه'), findsNothing);
    });

    testWidgets('الصفقة تُعرض بطرفيها لا برقمٍ واحد', (t) async {
      c.primeForTest(
          mayorPrompt: const MayorPrompt(
              winnerType: 'DEAL',
              targetPhysicalId: 7,
              initiatorPhysicalId: 3,
              topVotes: 4));
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.textContaining('صفقة #3 ← #7'), findsOneWidget);
    });

    testWidgets('البانر يعرض القرار والوزن', (t) async {
      c.primeForTest(
          mayorBanner: const MayorReveal(
              physicalId: 5, name: 'سامي', decision: 'REVOTE', voteWeight: 2));
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.text('🎩 العمدة يكشف نفسه: #5 سامي'), findsOneWidget);
      expect(
          find.textContaining('أُلغي الإعدام — تصويت جديد على الجميع'),
          findsOneWidget);
    });

    testWidgets('الشارة أثناء التصويت — وتفترق بين العمدة وغيره', (t) async {
      c.primeForTest(phase: GamePhase.dayVoting, mayorRevealedId: 5);
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.text('🎩 العمدة #5 — صوته ×2'), findsOneWidget);

      c.primeForTest(phase: GamePhase.dayVoting, mayorRevealedId: 3);
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.text('⚖️ أنت العمدة — صوتك يُحسب ×2'), findsOneWidget);
    });

    testWidgets('🔴 البانر يُخفي الشارة — لا يتراكبان', (t) async {
      c.primeForTest(
          phase: GamePhase.dayVoting,
          mayorRevealedId: 5,
          mayorBanner: const MayorReveal(physicalId: 5, name: 'سامي'));
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.textContaining('العمدة يكشف نفسه'), findsOneWidget);
      expect(find.text('🎩 العمدة #5 — صوته ×2'), findsNothing);
    });

    testWidgets('الشارة لا تظهر خارج التصويت', (t) async {
      c.primeForTest(phase: GamePhase.night, mayorRevealedId: 5);
      await t.pumpWidget(_wrapFull(MayorLayer(controller: c)));
      expect(find.textContaining('العمدة #5'), findsNothing);
    });
  });

  // ══════════════════════════════════════════════════════
  group('☀️ ملخّص الصباح', () {
    testWidgets('بلا أحداثٍ يُعلَن الانتظار', (t) async {
      await t.pumpWidget(_wrap(MorningBody(controller: c)));
      expect(find.text('الصباح يطل'), findsOneWidget);
      expect(find.text('بانتظار كشف الأحداث...'), findsOneWidget);
    });

    testWidgets('🔴 الاغتيال يُظهر بطاقة الموت ونصّ الحدث', (t) async {
      c.primeForTest(morning: const [
        MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 3),
      ]);
      await t.pumpWidget(_wrap(MorningBody(controller: c)));
      expect(find.text('لقد اُغتلت!'), findsOneWidget);
      expect(find.text('تم إخراجك من اللعبة'), findsOneWidget);
      expect(find.text('تم اغتيالك!'), findsOneWidget);
    });

    testWidgets('🔒 حدثٌ استهدف غيري لا يظهر عندي', (t) async {
      c.primeForTest(morning: const [
        MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 7),
      ]);
      await t.pumpWidget(_wrap(MorningBody(controller: c)));
      expect(find.text('تم اغتيالك!'), findsNothing);
      expect(find.text('لقد اُغتلت!'), findsNothing);
      expect(find.text('بانتظار كشف الأحداث...'), findsOneWidget);
    });

    testWidgets('الحماية تُعرض بلا بطاقة موت', (t) async {
      c.primeForTest(morning: const [
        MorningEvent(type: 'ASSASSINATION_BLOCKED', targetPhysicalId: 3),
      ]);
      await t.pumpWidget(_wrap(MorningBody(controller: c)));
      expect(find.text('تم حمايتك من الاغتيال!'), findsOneWidget);
      expect(find.text('لقد اُغتلت!'), findsNothing);
    });

    testWidgets('نتيجة التحقيق تُعرض بلونها', (t) async {
      c.primeForTest(morning: const [
        MorningEvent(
            type: 'SHERIFF_RESULT',
            targetPhysicalId: 3,
            extra: {'result': 'MAFIA'}),
      ]);
      await t.pumpWidget(_wrap(MorningBody(controller: c)));
      expect(find.text('نتيجة التحقيق: 🔴 مافيا'), findsOneWidget);
    });
  });

  // ══════════════════════════════════════════════════════
  group('🏁 نهاية الجيم', () {
    Map<String, dynamic> over(String winner) => {
          'winner': winner,
          'players': [
            {'physicalId': 3, 'name': 'عبدالله', 'role': 'SILENCER', 'isAlive': true},
            {'physicalId': 7, 'name': 'خالد', 'role': 'DOCTOR', 'isAlive': false},
            {'physicalId': 5, 'name': 'سامي'},
          ],
        };

    testWidgets('بلا حمولةٍ لا يُرسم شيء', (t) async {
      await t.pumpWidget(_wrap(GameOverBody(controller: c)));
      expect(find.textContaining('انتصار'), findsNothing);
    });

    testWidgets('عناوين الفائزين حرفيّة — بعلامة التعجّب حيث توجد', (t) async {
      for (final (w, title, sub) in const [
        ('MAFIA', 'انتصار المافيا', 'سيطرة مطلقة'),
        ('ASSASSIN', 'انتصار السفاح!', 'تم إنجاز العقود بنجاح'),
        ('JESTER', 'فوز المهرج!', 'نجح المهرج في الانتحار'),
        ('CITIZEN', 'تطهير المدينة', 'العدالة انتصرت'),
      ]) {
        c.primeForTest(gameOver: over(w));
        await t.pumpWidget(_wrap(GameOverBody(controller: c)));
        expect(find.text(title), findsOneWidget, reason: w);
        expect(find.text(sub), findsOneWidget, reason: w);
      }
    });

    testWidgets('شبكة الأدوار تكشف الجميع — وتعلّم الميت', (t) async {
      c.primeForTest(gameOver: over('MAFIA'));
      await t.pumpWidget(_wrap(GameOverBody(controller: c)));
      expect(find.text('قص المافيا'), findsOneWidget);
      expect(find.text('الطبيب'), findsOneWidget);
      expect(find.text('💀'), findsOneWidget); // خالد وحده ميت
    });

    testWidgets('دورٌ مفقود يُعرض «?» لا فراغاً', (t) async {
      c.primeForTest(gameOver: over('CITIZEN'));
      await t.pumpWidget(_wrap(GameOverBody(controller: c)));
      expect(find.text('?'), findsOneWidget); // سامي بلا دور
    });
  });

  // ══════════════════════════════════════════════════════
  group('🗳️ بطاقة الاقتراع', () {
    VotingState vs({int total = 2}) => VotingState(
          candidates: const [
            VoteCandidate(targetPhysicalId: 7, name: 'خالد', votes: 2),
            VoteCandidate(targetPhysicalId: 3, name: 'عبدالله', votes: 0),
            VoteCandidate(
                targetPhysicalId: 5,
                name: 'سامي',
                votes: 0,
                type: 'DEAL',
                initiatorPhysicalId: 1),
          ],
          totalVotesCast: total,
          playerVotes: {1: 0, 5: 0},
          playersInfo: _roster,
        );

    testWidgets('بلا مرشّحين تُعرض حالة التحميل', (t) async {
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('جاري تحميل التصويت...'), findsOneWidget);
    });

    testWidgets('المرشّحون بمقاعدهم وأصواتهم ورقائق مصوّتيهم', (t) async {
      c.primeForTest(voting: vs());
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('مقعد #7'), findsOneWidget);
      expect(find.text('2'), findsWidgets);
      // رقائق من صوّت لخالد: #1 و#5
      expect(find.text('أحمد'), findsWidgets);
    });

    testWidgets('🤝 شارة الديل تذكر المبادر', (t) async {
      c.primeForTest(voting: vs());
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('🤝 ديل من:'), findsOneWidget);
      expect(find.text('#1'), findsWidgets);
    });

    testWidgets('🔒 بطاقتي تحمل شارة «أنت»', (t) async {
      c.primeForTest(voting: vs());
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('أنت'), findsOneWidget);
    });

    testWidgets('المُقصى يرى «مشاهدة فقط»', (t) async {
      c.primeForTest(voting: vs(), dead: true);
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('مشاهدة فقط — أنت مُقصى'), findsOneWidget);
    });

    testWidgets('من لم يصوّت يُدعى للتصويت', (t) async {
      c.primeForTest(voting: vs());
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('صوّت ضد اللاعب المشتبه'), findsOneWidget);
    });

    testWidgets('🔴 إيموجي الاشتباه يأتي من المفكرة المحلّية', (t) async {
      c.primeForTest(
        voting: vs(),
        notepad: const Notepad().withNote(
            7, const PlayerNote(suspicion: Suspicion.mafia)),
      );
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('🔴'), findsOneWidget);

      // بلا تصنيفٍ لا يُرسم شيء
      c.primeForTest(voting: vs(), notepad: const Notepad());
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('🔴'), findsNothing);
    });
  });
}
