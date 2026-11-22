// ══════════════════════════════════════════════════════
// 🕴️ غرفة التدريب — السيناريو (منقولٌ حرفيّاً من script.ts في الويب، 2026-11-22)
//
// طاولةٌ من عشرة: المتدرّب في المقعد ٥ وتسعة لاعبين آليّين بأسماءٍ مصطنعة. لا شيء هنا
// يمسّ محرّك اللعبة: دوالّ نقيّة تحسب ما يحتاجه عرضُ واجهة الغرفة الحقيقيّة.
//
// قاعدتان للتدريب:
//   • «همسة تدريب» تدلّ المتدرّب على هدفٍ يُريه قدرته تعمل من أوّل مرّة.
//   • القاعة تميل مع صوته: من صوّت عليه يصير صاحب أعلى الأصوات، فيصل دائماً إلى
//     التبرير وزرّ سحب الصوت (لا حالةَ تعلّمها الجولة تتوقّف على اختيارٍ محظوظ).
// ══════════════════════════════════════════════════════

const int kMe = 5;
const List<int> kSeats = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const Map<int, String> kBotNames = {1: 'أحمد', 2: 'سارة', 3: 'يزن', 4: 'ليلى', 6: 'رنا', 7: 'عمر', 8: 'هند', 9: 'دانة', 10: 'فارس'};
const String kRoomCode = '0101';
const String kGameName = 'ليلة تجريبيّة';

const _mafia = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'];
const _neutral = ['JESTER', 'ASSASSIN'];
bool isMafia(String r) => _mafia.contains(r);
String teamOf(String r) => _mafia.contains(r) ? 'MAFIA' : _neutral.contains(r) ? 'NEUTRAL' : 'CITIZEN';

/// الأدوار التي يُعرض اختيارها في «جرّب دوراً آخر» — بترتيب العرض
const List<String> kPlayableRoles = [
  'SHERIFF', 'DOCTOR', 'SNIPER', 'CITIZEN', 'NURSE', 'MAYOR', 'POLICEWOMAN', 'PHOENIX', 'YOUNGER_BROTHER',
  'GODFATHER', 'MAFIA_REGULAR', 'SILENCER', 'WITCH', 'CHAMELEON', 'OLDER_BROTHER', 'ASSASSIN', 'JESTER',
];

/// تركيبة الطاولة: ثلاثة مافيا دائماً، ودور المتدرّب يحلّ محلّ نظيره الآليّ
Map<int, String> tableOf(String role) {
  final t = <int, String>{1: 'DOCTOR', 2: 'CITIZEN', 3: 'GODFATHER', 4: 'SHERIFF', 6: 'CITIZEN', 7: 'MAFIA_REGULAR', 8: 'CITIZEN', 9: 'MAFIA_REGULAR', 10: 'CITIZEN'};
  if (isMafia(role)) { t[7] = 'CITIZEN'; if (role == 'GODFATHER') t[3] = 'MAFIA_REGULAR'; }
  if (role == 'DOCTOR') t[1] = 'CITIZEN';
  if (role == 'SHERIFF') t[4] = 'CITIZEN';
  if (role == 'OLDER_BROTHER') t[8] = 'YOUNGER_BROTHER';
  if (role == 'YOUNGER_BROTHER') t[7] = 'OLDER_BROTHER';
  t[kMe] = role;
  return t;
}

({int mafia, int citizen, int neutral}) teamCounts(String role, List<int> dead) {
  final t = tableOf(role);
  var m = 0, c = 0, n = 0;
  for (final s in kSeats) {
    if (dead.contains(s)) continue;
    switch (teamOf(t[s]!)) {
      case 'MAFIA': m++;
      case 'CITIZEN': c++;
      default: n++;
    }
  }
  return (mafia: m, citizen: c, neutral: n);
}

/// شركاء المتدرّب إن كان مافيا
List<int> matesOf(String role) { final t = tableOf(role); return kSeats.where((s) => s != kMe && isMafia(t[s]!)).toList(); }
/// الأدوار الحاضرة على الطاولة — لدليل الأدوار
List<String> rolesInPlay(String role) { final t = tableOf(role); return {for (final s in kSeats) t[s]!}.toList(); }

// ── الليل ──
const Map<String, ({int seat, String text})> _hints = {
  'SHERIFF': (seat: 3, text: 'حقّق مع يزن #3 وانظر ماذا يصلك في الصباح.'),
  'DOCTOR': (seat: 6, text: 'المافيا تقصد رنا #6 الليلة. احمِها — ويحقّ لك أن تحمي نفسك أيضاً.'),
  'NURSE': (seat: 6, text: 'الطبيب حيّ، فقدرتك نائمة. اختاري أيّ لاعبٍ وأكّدي؛ اختيارك للتمويه.'),
  'SNIPER': (seat: 3, text: 'يزن #3 مافيا. اقنصه، أو اضغط «تخطٍّ» لتحفظ طلقتك — التخطّي يعمل لك وحدك.'),
  'GODFATHER': (seat: 6, text: 'أنت من يضغط باسم المافيا. اختر هدف الليلة — ولمسُ شريكَيك لا يفعل شيئاً.'),
  'SILENCER': (seat: 4, text: 'أسكِت ليلى #4، فلا تتكلّم في نقاش الغد. شريكاك لا يُلمسان.'),
  'WITCH': (seat: 1, text: 'عطّلي أحمد #1 — هو الطبيب، فلا يحمي أحداً هذه الجولة.'),
  'ASSASSIN': (seat: 4, text: 'عقدك الأوّل «اغتل الشريف». الشريف على هذه الطاولة ليلى #4.'),
};

({int seat, String text}) nightHint(String role) {
  final h = _hints[role];
  if (h != null) return h;
  if (isMafia(role)) return (seat: 8, text: 'الاغتيال بيد الشيخ. أنت تختار للتمويه — ولمسُ شريكَيك لا يفعل شيئاً.');
  return (seat: 8, text: 'لا قدرةَ ليليّةً لدورك، ومع ذلك تختار وتؤكّد مثل الجميع؛ كي لا يُعرف من يملك قدرة.');
}

/// ما يرسله الخادم لقدرتك: النفسُ مسموحةٌ للحماية والإسكات وحدهما، وشركاء المافيا لا يُلمسون
List<int> allowedTargets(String role) {
  final t = tableOf(role);
  final selfOk = const ['DOCTOR', 'NURSE', 'SILENCER'].contains(role);
  return kSeats.where((s) => (s != kMe || selfOk) && !(isMafia(role) && s != kMe && isMafia(t[s]!))).toList();
}

/// دورٌ بلا قدرةٍ ليليّة يختار للتمويه (abilityId = null)
bool hasNightAbility(String role) => const ['SHERIFF', 'DOCTOR', 'SNIPER', 'GODFATHER', 'SILENCER', 'WITCH', 'ASSASSIN'].contains(role);

class NightResult {
  const NightResult({required this.pick, required this.target, required this.saved, required this.dead, this.miss = false, this.hit = false, this.contract = false, this.sheriffMafia = false});
  /// اختيار المتدرّب — null = تخطّى (القنّاص)
  final int? pick;
  /// هدف المافيا
  final int target;
  final bool saved;
  final List<int> dead;
  final bool miss, hit, contract, sheriffMafia;
}

/// [picked]: `kNoPick` = لم يختر بعد · null = تخطّى · رقم = مقعد
const int kNoPick = -1;

NightResult resolveNight(String role, int? picked) {
  final t = tableOf(role);
  final pick = picked == kNoPick ? nightHint(role).seat : picked;
  final target = role == 'GODFATHER' && pick != null ? pick : 6;
  final dead = <int>[];
  // الطبيب الآليّ يحمي ليلى #4 — ما لم تعطّله الساحرة
  final botDoctor = t[1] == 'DOCTOR' && !(role == 'WITCH' && pick == 1);
  final saved = (role == 'DOCTOR' && pick == target) || (botDoctor && target == 4);
  if (!saved) dead.add(target);
  var miss = false, hit = false, contract = false, sheriffMafia = false;
  if (role == 'SNIPER' && pick != null) {
    if (teamOf(t[pick]!) == 'CITIZEN') { miss = true; } else { hit = true; }
    if (!dead.contains(pick)) dead.add(pick);
  }
  if (role == 'ASSASSIN') {
    contract = pick == 4;
    if (contract && !dead.contains(4)) dead.add(4);
  }
  if (role == 'SHERIFF' && pick != null) sheriffMafia = isMafia(t[pick]!) && t[pick] != 'CHAMELEON';
  return NightResult(pick: pick, target: target, saved: saved, dead: dead, miss: miss, hit: hit, contract: contract, sheriffMafia: sheriffMafia);
}

/// ما لا يقوله الهاتف الحقيقيّ لصاحب الدور — يُهمس به في التدريب
String nightOutcomeText(String role, NightResult n, String Function(int) nameOf) {
  final nm = n.pick != null ? '${nameOf(n.pick!)} #${n.pick}' : '';
  switch (role) {
    case 'SHERIFF': return '';
    case 'DOCTOR': return n.saved
        ? 'حميتَ $nm والمافيا قصدتها: لم يمت أحد. الهاتف لا يخبرك بذلك — تقرؤه من تقرير القاعة.'
        : 'حمايتك ذهبت إلى $nm والمافيا قصدت رنا، فخرجت. الهاتف لا يقول لك أنجحتَ أم لا.';
    case 'SNIPER': return n.pick == null ? 'حفظتَ طلقتك لليلةٍ أخرى.'
        : n.hit ? 'أصبتَ $nm وهو ليس مواطناً، فخرج ونجوتَ.'
        : 'قنصتَ $nm وهو مواطن. في لعبةٍ حقيقيّة تخرج معه؛ أعادك الدون إلى مقعدك لتُكمل الجولة.';
    case 'GODFATHER': return n.saved ? 'قصدتَ $nm والطبيب حماها: لم يمت أحد. لا يخبرك الهاتف بالسبب.' : 'هدفك $nm خرج من اللعبة.';
    case 'SILENCER': return '$nm مُسكَتٌ في نقاش اليوم. يبلّغه الموجّه بصوته، وهاتفه لا يعرض شيئاً.';
    case 'WITCH': return 'عطّلتِ قدرة $nm هذه الجولة، وهو لا يعلم.';
    case 'ASSASSIN': return n.contract
        ? 'اكتمل عقدك الأوّل. افتح «مهامّي» تجد العدّاد ١/٣ — تحدّث بصمتٍ بلا إشعار.'
        : 'لم يكتمل العقد: الشريف على هذه الطاولة ليلى #4.';
    default: return 'اختيارك كان للتمويه ولم يغيّر شيئاً — وهذا المطلوب.';
  }
}

// ── النهار ──
class Ballot {
  const Ballot({required this.acc, required this.cands, required this.bot});
  /// صاحب أعلى الأصوات
  final int acc;
  final List<int> cands;
  /// أصوات اللاعبين الآليّين: مقعد ← مقعد المرشّح
  final Map<int, int> bot;
}

Ballot ballotOf(NightResult night, int? vote) {
  bool alive(int s) => !night.dead.contains(s);
  final cands = [2, 3, kMe, 9].where(alive).toList();
  final acc = vote != null && vote != kMe && cands.contains(vote) ? vote : (alive(3) ? 3 : 9);
  final scape = cands.where((c) => c != acc && c != kMe).firstOrNull ?? acc;
  int pickFor(int s, int pref) => pref != s ? pref : (cands.where((c) => c != s && c != kMe && c != pref).firstOrNull ?? acc);
  final bot = <int, int>{};
  for (final s in const [1, 2, 4, 8, 10]) { bot[s] = pickFor(s, acc); }
  for (final s in const [3, 7, 9]) { bot[s] = pickFor(s, scape); }
  bot.removeWhere((k, _) => !alive(k));
  return Ballot(acc: acc, cands: cands, bot: bot);
}

/// من يواجهه المتدرّب افتراضيّاً — المافيا لا يواجه شريكه
int defaultConfTarget(String role, NightResult night) {
  bool alive(int s) => !night.dead.contains(s);
  if (isMafia(role)) return const [2, 8, 10, 1, 4, 6].where(alive).firstOrNull ?? 2;
  return alive(3) ? 3 : 9;
}

/// محصّلة المواجهة للطالب وحده، من تصويت الجولة نفسها (بإعدادات اليوم)
String confOutcomeText(String role, int confTarget, int acc) {
  final accMafia = isMafia(tableOf(role)[acc]!);
  final team = teamOf(role);
  if (confTarget != acc) return 'خصمك في المواجهة لم يخرج بتصويت هذه الجولة، فلا مكافأة ولا خصم.';
  if (team == 'CITIZEN') {
    return accMafia
        ? 'مواجهتك أصابت: خصمك خرج بالتصويت وكان مافيا. في اللعب الحقيقيّ تُكافأ: +١٠ رتبة و+٢٥ خبرة بإعدادات اليوم.'
        : 'واجهتَ مواطناً فخرج بالتصويت. في اللعب الحقيقيّ يُخصم منك: −١٥ رتبة و−٥ خبرة بإعدادات اليوم.';
  }
  if (team == 'MAFIA') {
    return accMafia
        ? 'واجهتَ شريكك فخرج بالتصويت. في اللعب الحقيقيّ يُخصم منك: −١٥ رتبة بإعدادات اليوم.'
        : 'واجهتَ مواطناً وأنت مافيا: خرج بالتصويت، ولا مكافأة لك ولا خصم.';
  }
  return 'دورك مستقلّ، فمواجهتك لا تكسبك نقاطاً ولا تخسرك.';
}

/// أرقامٌ عربيّة للعدّادات المعروضة («٧/٤٢»)
String arNum(Object n) => '$n'.replaceAllMapped(RegExp(r'\d'), (m) => '٠١٢٣٤٥٦٧٨٩'[int.parse(m[0]!)]);
