import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/socket/socket_service.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/features/game/notepad_sheet.dart';
import 'package:mafia_club/features/game/vote_history_view.dart';
import 'package:mafia_club/models/game.dart';
import 'package:mafia_club/models/match.dart';
import 'package:mafia_club/models/vote_history.dart';

// ══════════════════════════════════════════════════════
// 🧪 سجلّ التصويت — النموذج كما يرسله الخادم، والتبويب، والعرضان
// ══════════════════════════════════════════════════════

final c = GameSessionController.instance;

const _roster = [
  RosterPlayer(physicalId: 1, name: 'أحمد'),
  RosterPlayer(physicalId: 3, name: 'عبدالله'),
  RosterPlayer(physicalId: 5, name: 'سامي'),
  RosterPlayer(physicalId: 7, name: 'خالد'),
];

/// شكل `backend/src/game/vote-history.ts` حرفيّاً: جولةٌ تعادلت فحُصرت،
/// ثمّ جولةُ الحصر وفيها صوتُ عمدةٍ ×٢، وصوتٌ بالوكالة، ووقتٌ انتهى، وساحب.
final _json = [
  {
    'id': 'r1-1', 'round': 1, 'seq': 1, 'kind': 'DAY', 'resolvedAt': 1,
    'shieldedPhysicalId': null, 'withdrawn': [],
    'candidates': [
      {'type': 'PLAYER', 'targetPhysicalId': 5, 'name': 'سامي', 'votes': 2, 'people': 2, 'unnamed': 0,
        'voters': [{'voterPhysicalId': 1, 'name': 'أحمد', 'weight': 1}, {'voterPhysicalId': 3, 'name': 'عبدالله', 'weight': 1}]},
      {'type': 'PLAYER', 'targetPhysicalId': 7, 'name': 'خالد', 'votes': 2, 'people': 2, 'unnamed': 1,
        'voters': [{'voterPhysicalId': 5, 'name': 'سامي', 'weight': 1}]},
    ],
    'outcome': {'type': 'TIE_NARROW'},
  },
  {
    'id': 'r1-2', 'round': 1, 'seq': 2, 'kind': 'TIE_NARROW', 'resolvedAt': 2,
    'shieldedPhysicalId': null, 'withdrawn': [5],
    'candidates': [
      {'type': 'PLAYER', 'targetPhysicalId': 5, 'name': 'سامي', 'votes': 3, 'people': 2, 'unnamed': 0,
        'voters': [{'voterPhysicalId': 1, 'name': 'أحمد', 'weight': 2}, {'voterPhysicalId': 3, 'name': 'عبدالله', 'weight': 1, 'via': 'proxy'}]},
      {'type': 'PLAYER', 'targetPhysicalId': 7, 'name': 'خالد', 'votes': 1, 'people': 1, 'unnamed': 0,
        'voters': [{'voterPhysicalId': 7, 'name': 'خالد', 'weight': 1, 'via': 'auto'}]},
    ],
    'outcome': {'type': 'ELIMINATED', 'eliminated': [5], 'names': ['سامي']},
  },
];

Widget _app(Widget child) => MediaQuery(
      data: const MediaQueryData(size: Size(400, 900)),
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      ),
    );

void main() {
  group('🧩 النموذج', () {
    test('يقرأ ما يرسله الخادم بلا فقد', () {
      final rs = VoteRound.listOf(_json);
      expect(rs, hasLength(2));
      expect(rs[1].label, 'اليوم 1 · حصر');
      expect(rs[0].label, 'اليوم 1');
      expect(rs[1].candidates.first.voters.first.weight, 2);
      expect(rs[1].candidates.last.voters.single.via, 'auto');
      expect(rs[1].withdrawn, [5]);
      expect(outcomeOf(rs[1]).$1, 'أُقصي #5 سامي');
      expect(outcomeOf(rs[0]).$1, 'تعادل ⟵ حصرٌ بين المتعادلين');
    });

    test('مدخلٌ تالف لا يكسر القائمة', () {
      expect(VoteRound.listOf(null), isEmpty);
      expect(VoteRound.listOf([1, 'x', null]), isEmpty);
      final r = VoteRound.fromJson({'id': 'r2-1', 'round': '2'});
      expect(r.round, 2);
      expect(r.candidates, isEmpty);
      expect(outcomeOf(r).$1, 'فُرزت — بانتظار النتيجة');
    });

    test('الديل يُعرض بطرفيه', () {
      final d = VoteRoundCandidate.fromJson({
        'type': 'DEAL', 'targetPhysicalId': 7, 'name': 'خالد',
        'initiatorPhysicalId': 1, 'initiatorName': 'أحمد', 'votes': 4, 'people': 4, 'voters': [],
      });
      expect(d.label, 'ديل: أحمد ⇄ خالد');
      expect(d.sub, '#1 ⇄ #7');
    });

    test('علم السجلّ في سجلّ المباريات', () {
      expect(MatchDetails.fromJson({'matchId': 9, 'hasVoteLog': true}).hasVoteLog, isTrue);
      expect(MatchDetails.fromJson({'matchId': 9}).hasVoteLog, isFalse);
    });
  });

  group('🗳️ العرض', () {
    testWidgets('يفتح على آخر جولة، حسب المرشّح', (t) async {
      await t.pumpWidget(_app(VoteHistoryView(rounds: VoteRound.listOf(_json), mySeat: 3)));
      expect(find.text('اليوم 1'), findsOneWidget);
      expect(find.text('اليوم 1 · حصر'), findsOneWidget);
      expect(find.text('أُقصي #5 سامي'), findsOneWidget);
      expect(find.text('حصرٌ بين المتعادلين'), findsOneWidget);
      // ٣ أصوات من شخصين (العمدة ×٢)
      expect(find.text('2 أشخاص'), findsOneWidget);
      expect(find.text('المشطوب سحب صوته أثناء التبرير.'), findsOneWidget);
    });

    testWidgets('الجولة السابقة تُفتح بالضغط', (t) async {
      await t.pumpWidget(_app(VoteHistoryView(rounds: VoteRound.listOf(_json))));
      await t.tap(find.text('اليوم 1'));
      await t.pump();
      expect(find.text('تعادل ⟵ حصرٌ بين المتعادلين'), findsOneWidget);
      expect(find.text('+1 بلا اسم'), findsOneWidget);
    });

    testWidgets('حسب اللاعب: يبدأ بي ويعرض صوتي في كلّ جولة', (t) async {
      await t.pumpWidget(_app(VoteHistoryView(rounds: VoteRound.listOf(_json), mySeat: 3)));
      await t.tap(find.text('حسب اللاعب'));
      await t.pump();
      expect(find.textContaining('سامي 🤝', findRichText: true), findsOneWidget);
      // اختيار خالد: صوّت عليه سامي في الأولى، وصوّت هو على نفسه بانتهاء الوقت
      await t.tap(find.text('7 خالد'));
      await t.pump();
      expect(find.text('صوّت عليه: سامي'), findsOneWidget);
      expect(find.textContaining('خالد ⏰', findRichText: true), findsOneWidget);
    });

    testWidgets('بلا جولات: رسالة فارغة لا خطأ', (t) async {
      await t.pumpWidget(_app(const VoteHistoryView(rounds: [])));
      expect(find.text('لا جولات تصويت بعد'), findsOneWidget);
    });
  });

  group('📝 تبويب المفكرة', () {
    final sent = <(String, dynamic)>[];
    setUp(() {
      c.resetForTest();
      c.primeForTest(roomId: '99', physicalId: 3, name: 'عبدالله', roster: _roster);
      sent.clear();
      SocketService.emitProbe = (e, d) => sent.add((e, d));
    });
    tearDown(() => SocketService.emitProbe = null);
    tearDownAll(c.resetForTest);

    Widget sheet() => MediaQuery(
          data: const MediaQueryData(size: Size(360, 800)),
          child: MaterialApp(home: NotepadSheet(controller: c)),
        );

    testWidgets('للجميع — حتى المُقصى — ويُجلب عند الفتح', (t) async {
      c.primeForTest(dead: true);
      await t.pumpWidget(sheet());
      expect(find.text('🗳️ التصويت'), findsOneWidget);
      await t.tap(find.text('🗳️ التصويت'));
      await t.pump();
      expect(sent.where((s) => s.$1 == 'room:get-vote-history'), hasLength(1));
      expect((sent.firstWhere((s) => s.$1 == 'room:get-vote-history').$2 as Map)['roomId'], '99');
      expect(find.text('لا جولات تصويت بعد'), findsOneWidget);
    });

    testWidgets('يعرض السجلّ ويتحدّث حين يصل جديد', (t) async {
      c.primeForTest(voteHistory: VoteRound.listOf(_json.take(1).toList()));
      await t.pumpWidget(sheet());
      await t.tap(find.text('🗳️ التصويت'));
      await t.pump();
      expect(find.text('تعادل ⟵ حصرٌ بين المتعادلين'), findsOneWidget);
      c.primeForTest(voteHistory: VoteRound.listOf(_json));
      c.notifyListeners();
      await t.pump();
      expect(find.text('أُقصي #5 سامي'), findsOneWidget);
    });

    testWidgets('أربعة تبويبات على هاتفٍ ضيّق بلا فيضان', (t) async {
      c.primeForTest(role: 'SILENCER', chatEnabled: true);
      await t.pumpWidget(sheet());
      expect(find.text('🗣️ التشاور'), findsOneWidget);
      expect(find.text('🗳️ التصويت'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  });
}
