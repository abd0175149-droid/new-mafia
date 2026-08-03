import '../../models/card_template.dart';
import 'api_client.dart';

// ══════════════════════════════════════════════════════
// 🧩 كتالوج اللعبة — قوالب البطاقات وتأثيرات الرتب
// ══════════════════════════════════════════════════════
// 🔴 هذه بيانات **تصميم البطاقة نفسها**، لا زينة: بدونها ترسم المرآة
//    بطاقةً بقيمٍ مكتوبة تختلف عن التي تظهر على شاشة القاعة — فيشتري
//    اللاعب بناءً على ما رآه ثمّ يرى غيره.
//
// 📌 `GET /api/game-config/*` عامّ بلا مصادقة (الكتابة وحدها للأدمن)،
//    فلا حاجة لطريقٍ جديد في الخادم.
//
// تُجلَب مرّةً وتُحفَظ في الذاكرة: القالب يتغيّر بتعديل إداريّ نادر،
// وإعادةُ جلبه مع كل فتحة متجر هدرٌ بلا مقابل.

class GameConfigService {
  GameConfigService._();
  static final GameConfigService instance = GameConfigService._();

  CardTemplate? _master;
  final _templates = <String, CardTemplate>{};
  Map<String, RankEffectsDef> _ranks = const {};
  Map<String, RoleDef> _roles = const {};
  Future<void>? _inflight;
  bool _loaded = false;

  CardTemplate get master => _master ?? const CardTemplate();

  /// تأثيرات رتبةٍ بالمعرّف — `INFORMANT` … `GODFATHER`.
  Map<String, dynamic>? effectsForTier(String tier) => _ranks[tier]?.effects;

  RoleDef? role(String? id) => id == null ? null : _roles[id];

  /// كلّ الأدوار مرتّبةً بأولويّة التوليد — ترتيب موسوعة الأدوار.
  List<RoleDef> get allRoles =>
      _roles.values.toList()..sort((a, b) => a.genPriority.compareTo(b.genPriority));

  /// جلبٌ طازج للأدوار — الموسوعة تُحدَّث عند كلّ فتح كما في الويب.
  ///
  /// عند فشل الشبكة نسقط على المخزَّن إن وُجد بدل شاشة خطأ: القائمة
  /// شبه ثابتة، وإخفاؤها لانقطاعٍ لحظيّ خسارةٌ بلا مقابل.
  Future<List<RoleDef>> fetchRoles() async {
    try {
      final r = await ApiClient.instance.get('/api/game-config/roles');
      final list = (r is Map ? r['data'] : r) as List?;
      if (list == null) throw StateError('bad shape');
      final out = <String, RoleDef>{};
      for (final e in list.whereType<Map>()) {
        final d = RoleDef.fromJson(Map<String, dynamic>.from(e));
        if (d.id.isNotEmpty) out[d.id] = d;
      }
      if (out.isNotEmpty) _roles = out;
      return allRoles;
    } catch (_) {
      if (_roles.isNotEmpty) return allRoles;
      rethrow;
    }
  }

  /// اسم الدور بالعربية — و«مجهول» حين لا تعريف.
  String roleName(String? id) {
    final r = role(id);
    if (r != null && r.nameAr.isNotEmpty) return r.nameAr;
    return id == null || id.isEmpty ? 'مجهول' : id;
  }

  /// 🔴 نفس قاعدة `getCardForRole`: قالب الدور إن وُجد، وإلّا `master`
  ///    **لا فارغ** — القيم الاحتياطية في المُصيّر لا تُستعمل عملياً.
  CardTemplate cardForRole(String? roleId) {
    final tid = role(roleId)?.cardTemplateId;
    if (tid != null) {
      final t = _templates[tid];
      if (t != null) return t;
    }
    return master;
  }

  bool isMafiaRole(String? id) =>
      role(id)?.isMafia ?? kMafiaRoleIds.contains(id);

  /// 🔴 نداءان متزامنان من شاشتين لا يعنيان جلبين: الطلب الجاري يُشارَك.
  Future<void> ensureLoaded() {
    if (_loaded) return Future.value();
    return _inflight ??= _load().whenComplete(() => _inflight = null);
  }

  Future<void> _load() async {
    // النداءان مستقلّان: فشل أحدهما لا يُفرغ الآخر
    final tpl = ApiClient.instance
        .get('/api/game-config/card-templates')
        .then<CardTemplate?>((r) {
      final list = (r is Map ? r['data'] : r) as List? ?? const [];
      final maps = list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      if (maps.isEmpty) return null;
      for (final e in maps) {
        final t = CardTemplate.fromJson(e);
        _templates[t.id] = t;
      }
      // نفس قاعدة `getCardForRole(null)`: القالب الرئيسيّ ثمّ أوّل متاح
      final m = maps.where((e) => e['id'] == 'master').firstOrNull ?? maps.first;
      return CardTemplate.fromJson(m);
    }).catchError((_) => null);

    final ranks = ApiClient.instance
        .get('/api/game-config/rank-effects')
        .then<Map<String, RankEffectsDef>>((r) {
      final list = (r is Map ? r['data'] : r) as List? ?? const [];
      final out = <String, RankEffectsDef>{};
      for (final e in list.whereType<Map>()) {
        final d = RankEffectsDef.fromJson(Map<String, dynamic>.from(e));
        if (d.id.isNotEmpty) out[d.id] = d;
      }
      return out;
    }).catchError((_) => <String, RankEffectsDef>{});

    final roles = ApiClient.instance
        .get('/api/game-config/roles')
        .then<Map<String, RoleDef>>((r) {
      final list = (r is Map ? r['data'] : r) as List? ?? const [];
      final out = <String, RoleDef>{};
      for (final e in list.whereType<Map>()) {
        final d = RoleDef.fromJson(Map<String, dynamic>.from(e));
        if (d.id.isNotEmpty) out[d.id] = d;
      }
      return out;
    }).catchError((_) => <String, RoleDef>{});

    _master = await tpl;
    _ranks = await ranks;
    _roles = await roles;
    _loaded = true;
  }
}
