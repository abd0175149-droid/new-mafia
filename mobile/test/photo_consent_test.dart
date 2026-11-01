import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/features/game/photo_consent_view.dart';
import 'package:mafia_club/models/game.dart';

// ══════════════════════════════════════════════════════
// 🧪 زاوية بلا تصوير — السؤال والشارة والقراءة
// ══════════════════════════════════════════════════════

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: const Color(0xFF050505),
          body: SingleChildScrollView(child: child),
        ),
      ),
    );

void main() {
  group('PhotoConsentAsk.tryParse', () {
    test('مطفأة أو تالفة ⇒ لا سؤال', () {
      expect(PhotoConsentAsk.tryParse({'success': true, 'enabled': false}), isNull);
      expect(PhotoConsentAsk.tryParse({'success': false, 'enabled': true}), isNull);
      expect(PhotoConsentAsk.tryParse(null), isNull);
      expect(PhotoConsentAsk.tryParse('x'), isNull);
    });

    test('الجواب المحفوظ والقاصر', () {
      final a = PhotoConsentAsk.tryParse(
          {'success': true, 'enabled': true, 'consent': false, 'isMinor': true})!;
      expect(a.consent, isFalse);
      expect(a.isMinor, isTrue);
      final b = PhotoConsentAsk.tryParse(
          {'success': true, 'enabled': true, 'consent': null})!;
      expect(b.consent, isNull);
      expect(b.isMinor, isFalse);
    });
  });

  group('parsePhotoZone', () {
    test('علَمي من مدخلي وحده، والغياب = مطفأة', () {
      final st = {
        'photoZoneOn': true,
        'players': [
          {'physicalId': 2},
          {'physicalId': 5, 'noPhoto': true},
        ],
      };
      expect(parsePhotoZone(st, 5), (on: true, noPhoto: true));
      expect(parsePhotoZone(st, 2), (on: true, noPhoto: false));
      expect(parsePhotoZone(st, 9), (on: true, noPhoto: null));
      expect(parsePhotoZone({'players': []}, 5).on, isFalse);
    });
  });

  group('PhotoConsentQuestion', () {
    testWidgets('بلا جوابٍ سابق: «متابعة» معطّلة حتّى يختار', (t) async {
      bool? got;
      await t.pumpWidget(_wrap(PhotoConsentQuestion(
        ask: const PhotoConsentAsk(),
        onContinue: (v) => got = v,
      )));
      expect(find.text('نصوّر الليلة لصفحات النادي'), findsOneWidget);
      await t.tap(find.text('متابعة'));
      expect(got, isNull);

      await t.tap(find.text('📵 لا، أفضّل ما أظهر'));
      await t.pump();
      await t.tap(find.text('متابعة'));
      expect(got, isFalse);
    });

    testWidgets('الجواب السابق مُختارٌ سلفاً', (t) async {
      bool? got;
      await t.pumpWidget(_wrap(PhotoConsentQuestion(
        ask: const PhotoConsentAsk(consent: true),
        onContinue: (v) => got = v,
      )));
      await t.tap(find.text('متابعة'));
      expect(got, isTrue);
    });

    testWidgets('القاصر: بلا سؤال، و«متابعة» ترسل false', (t) async {
      bool? got;
      await t.pumpWidget(_wrap(PhotoConsentQuestion(
        ask: const PhotoConsentAsk(consent: true, isMinor: true),
        onContinue: (v) => got = v,
      )));
      expect(find.text('ستجلس في زاوية بلا تصوير'), findsOneWidget);
      expect(find.text('✓ نعم، لا مانع'), findsNothing);
      await t.tap(find.text('متابعة'));
      expect(got, isFalse);
    });

    testWidgets('أهداف اللمس ≥ ٤٨', (t) async {
      await t.pumpWidget(_wrap(PhotoConsentQuestion(
        ask: const PhotoConsentAsk(),
        onContinue: (_) {},
      )));
      for (final s in ['✓ نعم، لا مانع', '📵 لا، أفضّل ما أظهر', 'متابعة']) {
        final box = t.getSize(find
            .ancestor(of: find.text(s), matching: find.byType(GestureDetector))
            .first);
        expect(box.height, greaterThanOrEqualTo(48), reason: s);
      }
    });
  });

  group('PhotoStatusChip', () {
    final c = GameSessionController.instance;
    setUp(c.resetForTest);

    testWidgets('مخفيّة حين الزاوية مطفأة', (t) async {
      c.primeForTest(roomId: '9', physicalId: 3, photoZoneOn: false);
      await t.pumpWidget(_wrap(PhotoStatusChip(controller: c)));
      expect(find.textContaining('التصوير'), findsNothing);
      expect(find.textContaining('بلا تصوير'), findsNothing);
    });

    testWidgets('تعرض حالتي', (t) async {
      c.primeForTest(roomId: '9', physicalId: 3, photoZoneOn: true, myNoPhoto: false);
      await t.pumpWidget(_wrap(PhotoStatusChip(controller: c)));
      expect(find.text('📸 التصوير: مسموح'), findsOneWidget);

      c.primeForTest(myNoPhoto: true);
      await t.pumpWidget(_wrap(PhotoStatusChip(
          key: const ValueKey('b'), controller: c)));
      expect(find.text('📵 بلا تصوير'), findsOneWidget);
    });
  });
}
