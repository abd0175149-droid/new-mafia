import 'package:flutter_test/flutter_test.dart';
import 'package:mafia_club/models/card_template.dart';

// ══════════════════════════════════════════════════════
// 🧪 تعريفُ الدور — حقولُ الموسوعة وسطرُ شرط الفوز
//
// 🔴 كان هذا الملفّ يفحص `RolesInfoModal` أيضاً، وقد حلّ محلَّه دليلُ الكروت
//    (`roles_deck_sheet.dart`) الذي يقرأ من `RolesGuideService` — أي من
//    الشبكة. فحصُه يحتاج تزييفَ الخدمة، وإبقاءُ فحوصِ المودال المحذوف كان
//    يُبقي المجموعةَ حمراء بلا أن يحرس شيئاً. ما بقي هنا يفحص النموذج،
//    وهو ما لم يتغيّر.
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
}
