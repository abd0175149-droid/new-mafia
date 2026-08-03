import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/core/socket/socket_service.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/models/night.dart';

// ══════════════════════════════════════════════════════
// 🧪 آلة حالة الليل — §6.1 · §6.2 · §6.3 في الملفّ ٢٣
// ══════════════════════════════════════════════════════
// المؤقّتات تعمل تحت ساعة الاختبار الوهمية داخل `testWidgets`.

void main() {
  final c = GameSessionController.instance;
  late List<(String, dynamic)> sent;

  setUp(() {
    sent = [];
    SocketService.emitProbe = (e, d) => sent.add((e, d));
    c.primeForTest(roomId: '282', role: 'SILENCER', dead: false);
  });
  tearDown(() => SocketService.emitProbe = null);

  const req = NightActionRequest(
    actionType: 'SILENCE',
    stepRole: 'SILENCER',
    timeoutSeconds: 5,
    canSkip: true,
    availableTargets: [NightTarget(physicalId: 7, name: 'خالد')],
  );

  testWidgets('العدّاد ينزل ثانيةً بثانية', (t) async {
    c.openNightForTest(req);
    expect(c.nightCountdown, 5);
    expect(c.nightSubmitted, isFalse);

    await t.pump(const Duration(seconds: 1));
    expect(c.nightCountdown, 4);
    await t.pump(const Duration(seconds: 2));
    expect(c.nightCountdown, 2);

    await t.pump(const Duration(seconds: 10)); // تصريف المؤقّتات
  });

  testWidgets('🔴 عند الصفر لا يُرسل العميل شيئاً — الخادم يختار عشوائياً',
      (t) async {
    // إرسالٌ من العميل هنا يزاحم اختيار الخادم ويُدخل سباقاً على نفس
    // الخطوة. ما يظهر «تم الإرسال» تجميليٌّ محض.
    c.openNightForTest(req);
    await t.pump(const Duration(seconds: 5));
    expect(c.nightCountdown, 0);
    expect(sent.where((e) => e.$1 == 'player:night-action'), isEmpty);

    // «تم الإرسال» بعد ٢ ثانية…
    expect(c.nightSubmitted, isFalse);
    await t.pump(const Duration(milliseconds: 2000));
    expect(c.nightSubmitted, isTrue);
    expect(c.nightAction, isNotNull);

    // …ثم الإغلاق بعد ١٫٥ ثانية
    await t.pump(const Duration(milliseconds: 1500));
    expect(c.nightAction, isNull);
    expect(sent.where((e) => e.$1 == 'player:night-action'), isEmpty);
  });

  testWidgets('اللمس يرسل الهدف ويغلق بعد ١٫٥ ثانية', (t) async {
    c.openNightForTest(req);
    await t.pump(const Duration(seconds: 1));
    await c.submitNightAction(7);

    final e = sent.singleWhere((e) => e.$1 == 'player:night-action');
    expect((e.$2 as Map)['targetPhysicalId'], 7);
    expect((e.$2 as Map)['actionType'], 'SILENCE');
    expect((e.$2 as Map)['roomId'], '282');
    expect(c.nightSubmitted, isTrue);

    expect(c.nightAction, isNotNull);
    await t.pump(const Duration(milliseconds: 1500));
    expect(c.nightAction, isNull);
  });

  testWidgets('التخطّي يرسل هدفاً فارغاً', (t) async {
    c.openNightForTest(req);
    await c.submitNightAction(null);
    final e = sent.singleWhere((e) => e.$1 == 'player:night-action');
    expect((e.$2 as Map)['targetPhysicalId'], isNull);
    await t.pump(const Duration(milliseconds: 1500));
  });

  testWidgets('🔴 لمسةٌ ثانية لا ترسل فعلاً ثانياً', (t) async {
    // العلامة تُضبط قبل الانتظار؛ ضبطها بعده يفتح نافذةً للمسٍ مزدوج.
    c.openNightForTest(req);
    final f1 = c.submitNightAction(7);
    final f2 = c.submitNightAction(3);
    await f1;
    await f2;
    expect(sent.where((e) => e.$1 == 'player:night-action').length, 1);
    await t.pump(const Duration(milliseconds: 1500));
  });

  testWidgets('🔴 العدّاد يتوقّف بعد الإرسال — لا يتابع إلى الصفر', (t) async {
    c.openNightForTest(req);
    await t.pump(const Duration(seconds: 1));
    await c.submitNightAction(7);
    final at = c.nightCountdown;
    expect(at, 4);
    // داخل نافذة الـ١٫٥ ثانية قبل الإغلاق: الرقم مجمَّد تحت طبقة
    // «تم الإرسال». (الإغلاق نفسه يصفّره — وهذا صحيح.)
    await t.pump(const Duration(milliseconds: 1400));
    expect(c.nightCountdown, at);
    await t.pump(const Duration(seconds: 3));
    expect(c.nightAction, isNull);
  });

  testWidgets('خطوةٌ جديدة تُلغي مؤقّتات السابقة', (t) async {
    c.openNightForTest(req);
    await t.pump(const Duration(seconds: 2));
    c.openNightForTest(const NightActionRequest(
        actionType: 'KILL', stepRole: 'GODFATHER', timeoutSeconds: 9));
    expect(c.nightCountdown, 9);
    await t.pump(const Duration(seconds: 1));
    // لو بقي مؤقّت الخطوة الأولى لنزل العدّاد مرّتين في الثانية
    expect(c.nightCountdown, 8);
    await t.pump(const Duration(seconds: 20));
  });

  testWidgets('جواب الممرضة يُغلق فوراً ويرسل قراره', (t) async {
    c.respondNurse(true);
    expect(c.nursePending, isFalse);
    final e = sent.singleWhere((e) => e.$1 == 'nurse:activation-response');
    expect((e.$2 as Map)['activate'], isTrue);
    expect((e.$2 as Map)['roomId'], '282');
  });
}
