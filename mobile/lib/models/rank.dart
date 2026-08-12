import 'package:flutter/material.dart';

import 'home.dart' show RankInfo;

// ══════════════════════════════════════════════════════
// 🏆 نماذج شاشة الرتب — §8 في الملفّ 15
// ══════════════════════════════════════════════════════

int _i(dynamic v, [int f = 0]) =>
    v is int ? v : (v is num ? v.toInt() : int.tryParse('$v') ?? f);

// ══════════════════════════════════════════════════════
// 🎨 لوحة ألوان **هذه الشاشة وحدها** — §4.0
// ══════════════════════════════════════════════════════
// 🔴 ثلاث لوحات للرتب تتعايش عمداً، ودمج أيّ اثنتين يبدو تنظيفاً ويكسر
//    هويّة شاشة كاملة:
//      • هذه (شاشة الرتب): رمادي/أزرق/بنفسجي/عنبريّ/أحمر
//      • الملفّ الشخصيّ (13): برونزيّ/فضّيّ/ذهبيّ/سماويّ/أحمر
//      • كرت اللعب (RankEffects): أخضر/أزرق/بنفسجي/عنبريّ
//    الأسماء والشارات وحدها مشتركة — وهي في RankInfo.

abstract final class RankScale {
  static const tiers = ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'GODFATHER'];

  static const _colors = <String, Color>{
    'INFORMANT': Color(0xFF6B7280),
    'SOLDIER': Color(0xFF3B82F6),
    'CAPO': Color(0xFFA855F7),
    'UNDERBOSS': Color(0xFFF59E0B),
    'GODFATHER': Color(0xFFEF4444),
  };

  /// ⚠️ احتياطٌ أخير **فقط**: العتبات الحيّة تُخدَم من
  /// `/api/progression-settings/public` (config.ranks)، وبعدها
  /// `progression.rrRequired` من بروفايل اللاعب. هذه الخريطة لا تُقرأ
  /// إلا حين يغيب الاثنان — مرآةٌ لافتراضيات الخادم لا مصدر حقيقة.
  static const _rrRequired = <String, int>{
    'INFORMANT': 100, 'SOLDIER': 200, 'CAPO': 300, 'UNDERBOSS': 400,
    'GODFATHER': 9999,
  };

  /// شارات نجوم **مختلفة عمداً** عن شارات الصفوف — تبويب «النقاط» وحده.
  static const howToBadges = <String, String>{
    'INFORMANT': '⭐', 'SOLDIER': '⭐⭐', 'CAPO': '🌟',
    'UNDERBOSS': '🌟🌟', 'GODFATHER': '👑',
  };

  static const howToNames = <String, String>{
    'INFORMANT': 'المُخبر', 'SOLDIER': 'الجندي', 'CAPO': 'الكابو',
    'UNDERBOSS': 'الأندربوس', 'GODFATHER': 'الأب الروحي',
  };

  /// رتبة مجهولة → رماديّ المُخبر (مطابق لـ `|| '#6b7280'` في الويب).
  static Color color(String? tier) => _colors[tier] ?? _colors['INFORMANT']!;

  static int rrRequired(String? tier) => _rrRequired[tier] ?? 100;

  /// القراءة الموحّدة لعتبة الترقية: الإعدادات أوّلاً، ثم قيمة
  /// البروفايل (`progression.rrRequired`)، وأخيراً الثابت أعلاه.
  static int rrRequiredFrom(String? tier, {ProgressionConfig? config, int? profile}) =>
      config?.ranks[tier] ?? profile ?? rrRequired(tier);

  static String nameAr(String? tier) => RankInfo.of(tier).nameAr;
  static String badge(String? tier) => RankInfo.of(tier).badge;
}

// ══════════════════════════════════════════════════════
// النماذج
// ══════════════════════════════════════════════════════

class LeaderboardRow {
  const LeaderboardRow({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.rankTier = 'INFORMANT',
    this.rankRR = 0,
    this.totalMatches = 0,
    this.totalWins = 0,
    this.level = 1,
  });

  final int id;
  final String name;
  final String? avatarUrl;
  final String rankTier;
  final int rankRR, totalMatches, totalWins, level;

  factory LeaderboardRow.fromJson(Map<String, dynamic> j) => LeaderboardRow(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        avatarUrl: j['avatarUrl'] as String?,
        rankTier: (j['rankTier'] ?? 'INFORMANT').toString(),
        rankRR: _i(j['rankRR']),
        totalMatches: _i(j['totalMatches']),
        totalWins: _i(j['totalWins']),
        level: _i(j['level'], 1),
      );
}

class CoPlayer {
  const CoPlayer({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.rankTier = 'INFORMANT',
    this.matchCount = 0,
    this.isFollowing = false,
  });

  final int id;
  final String name;
  final String? avatarUrl;
  final String rankTier;
  final int matchCount;
  final bool isFollowing;

  CoPlayer copyWith({bool? isFollowing}) => CoPlayer(
        id: id, name: name, avatarUrl: avatarUrl, rankTier: rankTier,
        matchCount: matchCount, isFollowing: isFollowing ?? this.isFollowing,
      );

  factory CoPlayer.fromJson(Map<String, dynamic> j) => CoPlayer(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        avatarUrl: j['avatarUrl'] as String?,
        rankTier: (j['rankTier'] ?? 'INFORMANT').toString(),
        matchCount: _i(j['matchCount']),
        isFollowing: j['isFollowing'] == true,
      );
}

class Season {
  const Season({required this.id, required this.name});
  final int id;
  final String name;

  factory Season.fromJson(Map<String, dynamic> j) =>
      Season(id: _i(j['id']), name: (j['name'] ?? '').toString());

  static List<Season> listFrom(dynamic v) => (v as List? ?? const [])
      .whereType<Map>()
      .map((e) => Season.fromJson(Map<String, dynamic>.from(e)))
      .toList();
}

/// قيم قدرة دورٍ واحد من `roleAbilities` — تجاوزٌ دقيق للقيم العامة
/// `abilityCorrect`/`abilityIncorrect`. دورٌ غائب من الخريطة يسقط على
/// العام فلا صفّ له؛ أمّا الصفر هنا فهو **قيمة مقصودة تُعرض** — سؤال
/// الشريف عن مواطنٍ صالح حيادٌ لا عقوبة (قرار 2026-08-11).
class RoleAbility {
  const RoleAbility({
    this.correctXp = 0,
    this.correctRr = 0,
    this.wrongXp = 0,
    this.wrongRr = 0,
  });

  final int correctXp, correctRr, wrongXp, wrongRr;

  factory RoleAbility.fromJson(Map<String, dynamic> j) => RoleAbility(
        correctXp: _i(j['correctXp']),
        correctRr: _i(j['correctRr']),
        wrongXp: _i(j['wrongXp']),
        wrongRr: _i(j['wrongRr']),
      );
}

/// إعدادات التقدّم القابلة للضبط من الأدمن — قيَم تبويب «النقاط».
///
/// تُقرأ ولا تُفسَّر: الشاشة تعرض ما يصل. فعلٌ غير معرَّف في الإعدادات
/// يختفي صفّه بدل أن يُعرض صفراً مخترعاً.
class ProgressionConfig {
  const ProgressionConfig({
    this.xp = const {},
    this.rr = const {},
    this.ranks = const {},
    this.roleAbilities = const {},
  });

  final Map<String, int> xp, rr;

  /// TIER → rrRequired
  final Map<String, int> ranks;

  /// ROLE → تجاوز قدرته — انظر [RoleAbility].
  final Map<String, RoleAbility> roleAbilities;

  int? xpOf(String key) => xp[key];
  int? rrOf(String key) => rr[key];

  static Map<String, int> _ints(dynamic v) {
    final out = <String, int>{};
    if (v is Map) {
      v.forEach((k, val) {
        if (val is num) out['$k'] = val.toInt();
      });
    }
    return out;
  }

  factory ProgressionConfig.fromJson(Map<String, dynamic> j) {
    final ranks = <String, int>{};
    final r = j['ranks'];
    if (r is Map) {
      r.forEach((k, v) {
        if (v is Map && v['rrRequired'] is num) {
          ranks['$k'] = (v['rrRequired'] as num).toInt();
        }
      });
    }
    final abilities = <String, RoleAbility>{};
    final ra = j['roleAbilities'];
    if (ra is Map) {
      ra.forEach((k, v) {
        if (v is Map) {
          abilities['$k'] = RoleAbility.fromJson(Map<String, dynamic>.from(v));
        }
      });
    }
    return ProgressionConfig(
        xp: _ints(j['xp']), rr: _ints(j['rr']), ranks: ranks, roleAbilities: abilities);
  }
}

/// صفّ فعلٍ في تبويب «النقاط» — البنية والأيقونة والوصف ثابتة، والقيم
/// من الخادم.
class ScoringAction {
  const ScoringAction(this.key, this.label, this.icon, this.desc);
  final String key, label, icon, desc;
}

const scoringCategories = <(String, List<ScoringAction>)>[
  ('🔰 أساسيات المباراة', [
    ScoringAction('participation', 'مشاركة في مباراة', '🎮', 'نقطة دخول لكل لاعب'),
    ScoringAction('teamWin', 'فوز الفريق', '🏆', 'مكافأة الفوز لفريق اللاعب'),
    ScoringAction('teamLoss', 'خسارة الفريق', '💀', 'خصم الخسارة (سالب عادة)'),
    ScoringAction('survivalPerRound', 'نجاة لكل جولة', '⏳', 'لكل جولة يظل فيها حياً'),
    ScoringAction('survivedToEnd', 'نجاة حتى النهاية', '🎖️', 'نجا حتى نهاية المباراة'),
    ScoringAction('teamEliminationBonus', 'مكافأة إقصاء خصم', '⚔️', 'تمنح للفريق لكل خصم يُقصى'),
  ]),
  ('🤝 الديلات والاتفاقات', [
    ScoringAction('citizenDealOnMafia', 'ديل مواطن ناجح', '✨', 'مواطن أخرج عنصر مافيا'),
    ScoringAction('failedDeal', 'ديل فاشل (غلط)', '💔', 'مواطن أخرج مواطناً (عقوبة)'),
    ScoringAction('mafiaDealOnMafia', 'ديل مافيا على مافيا', '🔴', 'غدر بالزميل (عقوبة مغلظة)'),
  ]),
  ('🎯 قدرات الأدوار', [
    ScoringAction('abilityCorrect', 'استخدام قدرة صحيحة', '✅', 'القيمة العامة — دورٌ له تجاوز يُعرض تفصيله أدناه'),
    ScoringAction('abilityIncorrect', 'استخدام قدرة خاطئة', '❌', 'إصابة خاطئة (عقوبة) — القيمة العامة'),
  ]),
  ('🃏 الأدوار المحايدة', [
    ScoringAction('jesterWin', 'فوز المهرج', '🃏', 'أقنع المدينة بإعدامه تصويتاً'),
    ScoringAction('jesterLoss', 'خسارة المهرج', '🎭', 'انتهت المباراة دون إعدامه'),
    ScoringAction('assassinWin', 'فوز السفّاح', '🔪', 'أنجز كل عقوده'),
    ScoringAction('assassinLoss', 'خسارة السفّاح', '🗡️', 'مات أو انتهت المباراة قبل إتمام العقود'),
    ScoringAction('assassinContractComplete', 'إنجاز عقد للسفّاح', '📜', 'لكل عقدٍ يُنجزه'),
  ]),
  ('⚖️ العقوبات والقنبلة', [
    ScoringAction('penaltyDeduction', 'عقوبة من الليدر', '🟨', 'خصم لكل عقوبة سلوك تُسجَّل'),
    ScoringAction('penaltyKickDeduction', 'طرد بالعقوبات', '🟥', 'بلوغ حدّ الطرد — خصم مغلّظ'),
    // 💣 قنبلة شيخ المافيا — إصابة محايد (مهرج/سفّاح) = صفر RR بقرارٍ صريح
    ScoringAction('bombHitCitizen', 'قنبلة أصابت مواطناً', '💣', 'لشيخ المافيا — إصابة محايد = صفر'),
    ScoringAction('bombHitMafia', 'قنبلة أصابت مافيا', '💥', 'لشيخ المافيا — أصاب زميله (عقوبة)'),
  ]),
];

/// ترتيب عرض تجاوزات الأدوار في تبويب «النقاط» — يُعرض منها ما ورد في
/// `config.roleAbilities` فقط؛ الغائب يسقط على القيم العامة فلا صفّ له.
const abilityRoleOrder = <String>[
  'SHERIFF', 'SNIPER', 'DOCTOR', 'NURSE', 'POLICEWOMAN',
  'GODFATHER', 'SILENCER', 'WITCH',
];

/// قصّ الاسم بعدّ الأحرف — منقول من الويب حرفياً (لا ellipsis تلقائيّ:
/// الطول المسموح يختلف بين المنصّة والصفوف).
String clipName(String name, int max) =>
    name.length > max ? '${name.substring(0, max)}…' : name;
