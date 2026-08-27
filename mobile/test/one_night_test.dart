import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/one_night_view.dart';
import 'package:mafia_club/models/night.dart';

// ══════════════════════════════════════════════════════
// 🧪 الليلةُ الواحدة — اختيارٌ واحدٌ في الليلة كلِّها
//
// 🔒 والفحصُ الأهمّ هنا فحصُ تمويه: شاشةُ مَن لا دورَ له يجب أن تكون
//    مطابقةً لشاشة صاحب الدور في كلّ شيءٍ إلّا ما يأتي من الخادم.
// ══════════════════════════════════════════════════════

const _targets = [
  NightTarget(physicalId: 3, name: 'عبدالله'),
  NightTarget(physicalId: 7, name: 'خالد'),
  NightTarget(physicalId: 9, name: 'ريم'),
];

Widget _wrap(Widget child, {Size size = const Size(400, 800)}) => MediaQuery(
      data: MediaQueryData(size: size),
      child: MaterialApp(home: child),
    );

Widget _screen(
  OneNightAsk a, {
  int countdown = 60,
  bool submitted = false,
  Future<void> Function(List<({String? abilityId, int? targetPhysicalId})>)? onSubmit,
}) =>
    _wrap(OneNightOverlay(
      ask: a,
      countdown: countdown,
      submitted: submitted,
      onSubmit: onSubmit ?? (_) async {},
    ));

OneNightAsk _one(String? ability, String ask, {bool canSkip = false}) => OneNightAsk(
      steps: [
        OneNightStep(abilityId: ability, ask: ask, targets: _targets, canSkip: canSkip),
      ],
      deadline: DateTime.now().add(const Duration(seconds: 60)),
    );

void main() {
  group('النموذج — قراءةُ حمولة الخادم', () {
    test('خطوةٌ واحدة', () {
      final a = OneNightAsk.fromJson({
        'steps': [
          {
            'abilityId': 'KILL',
            'ask': 'اختر هدفَ الاغتيال',
            'targets': [
              {'physicalId': 3, 'name': 'عبدالله'},
            ],
            'canSkip': false,
          },
        ],
        'deadline': 1700000000000,
      });
      expect(a, isNotNull);
      expect(a!.steps.length, 1);
      expect(a.two, isFalse);
      expect(a.hasChoice, isTrue);
      expect(a.steps.first.abilityId, 'KILL');
      expect(a.steps.first.targets.first.name, 'عبدالله');
      expect(a.deadline!.millisecondsSinceEpoch, 1700000000000);
    });

    test('مَن لا دورَ له: قدرةٌ فارغةٌ ومفتاحٌ محايد', () {
      final a = OneNightAsk.fromJson({
        'steps': [
          {'abilityId': null, 'ask': 'اختر لاعباً', 'targets': [], 'canSkip': false},
        ],
        'deadline': null,
      });
      expect(a!.steps.first.abilityId, isNull);
      expect(a.steps.first.key, '_');
      expect(a.deadline, isNull);
    });

    test('حاملُ قدرتين', () {
      final a = OneNightAsk.fromJson({
        'steps': [
          {'abilityId': 'KILL', 'ask': 'اختر هدفَ الاغتيال', 'targets': []},
          {'abilityId': 'SILENCE', 'ask': 'مَن تُسكِت الليلة؟', 'targets': []},
        ],
      });
      expect(a!.two, isTrue);
      // الترتيبُ كما جاء من الخادم — مقفلٌ هناك لا هنا
      expect(a.steps.map((s) => s.abilityId), ['KILL', 'SILENCE']);
    });

    test('حمولةٌ فاسدة ⇒ null', () {
      expect(OneNightAsk.fromJson(null), isNull);
      expect(OneNightAsk.fromJson({'deadline': 1}), isNull);
      expect(OneNightAsk.fromJson('nope'), isNull);
    });

    test('علمُ الإرسال يُقرأ من الخادم', () {
      final a = OneNightAsk.fromJson({'steps': [], 'submitted': true});
      expect(a!.submitted, isTrue);
      expect(a.hasChoice, isFalse);
    });

    test('المتبقّي بأرضيّة ٣ ثوانٍ', () {
      final now = DateTime(2026, 1, 1, 20, 0, 0);
      final a = OneNightAsk(
          steps: const [], deadline: now.add(const Duration(seconds: 40)));
      expect(a.remainingSeconds(now: now), 40);
      final soon = OneNightAsk(
          steps: const [], deadline: now.add(const Duration(seconds: 1)));
      expect(soon.remainingSeconds(now: now), 3);
      final past = OneNightAsk(
          steps: const [], deadline: now.subtract(const Duration(seconds: 30)));
      expect(past.remainingSeconds(now: now), 3);
    });

    test('البصمةُ تتغيّر بتغيّر الليلة', () {
      final a = OneNightAsk(
        steps: const [OneNightStep(abilityId: 'KILL')],
        deadline: DateTime.fromMillisecondsSinceEpoch(1000),
      );
      final b = OneNightAsk(
        steps: const [OneNightStep(abilityId: 'KILL')],
        deadline: DateTime.fromMillisecondsSinceEpoch(2000),
      );
      expect(a.signature == b.signature, isFalse);
    });
  });

  group('الشاشة', () {
    testWidgets('السؤالُ والأهدافُ تُعرَض', (t) async {
      await t.pumpWidget(_screen(_one('KILL', 'اختر هدفَ الاغتيال')));
      expect(find.text('اختر هدفَ الاغتيال'), findsOneWidget);
      expect(find.text('عبدالله'), findsOneWidget);
      expect(find.text('خالد'), findsOneWidget);
      expect(find.text('ريم'), findsOneWidget);
    });

    testWidgets('الزرُّ مُقفَلٌ قبل الاختيار ويُفتح بعده', (t) async {
      final sent = <List<({String? abilityId, int? targetPhysicalId})>>[];
      await t.pumpWidget(_screen(_one('KILL', 'اختر هدفَ الاغتيال'),
          onSubmit: (p) async => sent.add(p)));

      expect(find.text('اختر لاعباً'), findsOneWidget); // نصُّ الزرّ المقفل
      await t.tap(find.text('اختر لاعباً'));
      await t.pump();
      expect(sent, isEmpty);

      await t.tap(find.text('خالد'));
      await t.pump();
      expect(find.text('تأكيدُ الاختيار'), findsOneWidget);
      await t.tap(find.text('تأكيدُ الاختيار'));
      await t.pump();
      expect(sent.length, 1);
      expect(sent.first.first.abilityId, 'KILL');
      expect(sent.first.first.targetPhysicalId, 7);
    });

    testWidgets('القنصُ وحده يُتاح تخطّيه بلا اختيار', (t) async {
      final sent = <List<({String? abilityId, int? targetPhysicalId})>>[];
      await t.pumpWidget(_screen(_one('SNIPE', 'اختر هدفَ القنص', canSkip: true),
          onSubmit: (p) async => sent.add(p)));
      expect(find.text('تخطٍّ — لا أحد'), findsOneWidget);
      await t.tap(find.text('تخطٍّ — لا أحد'));
      await t.pump();
      expect(sent.length, 1);
      expect(sent.first.first.targetPhysicalId, isNull);
    });

    testWidgets('حاملُ القدرتين: التالي ثمّ تأكيدُ الاختيارين معاً', (t) async {
      final sent = <List<({String? abilityId, int? targetPhysicalId})>>[];
      final a = OneNightAsk(
        steps: const [
          OneNightStep(abilityId: 'KILL', ask: 'اختر هدفَ الاغتيال', targets: _targets),
          OneNightStep(abilityId: 'SILENCE', ask: 'مَن تُسكِت الليلة؟', targets: _targets),
        ],
        deadline: null,
      );
      await t.pumpWidget(_screen(a, onSubmit: (p) async => sent.add(p)));

      // الخطوةُ الأولى: زرٌّ «التالي» لا زرُّ تأكيد
      expect(find.text('التالي ←'), findsOneWidget);
      await t.tap(find.text('عبدالله'));
      await t.pump();
      await t.tap(find.text('التالي ←'));
      await t.pump();

      expect(find.text('مَن تُسكِت الليلة؟'), findsOneWidget);
      expect(sent, isEmpty); // 🔴 لا إرسالَ بين الخطوتين
      await t.tap(find.text('ريم'));
      await t.pump();
      await t.tap(find.text('تأكيدُ الاختيارين'));
      await t.pump();

      expect(sent.length, 1);
      expect(sent.first.length, 2);
      expect(sent.first[0], (abilityId: 'KILL', targetPhysicalId: 3));
      expect(sent.first[1], (abilityId: 'SILENCE', targetPhysicalId: 9));
    });

    testWidgets('الرجوعُ يحفظ اختيارَ الخطوة الأولى', (t) async {
      final sent = <List<({String? abilityId, int? targetPhysicalId})>>[];
      final a = OneNightAsk(
        steps: const [
          OneNightStep(abilityId: 'KILL', ask: 'اغتيال', targets: _targets),
          OneNightStep(abilityId: 'DISABLE_ABILITY', ask: 'تعطيل', targets: _targets),
        ],
      );
      await t.pumpWidget(_screen(a, onSubmit: (p) async => sent.add(p)));
      await t.tap(find.text('عبدالله'));
      await t.pump();
      await t.tap(find.text('التالي ←'));
      await t.pump();
      await t.tap(find.text('→ رجوعٌ إلى الخطوة السابقة'));
      await t.pump();
      expect(find.text('اغتيال'), findsOneWidget);
      await t.tap(find.text('التالي ←'));
      await t.pump();
      await t.tap(find.text('خالد'));
      await t.pump();
      await t.tap(find.text('تأكيدُ الاختيارين'));
      await t.pump();
      expect(sent.first[0].targetPhysicalId, 3); // لم يضع
      expect(sent.first[1].targetPhysicalId, 7);
    });

    testWidgets('طبقةُ «تم الإرسال» تعلو الشاشة', (t) async {
      await t.pumpWidget(
          _screen(_one('PROTECT', 'مَن تحمي الليلة؟'), submitted: true));
      expect(find.text('تم الإرسال'), findsOneWidget);
    });

    testWidgets('لا خطوةَ ⇒ شاشةُ انتظار', (t) async {
      await t.pumpWidget(_screen(const OneNightAsk(steps: [])));
      expect(find.text('انتظرِ الصباح'), findsOneWidget);
    });

    testWidgets('قائمةٌ فارغة ⇒ نصٌّ صريحٌ لا شاشةٌ بيضاء', (t) async {
      await t.pumpWidget(_screen(const OneNightAsk(
        steps: [OneNightStep(abilityId: 'KILL', ask: 'اغتيال', targets: [])],
      )));
      expect(find.text('لا هدفَ متاحاً الليلة.'), findsOneWidget);
    });
  });

  group('🔒 التمويه — شاشةُ مَن لا دورَ له', () {
    testWidgets('لا تحمل أثراً يميّزها عن شاشة صاحب الدور', (t) async {
      // الفرقُ الوحيد المسموح: نصُّ السؤال وقائمةُ الأهداف — وكلاهما خادميّ.
      await t.pumpWidget(_screen(_one('KILL', 'اختر هدفَ الاغتيال')));
      final acting = t.widget<Container>(find.descendant(
        of: find.byType(OneNightOverlay),
        matching: find.byType(Container),
      ).first);

      await t.pumpWidget(_screen(_one(null, 'اختر لاعباً')));
      final idle = t.widget<Container>(find.descendant(
        of: find.byType(OneNightOverlay),
        matching: find.byType(Container),
      ).first);

      expect(idle.decoration, acting.decoration);
      // لا شارةَ خطواتٍ ولا زرَّ تخطٍّ ولا نصَّ «بلا دور»
      expect(find.textContaining('بلا دور'), findsNothing);
      expect(find.text('تخطٍّ — لا أحد'), findsNothing);
      expect(find.text('التالي ←'), findsNothing);
      // العنوانُ والتذييلُ نفسُهما
      expect(find.text('الليل'), findsOneWidget);
      expect(find.text('اختيارٌ واحدٌ في الليلة — ثمّ انتظرِ الصباح.'), findsOneWidget);
    });

    testWidgets('شارةُ الخطوتين لا تظهر إلّا لحاملِ قدرتين', (t) async {
      await t.pumpWidget(_screen(_one('SILENCE', 'مَن تُسكِت الليلة؟')));
      expect(find.textContaining('1 · '), findsNothing);
    });
  });
}
