import '../api/api_client.dart';

// ══════════════════════════════════════════════════════
// 📖 دليلُ الأدوار — نظيرُ الويب حرفيّاً
//
// 🔴 القيودُ تصل مولَّدةً من الخادم ولا تُحسب هنا: توليدُها في العميلين معاً
//    يعني منطقين يفترقان، فيقرأ لاعبُ الويب قيداً ويقرأ لاعبُ الأندرويد غيرَه
//    — وهما على الطاولة نفسها.
//
// 🔴 ووجهُ الكارت يُطلَب مصغَّراً: الأصلُ ~٢ ميغابايت، وستّةَ عشرَ منه على شبكة
//    قاعة لا يُحتمل. والأصلُ يبقى لكشف البطاقة نفسِها.
// ══════════════════════════════════════════════════════

/// مفاتيحُ المراحل بترتيب العرض — مصدرٌ واحدٌ مع الخادم والويب.
const kTaskPhases = <({String k, String ar, String ic})>[
  (k: 'night', ar: 'الليل', ic: '🌙'),
  (k: 'discussion', ar: 'النقاش', ic: '💬'),
  (k: 'voting', ar: 'التصويت', ic: '🗳️'),
  (k: 'justification', ar: 'التبرير', ic: '⚖️'),
  (k: 'dead', ar: 'إن مِتّ', ic: '☠️'),
];

/// طورُ اللعبة ⇐ مفتاحُ المرحلة. ما لا يُطابِق يسقط على الليل.
String phaseKeyOf(String? gamePhase) => switch (gamePhase) {
      'NIGHT' => 'night',
      'DAY_DISCUSSION' || 'MORNING_RECAP' => 'discussion',
      'DAY_VOTING' || 'DAY_TIEBREAKER' || 'DAY_ELIMINATION' => 'voting',
      'DAY_JUSTIFICATION' => 'justification',
      _ => 'night',
    };

class RoleLimit {
  const RoleLimit(this.text, this.auto);
  final String text;
  final bool auto;
}

class GuideRole {
  const GuideRole({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.team,
    required this.genPriority,
    this.oneLiner,
    this.howItWorks,
    this.winLine,
    this.faceUrl,
    this.limits = const [],
    this.tips = const [],
    this.interactsWith = const [],
    this.phaseNotes = const {},
    this.actsIn = const [],
  });

  final String id, nameAr, nameEn, team;
  final int genPriority;
  final String? oneLiner, howItWorks, winLine, faceUrl;
  final List<RoleLimit> limits;
  final List<String> tips, interactsWith, actsIn;
  final Map<String, String> phaseNotes;

  bool actsIn_(String k) => actsIn.contains(k);

  static List<String> _strs(dynamic v) => v is List
      ? v.map((e) => '$e'.trim()).where((s) => s.isNotEmpty).toList()
      : const <String>[];

  static GuideRole fromJson(Map<String, dynamic> j) {
    final face = j['face'];
    // المصغَّرُ أوّلاً والأصلُ احتياط — وإن غاب الاثنان فالأيقونة
    final rel = face is Map ? (face['thumbUrl'] ?? face['url']) : null;
    final notes = <String, String>{};
    if (j['phaseNotes'] is Map) {
      (j['phaseNotes'] as Map).forEach((k, v) {
        final s = '$v'.trim();
        if (s.isNotEmpty) notes['$k'] = s;
      });
    }
    return GuideRole(
      id: '${j['id']}',
      nameAr: '${j['nameAr'] ?? ''}',
      nameEn: '${j['nameEn'] ?? ''}',
      team: '${j['team'] ?? 'CITIZEN'}',
      genPriority: (j['genPriority'] is num) ? (j['genPriority'] as num).toInt() : 99,
      oneLiner: (j['oneLiner'] as String?)?.trim().isEmpty ?? true ? null : '${j['oneLiner']}'.trim(),
      howItWorks: (j['howItWorks'] as String?)?.trim().isEmpty ?? true ? null : '${j['howItWorks']}'.trim(),
      winLine: (j['winConditionDescription'] as String?)?.trim().isEmpty ?? true
          ? null : '${j['winConditionDescription']}'.trim(),
      faceUrl: rel == null ? null : '$rel',
      limits: (j['limits'] is List)
          ? (j['limits'] as List).whereType<Map>().map((m) =>
              RoleLimit('${m['text']}', m['auto'] == true)).toList()
          : const [],
      tips: _strs(j['tips']),
      interactsWith: _strs(j['interactsWith']),
      phaseNotes: notes,
      actsIn: _strs(j['actsIn']),
    );
  }
}

class RolesGuideService {
  RolesGuideService._();
  static final RolesGuideService instance = RolesGuideService._();

  List<GuideRole>? _cache;
  Future<List<GuideRole>>? _inflight;

  List<GuideRole>? get cached => _cache;

  /// يُجلَب مرّةً ويُحفَظ: المحتوى يتغيّر بتعديلٍ إداريٍّ نادر، وإعادةُ الجلب
  /// مع كلّ فتحةٍ هدرٌ على شبكة قاعة.
  Future<List<GuideRole>> load({bool force = false}) {
    if (!force && _cache != null) return Future.value(_cache);
    return _inflight ??= _fetch().whenComplete(() => _inflight = null);
  }

  Future<List<GuideRole>> _fetch() async {
    try {
      final r = await ApiClient.instance.get('/api/game-config/roles-guide');
      final list = (r is Map ? r['data'] : r) as List?;
      if (list == null) return _cache ?? const [];
      final out = list
          .whereType<Map>()
          .map((e) => GuideRole.fromJson(Map<String, dynamic>.from(e)))
          .toList()
        ..sort((a, b) => a.genPriority.compareTo(b.genPriority));
      _cache = out;
      return out;
    } catch (_) {
      // انقطاعٌ لحظيّ لا يُفرِغ شاشةً: يعود المخزَّن إن وُجد
      return _cache ?? const [];
    }
  }
}
