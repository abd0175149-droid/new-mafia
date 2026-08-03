import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/features/game/roles_info_modal.dart';
import 'package:mafia_club/models/card_template.dart';

// ══════════════════════════════════════════════════════
// 🧪 موسوعة الأدوار — §4.7 في الملفّ ٢٢
// ══════════════════════════════════════════════════════

const _roles = <RoleDef>[
  RoleDef(
      id: 'GODFATHER',
      nameAr: 'شيخ المافيا',
      nameEn: 'Godfather',
      team: 'MAFIA',
      genPriority: 1,
      description: 'زعيم المافيا — يختار الضحية كل ليلة.'),
  RoleDef(
      id: 'DOCTOR',
      nameAr: 'الطبيب',
      nameEn: 'Doctor',
      team: 'CITIZEN',
      genPriority: 3,
      description: 'يحمي لاعباً كل ليلة.'),
  RoleDef(
      id: 'SHERIFF',
      nameAr: 'الشريف',
      nameEn: 'Sheriff',
      team: 'CITIZEN',
      genPriority: 2),
  RoleDef(
      id: 'JESTER',
      nameAr: 'المهرج',
      nameEn: 'Jester',
      team: 'NEUTRAL',
      genPriority: 9,
      description: 'يفوز وحده إن أُقصي بالتصويت.',
      winConditionType: 'LYNCHED',
      winConditionDescription: 'يفوز إن صوّتت عليه القرية'),
];

Widget _wrap(Future<List<RoleDef>> f) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: RolesInfoModal(rolesFuture: f),
      ),
    );

void main() {
  group('سطر شرط الفوز', () {
    test('الوصف يسبق النوع الخام', () {
      expect(_roles.last.winLine, 'يفوز إن صوّتت عليه القرية');
    });

    test('بلا وصفٍ يُعرض النوع — لا فراغ', () {
      const r = RoleDef(id: 'ASSASSIN', winConditionType: 'CONTRACTS');
      expect(r.winLine, 'CONTRACTS');
    });

    test('دورٌ بلا شرطٍ لا يعرض الصندوق أصلاً', () {
      expect(const RoleDef(id: 'CITIZEN').winLine, isNull);
    });
  });

  test('🔴 الأدوار تصل بحقول الموسوعة كاملةً', () {
    // الانحدار المحتمل: قراءة الاسم العربيّ وحده تُفقد الوصف وشرط الفوز
    // والأولوية — فتظهر الموسوعة بطاقاتٍ بلا محتوى.
    final r = RoleDef.fromJson(const {
      'id': 'JESTER',
      'nameAr': 'المهرج',
      'nameEn': 'Jester',
      'team': 'NEUTRAL',
      'genPriority': 9,
      'description': 'يفوز وحده.',
      'winConditionType': 'LYNCHED',
      'winConditionDescription': 'يفوز إن صوّتت عليه القرية',
    });
    expect(r.nameEn, 'Jester');
    expect(r.description, 'يفوز وحده.');
    expect(r.genPriority, 9);
    expect(r.isNeutral, isTrue);
    expect(r.winLine, 'يفوز إن صوّتت عليه القرية');
  });

  group('المودال', () {
    testWidgets('الأقسام بالترتيب الثابت: مافيا ← مواطنون ← مستقلّون',
        (t) async {
      await t.pumpWidget(_wrap(Future.value(_roles)));
      await t.pumpAndSettle();

      final mafia = t.getTopLeft(find.text('فريق المافيا')).dy;
      final citizen = t.getTopLeft(find.text('فريق المواطنين')).dy;
      final neutral = t.getTopLeft(find.text('الأدوار المستقلة')).dy;
      expect(mafia, lessThan(citizen));
      expect(citizen, lessThan(neutral));
    });

    testWidgets('عدّاد كلّ قسمٍ يعكس أدواره', (t) async {
      await t.pumpWidget(_wrap(Future.value(_roles)));
      await t.pumpAndSettle();
      expect(find.text('(1)'), findsNWidgets(2)); // مافيا ومستقلّون
      expect(find.text('(2)'), findsOneWidget); // مواطنون
    });

    testWidgets('قسمٌ فارغ يُتخطّى — لا رأسٌ بلا بطاقات', (t) async {
      await t.pumpWidget(_wrap(Future.value(
          _roles.where((r) => r.team == 'MAFIA').toList())));
      await t.pumpAndSettle();
      expect(find.text('فريق المافيا'), findsOneWidget);
      expect(find.text('فريق المواطنين'), findsNothing);
      expect(find.text('الأدوار المستقلة'), findsNothing);
    });

    testWidgets('دورٌ بلا وصفٍ يُصرَّح به لا يُترك فارغاً', (t) async {
      await t.pumpWidget(_wrap(Future.value(_roles)));
      await t.pumpAndSettle();
      expect(find.text('لا يوجد وصف'), findsOneWidget); // الشريف
      expect(find.text('يحمي لاعباً كل ليلة.'), findsOneWidget);
    });

    testWidgets('شرط الفوز يظهر بكأسه للمستقلّ وحده', (t) async {
      await t.pumpWidget(_wrap(Future.value(_roles)));
      await t.pumpAndSettle();
      expect(find.text('🏆 يفوز إن صوّتت عليه القرية'), findsOneWidget);
    });

    testWidgets('فشل الجلب يُعلَن — لا مودالٌ فارغ', (t) async {
      // ⚠️ `Future.error` جاهزةً يرتدّ خطؤها قبل أن يشترك FutureBuilder
      //    فيُعدّ غير مُلتقَط. التأجيل بإطارٍ واحدٍ يكفي.
      await t.pumpWidget(_wrap(Future<List<RoleDef>>.delayed(
          Duration.zero, () => throw Exception('offline'))));
      await t.pumpAndSettle();
      expect(find.text('تعذّر تحميل الأدوار'), findsOneWidget);
    });

    testWidgets('قائمةٌ فارغة تُعامَل كفشل', (t) async {
      await t.pumpWidget(_wrap(Future.value(const <RoleDef>[])));
      await t.pumpAndSettle();
      expect(find.text('تعذّر تحميل الأدوار'), findsOneWidget);
    });
  });
}
