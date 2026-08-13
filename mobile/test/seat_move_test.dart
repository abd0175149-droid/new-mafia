import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/socket/socket_service.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/models/game.dart';
import 'package:mafia_club/models/night.dart';
import 'package:mafia_club/models/notepad.dart';

// ══════════════════════════════════════════════════════
// 🧪 عقد المصالحة بعد نقل المقاعد — `room:seats-remapped`
// ══════════════════════════════════════════════════════
// الليدر ينقل لاعباً أو يبادل اثنين **في أيّ مرحلة**. الأدوار تسافر مع
// الأشخاص، ورقم المقعد وحده هو ما يتبدّل — فكلّ ذاكرةٍ مفهرسةٍ بالمقعد
// عند **كلّ** جهازٍ في الغرفة (لا المنقولَين وحدهما) صارت تشير إلى شخصٍ
// آخر.
//
// الترتيب المفروض: امسح ← رحّل ← اسأل الخادم ← أعد الاشتقاق. والتصحيح
// بالحساب ممنوع: جهازٌ يعيد ترقيم خرائطه بنفسه يُنتج نصف خريطةٍ صحيحة،
// وهي أسوأ من لا خريطة.

void main() {
  final c = GameSessionController.instance;
  late List<(String, dynamic)> sent;

  setUp(() {
    sent = [];
    SocketService.emitProbe = (e, d) => sent.add((e, d));
    c.resetForTest();
  });
  tearDown(() => SocketService.emitProbe = null);

  const nightReq = NightActionRequest(
    actionType: 'KILL',
    stepRole: 'MAFIA',
    timeoutSeconds: 15,
    canSkip: false,
    availableTargets: [NightTarget(physicalId: 7, name: 'خالد')],
  );

  /// اللاعب في المقعد ٩ الآن — `player:seat-changed` يسبق البثّ العامّ
  /// فيصل الرقم الجديد أوّلاً. الخريطة تبادلٌ بين ٥ و٩.
  void primeMoved() => c.primeForTest(
        roomId: '282',
        physicalId: 9,
        step: GameStep.done,
        phase: GamePhase.night,
      );

  group('① المسح — كلّ ما هو مفهرسٌ بالمقعد', () {
    testWidgets('🔴 الأدوار المكشوفة والمُقصون والمُسكتون وأحداث الصباح',
        (t) async {
      primeMoved();
      c.primeForTest(morning: const [
        MorningEvent(type: 'ASSASSINATION', targetPhysicalId: 9),
      ]);
      c.applyEliminationForTest(
          eliminated: const [3], revealed: const {3: 'MAFIA'});

      c.applySeatsRemapForTest(const {5: 9, 9: 5});

      expect(c.revealedRoles, isEmpty, reason: 'كشفُ دورٍ على مقعدٍ صار لغيره');
      expect(c.eliminated, isEmpty);
      expect(c.silencedPids, isEmpty);
      expect(c.myMorningEvents, isEmpty);

      await t.pump(const Duration(seconds: 6));
    });

    testWidgets('🔴 الاقتراع كلّه — المرشّحون والأصوات وصوتي أنا', (t) async {
      primeMoved();
      c.primeForTest(
        voting: const VotingState(
          candidates: [VoteCandidate(targetPhysicalId: 5, name: 'خالد')],
          playerVotes: {9: 0},
        ),
        myVote: 0,
      );

      c.applySeatsRemapForTest(const {5: 9, 9: 5});

      expect(c.voting, isNull);
      expect(c.myVote, isNull, reason: 'صوتٌ على فهرسٍ لمرشّحٍ تبدّل');
      expect(c.tiedCandidates, isEmpty);

      await t.pump(const Duration(seconds: 6));
    });

    testWidgets('🔴 نافذة الليل المفتوحة تُغلق ووسمُ الإنجاز يُصفَّر',
        (t) async {
      primeMoved();
      c.openNightForTest(nightReq);
      expect(c.nightAction, isNotNull);

      c.applySeatsRemapForTest(const {5: 9, 9: 5});

      // قائمة أهدافٍ بأرقامٍ قديمة تعني اغتيال البريء بدل المقصود
      expect(c.nightAction, isNull);
      expect(c.nightSubmitted, isFalse);

      await t.pump(const Duration(seconds: 6));
    });

    testWidgets('🎩 شارة العمدة المكشوف تسقط — لا تُنقل بالحساب', (t) async {
      primeMoved();
      c.primeForTest(mayorRevealedId: 5);

      c.applySeatsRemapForTest(const {5: 9, 9: 5});

      expect(c.mayorRevealedId, isNull);
      expect(c.mayorPrompt, isNull);

      await t.pump(const Duration(seconds: 6));
    });
  });

  group('② الترحيل — المفكرة وحدها', () {
    testWidgets('🔴 مفاتيح الملاحظات تُعاد كتابتها عبر خريطة الخادم',
        (t) async {
      primeMoved();
      c.primeForTest(
        notepad: const Notepad(notes: {
          Notepad.generalKey: PlayerNote(text: 'الجولة هادئة'),
          5: PlayerNote(text: 'متوتر', suspicion: Suspicion.mafia),
          7: PlayerNote(suspicion: Suspicion.safe),
        }),
      );

      c.applySeatsRemapForTest(const {5: 9, 9: 5});

      // من كان في ٥ صار في ٩ — والملاحظة تتبع الشخص لا الرقم
      expect(c.notepad.noteOf(9).text, 'متوتر');
      expect(c.notepad.noteOf(5).isEmpty, isTrue);
      // من ليس في الخريطة يبقى على رقمه، والعامّة لا مقعد لها
      expect(c.notepad.noteOf(7).suspicion, Suspicion.safe);
      expect(c.notepad.general.text, 'الجولة هادئة');

      await t.pump(const Duration(seconds: 6));
    });

    testWidgets('والمفكرة لا تُمسح — الخادم لا يملك نسخةً منها', (t) async {
      primeMoved();
      c.primeForTest(
        notepad: const Notepad(notes: {4: PlayerNote(text: 'كذب')}),
      );

      c.applySeatsRemapForTest(const {5: 9, 9: 5});

      expect(c.notepad.hasAny, isTrue);

      await t.pump(const Duration(seconds: 6));
    });
  });

  group('③ السؤال — الخادم هو المرجع', () {
    testWidgets('🔴 استطلاعٌ فوريّ لا انتظارَ دورةٍ كاملة', (t) async {
      primeMoved();

      c.applySeatsRemapForTest(const {5: 9, 9: 5});

      // ثلاث ثوانٍ من شاشةٍ خرساء بعد النقل غير مقبولة
      expect(sent.where((e) => e.$1 == 'room:get-my-state'), isNotEmpty);

      await t.pump(const Duration(seconds: 6));
    });
  });

  group('④ الإشعار', () {
    testWidgets('من لم يتحرّك يصله سطرٌ محايدٌ بلا أرقام', (t) async {
      primeMoved();

      c.applySeatsRemapForTest(const {5: 9, 9: 5});
      expect(c.seatChangeAlert, 'أُعيد ترتيب المقاعد');

      // ويختفي بعد خمس ثوانٍ
      await t.pump(const Duration(seconds: 6));
      expect(c.seatChangeAlert, isNull);
    });

    testWidgets('🔴 ولا يدهس إشعار من نُقل — رسالته أدقّ وتصل قبله',
        (t) async {
      c.primeForTest(
          roomId: '282', physicalId: 5, step: GameStep.done, phase: GamePhase.night);
      // `player:seat-changed` أوّلاً: يضبط الرقم ويرفع إشعاره الخاصّ
      c.applySeatChangedForTest(9);
      expect(c.seatChangeAlert, 'تغيّر مقعدك إلى رقم 9');

      c.applySeatsRemapForTest(const {5: 9, 9: 5});
      expect(c.seatChangeAlert, 'تغيّر مقعدك إلى رقم 9');

      await t.pump(const Duration(seconds: 6));
    });
  });
}
