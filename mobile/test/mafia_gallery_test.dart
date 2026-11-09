import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/socket/socket_service.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/features/game/mafia_gallery.dart';
import 'package:mafia_club/models/card_template.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 معرض المافيا — §4.5 · §4.6 في الملفّ ٢٢
// ══════════════════════════════════════════════════════

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(textDirection: TextDirection.rtl, child: child),
    );

void main() {
  group('🔴 عقد الخادم: كائناتٌ لا أرقام', () {
    // الانحدار: كان الفريق يُختزل إلى `List<int>` فتضيع الأسماء والأدوار
    // والصور — وشبكة الشركاء تصير أرقاماً عارية.
    test('زميل المافيا يُقرأ كاملاً', () {
      final t = MafiaMate.listOf([
        {
          'physicalId': 7,
          'name': 'خالد',
          'role': 'GODFATHER',
          'avatarUrl': '/uploads/a.jpg',
        },
        {'physicalId': 9, 'name': 'سامي', 'role': 'CHAMELEON', 'avatarUrl': null},
      ]);
      expect(t.length, 2);
      expect(t.first.name, 'خالد');
      expect(t.first.role, 'GODFATHER');
      expect(t.first.avatarUrl, '/uploads/a.jpg');
      expect(t.last.avatarUrl, isNull);
    });

    test('حمولةٌ غير متوقّعة لا تُسقط التطبيق', () {
      expect(MafiaMate.listOf(null), isEmpty);
      expect(MafiaMate.listOf(const [1, 2, 3]), isEmpty);
      expect(MafiaMate.listOf('x'), isEmpty);
    });

    test('الأخ يحمل حياته واتّجاه التعارف', () {
      final s = SiblingInfo.fromJson(const {
        'physicalId': 6,
        'name': 'ليث',
        'role': 'YOUNGER_BROTHER',
        'avatarUrl': null,
        'isAlive': false,
        'recipientIsMafia': true,
      });
      expect(s.physicalId, 6);
      expect(s.isAlive, isFalse);
      expect(s.recipientIsMafia, isTrue);
    });

    test('غياب isAlive يعني حيّاً — لا ميتاً', () {
      expect(SiblingInfo.fromJson(const {'physicalId': 1}).isAlive, isTrue);
    });
  });

  group('عقود السفّاح', () {
    test('النسبة من صفرٍ مطلوب ليست NaN', () {
      const c = AssassinContracts(completedCount: 0, totalRequired: 0);
      expect(c.progress, 0);
      expect(c.progress.isNaN, isFalse);
    });

    test('النسبة تُحسب وتُحصر', () {
      expect(const AssassinContracts(completedCount: 1, totalRequired: 4).progress,
          0.25);
      expect(const AssassinContracts(completedCount: 9, totalRequired: 4).progress,
          1.0);
    });

    test('الوصف العربيّ أوّلاً والإنجليزيّ احتياطاً', () {
      final ar = AssassinContract.fromJson(const {
        'id': 1,
        'description': 'Kill the doctor',
        'descriptionAr': '🔪 اغتل الطبيب',
      });
      expect(ar.text, '🔪 اغتل الطبيب');
      final en = AssassinContract.fromJson(const {
        'id': 2,
        'description': 'Kill the sniper',
      });
      expect(en.text, 'Kill the sniper');
    });

    test('الحمولة الكاملة تُقرأ', () {
      final c = AssassinContracts.fromJson(const {
        'contracts': [
          {'id': 1, 'completed': true, 'completedAtRound': 2},
          {'id': 2, 'completed': false},
        ],
        'currentIndex': 1,
        'completedCount': 1,
        'totalRequired': 3,
      })!;
      expect(c.contracts.length, 2);
      expect(c.contracts.first.completedAtRound, 2);
      expect(c.contracts.last.completed, isFalse);
      expect(c.totalRequired, 3);
    });
  });

  group('🔒 قائمة أدوار المافيا الحرفية', () {
    // الانحدار: كانت القائمة تعدّ السفّاح مافيا وتُسقط الأخ الأكبر — فيمنح
    // السفّاحُ شارةَ مافيا وقائمةَ شركاء لا يملكها، ويُحرم الأخ الأكبر أخاه.
    test('السفّاح مستقلٌّ لا مافيا', () {
      expect(kMafiaRoleIds.contains('ASSASSIN'), isFalse);
      expect(kNeutralRoleIds.contains('ASSASSIN'), isTrue);
      expect(kNeutralRoleIds.contains('JESTER'), isTrue);
    });

    test('الأخ الأكبر مافيا', () {
      expect(kMafiaRoleIds.contains('OLDER_BROTHER'), isTrue);
      expect(kMafiaRoleIds.contains('YOUNGER_BROTHER'), isFalse);
    });

    test('القائمة ستّةٌ بالضبط', () => expect(kMafiaRoleIds.length, 6));
  });

  group('🔒 بوابة التسريب — §4.6', () {
    final c = GameSessionController.instance;
    const team = [MafiaMate(physicalId: 4, name: 'زيد', role: 'WITCH')];
    const sib = SiblingInfo(physicalId: 6, name: 'ليث');

    test('مواطنٌ بفريقٍ محفوظٍ من جيمٍ سابق لا يرى شيئاً', () {
      c.primeForTest(role: 'CITIZEN', team: team, sibling: sib);
      expect(c.galleryTeam, isEmpty);
      expect(c.gallerySibling, isNull);
    });

    test('السفّاح لا يرى فريقاً — لكنّه يُعرَف سفّاحاً', () {
      c.primeForTest(role: 'ASSASSIN', team: team);
      expect(c.galleryTeam, isEmpty);
      expect(c.isAssassin, isTrue);
    });

    test('الأخ الأكبر يرى فريقه وأخاه', () {
      c.primeForTest(role: 'OLDER_BROTHER', team: team, sibling: sib);
      expect(c.galleryTeam.length, 1);
      expect(c.gallerySibling?.physicalId, 6);
    });

    test('بلا دورٍ لا شيء', () {
      c.primeForTest(role: '', team: team, sibling: sib);
      expect(c.galleryTeam, isEmpty);
      expect(c.gallerySibling, isNull);
    });
  });

  group('🔒 ترتيب إنذار الغشّ — §4.6', () {
    final c = GameSessionController.instance;
    late List<(String, dynamic)> sent;

    setUp(() {
      sent = [];
      SocketService.emitProbe = (e, d) => sent.add((e, d));
    });
    tearDown(() => SocketService.emitProbe = null);

    test('اللاعب المُقصى: يُرسَل الإنذار ولا يُفتح المعرض', () {
      // الجوهر: محاولةُ المُقصى هي بالضبط ما يريد الليدر أن يعرفه.
      // تقديمُ فحص الموت على الإرسال يُسكت الإنذار عن حالته الوحيدة.
      c.primeForTest(roomId: '282', role: 'SILENCER', dead: true);
      expect(c.announceGalleryOpen(), isFalse);
      expect(sent.single.$1, 'player:mafia-gallery-open');
      expect((sent.single.$2 as Map)['roomId'], '282');
    });

    test('اللاعب الحيّ: يُرسَل الإنذار ويُفتح المعرض', () {
      c.primeForTest(roomId: '282', role: 'SILENCER', dead: false);
      expect(c.announceGalleryOpen(), isTrue);
      expect(sent.length, 1);
    });

    test('بلا غرفةٍ لا إرسال', () {
      c.primeForTest(roomId: '', role: 'SILENCER', dead: false);
      c.announceGalleryOpen();
      expect(sent, isEmpty);
    });
  });


  // ══════════════════════════════════════════════════════
  // 🖐️ «اضغط مع الاستمرار» — زرٌّ واحد يكشف الفريق كلّه
  // ══════════════════════════════════════════════════════
  group('🖐️ الكشف بالضغط المستمرّ', () {
    final hold = find.byKey(const ValueKey('gallery-hold-button'));
    Finder slots() => find.byWidgetPredicate((w) =>
        w.key is ValueKey<String> &&
        (w.key as ValueKey<String>).value.startsWith('gallery-slot-'));

    const me = MafiaMate(physicalId: 2, name: 'عمر', role: 'GODFATHER');
    const mates = [
      MafiaMate(physicalId: 9, name: 'سامي', role: 'CHAMELEON'),
      MafiaMate(physicalId: 4, name: 'زيد', role: 'WITCH'),
    ];

    Future<TestGesture> press(WidgetTester t) async {
      final g = await t.startGesture(t.getCenter(hold));
      await t.pump();
      return g;
    }

    testWidgets('بلا ضغطٍ: N خانةً فارغة ولا هويّة في الشجرة', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
          team: mates, self: me, mafiaAlive: 3)));
      expect(slots(), findsNWidgets(3));
      expect(hold, findsOneWidget);
      for (final s in ['عمر', 'سامي', 'زيد', 'أنت', 'الساحرة', '4', '9',
          'ملفٌّ مغلق']) {
        expect(find.text(s), findsNothing, reason: s);
      }
    });

    testWidgets('أثناء الضغط يُكشف الفريق كلّه، وبالرفع يُخفى', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
          team: mates, self: me, mafiaAlive: 3)));
      final g = await press(t);
      expect(find.text('أنت'), findsOneWidget);
      expect(find.text('زيد'), findsOneWidget);
      expect(find.text('سامي'), findsOneWidget);
      expect(find.text('الساحرة'), findsOneWidget);
      expect(find.text('حرباية المافيا'), findsOneWidget);
      expect(find.text('شيخ المافيا'), findsOneWidget);
      expect(find.text('ملفٌّ مغلق'), findsNothing);
      // ترتيب المقاعد: 2 ثمّ 4 ثمّ 9 (عمودٌ واحد ⇒ من الأعلى للأسفل)
      final y2 = t.getTopLeft(find.text('أنت')).dy;
      final y4 = t.getTopLeft(find.text('زيد')).dy;
      final y9 = t.getTopLeft(find.text('سامي')).dy;
      expect(y2 < y4 && y4 < y9, isTrue);

      await g.up();
      await t.pump();
      expect(find.text('زيد'), findsNothing);
      expect(find.text('أنت'), findsNothing);
      expect(slots(), findsNWidgets(3));
    });

    testWidgets('🔒 المواطن يرى الشاشة نفسها: N خانةً و«ملفٌّ مغلق» تحت الضغط',
        (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(mafiaAlive: 3)));
      expect(slots(), findsNWidgets(3));
      expect(hold, findsOneWidget);
      final g = await press(t);
      expect(find.text('ملفٌّ مغلق'), findsNWidgets(3));
      expect(find.text('أنت'), findsNothing);
      await g.up();
      await t.pump();
      expect(find.text('ملفٌّ مغلق'), findsNothing);
    });

    testWidgets('🔒 مافيا بلا قائمة (الكشف مطفأ) = مواطن: لا «أنت»', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(self: me, mafiaAlive: 2)));
      final g = await press(t);
      expect(find.text('ملفٌّ مغلق'), findsNWidgets(2));
      expect(find.text('أنت'), findsNothing);
      expect(find.text('عمر'), findsNothing);
      await g.up();
    });

    testWidgets('من لم يُرسله الخادم خانتُه «ملفٌّ مغلق»؛ والفائض لا يُرسم',
        (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
          team: [MafiaMate(physicalId: 4, name: 'زيد', role: 'WITCH')],
          self: me,
          mafiaAlive: 4)));
      var g = await press(t);
      expect(find.text('ملفٌّ مغلق'), findsNWidgets(2));
      expect(find.text('زيد'), findsOneWidget);
      await g.up();

      await t.pumpWidget(_wrap(const MafiaTeamGallery(
          key: ValueKey('b'), team: mates, self: me, mafiaAlive: 2)));
      expect(slots(), findsNWidgets(2));
      g = await press(t);
      expect(find.text('أنت'), findsOneWidget);
      expect(find.text('زيد'), findsOneWidget);
      expect(find.text('سامي'), findsNothing);
      await g.up();
    });

    testWidgets('عدّادٌ لم يصل ⇒ عددٌ ثابت لا طولُ القائمة', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(team: mates, self: me)));
      expect(slots(), findsNWidgets(kGalleryFallbackSlots));
      await t.pumpWidget(
          _wrap(const MafiaTeamGallery(key: ValueKey('c'))));
      expect(slots(), findsNWidgets(kGalleryFallbackSlots));
    });

    test('الأعمدة: ١–٣ ⇒ ١، ٤–٦ ⇒ ٢، ٧–٩ ⇒ ٣، وما فوق ⇒ ٤', () {
      expect([1, 2, 3].map(galleryColumnsFor), everyElement(1));
      expect([4, 5, 6].map(galleryColumnsFor), everyElement(2));
      expect([7, 8, 9].map(galleryColumnsFor), everyElement(3));
      expect([10, 16].map(galleryColumnsFor), everyElement(4));
    });

    testWidgets('🔔 الإنذار مع كلّ ضغطة؛ و`false` يمنع الكشف', (t) async {
      var calls = 0;
      var allow = true;
      await t.pumpWidget(_wrap(MafiaTeamGallery(
        team: mates,
        self: me,
        mafiaAlive: 3,
        onRevealStart: () {
          calls++;
          return allow;
        },
      )));
      expect(calls, 0); // الفتح وحده لا يُنذر
      var g = await press(t);
      await g.up();
      g = await press(t);
      await g.up();
      expect(calls, 2);
      allow = false;
      g = await press(t);
      expect(calls, 3);
      expect(find.text('زيد'), findsNothing);
      await g.up();
    });

    testWidgets('انزلاق الإصبع خارج الزرّ يُخفي', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
          team: mates, self: me, mafiaAlive: 3)));
      final g = await press(t);
      expect(find.text('زيد'), findsOneWidget);
      await g.moveBy(const Offset(0, -200));
      await t.pump();
      expect(find.text('زيد'), findsNothing);
      await g.up();
    });

    testWidgets('إلغاء اللمسة يُخفي', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
          team: mates, self: me, mafiaAlive: 3)));
      final g = await press(t);
      expect(find.text('زيد'), findsOneWidget);
      await g.cancel();
      await t.pump();
      expect(find.text('زيد'), findsNothing);
    });

    testWidgets('مغادرة التطبيق (inactive) تُخفي', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
          team: mates, self: me, mafiaAlive: 3)));
      final g = await press(t);
      expect(find.text('زيد'), findsOneWidget);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await t.pump();
      expect(find.text('زيد'), findsNothing);
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await g.up();
    });

    testWidgets('🔒 ٩ خانات على ٣٦٠×٦٤٠ بلا فيضٍ ولا تمرير', (t) async {
      t.view.physicalSize = const Size(360, 640);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      const longName = 'عبد الرحمن بن عبد العزيز الطويل جداً';
      await t.pumpWidget(_wrap(MafiaTeamGallery(
        team: [
          for (var i = 2; i <= 9; i++)
            MafiaMate(
                physicalId: i * 3, name: '$longName $i', role: 'MAFIA_REGULAR'),
        ],
        self: const MafiaMate(physicalId: 1, name: longName, role: 'OLDER_BROTHER'),
        mafiaAlive: 9,
        sibling: const SiblingInfo(
            physicalId: 26, name: longName, role: 'YOUNGER_BROTHER'),
        watermark: 'عمر · مقعد 1 · ABC · 21:00',
      )));
      expect(slots(), findsNWidgets(9));
      expect(find.byType(Scrollable), findsNothing);
      final g = await press(t);
      expect(t.takeException(), isNull);
      expect(find.text('أنت'), findsOneWidget);
      expect(find.text('مافيا عادي'), findsNWidgets(8));
      expect(find.byType(Scrollable), findsNothing);
      // كلّ الخانات داخل الشاشة، والزرّ تحتها
      final btnTop = t.getTopLeft(hold).dy;
      for (final e in slots().evaluate()) {
        final r = t.getRect(find.byWidget(e.widget));
        expect(r.bottom <= btnTop, isTrue);
        expect(r.left >= 0 && r.right <= 360, isTrue);
      }
      await g.up();
      await t.pump();
      expect(t.takeException(), isNull);
    });

    testWidgets('🔒 ٩ خاناتٍ مغلقة على ٣٦٠×٦٤٠ بلا فيض', (t) async {
      t.view.physicalSize = const Size(360, 640);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(_wrap(const MafiaTeamGallery(mafiaAlive: 9)));
      final g = await press(t);
      expect(t.takeException(), isNull);
      expect(find.text('ملفٌّ مغلق'), findsNWidgets(9));
      await g.up();
    });

    testWidgets('لوحة رابط الدم: تحت الضغط وحده، فوق الشبكة', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
        team: [MafiaMate(physicalId: 4, name: 'زيد', role: 'WITCH')],
        self: me,
        mafiaAlive: 2,
        sibling: SiblingInfo(physicalId: 6, name: 'ليث', role: 'YOUNGER_BROTHER'),
      )));
      expect(find.text('رابط الدم'), findsNothing);
      final g = await press(t);
      expect(find.text('رابط الدم'), findsOneWidget);
      expect(find.text('ليث'), findsOneWidget);
      expect(t.getTopLeft(find.text('رابط الدم')).dy,
          lessThan(t.getTopLeft(find.text('زيد')).dy));
      await g.up();
    });

    testWidgets('الأخ المتوفّى يُعلَّم — لا يُخفى', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
        mafiaAlive: 2,
        sibling: SiblingInfo(
            physicalId: 6,
            name: 'ليث',
            role: 'YOUNGER_BROTHER',
            isAlive: false),
      )));
      final g = await press(t);
      expect(find.text('الأخ الأصغر (متوفّى)'), findsOneWidget);
      await g.up();
    });

    testWidgets('السفّاح: الخانات نفسها، وعقوده تحت الضغط', (t) async {
      await t.pumpWidget(_wrap(const MafiaTeamGallery(
        mafiaAlive: 3,
        isAssassin: true,
        contracts: AssassinContracts(
          contracts: [
            AssassinContract(
                id: 1,
                descriptionAr: '🔪 اغتل الطبيب',
                completed: true,
                completedAtRound: 2),
            AssassinContract(id: 2, descriptionAr: '🔪 اغتل الشريف'),
          ],
          completedCount: 1,
          totalRequired: 2,
        ),
      )));
      expect(slots(), findsNWidgets(3));
      expect(find.text('عقود الاغتيال'), findsNothing);
      final g = await press(t);
      await t.pump(const Duration(milliseconds: 900));
      expect(find.text('عقود الاغتيال'), findsOneWidget);
      expect(find.text('1/2 عقود مُنجزة'), findsOneWidget);
      expect(find.text('أُنجز في الجولة 2'), findsOneWidget);
      expect(find.text('اقتل صاحب هذا الدور!'), findsOneWidget);
      await g.up();
      await t.pump();
      expect(find.text('عقود الاغتيال'), findsNothing);
    });

    testWidgets('سفّاحٌ بلا عقودٍ بعد يرى ما يراه المواطن', (t) async {
      await t.pumpWidget(_wrap(
          const MafiaTeamGallery(isAssassin: true, mafiaAlive: 3)));
      final g = await press(t);
      expect(find.text('ملفٌّ مغلق'), findsNWidgets(3));
      await g.up();
    });
  });
}
