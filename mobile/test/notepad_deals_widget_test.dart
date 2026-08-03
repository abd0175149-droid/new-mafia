import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/deals_sheet.dart';
import 'package:mafia_club/features/game/game_session_controller.dart';
import 'package:mafia_club/features/game/notepad_sheet.dart';
import 'package:mafia_club/models/game.dart';
import 'package:mafia_club/models/notepad.dart';

// ══════════════════════════════════════════════════════
// 🧪 المفكرة والاتفاقيات — تفاعلٌ حقيقيّ لا رسمٌ ساكن
// ══════════════════════════════════════════════════════

final c = GameSessionController.instance;

const _roster = [
  RosterPlayer(physicalId: 1, name: 'أحمد'),
  RosterPlayer(physicalId: 3, name: 'عبدالله'),
  RosterPlayer(physicalId: 5, name: 'سامي'),
  RosterPlayer(physicalId: 7, name: 'خالد'),
];

Widget _sheet(Widget child) => MediaQuery(
      data: const MediaQueryData(size: Size(500, 1000)),
      child: MaterialApp(home: child),
    );

void main() {
  setUp(() {
    c.resetForTest();
    c.primeForTest(roomId: '99', physicalId: 3, name: 'عبدالله', roster: _roster);
  });
  tearDownAll(c.resetForTest);

  // ══════════════════════════════════════════════════════
  group('📝 المفكرة', () {
    testWidgets('تفتح على تبويب الإضافة بلا هدف', (t) async {
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      expect(find.text('📝 مفكرة التحري'), findsOneWidget);
      expect(find.text('✏️ إضافة ملاحظة'), findsOneWidget);
      expect(
          find.textContaining('لاختيار لاعب — أو اترك فارغاً'), findsOneWidget);
    });

    testWidgets('🔒 تبويب التشاور لا يظهر لغير المؤهَّل', (t) async {
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      expect(find.text('🗣️ التشاور'), findsNothing);
    });

    testWidgets('🔴 ويظهر للمافيويّ الحيّ والعلم مرفوع', (t) async {
      c.primeForTest(role: 'SILENCER', chatEnabled: true);
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      expect(find.text('🗣️ التشاور'), findsOneWidget);
    });

    testWidgets('🔒 ويختفي فور موته', (t) async {
      c.primeForTest(role: 'SILENCER', chatEnabled: true, dead: true);
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      expect(find.text('🗣️ التشاور'), findsNothing);
    });

    testWidgets('حبّة الاختيار السريع تربط اللاعب وتغيّر النائب', (t) async {
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('خالد').last);
      await t.pump();
      expect(find.text('مقعد #7'), findsOneWidget);
      expect(find.text('ملاحظتك عن خالد...'), findsOneWidget);
      expect(find.text('💾 حفظ عن خالد'), findsOneWidget);
    });

    testWidgets('إلغاء الربط يعيدها عامّة', (t) async {
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('سامي').last);
      await t.pump();
      expect(find.text('💾 حفظ عن سامي'), findsOneWidget);
      await t.tap(find.text('✕').last);
      await t.pump();
      expect(find.text('💾 حفظ ملاحظة عامة'), findsOneWidget);
    });

    testWidgets('🔴 الحفظ يكتب الملاحظة وينتقل للعرض', (t) async {
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('خالد').last);
      await t.pump();
      await t.enterText(find.byType(TextField).first, 'يتهرّب من الأسئلة');
      await t.pump();
      await t.tap(find.text('💾 حفظ عن خالد'));
      await t.pumpAndSettle();

      expect(c.notepad.noteOf(7).text, 'يتهرّب من الأسئلة');
      expect(find.text('يتهرّب من الأسئلة'), findsOneWidget);
      expect(find.text('📋 عرض الملاحظات (1)'), findsOneWidget);
    });

    testWidgets('حفظُ ملاحظةٍ فارغة ممنوع — الزرّ معطّل', (t) async {
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('💾 حفظ ملاحظة عامة'));
      await t.pump();
      expect(c.notepad.hasAny, isFalse);
    });

    testWidgets('🔴 التصنيف يُحفظ — وضغطُه ثانيةً يُلغيه', (t) async {
      c.primeForTest(
          notepad: const Notepad()
              .withNote(7, const PlayerNote(text: 'مريب')));
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('📋 عرض الملاحظات (1)'));
      await t.pumpAndSettle();

      await t.tap(find.text('🔴 مافيا'));
      await t.pump();
      expect(c.notepad.noteOf(7).suspicion, Suspicion.mafia);

      // ضغطُ النشط يعيده إلى «غير محدّد» — لا حالة عالقة
      await t.tap(find.text('🔴 مافيا'));
      await t.pump();
      expect(c.notepad.noteOf(7).suspicion, Suspicion.none);
      // والنصّ باقٍ
      expect(c.notepad.noteOf(7).text, 'مريب');
    });

    testWidgets('تصنيفٌ بلا نصّ يُصرَّح به', (t) async {
      c.primeForTest(
          notepad: const Notepad()
              .withNote(5, const PlayerNote(suspicion: Suspicion.safe)));
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('📋 عرض الملاحظات (1)'));
      await t.pumpAndSettle();
      expect(find.text('لا يوجد نص — فقط تصنيف'), findsOneWidget);
    });

    testWidgets('الحذف يزيل البطاقة', (t) async {
      c.primeForTest(
          notepad: const Notepad().withNote(7, const PlayerNote(text: 'x')));
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('📋 عرض الملاحظات (1)'));
      await t.pumpAndSettle();
      await t.tap(find.text('🗑️ حذف'));
      await t.pumpAndSettle();
      expect(c.notepad.hasAny, isFalse);
      expect(find.text('لا توجد ملاحظات مسجّلة بعد'), findsOneWidget);
    });

    testWidgets('🔒 مسح الكلّ يسأل أوّلاً — والإلغاء لا يمسح', (t) async {
      c.primeForTest(
          notepad: const Notepad().withNote(7, const PlayerNote(text: 'x')));
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('📋 عرض الملاحظات (1)'));
      await t.pumpAndSettle();
      await t.tap(find.text('🗑️ مسح كل الملاحظات'));
      await t.pumpAndSettle();
      expect(
          find.textContaining('هل أنت متأكد من مسح جميع الملاحظات'),
          findsOneWidget);

      await t.tap(find.text('إلغاء'));
      await t.pumpAndSettle();
      expect(c.notepad.hasAny, isTrue);
    });

    testWidgets('والتأكيد يمسح', (t) async {
      c.primeForTest(
          notepad: const Notepad().withNote(7, const PlayerNote(text: 'x')));
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('📋 عرض الملاحظات (1)'));
      await t.pumpAndSettle();
      await t.tap(find.text('🗑️ مسح كل الملاحظات'));
      await t.pumpAndSettle();
      await t.tap(find.text('مسح').last);
      await t.pumpAndSettle();
      expect(c.notepad.hasAny, isFalse);
    });

    testWidgets('🗣️ فقاعات التشاور تفرّق بيني وبين شركائي', (t) async {
      c.primeForTest(role: 'SILENCER', chatEnabled: true, chat: const [
        MafiaChatMessage(
            physicalId: 3, name: 'عبدالله', text: 'أنا', atMs: 1785700000000),
        MafiaChatMessage(
            physicalId: 4, name: 'شريكي', text: 'هو', atMs: 1785700060000),
      ]);
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('🗣️ التشاور'));
      await t.pumpAndSettle();

      expect(find.text('أنا'), findsOneWidget);
      expect(find.text('هو'), findsOneWidget);
      // رسالتي تبدأ من حافة البداية، وشريكي من النهاية
      final mine = t.getTopLeft(find.text('أنا')).dx;
      final his = t.getTopLeft(find.text('هو')).dx;
      expect(mine, greaterThan(his));
    });

    testWidgets('تشاورٌ فارغ يدعو للبدء لا يترك فراغاً', (t) async {
      c.primeForTest(role: 'GODFATHER', chatEnabled: true);
      await t.pumpWidget(_sheet(NotepadSheet(controller: c)));
      await t.tap(find.text('🗣️ التشاور'));
      await t.pumpAndSettle();
      expect(find.text('لا رسائل بعد — ابدأ التشاور'), findsOneWidget);
    });
  });

  // ══════════════════════════════════════════════════════
  group('🤝 ورقة الاتفاقيات', () {
    Future<void> open(WidgetTester t) async {
      await t.pumpWidget(_sheet(
        Scaffold(body: Center(child: DealsButton(controller: c))),
      ));
      await t.tap(find.text('🤝 الاتفاقيات'));
      await t.pumpAndSettle();
    }

    testWidgets('العدّاد على الزرّ يعكس عدد الاتفاقيات', (t) async {
      c.primeForTest(round: 2, deals: const [
        Deal(id: 'a', initiatorPhysicalId: 5, targetPhysicalId: 6),
      ]);
      await t.pumpWidget(_sheet(
        Scaffold(body: Center(child: DealsButton(controller: c))),
      ));
      expect(find.text('1/3'), findsOneWidget);
    });

    testWidgets('🔒 الجولة الأولى ⇒ سبب المنع لا نموذج', (t) async {
      c.primeForTest(round: 1);
      await open(t);
      expect(find.text('🔒 ميزة الديل (Deals)'), findsOneWidget);
      expect(
          find.textContaining('غير متاحة في الجولة الأولى'), findsOneWidget);
      expect(find.text('🤝 إبرام اتفاقية'), findsNothing);
    });

    testWidgets('🔒 القفل عبر الجولات يُشرَح', (t) async {
      c.primeForTest(round: 3, dealLocked: const [3]);
      await open(t);
      expect(find.textContaining('لا تسجيل في جولتين متتاليتين'),
          findsOneWidget);
    });

    testWidgets('🔒 بلوغ الثلاث يمنع', (t) async {
      c.primeForTest(round: 2, deals: const [
        Deal(id: 'a', initiatorPhysicalId: 5, targetPhysicalId: 6),
        Deal(id: 'b', initiatorPhysicalId: 7, targetPhysicalId: 8),
        Deal(id: 'c', initiatorPhysicalId: 9, targetPhysicalId: 10),
      ]);
      await open(t);
      expect(find.textContaining('للحد الأقصى'), findsOneWidget);
    });

    testWidgets('الجولة الثانية بلا موانع ⇒ نموذج الإنشاء', (t) async {
      c.primeForTest(round: 2);
      await open(t);
      expect(find.text('🤝 إبرام اتفاقية'), findsOneWidget);
      expect(find.text('أحمد'), findsOneWidget);
      expect(find.text('خالد'), findsOneWidget);
      // أنا لستُ في القائمة
      expect(find.text('عبدالله'), findsNothing);
    });

    testWidgets('🔴 المستهدَف يبقى مرئياً معطَّلاً بلاحقةٍ صريحة', (t) async {
      c.primeForTest(round: 2, deals: const [
        Deal(id: 'a', initiatorPhysicalId: 1, targetPhysicalId: 7),
      ]);
      await open(t);
      expect(find.text('خالد'), findsOneWidget);
      expect(find.text('مستهدف 🔒'), findsOneWidget);
    });

    testWidgets('اختيار لاعبٍ يُفعّل الزرّ', (t) async {
      c.primeForTest(round: 2);
      await open(t);
      await t.tap(find.text('سامي'));
      await t.pump();
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
    });

    testWidgets('🔴 اتفاقيتي تُعرض بشريكها وتحذيرِ مخاطرتها', (t) async {
      c.primeForTest(round: 2, deals: const [
        Deal(id: 'mine', initiatorPhysicalId: 3, targetPhysicalId: 7),
      ]);
      await open(t);
      expect(find.text('🤝 تم إبرام اتفاقيتك بنجاح!'), findsOneWidget);
      expect(find.textContaining('خالد'), findsWidgets);
      expect(find.text('❌ إلغاء الاتفاقية'), findsOneWidget);
      expect(find.textContaining('فسيتم إقصاؤك معه تلقائياً'), findsOneWidget);
    });

    testWidgets('🔒 اتفاقيةٌ أنا هدفُها ليست اتفاقيتي', (t) async {
      // من استُهدف لا يملك إلغاءها — المبادر وحده يملك
      c.primeForTest(round: 2, deals: const [
        Deal(id: 'x', initiatorPhysicalId: 5, targetPhysicalId: 3),
      ]);
      await open(t);
      expect(find.text('❌ إلغاء الاتفاقية'), findsNothing);
      expect(find.text('🤝 إبرام اتفاقية'), findsOneWidget);
    });
  });
}
