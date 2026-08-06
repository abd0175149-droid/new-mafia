// ══════════════════════════════════════════════════════
// 🎴 توليد تركيبة الأدوار — §4.7 في الملفّ 30
// ══════════════════════════════════════════════════════
// الخوارزمية منقولة حرفياً عن `LeaderRoleConfigurator`، ومنطقٌ خالص بلا
// ودجت: هي القلب الذي يقرّر عدالة اللعبة، فتُختبَر وحدها.
//
// 🔴 المضيف يستطيع تعديل أيّ خانة بعد التوليد — هذه بذرةٌ لا قفل.

/// أدوار المافيا بترتيب دخولها.
const kMafiaOrder = <String>[
  'GODFATHER',
  'SILENCER',
  'CHAMELEON',
  'WITCH',
  'MAFIA_REGULAR',
];

/// أدوار المواطنين بترتيب دخولها.
/// العمدة **سادساً** عمداً: لا يدخل تلقائياً إلا بستّة مقاعد مواطنين.
const kCitizenOrder = <String>[
  'SHERIFF',
  'DOCTOR',
  'SNIPER',
  'POLICEWOMAN',
  'NURSE',
  'MAYOR',
  'CITIZEN',
];

const kMafiaRoles = <String>{
  'GODFATHER',
  'SILENCER',
  'CHAMELEON',
  'WITCH',
  'MAFIA_REGULAR',
  'OLDER_BROTHER',
};

const kNeutralRoles = <String>{'JESTER', 'ASSASSIN'};

bool isMafiaRole(String r) => kMafiaRoles.contains(r);
bool isNeutralRole(String r) => kNeutralRoles.contains(r);

/// إعدادات الأدوار الرقمية — حدودها وافتراضاتها من §4.7.
class RoleTuning {
  const RoleTuning({
    this.assassinContractCount = 4,   // 2–6
    this.mayorVoteWeight = 2,         // 1–4
    this.jesterSurviveRounds = 2,     // 1–6
    this.witchDisableRounds = 3,      // 1–6
  });

  final int assassinContractCount;
  final int mayorVoteWeight;
  final int jesterSurviveRounds;
  final int witchDisableRounds;

  RoleTuning copyWith({
    int? assassinContractCount,
    int? mayorVoteWeight,
    int? jesterSurviveRounds,
    int? witchDisableRounds,
  }) =>
      RoleTuning(
        assassinContractCount: assassinContractCount ?? this.assassinContractCount,
        mayorVoteWeight: mayorVoteWeight ?? this.mayorVoteWeight,
        jesterSurviveRounds: jesterSurviveRounds ?? this.jesterSurviveRounds,
        witchDisableRounds: witchDisableRounds ?? this.witchDisableRounds,
      );

  /// الحقول الاختيارية تُرسَل **فقط** إن كان دورها حاضراً — وإلا `undefined`
  /// كما ينصّ §4.7، وإرسال قيمةٍ لدورٍ غائب يربك الخادم.
  Map<String, dynamic> payloadFor(List<String> roles) => {
        if (roles.contains('ASSASSIN')) 'assassinContractCount': assassinContractCount,
        if (roles.contains('MAYOR')) 'mayorVoteWeight': mayorVoteWeight,
        if (roles.contains('JESTER')) 'jesterSurviveRounds': jesterSurviveRounds,
        if (roles.contains('WITCH')) 'witchDisableRounds': witchDisableRounds,
      };
}

/// يبني التركيبة الأولية لعدد اللاعبين الأحياء.
List<String> generateRoles(int playerCount) {
  if (playerCount <= 0) return const [];

  final totalMafia = (playerCount / 4).ceil();
  final hasJester = playerCount >= 8;
  final totalNeutral = hasJester ? 1 : 0;
  final totalCitizens = playerCount - totalMafia - totalNeutral;

  final roles = <String>[];

  // ما بعد آخر عنصر في الترتيب يتكرّر بالدور العاديّ.
  for (var i = 0; i < totalMafia; i++) {
    roles.add(i < kMafiaOrder.length ? kMafiaOrder[i] : 'MAFIA_REGULAR');
  }
  for (var i = 0; i < totalCitizens; i++) {
    roles.add(i < kCitizenOrder.length ? kCitizenOrder[i] : 'CITIZEN');
  }
  if (hasJester) roles.add('JESTER');

  return roles;
}

/// يبدّل آخر مواطن ↔ المهرج.
List<String> toggleJester(List<String> roles) {
  final out = [...roles];
  final at = out.lastIndexOf('JESTER');
  if (at >= 0) {
    out[at] = 'CITIZEN';
    return out;
  }
  final c = out.lastIndexOf('CITIZEN');
  if (c < 0) return out; // لا مواطن يُستبدَل — لا تغيير صامت
  out[c] = 'JESTER';
  return out;
}

/// يبدّل آخر مواطن ↔ السفّاح. متاحٌ من عشرة لاعبين فأكثر.
List<String> toggleAssassin(List<String> roles) {
  final out = [...roles];
  final at = out.lastIndexOf('ASSASSIN');
  if (at >= 0) {
    out[at] = 'CITIZEN';
    return out;
  }
  final c = out.lastIndexOf('CITIZEN');
  if (c < 0) return out;
  out[c] = 'ASSASSIN';
  return out;
}

/// التوأمان: أخٌ أكبر من المافيا وأصغر من المواطنين — يُضافان ويُزالان معاً.
List<String> toggleTwins(List<String> roles) {
  final out = [...roles];
  final older = out.lastIndexOf('OLDER_BROTHER');
  final younger = out.lastIndexOf('YOUNGER_BROTHER');

  if (older >= 0 || younger >= 0) {
    if (older >= 0) out[older] = 'MAFIA_REGULAR';
    if (younger >= 0) out[younger] = 'CITIZEN';
    return out;
  }

  final m = out.lastIndexOf('MAFIA_REGULAR');
  final c = out.lastIndexOf('CITIZEN');
  // 🔴 لا يُضاف نصف التوأمين: بلا الطرفين يصير الدور بلا معنىً لعبيّ.
  if (m < 0 || c < 0) return out;
  out[m] = 'OLDER_BROTHER';
  out[c] = 'YOUNGER_BROTHER';
  return out;
}
