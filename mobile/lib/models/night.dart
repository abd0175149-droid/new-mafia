// ══════════════════════════════════════════════════════
// 🌙 نماذج مرحلة الليل — §8 في الملفّ ٢٣
// ══════════════════════════════════════════════════════
// 🔒 الثابت الأمنيّ المركزيّ: شاشة **المموِّه** مطابقةٌ بكسلياً لشاشة
//    **صاحب الدور**. الفروق الثلاثة المسموحة فقط: نصّ التعليمة، وقائمة
//    الأهداف، وإخفاء زرّ التخطّي. أيّ فرقٍ رابع — لونٌ أو حجمٌ أو حركة —
//    يكشف من يملك دوراً فعّالاً لمن يسترق النظر إلى الشاشة المجاورة.

class NightTarget {
  const NightTarget({required this.physicalId, this.name = '', this.avatarUrl});

  final int physicalId;
  final String name;
  final String? avatarUrl;

  String get displayName => name.isNotEmpty ? name : 'لاعب #$physicalId';

  static NightTarget? fromJson(Object? v) {
    if (v is! Map) return null;
    final id = v['physicalId'];
    if (id is! num) return null;
    return NightTarget(
      physicalId: id.toInt(),
      name: '${v['name'] ?? ''}',
      avatarUrl: (v['avatarUrl'] as String?)?.isEmpty ?? true
          ? null
          : v['avatarUrl'] as String,
    );
  }

  static List<NightTarget> listOf(Object? v) => v is! List
      ? const []
      : v.map(NightTarget.fromJson).whereType<NightTarget>().toList();
}

class NightActionRequest {
  const NightActionRequest({
    required this.actionType,
    this.availableTargets = const [],
    this.timeoutSeconds = 15,
    this.canSkip = false,
    this.stepRole,
    this.isDecoy = false,
  });

  final String actionType;
  final List<NightTarget> availableTargets;
  final int timeoutSeconds;
  final bool canSkip;
  final String? stepRole;
  final bool isDecoy;

  /// زرّ التخطّي للمُخوَّل غير المموِّه فقط: مموِّهٌ يتخطّى يكشف نفسه فوراً
  /// أمام من يراقب — فهو مُلزَمٌ باختيار أحدٍ لا معنى له.
  bool get showSkip => canSkip && !isDecoy;

  static NightActionRequest? fromJson(Object? v) {
    if (v is! Map) return null;
    final t = v['actionType'];
    if (t is! String || t.isEmpty) return null;
    return NightActionRequest(
      actionType: t,
      availableTargets: NightTarget.listOf(v['availableTargets']),
      timeoutSeconds: (v['timeoutSeconds'] as num?)?.toInt() ?? 15,
      canSkip: v['canSkip'] == true,
      stepRole: v['stepRole'] as String?,
      isDecoy: v['isDecoy'] == true,
    );
  }
}

/// عنوان رأس الشاشة من `stepRole` — **الخريطة الحرفية للويب**.
///
/// ⚠️ `WITCH` و`ASSASSIN` و`OLDER_BROTHER` و`MAFIA_REGULAR` ليست فيها
///    عمداً فتُعرَض بنصّها الإنجليزيّ الخام. لا «تُصلَح» إلّا بطلبٍ صريح:
///    العنوان يجب أن يكون **واحداً** عند صاحب الدور والمموِّه معاً، وكلاهما
///    يقرأ نفس `stepRole` — فترجمةٌ من طرفٍ واحد تكسر التمويه.
String nightStepTitle(String? stepRole) => switch (stepRole) {
      'MAFIA' => 'المافيا',
      'GODFATHER' => 'العراب',
      'SILENCER' => 'المُسكت',
      'SHERIFF' => 'المحقق',
      'DOCTOR' => 'الطبيب',
      'NURSE' => 'الممرضة',
      'SNIPER' => 'القناص',
      'CHAMELEON' => 'الحرباء',
      null || '' => 'مجهول',
      _ => stepRole,
    };

/// تعليمة الإجراء. المموِّه أوّلاً مهما كان `actionType`.
///
/// ⚠️ نوعٌ غير مغطّى (مثل `ASSASSINATE`) يُنتج **سطراً فارغاً** — هذا ما
///    تفعله سلسلة `||` في الويب. لا نخترع نصّاً: نصٌّ يظهر عندنا ولا يظهر
///    هناك فرقٌ بين عميلين على نفس الطاولة.
String nightInstruction(NightActionRequest r) {
  if (r.isDecoy) return 'اختر أي شخص للتمويه...';
  return switch (r.actionType) {
        'KILL' => 'اختر هدف الاغتيال',
        'INVESTIGATE' => 'من تريد التحقيق معه؟',
        'PROTECT' => 'من تريد حمايته الليلة؟',
        'SNIPE' => 'اختر هدف القنص',
        'SILENCE' => 'من تريد إسكاته؟',
        'DISABLE' => 'اختر لاعباً لتعطيل قدرته',
        'DECOY' => 'اختر أي شخص',
        _ => '',
      };
}

/// إعادة بناء الشاشة بعد الاستعادة — من `nightState` في `room:get-my-state`.
///
/// النوع يُشتقّ من دور الخطوة لا من دور اللاعب، والمموِّه يأخذ `DECOY`
/// (فرقٌ عن البثّ الحيّ، وبلا أثرٍ مرئيّ: التعليمة تفحص `isDecoy` أوّلاً).
NightActionRequest? nightFromResume(Object? state, int myPhysicalId) {
  if (state is! Map) return null;
  if (state['playerSubmitted'] == true) return null;

  final performer = (state['autoNightPerformerId'] as num?)?.toInt();
  final role = state['autoNightStepRole'] as String?;
  final step = state['nightStep'];
  final cfg = state['config'];
  final isPerformer = performer != null && performer == myPhysicalId;

  final derived = switch (role) {
    'SHERIFF' => 'INVESTIGATE',
    'DOCTOR' || 'NURSE' => 'PROTECT',
    'SNIPER' => 'SNIPE',
    'WITCH' => 'DISABLE',
    'SILENCER' when !isPerformer => 'DECOY',
    _ => 'KILL',
  };

  return NightActionRequest(
    actionType: isPerformer ? derived : 'DECOY',
    availableTargets:
        NightTarget.listOf(step is Map ? step['availableTargets'] : null),
    timeoutSeconds:
        (cfg is Map ? (cfg['autoNightTime'] as num?)?.toInt() : null) ?? 15,
    canSkip: step is Map && step['canSkip'] == true,
    stepRole: role,
    isDecoy: !isPerformer,
  );
}
