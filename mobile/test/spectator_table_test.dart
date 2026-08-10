import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/spectator_table.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🎬 طاولة الحلقة — §4.1–§4.11 و§12 في الملفّ ٢٧
// ══════════════════════════════════════════════════════
// الطاولة تعرض كلّ لاعبٍ على الشاشة، فكلّ حقلٍ تقرأه هو تسريبٌ محتمل.
// هذه المجموعة تحرس الحدّ: خمسة مصادر للكشف لا سادس لها.

const _seats = [
  SpectatorSeat(physicalId: 1, name: 'أحمد'),
  SpectatorSeat(physicalId: 2, name: 'خالد'),
  SpectatorSeat(physicalId: 3, name: 'سالم', isFemale: true),
  SpectatorSeat(physicalId: 4, name: 'ليان'),
];

Widget _wrap(Widget child, {Size size = const Size(420, 1400)}) => MediaQuery(
      data: MediaQueryData(size: size),
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      ),
    );

PhoneSpectatorView _table({
  String? phase = 'DAY_DISCUSSION',
  List<SpectatorSeat> seats = _seats,
  Map<int, String> revealed = const {},
  Set<int> silenced = const {},
  DiscussionState? discussion,
  GameOverReveal? winner,
  bool hostView = false,
  bool revealRoles = false,
  bool collapsed = false,
  int? maxPlayers,
  int? citizens,
  int? mafia,
  MorningBanner? banner,
  GameTimerSnapshot? timer,
  int? justPid,
  int? justRemaining,
}) =>
    PhoneSpectatorView(
      seats: seats,
      phase: phase,
      myPhysicalId: 2,
      maxPlayers: maxPlayers,
      discussion: discussion,
      justificationPid: justPid,
      justificationRemaining: justRemaining,
      gameTimer: timer,
      silencedPids: silenced,
      revealedRoles: revealed,
      teamCitizens: citizens,
      teamMafia: mafia,
      banner: banner,
      winnerReveal: winner,
      hostView: hostView,
      revealRoles: revealRoles,
      collapsed: collapsed,
    );

void main() {
  group('🔒 ثوابت منع التسريب (§4.7)', () {
    testWidgets('🔴 لاعبٌ حيٌّ لا يُرسَم دورُه — ولو حمله المقعد', (t) async {
      // `SpectatorSeat.role` قد يُملأ من روستر مضيفٍ أو من خطأٍ خلفيّ.
      // الحارس ليس «لا تملأه» بل «لا ترسمه ما دام حيّاً».
      await t.pumpWidget(_wrap(_table(seats: const [
        SpectatorSeat(
            physicalId: 1, name: 'أحمد', role: 'GODFATHER', isAlive: true),
      ])));
      expect(find.text('أحمد'), findsOneWidget);
      expect(find.textContaining('شيخ المافيا'), findsNothing);
      expect(find.textContaining('GODFATHER'), findsNothing);
    });

    testWidgets('والميت في الروستر يُكشَف — المصدر (ج)', (t) async {
      await t.pumpWidget(_wrap(_table(seats: const [
        SpectatorSeat(
            physicalId: 1, name: 'أحمد', role: 'DOCTOR', isAlive: false),
      ])));
      // القلب يستغرق ٧٠٠ms والوجه الخلفيّ لا يظهر قبل منتصفه
      await t.pump(const Duration(milliseconds: 800));
      expect(find.textContaining('الطبيب'), findsOneWidget);
      await t.pumpAndSettle();
    });

    testWidgets('و`revealedRoles` تكشف — المصدر (أ)', (t) async {
      await t.pumpWidget(_wrap(_table(
        seats: const [
          SpectatorSeat(physicalId: 1, name: 'أحمد', isAlive: false),
        ],
        revealed: const {1: 'SHERIFF'},
      )));
      await t.pump(const Duration(milliseconds: 800));
      expect(find.textContaining('الشريف'), findsOneWidget);
      await t.pumpAndSettle();
    });

    testWidgets('🔒 ووضع المضيف وحده يكشف الأحياء — المصدر (هـ)', (t) async {
      const roster = [
        SpectatorSeat(physicalId: 1, name: 'أحمد', role: 'WITCH'),
      ];
      // بلا `revealRoles` لا شيء ولو كان hostView
      await t.pumpWidget(_wrap(_table(seats: roster, hostView: true)));
      expect(find.textContaining('الساحرة'), findsNothing);

      await t.pumpWidget(_wrap(
          _table(seats: roster, hostView: true, revealRoles: true)));
      expect(find.textContaining('الساحرة'), findsOneWidget);
    });

    test('🔴 قائمة NON_DEATH تحوي الأنواع الثلاثة عشر كاملةً', () {
      // نقصانُ نوعٍ منها يعني بانر صباحٍ يكشف من أُسكِت أو من حقّق الشريف
      for (final t in const [
        'SILENCED', 'SILENCE', 'SHERIFF_RESULT', 'INVESTIGATION',
        'ABILITY_DISABLED', 'DISABLE_ABILITY', 'TRANSFORM', 'TWIN_TRANSFORM',
        'ASSASSINATION_ATTEMPT', 'ELIMINATE_ALL', 'SINGLE_WINNER', 'TIE',
        'ELIMINATION',
      ]) {
        expect(kNonDeathMorningTypes.contains(t), isTrue, reason: t);
      }
      expect(kNonDeathMorningTypes.length, 13);
    });

    test('🔒 `SpectatorSeat.fromRoster` لا يملأ الدور أصلاً', () {
      final s = SpectatorSeat.fromRoster(
          const RosterPlayer(physicalId: 4, name: 'ليان'));
      expect(s.role, isNull);
    });
  });

  group('§4.1 شريط الرأس', () {
    testWidgets('تسمية الطور من الخريطة', (t) async {
      await t.pumpWidget(_wrap(_table(phase: 'NIGHT')));
      expect(find.text('الليل'), findsOneWidget);
    });

    testWidgets('🔴 الطوران المكافئان كلاهما «كشف الإقصاء»', (t) async {
      for (final p in const ['DAY_ELIMINATION', 'ELIMINATION_PENDING']) {
        await t.pumpWidget(_wrap(_table(phase: p)));
        expect(find.text('كشف الإقصاء'), findsOneWidget, reason: p);
      }
    });

    testWidgets('وطورٌ مجهول يُعرض خاماً لا فارغاً', (t) async {
      await t.pumpWidget(_wrap(_table(phase: 'BRAND_NEW_PHASE')));
      expect(find.text('BRAND_NEW_PHASE'), findsOneWidget);
    });

    testWidgets('العدّ والأحياء وساعة الجيم', (t) async {
      await t.pumpWidget(_wrap(_table(
        citizens: 5,
        mafia: 2,
        timer: GameTimerSnapshot(
          totalSeconds: 125,
          startedAtMs: DateTime.now().millisecondsSinceEpoch,
        ),
      )));
      expect(find.text('🛡️ 5'), findsOneWidget);
      expect(find.text('🔪 2'), findsOneWidget);
      expect(find.text('أحياء 4'), findsOneWidget);
      expect(find.text('⏱ 2:05'), findsOneWidget);
    });

    testWidgets('واللوبي يعرض عدّاد المقاعد لا العدّ', (t) async {
      await t.pumpWidget(_wrap(_table(phase: 'LOBBY', maxPlayers: 12)));
      // العدّاد `Text.rich` بجزأين — نصّه الكامل «4/12»، ويُفحص بـ
      // `findRichText` لأنّ `Text.rich` لا يحمل `data`.
      expect(find.text('4/12', findRichText: true), findsOneWidget);
      expect(find.text('مقاعد '), findsOneWidget);
      expect(find.textContaining('أحياء'), findsNothing);
    });
  });

  group('§4.2 شريط المتحدّث', () {
    testWidgets('المتحدّث النشط باسمه وثوانيه', (t) async {
      await t.pumpWidget(_wrap(_table(
        discussion: const DiscussionState(
            currentSpeakerId: 3, status: 'SPEAKING', timeRemaining: 25),
      )));
      expect(find.textContaining('🎙️ يتحدّث الآن:'), findsOneWidget);
      expect(find.textContaining('#3 سالم'), findsOneWidget);
    });

    testWidgets('🔴 وفي الدفاع «يُدافع» لا «يتحدّث»', (t) async {
      await t.pumpWidget(_wrap(_table(
        phase: 'DAY_JUSTIFICATION',
        justPid: 1,
        justRemaining: 12,
      )));
      expect(find.textContaining('🎙️ يُدافع الآن:'), findsOneWidget);
    });

    testWidgets('والمُسكَت يُعلن بلا كشف دوره', (t) async {
      await t.pumpWidget(_wrap(_table(
        silenced: const {3},
        discussion: const DiscussionState(
            currentSpeakerId: 3, status: 'SPEAKING', timeRemaining: 20),
      )));
      expect(find.textContaining('مُسكَت، لا يمكنه الكلام'), findsOneWidget);
    });

    testWidgets('وبين الأدوار نصٌّ ثابت — لا شريطٌ فارغ يقفز', (t) async {
      await t.pumpWidget(_wrap(_table()));
      expect(find.text('— بانتظار المتحدّث التالي —'), findsOneWidget);
    });

    testWidgets('واللوبي رسالته الخاصّة', (t) async {
      await t.pumpWidget(_wrap(_table(phase: 'LOBBY')));
      expect(find.text('الطاولة تكتمل — بانتظار المضيف لبدء الجولة'),
          findsOneWidget);
      await t.pumpWidget(_wrap(_table(phase: 'ROLE_BINDING')));
      expect(find.text('جارٍ توزيع الأدوار… بطاقتك ستصلك خلال لحظات'),
          findsOneWidget);
    });
  });

  group('§4.11 التحكّم والطيّ', () {
    testWidgets('زرّ الوضع يبدّل النصّ والتلميح معاً', (t) async {
      await t.pumpWidget(_wrap(_table()));
      expect(find.text('◱ تصغير — عرض الحلقة كاملة'), findsOneWidget);
      expect(find.text('اسحب لتدوير الحلقة · اضغط كارداً جانبياً للانتقال'),
          findsOneWidget);

      await t.tap(find.text('◱ تصغير — عرض الحلقة كاملة'));
      await t.pumpAndSettle();

      expect(find.text('⊡ تكبير كاردي'), findsOneWidget);
      expect(find.text('اضغط أي مقعد لتكبيره فوراً'), findsOneWidget);
    });

    testWidgets('🔴 الطيّ يخفي الجسم ويُبقي الرأس — بلا تفكيك', (t) async {
      await t.pumpWidget(_wrap(_table(phase: 'DAY_VOTING', collapsed: true)));
      await t.pumpAndSettle();
      // الرأس باقٍ
      expect(find.text('التصويت'), findsOneWidget);
      // والجسم مطويّ
      expect(find.text('◱ تصغير — عرض الحلقة كاملة'), findsNothing);
      // لكنّ المكوّن نفسه ما زال في الشجرة (الحالة محفوظة)
      expect(find.byType(PhoneSpectatorView), findsOneWidget);
    });

    testWidgets('حالة الفراغ تعرض «جاري تحميل الطاولة…»', (t) async {
      await t.pumpWidget(_wrap(_table(seats: const [])));
      expect(find.text('جاري تحميل الطاولة…'), findsOneWidget);
    });
  });

  group('§4.10 نهاية الجيم على الطاولة', () {
    const over = GameOverReveal(
      winner: WinnerType.mafia,
      players: [
        GameOverPlayer(physicalId: 1, name: 'أحمد', role: 'GODFATHER'),
        GameOverPlayer(physicalId: 2, name: 'خالد', role: 'CITIZEN'),
      ],
    );

    testWidgets('🔴 اللافتة تتأخّر ٥٥٠ms — دورانٌ عامّ→سرّيّ لا ولادةٌ مقلوبة',
        (t) async {
      await t.pumpWidget(_wrap(_table(phase: 'GAME_OVER', winner: over)));
      await t.pump(const Duration(milliseconds: 100));
      // اللافتة ما زالت شفّافة
      final before = t.widget<AnimatedOpacity>(find.ancestor(
        of: find.text('انتصار المافيا'),
        matching: find.byType(AnimatedOpacity),
      ));
      expect(before.opacity, 0);

      await t.pump(const Duration(milliseconds: 600));
      final after = t.widget<AnimatedOpacity>(find.ancestor(
        of: find.text('انتصار المافيا'),
        matching: find.byType(AnimatedOpacity),
      ));
      expect(after.opacity, 1);
      await t.pumpAndSettle();
    });

    testWidgets('كلّ فائزٍ بعنوانه الحرفيّ', (t) async {
      const map = {
        WinnerType.mafia: 'انتصار المافيا',
        WinnerType.assassin: 'انتصار السفّاح',
        WinnerType.jester: 'فوز المهرج',
        WinnerType.citizen: 'تطهير المدينة',
      };
      for (final e in map.entries) {
        await t.pumpWidget(_wrap(_table(
          phase: 'GAME_OVER',
          winner: GameOverReveal(winner: e.key, players: over.players),
        )));
        await t.pump(const Duration(milliseconds: 600));
        expect(find.text(e.value), findsOneWidget, reason: '${e.key}');
        await t.pumpAndSettle();
      }
    });

    testWidgets('🔴 ورمز المقعد يحمل اسم **الدور** لا اسم اللاعب', (t) async {
      await t.pumpWidget(_wrap(_table(phase: 'GAME_OVER', winner: over)));
      await t.pump(const Duration(milliseconds: 600));
      expect(find.text('شيخ المافيا'), findsWidgets);
      await t.pumpAndSettle();
    });
  });

  group('§4.9 بانر الصباح', () {
    testWidgets('الحماية الناجحة زرقاء بعنوانها', (t) async {
      await t.pumpWidget(_wrap(
          _table(banner: const MorningBanner(saved: true, name: 'خالد'))));
      expect(find.text('🛡️ فشل الاغتيال'), findsOneWidget);
      expect(find.text('نجت الحماية · خالد'), findsOneWidget);
      await t.pumpAndSettle(const Duration(seconds: 5));
    });

    testWidgets('والفاشلة تحذيرية', (t) async {
      await t.pumpWidget(_wrap(_table(banner: const MorningBanner(saved: false))));
      expect(find.text('⚠️ لم تنفع الحماية'), findsOneWidget);
      await t.pumpAndSettle(const Duration(seconds: 5));
    });

    testWidgets('🔴 وتُطوى تلقائياً بعد ٤٫٥ ثانية', (t) async {
      var dismissed = false;
      await t.pumpWidget(_wrap(PhoneSpectatorView(
        seats: _seats,
        phase: 'MORNING_RECAP',
        banner: const MorningBanner(saved: true),
        onBannerDismissed: () => dismissed = true,
      )));
      await t.pump(const Duration(milliseconds: 4000));
      expect(dismissed, isFalse);
      await t.pump(const Duration(milliseconds: 600));
      expect(dismissed, isTrue);
      await t.pumpAndSettle();
    });
  });

  group('§6.4 تحليل عدّاد الفريقين المتسامح', () {
    test('كلّ مفاتيح المدنيّين الأربعة', () {
      for (final k in const ['citizenAlive', 'citizens', 'citizen', 'town']) {
        expect(parseTeamCounts({k: 6}).citizens, 6, reason: k);
      }
    });

    test('وكلّ مفاتيح المافيا الثلاثة', () {
      for (final k in const ['mafiaAlive', 'mafia', 'mafiaCount']) {
        expect(parseTeamCounts({k: 3}).mafia, 3, reason: k);
      }
    });

    test('🔴 والغياب لا يُصفّر — يبقى `null` فلا يُمحى عدٌّ سابق', () {
      final r = parseTeamCounts(const {'mafiaAlive': 2});
      expect(r.citizens, isNull);
      expect(r.mafia, 2);
      expect(parseTeamCounts(null).mafia, isNull);
      expect(parseTeamCounts('نصّ').citizens, isNull);
    });
  });

  group('⏱️ ساعة الجيم', () {
    test('المتبقّي يُشتقّ من البداية لا يُنقص محلّياً', () {
      final now = DateTime.now();
      final t = GameTimerSnapshot(
        totalSeconds: 300,
        startedAtMs: now.millisecondsSinceEpoch - 60000,
      );
      expect(t.remaining(now: now), 240);
    });

    test('ولا ينزل تحت الصفر ولا يتجاهل `expired`', () {
      final now = DateTime.now();
      expect(
          GameTimerSnapshot(
                  totalSeconds: 10,
                  startedAtMs: now.millisecondsSinceEpoch - 60000)
              .remaining(now: now),
          0);
      expect(
          GameTimerSnapshot(
                  totalSeconds: 300,
                  startedAtMs: now.millisecondsSinceEpoch,
                  expired: true)
              .remaining(now: now),
          0);
    });

    test('وحمولةٌ بلا مدّةٍ لا تُنشئ ساعة', () {
      expect(GameTimerSnapshot.fromJson(const {'totalSeconds': 0}), isNull);
      expect(GameTimerSnapshot.fromJson(null), isNull);
    });
  });
}
