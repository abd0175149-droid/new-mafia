import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'card_fx.dart';

// ══════════════════════════════════════════════════════
// 🎴 قالب البطاقة — من `/api/game-config/card-templates`
// ══════════════════════════════════════════════════════
// 🔴 البطاقة **مدفوعة بالبيانات** لا مرسومة بقيمٍ ثابتة: القالب يحمل
//    التدرّج ولون الحدّ والتوهّج ومواضع كل عنصر وأشكال الغلاف. رسمُها
//    بقيمٍ مكتوبة يعني أن ما يراه اللاعب في التطبيق غير ما يراه على شاشة
//    القاعة — وهو ما لاحظه المالك في موضع الرقم.
//
// 🔴 `getCardForRole(null)` في الويب **لا يعيد فارغاً**: يسقط على قالب
//    `master` «حتى لو الدور فارغ». فالقيم الاحتياطية المكتوبة في المُصيّر
//    لا تُستعمل عملياً أبداً، والمرآة ترسم `master`.

/// إزاحةٌ ومقياس لعنصرٍ داخل البطاقة — بوحدات بكسل CSS مهما كان حجمها.
class ElementPos {
  const ElementPos({this.x = 0, this.y = 0, this.s = 1});
  final double x, y, s;

  static ElementPos? fromJson(dynamic v) {
    if (v is! Map) return null;
    return ElementPos(
      x: numOr(v['x'], 0, -2000, 2000),
      y: numOr(v['y'], 0, -2000, 2000),
      s: numOr(v['s'], 1, 0.1, 5),
    );
  }
}

/// شكلٌ زخرفيّ يُرسم على وجه الغلاف أو وجه الدور.
class CardShape {
  const CardShape({
    required this.face,
    required this.type,
    required this.x,
    required this.y,
    required this.w,
    required this.h,
    required this.bg,
    required this.opacity,
    required this.zIndex,
    required this.radius,
  });

  final String face, type, bg;
  final double x, y, w, h, opacity, radius;
  final int zIndex;

  bool get isCover => face == 'cover';

  static CardShape? fromJson(dynamic v) {
    if (v is! Map) return null;
    return CardShape(
      face: '${v['face'] ?? 'cover'}',
      type: '${v['type'] ?? 'rect'}',
      x: numOr(v['x'], 0, -4000, 4000),
      y: numOr(v['y'], 0, -4000, 4000),
      w: numOr(v['w'], 0, 0, 4000),
      h: numOr(v['h'], 0, 0, 4000),
      bg: cssColorOr(v['bg'], '#000000'),
      opacity: numOr(v['opacity'], 1, 0, 1),
      zIndex: numOr(v['zIndex'], 1, 0, 100).toInt(),
      radius: numOr(v['radius'], 0, 0, 400),
    );
  }
}

class CardTemplate {
  const CardTemplate({
    this.id = 'master',
    this.gradient = 'linear-gradient(to bottom, #3f3f46, #18181b)',
    this.borderColor = 'rgba(197,160,89,0.55)',
    this.textColor = '#d4d4d8',
    this.glowEffect = '',
    this.fontFamily,
    this.showPlayerNumber = true,
    this.showClubBranding = true,
    this.coverNumber,
    this.coverName,
    this.coverBranding,
    this.coverPhoto,
    this.shapes = const [],
    this.secretImageUrl,
  });

  final String id, gradient, borderColor, textColor, glowEffect;
  final String? fontFamily;
  final bool showPlayerNumber, showClubBranding;
  final ElementPos? coverNumber, coverName, coverBranding, coverPhoto;
  final List<CardShape> shapes;

  /// 🔴 صورة وجه الدور المرفوعة. حين توجد فالوجه الخلفيّ **صورةٌ واحدة
  ///    ملء البطاقة بلا أيّ عنصرٍ ديناميكيّ آخر** — لا شارة فريق ولا
  ///    أيقونة ولا اسم دور. المؤلّف رسمها كاملة، ورسمُ عناصرنا فوقها
  ///    يشوّه ما صمّمه.
  final String? secretImageUrl;

  bool get hasSecretImage =>
      secretImageUrl != null && secretImageUrl!.isNotEmpty;

  List<CardShape> get coverShapes =>
      shapes.where((s) => s.isCover).toList()
        ..sort((a, b) => a.zIndex.compareTo(b.zIndex));

  Color get border => parseCssColor(borderColor, const Color(0x8CC5A059));

  /// `0 0 53px rgba(94,86,3,0.55)` ⇒ ظلٌّ بلا إزاحة.
  BoxShadow? get glow {
    final m = RegExp(r'0\s+0\s+(\d+(?:\.\d+)?)px\s+(.+)$').firstMatch(glowEffect.trim());
    if (m == null) return null;
    return BoxShadow(
      color: parseCssColor(m.group(2)!.trim(), const Color(0x00000000)),
      blurRadius: double.tryParse(m.group(1)!) ?? 0,
    );
  }

  /// `linear-gradient(to bottom, #a, #b)` — الاتجاهات المستعملة فقط.
  LinearGradient? get bodyGradient {
    final m = RegExp(r'linear-gradient\(([^)]*)\)').firstMatch(gradient);
    if (m == null) return null;
    final parts = m.group(1)!.split(',').map((e) => e.trim()).toList();
    if (parts.length < 3) return null;
    final dir = parts.first;
    final colors = parts.skip(1).map((c) => parseCssColor(c)).toList();
    final (begin, end) = switch (dir) {
      'to top' => (Alignment.bottomCenter, Alignment.topCenter),
      'to left' => (Alignment.centerRight, Alignment.centerLeft),
      'to right' => (Alignment.centerLeft, Alignment.centerRight),
      _ => (Alignment.topCenter, Alignment.bottomCenter),
    };
    return LinearGradient(begin: begin, end: end, colors: colors);
  }

  factory CardTemplate.fromJson(Map<String, dynamic> j) {
    final e = (j['elements'] is Map)
        ? Map<String, dynamic>.from(j['elements'] as Map)
        : <String, dynamic>{};
    final p = (e['positions'] is Map)
        ? Map<String, dynamic>.from(e['positions'] as Map)
        : <String, dynamic>{};

    return CardTemplate(
      id: '${j['id'] ?? 'master'}',
      gradient: cssColorOr(j['gradient'],
          'linear-gradient(to bottom, #3f3f46, #18181b)'),
      borderColor: cssColorOr(j['borderColor'], 'rgba(197,160,89,0.55)'),
      textColor: cssColorOr(j['textColor'], '#d4d4d8'),
      glowEffect: j['glowEffect'] is String ? j['glowEffect'] as String : '',
      fontFamily: e['fontFamily'] as String?,
      showPlayerNumber: boolOr(e['showPlayerNumber'], true),
      showClubBranding: boolOr(e['showClubBranding'], true),
      coverNumber: ElementPos.fromJson(p['coverNumber']),
      coverName: ElementPos.fromJson(p['coverName']),
      coverBranding: ElementPos.fromJson(p['coverBranding']),
      coverPhoto: ElementPos.fromJson(p['coverPhoto']),
      secretImageUrl: (j['secretFace'] is Map)
          ? (j['secretFace'] as Map)['customImageUrl'] as String?
          : null,
      shapes: (e['shapes'] as List? ?? const [])
          .map(CardShape.fromJson)
          .whereType<CardShape>()
          .toList(),
    );
  }
}

/// تأثيرات رتبةٍ واحدة.
class RankEffectsDef {
  const RankEffectsDef({required this.id, this.effects});
  final String id;
  final Map<String, dynamic>? effects;

  factory RankEffectsDef.fromJson(Map<String, dynamic> j) => RankEffectsDef(
        id: '${j['id'] ?? ''}',
        effects: j['effects'] is Map
            ? Map<String, dynamic>.from(j['effects'] as Map)
            : null,
      );
}

/// تحويل زاوية CSS إلى محاذاة — يُستعمل في التدرّجات الحرّة.
({Alignment begin, Alignment end}) alignmentsForAngle(double deg) {
  final a = deg * math.pi / 180;
  return (
    begin: Alignment(-math.cos(a), -math.sin(a)),
    end: Alignment(math.cos(a), math.sin(a)),
  );
}

// ══════════════════════════════════════════════════════
// 🎭 تعريف الدور — من `/api/game-config/roles`
// ══════════════════════════════════════════════════════

class RoleDef {
  const RoleDef({
    required this.id,
    this.nameAr = '',
    this.team = 'CITIZEN',
    this.cardTemplateId,
    this.iconType,
    this.iconValue,
  });

  final String id, nameAr, team;
  final String? cardTemplateId, iconType, iconValue;

  bool get isMafia => team == 'MAFIA';
  bool get isNeutral => team == 'NEUTRAL';

  factory RoleDef.fromJson(Map<String, dynamic> j) {
    final ov = j['cardOverrides'];
    final icon = (ov is Map) ? ov['icon'] : null;
    return RoleDef(
      id: '${j['id'] ?? ''}',
      nameAr: '${j['nameAr'] ?? ''}',
      team: '${j['team'] ?? 'CITIZEN'}',
      cardTemplateId: j['cardTemplateId'] as String?,
      iconType: icon is Map ? icon['type'] as String? : null,
      iconValue: icon is Map ? '${icon['value'] ?? icon['url'] ?? ''}' : null,
    );
  }
}

/// أدوار المافيا حين لا يوجد تعريفٌ من الكتالوج — احتياطيّ الملفّ ٢٢.
const kMafiaRoleIds = {
  'GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR', 'ASSASSIN', 'WITCH',
};
