import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/night_view.dart';
import 'package:mafia_club/models/night.dart';

// ══════════════════════════════════════════════════════
// 🧪 مرحلة الليل — الملفّ ٢٣
// ══════════════════════════════════════════════════════

const _targets = [
  NightTarget(physicalId: 3, name: 'عبدالله'),
  NightTarget(physicalId: 7, name: 'خالد'),
];

Widget _wrap(Widget child, {Size size = const Size(400, 800)}) => MediaQuery(
      data: MediaQueryData(size: size),
      child: MaterialApp(home: child),
    );

Widget _screen(NightActionRequest r,
        {int countdown = 15, bool submitted = false}) =>
    _wrap(NightActionOverlay(
      request: r,
      countdown: countdown,
      submitted: submitted,
      onPick: (_) {},
      onSkip: () {},
    ));

void main() {
  group('عنوان الخطوة — الخريطة الحرفية', () {
    test('الأدوار المترجَمة', () {
      expect(nightStepTitle('MAFIA'), 'المافيا');
      expect(nightStepTitle('GODFATHER'), 'العراب');
      expect(nightStepTitle('SILENCER'), 'المُسكت');
      expect(nightStepTitle('SHERIFF'), 'المحقق');
      expect(nightStepTitle('DOCTOR'), 'الطبيب');
      expect(nightStepTitle('NURSE'), 'الممرضة');
      expect(nightStepTitle('SNIPER'), 'القناص');
      expect(nightStepTitle('CHAMELEON'), 'الحرباء');
    });

    test('🔒 غير المترجَم يبقى خاماً — الترجمة من طرفٍ واحد تكشف التمويه',
        () {
      // العنوان يجب أن يكون واحداً عند صاحب الدور والمموِّه. لو ترجمنا
      // WITCH وحدنا لاختلفت الشاشتان عن الويب — ولانكشف الفرق بالمقارنة.
      expect(nightStepTitle('WITCH'), 'WITCH');
      expect(nightStepTitle('ASSASSIN'), 'ASSASSIN');
      expect(nightStepTitle('MAFIA_REGULAR'), 'MAFIA_REGULAR');
    });

    test('بلا دورٍ ⇒ مجهول', () {
      expect(nightStepTitle(null), 'مجهول');
      expect(nightStepTitle(''), 'مجهول');
    });
  });

  group('تعليمة الإجراء', () {
    test('لكلّ نوعٍ نصّه', () {
      String f(String t) =>
          nightInstruction(NightActionRequest(actionType: t));
      expect(f('KILL'), 'اختر هدف الاغتيال');
      expect(f('INVESTIGATE'), 'من تريد التحقيق معه؟');
      expect(f('PROTECT'), 'من تريد حمايته الليلة؟');
      expect(f('SNIPE'), 'اختر هدف القنص');
      expect(f('SILENCE'), 'من تريد إسكاته؟');
      expect(f('DISABLE'), 'اختر لاعباً لتعطيل قدرته');
      expect(f('DECOY'), 'اختر أي شخص');
    });

    test('🔒 المموِّه أوّلاً مهما كان النوع', () {
      expect(
          nightInstruction(
              const NightActionRequest(actionType: 'KILL', isDecoy: true)),
          'اختر أي شخص للتمويه...');
    });

    test('⚠️ نوعٌ غير مغطّى ⇒ فراغ — لا نصّ مخترَع', () {
      expect(
          nightInstruction(const NightActionRequest(actionType: 'ASSASSINATE')),
          '');
    });
  });

  group('🔒 زرّ التخطّي', () {
    test('لصاحب الدور المخوَّل وحده', () {
      expect(
          const NightActionRequest(actionType: 'SILENCE', canSkip: true)
              .showSkip,
          isTrue);
      expect(
          const NightActionRequest(actionType: 'KILL', canSkip: false).showSkip,
          isFalse);
    });

    test('المموِّه لا يراه ولو وصله canSkip', () {
      // مموِّهٌ يتخطّى يكشف نفسه فوراً أمام من يراقب شاشته
      expect(
          const NightActionRequest(
                  actionType: 'SILENCE', canSkip: true, isDecoy: true)
              .showSkip,
          isFalse);
    });
  });

  group('الحمولة', () {
    test('تُقرأ كاملةً', () {
      final r = NightActionRequest.fromJson(const {
        'actionType': 'KILL',
        'availableTargets': [
          {'physicalId': 3, 'name': 'عبدالله', 'avatarUrl': '/u/a.jpg'},
          {'physicalId': 7, 'name': 'خالد'},
        ],
        'timeoutSeconds': 20,
        'canSkip': true,
        'stepRole': 'GODFATHER',
        'isDecoy': false,
      })!;
      expect(r.availableTargets.length, 2);
      expect(r.availableTargets.first.avatarUrl, '/u/a.jpg');
      expect(r.availableTargets.last.avatarUrl, isNull);
      expect(r.timeoutSeconds, 20);
    });

    test('مهلةٌ غائبة ⇒ ١٥', () {
      expect(
          NightActionRequest.fromJson(const {'actionType': 'KILL'})!
              .timeoutSeconds,
          15);
    });

    test('حمولةٌ بلا نوعٍ تُرفض بدل فتح شاشةٍ عمياء', () {
      expect(NightActionRequest.fromJson(const {}), isNull);
      expect(NightActionRequest.fromJson(null), isNull);
      expect(NightActionRequest.fromJson(const {'actionType': ''}), isNull);
    });

    test('هدفٌ بلا رقمٍ يُسقَط ولا يُسقِط البقية', () {
      final t = NightTarget.listOf(const [
        {'name': 'بلا رقم'},
        {'physicalId': 5, 'name': 'سالم'},
      ]);
      expect(t.length, 1);
      expect(t.single.physicalId, 5);
    });

    test('اسمٌ فارغ يُعوَّض برقم المقعد', () {
      expect(const NightTarget(physicalId: 9).displayName, 'لاعب #9');
    });
  });

  group('إعادة البناء بعد الاستعادة — §6.8', () {
    const state = {
      'playerSubmitted': false,
      'autoNightPerformerId': 3,
      'autoNightStepRole': 'SHERIFF',
      'nightStep': {
        'availableTargets': [
          {'physicalId': 7, 'name': 'خالد'}
        ],
        'canSkip': true,
      },
      'config': {'autoNightTime': 20},
    };

    test('صاحب الدور يستعيد نوعه الحقيقيّ', () {
      final r = nightFromResume(state, 3)!;
      expect(r.actionType, 'INVESTIGATE');
      expect(r.isDecoy, isFalse);
      expect(r.canSkip, isTrue);
      expect(r.timeoutSeconds, 20);
    });

    test('غيره يستعيد DECOY', () {
      final r = nightFromResume(state, 9)!;
      expect(r.actionType, 'DECOY');
      expect(r.isDecoy, isTrue);
      expect(r.showSkip, isFalse);
      // العنوان واحدٌ للاثنين — هنا يقوم التمويه
      expect(nightStepTitle(r.stepRole), nightStepTitle('SHERIFF'));
    });

    test('🔴 من أرسل فعله لا تُفتح شاشته ثانيةً', () {
      // بدون هذا الشرط يعيد الاستعلامُ فتحَ الشاشة بعد إرسالٍ ناجح
      // فيرسل اللاعب مرّتين لنفس الخطوة.
      expect(nightFromResume({...state, 'playerSubmitted': true}, 3), isNull);
    });

    test('اشتقاق النوع لكلّ دور', () {
      String f(String role, int me) =>
          nightFromResume({...state, 'autoNightStepRole': role}, me)!.actionType;
      expect(f('DOCTOR', 3), 'PROTECT');
      expect(f('NURSE', 3), 'PROTECT');
      expect(f('SNIPER', 3), 'SNIPE');
      expect(f('WITCH', 3), 'DISABLE');
      expect(f('GODFATHER', 3), 'KILL');
    });

    test('حالةٌ ناقصة لا تُسقط التطبيق', () {
      expect(nightFromResume(null, 3), isNull);
      expect(nightFromResume(const {}, 3)!.actionType, 'DECOY');
    });
  });

  group('🔒 تطابق شاشتَي المموِّه وصاحب الدور', () {
    testWidgets('العنوان والعدّاد متطابقان — والفرق في التعليمة وحدها',
        (t) async {
      const real = NightActionRequest(
          actionType: 'KILL',
          stepRole: 'GODFATHER',
          canSkip: true,
          availableTargets: _targets);
      const decoy = NightActionRequest(
          actionType: 'KILL',
          stepRole: 'GODFATHER',
          canSkip: true,
          isDecoy: true,
          availableTargets: _targets);

      await t.pumpWidget(_screen(real));
      await t.pump();
      final realTitle = t.getRect(find.text('العراب'));
      final realDial = t.getRect(find.text('15'));
      expect(find.text('اختر هدف الاغتيال'), findsOneWidget);
      expect(find.text('تخطي هذه الخطوة ←'), findsOneWidget);

      await t.pumpWidget(_screen(decoy));
      await t.pump();
      expect(t.getRect(find.text('العراب')), realTitle);
      expect(t.getRect(find.text('15')), realDial);
      expect(find.text('اختر أي شخص للتمويه...'), findsOneWidget);
      expect(find.text('تخطي هذه الخطوة ←'), findsNothing);
    });
  });

  group('الشاشة', () {
    testWidgets('الأهداف تُرسم بأسمائها', (t) async {
      await t.pumpWidget(_screen(const NightActionRequest(
          actionType: 'PROTECT',
          stepRole: 'DOCTOR',
          availableTargets: _targets)));
      await t.pump();
      expect(find.text('عبدالله'), findsOneWidget);
      expect(find.text('خالد'), findsOneWidget);
      expect(find.text('#3'), findsOneWidget);
    });

    testWidgets('اللمس يمرّر الهدف الصحيح', (t) async {
      int? picked;
      await t.pumpWidget(_wrap(NightActionOverlay(
        request: const NightActionRequest(
            actionType: 'KILL', availableTargets: _targets),
        countdown: 12,
        submitted: false,
        onPick: (x) => picked = x.physicalId,
        onSkip: () {},
      )));
      await t.pump();
      await t.tap(find.text('خالد'));
      expect(picked, 7);
    });

    testWidgets('طبقة «تم الإرسال» تغطّي الشاشة', (t) async {
      await t.pumpWidget(_screen(
          const NightActionRequest(
              actionType: 'KILL', availableTargets: _targets),
          submitted: true));
      await t.pump();
      expect(find.text('تم الإرسال'), findsOneWidget);
      expect(find.text('WAITING FOR RESULTS...'), findsOneWidget);
    });

    testWidgets('بلا أهدافٍ لا نصّ بديل مخترَع', (t) async {
      await t.pumpWidget(_screen(const NightActionRequest(actionType: 'KILL')));
      await t.pump();
      expect(find.byType(ListView), findsOneWidget);
      expect(find.textContaining('لا يوجد'), findsNothing);
    });

    testWidgets('الشاشة السلبية: الصندوق يظهر بدور الخطوة فقط', (t) async {
      await t.pumpWidget(_wrap(const Scaffold(body: PassiveNightBody())));
      await t.pump();
      expect(find.text('الليل يسدل ستاره'), findsOneWidget);
      expect(find.textContaining('جارٍ اختيار الهدف'), findsNothing);

      await t.pumpWidget(
          _wrap(const Scaffold(body: PassiveNightBody(stepRoleName: 'الطبيب'))));
      await t.pump();
      expect(find.text('جارٍ اختيار الهدف من قبل الطبيب...'), findsOneWidget);
    });

    testWidgets('مودال الممرضة: زرّان بنصّيهما', (t) async {
      bool? answer;
      await t.pumpWidget(
          _wrap(NurseActivationModal(onRespond: (v) => answer = v)));
      await t.pump();
      expect(find.text('الممرضة'), findsOneWidget);
      expect(
          find.text('الطبيب غير متاح هذه الليلة.\nهل تريدين تفعيل صلاحية الحماية؟'),
          findsOneWidget);
      await t.tap(find.text('نعم، أريد الحماية'));
      expect(answer, isTrue);
      await t.tap(find.text('لا، تخطي'));
      expect(answer, isFalse);
    });
  });
}
