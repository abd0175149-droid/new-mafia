import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/room_v2/player_room.dart';
import 'package:mafia_club/features/game/room_v2/room_bus.dart';
import 'package:mafia_club/features/guide/guide_host.dart';
import 'package:mafia_club/features/guide/guide_service.dart';
import 'package:mafia_club/features/guide/guide_targets.dart';
import 'package:mafia_club/features/guide/training/script.dart';
import 'package:mafia_club/features/guide/training/training_room.dart';
import 'package:mafia_club/models/profile.dart' show roleNameAr;
import 'package:shared_preferences/shared_preferences.dart';

// ══════════════════════════════════════════════════════
// 🕴️ جولة «الليلة الأولى» على أندرويد — تُلعب غرفة التدريب كاملةً باللمس (2026-11-22)
// ══════════════════════════════════════════════════════
// لا جهاز في يد المطوّر، فهذا هو الدليل الوحيد قبل التسليم: يدخل «اللاعب» الغرفة،
// ويضغط ويطوّل ويصوّت كما يفعل بيده — عبر طبقة الدون الحقيقيّة التي تحجب ما حول
// الهدف. إن غطّى الحجبُ هدفاً، أو لم تتقدّم دقّةٌ بفعلها، يتوقّف الاختبار عندها.

Finder _in(String targetId, Finder f) => find.descendant(of: find.byWidgetPredicate((w) => w is GuideTarget && w.id == targetId), matching: f);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('السيناريو (نقيّ)', () {
    test('القاعة تميل مع صوت المتدرّب فيصل دائماً إلى التبرير', () {
      for (final role in kPlayableRoles) {
        final n = resolveNight(role, kNoPick);
        final b = ballotOf(n, 3);
        if (!n.dead.contains(3)) expect(b.acc, 3, reason: role);
        final voters = {...b.bot, kMe: 3}.entries.where((e) => e.value == b.acc).map((e) => e.key);
        if (!n.dead.contains(3)) expect(voters, contains(kMe), reason: '$role: المتدرّب بين المصوّتين على المتّهم');
      }
    });

    test('المافيا لا يُلمس شريكُه ليلاً ولا يواجهه افتراضاً', () {
      for (final role in ['GODFATHER', 'SILENCER', 'WITCH', 'MAFIA_REGULAR']) {
        final t = tableOf(role);
        for (final s in allowedTargets(role)) {
          if (s != kMe) expect(isMafia(t[s]!), isFalse, reason: '$role ← $s');
        }
        expect(isMafia(t[defaultConfTarget(role, resolveNight(role, kNoPick))]!), isFalse, reason: role);
      }
    });

    test('ثلاثة مافيا دائماً على الطاولة', () {
      for (final role in kPlayableRoles) {
        expect(teamCounts(role, const []).mafia, 3, reason: role);
      }
    });
  });

  group('الغرفة باللمس', () {
    const secure = MethodChannel('mafia/secure_screen');
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(secure, (_) async => true);
      final g = GuideService.instance;
      g.me = const GuideMe(enabled: true, required: true, status: 'started');
      g.run = const GuideRun(GuideStage.room, 13, false);
      g.role = 'SHERIFF';
      g.overlay.value = null;
      g.sheet.value = null;
    });
    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(secure, null);
    });

    testWidgets('من «جاري تخصيص مقعدك» إلى ختم الجولة — كلّ دقّةٍ تتقدّم بفعلها', (tester) async {
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(MaterialApp(
        builder: (ctx, child) => Directionality(
          textDirection: TextDirection.rtl,
          child: Stack(fit: StackFit.expand, children: [child!, const GuideHost(blocked: false)]),
        ),
        home: const Scaffold(backgroundColor: Colors.black, body: TrainingRoomScreen()),
      ));

      /// لمسٌ كاللاعب: يمرّر الهدف إلى الشاشة أوّلاً إن كان تحت حافّتها
      Future<void> tap(Finder f) async {
        await tester.ensureVisible(f.first);
        await tester.pump(const Duration(milliseconds: 300));
        await tester.tap(f.first);
      }

      Future<void> hold(Finder f, {int ms = 450}) async {
        final gst = await tester.startGesture(tester.getCenter(f.first));
        await tester.pump(Duration(milliseconds: ms));
        await gst.up();
        await tester.pump();
      }

      // ── ما قبل الغرفة: شاشات الدخول الحقيقيّة ──
      await tester.pump(const Duration(milliseconds: 1800));
      expect(TrainingRoomScreen.debugBeat.value, 'photo');
      await tester.tap(find.text('✓ نعم، لا مانع'));
      await tester.pump();
      await tester.tap(find.text('متابعة').last);
      await tester.pump(const Duration(milliseconds: 300));
      expect(TrainingRoomScreen.debugBeat.value, 'seat');
      await tester.enterText(find.byType(TextField), '5');
      await tester.pump();
      await tester.tap(find.text('اجلس في هذا المقعد'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(TrainingRoomScreen.debugBeat.value, 'lobby');

      // ── الدقّات ──
      final seen = <String>[];
      String? last;
      var acted = false;
      var still = 0;
      for (var k = 0; k < 900; k++) {
        await tester.pump(const Duration(milliseconds: 160));
        final id = TrainingRoomScreen.debugBeat.value;
        if (id == 'grad') break;
        if (id != last) { if (id != null) seen.add(id); last = id; acted = false; still = 0; }
        if (acted) { if (++still > 14) { acted = false; still = 0; } continue; }
        acted = true;
        // الأوراق تنزلق وتُفتح بعد لحظة — فعلٌ لم يجد هدفه يُعاد في الدورة التالية
        try { switch (id) {
          case 'card':
            await hold(find.byType(PeekCardV2));
          case 'card-open':
            await tap(find.byType(PeekCardV2));
          case 'hub':
            // الشريط السفليّ ليس في هذا الحامل — زرّ «اللعبة» يستدعي هذا نفسه
            RoomBus.requestHub();
          case 'tasks-tile':
            await tap(_in('hub-tasks', find.text('مهامّي')));
          case 'tasks-hold':
            await hold(find.text('دورك ومهامّك'));
          case 'tasks-peek' || 'morning-peek':
            await tap(find.text('إخفاء'));
          case 'team-tile':
            await tap(_in('hub-team', find.text('الفريق')));
          case 'team-press':
            final gst = await tester.startGesture(tester.getCenter(find.byKey(const ValueKey('gallery-hold-button'))));
            await tester.pump(const Duration(milliseconds: 300));
            await tester.pump(const Duration(milliseconds: 300));
            await gst.up();
          case 'roles-tile':
            await tap(_in('hub-roles', find.text('الأدوار')));
          case 'night-ask':
            await tap(find.descendant(of: find.byType(NightAskV2), matching: find.text('يزن')));
            await tester.pump();
            await tap(find.text('تأكيدُ الاختيار'));
          case 'morning':
            await hold(find.text('📨 رسالة الليل'));
          case 'conf-btn':
            await tap(find.text('⚔️ اطلب مواجهة'));
          case 'conf-sheet':
            await tap(_in('conf-sheet', find.text('يزن')));
            await tester.pump();
            await tap(find.text('⚔️ إرسال طلب المواجهة'));
          case 'conf-wait':
            break;
          case 'conf-incoming':
            await tap(find.text('✓ أقبل'));
          case 'conf-pulse':
            await tap(_in('conf-box', find.text('ليلى')));
          case 'vote':
            await tap(find.descendant(of: find.byType(VoteGridV2), matching: find.text('يزن')));
          default:
            final o = GuideService.instance.overlay.value;
            if (o != null && o.step.wait == null && o.onNext != null) {
              await tap(find.text(o.step.nextLabel ?? 'التالي'));
            } else {
              acted = false;
            }
        } } catch (e) { acted = false; if (e is! StateError && '$e'.contains('could not find') == false) rethrow; }
      }

      expect(TrainingRoomScreen.debugBeat.value, 'grad', reason: 'توقّفت الجولة عند «$last» — الدقّات التي مرّت: $seen');
      expect(seen, containsAllInOrder(['lobby', 'hall', 'card', 'card-open', 'card-done', 'hub', 'hub-open', 'tasks-tile', 'tasks-hold', 'tasks-peek',
        'tasks-done', 'team-tile', 'team-press', 'team-done', 'roles-tile', 'roles', 'night-intro', 'night-ask', 'night-sent', 'morning', 'morning-peek',
        'morning-done', 'disc', 'disc-me', 'conf-btn', 'conf-sheet', 'conf-wait', 'conf-accepted', 'conf-incoming', 'conf-incoming-done', 'deals',
        'conf-live', 'conf-pulse', 'conf-pulse-done', 'vote', 'vote-done', 'just', 'withdraw', 'pending', 'elim', 'elim-conf', 'dead', 'over']));
      expect(GuideService.instance.me!.status, 'done', reason: 'الختم يُسجَّل');
      await tester.pump();
      expect(find.text('أتممتَ ليلتك الأولى'), findsOneWidget);

      // «جرّب دوراً آخر» ← شيخ المافيا: تعود الغرفة إلى البطاقة بدورٍ جديد
      await tester.tap(find.text('جرّب دوراً آخر'));
      await tester.pump();
      expect(find.text('أيّ دورٍ تجرّب؟'), findsOneWidget);
      await tester.tap(find.text(roleNameAr('GODFATHER')).last);
      await tester.pump(const Duration(milliseconds: 300));
      expect(GuideService.instance.role, 'GODFATHER');
      expect(TrainingRoomScreen.debugBeat.value, 'card');

      // تنظيف: تُفرَّغ المؤقّتات قبل الهدم
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
    });
  });
}
