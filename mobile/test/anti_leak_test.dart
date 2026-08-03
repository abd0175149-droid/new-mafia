import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/features/game/voting_view.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🔒 ثوابت منع تسريب الأدوار — §4.7 في الملفّ ٢٧
// ══════════════════════════════════════════════════════
// «فشلها = تسريب أدوار = كسر اللعبة». هذه المجموعة تحرسها صراحةً بدل
// الاعتماد على أنّ أحداً لن يضيف حقلاً يوماً ما.

final c = GameSessionController.instance;

const _roster = [
  RosterPlayer(physicalId: 1, name: 'أحمد'),
  RosterPlayer(physicalId: 3, name: 'عبدالله'),
  RosterPlayer(physicalId: 7, name: 'خالد'),
];

Widget _wrap(Widget child) => MediaQuery(
      data: const MediaQueryData(size: Size(500, 1000)),
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      ),
    );

void main() {
  setUp(() {
    c.resetForTest();
    c.primeForTest(roomId: '99', physicalId: 3, roster: _roster);
  });
  tearDownAll(c.resetForTest);

  group('① الروستر لا يحمل أدواراً — أماناً بالبناء', () {
    test('🔒 `RosterPlayer` بلا حقل دور أصلاً', () {
      // لا يكفي أن يصل الروستر منقّى من الخادم: لو حمل حقلاً لأمكن
      // لأيّ شاشةٍ لاحقة أن ترسمه سهواً. الحقل غير موجود، فالتسريب
      // مستحيلٌ لا مُتجنَّب.
      const p = RosterPlayer(physicalId: 1, name: 'أحمد');
      expect(p.toString().contains('role'), isFalse);
      final j = RosterPlayer.fromJson(const {
        'physicalId': 1,
        'name': 'أحمد',
        'role': 'GODFATHER', // حتى لو أرسله الخادم خطأً
      });
      // يُقرأ الاسم والمقعد ويُهمَل الدور — لا مكان يخزّنه
      expect(j.physicalId, 1);
      expect(j.name, 'أحمد');
    });
  });

  group('② الكشف من مصادره المسموحة وحدها', () {
    testWidgets('🔒 قبل أمر الليدر لا يظهر دورٌ في شاشة الإقصاء', (t) async {
      await t.pumpWidget(_wrap(const EliminationBody(
        eliminated: [7],
        names: {7: 'خالد'},
        myPhysicalId: 3,
        // لا `revealedRoles` — الليدر لم يكشف بعد
      )));
      expect(find.text('خالد'), findsOneWidget);
      expect(find.textContaining('الطبيب'), findsNothing);
      expect(find.textContaining('DOCTOR'), findsNothing);
    });

    testWidgets('وبعد أمره يظهر — من `day:elimination-revealed` وحده',
        (t) async {
      await t.pumpWidget(_wrap(const EliminationBody(
        eliminated: [7],
        names: {7: 'خالد'},
        revealedRoles: {7: 'الطبيب'},
        myPhysicalId: 3,
      )));
      expect(find.text('الطبيب'), findsOneWidget);
    });

    testWidgets('🔒 بطاقات الاقتراع لا تحمل دوراً — ولو حملته الحمولة',
        (t) async {
      c.primeForTest(voting: const VotingState(
        candidates: [VoteCandidate(targetPhysicalId: 7, name: 'خالد')],
        playersInfo: _roster,
      ));
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('خالد'), findsOneWidget);
      expect(find.textContaining('الطبيب'), findsNothing);
      expect(find.textContaining('مافيا'), findsNothing);
    });
  });

  group('⑥ جيمٌ جديد يمسح كلّ كشفٍ سابق', () {
    test('🔴 كشوف الإقصاء لا تنجو إلى الجيم التالي', () {
      // بقاؤها تعرض أدوار جيمٍ مضى على لاعبين يحملون أدواراً أخرى الآن
      // — تسريبٌ وتضليلٌ معاً.
      c.primeForTest(phase: GamePhase.dayVoting);
      c.applyEliminationForTest(
          eliminated: const [7], revealed: const {7: 'الطبيب'});
      expect(c.revealedRoles, isNotEmpty);
      expect(c.eliminated, isNotEmpty);

      // ليلٌ ⇒ تثبيت أدوارٍ جديد = جولة جديدة
      c.setPhaseForTest(GamePhase.night);
      c.setPhaseForTest(GamePhase.roleBinding);

      expect(c.revealedRoles, isEmpty);
      expect(c.eliminated, isEmpty);
    });

    test('🔒 والفريق والدور والمفكرة معها', () {
      c.primeForTest(
        phase: GamePhase.night,
        role: 'SILENCER',
        team: const [MafiaMate(physicalId: 4, name: 'خالد', role: 'GODFATHER')],
      );
      expect(c.galleryTeam, isNotEmpty);

      c.setPhaseForTest(GamePhase.roleBinding);
      expect(c.galleryTeam, isEmpty);
      expect(c.assignedRole, isNull);
      expect(c.notepad.hasAny, isFalse);
    });

    test('🔴 لكنّ الاستعادة لا تمسح — الإقلاع ليس جولةً جديدة', () {
      // الانحدار الذي أظهر الواجهة التمويهية لمافيويّ: `null → ROLE_BINDING`
      // يعني «عرفتُ المرحلة» لا «بدأت جولة».
      c.resetForTest();
      c.primeForTest(
        role: 'SILENCER',
        team: const [MafiaMate(physicalId: 4, name: 'خالد')],
      );
      c.setPhaseForTest(GamePhase.roleBinding);
      expect(c.galleryTeam, isNotEmpty);
      expect(c.assignedRole, 'SILENCER');
    });
  });

  group('🔒 المُقصى لا يؤثّر في الجولة', () {
    testWidgets('لا يصوّت — ويُخبَر بذلك', (t) async {
      c.primeForTest(
        dead: true,
        voting: const VotingState(
          candidates: [VoteCandidate(targetPhysicalId: 7, name: 'خالد')],
          playersInfo: _roster,
        ),
      );
      await t.pumpWidget(_wrap(VotingBallot(controller: c)));
      expect(find.text('مشاهدة فقط — أنت مُقصى'), findsOneWidget);
      expect(await c.castVote(0), isFalse);
      expect(c.myVote, isNull);
    });

    testWidgets('ولا يُبرم اتفاقيات ولا يسحب صوتاً', (t) async {
      c.primeForTest(
        dead: true,
        round: 3,
        justification: const JustificationData(votersForAccused: [3]),
        withdrawal: const WithdrawalState(active: true),
      );
      expect(c.dealBlockReason, isNotNull);
      expect(c.canShowWithdrawal, isFalse);
      expect(await c.withdrawVote(), isFalse);
    });

    test('ولا يفتح معرض المافيا — لكنّ الإنذار يُرسَل', () {
      c.primeForTest(roomId: '99', role: 'SILENCER', dead: true);
      expect(c.announceGalleryOpen(), isFalse);
    });

    test('ولا يصله تنبيه دورٍ في النقاش', () {
      c.primeForTest(dead: true);
      // الميت خارج الطابور أصلاً؛ والحارس يمنع التنبيه لو تسلّل
      expect(c.isMyTurnToSpeak, isFalse);
    });
  });
}
